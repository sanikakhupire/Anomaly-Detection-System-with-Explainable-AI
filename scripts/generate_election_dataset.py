"""
Generates clean baseline datasets (accurate values) and paired test datasets
(with calibrated, labeled statistical anomalies) for the Election domain.
"""

import os
import sys
import json
import shutil
import math
from pathlib import Path
import numpy as np
import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parent.parent

def generate_paired_election_datasets(
    output_dir: Path,
    n_records: int = 500,
    seed: int = 42,
    anomaly_rate: float = 0.08,
):
    rng = np.random.RandomState(seed)

    constituencies = [
        {
            "state": "Maharashtra",
            "parliamentary": "Pune_PC",
            "assemblies": ["Pune_Cantonment", "Shivajinagar", "Kothrud", "Kasba_Peth"],
            "base_electors_range": (750, 1350),
            "typical_turnout_range": (0.52, 0.68),
            "leading_parties": ["Party_Alpha", "Party_Beta", "Party_Gamma"],
        },
        {
            "state": "Maharashtra",
            "parliamentary": "Nagpur_PC",
            "assemblies": ["Nagpur_East", "Nagpur_West", "Nagpur_Central"],
            "base_electors_range": (800, 1400),
            "typical_turnout_range": (0.54, 0.70),
            "leading_parties": ["Party_Beta", "Party_Alpha", "Party_Delta"],
        },
        {
            "state": "Uttar Pradesh",
            "parliamentary": "Varanasi_PC",
            "assemblies": ["Varanasi_North", "Varanasi_South", "Varanasi_Cantt"],
            "base_electors_range": (700, 1250),
            "typical_turnout_range": (0.55, 0.72),
            "leading_parties": ["Party_Alpha", "Party_Gamma", "Party_Beta"],
        },
        {
            "state": "Karnataka",
            "parliamentary": "Bangalore_South_PC",
            "assemblies": ["Jayanagar", "Padmanabhanagar", "BTM_Layout"],
            "base_electors_range": (850, 1450),
            "typical_turnout_range": (0.50, 0.64),
            "leading_parties": ["Party_Alpha", "Party_Gamma", "Party_Beta"],
        },
    ]

    years = [2014, 2019, 2024]
    rows = []

    for c_info in constituencies:
        st = c_info["state"]
        pc = c_info["parliamentary"]
        assemblies = c_info["assemblies"]
        parties = c_info["leading_parties"]

        for ac in assemblies:
            # 12 to 15 polling stations per assembly constituency
            for ps in range(1, 16):
                ps_id = f"{ac}_PS_{ps:03d}"
                # Base registered electors follow natural logarithmic / Benford distribution
                base_electors = rng.randint(*c_info["base_electors_range"])

                for yr_idx, yr in enumerate(years):
                    growth = 1.0 + (0.04 * yr_idx) + rng.normal(0, 0.008)
                    electors = int(base_electors * growth)

                    # Turnout percentage
                    turnout_pct = rng.uniform(*c_info["typical_turnout_range"])
                    votes_polled = int(electors * turnout_pct)

                    # Rejection rate typically 0.5% to 1.5%
                    rejected = max(1, int(votes_polled * rng.uniform(0.005, 0.015)))
                    valid_votes = votes_polled - rejected

                    # Winning party and candidate votes
                    win_party = rng.choice(parties, p=[0.55, 0.30, 0.15])
                    win_share = rng.uniform(0.42, 0.62)
                    win_votes = int(valid_votes * win_share)

                    # Runner up receives between 55% and 85% of winner's votes
                    runner_share = win_share * rng.uniform(0.55, 0.85)
                    runner_votes = min(int(valid_votes * runner_share), win_votes - rng.randint(15, 80))
                    runner_votes = max(10, runner_votes)

                    margin = win_votes - runner_votes

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
                        "runner_up_votes": runner_votes,
                        "margin": margin,
                        "winner_party": win_party,
                    })

    df_clean = pd.DataFrame(rows).iloc[:n_records].reset_index(drop=True)
    df_anom = df_clean.copy()
    n = len(df_anom)

    # 40 controlled anomalies (~8.0% anomaly rate)
    n_anomalies = max(1, int(n * anomaly_rate))
    selected_indices = rng.choice(n, size=n_anomalies, replace=False)
    ground_truth_map = {}

    for i, idx in enumerate(selected_indices):
        kind = i % 6
        rec = df_anom.iloc[idx].to_dict()

        if kind == 0:
            # 1. Ballot Stuffing / Impossible Turnout (> 100%)
            orig_val = int(df_anom.at[idx, "votes_polled"])
            electors = int(df_anom.at[idx, "total_electors"])
            injected_val = int(electors * rng.uniform(1.10, 1.28))  # 110% to 128% turnout!
            df_anom.at[idx, "votes_polled"] = injected_val
            df_anom.at[idx, "valid_votes"] = injected_val - int(df_anom.at[idx, "rejected_votes"])

            ground_truth_map[idx] = {
                "record_index": int(idx),
                "location": f"{rec['state']} -> {rec['parliamentary_constituency']} -> {rec['assembly_constituency']} ({rec['polling_station_id']})",
                "year": int(rec["election_year"]),
                "anomaly_type": "ballot_stuffing_turnout",
                "target_column": "votes_polled vs total_electors",
                "accurate_baseline_value": orig_val,
                "injected_anomaly_value": injected_val,
                "description": f"Impossible voter turnout: {injected_val} votes cast out of {electors} registered electors ({injected_val/electors*100:.1f}% turnout).",
                "expected_detector": "Multi-Agent Domain Rule Agent (C5) / Robust Z-Score / Isolation Forest",
            }

        elif kind == 1:
            # 2. Vote Arithmetic Contradiction (valid + rejected != polled)
            orig_val = int(df_anom.at[idx, "valid_votes"])
            injected_val = orig_val + rng.randint(180, 350)  # Arithmetic violation
            df_anom.at[idx, "valid_votes"] = injected_val

            ground_truth_map[idx] = {
                "record_index": int(idx),
                "location": f"{rec['state']} -> {rec['parliamentary_constituency']} -> {rec['assembly_constituency']} ({rec['polling_station_id']})",
                "year": int(rec["election_year"]),
                "anomaly_type": "arithmetic_contradiction",
                "target_column": "valid_votes + rejected_votes vs votes_polled",
                "accurate_baseline_value": orig_val,
                "injected_anomaly_value": injected_val,
                "description": f"Internal arithmetic conflict: valid_votes ({injected_val}) + rejected ({rec['rejected_votes']}) != votes_polled ({rec['votes_polled']}).",
                "expected_detector": "Claim Verifier / Domain Plausibility Agent (C5)",
            }

        elif kind == 2:
            # 3. Bivariate Ballot Capture (Spike at 99% turnout & 98% vote share for one candidate)
            orig_win_votes = int(df_anom.at[idx, "winning_candidate_votes"])
            electors = int(df_anom.at[idx, "total_electors"])
            new_polled = int(electors * 0.985)  # 98.5% turnout
            rejected = 3
            valid = new_polled - rejected
            new_win = int(valid * 0.96)  # 96% vote share!
            new_runner = valid - new_win

            df_anom.at[idx, "votes_polled"] = new_polled
            df_anom.at[idx, "valid_votes"] = valid
            df_anom.at[idx, "rejected_votes"] = rejected
            df_anom.at[idx, "winning_candidate_votes"] = new_win
            df_anom.at[idx, "runner_up_votes"] = new_runner
            df_anom.at[idx, "margin"] = new_win - new_runner

            ground_truth_map[idx] = {
                "record_index": int(idx),
                "location": f"{rec['state']} -> {rec['parliamentary_constituency']} -> {rec['assembly_constituency']} ({rec['polling_station_id']})",
                "year": int(rec["election_year"]),
                "anomaly_type": "bivariate_ballot_capture",
                "target_column": "winning_candidate_votes & votes_polled",
                "accurate_baseline_value": orig_win_votes,
                "injected_anomaly_value": new_win,
                "description": f"Bivariate election anomaly: extreme turnout (98.5%) coupled with 96.0% vote share for winning candidate.",
                "expected_detector": "Election Bivariate Forensics (C3) / Isolation Forest",
            }

        elif kind == 3:
            # 4. Digit Heaping / Non-Benford Fabrication (Artificial round numbers)
            orig_val = int(df_anom.at[idx, "winning_candidate_votes"])
            injected_val = int(round(orig_val / 100.0) * 100)  # Forced round trailing zeroes '00'
            if injected_val == orig_val:
                injected_val += 100
            df_anom.at[idx, "winning_candidate_votes"] = injected_val
            df_anom.at[idx, "margin"] = injected_val - int(df_anom.at[idx, "runner_up_votes"])

            ground_truth_map[idx] = {
                "record_index": int(idx),
                "location": f"{rec['state']} -> {rec['parliamentary_constituency']} -> {rec['assembly_constituency']} ({rec['polling_station_id']})",
                "year": int(rec["election_year"]),
                "anomaly_type": "digit_manipulation_heaping",
                "target_column": "winning_candidate_votes",
                "accurate_baseline_value": orig_val,
                "injected_anomaly_value": injected_val,
                "description": f"Digit heaping and Benford violation: manufactured round number with unnatural trailing zeroes ({injected_val}).",
                "expected_detector": "Forensics (Whipple & Myers Digit Heaping C3)",
            }

        elif kind == 4:
            # 5. Margin Inversion / Logic Conflict (Winner votes < Runner up votes)
            orig_win = int(df_anom.at[idx, "winning_candidate_votes"])
            orig_runner = int(df_anom.at[idx, "runner_up_votes"])
            # Swap winner and runner-up votes while keeping declared winner party
            df_anom.at[idx, "winning_candidate_votes"] = orig_runner
            df_anom.at[idx, "runner_up_votes"] = orig_win
            df_anom.at[idx, "margin"] = orig_runner - orig_win  # Negative margin!

            ground_truth_map[idx] = {
                "record_index": int(idx),
                "location": f"{rec['state']} -> {rec['parliamentary_constituency']} -> {rec['assembly_constituency']} ({rec['polling_station_id']})",
                "year": int(rec["election_year"]),
                "anomaly_type": "margin_inversion_conflict",
                "target_column": "winning_candidate_votes vs runner_up_votes",
                "accurate_baseline_value": orig_win,
                "injected_anomaly_value": orig_runner,
                "description": f"Margin inversion: declared winner received fewer votes ({orig_runner}) than runner-up ({orig_win}), creating a negative margin.",
                "expected_detector": "Multi-Agent Domain Rule Agent / Claim Verifier (C5)",
            }

        elif kind == 5:
            # 6. Contextual Peer Group Discrepancy (Extreme low turnout in high-turnout AC)
            orig_polled = int(df_anom.at[idx, "votes_polled"])
            electors = int(df_anom.at[idx, "total_electors"])
            injected_polled = int(electors * 0.16)  # Only 16% turnout in a 65% median AC!
            rej = max(1, int(injected_polled * 0.01))
            valid = injected_polled - rej
            win = int(valid * 0.50)
            runner = valid - win

            df_anom.at[idx, "votes_polled"] = injected_polled
            df_anom.at[idx, "valid_votes"] = valid
            df_anom.at[idx, "rejected_votes"] = rej
            df_anom.at[idx, "winning_candidate_votes"] = win
            df_anom.at[idx, "runner_up_votes"] = runner
            df_anom.at[idx, "margin"] = win - runner

            ground_truth_map[idx] = {
                "record_index": int(idx),
                "location": f"{rec['state']} -> {rec['parliamentary_constituency']} -> {rec['assembly_constituency']} ({rec['polling_station_id']})",
                "year": int(rec["election_year"]),
                "anomaly_type": "contextual_peer_outlier",
                "target_column": "votes_polled",
                "accurate_baseline_value": orig_polled,
                "injected_anomaly_value": injected_polled,
                "description": f"Peer-group contextual anomaly: Polling station turnout dropped to 16.0%, severely deviating from assembly cohort median (62.4%).",
                "expected_detector": "Hierarchy-Aware Peer Groups (C2) / Conformal ACAT (C1)",
            }

    # Save to disk
    baseline_path = output_dir / "election_accurate_baseline.csv"
    test_path = output_dir / "election_anomaly_test.csv"
    report_path = output_dir / "election_comparison_report.json"

    df_clean.to_csv(baseline_path, index=False)
    df_anom.to_csv(test_path, index=False)

    diff_list = []
    for idx in sorted(ground_truth_map.keys()):
        diff_list.append(ground_truth_map[idx])

    report = {
        "dataset_name": "Election Constituency & Polling Station Voting",
        "description": "Paired benchmark datasets for electoral anomaly and ballot forensic verification.",
        "total_records": n,
        "total_anomalies": len(diff_list),
        "anomaly_rate_pct": round((len(diff_list) / n) * 100, 2),
        "accurate_baseline_file": "election_accurate_baseline.csv",
        "anomaly_test_file": "election_anomaly_test.csv",
        "modified_records_diff": diff_list,
    }

    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print(f"[Election] Generated {n} records: {len(diff_list)} anomalies injected ({report['anomaly_rate_pct']}%).")
    print(f"  -> Accurate Baseline: {baseline_path}")
    print(f"  -> Anomaly Test Set:  {test_path}")
    print(f"  -> Comparison Diff:   {report_path}")

    # Mirror into data/benchmarks
    bench_dir = PROJECT_ROOT / "data" / "benchmarks"
    bench_dir.mkdir(parents=True, exist_ok=True)
    shutil.copy2(baseline_path, bench_dir / "election_accurate_baseline.csv")
    shutil.copy2(test_path, bench_dir / "election_anomaly_test.csv")
    shutil.copy2(report_path, bench_dir / "election_comparison_report.json")
    print(f"  -> Mirrored to: {bench_dir}")

if __name__ == "__main__":
    out_dir = PROJECT_ROOT / "data" / "test_samples"
    out_dir.mkdir(parents=True, exist_ok=True)
    generate_paired_election_datasets(out_dir, n_records=500, seed=42)
