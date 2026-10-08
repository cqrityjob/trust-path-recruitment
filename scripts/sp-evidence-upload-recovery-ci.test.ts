// Source-contract controls only. Actual rollback/SQL proof is db-test.sh in
// its disposable database; these tests never start a database or a service.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";

const runner = fs.readFileSync("scripts/db-test.sh", "utf8");
const rollback = fs.readFileSync(
  "supabase/rollback/20270309090000_sp_evidence_upload_recovery_rollback.sql",
  "utf8",
);
const migration = fs.readFileSync(
  "supabase/migrations/20270309090000_sp_evidence_upload_recovery.sql",
  "utf8",
);
const sqlSuite = fs.readFileSync("supabase/tests/sp_evidence_upload_recovery_test.sql", "utf8");
function governedFixture(source: string) {
  assert.doesNotMatch(
    source,
    /INSERT INTO public\.sp_claims|DISABLE\s+TRIGGER|session_replication_role|UPDATE public\.sp_claims SET id/i,
    "retain governed writer and guard",
  );
  assert.match(source, /CREATE TEMP TABLE op09_fixture_claim\(id uuid PRIMARY KEY\)/);
  assert.match(
    source,
    /INSERT INTO op09_fixture_claim\(id\)\s+SELECT pg_temp\.as_actor\('a7090000-0000-4000-8000-000000000001',[\s\S]*?sp_save_international_credential\(%L::jsonb\)/,
  );
  assert.match(source, /'definition_code','INTL_ASIS_CPP','market_country','','market_region',''/);
  assert.match(source, /'valid_until',\(current_date\+30\)::text,'no_expiry',false\)\)\)::uuid/);
  assert.doesNotMatch(
    source,
    /a7090000-1000-4000-8000-000000000001/,
    "all consumers bind the real returned claim UUID",
  );
  assert.equal((source.match(/SELECT id FROM pg_temp\.op09_fixture_claim/g) ?? []).length, 5);
  assert.match(source, /^BEGIN;/m);
  assert.match(source, /ROLLBACK;\s*$/);
  const labels = [...source.matchAll(/SELECT pg_temp\.ok[\s\S]*?;(?=\n|$)/g)].map(
    ([statement]) => statement.match(/,'([^']+)'\);$/)?.[1],
  );
  assert.equal(labels.length, 41, "all original41 assertions remain");
  assert.equal(
    createHash("sha256").update(JSON.stringify(labels)).digest("hex"),
    "0183da2de13c22cc2c7759fc18dd5dc909f4ade558e4565340f216fed04e6f0a",
    "retain all original assertion labels",
  );
}
test("upload SQL fixture creates its governed claim through the existing holder RPC and keeps41 checks", () => {
  governedFixture(sqlSuite);
});
for (const [label, mutate] of [
  ["direct claim bypass", (s: string) => "INSERT INTO public.sp_claims VALUES(...);\n" + s],
  ["trigger bypass", (s: string) => "ALTER TABLE public.sp_claims DISABLE TRIGGER ALL;\n" + s],
  [
    "wrong writer",
    (s: string) => s.replace("sp_save_international_credential", "sp_fake_saved_claim"),
  ],
  [
    "hardcoded claim id",
    (s: string) =>
      s.replace(
        "SELECT id FROM pg_temp.op09_fixture_claim",
        "SELECT 'a7090000-1000-4000-8000-000000000001'",
      ),
  ],
  [
    "renamed assertion",
    (s: string) => s.replace("one metadata row after duplicate", "one row maybe"),
  ],
  ["committed SQL fixture", (s: string) => s.replace(/ROLLBACK;\s*$/, "COMMIT;")],
] as const)
  test(`governed-fixture negative control: ${label}`, () => {
    assert.throws(() => governedFixture(mutate(sqlSuite)));
  });
const historical = fs.readFileSync(
  "supabase/rollback/20261119090000_sp_international_credential_wallet_rollback.sql",
  "utf8",
);
const standdown =
  'psql_q -d "$TEST_DB" -f supabase/rollback/20270309090000_sp_evidence_upload_recovery_rollback.sql >/dev/null';
