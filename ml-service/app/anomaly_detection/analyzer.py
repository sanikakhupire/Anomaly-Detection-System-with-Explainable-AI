"""
Core Anomaly Analyzer Engine.
Coordinates data reading, feature selection, detector instantiation,
parallel execution, ensemble consensus combination, and structured record output.
"""

from typing import Dict, Any, List, Optional
import os
import numpy as np
import pandas as pd
from app.anomaly_detection.registry import DetectorRegistry
from app.anomaly_detection.base import BaseDetector


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
    max_records: Optional[int] = None
) -> Dict[str, Any]:
    """
    Execute statistical and machine-learning detectors on dataset.
    Returns per-record scores, flags, ensemble consensus, and summary metrics.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Dataset file not found at: {file_path}")

    # Read file chunk-friendly
    ext = os.path.splitext(file_path)[1].lower()
    if ext == ".csv":
        # Check size: if small read directly, if large read first chunk or iterate
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
                "detector_counts": {}
            },
            "records": []
        }

    # Identify numeric columns if not explicitly provided
    if not feature_cols:
        feature_cols = []
        for col in df.columns:
            if col in [peer_group_col, date_col]:
                continue
            # Check if column is numeric or can be converted to numeric
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

    # Weights for Phase 4 ensemble combination
    weights_dict = {
        "robust_z": 0.40,
        "isolation_forest": 0.35,
        "z_score": 0.15,
        "temporal": 0.10
    }

    active_detectors = []

    for d_name in detectors:
        try:
            if d_name == "z_score":
                det = DetectorRegistry.get(
                    "z_score",
                    peer_group_col=peer_group_col,
                    random_state=random_state
                )
            elif d_name == "robust_z":
                det = DetectorRegistry.get(
                    "robust_z",
                    peer_group_col=peer_group_col,
                    peer_baselines=peer_baselines,
                    random_state=random_state
                )
            elif d_name == "isolation_forest":
                det = DetectorRegistry.get(
                    "isolation_forest",
                    contamination=contamination,
                    random_state=random_state
                )
            elif d_name == "temporal":
                if not date_col or date_col not in df.columns:
                    continue
                det = DetectorRegistry.get(
                    "temporal",
                    date_col=date_col,
                    random_state=random_state
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

        except Exception as e:
            # If a detector fails, log and continue with remaining detectors
            continue

    if not active_detectors:
        raise RuntimeError("No detectors could be successfully initialized and executed.")

    # Re-normalize weights for active detectors
    total_w = sum(weights_dict.get(d, 0.25) for d in active_detectors)
    norm_weights = {d: weights_dict.get(d, 0.25) / total_w for d in active_detectors}

    # Compute ensemble score and overall is_anomaly
    ensemble_scores = np.zeros(n_records, dtype=float)
    for d_name in active_detectors:
        ensemble_scores += norm_weights[d_name] * detector_norm_scores[d_name]

    overall_is_anomaly = np.zeros(n_records, dtype=bool)
    detector_counts = {d: int(np.sum(detector_flags[d])) for d in active_detectors}

    for i in range(n_records):
        # A record is anomalous if ensemble score exceeds 0.50 OR any detector flags it
        any_flag = any(detector_flags[d][i] for d in active_detectors)
        overall_is_anomaly[i] = any_flag or (ensemble_scores[i] >= 0.50)

    total_anomalies = int(np.sum(overall_is_anomaly))
    anomaly_rate = float(total_anomalies / n_records) if n_records > 0 else 0.0

    # Format per-record results
    records_output = []
    # Identify key display columns (peer group, date, and first few features)
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
        flags_obj = {d: bool(detector_flags[d][i]) for d in active_detectors}

        records_output.append({
            "record_index": int(i),
            "record_data": rec_data,
            "detector_scores": scores_obj,
            "detector_flags": flags_obj,
            "ensemble_score": float(np.round(ensemble_scores[i], 4)),
            "is_anomaly": bool(overall_is_anomaly[i]),
            "flags": record_tags[i],
            "peer_group": p_grp
        })

    return {
        "summary": {
            "total_records": n_records,
            "total_anomalies": total_anomalies,
            "anomaly_rate": round(anomaly_rate, 4),
            "detector_counts": detector_counts,
            "active_detectors": active_detectors,
            "feature_cols_analyzed": feature_cols
        },
        "records": records_output
    }
