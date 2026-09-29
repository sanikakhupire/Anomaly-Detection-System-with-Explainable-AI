"""
Synthetic Public Dataset Generators with Calibrated Ground-Truth Anomaly Injection.

Generates realistic benchmark datasets for:
1. Census Demo (Hierarchy: State -> District -> Block, Multi-decade rounds)
2. MGNREGA Demo (Hierarchy: State -> District -> Block -> Gram Panchayat, Monthly time-series)
3. Election Demo (Hierarchy: State -> Parliamentary -> Assembly -> Polling Station, Multi-cycle)

Supports 6 Anomaly Injection Types:
1. Point Outlier (extreme univariate/multivariate spikes)
2. Contextual Outlier (normal globally, abnormal for local peer-group baseline)
3. Collective Anomaly (synchronized cohort behavior / frozen repeating patterns)
4. Temporal Anomaly (sudden spikes, drops, or level-shift drifts)
5. Digit Manipulation (Benford's law distortion, terminal digit heaping)
6. Cross-Source / Relational Conflict (logical arithmetic contradictions)

All datasets are seeded, strictly labeled as SYNTHETIC/DEMO, and output ground-truth label files.
"""

import os
import json
from enum import Enum
from typing import Dict, Any, List, Tuple, Optional
import numpy as np
import pandas as pd


class AnomalyType(str, Enum):
    POINT = "point"
    CONTEXTUAL = "contextual"
    COLLECTIVE = "collective"
    TEMPORAL_SPIKE = "temporal_spike"
    TEMPORAL_DRIFT = "temporal_drift"
    DIGIT_MANIPULATION = "digit_manipulation"
    CROSS_SOURCE_CONFLICT = "cross_source_conflict"
    NONE = "none"


