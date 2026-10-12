#!/usr/bin/env sh
# ETHERFALL - servidor + link publico gratuito (Cloudflare Quick Tunnel), Linux/macOS.
set -e
cd "$(dirname "$0")"
PORT="${PORT:-8080}"
[ -d node_modules ] || npm install
npm run build

CF="$(command -v cloudflared || true)"
if [ -z "$CF" ]; then
  CF="./tools/cloudflared"
  if [ ! -x "$CF" ]; then
    case "$(uname -s)-$(uname -m)" in
      Linux-x86_64) ASSET=cloudflared-linux-amd64 ;;
      Linux-aarch64|Linux-arm64) ASSET=cloudflared-linux-arm64 ;;
      *) echo "Instale o cloudflared (macOS: brew install cloudflared) e rode de novo."; exit 1 ;;
    esac
    echo "  Baixando cloudflared (Cloudflare Tunnel, gratuito)..."
    curl -fsSL -o "$CF" "https://github.com/cloudflare/cloudflared/releases/latest/download/$ASSET"
    chmod +x "$CF"
  fi
fi

LOG="${TMPDIR:-/tmp}/etherfall-tunnel.log"
: > "$LOG"
"$CF" tunnel --no-autoupdate --url "http://localhost:$PORT" > "$LOG" 2>&1 &
TUNNEL=$!
trap 'kill $TUNNEL 2>/dev/null || true' EXIT INT TERM
URL=""
i=0
while [ $i -lt 60 ] && [ -z "$URL" ]; do
  sleep 1
  URL="$(grep -oE 'https://[a-z0-9]+(-[a-z0-9]+)+\.trycloudflare\.com' "$LOG" | head -n 1 || true)"
  i=$((i + 1))
done
if [ -z "$URL" ]; then echo "  O tunel nao respondeu. Veja $LOG"; exit 1; fi

echo ""
echo "  ====================================================="
echo "   ETHERFALL ONLINE - passe este link para os amigos:"
echo ""
echo "     $URL"
echo ""
echo "   O link muda toda vez que voce reinicia este script."
echo "   Ctrl+C para desligar (salva tudo)."
echo "  ====================================================="
echo ""
ETHERFALL_TRUST_PROXY=1 ETHERFALL_PUBLIC_URL="$URL" PORT="$PORT" node packages/server/dist/server.mjs
