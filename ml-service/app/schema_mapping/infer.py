"""
Deterministic Semantic Schema Mapping
Infers canonical column semantics using regular expressions, keyword heuristics,
data types, and value distributions with calibrated confidence scores.
"""

import re
from typing import Dict, Any, List
import pandas as pd

# Canonical semantic definitions and pattern rules
SEMANTIC_RULES = [
    # Hierarchy levels
    {
        "role": "state",
        "description": "State or Province administrative unit",
        "is_hierarchy": True,
        "hierarchy_level": 1,
        "patterns": [r"^state(_name)?$", r"^st_name$", r"^state_ut$"],
        "keywords": ["state", "province", "pradesh"],
        "preferred_type": "text",
        "base_confidence": 0.95
    },
    {
        "role": "district",
        "description": "District administrative unit",
        "is_hierarchy": True,
        "hierarchy_level": 2,
        "patterns": [r"^dist(rict)?(_name)?$", r"^dt_name$", r"^district_code$"],
        "keywords": ["district", "dist", "zilla"],
        "preferred_type": "text",
        "base_confidence": 0.95
    },
    {
        "role": "block",
        "description": "Sub-district / Block / Tehsil unit",
        "is_hierarchy": True,
        "hierarchy_level": 3,
        "patterns": [r"^block(_name)?$", r"^tehsil$", r"^taluk(a)?$", r"^sub_dist(rict)?$"],
        "keywords": ["block", "tehsil", "taluk", "mandal"],
        "preferred_type": "text",
        "base_confidence": 0.90
    },
    {
        "role": "panchayat",
        "description": "Village / Gram Panchayat local unit",
        "is_hierarchy": True,
        "hierarchy_level": 4,
        "patterns": [r"^panchayat(_name)?$", r"^gp_name$", r"^village(_name)?$"],
        "keywords": ["panchayat", "village", "gp"],
        "preferred_type": "text",
        "base_confidence": 0.90
    },
    {
        "role": "constituency",
        "description": "Electoral constituency / riding",
        "is_hierarchy": True,
        "hierarchy_level": 2,
        "patterns": [r"^constituency(_name)?$", r"^ac_name$", r"^pc_name$"],
        "keywords": ["constituency", "ac_name", "pc_name", "assembly"],
        "preferred_type": "text",
        "base_confidence": 0.95
    },

    # Temporal
    {
        "role": "year",
        "description": "Year of observation",
        "is_hierarchy": False,
        "patterns": [r"^year$", r"^yr$", r"^census_year$", r"^elec_year$"],
        "keywords": ["year"],
        "preferred_type": "numeric",
        "base_confidence": 0.95
    },
    {
        "role": "date",
        "description": "Calendar date or timestamp",
        "is_hierarchy": False,
        "patterns": [r"^date$", r"^timestamp$", r"^survey_date$", r"^month$"],
        "keywords": ["date", "timestamp"],
        "preferred_type": "datetime",
        "base_confidence": 0.95
    },

    # Census domain
    {
        "role": "population_total",
        "description": "Total resident population",
        "is_hierarchy": False,
        "patterns": [r"^pop(ulation)?(_total)?$", r"^tot_pop$", r"^persons$", r"^total_population$"],
        "keywords": ["population", "tot_pop", "headcount", "persons"],
        "preferred_type": "numeric",
        "base_confidence": 0.92
    },
    {
        "role": "population_male",
        "description": "Male population count",
        "is_hierarchy": False,
        "patterns": [r"^pop_male$", r"^male_pop$", r"^males?$", r"^p_male$"],
        "keywords": ["male"],
        "preferred_type": "numeric",
        "base_confidence": 0.90
    },
    {
        "role": "population_female",
        "description": "Female population count",
        "is_hierarchy": False,
        "patterns": [r"^pop_female$", r"^female_pop$", r"^females?$", r"^p_female$"],
        "keywords": ["female"],
        "preferred_type": "numeric",
        "base_confidence": 0.90
    },
    {
        "role": "area_sq_km",
        "description": "Geographical surface area in sq km",
        "is_hierarchy": False,
        "patterns": [r"^area(_sq_?km)?$", r"^area_km2$", r"^geo_area$"],
        "keywords": ["area", "sq_km", "sqkm"],
        "preferred_type": "numeric",
        "base_confidence": 0.90
    },
    {
        "role": "literacy_total",
        "description": "Total literate population count",
        "is_hierarchy": False,
        "patterns": [r"^literates?(_tot(al)?)?$", r"^p_lit$", r"^literacy$"],
        "keywords": ["literacy", "literate", "lit"],
        "preferred_type": "numeric",
        "base_confidence": 0.88
    },

    # MGNREGA domain
    {
        "role": "wages_total",
        "description": "Total wages paid or disbursed",
        "is_hierarchy": False,
        "patterns": [r"^wages?(_total)?$", r"^wage_amount$", r"^wages_paid$", r"^total_wage(s)?$"],
        "keywords": ["wage", "wages", "wage_rate"],
        "preferred_type": "numeric",
        "base_confidence": 0.92
    },
    {
        "role": "workdays_total",
        "description": "Total persondays / workdays generated",
        "is_hierarchy": False,
        "patterns": [r"^persondays$", r"^workdays?(_total)?$", r"^mandays$", r"^total_workdays?$"],
        "keywords": ["workday", "personday", "manday"],
        "preferred_type": "numeric",
        "base_confidence": 0.92
    },
    {
        "role": "persons_worked",
        "description": "Number of active workers employed",
        "is_hierarchy": False,
        "patterns": [r"^workers$", r"^persons_worked$", r"^total_workers$", r"^individuals$"],
        "keywords": ["workers", "employed", "persons_worked"],
        "preferred_type": "numeric",
        "base_confidence": 0.88
    },
    {
        "role": "attendance_total",
        "description": "Reported muster attendance",
        "is_hierarchy": False,
        "patterns": [r"^attendance$", r"^muster_attendance$", r"^days_attended$"],
        "keywords": ["attendance", "muster"],
        "preferred_type": "numeric",
        "base_confidence": 0.88
    },
    {
        "role": "expenditure_total",
        "description": "Total expenditure on scheme execution",
        "is_hierarchy": False,
        "patterns": [r"^expenditure(_total)?$", r"^total_expenditure$", r"^spending$"],
        "keywords": ["expenditure", "spending", "disbursement"],
        "preferred_type": "numeric",
        "base_confidence": 0.88
    },

    # Election domain
    {
        "role": "total_electors",
        "description": "Total registered eligible voters",
        "is_hierarchy": False,
        "patterns": [r"^electors$", r"^total_electors$", r"^voters$", r"^reg_voters$"],
        "keywords": ["electors", "voters", "electorate"],
        "preferred_type": "numeric",
        "base_confidence": 0.92
    },
    {
        "role": "votes_polled",
        "description": "Total actual votes cast in election",
        "is_hierarchy": False,
        "patterns": [r"^votes_polled$", r"^total_votes$", r"^valid_votes$", r"^votes_cast$"],
        "keywords": ["polled", "votes_cast", "total_votes"],
        "preferred_type": "numeric",
        "base_confidence": 0.92
    },
    {
        "role": "candidate_votes",
        "description": "Votes received by specific candidate or leading party",
        "is_hierarchy": False,
        "patterns": [r"^candidate_votes$", r"^party_votes$", r"^winner_votes$"],
        "keywords": ["candidate_votes", "party_votes"],
        "preferred_type": "numeric",
        "base_confidence": 0.88
    },
    {
        "role": "margin",
        "description": "Margin of victory between top candidates",
        "is_hierarchy": False,
        "patterns": [r"^margin$", r"^victory_margin$", r"^vote_diff$"],
        "keywords": ["margin", "victory_margin"],
        "preferred_type": "numeric",
        "base_confidence": 0.90
    }
]


