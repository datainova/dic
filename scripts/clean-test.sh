#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/logs"
TENANT_SLUG="${1:-datainova}"
EMAILS=("thiago.souza@outlook.com" "thiago.souza@datainova.com.br")

echo "[clean] Deletando tenant (slug=$TENANT_SLUG) e usuários de teste..."
node "$ROOT_DIR/backend/scripts/delete-tenant-by-slug.js" "$TENANT_SLUG" || true
node "$ROOT_DIR/backend/scripts/delete-by-email.js" "${EMAILS[@]}" || true

echo "[clean] Limpando injection_jobs (subject=wizard_profile)..."
node "$ROOT_DIR/backend/scripts/clean-injection-jobs.js" --tenant "$TENANT_SLUG" --subject wizard_profile || true

echo "[clean] Limpando logs locais..."
mkdir -p "$LOG_DIR"
rm -f "$LOG_DIR"/*.log "$LOG_DIR"/*.pid || true

echo "[clean] Limpando dados do Chroma (persistência local ./.data/chroma)..."
if docker ps --format '{{.Names}}' | grep -q '^dic-chroma$'; then
  docker stop dic-chroma >/dev/null 2>&1 || true
fi
rm -rf "$ROOT_DIR/.data/chroma" || true
echo "[clean] Feito. Para subir novamente: ./scripts/start-chroma.sh"

