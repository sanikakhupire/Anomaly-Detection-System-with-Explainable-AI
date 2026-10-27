@echo off
title Stop Statistical Anomaly Detection Platform
cls
echo =====================================================================
echo    STOPPING ALL PLATFORM BACKGROUND SERVICES
echo =====================================================================
echo.

echo [1/3] Terminating Node.js Backend & Frontend processes...
taskkill /F /IM node.exe >nul 2>&1
if %ERRORLEVEL% EQU 0 (echo  - Node.js processes terminated.) else (echo  - No Node.js processes were active.)

echo [2/3] Terminating Python ML Service processes...
taskkill /F /IM python.exe >nul 2>&1
if %ERRORLEVEL% EQU 0 (echo  - Python processes terminated.) else (echo  - No Python processes were active.)

echo [3/3] Checking remaining port bindings...
netstat -ano | findstr ":3000 :5000 :8000" >nul
if %ERRORLEVEL% NEQ 0 (
    echo [OK] Ports 3000, 5000, and 8000 are now completely free!
) else (
    echo [NOTE] Some sockets are closing down gracefully.
)

echo.
echo Platform successfully shut down. Press any key to close.
pause >nul
