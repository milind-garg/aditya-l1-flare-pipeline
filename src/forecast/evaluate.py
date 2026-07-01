"""Compute evaluation metrics for forecasting model."""

from pathlib import Path
import pandas as pd
import numpy as np
import json
import joblib
from sklearn.metrics import (
    precision_score,
    recall_score,
    f1_score,
    roc_auc_score,
    confusion_matrix,
)

from src.forecast.features import compute_features, create_labels


def evaluate_model(
    forecast_horizon: int = 15,
    test_size: float = 0.3,
    thresholds: list = None,
):
    """Evaluate forecasting model and compute lead time metrics.

    Returns a dict of metrics suitable for GET /api/evaluation.
    """
    if thresholds is None:
        thresholds = [0.3, 0.4, 0.5, 0.6, 0.7]

    data_path = Path("data/processed/combined_timeseries.parquet")
    catalogue_path = Path("data/processed/flare_catalogue_master.csv")
    model_dir = Path("models")
    output_path = Path("data/processed/metrics.json")

    if not data_path.exists():
        print(f"Data file not found: {data_path}")
        return None

    df = pd.read_parquet(data_path)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)

    flare_catalogue = pd.read_csv(catalogue_path) if catalogue_path.exists() else pd.DataFrame()
    if not flare_catalogue.empty:
        flare_catalogue["peak"] = pd.to_datetime(flare_catalogue["peak"], utc=True)
        if "class" in flare_catalogue.columns:
            valid = flare_catalogue[flare_catalogue["class"] != "N/A"]
            flare_catalogue = valid[valid["class"].str[0].isin(["C", "M", "X"])]

    features_df = compute_features(df, flare_catalogue)
    labels = create_labels(df, flare_catalogue, forecast_horizon)
    labels = labels.iloc[60:].reset_index(drop=True)

    feature_cols = [c for c in features_df.columns if c != "timestamp"]
    X = features_df[feature_cols].values
    y = labels.values

    split_idx = int(len(X) * (1 - test_size))
    X_test = X[split_idx:]
    y_test = y[split_idx:]
    test_timestamps = pd.to_datetime(features_df["timestamp"].iloc[split_idx:], utc=True)

    model_path = model_dir / f"forecast_model_{forecast_horizon}min.pkl"
    scaler_path = model_dir / f"scaler_{forecast_horizon}min.pkl"

    if not model_path.exists():
        print(f"Model not found at {model_path}")
        return None

    model = joblib.load(model_path)
    scaler = joblib.load(scaler_path)

    X_test_scaled = scaler.transform(X_test)
    y_prob = model.predict_proba(X_test_scaled)[:, 1]

    # Evaluate at multiple thresholds
    best_f1 = 0
    best_threshold = 0.5
    best_metrics = {}

    for threshold in thresholds:
        y_pred = (y_prob >= threshold).astype(int)
        precision = precision_score(y_test, y_pred, zero_division=0)
        recall = recall_score(y_test, y_pred, zero_division=0)
        f1 = f1_score(y_test, y_pred, zero_division=0)
        tn, fp, fn, tp = confusion_matrix(y_test, y_pred, labels=[0, 1]).ravel()

        far = fp / max(fp + tp, 1)
        tpr = recall

        if f1 > best_f1:
            best_f1 = f1
            best_threshold = threshold
            best_metrics = {
                "threshold": threshold,
                "precision": float(precision),
                "recall (TPR)": float(recall),
                "f1": float(f1),
                "false_alarm_rate (FAR)": float(far),
                "true_positives": int(tp),
                "false_positives": int(fp),
                "false_negatives": int(fn),
                "true_negatives": int(tn),
            }

    roc_auc = roc_auc_score(y_test, y_prob)

    # Lead time computation
    y_pred_best = (y_prob >= best_threshold).astype(int)
    lead_times = compute_lead_times(y_prob, y_test, test_timestamps, best_threshold)
    if lead_times:
        lead_times_arr = lead_times
    else:
        lead_times_arr = [0]

    # Per-class detection recall (using the flare catalogue)
    per_class_recall = compute_per_class_recall(
        y_prob, y_test, test_timestamps, flare_catalogue,
        test_timestamps.iloc[0] if len(test_timestamps) > 0 else df["timestamp"].iloc[0],
        test_timestamps.iloc[-1] if len(test_timestamps) > 0 else df["timestamp"].iloc[-1],
        best_threshold,
    )

    metrics = {
        "detection": per_class_recall,
        "forecast": {
            "tpr": best_metrics.get("recall (TPR)", 0),
            "far": best_metrics.get("false_alarm_rate (FAR)", 0),
            "roc_auc": float(roc_auc),
            "best_threshold": best_threshold,
            **{k: v for k, v in best_metrics.items() if k not in ["recall (TPR)", "false_alarm_rate (FAR)"]},
            "lead_time_minutes": {
                "median": float(np.median(lead_times_arr)) if len(lead_times_arr) > 0 else 0,
                "mean": float(np.mean(lead_times_arr)) if len(lead_times_arr) > 0 else 0,
                "min": float(np.min(lead_times_arr)) if len(lead_times_arr) > 0 else 0,
                "max": float(np.max(lead_times_arr)) if len(lead_times_arr) > 0 else 0,
            },
        },
    }

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(metrics, f, indent=2, default=str)
    print(f"Saved metrics to {output_path}")
    print(json.dumps(metrics, indent=2, default=str))

    return metrics


