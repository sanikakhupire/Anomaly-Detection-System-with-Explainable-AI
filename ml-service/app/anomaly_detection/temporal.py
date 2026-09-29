"""
Temporal Anomaly Detector.

Detects time-series statistical anomalies across three complementary methods:
1. Robust Rolling Baseline (rolling median and rolling MAD residuals for local spikes)
2. STL Decomposition Residuals (identifies deviations after separating trend and seasonality)
3. CUSUM (Cumulative Sum Control Chart for sustained mean level shifts and drift)
"""

from typing import Dict, Any, List, Tuple, Optional
import numpy as np
import pandas as pd
from app.anomaly_detection.base import BaseDetector
from app.anomaly_detection.registry import DetectorRegistry

# statsmodels is installed per stack rules
try:
    from statsmodels.tsa.seasonal import STL
    HAS_STL = True
except ImportError:
    HAS_STL = False


@DetectorRegistry.register("temporal")
class TemporalDetector(BaseDetector):
    """
    Temporal detector combining STL residuals, robust rolling median/MAD baselines, and CUSUM shift detection.
    Runs when a valid date/timestamp column is present.
    """
    def __init__(
        self,
        date_col: Optional[str] = None,
        rolling_window: int = 7,
        spike_threshold: float = 3.5,
        cusum_threshold: float = 4.0,
        random_state: int = 42
    ):
        super().__init__(
            name="temporal",
            params={
                "date_col": date_col,
                "rolling_window": rolling_window,
                "spike_threshold": spike_threshold,
                "cusum_threshold": cusum_threshold,
            },
            random_state=random_state
        )
        self.date_col = date_col
        self.rolling_window = rolling_window
        self.spike_threshold = spike_threshold
        self.cusum_threshold = cusum_threshold

    def fit(self, df: pd.DataFrame, feature_cols: List[str], **kwargs) -> "TemporalDetector":
        # Non-parametric / online tracking, no state to freeze
        self.is_fitted = True
        return self

    def score(
        self, df: pd.DataFrame, feature_cols: List[str], **kwargs
    ) -> Tuple[np.ndarray, np.ndarray, List[List[str]]]:
        n = len(df)
        if n == 0 or not feature_cols:
            return np.zeros(0), np.zeros(0, dtype=bool), []

        # If no date column or not in dataframe, return zeros
        date_col = self.date_col
        if not date_col or date_col not in df.columns:
            # Check kwargs
            date_col = kwargs.get("date_col")

        if not date_col or date_col not in df.columns:
            return np.zeros(n), np.zeros(n, dtype=bool), [[] for _ in range(n)]

        # Try parsing dates
        try:
            parsed_dates = pd.to_datetime(df[date_col], errors="coerce")
        except Exception:
            return np.zeros(n), np.zeros(n, dtype=bool), [[] for _ in range(n)]

        valid_date_mask = parsed_dates.notna()
        if valid_date_mask.sum() < max(5, self.rolling_window):
            return np.zeros(n), np.zeros(n, dtype=bool), [[] for _ in range(n)]

        # Work on sorted copy to perform temporal processing, then map back to original indices
        sorted_indices = parsed_dates.sort_values(na_position="last").index
        inv_sort_map = {orig_idx: pos for pos, orig_idx in enumerate(sorted_indices)}

        sorted_df = df.iloc[sorted_indices].copy()
        n_sorted = len(sorted_df)

        max_scores_sorted = np.zeros(n_sorted, dtype=float)
        is_anomaly_sorted = np.zeros(n_sorted, dtype=bool)
        flag_tags_sorted: List[List[str]] = [[] for _ in range(n_sorted)]

        for col in feature_cols:
            if col not in sorted_df.columns:
                continue
            series = pd.to_numeric(sorted_df[col], errors="coerce")
            if series.notna().sum() < 5:
                continue

            # Forward-fill / backward-fill for continuous time-series computation
            filled = series.interpolate(method="linear").bfill().ffill().values

            # 1. Robust Rolling Baseline (Median and MAD)
            roll_med = pd.Series(filled).rolling(
                window=self.rolling_window, min_periods=3, center=True
            ).median().bfill().ffill().values

            abs_diff = np.abs(filled - roll_med)
            roll_mad = pd.Series(abs_diff).rolling(
                window=self.rolling_window, min_periods=3, center=True
            ).median().bfill().ffill().values
            roll_mad = np.where(roll_mad < 1e-6, 1.0, roll_mad)

            # Rolling robust residual
            rolling_z = 0.6745 * abs_diff / roll_mad

            # 2. STL Decomposition Residuals (if enough data and STL is available)
            stl_z = np.zeros_like(rolling_z)
            if HAS_STL and len(filled) >= 14:
                try:
                    # Period default to weekly (7) or small cycle
                    period = min(7, len(filled) // 2)
                    if period >= 3:
                        stl_res = STL(filled, period=period, seasonal=7, robust=True).fit()
                        resid = stl_res.resid
                        resid_mad = float(np.median(np.abs(resid - np.median(resid))))
                        if resid_mad > 1e-6:
                            stl_z = 0.6745 * np.abs(resid) / resid_mad
                except Exception:
                    # Fallback gracefully to rolling_z if STL fails (e.g. non-stationary / constant)
                    stl_z = np.zeros_like(rolling_z)

            # 3. Two-sided CUSUM for sustained mean shifts
            med_val = float(np.median(filled))
            mad_val = float(np.median(np.abs(filled - med_val)))
            sigma_est = (mad_val / 0.6745) if mad_val > 1e-6 else float(np.std(filled) + 1e-6)
            k = 0.5 * sigma_est
            h = self.cusum_threshold * sigma_est

            s_pos = np.zeros(n_sorted)
            s_neg = np.zeros(n_sorted)
            cusum_score = np.zeros(n_sorted)

            for t in range(1, n_sorted):
                s_pos[t] = max(0.0, s_pos[t - 1] + (filled[t] - med_val - k))
                s_neg[t] = max(0.0, s_neg[t - 1] - (filled[t] - med_val + k))
                cusum_score[t] = max(s_pos[t], s_neg[t]) / (h + 1e-6)

            # Aggregate temporal anomaly signal for this column
            col_temporal_score = np.maximum.reduce([rolling_z, stl_z, cusum_score * self.spike_threshold])
            max_scores_sorted = np.maximum(max_scores_sorted, col_temporal_score)

            # Flagging
            spike_mask = (rolling_z > self.spike_threshold) | (stl_z > self.spike_threshold)
            drift_mask = (cusum_score >= 1.0)

            for pos in np.where(spike_mask)[0]:
                is_anomaly_sorted[pos] = True
                tag = f"TEMPORAL_SPIKE_{col.upper()}"
                if tag not in flag_tags_sorted[pos]:
                    flag_tags_sorted[pos].append(tag)
                if "TEMPORAL_ANOMALY" not in flag_tags_sorted[pos]:
                    flag_tags_sorted[pos].append("TEMPORAL_ANOMALY")

            for pos in np.where(drift_mask)[0]:
                is_anomaly_sorted[pos] = True
                tag = f"TEMPORAL_CUSUM_DRIFT_{col.upper()}"
                if tag not in flag_tags_sorted[pos]:
                    flag_tags_sorted[pos].append(tag)
                if "TEMPORAL_ANOMALY" not in flag_tags_sorted[pos]:
                    flag_tags_sorted[pos].append("TEMPORAL_ANOMALY")

        # Map results back to original dataframe index
        raw_scores = np.zeros(n, dtype=float)
        is_anomaly = np.zeros(n, dtype=bool)
        flag_tags: List[List[str]] = [[] for _ in range(n)]

        for pos, orig_idx in enumerate(sorted_indices):
            raw_scores[orig_idx] = max_scores_sorted[pos]
            is_anomaly[orig_idx] = is_anomaly_sorted[pos]
            flag_tags[orig_idx] = flag_tags_sorted[pos]

        return raw_scores, is_anomaly, flag_tags
