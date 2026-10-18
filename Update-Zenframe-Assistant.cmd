@echo off

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Update-Zenframe-Assistant.ps1"

set "result=%errorlevel%"

pause

exit /b %result%
