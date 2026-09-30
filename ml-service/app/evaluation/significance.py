"""
Statistical Significance Testing for Anomaly Detection Experiments (Contribution C9).
Implements Paired t-test, Wilcoxon Signed-Rank Test, Cohen's d effect size, and 95% CIs.
"""

from typing import Dict, Any, List, Union
import numpy as np
from scipy import stats


def calculate_significance(
    scores_proposed: Union[List[float], np.ndarray],
    scores_baseline: Union[List[float], np.ndarray],
    metric_name: str = "pr_auc",
    baseline_name: str = "Baseline",
) -> Dict[str, Any]:
    """
    Performs rigorous paired parametric and non-parametric hypothesis tests.
    H0: Proposed model performance is identical to baseline.
    H1: Proposed model outperforms baseline.
    """
    a = np.asarray(scores_proposed, dtype=float)
    b = np.asarray(scores_baseline, dtype=float)

    if len(a) != len(b):
        raise ValueError(f"Sample length mismatch: proposed ({len(a)}) vs baseline ({len(b)})")

    n = len(a)
    diff = a - b
    mean_diff = float(np.mean(diff))
    std_diff = float(np.std(diff, ddof=1)) if n > 1 else 0.0

    # Cohen's d effect size
    cohen_d = float(mean_diff / (std_diff + 1e-9)) if std_diff > 0 else 0.0

    # 95% Confidence Interval for mean difference
    if n > 1 and std_diff > 0:
        se = std_diff / np.sqrt(n)
        ci_lower = float(mean_diff - 1.96 * se)
        ci_upper = float(mean_diff + 1.96 * se)
    else:
        ci_lower = mean_diff
        ci_upper = mean_diff

    # 1. Paired Student's t-test
    t_stat = 0.0
    t_pvalue = 1.0
    if n >= 2 and std_diff > 0:
        try:
            t_res = stats.ttest_rel(a, b)
            t_stat = float(t_res.statistic)
            t_pvalue = float(t_res.pvalue)
        except Exception:
            pass

    # 2. Wilcoxon Signed-Rank Test (non-parametric)
    wilcoxon_stat = 0.0
    wilcoxon_pvalue = 1.0
    if n >= 5 and np.any(diff != 0):
        try:
            w_res = stats.wilcoxon(a, b, zero_method="wilcox")
            wilcoxon_stat = float(w_res.statistic)
            wilcoxon_pvalue = float(w_res.pvalue)
        except Exception:
            pass

    is_significant = bool(t_pvalue < 0.05 or wilcoxon_pvalue < 0.05)

    significance_level = "n.s."
    if t_pvalue < 0.001 or wilcoxon_pvalue < 0.001:
        significance_level = "*** (p < 0.001)"
    elif t_pvalue < 0.01 or wilcoxon_pvalue < 0.01:
        significance_level = "** (p < 0.01)"
    elif t_pvalue < 0.05 or wilcoxon_pvalue < 0.05:
        significance_level = "* (p < 0.05)"

    return {
        "metric": metric_name,
        "baseline_name": baseline_name,
        "sample_size": n,
        "mean_proposed": float(np.mean(a)),
        "mean_baseline": float(np.mean(b)),
        "mean_difference": mean_diff,
        "std_difference": std_diff,
        "cohen_d": cohen_d,
        "ci_95": [ci_lower, ci_upper],
        "paired_t_test": {
            "statistic": t_stat,
            "p_value": t_pvalue,
        },
        "wilcoxon_test": {
            "statistic": wilcoxon_stat,
            "p_value": wilcoxon_pvalue,
        },
        "is_significant": is_significant,
        "significance_level": significance_level,
    }
