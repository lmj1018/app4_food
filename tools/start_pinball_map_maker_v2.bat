@echo off
setlocal
set SCRIPT_DIR=%~dp0
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%start_pinball_map_maker_v2.ps1"
if errorlevel 1 (
  echo.
  echo [ERROR] 실행 중 오류가 발생했습니다. 위 메시지를 확인하세요.
  pause
)
endlocal
