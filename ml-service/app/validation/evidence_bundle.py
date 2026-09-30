"""Evidence Bundle builder for Grounded Multi-Agent Validation (C5)."""

from typing import Dict, Any, List, Optional
from .base import EvidenceBundle


class EvidenceBundleBuilder:
    """Builds a standardized, grounded EvidenceBundle from heterogeneous pipeline components."""

    @staticmethod
    def build(
        record_index: int,
        record_values: Dict[str, Any],
        domain_type: str = "GENERIC",
        peer_group: Optional[str] = None,
        peer_group_size: int = 0,
        peer_medians: Optional[Dict[str, float]] = None,
        peer_mads: Optional[Dict[str, float]] = None,
        peer_iqr: Optional[Dict[str, List[float]]] = None,
        detector_scores: Optional[Dict[str, float]] = None,
        detector_p_values: Optional[Dict[str, float]] = None,
        detector_flags: Optional[Dict[str, bool]] = None,
        combined_p_value: float = 1.0,
        q_value: float = 1.0,
        ensemble_score: float = 0.0,
        atpi_score: float = 0.0,
        top_features: Optional[List[Dict[str, Any]]] = None,
        counterfactual_distance: float = 0.0,
        counterfactual_adjustments_count: int = 0,
        forensic_conformance: Optional[Dict[str, Any]] = None,
    ) -> EvidenceBundle:
        """Constructs an EvidenceBundle instance ensuring clean numerical types."""
        clean_medians = {k: float(v) for k, v in (peer_medians or {}).items() if v is not None}
        clean_mads = {k: float(v) for k, v in (peer_mads or {}).items() if v is not None}
        clean_iqr = {
            k: [float(v[0]), float(v[1])]
            for k, v in (peer_iqr or {}).items()
            if isinstance(v, (list, tuple)) and len(v) >= 2
        }
        clean_scores = {k: float(v) for k, v in (detector_scores or {}).items() if v is not None}
        clean_pvals = {k: float(v) for k, v in (detector_p_values or {}).items() if v is not None}
        clean_flags = {k: bool(v) for k, v in (detector_flags or {}).items()}

        # Normalize domain type
        dt = (domain_type or "GENERIC").upper()
        if dt not in ["CENSUS", "MGNREGA", "ELECTION"]:
            dt = "GENERIC"

        return EvidenceBundle(
            record_index=record_index,
            domain_type=dt,
            record_values=record_values or {},
            peer_group=peer_group,
            peer_group_size=max(0, int(peer_group_size)),
            peer_medians=clean_medians,
            peer_mads=clean_mads,
            peer_iqr=clean_iqr,
            detector_scores=clean_scores,
            detector_p_values=clean_pvals,
            detector_flags=clean_flags,
            combined_p_value=float(combined_p_value),
            q_value=float(q_value),
            ensemble_score=float(ensemble_score),
            atpi_score=float(atpi_score),
            top_features=top_features or [],
            counterfactual_distance=float(counterfactual_distance),
            counterfactual_adjustments_count=int(counterfactual_adjustments_count),
            forensic_conformance=forensic_conformance or {},
        )
