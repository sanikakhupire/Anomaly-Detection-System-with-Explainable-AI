"""
Unit tests for Contribution C3: Statistical Forensics.
Verifies Benford first/second digit, last digit uniformity, Whipple/Myers digit heaping,
round number bias, and bivariate turnout vs vote-share forensics.
"""

import sys
from pathlib import Path
import pytest
import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

# Add ml-service to path
ml_path = Path(__file__).resolve().parent.parent.parent / "ml-service"
sys.path.insert(0, str(ml_path))

from app.main import app
from app.forensics.tests import (
    BenfordFirstDigitTest,
    BenfordSecondDigitTest,
    LastDigitUniformityTest,
    DigitHeapingTest,
    RoundNumberBiasTest,
    ElectionTurnoutVoteShareForensics,
)
from app.forensics.service import ForensicAnalyzer

client = TestClient(app)


def test_benford_first_digit_conforming():
    """Benford test passes on naturally conforming geometric data."""
    np.random.seed(42)
    # 2^n or geometric sequence spanning orders of magnitude strictly conforms to Benford's Law
    n = 2000
    geometric_data = [1.025**i for i in range(1, n + 1)]
    series = pd.Series(geometric_data, name="conforming_val")

    test = BenfordFirstDigitTest()
    assert test.is_applicable(series)
    res = test.run(series)

    assert res.conformity_level in ("CLOSE_CONFORMITY", "ACCEPTABLE_CONFORMITY")
    assert res.metadata["mad"] < 0.012
    assert res.p_value is not None
    assert res.p_value > 0.01


def test_benford_first_digit_manipulated():
    """Benford test flags digit-manipulated uniform data as non-conforming."""
    np.random.seed(42)
    # Uniformly chosen leading digits 1..9 (flat distribution violates Benford)
    first_digits = np.random.choice(range(1, 10), size=1000)
    data = [d * 1000 + np.random.randint(10, 999) for d in first_digits]
    series = pd.Series(data, name="manipulated_val")

    test = BenfordFirstDigitTest()
    res = test.run(series)

    assert res.conformity_level == "NON_CONFORMITY"
    assert res.metadata["mad"] > 0.015
    assert res.p_value < 0.001
    assert res.flagged_count > 0


def test_benford_second_digit():
    """Verifies second digit Benford test evaluation."""
    np.random.seed(42)
    data = [1.018**i for i in range(100, 2500)]
    series = pd.Series(data, name="test_val")

    test = BenfordSecondDigitTest()
    assert test.is_applicable(series)
    res = test.run(series)

    assert res.statistic >= 0.0
    assert len(res.digit_labels) == 10
    assert res.conformity_level in ("CLOSE_CONFORMITY", "ACCEPTABLE_CONFORMITY", "MARGINALLY_ACCEPTABLE")


def test_last_digit_uniformity():
    """Verifies terminal digit uniformity detection."""
    np.random.seed(42)
    # Case 1: Naturally uniform terminal digits
    uniform_data = np.random.randint(100, 1000, size=800)
    test = LastDigitUniformityTest()
    res_uniform = test.run(pd.Series(uniform_data))
    assert res_uniform.conformity_level in ("UNIFORM_CONFORMITY", "ACCEPTABLE_UNIFORMITY")

    # Case 2: Heaped / biased terminal digits (e.g. all 0, 5, or 9)
    biased_data = np.random.choice([100, 105, 120, 150, 195, 200, 250, 300], size=800)
    res_biased = test.run(pd.Series(biased_data))
    assert res_biased.conformity_level == "NON_UNIFORM_DEVIATION"
    assert res_biased.p_value < 0.001


def test_digit_heaping_whipple_and_myers():
    """Whipple's and Myers' index correctly detect injected digit heaping on 0 and 5."""
    np.random.seed(42)
    # Inject heavy rounding to terminal 0 and 5 (70% of numbers)
    round_numbers = np.random.choice([20, 25, 30, 35, 40, 45, 50, 55, 60], size=700)
    random_numbers = np.random.randint(18, 65, size=300)
    combined = np.concatenate([round_numbers, random_numbers])
    series = pd.Series(combined, name="heaped_age_or_wage")

    test = DigitHeapingTest()
    res = test.run(series)

    # Whipple index should be well above 175 (demographically very rough)
    assert res.statistic > 175.0
    assert res.conformity_level in ("ROUGH_HEAPING", "VERY_ROUGH_HEAPING")
    assert res.metadata["myers_index"] > 15.0
    assert res.flagged_count > 0


def test_round_number_bias():
    """Verifies round-number bias test on multiples of 100."""
    np.random.seed(42)
    # Many exact multiples of 100
    multiples_100 = np.random.choice([100, 200, 300, 400, 500, 1000], size=300)
    other = np.random.randint(50, 1500, size=200)
    series = pd.Series(np.concatenate([multiples_100, other]))

    test = RoundNumberBiasTest()
    res = test.run(series)

    assert res.conformity_level in ("SEVERE_ROUNDING_BIAS", "MODERATE_ROUNDING_BIAS")
    assert res.statistic > 2.0


def test_election_turnout_voteshare_forensics():
    """Verifies election bivariate forensics detects extreme turnout clusters."""
    np.random.seed(42)
    n = 200
    # Normal constituencies
    turnout_normal = np.random.normal(65, 8, size=180).clip(30, 80)
    votes_normal = np.random.normal(48, 10, size=180).clip(20, 70)

    # Injected ballot-box stuffing anomalies (extreme turnout + extreme vote share)
    turnout_spike = np.random.uniform(88, 98, size=20)
    votes_spike = np.random.uniform(85, 96, size=20)

    df = pd.DataFrame({
        "turnout_percentage": np.concatenate([turnout_normal, turnout_spike]),
        "winning_vote_share": np.concatenate([votes_normal, votes_spike]),
    })

    test = ElectionTurnoutVoteShareForensics()
    assert test.is_applicable(df["turnout_percentage"], context={"df": df})
    res = test.run(df["turnout_percentage"], context={"df": df})

    assert res.conformity_level in ("ANOMALOUS_CORRELATION", "MODERATE_CORRELATION")
    assert res.metadata["extreme_clusters"] >= 15
    assert res.flagged_count >= 15


def test_forensics_analyzer_and_api(tmp_path):
    """Verifies full analyzer service and FastAPI endpoint integration."""
    csv_path = tmp_path / "forensic_demo.csv"
    df = pd.DataFrame({
        "population": [1.025**i for i in range(1, 201)],
        "wage_rate": [int(1.03**i) * 10 for i in range(1, 201)],
    })
    df.to_csv(csv_path, index=False)

    analyzer = ForensicAnalyzer()
    res = analyzer.analyze_dataset(df)
    assert "population" in res["columns_analyzed"]
    assert res["total_tests_run"] >= 3

    # Test via FastAPI test client
    resp = client.post("/ml/forensics/analyze", json={"file_path": str(csv_path)})
    assert resp.status_code == 200
    payload = resp.json()
    assert payload["success"] is True
    assert "columns_analyzed" in payload["data"]
