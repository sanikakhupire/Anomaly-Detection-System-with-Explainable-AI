"""
FastAPI router for Explainability and Faithfulness (Contribution C4).
Provides lazy SHAP/DIFFI attributions, counterfactual generation, and faithfulness metrics.
"""

from typing import Dict, Any, List, Optional
import os
import pandas as pd
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.explainability.service import ExplainabilityService

router = APIRouter(prefix="/ml/explain", tags=["Explainability"])
service = ExplainabilityService()


class ExplainRequest(BaseModel):
    file_path: str = Field(..., description="Absolute path to CSV dataset file")
    record_index: int = Field(..., description="0-indexed position of anomalous record")
    record_data: Dict[str, Any] = Field(..., description="Attribute values of the record")
    feature_cols: List[str] = Field(..., description="List of feature column names to explain")
    peer_baselines: Optional[Dict[str, Dict[str, float]]] = Field(None, description="Optional peer baselines")
    data_hash: Optional[str] = Field("data_hash", description="SHA-256 hash of dataset")
    config_hash: Optional[str] = Field("config_hash", description="Hash of detector configuration")
    top_k: Optional[int] = Field(4, description="Top-k features to isolate in breakdown")


class BatchExplainRequest(BaseModel):
    file_path: str = Field(..., description="Absolute path to CSV dataset file")
    anomalies: List[Dict[str, Any]] = Field(..., description="List of top anomaly records with record_index and record_data")
    feature_cols: List[str] = Field(..., description="List of feature column names to explain")
    peer_baselines: Optional[Dict[str, Dict[str, float]]] = Field(None, description="Optional peer baselines")
    data_hash: Optional[str] = Field("data_hash", description="SHA-256 hash of dataset")
    config_hash: Optional[str] = Field("config_hash", description="Hash of detector configuration")
    top_k: Optional[int] = Field(4, description="Top-k features to isolate in breakdown")


@router.post("")
def explain_single_anomaly(req: ExplainRequest) -> Dict[str, Any]:
    """
    Computes local SHAP, DIFFI, perturbation baseline, and counterfactual for a single anomaly.
    """
    if not os.path.exists(req.file_path):
        raise HTTPException(status_code=404, detail=f"File not found: {req.file_path}")

    try:
        # Load background data (first 2000 rows for fast background sampling)
        df_bg = pd.read_csv(req.file_path, nrows=2000)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read dataset: {str(e)}")

    valid_cols = [c for c in req.feature_cols if c in df_bg.columns]
    if not valid_cols:
        raise HTTPException(status_code=400, detail="No matching feature columns found in dataset")

    try:
        res = service.explain_record(
            record_index=req.record_index,
            record_data=req.record_data,
            feature_cols=valid_cols,
            background_df=df_bg,
            peer_baselines=req.peer_baselines,
            data_hash=req.data_hash or "data_hash",
            config_hash=req.config_hash or "config_hash",
            top_k=req.top_k or 4,
        )
        return {
            "success": True,
            "message": "Explanation generated successfully",
            "data": res.to_dict(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Explainability execution failed: {str(e)}")


@router.post("/batch")
def explain_batch_anomalies(req: BatchExplainRequest) -> Dict[str, Any]:
    """
    Explains top-ranked anomalies in batch and computes dataset-wide faithfulness/stability metrics.
    """
    if not os.path.exists(req.file_path):
        raise HTTPException(status_code=404, detail=f"File not found: {req.file_path}")

    try:
        df_bg = pd.read_csv(req.file_path, nrows=2000)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to read dataset: {str(e)}")

    valid_cols = [c for c in req.feature_cols if c in df_bg.columns]
    if not valid_cols:
        raise HTTPException(status_code=400, detail="No matching feature columns found in dataset")

    explanations: List[Dict[str, Any]] = []
    deletion_aucs = []
    insertion_aucs = []
    jaccards = []
    taus = []

    for anomaly in req.anomalies:
        idx = anomaly.get("record_index", 0)
        data = anomaly.get("record_data", {})
        try:
            res = service.explain_record(
                record_index=idx,
                record_data=data,
                feature_cols=valid_cols,
                background_df=df_bg,
                peer_baselines=req.peer_baselines,
                data_hash=req.data_hash or "data_hash",
                config_hash=req.config_hash or "config_hash",
                top_k=req.top_k or 4,
            )
            res_dict = res.to_dict()
            explanations.append(res_dict)
            deletion_aucs.append(res.faithfulness.deletion_auc)
            insertion_aucs.append(res.faithfulness.insertion_auc)
            jaccards.append(res.stability.jaccard_stability)
            taus.append(res.stability.kendall_tau)
        except Exception as e:
            # Continue on individual anomaly failure
            continue

    total_requested = len(req.anomalies)
    coverage = float(len(explanations) / max(1, total_requested))

    summary_metrics = {
        "mean_deletion_auc": round(float(np.mean(deletion_aucs)), 4) if deletion_aucs else 0.0,
        "mean_insertion_auc": round(float(np.mean(insertion_aucs)), 4) if insertion_aucs else 0.0,
        "mean_jaccard_stability": round(float(np.mean(jaccards)), 4) if jaccards else 0.0,
        "mean_kendall_tau": round(float(np.mean(taus)), 4) if taus else 0.0,
        "total_explained": len(explanations),
        "explanation_coverage": round(coverage, 4),
    }

    return {
        "success": True,
        "message": f"Generated explanations for {len(explanations)}/{total_requested} anomalies.",
        "data": {
            "explanations": explanations,
            "metrics": summary_metrics,
        },
    }
