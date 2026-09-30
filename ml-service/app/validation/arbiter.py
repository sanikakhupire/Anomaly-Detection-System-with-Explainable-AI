"""Arbitration and Synthesis module for Multi-Agent Validation (C5)."""

from typing import List, Tuple
from .base import (
    EvidenceBundle,
    AgentAssessment,
    ClaimItem,
    ValidationVerdict,
    RecommendedAction,
    ValidationReportResponse,
)


class ValidationArbiter:
    """Synthesizes agent assessments and claim verification into a final governance verdict."""

    @staticmethod
    def arbitrate(
        bundle: EvidenceBundle,
        assessments: List[AgentAssessment],
        claims: List[ClaimItem],
        cvr: float,
    ) -> ValidationReportResponse:
        # Find individual agent assessments
        stat_agent = next((a for a in assessments if a.agent_name == "StatisticalDistributionAgent"), None)
        forensic_agent = next((a for a in assessments if a.agent_name == "ForensicsAndDigitAgent"), None)
        domain_agent = next((a for a in assessments if a.agent_name == "DomainPlausibilityAgent"), None)

        verdict: ValidationVerdict
        action: RecommendedAction
        confidence: float
        summary_parts: List[str] = []

        # Rule 1: Physical/Domain impossibilities take absolute precedence -> DATA_QUALITY_ARTIFACT
        if domain_agent and domain_agent.recommended_verdict == ValidationVerdict.DATA_QUALITY_ARTIFACT:
            verdict = ValidationVerdict.DATA_QUALITY_ARTIFACT
            action = RecommendedAction.REQUEST_DATA_CORRECTION
            confidence = domain_agent.confidence
            summary_parts.append(
                f"Validation analysis identified physical or domain statutory impossibilities in Record #{bundle.record_index}. "
                f"Flags: {', '.join(domain_agent.flags)}. "
                f"This pattern represents a data collection or entry artifact rather than a genuine real-world anomaly."
            )

        # Rule 2: Small peer group with non-significant FDR -> BENIGN_EXTREME_VARIATION
        elif stat_agent and stat_agent.recommended_verdict == ValidationVerdict.BENIGN_EXTREME_VARIATION:
            verdict = ValidationVerdict.BENIGN_EXTREME_VARIATION
            action = RecommendedAction.MARK_FALSE_POSITIVE
            confidence = stat_agent.confidence
            summary_parts.append(
                f"Record #{bundle.record_index} deviation is attributable to high sampling variability "
                f"in peer group '{bundle.peer_group}' (N={bundle.peer_group_size} < 15). "
                f"The Benjamini-Hochberg FDR q-value ({bundle.q_value:.4f}) does not confirm statistical significance at alpha=0.05. "
                f"Recommended human review action: Mark as explainable benign variation."
            )

        # Rule 3: Confirmed statistical anomaly with high consensus & valid domain invariants
        elif (
            stat_agent
            and stat_agent.recommended_verdict == ValidationVerdict.CONFIRMED_ANOMALY
            and cvr >= 0.6
        ):
            verdict = ValidationVerdict.CONFIRMED_ANOMALY
            action = RecommendedAction.ESCALATE_FOR_AUDIT
            conf_factors = [stat_agent.confidence, cvr]
            if forensic_agent and forensic_agent.supports_anomaly:
                conf_factors.append(forensic_agent.confidence)
            confidence = round(sum(conf_factors) / len(conf_factors), 2)

            summary_parts.append(
                f"Multi-agent validation confirmed a statistically unusual pattern in Record #{bundle.record_index} "
                f"with {int(confidence * 100)}% consensus confidence (Claim Verification Ratio: {int(cvr * 100)}%). "
                f"The record demonstrates significant multi-detector departure (q-value={bundle.q_value:.4f}) "
                f"against empirical peer baseline '{bundle.peer_group}'. "
                f"Domain physical invariants are satisfied. Recommended action: Escalate for human domain review."
            )

        # Rule 4: Insufficient evidence or conflicting signals
        else:
            verdict = ValidationVerdict.INSUFFICIENT_EVIDENCE
            action = RecommendedAction.ACCEPT_AS_STATISTICAL_OUTLIER
            confidence = 0.55
            summary_parts.append(
                f"Multi-agent review found inconclusive evidence for Record #{bundle.record_index}. "
                f"Detector and forensic signals are mixed or claim verification support is marginal (CVR: {int(cvr * 100)}%). "
                f"Requires human analyst inspection to determine contextual validity."
            )

        # Ensure summary adheres strictly to Hard Rule #2: never use 'fraud'
        final_summary = " ".join(summary_parts)
        final_summary = final_summary.replace("fraud", "statistically unusual pattern").replace(
            "Fraud", "Statistically unusual pattern"
        )

        return ValidationReportResponse(
            record_index=bundle.record_index,
            domain_type=bundle.domain_type,
            evidence_bundle=bundle,
            agent_assessments=assessments,
            claims=claims,
            claim_verification_ratio=cvr,
            verdict=verdict,
            confidence=confidence,
            recommended_action=action,
            summary=final_summary,
            rule_engine_type="DETERMINISTIC_MULTI_AGENT",
            is_llm_augmented=False,
        )
