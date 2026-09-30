"""
Explainability & Faithfulness Module (Contribution C4).
Provides local and global attributions (SHAP, DIFFI, perturbation),
counterfactual generation, and faithfulness/stability metrics.
"""

from app.explainability.base import (
    ExplanationResult,
    FaithfulnessMetrics,
    StabilityMetrics,
    CounterfactualResult,
)
from app.explainability.diffi import DIFFIExplainer
from app.explainability.shap_explainer import ShapExplainer
from app.explainability.counterfactual import CounterfactualGenerator
from app.explainability.evaluator import FaithfulnessEvaluator
from app.explainability.service import ExplainabilityService

__all__ = [
    "ExplanationResult",
    "FaithfulnessMetrics",
    "StabilityMetrics",
    "CounterfactualResult",
    "DIFFIExplainer",
    "ShapExplainer",
    "CounterfactualGenerator",
    "FaithfulnessEvaluator",
    "ExplainabilityService",
]
