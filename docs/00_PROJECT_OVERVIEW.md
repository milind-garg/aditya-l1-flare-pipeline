# Project Overview — Solar Flare Nowcasting & Forecasting using Aditya-L1 (SoLEXS + HEL1OS)

## 1. Problem Statement (Restated)
Build an automated pipeline that uses combined soft X-ray (SoLEXS) and hard X-ray (HEL1OS) time-series light curve data from ISRO's Aditya-L1 mission to:

1. **Nowcast** — detect and classify solar flares in (near) real time as they happen in the data stream.
2. **Forecast** — predict the probability of a flare occurring in the next N minutes, using precursor patterns in the light curves, with a quantifiable lead time.

## 2. Scope for This Hackathon
- Both nowcasting and forecasting will be built fully (not just one).
- Stack: Python backend (FastAPI) + React frontend, full web app with live-style visualization and alerting.
- Primary data: real SoLEXS Level-1 and HEL1OS Level-1 data from ISSDC PRADAN portal. No GOES fallback is planned — all engineering should assume real Aditya-L1 files.

## 3. Final Deliverables (map directly to "Expected Outcomes")
| # | Deliverable | What it means concretely |
|---|---|---|
| 1 | Automated flare database | A SQLite/Postgres table (or CSV/JSON catalogue) of detected flares with start/peak/end time, class (A/B/C/M/X), peak flux, source (soft/hard/combined) |
| 2 | Forecasting model | A trained time-series model (e.g., LSTM/GRU/Transformer or gradient-boosted features) that outputs P(flare in next N minutes), with backtested lead time stats |
| 3 | Interface | React dashboard showing live/replayed light curves (soft + hard X-ray), overlaid flare detections, and a forecast probability panel with visual alert banners |

## 4. Evaluation Criteria → What We Must Be Able to Show
1. **Detection quality across flare classes** (low: A/B/C, high: M/X) — confusion matrix / per-class recall.
2. **High True Positive Rate, low False Alarm Rate for predictions** — precision/recall/F1 + ROC-AUC for the forecasting model.
3. **Lead time** — minutes between alert trigger time and actual flare peak time, reported as a distribution (median, mean, min/max) per flare class.

## 5. Definition of "Done" for the Hackathon Demo
- [ ] Real SoLEXS + HEL1OS data downloaded and parsed for at least one multi-day window containing several flares (mix of classes if possible).
- [ ] Nowcasting algorithm runs over historical data and produces a master flare catalogue (soft catalogue + hard catalogue + merged catalogue).
- [ ] Forecasting model trained and backtested, producing lead-time and FAR/TPR metrics.
- [ ] React dashboard can replay a time window ("simulated real-time") showing light curves, flare markers, and forecast alerts.
- [ ] All metrics (Section 4) are computed and visible in a results notebook or in the dashboard's "Evaluation" tab.
- [ ] A 3–5 minute demo script exists (see `09_EVALUATION_AND_DEMO.md`).

## 6. Non-Goals (explicitly out of scope, say so if judges ask)
- Physics-based flare prediction (magnetogram/active-region modeling) — we are purely light-curve/time-series driven.
- True real-time ingestion from ISRO ground systems — we simulate real-time by replaying historical data at accelerated speed.
- Multi-mission data fusion (e.g., GOES, RHESSI) beyond optional sanity-check comparisons.

## 7. How to Use This Document Set
Read in this order when building with an AI coding assistant ("vibe coding"):
1. `00_PROJECT_OVERVIEW.md` (this file)
2. `01_DATA_UNDERSTANDING.md`
3. `02_SYSTEM_ARCHITECTURE.md`
4. `07_SETUP_GUIDE_WINDOWS.md`
5. `08_VIBE_CODING_STEP_BY_STEP.md` ← the actual build playbook, step by step
6. `03_BACKEND_SPEC.md`, `04_NOWCASTING_ALGORITHM.md`, `05_FORECASTING_MODEL.md`, `06_FRONTEND_SPEC.md` (referenced during the relevant build phases)
7. `09_EVALUATION_AND_DEMO.md` (at the end, for polishing + demo)
