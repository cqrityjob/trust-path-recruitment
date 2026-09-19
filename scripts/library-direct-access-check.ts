/**
 * 20261201090000 — the library's direct access and recruitment setup, asserted
 * from the migration, rollback, suite, harness and release record.
 *
 * The suite proves the behaviour in a replayed database; this guard runs in
 * the fast job and fails if the migration stops being what the owner decided
 * (2026-09-19): content in the employer offer is available directly to every
 * ACTIVE employer, with no per-employer grant, activation, content role or
 * install -- while availability stays a governed CONTENT property that
 * reviews, publishes and relabels nothing, freezes the content, and leaves
 * the security function's hold on a vetting exactly where it was.
 *
 * Run: bun run library-direct-access:check
 */

import { readFileSync } from "node:fs";

const MIG = "supabase/migrations/20261201090000_scp_library_direct_access.sql";
const RB = "supabase/rollback/20261201090000_scp_library_direct_access_rollback.sql";
const SUITE = "supabase/tests/scp_library_direct_access_test.sql";
const DB = "scripts/db-test.sh";
const STATE = "supabase/release-state.json";

const read = (p: string) => readFileSync(p, "utf8");
const sql = (s: string) => s.replace(/^\s*--.*$/gm, "");

const fails: string[] = [];
let passed = 0;
function check(ok: boolean, label: string): void {
  if (ok) {
    passed += 1;
    console.log(`  ok ${label}`);
  } else {
    fails.push(label);
    console.log(`  FAIL ${label}`);
  }
}

const mig = sql(read(MIG));
const fn = (name: string): string =>
  new RegExp(`FUNCTION public\\.${name}\\([\\s\\S]*?(?:\\$\\$;|\\$function\\$\\s*;)`).exec(
    mig,
  )?.[0] ?? "";

// ---- the one entitlement rule ------------------------------------------------
const offer = fn("bcp_offer_covers");
check(
  /employer_is_active_status\(_employer_id\)/.test(offer) &&
    /bcp_version_is_runnable\(_method_version_id\)/.test(offer) &&
    /bcp_open_pilot_available\(_method_version_id\)/.test(offer) &&
    /bcp_internal_test_activation_active\(_employer_id, _method_version_id\)/.test(offer) &&
    !/bcp_pilot_grant_active/.test(offer),
  "LD-OFFER: one rule -- an ACTIVE employer, and published, openly available or internally activated content; no pilot grant",
);
const open = fn("bcp_open_pilot_available");
check(
  /pilot_availability = 'open'/.test(open) &&
    /content_status IN \('draft', 'in_review'\)/.test(open) &&
    /content_hash IS NOT NULL/.test(open) &&
    /bcp_version_is_structurally_candidate_safe\(_method_version_id\)/.test(open),
  "LD-OPEN: open pilot means the publisher's flag, a pre-publication state, a hash, and content complete for its mode",
);
const START_PATHS = [
  "bcp_accept_invitation",
  "bcp_assign",
  "bcp_assignable_exposure_profiles",
  "bcp_check_start",
  "bcp_method_preview",
  "bcp_assignable_method_versions",
];
check(
  START_PATHS.every((f) => /bcp_offer_covers\(/.test(fn(f))) &&
    START_PATHS.every((f) => !/bcp_pilot_grant_active/.test(fn(f))),
  "LD-PATHS: every start path asks bcp_offer_covers, and none requires a per-employer pilot grant",
);
check(
  /bcp_offer_content_covers\(a\.employer_id, _method_version_id,\s*a\.pinned_content_hash\)/.test(
    fn("bcp_party_can_read_method_version"),
  ) &&
    /bcp_offer_content_covers\(_a\.employer_id, _v\.id, _a\.pinned_content_hash\)/.test(
      fn("bcp_conduct_topic_prompts"),
    ) &&
    /v\.content_hash = _pinned_content_hash/.test(fn("bcp_offer_content_covers")),
  "LD-CONTINUITY: started work keeps reading exactly the content it pinned",
);

// ---- availability is governed content, not access for an employer ------------
const setter = fn("beskt_set_pilot_availability");
check(
  /scp_has_content_role\(auth\.uid\(\), 'publisher'\)/.test(setter) &&
    /beskt_operation_begin\(_operation_id, _request_hash\)/.test(setter) &&
    /length\(btrim\(_reason\)\) < 3/.test(setter),
  "LD-SETTER: only the platform publisher sets availability, with a reason and an operation receipt",
);
check(
  /_v\.content_status NOT IN \('draft', 'in_review'\)/.test(setter) &&
    /IF _v\.pilot_availability = _target THEN/.test(setter) &&
    !/SET[^;]*\b(content_status|validation_label)\s*=/.test(setter) &&
    !/beskt_method_reviews/.test(setter),
  "LD-NO-REVIEW: availability is idempotent and never publishes, relabels or records a review",
);
check(
  /IF _v\.pilot_availability = 'open' THEN\s*RAISE EXCEPTION\s*'BESKT_OPEN_FROZEN/.test(
    fn("beskt_content_gate"),
  ),
  "LD-FROZEN: content that employers can start cannot be edited",
);
check(
  /REVOKE ALL ON FUNCTION public\.bcp_offer_covers\(uuid, uuid\) FROM PUBLIC, anon, authenticated;/.test(
    mig,
  ) &&
    /REVOKE ALL ON FUNCTION public\.bcp_open_pilot_available\(uuid\) FROM PUBLIC, anon, authenticated;/.test(
      mig,
    ) &&
    /REVOKE ALL ON FUNCTION public\.bcp_offer_content_covers\(uuid, uuid, text\) FROM PUBLIC, anon, authenticated;/.test(
      mig,
    ) &&
    /REVOKE ALL ON FUNCTION public\.beskt_set_pilot_availability\(uuid, uuid, boolean, text\) FROM PUBLIC, anon;/.test(
      mig,
    ),
  "LD-GRANTS: the entitlement predicates are internal and anon can set nothing",
);

