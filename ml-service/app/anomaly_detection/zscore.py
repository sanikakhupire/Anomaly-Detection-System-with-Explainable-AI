"""
Z-score and Robust Z-score detectors (both global and hierarchy-aware peer group baselines).

Mathematical formulations:
1. Standard Z-Score:
   Z = (x - mean) / (std + eps)
   Flagged if |Z| > threshold (default: 3.0)

2. Robust Z-Score (Boris Iglewicz and David Hoaglin formulation):
   Z_rob = 0.6745 * (x - median) / (MAD + eps)
   where MAD = median(|x - median|)
   When peer groups are available:
   Z_peer = 0.6745 * (x - median_group) / (MAD_group + eps)
   Flagged if |Z_rob| > threshold (default: 3.5)
"""

from typing import Dict, Any, List, Tuple, Optional
import numpy as np
import pandas as pd
from app.anomaly_detection.base import BaseDetector
from app.anomaly_detection.registry import DetectorRegistry


@DetectorRegistry.register("z_score")
class ZScoreDetector(BaseDetector):
    """
    Standard Z-Score anomaly detector.
    Evaluates deviation from mean in units of standard deviation.
    """
    def __init__(
        self,
        threshold: float = 3.0,
        random_state: int = 42,
        peer_group_col: Optional[str] = None
    ):
        super().__init__(name="z_score", params={"threshold": threshold, "peer_group_col": peer_group_col}, random_state=random_state)
        self.threshold = threshold
        self.peer_group_col = peer_group_col
        self.means_: Dict[str, float] = {}
        self.stds_: Dict[str, float] = {}
        self.group_means_: Dict[str, Dict[str, float]] = {}
        self.group_stds_: Dict[str, Dict[str, float]] = {}

    def fit(self, df: pd.DataFrame, feature_cols: List[str], **kwargs) -> "ZScoreDetector":
        self.means_ = {}
        self.stds_ = {}
        self.group_means_ = {}
        self.group_stds_ = {}

        for col in feature_cols:
            if col in df.columns:
                series = pd.to_numeric(df[col], errors="coerce").dropna()
                self.means_[col] = float(series.mean()) if len(series) > 0 else 0.0
                std_val = float(series.std(ddof=1)) if len(series) > 1 else 1.0
                self.stds_[col] = std_val if std_val > 1e-9 else 1.0

        if self.peer_group_col and self.peer_group_col in df.columns:
            for group_id, grp_df in df.groupby(self.peer_group_col):
                grp_key = str(group_id)
                self.group_means_[grp_key] = {}
                self.group_stds_[grp_key] = {}
                for col in feature_cols:
                    if col in grp_df.columns:
                        grp_series = pd.to_numeric(grp_df[col], errors="coerce").dropna()
                        self.group_means_[grp_key][col] = float(grp_series.mean()) if len(grp_series) > 0 else self.means_.get(col, 0.0)
                        grp_std = float(grp_series.std(ddof=1)) if len(grp_series) > 1 else self.stds_.get(col, 1.0)
                        self.group_stds_[grp_key][col] = grp_std if grp_std > 1e-9 else self.stds_.get(col, 1.0)

        self.is_fitted = True
        return self

    def score(
        self, df: pd.DataFrame, feature_cols: List[str], **kwargs
    ) -> Tuple[np.ndarray, np.ndarray, List[List[str]]]:
        n = len(df)
        if n == 0 or not feature_cols:
            return np.zeros(0), np.zeros(0, dtype=bool), []

        max_abs_z = np.zeros(n, dtype=float)
        is_anomaly = np.zeros(n, dtype=bool)
        flag_tags: List[List[str]] = [[] for _ in range(n)]

        has_groups = bool(self.peer_group_col and self.peer_group_col in df.columns)

        for col in feature_cols:
            if col not in self.means_:
                continue
            raw_vals = pd.to_numeric(df[col], errors="coerce").fillna(self.means_[col]).values

            if has_groups:
                groups = df[self.peer_group_col].astype(str).values
                col_means = np.array([
                    self.group_means_.get(g, {}).get(col, self.means_[col]) for g in groups
                ])
                col_stds = np.array([
                    self.group_stds_.get(g, {}).get(col, self.stds_[col]) for g in groups
                ])
                col_stds = np.where(col_stds < 1e-9, 1.0, col_stds)
                z_vals = np.abs((raw_vals - col_means) / col_stds)
            else:
                z_vals = np.abs((raw_vals - self.means_[col]) / self.stds_[col])

            max_abs_z = np.maximum(max_abs_z, z_vals)

            flagged_indices = np.where(z_vals > self.threshold)[0]
            for idx in flagged_indices:
                is_anomaly[idx] = True
                tag = f"Z_SCORE_DEVIATION_{col.upper()}"
                if tag not in flag_tags[idx]:
                    flag_tags[idx].append(tag)
                if has_groups and "PEER_Z_OUTLIER" not in flag_tags[idx]:
                    flag_tags[idx].append("PEER_Z_OUTLIER")

        return max_abs_z, is_anomaly, flag_tags


