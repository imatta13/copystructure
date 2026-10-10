@echo off
setlocal EnableExtensions
title CopyStructure - Instalador de bundle
color 0B
cd /d "%~dp0"

echo.
echo  ============================================================== 
echo           CopyStructure - Instalando bundle actualizado
echo  ============================================================== 
echo.

set "SOURCE_DIST=%~dp0dist"
call :check_dist_complete "%SOURCE_DIST%"
if errorlevel 1 goto :package_incomplete
set "VENCORD_ROOT=%APPDATA%\Vencord"
set "LIVE_DIST=%VENCORD_ROOT%\dist"
if not exist "%LIVE_DIST%\" goto :vencord_missing
call :check_dist_files "%LIVE_DIST%"
if errorlevel 1 goto :vencord_incomplete

echo.
echo  ADVERTENCIA:
echo  - Se reemplazara la carpeta dist completa de Vencord.
echo  - El actualizador integrado de Vencord esta desactivado en este bundle.
echo  - Se guardara una copia fechada para poder volver atras.
echo.
choice /C YN /N /M "  Continuar con la instalacion? [Y/N]: "
if errorlevel 2 goto :cancelled

set "WAS_STABLE=0"
set "WAS_CANARY=0"
set "WAS_PTB=0"
tasklist /FI "IMAGENAME eq Discord.exe" /NH 2>nul | find /I "Discord.exe" >nul
if not errorlevel 1 set "WAS_STABLE=1"
tasklist /FI "IMAGENAME eq DiscordCanary.exe" /NH 2>nul | find /I "DiscordCanary.exe" >nul
if not errorlevel 1 set "WAS_CANARY=1"
tasklist /FI "IMAGENAME eq DiscordPTB.exe" /NH 2>nul | find /I "DiscordPTB.exe" >nul
if not errorlevel 1 set "WAS_PTB=1"

echo.
echo  [1/3] Cerrando Discord...
if "%WAS_STABLE%"=="1" taskkill /F /IM Discord.exe >nul 2>&1
if "%WAS_CANARY%"=="1" taskkill /F /IM DiscordCanary.exe >nul 2>&1
if "%WAS_PTB%"=="1" taskkill /F /IM DiscordPTB.exe >nul 2>&1
ping -n 3 127.0.0.1 >nul
tasklist /FI "IMAGENAME eq Discord.exe" /NH 2>nul | find /I "Discord.exe" >nul
if not errorlevel 1 goto :discord_still_running
tasklist /FI "IMAGENAME eq DiscordCanary.exe" /NH 2>nul | find /I "DiscordCanary.exe" >nul
if not errorlevel 1 goto :discord_still_running
tasklist /FI "IMAGENAME eq DiscordPTB.exe" /NH 2>nul | find /I "DiscordPTB.exe" >nul
if not errorlevel 1 goto :discord_still_running

echo  [2/3] Guardando backup y preparando el bundle...
for /f %%T in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set "BACKUP_STAMP=%%T"
if not defined BACKUP_STAMP goto :backup_name_failed
set "BACKUP_DIST=%VENCORD_ROOT%\dist.copystructure-backup-%BACKUP_STAMP%"
set "BACKUP_STAGE=%VENCORD_ROOT%\dist.copystructure-backup-new"
set "NEW_DIST=%VENCORD_ROOT%\dist.copystructure-new"
set "OLD_DIST=%VENCORD_ROOT%\dist.copystructure-old"
if exist "%OLD_DIST%\" goto :stale_install_files
if exist "%BACKUP_STAGE%\" rmdir /S /Q "%BACKUP_STAGE%" >nul 2>&1
if exist "%NEW_DIST%\" rmdir /S /Q "%NEW_DIST%" >nul 2>&1
xcopy /Y /Q /E /I "%LIVE_DIST%" "%BACKUP_STAGE%" >nul
if errorlevel 1 goto :backup_failed
call :check_dist_files "%BACKUP_STAGE%"
if errorlevel 1 goto :backup_failed
move "%BACKUP_STAGE%" "%BACKUP_DIST%" >nul
if errorlevel 1 goto :backup_failed
xcopy /Y /Q /E /I "%SOURCE_DIST%\*" "%NEW_DIST%\" >nul
if errorlevel 1 goto :bundle_copy_failed
call :check_dist_complete "%NEW_DIST%"
if errorlevel 1 goto :bundle_copy_failed

