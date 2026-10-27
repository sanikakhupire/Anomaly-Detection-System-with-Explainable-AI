@echo off
title Statistical Anomaly Detection Platform Launcher
cls
echo =====================================================================
echo    INTELLIGENT STATISTICAL ANOMALY DETECTION PLATFORM
echo    Decision-Support System for Public Datasets (Final Year Project)
echo =====================================================================
echo.

:: 1. Check MongoDB
echo [Step 1/4] Verifying MongoDB service...
sc query "MongoDB" | find "RUNNING" >nul
if %ERRORLEVEL% EQU 0 (
    echo [OK] MongoDB service is actively running.
) else (
    echo [INFO] Attempting to start MongoDB service...
    net start MongoDB >nul 2>&1
    if %ERRORLEVEL% EQU 0 (
        echo [OK] MongoDB service started successfully.
    ) else (
        echo [WARNING] Could not start MongoDB service automatically.
        echo Please ensure MongoDB is running on mongodb://127.0.0.1:27017.
    )
)
echo.

:: 2. Launch ML FastAPI Service (Port 8000)
echo [Step 2/4] Starting Python ML Microservice on port 8000...
start "1. ML Engine (FastAPI - Port 8000)" cmd /k "cd /d ""%~dp0ml-service"" && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload"

:: 3. Launch Node.js Backend API (Port 5000)
echo [Step 3/4] Starting Express Backend API on port 5000...
start "2. Backend API (Express - Port 5000)" cmd /k "cd /d ""%~dp0backend"" && npm run dev"

:: 4. Launch React Frontend Web UI (Port 3000)
echo [Step 4/4] Starting React Frontend Dev Server on port 3000...
start "3. Frontend UI (React - Port 3000)" cmd /k "cd /d ""%~dp0frontend"" && npm start"

echo.
echo =====================================================================
echo  All 3 application tiers launched in separate windows!
echo  Waiting 5 seconds before opening browser...
echo =====================================================================
timeout /t 5 /nobreak >nul

start http://localhost:3000

echo.
echo You can log in using:
echo   - ADMIN:    admin@anomalydetection.internal    / AdminPassword@123
echo   - ANALYST:  analyst@anomalydetection.internal  / AnalystPassword@123
echo   - REVIEWER: reviewer@anomalydetection.internal / ReviewerPassword@123
echo.
echo Press any key to exit this launcher window (services keep running).
pause >nul
