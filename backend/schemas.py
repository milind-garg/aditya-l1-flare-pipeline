from pydantic import BaseModel, Field, ConfigDict
from datetime import datetime
from typing import List, Optional


class TimeSeriesResponse(BaseModel):
    timestamps: List[datetime]
    soft: List[float]
    hard: List[float]


class FlareEvent(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    start: datetime
    peak: datetime
    end: datetime
    class_: str = Field(alias="class")
    peak_value: float
    source: str
    confidence: float


class FlaresResponse(BaseModel):
    flares: List[FlareEvent]


class ForecastResponse(BaseModel):
    timestamps: List[datetime]
    probability_15min: List[float]
    probability_30min: List[float]
    alert_15min: List[bool] = []
    alert_30min: List[bool] = []
    lead_time_minutes: int


class EvaluationResponse(BaseModel):
    detection: dict
    forecast: dict