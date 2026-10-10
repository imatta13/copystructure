@echo off
setlocal EnableExtensions
title CopyStructure - Actualizador para Vencord
color 0B

echo.
echo  ============================================================== 
echo          CopyStructure - Buscando la ultima version
echo  ============================================================== 
echo.
echo  Consultando los releases de github.com/imatta13/copystructure...
echo.

set "WORK_DIR=%TEMP%\CopyStructure-latest-%RANDOM%-%RANDOM%"
set "BUNDLE_DIR=%WORK_DIR%\bundle"
mkdir "%WORK_DIR%" >nul 2>&1
if errorlevel 1 goto :temp_failed

if not exist "%~dp0FETCH-LATEST.ps1" goto :helper_missing
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0FETCH-LATEST.ps1" -OutputDirectory "%WORK_DIR%"
if errorlevel 1 goto :download_failed
if not exist "%BUNDLE_DIR%\INSTALL-BUNDLE.cmd" goto :invalid_release

if exist "%BUNDLE_DIR%\BUNDLE-VERSION.txt" set /p "BUNDLE_VERSION="<"%BUNDLE_DIR%\BUNDLE-VERSION.txt"
if defined BUNDLE_VERSION echo  Version del bundle: %BUNDLE_VERSION%
echo.
call "%BUNDLE_DIR%\INSTALL-BUNDLE.cmd"
set "INSTALL_RESULT=%ERRORLEVEL%"
rmdir /S /Q "%WORK_DIR%" >nul 2>&1
exit /b %INSTALL_RESULT%

:temp_failed
echo  ERROR: No se pudo crear el directorio temporal.
goto :failed

:helper_missing
echo  ERROR: No se encontro FETCH-LATEST.ps1 junto a INSTALL.cmd.
echo  Extrae el repositorio completo y vuelve a intentarlo.
goto :failed

:download_failed
echo  ERROR: No se pudo consultar o descargar el release mas reciente.
echo  Comprueba tu conexion y vuelve a intentarlo.
goto :cleanup_failed

:invalid_release
echo  ERROR: El release descargado no contiene INSTALL-BUNDLE.cmd.
goto :cleanup_failed

:cleanup_failed
rmdir /S /Q "%WORK_DIR%" >nul 2>&1
:failed
echo.
pause
exit /b 1
