#!/usr/bin/env bash
# PostgREST from a container image, with the configuration up.sh writes.
#
# up.sh expects a PostgREST binary (POSTGREST_BIN). Where none is installed,
# point POSTGREST_BIN at this script: it runs the image on the same Docker
# network as the database container that test-env.sh starts, translating the
# loopback database address in the configuration to that container's name.
set -euo pipefail
conf="$1"
image="${POSTGREST_IMAGE:-public.ecr.aws/supabase/postgrest:v16.2}"
network="${LOCAL_DOCKER_NETWORK:-beskt-e2e-net}"
db_host="${LOCAL_DB_CONTAINER:-beskt-e2e-pg}"
uri=$(sed -n 's/^db-uri = "\(.*\)"/\1/p' "$conf" | sed "s/127\.0\.0\.1:5432/${db_host}:5432/")
secret=$(sed -n 's/^jwt-secret = "\(.*\)"/\1/p' "$conf")
port=$(sed -n 's/^server-port = \(.*\)/\1/p' "$conf")
docker rm -f beskt-e2e-postgrest > /dev/null 2>&1 || true
trap 'docker rm -f beskt-e2e-postgrest > /dev/null 2>&1' EXIT TERM INT
docker run --rm --name beskt-e2e-postgrest --network "$network" -p "127.0.0.1:${port}:3000" \
  -e PGRST_DB_URI="$uri" -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_DB_EXTRA_SEARCH_PATH="public, extensions" -e PGRST_JWT_SECRET="$secret" \
  -e PGRST_SERVER_HOST="*" -e PGRST_SERVER_PORT=3000 \
  "$image" &
wait $!
