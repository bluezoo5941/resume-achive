@echo off
cd /d "%~dp0"
if exist "runtime\node.exe" (
  "runtime\node.exe" launcher.js
) else (
  node launcher.js
)
if errorlevel 1 pause
