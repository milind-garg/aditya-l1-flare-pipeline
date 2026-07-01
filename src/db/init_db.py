"""Initialize SQLite database with flare catalogue and related tables."""

from pathlib import Path
import pandas as pd
from sqlalchemy import create_engine, Column, String, DateTime, Float, Integer, Boolean, Text
from sqlalchemy.orm import declarative_base, Session

Base = declarative_base()


class FlareEventDB(Base):
    __tablename__ = "flare_events"

    id = Column(String, primary_key=True)
    start = Column(DateTime(timezone=True))
    peak = Column(DateTime(timezone=True))
    end = Column(DateTime(timezone=True))
    class_ = Column("class", String)
    peak_value = Column(Float)
    source = Column(String)
    confidence = Column(Float)


class ForecastScoreDB(Base):
    __tablename__ = "forecast_scores"

    id = Column(Integer, primary_key=True, autoincrement=True)
    timestamp = Column(DateTime(timezone=True))
    probability_15min = Column(Float)
    probability_30min = Column(Float)
    alert_15min = Column(Boolean)
    alert_30min = Column(Boolean)


def init_db(db_path: str = "data/processed/flare_pipeline.db"):
    """Initialize the SQLite database with tables and seed data."""
    engine = create_engine(f"sqlite:///{db_path}")
    Base.metadata.create_all(engine)

    return engine


def seed_from_parquet(engine, data_dir: str = "data/processed"):
    """Seed database from existing processed parquet/csv files."""
    import yaml

    data_path = Path(data_dir)

    # Seed flare events
    flare_csv = data_path / "flare_catalogue_master.csv"
    if flare_csv.exists():
        df = pd.read_csv(flare_csv)
        df.to_sql("flare_events", engine, if_exists="replace", index=False)
        print(f"Seeded {len(df)} flare events")

    # Seed forecast scores
    forecast_parquet = data_path / "forecast_scores.parquet"
    if forecast_parquet.exists():
        df = pd.read_parquet(forecast_parquet)
        df.to_sql("forecast_scores", engine, if_exists="replace", index=False)
        print(f"Seeded {len(df)} forecast scores")


if __name__ == "__main__":
    engine = init_db()
    seed_from_parquet(engine)