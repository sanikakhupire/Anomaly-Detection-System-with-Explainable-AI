"""FastAPI router for Human-in-the-Loop Adaptive Detector Weighting (Contribution C6)."""

from fastapi import APIRouter, HTTPException, status
from typing import Dict, Any, List, Optional
from app.calibration.adaptive_weights import AdaptiveWeightEngine, AdaptiveWeightResult

router = APIRouter(prefix="/ml/weights", tags=["Adaptive Weighting (C6)"])


@router.post("/update", response_model=AdaptiveWeightResult)
def update_detector_weights(payload: Dict[str, Any]):
    """
    Computes updated detector weights using Exponentiated Gradient Descent
    over human reviewer feedback with epsilon-smoothing.
    """
    try:
        current_weights = payload.get("current_weights")
        feedback_items = payload.get("feedback_items", [])
        learning_rate = float(payload.get("learning_rate", 0.1))
        smoothing_factor = float(payload.get("smoothing_factor", 0.05))

        res = AdaptiveWeightEngine.update_weights(
            current_weights=current_weights,
            feedback_items=feedback_items,
            learning_rate=learning_rate,
            smoothing_factor=smoothing_factor,
        )
        return res
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Adaptive weighting error: {str(e)}",
        )
