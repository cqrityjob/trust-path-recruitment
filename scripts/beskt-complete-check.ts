/**
 * 20261130090000 — BESKT as a complete product, asserted from the migration,
 * rollback, suite, harness and release record.
 *
 * The suite proves the behaviour in a replayed database; this guard runs in
 * the fast job and fails if the migration stops being what keeps the
 * complete product safe: security vetting only for the appointed security
 * function, the employer's own attestation and lawful basis on every vetting,
 * an invitation bound only to the confirmed invited account, a token that is
 * never stored, a report that needs a human stance, no score anywhere, and
 * every re-created body pinned and restorable.
 *
 * Run: bun run beskt-complete:check
 */

import { readFileSync } from "node:fs";

const MIG = "supabase/migrations/20261130090000_bcp_beskt_complete.sql";
const RB = "supabase/rollback/20261130090000_bcp_beskt_complete_rollback.sql";
const SUITE = "supabase/tests/bcp_beskt_complete_test.sql";
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

const raw = read(MIG);
const mig = sql(raw);
const fn = (name: string): string =>
  new RegExp(`FUNCTION public\\.${name}\\([\\s\\S]*?(?:\\$\\$;|\\$function\\$\\s*;)`).exec(
    mig,
  )?.[0] ?? "";

const party = fn("bcp_employer_party");
check(
  /a\.mode = 'recruitment_support'\s+OR public\.bcp_is_security_officer\(a\.employer_id, auth\.uid\(\)\)/.test(
    party,
  ),
  "BC-PARTY: a security vetting's employer party is the appointed security function only",
);
check(
  /AND public\.bcp_case_access_ok\(_case_id\);\s*\$function\$/.test(fn("scp_iv_can_read_case")) &&
    /AND public\.bcp_case_access_ok\(_case_id\);\s*\$function\$/.test(fn("scp_iv_can_write_case")),
  "BC-CASE: a case linked to a security vetting is the security function's alone, read and write",
);
check(
  (mig.match(/public\.bcp_employer_party\(/g) ?? []).length >= 12 &&
    !/CREATE POLICY bcp_(assignments|answers|responses|case_links|case_topics)_party_read[\s\S]{0,400}?has_employer_role/.test(
      mig,
    ),
  "BC-POLICY: every party-read policy uses the employer party, never bare membership",
);
const start = fn("bcp_check_start");
check(
  /BCP_NOT_SECURITY_OFFICER/.test(start) &&
    /BCP_ATTESTATION_REQUIRED/.test(start) &&
    /BCP_LAWFUL_BASIS_REQUIRED/.test(start) &&
    /BCP_SECURITY_OWNER_REQUIRED/.test(start) &&
    /BCP_INTERVIEWER_NOT_SECURITY_OFFICER/.test(start),
  "BC-START: a vetting needs the security function, attestation, lawful basis, owner and a security interviewer",
);
check(
  /bcp_assignments_vetting_requirements_check CHECK \([\s\S]*?security_owner_id IS NOT NULL[\s\S]*?role_security_attestation[\s\S]*?lawful_basis_statement/.test(
    mig,
  ),
  "BC-ROW: the three activation requirements hold on the row, not only in the function",
);
const accept = fn("bcp_accept_invitation");
check(
  /_i\.invited_email <> _email/.test(accept) &&
    /BCP_EMAIL_NOT_CONFIRMED/.test(accept) &&
    /BCP_CANDIDATE_IS_EMPLOYER_MEMBER/.test(accept) &&
    /bcp_internal_test_activation_active\(_i\.employer_id, _v\.id\)/.test(accept),
  "BC-INVITE: only the confirmed invited account accepts, never a member, and the gate is re-checked",
);
const create = fn("bcp_create_invitation");
check(
  /token_digest[\s\S]*?public\.bcp_invitation_token_digest\(_token\)/.test(create) &&
    /PERFORM public\.bcp_record_event\([\s\S]*?_result\);\s*[\s\S]*?RETURN _result \|\| jsonb_build_object\('token', _token\);/.test(
      create,
    ) &&
    !/'token', _token\)[\s\S]*?bcp_record_event/.test(create),
  "BC-TOKEN: the token is stored only as a digest and never enters the event log",
);
check(
  /BCP_CONDUCT_STANCE_MISSING/.test(fn("bcp_conduct_report_blockers")) &&
    /bcp_conduct_report_extensions\(_session_id\) \|\| jsonb_build_object/.test(
      fn("bcp_conduct_build_report_basis"),
    ),
  "BC-STANCE: a signature alone never finalises, and the stance rides the previewed basis",
);
check(
  /BCP_POSITIONS_NOT_LOCKED/.test(fn("bcp_conduct_record_stance")) &&
    /beskt_text_instructs_scoring\(_stance\)/.test(fn("bcp_conduct_record_stance")),
  "BC-STANCE-ORDER: the stance comes after the locked positions and states no score",
);
check(
  !/\b(score|risk_class|risk_level|ranking|pass_fail|recommendation)\s+(text|integer|numeric|boolean)/i.test(
    mig,
  ),
  "BC-NO-SCORE: no score, risk class, ranking, pass/fail or recommendation column exists",
);
check(
  /a\.mode <> 'security_vetting_support'\s+AND \(_item\.permitted_mode <> 'recruitment_support'/.test(
    fn("bcp_save_answers"),
  ),
  "BC-CONTENT: security-vetting content is answered in a security vetting and never elsewhere",
);
check(
  /topic_reason IN \('omitted', 'discuss_orally', 'candidate_disclosed'\)/.test(mig) &&
    /\(topic_reason = 'candidate_disclosed'\) = \(trigger_rule_key IS NOT NULL\)/.test(mig),
  "BC-TOPIC: a disclosed topic always names the governed rule that fired",
);
check(
  (raw.match(/BCP_COMPLETE_PRECONDITION:/g) ?? []).length === 28,
  "BC-PRECONDITION: all 28 re-created bodies are md5-pinned to the verified current ones",
);
check(
  /BCP_BESKT_COMPLETE_ROLLBACK ok/.test(read(RB)) &&
    (read(RB).match(/was not restored exactly/g) ?? []).length === 28 &&
    /BCP_COMPLETE_ROLLBACK_BLOCKED/.test(read(RB)),
  "BC-ROLLBACK: the rollback restores every body exactly and refuses to strand new records",
);
const db = read(DB);
check(
  db.includes(SUITE) &&
    /if \[ "\$BC_PASSED" -lt 45 \]; then/.test(db) &&
    /suite_failed "BESKT complete product"/.test(db) &&
    db.indexOf("20261130090000_bcp_beskt_complete_rollback.sql >/dev/null") <
      db.indexOf("20261129090000_bcp_internal_test_activation_rollback.sql >/dev/null"),
  "BC-HARNESS: db:test runs the suite, refuses a shrunk one, and unwinds 20261130 before 20261129",
);
const state = JSON.parse(read(STATE)) as {
  frontier: Array<{ file?: string; hostedState?: string }>;
};
check(
  state.frontier.some(
    (e) => e.file === "20261130090000_bcp_beskt_complete.sql" && e.hostedState === "pending",
  ),
  "BC-RELEASE: declared pending until the integration applies it",
);

console.log("");
if (fails.length > 0) {
  console.error(`beskt-complete:check FAILED (${fails.length} of ${passed + fails.length}).`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`beskt-complete:check: ${passed} assertions passed.`);
