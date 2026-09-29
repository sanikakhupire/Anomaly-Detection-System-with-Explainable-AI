"""
Statistical Anomaly Detection - ML Microservice
FastAPI application entrypoint.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(
    title="Statistical Anomaly Detection ML Service",
    description="Microservice providing conformal calibration, statistical forensics, peer-group baselines, and explainability.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {
        "status": "ok",
        "service": "ml-service",
        "message": "Statistical Anomaly Detection ML Engine active"
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "service": "ml-service",
        "version": "1.0.0"
    }


from app.api.profile import router as profile_router
from app.api.schema_mapping import router as schema_mapping_router
from app.api.features import router as features_router
from app.api.peer_groups import router as peer_groups_router
from app.api.anomaly_detection import router as anomaly_detection_router

app.include_router(profile_router)
app.include_router(schema_mapping_router)
app.include_router(features_router)
app.include_router(peer_groups_router)
app.include_router(anomaly_detection_router)


