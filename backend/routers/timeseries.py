from fastapi import APIRouter, Query
from datetime import datetime
import pandas as pd
from pathlib import Path

from backend.schemas import TimeSeriesResponse

router = APIRouter()

DATA_PATH = Path("data/processed/combined_timeseries.parquet")
_timeseries_cache = None


def load_timeseries():
    global _timeseries_cache
    if _timeseries_cache is not None:
        return _timeseries_cache
    if not DATA_PATH.exists():
        return pd.DataFrame(columns=["timestamp", "soft", "hard"])
    df = pd.read_parquet(DATA_PATH)
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True)
    _timeseries_cache = df
    return df


@router.get("/timeseries", response_model=TimeSeriesResponse)
async def get_timeseries(
    start: datetime = Query(..., description="Start timestamp (ISO format)"),
    end: datetime = Query(..., description="End timestamp (ISO format)"),
    resolution: str = Query("1s", description="Downsampling resolution (e.g., 1s, 10s, 1min)"),
):
    df = load_timeseries()
    if df.empty:
        return TimeSeriesResponse(timestamps=[], soft=[], hard=[])

    mask = (df["timestamp"] >= start) & (df["timestamp"] <= end)
    filtered = df.loc[mask].copy()

    if filtered.empty:
        return TimeSeriesResponse(timestamps=[], soft=[], hard=[])

    if resolution != "1s":
        filtered.set_index("timestamp", inplace=True)
        filtered = filtered.resample(resolution).mean().reset_index()

    return TimeSeriesResponse(
        timestamps=filtered["timestamp"].tolist(),
        soft=filtered["soft"].tolist(),
        hard=filtered["hard"].tolist(),
    )