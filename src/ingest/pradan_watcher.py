"""Mock PRADAN Portal Watcher: Simulates telemetry API polling & automatic pipeline ingestion."""

from pathlib import Path
import shutil
import datetime
from src.ingest.pipeline import run_pipeline

# Log path for tracking ingestion runs
INGESTION_LOG_PATH = Path("data/processed/ingestion_status.json")


def poll_pradan_api(force_new_data: bool = True) -> dict:
    """Queries the simulated ISSDC PRADAN portal API for new Level-1 telemetry.
    
    If force_new_data is True, it simulates the publication of a new orbit ZIP
    archive by duplicating the latest telemetry file and renaming it to a newer date,
    then automatically triggers the alignment & forecasting pipeline.
    
    Returns:
        dict: Summary status of the polling and ingestion process.
    """
    print("Polling ISSDC PRADAN portal API...")
    
    solexs_dir = Path("data/raw/solexs")
    hel1os_dir = Path("data/raw/hel1os")
    
    if not solexs_dir.exists() or not hel1os_dir.exists():
        return {
            "success": False,
            "new_data_found": False,
            "error": "Raw directories do not exist",
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }
        
    solexs_zips = sorted(solexs_dir.glob("*.zip"))
    hel1os_zips = sorted(hel1os_dir.glob("*.zip"))
    
    if not solexs_zips or not hel1os_zips:
        return {
            "success": False,
            "new_data_found": False,
            "error": "No baseline telemetry ZIP files found to simulate polling",
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
        }

    status = {
        "success": True,
        "new_data_found": False,
        "downloaded_files": [],
        "pipeline_status": None,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat()
    }

    # Simulate a new telemetry release (e.g. next day/orbit)
    if force_new_data:
        # Check if we have already generated a simulated ZIP to avoid duplicates
        latest_slx_name = solexs_zips[-1].name
        latest_h1s_name = hel1os_zips[-1].name
        
        simulated_slx_name = "AL1_SLX_L1_20250101_v1.0.zip"
        simulated_h1s_name = "AL1_H1S_L1_20250101_v1.0.zip"
        
        # If the latest file is already our simulated 2025 file, we simulate another one (e.g., 20250102)
        if latest_slx_name == simulated_slx_name:
            simulated_slx_name = "AL1_SLX_L1_20250102_v1.0.zip"
            simulated_h1s_name = "AL1_H1S_L1_20250102_v1.0.zip"
            
        new_slx_path = solexs_dir / simulated_slx_name
        new_h1s_path = hel1os_dir / simulated_h1s_name
        
        if not new_slx_path.exists():
            print(f"New telemetry detected: {simulated_slx_name}")
            print(f"Downloading from PRADAN portal...")
            
            # Simulate download by copying the last available file
            shutil.copy(solexs_zips[-1], new_slx_path)
            shutil.copy(hel1os_zips[-1], new_h1s_path)
            
            status["new_data_found"] = True
            status["downloaded_files"] = [simulated_slx_name, simulated_h1s_name]
            
            # Automatically run the pipeline to parse, merge, and forecast
            print("Triggering end-to-end ingestion & forecasting pipeline...")
            pipeline_result = run_pipeline()
            status["pipeline_status"] = pipeline_result
            
            # Save status log
            import json
            INGESTION_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
            with open(INGESTION_LOG_PATH, "w") as f:
                json.dump({
                    "last_sync_timestamp": status["timestamp"],
                    "new_data_found": True,
                    "downloaded_files": status["downloaded_files"],
                    "pipeline_success": pipeline_result["success"]
                }, f, indent=2)
                
            print(f"ISSDC PRADAN Sync successful. Processed {simulated_slx_name}.")
        else:
            print("ISSDC PRADAN portal queried: Telemetry is up to date (no new orbits published).")
    else:
        print("ISSDC PRADAN portal queried: Telemetry is up to date (no new orbits published).")
        
    return status


if __name__ == "__main__":
    # Test watcher by forcing new simulated data
    poll_pradan_api(force_new_data=True)
