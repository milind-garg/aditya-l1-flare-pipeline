"""Generate synthetic Aditya-L1 SoLEXS + HEL1OS light curve data for testing."""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import pandas as pd
import numpy as np
from datetime import datetime, timedelta


def generate_sample_data(
    days: int = 3,
    cadence_seconds: float = 1.0,
    seed: int = 42,
    output_path: str = "data/processed/combined_timeseries.parquet",
):
    """Generate realistic-looking light curve data with some synthetic flares.

    The data mimics SoLEXS (soft) and HEL1OS (hard) X-ray light curves with:
    - Quiet Sun background (slowly varying)
    - Poisson-like noise
    - Several synthetic flares of different classes
    - Hard X-ray precursors that appear before some soft X-ray rises
    """
    np.random.seed(seed)

    n_points = int(days * 86400 / cadence_seconds)
    start_time = datetime(2026, 3, 1, 0, 0, 0)
    timestamps = [start_time + timedelta(seconds=i * cadence_seconds) for i in range(n_points)]

    t = np.arange(n_points)

    # Background: slowly varying quiet Sun level + diurnal-like variation
    bg_soft = 50 + 10 * np.sin(2 * np.pi * t / (86400 / cadence_seconds)) + 5 * np.sin(2 * np.pi * t / (43200 / cadence_seconds))
    bg_hard = 5 + 2 * np.sin(2 * np.pi * t / (86400 / cadence_seconds))

    # Generate synthetic flares (add to background)
    # Format: (start_idx, duration_seconds, class_factor, has_precursor)
    flares_spec = [
        (3000, 1200, "C", True),    # C-class flare at ~50min
        (8000, 900, "M", True),     # M-class at ~2.2hr
        (15000, 600, "B", False),   # B-class at ~4.2hr
        (25000, 1800, "X", True),   # X-class at ~6.9hr
        (40000, 800, "C", False),   # C-class at ~11.1hr
        (55000, 1500, "M", True),   # M-class at ~15.3hr
        (70000, 500, "C", True),    # C-class at ~19.4hr
        (100000, 2000, "X", True),  # X-class at ~27.8hr
        (130000, 1200, "M", False), # M-class at ~36.1hr
        (160000, 700, "C", True),   # C-class at ~44.4hr
        (180000, 900, "B", False),  # B-class at ~50hr
        (200000, 1600, "X", True),  # X-class at ~55.6hr
    ]

    # Class peak values (counts/s, not calibrated W/m^2)
    class_peak_soft = {"B": 100, "C": 300, "M": 800, "X": 2000}
    class_peak_hard = {"B": 15, "C": 40, "M": 120, "X": 300}

    soft = bg_soft.copy()
    hard = bg_hard.copy()
    flare_records = []

    for start_idx, duration, cls, has_precursor in flares_spec:
        end_idx = min(start_idx + duration, n_points)
        length = end_idx - start_idx
        if length <= 0:
            continue

        peak_soft = class_peak_soft[cls] * (0.7 + 0.6 * np.random.random())
        peak_hard = class_peak_hard[cls] * (0.7 + 0.6 * np.random.random())

        # Soft X-ray: fast rise (~20% of duration), slower exponential decay
        i_rel = np.arange(length)
        rise_pts = int(length * 0.2) + 1
        decay_pts = length - rise_pts

        # Gaussian-like profile for soft
        sigma = length / 4
        gauss = np.exp(-((i_rel - length * 0.25) ** 2) / (2 * sigma ** 2))
        gauss = gauss / gauss.max() * peak_soft
        soft[start_idx:end_idx] += gauss

        # Hard X-ray: more impulsive, shorter, spikier
        if has_precursor:
            # Precursor: hard spike ~5-10 minutes before soft rise
            precursor_offset = int(300 / cadence_seconds)  # 5 min
            prec_start = max(0, start_idx - precursor_offset)
            prec_len = min(length // 3, precursor_offset)
            if prec_len > 0:
                prec_i = np.arange(prec_len)
                prec_sigma = prec_len / 6
                prec_gauss = np.exp(-((prec_i - prec_len * 0.3) ** 2) / (2 * prec_sigma ** 2))
                prec_gauss = prec_gauss / prec_gauss.max() * peak_hard * 0.6
                hard[prec_start:prec_start + prec_len] += prec_gauss[:min(prec_len, len(hard) - prec_start)]

        # Hard X-ray main emission
        hard_rise = int(length * 0.15) + 1
        hard_decay = length - hard_rise
        hard_gauss = np.exp(-((i_rel - length * 0.15) ** 2) / (2 * (length / 8) ** 2))
        hard_gauss = hard_gauss / hard_gauss.max() * peak_hard
        hard[start_idx:end_idx] += hard_gauss

        peak_idx = start_idx + int(length * 0.25)
        flare_records.append({
            "id": f"synthetic_{len(flare_records):04d}",
            "start": timestamps[max(0, start_idx)],
            "peak": timestamps[min(peak_idx, n_points - 1)],
            "end": timestamps[min(end_idx - 1, n_points - 1)],
            "class": f"{cls}{peak_soft / class_peak_soft[cls]:.1f}",
            "peak_value": float(peak_soft),
            "source": "soft+hard",
            "confidence": 0.85 + 0.15 * np.random.random(),
        })

    # Add Poisson-like noise
    soft_noise = np.random.poisson(np.maximum(soft, 0) * 0.05) - np.maximum(soft, 0) * 0.05
    hard_noise = np.random.poisson(np.maximum(hard, 0) * 0.1) - np.maximum(hard, 0) * 0.1

    soft = np.maximum(soft + soft_noise, 0)
    hard = np.maximum(hard + hard_noise, 0)

    df = pd.DataFrame({
        "timestamp": timestamps,
        "soft": soft,
        "hard": hard,
    })

    # Save combined timeseries
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_parquet(output_path, index=False)
    print(f"Generated {len(df)} data points to {output_path}")
    print(f"Soft: mean={soft.mean():.1f}, min={soft.min():.1f}, max={soft.max():.1f}")
    print(f"Hard: mean={hard.mean():.1f}, min={hard.min():.1f}, max={hard.max():.1f}")

    # Also save the ground truth flare catalogue for evaluation
    flare_df = pd.DataFrame(flare_records)
    flare_path = Path("data/processed/flare_catalogue_master.csv")
    flare_df.to_csv(flare_path, index=False)
    print(f"Saved {len(flare_df)} synthetic flare events to {flare_path}")

    return df, flare_df


if __name__ == "__main__":
    generate_sample_data(days=3)