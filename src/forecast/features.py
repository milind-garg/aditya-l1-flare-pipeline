"""Sliding-window feature engineering for flare forecasting."""

import pandas as pd
import numpy as np


def compute_features(
    df: pd.DataFrame,
    flare_catalogue: pd.DataFrame = None,
    windows_minutes: list = None,
) -> pd.DataFrame:
    """Compute sliding-window features for flare forecasting.

    Uses pandas vectorized rolling operations instead of row-by-row loops.
    """
    if windows_minutes is None:
        windows_minutes = [5, 15, 30]

    soft = df["soft"]
    hard = df["hard"]
    timestamps = pd.to_datetime(df["timestamp"], utc=True)

    window_pts = [int(w * 60 / 10) for w in windows_minutes]

    result = pd.DataFrame({"timestamp": timestamps})

    for w, w_pts in zip(windows_minutes, window_pts):
        roll_soft = soft.rolling(window=w_pts, min_periods=1)
        roll_hard = hard.rolling(window=w_pts, min_periods=1)

        result[f"soft_mean_{w}m"] = roll_soft.mean()
        result[f"soft_std_{w}m"] = roll_soft.std()
        result[f"soft_max_{w}m"] = roll_soft.max()
        result[f"soft_min_{w}m"] = roll_soft.min()
        result[f"hard_mean_{w}m"] = roll_hard.mean()
        result[f"hard_std_{w}m"] = roll_hard.std()
        result[f"hard_max_{w}m"] = roll_hard.max()
        result[f"hard_min_{w}m"] = roll_hard.min()

        result[f"soft_roc_{w}m"] = soft - soft.shift(w_pts - 1)
        result[f"hard_roc_{w}m"] = hard - hard.shift(w_pts - 1)
        result[f"soft_hard_ratio_{w}m"] = soft / hard.replace(0, np.nan).clip(lower=1e-10)

        soft_roc = soft - soft.shift(w_pts - 1)
        hard_roc = hard - hard.shift(w_pts - 1)
        result[f"hard_leads_soft_{w}m"] = hard_roc - soft_roc

        # Correlation (use expanding corr as approximation)
        result[f"soft_hard_corr_{w}m"] = soft.rolling(w_pts, min_periods=2).corr(hard).fillna(0)

    # Precursor features
    if flare_catalogue is not None and not flare_catalogue.empty:
        cat_peak = pd.to_datetime(flare_catalogue["peak"], utc=True)
        flare_times = cat_peak.sort_values()
        hard_only_mask = flare_catalogue["source"] == "hard_only"
        hard_only_times = cat_peak[hard_only_mask.values].sort_values()

        def _hard_only_in_last_1h(ts):
            cutoff = ts - pd.Timedelta(hours=1)
            return int(((hard_only_times >= cutoff) & (hard_only_times < ts)).any())

        def _time_since_last_flare(ts):
            past = flare_times[flare_times < ts]
            if len(past) > 0:
                return (ts - past.iloc[-1]).total_seconds() / 60.0
            return 999.0

        result["hard_only_event_in_last_1h"] = timestamps.map(_hard_only_in_last_1h)
        result["time_since_last_flare_minutes"] = timestamps.map(_time_since_last_flare)
    else:
        result["hard_only_event_in_last_1h"] = 0
        result["time_since_last_flare_minutes"] = 999.0

    # Drop first 60 rows (no history) and fill NaN
    result = result.iloc[60:].reset_index(drop=True)
    result = result.fillna(0)

    return result


def create_labels(
    df: pd.DataFrame,
    flare_catalogue: pd.DataFrame,
    forecast_horizon_minutes: int = 15,
) -> pd.Series:
    """Create binary labels: 1 if flare peak occurs within next N minutes."""
    timestamps = pd.to_datetime(df["timestamp"], utc=True)
    labels = np.zeros(len(timestamps), dtype=int)

    if flare_catalogue.empty or "peak" not in flare_catalogue.columns:
        return pd.Series(labels, index=df.index)

    peaks = pd.to_datetime(flare_catalogue["peak"].values, utc=True)
    horizon = pd.Timedelta(minutes=forecast_horizon_minutes)

    for i, ts in enumerate(timestamps):
        future_window_end = ts + horizon
        for peak in peaks:
            if ts < peak <= future_window_end:
                labels[i] = 1
                break

    return pd.Series(labels, index=df.index)
