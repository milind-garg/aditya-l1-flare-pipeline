from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from datetime import datetime, timedelta
from pathlib import Path
import pandas as pd
import asyncio
import json

from backend.routers.timeseries import load_timeseries
from backend.routers.flares import load_flares
from backend.routers.forecast import load_forecast

router = APIRouter()


@router.get("/replay/start")
async def start_replay(
    start: datetime = Query(..., description="Start timestamp (ISO format)"),
    end: datetime = Query(..., description="End timestamp (ISO format)"),
    speed: float = Query(60.0, description="Playback speed multiplier"),
):
    return {
        "message": f"Replay ready for {start} to {end} at {speed}x speed",
        "websocket_url": f"/api/ws/replay?start={start.isoformat()}&end={end.isoformat()}&speed={speed}",
    }


@router.websocket("/ws/replay")
async def replay_websocket(
    websocket: WebSocket,
    start: str = Query(...),
    end: str = Query(...),
    speed: float = Query(60.0),
):
    await websocket.accept()

    try:
        start_dt = pd.to_datetime(start, utc=True)
        end_dt = pd.to_datetime(end, utc=True)

        ts_df = load_timeseries()
        flare_df = load_flares()
        forecast_df = load_forecast()

        if ts_df.empty:
            await websocket.send_text(json.dumps({"error": "No time series data available"}))
            await websocket.close()
            return

        mask = (ts_df["timestamp"] >= start_dt) & (ts_df["timestamp"] <= end_dt)
        ts_filtered = ts_df.loc[mask].sort_values("timestamp").reset_index(drop=True)

        if flare_df.empty:
            flare_filtered = pd.DataFrame()
        else:
            flare_filtered = flare_df[
                (flare_df["peak"] >= start_dt) & (flare_df["peak"] <= end_dt)
            ].sort_values("peak").reset_index(drop=True)

        if forecast_df.empty:
            forecast_filtered = pd.DataFrame()
        else:
            forecast_filtered = forecast_df[
                (forecast_df["timestamp"] >= start_dt) & (forecast_df["timestamp"] <= end_dt)
            ].sort_values("timestamp").reset_index(drop=True)

        flare_idx = 0
        forecast_idx = 0

        for _, row in ts_filtered.iterrows():
            current_time = row["timestamp"]

            flare_event = None
            if not flare_filtered.empty and flare_idx < len(flare_filtered):
                if flare_filtered.iloc[flare_idx]["peak"] <= current_time:
                    flare_row = flare_filtered.iloc[flare_idx]
                    flare_event = {
                        "id": flare_row["id"],
                        "start": flare_row["start"].isoformat(),
                        "peak": flare_row["peak"].isoformat(),
                        "end": flare_row["end"].isoformat(),
                        "class": flare_row["class"],
                        "peak_value": flare_row["peak_value"],
                        "source": flare_row["source"],
                        "confidence": flare_row["confidence"],
                    }
                    flare_idx += 1

            forecast_prob_15 = None
            forecast_prob_30 = None
            if not forecast_filtered.empty and forecast_idx < len(forecast_filtered):
                while forecast_idx < len(forecast_filtered) and forecast_filtered.iloc[forecast_idx]["timestamp"] <= current_time:
                    forecast_row = forecast_filtered.iloc[forecast_idx]
                    forecast_prob_15 = float(forecast_row.get("probability_15min", 0))
                    forecast_prob_30 = float(forecast_row.get("probability_30min", 0))
                    forecast_idx += 1

            message = {
                "timestamp": current_time.isoformat(),
                "soft": float(row["soft"]),
                "hard": float(row["hard"]),
                "flare_event": flare_event,
                "forecast_probability_15min": forecast_prob_15,
                "forecast_probability_30min": forecast_prob_30,
            }

            await websocket.send_text(json.dumps(message, default=str))

            await asyncio.sleep(1.0 / speed)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        await websocket.send_text(json.dumps({"error": str(e)}))
    finally:
        await websocket.close()