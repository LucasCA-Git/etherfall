@echo off
REM ETHERFALL - servidor + link publico gratuito (Cloudflare Tunnel). Amigos de qualquer lugar entram pelo link https.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\iniciar-online.ps1"
pause
