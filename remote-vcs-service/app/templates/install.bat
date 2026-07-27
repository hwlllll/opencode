@echo off
setlocal EnableExtensions EnableDelayedExpansion

set "DOWNLOAD=__DOWNLOAD_BASE_URL__"
set "BASE=__DICODE_BASE_URL__"
if "%DOWNLOAD:~-1%"=="/" set "DOWNLOAD=%DOWNLOAD:~0,-1%"
if "%BASE:~-1%"=="/" set "BASE=%BASE:~0,-1%"
if not defined DICODE_INSTALL_DIR set "DICODE_INSTALL_DIR=%USERPROFILE%\.dicode\bin"
set "VERSION=%VERSION%"
set "MODIFY_PATH=1"

:args
if "%~1"=="" goto detect
if /I "%~1"=="-h" goto help
if /I "%~1"=="--help" goto help
if /I "%~1"=="--no-modify-path" (
  set "MODIFY_PATH=0"
  shift
  goto args
)
if /I "%~1"=="-v" goto version
if /I "%~1"=="--version" goto version
echo dicode: unknown option: %~1
exit /b 1

:version
if "%~2"=="" (
  echo dicode: --version requires a value
  exit /b 1
)
set "VERSION=%~2"
shift
shift
goto args

:help
echo Dicode Installer
echo.
echo Usage: install.bat [options]
echo.
echo   -v, --version VERSION  Install a specific version
echo       --no-modify-path   Do not update the user PATH
echo   -h, --help             Show this help
echo.
echo To update later, run: dicode upgrade
exit /b 0

:detect
set "ARCH=x64"
if /I "%PROCESSOR_ARCHITECTURE%"=="ARM64" set "ARCH=arm64"
if /I "%PROCESSOR_ARCHITEW6432%"=="ARM64" set "ARCH=arm64"
set "TARGET=dicode-windows-!ARCH!"
if /I "!ARCH!"=="x64" set "TARGET=!TARGET!-baseline"

set "TMPDIR=%TEMP%\dicode-%RANDOM%-%RANDOM%"
mkdir "!TMPDIR!" >nul 2>&1
if errorlevel 1 (
  echo dicode: failed to create temporary directory
  exit /b 1
)

if not defined VERSION (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $m=Invoke-RestMethod -Uri '!DOWNLOAD!/dicode/pkg/latest.json' -TimeoutSec 30; $m.tag_name } catch { exit 1 }" > "!TMPDIR!\version.txt"
  if errorlevel 1 goto latest_error
  set /p VERSION=<"!TMPDIR!\version.txt"
)
if "!VERSION:~0,1!"=="v" set "VERSION=!VERSION:~1!"
if not defined VERSION goto latest_error

set "ARCHIVE=!TARGET!.zip"
set "URL=!DOWNLOAD!/dicode/pkg/!VERSION!/!ARCHIVE!"
echo Installing Dicode !VERSION! for Windows/!ARCH!...

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -Uri '!URL!' -OutFile '!TMPDIR!\!ARCHIVE!' -UseBasicParsing -TimeoutSec 600; Invoke-WebRequest -Uri '!URL!.sha256' -OutFile '!TMPDIR!\!ARCHIVE!.sha256' -UseBasicParsing -TimeoutSec 30 } catch { Write-Error $_; exit 1 }"
if errorlevel 1 goto download_error

set /p EXPECTED=<"!TMPDIR!\!ARCHIVE!.sha256"
for /f "tokens=1" %%H in ("!EXPECTED!") do set "EXPECTED=%%H"
for /f "delims=" %%H in ('powershell -NoProfile -Command "(Get-FileHash -Algorithm SHA256 -LiteralPath '!TMPDIR!\!ARCHIVE!').Hash.ToLowerInvariant()"') do set "ACTUAL=%%H"
if /I not "!ACTUAL!"=="!EXPECTED!" (
  echo dicode: package checksum verification failed
  goto fail
)

mkdir "!TMPDIR!\unpack" >nul 2>&1
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Expand-Archive -LiteralPath '!TMPDIR!\!ARCHIVE!' -DestinationPath '!TMPDIR!\unpack' -Force } catch { Write-Error $_; exit 1 }"
if errorlevel 1 (
  echo dicode: failed to extract package
  goto fail
)

set "BINARY="
for /r "!TMPDIR!\unpack" %%F in (dicode.exe) do if not defined BINARY set "BINARY=%%F"
if not defined BINARY for /r "!TMPDIR!\unpack" %%F in (cs.exe) do if not defined BINARY set "BINARY=%%F"
if not defined BINARY (
  echo dicode: package does not contain dicode.exe
  goto fail
)

if not exist "!DICODE_INSTALL_DIR!" mkdir "!DICODE_INSTALL_DIR!"
if exist "!DICODE_INSTALL_DIR!\dicode.old.exe" del /q "!DICODE_INSTALL_DIR!\dicode.old.exe"
if exist "!DICODE_INSTALL_DIR!\dicode.exe" move /y "!DICODE_INSTALL_DIR!\dicode.exe" "!DICODE_INSTALL_DIR!\dicode.old.exe" >nul
copy /y "!BINARY!" "!DICODE_INSTALL_DIR!\dicode.exe" >nul
if errorlevel 1 goto restore
"!DICODE_INSTALL_DIR!\dicode.exe" --version >nul 2>&1
if errorlevel 1 goto restore
if exist "!DICODE_INSTALL_DIR!\dicode.old.exe" del /q "!DICODE_INSTALL_DIR!\dicode.old.exe"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$d=Join-Path $env:USERPROFILE '.dicode'; New-Item -ItemType Directory -Force -Path $d | Out-Null; [ordered]@{api='!BASE!';download='!DOWNLOAD!'} | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $d 'config.json')"
if errorlevel 1 goto restore

if "!MODIFY_PATH!"=="1" (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$d='!DICODE_INSTALL_DIR!'; $p=[Environment]::GetEnvironmentVariable('Path','User'); $a=$p -split ';'; if ($d -notin $a) { [Environment]::SetEnvironmentVariable('Path',(($a + $d | Where-Object { $_ }) -join ';'),'User') }; [Environment]::SetEnvironmentVariable('DICODE_BASE_URL',$null,'User'); [Environment]::SetEnvironmentVariable('DICODE_DOWNLOAD_BASE_URL',$null,'User')"
)

rmdir /s /q "!TMPDIR!" >nul 2>&1
echo Dicode !VERSION! installed at !DICODE_INSTALL_DIR!\dicode.exe
echo Open a new terminal, then run: dicode --version
echo To update later, run: dicode upgrade
exit /b 0

:restore
del /q "!DICODE_INSTALL_DIR!\dicode.exe" >nul 2>&1
if exist "!DICODE_INSTALL_DIR!\dicode.old.exe" move /y "!DICODE_INSTALL_DIR!\dicode.old.exe" "!DICODE_INSTALL_DIR!\dicode.exe" >nul
echo dicode: installed executable failed its verification check
goto fail

:latest_error
echo dicode: failed to retrieve the latest version
goto fail

:download_error
echo dicode: failed to download !URL!

:fail
rmdir /s /q "!TMPDIR!" >nul 2>&1
exit /b 1
