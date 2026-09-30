"""
FastAPI Router for Experiment Lab & Research Benchmarks (Contribution C9).
Exposes endpoints for running baseline suites, ablations, significance tests, and LaTeX exports.
"""

from fastapi import APIRouter, HTTPException, status
from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np

from app.experiments.benchmark_runner import BenchmarkRunner
from app.evaluation.latex_export import (
    generate_benchmark_latex,
    generate_ablation_latex,
    generate_significance_latex,
)

router = APIRouter(prefix="/ml/experiments", tags=["Experiment Lab (C9)"])


@router.post("/run-benchmark")
def run_benchmark(payload: Dict[str, Any]):
    """
    Executes a seeded benchmark comparing the proposed framework against classical baselines,
    computes ablation studies and Wilcoxon/paired t-test significance tests.
    """
    try:
        domain = payload.get("domain", "MGNREGA")
        n_records = int(payload.get("n_records", 300))
        severity = payload.get("severity", "medium")
        seed = int(payload.get("seed", 42))
        n_repetitions = int(payload.get("n_repetitions", 5))

        custom_data = payload.get("custom_data")
        ground_truth = payload.get("ground_truth")
        feature_columns = payload.get("feature_columns")

        runner = BenchmarkRunner(seed=seed)

        if custom_data and ground_truth and feature_columns:
            df = pd.DataFrame(custom_data)
            gt_labels = np.asarray(ground_truth, dtype=int)
            features = feature_columns
            dataset_name = payload.get("dataset_name", "Custom Dataset")
        else:
            df, gt_labels, features = runner.generate_synthetic_dataset(
                domain=domain,
                n_records=n_records,
                severity=severity,
                seed=seed,
            )
            dataset_name = f"{domain.upper()} Synthetic Benchmark"

        results = runner.run_benchmark(
            df=df,
            gt_labels=gt_labels,
            feature_cols=features,
            dataset_name=dataset_name,
            n_repetitions=n_repetitions,
        )

        return {
            "success": True,
            "message": "Benchmark experiment completed successfully",
            "data": results,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Benchmark execution failed: {str(e)}",
        )


@router.post("/synthetic-generate")
def generate_synthetic(payload: Dict[str, Any]):
    """
    Generates a synthetic public dataset with calibrated ground-truth anomaly injection.
    """
    try:
        domain = payload.get("domain", "MGNREGA")
        n_records = int(payload.get("n_records", 200))
        severity = payload.get("severity", "medium")
        seed = int(payload.get("seed", 42))

        runner = BenchmarkRunner(seed=seed)
        df, gt_labels, features = runner.generate_synthetic_dataset(
            domain=domain,
            n_records=n_records,
            severity=severity,
            seed=seed,
        )

        records = df.head(100).to_dict(orient="records")
        return {
            "success": True,
            "domain": domain,
            "total_records": len(df),
            "total_anomalies": int(np.sum(gt_labels)),
            "anomaly_rate": float(np.mean(gt_labels)),
            "features": features,
            "sample_records": records,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Synthetic generation failed: {str(e)}",
        )


@router.post("/export-latex")
def export_latex(payload: Dict[str, Any]):
    """
    Exports LaTeX tables for provided experiment results.
    """
    try:
        benchmark_results = payload.get("benchmark_summary", {})
        ablation_results = payload.get("ablation_summary", [])
        significance_results = payload.get("significance_tests", [])
        dataset_name = payload.get("dataset_name", "Public Benchmark")

        b_latex = generate_benchmark_latex(dataset_name, benchmark_results)
        a_latex = generate_ablation_latex(ablation_results)
        s_latex = generate_significance_latex(significance_results)

        return {
            "success": True,
            "latex_tables": {
                "benchmark_table": b_latex,
                "ablation_table": a_latex,
                "significance_table": s_latex,
            },
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"LaTeX export failed: {str(e)}",
        )
