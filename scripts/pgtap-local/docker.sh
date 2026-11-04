#!/bin/bash
# The package pgTAP suites on a throwaway Postgres 17 with pgTAP, in Docker: what CI runs.
#   scripts/pgtap-local/docker.sh [suite …]
set -u
root=$(cd "$(dirname "$0")/../.." && pwd)
name="genesis-pgtap-$(basename "$root" | tr -cd 'a-zA-Z0-9')"
docker rm -f "$name" >/dev/null 2>&1
docker run -d --name "$name" -e POSTGRES_HOST_AUTH_METHOD=trust -v "$root:/repo:ro" postgres:17 >/dev/null || exit 1
trap 'docker rm -f "$name" >/dev/null 2>&1' EXIT
for _ in $(seq 1 60); do
  docker exec "$name" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$name" bash -c 'apt-get update -qq && apt-get install -y -qq postgresql-17-pgtap libtap-parser-sourcehandler-pgtap-perl >/dev/null' || exit 1
docker exec "$name" bash /repo/scripts/pgtap-local/suites.sh "$@"
