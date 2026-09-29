"""
Tests for Dataset Profiling and Quality Assessment (FastAPI /ml/profile)
"""
import sys
import tempfile
import os
from pathlib import Path
import pandas as pd
from fastapi.testclient import TestClient

ml_path = Path(__file__).resolve().parent.parent.parent / "ml-service"
sys.path.insert(0, str(ml_path))

from app.main import app
from app.preprocessing.profiler import profile_dataset

client = TestClient(app)


def test_profile_dataset_csv():
    # Create sample CSV with known data
    data = {
        "district": ["District A", "District B", "District C", "District A", "District B"],
        "population": [10000, 25000, 50000, 10000, None],
        "turnout_pct": [68.5, 72.1, 84.0, 68.5, 60.0]
    }
    df = pd.DataFrame(data)

    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False, mode="w", newline="") as tmp:
        tmp_path = tmp.name
        df.to_csv(tmp_path, index=False)

    try:
        result = profile_dataset(tmp_path)

        assert result["rowCount"] == 5
        assert result["columnCount"] == 3

        cols = {c["name"]: c for c in result["columns"]}
        assert "district" in cols
        assert "population" in cols
        assert "turnout_pct" in cols

        # Check types
        assert cols["district"]["dtype"] == "text"
        assert cols["population"]["dtype"] == "numeric"
        assert cols["turnout_pct"]["dtype"] == "numeric"

        # Check missing count
        assert cols["population"]["missingCount"] == 1
        assert cols["district"]["missingCount"] == 0

        # Check duplicate row count (rows 0 and 3 are duplicates)
        assert result["duplicateRowCount"] >= 1

        # Check overall quality score exists and is bounded [0, 100]
        assert 0 <= result["overallQualityScore"] <= 100

        # Check transformation log contains non-mutation assertion
        log_msgs = [entry["message"] for entry in result["transformationLog"]]
        assert any("integrity preserved" in msg for msg in log_msgs)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def test_ml_profile_endpoint():
    # Create sample CSV
    data = {
        "reg_id": [1, 2, 3, 4],
        "wage_rate": [240.5, 260.0, 245.0, 310.2]
    }
    df = pd.DataFrame(data)

    with tempfile.NamedTemporaryFile(suffix=".csv", delete=False, mode="w", newline="") as tmp:
        tmp_path = tmp.name
        df.to_csv(tmp_path, index=False)

    try:
        response = client.post("/ml/profile", json={"file_path": tmp_path})
        assert response.status_code == 200
        json_data = response.json()
        assert json_data["status"] == "success"
        data = json_data["data"]
        assert data["rowCount"] == 4
        assert data["columnCount"] == 2
        assert data["overallQualityScore"] >= 90
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def test_ml_profile_missing_file():
    response = client.post("/ml/profile", json={"file_path": "/non/existent/path/file.csv"})
    assert response.status_code == 404
