@echo off
title AI-RIDE Starter
echo ========================================================
echo               STARTING AI RIDE PLATFORM
echo ========================================================
echo.

:: 1. Start PostgreSQL if not already running
echo [1/3] Checking PostgreSQL service...
netstat -ano | findstr :5432 >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo     PostgreSQL is already running on port 5432.
) else (
    echo     Starting PostgreSQL 17 server...
    "C:\Program Files\PostgreSQL\17\bin\pg_ctl.exe" start -D "C:\Program Files\PostgreSQL\17\data" -l "C:\Program Files\PostgreSQL\17\data\server.log"
    timeout /t 3 /nobreak >nul
)

:: 2. Start FastAPI Backend in background window
echo.
echo [2/3] Starting FastAPI Backend on http://127.0.0.1:8000...
start "AI-RIDE Backend API" cmd /k "cd /d c:\Users\Prema\OneDrive\Desktop\AI-RIDE\AI-RIDE\backend && c:\Users\Prema\OneDrive\Desktop\AI-RIDE\.venv\Scripts\python.exe -m uvicorn app:app --reload --host 127.0.0.1 --port 8000"

:: 3. Start Frontend Static Server in background window
echo.
echo [3/3] Starting Frontend Server on http://127.0.0.1:8080...
start "AI-RIDE Frontend" cmd /k "cd /d c:\Users\Prema\OneDrive\Desktop\AI-RIDE\AI-RIDE\frontend && python -m http.server 8080 --bind 127.0.0.1"

:: 4. Open Browser
echo.
echo Opening AI RIDE in default browser: http://127.0.0.1:8080/
timeout /t 2 /nobreak >nul
start http://127.0.0.1:8080/

echo.
echo ========================================================
echo    AI RIDE is up and running!
echo    - Frontend UI:  http://127.0.0.1:8080/
echo    - Backend Docs: http://127.0.0.1:8000/docs
echo ========================================================
pause

