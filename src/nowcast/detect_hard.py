"""Detect solar flares in HEL1OS (hard X-ray) light curve."""

from pathlib import Path
import pandas as pd
import numpy as np
import yaml


def load_config():
    with open("config/nowcast_config.yaml") as f:
        return yaml.safe_load(f)


def estimate_background(series: pd.Series, window: int, percentile: float) -> pd.Series:
    """Rolling percentile background estimation."""
    return series.rolling(window=window, center=False, min_periods=1).quantile(
        percentile / 100.0, interpolation="linear"
    )


def detect_flares_hard(
    df: pd.DataFrame,
    config: dict,
) -> pd.DataFrame:
    """Detect hard X-ray bursts in the HEL1OS channel.

    Hard X-ray events are typically more impulsive (shorter, spikier)
    than soft X-ray events. Uses a slightly different strategy:
    shorter background window, lower threshold for capturing precursors.
    """
    cfg = config["nowcast"]
    bg_window = int(cfg["background_window_minutes"] * 60)
    bg_percentile = cfg["background_percentile"]
    k = cfg["threshold_k_hard"]
    min_duration = int(cfg["min_event_duration_minutes"] * 60)
    merge_gap = int(cfg["merge_gap_minutes"] * 60)
    decay_frac = cfg.get("decay_fraction", 0.5)
    min_flux = cfg.get("min_absolute_flux_hard", 0)

    hard = df["hard"].values
    timestamps = df["timestamp"].values

    # Shorter background window for hard X-ray to capture impulsive nature
    hard_bg_window = max(bg_window // 2, 60)
    bg = estimate_background(df["hard"], hard_bg_window, bg_percentile).values

    resid = hard - bg
    rolling_std = (
        df["hard"]
        .rolling(window=hard_bg_window, center=False, min_periods=1)
        .std()
        .bfill()
        .values
    )
    rolling_std = np.maximum(rolling_std, 1e-10)

    threshold = k * rolling_std
    elevated = (resid > threshold) & (hard > min_flux)

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

    flare_records = []
    for idx, (s, e) in enumerate(events):
        event_slice = hard[s : e + 1]
        ts_slice = timestamps[s : e + 1]

        peak_idx_rel = np.argmax(event_slice)
        peak_idx = s + peak_idx_rel
        peak_time = timestamps[peak_idx]
        peak_flux = hard[peak_idx]

        start_time = timestamps[s]
        end_time = timestamps[e]

        confidence = round(min(1.0, 0.5 + 0.5 * float((resid[peak_idx] - threshold[peak_idx]) / max(1e-10, 10 * rolling_std[peak_idx]))), 2)

        flare_records.append(
            {
                "id": f"hard_{idx:04d}",
                "start": pd.Timestamp(start_time, tz="UTC"),
                "peak": pd.Timestamp(peak_time, tz="UTC"),
                "end": pd.Timestamp(end_time, tz="UTC"),
                "class": "N/A",
                "peak_value": float(peak_flux),
                "source": "hard",
                "confidence": confidence,
            }
        )

    return pd.DataFrame(flare_records)


def run_detection_hard():
    """Run hard X-ray burst detection and save results."""
    config = load_config()
    input_path = Path("data/processed/combined_timeseries.parquet")
    output_path = Path("data/interim/flare_catalogue_hard.parquet")

    if not input_path.exists():
        print(f"Input file not found: {input_path}")
        return None

    df = pd.read_parquet(input_path)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)

    print(f"Running hard X-ray detection on {len(df)} data points...")
    catalogue = detect_flares_hard(df, config)
    print(f"Found {len(catalogue)} hard X-ray events")

    if not catalogue.empty:
        catalogue["source"] = "hard"
        output_path.parent.mkdir(parents=True, exist_ok=True)
        catalogue.to_parquet(output_path, index=False)
        print(f"Saved hard catalogue to {output_path}")
        print(catalogue[["id", "peak", "peak_value", "confidence"]].to_string())

    return catalogue


if __name__ == "__main__":
    run_detection_hard()