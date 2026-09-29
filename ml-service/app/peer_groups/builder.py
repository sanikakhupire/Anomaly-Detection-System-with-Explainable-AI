"""
========================================================================================
RESEARCH CONTRIBUTION C2: HIERARCHY-AWARE PEER-GROUP BASELINES WITH EMPIRICAL SHRINKAGE
========================================================================================

Concept & Rationale:
In public socio-economic datasets (such as Census demographics, MGNREGA social safety
program records, and Election poll data), detecting anomalies using a monolithic global
distribution induces catastrophic false positives. Structural regional inequality
(e.g., remote mountainous tribal blocks vs. industrial urban centers) means that what is
an extreme outlier nationally may be entirely typical within its local administrative peer group.

1. Peer Group Formation:
Records are partitioned into peer groups using administrative hierarchy levels
(e.g., Block records within the same District, or District records within the same State).

2. Robust Statistics:
To prevent undetected outliers from contaminating group baselines, we use robust statistics:
  - Median: M_g = median(X_g)
  - Median Absolute Deviation (MAD): MAD_g = median(|X_g - M_g|)
  - Normalized MAD scale estimator: sigma_MAD = 1.4826 * MAD_g

3. The Small-Sample Challenge & James-Stein / Empirical Bayes Shrinkage:
When a peer group g contains only a small number of records (n_g < n_0, e.g. n_0 = 15),
sample estimates of median and MAD suffer from high sampling variance and erratic fluctuations.
To provide statistical regularization without discarding local structure, we apply empirical
shrinkage toward the higher-level parent group baseline (e.g. State baseline or Global baseline):

  Shrinkage factor:
    lambda_g = n_g / (n_g + n_0)  where lambda_g in [0, 1]

  Shrunk Median:
    M_g^{shrunk} = lambda_g * M_g + (1 - lambda_g) * M_{parent}

  Shrunk MAD:
    MAD_g^{shrunk} = lambda_g * MAD_g + (1 - lambda_g) * MAD_{parent}

  Interpretation:
  - Large groups (n_g >> n_0): lambda_g -> 1, retaining pure local group baselines.
  - Small groups (n_g << n_0): lambda_g -> 0, regularizing toward robust parent baselines.
  - Small groups (n_g < n_min, e.g. n < 5) are explicitly flagged (isSmallGroup=True)
    so downstream triage models (ATPI) and reviewers can evaluate sample size context.
========================================================================================
"""

from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd


def compute_median_and_mad(series: pd.Series) -> Dict[str, float]:
    """Computes sample median and Median Absolute Deviation (MAD)."""
    valid = series.dropna()
    if valid.empty:
        return {"median": 0.0, "mad": 0.0}

    med = float(np.median(valid))
    mad = float(np.median(np.abs(valid - med)))
    # Normalizing MAD by 1.4826 gives consistency with std under normal distribution
    return {
        "median": round(med, 4),
        "mad": round(mad, 4),
        "norm_mad": round(1.4826 * mad, 4),
    }


def build_peer_groups(
    df: pd.DataFrame,
    group_col: str,
    feature_cols: List[str],
    parent_col: Optional[str] = None,
    shrinkage_n0: int = 15,
    min_group_size: int = 5,
) -> Dict[str, Any]:
    """
    Builds hierarchy-aware peer groups, computes robust median/MAD,
    applies shrinkage toward parent groups for small cohorts,
    and returns comprehensive baselines.
    """
    if group_col not in df.columns:
        raise ValueError(f"Group column '{group_col}' not found in dataset")

    # Filter to existing numeric feature columns
    valid_features = [
        col for col in feature_cols if col in df.columns and pd.api.types.is_numeric_dtype(df[col])
    ]
    if not valid_features:
        # Fallback to all numeric columns if none specified
        valid_features = [
            col for col in df.columns if pd.api.types.is_numeric_dtype(df[col]) and col != group_col
        ]

    # 1. Global Baselines
    global_baselines = {}
    for feat in valid_features:
        global_baselines[feat] = compute_median_and_mad(df[feat])

    # 2. Parent Group Baselines (e.g. State level if grouping by District)
    has_parent = bool(parent_col and parent_col in df.columns and parent_col != group_col)
    parent_baselines: Dict[str, Dict[str, Dict[str, float]]] = {}
    if has_parent:
        for parent_val, p_group in df.groupby(parent_col):
            p_str = str(parent_val)
            parent_baselines[p_str] = {}
            for feat in valid_features:
                parent_baselines[p_str][feat] = compute_median_and_mad(p_group[feat])

    # 3. Peer Group Processing & Empirical Shrinkage
    peer_groups = []
    small_group_count = 0

    grouped = df.groupby(group_col)
    total_groups = len(grouped)

    for group_val, group_df in grouped:
        group_name = str(group_val)
        n_g = len(group_df)
        is_small = n_g < min_group_size
        if is_small:
            small_group_count += 1

        # Shrinkage factor lambda_g in [0, 1]
        lambda_g = n_g / (n_g + shrinkage_n0)

        # Identify parent value if available
        parent_val_str = None
        if has_parent:
            p_vals = group_df[parent_col].dropna().unique()
            if len(p_vals) > 0:
                parent_val_str = str(p_vals[0])

        feature_baselines = {}
        for feat in valid_features:
            raw_stats = compute_median_and_mad(group_df[feat])
            raw_median = raw_stats["median"]
            raw_mad = raw_stats["mad"]

            # Select parent reference (Parent group if present, otherwise global)
            if parent_val_str and parent_val_str in parent_baselines and feat in parent_baselines[parent_val_str]:
                ref_stats = parent_baselines[parent_val_str][feat]
            else:
                ref_stats = global_baselines[feat]

            ref_median = ref_stats["median"]
            ref_mad = ref_stats["mad"]

            # Shrinkage equation:
            # Shrunk = lambda * Raw + (1 - lambda) * Reference
            shrunk_median = (lambda_g * raw_median) + ((1.0 - lambda_g) * ref_median)
            shrunk_mad = (lambda_g * raw_mad) + ((1.0 - lambda_g) * ref_mad)

            feature_baselines[feat] = {
                "rawMedian": round(raw_median, 4),
                "rawMad": round(raw_mad, 4),
                "refMedian": round(ref_median, 4),
                "refMad": round(ref_mad, 4),
                "shrunkMedian": round(float(shrunk_median), 4),
                "shrunkMad": round(float(shrunk_mad), 4),
                "normShrunkMad": round(float(1.4826 * shrunk_mad), 4),
            }

        peer_groups.append({
            "groupName": group_name,
            "parentGroup": parent_val_str,
            "sampleCount": int(n_g),
            "shrinkageFactor": round(float(lambda_g), 4),
            "isSmallGroup": bool(is_small),
            "baselines": feature_baselines,
        })

    # Sort groups by sampleCount descending
    peer_groups.sort(key=lambda g: g["sampleCount"], reverse=True)

    return {
        "metadata": {
            "groupColumn": group_col,
            "parentColumn": parent_col if has_parent else None,
            "totalGroups": total_groups,
            "smallGroupCount": small_group_count,
            "shrinkageN0": shrinkage_n0,
            "minGroupSize": min_group_size,
            "featureColumns": valid_features,
        },
        "globalBaselines": global_baselines,
        "peerGroups": peer_groups,
    }
