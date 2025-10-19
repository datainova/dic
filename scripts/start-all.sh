#!/usr/bin/env bash
set -euo pipefail

# Start-all script for DIC monorepo
# - installs dependencies if missing
# - attempts to start Redis (if redis-server exists)
# - starts backend, frontend and worker in background, with logs in ./logs
# - checks backend health endpoint
# Usage: ./scripts/start-all.sh [--no-install] [--no-redis]

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs"
mkdir -p "$LOG_DIR"

NO_INSTALL=0
NO_REDIS=0
NO_WORKER=0
while [[ ${1:-} != "" ]]; do
  case "$1" in
    --no-install) NO_INSTALL=1; shift ;;
    --no-redis) NO_REDIS=1; shift ;;
    --no-worker) NO_WORKER=1; shift ;;
    -h|--help)
      echo "Usage: $0 [--no-install] [--no-redis] [--no-worker]"
      exit 0
      ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

PIDS=()
REDIS_PID=0

function cleanup() {
  echo "Stopping processes..."
  for pid in "${PIDS[@]:-}"; do
    if [[ -n "$pid" && -e /proc/$pid || "$(ps -p $pid -o pid= 2>/dev/null)" ]]; then
      echo "Killing $pid"
      kill "$pid" 2>/dev/null || true
    fi
  done
  if [[ $REDIS_PID -ne 0 ]]; then
    echo "Stopping redis (pid $REDIS_PID)"
    kill "$REDIS_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT

function ensure_cmd() {
  command -v "$1" >/dev/null 2>&1 || { echo "$1 is required but not installed. Aborting."; exit 1; }
}

ensure_cmd git
ensure_cmd node
ensure_cmd npm

if [[ $NO_INSTALL -eq 0 ]]; then
  echo "Installing dependencies if missing..."
  for d in frontend backend worker; do
    echo "-> $d"
    pushd "$ROOT_DIR/$d" >/dev/null
    if [[ ! -d node_modules ]]; then
      npm install
    else
      echo "  node_modules exists, skipping install for $d"
    fi
    popd >/dev/null
  done
else
  echo "Skipping install (--no-install)"
fi

if [[ $NO_REDIS -eq 0 ]]; then
  if command -v redis-cli >/dev/null 2>&1; then
    if redis-cli ping >/dev/null 2>&1; then
      echo "Redis running locally"
    else
      if command -v redis-server >/dev/null 2>&1; then
        echo "Starting redis-server in background..."
        redis-server --port 6379 --protected-mode no > "$LOG_DIR/redis.log" 2>&1 &
        REDIS_PID=$!
        sleep 0.5
        echo "redis-server pid: $REDIS_PID"
      else
        echo "redis-server not found; skipping Redis start."
        echo "Worker will be skipped (no Redis available)."
        NO_WORKER=1
      fi
    fi
  else
    echo "redis-cli not found; skipping Redis check/start. Use --no-redis to suppress this message."
    echo "Worker will be skipped (no Redis available)."
    NO_WORKER=1
  fi
else
  echo "Skipping redis start (--no-redis)"
fi

echo "Starting services (logs -> $LOG_DIR)"

# Start backend
pushd "$ROOT_DIR/backend" >/dev/null
echo "Starting backend... (logs: $LOG_DIR/backend.log)"
npm run dev > "$LOG_DIR/backend.log" 2>&1 &
PIDS+=($!)
popd >/dev/null

# Start frontend
pushd "$ROOT_DIR/frontend" >/dev/null
echo "Starting frontend... (logs: $LOG_DIR/frontend.log)"
npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
PIDS+=($!)
popd >/dev/null

if [[ $NO_WORKER -eq 0 ]]; then
  pushd "$ROOT_DIR/worker" >/dev/null
  echo "Starting worker... (logs: $LOG_DIR/worker.log)"
  npm run dev > "$LOG_DIR/worker.log" 2>&1 &
  PIDS+=($!)
  popd >/dev/null
else
  echo "Skipping worker start (NO_WORKER=$NO_WORKER)"
fi

echo "Waiting 2s for services to initialize..."
sleep 2

echo "Backend health check (http://localhost:4000/health)"
if command -v curl >/dev/null 2>&1; then
  if curl -sS http://localhost:4000/health | grep -q "ok"; then
    echo "Backend healthy"
  else
    echo "Backend did not respond with OK. See $LOG_DIR/backend.log"
    tail -n 80 "$LOG_DIR/backend.log" || true
  fi
else
  echo "curl not available to check health; please check http://localhost:4000/health manually"
fi

echo "Tailing logs (press Ctrl+C to stop and cleanup)..."
echo "Backend log: $LOG_DIR/backend.log"
echo "Frontend log: $LOG_DIR/frontend.log"
[[ $NO_WORKER -eq 0 ]] && echo "Worker log: $LOG_DIR/worker.log" || echo "Worker skipped"

# Follow logs interactively
if [[ $NO_WORKER -eq 0 ]]; then
  tail -n 200 -f "$LOG_DIR/backend.log" "$LOG_DIR/frontend.log" "$LOG_DIR/worker.log"
else
  tail -n 200 -f "$LOG_DIR/backend.log" "$LOG_DIR/frontend.log"
fi
