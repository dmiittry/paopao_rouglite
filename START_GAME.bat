@echo off
cd /d "%~dp0"
set "PAO_NODE=node"
where node >nul 2>nul
if errorlevel 1 set "PAO_NODE=%USERPROFILE%\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
"%PAO_NODE%" scripts/launch.mjs
if errorlevel 1 pause
