# Enterprise Control Hub Orchestration Script
# Use this script to run the server, web panel, and agent locally for testing.

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "   Starting Enterprise Control Hub..." -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
if ([string]::IsNullOrEmpty($ScriptDir)) { $ScriptDir = Get-Location }

# 1. Start Server
Write-Host "[1/3] Starting Express & WebSocket Server on port 5000..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location `"$ScriptDir\server`"; Write-Host '--- Starting backend ---' -ForegroundColor Yellow; npm start"

Start-Sleep -Seconds 2

# 2. Start Frontend Web Panel
Write-Host "[2/3] Starting Vite Web Panel Dev Server..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location `"$ScriptDir\web`"; Write-Host '--- Starting frontend ---' -ForegroundColor Cyan; npm run dev -- --open"

Start-Sleep -Seconds 3

# 3. Compile and Run Agent
Write-Host "[3/3] Running Go Client Agent..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location `"$ScriptDir\agent`"; Write-Host '--- Starting client agent ---' -ForegroundColor Green; go run ."

Write-Host ""
Write-Host "System started!" -ForegroundColor Green
Write-Host "- Backend running at http://localhost:5000" -ForegroundColor Gray
Write-Host "- Web Panel should open automatically in your browser." -ForegroundColor Gray
Write-Host "- Local agent registered and executing commands." -ForegroundColor Gray
Write-Host "=========================================" -ForegroundColor Cyan

# Also try to open browser from this script just in case Vite doesn't
Start-Sleep -Seconds 2
Start-Process "http://localhost:5173"
