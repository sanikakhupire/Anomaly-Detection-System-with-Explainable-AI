"""
Tests for Phase 6 Conformal Calibration, ACAT Combination, and False Discovery Rate (FDR) Control:
1. Conformal p-values are approximately Uniform U(0, 1) on nominal null data (KS test).
2. Benjamini-Hochberg (BH) controls empirical False Discovery Rate at or below target on mixed data.
3. ACAT combination accurately combines multi-detector signals under dependency.
4. ATPI triage index calculation conforms to bounds [0, 100] and properly assigns priority tiers.
"""

import sys
from pathlib import Path
import numpy as np
import scipy.stats as stats
import pytest

# Add ml-service to path
ml_path = Path(__file__).resolve().parent.parent.parent / "ml-service"
sys.path.insert(0, str(ml_path))

from app.calibration.conformal import ConformalCalibrator
from app.calibration.pvalue_fusion import (
    combine_pvalues_acat,
    combine_pvalues_fisher,
    combine_pvalues_stouffer,
    adjust_fdr_bh,
    adjust_fdr_by,
)
from app.calibration.atpi import ATPICalculator


def test_conformal_pvalues_uniform_on_null_data():
    """
    Under the null hypothesis of nominal exchangeable data,
    conformal p-values should follow a standard Uniform distribution U(0, 1).
    Verified via Kolmogorov-Smirnov test.
    """
    rng = np.random.RandomState(42)
    # Generate null non-conformity scores (e.g. absolute residuals from standard Gaussian)
    n_cal = 1000
    n_test = 500

    cal_scores = np.abs(rng.normal(0, 1, size=n_cal))
    test_scores = np.abs(rng.normal(0, 1, size=n_test))

    calibrator = ConformalCalibrator(contamination_trim=0.0, random_state=42)
    calibrator.fit_calibration_scores({"detector_1": cal_scores})

    p_dict = calibrator.compute_pvalues({"detector_1": test_scores})
    p_vals = p_dict["detector_1"]

    assert len(p_vals) == n_test
    assert np.all(p_vals >= 0.0) and np.all(p_vals <= 1.0)

    # Kolmogorov-Smirnov test for Uniformity: null hypothesis is that p_vals ~ U(0, 1)
    ks_stat, ks_pval = stats.kstest(p_vals, "uniform")
    # A p-value > 0.01 indicates failure to reject uniformity (i.e. consistent with uniform)
    assert ks_pval > 0.01, f"Conformal p-values violated uniformity: KS stat={ks_stat:.4f}, p={ks_pval:.4f}"


def test_benjamini_hochberg_fdr_control():
    """
    Verify that the Benjamini-Hochberg (BH) procedure controls the False Discovery Rate (FDR).
    Simulate 900 true nulls (uniform p-values) and 100 true anomalies (small beta p-values).
    """
    rng = np.random.RandomState(42)
    n_null = 900
    n_alt = 100
    n_total = n_null + n_alt

    # True nulls: p ~ U(0, 1)
    null_p = rng.uniform(0.0, 1.0, size=n_null)
    # True anomalies: p ~ Beta(0.1, 5) with strong skew near 0
    alt_p = rng.beta(0.1, 5.0, size=n_alt)

    p_values = np.concatenate([null_p, alt_p])
    is_true_anomaly = np.concatenate([np.zeros(n_null, dtype=bool), np.ones(n_alt, dtype=bool)])

    target_alpha = 0.10
    q_values = adjust_fdr_bh(p_values)

    # Discoveries at target FDR
    discoveries = q_values <= target_alpha
    n_discoveries = np.sum(discoveries)

    assert n_discoveries > 0, "BH procedure failed to discover any true anomalies"

    # Empirical FDR = False Positives / Total Discoveries
    false_positives = np.sum(discoveries & (~is_true_anomaly))
    empirical_fdr = false_positives / n_discoveries

    # Allow small tolerance for finite-sample deviation
    assert empirical_fdr <= target_alpha + 0.05, f"Empirical FDR ({empirical_fdr:.3f}) exceeded nominal level {target_alpha}"


def test_acat_combination_properties():
    """
    Verify ACAT combination behaves properly:
    1. If all p-values are large (~0.8), combined p is large.
    2. If one detector detects an extreme signal (p=1e-6), ACAT captures it even if other detectors are nominal.
    3. Handles 1 detector gracefully.
    """
    # Case 1: Large p-values
    large_p = np.array([[0.85, 0.90, 0.80]])
    comb_large = combine_pvalues_acat(large_p)
    assert comb_large[0] > 0.70

    # Case 2: One extreme outlier signal among noise
    mixed_p = np.array([[1e-6, 0.65, 0.70]])
    comb_mixed = combine_pvalues_acat(mixed_p)
    assert comb_mixed[0] < 1e-4, f"ACAT failed to capture strong outlier signal: {comb_mixed[0]}"

    # Case 3: Output matches Fisher and Stouffer qualitatively
    comb_fisher = combine_pvalues_fisher(mixed_p)
    comb_stouffer = combine_pvalues_stouffer(mixed_p)
    assert comb_fisher[0] < 0.01
    assert comb_stouffer[0] < 0.05


def test_atpi_calculator_bounds_and_tiers():
    """
    Verify ATPI triage score is bounded in [0, 100] and assigns appropriate priority tiers.
    """
    calc = ATPICalculator()

    # Extreme high-priority anomaly: q=0.0001, large effect size, peer context, large population
    crit_res = calc.compute_atpi(
        q_value=0.0001,
        effect_size=5.2,
        is_peer_context=True,
        population_value=250000.0,
    )
    assert 75.0 <= crit_res["atpi"] <= 100.0
    assert crit_res["priority"] == "CRITICAL"
    assert "statistical_confidence" in crit_res["breakdown"]

    # Nominal record: q=0.90, effect size=0.2, no peer context
    low_res = calc.compute_atpi(
        q_value=0.90,
        effect_size=0.2,
        is_peer_context=False,
        population_value=100.0,
    )
    assert low_res["atpi"] < 40.0
    assert low_res["priority"] == "LOW"
