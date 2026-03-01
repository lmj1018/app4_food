@echo off
setlocal
set SCRIPT_DIR=%~dp0
set "PS_EXE=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%PS_EXE%" set "PS_EXE=powershell"
"%PS_EXE%" -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start_pinball_map_maker_v2.ps1" %*
if errorlevel 1 (
  echo.
  echo [ERROR] Launcher failed. Check the message above.
  pause
)
endlocal
