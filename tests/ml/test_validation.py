"""Unit and integration tests for Grounded Multi-Agent Validation (C5)."""

import sys
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

# Add ml-service to path
ml_path = Path(__file__).resolve().parent.parent.parent / "ml-service"
sys.path.insert(0, str(ml_path))

from app.main import app
from app.validation.service import validation_service
from app.validation.base import ValidationVerdict, RecommendedAction, ClaimVerificationStatus

client = TestClient(app)


def test_statistical_agent_consensus_and_power():
    """Test statistical distribution agent on well-powered vs under-powered peer group."""
    # Case 1: Well-powered peer group with multi-detector consensus and significant FDR
    data_well_powered = {
        "record_index": 12,
        "domain_type": "MGNREGA",
        "peer_group": "District_A",
        "peer_group_size": 120,
        "record_values": {"workdays_per_household": 95, "total_expenditure": 850000},
        "peer_medians": {"workdays_per_household": 35.0, "total_expenditure": 200000.0},
        "peer_mads": {"workdays_per_household": 10.0, "total_expenditure": 50000.0},
        "detector_flags": {"robust_z": True, "isolation_forest": True, "z_score": True},
        "combined_p_value": 0.0002,
        "q_value": 0.0015,
        "ensemble_score": 0.88,
        "atpi_score": 78.5,
        "top_features": [
            {"feature": "workdays_per_household", "contribution_pct": 55.0},
            {"feature": "total_expenditure", "contribution_pct": 35.0},
        ],
    }

    report = validation_service.validate_record(data_well_powered)
    assert report.verdict == ValidationVerdict.CONFIRMED_ANOMALY
    assert report.recommended_action == RecommendedAction.ESCALATE_FOR_AUDIT
    assert report.confidence >= 0.7
    assert report.claim_verification_ratio >= 0.6
    assert "fraud" not in report.summary.lower()

    # Case 2: Small peer group (N=6) with non-significant FDR (q=0.18)
    data_small_peer = {
        "record_index": 45,
        "domain_type": "MGNREGA",
        "peer_group": "Remote_Tribal_Block",
        "peer_group_size": 6,
        "record_values": {"workdays_per_household": 85},
        "peer_medians": {"workdays_per_household": 30.0},
        "peer_mads": {"workdays_per_household": 8.0},
        "detector_flags": {"robust_z": True, "isolation_forest": False},
        "combined_p_value": 0.08,
        "q_value": 0.18,
        "ensemble_score": 0.45,
        "atpi_score": 38.0,
        "top_features": [{"feature": "workdays_per_household", "contribution_pct": 90.0}],
    }

    report_small = validation_service.validate_record(data_small_peer)
    assert report_small.verdict == ValidationVerdict.BENIGN_EXTREME_VARIATION
    assert report_small.recommended_action == RecommendedAction.MARK_FALSE_POSITIVE
    assert "small-sample variability" in report_small.summary.lower() or "benign variation" in report_small.summary.lower()


def test_domain_agent_physical_invariants():
    """Sanity check: records violating fundamental physical constraints MUST produce DATA_QUALITY_ARTIFACT."""
    # Subtest 1: MGNREGA workdays > 365 calendar days
    data_impossible_calendar = {
        "record_index": 99,
        "domain_type": "MGNREGA",
        "peer_group": "State_North",
        "peer_group_size": 50,
        "record_values": {"workdays_per_household": 420.0, "wage_rate": 210.0},
        "peer_medians": {"workdays_per_household": 45.0, "wage_rate": 200.0},
        "peer_mads": {"workdays_per_household": 12.0, "wage_rate": 15.0},
        "detector_flags": {"robust_z": True},
        "q_value": 0.001,
        "top_features": [{"feature": "workdays_per_household", "contribution_pct": 80.0}],
    }

    report_cal = validation_service.validate_record(data_impossible_calendar)
    assert report_cal.verdict == ValidationVerdict.DATA_QUALITY_ARTIFACT
    assert report_cal.recommended_action == RecommendedAction.REQUEST_DATA_CORRECTION
    assert report_cal.confidence >= 0.90
    assert any("CALENDAR_IMPOSSIBILITY_ARTIFACT" in a.flags for a in report_cal.agent_assessments)

    # Subtest 2: Electoral turnout > 100%
    data_impossible_turnout = {
        "record_index": 104,
        "domain_type": "ELECTION",
        "peer_group": "State_Election_2024",
        "peer_group_size": 200,
        "record_values": {"turnout_percentage": 108.5, "total_votes": 55000, "electors": 50000},
        "peer_medians": {"turnout_percentage": 68.0},
        "peer_mads": {"turnout_percentage": 5.0},
        "detector_flags": {"robust_z": True, "isolation_forest": True},
        "q_value": 0.0001,
        "top_features": [{"feature": "turnout_percentage", "contribution_pct": 95.0}],
    }

    report_turnout = validation_service.validate_record(data_impossible_turnout)
    assert report_turnout.verdict == ValidationVerdict.DATA_QUALITY_ARTIFACT
    assert report_turnout.recommended_action == RecommendedAction.REQUEST_DATA_CORRECTION
    assert report_turnout.confidence >= 0.90


