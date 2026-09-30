"""Pydantic schemas and enums for Grounded Multi-Agent Validation (C5)."""

from enum import Enum
from typing import Dict, List, Any, Optional
from pydantic import BaseModel, Field


class ClaimVerificationStatus(str, Enum):
    VERIFIED = "VERIFIED"
    CONTRADICTED = "CONTRADICTED"
    UNSUPPORTABLE = "UNSUPPORTABLE"


class ValidationVerdict(str, Enum):
    CONFIRMED_ANOMALY = "CONFIRMED_ANOMALY"
    DATA_QUALITY_ARTIFACT = "DATA_QUALITY_ARTIFACT"
    BENIGN_EXTREME_VARIATION = "BENIGN_EXTREME_VARIATION"
    INSUFFICIENT_EVIDENCE = "INSUFFICIENT_EVIDENCE"


class RecommendedAction(str, Enum):
    ESCALATE_FOR_AUDIT = "ESCALATE_FOR_AUDIT"
    ACCEPT_AS_STATISTICAL_OUTLIER = "ACCEPT_AS_STATISTICAL_OUTLIER"
    MARK_FALSE_POSITIVE = "MARK_FALSE_POSITIVE"
    REQUEST_DATA_CORRECTION = "REQUEST_DATA_CORRECTION"


class EvidenceBundle(BaseModel):
    """Structured evidence bundle extracted from raw record, peer groups, forensics, and explainability."""
    record_index: int
    domain_type: str = "GENERIC"  # CENSUS, MGNREGA, ELECTION, GENERIC
    record_values: Dict[str, Any] = Field(default_factory=dict)
    peer_group: Optional[str] = None
    peer_group_size: int = 0
    peer_medians: Dict[str, float] = Field(default_factory=dict)
    peer_mads: Dict[str, float] = Field(default_factory=dict)
    peer_iqr: Dict[str, List[float]] = Field(default_factory=dict)  # [q25, q75]
    detector_scores: Dict[str, float] = Field(default_factory=dict)
    detector_p_values: Dict[str, float] = Field(default_factory=dict)
    detector_flags: Dict[str, bool] = Field(default_factory=dict)
    combined_p_value: float = 1.0
    q_value: float = 1.0
    ensemble_score: float = 0.0
    atpi_score: float = 0.0
    top_features: List[Dict[str, Any]] = Field(default_factory=list)
    counterfactual_distance: float = 0.0
    counterfactual_adjustments_count: int = 0
    forensic_conformance: Dict[str, Any] = Field(default_factory=dict)


class ClaimItem(BaseModel):
    """An individual atomic claim with verification status and grounded citation."""
    claim_id: str
    claim_text: str
    feature: Optional[str] = None
    status: ClaimVerificationStatus
    ground_fact: str
    citation_source: str  # e.g., "peer_group_statistics", "domain_invariants", "conformal_p_values"
    numerical_deviation: Optional[float] = None


class AgentAssessment(BaseModel):
    """Assessment from a specialized verification agent."""
    agent_name: str
    perspective: str
    supports_anomaly: bool
    confidence: float = Field(ge=0.0, le=1.0)
    findings: List[str] = Field(default_factory=list)
    flags: List[str] = Field(default_factory=list)
    recommended_verdict: ValidationVerdict


class ValidationReportResponse(BaseModel):
    """Complete multi-agent validation report with claim verification and arbitration."""
    record_index: int
    domain_type: str
    evidence_bundle: EvidenceBundle
    agent_assessments: List[AgentAssessment]
    claims: List[ClaimItem]
    claim_verification_ratio: float = Field(ge=0.0, le=1.0)
    verdict: ValidationVerdict
    confidence: float = Field(ge=0.0, le=1.0)
    recommended_action: RecommendedAction
    summary: str
    rule_engine_type: str = "DETERMINISTIC_MULTI_AGENT"
    is_llm_augmented: bool = False
