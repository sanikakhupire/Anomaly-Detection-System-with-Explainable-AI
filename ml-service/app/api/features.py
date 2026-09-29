import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
import pandas as pd
from app.feature_engineering.registry import feature_registry

router = APIRouter(prefix="/ml/features", tags=["Feature Engineering"])


class FeatureRunRequest(BaseModel):
    file_path: str = Field(..., description="Absolute path to the dataset file")
    mapping: Dict[str, Any] = Field(..., description="Confirmed column schema mapping")


@router.post("/run")
def run_features_endpoint(request: FeatureRunRequest):
    """Executes applicable feature templates against the mapped dataset."""
    if not os.path.exists(request.file_path):
        raise HTTPException(status_code=404, detail="Dataset file not found")

    try:
        ext = os.path.splitext(request.file_path)[1].lower()
        if ext == ".csv":
            df = pd.read_csv(request.file_path, low_memory=False)
        else:
            df = pd.read_excel(request.file_path)

        result = feature_registry.execute_all(df, request.mapping)

        # Return feature metadata summaries
        return {
            "status": "success",
            "data": {
                "features": result["features"],
                "generatedCount": len(result["features"]),
                "recordCount": len(df)
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Feature generation failed: {str(e)}")
