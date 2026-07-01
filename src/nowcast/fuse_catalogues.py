"""Fuse soft and hard X-ray flare catalogues into a master catalogue."""

from pathlib import Path
import pandas as pd
import numpy as np
import yaml


def load_config():
    with open("config/nowcast_config.yaml") as f:
        return yaml.safe_load(f)


def fuse_catalogues(
    soft_df: pd.DataFrame,
    hard_df: pd.DataFrame,
    config: dict,
) -> pd.DataFrame:
    """Fuse soft and hard detection catalogues into a master catalogue.

    Fusion logic:
    - Soft events with overlapping hard events -> "soft+hard", boosted confidence
    - Soft-only events -> "soft_only"
    - Hard-only events (no soft counterpart) -> "hard_only" (precursor candidates)
    - Closely timing events are merged
    """
    cfg = config["nowcast"]
    tolerance = pd.Timedelta(minutes=cfg.get("fusion_tolerance_minutes", 2))

    master_records = []

    # Track which hard events have been matched
    hard_matched = set()

    # Process soft events first
    for _, soft_row in soft_df.iterrows():
        soft_start = soft_row["start"]
        soft_end = soft_row["end"]
        soft_peak = soft_row["peak"]

        # Find overlapping hard events
        matched_hard = []
        for h_idx, hard_row in hard_df.iterrows():
            if h_idx in hard_matched:
                continue
            hard_peak = hard_row["peak"]

            # Check if hard event is within tolerance of soft event
            if (soft_start - tolerance <= hard_peak <= soft_end + tolerance) or \
               (hard_row["start"] - tolerance <= soft_peak <= hard_row["end"] + tolerance):
                matched_hard.append(h_idx)

        is_combined = len(matched_hard) > 0

        if is_combined:
            for h_idx in matched_hard:
                hard_matched.add(h_idx)

        soft_start_ts = pd.Timestamp(soft_row["start"])
        soft_end_ts = pd.Timestamp(soft_row["end"])
        soft_peak_ts = pd.Timestamp(soft_row["peak"])

        if matched_hard:
            hard_starts = [pd.Timestamp(hard_df.loc[h_idx, "start"]) for h_idx in matched_hard]
            hard_ends = [pd.Timestamp(hard_df.loc[h_idx, "end"]) for h_idx in matched_hard]
            merged_start = min([soft_start_ts] + hard_starts)
            merged_end = max([soft_end_ts] + hard_ends)
        else:
            merged_start = soft_start_ts
            merged_end = soft_end_ts

        merged = {
            "id": soft_row["id"].replace("soft_", "flare_"),
            "start": merged_start,
            "peak": soft_peak_ts,
            "end": merged_end,
            "class": soft_row["class"],
            "peak_value": soft_row["peak_value"],
            "source": "soft+hard" if is_combined else "soft_only",
            "confidence": min(1.0, soft_row["confidence"] + (
                0.15 * len(matched_hard) if is_combined else 0
            )),
        }
        master_records.append(merged)

    # Process remaining unmatched hard events
    for h_idx, hard_row in hard_df.iterrows():
        if h_idx in hard_matched:
            continue

        merged = {
            "id": hard_row["id"].replace("hard_", "flare_"),
            "start": pd.Timestamp(hard_row["start"]),
            "peak": pd.Timestamp(hard_row["peak"]),
            "end": pd.Timestamp(hard_row["end"]),
            "class": "N/A",
            "peak_value": hard_row["peak_value"],
            "source": "hard_only",
            "confidence": hard_row["confidence"],
        }
        master_records.append(merged)

    master = pd.DataFrame(master_records)
    if not master.empty:
        master = master.sort_values("peak").reset_index(drop=True)
        master["id"] = [f"flare_{i:04d}" for i in range(len(master))]

    return master


def run_fusion():
    """Fuse soft and hard catalogues into master catalogue."""
    config = load_config()
    soft_path = Path("data/interim/flare_catalogue_soft.parquet")
    hard_path = Path("data/interim/flare_catalogue_hard.parquet")
    output_path = Path("data/processed/flare_catalogue_master.csv")

    soft_df = pd.read_parquet(soft_path) if soft_path.exists() else pd.DataFrame()
    hard_df = pd.read_parquet(hard_path) if hard_path.exists() else pd.DataFrame()

    print(f"Soft events: {len(soft_df)}")
    print(f"Hard events: {len(hard_df)}")

    if soft_df.empty and hard_df.empty:
        print("No events to fuse")
        return None

    master = fuse_catalogues(soft_df, hard_df, config)
    print(f"Master catalogue: {len(master)} events")
    print(f"  soft+hard: {len(master[master['source'] == 'soft+hard'])}")
    print(f"  soft_only: {len(master[master['source'] == 'soft_only'])}")
    print(f"  hard_only: {len(master[master['source'] == 'hard_only'])}")

    if not master.empty:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        master.to_csv(output_path, index=False)
        print(f"Saved master catalogue to {output_path}")
        print(master[["id", "peak", "class", "source", "confidence"]].to_string())

    return master


def run_nowcasting_pipeline():
    """Run full nowcasting pipeline end-to-end."""
    from src.nowcast.detect_soft import run_detection_soft
    from src.nowcast.detect_hard import run_detection_hard

    print("=" * 60)
    print("Nowcasting Pipeline")
    print("=" * 60)

    soft_cat = run_detection_soft()
    hard_cat = run_detection_hard()

    if soft_cat is None and hard_cat is None:
        print("No data available for detection")
        return None

    master = run_fusion()
    return master


if __name__ == "__main__":
    run_nowcasting_pipeline()