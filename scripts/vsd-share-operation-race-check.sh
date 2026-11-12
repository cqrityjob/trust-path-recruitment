#!/usr/bin/env bash
# Voluntary self-declarations, Passport bridge (20270325090000): what one
# transaction cannot show.
#
# supabase/tests/vsd_passport_disclosure_test.sql runs in ONE transaction, so
# "a link that already existed" can only be imitated there. Here the rows are
# COMMITTED and every request is its own connection:
#
#   R1  a link committed a moment ago -- by the Passport itself, without the
#       bridge -- cannot gain a statement: not by replaying its key through
#       vsd_create_credential_share, and not by a direct write as the owner
#   R2  two concurrent requests of the SAME operation: the second WAITS, then
#       answers already_created; one link, one sealed choice, one selection
#   R3  the response is lost after the commit: a retry in a new transaction
#       creates nothing, changes nothing and returns no address -- repeatedly
#   R4  a concurrent request under the same key with a DIFFERENT choice waits
#       and is refused; the link keeps the (empty) choice it was created with
#   R5  the Passport's own creation racing the bridge under one key: the
#       bridge waits and is refused; the link carries nothing
#   R6  a statement cannot be written onto a bridge-created link by a later
#       transaction, even as the table owner
#
# Disposable clone only. Synthetic fixtures; the authorizations it records
# exist in the clone and are dropped with it.
set -Eeuo pipefail
: "${TEST_DB:?Run from the isolated db-test harness}"
[[ "$TEST_DB" =~ ^[a-zA-Z0-9_]+$ ]] || exit 2
case "${PGHOST:-127.0.0.1}" in *supabase*|*.rds.amazonaws.com|*.neon.tech) exit 2;; esac
case "$TEST_DB" in *ci_test*|vsd_*) ;; *) exit 2;; esac
RACE_DB="${TEST_DB}_vsd_share_race"
RACE_TMP="$(mktemp -d)"
cleanup() {
  psql -v ON_ERROR_STOP=1 -q -d postgres -c "DROP DATABASE IF EXISTS ${RACE_DB};" >/dev/null
  rm -rf "$RACE_TMP"
}
trap 'RACE_RC=$?; if [ "$RACE_RC" -ne 0 ]; then tail -n 30 "$RACE_TMP"/* 2>/dev/null || true; fi; cleanup' EXIT
fail() { echo "FAIL: $1" >&2; exit 1; }

psql -v ON_ERROR_STOP=1 -q -d postgres -c "DROP DATABASE IF EXISTS ${RACE_DB};" >/dev/null
psql -v ON_ERROR_STOP=1 -q -d postgres -c "CREATE DATABASE ${RACE_DB} TEMPLATE ${TEST_DB};" >/dev/null

A='5e000000-0000-4000-8000-0000000000a1'
K_OLD='5e000000-0000-4000-8000-00000000000a'
K_SAME='5e000000-0000-4000-8000-00000000000b'
K_EMPTY='5e000000-0000-4000-8000-00000000000c'
K_PLAIN='5e000000-0000-4000-8000-00000000000d'
K_TWO='5e000000-0000-4000-8000-00000000000e'

# The caller: A, signed in, with a live session.
AS_A="SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', json_build_object('sub', '${A}', 'role', 'authenticated', 'session_id', '${A}')::text, true) \\g /dev/null
SELECT set_config('request.jwt.claim.sub', '${A}', true) \\g /dev/null"

psql -v ON_ERROR_STOP=1 -q -d "$RACE_DB" >"$RACE_TMP/setup" 2>&1 <<SQL
BEGIN;
INSERT INTO auth.users (id, email, email_confirmed_at, raw_user_meta_data)
VALUES ('${A}', 'vsd-race-holder@test.invalid', now(), '{}');
INSERT INTO auth.sessions (id, user_id) VALUES ('${A}', '${A}');
INSERT INTO public.sp_passport_profiles (holder_user_id, privacy_mode) VALUES ('${A}', 'full_name') ON CONFLICT DO NOTHING;
INSERT INTO public.vsd_processing_authorizations
  (declaration_kind, jurisdiction, statement_version, operator_name, operator_registration, purpose,
   legal_basis, legal_basis_detail, assessment_reference, retention_days, permitted_operations,
   approved_by_name, approved_on)
