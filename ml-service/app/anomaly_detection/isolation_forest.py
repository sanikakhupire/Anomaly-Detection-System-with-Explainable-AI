"""
Isolation Forest Anomaly Detector.

Multivariate non-parametric tree-based anomaly detection.
Isolates anomalies by randomly selecting a feature and randomly selecting a split value.
Anomalous points require fewer splits to be isolated in tree leaf nodes.
"""

from typing import Dict, Any, List, Tuple, Optional, Union
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from app.anomaly_detection.base import BaseDetector
from app.anomaly_detection.registry import DetectorRegistry


@DetectorRegistry.register("isolation_forest")
class IsolationForestDetector(BaseDetector):
    """
    Multivariate Isolation Forest Detector.
    Supports n_estimators, contamination, max_samples, and deterministic random_state.
    """
    def __init__(
        self,
        n_estimators: int = 100,
        contamination: Union[float, str] = 0.05,
        max_samples: Union[str, int, float] = "auto",
        random_state: int = 42
    ):
        super().__init__(
            name="isolation_forest",
            params={
                "n_estimators": n_estimators,
                "contamination": contamination,
                "max_samples": max_samples,
                "random_state": random_state
            },
            random_state=random_state
        )
        self.n_estimators = n_estimators
        self.contamination = contamination
        self.max_samples = max_samples
        self.model: Optional[IsolationForest] = None
        self.fitted_cols: List[str] = []

    def fit(self, df: pd.DataFrame, feature_cols: List[str], **kwargs) -> "IsolationForestDetector":
        self.fitted_cols = [c for c in feature_cols if c in df.columns]
        if not self.fitted_cols:
            self.is_fitted = True
            return self

        X = df[self.fitted_cols].apply(pd.to_numeric, errors="coerce").fillna(0.0).values

        # If data is very small, adjust max_samples safely
        n_samples = len(X)
        max_samples = self.max_samples
        if isinstance(max_samples, int) and max_samples > n_samples:
            max_samples = n_samples

        self.model = IsolationForest(
            n_estimators=self.n_estimators,
            contamination=self.contamination,
            max_samples=max_samples,
            random_state=self.random_state,
            n_jobs=-1
        )
        self.model.fit(X)
        self.is_fitted = True
        return self

    def score(
        self, df: pd.DataFrame, feature_cols: List[str], **kwargs
    ) -> Tuple[np.ndarray, np.ndarray, List[List[str]]]:
        n = len(df)
        if n == 0 or not self.fitted_cols or self.model is None:
            return np.zeros(0), np.zeros(0, dtype=bool), []

        X = df[self.fitted_cols].apply(pd.to_numeric, errors="coerce").fillna(0.0).values

        # decision_function: positive for inliers, negative for outliers
        # Invert so higher score = more anomalous
        dec_func = self.model.decision_function(X)
        raw_scores = -dec_func

        # predict returns -1 for outliers, 1 for inliers
        predictions = self.model.predict(X)
        is_anomaly = (predictions == -1)

        flag_tags: List[List[str]] = [[] for _ in range(n)]
        for idx in range(n):
            if is_anomaly[idx]:
                flag_tags[idx].append("IFOREST_OUTLIER")
                flag_tags[idx].append("MULTIVARIATE_ISOLATION")

        return raw_scores, is_anomaly, flag_tags
