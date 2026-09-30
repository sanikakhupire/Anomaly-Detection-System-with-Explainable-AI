"""
Benchmark Runner and Experiment Lab Engine for Contribution C9.
Executes baseline models, proposed conformal ACAT framework, ablations,
and statistical significance testing on public and synthetic datasets.
"""

import hashlib
import json
from typing import Dict, Any, List, Optional, Tuple
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.neighbors import LocalOutlierFactor
from sklearn.covariance import EllipticEnvelope
from sklearn.svm import OneClassSVM
from sklearn.preprocessing import RobustScaler

from app.calibration.conformal import ConformalCalibrator
from app.calibration.pvalue_fusion import combine_pvalues_acat, adjust_fdr_bh
from app.calibration.atpi import ATPICalculator
from app.evaluation.metrics import calculate_metrics
from app.evaluation.significance import calculate_significance
from app.evaluation.latex_export import (
    generate_benchmark_latex,
    generate_ablation_latex,
    generate_significance_latex,
)
from app.experiments.synthetic import (
    generate_census_demo,
    generate_mgnrega_demo,
    generate_election_demo,
)


def _normalize_scores(scores: np.ndarray) -> np.ndarray:
    """Normalizes raw scores into [0, 1] interval."""
    s = np.asarray(scores, dtype=float)
    s = np.nan_to_num(s, nan=0.0, posinf=1.0, neginf=0.0)
    s_min = np.min(s)
    s_max = np.max(s)
    if s_max > s_min:
        return (s - s_min) / (s_max - s_min)
    return np.zeros_like(s)


