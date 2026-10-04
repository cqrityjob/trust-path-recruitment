#!/usr/bin/env bash
# Security Passport catalogue requests: the ten-open allowance under real
# concurrency. Two psql sessions, genuinely at once, against PGDATABASE (a
# throwaway clone: the fixtures are committed and the negative control replaces
# two functions).
#
#   race 1  two DIFFERENT requests from a holder with nine open
#   race 2  a holder request and an administrator reopening a declined request
#
# Session A runs its call and holds its transaction open for three seconds;
# session B starts once A has written. With the per-holder lock B must WAIT,
# then be refused SP_REQUEST_LIMIT, and the holder ends with exactly ten open.
#
# Both races then run again as a NEGATIVE CONTROL against copies of the two
# functions with the lock stripped out (derived from the live definitions in
# pg_proc, so they cannot drift): B is NOT refused and the holder ends with
# eleven. If the control does not reproduce the overrun, the real run proves
# nothing and this script fails.
set -euo pipefail

: "${PGDATABASE:?PGDATABASE must name the throwaway clone}"
FIXTURE=supabase/tests/security_passport_catalogue_request_race_test.sql
ADMIN=fd280000-0000-4000-8000-0000000000ad
FAILED=0

psql -q -v ON_ERROR_STOP=1 -v phase=setup -f "$FIXTURE" 2>&1 | grep -E "ok  |FAILED" | sed 's/^.*NOTICE:  /    /' || true

as_user() { # $1 user, $2 SQL run as that user inside the transaction
  printf "BEGIN;\nSET LOCAL ROLE authenticated;\nSELECT set_config('request.jwt.claim.sub', '%s', true);\n%s\n" "$1" "$2"
}

# race <label> <mode real|control> <holder> <A user> <A sql> <B user> <B sql>
race() {
  local label="$1" mode="$2" holder="$3" a_user="$4" a_sql="$5" b_user="$6" b_sql="$7"
  local a_log b_log held b_start b_rc b_waited a_pid expect
  a_log="$(mktemp)"; b_log="$(mktemp)"

  (
    { as_user "$a_user" "$a_sql"; printf "SELECT pg_sleep(3);\nCOMMIT;\n"; } \
      | psql -q -v ON_ERROR_STOP=1 >"$a_log" 2>&1
    echo "RC=$?" >>"$a_log"
  ) &
  a_pid=$!

  # Wait until A has written, so B starts into real contention.
  held=0
  for _ in $(seq 1 200); do
    held="$(psql -tAq -c "select count(*) from pg_locks l join pg_class c on c.oid = l.relation where c.relname = 'sp_catalogue_requests' and l.mode = 'RowExclusiveLock' and l.granted and l.pid <> pg_backend_pid();" 2>/dev/null || echo 0)"
    [ "${held:-0}" -gt 0 ] && break
    sleep 0.05
  done

  b_start="$(date +%s)"
  set +e
  { as_user "$b_user" "$b_sql"; printf "COMMIT;\n"; } | psql -q -v ON_ERROR_STOP=1 >"$b_log" 2>&1
  b_rc=$?
  set -e
  b_waited=$(( $(date +%s) - b_start ))
  wait "$a_pid" || true

  if [ "${held:-0}" -eq 0 ]; then
    echo "FAIL: ${label} (${mode}): session A never wrote, so the sessions were never concurrent" >&2
    FAILED=1
  fi
  if ! grep -q "^RC=0" "$a_log"; then
    echo "FAIL: ${label} (${mode}): the first call did not succeed" >&2
    cat "$a_log" >&2
    FAILED=1
  fi

  if [ "$mode" = real ]; then
    expect=10
    if [ "$b_rc" -eq 0 ] || ! grep -q "SP_REQUEST_LIMIT" "$b_log"; then
      echo "FAIL: ${label}: the concurrent second call was not refused with SP_REQUEST_LIMIT" >&2
      grep -iE "ERROR:|FEL:" "$b_log" | head -3 >&2 || true
      FAILED=1
    elif [ "$b_waited" -lt 2 ]; then
      echo "FAIL: ${label}: the second call was refused after ${b_waited}s without waiting, so" >&2
      echo "      its refusal is no evidence that the two calls were serialised" >&2
      FAILED=1
    else
      echo "    ok  ${label}: B WAITED ${b_waited}s on the holder's key, then was refused SP_REQUEST_LIMIT"
    fi
  else
    expect=11
    if [ "$b_rc" -ne 0 ]; then
      echo "FAIL: ${label} (control): without the lock the second call was still refused -- the" >&2
      echo "      race is not reproduced, so the real run proves nothing" >&2
      grep -iE "ERROR:|FEL:" "$b_log" | head -3 >&2 || true
      FAILED=1
    else
      echo "    ok  ${label} (control, lock removed): B was not refused"
    fi
  fi
  rm -f "$a_log" "$b_log"

  set +e
  local out rc
  out="$(psql -q -v ON_ERROR_STOP=1 -v phase=verify -v holder="$holder" -v expect_open="$expect" -f "$FIXTURE" 2>&1)"
  rc=$?
  set -e
  if [ "$rc" -ne 0 ]; then
    echo "FAIL: ${label} (${mode}):" >&2
    echo "$out" | grep -E "ASSERTION FAILED|ERROR" | head -3 >&2
    FAILED=1
  else
    echo "$out" | grep -E "ok  " | sed "s/^.*NOTICE:  ok  /    ok  ${label} (${mode}): /" || true
  fi
}

