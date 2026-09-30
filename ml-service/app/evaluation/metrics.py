"""
Evaluation Metrics for Statistical Anomaly Detection Benchmarks (Contribution C9).
Provides Precision@K, Recall@K, ROC-AUC, PR-AUC, F1, and Brier Score Calibration Loss.
"""

from typing import Dict, Any, List, Union
import numpy as np
from sklearn.metrics import (
    roc_auc_score,
    average_precision_score,
    f1_score,
    precision_score,
    recall_score,
    brier_score_loss,
)


def precision_at_k(y_true: np.ndarray, y_scores: np.ndarray, k: int) -> float:
    """Computes Precision@K: fraction of top-K scored records that are true anomalies."""
    if len(y_true) == 0 or k <= 0:
        return 0.0
    effective_k = min(k, len(y_true))
    top_indices = np.argsort(y_scores)[::-1][:effective_k]
    return float(np.mean(y_true[top_indices]))


def recall_at_k(y_true: np.ndarray, y_scores: np.ndarray, k: int) -> float:
    """Computes Recall@K: fraction of total true anomalies recovered in top-K scored records."""
    total_positives = np.sum(y_true)
    if total_positives == 0 or len(y_true) == 0 or k <= 0:
        return 0.0
    effective_k = min(k, len(y_true))
    top_indices = np.argsort(y_scores)[::-1][:effective_k]
    true_positives_in_k = np.sum(y_true[top_indices])
    return float(true_positives_in_k / total_positives)


def calculate_metrics(
    y_true: Union[List[int], np.ndarray],
    y_scores: Union[List[float], np.ndarray],
    k_list: List[int] = None,
    threshold: float = 0.5,
) -> Dict[str, float]:
    """
    Computes a comprehensive dictionary of ranking, detection, and calibration metrics.
    """
    if k_list is None:
        k_list = [5, 10, 20]

    y_t = np.asarray(y_true, dtype=int)
    y_s = np.asarray(y_scores, dtype=float)

    # Clean NaNs / Infs
    y_s = np.nan_to_num(y_s, nan=0.0, posinf=1.0, neginf=0.0)

    total_records = len(y_t)
    total_anomalies = int(np.sum(y_t))

    metrics: Dict[str, float] = {
        "total_records": float(total_records),
        "total_anomalies": float(total_anomalies),
        "anomaly_rate": float(total_anomalies / total_records) if total_records > 0 else 0.0,
    }

    if total_anomalies == 0 or total_anomalies == total_records:
        metrics.update({
            "roc_auc": 0.5,
            "pr_auc": 0.0,
            "f1": 0.0,
            "precision": 0.0,
            "recall": 0.0,
            "brier_score": 0.0,
        })
        for k in k_list:
            metrics[f"precision@{k}"] = 0.0
            metrics[f"recall@{k}"] = 0.0
        return metrics

    # 1. ROC-AUC
    try:
        metrics["roc_auc"] = float(roc_auc_score(y_t, y_s))
    except Exception:
        metrics["roc_auc"] = 0.5

    # 2. PR-AUC (Average Precision)
    try:
        metrics["pr_auc"] = float(average_precision_score(y_t, y_s))
    except Exception:
        metrics["pr_auc"] = 0.0

    # 3. Precision@K and Recall@K
    for k in k_list:
        metrics[f"precision@{k}"] = precision_at_k(y_t, y_s, k)
        metrics[f"recall@{k}"] = recall_at_k(y_t, y_s, k)

    # 4. Binary metrics at specified threshold
    y_pred = (y_s >= threshold).astype(int)
    metrics["precision"] = float(precision_score(y_t, y_pred, zero_division=0))
    metrics["recall"] = float(recall_score(y_t, y_pred, zero_division=0))
    metrics["f1"] = float(f1_score(y_t, y_pred, zero_division=0))

    # 5. Brier Score Calibration Loss (clipped to [0, 1])
    y_s_clipped = np.clip(y_s, 0.0, 1.0)
    try:
        metrics["brier_score"] = float(brier_score_loss(y_t, y_s_clipped))
    except Exception:
        metrics["brier_score"] = float(np.mean((y_s_clipped - y_t) ** 2))

    return metrics
