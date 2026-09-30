"""Validation Service orchestrating multi-agent verification (C5)."""

from typing import Dict, Any, List
from .base import ValidationReportResponse, AgentAssessment
from .evidence_bundle import EvidenceBundleBuilder
from .statistical_agent import StatisticalAgent
from .forensic_agent import ForensicAgent
from .domain_agent import DomainAgent
from .claim_verifier import ClaimVerifier
from .arbiter import ValidationArbiter


class ValidationService:
    """Service orchestrating grounded multi-agent validation pipeline."""

    def __init__(self):
        self.statistical_agent = StatisticalAgent()
        self.forensic_agent = ForensicAgent()
        self.domain_agent = DomainAgent()
        self.claim_verifier = ClaimVerifier()

    def validate_record(self, data: Dict[str, Any]) -> ValidationReportResponse:
        """Executes full multi-agent validation workflow for a record."""
        # 1. Build Evidence Bundle
        bundle = EvidenceBundleBuilder.build(
            record_index=data.get("record_index", 0),
            record_values=data.get("record_values", {}),
            domain_type=data.get("domain_type", "GENERIC"),
            peer_group=data.get("peer_group"),
            peer_group_size=data.get("peer_group_size", 0),
            peer_medians=data.get("peer_medians", {}),
            peer_mads=data.get("peer_mads", {}),
            peer_iqr=data.get("peer_iqr", {}),
            detector_scores=data.get("detector_scores", {}),
            detector_p_values=data.get("detector_p_values", {}),
            detector_flags=data.get("detector_flags", {}),
            combined_p_value=data.get("combined_p_value", 1.0),
            q_value=data.get("q_value", 1.0),
            ensemble_score=data.get("ensemble_score", 0.0),
            atpi_score=data.get("atpi_score", 0.0),
            top_features=data.get("top_features", []),
            counterfactual_distance=data.get("counterfactual_distance", 0.0),
            counterfactual_adjustments_count=data.get("counterfactual_adjustments_count", 0),
            forensic_conformance=data.get("forensic_conformance", {}),
        )

        # 2. Run Parallel Multi-Agent Evaluations
        stat_assessment = self.statistical_agent.evaluate(bundle)
        forensic_assessment = self.forensic_agent.evaluate(bundle)
        domain_assessment = self.domain_agent.evaluate(bundle)

        assessments: List[AgentAssessment] = [
            stat_assessment,
            forensic_assessment,
            domain_assessment,
        ]

        # 3. Grounded Claim Verification
        claims, cvr = self.claim_verifier.verify_claims(bundle)

        # 4. Arbitration and Synthesis
        report = ValidationArbiter.arbitrate(
            bundle=bundle,
            assessments=assessments,
            claims=claims,
            cvr=cvr,
        )

        return report

    def validate_batch(self, items: List[Dict[str, Any]]) -> List[ValidationReportResponse]:
        """Validates a batch of records."""
        return [self.validate_record(item) for item in items]


# Singleton instance
validation_service = ValidationService()
