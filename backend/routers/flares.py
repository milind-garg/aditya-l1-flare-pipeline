from fastapi import APIRouter, Query
from datetime import datetime, timezone
from pathlib import Path
import pandas as pd

from backend.schemas import FlaresResponse, FlareEvent

router = APIRouter()

FLARES_PATH = Path("data/processed/flare_catalogue_master.csv")
_flares_cache = None


def load_flares():
    global _flares_cache
    if _flares_cache is not None:
        return _flares_cache
    if not FLARES_PATH.exists():
        return pd.DataFrame(columns=[
            "id", "start", "peak", "end", "class", "peak_value", "source", "confidence"
        ])
    df = pd.read_csv(FLARES_PATH, keep_default_na=False, na_values=[])
    df["class"] = df["class"].replace("", "N/A").fillna("N/A")
    for col in ["start", "peak", "end"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], utc=True)
    _flares_cache = df
    return df


@router.get("/flares", response_model=FlaresResponse)
async def get_flares(
    start: datetime = Query(..., description="Start timestamp (ISO format)"),
    end: datetime = Query(..., description="End timestamp (ISO format)"),
    min_class: str = Query(None, description="Minimum flare class (A, B, C, M, X)"),
):
    df = load_flares()
    if df.empty:
        return FlaresResponse(flares=[])

    # Ensure start/end are UTC-aware for comparison
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)

    mask = (df["peak"] >= start) & (df["peak"] <= end)
    filtered = df.loc[mask].copy()

    if min_class:
        class_order = {"A": 0, "B": 1, "C": 2, "M": 3, "X": 4}
        min_val = class_order.get(min_class.upper(), 0)
        filtered = filtered[filtered["class"].str[0].map(class_order) >= min_val]

    flares = []
    for _, row in filtered.iterrows():
        flares.append(FlareEvent(
            id=row["id"],
            start=row["start"],
            peak=row["peak"],
            end=row["end"],
            class_=row["class"],
            peak_value=row["peak_value"],
            source=row["source"],
            confidence=row["confidence"],
        ))

    return FlaresResponse(flares=flares)