"""
Base detector interface for statistical and machine-learning anomaly detection.

Every detector must inherit from BaseDetector and implement:
- fit(df, feature_cols)
- score(df, feature_cols) -> Tuple[np.ndarray, np.ndarray, List[List[str]]]
  returning:
    1. raw_scores: 1D array of floats (higher = more anomalous)
    2. is_anomaly: 1D boolean array (True = flagged as potential anomaly)
    3. flag_tags: list of string tags for each record (e.g. ['PEER_GROUP_DEVIATION'])
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Tuple, Optional
import numpy as np
import pandas as pd


class BaseDetector(ABC):
    def __init__(self, name: str, params: Optional[Dict[str, Any]] = None, random_state: int = 42):
        self.name = name
        self.params = params or {}
        self.random_state = random_state
        self.is_fitted = False

    @abstractmethod
    def fit(self, df: pd.DataFrame, feature_cols: List[str], **kwargs) -> "BaseDetector":
        """
        Fit detector parameters on training or baseline data.
        """
        pass

    @abstractmethod
    def score(
        self, df: pd.DataFrame, feature_cols: List[str], **kwargs
    ) -> Tuple[np.ndarray, np.ndarray, List[List[str]]]:
        """
        Score samples.
        Returns:
            raw_scores: np.ndarray of shape (N,)
            is_anomaly: np.ndarray of bool shape (N,)
            flag_tags: List of List of str of length N
        """
        pass

    def fit_score(
        self, df: pd.DataFrame, feature_cols: List[str], **kwargs
    ) -> Tuple[np.ndarray, np.ndarray, List[List[str]]]:
        """Convenience method to fit and score in one pass."""
        self.fit(df, feature_cols, **kwargs)
        return self.score(df, feature_cols, **kwargs)

    @staticmethod
    def min_max_normalize(scores: np.ndarray) -> np.ndarray:
        """Helper to scale raw scores into [0, 1] without data leakage."""
        if len(scores) == 0:
            return scores
        s_min = np.nanmin(scores)
        s_max = np.nanmax(scores)
        if np.isclose(s_max, s_min) or np.isnan(s_min) or np.isnan(s_max):
            return np.zeros_like(scores, dtype=float)
        return np.clip((scores - s_min) / (s_max - s_min), 0.0, 1.0)
