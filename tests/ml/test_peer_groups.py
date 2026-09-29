"""
Tests for Peer Group Formation, Robust Baselines, and Empirical Shrinkage (C2)
"""
import sys
from pathlib import Path
import pandas as pd
import numpy as np

ml_path = Path(__file__).resolve().parent.parent.parent / "ml-service"
sys.path.insert(0, str(ml_path))

from app.peer_groups.builder import build_peer_groups, compute_median_and_mad


def test_compute_median_and_mad():
    series = pd.Series([10.0, 12.0, 14.0, 16.0, 18.0, 100.0]) # 100 is an outlier
    stats = compute_median_and_mad(series)

    # Median of [10, 12, 14, 16, 18, 100] is (14 + 16)/2 = 15.0
    assert stats["median"] == 15.0

    # Absolute deviations from 15: [5, 3, 1, 1, 3, 85] -> sorted: [1, 1, 3, 3, 5, 85] -> median is 3.0
    assert stats["mad"] == 3.0


def test_peer_group_shrinkage_dynamics():
    # Construct a dataset with:
    # 1. State A has District 1 (Large, n=60, wages ~ 200)
    # 2. State A has District 2 (Small, n=2, wages ~ 500)
    # State A overall median wages ~ 200.
    np.random.seed(42)

    large_wages = np.random.normal(loc=200, scale=10, size=60).tolist()
    small_wages = [500.0, 520.0]  # extreme local wages in small group

    districts = ["District_Large"] * 60 + ["District_Small"] * 2
    states = ["State_A"] * 62
    wages = large_wages + small_wages

    df = pd.DataFrame({
        "state": states,
        "district": districts,
        "wages": wages
    })

    result = build_peer_groups(
        df=df,
        group_col="district",
        parent_col="state",
        feature_cols=["wages"],
        shrinkage_n0=15,
        min_group_size=5
    )

    groups = {g["groupName"]: g for g in result["peerGroups"]}

    # District_Small (n=2):
    # Raw median is ~510.
    # State_A parent median is ~200.
    # lambda = 2 / (2 + 15) = 2/17 ~ 0.1176
    # Shrunk median = 0.1176 * 510 + (1 - 0.1176) * 200 ~ 60 + 176 ~ 236
    small_group = groups["District_Small"]
    assert small_group["sampleCount"] == 2
    assert small_group["isSmallGroup"] is True
    assert small_group["shrinkageFactor"] < 0.15

    small_shrunk_med = small_group["baselines"]["wages"]["shrunkMedian"]
    raw_med = small_group["baselines"]["wages"]["rawMedian"]
    ref_med = small_group["baselines"]["wages"]["refMedian"]

    # Shrunk median MUST be significantly closer to reference than raw median!
    assert abs(small_shrunk_med - ref_med) < abs(raw_med - ref_med)
    assert small_shrunk_med < 300.0  # Heavy shrinkage toward 200!

    # District_Large (n=60):
    # lambda = 60 / (60 + 15) = 60/75 = 0.8
    # Remains very close to its local raw median
    large_group = groups["District_Large"]
    assert large_group["sampleCount"] == 60
    assert large_group["isSmallGroup"] is False
    assert large_group["shrinkageFactor"] == 0.8
