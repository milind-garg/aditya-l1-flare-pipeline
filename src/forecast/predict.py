"""Score the full time range using trained forecasting models."""

from pathlib import Path
import pandas as pd
import numpy as np
import joblib

from src.forecast.features import compute_features


def predict_full_range(
    horizons: list = None,
    threshold: float = 0.5,
):
    """Generate forecast probability scores for the full time range.

    Scores the entire dataset using pre-trained models and saves
    forecast_scores.parquet.
    """
    if horizons is None:
        horizons = [15, 30]

    data_path = Path("data/processed/combined_timeseries.parquet")
    catalogue_path = Path("data/processed/flare_catalogue_master.csv")
    output_path = Path("data/processed/forecast_scores.parquet")
    model_dir = Path("models")

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

    features_df = compute_features(df, flare_catalogue)
    feature_cols = [c for c in features_df.columns if c != "timestamp"]

    scores_df = features_df[["timestamp"]].copy()

    for horizon in horizons:
        model_path = model_dir / f"forecast_model_{horizon}min.pkl"
        scaler_path = model_dir / f"scaler_{horizon}min.pkl"

        if not model_path.exists():
            print(f"Model not found: {model_path}. Skipping horizon {horizon}")
            scores_df[f"probability_{horizon}min"] = 0.0
            scores_df[f"alert_{horizon}min"] = False
            continue

        model = joblib.load(model_path)
        scaler = joblib.load(scaler_path)

        X = features_df[feature_cols].values
        X_scaled = scaler.transform(X)

        probabilities = model.predict_proba(X_scaled)[:, 1]

        scores_df[f"probability_{horizon}min"] = probabilities
        scores_df[f"alert_{horizon}min"] = (probabilities >= threshold)

        n_alerts = scores_df[f"alert_{horizon}min"].sum()
        mean_prob = probabilities.mean()
        print(f"Horizon {horizon}min: {n_alerts} alerts, mean prob = {mean_prob:.3f}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    scores_df.to_parquet(output_path, index=False)
    print(f"Saved forecast scores to {output_path}")

    return scores_df


if __name__ == "__main__":
    predict_full_range()