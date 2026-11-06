@echo off
setlocal
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22 or newer is required. Install it and reopen this launcher.
  pause
  exit /b 1
)
node "%~dp0scripts\manage.mjs" %*
set "map_exit_code=%errorlevel%"
if not "%map_exit_code%"=="0" pause
exit /b %map_exit_code%
