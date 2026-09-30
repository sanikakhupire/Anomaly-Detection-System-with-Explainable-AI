"""
Minimal Plausible Counterfactual Generator.
Finds the minimal perturbation within observed empirical ranges returning an anomaly to its peer normal baseline.
"""

from typing import Dict, List, Optional, Tuple, Any
import numpy as np
from app.explainability.base import CounterfactualResult


class CounterfactualGenerator:
    """
    Computes plausible counterfactual feature adjustments based on peer-group distributions.
    """

    def __init__(
        self,
        feature_names: List[str],
        empirical_bounds: Optional[Dict[str, Tuple[float, float]]] = None,
    ):
        self.feature_names = feature_names
        self.empirical_bounds = empirical_bounds or {}

    def generate_counterfactuals(
        self,
        record: Dict[str, float],
        peer_baselines: Dict[str, Dict[str, float]],
        top_features: List[str],
        max_features: int = 3,
    ) -> List[CounterfactualResult]:
        """
        Generates counterfactual corrections for the top contributing features.
        
        Args:
            record: Dict of feature -> actual value
            peer_baselines: Dict containing median, mad, q25, q75 per feature
            top_features: Ranked feature names by attribution
            max_features: Maximum number of counterfactual features to produce
        """
        results: List[CounterfactualResult] = []

        for feature in top_features[:max_features]:
            if feature not in record or feature not in peer_baselines:
                continue

            val = float(record[feature])
            baseline_info = peer_baselines[feature]
            median = float(baseline_info.get("median", val))
            mad = float(baseline_info.get("mad", 1.0))
            q25 = float(baseline_info.get("q25", median - mad))
            q75 = float(baseline_info.get("q75", median + mad))

            # Determine empirical bounds
            min_val, max_val = self.empirical_bounds.get(feature, (q25 - 3 * mad, q75 + 3 * mad))

            # Direction of deviance
            if val > median:
                # Value is unusually high: bring down to upper normal bound (e.g. median + 1.5*mad or q75)
                target_val = min(val, max(median, q75))
                direction = "DECREASE"
            elif val < median:
                # Value is unusually low: bring up to lower normal bound (e.g. median - 1.5*mad or q25)
                target_val = max(val, min(median, q25))
                direction = "INCREASE"
            else:
                target_val = median
                direction = "MAINTAIN"

            # Clip within observed empirical limits
            target_val = float(np.clip(target_val, min_val, max_val))
            delta = target_val - val

            # Check plausibility: counterfactual is plausible if it falls within valid physical/empirical limits
            plausibility = (min_val <= target_val <= max_val)

            results.append(
                CounterfactualResult(
                    feature=feature,
                    original_value=val,
                    counterfactual_value=target_val,
                    delta=delta,
                    peer_median=median,
                    peer_iqr=(q25, q75),
                    direction=direction,
                    plausibility=plausibility,
                )
            )

        return results
