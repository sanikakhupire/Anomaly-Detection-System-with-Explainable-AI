"""Unit and integration tests for Human-in-the-Loop Adaptive Detector Weighting (Contribution C6)."""

import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

# Add ml-service to path
ml_path = Path(__file__).resolve().parent.parent.parent / "ml-service"
sys.path.insert(0, str(ml_path))

from app.main import app
from app.calibration.adaptive_weights import AdaptiveWeightEngine

client = TestClient(app)


def test_multiplicative_update_penalizes_false_positives():
    """Verify that detectors producing false positives lose weight while accurate detectors gain weight."""
    initial_weights = {
        "robust_z": 0.25,
        "isolation_forest": 0.25,
        "z_score": 0.25,
        "temporal": 0.25,
    }

    # Sequence of reviews:
    # isolation_forest consistently flags VALIDATED anomalies with score 0.95
    # z_score consistently flags FALSE_POSITIVES with score 0.90
    feedback_batch = [
        {
            "record_index": 1,
            "human_verdict": "VALIDATED",
            "detector_scores": {"robust_z": 0.70, "isolation_forest": 0.95, "z_score": 0.30, "temporal": 0.20},
            "detector_flags": {"robust_z": True, "isolation_forest": True, "z_score": False, "temporal": False},
        },
        {
            "record_index": 2,
            "human_verdict": "FALSE_POSITIVE",
            "detector_scores": {"robust_z": 0.20, "isolation_forest": 0.10, "z_score": 0.90, "temporal": 0.15},
            "detector_flags": {"robust_z": False, "isolation_forest": False, "z_score": True, "temporal": False},
        },
        {
            "record_index": 3,
            "human_verdict": "VALIDATED",
            "detector_scores": {"robust_z": 0.65, "isolation_forest": 0.92, "z_score": 0.25, "temporal": 0.10},
            "detector_flags": {"robust_z": True, "isolation_forest": True, "z_score": False, "temporal": False},
        },
    ]

    res = AdaptiveWeightEngine.update_weights(
        current_weights=initial_weights,
        feedback_items=feedback_batch,
        learning_rate=0.2,
        smoothing_factor=0.05,
    )

    updated = res.updated_weights
    # isolation_forest should increase in weight
    assert updated["isolation_forest"] > initial_weights["isolation_forest"]
    # z_score should decrease in weight due to high false positive loss
    assert updated["z_score"] < initial_weights["z_score"]
    # Sum must equal 1.0 (within float tolerance)
    assert abs(sum(updated.values()) - 1.0) < 1e-3


def test_epsilon_smoothing_floor():
    """Verify that extreme adversarial feedback cannot collapse a detector below epsilon / K."""
    initial_weights = {"robust_z": 0.25, "isolation_forest": 0.25, "z_score": 0.25, "temporal": 0.25}
    eps = 0.08
    k = 4
    min_floor = eps / k  # 0.02

    # Severe penalization against temporal
    adversarial_feedback = [
        {
            "record_index": i,
            "human_verdict": "FALSE_POSITIVE",
            "detector_scores": {"robust_z": 0.1, "isolation_forest": 0.1, "z_score": 0.1, "temporal": 1.0},
            "detector_flags": {"robust_z": False, "isolation_forest": False, "z_score": False, "temporal": True},
        }
        for i in range(10)
    ]

    res = AdaptiveWeightEngine.update_weights(
        current_weights=initial_weights,
        feedback_items=adversarial_feedback,
        learning_rate=0.5,
        smoothing_factor=eps,
    )

    # temporal weight should not drop below floor
    assert res.updated_weights["temporal"] >= (min_floor - 0.005)


def test_weights_always_sum_to_one():
    """Invariance test: weights always sum to 1.0."""
    initial_weights = {"robust_z": 0.4, "isolation_forest": 0.35, "z_score": 0.15, "temporal": 0.1}

    feedback = [
        {
            "record_index": 10,
            "human_verdict": "VALIDATED",
            "detector_scores": {"robust_z": 0.8, "isolation_forest": 0.7, "z_score": 0.5, "temporal": 0.4},
        }
    ]

    res = AdaptiveWeightEngine.update_weights(initial_weights, feedback)
    total_weight = sum(res.updated_weights.values())
    assert abs(total_weight - 1.0) < 1e-3


def test_adaptive_weights_api_endpoint():
    """Integration test for FastAPI /ml/weights/update."""
    payload = {
        "current_weights": {"robust_z": 0.35, "isolation_forest": 0.35, "z_score": 0.15, "temporal": 0.15},
        "feedback_items": [
            {
                "record_index": 5,
                "human_verdict": "VALIDATED",
                "detector_scores": {"robust_z": 0.9, "isolation_forest": 0.85, "z_score": 0.2, "temporal": 0.1},
                "detector_flags": {"robust_z": True, "isolation_forest": True, "z_score": False, "temporal": False},
            }
        ],
        "learning_rate": 0.15,
        "smoothing_factor": 0.05,
    }

    response = client.post("/ml/weights/update", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert "updated_weights" in data
    assert "loss_by_detector" in data
    assert "precision_by_detector" in data
    assert abs(sum(data["updated_weights"].values()) - 1.0) < 1e-3