def test_claim_verifier_grounded_evaluation():
    """Verify that claims are verified against ground facts and CVR is computed accurately."""
    data = {
        "record_index": 77,
        "domain_type": "MGNREGA",
        "peer_group": "Cluster_East",
        "peer_group_size": 80,
        "record_values": {"workdays_per_household": 92.0, "completed_works": 18.0},
        "peer_medians": {"workdays_per_household": 30.0, "completed_works": 5.0},
        "peer_mads": {"workdays_per_household": 8.0, "completed_works": 2.0},
        "detector_flags": {"robust_z": True, "isolation_forest": True},
        "q_value": 0.005,
        "top_features": [{"feature": "workdays_per_household", "contribution_pct": 70.0}],
        "counterfactual_adjustments_count": 1,
        "counterfactual_distance": 62.0,
    }

    report = validation_service.validate_record(data)
    assert len(report.claims) >= 3
    assert report.claim_verification_ratio > 0.0
    for claim in report.claims:
        assert claim.status in [
            ClaimVerificationStatus.VERIFIED,
            ClaimVerificationStatus.CONTRADICTED,
            ClaimVerificationStatus.UNSUPPORTABLE,
        ]
        assert claim.ground_fact is not None


def test_arbiter_hard_rule_2_compliance():
    """Verify Hard Rule #2: summary never uses the word 'fraud' under any circumstance."""
    data = {
        "record_index": 1,
        "domain_type": "CENSUS",
        "peer_group": "Urban_Districts",
        "peer_group_size": 60,
        "record_values": {"sex_ratio": 720.0},
        "peer_medians": {"sex_ratio": 940.0},
        "peer_mads": {"sex_ratio": 25.0},
        "detector_flags": {"robust_z": True, "z_score": True},
        "q_value": 0.001,
        "top_features": [{"feature": "sex_ratio", "contribution_pct": 90.0}],
    }

    report = validation_service.validate_record(data)
    assert "fraud" not in report.summary.lower()
    assert (
        "statistically unusual pattern" in report.summary.lower()
        or "data collection" in report.summary.lower()
        or "review" in report.summary.lower()
    )


def test_validation_api_endpoint():
    """Integration test for FastAPI /ml/validate endpoint."""
    payload = {
        "record_index": 15,
        "domain_type": "ELECTION",
        "peer_group": "Constituency_Zone_B",
        "peer_group_size": 40,
        "record_values": {"turnout_percentage": 98.2, "margin_percentage": 45.0},
        "peer_medians": {"turnout_percentage": 65.0, "margin_percentage": 8.0},
        "peer_mads": {"turnout_percentage": 4.5, "margin_percentage": 3.0},
        "detector_flags": {"robust_z": True, "isolation_forest": True},
        "q_value": 0.002,
        "ensemble_score": 0.85,
        "atpi_score": 72.0,
        "top_features": [{"feature": "turnout_percentage", "contribution_pct": 60.0}],
    }

    response = client.post("/ml/validate", json=payload)
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["record_index"] == 15
    assert res_data["verdict"] in [v.value for v in ValidationVerdict]
    assert len(res_data["agent_assessments"]) == 3
    assert len(res_data["claims"]) > 0
    assert 0.0 <= res_data["claim_verification_ratio"] <= 1.0
