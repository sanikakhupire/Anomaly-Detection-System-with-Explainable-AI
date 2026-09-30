"""FastAPI router for Grounded Multi-Agent Validation (C5)."""

from fastapi import APIRouter, HTTPException, status
from typing import Dict, Any, List
from app.validation.service import validation_service
from app.validation.base import ValidationReportResponse

router = APIRouter(prefix="/ml/validate", tags=["Validation (C5)"])


@router.post("", response_model=ValidationReportResponse)
def validate_record(payload: Dict[str, Any]):
    """Execute grounded multi-agent validation with claim verification on a record."""
    try:
        report = validation_service.validate_record(payload)
        return report
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Validation pipeline error: {str(e)}",
        )


@router.post("/batch", response_model=List[ValidationReportResponse])
def validate_batch(payload: List[Dict[str, Any]]):
    """Execute grounded multi-agent validation on a batch of records."""
    try:
        reports = validation_service.validate_batch(payload)
        return reports
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Batch validation error: {str(e)}",
        )
