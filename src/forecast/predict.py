"""Score the full time range using the trained Multi-Task LSTM model."""

from pathlib import Path
import pandas as pd
import numpy as np
import joblib
import torch

from src.forecast.lstm_model import LSTMForecaster
from src.forecast.features import compute_features

def predict_full_range(
    seq_len: int = 30,
    threshold: float = 0.5,
):
    """Generate forecast probability scores for the full time range.

    Scores the entire dataset using the pre-trained Multi-Task LSTM model 
    and saves forecast_scores.parquet.
    """
    data_path = Path("data/processed/combined_timeseries.parquet")
    catalogue_path = Path("data/processed/flare_catalogue_master.csv")
    output_path = Path("data/processed/forecast_scores.parquet")
    model_path = Path("models/unified_lstm.pth")
    scaler_path = Path("models/scaler_unified.pkl")

    if not data_path.exists():
        print(f"Data file not found: {data_path}")
        return None

    df = pd.read_parquet(data_path)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    print(f"Loaded {len(df)} time series data points")

    if not model_path.exists() or not scaler_path.exists():
        print("Model or scaler not found. Running with default zero predictions.")
        scores_df = pd.DataFrame({
            "timestamp": df["timestamp"],
            "probability_15min": 0.0,
            "probability_30min": 0.0,
            "alert_15min": False,
            "alert_30min": False,
        })
        output_path.parent.mkdir(parents=True, exist_ok=True)
        scores_df.to_parquet(output_path, index=False)
        return scores_df

    # Load resources
    scaler = joblib.load(scaler_path)
    
    flare_catalogue = None
    if catalogue_path.exists():
        flare_catalogue = pd.read_csv(catalogue_path)
        flare_catalogue["peak"] = pd.to_datetime(flare_catalogue["peak"], utc=True)
        if "class" in flare_catalogue.columns:
            valid_classes = flare_catalogue[flare_catalogue["class"] != "N/A"]
            mask = valid_classes["class"].str[0].isin(["C", "M", "X"])
            flare_catalogue = flare_catalogue[mask]

    features_df = compute_features(df, flare_catalogue)
    # Add raw soft and hard columns back into features_df
    features_df["soft"] = df["soft"].iloc[60:].reset_index(drop=True)
    features_df["hard"] = df["hard"].iloc[60:].reset_index(drop=True)

    feature_cols = [c for c in features_df.columns if c != "timestamp"]
    
    X_raw = features_df[feature_cols].values
    num_features = X_raw.shape[1]
    
    # Load PyTorch model with correct input dim and layers
    model = LSTMForecaster(input_dim=num_features, hidden_dim=32, num_layers=1, output_dim=2)
    model.load_state_dict(torch.load(model_path))
    model.eval()

    X_scaled = scaler.transform(X_raw)

    # Pad inputs on the left with (seq_len - 1) zeros
    print(f"Preparing sliding sequences (len={seq_len}) with padding...")
    padded = np.vstack([np.zeros((seq_len - 1, X_scaled.shape[1])), X_scaled])
    
    # Construct sequences
    Xs = []
    for i in range(len(X_scaled)):
        Xs.append(padded[i : i + seq_len])
    Xs = np.array(Xs, dtype=np.float32)

    # PyTorch inference
    print("Running LSTM inference...")
    X_tensor = torch.tensor(Xs)
    
    # Batch predictions to save memory
    batch_size = 1024
    probs_list = []
    
    with torch.no_grad():
        for b_start in range(0, len(X_tensor), batch_size):
            batch_X = X_tensor[b_start : b_start + batch_size]
            logits = model(batch_X)
            probs = torch.sigmoid(logits)
            probs_list.append(probs.cpu().numpy())
            
    all_probs = np.concatenate(probs_list, axis=0)

    # Note: features_df drops the first 60 rows. We pad our final df to match
    # the original df length so we don't cause any row count mismatches.
    padded_probs = np.vstack([np.zeros((60, 2)), all_probs])

    scores_df = pd.DataFrame({
        "timestamp": df["timestamp"],
        "probability_15min": padded_probs[:, 0].astype(float),
        "probability_30min": padded_probs[:, 1].astype(float),
        "alert_15min": (padded_probs[:, 0] >= threshold).astype(bool),
        "alert_30min": (padded_probs[:, 1] >= threshold).astype(bool),
    })

    print(f"LSTM 15min: {scores_df['alert_15min'].sum()} alerts, mean prob = {scores_df['probability_15min'].mean():.3f}")
    print(f"LSTM 30min: {scores_df['alert_30min'].sum()} alerts, mean prob = {scores_df['probability_30min'].mean():.3f}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    scores_df.to_parquet(output_path, index=False)
    print(f"Saved LSTM forecast scores to {output_path}")

    return scores_df

if __name__ == "__main__":
    predict_full_range()