VALUES
  ('enforcement_debt_none', 'SE', 'se-enforcement-v1', 'SYNTHETIC Operator AB', 'SYNTHETIC-000000-0000',
   'SYNTHETIC fixture purpose for the automated suite only.', 'consent',
   'SYNTHETIC fixture basis for the automated suite only.', 'SYNTHETIC-ASSESSMENT-1', 180,
   ARRAY['collect_declaration'], 'SYNTHETIC Approver', current_date),
  ('payment_remarks_none', 'SE', 'se-remarks-v1', 'SYNTHETIC Operator AB', 'SYNTHETIC-000000-0000',
   'SYNTHETIC fixture purpose for the automated suite only.', 'consent',
   'SYNTHETIC fixture basis for the automated suite only.', 'SYNTHETIC-ASSESSMENT-1', 180,
   ARRAY['collect_declaration'], 'SYNTHETIC Approver', current_date);
INSERT INTO public.vsd_disclosure_authorizations
  (authorization_id, purpose, legal_basis, legal_basis_detail, assessment_reference,
   permitted_audiences, approved_by_name, approved_on)
SELECT a.id, 'SYNTHETIC disclosure purpose for the automated suite only.', 'consent',
       'SYNTHETIC disclosure basis for the automated suite only.', 'SYNTHETIC-DISCLOSURE-ASSESSMENT-1',
       ARRAY['signed_in_recipient'], 'SYNTHETIC Approver', current_date
  FROM public.vsd_processing_authorizations a;
CREATE TABLE public.vsd_race_fixture (claim_id uuid, enforcement uuid, remarks uuid);
REVOKE ALL ON public.vsd_race_fixture FROM PUBLIC, anon, authenticated, service_role;
${AS_A}
SELECT public.vsd_save_declaration('enforcement_debt_none', 'SE', 'se-enforcement-v1', current_date, true, NULL) \\g /dev/null
SELECT public.vsd_save_declaration('payment_remarks_none', 'SE', 'se-remarks-v1', current_date, true, NULL) \\g /dev/null
SELECT public.sp_save_international_credential('{"definition_code":"INTL_ASIS_CPP","identifier":"SYNTHETIC-RACE"}') AS claim \\gset
RESET ROLE;
INSERT INTO public.vsd_race_fixture
SELECT :'claim',
       (SELECT id FROM public.vsd_declarations WHERE holder_user_id = '${A}' AND declaration_kind = 'enforcement_debt_none'),
       (SELECT id FROM public.vsd_declarations WHERE holder_user_id = '${A}' AND declaration_kind = 'payment_remarks_none');
COMMIT;
-- A link the Passport creates by itself, committed: "a recent existing link".
BEGIN;
SELECT claim_id AS claim FROM public.vsd_race_fixture \\gset
${AS_A}
SELECT public.sp_create_credential_disclosure_v2(ARRAY[:'claim']::uuid[], '{}', 7, NULL, NULL, 'sv', '${K_OLD}') \\g /dev/null
COMMIT;
SQL

