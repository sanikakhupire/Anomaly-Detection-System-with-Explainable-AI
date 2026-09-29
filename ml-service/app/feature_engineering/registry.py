"""
Plugin-Style Feature Template Registry
Defines deterministic statistical feature generators across public dataset domains:
- Census: density, gender ratio, literacy rate, YoY change
- MGNREGA: wage per workday, attendance ratio, workdays per worker, expenditure change
- Election: turnout %, vote share %, victory margin %
Features execute strictly when required canonical mapped columns exist.
"""

from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd


class BaseFeatureTemplate(ABC):
    """Abstract base class for domain-specific feature engineering plugins."""

    def __init__(
        self,
        name: str,
        description: str,
        domain: str,
        required_roles: List[str],
        formula: str,
        dtype: str = "numeric"
    ):
        self.name = name
        self.description = description
        self.domain = domain
        self.required_roles = required_roles
        self.formula = formula
        self.dtype = dtype

    def can_apply(self, mapping: Dict[str, Any]) -> bool:
        """Checks if all required canonical roles are mapped in dataset."""
        mapped_roles = set()
        for col_name, info in mapping.items():
            role = info.get("canonicalRole") if isinstance(info, dict) else info
            if role and role != "unmapped":
                mapped_roles.add(role)
        return all(req in mapped_roles for req in self.required_roles)

    def get_column_by_role(self, mapping: Dict[str, Any], role: str) -> Optional[str]:
        """Resolves the physical column name mapped to a canonical role."""
        for col_name, info in mapping.items():
            mapped_role = info.get("canonicalRole") if isinstance(info, dict) else info
            if mapped_role == role:
                return col_name
        return None

    @abstractmethod
    def compute(self, df: pd.DataFrame, mapping: Dict[str, Any]) -> pd.Series:
        """Executes formula on DataFrame and returns computed feature Series."""
        pass


# ==========================================
# 1. CENSUS FEATURE TEMPLATES
# ==========================================

class PopulationDensityTemplate(BaseFeatureTemplate):
    def __init__(self):
        super().__init__(
            name="pop_density",
            description="Population Density (people per square kilometer)",
            domain="Census",
            required_roles=["population_total", "area_sq_km"],
            formula="population_total / area_sq_km"
        )

    def compute(self, df: pd.DataFrame, mapping: Dict[str, Any]) -> pd.Series:
        pop_col = self.get_column_by_role(mapping, "population_total")
        area_col = self.get_column_by_role(mapping, "area_sq_km")
        pop = pd.to_numeric(df[pop_col], errors="coerce")
        area = pd.to_numeric(df[area_col], errors="coerce")
        return pd.Series(np.where(area > 0, pop / area, np.nan), index=df.index, name=self.name)


class GenderRatioTemplate(BaseFeatureTemplate):
    def __init__(self):
        super().__init__(
            name="gender_ratio",
            description="Sex Ratio (Females per 1,000 Males)",
            domain="Census",
            required_roles=["population_male", "population_female"],
            formula="(population_female / population_male) * 1000"
        )

    def compute(self, df: pd.DataFrame, mapping: Dict[str, Any]) -> pd.Series:
        male_col = self.get_column_by_role(mapping, "population_male")
        female_col = self.get_column_by_role(mapping, "population_female")
        males = pd.to_numeric(df[male_col], errors="coerce")
        females = pd.to_numeric(df[female_col], errors="coerce")
        return pd.Series(np.where(males > 0, (females / males) * 1000.0, np.nan), index=df.index, name=self.name)


class LiteracyRateTemplate(BaseFeatureTemplate):
    def __init__(self):
        super().__init__(
            name="literacy_rate_pct",
            description="Literacy Rate (% of total population)",
            domain="Census",
            required_roles=["literacy_total", "population_total"],
            formula="(literacy_total / population_total) * 100"
        )

    def compute(self, df: pd.DataFrame, mapping: Dict[str, Any]) -> pd.Series:
        lit_col = self.get_column_by_role(mapping, "literacy_total")
        pop_col = self.get_column_by_role(mapping, "population_total")
        lit = pd.to_numeric(df[lit_col], errors="coerce")
        pop = pd.to_numeric(df[pop_col], errors="coerce")
        return pd.Series(np.where(pop > 0, (lit / pop) * 100.0, np.nan), index=df.index, name=self.name)


