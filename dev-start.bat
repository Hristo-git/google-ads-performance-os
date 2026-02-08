@echo off
echo Cleaning up Node.js processes...
taskkill /F /IM node.exe 2>nul

echo Waiting for processes to close...
timeout /t 2 /nobreak >nul

echo Starting development server (Webpack mode for stability)...
set NEXT_MAX_WORKERS=
set NODE_OPTIONS=
npm run dev -- --webpack
