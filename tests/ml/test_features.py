"""
Tests for Feature Template Registry and Mathematical Formulations
"""
import sys
from pathlib import Path
import pandas as pd
import numpy as np

ml_path = Path(__file__).resolve().parent.parent.parent / "ml-service"
sys.path.insert(0, str(ml_path))

from app.feature_engineering.registry import feature_registry


def test_census_feature_templates():
    df = pd.DataFrame({
        "pop": [10000, 20000, 30000],
        "area": [100.0, 50.0, 200.0],
        "males": [5200, 10100, 15500],
        "females": [4800, 9900, 14500],
        "literates": [7500, 16000, 21000]
    })

    mapping = {
        "pop": {"canonicalRole": "population_total"},
        "area": {"canonicalRole": "area_sq_km"},
        "males": {"canonicalRole": "population_male"},
        "females": {"canonicalRole": "population_female"},
        "literates": {"canonicalRole": "literacy_total"}
    }

    result = feature_registry.execute_all(df, mapping)
    features_df = result["featureData"]
    feature_meta = {f["name"]: f for f in result["features"]}

    # Check density: 10000/100 = 100.0
    assert "pop_density" in features_df.columns
    assert features_df["pop_density"].iloc[0] == 100.0
    assert feature_meta["pop_density"]["domain"] == "Census"

    # Check gender ratio: (4800 / 5200) * 1000 = 923.0769
    assert "gender_ratio" in features_df.columns
    assert round(features_df["gender_ratio"].iloc[0], 2) == 923.08

    # Check literacy rate: (7500 / 10000) * 100 = 75.0%
    assert "literacy_rate_pct" in features_df.columns
    assert features_df["literacy_rate_pct"].iloc[0] == 75.0


def test_mgnrega_and_election_templates():
    df = pd.DataFrame({
        "wages": [500000, 800000],
        "days": [2500, 3200],
        "workers": [250, 320],
        "electors": [100000, 150000],
        "votes": [65000, 105000],
        "winner_votes": [35000, 60000]
    })

    mapping = {
        "wages": {"canonicalRole": "wages_total"},
        "days": {"canonicalRole": "workdays_total"},
        "workers": {"canonicalRole": "persons_worked"},
        "electors": {"canonicalRole": "total_electors"},
        "votes": {"canonicalRole": "votes_polled"},
        "winner_votes": {"canonicalRole": "candidate_votes"}
    }

    result = feature_registry.execute_all(df, mapping)
    features_df = result["featureData"]

    # Wage per workday: 500000 / 2500 = 200.0
    assert features_df["wage_per_workday"].iloc[0] == 200.0

    # Workdays per worker: 2500 / 250 = 10.0
    assert features_df["workdays_per_person"].iloc[0] == 10.0

    # Turnout %: (65000 / 100000) * 100 = 65.0%
    assert features_df["turnout_pct"].iloc[0] == 65.0

    # Vote share %: (35000 / 65000) * 100 = 53.846%
    assert round(features_df["vote_share_pct"].iloc[0], 2) == 53.85
