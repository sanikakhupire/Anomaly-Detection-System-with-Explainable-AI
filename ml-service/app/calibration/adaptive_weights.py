"""Human-in-the-Loop Adaptive Detector Weighting Engine (Contribution C6).

Implements Multiplicative Weights Update / Exponentiated Gradient (Hedge Algorithm)
with epsilon-smoothing regularization, feedback loss computation, and detector precision metrics.
"""

from typing import Dict, List, Any, Optional, Tuple
import numpy as np
from pydantic import BaseModel, Field


class FeedbackItem(BaseModel):
    record_index: int
    human_verdict: str  # VALIDATED, FALSE_POSITIVE, INCONCLUSIVE
    detector_scores: Dict[str, float]  # normalized scores [0, 1]
    detector_flags: Dict[str, bool] = Field(default_factory=dict)


class AdaptiveWeightResult(BaseModel):
    updated_weights: Dict[str, float]
    normalized_weights: Dict[str, float]
    previous_weights: Dict[str, float]
    loss_by_detector: Dict[str, float]
    precision_by_detector: Dict[str, float]
    alignment_by_detector: Dict[str, float]
    weight_drift_l1: float
    total_feedback_count: int
    learning_rate: float
    smoothing_factor: float


class AdaptiveWeightEngine:
    """Multiplicative Weights Update (Hedge) algorithm with epsilon-smoothing for detector ensembles."""

    DEFAULT_WEIGHTS = {
        "robust_z": 0.40,
        "isolation_forest": 0.35,
        "z_score": 0.15,
        "temporal": 0.10,
    }

    @staticmethod
    def compute_loss(score: float, is_flagged: bool, verdict: str) -> float:
        """
        Computes bounded loss in [0, 1] for a detector on a single human feedback review.
        - If human validated the anomaly (+1): detectors with lower scores have higher loss.
        - If human marked false positive (-1): detectors with higher scores have higher loss.
        - If inconclusive: small neutral penalty based on certainty.
        """
        sc = float(np.clip(score, 0.0, 1.0))
        v_upper = verdict.upper()

        if v_upper == "VALIDATED":
            # True anomaly: loss is squared distance from 1.0
            return float((1.0 - sc) ** 2)
        elif v_upper == "FALSE_POSITIVE":
            # False positive: loss is squared distance from 0.0
            return float(sc ** 2)
        else:
            # Inconclusive / neutral
            return float(abs(sc - 0.5))

    @classmethod
    def update_weights(
        cls,
        current_weights: Optional[Dict[str, float]],
        feedback_items: List[Dict[str, Any]],
        learning_rate: float = 0.1,
        smoothing_factor: float = 0.05,
    ) -> AdaptiveWeightResult:
        """
        Updates detector weights using Exponentiated Gradient descent on feedback loss:
        w_d^(t+1) = w_d^(t) * exp(-eta * loss_d)
        w_d_smoothed = (1 - eps) * (w_d^(t+1) / sum(w)) + (eps / K)
        """
        # Initialize or clean weights
        weights = dict(current_weights or cls.DEFAULT_WEIGHTS)
        detectors = list(weights.keys())
        k = len(detectors)

        if k == 0:
            raise ValueError("No detectors provided for adaptive weighting.")

        # Normalize incoming weights to sum to 1.0
        tot = sum(weights.values())
        if tot <= 0:
            weights = {d: 1.0 / k for d in detectors}
        else:
            weights = {d: weights[d] / tot for d in detectors}

        previous_weights = dict(weights)

        if not feedback_items:
            # No feedback to update on
            return AdaptiveWeightResult(
                updated_weights=weights,
                normalized_weights=weights,
                previous_weights=previous_weights,
                loss_by_detector={d: 0.0 for d in detectors},
                precision_by_detector={d: 1.0 for d in detectors},
                alignment_by_detector={d: 1.0 for d in detectors},
                weight_drift_l1=0.0,
                total_feedback_count=0,
                learning_rate=learning_rate,
                smoothing_factor=smoothing_factor,
            )

        # Track losses, true positives, false positives per detector
        detector_losses = {d: [] for d in detectors}
        tp_counts = {d: 0 for d in detectors}
        fp_counts = {d: 0 for d in detectors}
        evaluated_counts = {d: 0 for d in detectors}

        for item in feedback_items:
            verdict = item.get("human_verdict", "INCONCLUSIVE")
            scores = item.get("detector_scores", {})
            flags = item.get("detector_flags", {})

            for d in detectors:
                sc = scores.get(d, 0.5)
                fl = flags.get(d, sc >= 0.5)

                loss = cls.compute_loss(sc, fl, verdict)
                detector_losses[d].append(loss)
                evaluated_counts[d] += 1

                if verdict == "VALIDATED":
                    if fl:
                        tp_counts[d] += 1
                elif verdict == "FALSE_POSITIVE":
                    if fl:
                        fp_counts[d] += 1

        # Mean empirical loss per detector
        avg_losses = {
            d: float(np.mean(detector_losses[d])) if detector_losses[d] else 0.5
            for d in detectors
        }

        # Multiplicative weights update: w_d = w_d * exp(-eta * loss)
        eta = max(0.01, min(1.0, float(learning_rate)))
        new_unnorm_weights = {}
        for d in detectors:
            loss = avg_losses[d]
            new_unnorm_weights[d] = weights[d] * float(np.exp(-eta * loss))

        sum_unnorm = sum(new_unnorm_weights.values())
        if sum_unnorm <= 0:
            sum_unnorm = 1.0

        # Epsilon-smoothing regularization: guarantee minimum representation
        eps = max(0.0, min(0.3, float(smoothing_factor)))
        smoothed_weights = {}
        for d in detectors:
            norm_part = (1.0 - eps) * (new_unnorm_weights[d] / sum_unnorm)
            uniform_part = eps / k
            smoothed_weights[d] = round(float(norm_part + uniform_part), 4)

        # Ensure exact sum of 1.0
        norm_sum = sum(smoothed_weights.values())
        smoothed_weights = {d: round(smoothed_weights[d] / norm_sum, 4) for d in detectors}

        # Calculate metrics
        precision_dict = {}
        alignment_dict = {}
        for d in detectors:
            tp = tp_counts[d]
            fp = fp_counts[d]
            total_flagged = tp + fp
            precision_dict[d] = round(float(tp / total_flagged), 3) if total_flagged > 0 else 0.5
            alignment_dict[d] = round(float(1.0 - avg_losses[d]), 3)

        # L1 Weight Drift
        l1_drift = round(float(sum(abs(smoothed_weights[d] - previous_weights[d]) for d in detectors)), 4)

        return AdaptiveWeightResult(
            updated_weights=smoothed_weights,
            normalized_weights=smoothed_weights,
            previous_weights=previous_weights,
            loss_by_detector={d: round(avg_losses[d], 4) for d in detectors},
            precision_by_detector=precision_dict,
            alignment_by_detector=alignment_dict,
            weight_drift_l1=l1_drift,
            total_feedback_count=len(feedback_items),
            learning_rate=eta,
            smoothing_factor=eps,
        )