# One request, as A, in its own connection. \$1 = file stem, \$2 = SQL after
# the caller is set, \$3 = seconds to hold the transaction open (0 = none).
request() {
  local stem="$1" body="$2" hold="${3:-0}" tail_sql=""
  [ "$hold" = 0 ] || tail_sql="SELECT 'READY';
SELECT pg_sleep(${hold}) \\g /dev/null"
  psql -v ON_ERROR_STOP=1 -Atq -d "$RACE_DB" >"$RACE_TMP/$stem" 2>&1 <<SQL
SELECT claim_id AS claim, enforcement, remarks FROM public.vsd_race_fixture \\gset
SELECT 'T0=' || extract(epoch from clock_timestamp());
BEGIN;
${AS_A}
${body}
${tail_sql}
COMMIT;
SELECT 'T1=' || extract(epoch from clock_timestamp());
SQL
}
create_sql() { # \$1 key, \$2 ids array literal, \$3 revisions array literal
  echo "SELECT 'R=' || public.vsd_create_credential_share(ARRAY[:'claim']::uuid[], '{}', 7, 'sv', '$1', $2, $3)::text;"
}
waited_ms() { awk -F= '/^T0=/{a=$2} /^T1=/{b=$2} END{printf "%d", (b-a)*1000}' "$RACE_TMP/$1"; }
scalar() { psql -v ON_ERROR_STOP=1 -Atq -d "$RACE_DB" -c "$1"; }
wait_ready() {
  for _ in $(seq 1 200); do if grep -q '^READY$' "$RACE_TMP/$1" 2>/dev/null; then return 0; fi; sleep 0.05; done
  cat "$RACE_TMP/$1" >&2; fail "the first request of $1 never reached its hold"
}
ONE="ARRAY[:'enforcement']::uuid[]"
BOTH="ARRAY[:'enforcement', :'remarks']::uuid[]"

# ── R1 · a recent, committed link cannot gain a statement ─────────────────
set +e
request r1 "$(create_sql "$K_OLD" "$ONE" "ARRAY[1]")"; R1_RC=$?
set -e
[ "$R1_RC" -ne 0 ] && grep -q 'VSD_DISCLOSURE_CHOICE_SEALED' "$RACE_TMP/r1" \
  || fail "R1 replaying a committed link's key through the bridge was not refused"
R1_DIRECT="$(psql -Atq -d "$RACE_DB" 2>&1 <<SQL || true
INSERT INTO public.vsd_disclosure_choices (disclosure_id, holder_user_id, request_key, choice_count, choice_digest)
SELECT id, holder_user_id, request_key, 1, repeat('0', 64) FROM public.sp_disclosures WHERE request_key = '${K_OLD}';
SQL
)"
echo "$R1_DIRECT" | grep -q 'VSD_DISCLOSURE_CHOICE_SEALED' \
  || fail "R1 a choice was sealed, by a direct write, for a link committed earlier: ${R1_DIRECT}"
R1_SEL="$(psql -Atq -d "$RACE_DB" 2>&1 <<SQL || true
INSERT INTO public.vsd_disclosure_selections
  (holder_user_id, disclosure_id, declaration_id, declaration_revision, statement_version, disclosure_authorization_id, audience)
SELECT x.holder_user_id, x.id, d.id, d.revision, d.statement_version, da.id, 'signed_in_recipient'
  FROM public.sp_disclosures x, public.vsd_declarations d
  JOIN public.vsd_disclosure_authorizations da ON da.authorization_id = d.authorization_id
 WHERE x.request_key = '${K_OLD}' AND d.declaration_kind = 'enforcement_debt_none';
SQL
)"
echo "$R1_SEL" | grep -q 'VSD_DISCLOSURE_CHOICE_SEALED' \
  || fail "R1 a statement was written directly onto a link committed earlier: ${R1_SEL}"
[ "$(scalar "SELECT (SELECT count(*) FROM public.vsd_disclosure_choices) || ',' || (SELECT count(*) FROM public.vsd_disclosure_selections)")" = "0,0" ] \
  || fail "R1 left a choice or a selection behind"
echo "    ok  R1 a link committed a moment ago cannot gain a statement: not by its key, not by a direct write"

