# Data Understanding — SoLEXS & HEL1OS (Aditya-L1)

## 1. Instruments
- **SoLEXS** (Solar Low Energy X-ray Spectrometer): soft X-rays, roughly analogous in role to GOES XRS (1–8 Å / 0.5–4 Å bands), good for classic GOES-style flare classes (A/B/C/M/X based on peak flux).
- **HEL1OS** (High Energy L1 Orbiting X-ray Spectrometer): hard X-rays, sensitive to higher-energy non-thermal emission that often appears as impulsive spikes *before or during the rise* of the soft X-ray curve — these are the "precursor" signals useful for forecasting.

## 2. Where to Get Data
- Portal: ISRO ISSDC **PRADAN** portal (Payload Data Archive).
- You will need to register an account, then search/select Aditya-L1 → SoLEXS / HEL1OS → Level-1 products, and pick a date range.
- Recommended first download: pick a window that you confirm (via space-weather references) contains at least 2–3 flares of different classes (mix of C, M if possible) — this avoids training/testing on an all-quiet period.
- Download both SoLEXS L1 and HEL1OS L1 for the **same time window** so they can be time-aligned.

## 3. Expected File Format
- Level-1 science products are typically distributed as **FITS** files (and/or CDF for some ISRO payload archives) with a time-series light curve table (columns roughly: TIME, COUNTS/FLUX per channel or energy band, QUALITY/FLAGS).
- Action item (do this first, before writing any pipeline code): open one sample SoLEXS file and one sample HEL1OS file with `astropy.io.fits` (or `spacepy.pycdf` if CDF) in a scratch Jupyter notebook and print:
  - `hdul.info()` to see extensions
  - the header keywords of the data extension
  - column names of the table
  - a plot of the first column vs time to sanity check units (counts/s vs time in days/seconds since epoch)
- Record exact column names/units in a short `data_dictionary.md` inside the repo once known — the spec files in this set deliberately stay generic ("flux/time column") until you confirm the real names, so the build doesn't get stuck waiting on documentation.

## 4. Time Alignment
- SoLEXS and HEL1OS will almost certainly have different time stamps/cadences. Plan to resample both to a common cadence (e.g., 1-second or the coarser instrument's native cadence) using interpolation or binning, indexed on UTC datetime.

## 5. Flare Classification Reference (standard, GOES-style — reuse for SoLEXS soft channel)
| Class | Peak flux (W/m², 1–8 Å) |
|---|---|
| A | < 1e-7 |
| B | 1e-7 to 1e-6 |
| C | 1e-6 to 1e-5 |
| M | 1e-5 to 1e-4 |
| X | ≥ 1e-4 |

If SoLEXS reports counts/s rather than calibrated flux, you will need either (a) an instrument calibration factor from the PRADAN documentation, or (b) a relative classification scheme (percentile/sigma-above-background) clearly labeled as "SoLEXS-relative class," and explicitly note in the demo that absolute GOES-class mapping requires calibration data.

## 6. Supplementary / Sanity-Check Data (optional, allowed by problem statement)
- **NOAA GOES XRS** flare event list (public, via NOAA SWPC) can be used purely as an independent sanity check ("did we catch the flares that GOES also recorded on the same days?") — not as training data, to keep this a true Aditya-L1 solution.

## 7. Data Folder Convention (for the repo)
```
data/
  raw/
    solexs/      <- raw downloaded files from PRADAN, untouched
    hel1os/
  interim/
    solexs_parsed.parquet
    hel1os_parsed.parquet
  processed/
    combined_timeseries.parquet   <- merged, resampled, aligned
    flare_catalogue_master.csv    <- final nowcasting output
```

## 8. Action Checklist
- [ ] Register on PRADAN, download SoLEXS L1 + HEL1OS L1 for a chosen multi-day window.
- [ ] Open files, confirm format (FITS/CDF), confirm column names + units.
- [ ] Write `data_dictionary.md` documenting real column names.
- [ ] Confirm at least one known flare event in the chosen window (cross-check date against NOAA GOES event list) to validate the data is "alive."
