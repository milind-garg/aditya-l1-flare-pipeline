# Evaluation Criteria Mapping & Demo Script

## 1. Mapping Hackathon Evaluation Criteria → What to Show
| Evaluation Criterion | Where it's computed | Where it's shown |
|---|---|---|
| Detection of low- and high-class flares | `src/forecast/evaluate.py` / nowcast validation in Phase 3 | `EvaluationPanel` — per-class recall bar chart (A/B/C/M/X) |
| High TPR, low FAR for predictions | `src/forecast/evaluate.py` | `EvaluationPanel` — TPR/FAR/ROC-AUC cards |
| Lead time of predictions | `src/forecast/evaluate.py` | `EvaluationPanel` — lead time histogram + median/mean stats; also called out live during replay demo when an alert fires before a flare peak |

## 2. Pre-Demo Checklist
- [ ] Pick a specific historical window for the live demo replay that you know contains at least one clear flare (confirmed in Phase 1/3) — never demo on an untested random window.
- [ ] Pre-load `metrics.json` so the Evaluation tab has real numbers, not placeholders.
- [ ] Test the full demo flow once on the exact machine/network you'll present on.
- [ ] Have a fallback: a short screen recording of the working demo, in case live demo fails during presentation.
- [ ] Prepare 2–3 sentences explaining any known limitations honestly (e.g., "SoLEXS flux isn't fully calibrated so we use a relative classification scheme" if that's where you landed) — judges respond well to honest scoping, badly to overclaiming.

## 3. Suggested Demo Script (~4–5 minutes)
1. **(30s) Problem framing**: "Aditya-L1 watches the Sun from L1 using SoLEXS (soft X-ray) and HEL1OS (hard X-ray). Flares disrupt GPS, comms, power grids — we built a pipeline that both detects flares as they happen and predicts them minutes in advance."
2. **(30s) Architecture**: briefly show `02_SYSTEM_ARCHITECTURE.md` diagram or a slide version of it — raw data → nowcast/forecast engines → API → dashboard.
3. **(90s) Live replay demo**: hit Play on the dashboard for your pre-tested window. Narrate: light curves rendering, forecast probability rising as the precursor hard X-ray spike appears, alert banner firing, then the actual flare peak occurring shortly after — point out the lead time in minutes.
4. **(60s) Flare catalogue tab**: show the master catalogue table, point out a couple of different flare classes detected, mention soft+hard fusion logic (hard-only precursor events).
5. **(60s) Evaluation tab**: show TPR/FAR/ROC-AUC and the lead-time distribution — state your actual numbers plainly.
6. **(30s) Close**: limitations + what you'd do with more time (e.g., calibrated flux, LSTM model, true real-time ingestion).

## 4. Questions Judges Are Likely to Ask (prepare answers)
- "Is this real Aditya-L1 data or simulated?" → Real SoLEXS/HEL1OS L1 data from PRADAN for the window of [dates].
- "How do you define a false alarm?" → State your exact definition from `05_FORECASTING_MODEL.md` Section 6.
- "Why gradient boosting and not deep learning?" → Time-boxed hackathon, interpretable baseline, document if you also tried LSTM and how it compared.
- "How would this work in true real-time?" → Replace the replay endpoint with a live PRADAN/ground-station feed polling loop; the nowcast/forecast logic is already written to operate on a rolling window, so it's structurally ready, just not wired to a live feed.
