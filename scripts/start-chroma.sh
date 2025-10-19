#!/usr/bin/env bash
set -euo pipefail

echo "Starting local Chroma DB (docker-compose) on port 8000..."
docker compose up -d chroma

echo "Waiting for Chroma to be healthy..."
for i in {1..40}; do
  status=$(docker inspect -f '{{.State.Health.Status}}' dic-chroma 2>/dev/null || echo "")
  if [[ "$status" == "healthy" ]]; then
    echo "Chroma is healthy"
    exit 0
  fi
  sleep 1
done
echo "Chroma did not become healthy in time. Check: docker logs dic-chroma"
exit 1