def infer_schema_mapping(df_or_cols, sample_df: pd.DataFrame = None) -> Dict[str, Any]:
    """
    Infers semantic role for each column with calibrated confidence.
    df_or_cols: can be a DataFrame or a list of column names.
    sample_df: optional DataFrame sample for value inspection.
    """
    if isinstance(df_or_cols, pd.DataFrame):
        sample_df = df_or_cols.head(100)
        columns = list(df_or_cols.columns)
    else:
        columns = list(df_or_cols)

    mapping = {}

    for col in columns:
        col_str = str(col).strip().lower()
        col_clean = re.sub(r"[^a-z0-9_]", "_", col_str).strip("_")

        best_match = None
        best_confidence = 0.0

        for rule in SEMANTIC_RULES:
            confidence = 0.0

            # 1. Exact regex match
            for pat in rule["patterns"]:
                if re.match(pat, col_clean, re.IGNORECASE):
                    confidence = rule["base_confidence"]
                    break

            # 2. Keyword heuristic
            if confidence == 0.0:
                for kw in rule["keywords"]:
                    if kw in col_clean:
                        confidence = rule["base_confidence"] - 0.15
                        break

            # 3. Value-based verification if sample DataFrame provided
            if confidence > 0 and sample_df is not None and col in sample_df.columns:
                series = sample_df[col].dropna()
                if not series.empty:
                    # Check year values
                    if rule["role"] == "year":
                        try:
                            nums = pd.to_numeric(series, errors="coerce").dropna()
                            if nums.between(1900, 2100).all():
                                confidence = min(1.0, confidence + 0.05)
                            else:
                                confidence -= 0.3
                        except Exception:
                            confidence -= 0.4
                    # Check numeric types
                    elif rule["preferred_type"] == "numeric":
                        if pd.api.types.is_numeric_dtype(sample_df[col]):
                            confidence = min(1.0, confidence + 0.05)
                        else:
                            confidence -= 0.25

            if confidence > best_confidence:
                best_confidence = confidence
                best_match = rule

        if best_match and best_confidence >= 0.5:
            mapping[col] = {
                "canonicalRole": best_match["role"],
                "confidence": round(best_confidence, 2),
                "isHierarchy": best_match["is_hierarchy"],
                "hierarchyLevel": best_match.get("hierarchy_level"),
                "description": best_match["description"]
            }
        else:
            mapping[col] = {
                "canonicalRole": "unmapped",
                "confidence": 0.0,
                "isHierarchy": False,
                "hierarchyLevel": None,
                "description": "Unclassified column"
            }

    return mapping