request_sql() { printf "SELECT public.sp_request_catalogue_definition('{\"requested_name\":\"%s\",\"requested_issuer\":\"Race Fixture Body\"}');" "$1"; }
reopen_sql() { printf "SELECT public.sp_admin_resolve_catalogue_request('%s', 'open');" "$1"; }

echo "==> Catalogue request allowance: two sessions at once (per-holder lock)"
race "RR two distinct requests" real fd280000-0000-4000-8000-000000000001 \
  fd280000-0000-4000-8000-000000000001 "$(request_sql 'Race tenth award A')" \
  fd280000-0000-4000-8000-000000000001 "$(request_sql 'Race tenth award B')"
race "RR a request and an administrator reopen" real fd280000-0000-4000-8000-000000000002 \
  fd280000-0000-4000-8000-000000000002 "$(request_sql 'Race tenth award A')" \
  "$ADMIN" "$(reopen_sql fd28aaaa-0000-4000-8000-000000000002)"

echo "==> Catalogue request allowance NEGATIVE CONTROL (lock removed from both functions)"
psql -q -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE _fn text; _def text;
BEGIN
  FOREACH _fn IN ARRAY ARRAY['sp_request_catalogue_definition', 'sp_admin_resolve_catalogue_request'] LOOP
    SELECT pg_get_functiondef(p.oid) INTO _def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = _fn;
    _def := regexp_replace(_def,
      'PERFORM pg_advisory_xact_lock\(\s*hashtextextended\([^;]*\);',
      '-- NEGATIVE CONTROL: per-holder lock removed', 'g');
    IF _def LIKE '%pg_advisory_xact_lock%' THEN
      RAISE EXCEPTION 'CONTROL_SETUP: the lock statement was not stripped from %', _fn;
    END IF;
    EXECUTE _def;
  END LOOP;
END $$;
SQL
race "RR two distinct requests" control fd280000-0000-4000-8000-000000000003 \
  fd280000-0000-4000-8000-000000000003 "$(request_sql 'Race tenth award A')" \
  fd280000-0000-4000-8000-000000000003 "$(request_sql 'Race tenth award B')"
race "RR a request and an administrator reopen" control fd280000-0000-4000-8000-000000000004 \
  fd280000-0000-4000-8000-000000000004 "$(request_sql 'Race tenth award A')" \
  "$ADMIN" "$(reopen_sql fd28aaaa-0000-4000-8000-000000000004)"

if [ "$FAILED" -ne 0 ]; then
  echo "FAIL: the catalogue request allowance race" >&2
  exit 1
fi
echo "    ok  the allowance holds under concurrency, and the control reproduces the overrun without the lock"
