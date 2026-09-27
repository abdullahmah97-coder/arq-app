@echo off
rem ============================================================
rem  ARQ - first iPhone build (run once on Windows)
rem  Installs Node.js + Git if missing, downloads the app from GitHub,
rem  links it to Expo, connects Apple (you type your Apple ID + code),
rem  builds in the Expo cloud and sends it to TestFlight.
rem ============================================================
setlocal EnableExtensions
title ARQ - first iPhone build
rem Node.js and Git go into your user folder (no admin prompt needed)
set "TOOLS=%LOCALAPPDATA%\ARQ\tools"
set "PATH=%TOOLS%\node;%TOOLS%\git\cmd;%ProgramFiles%\nodejs;%ProgramFiles%\Git\cmd;%APPDATA%\npm;%PATH%"

echo.
echo  ARQ - first iPhone build
echo  ------------------------
echo  Keep this window open. It takes about 30 minutes in total.
echo.

where node >nul 2>nul
if not errorlevel 1 goto :havenode
echo [1/6] Downloading Node.js - no admin prompt needed...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $t=$env:LOCALAPPDATA+'\ARQ\tools'; New-Item -ItemType Directory -Force $t | Out-Null; $j=Invoke-RestMethod 'https://nodejs.org/dist/index.json'; $v=[string]($j | Where-Object { $_.lts } | Select-Object -First 1).version; if ($v -notmatch '^v[0-9]+[.][0-9]+[.][0-9]+$') { throw ('Could not find the Node.js version: '+$v) }; Write-Host ('     Node.js '+$v); $z=$env:TEMP+'\arq-node.zip'; Invoke-WebRequest ('https://nodejs.org/dist/'+$v+'/node-'+$v+'-win-x64.zip') -OutFile $z -UseBasicParsing; $x=$env:TEMP+'\arq-node'; Remove-Item $x -Recurse -Force -ErrorAction SilentlyContinue; Expand-Archive $z $x -Force; Remove-Item ($t+'\node') -Recurse -Force -ErrorAction SilentlyContinue; Move-Item ($x+'\node-'+$v+'-win-x64') ($t+'\node')"
if errorlevel 1 goto :fail
:havenode
where git >nul 2>nul
if not errorlevel 1 goto :havegit
echo [1/6] Downloading Git - no admin prompt needed...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; $ProgressPreference='SilentlyContinue'; [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12; $t=$env:LOCALAPPDATA+'\ARQ\tools'; New-Item -ItemType Directory -Force $t | Out-Null; $r=Invoke-RestMethod 'https://api.github.com/repos/git-for-windows/git/releases/latest' -Headers @{'User-Agent'='arq-setup'}; $as=$r.assets; $a=$as | Where-Object { $_.name -match '^MinGit-[0-9.]+-64-bit[.]zip$' } | Select-Object -First 1; if (-not $a) { throw 'Could not find the Git download' }; Write-Host ('     '+$a.name); $z=$env:TEMP+'\arq-git.zip'; Invoke-WebRequest $a.browser_download_url -OutFile $z -UseBasicParsing; Remove-Item ($t+'\git') -Recurse -Force -ErrorAction SilentlyContinue; Expand-Archive $z ($t+'\git') -Force"
if errorlevel 1 goto :fail
:havegit
where node >nul 2>nul
if errorlevel 1 goto :fail
where git >nul 2>nul
if errorlevel 1 goto :fail
echo      Node.js and Git are ready.

set "APPDIR=%USERPROFILE%\arq-app"
if exist "%APPDIR%\.git" (
  echo [2/6] Updating the app code...
  git -C "%APPDIR%" pull --ff-only
) else (
  echo [2/6] Downloading the app code from GitHub - sign in to GitHub if a window opens...
  git clone https://github.com/abdullahmah97-coder/arq-app "%APPDIR%"
)
if not exist "%APPDIR%\package.json" goto :fail
cd /d "%APPDIR%"

echo [3/6] Installing packages - this takes a few minutes...
call npm ci --no-audit --no-fund
if errorlevel 1 goto :fail

echo.
echo [4/6] Expo account...
call npx -y eas-cli@latest whoami >nul 2>nul
if not errorlevel 1 (
  echo      Already logged in to Expo.
  goto :init
)
echo      A browser window will open - sign in to Expo with GitHub, then come back here.
call npx -y eas-cli@latest login
if errorlevel 1 goto :fail
:init
findstr /C:"projectId" app.json >nul 2>nul
if not errorlevel 1 goto :keys
echo      If asked to create a project for this app, answer Y.
call npx -y eas-cli@latest init
if errorlevel 1 goto :fail
:keys
echo.
echo [5/6] Supabase keys...
findstr /C:"EXPO_PUBLIC_SUPABASE_URL" eas.json >nul 2>nul
if not errorlevel 1 (
  echo      Already saved in the app - skipping.
  goto :build
)
echo      Open supabase.com, your project, Project Settings, API.
set "SB_URL="
set "SB_KEY="
set /p SB_URL=     Paste the Project URL and press Enter: 
set /p SB_KEY=     Paste the anon public key and press Enter: 
if "%SB_URL%"=="" goto :fail
if "%SB_KEY%"=="" goto :fail
node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync('eas.json','utf8'));for(const p of Object.keys(j.build)){if(p==='base')continue;j.build[p].env=Object.assign({},j.build[p].env,{EXPO_PUBLIC_SUPABASE_URL:process.env.SB_URL.trim(),EXPO_PUBLIC_SUPABASE_ANON_KEY:process.env.SB_KEY.trim()});}fs.writeFileSync('eas.json',JSON.stringify(j,null,2)+'\n')"
if errorlevel 1 goto :fail

:build
echo.
echo [6/6] Building for iPhone and sending to TestFlight.
echo      - When asked to log in to your Apple account, answer Y.
echo      - Type your Apple ID email and password, then the 6-digit code from your iPhone.
echo      - For certificate and provisioning profile questions, press Enter to accept - Yes.
echo      - If asked about push notifications, answer Y.
echo.
call npx -y eas-cli@latest build --platform ios --profile beta --auto-submit
if errorlevel 1 goto :fail

echo.
echo ============================================================
echo  Done. The build is uploading to TestFlight.
echo  Send Claude this Project ID:
node -e "try{console.log('  '+require('./app.json').expo.extra.eas.projectId)}catch(e){console.log('  (not found)')}"
echo ============================================================
pause
exit /b 0

:restart
echo.
echo Node.js / Git were just installed. Close this window and double-click the file again.
pause
exit /b 0

:fail
echo.
echo Something went wrong. Take a screenshot of this window and send it to Claude.
pause
exit /b 1
