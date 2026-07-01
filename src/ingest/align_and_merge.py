"""Align and merge SoLEXS and HEL1OS time series to a common cadence using GPR gap filling."""

from pathlib import Path
import pandas as pd
import numpy as np
from sklearn.gaussian_process import GaussianProcessRegressor
from sklearn.gaussian_process.kernels import RBF, ConstantKernel as C, WhiteKernel


def interpolate_gaps_gpr(
    series: pd.Series,
    max_gap_size: int = 180,  # 30 minutes (180 * 10s)
    context_size: int = 60,   # 10 minutes (60 * 10s)
) -> pd.Series:
    """Interpolate gaps of NaNs in a series using Gaussian Process Regression.
    
    Only fills contiguous NaN blocks of size <= max_gap_size.
    Uses context_size non-NaN values before and after the gap for local fitting.
    """
    s = series.copy()
    is_nan = s.isna()
    if not is_nan.any():
        return s

    # Group contiguous NaNs
    nan_blocks = []
    current_block = []
    for i, val in enumerate(is_nan):
        if val:
            current_block.append(i)
        else:
            if current_block:
                nan_blocks.append(current_block)
                current_block = []
    if current_block:
        nan_blocks.append(current_block)

    filled_count = 0
    for block in nan_blocks:
        if len(block) > max_gap_size:
            # Leave large gaps (e.g. orbit changes or night side) unfilled
            continue

        # Get local context boundaries
        start_idx = max(0, block[0] - context_size)
        end_idx = min(len(s), block[-1] + 1 + context_size)

        context_range = range(start_idx, end_idx)
        context_vals = s.iloc[context_range]

        # Extract non-NaN training points in context
        train_indices = [idx for idx in context_range if not is_nan.iloc[idx]]
        if len(train_indices) < 5:
            # Fall back to linear interpolation if context is too sparse
            linear_vals = context_vals.interpolate(method="linear")
            block_idx_in_context = [idx - start_idx for idx in block]
            s.update(pd.Series(linear_vals.iloc[block_idx_in_context].values, index=s.index[block]))
            continue

        # Prepare GPR training data (using relative time step index as X)
        X_train = np.array(train_indices).reshape(-1, 1)
        y_train = s.iloc[train_indices].values

        X_test = np.array(block).reshape(-1, 1)

        # Kernel: Constant * RBF + WhiteKernel noise
        kernel = C(1.0, (1e-2, 1e2)) * RBF(length_scale=30.0, length_scale_bounds=(5.0, 150.0)) + WhiteKernel(noise_level=0.1, noise_level_bounds=(1e-4, 1.0))
        gpr = GaussianProcessRegressor(kernel=kernel, n_restarts_optimizer=2, random_state=42)

        try:
            gpr.fit(X_train, y_train)
            y_pred = gpr.predict(X_test)
            
            # Physical constraint: counts cannot be negative
            y_pred = np.clip(y_pred, 0.0, None)
            
            # Fill the block
            s.update(pd.Series(y_pred, index=s.index[block]))
            filled_count += len(block)
        except Exception as e:
            # Safe fallback: linear interpolation
            linear_vals = context_vals.interpolate(method="linear")
            block_idx_in_context = [idx - start_idx for idx in block]
            s.update(pd.Series(linear_vals.iloc[block_idx_in_context].values, index=s.index[block]))

    if filled_count > 0:
        print(f"  GPR filled {filled_count} missing data points across gaps")
    return s


def align_and_merge(
    solexs_path: Path,
    hel1os_path: Path,
    output_path: Path,
):
    """Resample both time series to common cadence and merge using GPR gap filling."""
    solexs_df = pd.read_parquet(solexs_path)[["timestamp", "soft"]]
    hel1os_df = pd.read_parquet(hel1os_path)[["timestamp", "hard"]]

    print(f"SoLEXS: {len(solexs_df)} rows, range: {solexs_df['timestamp'].min()} to {solexs_df['timestamp'].max()}")
    print(f"HEL1OS: {len(hel1os_df)} rows, range: {hel1os_df['timestamp'].min()} to {hel1os_df['timestamp'].max()}")

    # Convert timestamps and round to nearest second
    solexs_df["timestamp"] = pd.to_datetime(solexs_df["timestamp"], utc=True).dt.round("1s")
    hel1os_df["timestamp"] = pd.to_datetime(hel1os_df["timestamp"], utc=True).dt.round("1s")

    solexs_df = solexs_df.drop_duplicates(subset=["timestamp"]).set_index("timestamp")
    hel1os_df = hel1os_df.drop_duplicates(subset=["timestamp"]).set_index("timestamp")

    # Determine common time range
    start = max(solexs_df.index.min(), hel1os_df.index.min())
    end = min(solexs_df.index.max(), hel1os_df.index.max())
    print(f"Common range: {start} to {end}")

    # Filter to common range
    solexs_df = solexs_df.loc[start:end]
    hel1os_df = hel1os_df.loc[start:end]

    # Resample to 10-second cadence using mean
    solexs_10s = solexs_df["soft"].resample("10s").mean()
    hel1os_10s = hel1os_df["hard"].resample("10s").mean()

    # Apply Gaussian Process Regression to fill data drops
    print("Interpolating SoLEXS telemetry gaps using local GPR...")
    solexs_10s = interpolate_gaps_gpr(solexs_10s)
    print("Interpolating HEL1OS telemetry gaps using local GPR...")
    hel1os_10s = interpolate_gaps_gpr(hel1os_10s)

    # Merge and drop remaining NaNs (larger than max_gap_size)
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
    print(f"Saved merged dataset to {output_path}")

    return merged


if __name__ == "__main__":
    solexs_path = Path("data/interim/solexs_parsed.parquet")
    hel1os_path = Path("data/interim/hel1os_parsed.parquet")
    output_path = Path("data/processed/combined_timeseries.parquet")
    align_and_merge(solexs_path, hel1os_path, output_path)
