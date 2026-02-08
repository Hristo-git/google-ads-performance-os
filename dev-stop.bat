@echo off
echo Stopping all Node.js processes...
taskkill /F /IM node.exe 2>nul

echo Done! All Node.js processes have been terminated.
timeout /t 2 /nobreak >nul
