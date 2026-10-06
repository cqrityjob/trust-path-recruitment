#!/usr/bin/env bash
# Disposable frontend regression stack using the repository's existing local
# auth substitute and real PostgreSQL/PostgREST. No hosted credentials needed.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
for bin in docker psql bun node curl; do command -v "$bin" >/dev/null; done
task_dir="$(mktemp -d /tmp/sentinel-recovery.XXXXXX)"
db_created=0
rest_created=0
network_created=0
gateway_pid=""
app_pid=""
cleanup() {
  [ -z "$app_pid" ] || kill "$app_pid" 2>/dev/null || true
  [ -z "$gateway_pid" ] || kill "$gateway_pid" 2>/dev/null || true
  [ "$rest_created" = 0 ] || docker rm -f sentinel-recovery-rest >/dev/null
  [ "$db_created" = 0 ] || docker rm -f sentinel-recovery-db >/dev/null
  [ "$network_created" = 0 ] || docker network rm sentinel-recovery-net >/dev/null
}
trap cleanup EXIT
for name in sentinel-recovery-db sentinel-recovery-rest; do
  if docker inspect "$name" >/dev/null 2>&1; then echo "Refusing to replace existing $name" >&2; exit 1; fi
done
docker network create sentinel-recovery-net >/dev/null
network_created=1
docker run -d --name sentinel-recovery-db --network sentinel-recovery-net \
  -p 127.0.0.1:59332:5432 -e POSTGRES_PASSWORD=sentinel-local-only \
  -e POSTGRES_DB=sentinel_e2e postgres:16 >/dev/null
db_created=1
export SENTINEL_TEST_DB_URL=postgresql://postgres:sentinel-local-only@127.0.0.1:59332/sentinel_e2e
export LOCAL_DB_URL="$SENTINEL_TEST_DB_URL"
export LOCAL_JWT_SECRET=sentinel-local-evidence-secret-0123456789abcdef
export POSTGREST_URL=http://127.0.0.1:59333 GATEWAY_PORT=59331
export SENTINEL_GATEWAY_URL=http://127.0.0.1:59331
export E2E_BASE_URL=http://127.0.0.1:3137 E2E_LOCAL_STACK=1
for i in $(seq 1 60); do
  if psql "$LOCAL_DB_URL" -Atc 'SELECT 1' >/dev/null 2>&1; then break; fi
  if [ "$i" = 60 ]; then exit 1; fi
  sleep 1
done
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -q -f supabase/tests/00_bootstrap.sql >"$task_dir/bootstrap.log" 2>&1
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -q -c 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM authenticated, service_role;'
for file in supabase/migrations/*.sql; do
  psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -q -f "$file" >>"$task_dir/migrations.log" 2>&1 || { tail -30 "$task_dir/migrations.log"; exit 1; }
done
# Narrow the existing harness's database allowlist for this disposable stack.
grep -q "'beskt_e2e', 'postgres', 'scp_ci_test'" scripts/local-stack/harness.sql
sed "s/'beskt_e2e', 'postgres', 'scp_ci_test'/'sentinel_e2e'/" scripts/local-stack/harness.sql >"$task_dir/harness.sql"
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -q \
  -c "SET bcp.authenticator_password='sentinel-local-auth-only';" \
  -f "$task_dir/harness.sql" >"$task_dir/harness.log" 2>&1
bun run scripts/sentinel-content.ts --preview --output "$task_dir/synthetic.sql"
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -q -f "$task_dir/synthetic.sql"
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -q -f scripts/fixtures/sentinel-preview.sql >"$task_dir/fixture.log" 2>&1
psql "$LOCAL_DB_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
BEGIN;
SELECT set_config('request.jwt.claim.sub','ea000000-0000-0000-0000-000000000001',true);
SET LOCAL ROLE authenticated;
SELECT public.scp_assign_from_application(
 'ea000000-1111-0000-0000-000000000001','ea000000-3333-0000-0000-000000000001',
 (SELECT v.id FROM public.scp_assessment_versions v JOIN public.scp_assessment_definitions d ON d.id=v.definition_id WHERE d.slug='abstract_reasoning_v1' AND v.version_number=1));
SELECT public.scp_assign_from_application(
 'ea000000-1111-0000-0000-000000000001','ea000000-3333-0000-0000-000000000002',
 (SELECT v.id FROM public.scp_assessment_versions v JOIN public.scp_assessment_definitions d ON d.id=v.definition_id WHERE d.slug='abstract_reasoning_v1' AND v.version_number=1));
COMMIT;
SQL
docker run -d --name sentinel-recovery-rest --network sentinel-recovery-net \
  -p 127.0.0.1:59333:3000 \
  -e PGRST_DB_URI=postgresql://authenticator:sentinel-local-auth-only@sentinel-recovery-db:5432/sentinel_e2e \
  -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon -e PGRST_JWT_SECRET="$LOCAL_JWT_SECRET" \
  postgrest/postgrest:v14.15 >/dev/null
rest_created=1
node scripts/local-stack/auth-gateway.mjs >"$task_dir/gateway.log" 2>&1 &
gateway_pid=$!
# Environment overrides only; neither .env nor Supabase configuration is edited.
export SUPABASE_URL="$SENTINEL_GATEWAY_URL" VITE_SUPABASE_URL="$SENTINEL_GATEWAY_URL"
export SUPABASE_PROJECT_ID=local-sentinel VITE_SUPABASE_PROJECT_ID=local-sentinel
export PUBLIC_SITE_URL="$E2E_BASE_URL" RESEND_API_KEY=""
make_token() {
  node --input-type=module - "$1" <<'JS'
import {createHmac} from 'node:crypto';
const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url');
const p=Buffer.from(JSON.stringify({role:process.argv[2],iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+86400})).toString('base64url');
process.stdout.write(`${h}.${p}.${createHmac('sha256',process.env.LOCAL_JWT_SECRET).update(`${h}.${p}`).digest('base64url')}`);
JS
}
export SUPABASE_PUBLISHABLE_KEY="$(make_token anon)"
export VITE_SUPABASE_PUBLISHABLE_KEY="$SUPABASE_PUBLISHABLE_KEY"
export SUPABASE_SERVICE_ROLE_KEY="$(make_token service_role)"
bun run dev --host 127.0.0.1 --port 3137 >"$task_dir/app.log" 2>&1 &
app_pid=$!
for i in $(seq 1 90); do
  if curl --fail --silent "$E2E_BASE_URL/" >/dev/null && curl --fail --silent "$SENTINEL_GATEWAY_URL/rest/v1/" >/dev/null; then break; fi
  if [ "$i" = 90 ]; then tail -30 "$task_dir/app.log" "$task_dir/gateway.log"; exit 1; fi
  sleep 1
done
node scripts/local-dev-server-warmup.mjs "$E2E_BASE_URL"
bun run scripts/sentinel-session-state-check.ts
bunx playwright test e2e/sentinel-recovery.spec.ts --project=chromium --project=mobile-390
echo "Disposable Sentinel regression stack passed. Logs: $task_dir"
