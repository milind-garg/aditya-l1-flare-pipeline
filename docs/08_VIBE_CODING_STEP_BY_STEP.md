# Vibe Coding Step-by-Step Playbook

This is the master procedure. Follow it in order. Each phase tells you what to ask your AI coding assistant (Claude Code, Cursor, etc.) to do, referencing the other spec `.md` files so the assistant has full context. Keep all `.md` files in a `docs/` folder in your repo and point your AI tool at them at the start of each session.

## Phase 0 — Environment Setup (Day 0, ~1 hour)
1. Follow `07_SETUP_GUIDE_WINDOWS.md` completely. Confirm the smoke test at the end passes.
2. Create the repo folder structure from `02_SYSTEM_ARCHITECTURE.md` Section 3 (empty folders are fine, `git add` a `.gitkeep` if needed).
3. Initialize git, make an initial commit ("scaffold").
4. Put all 10 `.md` files from this set into `docs/` in the repo.

## Phase 1 — Data Acquisition & Exploration (Day 0–1, ~2–4 hours)
1. Register on ISSDC PRADAN, download SoLEXS L1 + HEL1OS L1 for a chosen multi-day window (per `01_DATA_UNDERSTANDING.md`). Place files in `data/raw/solexs/` and `data/raw/hel1os/`.
2. Open a Jupyter notebook (`notebooks/01_explore_solexs.ipynb`). Ask your AI assistant:
   > "Here is a sample SoLEXS L1 file at this path. Write code to open it with astropy.io.fits (or appropriate library), print its structure (extensions, header, columns), and plot the light curve."
3. Repeat for HEL1OS in `notebooks/02_explore_hel1os.ipynb`.
4. Once you know the real column names/units, update `01_DATA_UNDERSTANDING.md`'s data dictionary section (or create a separate `data_dictionary.md`) — feed this back to your AI assistant for every future step so it never has to guess column names.
5. Visually identify at least one obvious flare bump in the plotted light curve — screenshot/note its approximate time for later validation.

## Phase 2 — Ingestion Pipeline (Day 1, ~2–3 hours)
1. Ask your AI assistant, pointing it at `01_DATA_UNDERSTANDING.md` and `02_SYSTEM_ARCHITECTURE.md`:
   > "Write `src/ingest/parse_solexs.py` and `src/ingest/parse_hel1os.py` that parse all raw files in their respective folders into a single pandas DataFrame with columns timestamp, flux (or counts), quality_flag, saved as parquet in data/interim/."
2. Ask for `src/ingest/align_and_merge.py`:
   > "Write a script that loads the two interim parquet files, resamples both to a common cadence, merges them into one DataFrame (timestamp, soft, hard), and saves to data/processed/combined_timeseries.parquet."
3. Run the scripts, inspect the output DataFrame's `.head()`, `.describe()`, and plot it — confirm it visually matches what you saw in Phase 1.

## Phase 3 — Nowcasting Algorithm (Day 1–2, ~3–5 hours)
1. Point your AI assistant at `04_NOWCASTING_ALGORITHM.md` in full.
2. Ask it to implement, one file at a time:
   - `src/nowcast/detect_soft.py` (background estimation + threshold + event segmentation for the soft channel)
   - `src/nowcast/detect_hard.py` (same for hard channel)
   - `src/nowcast/fuse_catalogues.py` (fusion logic producing the master catalogue)
   - A `config/nowcast_config.yaml` with the tunable parameters listed in the spec.
3. Develop and tune this in `notebooks/03_nowcast_dev.ipynb` first — plot detections overlaid on the light curve, adjust `threshold_k` and window sizes until detections visually match real bumps and don't fire on noise.
4. Once tuned, run the pipeline end-to-end as scripts, producing `data/processed/flare_catalogue_master.csv`.
5. Cross-check a couple of detected events' timestamps against the NOAA GOES public flare list for the same dates as a sanity check.

