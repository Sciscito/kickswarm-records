@echo off
rem Kickswarm personal hive for Windows: double-click this file.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Kickswarm needs Node.js, a free program. Its download page opens now:
  echo  take the "LTS" version, install it with the default choices, then double-click start-hive again.
  echo.
  start "" https://nodejs.org/en/download
  pause
  exit /b
)
echo.
echo  Starting your hive. Your browser opens on the dashboard.
echo  Keep this window open while the hive works; close it to stop.
echo.
node scripts\hive.mjs
pause
