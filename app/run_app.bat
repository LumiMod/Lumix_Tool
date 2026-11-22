@echo off
set "ELECTRON_RUN_AS_NODE="
cd /d F:\work\lumixBin\app
node_modules\electron\dist\electron.exe . --no-sandbox
echo EXIT=%ERRORLEVEL%
