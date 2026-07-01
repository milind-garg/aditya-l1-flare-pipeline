from fastapi import APIRouter, Query
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