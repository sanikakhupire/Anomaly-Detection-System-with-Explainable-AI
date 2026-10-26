"""
Generates clean baseline datasets (accurate values) and paired test datasets
(with calibrated, labeled statistical anomalies) for public dataset anomaly detection testing.
"""

import os
import sys
import json
import shutil
from pathlib import Path
import numpy as np
import pandas as pd

# Add ml-service to path to reuse domain generators
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT / "ml-service"))

from app.experiments.synthetic import (
    AnomalyInjector,
    AnomalyType,
    _json_default,
)


def generate_paired_mgnrega_datasets(
    output_dir: Path,
    n_records: int = 500,
    seed: int = 42,
    anomaly_rate: float = 0.06,
    severity: str = "high",
):
    """
    Generates:
    1. mgnrega_accurate_baseline.csv (100% nominal, consistent statutory wages and seasonal demand)
    2. mgnrega_anomaly_test.csv (contains controlled, labeled statistical anomalies)
    3. mgnrega_comparison_report.json (exact row-by-row diff and detection explanations)
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

                        # Seasonal demand: Peak in April-June, Low in monsoon (Aug-Sep)
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

                        # Statutory daily wage ~ 235 to 275 INR
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

    df_clean = pd.DataFrame(rows).iloc[:n_records].reset_index(drop=True)
    df_anom = df_clean.copy()
    n = len(df_anom)

    # Invalidate / Inject Anomalies on df_anom
    injector = AnomalyInjector(seed=seed, severity=severity)
    n_anomalies = max(1, int(n * anomaly_rate))
    ground_truth_map = {}

    selected_indices = rng.choice(n, size=n_anomalies, replace=False)

    for i, idx in enumerate(selected_indices):
        kind = i % 6
        if kind == 0:
            # 1. Point Outlier (extreme wage explosion)
            res = injector.inject_point_anomaly(df_anom, "total_wages_paid_inr", idx)
            res["expected_detector"] = "Robust Z-Score (MAD) / Isolation Forest"
            ground_truth_map[idx] = res
        elif kind == 1:
            # 2. Contextual Outlier (low-demand district displays high summer workdays in monsoon)
            res = injector.inject_contextual_anomaly(df_anom, "workdays_generated", "district", idx)
            if res:
                res["expected_detector"] = "Hierarchy-Aware Peer Groups (C2) / Local Outlier Factor"
                ground_truth_map[idx] = res
        elif kind == 2:
            # 3. Collective Anomaly across Gram Panchayat
            gp_val = df_anom.at[idx, "gram_panchayat"]
            res_list = injector.inject_collective_anomaly(df_anom, "delayed_payment_days", "gram_panchayat", gp_val)
            for r in res_list:
                r["expected_detector"] = "Spatial Peer Baseline / Group-level MAD"
                ground_truth_map[r["record_index"]] = r
        elif kind == 3:
            # 4. Temporal Anomaly (sudden impossible workday spike)
            res = injector.inject_temporal_anomaly(df_anom, "workdays_generated", "date", idx, is_drift=True)
            res["expected_detector"] = "Temporal Z-Score / Level-Shift Detector"
            ground_truth_map[idx] = res
        elif kind == 4:
            # 5. Digit Manipulation (Benford's Law violation or terminal zeroes)
            res = injector.inject_digit_manipulation(df_anom, "total_wages_paid_inr", idx)
            res["expected_detector"] = "Forensic Battery (Benford 1st/2nd digit & Digit Heaping C3)"
            ground_truth_map[idx] = res
        elif kind == 5:
            # 6. Logical Contradiction (active_workers > registered_workers)
            res = injector.inject_logical_conflict(
                df_anom, "registered_workers", "active_workers", idx, "active_workers <= registered_workers"
            )
            res["expected_detector"] = "Multi-Agent Domain Rule Agent (C5) / Claim Verifier"
            ground_truth_map[idx] = res

    # Write files
    baseline_path = output_dir / "mgnrega_accurate_baseline.csv"
    test_path = output_dir / "mgnrega_anomaly_test.csv"
    report_path = output_dir / "mgnrega_comparison_report.json"

    df_clean.to_csv(baseline_path, index=False)
    df_anom.to_csv(test_path, index=False)

    diff_list = []
    for idx in sorted(ground_truth_map.keys()):
        item = ground_truth_map[idx]
        diff_list.append({
            "record_index": idx,
            "location": f"{df_anom.at[idx, 'district']} -> {df_anom.at[idx, 'block']} -> {df_anom.at[idx, 'gram_panchayat']}",
            "date": df_anom.at[idx, "date"],
            "anomaly_type": item.get("anomaly_type"),
            "target_column": item.get("target_column"),
            "accurate_baseline_value": item.get("original_value"),
            "injected_anomaly_value": item.get("injected_value"),
            "description": item.get("description"),
            "expected_detector": item.get("expected_detector"),
        })

    report = {
        "dataset_name": "MGNREGA Rural Employment & Wages",
        "description": "Paired benchmark datasets for verifying statistical anomaly detection pipeline.",
        "total_records": n,
        "total_anomalies": len(diff_list),
        "anomaly_rate_pct": round((len(diff_list) / n) * 100, 2),
        "accurate_baseline_file": "mgnrega_accurate_baseline.csv",
        "anomaly_test_file": "mgnrega_anomaly_test.csv",
        "modified_records_diff": diff_list,
    }

    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, default=_json_default)

    print(f"[MGNREGA] Generated {n} records: {len(diff_list)} anomalies injected.")
    print(f"  -> Accurate Baseline: {baseline_path}")
    print(f"  -> Anomaly Test Set:  {test_path}")
    print(f"  -> Comparison Diff:   {report_path}")


def generate_paired_census_datasets(
    output_dir: Path,
    n_records: int = 300,
    seed: int = 42,
    anomaly_rate: float = 0.06,
    severity: str = "high",
):
    """
    Generates:
    1. census_accurate_baseline.csv (100% nominal demographic census hierarchy)
    2. census_anomaly_test.csv (contains labeled demographic/literacy anomalies)
    3. census_comparison_report.json (exact row-by-row diff)
    """
    rng = np.random.RandomState(seed)

    states = [
        {"name": "Maharashtra", "districts": ["Pune", "Nagpur", "Nashik"], "pop_range": (300000, 1200000)},
        {"name": "Uttar Pradesh", "districts": ["Varanasi", "Lucknow", "Gorakhpur"], "pop_range": (500000, 2000000)},
        {"name": "Kerala", "districts": ["Ernakulam", "Thiruvananthapuram", "Kozhikode"], "pop_range": (400000, 900000)},
    ]

    years = [2001, 2011, 2021]

    rows = []
    for s in states:
        for d in s["districts"]:
            for b in range(1, 4):
                block_name = f"{d}_Block{b}"
                base_pop = rng.randint(*s["pop_range"]) // 6
                area = rng.uniform(80.0, 350.0)

                for y_idx, yr in enumerate(years):
                    growth = 1.0 + (0.12 * y_idx) + rng.normal(0, 0.015)
                    pop = int(base_pop * growth)

                    is_metro = "Pune" in d or "Lucknow" in d or "Ernakulam" in d
                    if s["name"] == "Kerala":
                        female_ratio = 0.518
                    elif is_metro:
                        female_ratio = 0.490
                    else:
                        female_ratio = 0.478

                    females = int(pop * female_ratio * rng.uniform(0.99, 1.01))
                    males = pop - females

                    lit_rate = 0.94 if s["name"] == "Kerala" else (0.82 if is_metro else 0.65)
                    literate = min(int(pop * lit_rate * rng.uniform(0.98, 1.01)), pop)
                    households = int(pop / rng.uniform(4.2, 5.0))

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

    df_clean = pd.DataFrame(rows).iloc[:n_records].reset_index(drop=True)
    df_anom = df_clean.copy()
    n = len(df_anom)

    injector = AnomalyInjector(seed=seed, severity=severity)
    n_anomalies = max(1, int(n * anomaly_rate))
    ground_truth_map = {}

    selected_indices = rng.choice(n, size=n_anomalies, replace=False)

    for i, idx in enumerate(selected_indices):
        kind = i % 6
        if kind == 0:
            res = injector.inject_point_anomaly(df_anom, "total_population", idx)
            res["expected_detector"] = "Robust Z-Score (MAD) / Isolation Forest"
            ground_truth_map[idx] = res
        elif kind == 1:
            res = injector.inject_contextual_anomaly(df_anom, "total_population", "district", idx)
            if res:
                res["expected_detector"] = "Hierarchy-Aware Peer Groups (C2)"
                ground_truth_map[idx] = res
        elif kind == 2:
            blk = df_anom.at[idx, "block"]
            res_list = injector.inject_collective_anomaly(df_anom, "literate_population", "block", blk)
            for r in res_list:
                r["expected_detector"] = "Cohort Baseline / Peer Dispersion"
                ground_truth_map[r["record_index"]] = r
        elif kind == 3:
            res = injector.inject_temporal_anomaly(df_anom, "total_population", "year", idx, is_drift=False)
            res["expected_detector"] = "Temporal Z-Score / Decadal Growth Outlier"
            ground_truth_map[idx] = res
        elif kind == 4:
            res = injector.inject_digit_manipulation(df_anom, "households", idx)
            res["expected_detector"] = "Forensics (Benford & Digit Heaping C3)"
            ground_truth_map[idx] = res
        elif kind == 5:
            # Arithmetic violation: females > total_population
            res = injector.inject_logical_conflict(
                df_anom, "total_population", "female_population", idx, "female_population < total_population"
            )
            res["expected_detector"] = "Multi-Agent Domain Rule Agent (C5)"
            ground_truth_map[idx] = res

    baseline_path = output_dir / "census_accurate_baseline.csv"
    test_path = output_dir / "census_anomaly_test.csv"
    report_path = output_dir / "census_comparison_report.json"

    df_clean.to_csv(baseline_path, index=False)
    df_anom.to_csv(test_path, index=False)

    diff_list = []
    for idx in sorted(ground_truth_map.keys()):
        item = ground_truth_map[idx]
        diff_list.append({
            "record_index": idx,
            "location": f"{df_anom.at[idx, 'state']} -> {df_anom.at[idx, 'district']} -> {df_anom.at[idx, 'block']}",
            "year": int(df_anom.at[idx, "year"]),
            "anomaly_type": item.get("anomaly_type"),
            "target_column": item.get("target_column"),
            "accurate_baseline_value": item.get("original_value"),
            "injected_anomaly_value": item.get("injected_value"),
            "description": item.get("description"),
            "expected_detector": item.get("expected_detector"),
        })

    report = {
        "dataset_name": "Census Demographic & Literacy",
        "description": "Paired benchmark datasets for demographic anomaly detection verification.",
        "total_records": n,
        "total_anomalies": len(diff_list),
        "anomaly_rate_pct": round((len(diff_list) / n) * 100, 2),
        "accurate_baseline_file": "census_accurate_baseline.csv",
        "anomaly_test_file": "census_anomaly_test.csv",
        "modified_records_diff": diff_list,
    }

    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, default=_json_default)

    print(f"[Census] Generated {n} records: {len(diff_list)} anomalies injected.")
    print(f"  -> Accurate Baseline: {baseline_path}")
    print(f"  -> Anomaly Test Set:  {test_path}")
    print(f"  -> Comparison Diff:   {report_path}")


def main():
    test_dir = PROJECT_ROOT / "data" / "test_samples"
    bench_dir = PROJECT_ROOT / "data" / "benchmarks"
    test_dir.mkdir(parents=True, exist_ok=True)
    bench_dir.mkdir(parents=True, exist_ok=True)

    print("Generating Paired Datasets for Anomaly Detection Platform...")
    generate_paired_mgnrega_datasets(test_dir, n_records=500, seed=42)
    generate_paired_census_datasets(test_dir, n_records=300, seed=42)

    # Also sync into data/benchmarks/
    for fname in [
        "mgnrega_accurate_baseline.csv",
        "mgnrega_anomaly_test.csv",
        "mgnrega_comparison_report.json",
        "census_accurate_baseline.csv",
        "census_anomaly_test.csv",
        "census_comparison_report.json",
    ]:
        shutil.copy2(test_dir / fname, bench_dir / fname)

    print("\nDataset generation completed successfully!")
    print(f"Datasets available in:\n  - {test_dir}\n  - {bench_dir}")


if __name__ == "__main__":
    main()
