"""
FastAPI router for ML anomaly detection analysis.
POST /ml/analyze
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
from app.anomaly_detection.analyzer import run_anomaly_analysis

router = APIRouter(prefix="/ml", tags=["Anomaly Detection"])


class AnalyzeRequest(BaseModel):
    file_path: str = Field(..., description="Absolute path to CSV/XLSX dataset file")
    feature_cols: Optional[List[str]] = Field(None, description="Numeric features to evaluate")
    peer_group_col: Optional[str] = Field(None, description="Column defining peer groups")
    peer_baselines: Optional[Dict[str, Any]] = Field(None, description="Optional pre-computed peer baselines")
    date_col: Optional[str] = Field(None, description="Optional temporal/date column")
    detectors: Optional[List[str]] = Field(None, description="Detectors to run: ['z_score', 'robust_z', 'isolation_forest', 'temporal']")
    contamination: float = Field(0.05, ge=0.001, le=0.5, description="Expected outlier fraction for IsolationForest")
    random_state: int = Field(42, description="Random seed for reproducibility")
    max_records: Optional[int] = Field(None, description="Optional limit on records processed")
    fusion_method: str = Field("acat", description="P-value fusion: 'acat', 'fisher', 'stouffer'")
    fdr_method: str = Field("bh", description="Multiple testing correction: 'bh' (Benjamini-Hochberg) or 'by' (Benjamini-Yekutieli)")
    target_fdr: float = Field(0.05, ge=0.001, le=0.5, description="Nominal False Discovery Rate control level")
    contamination_trim: float = Field(0.02, ge=0.0, le=0.2, description="Calibration set contamination trimming quantile")


@router.post("/analyze")
def analyze_dataset_anomalies(payload: AnalyzeRequest):
    """
    Run detector suite on dataset and return calibrated p-values, q-values, and ATPI.
    """
    try:
        results = run_anomaly_analysis(
            file_path=payload.file_path,
            feature_cols=payload.feature_cols,
            peer_group_col=payload.peer_group_col,
            peer_baselines=payload.peer_baselines,
            date_col=payload.date_col,
            detectors=payload.detectors,
            contamination=payload.contamination,
            random_state=payload.random_state,
            max_records=payload.max_records,
            fusion_method=payload.fusion_method,
            fdr_method=payload.fdr_method,
            target_fdr=payload.target_fdr,
            contamination_trim=payload.contamination_trim,
        )
        return {
            "success": True,
            "message": f"Successfully analyzed {results['summary']['total_records']} records. Found {results['summary']['total_anomalies']} potential anomalies.",
            "data": results,
            "error": None
        }
    except FileNotFoundError as fnf:
        raise HTTPException(status_code=404, detail=str(fnf))
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Anomaly analysis failed: {str(e)}")
