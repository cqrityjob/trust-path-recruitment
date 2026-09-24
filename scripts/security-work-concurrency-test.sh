#!/usr/bin/env bash
# Real two-connection proof. Run only against the db-test.sh disposable clone.
# This file commits synthetic fixtures; the caller drops the entire clone.
set -Eeuo pipefail
case "${PGHOST:-127.0.0.1}" in
  127.0.0.1|localhost) ;;
  *) echo 'Security Work concurrency proof requires loopback PostgreSQL.' >&2; exit 2 ;;
esac
case "${PGDATABASE:-}" in
  *_sw_race) ;;
  *) echo 'Security Work concurrency proof requires a disposable *_sw_race database.' >&2; exit 2 ;;
esac

SW_LOG_DIR="$(mktemp -d "${TMPDIR:-/tmp}/sw-concurrency.XXXXXX")"
trap 'rm -rf "$SW_LOG_DIR"' EXIT
q() { psql -X -v ON_ERROR_STOP=1 -qAt "$@"; }

q <<'SQL'
INSERT INTO auth.users(id,email,email_confirmed_at)
VALUES ('52000000-0000-4000-8000-000000000001','sw-race@example.test',now());
SQL

login="SET ROLE authenticated;
SET request.jwt.claim.sub = '52000000-0000-4000-8000-000000000001';
SET request.jwt.claims = '{\"sub\":\"52000000-0000-4000-8000-000000000001\",\"role\":\"authenticated\",\"is_anonymous\":false}';"

# The first call holds the auth-user serialization lock while the second runs.
# Wait for the actual database sleep, not an assumed machine timing.
wait_for_sleep() {
  local actor="$1"
  local attempt
  for attempt in $(seq 1 100); do
    if [ "$(q -c "SELECT count(*) FROM pg_stat_activity WHERE application_name = '$actor' AND wait_event = 'PgSleep'")" = 1 ]; then
      return 0
    fi
    sleep 0.05
  done
  echo "FAIL: connection $actor did not reach its controlled lock window" >&2
  return 1
}

PGAPPNAME=sw_bootstrap_first q -c "$login BEGIN; SELECT public.sw_create_personal_workspace('Synthetic concurrency'); SELECT pg_sleep(2); COMMIT;" >"$SW_LOG_DIR/first" 2>&1 &
first_pid=$!
wait_for_sleep sw_bootstrap_first
q -c "$login SELECT public.sw_create_personal_workspace('Retry must not rename');" >"$SW_LOG_DIR/second" 2>&1
wait "$first_pid"
first_id="$(sed '/^$/d' "$SW_LOG_DIR/first")"
second_id="$(sed '/^$/d' "$SW_LOG_DIR/second")"
[ -n "$first_id" ] && [ "$first_id" = "$second_id" ] || { cat "$SW_LOG_DIR/first" "$SW_LOG_DIR/second"; exit 1; }
[ "$(q -c "SELECT count(*) FROM public.sw_workspaces WHERE owner_user_id='52000000-0000-4000-8000-000000000001' AND name='Synthetic concurrency'")" = 1 ]
echo '    ok  SWR1 concurrent onboarding creates one workspace and returns one identity'

q -c "$login" -f /dev/stdin <<'SQL'
INSERT INTO public.sw_sources(id,workspace_id,name)
SELECT '52000000-0000-4000-8000-000000000010',id,'Synthetic source'
FROM public.sw_workspaces WHERE owner_user_id=auth.uid();
INSERT INTO public.sw_source_items(id,workspace_id,source_id,deduplication_key,original_title,factual_extract)
SELECT '52000000-0000-4000-8000-000000000011',id,'52000000-0000-4000-8000-000000000010','race','Synthetic observation','Synthetic access disruption.'
FROM public.sw_workspaces WHERE owner_user_id=auth.uid();
INSERT INTO public.sw_assessments(id,workspace_id,title,professional_conclusion,likelihood,consequence)
SELECT x.id,w.id,'Synthetic assessment','Human conclusion',2,3
FROM public.sw_workspaces w CROSS JOIN (VALUES
('52000000-0000-4000-8000-000000000021'::uuid),
('52000000-0000-4000-8000-000000000022'::uuid)) x(id)
WHERE w.owner_user_id=auth.uid();
INSERT INTO public.sw_citations(id,workspace_id,source_item_id,assessment_id,claim,excerpt)
SELECT x.citation,w.id,'52000000-0000-4000-8000-000000000011',x.assessment,'Access disruption','Synthetic access disruption.'
FROM public.sw_workspaces w CROSS JOIN (VALUES
('52000000-0000-4000-8000-000000000031'::uuid,'52000000-0000-4000-8000-000000000021'::uuid),
('52000000-0000-4000-8000-000000000032'::uuid,'52000000-0000-4000-8000-000000000022'::uuid)) x(citation,assessment)
WHERE w.owner_user_id=auth.uid();
UPDATE public.sw_assessments SET status='in_review'
WHERE id IN ('52000000-0000-4000-8000-000000000021','52000000-0000-4000-8000-000000000022');
SQL

# Approval wins: concurrent citation removal must wait and then be refused.
PGAPPNAME=sw_approval_first q -c "$login BEGIN; UPDATE public.sw_assessments SET status='approved' WHERE id='52000000-0000-4000-8000-000000000021'; SELECT pg_sleep(2); COMMIT;" >"$SW_LOG_DIR/approve" 2>&1 &
first_pid=$!
wait_for_sleep sw_approval_first
if q -c "$login DELETE FROM public.sw_citations WHERE id='52000000-0000-4000-8000-000000000031';" >"$SW_LOG_DIR/delete" 2>&1; then
  echo 'FAIL: citation deletion succeeded after concurrent approval' >&2; exit 1
fi
wait "$first_pid"
grep -q 'SW_APPROVED_CITATIONS_IMMUTABLE' "$SW_LOG_DIR/delete" || { cat "$SW_LOG_DIR/delete"; exit 1; }
[ "$(q -c "SELECT status FROM public.sw_assessments WHERE id='52000000-0000-4000-8000-000000000021'")" = approved ]
[ "$(q -c "SELECT count(*) FROM public.sw_citations WHERE id='52000000-0000-4000-8000-000000000031'")" = 1 ]
echo '    ok  SWR2 approval winning the race preserves its citation'

# Removal wins: approval must re-read the citations after acquiring the row lock.
PGAPPNAME=sw_delete_first q -c "$login BEGIN; DELETE FROM public.sw_citations WHERE id='52000000-0000-4000-8000-000000000032'; SELECT pg_sleep(2); COMMIT;" >"$SW_LOG_DIR/delete-first" 2>&1 &
first_pid=$!
wait_for_sleep sw_delete_first
if q -c "$login UPDATE public.sw_assessments SET status='approved' WHERE id='52000000-0000-4000-8000-000000000022';" >"$SW_LOG_DIR/approve-second" 2>&1; then
  echo 'FAIL: approval succeeded without its concurrently deleted citation' >&2; exit 1
fi
wait "$first_pid"
grep -q 'SW_CITATION_REQUIRED' "$SW_LOG_DIR/approve-second" || { cat "$SW_LOG_DIR/approve-second"; exit 1; }
[ "$(q -c "SELECT status FROM public.sw_assessments WHERE id='52000000-0000-4000-8000-000000000022'")" = in_review ]
echo '    ok  SWR3 citation deletion winning the race prevents approval'
