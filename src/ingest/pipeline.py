"""Pipeline orchestrator: runs ingestion, alignment, forecasting, and evaluation in sequence."""

from pathlib import Path
import time
from src.ingest.parse_solexs import parse_all_solexs
from src.ingest.parse_hel1os import parse_all_hel1os
from src.ingest.align_and_merge import align_and_merge
from src.forecast.predict import predict_full_range
from src.forecast.evaluate import evaluate_model


def run_pipeline() -> dict:
    """Executes the entire solar flare forecasting ingestion and inference pipeline.
    
    Returns:
        dict: A summary status of the pipeline run.
    """
    start_time = time.time()
    print("=== STARTING ADITYA-L1 TELEMETRY PIPELINE ===")

    raw_solexs_dir = Path("data/raw/solexs")
    raw_hel1os_dir = Path("data/raw/hel1os")
    
    interim_solexs = Path("data/interim/solexs_parsed.parquet")
    interim_hel1os = Path("data/interim/hel1os_parsed.parquet")
    
    processed_combined = Path("data/processed/combined_timeseries.parquet")
    
    status = {"success": False, "steps": {}, "error": None}
    
    try:
        # Step 1: Parse SoLEXS ZIPs
        print("\n[Step 1/5] Ingesting & parsing SoLEXS Level-1 light curves...")
        solexs_df = parse_all_solexs(raw_solexs_dir, interim_solexs)
        status["steps"]["parse_solexs"] = {
            "success": True, 
            "count": len(solexs_df),
            "range": f"{solexs_df['timestamp'].min()} to {solexs_df['timestamp'].max()}"
        }

        # Step 2: Parse HEL1OS ZIPs
        print("\n[Step 2/5] Ingesting & parsing HEL1OS Level-1 light curves...")
        hel1os_df = parse_all_hel1os(raw_hel1os_dir, interim_hel1os)
        status["steps"]["parse_hel1os"] = {
            "success": True, 
            "count": len(hel1os_df),
            "range": f"{hel1os_df['timestamp'].min()} to {hel1os_df['timestamp'].max()}"
        }

        # Step 3: Align, Resample & Interpolate (GPR gap filling)
        print("\n[Step 3/5] Resampling to 10s cadence & running GPR gap interpolation...")
        merged_df = align_and_merge(interim_solexs, interim_hel1os, processed_combined)
        status["steps"]["align_and_merge"] = {
            "success": True,
            "count": len(merged_df),
            "range": f"{merged_df['timestamp'].min()} to {merged_df['timestamp'].max()}"
        }

        # Step 4: Run Multi-Task LSTM Forecasting
        print("\n[Step 4/5] Running Multi-Task LSTM model inference...")
        scores_df = predict_full_range()
        status["steps"]["forecast"] = {
            "success": True,
            "alerts_15min": int(scores_df["alert_15min"].sum()),
            "alerts_30min": int(scores_df["alert_30min"].sum())
        }

        # Step 5: Update Evaluation Metrics
        print("\n[Step 5/5] Re-evaluating pipeline performance metrics...")
        metrics = evaluate_model()
        status["steps"]["evaluation"] = {
            "success": True,
            "roc_auc": float(metrics["forecast"]["roc_auc"]),
            "recall": float(metrics["detection"].get("X", {}).get("recall", 0.0))
        }

        # Clear backend cache if running within server context
        try:
            from backend.routers import forecast, timeseries, flares, evaluation
            forecast._forecast_cache = None
            timeseries._timeseries_cache = None
            flares._flares_cache = None
            evaluation._metrics_cache = None
            print("\n[Cache] Backend router memory caches cleared.")
        except ImportError:
            pass

        duration = time.time() - start_time
        status["success"] = True
        status["duration_seconds"] = round(duration, 2)
        print(f"\n=== PIPELINE COMPLETED SUCCESSFULLY IN {status['duration_seconds']}s ===")

    except Exception as e:
        status["error"] = str(e)
        print(f"\n!!! PIPELINE FAILED: {e} !!!")
        
    return status


if __name__ == "__main__":
    run_pipeline()
