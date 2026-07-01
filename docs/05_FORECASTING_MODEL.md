# Forecasting Model Specification

## 1. Goal
Predict the probability that a flare (above some class threshold, e.g. ≥C class) will occur in the **next N minutes** (try N = 15 and N = 30 as two configurable horizons), using precursor patterns in soft + hard X-ray light curves, and report a quantifiable **lead time** (minutes between alert trigger and actual flare peak).

## 2. Labeling Strategy
- Use the master flare catalogue from the nowcasting step as ground-truth flare *peak* times.
- For every timestamp `t` in the combined time series, label `y(t) = 1` if there exists a flare peak in `(t, t + N minutes]`, else `y(t) = 0`. This creates a supervised binary classification problem ("will a flare happen in the next N minutes").
- This is inherently a **class-imbalanced** problem (flares are rare) — plan for that (see Section 5).

## 3. Feature Engineering (`src/forecast/features.py`)
Compute over trailing sliding windows ending at `t` (e.g., 5 min, 15 min, 30 min windows):
- Soft channel: mean, std, slope (linear regression coefficient), max, rate-of-change (derivative), time-since-last-detected-event.
- Hard channel: same statistics — hard X-ray impulsive spikes are a key precursor signal (non-thermal electrons often precede the thermal soft X-ray rise).
- Cross-channel: soft/hard ratio trend, hard-channel-leads-soft-channel correlation/cross-correlation lag.
- Flag features: `hard_only_event_in_last_10min` (from the nowcast master catalogue's `hard_only` tag) — directly operationalizes the "precursor pattern" objective from the problem statement.

## 4. Model Options (build in this order)
1. **Baseline (must-have)**: Gradient Boosted Trees (`xgboost` or `lightgbm` or `sklearn.GradientBoostingClassifier`) on the engineered features above. Fast to train, interpretable (feature importances), good baseline for a hackathon timeline.
2. **Stretch goal**: LSTM/GRU sequence model (PyTorch) directly on raw windowed soft+hard sequences, if time allows and the baseline metrics look promising enough to justify the extra effort. Only attempt this after the baseline is fully working end-to-end through the dashboard.

## 5. Handling Class Imbalance
- Use `class_weight="balanced"` (sklearn) or `scale_pos_weight` (xgboost).
- Evaluate with **precision/recall/F1/ROC-AUC**, not raw accuracy (accuracy is misleading when flares are rare).
- Consider time-based train/test split (not random shuffle) — e.g., train on first 70% of the time window chronologically, test on the last 30% — to avoid leaking information from the same flare event across train/test.

## 6. Alerting Logic (turns probability into a binary alert + lead time)
- Define `alert(t) = 1` if `probability(t) > threshold` (tune threshold on validation data to balance TPR vs FAR — see Evaluation Criteria).
- For each true flare in the test set, find the **first** `t` where `alert(t) = 1` within the lookback window before that flare's peak → `lead_time = peak_time - t`. If no alert fired before the flare, record it as a missed detection (counts against TPR).
- Compute **False Alarm Rate** = alerts that did NOT have a real flare follow within N minutes, divided by total alerts (or per unit time, your choice — document whichever you pick).

## 7. Outputs
- `forecast_scores.parquet`: `timestamp, probability_15min, probability_30min, alert_15min, alert_30min`.
- `models/forecast_model_15min.pkl`, `models/forecast_model_30min.pkl` (or `.json` for xgboost).
- `metrics.json`: TPR, FAR, ROC-AUC, lead time distribution (median/mean/min/max), per-class detection recall — feeds `GET /api/evaluation`.

## 8. Build Order
1. Build the labeling function first; sanity check label distribution (how many positive minutes vs negative).
2. Build feature engineering pipeline; sanity check feature values aren't NaN/constant.
3. Train baseline gradient boosting model with a time-based split.
4. Compute metrics (Section 6) and write `metrics.json`.
5. Save `forecast_scores.parquet` for the whole time range (for dashboard replay).
6. (Stretch) Try LSTM if time permits and compare metrics against the baseline before deciding which to ship.