class PopulationYoYGrowthTemplate(BaseFeatureTemplate):
    def __init__(self):
        super().__init__(
            name="pop_yoy_growth",
            description="Year-over-Year Population Growth Percentage",
            domain="Census",
            required_roles=["population_total", "year"],
            formula="pct_change(population_total) over year by region"
        )

    def compute(self, df: pd.DataFrame, mapping: Dict[str, Any]) -> pd.Series:
        pop_col = self.get_column_by_role(mapping, "population_total")
        year_col = self.get_column_by_role(mapping, "year")
        district_col = self.get_column_by_role(mapping, "district")

        temp = df[[pop_col, year_col]].copy()
        temp[pop_col] = pd.to_numeric(temp[pop_col], errors="coerce")
        temp[year_col] = pd.to_numeric(temp[year_col], errors="coerce")

        if district_col and district_col in df.columns:
            temp[district_col] = df[district_col]
            temp = temp.sort_values(by=[district_col, year_col])
            growth = temp.groupby(district_col)[pop_col].pct_change() * 100.0
        else:
            temp = temp.sort_values(by=year_col)
            growth = temp[pop_col].pct_change() * 100.0

        return growth.reindex(df.index).fillna(0.0)


# ==========================================
# 2. MGNREGA FEATURE TEMPLATES
# ==========================================

class WagePerWorkdayTemplate(BaseFeatureTemplate):
    def __init__(self):
        super().__init__(
            name="wage_per_workday",
            description="Average Daily Wage Rate (Wages disbursed per Personday)",
            domain="MGNREGA",
            required_roles=["wages_total", "workdays_total"],
            formula="wages_total / workdays_total"
        )

    def compute(self, df: pd.DataFrame, mapping: Dict[str, Any]) -> pd.Series:
        wage_col = self.get_column_by_role(mapping, "wages_total")
        days_col = self.get_column_by_role(mapping, "workdays_total")
        wages = pd.to_numeric(df[wage_col], errors="coerce")
        days = pd.to_numeric(df[days_col], errors="coerce")
        return pd.Series(np.where(days > 0, wages / days, np.nan), index=df.index, name=self.name)


class WorkdaysPerPersonTemplate(BaseFeatureTemplate):
    def __init__(self):
        super().__init__(
            name="workdays_per_person",
            description="Average Workdays Generated per Employed Person",
            domain="MGNREGA",
            required_roles=["workdays_total", "persons_worked"],
            formula="workdays_total / persons_worked"
        )

    def compute(self, df: pd.DataFrame, mapping: Dict[str, Any]) -> pd.Series:
        days_col = self.get_column_by_role(mapping, "workdays_total")
        persons_col = self.get_column_by_role(mapping, "persons_worked")
        days = pd.to_numeric(df[days_col], errors="coerce")
        persons = pd.to_numeric(df[persons_col], errors="coerce")
        return pd.Series(np.where(persons > 0, days / persons, np.nan), index=df.index, name=self.name)


class AttendanceRatioTemplate(BaseFeatureTemplate):
    def __init__(self):
        super().__init__(
            name="attendance_ratio",
            description="Muster Roll Attendance to Workforce Ratio",
            domain="MGNREGA",
            required_roles=["attendance_total", "persons_worked"],
            formula="attendance_total / persons_worked"
        )

    def compute(self, df: pd.DataFrame, mapping: Dict[str, Any]) -> pd.Series:
        att_col = self.get_column_by_role(mapping, "attendance_total")
        persons_col = self.get_column_by_role(mapping, "persons_worked")
        att = pd.to_numeric(df[att_col], errors="coerce")
        persons = pd.to_numeric(df[persons_col], errors="coerce")
        return pd.Series(np.where(persons > 0, att / persons, np.nan), index=df.index, name=self.name)


# ==========================================
# 3. ELECTION FEATURE TEMPLATES
# ==========================================

class VoterTurnoutTemplate(BaseFeatureTemplate):
    def __init__(self):
        super().__init__(
            name="turnout_pct",
            description="Voter Turnout Percentage (Votes Polled / Total Electors)",
            domain="Election",
            required_roles=["votes_polled", "total_electors"],
            formula="(votes_polled / total_electors) * 100"
        )

    def compute(self, df: pd.DataFrame, mapping: Dict[str, Any]) -> pd.Series:
        polled_col = self.get_column_by_role(mapping, "votes_polled")
        electors_col = self.get_column_by_role(mapping, "total_electors")
        polled = pd.to_numeric(df[polled_col], errors="coerce")
        electors = pd.to_numeric(df[electors_col], errors="coerce")
        return pd.Series(np.where(electors > 0, (polled / electors) * 100.0, np.nan), index=df.index, name=self.name)


