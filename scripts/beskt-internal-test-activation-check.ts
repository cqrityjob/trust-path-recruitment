/**
 * 20261129090000 — the owner's internal test activation, asserted from the
 * migration, rollback, suite, harness and release record.
 *
 * The suite proves the behaviour in a replayed database; this guard runs in
 * the fast job and fails if the migration stops being what makes the test
 * activation safe: an admin-only, recorded decision, pinned by content hash,
 * employer-scoped, never a review, never anon-reachable.
 *
 * Run: bun run beskt-internal-test-activation:check
 */

import { readFileSync } from "node:fs";

const MIG = "supabase/migrations/20261129090000_bcp_internal_test_activation.sql";
const RB = "supabase/rollback/20261129090000_bcp_internal_test_activation_rollback.sql";
const SUITE = "supabase/tests/bcp_internal_test_activation_test.sql";
const DB = "scripts/db-test.sh";
const STATE = "supabase/release-state.json";

const read = (p: string) => readFileSync(p, "utf8");
const sql = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*--.*$/gm, "");

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
const grant =
  /FUNCTION public\.bcp_grant_internal_test_activation\([\s\S]*?END \$\$;/.exec(mig)?.[0] ?? "";
const active =
  /FUNCTION public\.bcp_internal_test_activation_active\([\s\S]*?\$\$;/.exec(mig)?.[0] ?? "";

check(
  /IF auth\.uid\(\) IS NULL OR NOT public\.is_platform_admin\(auth\.uid\(\)\) THEN\s+RAISE EXCEPTION 'BCP_NOT_PLATFORM_ADMIN/.test(
    grant,
  ),
  "ITA-GRANT: only a platform admin records an activation",
);
check(
  /VALUES \(_employer_id, _method_version_id, _v\.content_hash,/.test(grant) &&
    /v\.content_hash = t\.pinned_content_hash/.test(active),
  "ITA-PIN: the decision pins the content hash, and only that exact content is usable",
);
check(
  /t\.employer_id = _employer_id/.test(active) &&
    /t\.revoked_at IS NULL/.test(active) &&
    /current_date < t\.expires_on/.test(active),
  "ITA-SCOPE: an activation is live only for its own employer, unrevoked and unexpired",
);
check(
  /beskt_method_validate\(_method_version_id, false\)/.test(grant) &&
    /bcp_version_is_structurally_candidate_safe\(_method_version_id\)/.test(grant),
  "ITA-CONTENT: only complete, recruitment-only content can be activated",
);
check(
  !/beskt_method_reviews/.test(grant) &&
    !/content_status\s*=\s*'published'/.test(grant) &&
    !/UPDATE public\.beskt_method_versions/.test(mig),
  "ITA-NOT-A-REVIEW: the activation writes no review and never changes the version",
);
check(
  /REVOKE ALL ON FUNCTION public\.bcp_internal_test_activation_active\(uuid, uuid\) FROM PUBLIC, anon, authenticated;/.test(
    mig,
  ) &&
    /REVOKE ALL ON public\.bcp_internal_test_activations FROM PUBLIC, anon, authenticated, service_role;/.test(
      mig,
    ) &&
    /FORCE ROW LEVEL SECURITY/.test(mig),
  "ITA-PRIVILEGE: the predicates are internal and the table is written by no client",
);
check(
  /_md5 <> '17fe1068d9bc3df2bbe8714db5933173'|md5 %\)/.test(read(MIG)) &&
    read(MIG).includes("17fe1068d9bc3df2bbe8714db5933173"),
  "ITA-PRECONDITION: the migration extends only the verified current gate bodies",
);
const prompts =
  /FUNCTION public\.bcp_conduct_topic_prompts\([\s\S]*?\$function\$\s*;/.exec(mig)?.[0] ?? "";
check(
  /OR \(_v\.content_status <> 'published'\s+AND NOT public\.bcp_internal_test_activation_covers\(_a\.employer_id, _v\.id,\s+_a\.pinned_content_hash\)\)/.test(
    prompts,
  ) && read(MIG).includes("91709981bb9f04816c80d3203b36ec7d"),
  "ITA-WORDINGS: the interviewer's wordings open only for the content this employer's activation covered",
);
check(
  /BCP_INTERNAL_TEST_ACTIVATION_ROLLBACK ok/.test(read(RB)) &&
    read(RB).includes("17fe1068d9bc3df2bbe8714db5933173"),
  "ITA-ROLLBACK: the rollback restores the gates exactly and proves it",
);
const db = read(DB);
check(
  db.includes(SUITE) &&
    /if \[ "\$ITA_PASSED" -lt 33 \]; then/.test(db) &&
    /suite_failed "BESKT internal test activation"/.test(db),
  "ITA-HARNESS: db:test runs the suite and refuses a shrunk or failed one",
);
check(
  /-f supabase\/rollback\/20261129090000_bcp_internal_test_activation_rollback\.sql >\/dev\/null\n\n# Stand PR 6 down/.test(
    db,
  ),
  "ITA-HARNESS: it is rolled back before the BESKT chain is unwound",
);
const state = JSON.parse(read(STATE)) as {
  frontier: Array<{ file?: string; hostedState?: string }>;
};
check(
  state.frontier.some(
    (e) =>
      e.file === "20261129090000_bcp_internal_test_activation.sql" && e.hostedState === "pending",
  ),
  "ITA-RELEASE: declared pending until the integration applies it",
);

console.log("");
if (fails.length > 0) {
  console.error(
    `beskt-internal-test-activation:check FAILED (${fails.length} of ${passed + fails.length}).`,
  );
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`beskt-internal-test-activation:check: ${passed} assertions passed.`);
