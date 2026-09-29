"""
Core Anomaly Analyzer Engine.
Coordinates data reading, feature selection, detector instantiation,
conformal calibration (C1), p-value fusion (ACAT/Fisher/Stouffer),
Benjamini-Hochberg False Discovery Rate (FDR) control, and ATPI triage ranking (C7).
"""

from typing import Dict, Any, List, Optional
import os
import numpy as np
import pandas as pd
from app.anomaly_detection.registry import DetectorRegistry
from app.anomaly_detection.base import BaseDetector
from app.calibration.conformal import ConformalCalibrator
from app.calibration.pvalue_fusion import (
    combine_pvalues_acat,
    combine_pvalues_fisher,
    combine_pvalues_stouffer,
    adjust_fdr_bh,
    adjust_fdr_by,
)
from app.calibration.atpi import ATPICalculator


def run_anomaly_analysis(
    file_path: str,
    feature_cols: Optional[List[str]] = None,
    peer_group_col: Optional[str] = None,
    peer_baselines: Optional[Dict[str, Any]] = None,
    date_col: Optional[str] = None,
    detectors: Optional[List[str]] = None,
    contamination: float = 0.05,
    random_state: int = 42,
    chunk_size: int = 10000,
    max_records: Optional[int] = None,
    fusion_method: str = "acat",
    fdr_method: str = "bh",
    target_fdr: float = 0.05,
    contamination_trim: float = 0.02,
) -> Dict[str, Any]:
    """
    Execute statistical and machine-learning detectors on dataset.
    Converts raw scores to conformal p-values, combines via ACAT,
    controls FDR via Benjamini-Hochberg, and computes ATPI priority.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Dataset file not found at: {file_path}")

    # Read file
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".csv":
        df = pd.read_csv(file_path, nrows=max_records)
    elif ext in [".xlsx", ".xls"]:
        df = pd.read_excel(file_path, nrows=max_records)
    else:
        raise ValueError(f"Unsupported file format: {ext}")

    n_records = len(df)
    if n_records == 0:
        return {
            "summary": {
                "total_records": 0,
                "total_anomalies": 0,
                "anomaly_rate": 0.0,
                "significant_fdr_count": 0,
                "target_fdr": target_fdr,
                "fusion_method": fusion_method.upper(),
                "fdr_method": fdr_method.upper(),
                "detector_counts": {},
                "p_value_distribution": [],
            },
            "records": [],
        }

    # Identify numeric columns if not explicitly provided
    if not feature_cols:
        feature_cols = []
        for col in df.columns:
            if col in [peer_group_col, date_col]:
                continue
            converted = pd.to_numeric(df[col], errors="coerce")
            if converted.notna().sum() > 0.5 * n_records:
                feature_cols.append(col)

    if not feature_cols:
        raise ValueError("No numeric feature columns found or specified for anomaly detection.")

    # Select detectors to execute
    if not detectors:
        detectors = ["robust_z", "isolation_forest", "z_score"]
        if date_col and date_col in df.columns:
            detectors.append("temporal")

    # Keep track of per-detector raw scores, normalized scores, and flags
    detector_raw_scores: Dict[str, np.ndarray] = {}
    detector_norm_scores: Dict[str, np.ndarray] = {}
    detector_flags: Dict[str, np.ndarray] = {}
    record_tags: List[List[str]] = [[] for _ in range(n_records)]

    weights_dict = {
        "robust_z": 0.40,
        "isolation_forest": 0.35,
        "z_score": 0.15,
        "temporal": 0.10,
    }

    active_detectors = []

    for d_name in detectors:
        try:
            if d_name == "z_score":
                det = DetectorRegistry.get(
                    "z_score",
                    peer_group_col=peer_group_col,
                    random_state=random_state,
                )
            elif d_name == "robust_z":
                det = DetectorRegistry.get(
                    "robust_z",
                    peer_group_col=peer_group_col,
                    peer_baselines=peer_baselines,
                    random_state=random_state,
                )
            elif d_name == "isolation_forest":
                det = DetectorRegistry.get(
                    "isolation_forest",
                    contamination=contamination,
                    random_state=random_state,
                )
            elif d_name == "temporal":
                if not date_col or date_col not in df.columns:
                    continue
                det = DetectorRegistry.get(
                    "temporal",
                    date_col=date_col,
                    random_state=random_state,
                )
            else:
                continue

            raw_sc, is_anom, tags = det.fit_score(df, feature_cols)
            detector_raw_scores[d_name] = raw_sc
            detector_norm_scores[d_name] = BaseDetector.min_max_normalize(raw_sc)
            detector_flags[d_name] = is_anom
            active_detectors.append(d_name)

            for i in range(n_records):
                for t in tags[i]:
                    if t not in record_tags[i]:
                        record_tags[i].append(t)

        except Exception:
            continue

    if not active_detectors:
        raise RuntimeError("No detectors could be successfully initialized and executed.")

    # 1. Conformal Calibration (C1): Convert raw scores to conformal p-values
    calibrator = ConformalCalibrator(
        contamination_trim=contamination_trim, random_state=random_state
    )
    calibrator.fit_calibration_scores(detector_raw_scores)
    detector_pvalues = calibrator.compute_pvalues(detector_raw_scores)

    # 2. Re-normalize detector weights
    total_w = sum(weights_dict.get(d, 0.25) for d in active_detectors)
    norm_weights = {d: weights_dict.get(d, 0.25) / total_w for d in active_detectors}
    norm_weights_arr = np.array([norm_weights[d] for d in active_detectors], dtype=float)

    # 3. Transparent Combined Normalized Score
    combined_scores = np.zeros(n_records, dtype=float)
    for d_name in active_detectors:
        combined_scores += norm_weights[d_name] * detector_norm_scores[d_name]

    # 4. Multi-Detector P-Value Fusion (ACAT / Fisher / Stouffer)
    p_mat = np.column_stack([detector_pvalues[d] for d in active_detectors])

    if fusion_method.lower() == "fisher":
        combined_p = combine_pvalues_fisher(p_mat, weights=norm_weights_arr)
    elif fusion_method.lower() == "stouffer":
        combined_p = combine_pvalues_stouffer(p_mat, weights=norm_weights_arr)
    else:
        # Default: ACAT (Aggregated Cauchy Association Test)
        combined_p = combine_pvalues_acat(p_mat, weights=norm_weights_arr)

    # 5. False Discovery Rate (FDR) Multiple Testing Correction (BH / BY)
    if fdr_method.lower() == "by":
        q_values = adjust_fdr_by(combined_p)
    else:
        q_values = adjust_fdr_bh(combined_p)

    # 6. ATPI Priority Calculation (C7)
    # Detect population column if present for demographic scale factor
    pop_col = None
    for col in df.columns:
        c_lower = col.lower()
        if any(k in c_lower for k in ["population", "workers", "electors", "households"]):
            pop_col = col
            break

    atpi_calc = ATPICalculator()
    atpi_results = []

    # Effect size proxy: maximum Robust Z score or normalized score * 4
    if "robust_z" in detector_raw_scores:
        effect_sizes = detector_raw_scores["robust_z"]
    else:
        effect_sizes = combined_scores * 4.0

    for i in range(n_records):
        is_peer_ctx = "PEER_GROUP_DEVIATION" in record_tags[i]
        pop_val = float(df.at[i, pop_col]) if (pop_col and pd.notna(df.at[i, pop_col])) else None

        atpi_res = atpi_calc.compute_atpi(
            q_value=q_values[i],
            effect_size=effect_sizes[i],
            is_peer_context=is_peer_ctx,
            population_value=pop_val,
        )
        atpi_results.append(atpi_res)

    # 7. Overall Anomaly Classification:
    # A record is anomalous if q_value <= target_fdr OR ensemble score >= 0.50 OR strongly flagged
    overall_is_anomaly = np.zeros(n_records, dtype=bool)
    detector_counts = {d: int(np.sum(detector_flags[d])) for d in active_detectors}

    for i in range(n_records):
        fdr_significant = q_values[i] <= target_fdr
        any_flag = any(detector_flags[d][i] for d in active_detectors)
        overall_is_anomaly[i] = fdr_significant or any_flag or (combined_scores[i] >= 0.50)

    total_anomalies = int(np.sum(overall_is_anomaly))
    significant_fdr_count = int(np.sum(q_values <= target_fdr))
    anomaly_rate = float(total_anomalies / n_records) if n_records > 0 else 0.0

    # 8. P-value distribution histogram (10 bins) for methodology visualization
    hist_counts, bin_edges = np.histogram(combined_p, bins=10, range=(0.0, 1.0))
    p_val_distribution = [
        {"bin": f"{bin_edges[b]:.1f}-{bin_edges[b+1]:.1f}", "count": int(hist_counts[b])}
        for b in range(10)
    ]

    # Format per-record results
    records_output = []
    display_cols = []
    if peer_group_col and peer_group_col in df.columns:
        display_cols.append(peer_group_col)
    if date_col and date_col in df.columns:
        display_cols.append(date_col)
    for col in feature_cols:
        if col not in display_cols and len(display_cols) < 8:
            display_cols.append(col)

    for i in range(n_records):
        rec_data = {}
        for col in display_cols:
            val = df.at[i, col]
            if pd.isna(val):
                rec_data[col] = None
            elif isinstance(val, (np.integer, int)):
                rec_data[col] = int(val)
            elif isinstance(val, (np.floating, float)):
                rec_data[col] = float(np.round(val, 4))
            else:
                rec_data[col] = str(val)

        p_grp = str(df.at[i, peer_group_col]) if (peer_group_col and peer_group_col in df.columns) else None

        scores_obj = {d: float(np.round(detector_raw_scores[d][i], 4)) for d in active_detectors}
        pvals_obj = {d: float(np.round(detector_pvalues[d][i], 6)) for d in active_detectors}
        flags_obj = {d: bool(detector_flags[d][i]) for d in active_detectors}

        # Contributing detection methods: detectors that flagged or had p < 0.05
        contrib_methods = [
            d for d in active_detectors if detector_flags[d][i] or detector_pvalues[d][i] < 0.05
        ]

        records_output.append({
            "record_index": int(i),
            "record_data": rec_data,
            "detector_scores": scores_obj,
            "detector_pvalues": pvals_obj,
            "detector_flags": flags_obj,
            "combined_p": float(np.round(combined_p[i], 6)),
            "q_value": float(np.round(q_values[i], 6)),
            "combined_score": float(np.round(combined_scores[i], 4)),
            "ensemble_score": float(np.round(combined_scores[i], 4)),
            "atpi": atpi_results[i]["atpi"],
            "atpi_breakdown": atpi_results[i]["breakdown"],
            "triage_priority": atpi_results[i]["priority"],
            "is_anomaly": bool(overall_is_anomaly[i]),
            "flags": record_tags[i],
            "peer_group": p_grp,
            "peer_context_flag": "PEER_GROUP_DEVIATION" in record_tags[i],
            "detection_methods": contrib_methods,
        })

    return {
        "summary": {
            "total_records": n_records,
            "total_anomalies": total_anomalies,
            "significant_fdr_count": significant_fdr_count,
            "anomaly_rate": round(anomaly_rate, 4),
            "target_fdr": target_fdr,
            "fusion_method": fusion_method.upper(),
            "fdr_method": fdr_method.upper(),
            "atpi_formula": ATPICalculator.FORMULA_DESCRIPTION,
            "detector_counts": detector_counts,
            "active_detectors": active_detectors,
            "feature_cols_analyzed": feature_cols,
            "p_value_distribution": p_val_distribution,
        },
        "records": records_output,
    }
