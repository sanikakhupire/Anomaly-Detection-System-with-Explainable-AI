"""
P-Value Fusion & False Discovery Rate (FDR) Control Module.

Combines per-detector p-values using:
1. ACAT (Aggregated Cauchy Association Test - robust under arbitrary detector dependence)
2. Fisher's Method (Chi-squared combination of log-transformed p-values)
3. Stouffer's Z-Score Method (Inverse standard normal CDF combination)

Controls Multiple Hypothesis Testing False Discovery Rate via:
1. Benjamini-Hochberg (BH) step-up procedure -> q-values
2. Benjamini-Yekutieli (BY) step-up procedure -> q-values under arbitrary dependence
"""

from typing import Dict, Any, List, Optional, Tuple, Union
import numpy as np
import scipy.stats as stats


def combine_pvalues_acat(
    p_matrix: np.ndarray,
    weights: Optional[np.ndarray] = None
) -> np.ndarray:
    """
    Combines p-values using the Aggregated Cauchy Association Test (ACAT).
    Formula:
        T = sum(w_k * tan((0.5 - p_k) * pi))
        p_combined = 0.5 - arctan(T) / pi

    Args:
        p_matrix: 2D array of shape (N_records, K_detectors) with values in (0, 1].
        weights: Optional 1D array of length K summing to 1.0.

    Returns:
        1D array of combined p-values of shape (N_records,).
    """
    p_mat = np.clip(np.asarray(p_matrix, dtype=float), 1e-15, 1.0 - 1e-15)
    n_samples, n_detectors = p_mat.shape

    if n_detectors == 1:
        return p_mat[:, 0]

    if weights is None:
        w = np.ones(n_detectors, dtype=float) / n_detectors
    else:
        w = np.asarray(weights, dtype=float)
        w = w / np.sum(w)

    # Cauchy transformation: tan((0.5 - p) * pi)
    # When p -> 0, tan -> +inf. When p = 0.5, tan = 0. When p -> 1, tan -> -inf.
    cauchy_transformed = np.tan((0.5 - p_mat) * np.pi)
    t_stat = np.dot(cauchy_transformed, w)

    # Survival function / CDF of standard Cauchy distribution:
    # F(t) = 0.5 + arctan(t) / pi  =>  P(T >= t) = 0.5 - arctan(t) / pi
    combined_p = 0.5 - (np.arctan(t_stat) / np.pi)

    # Clamp bounds to [1e-15, 1.0]
    return np.clip(combined_p, 1e-15, 1.0)


def combine_pvalues_fisher(
    p_matrix: np.ndarray,
    weights: Optional[np.ndarray] = None
) -> np.ndarray:
    """
    Fisher's combined probability test:
        X = -2 * sum(ln(p_k)) ~ Chi-squared(2 * K)
    """
    p_mat = np.clip(np.asarray(p_matrix, dtype=float), 1e-15, 1.0)
    n_samples, n_detectors = p_mat.shape

    if n_detectors == 1:
        return p_mat[:, 0]

    stat = -2.0 * np.sum(np.log(p_mat), axis=1)
    df = 2 * n_detectors
    combined_p = stats.chi2.sf(stat, df=df)
    return np.clip(combined_p, 1e-15, 1.0)


def combine_pvalues_stouffer(
    p_matrix: np.ndarray,
    weights: Optional[np.ndarray] = None
) -> np.ndarray:
    """
    Stouffer's Z-Score combination method:
        Z = sum(w_k * Phi^-1(1 - p_k)) / sqrt(sum(w_k^2))
    """
    p_mat = np.clip(np.asarray(p_matrix, dtype=float), 1e-15, 1.0 - 1e-15)
    n_samples, n_detectors = p_mat.shape

    if n_detectors == 1:
        return p_mat[:, 0]

    if weights is None:
        w = np.ones(n_detectors, dtype=float)
    else:
        w = np.asarray(weights, dtype=float)

    w_norm = w / np.sqrt(np.sum(w**2))

    # Standard normal quantile
    z_scores = stats.norm.ppf(1.0 - p_mat)
    combined_z = np.dot(z_scores, w_norm)
    combined_p = stats.norm.sf(combined_z)
    return np.clip(combined_p, 1e-15, 1.0)


def adjust_fdr_bh(p_values: np.ndarray) -> np.ndarray:
    """
    Benjamini-Hochberg (BH) Step-Up Procedure.
    Computes adjusted p-values (q-values) controlling the False Discovery Rate.

    q_(i) = min_{j >= i} ( (N / j) * p_(j) )
    """
    p_arr = np.asarray(p_values, dtype=float)
    n = len(p_arr)
    if n == 0:
        return np.array([])
    if n == 1:
        return np.copy(p_arr)

    # Sort p-values ascending and remember original permutation
    sorted_order = np.argsort(p_arr)
    sorted_p = p_arr[sorted_order]

    # Cumulative minimum from the right
    # (n / rank) * p_rank
    ranks = np.arange(1, n + 1, dtype=float)
    raw_q = (n / ranks) * sorted_p

    # Enforce monotonicity: q_(i) <= q_(i+1)
    # Iterating backwards
    q_vals = np.zeros(n, dtype=float)
    current_min = 1.0
    for idx in range(n - 1, -1, -1):
        current_min = min(current_min, raw_q[idx])
        q_vals[idx] = current_min

    # Map back to original row indices
    original_q = np.zeros(n, dtype=float)
    original_q[sorted_order] = np.clip(q_vals, 0.0, 1.0)
    return original_q


def adjust_fdr_by(p_values: np.ndarray) -> np.ndarray:
    """
    Benjamini-Yekutieli (BY) Step-Up Procedure.
    Guarantees FDR control under arbitrary, unknown dependence structures
    by dividing threshold by the harmonic sum: c(N) = sum_{i=1}^N (1 / i).
    """
    p_arr = np.asarray(p_values, dtype=float)
    n = len(p_arr)
    if n <= 1:
        return np.copy(p_arr)

    # Harmonic factor
    harmonic_c = np.sum(1.0 / np.arange(1, n + 1, dtype=float))

    # Compute BH q-values and scale by harmonic factor
    bh_q = adjust_fdr_bh(p_arr)
    by_q = np.clip(bh_q * harmonic_c, 0.0, 1.0)
    return by_q
