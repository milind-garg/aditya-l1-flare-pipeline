import pandas as pd
import numpy as np
from pathlib import Path

scores = pd.read_parquet("data/processed/forecast_scores.parquet")
flares = pd.read_csv("data/processed/flare_catalogue_master.csv")
flares["peak"] = pd.to_datetime(flares["peak"], utc=True)

for _, f in flares.iterrows():
    peak = pd.to_datetime(f["peak"], utc=True)
    cls = f["class"]
    if cls in ["C","M","X","X+"]:
        mask = (scores["timestamp"] >= peak - pd.Timedelta(minutes=30)) & (scores["timestamp"] <= peak + pd.Timedelta(minutes=5))
        subset = scores[mask]
        max15 = subset["probability_15min"].max() if len(subset) > 0 else 0
        any05 = (subset["probability_15min"] > 0.5).any() if len(subset) > 0 else False
        any03 = (subset["probability_15min"] > 0.3).any() if len(subset) > 0 else False
        print(f"{f['id']} ({cls}) at {peak}: max15={max15:.4f}, >0.5={any05}, >0.3={any03}")
