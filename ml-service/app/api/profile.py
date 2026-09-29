from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional
from app.preprocessing.profiler import profile_dataset

router = APIRouter(prefix="/ml", tags=["Preprocessing & Profiling"])


class ProfileRequest(BaseModel):
    file_path: str = Field(..., description="Absolute path to the dataset file on disk")
    chunk_size: Optional[int] = Field(10000, description="Chunk size for streaming large files")


@router.post("/profile")
def profile_dataset_endpoint(request: ProfileRequest):
    """
    Profiles a dataset file in chunks without mutating the raw data.
    Returns row count, column schemas, data types, missing/duplicate rates,
    and a deterministic data quality score.
    """
    try:
        result = profile_dataset(request.file_path, chunk_size=request.chunk_size)
        return {
            "status": "success",
            "data": result
        }
    except FileNotFoundError as fnf:
        raise HTTPException(status_code=404, detail=str(fnf))
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Profiling failed: {str(e)}")
