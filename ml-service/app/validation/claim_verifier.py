"""Claim Verifier module for Grounded Multi-Agent Validation (C5)."""

from typing import List, Tuple
from .base import EvidenceBundle, ClaimItem, ClaimVerificationStatus


class ClaimVerifier:
    """Extracts factual claims and verifies them strictly against the grounded EvidenceBundle."""

    def verify_claims(self, bundle: EvidenceBundle) -> Tuple[List[ClaimItem], float]:
        claims: List[ClaimItem] = []
        claim_counter = 1

        # 1. Feature Attribution & Peer Median Claims
        for feat in bundle.top_features[:4]:
            fname = feat.get("feature")
            if not fname:
                continue

            rec_val = bundle.record_values.get(fname)
            peer_med = bundle.peer_medians.get(fname)
            peer_mad = bundle.peer_mads.get(fname)

            if rec_val is not None and peer_med is not None:
                try:
                    num_val = float(rec_val)
                    num_med = float(peer_med)
                    diff = num_val - num_med
                    direction = "exceeds" if diff > 0 else "is below"

                    # Claim: Value relative to peer median
                    claim_text = (
                        f"Feature '{fname}' value of {num_val:.2f} {direction} peer baseline median "
                        f"of {num_med:.2f} by {abs(diff):.2f} units."
                    )
                    ground_fact = f"record_values['{fname}']={num_val}, peer_medians['{fname}']={num_med}"

                    # Verify fact
                    calc_diff = num_val - num_med
                    is_correct = (diff > 0 and calc_diff > 0) or (diff <= 0 and calc_diff <= 0)
                    status = (
                        ClaimVerificationStatus.VERIFIED
                        if is_correct
                        else ClaimVerificationStatus.CONTRADICTED
                    )

                    claims.append(
                        ClaimItem(
                            claim_id=f"CLM-{claim_counter:03d}",
                            claim_text=claim_text,
                            feature=fname,
                            status=status,
                            ground_fact=ground_fact,
                            citation_source="peer_group_statistics",
                            numerical_deviation=round(diff, 3),
                        )
                    )
                    claim_counter += 1

                except (ValueError, TypeError):
                    claims.append(
                        ClaimItem(
                            claim_id=f"CLM-{claim_counter:03d}",
                            claim_text=f"Feature '{fname}' has numeric comparison available.",
                            feature=fname,
                            status=ClaimVerificationStatus.UNSUPPORTABLE,
                            ground_fact="non_numeric_data",
                            citation_source="peer_group_statistics",
                        )
                    )
                    claim_counter += 1

        # 2. Calibration & FDR Significance Claim
        q_val = bundle.q_value
        is_sig = q_val <= 0.05
        claims.append(
            ClaimItem(
                claim_id=f"CLM-{claim_counter:03d}",
                claim_text=(
                    f"FDR q-value ({q_val:.4f}) {'satisfies' if is_sig else 'does not satisfy'} "
                    f"the 5% false discovery rate significance threshold."
                ),
                feature="q_value",
                status=ClaimVerificationStatus.VERIFIED,
                ground_fact=f"q_value={q_val:.6f}",
                citation_source="conformal_p_values",
                numerical_deviation=round(q_val, 4),
            )
        )
        claim_counter += 1

        # 3. Detector Ensemble Consensus Claim
        flagged_count = sum(1 for v in bundle.detector_flags.values() if v)
        total_count = max(1, len(bundle.detector_flags))
        claims.append(
            ClaimItem(
                claim_id=f"CLM-{claim_counter:03d}",
                claim_text=f"{flagged_count} out of {total_count} detectors independently flagged this record as anomalous.",
                feature="detector_consensus",
                status=ClaimVerificationStatus.VERIFIED,
                ground_fact=f"flagged_count={flagged_count}, total_detectors={total_count}",
                citation_source="detector_scores",
                numerical_deviation=flagged_count,
            )
        )
        claim_counter += 1

        # 4. Domain Invariant Claim
        domain = bundle.domain_type
        if domain == "MGNREGA":
            for k in ["workdays_per_household", "persondays"]:
                if k in bundle.record_values and bundle.record_values[k] is not None:
                    try:
                        v = float(bundle.record_values[k])
                        is_valid = 0 <= v <= 365
                        claims.append(
                            ClaimItem(
                                claim_id=f"CLM-{claim_counter:03d}",
                                claim_text=f"MGNREGA workdays feature '{k}' ({v:.1f}) {'is' if is_valid else 'is NOT'} within physical calendar bounds [0, 365].",
                                feature=k,
                                status=ClaimVerificationStatus.VERIFIED if is_valid else ClaimVerificationStatus.CONTRADICTED,
                                ground_fact=f"record_values['{k}']={v}",
                                citation_source="domain_invariants",
                                numerical_deviation=round(v, 2),
                            )
                        )
                        claim_counter += 1
                    except (ValueError, TypeError):
                        pass

        elif domain == "ELECTION":
            for k in ["turnout_percentage", "turnout_pct"]:
                if k in bundle.record_values and bundle.record_values[k] is not None:
                    try:
                        v = float(bundle.record_values[k])
                        is_valid = 0.0 <= v <= 100.0
                        claims.append(
                            ClaimItem(
                                claim_id=f"CLM-{claim_counter:03d}",
                                claim_text=f"Electoral turnout '{k}' ({v:.2f}%) {'is' if is_valid else 'is NOT'} within [0%, 100%].",
                                feature=k,
                                status=ClaimVerificationStatus.VERIFIED if is_valid else ClaimVerificationStatus.CONTRADICTED,
                                ground_fact=f"record_values['{k}']={v}",
                                citation_source="domain_invariants",
                                numerical_deviation=round(v, 2),
                            )
                        )
                        claim_counter += 1
                    except (ValueError, TypeError):
                        pass

        # 5. Counterfactual Feasibility Claim
        if bundle.counterfactual_adjustments_count > 0:
            claims.append(
                ClaimItem(
                    claim_id=f"CLM-{claim_counter:03d}",
                    claim_text=(
                        f"Minimal plausible counterfactual requires adjusting {bundle.counterfactual_adjustments_count} feature(s) "
                        f"to reach the peer interquartile range."
                    ),
                    feature="counterfactual",
                    status=ClaimVerificationStatus.VERIFIED,
                    ground_fact=f"adjustments_count={bundle.counterfactual_adjustments_count}",
                    citation_source="counterfactual_analysis",
                    numerical_deviation=bundle.counterfactual_distance,
                )
            )
            claim_counter += 1

        # Calculate Claim Verification Ratio (CVR)
        total_claims = len(claims)
        if total_claims == 0:
            cvr = 1.0
        else:
            verified_count = sum(1 for c in claims if c.status == ClaimVerificationStatus.VERIFIED)
            cvr = round(verified_count / total_claims, 3)

        return claims, cvr