class AnomalyInjector:
    """
    Injects controlled statistical anomalies into synthetic dataframes
    and records ground truth metadata for evaluation metrics (ROC-AUC, Precision, Recall).
    """
    def __init__(self, seed: int = 42, severity: str = "medium"):
        self.seed = seed
        self.rng = np.random.RandomState(seed)
        self.severity_multipliers = {
            "low": 2.5,
            "medium": 4.5,
            "high": 8.0,
        }
        self.mult = self.severity_multipliers.get(severity, 4.5)

    def inject_point_anomaly(
        self, df: pd.DataFrame, target_col: str, index: int
    ) -> Dict[str, Any]:
        """Multiplies target numeric feature into extreme outlier territory."""
        orig_val = float(df.at[index, target_col])
        direction = 1 if self.rng.rand() > 0.3 else -1
        if direction == 1:
            injected_val = orig_val * (1.0 + self.mult * self.rng.uniform(0.8, 1.2))
        else:
            injected_val = max(1.0, orig_val / (self.mult * self.rng.uniform(0.8, 1.2)))

        if isinstance(df.at[index, target_col], (int, np.integer)):
            injected_val = int(round(injected_val))
        else:
            injected_val = float(round(injected_val, 2))

        df.at[index, target_col] = injected_val

        return {
            "record_index": int(index),
            "is_anomaly": True,
            "anomaly_type": AnomalyType.POINT.value,
            "target_column": target_col,
            "original_value": orig_val,
            "injected_value": injected_val,
            "description": f"Extreme point outlier in {target_col}: shifted by factor {self.mult:.1f}x.",
        }

    def inject_contextual_anomaly(
        self, df: pd.DataFrame, target_col: str, group_col: str, index: int
    ) -> Optional[Dict[str, Any]]:
        """
        Injects a value normal in global dataset range, but abnormal for its peer group.
        """
        orig_val = float(df.at[index, target_col])
        current_group = df.at[index, group_col]

        # Calculate group medians
        group_medians = df.groupby(group_col)[target_col].median().to_dict()
        other_medians = [m for g, m in group_medians.items() if g != current_group]
        if not other_medians:
            return None

        # Pick extreme median from other groups
        target_group_median = max(other_medians) if self.rng.rand() > 0.5 else min(other_medians)
        injected_val = target_group_median * self.rng.uniform(0.95, 1.05)

        if isinstance(df.at[index, target_col], (int, np.integer)):
            injected_val = int(round(injected_val))
        else:
            injected_val = float(round(injected_val, 2))

        df.at[index, target_col] = injected_val

        return {
            "record_index": int(index),
            "is_anomaly": True,
            "anomaly_type": AnomalyType.CONTEXTUAL.value,
            "target_column": target_col,
            "peer_group": str(current_group),
            "original_value": orig_val,
            "injected_value": injected_val,
            "description": f"Contextual peer outlier in {target_col}: conforms to global range but violates {current_group} baseline.",
        }

    def inject_collective_anomaly(
        self, df: pd.DataFrame, target_col: str, group_col: str, group_val: Any
    ) -> List[Dict[str, Any]]:
        """
        Injects a coordinated collective anomaly across multiple rows of the same peer cohort.
        """
        sub_indices = df[df[group_col] == group_val].index.tolist()
        if len(sub_indices) < 3:
            return []
        # Keep collective cohort to realistic cluster size of 3 to 4 records
        if len(sub_indices) > 4:
            sub_indices = sub_indices[:4]

        labels = []
        # Freeze all rows in this cohort to identical unnatural repeating value
        frozen_val = float(df.loc[sub_indices, target_col].mean()) * 1.8
        if isinstance(df.at[sub_indices[0], target_col], (int, np.integer)):
            frozen_val = int(round(frozen_val))
        else:
            frozen_val = float(round(frozen_val, 2))

        for idx in sub_indices:
            orig = df.at[idx, target_col]
            df.at[idx, target_col] = frozen_val
            labels.append({
                "record_index": int(idx),
                "is_anomaly": True,
                "anomaly_type": AnomalyType.COLLECTIVE.value,
                "target_column": target_col,
                "peer_group": str(group_val),
                "original_value": orig,
                "injected_value": frozen_val,
                "description": f"Collective cohort anomaly: synchronized identical pattern across {group_val}.",
            })
        return labels

    def inject_temporal_anomaly(
        self, df: pd.DataFrame, target_col: str, date_col: str, index: int, is_drift: bool = False
    ) -> Dict[str, Any]:
        """Injects single-period sudden spike or multi-period sustained step drift."""
        orig_val = float(df.at[index, target_col])
        if is_drift:
            # Shift value up by 150%
            injected_val = orig_val * 2.5
            anomaly_type = AnomalyType.TEMPORAL_DRIFT.value
            desc = f"Temporal CUSUM mean level shift in {target_col}."
        else:
            # Sudden isolated spike
            injected_val = orig_val * 4.0
            anomaly_type = AnomalyType.TEMPORAL_SPIKE.value
            desc = f"Sudden temporal spike outlier in {target_col}."

        if isinstance(df.at[index, target_col], (int, np.integer)):
            injected_val = int(round(injected_val))
        else:
            injected_val = float(round(injected_val, 2))

        df.at[index, target_col] = injected_val

        return {
            "record_index": int(index),
            "is_anomaly": True,
            "anomaly_type": anomaly_type,
            "target_column": target_col,
            "original_value": orig_val,
            "injected_value": injected_val,
            "description": desc,
        }

    def inject_digit_manipulation(
        self, df: pd.DataFrame, target_col: str, index: int
    ) -> Dict[str, Any]:
        """
        Forces leading digit to 9 (Benford's Law violation)
        or heaps trailing digits to '000' (digit heaping violation).
        """
        orig_val = int(round(float(df.at[index, target_col])))
        val_str = str(abs(orig_val))
        if len(val_str) < 3:
            injected_val = orig_val * 10
            val_str = str(injected_val)

        if self.rng.rand() > 0.5:
            # Benford violation: replace leading digit with 9 or 8
            injected_str = "9" + val_str[1:]
            desc = f"Benford Law leading-digit violation in {target_col} (forced leading 9)."
        else:
            # Heaping violation: force last two/three digits to 00
            injected_str = val_str[:-2] + "00"
            desc = f"Terminal digit heaping anomaly in {target_col} (unnatural terminal zeroes)."

        injected_val = int(injected_str)
        df.at[index, target_col] = injected_val

        return {
            "record_index": int(index),
            "is_anomaly": True,
            "anomaly_type": AnomalyType.DIGIT_MANIPULATION.value,
            "target_column": target_col,
            "original_value": orig_val,
            "injected_value": injected_val,
            "description": desc,
        }

    def inject_logical_conflict(
        self, df: pd.DataFrame, col_a: str, col_b: str, index: int, constraint_rule: str
    ) -> Dict[str, Any]:
        """
        Injects arithmetic/relational contradiction between related columns
        (e.g., active > registered, or votes_polled > total_electors).
        """
        val_a = float(df.at[index, col_a])
        orig_b = float(df.at[index, col_b])

        # Force col_b to violate logical boundary: col_b = col_a + excess
        excess = max(10, int(val_a * 0.2))
        injected_b = val_a + excess

        if isinstance(df.at[index, col_b], (int, np.integer)):
            injected_b = int(round(injected_b))
        else:
            injected_b = float(round(injected_b, 2))

        df.at[index, col_b] = injected_b

        return {
            "record_index": int(index),
            "is_anomaly": True,
            "anomaly_type": AnomalyType.CROSS_SOURCE_CONFLICT.value,
            "target_column": f"{col_b} vs {col_a}",
            "original_value": orig_b,
            "injected_value": injected_b,
            "description": f"Logical relational conflict: violated constraint '{constraint_rule}'.",
        }


