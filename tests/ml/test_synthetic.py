"""
Tests for Phase 5 Synthetic Data Generation & Anomaly Injection:
1. Determinism / Reproducibility: Same seed yields identical dataframes and label files.
2. Injected anomaly count conforms to the configured anomaly rate.
3. Verification of distinct anomaly types (point, contextual, collective, temporal, digit, conflict).
"""

import sys
from pathlib import Path
import numpy as np
import pandas as pd
import pytest

# Add ml-service to path
ml_path = Path(__file__).resolve().parent.parent.parent / "ml-service"
sys.path.insert(0, str(ml_path))

from app.experiments.synthetic import (
    generate_census_demo,
    generate_mgnrega_demo,
    generate_election_demo,
    AnomalyType,
)


def test_seed_reproducibility():
    """Verify that calling generators with identical seed produces bit-exact identical DataFrames."""
    df1_census, labels1_census = generate_census_demo(n_records=300, seed=12345)
    df2_census, labels2_census = generate_census_demo(n_records=300, seed=12345)

    pd.testing.assert_frame_equal(df1_census, df2_census)
    assert len(labels1_census) == len(labels2_census)
    for l1, l2 in zip(labels1_census, labels2_census):
        assert l1["is_anomaly"] == l2["is_anomaly"]
        assert l1["anomaly_type"] == l2["anomaly_type"]
        assert l1["injected_value"] == l2["injected_value"]


def test_injected_count_matches_configured_rate():
    """Verify that injected anomaly count scales with configured rate."""
    rate = 0.08
    n_records = 500

    df_mgnrega, labels_mgnrega = generate_mgnrega_demo(
        n_records=n_records, seed=42, anomaly_rate=rate
    )

    anomalies = [l for l in labels_mgnrega if l["is_anomaly"]]
    # Due to collective injection involving small clusters, count is at least int(n * rate)
    assert len(anomalies) >= int(n_records * rate)
    assert len(anomalies) <= int(n_records * rate * 2.5)


def test_election_generator_and_anomaly_types():
    """Verify election generator creates valid columns and ground truth captures all anomaly categories."""
    df_elec, labels_elec = generate_election_demo(n_records=400, seed=99, anomaly_rate=0.10)

    # Check key columns
    expected_cols = [
        "state",
        "parliamentary_constituency",
        "assembly_constituency",
        "polling_station_id",
        "election_year",
        "total_electors",
        "votes_polled",
        "valid_votes",
        "winning_candidate_votes",
        "winner_party",
    ]
    for col in expected_cols:
        assert col in df_elec.columns

    # Verify presence of multiple anomaly types
    anomaly_types_present = set(l["anomaly_type"] for l in labels_elec if l["is_anomaly"])
    assert AnomalyType.POINT.value in anomaly_types_present
    assert len(anomaly_types_present) >= 4

    # Verify no unhandled null values
    assert df_elec.isna().sum().sum() == 0
