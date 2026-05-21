@echo off
echo =========================================
echo    Starting Enterprise Control Hub...
echo =========================================

echo [1/2] Starting Unified Server (Port 8000)...
start "Backend Server" cmd /k "cd server && node src/index.js"

echo [2/2] Starting Client Agent (Go)...
start "Client Agent" cmd /k "cd agent && go run ."

echo.
echo Waiting for services to initialize...
timeout /t 3 /nobreak > nul

echo Opening browser...
start http://localhost:8000

echo.
echo System started! You can close this small black window.
echo Leave the other 2 windows open while using the panel.
pause