class VoteShareTemplate(BaseFeatureTemplate):
    def __init__(self):
        super().__init__(
            name="vote_share_pct",
            description="Candidate/Party Vote Share Percentage",
            domain="Election",
            required_roles=["candidate_votes", "votes_polled"],
            formula="(candidate_votes / votes_polled) * 100"
        )

    def compute(self, df: pd.DataFrame, mapping: Dict[str, Any]) -> pd.Series:
        cand_col = self.get_column_by_role(mapping, "candidate_votes")
        polled_col = self.get_column_by_role(mapping, "votes_polled")
        cand = pd.to_numeric(df[cand_col], errors="coerce")
        polled = pd.to_numeric(df[polled_col], errors="coerce")
        return pd.Series(np.where(polled > 0, (cand / polled) * 100.0, np.nan), index=df.index, name=self.name)


class VictoryMarginTemplate(BaseFeatureTemplate):
    def __init__(self):
        super().__init__(
            name="margin_pct",
            description="Victory Margin Percentage (Margin / Votes Polled)",
            domain="Election",
            required_roles=["margin", "votes_polled"],
            formula="(margin / votes_polled) * 100"
        )

    def compute(self, df: pd.DataFrame, mapping: Dict[str, Any]) -> pd.Series:
        margin_col = self.get_column_by_role(mapping, "margin")
        polled_col = self.get_column_by_role(mapping, "votes_polled")
        margin = pd.to_numeric(df[margin_col], errors="coerce")
        polled = pd.to_numeric(df[polled_col], errors="coerce")
        return pd.Series(np.where(polled > 0, (margin / polled) * 100.0, np.nan), index=df.index, name=self.name)


# ==========================================
# 4. FEATURE REGISTRY MANAGER
# ==========================================

class FeatureRegistry:
    """Plugin manager for statistical feature extraction."""

    def __init__(self):
        self._templates: List[BaseFeatureTemplate] = []
        self._register_default_templates()

    def _register_default_templates(self):
        # Census
        self.register(PopulationDensityTemplate())
        self.register(GenderRatioTemplate())
        self.register(LiteracyRateTemplate())
        self.register(PopulationYoYGrowthTemplate())

        # MGNREGA
        self.register(WagePerWorkdayTemplate())
        self.register(WorkdaysPerPersonTemplate())
        self.register(AttendanceRatioTemplate())

        # Election
        self.register(VoterTurnoutTemplate())
        self.register(VoteShareTemplate())
        self.register(VictoryMarginTemplate())

    def register(self, template: BaseFeatureTemplate):
        self._templates.append(template)

    def get_applicable(self, mapping: Dict[str, Any]) -> List[BaseFeatureTemplate]:
        return [t for t in self._templates if t.can_apply(mapping)]

    def execute_all(
        self, df: pd.DataFrame, mapping: Dict[str, Any]
    ) -> Dict[str, Any]:
        applicable = self.get_applicable(mapping)
        feature_metadata = []
        features_df = pd.DataFrame(index=df.index)

        for tmpl in applicable:
            try:
                series = tmpl.compute(df, mapping)
                features_df[tmpl.name] = series

                # Calculate distribution summary metrics
                valid_vals = series.dropna()
                source_cols = [
                    tmpl.get_column_by_role(mapping, r) for r in tmpl.required_roles
                ]

                meta = {
                    "name": tmpl.name,
                    "description": tmpl.description,
                    "domain": tmpl.domain,
                    "formula": tmpl.formula,
                    "sourceColumns": [c for c in source_cols if c],
                    "dtype": tmpl.dtype,
                    "mean": round(float(valid_vals.mean()), 4) if not valid_vals.empty else None,
                    "min": round(float(valid_vals.min()), 4) if not valid_vals.empty else None,
                    "max": round(float(valid_vals.max()), 4) if not valid_vals.empty else None,
                    "std": round(float(valid_vals.std()), 4) if len(valid_vals) > 1 else None,
                    "median": round(float(valid_vals.median()), 4) if not valid_vals.empty else None,
                    "nonNullCount": int(len(valid_vals)),
                }
                feature_metadata.append(meta)
            except Exception as e:
                print(f"[Feature Registry] Warning: Error computing '{tmpl.name}': {e}")

        return {
            "features": feature_metadata,
            "featureData": features_df,
        }


# Global registry singleton
feature_registry = FeatureRegistry()
