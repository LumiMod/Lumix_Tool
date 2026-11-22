@echo off
chcp 65001 >nul
set "ELECTRON_RUN_AS_NODE="
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo [错误] 还没有安装依赖，请在当前目录运行:
  echo     npm install
  pause
  exit /b 1
)
start "" "node_modules\electron\dist\electron.exe" .