echo  [3/3] Sustituyendo el bundle...
move "%LIVE_DIST%" "%OLD_DIST%" >nul
if errorlevel 1 goto :swap_failed
move "%NEW_DIST%" "%LIVE_DIST%" >nul
if errorlevel 1 goto :restore_previous
call :check_dist_complete "%LIVE_DIST%"
if errorlevel 1 goto :restore_previous
rmdir /S /Q "%OLD_DIST%" >nul 2>&1

echo.
echo  Instalacion completada. Backup anterior:
echo    "%BACKUP_DIST%"
echo.
echo  Activa CopyStructure en Ajustes de usuario ^> Vencord ^> Plugins.
call :reopen_clients
pause
exit /b 0

:check_dist_complete
call :check_dist_files "%~1"
if errorlevel 1 exit /b 1
set "CHECK_RENDERER=%~1\renderer.js"
powershell -NoProfile -Command "$c=[IO.File]::ReadAllText($env:CHECK_RENDERER); if ($c.Contains('CopyStructure')) { exit 0 } else { exit 1 }" >nul 2>&1
if errorlevel 1 exit /b 1
exit /b 0

:check_dist_files
if not exist "%~1\patcher.js" exit /b 1
if not exist "%~1\preload.js" exit /b 1
if not exist "%~1\renderer.js" exit /b 1
if not exist "%~1\renderer.css" exit /b 1
for %%F in ("%~1\patcher.js") do if %%~zF LEQ 0 exit /b 1
for %%F in ("%~1\preload.js") do if %%~zF LEQ 0 exit /b 1
for %%F in ("%~1\renderer.js") do if %%~zF LEQ 0 exit /b 1
for %%F in ("%~1\renderer.css") do if %%~zF LEQ 0 exit /b 1
exit /b 0

:package_incomplete
echo ERROR: Bundle incompleto o no contiene CopyStructure.
goto :failed
:vencord_missing
echo ERROR: No se encontro Vencord en "%VENCORD_ROOT%".
goto :failed
:vencord_incomplete
echo ERROR: El dist actual de Vencord esta incompleto. Repara Vencord antes.
goto :failed
:discord_still_running
echo ERROR: Discord sigue abierto; Vencord no se modifico.
call :reopen_clients
goto :failed
:backup_name_failed
echo ERROR: No se pudo generar un nombre para el backup.
call :reopen_clients
goto :failed
:stale_install_files
echo ERROR: Hay restos de una instalacion anterior en "%OLD_DIST%".
echo Revisalos manualmente y vuelve a ejecutar.
call :reopen_clients
goto :failed
:backup_failed
if exist "%BACKUP_STAGE%\" rmdir /S /Q "%BACKUP_STAGE%" >nul 2>&1
echo ERROR: No se pudo crear y verificar el backup; Vencord sigue intacto.
call :reopen_clients
goto :failed
:bundle_copy_failed
if exist "%NEW_DIST%\" rmdir /S /Q "%NEW_DIST%" >nul 2>&1
echo ERROR: No se pudo preparar el nuevo bundle; Vencord sigue intacto.
call :reopen_clients
goto :failed
:swap_failed
if exist "%NEW_DIST%\" rmdir /S /Q "%NEW_DIST%" >nul 2>&1
echo ERROR: No se pudo apartar el dist actual.
call :reopen_clients
goto :failed
:restore_previous
echo ERROR: El bundle nuevo fallo; restaurando Vencord anterior...
if exist "%LIVE_DIST%\" rmdir /S /Q "%LIVE_DIST%" >nul 2>&1
move "%OLD_DIST%" "%LIVE_DIST%" >nul
if errorlevel 1 goto :restore_failed
call :check_dist_files "%LIVE_DIST%"
if errorlevel 1 goto :restore_failed
call :reopen_clients
goto :failed
:restore_failed
echo ERROR: Fallo tambien la restauracion automatica.
echo Recupera manualmente desde "%BACKUP_DIST%" y no abras Discord.
goto :failed
:reopen_clients
if "%WAS_STABLE%"=="1" if exist "%LOCALAPPDATA%\Discord\Update.exe" start "" "%LOCALAPPDATA%\Discord\Update.exe" --processStart Discord.exe
if "%WAS_CANARY%"=="1" if exist "%LOCALAPPDATA%\DiscordCanary\Update.exe" start "" "%LOCALAPPDATA%\DiscordCanary\Update.exe" --processStart DiscordCanary.exe
if "%WAS_PTB%"=="1" if exist "%LOCALAPPDATA%\DiscordPTB\Update.exe" start "" "%LOCALAPPDATA%\DiscordPTB\Update.exe" --processStart DiscordPTB.exe
goto :eof
:cancelled
echo Instalacion cancelada. Vencord no se modifico.
pause
exit /b 0
:failed
echo.
pause
exit /b 1
