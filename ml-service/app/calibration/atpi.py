"""
Anomaly Triage Priority Index (ATPI) - Contribution C7.

Ranks anomalies by actionability, combining:
1. Statistical Confidence: (1 - q-value) from Benjamini-Hochberg FDR control
2. Effect Size: Magnitude of deviation from peer/global median in units of MAD
3. Peer Contextual Deviation: Prioritizes localized micro-cohort anomalies
4. Population / Economic Impact: Size of affected demographic/disbursement units
5. Explanation Stability: Placeholder (0.5) until Phase 8 SHAP stability module
6. Multi-Agent Evidence Support: Placeholder (0.5) until Phase 9 validation agents
"""

from typing import Dict, Any, List, Optional
import numpy as np


class ATPICalculator:
    """
    Computes transparent Anomaly Triage Priority Index (ATPI in [0, 100])
    and provides human-readable formula breakdown.
    """
    DEFAULT_WEIGHTS = {
        "w_q": 0.35,        # Statistical certainty (1 - q-value)
        "w_eff": 0.25,      # Effect size (MAD deviation)
        "w_peer": 0.15,     # Peer-group context flag
        "w_pop": 0.15,      # Demographic / economic scale impact
        "w_stab": 0.05,     # Explanation stability (Phase 8 placeholder)
        "w_evid": 0.05,     # Claim verifier evidence (Phase 9 placeholder)
    }

    FORMULA_DESCRIPTION = (
        "ATPI = 100 * [ w_q * (1 - q) + w_eff * min(EffectSize/4, 1) + "
        "w_peer * IsPeerAnomaly + w_pop * LogPopImpact + w_stab * Stability + w_evid * Evidence ]"
    )

    def __init__(self, weights: Optional[Dict[str, float]] = None):
        self.weights = weights or self.DEFAULT_WEIGHTS.copy()
        # Ensure weights normalize to 1.0
        total_w = sum(self.weights.values())
        self.weights = {k: v / total_w for k, v in self.weights.items()}

    def compute_atpi(
        self,
        q_value: float,
        effect_size: float,
        is_peer_context: bool,
        population_value: Optional[float] = None,
        stability_score: float = 0.5,
        evidence_score: float = 0.5
    ) -> Dict[str, Any]:
        """
        Calculate ATPI for a single record.
        """
        # 1. Statistical confidence component (0 to 1)
        s_q = float(np.clip(1.0 - q_value, 0.0, 1.0))

        # 2. Effect size component (scaled: 4 MADs = 1.0)
        s_eff = float(np.clip(abs(effect_size) / 4.0, 0.0, 1.0))

        # 3. Peer context component
        s_peer = 1.0 if is_peer_context else 0.0

        # 4. Population / economic impact component (log10 normalized)
        if population_value and population_value > 0:
            # log10(pop): 100 -> 2, 10,000 -> 4, 1,000,000 -> 6. Scaled to [0, 1]
            log_val = np.log10(max(10.0, float(population_value)))
            s_pop = float(np.clip((log_val - 2.0) / 4.0, 0.0, 1.0))
        else:
            s_pop = 0.3

        # 5. Placeholders for Phase 8 and Phase 9
        s_stab = float(np.clip(stability_score, 0.0, 1.0))
        s_evid = float(np.clip(evidence_score, 0.0, 1.0))

        # Weighted combination
        raw_atpi = (
            self.weights["w_q"] * s_q +
            self.weights["w_eff"] * s_eff +
            self.weights["w_peer"] * s_peer +
            self.weights["w_pop"] * s_pop +
            self.weights["w_stab"] * s_stab +
            self.weights["w_evid"] * s_evid
        )

        atpi_score = float(np.round(np.clip(raw_atpi * 100.0, 0.0, 100.0), 2))

        # Assign priority tier
        if atpi_score >= 75.0:
            priority = "CRITICAL"
        elif atpi_score >= 55.0:
            priority = "HIGH"
        elif atpi_score >= 35.0:
            priority = "MEDIUM"
        else:
            priority = "LOW"

        return {
            "atpi": atpi_score,
            "priority": priority,
            "breakdown": {
                "statistical_confidence": round(s_q, 4),
                "effect_size_score": round(s_eff, 4),
                "peer_context_score": round(s_peer, 4),
                "population_impact_score": round(s_pop, 4),
                "explanation_stability": round(s_stab, 4),
                "evidence_support": round(s_evid, 4),
            },
            "formula": self.FORMULA_DESCRIPTION,
            "weights": self.weights,
        }
