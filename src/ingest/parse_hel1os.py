"""Parse HEL1OS Level-1 FITS light curve files (inside ZIP archives)."""

from pathlib import Path
import zipfile
import io
import pandas as pd
import numpy as np
from astropy.io import fits


# All detector + total band extension names to extract
HEL1OS_TOTAL_BANDS = {
    "CZT1": "CZT1_LC_BAND_18.00KEV_TO_160.00KEV",
    "CZT2": "CZT2_LC_BAND_18.00KEV_TO_160.00KEV",
    "CDTE1": "CDTE1_LC_BAND_1.80KEV_TO_90.00KEV",
    "CDTE2": "CDTE2_LC_BAND_1.80KEV_TO_90.00KEV",
}

# Backup: if total band not found, sum the sub-bands
HEL1OS_SUB_BANDS = {
    "CZT1": [f"CZT1_LC_BAND_{lo}.00KEV_TO_{hi}.00KEV" for lo, hi in [(20, 40), (40, 60), (60, 80), (80, 150)]],
    "CZT2": [f"CZT2_LC_BAND_{lo}.00KEV_TO_{hi}.00KEV" for lo, hi in [(20, 40), (40, 60), (60, 80), (80, 150)]],
    "CDTE1": ["CDTE1_LC_BAND_5.00KEV_TO_20.00KEV", "CDTE1_LC_BAND_20.00KEV_TO_30.00KEV",
               "CDTE1_LC_BAND_30.00KEV_TO_40.00KEV", "CDTE1_LC_BAND_40.00KEV_TO_60.00KEV"],
    "CDTE2": ["CDTE2_LC_BAND_5.00KEV_TO_20.00KEV", "CDTE2_LC_BAND_20.00KEV_TO_30.00KEV",
               "CDTE2_LC_BAND_30.00KEV_TO_40.00KEV", "CDTE2_LC_BAND_40.00KEV_TO_60.00KEV"],
}


def get_ctr_from_ext(data, ext_name):
    """Get CTR column values from a FITS extension, handling uppercase variations."""
    for col in data.columns.names:
        if col.strip().upper() == "CTR":
            return data[col]
    raise KeyError(f"No CTR column found in extension {ext_name}")


def parse_hel1os_zip(zip_path: Path) -> pd.DataFrame:
    """Parse a single HEL1OS ZIP containing FITS light curve files.

    Structure:
    - ZIP -> date/.../czt/lightcurve_czt1.fits (and other detectors)
    - Lightcurve FITS has extensions per energy band
    - Each extension has columns: MJD, ISOT, CTR, STAT_ERR
    """
    print(f"Reading {zip_path.name}...")
    all_bands = []

    with zipfile.ZipFile(zip_path) as z:
        lc_files = [n for n in z.namelist() if 'lightcurve' in n and n.endswith('.fits')]

        if not lc_files:
            print(f"  No lightcurve files found in {zip_path.name}")
            return pd.DataFrame(columns=["timestamp", "hard", "quality_flag"])

        for lc_path in lc_files:
            raw = z.read(lc_path)
            detector_lc = pd.DataFrame()

            # Determine which detector this file belongs to
            det_key = ""
            for key in ["CZT1", "CZT2", "CDTE1", "CDTE2"]:
                if key.lower() in lc_path.lower():
                    det_key = key
                    break
            if not det_key:
                continue

            def read_ext_isot(ext):
                """Read ISOT column as proper strings from a FITS extension."""
                raw = ext.data["ISOT"]
                return pd.to_datetime([str(v, encoding='ascii') if isinstance(v, bytes) else str(v) for v in raw], utc=True)

            def read_ext_ctr(ext):
                return ext.data["CTR"].astype(np.float64)

            with fits.open(io.BytesIO(raw)) as hdul:
                total_band = HEL1OS_TOTAL_BANDS.get(det_key)
                if total_band and total_band in hdul:
                    ext = hdul[total_band]
                    detector_lc = pd.DataFrame({
                        "timestamp": read_ext_isot(ext),
                        "ctr": read_ext_ctr(ext),
                    }).set_index("timestamp")
                else:
                    summed = None
                    for sub_ext in HEL1OS_SUB_BANDS.get(det_key, []):
                        if sub_ext in hdul:
                            ext = hdul[sub_ext]
                            sub_df = pd.DataFrame({
                                "ctr": read_ext_ctr(ext),
                            }, index=read_ext_isot(ext))
                            summed = sub_df if summed is None else summed.add(sub_df, fill_value=0)
                    if summed is not None:
                        detector_lc = summed

            if not detector_lc.empty:
                all_bands.append(detector_lc)

    if not all_bands:
        print(f"  No parsable light curve data found in {zip_path.name}")
        return pd.DataFrame(columns=["timestamp", "hard", "quality_flag"])

    # Combine all detectors by summing (co-aligned on timestamp index)
    combined = all_bands[0]
    for df in all_bands[1:]:
        combined = combined.add(df, fill_value=0)

    result = combined.reset_index()
    result.columns = ["timestamp", "hard"]
    result["quality_flag"] = 0
    result = result.sort_values("timestamp").reset_index(drop=True)

    print(f"  Parsed {len(result)} rows, range: {result['timestamp'].min()} to {result['timestamp'].max()}")
    return result


def parse_all_hel1os(raw_dir: Path, output_path: Path):
    """Parse all HEL1OS ZIP files and save combined parquet."""
    zips = sorted(raw_dir.glob("*.zip"))
    if not zips:
        raise FileNotFoundError(f"No ZIP files found in {raw_dir}")

    all_dfs = []
    for z in zips:
        df = parse_hel1os_zip(z)
        if not df.empty:
            all_dfs.append(df)

    if not all_dfs:
        raise ValueError("No valid HEL1OS data parsed")

    combined = pd.concat(all_dfs, ignore_index=True)
    combined = combined.sort_values("timestamp").reset_index(drop=True)
    combined = combined.drop_duplicates(subset=["timestamp"])

    output_path.parent.mkdir(parents=True, exist_ok=True)
    combined.to_parquet(output_path, index=False)
    print(f"Saved {len(combined)} rows to {output_path}")
    return combined


if __name__ == "__main__":
    raw_dir = Path("data/raw/hel1os")
    output_path = Path("data/interim/hel1os_parsed.parquet")
    parse_all_hel1os(raw_dir, output_path)
