from fastapi import APIRouter, Query, HTTPException
from datetime import datetime
from pathlib import Path
import pandas as pd

from backend.schemas import ForecastResponse

router = APIRouter()

FORECAST_PATH = Path("data/processed/forecast_scores.parquet")
_forecast_cache = None


def load_forecast():
    global _forecast_cache
    if _forecast_cache is not None:
        return _forecast_cache
    if not FORECAST_PATH.exists():
        return pd.DataFrame(columns=[
            "timestamp", "probability_15min", "probability_30min", "alert_15min", "alert_30min"
        ])
    df = pd.read_parquet(FORECAST_PATH)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    _forecast_cache = df
    return df


@router.get("/forecast", response_model=ForecastResponse)
async def get_forecast(
    start: datetime = Query(..., description="Start timestamp (ISO format)"),
    end: datetime = Query(..., description="End timestamp (ISO format)"),
):
    df = load_forecast()
    if df.empty:
        return ForecastResponse(
            timestamps=[],
            probability_15min=[],
            probability_30min=[],
            alert_15min=[],
            alert_30min=[],
            lead_time_minutes=15,
        )

    mask = (df["timestamp"] >= start) & (df["timestamp"] <= end)
    filtered = df.loc[mask].copy()

    if filtered.empty:
        return ForecastResponse(
            timestamps=[],
            probability_15min=[],
            probability_30min=[],
            alert_15min=[],
            alert_30min=[],
            lead_time_minutes=15,
        )

    return ForecastResponse(
        timestamps=filtered["timestamp"].tolist(),
        probability_15min=filtered["probability_15min"].tolist(),
        probability_30min=filtered["probability_30min"].tolist(),
        alert_15min=filtered["alert_15min"].tolist() if "alert_15min" in filtered.columns else [],
        alert_30min=filtered["alert_30min"].tolist() if "alert_30min" in filtered.columns else [],
        lead_time_minutes=15,
    )


@router.post("/ingest/poll")
async def poll_ingest():
    """Trigger simulated ISSDC PRADAN portal ingestion."""
    try:
        from src.ingest.pradan_watcher import poll_pradan_api
        status = poll_pradan_api(force_new_data=True)
        
        # Clear timeseries, flares, and forecast memory caches
        from backend.routers import timeseries, flares
        global _forecast_cache
        _forecast_cache = None
        timeseries._timeseries_cache = None
        flares._flares_cache = None
        
        # Reload caches immediately
        timeseries.load_timeseries()
        flares.load_flares()
        load_forecast()
        
        return status
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ingest/status")
async def get_ingest_status():
    """Retrieve simulated PRADAN sync status."""
    import json
    from src.ingest.pradan_watcher import INGESTION_LOG_PATH
    if not INGESTION_LOG_PATH.exists():
        return {
            "last_sync_timestamp": None,
            "new_data_found": False,
            "downloaded_files": [],
            "pipeline_success": False
        }
    try:
        with open(INGESTION_LOG_PATH, "r") as f:
            return json.load(f)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))