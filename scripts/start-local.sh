#!/usr/bin/env bash
set -euo pipefail

# Start frontend and backend dev servers with health checks.
# Usage: ./scripts/start-local.sh

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs"
mkdir -p "$LOG_DIR"

BACKEND_PORT="${BACKEND_PORT:-${PORT:-4000}}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

BACKEND_LOG="$LOG_DIR/backend.dev.log"
FRONTEND_LOG="$LOG_DIR/frontend.dev.log"

PIDS=()

cleanup() {
  local exit_code=$?
  trap - EXIT
  if [[ ${#PIDS[@]} -gt 0 ]]; then
    echo "Stopping dev servers..."
    for pid in "${PIDS[@]}"; do
      if [[ -n "$pid" && ( -e "/proc/$pid" || "$(ps -p "$pid" -o pid= 2>/dev/null)" != "" ) ]]; then
        kill "$pid" 2>/dev/null || true
      fi
    done
  fi
  exit "$exit_code"
}

trap cleanup EXIT INT

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: $cmd is required but not available in PATH."
    exit 1
  fi
}

require_cmd npm
require_cmd curl
require_cmd grep

start_service() {
  local name="$1"
  local prefix_dir="$2"
  local log_file="$3"

  echo "Starting $name dev server (logs -> $log_file)"
  (cd "$prefix_dir" && npm run dev) >"$log_file" 2>&1 &
  local pid=$!
  PIDS+=("$pid")
}

wait_for_url() {
  local name="$1"
  local url="$2"
  local log_file="$3"
  local attempts="${4:-60}"
  local delay_seconds="${5:-1}"

  echo "Waiting for $name at $url"
  for ((i = 1; i <= attempts; i++)); do
    if curl -fsS "$url" >/dev/null; then
      echo "$name is ready (attempt $i)"
      return 0
    fi

    if [[ ${#PIDS[@]} -gt 0 ]]; then
      for pid in "${PIDS[@]}"; do
        if ! kill -0 "$pid" 2>/dev/null; then
          echo "Process $pid for $name has exited unexpectedly."
          if [[ -f "$log_file" ]]; then
            echo "---- Last 80 lines of $log_file ----"
            tail -n 80 "$log_file" || true
            echo "-------------------------------------"
          fi
          exit 1
        fi
      done
    fi

    sleep "$delay_seconds"
  done

  echo "Timed out waiting for $name at $url"
  if [[ -f "$log_file" ]]; then
    echo "---- Last 80 lines of $log_file ----"
    tail -n 80 "$log_file" || true
    echo "-------------------------------------"
  fi
  exit 1
}

detect_frontend_url() {
  local log_file="$1"
  local attempts="${2:-30}"
  local delay_seconds="${3:-1}"

  for ((i = 1; i <= attempts; i++)); do
    if [[ -f "$log_file" ]]; then
      local url
      url=$(grep -Eo 'http://(localhost|127\.0\.0\.1):[0-9]+' "$log_file" | tail -n 1 || true)
      if [[ -n "$url" ]]; then
        echo "$url"
        return 0
      fi
    fi
    sleep "$delay_seconds"
  done
  return 1
}

start_service "backend" "$ROOT_DIR/backend" "$BACKEND_LOG"
wait_for_url "backend" "http://127.0.0.1:${BACKEND_PORT}/health" "$BACKEND_LOG"

start_service "frontend" "$ROOT_DIR/frontend" "$FRONTEND_LOG"
FRONTEND_TARGET_URL="http://127.0.0.1:${FRONTEND_PORT}"
if detected_url=$(detect_frontend_url "$FRONTEND_LOG"); then
  FRONTEND_TARGET_URL="${detected_url%/}"
  echo "Detected frontend URL: $FRONTEND_TARGET_URL"
else
  echo "Using default frontend URL: $FRONTEND_TARGET_URL"
fi
wait_for_url "frontend" "$FRONTEND_TARGET_URL" "$FRONTEND_LOG"

echo ""
echo "Both frontend and backend are running."
echo "Backend: http://127.0.0.1:${BACKEND_PORT}/health"
echo "Frontend: $FRONTEND_TARGET_URL"
echo ""
echo "Press Ctrl+C to stop both servers. Tail of logs follows."

tail -n 100 -f "$BACKEND_LOG" "$FRONTEND_LOG"
