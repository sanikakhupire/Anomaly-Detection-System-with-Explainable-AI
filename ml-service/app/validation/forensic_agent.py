"""Forensics & Digit Pattern Verification Agent."""

from typing import List
from .base import EvidenceBundle, AgentAssessment, ValidationVerdict


class ForensicAgent:
    """Evaluates digit distributions, round-number bias, and forensic statistical tests."""

    AGENT_NAME = "ForensicsAndDigitAgent"
    PERSPECTIVE = "Benford's law conformity, last-digit uniformity, and digit heaping"

    def evaluate(self, bundle: EvidenceBundle) -> AgentAssessment:
        findings: List[str] = []
        flags: List[str] = []

        forensic = bundle.forensic_conformance or {}
        benford_p = forensic.get("benford_first_digit_p")
        last_digit_p = forensic.get("last_digit_uniformity_p")
        whipple_index = forensic.get("whipple_index")
        myers_index = forensic.get("myers_index")

        # 1. Dataset/Peer Forensic Context
        if benford_p is not None:
            if benford_p < 0.01:
                findings.append(
                    f"Severe Benford first-digit deviation in dataset column (p={benford_p:.4f} < 0.01)."
                )
                flags.append("BENFORD_FIRST_DIGIT_ANOMALY")
            elif benford_p < 0.05:
                findings.append(
                    f"Moderate Benford departure detected (p={benford_p:.4f} < 0.05)."
                )
                flags.append("BENFORD_MILD_DEPARTURE")
            else:
                findings.append(
                    f"Conforms to Benford's first-digit law (p={benford_p:.4f} >= 0.05)."
                )

        if last_digit_p is not None:
            if last_digit_p < 0.01:
                findings.append(
                    f"Last-digit uniformity rejected (p={last_digit_p:.4f} < 0.01), indicating systematic terminal digit preference."
                )
                flags.append("TERMINAL_DIGIT_NON_UNIFORM")
            else:
                findings.append(
                    f"Terminal digits conform to uniform expectation (p={last_digit_p:.4f} >= 0.05)."
                )

        # 2. Check record's top numerical values for round-number heaping
        round_feature_count = 0
        for feat in bundle.top_features[:4]:
            fname = feat.get("feature")
            val = bundle.record_values.get(fname)
            if val is not None:
                try:
                    num = float(val)
                    if num > 100 and num % 100 == 0:
                        round_feature_count += 1
                        findings.append(
                            f"Feature '{fname}' value ({num:.0f}) exhibits exact round-number heaping (multiple of 100)."
                        )
                except (ValueError, TypeError):
                    pass

        if round_feature_count >= 2:
            flags.append("MULTIPLE_ROUND_NUMBER_FEATURES")

        # 3. Formulate Verdict & Confidence
        has_forensic_red_flags = len(flags) > 0
        if "BENFORD_FIRST_DIGIT_ANOMALY" in flags or "TERMINAL_DIGIT_NON_UNIFORM" in flags:
            verdict = ValidationVerdict.CONFIRMED_ANOMALY
            supports = True
            confidence = 0.85
        elif round_feature_count >= 2:
            verdict = ValidationVerdict.CONFIRMED_ANOMALY
            supports = True
            confidence = 0.70
        else:
            verdict = ValidationVerdict.INSUFFICIENT_EVIDENCE
            supports = False
            confidence = 0.55
            findings.append("No unusual digit heaping or Benford violation detected for this specific record.")

        return AgentAssessment(
            agent_name=self.AGENT_NAME,
            perspective=self.PERSPECTIVE,
            supports_anomaly=supports,
            confidence=round(confidence, 2),
            findings=findings,
            flags=flags,
            recommended_verdict=verdict,
        )
