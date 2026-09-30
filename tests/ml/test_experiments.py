"""
Unit Tests for Experiment Lab & Research Benchmarking (Contribution C9).
Tests metrics calculation, significance hypothesis testing, LaTeX exporters, and benchmark runner.
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

from app.evaluation.metrics import calculate_metrics, precision_at_k, recall_at_k
from app.evaluation.significance import calculate_significance
from app.evaluation.latex_export import (
    generate_benchmark_latex,
    generate_ablation_latex,
    generate_significance_latex,
)
from app.experiments.benchmark_runner import BenchmarkRunner
from app.main import app

client = TestClient(app)


def test_evaluation_metrics():
    """Tests evaluation metrics: ROC-AUC, PR-AUC, P@K, R@K, and Brier Loss."""
    y_true = np.array([0, 0, 0, 0, 1, 0, 1, 0, 1, 1])
    y_scores = np.array([0.1, 0.2, 0.15, 0.3, 0.85, 0.25, 0.9, 0.05, 0.95, 0.8])

    metrics = calculate_metrics(y_true, y_scores, k_list=[2, 4])

    assert metrics["roc_auc"] > 0.8
    assert metrics["pr_auc"] > 0.7
    assert metrics["precision@2"] == 1.0  # Top 2 scores (0.95, 0.9) are both 1s
    assert metrics["recall@2"] == 0.5     # 2 out of 4 anomalies recovered
    assert "brier_score" in metrics
    assert metrics["brier_score"] < 0.2


def test_significance_testing():
    """Tests Paired Student's t-test, Wilcoxon Signed-Rank, Cohen's d, and 95% CIs."""
    proposed = np.array([0.88, 0.85, 0.90, 0.87, 0.89, 0.91])
    baseline = np.array([0.72, 0.70, 0.75, 0.71, 0.73, 0.74])

    sig = calculate_significance(
        scores_proposed=proposed,
        scores_baseline=baseline,
        metric_name="PR-AUC",
        baseline_name="Isolation Forest",
    )

    assert sig["is_significant"] is True
    assert sig["mean_difference"] > 0.10
    assert sig["cohen_d"] > 2.0  # Very large positive effect size
    assert sig["paired_t_test"]["p_value"] < 0.001
    assert sig["wilcoxon_test"]["p_value"] < 0.05
    assert len(sig["ci_95"]) == 2
    assert sig["ci_95"][0] > 0  # Confidence interval strictly positive


def test_latex_export():
    """Tests IEEE publication-ready LaTeX table formatters."""
    results_by_model = {
        "Proposed Calibrated Framework (Ours)": {
            "pr_auc": 0.895,
            "roc_auc": 0.942,
            "precision@10": 0.900,
            "recall@10": 0.750,
            "f1": 0.825,
            "brier_score": 0.045,
        },
        "Isolation Forest": {
            "pr_auc": 0.725,
            "roc_auc": 0.810,
            "precision@10": 0.600,
            "recall@10": 0.500,
            "f1": 0.650,
            "brier_score": 0.120,
        },
    }

    latex_bm = generate_benchmark_latex("MGNREGA Synthetic", results_by_model)
    assert r"\begin{table*}" in latex_bm
    assert r"\textbf{PR-AUC}" in latex_bm
    assert "Proposed Calibrated Framework" in latex_bm
    assert r"\end{table*}" in latex_bm

    ablation_results = [
        {"variant": "Full Proposed Framework", "pr_auc": 0.895, "roc_auc": 0.942},
        {"variant": "Ablation 1 (No Conformal)", "pr_auc": 0.780, "roc_auc": 0.840},
    ]
    latex_abl = generate_ablation_latex(ablation_results)
    assert r"\begin{table}" in latex_abl
    assert "Ablation 1" in latex_abl

    sig_results = [
        {
            "baseline_name": "Isolation Forest",
            "mean_difference": 0.170,
            "cohen_d": 4.5,
            "paired_t_test": {"p_value": 0.0001},
            "wilcoxon_test": {"p_value": 0.002},
        }
    ]
    latex_sig = generate_significance_latex(sig_results)
    assert r"\begin{table}" in latex_sig
    assert "Isolation Forest" in latex_sig


def test_benchmark_runner_synthetic():
    """Tests synthetic dataset generation with injected ground truth for experiments."""
    runner = BenchmarkRunner(seed=42)
    df, gt, features = runner.generate_synthetic_dataset(
        domain="MGNREGA", n_records=60, severity="high", seed=42
    )

    assert len(df) == 60
    assert len(gt) == 60
    assert np.sum(gt) > 0  # Contains anomalies
    assert len(features) > 0


def test_benchmark_runner_execution():
    """Tests end-to-end benchmark execution, metric summaries, and reproducibility hashes."""
    runner = BenchmarkRunner(seed=123)
    df, gt, features = runner.generate_synthetic_dataset(
        domain="MGNREGA", n_records=50, severity="high", seed=123
    )

    res = runner.run_benchmark(
        df=df,
        gt_labels=gt,
        feature_cols=features,
        dataset_name="Test Synthetic Benchmark",
        n_repetitions=2,
    )

    assert res["dataset_name"] == "Test Synthetic Benchmark"
    assert "reproducibility" in res
    assert res["reproducibility"]["seed"] == 123
    assert res["reproducibility"]["data_hash"] is not None
    assert res["reproducibility"]["config_hash"] is not None
    assert res["reproducibility"]["model_version"] == BenchmarkRunner.MODEL_VERSION

    # Check baseline summaries
    assert "Proposed Calibrated Framework (Ours)" in res["baseline_summary"]
    assert "Isolation Forest" in res["baseline_summary"]
    prop_pr = res["baseline_summary"]["Proposed Calibrated Framework (Ours)"]["pr_auc"]
    assert 0.0 <= prop_pr <= 1.0

    # Check ablations and significance
    assert len(res["ablation_summary"]) >= 4
    assert len(res["significance_tests"]) >= 2

    # Check LaTeX tables
    assert "benchmark_table" in res["latex_tables"]
    assert "ablation_table" in res["latex_tables"]
    assert "significance_table" in res["latex_tables"]


def test_fastapi_experiments_endpoint():
    """Tests FastAPI /ml/experiments/run-benchmark endpoint."""
    payload = {
        "domain": "MGNREGA",
        "n_records": 40,
        "severity": "high",
        "seed": 99,
        "n_repetitions": 2,
    }

    response = client.post("/ml/experiments/run-benchmark", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert data["success"] is True
    assert "data" in data
    assert "reproducibility" in data["data"]
    assert "baseline_summary" in data["data"]
