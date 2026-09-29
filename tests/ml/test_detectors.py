"""
Tests for Phase 4 anomaly detection algorithms:
- ZScoreDetector
- RobustZScoreDetector (global and peer group baselines)
- IsolationForestDetector
- TemporalDetector (rolling robust median/MAD, STL residuals, CUSUM)
- POST /ml/analyze endpoint
"""

import os
import sys
import tempfile
from pathlib import Path
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

# Add ml-service to path
ml_path = Path(__file__).resolve().parent.parent.parent / "ml-service"
sys.path.insert(0, str(ml_path))

from app.main import app
from app.anomaly_detection.registry import DetectorRegistry
from app.anomaly_detection.zscore import ZScoreDetector, RobustZScoreDetector
from app.anomaly_detection.isolation_forest import IsolationForestDetector
from app.anomaly_detection.temporal import TemporalDetector
from app.anomaly_detection.analyzer import run_anomaly_analysis

client = TestClient(app)


def test_registry_registration():
    """Verify all 4 core detectors are registered in DetectorRegistry."""
    available = DetectorRegistry.list_available()
    names = [d["name"] for d in available]
    assert "z_score" in names
    assert "robust_z" in names
    assert "isolation_forest" in names
    assert "temporal" in names


def test_zscore_and_robust_z_synthetic_outlier():
    """Verify Z-score and robust Z detect injected univariate outlier."""
    np.random.seed(42)
    normal_data = np.random.normal(loc=100.0, scale=10.0, size=100)
    # Inject obvious outlier at index 50
    normal_data[50] = 500.0

    df = pd.DataFrame({"wage": normal_data})

    # 1. Z-score
    z_det = ZScoreDetector(threshold=3.0)
    scores, flags, tags = z_det.fit_score(df, ["wage"])
    assert flags[50] == True
    assert scores[50] > 3.0
    assert any("Z_SCORE" in t for t in tags[50])

    # 2. Robust Z-score
    rob_det = RobustZScoreDetector(threshold=3.5)
    rob_scores, rob_flags, rob_tags = rob_det.fit_score(df, ["wage"])
    assert rob_flags[50] == True
    assert rob_scores[50] > 3.5
    assert "GLOBAL_ROBUST_Z_OUTLIER" in rob_tags[50]


def test_peer_group_aware_robust_z():
    """
    Test peer-group baseline awareness:
    Group A baseline ~ 1000
    Group B baseline ~ 100
    Record 1 in Group B has value 350 (abnormal for Group B, but would look small/normal globally).
    """
    df = pd.DataFrame({
        "district": ["Dist_A"] * 20 + ["Dist_B"] * 20,
        "wage": [1000.0 + i for i in range(20)] + [100.0 + i for i in range(20)]
    })
    # Inject outlier in Dist_B at row 25
    df.at[25, "wage"] = 400.0

    rob_det = RobustZScoreDetector(threshold=3.5, peer_group_col="district")
    scores, flags, tags = rob_det.fit_score(df, ["wage"])

    assert flags[25] == True
    assert "PEER_GROUP_DEVIATION" in tags[25]


def test_isolation_forest_multivariate():
    """Verify Isolation Forest flags multivariate outliers."""
    np.random.seed(42)
    # 2D gaussian cluster
    x1 = np.random.normal(0, 1, 100)
    x2 = np.random.normal(0, 1, 100)

    # Inject multivariate outlier far from bivariate center
    x1[10] = 15.0
    x2[10] = -15.0

    df = pd.DataFrame({"x1": x1, "x2": x2})

    if_det = IsolationForestDetector(contamination=0.05, random_state=42)
    scores, flags, tags = if_det.fit_score(df, ["x1", "x2"])

    assert flags[10] == True
    assert "IFOREST_OUTLIER" in tags[10]


def test_temporal_detector():
    """Verify Temporal detector identifies spikes and CUSUM drift in time-series."""
    dates = pd.date_range("2024-01-01", periods=40, freq="D")
    values = np.ones(40) * 50.0

    # Inject spike at day 15
    values[15] = 250.0
    # Inject sustained step shift starting day 30
    values[30:] = 120.0

    df = pd.DataFrame({"record_date": dates, "daily_count": values})

    temp_det = TemporalDetector(date_col="record_date", rolling_window=7, spike_threshold=3.0)
    scores, flags, tags = temp_det.fit_score(df, ["daily_count"])

    assert flags[15] == True
    assert any("SPIKE" in t for t in tags[15])
    # Sustained drift should be flagged on later days
    assert flags[35] == True
    assert any("CUSUM" in t for t in tags[35])


def test_ml_analyze_endpoint():
    """Test POST /ml/analyze integration via FastAPI test client."""
    df = pd.DataFrame({
        "district": ["D1"] * 25 + ["D2"] * 25,
        "date": pd.date_range("2024-01-01", periods=50, freq="D"),
        "wage": [200.0 + (i % 5) for i in range(50)],
        "workdays": [15.0 + (i % 3) for i in range(50)]
    })
    # Inject outlier
    df.at[5, "wage"] = 1200.0

    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False, mode="w", newline="") as tmp:
        df.to_csv(tmp.name, index=False)
        tmp_path = tmp.name

    try:
        payload = {
            "file_path": tmp_path,
            "peer_group_col": "district",
            "date_col": "date",
            "detectors": ["robust_z", "isolation_forest", "z_score", "temporal"],
            "contamination": 0.05,
            "random_state": 42
        }

        resp = client.post("/ml/analyze", json=payload)
        assert resp.status_code == 200
        data = resp.json()

        assert data["success"] is True
        summary = data["data"]["summary"]
        assert summary["total_records"] == 50
        assert summary["total_anomalies"] >= 1
        assert "robust_z" in summary["active_detectors"]

        records = data["data"]["records"]
        assert len(records) == 50
        # Injected record 5 should be flagged
        rec5 = records[5]
        assert rec5["is_anomaly"] is True
        assert rec5["ensemble_score"] > 0.4
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
