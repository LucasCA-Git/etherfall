@echo off
REM ETHERFALL - inicia o servidor online (Windows). Os amigos na mesma rede entram pelo endereco mostrado.
cd /d "%~dp0"
where node >nul 2>nul || (echo Instale o Node.js 20 ou mais novo: https://nodejs.org & pause & exit /b 1)
if not exist node_modules call npm install
call npm run build || (pause & exit /b 1)
node packages\server\dist\server.mjs
pause
