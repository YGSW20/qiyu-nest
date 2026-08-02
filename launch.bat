@echo off
set "DIR=%~dp0"
set "URL=http://localhost:8080"
set "NODE=C:\Program Files\nodejs\node.exe"

if not exist "%NODE%" (
    echo Node.js not found at: %NODE%
    echo Please install Node.js from https://nodejs.org/
    pause
    exit /b 1
)

taskkill /F /IM node.exe >nul 2>nul

echo Starting CLOSD...
start "CLOSD" /MIN "%NODE%" "%DIR%server.js"

timeout /t 4 /nobreak >nul

start "" "%URL%"
echo CLOSD started!
exit
