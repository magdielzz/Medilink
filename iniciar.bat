@echo off
echo.
echo  ============================================
echo   MediLink — Configuracion inicial
echo  ============================================
echo.

where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
  echo  ERROR: Node.js no esta instalado.
  echo  Descargalo en: https://nodejs.org
  pause
  exit /b 1
)

echo  Instalando dependencias...
cd /d "%~dp0"
call npm install

if %ERRORLEVEL% NEQ 0 (
  echo  ERROR al instalar dependencias.
  pause
  exit /b 1
)

echo.
echo  Iniciando servidor...
echo  Abre tu navegador en: http://localhost:3000
echo.
node server.js
pause
