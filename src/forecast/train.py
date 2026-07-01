"""Train forecasting model using gradient boosted trees."""

from pathlib import Path
import pandas as pd
import numpy as np
import joblib
from sklearn.model_selection import TimeSeriesSplit
from sklearn.metrics import precision_score, recall_score, f1_score, roc_auc_score
from sklearn.preprocessing import StandardScaler
import xgboost as xgb

from src.forecast.features import compute_features, create_labels


def train_model(
    forecast_horizon: int = 15,
    test_size: float = 0.3,
    threshold: float = 0.5,
):
    """Train a gradient boosting model for flare forecasting."""
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
        for col in ["start", "end"]:
            if col in flare_catalogue.columns:
                flare_catalogue[col] = pd.to_datetime(flare_catalogue[col], utc=True)
        print(f"Loaded {len(flare_catalogue)} flare events from catalogue")

        # Filter to >= C-class flares for forecasting
        if "class" in flare_catalogue.columns:
            valid_classes = flare_catalogue[flare_catalogue["class"] != "N/A"]
            mask = valid_classes["class"].str[0].isin(["C", "M", "X"])
            flare_catalogue = flare_catalogue[mask]
            print(f"  Focus on C/M/X flares: {len(flare_catalogue)} events")

    print(f"Computing features and labels for {forecast_horizon}-min horizon...")
    features_df = compute_features(df, flare_catalogue)
    labels = create_labels(df, flare_catalogue, forecast_horizon)
    # Align labels with features (features drops first 60 pts)
    labels = labels.iloc[60:].reset_index(drop=True)

    positive_count = labels.sum()
    total_count = len(labels)
    print(f"Labels: {positive_count} positive / {total_count - positive_count} negative "
          f"({100 * positive_count / total_count:.2f}% positive)")

    feature_cols = [c for c in features_df.columns if c != "timestamp"]
    X = features_df[feature_cols].values
    y = labels.values

    # Time-based split
    split_idx = int(len(X) * (1 - test_size))
    X_train, X_test = X[:split_idx], X[split_idx:]
    y_train, y_test = y[:split_idx], y[split_idx:]

    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    scale_pos_weight = (len(y_train) - y_train.sum()) / max(y_train.sum(), 1)

    print(f"Training XGBoost model...")
    model = xgb.XGBClassifier(
        n_estimators=200,
        max_depth=6,
        learning_rate=0.1,
        scale_pos_weight=scale_pos_weight,
        subsample=0.8,
        colsample_bytree=0.8,
        eval_metric="auc",
        use_label_encoder=False,
        random_state=42,
    )

    model.fit(
        X_train_scaled,
        y_train,
        eval_set=[(X_test_scaled, y_test)],
        verbose=False,
    )

    y_prob = model.predict_proba(X_test_scaled)[:, 1]
    y_pred = (y_prob >= threshold).astype(int)

    precision = precision_score(y_test, y_pred, zero_division=0)
    recall = recall_score(y_test, y_pred, zero_division=0)
    f1 = f1_score(y_test, y_pred, zero_division=0)
    roc_auc = roc_auc_score(y_test, y_prob)

    print(f"\nModel Performance ({forecast_horizon}-min horizon):")
    print(f"  Precision: {precision:.3f}")
    print(f"  Recall:    {recall:.3f}")
    print(f"  F1 Score:  {f1:.3f}")
    print(f"  ROC-AUC:   {roc_auc:.3f}")

    feature_importance = pd.DataFrame({
        "feature": feature_cols,
        "importance": model.feature_importances_,
    }).sort_values("importance", ascending=False)
    print("\nTop 10 features:")
    print(feature_importance.head(10).to_string())

    model_path = model_dir / f"forecast_model_{forecast_horizon}min.pkl"
    joblib.dump(model, model_path)
    print(f"Model saved to {model_path}")

    scaler_path = model_dir / f"scaler_{forecast_horizon}min.pkl"
    joblib.dump(scaler, scaler_path)
    print(f"Scaler saved to {scaler_path}")

    return {
        "model": model,
        "scaler": scaler,
        "feature_names": feature_cols,
        "metrics": {
            "precision": float(precision),
            "recall": float(recall),
            "f1": float(f1),
            "roc_auc": float(roc_auc),
        },
    }


if __name__ == "__main__":
    for horizon in [15, 30]:
        print(f"\n{'='*60}")
        print(f"Training model for {horizon}-minute horizon")
        print(f"{'='*60}")
        train_model(forecast_horizon=horizon)