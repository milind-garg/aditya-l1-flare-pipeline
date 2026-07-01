# Backend Specification (FastAPI)

## 1. Purpose
Serve processed time series, the flare catalogue, and forecast scores to the React frontend, and provide a "replay" stream that simulates real-time monitoring for the demo.

## 2. Endpoints

### `GET /api/timeseries`
Query params: `start` (ISO datetime), `end` (ISO datetime), `resolution` (optional, e.g. `1s`, `10s`, `1min` for downsampling on long ranges).
Response:
```json
{
  "timestamps": ["2026-03-01T00:00:00Z", "..."],
  "soft": [123.4, 125.0, "..."],
  "hard": [4.1, 4.3, "..."]
}
```

### `GET /api/flares`
Query params: `start`, `end`, `min_class` (optional, e.g. "C" to filter out A/B).
Response: list of flare objects:
```json
[
  {
    "id": "flare_0001",
    "start": "2026-03-01T03:12:00Z",
    "peak": "2026-03-01T03:18:00Z",
    "end": "2026-03-01T03:29:00Z",
    "class": "C4.2",
    "peak_value": 4.2e-6,
    "source": "soft+hard",
    "confidence": 0.93
  }
]
```

### `GET /api/forecast`
Query params: `at` (timestamp to score "now" against), or `start`/`end` for a precomputed range.
Response:
```json
{
  "timestamps": ["..."],
  "probability": [0.02, 0.05, 0.41, "..."],
  "lead_time_minutes": 12,
  "alert": true
}
```

### `GET /api/replay/start` and `GET /api/replay/stream` (or a WebSocket `/ws/replay`)
- Starts a simulated real-time playback of a historical window at configurable speed (e.g., 60x) so the frontend can show "live" detection and alerts during the demo.
- WebSocket is the cleaner option: push `{timestamp, soft, hard, flare_event?, forecast_probability}` messages at intervals.

### `GET /api/evaluation`
Response: precomputed metrics for the Evaluation tab:
```json
{
  "detection": {"A": {"recall": 0.7}, "B": {"recall": 0.85}, "C": {"recall": 0.95}, "M": {"recall": 1.0}, "X": {"recall": 1.0}},
  "forecast": {"tpr": 0.88, "far": 0.06, "roc_auc": 0.91, "lead_time_minutes": {"median": 9, "mean": 10.5, "min": 2, "max": 22}}
}
```

## 3. Implementation Notes
- Use Pydantic models in `schemas.py` for all response shapes above.
- Load processed parquet files once at startup into memory (pandas), not per-request, for a snappy demo — the dataset is small enough (a few days of light curve data).
- Use `fastapi.middleware.cors.CORSMiddleware` to allow the Vite dev server origin (`http://localhost:5173`) during development.
- Keep all heavy ML training **out** of the backend — the backend only loads pre-trained model artifacts and pre-computed catalogues/scores produced by the `src/` pipeline. This avoids retraining-on-request bugs derailing the demo.

## 4. Suggested Build Order (within backend work)
1. `GET /api/timeseries` against the processed parquet — get a chart rendering end to end first.
2. `GET /api/flares` against the master catalogue CSV.
3. `GET /api/forecast` against precomputed `forecast_scores.parquet`.
4. `GET /api/evaluation` against a small `metrics.json` produced by `src/forecast/evaluate.py`.
5. Replay/WebSocket endpoint last, since it's the most complex and only needed for the "live demo" effect.
