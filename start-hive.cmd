@echo off
rem Kickswarm personal hive for Windows: double-click this file.
cd /d "%~dp0"
where node >nul 2>nul
if not errorlevel 1 goto run

echo.
echo  Kickswarm needs Node.js, a free program from the OpenJS Foundation.
where winget >nul 2>nul
if errorlevel 1 goto manual
set /p ANSWER= Install it now with Windows' own installer (winget)? [Y/N]
if /i not "%ANSWER%"=="Y" goto manual
winget install -e --id OpenJS.NodeJS.LTS --source winget
echo.
echo  Done. Close this window and double-click start-hive again.
pause
exit /b

:manual
echo  Its download page opens now: take the "LTS" version, install it with the default
echo  choices, then double-click start-hive again.
start "" https://nodejs.org/en/download
pause
exit /b

:run
echo.
echo  Starting your hive. Your browser opens on the dashboard.
echo  Keep this window open while the hive works; close it to stop.
echo.
node scripts\hive.mjs
pause
