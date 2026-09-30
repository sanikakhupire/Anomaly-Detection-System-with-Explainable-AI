"""
Evaluation and Benchmarking Module for Research Contribution C9.
"""

from app.evaluation.metrics import calculate_metrics, precision_at_k, recall_at_k
from app.evaluation.significance import calculate_significance
from app.evaluation.latex_export import (
    generate_benchmark_latex,
    generate_ablation_latex,
    generate_significance_latex,
)

__all__ = [
    "calculate_metrics",
    "precision_at_k",
    "recall_at_k",
    "calculate_significance",
    "generate_benchmark_latex",
    "generate_ablation_latex",
    "generate_significance_latex",
]
