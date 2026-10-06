@echo off
chcp 65001 >nul
title Preparar copia de NOIR STORE para un cliente
set "DEST=%USERPROFILE%\Desktop\NOIR STORE - para entregar"
echo.
echo   Se creara una copia limpia del sistema (SIN tus datos) en:
echo   %DEST%
echo.
pause
robocopy "%~dp0." "%DEST%" /E /XD "%~dp0data" /XF "PREPARAR COPIA PARA CLIENTE.bat" /NFL /NDL /NJH /NJS >nul
mkdir "%DEST%\data" 2>nul
echo.
echo   Listo. Comprime esa carpeta en .zip y enviasela a tu cliente.
echo   Al abrirla tendra 7 dias de prueba y luego le pedira el codigo de activacion.
echo.
explorer "%DEST%"
pause
