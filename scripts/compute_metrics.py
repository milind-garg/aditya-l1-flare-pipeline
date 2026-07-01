"""Compute evaluation metrics from pre-computed forecast scores."""
import json
import pandas as pd
import numpy as np
from pathlib import Path
from sklearn.metrics import precision_score, recall_score, f1_score, roc_auc_score, confusion_matrix

def compute_lead_times(scores, flares, threshold, horizon):
    lead_times = []
    for _, flare in flares.iterrows():
        peak = pd.to_datetime(flare["peak"], utc=True)
        cls = flare["class"]
        if cls not in ["C","M","X","X+"]:
            continue
        window_start = peak - pd.Timedelta(minutes=60)
        prior = scores[(scores["timestamp"] >= window_start) & (scores["timestamp"] <= peak)]
        if len(prior) == 0:
            continue
        prob_col = f"probability_{horizon}min"
        alerts = prior[prior[prob_col] >= threshold]
        if len(alerts) > 0:
            first_alert = alerts.iloc[0]["timestamp"]
            lead_min = (peak - pd.to_datetime(first_alert, utc=True)).total_seconds() / 60.0
            if lead_min > 0:
                lead_times.append(lead_min)
    return lead_times

def compute_per_class_recall(scores, flares, threshold, horizon):
    results = {}
    for _, flare in flares.iterrows():
        peak = pd.to_datetime(flare["peak"], utc=True)
        cls = str(flare["class"])[0] if isinstance(flare["class"], str) else "?"
        if cls not in ["A","B","C","M","X"]:
            continue
        if cls not in results:
            results[cls] = {"total": 0, "detected": 0}
        results[cls]["total"] += 1
        prob_col = f"probability_{horizon}min"
        window_start = peak - pd.Timedelta(minutes=30)
        window_end = peak + pd.Timedelta(minutes=5)
        window = scores[(scores["timestamp"] >= window_start) & (scores["timestamp"] <= window_end)]
        if (window[prob_col] >= threshold).any():
            results[cls]["detected"] += 1
    return {
        cls: {"total": v["total"], "detected": v["detected"], "recall": v["detected"] / max(v["total"], 1)}
        for cls, v in results.items()
    }

scores = pd.read_parquet("data/processed/forecast_scores.parquet")
scores["timestamp"] = pd.to_datetime(scores["timestamp"], utc=True)
flares = pd.read_csv("data/processed/flare_catalogue_master.csv")
flares["peak"] = pd.to_datetime(flares["peak"], utc=True)

for horizon, prob_col in [(15, "probability_15min"), (30, "probability_30min")]:
    print(f"\n{'='*50}")
    print(f"Horizon: {horizon} min")
    print(f"{'='*50}")

    thresholds_to_try = [0.001, 0.01, 0.05, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]
    best_f1 = 0
    best_t = 0.5
    best_metrics = {}

    for t in thresholds_to_try:
        y_prob = scores[prob_col].values
        y_pred = (y_prob >= t).astype(int)
        y_test = np.zeros(len(y_pred))

        # Create binary labels: 1 if C/M/X flare within next N min
        for _, flare in flares.iterrows():
            cls = flare["class"]
            if cls not in ["C","M","X","X+"]:
                continue
            peak = pd.to_datetime(flare["peak"], utc=True)
            label_window = (scores["timestamp"] >= peak - pd.Timedelta(minutes=horizon)) & \
                           (scores["timestamp"] < peak)
            y_test[label_window.values] = 1

        if y_test.sum() == 0:
            continue

        precision = precision_score(y_test, y_pred, zero_division=0)
        recall = recall_score(y_test, y_pred, zero_division=0)
        f1 = f1_score(y_test, y_pred, zero_division=0)
        tn, fp, fn, tp = confusion_matrix(y_test, y_pred, labels=[0, 1]).ravel()
        far = fp / max(fp + tp, 1)
        roc_auc = roc_auc_score(y_test, y_prob) if len(np.unique(y_test)) > 1 else 0.5

        if f1 > best_f1:
            best_f1 = f1
            best_t = t
            best_metrics = {
                "threshold": t, "precision": float(precision), "recall (TPR)": float(recall),
                "f1": float(f1), "false_alarm_rate (FAR)": float(far),
                "roc_auc": float(roc_auc), "tp": int(tp), "fp": int(fp),
                "fn": int(fn), "tn": int(tn),
            }

        print(f"  t={t:.3f}: prec={precision:.3f} rec={recall:.3f} f1={f1:.3f} far={far:.3f}")

    if best_metrics:
        print(f"\n  Best threshold: {best_t}")
        print(f"  Best metrics: {json.dumps(best_metrics, indent=2)}")

        # Compute lead times at best threshold
        lead_times = compute_lead_times(scores, flares, best_t, horizon)
        print(f"  Lead times: {len(lead_times)} samples")
        if lead_times:
            print(f"    median={np.median(lead_times):.1f} mean={np.mean(lead_times):.1f} min={min(lead_times):.1f} max={max(lead_times):.1f}")

        # Per-class recall
        per_class = compute_per_class_recall(scores, flares, best_t, horizon)
        print(f"  Per-class recall: {json.dumps(per_class, indent=2)}")

    # Now try with 0.5 threshold specifically
    print(f"\n  --- With default threshold 0.5 ---")
    y_pred = (scores[prob_col].values >= 0.5).astype(int)
    for _, flare in flares.iterrows():
        cls = flare["class"]
        if cls not in ["C","M","X","X+"]:
            continue
        peak = pd.to_datetime(flare["peak"], utc=True)
        label_window = (scores["timestamp"] >= peak - pd.Timedelta(minutes=horizon)) & \
                       (scores["timestamp"] < peak)
        y_test[label_window.values] = 1
    if y_test.sum() > 0:
        print(f"    TP: {((y_pred==1)&(y_test==1)).sum()}, FP: {((y_pred==1)&(y_test==0)).sum()}")
        print(f"    Precision: {precision_score(y_test, y_pred, zero_division=0):.3f}")
        print(f"    Recall: {recall_score(y_test, y_pred, zero_division=0):.3f}")
        print(f"    F1: {f1_score(y_test, y_pred, zero_division=0):.3f}")
        lead = compute_lead_times(scores, flares, 0.5, horizon)
        print(f"    Lead times: {len(lead)} samples")
        if lead:
            print(f"    median={np.median(lead):.1f} mean={np.mean(lead):.1f}")
        pc = compute_per_class_recall(scores, flares, 0.5, horizon)
        print(f"    Per-class: {json.dumps(pc, indent=2)}")
