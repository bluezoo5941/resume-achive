@echo off
cd /d "%~dp0"
if exist "runtime\node.exe" (
  "runtime\node.exe" launcher.js --stop
) else (
  node launcher.js --stop
)
if errorlevel 1 pause
