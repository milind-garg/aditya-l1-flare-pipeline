# Nowcasting Algorithm Specification

## 1. Goal
Detect and classify flares as they appear in the combined soft + hard X-ray light curve, producing a "master catalogue" — independently detect in each channel, then fuse.

## 2. Step-by-Step Algorithm

### 2.1 Per-channel detection (run separately on soft, then on hard)
1. **Background estimation**: compute a rolling median/percentile (e.g., 10th percentile over a trailing 1–3 hour window) as the "quiet Sun" background level. This adapts to the slowly varying background instead of using a single global threshold.
2. **Excess signal**: `excess(t) = flux(t) - background(t)`.
3. **Thresholding**: flag `t` as "elevated" when `excess(t) > k * rolling_std(t)` (start with k≈3–5, tune empirically) AND `flux(t)` exceeds a minimum absolute floor (avoids flagging noise during very quiet periods).
4. **Event segmentation**: group consecutive elevated timestamps into candidate events; merge events separated by short gaps (< e.g. 2 minutes) since flares can have brief dips mid-rise.
5. **Peak/start/end identification** per candidate event:
   - `start` = first time excess crosses threshold going up
   - `peak` = time of maximum flux within the event
   - `end` = first time after peak that flux decays back to within some margin of background (e.g., 50% decay, standard solar-flare convention) or returns below threshold
6. **Minimum duration filter**: discard candidates shorter than ~1 minute (likely noise spikes) unless hard X-ray confirms (see fusion).
7. **Classification** (soft channel only, using GOES-style table from `01_DATA_UNDERSTANDING.md`): map `peak_value` to class letter+number, if flux is calibrated; otherwise use the relative/percentile-based class with a clear label.

### 2.2 Fusion logic (combine soft catalogue + hard catalogue → master catalogue)
- For each soft-detected event, check whether a hard X-ray elevated event overlaps in time (within some tolerance, e.g., ±2 minutes of the soft event start) — if yes, mark `source = "soft+hard"` and boost `confidence`; if only soft, `source = "soft_only"`.
- For hard-only events with no soft counterpart (impulsive hard X-ray bursts not yet reflected in soft channel) — these are valuable "early-warning" signals; keep them in the master catalogue tagged `source = "hard_only"` and flag as candidate precursors (feed into forecasting features, see `05_FORECASTING_MODEL.md`).
- Deduplicate near-identical overlapping events into single master entries, keeping the union of start/end and the soft-channel-derived class if available.

### 2.3 Output
`flare_catalogue_master.csv` with columns: `id, start, peak, end, class, peak_value, source, confidence`.

## 3. Validation Approach
- Visually overlay detected events on the light curve plot (in the exploration notebook) for the chosen data window and manually confirm they line up with visible bumps.
- Cross-check timestamps against NOAA GOES public flare event list for the same dates as an independent sanity check (not as ground truth for grading, just for confidence).
- Report per-class recall using whatever labeled events you can confirm (manually annotated from GOES list if SoLEXS isn't flux-calibrated).

## 4. Tuning Parameters to Expose (put these in a config file, not hardcoded)
```yaml
nowcast:
  background_window_minutes: 120
  background_percentile: 10
  threshold_k_soft: 4.0
  threshold_k_hard: 4.0
  min_event_duration_minutes: 1
  merge_gap_minutes: 2
  fusion_tolerance_minutes: 2
```
Exposing these as config lets you retune live during development without code edits — important when you don't yet know SoLEXS/HEL1OS noise characteristics.

## 5. Build Order
1. Implement background + threshold detection for soft channel only; validate visually.
2. Repeat for hard channel.
3. Implement fusion logic.
4. Wire into `src/nowcast/fuse_catalogues.py` producing the final CSV.
5. Only then move to classification refinement (calibration vs relative class).
