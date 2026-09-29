"""
Forensic analysis service orchestrating forensic battery on public dataset columns.
Contribution C3: Statistical Forensics.
"""

from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd

from app.forensics.base import ForensicRegistry, ForensicResult
from app.calibration.conformal import ConformalCalibrator
# Ensure all tests are imported and registered
import app.forensics.tests


class ForensicAnalyzer:
    """Orchestrates forensic battery evaluation across dataset columns."""

    def __init__(self, target_fdr: float = 0.05):
        self.target_fdr = target_fdr

    def identify_candidate_columns(self, df: pd.DataFrame) -> List[str]:
        """Identifies columns suitable for statistical forensic tests."""
        candidates = []
        for col in df.columns:
            if col.startswith("_"):
                continue
            numeric = pd.to_numeric(df[col], errors="coerce").dropna()
            # If at least 30 numeric values and sufficient spread
            if len(numeric) >= 30 and (numeric.max() - numeric.min()) > 5:
                candidates.append(col)
        return candidates

    def analyze_column(
        self,
        series: pd.Series,
        df_context: Optional[pd.DataFrame] = None,
        test_names: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Runs applicable forensic tests on a single series."""
        clean = pd.to_numeric(series, errors="coerce")
        context = {"df": df_context} if df_context is not None else {}

        all_tests = ForensicRegistry.list_all()
        selected_tests = (
            {k: v for k, v in all_tests.items() if k in test_names}
            if test_names
            else all_tests
        )

        results = {}
        non_conformity_count = 0
        acceptable_count = 0
        conforming_count = 0

        # Collect record scores for CCAS signal conversion
        all_record_scores = []

        for name, test in selected_tests.items():
            try:
                if test.is_applicable(clean, context):
                    res = test.run(clean, context)
                    results[name] = res.to_dict()

                    if res.conformity_level in (
                        "NON_CONFORMITY",
                        "ROUGH_HEAPING",
                        "VERY_ROUGH_HEAPING",
                        "NON_UNIFORM_DEVIATION",
                        "SEVERE_ROUNDING_BIAS",
                        "ANOMALOUS_CORRELATION",
                    ):
                        non_conformity_count += 1
                    elif res.conformity_level in (
                        "MARGINALLY_ACCEPTABLE",
                        "APPROXIMATE_HEAPING",
                        "MODERATE_ROUNDING_BIAS",
                        "MODERATE_CORRELATION",
                    ):
                        acceptable_count += 1
                    elif res.conformity_level in (
                        "CLOSE_CONFORMITY",
                        "ACCEPTABLE_CONFORMITY",
                        "UNIFORM_CONFORMITY",
                        "ACCEPTABLE_UNIFORMITY",
                        "NO_HEAPING",
                        "FAIRLY_ACCURATE",
                        "NORMAL_DISPERSION",
                        "TYPICAL_ELECTION_PATTERN",
                    ):
                        conforming_count += 1

                    if res.record_scores:
                        all_record_scores.append(res.record_scores)
            except Exception as e:
                results[name] = {
                    "test_name": name,
                    "display_name": test.display_name,
                    "error": str(e),
                    "conformity_level": "ERROR",
                }

        # Determine overall conformity rating
        if non_conformity_count > 0:
            overall_conformity = "SUSPICIOUS_DEVIATION"
        elif acceptable_count > 0:
            overall_conformity = "ACCEPTABLE"
        elif conforming_count > 0:
            overall_conformity = "CLOSE_CONFORMITY"
        else:
            overall_conformity = "INCONCLUSIVE"

        # Conformalize record forensic p-values if available
        record_pvalues = []
        if all_record_scores and len(all_record_scores[0]) == len(clean):
            # Aggregate forensic anomaly scores
            combined_scores = np.asarray(np.mean(all_record_scores, axis=0), dtype=float)
            calibrator = ConformalCalibrator(contamination_trim=0.02)
            calibrator.fit_calibration_scores({"forensics": combined_scores})
            pvals_dict = calibrator.compute_pvalues({"forensics": combined_scores})
            record_pvalues = pvals_dict.get("forensics", np.array([])).tolist()

        return {
            "column": series.name,
            "total_records": len(series),
            "valid_numeric_records": int(clean.notna().sum()),
            "overall_conformity": overall_conformity,
            "tests": results,
            "record_pvalues": record_pvalues[:200],  # sample for inspection
            "non_conformity_count": non_conformity_count,
        }

    def analyze_dataset(
        self,
        df: pd.DataFrame,
        columns: Optional[List[str]] = None,
        test_names: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Executes forensic battery across requested or auto-detected columns."""
        target_cols = columns or self.identify_candidate_columns(df)
        column_results = {}

        for col in target_cols:
            if col in df.columns:
                column_results[col] = self.analyze_column(
                    series=df[col],
                    df_context=df,
                    test_names=test_names,
                )

        # Summary across columns
        total_tests = sum(len(res.get("tests", {})) for res in column_results.values())
        suspicious_columns = [
            col for col, res in column_results.items()
            if res.get("overall_conformity") == "SUSPICIOUS_DEVIATION"
        ]

        return {
            "columns_analyzed": list(column_results.keys()),
            "total_tests_run": total_tests,
            "suspicious_columns": suspicious_columns,
            "overall_assessment": (
                "SUSPICIOUS_DEVIATIONS_DETECTED" if suspicious_columns else "STATISTICALLY_CONFORMING"
            ),
            "results_by_column": column_results,
        }
