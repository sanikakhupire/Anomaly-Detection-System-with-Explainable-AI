"""
Data structures for Explanation and Faithfulness evaluation (Contribution C4).
"""

from typing import Dict, Any, List, Optional, Tuple
import numpy as np


class CounterfactualResult:
    """Represents a minimal plausible adjustment returning an anomaly to peer normal."""

    def __init__(
        self,
        feature: str,
        original_value: float,
        counterfactual_value: float,
        delta: float,
        peer_median: float,
        peer_iqr: Tuple[float, float],
        direction: str,
        plausibility: bool = True,
    ):
        self.feature = feature
        self.original_value = float(original_value)
        self.counterfactual_value = float(counterfactual_value)
        self.delta = float(delta)
        self.peer_median = float(peer_median)
        self.peer_iqr = (float(peer_iqr[0]), float(peer_iqr[1]))
        self.direction = direction
        self.plausibility = plausibility

    def to_dict(self) -> Dict[str, Any]:
        return {
            "feature": self.feature,
            "original_value": round(self.original_value, 4),
            "counterfactual_value": round(self.counterfactual_value, 4),
            "delta": round(self.delta, 4),
            "peer_median": round(self.peer_median, 4),
            "peer_iqr": [round(self.peer_iqr[0], 4), round(self.peer_iqr[1], 4)],
            "direction": self.direction,
            "plausibility": self.plausibility,
        }


class FaithfulnessMetrics:
    """Evaluates whether feature attributions genuinely reflect the model's decision logic."""

    def __init__(
        self,
        deletion_auc: float,
        insertion_auc: float,
        comprehensiveness: float,
        sufficiency: float,
        deletion_curve: Optional[List[float]] = None,
        insertion_curve: Optional[List[float]] = None,
    ):
        self.deletion_auc = float(deletion_auc)
        self.insertion_auc = float(insertion_auc)
        self.comprehensiveness = float(comprehensiveness)
        self.sufficiency = float(sufficiency)
        self.deletion_curve = deletion_curve or []
        self.insertion_curve = insertion_curve or []

    def to_dict(self) -> Dict[str, Any]:
        return {
            "deletion_auc": round(self.deletion_auc, 4),
            "insertion_auc": round(self.insertion_auc, 4),
            "comprehensiveness": round(self.comprehensiveness, 4),
            "sufficiency": round(self.sufficiency, 4),
            "deletion_curve": [round(v, 4) for v in self.deletion_curve],
            "insertion_curve": [round(v, 4) for v in self.insertion_curve],
        }


class StabilityMetrics:
    """Evaluates attribution stability across perturbations, bootstraps, and ranking concordance."""

    def __init__(
        self,
        jaccard_stability: float,
        kendall_tau: float,
        top_k_features: Optional[List[str]] = None,
        explanation_coverage: float = 1.0,
    ):
        self.jaccard_stability = float(jaccard_stability)
        self.kendall_tau = float(kendall_tau)
        self.top_k_features = top_k_features or []
        self.explanation_coverage = float(explanation_coverage)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "jaccard_stability": round(self.jaccard_stability, 4),
            "kendall_tau": round(self.kendall_tau, 4),
            "top_k_features": self.top_k_features,
            "explanation_coverage": round(self.explanation_coverage, 4),
        }


class ExplanationResult:
    """Encapsulates full local explanation, counterfactuals, and quality metrics for an anomaly."""

    def __init__(
        self,
        record_index: int,
        top_features: List[Dict[str, Any]],
        shap_values: Dict[str, float],
        diffi_scores: Dict[str, float],
        perturbation_scores: Dict[str, float],
        plain_language_summary: str,
        counterfactuals: List[CounterfactualResult],
        faithfulness: FaithfulnessMetrics,
        stability: StabilityMetrics,
        stability_score: float,
        metadata: Optional[Dict[str, Any]] = None,
    ):
        self.record_index = record_index
        self.top_features = top_features
        self.shap_values = shap_values
        self.diffi_scores = diffi_scores
        self.perturbation_scores = perturbation_scores
        self.plain_language_summary = plain_language_summary
        self.counterfactuals = counterfactuals
        self.faithfulness = faithfulness
        self.stability = stability
        self.stability_score = float(stability_score)
        self.metadata = metadata or {}

    def to_dict(self) -> Dict[str, Any]:
        return {
            "record_index": self.record_index,
            "top_features": self.top_features,
            "shap_values": {k: round(float(v), 4) for k, v in self.shap_values.items()},
            "diffi_scores": {k: round(float(v), 4) for k, v in self.diffi_scores.items()},
            "perturbation_scores": {k: round(float(v), 4) for k, v in self.perturbation_scores.items()},
            "plain_language_summary": self.plain_language_summary,
            "counterfactuals": [cf.to_dict() for cf in self.counterfactuals],
            "faithfulness": self.faithfulness.to_dict(),
            "stability": self.stability.to_dict(),
            "stability_score": round(self.stability_score, 4),
            "metadata": self.metadata,
        }
