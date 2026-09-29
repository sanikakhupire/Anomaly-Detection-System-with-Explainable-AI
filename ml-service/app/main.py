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