# ── R2 · two concurrent requests of the same operation ────────────────────
request r2a "$(create_sql "$K_SAME" "$ONE" "ARRAY[1]")" 2 &
R2_PID=$!
wait_ready r2a
request r2b "$(create_sql "$K_SAME" "$ONE" "ARRAY[1]")"
wait "$R2_PID"
grep -q '^R={.*"status": "created"' "$RACE_TMP/r2a" && grep -q '"token"' "$RACE_TMP/r2a" \
  || fail "R2 the first request did not create the link"
grep -q '^R={.*"status": "already_created"' "$RACE_TMP/r2b" && ! grep -q '"token"' "$RACE_TMP/r2b" \
  || fail "R2 the concurrent request did not answer already_created without an address"
R2_MS="$(waited_ms r2b)"
[ "$R2_MS" -ge 1000 ] || fail "R2 the second request answered after ${R2_MS} ms: it did not wait, so this was not a race"
[ "$(scalar "SELECT (SELECT count(*) FROM public.sp_disclosures WHERE request_key = '${K_SAME}') || ',' || (SELECT count(*) FROM public.vsd_disclosure_choices WHERE request_key = '${K_SAME}' AND choice_count = 1) || ',' || (SELECT count(*) FROM public.vsd_disclosure_selections s JOIN public.sp_disclosures x ON x.id = s.disclosure_id WHERE x.request_key = '${K_SAME}')")" = "1,1,1" ] \
  || fail "R2 the race left something other than one link, one sealed choice and one selection"
echo "    ok  R2 the concurrent request WAITED (${R2_MS} ms) and found the operation committed: one link, one choice, one selection"

# ── R3 · the response was lost after the commit ───────────────────────────
for attempt in 1 2 3; do
  request "r3_$attempt" "$(create_sql "$K_SAME" "$ONE" "ARRAY[1]")"
  grep -q '^R={.*"status": "already_created"' "$RACE_TMP/r3_$attempt" && ! grep -q '"token"' "$RACE_TMP/r3_$attempt" \
    || fail "R3 retry ${attempt} did not answer already_created without an address"
done
request r3_status "SELECT 'R=' || public.vsd_share_operation('${K_SAME}')::text;"
grep -q '^R={.*"status": "sealed"' "$RACE_TMP/r3_status" && grep -q '"declarations": 1' "$RACE_TMP/r3_status" \
  || fail "R3 the operation's committed state was not reported as sealed with one statement"
set +e
request r3_wider "$(create_sql "$K_SAME" "$BOTH" "ARRAY[1, 1]")"; R3_RC=$?
set -e
[ "$R3_RC" -ne 0 ] && grep -q 'VSD_DISCLOSURE_CHOICE_SEALED' "$RACE_TMP/r3_wider" \
  || fail "R3 a retry with a wider choice was not refused"
[ "$(scalar "SELECT (SELECT count(*) FROM public.sp_disclosures WHERE request_key = '${K_SAME}') || ',' || (SELECT count(*) FROM public.vsd_disclosure_selections s JOIN public.sp_disclosures x ON x.id = s.disclosure_id WHERE x.request_key = '${K_SAME}')")" = "1,1" ] \
  || fail "R3 a retry created a link or changed the selection"
echo "    ok  R3 after a commit whose response was lost, three retries change nothing, the state reads sealed, and a wider retry is refused"

# ── R4 · the same key, a different choice, concurrently ───────────────────
request r4a "$(create_sql "$K_EMPTY" "'{}'" "'{}'")" 2 &
R4_PID=$!
wait_ready r4a
set +e
request r4b "$(create_sql "$K_EMPTY" "$ONE" "ARRAY[1]")"; R4_RC=$?
set -e
wait "$R4_PID"
grep -q '^R={.*"status": "created"' "$RACE_TMP/r4a" || fail "R4 the empty-choice link was not created"
[ "$R4_RC" -ne 0 ] && grep -q 'VSD_DISCLOSURE_CHOICE_SEALED' "$RACE_TMP/r4b" \
  || fail "R4 a concurrent request adding a statement to an empty choice was not refused"
