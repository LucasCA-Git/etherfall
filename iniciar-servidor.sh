#!/usr/bin/env sh
# ETHERFALL - inicia o servidor online (Linux/macOS).
set -e
cd "$(dirname "$0")"
[ -d node_modules ] || npm install
npm run build
exec node packages/server/dist/server.mjs