def compute_lead_times(y_prob, y_test, timestamps, threshold):
    """Compute lead times: time between first alert and actual flare peak."""
    lead_times = []
    in_alert = False
    alert_start = None
    ts_list = timestamps.tolist() if hasattr(timestamps, 'tolist') else list(timestamps)

    for i in range(len(y_test)):
        if y_prob[i] >= threshold and not in_alert:
            in_alert = True
            alert_start = ts_list[i]
        elif y_prob[i] < threshold and in_alert:
            in_alert = False
            alert_start = None

        if in_alert and y_test[i] == 1:
            peak_time = ts_list[i]
            lead_time_minutes = (peak_time - alert_start).total_seconds() / 60.0
            if lead_time_minutes > 0:
                lead_times.append(lead_time_minutes)
            in_alert = False
            alert_start = None

    return lead_times


def compute_per_class_recall(y_prob, y_test, timestamps, flare_catalogue, test_start, test_end, threshold):
    """Compute recall per flare class (A/B/C/M/X) using flare catalogue events."""
    if flare_catalogue.empty or "class" not in flare_catalogue.columns:
        return {}

    y_pred = (y_prob >= threshold).astype(int)
    ts_list = timestamps.tolist() if hasattr(timestamps, 'tolist') else list(timestamps)

    test_flares = flare_catalogue[
        (flare_catalogue["peak"] >= test_start) & (flare_catalogue["peak"] <= test_end)
    ]

    per_class = {}
    for _, flare in test_flares.iterrows():
        flare_class = str(flare["class"])[0] if isinstance(flare["class"], str) else "?"
        if flare_class not in per_class:
            per_class[flare_class] = {"total": 0, "detected": 0}
        per_class[flare_class]["total"] += 1

        peak = flare["peak"]
        window_start = peak - pd.Timedelta(minutes=30)
        window_end = peak + pd.Timedelta(minutes=5)

        for i in range(len(y_test)):
            ts = ts_list[i]
            if window_start <= ts <= window_end and y_pred[i] == 1:
                per_class[flare_class]["detected"] += 1
                break

    return {
        cls: {
            "total": vals["total"],
            "detected": vals["detected"],
            "recall": vals["detected"] / max(vals["total"], 1),
        }
        for cls, vals in per_class.items()
    }


if __name__ == "__main__":
    evaluate_model(forecast_horizon=15)