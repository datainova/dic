#!/usr/bin/env bash
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "Starting local pgvector (docker-compose) on port 5433..."
docker compose up -d vectordb

echo "Waiting for vector DB to be healthy..."
for i in {1..30}; do
  if docker inspect -f '{{.State.Health.Status}}' dic-vectordb 2>/dev/null | grep -q healthy; then
    echo "Vector DB is healthy"
    exit 0
  fi
  sleep 1
done
echo "Vector DB did not become healthy in time. Check: docker logs dic-vectordb"
exit 1

