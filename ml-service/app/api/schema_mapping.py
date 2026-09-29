import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional
import pandas as pd
from app.schema_mapping.infer import infer_schema_mapping

router = APIRouter(prefix="/ml/schema-mapping", tags=["Schema Mapping"])


class InferMappingRequest(BaseModel):
    file_path: str = Field(..., description="Absolute path to the dataset file")


@router.post("/infer")
def infer_mapping_endpoint(request: InferMappingRequest):
    """Infers semantic schema mapping with calibrated confidence scores."""
    if not os.path.exists(request.file_path):
        raise HTTPException(status_code=404, detail="Dataset file not found")

    try:
        ext = os.path.splitext(request.file_path)[1].lower()
        if ext == ".csv":
            sample_df = pd.read_csv(request.file_path, nrows=500, low_memory=False)
        else:
            sample_df = pd.read_excel(request.file_path, nrows=500)

        mapping = infer_schema_mapping(sample_df, sample_df=sample_df)
        return {
            "status": "success",
            "data": mapping
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Schema mapping inference failed: {str(e)}")