# ==============================================================================
# DATASET GENERATORS
# ==============================================================================

def generate_census_demo(
    n_records: int = 1200,
    seed: int = 42,
    anomaly_rate: float = 0.06,
    severity: str = "medium"
) -> Tuple[pd.DataFrame, List[Dict[str, Any]]]:
    """
    Generates synthetic Census dataset across states, districts, blocks, and multiple decades.
    """
    rng = np.random.RandomState(seed)

    states = [
        {"name": "Maharashtra", "districts": ["Pune", "Nagpur", "Nashik", "Gadchiroli"]},
        {"name": "Karnataka", "districts": ["Bangalore Urban", "Mysore", "Belgaum", "Raichur"]},
        {"name": "Kerala", "districts": ["Ernakulam", "Thiruvananthapuram", "Wayanad"]},
        {"name": "Bihar", "districts": ["Patna", "Gaya", "Muzaffarpur", "Purnia"]},
    ]
    years = [2001, 2011, 2021]

    rows = []
    for s in states:
        for d in s["districts"]:
            for b_idx in range(1, 6):
                block_name = f"{d}_Block_{b_idx}"
                # Base parameters dependent on district type
                is_metro = "Urban" in d or d in ["Pune", "Bangalore Urban", "Ernakulam", "Patna"]
                base_pop = rng.randint(80000, 250000) if is_metro else rng.randint(25000, 90000)
                area = rng.uniform(80.0, 300.0) if is_metro else rng.uniform(250.0, 900.0)

                for yr in years:
                    growth_factor = 1.0 + (yr - 2001) * 0.012
                    pop = int(base_pop * growth_factor * rng.uniform(0.96, 1.04))

                    # Sex ratio baseline: Kerala ~ 1084, Maharashtra ~ 930, Bihar ~ 918
                    if s["name"] == "Kerala":
                        female_ratio = 0.52
                    elif s["name"] == "Maharashtra":
                        female_ratio = 0.485
                    elif s["name"] == "Karnataka":
                        female_ratio = 0.492
                    else:
                        female_ratio = 0.478

                    females = int(pop * female_ratio * rng.uniform(0.99, 1.01))
                    males = pop - females

                    # Literacy baseline
                    lit_rate = 0.94 if s["name"] == "Kerala" else (0.82 if is_metro else 0.65)
                    literate = int(pop * lit_rate * rng.uniform(0.97, 1.02))
                    literate = min(literate, pop)

                    households = int(pop / rng.uniform(4.2, 5.2))

                    rows.append({
                        "state": s["name"],
                        "district": d,
                        "block": block_name,
                        "year": yr,
                        "total_population": pop,
                        "male_population": males,
                        "female_population": females,
                        "literate_population": literate,
                        "area_sq_km": round(area, 2),
                        "households": households,
                    })

    df = pd.DataFrame(rows).iloc[:n_records].reset_index(drop=True)
    n = len(df)

    # Anomaly Injection
    injector = AnomalyInjector(seed=seed, severity=severity)
    n_anomalies = max(1, int(n * anomaly_rate))
    ground_truth_map: Dict[int, Dict[str, Any]] = {}

    selected_indices = rng.choice(n, size=n_anomalies, replace=False)

    for i, idx in enumerate(selected_indices):
        kind = i % 6
        if kind == 0:
            # 1. Point Anomaly
            res = injector.inject_point_anomaly(df, "total_population", idx)
            ground_truth_map[idx] = res
        elif kind == 1:
            # 2. Contextual Anomaly (low density district has high density block)
            res = injector.inject_contextual_anomaly(df, "total_population", "district", idx)
            if res:
                ground_truth_map[idx] = res
        elif kind == 2:
            # 3. Collective Anomaly
            # Injected on the block level
            blk = df.at[idx, "block"]
            res_list = injector.inject_collective_anomaly(df, "literate_population", "block", blk)
            for r in res_list:
                ground_truth_map[r["record_index"]] = r
        elif kind == 3:
            # 4. Temporal Anomaly
            res = injector.inject_temporal_anomaly(df, "total_population", "year", idx, is_drift=False)
            ground_truth_map[idx] = res
        elif kind == 4:
            # 5. Digit Manipulation
            res = injector.inject_digit_manipulation(df, "households", idx)
            ground_truth_map[idx] = res
        elif kind == 5:
            # 6. Logical Conflict (males + females > total_population)
            res = injector.inject_logical_conflict(
                df, "total_population", "female_population", idx, "female_population < total_population"
            )
            ground_truth_map[idx] = res

    # Consolidate complete labels for all records
    all_labels = []
    for r_idx in range(n):
        if r_idx in ground_truth_map:
            all_labels.append(ground_truth_map[r_idx])
        else:
            all_labels.append({
                "record_index": int(r_idx),
                "is_anomaly": False,
                "anomaly_type": AnomalyType.NONE.value,
                "target_column": None,
                "original_value": None,
                "injected_value": None,
                "description": "Standard nominal census distribution conforming to empirical demographic baseline.",
            })

    return df, all_labels


