"""
Conformal Prediction Calibration Engine.

Converts raw non-conformity anomaly detector scores into valid frequentist p-values
using split-conformal empirical calibration with contamination trimming.
"""

from typing import Dict, Any, List, Optional, Tuple, Union
import numpy as np
import pandas as pd


class ConformalCalibrator:
    """
    Empirical Conformal Calibrator.
    Maps non-conformity scores S(x) to p-values via the empirical distribution
    of a reference calibration set:
        p(x) = (1 + sum(S_cal >= S_test)) / (m + 1)
    """
    def __init__(
        self,
        contamination_trim: float = 0.02,
        random_state: int = 42
    ):
        """
        Args:
            contamination_trim: Upper quantile (e.g. 0.02 = 2%) to trim from calibration set
                                to avoid calibrating against corrupted/outlier contamination.
            random_state: Seed for deterministic calibration splits.
        """
        self.contamination_trim = contamination_trim
        self.random_state = random_state
        self.calibration_scores_: Dict[str, np.ndarray] = {}
        self.is_calibrated = False

    def fit_calibration_scores(
        self,
        scores_dict: Dict[str, np.ndarray],
        is_clean_subset: Optional[np.ndarray] = None
    ) -> "ConformalCalibrator":
        """
        Register non-conformity calibration scores for each detector.

        Args:
            scores_dict: Mapping of detector name -> 1D numpy array of raw scores.
            is_clean_subset: Optional boolean mask designating known nominal records.
        """
        self.calibration_scores_ = {}

        for det_name, raw_scores in scores_dict.items():
            arr = np.asarray(raw_scores, dtype=float)
            arr = arr[~np.isnan(arr)]

            if is_clean_subset is not None and len(is_clean_subset) == len(raw_scores):
                arr = arr[is_clean_subset]

            # Trimming top contamination quantile if specified
            if self.contamination_trim > 0 and len(arr) > 20:
                upper_cutoff = np.percentile(arr, 100.0 * (1.0 - self.contamination_trim))
                arr = arr[arr <= upper_cutoff]

            if len(arr) == 0:
                arr = np.array([0.0])

            # Store sorted calibration scores for O(log m) binary search evaluation
            self.calibration_scores_[det_name] = np.sort(arr)

        self.is_calibrated = True
        return self

    def compute_pvalues(
        self,
        test_scores_dict: Dict[str, np.ndarray]
    ) -> Dict[str, np.ndarray]:
        """
        Compute conformal p-values for each detector on test records:
            p_i = (1 + count(s_cal >= s_test)) / (m + 1)
        """
        pvalues_dict = {}

        for det_name, test_scores in test_scores_dict.items():
            test_arr = np.asarray(test_scores, dtype=float)
            n_test = len(test_arr)

            if det_name not in self.calibration_scores_:
                # If detector has no calibration reference, return conservative p=1.0
                pvalues_dict[det_name] = np.ones(n_test, dtype=float)
                continue

            cal_arr = self.calibration_scores_[det_name]
            m = len(cal_arr)

            # Using searchsorted for fast O(N log M) computation
            # cal_arr is sorted in ascending order.
            # Number of items >= test_val is: m - searchsorted(cal_arr, test_val, side='left')
            insert_positions = np.searchsorted(cal_arr, test_arr, side='left')
            count_ge = m - insert_positions

            # Valid conformal p-value formula: (1 + count_ge) / (m + 1)
            p_vals = (1.0 + count_ge) / (m + 1.0)
            pvalues_dict[det_name] = np.clip(p_vals, 1e-6, 1.0)

        return pvalues_dict
