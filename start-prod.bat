@echo off
cd /d "%~dp0"
if not exist .env copy .env.example .env
call npm run build || exit /b 1
echo PixelTrace: http://localhost:3000
call npm run start
