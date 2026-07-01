"""Train forecasting model using a unified Multi-Task LSTM network on engineered features."""

from pathlib import Path
import pandas as pd
import numpy as np
import joblib
import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
from sklearn.metrics import precision_score, recall_score, f1_score, roc_auc_score
from sklearn.preprocessing import StandardScaler

from src.forecast.lstm_model import LSTMForecaster
from src.forecast.features import compute_features, create_labels

# Set random seed for reproducibility
torch.manual_seed(42)
np.random.seed(42)

class SolarDataset(Dataset):
    def __init__(self, X, y):
        self.X = torch.tensor(X, dtype=torch.float32)
        self.y = torch.tensor(y, dtype=torch.float32)
        
    def __len__(self):
        return len(self.X)
        
    def __getitem__(self, idx):
        return self.X[idx], self.y[idx]

def create_sequences(X_scaled, y_labels, seq_len=30):
    """Generate sequential windows for LSTM training.
    
    Xs shape: (N - seq_len + 1, seq_len, num_features)
    ys shape: (N - seq_len + 1, num_horizons)
    """
    Xs, ys = [], []
    for i in range(seq_len - 1, len(X_scaled)):
        Xs.append(X_scaled[i - seq_len + 1 : i + 1])
        ys.append(y_labels[i])
    return np.array(Xs), np.array(ys)

def train_model(
    seq_len: int = 30, # 30 steps = 5 minutes of historical cadence is optimal
    test_size: float = 0.3,
    threshold: float = 0.5,
    epochs: int = 4, # Fewer epochs to prevent overfitting on small event set
    batch_size: int = 128,
):
    """Train a multi-task LSTM network for flare forecasting."""
    data_path = Path("data/processed/combined_timeseries.parquet")
    catalogue_path = Path("data/processed/flare_catalogue_master.csv")
    model_dir = Path("models")
    model_dir.mkdir(parents=True, exist_ok=True)

    if not data_path.exists():
        print(f"Data file not found: {data_path}")
        return None

    df = pd.read_parquet(data_path)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    print(f"Loaded {len(df)} time series data points")

    flare_catalogue = None
    if catalogue_path.exists():
        flare_catalogue = pd.read_csv(catalogue_path)
        flare_catalogue["peak"] = pd.to_datetime(flare_catalogue["peak"], utc=True)
        # Filter to >= C-class flares for forecasting
        if "class" in flare_catalogue.columns:
            valid_classes = flare_catalogue[flare_catalogue["class"] != "N/A"]
            mask = valid_classes["class"].str[0].isin(["C", "M", "X"])
            flare_catalogue = flare_catalogue[mask]
            print(f"Focus on C/M/X flares: {len(flare_catalogue)} events")

    print("Computing sliding-window features...")
    features_df = compute_features(df, flare_catalogue)
    
    # Copy raw soft and hard back into features_df
    features_df["soft"] = df["soft"].iloc[60:].reset_index(drop=True)
    features_df["hard"] = df["hard"].iloc[60:].reset_index(drop=True)

    feature_cols = [c for c in features_df.columns if c != "timestamp"]
    X_raw = features_df[feature_cols].values
    num_features = X_raw.shape[1]
    print(f"Number of input features: {num_features}")

    # Generate multi-task binary labels (matching features length by dropping first 60 rows)
    labels_15 = create_labels(df, flare_catalogue, 15).iloc[60:].values
    labels_30 = create_labels(df, flare_catalogue, 30).iloc[60:].values
    y = np.stack([labels_15, labels_30], axis=1)

    # Time-based split
    split_idx = int(len(X_raw) * (1 - test_size))
    X_train_raw, X_test_raw = X_raw[:split_idx], X_raw[split_idx:]
    y_train_raw, y_test_raw = y[:split_idx], y[split_idx:]

    # Scale inputs
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train_raw)
    X_test_scaled = scaler.transform(X_test_raw)

    # Create sequences
    print(f"Creating sequences of length {seq_len}...")
    X_train_seq, y_train_seq = create_sequences(X_train_scaled, y_train_raw, seq_len)
    X_test_seq, y_test_seq = create_sequences(X_test_scaled, y_test_raw, seq_len)

    # Dataset and Loaders
    train_dataset = SolarDataset(X_train_seq, y_train_seq)
    test_dataset = SolarDataset(X_test_seq, y_test_seq)
    train_loader = DataLoader(train_dataset, batch_size=batch_size, shuffle=True)
    test_loader = DataLoader(test_dataset, batch_size=batch_size, shuffle=False)

    # Instantiate LSTM model
    model = LSTMForecaster(input_dim=num_features, hidden_dim=32, num_layers=1, output_dim=2)
    # Balanced loss weights
    criterion = nn.BCEWithLogitsLoss(pos_weight=torch.tensor([10.0, 10.0]))
    optimizer = torch.optim.Adam(model.parameters(), lr=0.001, weight_decay=1e-4)

    print(f"Training Multi-Task LSTM model for {epochs} epochs...")
    model.train()
    for epoch in range(epochs):
        epoch_loss = 0.0
        for batch_X, batch_y in train_loader:
            optimizer.zero_grad()
            logits = model(batch_X)
            loss = criterion(logits, batch_y)
            loss.backward()
            optimizer.step()
            epoch_loss += loss.item() * batch_X.size(0)
        
        epoch_loss /= len(train_dataset)
        print(f"Epoch {epoch+1}/{epochs} - Loss: {epoch_loss:.4f}")

    # Evaluation
    model.eval()
    all_probs = []
    all_targets = []
    with torch.no_grad():
        for batch_X, batch_y in test_loader:
            logits = model(batch_X)
            probs = torch.sigmoid(logits)
            all_probs.append(probs.cpu().numpy())
            all_targets.append(batch_y.cpu().numpy())
            
    all_probs = np.concatenate(all_probs, axis=0)
    all_targets = np.concatenate(all_targets, axis=0)

    # Calculate metrics
    horizons = [15, 30]
    metrics = {}
    
    print("\nModel Performance (Multi-Task LSTM):")
    for i, horizon in enumerate(horizons):
        y_test_task = all_targets[:, i]
        y_prob_task = all_probs[:, i]
        y_pred_task = (y_prob_task >= threshold).astype(int)
        
        precision = precision_score(y_test_task, y_pred_task, zero_division=0)
        recall = recall_score(y_test_task, y_pred_task, zero_division=0)
        f1 = f1_score(y_test_task, y_pred_task, zero_division=0)
        roc_auc = roc_auc_score(y_test_task, y_prob_task)
        
        print(f"  Horizon {horizon}-min:")
        print(f"    Precision: {precision:.3f}")
        print(f"    Recall:    {recall:.3f}")
        print(f"    F1 Score:  {f1:.3f}")
        print(f"    ROC-AUC:   {roc_auc:.3f}")
        
        metrics[f"horizon_{horizon}"] = {
            "precision": float(precision),
            "recall": float(recall),
            "f1": float(f1),
            "roc_auc": float(roc_auc),
        }

    # Save outputs
    model_path = model_dir / "unified_lstm.pth"
    torch.save(model.state_dict(), model_path)
    print(f"\nModel weights saved to {model_path}")

    scaler_path = model_dir / "scaler_unified.pkl"
    joblib.dump(scaler, scaler_path)
    print(f"Scaler saved to {scaler_path}")

    return {
        "model": model,
        "scaler": scaler,
        "metrics": metrics
    }

if __name__ == "__main__":
    train_model()