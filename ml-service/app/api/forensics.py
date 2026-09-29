import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
import pandas as pd
import numpy as np

from app.forensics.service import ForensicAnalyzer

router = APIRouter(prefix="/ml/forensics", tags=["Statistical Forensics"])


class ForensicAnalyzeRequest(BaseModel):
    file_path: str = Field(..., description="Absolute path to dataset file")
    columns: Optional[List[str]] = Field(None, description="Specific columns to analyze")
    test_names: Optional[List[str]] = Field(None, description="Specific forensic tests to execute")


def _sanitize_for_json(obj):
    """Recursively converts NumPy and special float types to JSON-serializable primitives."""
    if isinstance(obj, dict):
        return {k: _sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_sanitize_for_json(v) for v in obj]
    elif isinstance(obj, (np.integer, int)):
        return int(obj)
    elif isinstance(obj, (np.floating, float)):
        if np.isnan(obj) or np.isinf(obj):
            return None
        return float(obj)
    elif isinstance(obj, (np.bool_, bool)):
        return bool(obj)
    elif pd.isna(obj):
        return None
    return obj


@router.post("/analyze")
def analyze_forensics_endpoint(request: ForensicAnalyzeRequest):
    """
    Executes forensic battery (Benford 1st/2nd digit, last digit uniformity,
    Whipple/Myers heaping, round number bias, election bivariate turnout vs vote-share).
    """
    if not os.path.exists(request.file_path):
        raise HTTPException(status_code=404, detail="Dataset file not found")

    try:
        ext = os.path.splitext(request.file_path)[1].lower()
        if ext == ".csv":
            df = pd.read_csv(request.file_path, low_memory=False)
        else:
            df = pd.read_excel(request.file_path)

        analyzer = ForensicAnalyzer()
        raw_result = analyzer.analyze_dataset(
            df=df,
            columns=request.columns,
            test_names=request.test_names,
        )

        sanitized_result = _sanitize_for_json(raw_result)
        return {
            "success": True,
            "message": f"Forensic analysis completed for {len(sanitized_result.get('columns_analyzed', []))} columns.",
            "data": sanitized_result,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Forensic analysis failed: {str(e)}")
