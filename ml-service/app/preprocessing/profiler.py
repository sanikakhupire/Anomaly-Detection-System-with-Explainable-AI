"""
Deterministic Dataset Profiler
Reads tabular data (CSV, XLSX, XLS) in memory-friendly chunks,
calculates statistical summary metrics, detects data quality issues,
and outputs a comprehensive quality report without silently mutating data.
"""

import os
from typing import Dict, Any, List
import numpy as np
import pandas as pd


def infer_column_type(series: pd.Series) -> str:
    """Infers high-level data type of a column without mutating it."""
    # Drop NAs for type inspection
    non_null = series.dropna()
    if non_null.empty:
        return "empty"

    if pd.api.types.is_bool_dtype(series):
        return "boolean"
    if pd.api.types.is_numeric_dtype(series):
        return "numeric"
    if pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"

    # Try quick datetime conversion heuristic on small sample
    sample = non_null.head(50)
    try:
        # Avoid treating plain integers or short strings as dates
        if not sample.astype(str).str.isnumeric().all():
            pd.to_datetime(sample, errors="raise")
            return "datetime"
    except Exception:
        pass

    return "text"


def profile_dataset(file_path: str, chunk_size: int = 10000) -> Dict[str, Any]:
    """
    Profiles a dataset file in chunks.
    Guarantees no silent mutation of the underlying data.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found on disk: {file_path}")

    file_ext = os.path.splitext(file_path)[1].lower()
    transformation_log: List[Dict[str, str]] = []
    issues: List[Dict[str, Any]] = []

    transformation_log.append({
        "level": "INFO",
        "message": f"Starting deterministic profiling for '{os.path.basename(file_path)}' ({file_ext})."
    })

    if file_ext in [".xlsx", ".xls"]:
        # Read Excel format
        transformation_log.append({
            "level": "INFO",
            "message": "Reading Excel workbook using openpyxl engine."
        })
        df = pd.read_excel(file_path)
        chunks = [df]
        is_chunked = False
    elif file_ext == ".csv":
        transformation_log.append({
            "level": "INFO",
            "message": f"Streaming CSV data in chunks of {chunk_size} rows."
        })
        chunks = pd.read_csv(file_path, chunksize=chunk_size, low_memory=False)
        is_chunked = True
    else:
        raise ValueError(f"Unsupported file format: {file_ext}")

    total_rows = 0
    col_names = []
    col_missing_counts: Dict[str, int] = {}
    col_inferred_types: Dict[str, str] = {}
    col_unique_sets: Dict[str, set] = {}
    col_numeric_stats: Dict[str, Dict[str, float]] = {}
    col_sample_values: Dict[str, list] = {}
    col_invalid_counts: Dict[str, int] = {}

    duplicate_row_count = 0
    first_chunk = True

    # If chunked, process iterably
    for chunk in chunks:
        chunk_len = len(chunk)
        total_rows += chunk_len

        if first_chunk:
            col_names = list(chunk.columns)
            for col in col_names:
                col_missing_counts[col] = 0
                col_unique_sets[col] = set()
                col_sample_values[col] = []
                col_invalid_counts[col] = 0
                col_type = infer_column_type(chunk[col])
                col_inferred_types[col] = col_type

                if col_type == "numeric":
                    col_numeric_stats[col] = {
                        "count": 0,
                        "sum": 0.0,
                        "sum_sq": 0.0,
                        "min": float("inf"),
                        "max": float("-inf"),
                        "values": []  # Keep subset for percentiles
                    }
            first_chunk = False

        # Accumulate metrics per column
        for col in col_names:
            series = chunk[col]
            missing = int(series.isna().sum())
            col_missing_counts[col] += missing

            # Track invalid entries (e.g. inf in numeric)
            if col_inferred_types.get(col) == "numeric":
                numeric_series = pd.to_numeric(series, errors="coerce")
                num_invalids = int(np.isinf(numeric_series.to_numpy()).sum())
                col_invalid_counts[col] += num_invalids

                valid_nums = numeric_series.dropna()
                valid_nums = valid_nums[~np.isinf(valid_nums)]
                if not valid_nums.empty:
                    c_min = float(valid_nums.min())
                    c_max = float(valid_nums.max())
                    col_numeric_stats[col]["min"] = min(col_numeric_stats[col]["min"], c_min)
                    col_numeric_stats[col]["max"] = max(col_numeric_stats[col]["max"], c_max)
                    col_numeric_stats[col]["sum"] += float(valid_nums.sum())
                    col_numeric_stats[col]["sum_sq"] += float((valid_nums ** 2).sum())
                    col_numeric_stats[col]["count"] += len(valid_nums)
                    # Sample values for quantiles if within limit
                    if len(col_numeric_stats[col]["values"]) < 10000:
                        col_numeric_stats[col]["values"].extend(valid_nums.head(1000).tolist())

            # Store unique values sample
            valid_vals = series.dropna()
            if len(col_unique_sets[col]) < 2000:
                for val in valid_vals.head(500):
                    col_unique_sets[col].add(str(val))

            if len(col_sample_values[col]) < 5:
                samples = [str(x) for x in valid_vals.head(5 - len(col_sample_values[col]))]
                col_sample_values[col].extend(samples)

        # Count duplicates inside the chunk
        duplicate_row_count += int(chunk.duplicated().sum())

    transformation_log.append({
        "level": "INFO",
        "message": f"Completed stream pass: {total_rows} total rows and {len(col_names)} columns analyzed."
    })

    # Assemble column summaries
    column_profiles = []
    total_missing_cells = 0
    total_cells = total_rows * max(1, len(col_names))

    for col in col_names:
        missing_count = col_missing_counts[col]
        total_missing_cells += missing_count
        missing_pct = round((missing_count / total_rows * 100) if total_rows > 0 else 0, 2)
        unique_cnt = len(col_unique_sets[col])
        inferred_type = col_inferred_types.get(col, "text")

        profile: Dict[str, Any] = {
            "name": str(col),
            "dtype": inferred_type,
            "missingCount": missing_count,
            "missingPercentage": missing_pct,
            "uniqueCount": unique_cnt,
            "sampleValues": col_sample_values[col][:5],
            "numInvalid": col_invalid_counts.get(col, 0)
        }

        # Compute mean, std, median, quartiles for numeric columns
        if inferred_type == "numeric" and col in col_numeric_stats:
            stats = col_numeric_stats[col]
            n = stats["count"]
            if n > 0:
                mean_val = stats["sum"] / n
                variance = max(0.0, (stats["sum_sq"] / n) - (mean_val ** 2))
                std_val = float(np.sqrt(variance))
                vals = np.array(stats["values"])

                profile["mean"] = round(mean_val, 4)
                profile["std"] = round(std_val, 4)
                profile["min"] = round(stats["min"], 4) if stats["min"] != float("inf") else 0.0
                profile["max"] = round(stats["max"], 4) if stats["max"] != float("-inf") else 0.0

                if len(vals) > 0:
                    profile["median"] = round(float(np.median(vals)), 4)
                    profile["q25"] = round(float(np.percentile(vals, 25)), 4)
                    profile["q75"] = round(float(np.percentile(vals, 75)), 4)
            else:
                profile["mean"] = None
                profile["std"] = None
                profile["min"] = None
                profile["max"] = None
                profile["median"] = None
                profile["q25"] = None
                profile["q75"] = None

        # Detect Column-level Issues
        if missing_pct > 50:
            issues.append({
                "severity": "HIGH",
                "column": col,
                "message": f"Column '{col}' has {missing_pct}% missing values (> 50%)."
            })
        elif missing_pct > 20:
            issues.append({
                "severity": "MEDIUM",
                "column": col,
                "message": f"Column '{col}' has {missing_pct}% missing values (> 20%)."
            })

        if unique_cnt == 1 and total_rows > 1:
            issues.append({
                "severity": "LOW",
                "column": col,
                "message": f"Column '{col}' has constant value across all rows (zero variance)."
            })

        column_profiles.append(profile)

    duplicate_pct = round((duplicate_row_count / total_rows * 100) if total_rows > 0 else 0, 2)
    if duplicate_pct > 5.0:
        issues.append({
            "severity": "MEDIUM",
            "column": None,
            "message": f"Dataset contains {duplicate_row_count} duplicate rows ({duplicate_pct}%)."
        })

    # Deterministic Data Quality Score (0 - 100)
    # Completeness penalty (up to 40)
    missing_ratio = total_missing_cells / total_cells if total_cells > 0 else 0
    completeness_penalty = min(40.0, missing_ratio * 60.0)

    # Uniqueness penalty (up to 30)
    dup_ratio = duplicate_row_count / total_rows if total_rows > 0 else 0
    uniqueness_penalty = min(30.0, dup_ratio * 40.0)

    # Issue severity penalty (up to 30)
    severity_weights = {"HIGH": 8.0, "MEDIUM": 4.0, "LOW": 1.5}
    issues_penalty = min(30.0, sum(severity_weights.get(i["severity"], 2.0) for i in issues))

    quality_score = max(5.0, round(100.0 - (completeness_penalty + uniqueness_penalty + issues_penalty), 1))

    transformation_log.append({
        "level": "INFO",
        "message": f"Calculated deterministic Data Quality Score: {quality_score}/100."
    })
    transformation_log.append({
        "level": "SUCCESS",
        "message": "Raw data integrity preserved. No records or columns were modified or imputed."
    })

    return {
        "rowCount": total_rows,
        "columnCount": len(col_names),
        "columns": column_profiles,
        "duplicateRowCount": duplicate_row_count,
        "duplicateRowPercentage": duplicate_pct,
        "overallQualityScore": quality_score,
        "issues": issues,
        "transformationLog": transformation_log
    }
