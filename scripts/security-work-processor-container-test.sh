#!/usr/bin/env bash
# Tests an already built local image; never pulls on run, publishes, or deploys.
set -euo pipefail
umask 077
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root_dir="$(cd "$script_dir/.." && pwd)"
docker_bin="${SW_PROCESSOR_DOCKER_BIN:-docker}"
image_name="${1:-sw-processor:local}"
fixture_dir="$(mktemp -d "${TMPDIR:-/tmp}/sw-processor-container.XXXXXX")"
fixture_pid=""
container_id=""
cleanup() {
  if [[ -n "$fixture_pid" ]]; then kill -TERM "$fixture_pid" 2>/dev/null || true; wait "$fixture_pid" 2>/dev/null || true; fi
  if [[ -n "$container_id" ]]; then "$docker_bin" stop --time 20 "$container_id" >/dev/null 2>&1 || true; fi
  rm -rf "$fixture_dir"
  rm -f "$fixture_dir.bootstrap.log"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
export SW_PROCESSOR_AUTH_TOKEN="$(openssl rand -hex 32)"
container_id="$("$docker_bin" run --detach --rm --pull=never --platform linux/amd64 --read-only --cap-drop=ALL --security-opt=no-new-privileges --memory=1g --cpus=2 --pids-limit=64 --env SW_PROCESSOR_AUTH_TOKEN --publish 127.0.0.1::8789 "$image_name")"
http_port="$("$docker_bin" port "$container_id" 8789/tcp | sed -n 's/^127\.0\.0\.1://p')"
if [[ ! "$http_port" =~ ^[0-9]+$ ]]; then printf 'Invalid owned container port.\n' >&2; exit 1; fi
cd "$root_dir"
SW_PROCESSOR_TEST_AUTH_TOKEN="$SW_PROCESSOR_AUTH_TOKEN" bun run scripts/security-work-processor-local.ts "$fixture_dir" "--upstream-http-port=$http_port" >"$fixture_dir.bootstrap.log" 2>&1 &
fixture_pid=$!
for attempt in $(seq 1 400); do
  if [[ -f "$fixture_dir/ready.json" ]]; then break; fi
  if ! kill -0 "$fixture_pid" 2>/dev/null; then cat "$fixture_dir.bootstrap.log"; "$docker_bin" logs "$container_id"; exit 1; fi
  sleep 0.1
done
if [[ ! -f "$fixture_dir/ready.json" ]]; then cat "$fixture_dir.bootstrap.log"; printf 'Container fixture did not become ready.\n' >&2; exit 1; fi
# shellcheck source=/dev/null
source "$fixture_dir/app.env"
bun build scripts/security-work-processor-http-check.ts --target=node --outfile="$fixture_dir/http-check.mjs"
node "$fixture_dir/http-check.mjs"
"$docker_bin" exec "$container_id" node /app/verify.mjs
SW_WORKER_KEY_ID=synthetic-probe SW_WORKER_SECRET=synthetic-probe-receipt-secret-00000000 node "$fixture_dir/artifact/config-check.mjs" --probe
health_status=""
health_deadline=$((SECONDS + 100))
while (( SECONDS < health_deadline )); do
  health_status="$("$docker_bin" inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$container_id")"
  if [[ "$health_status" == "healthy" ]]; then break; fi
  if [[ "$health_status" == "unhealthy" ]]; then break; fi
  sleep 0.5
done
if [[ "$health_status" != "healthy" ]]; then
  "$docker_bin" inspect --format '{{json .State.Health}}' "$container_id"
  "$docker_bin" logs "$container_id"
  printf 'Container healthcheck failed.\n' >&2
  exit 1
fi
printf 'Docker scheduled healthcheck: healthy.\n'
printf 'Actual pinned Linux container and application TLS transport passed. No external deployment.\n'
