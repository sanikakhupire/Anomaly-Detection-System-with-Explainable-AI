"""
SHAP Explainer and Perturbation Baseline for Anomaly Detectors.
Computes local feature attributions using TreeExplainer or Sampling Shapley approximation.
"""

from typing import Dict, List, Optional, Tuple, Any, Callable
import numpy as np
from sklearn.ensemble import IsolationForest


class ShapExplainer:
    """
    Computes local SHAP attribution values for Isolation Forest and ensemble anomaly scores.
    """

    def __init__(
        self,
        model: Any,
        feature_names: List[str],
        background_data: Optional[np.ndarray] = None,
        random_state: int = 42,
    ):
        self.model = model
        self.feature_names = feature_names
        self.n_features = len(feature_names)
        self.background_data = background_data
        self.random_state = random_state
        self._tree_explainer = None
        self._has_shap = False

        self._init_shap()

    def _init_shap(self):
        """Attempts to initialize official shap.TreeExplainer if available."""
        try:
            import shap
            if isinstance(self.model, IsolationForest) and hasattr(self.model, "estimators_"):
                # TreeExplainer works directly on IsolationForest
                self._tree_explainer = shap.TreeExplainer(self.model)
                self._has_shap = True
        except Exception:
            self._has_shap = False
            self._tree_explainer = None

    def explain_instance(
        self,
        x: np.ndarray,
        score_func: Optional[Callable[[np.ndarray], float]] = None,
        baseline: Optional[np.ndarray] = None,
    ) -> Dict[str, float]:
        """
        Computes signed local SHAP attribution for a single instance x.
        Positive value = feature increased the anomaly score (pushed towards anomaly).
        Negative value = feature decreased the anomaly score (acted normal).
        """
        x_arr = np.asarray(x, dtype=np.float64).flatten()
        if len(x_arr) != self.n_features:
            raise ValueError(f"Expected {self.n_features} features, got {len(x_arr)}")

        # 1. Use shap.TreeExplainer if available
        if self._has_shap and self._tree_explainer is not None:
            try:
                # TreeExplainer outputs shap values where higher = more inlier or outlier
                # For IsolationForest, shap values explain the decision_function.
                # Invert so higher attribution = higher anomaly.
                sv = self._tree_explainer.shap_values(x_arr.reshape(1, -1))
                if isinstance(sv, list):
                    vals = sv[0].flatten()
                elif isinstance(sv, np.ndarray):
                    vals = sv.flatten()
                else:
                    vals = np.array(sv).flatten()

                # Invert decision function SHAP so positive = more anomalous
                attributions = -vals
                return {
                    self.feature_names[i]: float(attributions[i])
                    for i in range(self.n_features)
                }
            except Exception:
                pass  # Fall back to sampling Shapley below

        # 2. Kernel / Sampling Shapley fallback (pure NumPy, zero external dependencies)
        return self._sampling_shapley(x_arr, score_func, baseline)

    def _sampling_shapley(
        self,
        x: np.ndarray,
        score_func: Optional[Callable[[np.ndarray], float]],
        baseline: Optional[np.ndarray],
        n_samples: int = 50,
    ) -> Dict[str, float]:
        """
        Monte-Carlo Sampling Shapley estimator using background/baseline reference.
        """
        if baseline is None:
            if self.background_data is not None and len(self.background_data) > 0:
                baseline = np.median(self.background_data, axis=0)
            else:
                baseline = np.zeros(self.n_features, dtype=np.float64)

        if score_func is None:
            if hasattr(self.model, "decision_function"):
                score_func = lambda z: float(-self.model.decision_function(z.reshape(1, -1))[0])
            else:
                # Default standard deviation distance from baseline
                score_func = lambda z: float(np.linalg.norm(z - baseline))

        rng = np.random.RandomState(self.random_state)
        shap_values = np.zeros(self.n_features, dtype=np.float64)

        for _ in range(n_samples):
            # Sample random permutation of features
            perm = rng.permutation(self.n_features)
            current_x = baseline.copy()

            for feature_idx in perm:
                # Score before adding feature
                score_before = score_func(current_x)
                # Add actual feature value
                current_x[feature_idx] = x[feature_idx]
                # Score after adding feature
                score_after = score_func(current_x)

                # Marginal contribution
                shap_values[feature_idx] += (score_after - score_before)

        shap_values /= max(1, n_samples)

        return {
            self.feature_names[i]: float(shap_values[i])
            for i in range(self.n_features)
        }

    def compute_perturbation_baseline(
        self,
        x: np.ndarray,
        score_func: Callable[[np.ndarray], float],
        baseline: np.ndarray,
    ) -> Dict[str, float]:
        """
        Simple one-at-a-time feature replacement:
        Delta_j = Score(x) - Score(x with feature j replaced by baseline_j)
        """
        x_arr = np.asarray(x, dtype=np.float64).flatten()
        base_score = score_func(x_arr)
        perturbation_scores = {}

        for j in range(self.n_features):
            perturbed = x_arr.copy()
            perturbed[j] = baseline[j]
            perturbed_score = score_func(perturbed)
            # Positive drop means feature j contributed positively to anomaly severity
            perturbation_scores[self.feature_names[j]] = float(base_score - perturbed_score)

        return perturbation_scores
