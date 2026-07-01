"""Parse SoLEXS Level-1 FITS light curve files (inside ZIP archives, gzipped)."""

from pathlib import Path
import zipfile
import gzip
import io
import pandas as pd
import numpy as np
from astropy.io import fits


def parse_solexs_zip(zip_path: Path) -> pd.DataFrame:
    """Parse a single SoLEXS ZIP containing .lc.gz light curve file.

    Structure:
    - ZIP -> folder/SDD2/AL1_SOLEXS_XXXX_L1.lc.gz
    - .lc.gz -> FITS with extension RATE, columns: TIME (Unix s), COUNTS
    """
    print(f"Reading {zip_path.name}...")
    with zipfile.ZipFile(zip_path) as z:
        lc_files = [n for n in z.namelist() if n.endswith('.lc.gz') and 'SDD2' in n]
        if not lc_files:
            print(f"  No .lc.gz file found for SDD2 in {zip_path.name}")
            return pd.DataFrame(columns=["timestamp", "soft", "quality_flag"])

        lc_name = lc_files[0]
        raw = z.read(lc_name)
        decompressed = gzip.decompress(raw)

        with fits.open(io.BytesIO(decompressed)) as hdul:
            data = hdul['RATE'].data
            df = pd.DataFrame({
                "timestamp": pd.to_datetime(data['TIME'], unit='s', utc=True),
                "soft": data['COUNTS'].astype(np.float64),
                "quality_flag": 0,
            })

    print(f"  Parsed {len(df)} rows, range: {df['timestamp'].min()} to {df['timestamp'].max()}")
    return df


def parse_all_solexs(raw_dir: Path, output_path: Path):
    """Parse all SoLEXS ZIP files and save combined parquet."""
    zips = sorted(raw_dir.glob("*.zip"))
    if not zips:
        raise FileNotFoundError(f"No ZIP files found in {raw_dir}")

    all_dfs = []
    for z in zips:
        df = parse_solexs_zip(z)
        if not df.empty:
            all_dfs.append(df)

    if not all_dfs:
        raise ValueError("No valid SoLEXS data parsed")

    combined = pd.concat(all_dfs, ignore_index=True)
    combined = combined.sort_values("timestamp").reset_index(drop=True)
    combined = combined.drop_duplicates(subset=["timestamp"])

    output_path.parent.mkdir(parents=True, exist_ok=True)
    combined.to_parquet(output_path, index=False)
    print(f"Saved {len(combined)} rows to {output_path}")
    return combined


if __name__ == "__main__":
    raw_dir = Path("data/raw/solexs")
    output_path = Path("data/interim/solexs_parsed.parquet")
    parse_all_solexs(raw_dir, output_path)