def generate_mgnrega_demo(
    n_records: int = 1500,
    seed: int = 42,
    anomaly_rate: float = 0.06,
    severity: str = "medium"
) -> Tuple[pd.DataFrame, List[Dict[str, Any]]]:
    """
    Generates synthetic MGNREGA dataset with rural employment and wage disbursements.
    """
    rng = np.random.RandomState(seed)

    districts = [
        {"state": "Rajasthan", "districts": ["Barmer", "Jodhpur", "Bhilwara"]},
        {"state": "Odisha", "districts": ["Mayurbhanj", "Ganjam", "Koraput"]},
        {"state": "Madhya Pradesh", "districts": ["Dhar", "Jhabua", "Rewa"]},
    ]

    dates = pd.date_range(start="2022-01-01", periods=24, freq="MS").strftime("%Y-%m-%d").tolist()

    rows = []
    for s_info in districts:
        st = s_info["state"]
        for dist in s_info["districts"]:
            for b in range(1, 4):
                block_name = f"{dist}_B{b}"
                for gp in range(1, 6):
                    gp_name = f"{block_name}_GP{gp}"
                    reg_workers = rng.randint(450, 1800)

                    for d_str in dates:
                        dt = pd.to_datetime(d_str)
                        month = dt.month
                        year = dt.year

                        # Seasonal demand: Peak in April-June (summer post-harvest), Low in monsoon (Aug-Sep)
                        if month in [4, 5, 6]:
                            act_ratio = rng.uniform(0.65, 0.85)
                            days_per_worker = rng.uniform(18.0, 24.0)
                        elif month in [8, 9]:
                            act_ratio = rng.uniform(0.20, 0.35)
                            days_per_worker = rng.uniform(6.0, 10.0)
                        else:
                            act_ratio = rng.uniform(0.40, 0.60)
                            days_per_worker = rng.uniform(12.0, 16.0)

                        act_workers = max(10, int(reg_workers * act_ratio))
                        workdays = int(act_workers * days_per_worker)

                        # Statutory daily wage ~ 230 to 280 INR
                        daily_wage = rng.uniform(235.0, 275.0)
                        total_wages = int(workdays * daily_wage)
                        delayed_days = int(rng.exponential(scale=3.5))

                        rows.append({
                            "state": st,
                            "district": dist,
                            "block": block_name,
                            "gram_panchayat": gp_name,
                            "date": d_str,
                            "month": month,
                            "year": year,
                            "registered_workers": reg_workers,
                            "active_workers": act_workers,
                            "workdays_generated": workdays,
                            "total_wages_paid_inr": total_wages,
                            "delayed_payment_days": delayed_days,
                        })

    df = pd.DataFrame(rows).iloc[:n_records].reset_index(drop=True)
    n = len(df)

    # Anomaly Injection
    injector = AnomalyInjector(seed=seed, severity=severity)
    n_anomalies = max(1, int(n * anomaly_rate))
    ground_truth_map: Dict[int, Dict[str, Any]] = {}

    selected_indices = rng.choice(n, size=n_anomalies, replace=False)

    for i, idx in enumerate(selected_indices):
        kind = i % 6
        if kind == 0:
            # 1. Point Outlier (wage explosion)
            res = injector.inject_point_anomaly(df, "total_wages_paid_inr", idx)
            ground_truth_map[idx] = res
        elif kind == 1:
            # 2. Contextual Anomaly (low-demand district displays high-demand summer metrics in monsoon)
            res = injector.inject_contextual_anomaly(df, "workdays_generated", "district", idx)
            if res:
                ground_truth_map[idx] = res
        elif kind == 2:
            # 3. Collective Anomaly across Panchayat
            gp_val = df.at[idx, "gram_panchayat"]
            res_list = injector.inject_collective_anomaly(df, "delayed_payment_days", "gram_panchayat", gp_val)
            for r in res_list:
                ground_truth_map[r["record_index"]] = r
        elif kind == 3:
            # 4. Temporal Anomaly (sudden impossible workday spike)
            res = injector.inject_temporal_anomaly(df, "workdays_generated", "date", idx, is_drift=True)
            ground_truth_map[idx] = res
        elif kind == 4:
            # 5. Digit Manipulation
            res = injector.inject_digit_manipulation(df, "total_wages_paid_inr", idx)
            ground_truth_map[idx] = res
        elif kind == 5:
            # 6. Logical Conflict (active_workers > registered_workers)
            res = injector.inject_logical_conflict(
                df, "registered_workers", "active_workers", idx, "active_workers <= registered_workers"
            )
            ground_truth_map[idx] = res

    # Consolidate complete labels
    all_labels = []
    for r_idx in range(n):
        if r_idx in ground_truth_map:
            all_labels.append(ground_truth_map[r_idx])
        else:
            all_labels.append({
                "record_index": int(r_idx),
                "is_anomaly": False,
                "anomaly_type": AnomalyType.NONE.value,
                "target_column": None,
                "original_value": None,
                "injected_value": None,
                "description": "Compliant MGNREGA disbursement and labor allocation records.",
            })

    return df, all_labels


