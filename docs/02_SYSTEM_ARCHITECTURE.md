# System Architecture

## 1. High-Level Architecture
```
                +-------------------------+
                |   PRADAN raw files       |
                |  (SoLEXS L1, HEL1OS L1)  |
                +------------+-------------+
                             |
                     [ingest/parse scripts]
                             v
                +-------------------------+
                |  data/processed/*.parquet|
                |  combined_timeseries     |
                +------------+-------------+
                             |
              +--------------+---------------+
              v                               v
  +-------------------------+      +---------------------------+
  | Nowcasting Engine        |      | Forecasting Engine        |
  | (rule-based + stats      |      | (ML/DL time-series model) |
  |  peak detection per      |      | sliding-window features ->|
  |  channel + fusion logic) |      | P(flare in next N min)    |
  +------------+--------------+     +-------------+--------------+
               v                                  v
        flare_catalogue.csv              forecast_scores.parquet
               \                                  /
                \                                /
                 v                              v
              +-------------------------------------+
              |        FastAPI Backend (Python)       |
              |  - /timeseries  - /flares  - /forecast|
              |  - /replay (simulated real-time feed) |
              +--------------------+------------------+
                                   |
                                   v
                   +-------------------------------+
                   |   React Frontend (Vite + TS)   |
                   |   - Light curve charts          |
                   |   - Flare markers / table        |
                   |   - Forecast probability gauge   |
                   |   - Alert banner (visual)        |
                   |   - Evaluation/metrics tab        |
                   +-------------------------------+
```

## 2. Tech Stack
| Layer | Choice | Notes |
|---|---|---|
| Data parsing | Python, `astropy` (FITS) or `spacepy`/`cdflib` (CDF), `pandas`, `numpy` | Confirm format first (see `01_DATA_UNDERSTANDING.md`) |
| Nowcasting | Python — `scipy.signal` (peak detection), custom rule engine | No heavy ML required, must be explainable |
| Forecasting | Python — `scikit-learn` (baseline: gradient boosting on engineered features) + optionally `PyTorch` (LSTM/GRU) for stretch goal | Start with the simpler model; only add deep learning if time allows |
| Backend API | **FastAPI** + `uvicorn` | Serves processed data + model outputs to frontend; no need to retrain on each request |
| Storage | **SQLite** (simplest for hackathon) via SQLAlchemy, or just Parquet/CSV files served directly | Use SQLite only if you want a "database" deliverable to look authentic; flat files are fine technically |
| Frontend | **React + Vite + TypeScript**, charting via `Recharts` or `Plotly.js` | Use Recharts for simplicity, Plotly if you want zoom/pan on long time series |
| Dev tooling | `venv`/`conda`, `npm`, Git | Windows-specific setup in `07_SETUP_GUIDE_WINDOWS.md` |

## 3. Repository Structure
```
aditya-l1-flare-pipeline/
  data/
    raw/solexs/  raw/hel1os/
    interim/
    processed/
  notebooks/
    01_explore_solexs.ipynb
    02_explore_hel1os.ipynb
    03_nowcast_dev.ipynb
    04_forecast_dev.ipynb
  src/
    ingest/
      parse_solexs.py
      parse_hel1os.py
      align_and_merge.py
    nowcast/
      detect_soft.py
      detect_hard.py
      fuse_catalogues.py
    forecast/
      features.py
      train.py
      predict.py
      evaluate.py
    db/
      models.py
      init_db.py
  backend/
    main.py            <- FastAPI app
    routers/
      timeseries.py
      flares.py
      forecast.py
      replay.py
    schemas.py
  frontend/
    (Vite React app — created via npm create vite@latest)
    src/
      components/
        LightCurveChart.tsx
        FlareTable.tsx
        ForecastGauge.tsx
        AlertBanner.tsx
        EvaluationPanel.tsx
      api/
        client.ts
      App.tsx
  docs/
    (all the .md files from this set live here)
  README.md
  requirements.txt
  .env.example
```

## 4. Data Flow Summary (for the README and for the AI assistant building this)
1. Raw files → parsed into pandas DataFrames with a uniform schema: `timestamp (UTC), soft_flux (or counts), hard_flux (or counts), quality_flag`.
2. Parsed DataFrames → resampled to common cadence → merged → saved as `combined_timeseries.parquet`.
3. Nowcasting engine reads `combined_timeseries.parquet` → outputs `flare_catalogue_master.csv` (one row per detected flare).
4. Forecasting engine reads `combined_timeseries.parquet` (+ optionally the catalogue as labels) → trains a model → produces `forecast_scores.parquet` (rolling probability per timestamp) and a saved model file (`.pkl`/`.pt`).
5. Backend loads the processed/ files (and model for live inference if doing true on-the-fly scoring) and exposes REST endpoints.
6. Frontend polls/fetches from backend and renders charts + alerts; a "replay" endpoint streams historical data at accelerated speed to simulate real-time monitoring for the demo.

## 5. Why This Architecture
- Keeps **data science work** (notebooks/src) decoupled from the **serving layer** (backend) and **presentation layer** (frontend) — you can develop and validate the algorithms entirely offline before wiring up any UI, which is the safest order for a time-boxed hackathon.
- The "replay" endpoint is the key trick for demoing "nowcasting" and "forecast lead time" convincingly without needing a live ISRO feed.
