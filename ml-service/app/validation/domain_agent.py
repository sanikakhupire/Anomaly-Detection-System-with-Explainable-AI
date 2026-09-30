"""Domain Plausibility & Constraint Verification Agent."""

from typing import List, Dict, Any
from .base import EvidenceBundle, AgentAssessment, ValidationVerdict


class DomainAgent:
    """Evaluates strict physical, legal, and statutory invariants across Census, MGNREGA, and Election data."""

    AGENT_NAME = "DomainPlausibilityAgent"
    PERSPECTIVE = "Domain constraints, physical possibility, and statutory limits"

    def evaluate(self, bundle: EvidenceBundle) -> AgentAssessment:
        findings: List[str] = []
        flags: List[str] = []
        domain = bundle.domain_type
        vals = bundle.record_values

        impossible_artifact_detected = False

        # --- DOMAIN: MGNREGA ---
        if domain == "MGNREGA":
            # 1. Workdays / persondays check
            for k in ["workdays_per_household", "persondays", "days_worked", "total_persondays"]:
                if k in vals and vals[k] is not None:
                    try:
                        d_val = float(vals[k])
                        if d_val < 0:
                            findings.append(f"Physical invariant violated: '{k}' is negative ({d_val}).")
                            flags.append("NEGATIVE_WORKDAYS_ARTIFACT")
                            impossible_artifact_detected = True
                        elif d_val > 365:
                            findings.append(
                                f"Physical invariant violated: '{k}' ({d_val:.1f}) exceeds annual limit of 365 calendar days."
                            )
                            flags.append("CALENDAR_IMPOSSIBILITY_ARTIFACT")
                            impossible_artifact_detected = True
                        elif d_val > 100:
                            findings.append(
                                f"Statutory threshold exceeded: '{k}' ({d_val:.1f}) exceeds standard 100-day entitlement."
                            )
                            flags.append("EXCEEDS_STATUTORY_100_DAYS")
                    except (ValueError, TypeError):
                        pass

            # 2. Wage rate check
            for k in ["wage_rate", "average_wage", "daily_wage"]:
                if k in vals and vals[k] is not None:
                    try:
                        w_val = float(vals[k])
                        if w_val < 0:
                            findings.append(f"Physical invariant violated: '{k}' is negative ({w_val}).")
                            flags.append("NEGATIVE_WAGE_ARTIFACT")
                            impossible_artifact_detected = True
                        elif w_val > 10000:
                            findings.append(
                                f"Extreme wage rate detected: '{k}' ({w_val}) is drastically above public scheme schedules."
                            )
                            flags.append("EXTREME_WAGE_RATE")
                    except (ValueError, TypeError):
                        pass

            # 3. Completed works vs Total works
            cw = vals.get("completed_works")
            tw = vals.get("total_works")
            if cw is not None and tw is not None:
                try:
                    c_num = float(cw)
                    t_num = float(tw)
                    if c_num > t_num and t_num > 0:
                        findings.append(
                            f"Logical invariant violated: completed works ({c_num}) exceeds total works ({t_num})."
                        )
                        flags.append("COMPLETED_EXCEEDS_TOTAL_WORKS")
                        impossible_artifact_detected = True
                except (ValueError, TypeError):
                    pass

        # --- DOMAIN: ELECTION ---
        elif domain == "ELECTION":
            # 1. Voter turnout check
            for k in ["turnout_percentage", "turnout_pct", "turnout"]:
                if k in vals and vals[k] is not None:
                    try:
                        t_val = float(vals[k])
                        if t_val > 100.0:
                            findings.append(
                                f"Physical invariant violated: turnout '{k}' ({t_val:.2f}%) exceeds 100% of registered electorate."
                            )
                            flags.append("TURNOUT_EXCEEDS_100_PCT")
                            impossible_artifact_detected = True
                        elif t_val < 0.0:
                            findings.append(f"Physical invariant violated: turnout '{k}' ({t_val}%) is negative.")
                            flags.append("NEGATIVE_TURNOUT_ARTIFACT")
                            impossible_artifact_detected = True
                    except (ValueError, TypeError):
                        pass

            # 2. Total votes vs electors
            tv = vals.get("total_votes") or vals.get("votes_polled")
            el = vals.get("electors") or vals.get("registered_voters")
            if tv is not None and el is not None:
                try:
                    tv_num = float(tv)
                    el_num = float(el)
                    if tv_num > el_num and el_num > 0:
                        findings.append(
                            f"Physical invariant violated: total votes polled ({tv_num:.0f}) exceeds registered electors ({el_num:.0f})."
                        )
                        flags.append("VOTES_EXCEED_ELECTORS")
                        impossible_artifact_detected = True
                except (ValueError, TypeError):
                    pass

            # 3. Vote share percentages
            for k in ["winning_vote_share", "margin_percentage", "vote_share"]:
                if k in vals and vals[k] is not None:
                    try:
                        vs = float(vals[k])
                        if vs > 100.0 or vs < 0.0:
                            findings.append(f"Logical invariant violated: '{k}' ({vs}%) is outside [0%, 100%].")
                            flags.append("INVALID_VOTE_SHARE_PERCENTAGE")
                            impossible_artifact_detected = True
                    except (ValueError, TypeError):
                        pass

        # --- DOMAIN: CENSUS ---
        elif domain == "CENSUS":
            # 1. Ratios and percentages
            for k in ["literacy_rate", "work_participation_rate", "urban_proportion"]:
                if k in vals and vals[k] is not None:
                    try:
                        pct = float(vals[k])
                        if pct > 100.0 or pct < 0.0:
                            findings.append(f"Percentage invariant violated: '{k}' ({pct}%) is outside [0%, 100%].")
                            flags.append("INVALID_CENSUS_PERCENTAGE")
                            impossible_artifact_detected = True
                    except (ValueError, TypeError):
                        pass

            # 2. Sex ratio
            for k in ["sex_ratio", "child_sex_ratio"]:
                if k in vals and vals[k] is not None:
                    try:
                        sr = float(vals[k])
                        if sr < 0:
                            findings.append(f"Physical invariant violated: '{k}' is negative ({sr}).")
                            flags.append("NEGATIVE_SEX_RATIO")
                            impossible_artifact_detected = True
                    except (ValueError, TypeError):
                        pass

        # --- GENERIC INVARIANTS ---
        for k, v in vals.items():
            if isinstance(v, (int, float)):
                # Detect NaN or Infinity
                if v != v or v == float("inf") or v == float("-inf"):
                    findings.append(f"Mathematical representation artifact: '{k}' has NaN or Infinite value.")
                    flags.append("NAN_OR_INF_VALUE")
                    impossible_artifact_detected = True

        # Formulate Verdict & Confidence
        if impossible_artifact_detected:
            verdict = ValidationVerdict.DATA_QUALITY_ARTIFACT
            supports = False  # Not a real-world statistical phenomenon; it's a data collection/entry artifact
            confidence = 0.95
            findings.append(
                "Record violates fundamental domain or physical invariants. Recommended categorization is DATA QUALITY ARTIFACT."
            )
        elif len(flags) > 0 and "EXCEEDS_STATUTORY_100_DAYS" in flags:
            verdict = ValidationVerdict.CONFIRMED_ANOMALY
            supports = True
            confidence = 0.85
            findings.append(
                "Record complies with physical invariants but exceeds standard statutory administrative ceilings."
            )
        else:
            verdict = ValidationVerdict.CONFIRMED_ANOMALY
            supports = True
            confidence = 0.70
            findings.append("All inspected domain invariants and physical constraints are satisfied.")

        return AgentAssessment(
            agent_name=self.AGENT_NAME,
            perspective=self.PERSPECTIVE,
            supports_anomaly=supports,
            confidence=round(confidence, 2),
            findings=findings,
            flags=flags,
            recommended_verdict=verdict,
        )
