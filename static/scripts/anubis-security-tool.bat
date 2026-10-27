@echo off
rem Anubis-Security-Tool desktop installer bootstrapper (Windows).
rem Usage:
rem   Invoke-WebRequest -Uri "https://download.anubis.locker/scripts/anubis-security-tool.bat" -OutFile "anubis-security-tool.bat"
rem   cmd.exe /c ".\anubis-security-tool.bat"
rem
rem Double-click / plain run: download, then let the EXE request UAC approval
rem and install silently in the existing installation scope.
rem Console / verbose run:    add --console (or -v) to keep this window and see
rem                            live progress; still elevates via UAC once.
rem
rem Env overrides:
rem   ANUBIS_UPDATE_URL   default https://update.anubis.locker
rem   ANUBIS_CHANNEL      default stable (reserved, not yet used server-side)
setlocal enabledelayedexpansion
set "EXIT_CODE=1"

set "ANUBIS_UPDATE_URL=%ANUBIS_UPDATE_URL%"
if "%ANUBIS_UPDATE_URL%"=="" set "ANUBIS_UPDATE_URL=https://update.anubis.locker"
set "ANUBIS_API_URL=%ANUBIS_API_URL%"
if "%ANUBIS_API_URL%"=="" set "ANUBIS_API_URL=https://api.anubis.locker"

set "VERBOSE=0"
for %%A in (%*) do (
  if /I "%%A"=="--console" set "VERBOSE=1"
  if /I "%%A"=="-v" set "VERBOSE=1"
  if /I "%%A"=="--verbose" set "VERBOSE=1"
)

if "%VERBOSE%"=="1" echo === Anubis-Security-Tool installer bootstrap ===

set "TMP_DIR=%LOCALAPPDATA%\anubis-installer"
mkdir "%TMP_DIR%" >nul 2>&1
set "REL_JSON=%TMP_DIR%\anubis-release.json"
if "%VERBOSE%"=="1" echo Fetching release manifest from %ANUBIS_UPDATE_URL% ...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { Invoke-WebRequest -UseBasicParsing -Uri '%ANUBIS_UPDATE_URL%/data/anubis-release.json' -OutFile '%REL_JSON%' } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 goto :report_fail

for /f "usebackq delims=" %%U in (`powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$j = Get-Content -Raw '%REL_JSON%' | ConvertFrom-Json; $arch = if ([Environment]::Is64BitOperatingSystem) {'x64'} else {'ia32'}; $a = $j.release.assets | Where-Object { $_.name -like \"*win-$arch-installer.exe\" } | Select-Object -First 1; if (-not $a) { $a = $j.release.assets | Where-Object { $_.name -like '*.exe' } | Select-Object -First 1 }; $a.browser_download_url"`) do set "EXE_URL=%%U"

if "%EXE_URL%"=="" (
  echo Could not find a Windows installer asset in the release manifest.
  goto :report_fail
)

for %%F in ("%EXE_URL%") do set "EXE_NAME=%%~nxF"
set "EXE_PATH=%TMP_DIR%\%EXE_NAME%"

if "%VERBOSE%"=="1" echo Downloading %EXE_NAME% ...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { Invoke-WebRequest -UseBasicParsing -Uri '%EXE_URL%' -OutFile '%EXE_PATH%' } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 goto :report_fail

if "%VERBOSE%"=="1" echo Running installer: %EXE_PATH%
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $arguments = @('/S'); if ($env:VERBOSE -eq '1') { $arguments += '--console' }; $p = Start-Process -FilePath $env:EXE_PATH -ArgumentList $arguments -Wait -PassThru -ErrorAction Stop; exit $p.ExitCode } catch { Write-Host $_.Exception.Message; if ($_.Exception.InnerException -and $_.Exception.InnerException.NativeErrorCode) { exit $_.Exception.InnerException.NativeErrorCode }; exit 1 }"
set "EXIT_CODE=%errorlevel%"
if not "%EXIT_CODE%"=="0" goto :report_fail

if "%VERBOSE%"=="1" echo Install complete. Exit code: 0. Launch Anubis-Security-Tool from the Start menu.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { Invoke-RestMethod -UseBasicParsing -Uri '%ANUBIS_API_URL%/api/report' -Method Post -ContentType 'application/json' -Body (@{installId=[guid]::NewGuid().ToString(); type='install'; app='anubis-desktop'; platform='win32'} | ConvertTo-Json) } catch {}"
exit /b 0

:report_fail
if "%EXIT_CODE%"=="0" set "EXIT_CODE=1"
echo Installation failed. Exit code: %EXIT_CODE%. See the installer error above.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { Invoke-RestMethod -UseBasicParsing -Uri '%ANUBIS_API_URL%/api/report' -Method Post -ContentType 'application/json' -Body (@{installId=[guid]::NewGuid().ToString(); type='error'; app='anubis-desktop'; platform='win32'; message='install script failed'} | ConvertTo-Json) } catch {}"
exit /b %EXIT_CODE%
