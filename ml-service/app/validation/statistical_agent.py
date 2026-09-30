"""Statistical Distribution Verification Agent."""

import numpy as np
from typing import List
from .base import EvidenceBundle, AgentAssessment, ValidationVerdict


class StatisticalAgent:
    """Evaluates whether deviations are statistically robust versus peer-group variance artifacts."""

    AGENT_NAME = "StatisticalDistributionAgent"
    PERSPECTIVE = "Statistical significance, peer shrinkage adequacy, and detector consensus"

    def evaluate(self, bundle: EvidenceBundle) -> AgentAssessment:
        findings: List[str] = []
        flags: List[str] = []

        # 1. Peer Group Power & Sample Size Check
        peer_size = bundle.peer_group_size
        is_small_peer_group = 0 < peer_size < 15

        if is_small_peer_group:
            findings.append(
                f"Peer group '{bundle.peer_group}' has limited sample size (N={peer_size} < 15). "
                f"Variance shrinkage is elevated; extreme deviation may represent small-sample variability."
            )
            flags.append("SMALL_PEER_GROUP")
        elif peer_size >= 15:
            findings.append(
                f"Peer group '{bundle.peer_group}' is statistically well-powered (N={peer_size}). "
                f"Baseline distribution provides stable median and MAD estimates."
            )

        # 2. Conformal Calibration & FDR
        q_val = bundle.q_value
        is_fdr_significant = q_val <= 0.05
        if is_fdr_significant:
            findings.append(
                f"Benjamini-Hochberg FDR q-value = {q_val:.4f} <= 0.05, establishing statistical significance "
                f"under multi-hypothesis testing control."
            )
        else:
            findings.append(
                f"FDR q-value = {q_val:.4f} > 0.05 does not reject the null hypothesis at 5% FDR threshold."
            )
            flags.append("NON_SIGNIFICANT_FDR")

        # 3. Detector Ensemble Consensus
        flagged_detectors = [k for k, v in bundle.detector_flags.items() if v]
        num_flagged = len(flagged_detectors)
        total_detectors = max(1, len(bundle.detector_flags))
        consensus_ratio = num_flagged / total_detectors

        if num_flagged >= 2:
            findings.append(
                f"Multi-detector consensus confirmed: {num_flagged}/{total_detectors} detectors flagged this record "
                f"({', '.join(flagged_detectors)})."
            )
        elif num_flagged == 1:
            findings.append(
                f"Isolated single detector flag ({flagged_detectors[0]}). Lack of multi-method consensus."
            )
            flags.append("SINGLE_DETECTOR_FLAG")
        else:
            findings.append("No individual detectors flagged beyond standard nominal thresholds.")
            flags.append("NO_DETECTOR_FLAGS")

        # 4. Top Feature Effect Size vs Peer MAD
        large_effect_count = 0
        for feat in bundle.top_features[:3]:
            fname = feat.get("feature")
            val = bundle.record_values.get(fname)
            med = bundle.peer_medians.get(fname)
            mad = bundle.peer_mads.get(fname, 0.0)

            if val is not None and med is not None and mad > 1e-6:
                try:
                    num_val = float(val)
                    z_mad = abs(num_val - med) / (1.4826 * mad)
                    if z_mad >= 3.5:
                        large_effect_count += 1
                        findings.append(
                            f"Feature '{fname}' exhibits large standardized effect size (Z_MAD = {z_mad:.2f} >= 3.5)."
                        )
                except (ValueError, TypeError):
                    pass

        # 5. Formulate Verdict & Confidence
        if is_small_peer_group and not is_fdr_significant:
            verdict = ValidationVerdict.BENIGN_EXTREME_VARIATION
            supports = False
            confidence = 0.75
        elif is_fdr_significant and num_flagged >= 2:
            verdict = ValidationVerdict.CONFIRMED_ANOMALY
            supports = True
            confidence = min(0.95, 0.7 + 0.1 * num_flagged + (0.1 if large_effect_count > 0 else 0.0))
        elif num_flagged >= 1 and (is_fdr_significant or large_effect_count > 0):
            verdict = ValidationVerdict.CONFIRMED_ANOMALY
            supports = True
            confidence = 0.65
        else:
            verdict = ValidationVerdict.INSUFFICIENT_EVIDENCE
            supports = False
            confidence = 0.60

        return AgentAssessment(
            agent_name=self.AGENT_NAME,
            perspective=self.PERSPECTIVE,
            supports_anomaly=supports,
            confidence=round(confidence, 2),
            findings=findings,
            flags=flags,
            recommended_verdict=verdict,
        )
