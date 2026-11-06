@echo off
cd /d "%~dp0"
if not exist .env copy .env.example .env
echo PixelTrace dev server: http://localhost:3000
call npm run dev
