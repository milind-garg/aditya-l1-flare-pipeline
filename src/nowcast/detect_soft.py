"""Detect solar flares in SoLEXS (soft X-ray) light curve."""

from pathlib import Path
import pandas as pd
import numpy as np
from scipy import signal
import yaml


def load_config():
    with open("config/nowcast_config.yaml") as f:
        return yaml.safe_load(f)


def estimate_background(series: pd.Series, window: int, percentile: float) -> pd.Series:
    """Rolling percentile background estimation."""
    return series.rolling(window=window, center=False, min_periods=1).quantile(
        percentile / 100.0, interpolation="linear"
    )


def detect_flares_soft(
    df: pd.DataFrame,
    config: dict,
) -> pd.DataFrame:
    """Detect flares in the soft X-ray channel.

    Returns a DataFrame with columns:
    id, start, peak, end, class, peak_value, source, confidence
    """
    cfg = config["nowcast"]
    bg_window = int(cfg["background_window_minutes"] * 60)
    bg_percentile = cfg["background_percentile"]
    k = cfg["threshold_k_soft"]
    min_duration = int(cfg["min_event_duration_minutes"] * 60)
    merge_gap = int(cfg["merge_gap_minutes"] * 60)
    decay_frac = cfg.get("decay_fraction", 0.5)
    min_flux = cfg.get("min_absolute_flux_soft", 0)

    soft = df["soft"].values
    timestamps = df["timestamp"].values

    # Background and standard deviation
    bg = estimate_background(df["soft"], bg_window, bg_percentile).values
    resid = soft - bg
    rolling_std = (
        df["soft"]
        .rolling(window=bg_window, center=False, min_periods=1)
        .std()
        .bfill()
        .values
    )
    rolling_std = np.maximum(rolling_std, 1e-10)

    # Threshold crossing
    threshold = k * rolling_std
    elevated = (resid > threshold) & (soft > min_flux)

    # Find contiguous elevated segments
    events = []
    in_event = False
    event_start = None
    last_elevated = None

    for i in range(len(elevated)):
        if elevated[i] and not in_event:
            in_event = True
            event_start = i
            last_elevated = i
        elif elevated[i] and in_event:
            last_elevated = i
        elif not elevated[i] and in_event:
            gap = i - last_elevated
            if gap <= merge_gap:
                continue
            else:
                event_end = i - 1
                if event_end - event_start >= min_duration:
                    events.append((event_start, event_end))
                in_event = False
                event_start = None

    if in_event and event_start is not None:
        event_end = len(elevated) - 1
        if event_end - event_start >= min_duration:
            events.append((event_start, event_end))

    # Compute percentile-based classification thresholds from full dataset
    p90 = np.percentile(soft, 90)
    p95 = np.percentile(soft, 95)
    p99 = np.percentile(soft, 99)
    p999 = np.percentile(soft, 99.9)
    class_bins = [0, p90, p95, p99, p999, np.inf]
    class_labels = ["B", "C", "M", "X", "X+"]

    # Extract peak/start/end for each event
    flare_records = []
    for idx, (s, e) in enumerate(events):
        event_slice = soft[s : e + 1]
        ts_slice = timestamps[s : e + 1]
        bg_slice = bg[s : e + 1]

        peak_idx_rel = np.argmax(event_slice)
        peak_idx = s + peak_idx_rel
        peak_time = timestamps[peak_idx]
        peak_flux = soft[peak_idx]

        # Start time: first time excess crosses threshold going up
        start_idx = s
        start_time = timestamps[start_idx]

        # End time: first time after peak that flux decays to decay_frac of peak
        end_idx = e
        for j in range(peak_idx, e + 1):
            if soft[j] <= bg[j] + decay_frac * (peak_flux - bg[j]):
                end_idx = j
                break
        end_time = timestamps[end_idx]

        # Classify based on peak flux using percentile bins
        flare_class = classify_solexs_flux(peak_flux, class_bins, class_labels)

        flare_records.append(
            {
                "id": f"soft_{idx:04d}",
                "start": pd.Timestamp(start_time, tz="UTC"),
                "peak": pd.Timestamp(peak_time, tz="UTC"),
                "end": pd.Timestamp(end_time, tz="UTC"),
                "class": flare_class,
                "peak_value": float(peak_flux),
                "source": "soft",
                "confidence": round(min(1.0, 0.5 + 0.5 * float((resid[peak_idx] - threshold[peak_idx]) / max(1e-10, 10 * rolling_std[peak_idx]))), 2),
            }
        )

    return pd.DataFrame(flare_records)


def classify_solexs_flux(flux: float, bins: list, labels: list) -> str:
    """Classify flare based on peak flux using percentile-based bins.

    Since SoLEXS reports counts/s (not calibrated W/m^2), we use
    dataset-relative thresholds derived from the full flux distribution.
    """
    for i, upper in enumerate(bins[1:]):
        if flux < upper:
            return labels[i]
    return labels[-1]


def run_detection_soft():
    """Run soft X-ray flare detection and save results."""
    config = load_config()
    input_path = Path("data/processed/combined_timeseries.parquet")
    output_path = Path("data/interim/flare_catalogue_soft.parquet")

    if not input_path.exists():
        print(f"Input file not found: {input_path}")
        return None

    df = pd.read_parquet(input_path)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)

    print(f"Running soft X-ray detection on {len(df)} data points...")
    catalogue = detect_flares_soft(df, config)
    print(f"Found {len(catalogue)} soft X-ray events")

    if not catalogue.empty:
        catalogue["source"] = "soft"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        catalogue.to_parquet(output_path, index=False)
        print(f"Saved soft catalogue to {output_path}")
        print(catalogue[["id", "peak", "class", "peak_value"]].to_string())

    return catalogue


if __name__ == "__main__":
    run_detection_soft()