[ "$(scalar "SELECT (SELECT count(*) FROM public.vsd_disclosure_choices WHERE request_key = '${K_EMPTY}' AND choice_count = 0) || ',' || (SELECT count(*) FROM public.vsd_disclosure_selections s JOIN public.sp_disclosures x ON x.id = s.disclosure_id WHERE x.request_key = '${K_EMPTY}')")" = "1,0" ] \
  || fail "R4 the link did not keep the empty choice it was created with"
echo "    ok  R4 a link created with an empty choice keeps it: the concurrent request with a statement waited and was refused"

# ── R5 · the Passport's own creation racing the bridge ────────────────────
request r5a "SELECT 'R=' || public.sp_create_credential_disclosure_v2(ARRAY[:'claim']::uuid[], '{}', 7, NULL, NULL, 'sv', '${K_PLAIN}')::text;" 2 &
R5_PID=$!
wait_ready r5a
set +e
request r5b "$(create_sql "$K_PLAIN" "$ONE" "ARRAY[1]")"; R5_RC=$?
set -e
wait "$R5_PID"
[ "$R5_RC" -ne 0 ] && grep -q 'VSD_DISCLOSURE_CHOICE_SEALED' "$RACE_TMP/r5b" \
  || fail "R5 the bridge was not refused for a key the Passport was creating"
[ "$(scalar "SELECT (SELECT count(*) FROM public.sp_disclosures WHERE request_key = '${K_PLAIN}') || ',' || (SELECT count(*) FROM public.vsd_disclosure_choices WHERE request_key = '${K_PLAIN}')")" = "1,0" ] \
  || fail "R5 the Passport's own link gained a sealed choice"
echo "    ok  R5 a link the Passport was creating at the same moment carries nothing: the bridge waited and was refused"

# ── R6 · a later transaction cannot write onto a bridge-created link ──────
# Also when the sealed choice has room again: one of two statements is
# removed (as its declaration's deletion would), and nothing can take its
# place -- the same statement or another.
request r6 "$(create_sql "$K_TWO" "$BOTH" "ARRAY[1, 1]")"
grep -q '^R={.*"declarations": 2' "$RACE_TMP/r6" || fail "R6 the link with two statements was not created"
R6="$(psql -Atq -d "$RACE_DB" 2>&1 <<SQL || true
DELETE FROM public.vsd_disclosure_selections s USING public.sp_disclosures x, public.vsd_declarations d
 WHERE x.id = s.disclosure_id AND d.id = s.declaration_id
   AND x.request_key = '${K_TWO}' AND d.declaration_kind = 'payment_remarks_none';
INSERT INTO public.vsd_disclosure_selections
  (holder_user_id, disclosure_id, declaration_id, declaration_revision, statement_version, disclosure_authorization_id, audience)
SELECT x.holder_user_id, x.id, d.id, d.revision, d.statement_version, da.id, 'signed_in_recipient'
  FROM public.sp_disclosures x, public.vsd_declarations d
  JOIN public.vsd_disclosure_authorizations da ON da.authorization_id = d.authorization_id
 WHERE x.request_key = '${K_TWO}' AND d.declaration_kind = 'payment_remarks_none';
SQL
)"
echo "$R6" | grep -q 'VSD_DISCLOSURE_CHOICE_SEALED' \
  || fail "R6 a later transaction wrote a statement onto a bridge-created link: ${R6}"
[ "$(scalar "SELECT count(*) FROM public.vsd_disclosure_selections s JOIN public.sp_disclosures x ON x.id = s.disclosure_id WHERE x.request_key = '${K_TWO}'")" = "1" ] \
  || fail "R6 the link does not carry exactly the one statement that was left"
echo "    ok  R6 a later transaction cannot add a statement to a sealed link, even as the table owner and with room in the choice"
echo "    ok  6 self-declaration share-operation races and bypasses"
