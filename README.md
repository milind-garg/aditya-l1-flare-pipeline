# Aditya-L1 Solar Flare Pipeline

> **Bharatiya Antariksh Hackathon 2026 — Problem Statement 15**
> *Forecasting and Nowcasting of Solar Flares using combined Soft and Hard X-ray data from Aditya-L1*

---

## Overview

This project implements a fully automated end-to-end pipeline for **real-time nowcasting** and **predictive forecasting** of solar flares using combined time-series data from two Aditya-L1 payloads:

| Payload | Instrument | Band | Role |
|---------|-----------|------|------|
| **SoLEXS** | Solar Low Energy X-ray Spectrometer | 0.1-0.8 nm (soft X-rays) | Flare classification (B/C/M/X) |
| **HEL1OS** | High Energy L1 Orbiting X-ray Spectrometer | 10-150 keV (hard X-rays) | Precursor detection |

The key scientific insight exploited here is that **hard X-ray emission often precedes the soft X-ray peak** - these hard-only bursts are treated as precursor candidates and used as a forecasting feature.

---

## Results

### Nowcasting (Detection)

| Flare Class | Events Detected | Recall |
|-------------|----------------|--------|
| B-Class | 6 | 16.7%* |
| C-Class | 2 | 100% |
| M-Class | 4 | 100% |
| X-Class | 2 | 100% |
| **Hard-only (Precursors)** | **16** | - |

*B-class events are near the background noise floor; lower recall is expected.

### Forecasting (XGBoost Model)

| Metric | Value |
|--------|-------|
| **True Positive Rate (TPR)** | **85.4%** |
| **False Alarm Rate (FAR)** | **10.9%** |
| **ROC-AUC** | **0.966** |
| **Median Lead Time** | **15 min** |
| **Mean Lead Time** | 13.3 min |
| **Max Lead Time** | 36.7 min |

---

## Pipeline Architecture

`
SoLEXS Level-1 FITS ZIPs  -->  parse_solexs.py
HEL1OS Level-1 FITS ZIPs  -->  parse_hel1os.py
                            -->  align_and_merge.py (10s cadence)
                                        |
               +-----------------------+------------------------+
               v                                                v
    NOWCASTING LAYER                              FORECASTING LAYER
    detect_soft.py  (B/C/M/X class.)             features.py (50+ features)
    detect_hard.py  (impulsive bursts)            train.py    (XGBoost)
    fuse_catalogues.py -> master CSV              predict.py  (15/30 min)
                                                  evaluate.py (TPR/FAR/ROC)
                                        |
                                 FastAPI Backend
                           GET /api/timeseries | /flares | /forecast | /evaluation
                           WS  /api/ws/replay (real-time streaming)
                                        |
                              React Dashboard
                         Monitor | Catalogue | Evaluation
`

---

## Key Scientific Features

### Precursor Detection (Hard-Only Events)
Hard X-ray emission during the impulsive phase often **precedes** soft X-ray emission because:
- Hard X-rays are produced by non-thermal electron beams (bremsstrahlung)
- Soft X-rays require thermal plasma heating (slower process)

The pipeline captures this as source = "hard_only" events, highlighted as **Precursor Candidates** in the UI. The binary feature hard_only_event_in_last_1h is the single most predictive feature in the XGBoost model.

### Dual-Instrument Fusion
Events confirmed in both instruments (soft+hard) receive higher confidence scores. Fusion tolerance: 2 minutes.

---

## Installation

### Prerequisites
- Python 3.11+ with venv
- Node.js 18+

### 1. Install Dependencies
`ash
pip install -r requirements.txt
cd frontend && npm install
`

### 2. Start the Backend
`ash
venv\Scripts\uvicorn.exe backend.main:app --reload --port 8000
`

### 3. Start the Frontend
`ash
cd frontend && npm run dev
`
Open http://localhost:5173

---

## Data Preparation

### Option A: Pre-processed data (demo-ready)
Data in data/processed/ is already generated from Aditya-L1 observations (Sept-Dec 2024).

### Option B: Process raw ISSDC data
`ash
# Download SoLEXS and HEL1OS Level-1 ZIPs from ISSDC PRADAN portal
# Place in data/raw/solexs/ and data/raw/hel1os/

python -m src.ingest.parse_solexs
python -m src.ingest.parse_hel1os
python -m src.ingest.align_and_merge
python -m src.nowcast.detect_soft
python -m src.nowcast.detect_hard
python -m src.nowcast.fuse_catalogues
python -m src.forecast.predict
python -m src.forecast.evaluate
`

### Option C: Synthetic data
`ash
python scripts/generate_sample_data.py
`

---

## Detection Algorithm

`
Background = rolling_percentile(window=120min, percentile=10)
Threshold  = Background + k x rolling_std(window=120min),  k=4.0

Event detected when:
  flux > Threshold  AND  flux > min_absolute_flux

Flare class (soft X-rays, calibrated to background percentiles):
  B-class: < 90th pct | C-class: 90-95th pct
  M-class: 95-99th pct | X-class: > 99th pct | X+: > 99.9th pct
`

## Forecasting Features (50+ total)

- Rolling statistics (5/15/30-min windows): mean, std, max, ROC for soft and hard
- hard_leads_soft = ROC(hard) - ROC(soft): positive when hard rises before soft
- hard_only_event_in_last_1h: **key precursor binary flag**
- 	ime_since_last_flare_minutes: flare history context

---

## Project Structure

`
aditya-l1-flare-pipeline/
+-- src/
|   +-- ingest/          # parse_solexs.py, parse_hel1os.py, align_and_merge.py
|   +-- nowcast/         # detect_soft.py, detect_hard.py, fuse_catalogues.py
|   +-- forecast/        # features.py, train.py, predict.py, evaluate.py
+-- backend/             # FastAPI app + routers
+-- frontend/            # React dashboard
+-- config/              # nowcast_config.yaml
+-- data/processed/      # combined_timeseries, master catalogue, forecast scores
+-- models/              # Trained XGBoost pkl files
`

---

## API Reference

| Endpoint | Parameters | Description |
|----------|-----------|-------------|
| GET /api/timeseries | start, end, resolution | X-ray light curves |
| GET /api/flares | start, end, min_class | Flare catalogue |
| GET /api/forecast | start, end | 15-min and 30-min probabilities |
| GET /api/evaluation | - | TPR, FAR, ROC-AUC, lead time |
| WS /api/ws/replay | start, end, speed | Real-time streaming (1x/10x/60x) |
| GET /docs | - | Interactive Swagger UI |

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Data processing | Python, pandas, numpy, astropy |
| FITS I/O | astropy.io.fits |
| ML model | XGBoost 3.2, scikit-learn |
| Backend API | FastAPI 0.138, uvicorn |
| Frontend | React 18, TypeScript, Vite, Recharts |

---

**Bharatiya Antariksh Hackathon 2026 - Problem Statement 15**
