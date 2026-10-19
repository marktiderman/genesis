#!/usr/bin/env bash
# Run a command against a throwaway Postgres for the studio-server integration
# tests: `pnpm test:db`. Starts (or reuses) a Docker container on port 59432,
# outside the 543xx/553xx/557xx/564xx-565xx ranges other local stacks use.
# CI sets STUDIO_TEST_DATABASE_URL itself and skips this script.
set -euo pipefail

NAME="${STUDIO_TEST_PG_NAME:-genesis-studio-test-pg}"
PORT="${STUDIO_TEST_PG_PORT:-59432}"
IMAGE="${STUDIO_TEST_PG_IMAGE:-postgres:17-alpine}"

if ! docker ps --format '{{.Names}}' | grep -qx "$NAME"; then
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  docker run -d --name "$NAME" -p "127.0.0.1:${PORT}:5432" \
    -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null
fi

for _ in $(seq 1 60); do
  if docker exec "$NAME" pg_isready -U postgres >/dev/null 2>&1; then break; fi
  sleep 1
done

export STUDIO_TEST_DATABASE_URL="postgres://postgres:postgres@127.0.0.1:${PORT}/postgres"
exec "$@"
