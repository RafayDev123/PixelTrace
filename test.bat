@echo off
cd /d "%~dp0"
call npx tsc --noEmit || exit /b 1
call npx eslint . || exit /b 1
call npm test