def generate_election_demo(
    n_records: int = 1000,
    seed: int = 42,
    anomaly_rate: float = 0.06,
    severity: str = "medium"
) -> Tuple[pd.DataFrame, List[Dict[str, Any]]]:
    """
    Generates synthetic Election Polling Station dataset with voter turnout and vote share metrics.
    """
    rng = np.random.RandomState(seed)

    states = [
        {"state": "Uttar Pradesh", "pc": ["Varanasi", "Lucknow", "Gorakhpur"]},
        {"state": "West Bengal", "pc": ["Kolkata North", "Diamond Harbour", "Darjeeling"]},
        {"state": "Tamil Nadu", "pc": ["Chennai South", "Madurai", "Coimbatore"]},
    ]
    years = [2014, 2019, 2024]
    parties = ["Party_Alpha", "Party_Beta", "Party_Gamma", "Party_Delta"]

    rows = []
    for s_info in states:
        st = s_info["state"]
        for pc in s_info["pc"]:
            for ac_idx in range(1, 4):
                ac = f"{pc}_AC_{ac_idx}"
                for ps_idx in range(1, 15):
                    ps_id = f"{ac}_PS_{ps_idx:03d}"
                    electors = rng.randint(650, 1400)

                    for yr in years:
                        # Turnout ~ 60% to 75%
                        turnout_ratio = rng.uniform(0.61, 0.74)
                        votes_polled = int(electors * turnout_ratio)
                        rejected = rng.randint(2, 12)
                        valid_votes = votes_polled - rejected

                        # Winning candidate vote share ~ 42% to 62%
                        win_share = rng.uniform(0.42, 0.62)
                        win_votes = int(valid_votes * win_share)
                        runner_up_share = rng.uniform(0.25, 0.38)
                        runner_up_votes = int(valid_votes * runner_up_share)
                        if win_votes + runner_up_votes > valid_votes:
                            runner_up_votes = valid_votes - win_votes - rng.randint(5, 20)

                        winner_party = rng.choice(parties)

                        rows.append({
                            "state": st,
                            "parliamentary_constituency": pc,
                            "assembly_constituency": ac,
                            "polling_station_id": ps_id,
                            "election_year": yr,
                            "total_electors": electors,
                            "votes_polled": votes_polled,
                            "valid_votes": valid_votes,
                            "rejected_votes": rejected,
                            "winning_candidate_votes": win_votes,
                            "runner_up_votes": runner_up_votes,
                            "winner_party": winner_party,
                        })

    df = pd.DataFrame(rows).iloc[:n_records].reset_index(drop=True)
    n = len(df)

    # Anomaly Injection
    injector = AnomalyInjector(seed=seed, severity=severity)
    n_anomalies = max(1, int(n * anomaly_rate))
    ground_truth_map: Dict[int, Dict[str, Any]] = {}

    selected_indices = rng.choice(n, size=n_anomalies, replace=False)

    for i, idx in enumerate(selected_indices):
        kind = i % 6
        if kind == 0:
            # 1. Point Anomaly: 99.8% turnout or 98% vote share for one candidate (ballot stuffing indicator)
            orig_win = df.at[idx, "winning_candidate_votes"]
            valid_v = df.at[idx, "valid_votes"]
            injected_win = int(valid_v * 0.985)
            df.at[idx, "winning_candidate_votes"] = injected_win
            ground_truth_map[idx] = {
                "record_index": int(idx),
                "is_anomaly": True,
                "anomaly_type": AnomalyType.POINT.value,
                "target_column": "winning_candidate_votes",
                "original_value": orig_win,
                "injected_value": injected_win,
                "description": "Extreme univariate vote-share spike: candidate garnered 98.5% of polling station votes.",
            }
        elif kind == 1:
            # 2. Contextual Anomaly: Constituency baseline is 62% turnout, this booth shows 96%
            res = injector.inject_contextual_anomaly(df, "votes_polled", "parliamentary_constituency", idx)
            if res:
                ground_truth_map[idx] = res
        elif kind == 2:
            # 3. Collective Anomaly: Synchronized identical turnout across adjacent polling stations
            ac_val = df.at[idx, "assembly_constituency"]
            res_list = injector.inject_collective_anomaly(df, "votes_polled", "assembly_constituency", ac_val)
            for r in res_list:
                ground_truth_map[r["record_index"]] = r
        elif kind == 3:
            # 4. Temporal Anomaly: Turnout jumped 45% in 2024 compared to 2014 & 2019
            res = injector.inject_temporal_anomaly(df, "votes_polled", "election_year", idx, is_drift=False)
            ground_truth_map[idx] = res
        elif kind == 4:
            # 5. Digit Manipulation: Benford leading digit distortion on vote counts
            res = injector.inject_digit_manipulation(df, "winning_candidate_votes", idx)
            ground_truth_map[idx] = res
        elif kind == 5:
            # 6. Logical Conflict: votes_polled > total_electors
            res = injector.inject_logical_conflict(
                df, "total_electors", "votes_polled", idx, "votes_polled <= total_electors"
            )
            ground_truth_map[idx] = res

    # Consolidate complete labels
    all_labels = []
    for r_idx in range(n):
        if r_idx in ground_truth_map:
            all_labels.append(ground_truth_map[r_idx])
        else:
            all_labels.append({
                "record_index": int(r_idx),
                "is_anomaly": False,
                "anomaly_type": AnomalyType.NONE.value,
                "target_column": None,
                "original_value": None,
                "injected_value": None,
                "description": "Standard democratic turnout and vote-distribution pattern conforming to constitutional norms.",
            })

    return df, all_labels


