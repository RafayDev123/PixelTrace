@echo off
setlocal
cd /d "%~dp0"
if not exist .env copy .env.example .env
echo Installing dependencies...
call npm ci || goto :fail
echo Applying database schema (needs PostgreSQL from DATABASE_URL)...
call npx drizzle-kit push || goto :fail
echo.
echo Setup complete. Run start-dev.bat or start-prod.bat
exit /b 0
:fail
echo Setup failed. See README.md - Troubleshooting.
exit /b 1
