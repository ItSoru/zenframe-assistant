@echo off

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Uninstall-Zenframe-Assistant.ps1"

set "result=%errorlevel%"

pause

exit /b %result%