// ---- the setup -------------------------------------------------------------------
check(
  /REVOKE ALL ON public\.scp_recruitment_setups FROM PUBLIC, anon, authenticated;\s*GRANT SELECT ON public\.scp_recruitment_setups TO authenticated;/.test(
    mig,
  ) &&
    /scp_iv_can_read_case\(interview_case_id\)/.test(mig) &&
    /bcp_employer_party\(beskt_assignment_id\)/.test(mig),
  "LD-SETUP-READ: a setup is read only where its case or BESKT assignment is readable",
);
const record = fn("scp_record_recruitment_setup");
check(
  /scp_iv_can_write_case\(c\.id\)/.test(record) &&
    /bcp_employer_party\(a\.id\)/.test(record) &&
    /SCP_SETUP_ALREADY_RECORDED/.test(record) &&
    /pg_advisory_xact_lock/.test(record),
  "LD-SETUP-WRITE: recorded once, by someone who may work on the case or assignment, serialised",
);
check(
  /SCP_SETUP_APPEND_ONLY/.test(mig) && /SCP_SETUP_IMMUTABLE/.test(mig),
  "LD-SETUP-IMMUTABLE: a setup is never deleted and never changed, except to attach its case once",
);

// ---- pinned, restorable, proved, recorded -----------------------------------------
const pins = mig.match(/SCP_LIBRARY_PRECONDITION: [a-z_]+ is not the body/g) ?? [];
const rb = read(RB);
check(
  pins.length === 9 &&
    (rb.match(/SCP_LIBRARY_ROLLBACK: [a-z_]+ was not restored exactly/g) ?? []).length === 9 &&
    /SCP_LIBRARY_ROLLBACK_REFUSED: recruitment setups exist/.test(rb) &&
    /a BESKT version is available to employers; withdraw it first/.test(rb),
  "LD-PINNED: nine re-created bodies are md5-pinned, restored verbatim, and the rollback refuses while anything depends on it",
);
const suite = read(SUITE);
check(
  (suite.match(/'LD\d+\.\d+/g) ?? []).length >= 34 &&
    /LD1\.1 a new organisation sees the published version at once/.test(suite) &&
    /LD3\.1 the new and the existing organisation both list it/.test(suite) &&
    /LD5\.2 and cannot be started again/.test(suite) &&
    /LD6\.2 but availability does not bypass the security function/.test(suite),
  "LD-SUITE: the suite proves new and existing organisations, withdrawal and the security function",
);
const db = read(DB);
check(
  /scp_library_direct_access_test\.sql/.test(db) &&
    /LD_PASSED" -lt 34/.test(db) &&
    /suite_failed "Library direct access"/.test(db) &&
    db.indexOf("20261201090000_scp_library_direct_access_rollback.sql >/dev/null") <
      db.indexOf("20261130090000_bcp_beskt_complete_rollback.sql >/dev/null"),
  "LD-HARNESS: db:test runs the suite, refuses a shrunk one, and unwinds 20261201 before 20261130",
);
const state = JSON.parse(read(STATE)) as {
  frontier: Array<{ file?: string; hostedState?: string; evidenceSource?: string }>;
};
const entry = state.frontier.find((e) => e.file === "20261201090000_scp_library_direct_access.sql");
// Applied by the integration after #272 merged (61a04c8), verified by the
// BODIES of the functions it created or re-created, not only the ledger row.
check(
  entry?.hostedState === "applied" &&
    /wrygicdfxwjnrugduxnt/.test(entry.evidenceSource ?? "") &&
    [
      "bb180a98cc9cbc3cc34e5abcfa1bfced",
      "0b8d3807dfd38bd5b3a781f1c951d779",
      "b25ff58d23fa119c6938bebc99d52dc7",
      "e87cf7bba30d4ec94b49e658a5484ad6",
    ].every((md5) => (entry.evidenceSource ?? "").includes(md5)) &&
    /"version": "20261201090000"/.test(read("supabase/hosted-ledger.json")),
  "LD-RELEASE: recorded applied with hosted body evidence and a ledger row",
);
check(
  !/const expectedPending: string\[\] = \[[^\]]*20261201090000/.test(
    read("scripts/release-frontier-check.ts"),
  ),
  "LD-RELEASE: no longer expected pending on the frontier",
);

console.log("");
if (fails.length > 0) {
  console.error(
    `library-direct-access:check FAILED (${fails.length} of ${passed + fails.length}).`,
  );
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`library-direct-access:check: ${passed} assertions passed.`);
