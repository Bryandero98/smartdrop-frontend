#!/usr/bin/env bash
# Launches the full local SmartDrop stack in one command:
#   in-memory Redis -> smartdrop-backend (port 4000) -> smartdrop-frontend (port 3000)
#
# Usage:
#   ./scripts/dev-stack.sh
#   SMARTDROP_BACKEND_DIR=/path/to/smartdrop-backend ./scripts/dev-stack.sh
#
# Ctrl+C stops all three. Re-run any time; the admin API key is generated once
# and reused across runs from ~/.smartdrop-dev/admin-api-key.txt (handy for
# testing the /alerts page, which requires it).

set -euo pipefail

DEV_HOME="$HOME/.smartdrop-dev"
REDIS_MEM_DIR="$DEV_HOME/redis-mem"
LOG_DIR="$DEV_HOME/logs"
BACKEND_DIR="${SMARTDROP_BACKEND_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../../smartdrop-backend" 2>/dev/null && pwd || true)}"

mkdir -p "$DEV_HOME" "$LOG_DIR"

if [ -z "$BACKEND_DIR" ] || [ ! -d "$BACKEND_DIR" ]; then
  echo "error: couldn't find smartdrop-backend. Clone it as a sibling of this repo, or set SMARTDROP_BACKEND_DIR." >&2
  exit 1
fi

if [ ! -f "$DEV_HOME/admin-api-key.txt" ]; then
  openssl rand -hex 32 > "$DEV_HOME/admin-api-key.txt"
fi
ADMIN_API_KEY="$(cat "$DEV_HOME/admin-api-key.txt")"

# --- one-time bootstrap of the in-memory Redis helper ---
if [ ! -d "$REDIS_MEM_DIR/node_modules" ]; then
  echo "==> First run: installing an in-memory Redis for local dev (no system Redis/Docker needed)..."
  mkdir -p "$REDIS_MEM_DIR"
  (cd "$REDIS_MEM_DIR" && npm init -y >/dev/null 2>&1 && npm install redis-memory-server >/dev/null 2>&1)
  cat > "$REDIS_MEM_DIR/start.mjs" <<'EOF'
import { RedisMemoryServer } from "redis-memory-server";
const redisServer = new RedisMemoryServer({ instance: { port: 6379 } });
const host = await redisServer.getHost();
const port = await redisServer.getPort();
console.log(`REDIS_READY redis://${host}:${port}`);
process.stdin.resume();
for (const sig of ["SIGINT", "SIGTERM"]) {
  process.on(sig, async () => { await redisServer.stop(); process.exit(0); });
}
EOF
fi

PIDS=()
cleanup() {
  echo ""
  echo "==> Stopping stack..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# --- 1. Redis ---
if lsof -i :6379 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "==> Redis already running on :6379, reusing it."
else
  echo "==> Starting in-memory Redis on :6379..."
  (cd "$REDIS_MEM_DIR" && node start.mjs) > "$LOG_DIR/redis.log" 2>&1 &
  PIDS+=($!)
  for i in $(seq 1 30); do
    grep -q "REDIS_READY" "$LOG_DIR/redis.log" 2>/dev/null && break
    sleep 1
  done
  if ! grep -q "REDIS_READY" "$LOG_DIR/redis.log" 2>/dev/null; then
    echo "error: Redis didn't start in time. See $LOG_DIR/redis.log" >&2
    exit 1
  fi
fi

# --- 2. Backend ---
if lsof -i :4000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "==> Backend already running on :4000, reusing it."
else
  echo "==> Starting smartdrop-backend on :4000..."
  (
    cd "$BACKEND_DIR"
    PORT=4000 \
    REDIS_URL=redis://localhost:6379 \
    NODE_ENV=development \
    ADMIN_API_KEY="$ADMIN_API_KEY" \
    CORS_ALLOWED_ORIGINS="http://localhost:3000,http://localhost:3001" \
    npm run dev
  ) > "$LOG_DIR/backend.log" 2>&1 &
  PIDS+=($!)
  for i in $(seq 1 60); do
    grep -q "running on port" "$LOG_DIR/backend.log" 2>/dev/null && break
    sleep 1
  done
  if ! grep -q "running on port" "$LOG_DIR/backend.log" 2>/dev/null; then
    echo "error: backend didn't start in time. See $LOG_DIR/backend.log" >&2
    exit 1
  fi
fi

echo ""
echo "==> Redis:    redis://localhost:6379"
echo "==> Backend:  http://localhost:4000  (log: $LOG_DIR/backend.log)"
echo "==> Admin API key (for /alerts): $ADMIN_API_KEY"
echo "==> Frontend: http://localhost:3000  (starting now, Ctrl+C stops everything)"
echo ""

# --- 3. Frontend (foreground) ---
npm run dev