def _json_default(obj):
    if isinstance(obj, (np.integer, int)):
        return int(obj)
    elif isinstance(obj, (np.floating, float)):
        return float(obj)
    elif isinstance(obj, (np.bool_, bool)):
        return bool(obj)
    elif isinstance(obj, np.ndarray):
        return obj.tolist()
    return str(obj)


def generate_all_demo_datasets(output_dir: str = "data/demo", seed: int = 42) -> Dict[str, Any]:
    """
    Generates all three demo datasets and writes their CSV and JSON label files to output_dir.
    """
    os.makedirs(output_dir, exist_ok=True)

    results = {}

    # 1. Census Demo
    census_df, census_labels = generate_census_demo(n_records=1200, seed=seed)
    census_csv = os.path.join(output_dir, "census_demo.csv")
    census_json = os.path.join(output_dir, "census_demo_labels.json")
    census_df.to_csv(census_csv, index=False)
    with open(census_json, "w", encoding="utf-8") as f:
        json.dump(census_labels, f, indent=2, default=_json_default)
    results["census"] = {
        "file": census_csv,
        "labels": census_json,
        "rows": len(census_df),
        "anomalies": sum(1 for l in census_labels if l["is_anomaly"]),
    }

    # 2. MGNREGA Demo
    mgnrega_df, mgnrega_labels = generate_mgnrega_demo(n_records=1500, seed=seed)
    mgnrega_csv = os.path.join(output_dir, "mgnrega_demo.csv")
    mgnrega_json = os.path.join(output_dir, "mgnrega_demo_labels.json")
    mgnrega_df.to_csv(mgnrega_csv, index=False)
    with open(mgnrega_json, "w", encoding="utf-8") as f:
        json.dump(mgnrega_labels, f, indent=2, default=_json_default)
    results["mgnrega"] = {
        "file": mgnrega_csv,
        "labels": mgnrega_json,
        "rows": len(mgnrega_df),
        "anomalies": sum(1 for l in mgnrega_labels if l["is_anomaly"]),
    }

    # 3. Election Demo
    election_df, election_labels = generate_election_demo(n_records=1000, seed=seed)
    election_csv = os.path.join(output_dir, "election_demo.csv")
    election_json = os.path.join(output_dir, "election_demo_labels.json")
    election_df.to_csv(election_csv, index=False)
    with open(election_json, "w", encoding="utf-8") as f:
        json.dump(election_labels, f, indent=2, default=_json_default)
    results["election"] = {
        "file": election_csv,
        "labels": election_json,
        "rows": len(election_df),
        "anomalies": sum(1 for l in election_labels if l["is_anomaly"]),
    }

    return results


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Generate synthetic demo datasets with ground truth labels")
    parser.add_argument("--output_dir", default="data/demo", help="Destination folder for datasets")
    parser.add_argument("--seed", type=int, default=42, help="Deterministic random seed")
    args = parser.parse_args()

    res = generate_all_demo_datasets(output_dir=args.output_dir, seed=args.seed)
    print("Demo Dataset Generation Complete:")
    for k, v in res.items():
        print(f"  [{k.upper()}] {v['rows']} rows, {v['anomalies']} ground-truth anomalies -> {v['file']}")