function check(source: string, reversal: string) {
  const anchors = [
    "# STRICT-REPLAY-CONTRACT END",
    "-f supabase/tests/sp_evidence_upload_recovery_test.sql",
    "-f supabase/tests/recruiter_intelligence_p1_test.sql",
    'echo "==> Proving upload journal rollback refuses any unresolved intention"',
    standdown,
    'psql_q -d "$TEST_DB" -f supabase/rollback/20270308090000_recruiter_intelligence_requirements_rollback.sql',
    'psql_q -d "$TEST_DB" -f supabase/rollback/20270307100000_recruiter_domain_conflict_transport_rollback.sql',
    'psql_q -d "$TEST_DB" -f supabase/rollback/20261119090000_sp_international_credential_wallet_rollback.sql',
  ];
  const positions = anchors.map((anchor) => source.indexOf(anchor));
  assert.ok(
    positions.every((pos, i) => pos >= 0 && (i === 0 || pos > positions[i - 1])),
    "complete current schema and strict41+95 must precede0909→080→071→historical",
  );
  assert.match(source, /\[ "\$RI_UPLOAD_PASSED" -ge 41 \]/, "keep41 upload assertions");
  assert.match(source, /\[ "\$RI_P1_PASSED" -lt 95 \]/, "keep95 P1 assertions");
  const probe = source.slice(positions[3], positions[4]);
  assert.match(probe, /psql -v ON_ERROR_STOP=1 -v VERBOSITY=verbose/, "abort on actual SQL error");
  assert.match(
    probe,
    /<<'SQL'[\s\S]*BEGIN;[\s\S]*INSERT INTO public\.sp_evidence_upload_attempts/,
    "transactional nonempty fixture",
  );
  assert.ok(
    probe.includes("\\i supabase/rollback/20270309090000_sp_evidence_upload_recovery_rollback.sql"),
    "invoke the actual canonical rollback",
  );
  assert.doesNotMatch(probe, /COMMIT;/, "never commit the synthetic refusal fixture");
  assert.ok(
    probe.includes('[ "$RI_UPLOAD_NONEMPTY_RC" -eq 0 ] || ! echo "$RI_UPLOAD_NONEMPTY_OUT"'),
    "successful rollback or a wrong error must fail the proof",
  );
  assert.ok(
    probe.includes("ERROR:  *P0001: SP_UPLOAD_ROLLBACK_REQUIRES_EMPTY_JOURNAL"),
    "require the exact protected refusal, not any SQL failure",
  );
  assert.ok(
    probe.includes('[ "$RI_UPLOAD_EMPTY" = "true" ]') &&
      probe.includes("NOT EXISTS(SELECT 1 FROM public.sp_evidence_upload_attempts)") &&
      probe.includes("NOT EXISTS(SELECT 1 FROM auth.users WHERE id="),
    "require durable absence of the failed probe",
  );
  const witness = source.slice(positions[4], positions[5]);
  for (const expected of [
    "to_regclass('public.sp_evidence_upload_attempts') IS NULL",
    "sp_evidence_upload_insert_fence",
    "sp_evidence_upload_update_fence",
    "sp_evidence_upload_payload",
    "sp_reconcile_evidence_upload",
    "sp_attach_evidence(uuid,uuid,text,text,text,integer,text)",
    "sp_passport_session_active()",
    '[ "$RI_UPLOAD_STOOD_DOWN" = "true" ]',
  ])
    assert.ok(witness.includes(expected), "require removal and original-function readback");
  const guard = reversal.indexOf("IF EXISTS(SELECT 1 FROM public.sp_evidence_upload_attempts)");
  assert.ok(guard >= 0 && guard < reversal.indexOf("DROP "), "nonempty fence before any DROP");
  assert.match(reversal, /RAISE EXCEPTION 'SP_UPLOAD_ROLLBACK_REQUIRES_EMPTY_JOURNAL'/);
  assert.doesNotMatch(reversal, /\bCASCADE\b/i, "do not hide historical dependencies");
}

test("actual source dependencies explain why newest recovery consumer must stand down first", () => {
  assert.match(
    migration,
    /CREATE POLICY sp_evidence_upload_own_read[\s\S]*USING \(holder_user_id = \(SELECT auth.uid\(\)\) AND public\.sp_passport_session_active\(\)\)/,
  );
  assert.match(historical, /DROP FUNCTION public\.sp_passport_session_active\(\);/);
  assert.doesNotMatch(historical, /sp_evidence_upload|CASCADE/);
});
test("strict full history/41/95 plus actual protected rollback and readback contract", () => {
  check(runner, rollback);
});
const mutations: Array<[string, (source: string) => string]> = [
  ["missing rollback", (s) => s.replace(standdown, "")],
  ["rollback before full-schema tests", (s) => standdown + "\n" + s.replace(standdown, "")],
  ["shortened41 floor", (s) => s.replace("-ge 41 ]", "-ge 40 ]")],
  ["shortened95 floor", (s) => s.replace("-lt 95 ]", "-lt 94 ]")],
  [
    "ignored nonempty success",
    (s) => s.replace('"$RI_UPLOAD_NONEMPTY_RC" -eq 0', '"$RI_UPLOAD_NONEMPTY_RC" -eq 99'),
  ],
  [
    "wrong SQLSTATE accepted",
    (s) =>
      s.replace(
        "P0001: SP_UPLOAD_ROLLBACK_REQUIRES_EMPTY_JOURNAL",
        "42501: SP_UPLOAD_ROLLBACK_REQUIRES_EMPTY_JOURNAL",
      ),
  ],
  [
    "different SQL error accepted",
    (s) => s.replace("P0001: SP_UPLOAD_ROLLBACK_REQUIRES_EMPTY_JOURNAL", "P0001: SOMETHING_ELSE"),
  ],
  [
    "probe commits fixture",
    (s) => s.replace("BEGIN;\nINSERT INTO auth.users", "BEGIN;\nCOMMIT;\nINSERT INTO auth.users"),
  ],
  ["missing probe absence assertion", (s) => s.replace('[ "$RI_UPLOAD_EMPTY" = "true" ]', ":")],
  ["missing standdown readback", (s) => s.replace('[ "$RI_UPLOAD_STOOD_DOWN" = "true" ]', ":")],
];
for (const [label, mutate] of mutations)
  test("negative source control: " + label, () => {
    const changed = mutate(runner);
    assert.notEqual(changed, runner, "control must actually plant the defect");
    assert.throws(() => check(changed, rollback));
  });
test("negative source control: removing the canonical nonempty rollback fence is rejected", () => {
  const changed = rollback.replace(
    "IF EXISTS(SELECT 1 FROM public.sp_evidence_upload_attempts)",
    "IF false",
  );
  assert.notEqual(changed, rollback);
  assert.throws(() => check(runner, changed));
});
test("negative source control: CASCADE cannot replace dependency ordering", () => {
  assert.throws(() =>
    check(
      runner,
      rollback.replace(
        "DROP TABLE public.sp_evidence_upload_attempts;",
        "DROP TABLE public.sp_evidence_upload_attempts CASCADE;",
      ),
    ),
  );
});