## Phase 4 — Forecasting Model (Day 2, ~4–6 hours)
1. Point your AI assistant at `05_FORECASTING_MODEL.md` in full, plus the now-completed `flare_catalogue_master.csv`.
2. Ask it to implement:
   - `src/forecast/features.py` (sliding-window feature engineering)
   - A labeling function (can live in `features.py` or `train.py`) implementing the "flare within next N minutes" label.
   - `src/forecast/train.py` (time-based train/test split, baseline gradient boosting model, class imbalance handling, saves model artifact)
   - `src/forecast/evaluate.py` (computes TPR, FAR, ROC-AUC, lead-time distribution, per-class recall; writes `metrics.json`)
   - `src/forecast/predict.py` (scores the full time range, saves `forecast_scores.parquet`)
3. Develop/tune in `notebooks/04_forecast_dev.ipynb`. Iterate on features and threshold until lead-time and FAR numbers look reasonable (document whatever you land on — perfect scores aren't expected, a believable, explainable result is).
4. (Only if time remains) Attempt the LSTM stretch goal, compare metrics, decide which model to ship.

## Phase 5 — Backend (Day 2–3, ~3–4 hours)
1. Point your AI assistant at `03_BACKEND_SPEC.md`.
2. Build endpoints **in the suggested order** from that spec: `/api/timeseries` → `/api/flares` → `/api/forecast` → `/api/evaluation` → replay/WebSocket last.
3. After each endpoint, test it manually via `http://localhost:8000/docs` (FastAPI's automatic Swagger UI) before moving to the next.
4. Add CORS middleware early so the frontend isn't blocked once you start wiring it up.

## Phase 6 — Frontend (Day 3, ~4–6 hours)
1. Point your AI assistant at `06_FRONTEND_SPEC.md`.
2. Build **in the suggested order**: scaffold + connectivity check → `LightCurveChart` (static data) → flare overlays → `FlareTable` tab → `ForecastGauge` + `AlertBanner` → `EvaluationPanel` → replay/WebSocket last.
3. After each component, run `npm run dev` and visually confirm before moving on — don't let the AI assistant write five components in a row unverified.

## Phase 7 — Integration Pass (Day 3–4, ~2–3 hours)
1. Click through the whole dashboard end to end as if you were a judge: load light curves, browse the flare table, watch a replay, see an alert fire, check the evaluation tab.
2. Fix any glaring bugs (mismatched timestamps, empty charts on edge dates, crashing on missing data) — ask your AI assistant to add basic error handling / loading states to every API call in the frontend.
3. Write the `README.md` (problem statement summary, architecture diagram, how to run backend+frontend, screenshots).

## Phase 8 — Evaluation & Demo Prep (Day 4, ~2 hours)
1. Follow `09_EVALUATION_AND_DEMO.md` fully.
2. Rehearse the demo at least twice, timed.

## General "Vibe Coding" Tips for This Project
- **Always give the AI assistant the relevant `.md` spec file as context** before asking it to build that piece — don't rely on it remembering earlier conversation turns across days.
- **Build and verify in small slices** (one script, one endpoint, one component at a time) rather than asking for "the whole backend" in one shot — this project has too many moving parts (real astronomy data + ML + API + UI) to debug in one giant unverified chunk.
- **Validate against visuals constantly** — at every stage (raw data, nowcast detections, forecast scores) plot it and eyeball it before building the next layer on top. Bad data silently flowing into a trained model is the single biggest risk in this project.
- **Keep tunable parameters in config files**, not hardcoded — you will be retuning thresholds until the last hour.
- **Commit to git after every working phase** so you can always roll back if an AI-generated change breaks something that was working.
- **If PRADAN data turns out hard to parse** (undocumented format quirks), don't burn more than ~2 hours stuck on Phase 1 before asking your AI assistant to help you brute-force inspect the binary/file structure (e.g., `astropy.io.fits.info()`, raw hex dump for unknown formats) — getting unblocked matters more than elegance at that stage.