@DetectorRegistry.register("robust_z")
class RobustZScoreDetector(BaseDetector):
    """
    Robust Z-Score Anomaly Detector based on Median and Median Absolute Deviation (MAD).
    Supports both global baselines and peer-group regularized baselines.
    Formula: Z_rob = 0.6745 * (x - median) / (MAD + 1e-9)
    """
    def __init__(
        self,
        threshold: float = 3.5,
        random_state: int = 42,
        peer_group_col: Optional[str] = None,
        peer_baselines: Optional[Dict[str, Any]] = None
    ):
        super().__init__(name="robust_z", params={"threshold": threshold, "peer_group_col": peer_group_col}, random_state=random_state)
        self.threshold = threshold
        self.peer_group_col = peer_group_col
        self.peer_baselines = peer_baselines or {}
        self.global_medians_: Dict[str, float] = {}
        self.global_mads_: Dict[str, float] = {}
        self.group_medians_: Dict[str, Dict[str, float]] = {}
        self.group_mads_: Dict[str, Dict[str, float]] = {}

    def fit(self, df: pd.DataFrame, feature_cols: List[str], **kwargs) -> "RobustZScoreDetector":
        self.global_medians_ = {}
        self.global_mads_ = {}
        self.group_medians_ = {}
        self.group_mads_ = {}

        # 1. Global Medians and MADs
        for col in feature_cols:
            if col in df.columns:
                series = pd.to_numeric(df[col], errors="coerce").dropna()
                if len(series) > 0:
                    med = float(series.median())
                    mad = float((series - med).abs().median())
                else:
                    med, mad = 0.0, 1.0
                self.global_medians_[col] = med
                self.global_mads_[col] = mad if mad > 1e-9 else 1.0

        # 2. Peer group baselines
        # If pre-computed peer baselines (e.g. with empirical shrinkage from builder.py) are passed in:
        if self.peer_baselines:
            # Structure from builder: { group_id: { "baselines": { col: { "shrunken_median": ..., "shrunken_mad": ... } } } }
            for grp_id, grp_data in self.peer_baselines.items():
                grp_key = str(grp_id)
                self.group_medians_[grp_key] = {}
                self.group_mads_[grp_key] = {}
                baselines = grp_data.get("baselines", {})
                for col in feature_cols:
                    if col in baselines:
                        b = baselines[col]
                        med_val = b.get("shrunken_median", b.get("raw_median", self.global_medians_.get(col, 0.0)))
                        mad_val = b.get("shrunken_mad", b.get("raw_mad", self.global_mads_.get(col, 1.0)))
                        self.group_medians_[grp_key][col] = float(med_val)
                        self.group_mads_[grp_key][col] = float(mad_val) if float(mad_val) > 1e-9 else self.global_mads_.get(col, 1.0)

        elif self.peer_group_col and self.peer_group_col in df.columns:
            for group_id, grp_df in df.groupby(self.peer_group_col):
                grp_key = str(group_id)
                self.group_medians_[grp_key] = {}
                self.group_mads_[grp_key] = {}
                for col in feature_cols:
                    if col in grp_df.columns:
                        grp_series = pd.to_numeric(grp_df[col], errors="coerce").dropna()
                        if len(grp_series) > 0:
                            med = float(grp_series.median())
                            mad = float((grp_series - med).abs().median())
                        else:
                            med = self.global_medians_.get(col, 0.0)
                            mad = self.global_mads_.get(col, 1.0)
                        self.group_medians_[grp_key][col] = med
                        self.group_mads_[grp_key][col] = mad if mad > 1e-9 else self.global_mads_.get(col, 1.0)

        self.is_fitted = True
        return self

    def score(
        self, df: pd.DataFrame, feature_cols: List[str], **kwargs
    ) -> Tuple[np.ndarray, np.ndarray, List[List[str]]]:
        n = len(df)
        if n == 0 or not feature_cols:
            return np.zeros(0), np.zeros(0, dtype=bool), []

        max_rob_z = np.zeros(n, dtype=float)
        is_anomaly = np.zeros(n, dtype=bool)
        flag_tags: List[List[str]] = [[] for _ in range(n)]

        has_groups = bool(
            (self.peer_group_col and self.peer_group_col in df.columns) or
            bool(self.group_medians_)
        )

        for col in feature_cols:
            if col not in self.global_medians_:
                continue

            raw_vals = pd.to_numeric(df[col], errors="coerce").fillna(self.global_medians_[col]).values

            # Global robust Z
            g_med = self.global_medians_[col]
            g_mad = self.global_mads_[col]
            global_z = 0.6745 * np.abs(raw_vals - g_med) / g_mad

            # Peer-aware robust Z
            if has_groups and self.peer_group_col and self.peer_group_col in df.columns:
                groups = df[self.peer_group_col].astype(str).values
                p_meds = np.array([
                    self.group_medians_.get(g, {}).get(col, g_med) for g in groups
                ])
                p_mads = np.array([
                    self.group_mads_.get(g, {}).get(col, g_mad) for g in groups
                ])
                p_mads = np.where(p_mads < 1e-9, g_mad, p_mads)
                peer_z = 0.6745 * np.abs(raw_vals - p_meds) / p_mads

                # Score is maximum of peer and global deviations
                combined_z = np.maximum(peer_z, global_z)
                max_rob_z = np.maximum(max_rob_z, combined_z)

                # Check peer group flags
                for idx in np.where(peer_z > self.threshold)[0]:
                    is_anomaly[idx] = True
                    tag = "PEER_GROUP_DEVIATION"
                    if tag not in flag_tags[idx]:
                        flag_tags[idx].append(tag)
                    col_tag = f"PEER_ROBUST_Z_{col.upper()}"
                    if col_tag not in flag_tags[idx]:
                        flag_tags[idx].append(col_tag)

                # Check global outlier flags
                for idx in np.where(global_z > self.threshold)[0]:
                    is_anomaly[idx] = True
                    tag = "GLOBAL_ROBUST_Z_OUTLIER"
                    if tag not in flag_tags[idx]:
                        flag_tags[idx].append(tag)
            else:
                max_rob_z = np.maximum(max_rob_z, global_z)
                for idx in np.where(global_z > self.threshold)[0]:
                    is_anomaly[idx] = True
                    tag = "GLOBAL_ROBUST_Z_OUTLIER"
                    if tag not in flag_tags[idx]:
                        flag_tags[idx].append(tag)
                    col_tag = f"ROBUST_Z_{col.upper()}"
                    if col_tag not in flag_tags[idx]:
                        flag_tags[idx].append(col_tag)

        return max_rob_z, is_anomaly, flag_tags
