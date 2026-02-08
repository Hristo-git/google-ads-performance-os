# Kill all Node.js processes
Write-Host "Stopping all Node.js processes..." -ForegroundColor Yellow
Stop-Process -Name node -Force -ErrorAction SilentlyContinue

# Wait a bit to ensure processes are killed
Start-Sleep -Seconds 2

# Check if port 4000 is free
$port = 4000
$listener = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue

if ($listener) {
    Write-Host "Port $port is still in use. Killing process..." -ForegroundColor Red
    $processId = $listener.OwningProcess
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

Write-Host "Starting Next.js dev server (Webpack mode)..." -ForegroundColor Green
$env:NEXT_MAX_WORKERS = ""
$env:NODE_OPTIONS = ""
npm run dev -- --webpack
