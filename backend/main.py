from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os
from backend.routers import timeseries, flares, forecast, replay, evaluation


@asynccontextmanager
async def lifespan(app: FastAPI):
    timeseries.load_timeseries()
    flares.load_flares()
    forecast.load_forecast()
    yield


app = FastAPI(title="Aditya-L1 Solar Flare Pipeline API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(timeseries.router, prefix="/api")
app.include_router(flares.router, prefix="/api")
app.include_router(forecast.router, prefix="/api")
app.include_router(replay.router, prefix="/api")
app.include_router(evaluation.router, prefix="/api")

@app.get("/health")
async def health_check():
    return {"status": "ok"}

# Serve the React frontend (must be placed AFTER the /api routes)
frontend_dist = os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
if os.path.exists(frontend_dist):
    app.mount("/", StaticFiles(directory=frontend_dist, html=True), name="frontend")
else:
    print(f"Warning: Frontend build folder not found at {frontend_dist}. Run 'npm run build' in the frontend directory.")