#!/usr/bin/env bash
# Start VoxSafe locally (API + Vite) and wait until both answer.
#
#   ./scripts/dev.sh            # API :8000, web :5174
#   API_PORT=8010 ./scripts/dev.sh
#
# Logs: backend/var/api.log and frontend/vite.log. PIDs: backend/var/*.pid
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
API_PORT="${API_PORT:-8000}"
WEB_PORT="${WEB_PORT:-5174}"
VENV="$ROOT/backend/.venv/bin"
mkdir -p backend/var frontend

if [ ! -x "$VENV/uvicorn" ]; then
  echo "Missing $VENV/uvicorn — create the venv first:"
  echo "  python3.12 -m venv backend/.venv"
  echo "  backend/.venv/bin/pip install -r backend/requirements-dev.txt"
  exit 1
fi

if [ ! -d frontend/node_modules ]; then
  echo "Installing frontend dependencies (npm ci)…"
  (cd frontend && npm ci)
fi

echo "Applying schema, seeded policy and model record…"
PYTHONPATH="backend:$ROOT:$ROOT/ml" "$VENV/python" -m app.cli init

if ! curl -sf "http://127.0.0.1:$API_PORT/v1/health" >/dev/null 2>&1; then
  echo "Starting API on :$API_PORT"
  PYTHONPATH="backend:$ROOT:$ROOT/ml" nohup "$VENV/uvicorn" app.main:app \
    --app-dir backend --host 127.0.0.1 --port "$API_PORT" \
    >> backend/var/api.log 2>&1 &
  echo $! > backend/var/api.pid
else
  echo "API already answering on :$API_PORT (leaving it alone)"
fi

if ! curl -sf "http://127.0.0.1:$WEB_PORT/" >/dev/null 2>&1; then
  echo "Starting web on :$WEB_PORT"
  (cd frontend && nohup npm run dev -- --host 127.0.0.1 --port "$WEB_PORT" \
    > vite.log 2>&1 & echo $! > "$ROOT/backend/var/web.pid")
else
  echo "Web already answering on :$WEB_PORT (leaving it alone)"
fi

for _ in $(seq 1 40); do
  api_ok=$(curl -sf -o /dev/null -w '%{http_code}' "http://127.0.0.1:$API_PORT/v1/health" || true)
  web_ok=$(curl -sf -o /dev/null -w '%{http_code}' "http://127.0.0.1:$WEB_PORT/" || true)
  if [ "$api_ok" = "200" ] && [ "$web_ok" = "200" ]; then
    echo "API  http://127.0.0.1:$API_PORT/v1/docs"
    echo "Web  http://127.0.0.1:$WEB_PORT/"
    exit 0
  fi
  sleep 0.5
done

echo "Startup did not become ready in time." >&2
tail -n 30 backend/var/api.log frontend/vite.log 2>/dev/null || true
exit 1