class BenchmarkRunner:
    """
    Orchestrates end-to-end reproducible experiment benchmarking (Contribution C9).
    """

    MODEL_VERSION = "1.0.0-C9-experiment-lab"

    def __init__(self, seed: int = 42):
        self.seed = seed

    def generate_synthetic_dataset(
        self,
        domain: str = "MGNREGA",
        n_records: int = 500,
        severity: str = "medium",
        seed: Optional[int] = None,
    ) -> Tuple[pd.DataFrame, np.ndarray, List[str]]:
        """Generates synthetic dataset with ground-truth labels and returns (df, labels, feature_cols)."""
        run_seed = seed if seed is not None else self.seed
        domain_upper = (domain or "MGNREGA").upper()

        if "CENSUS" in domain_upper:
            df, all_labels = generate_census_demo(
                n_records=n_records, seed=run_seed, severity=severity
            )
            feature_cols = [
                "total_population",
                "male_population",
                "female_population",
                "literate_population",
                "households",
            ]
        elif "ELECTION" in domain_upper:
            df, all_labels = generate_election_demo(
                n_records=n_records, seed=run_seed, severity=severity
            )
            feature_cols = [
                "total_electors",
                "total_votes_polled",
                "valid_votes",
                "rejected_votes",
                "winning_votes",
                "margin",
            ]
        else:  # Default to MGNREGA
            df, all_labels = generate_mgnrega_demo(
                n_records=n_records, seed=run_seed, severity=severity
            )
            feature_cols = [
                "registered_workers",
                "active_workers",
                "workdays_generated",
                "total_wages_inr",
                "delayed_payment_days",
            ]

        # Extract numeric ground-truth labels
        gt_labels = np.array(
            [int(item.get("is_anomaly", False)) for item in all_labels], dtype=int
        )
        available_features = [col for col in feature_cols if col in df.columns]
        return df, gt_labels, available_features

    def run_baselines(
        self,
        X: np.ndarray,
        seed: int,
    ) -> Dict[str, np.ndarray]:
        """
        Runs classical outlier detectors and returns normalized anomaly scores [0, 1].
        """
        n_samples, n_features = X.shape
        scaler = RobustScaler()
        X_scaled = scaler.fit_transform(X)

        baseline_scores = {}

        # 1. Isolation Forest
        try:
            iso = IsolationForest(
                n_estimators=100,
                contamination="auto",
                random_state=seed,
            )
            iso.fit(X_scaled)
            baseline_scores["Isolation Forest"] = _normalize_scores(-iso.score_samples(X_scaled))
        except Exception:
            baseline_scores["Isolation Forest"] = np.zeros(n_samples)

        # 2. Local Outlier Factor (LOF)
        try:
            n_neighbors = min(20, max(5, n_samples - 1))
            lof = LocalOutlierFactor(n_neighbors=n_neighbors, novelty=True)
            lof.fit(X_scaled)
            baseline_scores["Local Outlier Factor"] = _normalize_scores(-lof.score_samples(X_scaled))
        except Exception:
            baseline_scores["Local Outlier Factor"] = np.zeros(n_samples)

        # 3. Robust Z-Score (Global Median / MAD without hierarchy)
        try:
            med = np.median(X, axis=0)
            mad = np.median(np.abs(X - med), axis=0)
            mad = np.where(mad == 0, 1.0, mad)
            z_robust = np.max(np.abs(X - med) / (1.4826 * mad), axis=1)
            baseline_scores["Robust Z-Score"] = _normalize_scores(z_robust)
        except Exception:
            baseline_scores["Robust Z-Score"] = np.zeros(n_samples)

        # 4. Mahalanobis Distance / EllipticEnvelope
        try:
            env = EllipticEnvelope(random_state=seed, support_fraction=0.8)
            env.fit(X_scaled)
            baseline_scores["Mahalanobis (Elliptic)"] = _normalize_scores(-env.score_samples(X_scaled))
        except Exception:
            # Fallback to squared Euclidean norm if singular
            baseline_scores["Mahalanobis (Elliptic)"] = _normalize_scores(np.sum(X_scaled ** 2, axis=1))

        # 5. One-Class SVM
        try:
            oc_svm = OneClassSVM(gamma="scale", nu=0.05)
            oc_svm.fit(X_scaled)
            baseline_scores["One-Class SVM"] = _normalize_scores(-oc_svm.score_samples(X_scaled))
        except Exception:
            baseline_scores["One-Class SVM"] = np.zeros(n_samples)

        return baseline_scores

    def run_proposed_framework(
        self,
        X: np.ndarray,
        baseline_scores: Dict[str, np.ndarray],
        seed: int,
        weights: Optional[Dict[str, float]] = None,
    ) -> Tuple[np.ndarray, np.ndarray, Dict[str, np.ndarray]]:
        """
        Runs the full proposed framework (Contributions C1, C2, C6, C7).
        Returns: (proposed_scores, atpi_scores, ablation_scores_dict)
        """
        n_samples = len(X)
        if weights is None:
            weights = {
                "robust_z": 0.40,
                "isolation_forest": 0.35,
                "z_score": 0.15,
                "temporal": 0.10,
            }

        # Step 1: Compute detector inputs
        s_rz = baseline_scores.get("Robust Z-Score", np.zeros(n_samples))
        s_if = baseline_scores.get("Isolation Forest", np.zeros(n_samples))
        s_lof = baseline_scores.get("Local Outlier Factor", np.zeros(n_samples))
        s_mah = baseline_scores.get("Mahalanobis (Elliptic)", np.zeros(n_samples))

        # Step 2: Conformal calibration (C1)
        calibrator = ConformalCalibrator(contamination_trim=0.02, random_state=seed)
        scores_dict = {
            "robust_z": s_rz,
            "isolation_forest": s_if,
            "lof": s_lof,
            "mahalanobis": s_mah,
        }
        calibrator.fit_calibration_scores(scores_dict)
        p_dict = calibrator.compute_pvalues(scores_dict)

        # Step 3: ACAT Fusion under adaptive weights (C1 + C6)
        p_matrix = np.column_stack([
            p_dict["robust_z"],
            p_dict["isolation_forest"],
            p_dict["lof"],
            p_dict["mahalanobis"],
        ])
        weight_vec = np.array([
            weights.get("robust_z", 0.40),
            weights.get("isolation_forest", 0.35),
            weights.get("z_score", 0.15),
            weights.get("temporal", 0.10),
        ])

        combined_p = combine_pvalues_acat(p_matrix, weights=weight_vec)
        q_values = adjust_fdr_bh(combined_p)

        # Proposed calibrated score: (1 - combined_p)
        proposed_scores = np.clip(1.0 - combined_p, 0.0, 1.0)

        # Step 4: ATPI Ranking (C7)
        atpi_calc = ATPICalculator()
        atpi_scores = np.zeros(n_samples)
        for i in range(n_samples):
            eff_size = float(s_rz[i] * 4.0)
            res = atpi_calc.compute_atpi(
                q_value=float(q_values[i]),
                effect_size=eff_size,
                is_peer_context=True,
                stability_score=0.85,
                evidence_score=0.90,
            )
            atpi_scores[i] = res["atpi"] / 100.0  # Normalized to [0, 1]

        # Step 5: Ablation Conditions
        # Ablation 1: No Conformal Calibration (raw uncalibrated score max)
        abl_no_conformal = np.maximum(s_rz, s_if)

        # Ablation 2: No Hierarchy / Local context (pure LOF global)
        abl_no_local = s_lof

        # Ablation 3: Uniform Detector Weights (equal 0.25 weights instead of Hedge)
        uniform_w = np.ones(4) / 4.0
        uniform_p = combine_pvalues_acat(p_matrix, weights=uniform_w)
        abl_uniform_weights = np.clip(1.0 - uniform_p, 0.0, 1.0)

        # Ablation 4: Score-Only Sorting (no ATPI triage)
        abl_no_atpi = proposed_scores

        ablations = {
            "Full Proposed Framework": atpi_scores,
            "Ablation 1 (No Conformal Calibration)": abl_no_conformal,
            "Ablation 2 (No Local Peer-Groups)": abl_no_local,
            "Ablation 3 (Uniform Detector Weights)": abl_uniform_weights,
            "Ablation 4 (No ATPI Triage Ranking)": abl_no_atpi,
        }

        return proposed_scores, atpi_scores, ablations

    def run_benchmark(
        self,
        df: pd.DataFrame,
        gt_labels: np.ndarray,
        feature_cols: List[str],
        dataset_name: str = "MGNREGA Synthetic",
        n_repetitions: int = 5,
    ) -> Dict[str, Any]:
        """
        Executes complete benchmark across seeds, computes metrics, significance tests,
        and generates publication-ready LaTeX tables (Hard Rule 7 & C9).
        """
        X = df[feature_cols].values.astype(float)
        # Impute NaNs with column medians
        col_med = np.nanmedian(X, axis=0)
        inds = np.where(np.isnan(X))
        X[inds] = np.take(col_med, inds[1])

        # Hashes for reproducibility (Hard Rule 7)
        data_hash = hashlib.sha256(df.to_csv(index=False).encode("utf-8")).hexdigest()
        config_payload = f"{dataset_name}|{','.join(feature_cols)}|{self.seed}|{n_repetitions}"
        config_hash = hashlib.sha256(config_payload.encode("utf-8")).hexdigest()

        # Multi-seed metrics accumulation
        repetition_seeds = [self.seed + i for i in range(n_repetitions)]
        all_baseline_metrics: Dict[str, List[Dict[str, float]]] = {}
        all_ablation_metrics: Dict[str, List[Dict[str, float]]] = {}
        proposed_pr_aucs: List[float] = []

        baseline_names = [
            "Proposed Calibrated Framework (Ours)",
            "Isolation Forest",
            "Local Outlier Factor",
            "Robust Z-Score",
            "Mahalanobis (Elliptic)",
            "One-Class SVM",
        ]
        for name in baseline_names:
            all_baseline_metrics[name] = []

        for r_seed in repetition_seeds:
            # 1. Run baselines
            baselines = self.run_baselines(X, seed=r_seed)

            # 2. Run proposed framework & ablations
            proposed_s, atpi_s, ablations = self.run_proposed_framework(
                X, baselines, seed=r_seed
            )

            # Evaluate Proposed (using ATPI ranking)
            prop_m = calculate_metrics(gt_labels, atpi_s)
            all_baseline_metrics["Proposed Calibrated Framework (Ours)"].append(prop_m)
            proposed_pr_aucs.append(prop_m["pr_auc"])

            # Evaluate Baselines
            for b_name, b_scores in baselines.items():
                if b_name in all_baseline_metrics:
                    m = calculate_metrics(gt_labels, b_scores)
                    all_baseline_metrics[b_name].append(m)

            # Evaluate Ablations
            for abl_name, abl_scores in ablations.items():
                if abl_name not in all_ablation_metrics:
                    all_ablation_metrics[abl_name] = []
                all_ablation_metrics[abl_name].append(calculate_metrics(gt_labels, abl_scores))

        # Average metrics across repetitions
        summary_baselines: Dict[str, Dict[str, float]] = {}
        for name, run_list in all_baseline_metrics.items():
            if not run_list:
                continue
            avg_dict: Dict[str, float] = {}
            metric_keys = run_list[0].keys()
            for k in metric_keys:
                avg_dict[k] = float(np.mean([m[k] for m in run_list]))
            summary_baselines[name] = avg_dict

        # Average ablation metrics
        summary_ablations: List[Dict[str, Any]] = []
        for abl_name, run_list in all_ablation_metrics.items():
            avg_pr = float(np.mean([m["pr_auc"] for m in run_list]))
            avg_roc = float(np.mean([m["roc_auc"] for m in run_list]))
            summary_ablations.append({
                "variant": abl_name,
                "pr_auc": avg_pr,
                "roc_auc": avg_roc,
            })

        # Pairwise Statistical Significance Tests
        significance_tests: List[Dict[str, Any]] = []
        for b_name in [
            "Isolation Forest",
            "Local Outlier Factor",
            "Robust Z-Score",
            "Mahalanobis (Elliptic)",
            "One-Class SVM",
        ]:
            b_pr_aucs = [m["pr_auc"] for m in all_baseline_metrics.get(b_name, [])]
            if len(b_pr_aucs) == len(proposed_pr_aucs) and len(proposed_pr_aucs) > 0:
                sig_res = calculate_significance(
                    scores_proposed=proposed_pr_aucs,
                    scores_baseline=b_pr_aucs,
                    metric_name="PR-AUC",
                    baseline_name=b_name,
                )
                significance_tests.append(sig_res)

        # Generate Publication LaTeX Tables
        latex_benchmark = generate_benchmark_latex(
            dataset_name=dataset_name,
            results_by_model=summary_baselines,
        )
        latex_ablation = generate_ablation_latex(
            ablation_results=summary_ablations,
        )
        latex_significance = generate_significance_latex(
            significance_results=significance_tests,
        )

        return {
            "dataset_name": dataset_name,
            "total_records": len(X),
            "feature_columns": feature_cols,
            "ground_truth_anomalies": int(np.sum(gt_labels)),
            "reproducibility": {
                "seed": self.seed,
                "n_repetitions": n_repetitions,
                "repetition_seeds": repetition_seeds,
                "data_hash": data_hash,
                "config_hash": config_hash,
                "model_version": self.MODEL_VERSION,
            },
            "baseline_summary": summary_baselines,
            "ablation_summary": summary_ablations,
            "significance_tests": significance_tests,
            "latex_tables": {
                "benchmark_table": latex_benchmark,
                "ablation_table": latex_ablation,
                "significance_table": latex_significance,
            },
        }
