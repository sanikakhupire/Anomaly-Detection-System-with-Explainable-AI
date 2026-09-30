"""
Depth-based Isolation Forest Feature Importance (DIFFI).
Reference: Carletti et al., "Interpretable Anomaly Detection with Isolation Forest", 2020.
Traces isolation paths per tree to measure which features caused early isolation of anomalous instances.
"""

from typing import Dict, List, Optional, Tuple
import numpy as np
from sklearn.ensemble import IsolationForest


class DIFFIExplainer:
    """
    Computes local and global Depth-based Feature Importance for Isolation Forests.
    """

    def __init__(self, model: IsolationForest, feature_names: List[str]):
        self.model = model
        self.feature_names = feature_names
        self.n_features = len(feature_names)
        self.n_estimators = len(model.estimators_) if hasattr(model, "estimators_") else 0

    def explain_instance(self, x: np.ndarray) -> Dict[str, float]:
        """
        Computes local DIFFI attribution for a single 1D feature vector x.
        Returns a dictionary mapping feature_name -> normalized importance in [0, 1].
        """
        if self.n_estimators == 0 or self.n_features == 0:
            return {f: 1.0 / max(1, self.n_features) for f in self.feature_names}

        # Ensure x is 1D
        x_flat = np.asarray(x, dtype=np.float64).flatten()
        if len(x_flat) != self.n_features:
            raise ValueError(f"Expected {self.n_features} features, got {len(x_flat)}")

        feature_weights = np.zeros(self.n_features, dtype=np.float64)

        for estimator in self.model.estimators_:
            tree = estimator.tree_
            children_left = tree.children_left
            children_right = tree.children_right
            feature_idx = tree.feature
            threshold = tree.threshold
            n_node_samples = tree.n_node_samples

            # Trace traversal down to leaf node
            node_id = 0
            path_splits: List[Tuple[int, int, int]] = []  # (feature_index, depth, sample_reduction)
            depth = 0

            while children_left[node_id] != children_right[node_id]:  # Not a leaf
                f = feature_idx[node_id]
                parent_samples = n_node_samples[node_id]

                # Advance to child node
                if x_flat[f] <= threshold[node_id]:
                    child_id = children_left[node_id]
                else:
                    child_id = children_right[node_id]

                child_samples = n_node_samples[child_id]
                sample_reduction = max(1, parent_samples - child_samples)
                path_splits.append((f, depth, sample_reduction))

                node_id = child_id
                depth += 1

            total_depth = max(1, depth)
            # Tree isolation factor: short path = higher tree outlier contribution
            # Trees with shallow isolation for x have exponentially higher importance
            tree_isolation_weight = 2.0 ** (-total_depth / 4.0)

            # Assign split importance: splits with high sample reduction occurring at shallow depths
            for f, d, reduction in path_splits:
                if 0 <= f < self.n_features:
                    # Early split weight inversely proportional to total depth and step depth
                    split_weight = tree_isolation_weight * (1.0 / (d + 1.0)) * (reduction / max(1, n_node_samples[0]))
                    feature_weights[f] += split_weight

        # Average across all trees in forest
        avg_weights = feature_weights / max(1, self.n_estimators)

        # Normalize so sum of importances = 1.0
        total = np.sum(avg_weights)
        if total > 0:
            normalized = avg_weights / total
        else:
            normalized = np.full(self.n_features, 1.0 / self.n_features)

        return {
            self.feature_names[i]: float(normalized[i])
            for i in range(self.n_features)
        }

    def explain_batch(self, X: np.ndarray) -> List[Dict[str, float]]:
        """
        Computes local DIFFI attributions for an array of samples X of shape (N, M).
        """
        X_arr = np.asarray(X, dtype=np.float64)
        if X_arr.ndim == 1:
            return [self.explain_instance(X_arr)]

        return [self.explain_instance(X_arr[i]) for i in range(len(X_arr))]
