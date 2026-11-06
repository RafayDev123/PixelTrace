@echo off
cd /d "%~dp0"
echo Starting PostgreSQL via Docker (skip if you run your own)...
docker compose up -d db
timeout /t 6 >nul
call npx drizzle-kit push
call start-dev.bat
