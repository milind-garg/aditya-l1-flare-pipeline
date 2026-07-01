"""Align and merge SoLEXS and HEL1OS time series to a common cadence."""

from pathlib import Path
import pandas as pd


def align_and_merge(
    solexs_path: Path,
    hel1os_path: Path,
    output_path: Path,
):
    """Resample both time series to common cadence and merge."""
    solexs_df = pd.read_parquet(solexs_path)[["timestamp", "soft"]]
    hel1os_df = pd.read_parquet(hel1os_path)[["timestamp", "hard"]]

    print(f"SoLEXS: {len(solexs_df)} rows, range: {solexs_df['timestamp'].min()} to {solexs_df['timestamp'].max()}")
    print(f"HEL1OS: {len(hel1os_df)} rows, range: {hel1os_df['timestamp'].min()} to {hel1os_df['timestamp'].max()}")

    # Convert timestamps and round to nearest second
    solexs_df["timestamp"] = pd.to_datetime(solexs_df["timestamp"], utc=True).dt.round("1s")
    hel1os_df["timestamp"] = pd.to_datetime(hel1os_df["timestamp"], utc=True).dt.round("1s")

    solexs_df = solexs_df.drop_duplicates(subset=["timestamp"]).set_index("timestamp")
    hel1os_df = hel1os_df.drop_duplicates(subset=["timestamp"]).set_index("timestamp")

    # Determine common time range (in whole seconds)
    start = max(solexs_df.index.min(), hel1os_df.index.min())
    end = min(solexs_df.index.max(), hel1os_df.index.max())
    print(f"Common range: {start} to {end}")

    # Filter to common range
    solexs_df = solexs_df.loc[start:end]
    hel1os_df = hel1os_df.loc[start:end]

    # Resample to 10-second cadence using mean
    solexs_10s = solexs_df["soft"].resample("10s").mean()
    hel1os_10s = hel1os_df["hard"].resample("10s").mean()

    # Forward fill any remaining gaps (up to 2 min)
    solexs_10s = solexs_10s.ffill(limit=12)
    hel1os_10s = hel1os_10s.ffill(limit=12)

    # Merge
    merged = pd.DataFrame({
        "soft": solexs_10s,
        "hard": hel1os_10s,
    }).dropna().reset_index()
    merged = merged.rename(columns={"index": "timestamp"})

    print(f"Merged: {len(merged)} rows at 10s cadence")
    print(f"Soft range: {merged['soft'].min():.3f} to {merged['soft'].max():.3f}")
    print(f"Hard range: {merged['hard'].min():.3f} to {merged['hard'].max():.3f}")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    merged.to_parquet(output_path, index=False)
    print(f"Saved to {output_path}")

    return merged


if __name__ == "__main__":
    solexs_path = Path("data/interim/solexs_parsed.parquet")
    hel1os_path = Path("data/interim/hel1os_parsed.parquet")
    output_path = Path("data/processed/combined_timeseries.parquet")
    align_and_merge(solexs_path, hel1os_path, output_path)
