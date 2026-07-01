# Frontend Specification (React Dashboard)

## 1. Purpose
Visualize the soft/hard X-ray light curves, overlay nowcasted flare detections, show live forecast probability, and trigger visual alerts — directly fulfilling the "Interface" expected outcome.

## 2. Pages / Layout
Single-page dashboard with tabs (or sections on one scroll page for simplicity):

### Tab 1 — Live/Replay Monitor (main view)
- **LightCurveChart**: dual-axis or stacked line chart, soft X-ray (top) and hard X-ray (bottom), shared time axis. Shaded/marked regions for detected flares (color-coded by class: A/B grey, C yellow, M orange, X red).
- **AlertBanner**: prominent banner at top that turns active (color + animation) when `forecast.alert = true`, showing "Flare likely in next N minutes — probability XX%".
- **ForecastGauge**: simple gauge/progress bar showing current forecast probability (0–100%) for the 15-min and 30-min horizons side by side.
- **Replay controls**: Play / Pause / Speed (1x/10x/60x) buttons that drive the simulated real-time feed via the WebSocket/replay endpoint.

### Tab 2 — Flare Catalogue
- **FlareTable**: sortable/filterable table of all detected flares (id, start, peak, end, class, source, confidence) from `GET /api/flares`. Clicking a row scrolls/zooms the Tab 1 chart to that event.

### Tab 3 — Evaluation / Model Performance
- **EvaluationPanel**: cards/charts for TPR, FAR, ROC-AUC, lead time distribution (histogram), and per-class detection recall bar chart — pulled from `GET /api/evaluation`. This tab exists specifically to make the "Evaluation Criteria" from the problem statement visible to judges without digging through notebooks.

## 3. Component List & Responsibilities
| Component | Responsibility |
|---|---|
| `App.tsx` | Tab routing, global layout |
| `api/client.ts` | Typed fetch wrappers for all backend endpoints (`getTimeseries`, `getFlares`, `getForecast`, `getEvaluation`, WebSocket connector) |
| `LightCurveChart.tsx` | Renders soft+hard series with flare overlays (Recharts `ComposedChart` or Plotly) |
| `FlareTable.tsx` | Table with class color badges, sort/filter |
| `ForecastGauge.tsx` | Probability gauge(s), color thresholds (green <30%, yellow 30–60%, red >60%) |
| `AlertBanner.tsx` | Conditional render based on alert state, with lead-time text once known retrospectively in replay mode |
| `EvaluationPanel.tsx` | Metric cards + small charts |
| `ReplayControls.tsx` | Play/pause/speed buttons, talks to replay/WebSocket endpoint |

## 4. State Management
- Keep it simple: React `useState`/`useEffect` + a small custom hook (`useReplayStream`) wrapping the WebSocket connection. No need for Redux/Zustand at hackathon scale.

## 5. Styling
- Use plain CSS or a lightweight utility approach (Tailwind is fine if you want speed — `npm create vite@latest` then add Tailwind). Keep visual design simple, dark-themed "mission control" aesthetic works well thematically (space weather monitoring) but isn't required — clarity beats polish under time pressure.

## 6. Build Order
1. Scaffold Vite React TS app, get a "Hello World" served and confirm it can fetch from the FastAPI backend (CORS working).
2. Build `LightCurveChart` against `GET /api/timeseries` with static historical data (no replay yet) — get the core visualization right first.
3. Add flare overlays from `GET /api/flares`.
4. Add `FlareTable` tab.
5. Add `ForecastGauge` + `AlertBanner` against `GET /api/forecast` (static range first).
6. Add `EvaluationPanel`.
7. Add replay/WebSocket live-simulation last, once everything works in "static historical range" mode — this is the riskiest, most complex piece and should not block the rest of the demo if it runs out of time.
