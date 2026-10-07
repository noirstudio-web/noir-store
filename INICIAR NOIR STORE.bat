@echo off
chcp 65001 >nul
title NOIR STORE
cd /d "%~dp0"
where node >nul 2>nul
if %errorlevel%==0 (
  node server.js
  pause
) else (
  echo.
  echo   Node.js no esta instalado: se abrira el sistema en modo navegador.
  echo   Los datos se guardaran en el navegador. Haz respaldos frecuentes
  echo   desde Configuracion ^> Respaldo y datos.
  echo.
  echo   Para guardar en archivos y usarlo en red instala Node.js: https://nodejs.org
  echo.
  start "" "%~dp0index.html"
  timeout /t 8 >nul
)
