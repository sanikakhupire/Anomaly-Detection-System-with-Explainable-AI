import os
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
import pandas as pd
from app.peer_groups.builder import build_peer_groups

router = APIRouter(prefix="/ml/peer-groups", tags=["Peer Groups & Shrinkage"])


class PeerGroupBuildRequest(BaseModel):
    file_path: str = Field(..., description="Absolute path to dataset file")
    mapping: Dict[str, Any] = Field(..., description="Confirmed column schema mapping")
    group_column: Optional[str] = Field(None, description="Explicit group column (e.g. district)")
    parent_column: Optional[str] = Field(None, description="Higher-level hierarchy column (e.g. state)")
    feature_columns: Optional[List[str]] = Field(None, description="Feature columns to compute baselines for")
    shrinkage_n0: Optional[int] = Field(15, description="Empirical shrinkage weight parameter")
    min_group_size: Optional[int] = Field(5, description="Threshold to flag small groups")


@router.post("/build")
def build_peer_groups_endpoint(request: PeerGroupBuildRequest):
    """
    Builds hierarchy-aware peer groups, computes robust median/MAD baselines,
    and applies empirical shrinkage toward parent baselines.
    """
    if not os.path.exists(request.file_path):
        raise HTTPException(status_code=404, detail="Dataset file not found")

    try:
        ext = os.path.splitext(request.file_path)[1].lower()
        if ext == ".csv":
            df = pd.read_csv(request.file_path, low_memory=False)
        else:
            df = pd.read_excel(request.file_path)

        # Automatically resolve group_column and parent_column from mapping if not specified
        group_col = request.group_column
        parent_col = request.parent_column

        if not group_col:
            # Look for block or district in mapping
            for col_name, info in request.mapping.items():
                role = info.get("canonicalRole") if isinstance(info, dict) else info
                if role in ["district", "block", "panchayat", "constituency"]:
                    group_col = col_name
                    break

        if not group_col:
            # Fallback to state or first text column
            for col_name, info in request.mapping.items():
                role = info.get("canonicalRole") if isinstance(info, dict) else info
                if role == "state":
                    group_col = col_name
                    break

        if not group_col:
            # Fallback to first object/string column in df
            text_cols = [c for c in df.columns if not pd.api.types.is_numeric_dtype(df[c])]
            if text_cols:
                group_col = text_cols[0]
            else:
                raise HTTPException(
                    status_code=400,
                    detail="No valid hierarchy or categorical group column found to form peer groups."
                )

        # Resolve parent_column if hierarchy exists
        if not parent_col:
            for col_name, info in request.mapping.items():
                role = info.get("canonicalRole") if isinstance(info, dict) else info
                if role == "state" and col_name != group_col:
                    parent_col = col_name
                    break

        # Resolve feature columns
        feat_cols = request.feature_columns or []
        if not feat_cols:
            feat_cols = [
                c for c in df.columns if pd.api.types.is_numeric_dtype(df[c]) and c != group_col
            ]

        result = build_peer_groups(
            df=df,
            group_col=group_col,
            feature_cols=feat_cols,
            parent_col=parent_col,
            shrinkage_n0=request.shrinkage_n0,
            min_group_size=request.min_group_size,
        )

        return {
            "status": "success",
            "data": result,
        }
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Peer group construction failed: {str(e)}")
