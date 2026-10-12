# ETHERFALL - servidor + link publico gratuito (Cloudflare Quick Tunnel), Windows.
# Chamado por iniciar-online.bat. Os amigos jogam de qualquer lugar pelo link https mostrado.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
$port = if ($env:PORT) { $env:PORT } else { '8080' }

function Fail($msg) {
  Write-Host ''
  Write-Host "  ERRO: $msg" -ForegroundColor Red
  Read-Host '  Enter para sair'
  exit 1
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Fail 'Instale o Node.js 20 ou mais novo: https://nodejs.org' }
if (-not (Test-Path 'node_modules')) {
  npm install
  if ($LASTEXITCODE -ne 0) { Fail 'npm install falhou.' }
}
npm run build
if ($LASTEXITCODE -ne 0) { Fail 'A compilacao falhou.' }

# cloudflared: usa o instalado no sistema ou baixa uma copia para tools\ (uma vez so)
$cf = $null
$cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
if ($cmd) { $cf = $cmd.Source }
if (-not $cf) {
  $cf = Join-Path $root 'tools\cloudflared.exe'
  if (-not (Test-Path $cf)) {
    Write-Host '  Baixando cloudflared (Cloudflare Tunnel, gratuito)...'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $arch = if ([Environment]::Is64BitOperatingSystem) { 'amd64' } else { '386' }
    try {
      Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-$arch.exe" -OutFile $cf
    } catch { Fail "Nao consegui baixar o cloudflared: $($_.Exception.Message)" }
  }
}

# abre o tunel e espera o endereco https://xxxx.trycloudflare.com aparecer no log
$log = Join-Path $env:TEMP 'etherfall-tunnel.log'
$out = Join-Path $env:TEMP 'etherfall-tunnel.out'
Remove-Item $log, $out -ErrorAction SilentlyContinue
$tunnel = Start-Process -FilePath $cf -ArgumentList @('tunnel', '--no-autoupdate', '--url', "http://localhost:$port") `
  -RedirectStandardError $log -RedirectStandardOutput $out -NoNewWindow -PassThru
$url = $null
for ($i = 0; $i -lt 60 -and -not $url; $i++) {
  Start-Sleep -Seconds 1
  if ($tunnel.HasExited) { break }
  if (Test-Path $log) {
    $m = Select-String -Path $log -Pattern 'https://[a-z0-9]+(-[a-z0-9]+)+\.trycloudflare\.com' | Select-Object -First 1
    if ($m) { $url = $m.Matches[0].Value }
  }
}
if (-not $url) {
  if (-not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -ErrorAction SilentlyContinue }
  Fail "O tunel nao respondeu. Veja $log (internet bloqueada ou firewall?)."
}
try { Set-Clipboard -Value $url } catch { }

Write-Host ''
Write-Host '  =====================================================' -ForegroundColor DarkGray
Write-Host '   ETHERFALL ONLINE - passe este link para os amigos:' -ForegroundColor Gray
Write-Host ''
Write-Host "     $url" -ForegroundColor Green
Write-Host ''
Write-Host '   (ja copiado para a area de transferencia)' -ForegroundColor DarkGray
Write-Host '   O link muda toda vez que voce reinicia este script.' -ForegroundColor DarkGray
Write-Host '   Feche esta janela ou Ctrl+C para desligar (salva tudo).' -ForegroundColor DarkGray
Write-Host '  =====================================================' -ForegroundColor DarkGray
Write-Host ''

# o servidor confia no tunel local para saber o IP real de cada jogador
$env:ETHERFALL_TRUST_PROXY = '1'
$env:ETHERFALL_PUBLIC_URL = $url
$env:PORT = $port
try {
  node packages\server\dist\server.mjs
} finally {
  if (-not $tunnel.HasExited) { Stop-Process -Id $tunnel.Id -ErrorAction SilentlyContinue }
}
