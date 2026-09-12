/**
 * BESKT PR 3 — the candidate-preparation source guard.
 *
 * The database suite (supabase/tests/bcp_candidate_preparation_test.sql)
 * proves behaviour against a replayed schema, but it runs only in the database
 * job. This guard reads the migration, the rollback, the suite, the harness,
 * the application source and the release bookkeeping STRUCTURALLY, in the fast
 * job, so a defect that never reaches a replay is still caught — and so every
 * material assertion has a planted negative control
 * (scripts/negative-controls/beskt-candidate-preparation-controls.ts).
 *
 * It inspects the real computation: function bodies with comments stripped,
 * DDL column lists, grant statements, trigger definitions and the exact text
 * PR #218 shipped — never a reassuring comment, and never an error-message
 * string on its own.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

const MIGRATION_NAME = "20261110090000_bcp_candidate_preparation.sql";
const MIGRATION = join(ROOT, "supabase/migrations", MIGRATION_NAME);
const ROLLBACK = join(
  ROOT,
  "supabase/rollback/20261110090000_bcp_candidate_preparation_rollback.sql",
);
const SUITE = join(ROOT, "supabase/tests/bcp_candidate_preparation_test.sql");
const PR2_MIGRATION = join(
  ROOT,
  "supabase/migrations/20261108090000_beskt_governed_method_content.sql",
);
const PR2_SUITE = join(ROOT, "supabase/tests/beskt_governed_content_test.sql");
const DB_TEST = join(ROOT, "scripts/db-test.sh");
const ROLLBACK_SUITE = join(ROOT, "supabase/tests/scp_a_rollback_test.sql");
const RELEASE_STATE = join(ROOT, "supabase/release-state.json");
const PACKAGE = join(ROOT, "package.json");
const CI = join(ROOT, ".github/workflows/ci.yml");
const TSCONFIG = join(ROOT, "tsconfig.scripts.json");
const FRONTIER = join(ROOT, "scripts/release-frontier-check.ts");
const DICTIONARIES = join(ROOT, "src/i18n/dictionaries.ts");
const TYPES = join(ROOT, "src/integrations/supabase/types.ts");
const FUNCTIONS = join(ROOT, "src/lib/beskt/candidate-preparation.functions.ts");
const LIBRARY_SECTION = join(ROOT, "src/components/beskt/MethodSupportSection.tsx");
const APPLICATION_PANEL = join(ROOT, "src/components/beskt/BesktApplicationPanel.tsx");
const CANDIDATE_UI = join(ROOT, "src/components/beskt/CandidatePreparation.tsx");
const MY_PREPARATIONS = join(ROOT, "src/components/beskt/MyPreparations.tsx");
const CANDIDATE_ROUTE = join(
  ROOT,
  "src/routes/_authenticated.my-career.preparation.$assignmentId.tsx",
);
const LIBRARY_ROUTE = join(
  ROOT,
  "src/routes/_authenticated.employer.$employerSlug.assessments.library.tsx",
);
const APPLICATION_ROUTE = join(
  ROOT,
  "src/routes/_authenticated.employer.$employerSlug.applications.$applicationId.tsx",
);
const E2E = join(ROOT, "e2e/beskt-candidate-preparation.spec.ts");

/** The six runtime tables. Named outside `beskt_` on purpose; see the migration. */
const TABLES = [
  "bcp_pilot_grants",
  "bcp_assignments",
  "bcp_notice_acknowledgements",
  "bcp_responses",
  "bcp_answers",
  "bcp_events",
] as const;

/** Every governed mutation a browser principal can reach. */
const CLIENT_MUTATIONS = [
  "bcp_grant_pilot",
  "bcp_revoke_pilot",
  "bcp_assign",
  "bcp_mark_opened",
  "bcp_acknowledge_notice",
  "bcp_save_answers",
  "bcp_submit",
  "bcp_cancel",
] as const;

/** Helpers no client role may execute. */
const INTERNAL_FUNCTIONS = [
  "bcp_record_event",
  "bcp_operation_begin",
  "bcp_canonical_answers",
  "bcp_answers_content_hash",
  "bcp_routing_answers",
  "bcp_visible_items",
  "bcp_party_can_read_method_version",
] as const;

/** The three PR #218 contracts PR 3 re-creates, and the rollback must restore. */
const RESTORED_PR2_FUNCTIONS = [
  "beskt_can_read_version",
  "beskt_published_method",
  "beskt_readable_published_versions",
] as const;

/** The nine matters the candidate notice must cover (PR 1 section 6). */
const NOTICE_SECTIONS = [
  "purpose",
  "use_of_information",
  "human_decision",
  "not_a_test_with_score",
  "may_omit_questions",
  "oral_discussion",
  "review_and_correct",
  "who_can_access",
  "retention",
] as const;

const failures: string[] = [];
let assertions = 0;

function check(ok: boolean, diagnostic: string): void {
  assertions += 1;
  if (!ok) failures.push(diagnostic);
  else console.log(`  ok ${diagnostic}`);
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

function stripComments(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, "");
}

/** The text of one `CREATE OR REPLACE FUNCTION public.<name>(` up to its `$$;`. */
function functionText(sql: string, name: string): string | null {
  const re = new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\(`);
  const m = re.exec(sql);
  if (!m) return null;
  const start = m.index;
  const bodyStart = sql.indexOf("$$", start);
  if (bodyStart === -1) return null;
  const bodyEnd = sql.indexOf("$$;", bodyStart + 2);
  if (bodyEnd === -1) return null;
  return sql.slice(start, bodyEnd + 3);
}

function functionBody(fn: string): string {
  return stripComments(fn.slice(fn.indexOf("$$") + 2));
}

/** The column list of a `CREATE TABLE public.<name> ( ... );` statement. */
function tableColumns(sql: string, table: string): string[] {
  const start = sql.indexOf(`CREATE TABLE public.${table} (`);
  if (start === -1) return [];
  let depth = 0;
  let i = sql.indexOf("(", start);
  const open = i;
  for (; i < sql.length; i += 1) {
    if (sql[i] === "(") depth += 1;
    if (sql[i] === ")") {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const body = stripComments(sql.slice(open + 1, i));
  const parts: string[] = [];
  let buf = "";
  depth = 0;
  for (const ch of body) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts
    .map((p) => p.split(/\s+/)[0] ?? "")
    .filter((n) => n.length > 0 && !/^(CONSTRAINT|UNIQUE|PRIMARY|CHECK|FOREIGN|EXCLUDE)$/i.test(n));
}

const sql = read(MIGRATION);
const bare = stripComments(sql);
const rb = read(ROLLBACK);
const rbBare = stripComments(rb);
const pr2 = read(PR2_MIGRATION);

// ── 1. The domain boundary: the runtime is NOT in the beskt_ prefix ───────
{
  check(
    !/CREATE TABLE public\.beskt_/.test(bare),
    "BCP-DOMAIN: PR 3 creates no table under the beskt_ content prefix, so PR #218's no-runtime-data invariant stays literally true",
  );
  for (const table of TABLES) {
    check(
      bare.includes(`CREATE TABLE public.${table} (`),
      `BCP-DOMAIN: ${table} is created by the migration`,
    );
  }
  check(
    !/ALTER TABLE public\.beskt_[a-z_]+\s+(ADD|DROP) COLUMN/i.test(bare),
    "BCP-DOMAIN: PR 3 adds and drops no column on any PR #218 content table",
  );
}

// ── 2. Every exposed table fails closed ───────────────────────────────────
{
  for (const table of TABLES) {
    check(
      new RegExp(`ALTER TABLE public\\.${table}\\s+ENABLE ROW LEVEL SECURITY`).test(bare) &&
        new RegExp(`ALTER TABLE public\\.${table}\\s+FORCE ROW LEVEL SECURITY`).test(bare),
      `BCP-RLS: ${table} carries ENABLE and FORCE ROW LEVEL SECURITY`,
    );
    check(
      new RegExp(
        `REVOKE ALL ON public\\.${table}\\s+FROM PUBLIC, anon, authenticated, service_role;`,
      ).test(bare),
      `BCP-GRANTS: ${table} is revoked from PUBLIC, anon, authenticated AND service_role -- silence would be a grant`,
    );
    check(
      new RegExp(`GRANT SELECT ON public\\.${table}\\s+TO authenticated, service_role;`).test(bare),
      `BCP-GRANTS: ${table} re-grants SELECT only`,
    );
    check(
      !new RegExp(`GRANT (ALL|INSERT|UPDATE|DELETE)[^;]*ON public\\.${table}`).test(bare),
      `BCP-GRANTS: no write privilege is granted on ${table} to any role`,
    );
    check(
      new RegExp(`CREATE POLICY [a-z_]+ ON public\\.${table}\\s+FOR SELECT`).test(bare),
      `BCP-RLS: ${table} carries a SELECT policy, so its grant is not dead`,
    );
    check(
      !new RegExp(
        `CREATE POLICY [a-z_]+ ON public\\.${table}\\s+FOR (INSERT|UPDATE|DELETE|ALL)`,
      ).test(bare),
      `BCP-RLS: ${table} carries no write policy -- every write goes through a governed RPC`,
    );
  }
  check(
    !/USING \(true\)/.test(bare) && !/WITH CHECK \(true\)/.test(bare),
    "BCP-RLS: no unconditional policy exists anywhere in PR 3",
  );
}

// ── 3. No interpretation can hide in the schema ───────────────────────────
{
  const forbidden =
    /(score|level|weight|threshold|total|rank|pass|fail|suitab|credib|truthful|recommend|risk|verdict|probab|sentiment|emotion|deception|hire|points)/i;
  const offending: string[] = [];
  for (const table of TABLES) {
    for (const column of tableColumns(sql, table)) {
      if (forbidden.test(column)) offending.push(`${table}.${column}`);
    }
  }
  check(
    offending.length === 0,
    `BCP-NO-SCORE: no scoring, ranking, suitability, credibility or verdict column exists (${offending.join(", ") || "none"})`,
  );

  const jsonbTables = TABLES.filter((t) => {
    const start = sql.indexOf(`CREATE TABLE public.${t} (`);
    const end = sql.indexOf(");", start);
    return /\bjsonb\b/.test(stripComments(sql.slice(start, end)));
  });
  check(
    jsonbTables.length === 1 && jsonbTables[0] === "bcp_events",
    `BCP-TYPED-ANSWERS: jsonb exists only on the event ledger, so no ungoverned answer document can be stored (${jsonbTables.join(", ") || "none"})`,
  );

  check(
    /CHECK \(response_state IN \('answered', 'omitted', 'discuss_orally'\)\)/.test(bare),
    "BCP-NEUTRAL-STATES: the candidate response states are exactly answered / omitted / discuss_orally",
  );
  check(
    /CONSTRAINT bcp_answers_neutral_is_empty_check CHECK \(\s*response_state = 'answered'\s*OR \(value_boolean IS NULL AND value_text IS NULL/.test(
      bare,
    ),
    "BCP-NEUTRAL-STATES: a neutral state carries no value at all, so it can never be read as an answer",
  );
  check(
    /mode text NOT NULL DEFAULT 'recruitment_support' CHECK \(mode = 'recruitment_support'\)/.test(
      bare,
    ),
    "BCP-SECURITY-VETTING: security_vetting_support is not representable on an assignment",
  );
  check(
    /pinned_release_scope text NOT NULL CHECK \(pinned_release_scope = 'synthetic_internal_only'\)/.test(
      bare,
    ),
    "BCP-RELEASE-SCOPE: the assignment records the release scope that admitted it",
  );
  check(
    !/ALTER TABLE public\.beskt_method_versions/.test(bare),
    "BCP-RELEASE-SCOPE: PR 3 does not alter the PR #218 release_scope constraint",
  );
}

// ── 4. Every governed mutation is idempotent and compare-and-swapped ──────
{
  for (const fn of CLIENT_MUTATIONS) {
    const text = functionText(sql, fn);
    if (text === null) {
      check(false, `BCP-MUTATION: ${fn} exists`);
      continue;
    }
    const body = functionBody(text);
    check(
      /_operation_id uuid/.test(text.slice(0, text.indexOf("$$"))),
      `BCP-IDEMPOTENCY: ${fn} takes an operation id`,
    );
    check(
      body.includes("public.beskt_request_hash(") && body.includes("bcp_operation_begin("),
      `BCP-IDEMPOTENCY: ${fn} hashes its exact request and answers a replay`,
    );
    const replayAt = body.indexOf("_replay IS NOT NULL THEN RETURN _replay");
    const writeAt = Math.min(
      ...["INSERT INTO", "UPDATE public."]
        .map((w) => body.indexOf(w))
        .filter((i) => i >= 0)
        .concat([Number.MAX_SAFE_INTEGER]),
    );
    check(
      replayAt > 0 && replayAt < writeAt,
      `BCP-IDEMPOTENCY: ${fn} answers the replay BEFORE its first write, so a retry is never a second one`,
    );
    check(
      body.includes("bcp_record_event("),
      `BCP-LEDGER: ${fn} writes its append-only event in the same transaction`,
    );
    check(/SET search_path = public/.test(text), `BCP-SECURITY: ${fn} pins its search_path`);
    check(
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon`).test(bare),
      `BCP-SECURITY: ${fn} is revoked from PUBLIC and anon`,
    );
  }

  for (const fn of ["bcp_save_answers", "bcp_submit"] as const) {
    const body = functionBody(functionText(sql, fn) ?? "");
    check(
      body.includes("_expected_revision") && body.includes("BCP_STALE_REVISION"),
      `BCP-CAS: ${fn} requires the revision the caller saw and refuses a stale one`,
    );
    check(
      body.indexOf("BCP_STALE_REVISION") <
        Math.min(
          ...["INSERT INTO", "UPDATE public.", "DELETE FROM"]
            .map((w) => body.indexOf(w))
            .filter((i) => i >= 0)
            .concat([Number.MAX_SAFE_INTEGER]),
        ),
      `BCP-CAS: ${fn} refuses a stale revision WITHOUT writing`,
    );
  }
}

// ── 5. Internal helpers are unreachable by any client role ────────────────
{
  for (const fn of INTERNAL_FUNCTIONS) {
    check(
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\)\\s*FROM PUBLIC, anon, authenticated`,
      ).test(bare),
      `BCP-INTERNAL: ${fn} is revoked from PUBLIC, anon and authenticated`,
    );
    check(
      !new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\)\\s*TO authenticated`).test(
        bare,
      ),
      `BCP-INTERNAL: ${fn} is not re-granted to authenticated`,
    );
  }
  for (const guard of [
    "bcp_guard_append_only",
    "bcp_guard_pilot_grants",
    "bcp_guard_assignment",
    "bcp_guard_response",
    "bcp_guard_answer",
  ]) {
    check(
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${guard}\\(\\) FROM PUBLIC, anon, authenticated`,
      ).test(bare),
      `BCP-INTERNAL: the trigger function ${guard} is unreachable by a client role`,
    );
  }
}

// ── 6. Append-only and immutability are TRIGGERS, not policies ────────────
{
  check(
    /CREATE TRIGGER bcp_events_append_only\s+BEFORE UPDATE OR DELETE ON public\.bcp_events/.test(
      bare,
    ),
    "BCP-APPEND-ONLY: the event ledger refuses UPDATE and DELETE for every caller, BYPASSRLS included",
  );
  check(
    /CREATE TRIGGER bcp_notice_acknowledgements_append_only\s+BEFORE UPDATE OR DELETE ON public\.bcp_notice_acknowledgements/.test(
      bare,
    ),
    "BCP-APPEND-ONLY: a notice acknowledgement can never be edited or deleted",
  );
  const response = functionBody(functionText(sql, "bcp_guard_response") ?? "");
  check(
    /IF OLD\.response_state = 'submitted' THEN\s*RAISE EXCEPTION 'BCP_RESPONSE_IMMUTABLE/.test(
      response,
    ) && /IF TG_OP = 'DELETE' THEN\s*RAISE EXCEPTION 'BCP_RESPONSE_NO_DELETE/.test(response),
    "BCP-IMMUTABLE: a submitted response is frozen and is never deleted -- the CONDITION, not the message",
  );
  const answer = functionBody(functionText(sql, "bcp_guard_answer") ?? "");
  check(
    (answer.match(/FOR SHARE/g) ?? []).length >= 3 &&
      /WHERE r\.id = NEW\.response_id FOR SHARE/.test(answer) &&
      /WHERE r\.id = OLD\.response_id FOR SHARE/.test(answer) &&
      answer.includes("BCP_ANSWER_FROZEN"),
    "BCP-IMMUTABLE: every answer write locks its owning response FOR SHARE before reading its state, then refuses a frozen one",
  );
  const assignment = functionBody(functionText(sql, "bcp_guard_assignment") ?? "");
  check(
    assignment.includes("BCP_ASSIGNMENT_IMMUTABLE") &&
      assignment.includes("method_version_id IS DISTINCT FROM OLD.method_version_id") &&
      assignment.includes("pinned_content_hash IS DISTINCT FROM OLD.pinned_content_hash"),
    "BCP-IMMUTABLE: what was assigned -- version, profile, hash, parties -- can never be changed",
  );
  check(
    assignment.includes("BCP_ASSIGNMENT_TRANSITION") &&
      assignment.includes("BCP_ASSIGNMENT_SUBMITTED_IMMUTABLE") &&
      assignment.includes("BCP_ASSIGNMENT_NO_DELETE"),
    "BCP-LIFECYCLE: the assignment lifecycle is constrained, forward-only and never deleted",
  );
  const grants = functionBody(functionText(sql, "bcp_guard_pilot_grants") ?? "");
  check(
    grants.includes("BCP_PILOT_UNGOVERNED_WRITE") &&
      grants.includes("BCP_PILOT_APPEND_ONLY") &&
      grants.includes("BCP_PILOT_UNREVOKE"),
    "BCP-AUTHORITY: a pilot grant is written only by its RPCs, revoked once, and never deleted or reinstated",
  );
}

// ── 7. The ONE read-contract change, and no more ──────────────────────────
{
  const canRead = functionBody(functionText(sql, "beskt_can_read_version") ?? "");
  check(
    canRead.includes("beskt_governance_can_read_version") &&
      canRead.includes("bcp_party_can_read_method_version"),
    "BCP-READ-CONTRACT: beskt_can_read_version becomes exactly governance-reader OR preparation-party",
  );

  const governance = functionText(sql, "beskt_governance_can_read_version");
  check(governance !== null, "BCP-READ-CONTRACT: the governance predicate is introduced");
  const govBody = functionBody(governance ?? "");
  check(
    govBody.includes("scp_interview_can_read") && govBody.includes("internal_qa"),
    "BCP-READ-CONTRACT: it carries PR #218's own decision, unchanged",
  );
  check(
    !/bcp_/.test(govBody),
    "BCP-READ-CONTRACT: and is NOT contaminated with the preparation branch",
  );

  const pr2CanRead = functionText(pr2, "beskt_can_read_version");
  check(
    pr2CanRead !== null && functionBody(pr2CanRead).trim() === govBody.trim(),
    "BCP-READ-CONTRACT: the governance predicate is PR #218's beskt_can_read_version body verbatim, not a paraphrase",
  );

  for (const fn of ["beskt_published_method", "beskt_readable_published_versions"] as const) {
    const body = functionBody(functionText(sql, fn) ?? "");
    check(
      body.includes("beskt_governance_can_read_version"),
      `BCP-READ-CONTRACT: ${fn} gates on the GOVERNANCE predicate, so a preparation party cannot read the full governed document`,
    );
    check(
      !/public\.beskt_can_read_version\(/.test(body),
      `BCP-READ-CONTRACT: ${fn} no longer gates on the widened predicate`,
    );
  }

  const party = functionBody(functionText(sql, "bcp_party_can_read_method_version") ?? "");
  check(
    party.includes("bcp_version_is_candidate_safe") &&
      party.includes("lifecycle_state <> 'cancelled'") &&
      party.includes("candidate_user_id = auth.uid()"),
    "BCP-READ-CONTRACT: the party branch requires a LIVE assignment pinning a candidate-safe version",
  );
  const safe = functionBody(functionText(sql, "bcp_version_is_candidate_safe") ?? "");
  check(
    safe.includes("content_status = 'published'") &&
      safe.includes("v.mode = 'recruitment_support'") &&
      safe.includes("p.permitted_mode = 'security_vetting_support'") &&
      safe.includes("i.sensitivity_class = 'security_vetting_only'") &&
      safe.includes("authorised_security_function"),
    "BCP-SECURITY-VETTING: candidate-safe means published, recruitment support, and NO security-vetting row anywhere in the version",
  );

  check(
    !/CREATE OR REPLACE FUNCTION public\.beskt_resolve_item_sequence\(/.test(bare),
    "BCP-REUSE: PR 3 does not re-create, fork or alter PR #218's routing authority",
  );
  const visible = functionBody(functionText(sql, "bcp_visible_items") ?? "");
  check(
    visible.includes("public.beskt_resolve_item_sequence("),
    "BCP-REUSE: candidate visibility comes from PR #218's resolver",
  );
  const routing = functionBody(functionText(sql, "bcp_routing_answers") ?? "");
  check(
    routing.includes("a.response_state = 'answered'"),
    "BCP-NEUTRAL-STATES: an omitted or discuss-orally answer never reaches the routing map, so it can open no adverse branch",
  );
}

// ── 8. Assignability is an explicit, revocable, fail-closed gate ──────────
{
  const assign = functionBody(functionText(sql, "bcp_assign") ?? "");
  check(
    assign.includes("bcp_pilot_grant_active(") && assign.includes("BCP_NOT_ASSIGNABLE"),
    "BCP-GATE: nothing is assignable without a live pilot grant",
  );
  check(
    /IF _v\.content_status <> 'published' THEN\s*RAISE EXCEPTION 'BCP_METHOD_NOT_PUBLISHED/.test(
      assign,
    ) &&
      /IF _v\.mode <> 'recruitment_support' THEN\s*RAISE EXCEPTION 'BCP_METHOD_MODE_NOT_PERMITTED/.test(
        assign,
      ) &&
      /IF NOT public\.bcp_version_is_candidate_safe\(_method_version_id\) THEN\s*RAISE EXCEPTION 'BCP_METHOD_NOT_CANDIDATE_SAFE/.test(
        assign,
      ),
    "BCP-GATE: a draft, suspended, retired or security-vetting version is refused by a reachable condition",
  );
  check(
    /_v\.content_hash IS DISTINCT FROM _expected_content_hash THEN\s*RAISE EXCEPTION 'BCP_CONTENT_HASH_MISMATCH/.test(
      assign,
    ) &&
      /_p\.method_version_id IS DISTINCT FROM _method_version_id THEN\s*RAISE EXCEPTION 'BCP_PROFILE_NOT_IN_VERSION/.test(
        assign,
      ),
    "BCP-GATE: a moved content hash and a foreign exposure profile are refused by a reachable condition",
  );
  check(
    assign.includes("has_employer_role(auth.uid()") &&
      assign.includes("employer_is_active_status(") &&
      assign.includes("BCP_CROSS_TENANT_JOB"),
    "BCP-REUSE: authorisation reuses the existing employer membership and status contracts",
  );
  check(
    assign.includes("_ja.applicant_user_id") && !assign.includes("_candidate_display_name"),
    "BCP-REUSE: the candidate is the APPLICATION's own applicant, never a name the recruiter typed",
  );
  check(
    !/INSERT INTO (public\.)?(auth\.users|employers|jobs|job_applications)\b/.test(bare),
    "BCP-REUSE: PR 3 creates no parallel user, employer, job, application or candidate record",
  );
  const grant = functionBody(functionText(sql, "bcp_grant_pilot") ?? "");
  check(
    grant.includes("is_platform_admin(auth.uid())") && grant.includes("BCP_NOT_PLATFORM_ADMIN"),
    "BCP-GATE: only a platform administrator may admit an employer to the pilot",
  );
  check(
    /SELECT count\(\*\) INTO _n FROM public\.bcp_pilot_grants;/.test(bare) &&
      /pilot grant\(s\) were seeded/.test(sql),
    "BCP-NO-SEED: the migration proves it seeded no pilot grant and no preparation -- production stays honest",
  );
}

// ── 9. The notice is governed, complete, and not consent ──────────────────
{
  const sections = functionBody(functionText(sql, "bcp_notice_sections") ?? "");
  for (const key of NOTICE_SECTIONS) {
    check(sections.includes(`'${key}'`), `BCP-NOTICE: the notice covers "${key}"`);
  }
  const ackText = functionText(sql, "bcp_acknowledge_notice") ?? "";
  const ack = functionBody(ackText);
  check(
    ack.includes("bcp_notice_hash(") &&
      /_notice_content_hash IS DISTINCT FROM _expected THEN\s*RAISE EXCEPTION 'BCP_NOTICE_HASH_MISMATCH/.test(
        ack,
      ),
    "BCP-NOTICE: the acknowledgement compares the caller's hash against the server's own, so a client cannot acknowledge a notice it invented",
  );
  check(
    /acknowledgement_kind text NOT NULL DEFAULT 'information_received'\s*CHECK \(acknowledgement_kind = 'information_received'\)/.test(
      bare,
    ),
    "BCP-NOTICE: the acknowledgement is an information receipt and 'consent' is not representable",
  );
  check(
    !/\bconsent\b/i.test(stripComments(ackText)),
    "BCP-NOTICE: the acknowledgement path never calls itself consent",
  );
  check(
    /CONSTRAINT bcp_assignments_notice_first_check/.test(bare) &&
      /IF _a\.acknowledged_at IS NULL THEN\s*RAISE EXCEPTION 'BCP_NOTICE_NOT_ACKNOWLEDGED/.test(
        functionBody(functionText(sql, "bcp_save_answers") ?? ""),
      ) &&
      /IF _a\.acknowledged_at IS NULL THEN\s*RAISE EXCEPTION 'BCP_NOTICE_NOT_ACKNOWLEDGED/.test(
        functionBody(functionText(sql, "bcp_submit") ?? ""),
      ),
    "BCP-NOTICE: nothing can be answered or submitted before the notice is acknowledged, by constraint AND by a reachable condition in both RPCs",
  );
}

// ── 10. Submit is atomic, complete and final; the boundary holds ──────────
{
  const submit = functionBody(functionText(sql, "bcp_submit") ?? "");
  check(submit.includes("BCP_ALREADY_SUBMITTED"), "BCP-SUBMIT: a second submission is refused");
  check(
    submit.includes("DELETE FROM public.bcp_answers") &&
      submit.includes("NOT (a.item_id = ANY (_visible))"),
    "BCP-SUBMIT: a stored answer the final routing no longer shows is removed, so it has no downstream effect",
  );
  check(
    submit.includes("BCP_INCOMPLETE"),
    "BCP-SUBMIT: every shown question must be answered, skipped or marked oral first",
  );
  check(
    submit.includes("bcp_answers_content_hash(") &&
      submit.includes("submitted_method_content_hash"),
    "BCP-SUBMIT: the exact submitted answers AND the pinned method content are hashed",
  );
  const readback = functionBody(functionText(sql, "bcp_employer_readback") ?? "");
  check(
    readback.includes("response_state = 'submitted'") &&
      readback.includes("CASE WHEN _r.id IS NULL THEN NULL"),
    "BCP-DRAFT-PRIVACY: the employer readback returns answers only once submitted -- absent, never partial",
  );
  check(
    !/score|rank|suitab|credib|verdict|recommend|observation|conclusion/i.test(readback),
    "BCP-NO-SCORE: the employer readback computes no judgement of any kind",
  );
  check(
    !/UPDATE public\.job_applications/.test(bare),
    "BCP-BOUNDARY: nothing in PR 3 writes a job application status",
  );
  for (const excluded of ["observation", "assessor", "panel", "transcript", "report"]) {
    check(
      !new RegExp(`CREATE TABLE public\\.[a-z_]*${excluded}`).test(bare),
      `BCP-BOUNDARY: PR 3 creates no ${excluded} structure -- that is PR 4 onwards`,
    );
  }
}

// ── 11. Postflight, rollback and harness ──────────────────────────────────
{
  check(
    /RAISE NOTICE 'BESKT_CANDIDATE_PREPARATION_PROOF ok'/.test(sql),
    "BCP-PROOF: the migration proves its own claims from the catalogue before it completes",
  );
  check(
    /relrowsecurity AND c\.relforcerowsecurity/.test(sql) &&
      /has_table_privilege\(_role, 'public\.' \|\| _t, _priv\)/.test(sql),
    "BCP-PROOF: the postflight reads RLS and privileges from the catalogue, not from a comment",
  );

  check(
    /pg_constraint/.test(rbBare) &&
      /pg_views/.test(rbBare) &&
      /pg_policies/.test(rbBare) &&
      /reltype = ANY \(p\.proargtypes\)/.test(rbBare) &&
      // Seven refusals -- six dependency kinds plus the submitted-preparation
      // one -- and every one of them REACHABLE: a guard whose condition is
      // dead refuses nothing at all.
      (rbBare.match(/IF _n > 0 THEN\s*RAISE EXCEPTION 'BCP_ROLLBACK BLOCKED/g) ?? []).length === 7,
    "BCP-ROLLBACK: it refuses on a foreign key, a view, a trigger, a policy, a calling function or a row-type dependency from outside the domain -- each by a reachable condition",
  );
  check(
    /response_state = 'submitted'/.test(rbBare) &&
      /candidate preparation\(s\) have been submitted/.test(rb),
    "BCP-ROLLBACK: it refuses rather than silently destroying a submitted candidate basis",
  );
  check(!/CASCADE/.test(rbBare), "BCP-ROLLBACK: nothing is dropped with CASCADE");
  check(
    TABLES.every((t) => rbBare.includes(`DROP TABLE IF EXISTS public.${t};`)) &&
      rbBare.indexOf("DROP TABLE IF EXISTS public.bcp_answers;") <
        rbBare.indexOf("DROP TABLE IF EXISTS public.bcp_responses;") &&
      rbBare.indexOf("DROP TABLE IF EXISTS public.bcp_events;") <
        rbBare.indexOf("DROP TABLE IF EXISTS public.bcp_assignments;") &&
      rbBare.indexOf("DROP TABLE IF EXISTS public.bcp_responses;") <
        rbBare.indexOf("DROP TABLE IF EXISTS public.bcp_assignments;"),
    "BCP-ROLLBACK: tables are dropped child-first, in an explicit order",
  );
  for (const fn of RESTORED_PR2_FUNCTIONS) {
    const original = functionText(pr2, fn);
    const restored = functionText(rb, fn);
    check(
      original !== null && restored !== null && original === restored,
      `BCP-ROLLBACK: ${fn} is restored to PR #218's text VERBATIM, byte for byte`,
    );
  }
  check(
    rbBare.includes("DROP FUNCTION IF EXISTS public.beskt_governance_can_read_version(uuid);"),
    "BCP-ROLLBACK: the PR 3 governance predicate is removed with the rest of PR 3",
  );
  check(
    /RAISE NOTICE 'BESKT_CANDIDATE_PREPARATION_ROLLBACK ok'/.test(rb),
    "BCP-ROLLBACK: it verifies from the catalogue that nothing of PR 3 survives",
  );
  check(
    /the PR #218 domain has % tables, expected 13/.test(rb),
    "BCP-ROLLBACK: and that PR #218's own thirteen tables are untouched",
  );

  const dbTest = read(DB_TEST);
  check(
    dbTest.includes("supabase/tests/bcp_candidate_preparation_test.sql"),
    "BCP-HARNESS: db-test.sh runs the PR 3 behaviour suite",
  );
  check(
    /BCP_PASSED" -lt 195/.test(dbTest),
    "BCP-HARNESS: with an assertion floor, so a silently shrinking suite fails",
  );
  check(
    dbTest.indexOf("supabase/rollback/20261110090000_bcp_candidate_preparation_rollback.sql") <
      dbTest.indexOf("supabase/rollback/20261108090000_beskt_governed_method_content_rollback.sql"),
    "BCP-HARNESS: db-test.sh unwinds PR 3 before PR 2, in reverse release order",
  );
  check(
    dbTest.indexOf("supabase/rollback/20261110090000_bcp_candidate_preparation_rollback.sql") <
      dbTest.indexOf("supabase/rollback/20261108090000_beskt_governed_method_content_rollback.sql"),
    "BCP-HARNESS: PR 3 is stood down before PR 2's own rollback is exercised at all",
  );
  check(
    read(SUITE).includes(
      "C11.3 an assignment pins a governed method version by foreign key, which is why PR 2 cannot unwind first",
    ),
    "BCP-HARNESS: and the REASON for that ordering is asserted from the catalogue, not left as a comment",
  );
  check(
    dbTest.includes("BESKT_CANDIDATE_PREPARATION_PROOF ok"),
    "BCP-HARNESS: the PR 3 migration is re-applied over its own rolled-back state",
  );

  const rollbackSuite = read(ROLLBACK_SUITE);
  check(
    rollbackSuite.includes("BESKT PR 3 unwinds first of all") &&
      rollbackSuite.indexOf("DROP TABLE IF EXISTS public.bcp_assignments;") <
        rollbackSuite.indexOf("DROP TABLE IF EXISTS public.beskt_method_versions;"),
    "BCP-HARNESS: the documented rollback procedure unwinds PR 3 before PR 2, with the same drop set",
  );

  const suite = read(SUITE);
  check(
    suite.trimEnd().endsWith("ROLLBACK;"),
    "BCP-SUITE: the behaviour suite rolls itself back, so it seeds nothing",
  );
  check(
    suite.includes("\\i supabase/tests/beskt_governed_content_fixture.sql"),
    "BCP-SUITE: it reuses PR #218's synthetic fixture rather than inventing a second one",
  );
  check(/SYNTETISK/.test(suite), "BCP-SUITE: everything it plants is named as synthetic");
  for (const needle of [
    "BCP_OPERATION_PAYLOAD_MISMATCH",
    "BCP_OPERATION_ACTOR_MISMATCH",
    "BCP_STALE_REVISION",
    "BCP_NOT_EMPLOYER_MEMBER",
    "BCP_NOT_CANDIDATE",
    "BCP_METHOD_NOT_PUBLISHED",
    "BCP_METHOD_MODE_NOT_PERMITTED",
    "BCP_CONTENT_HASH_MISMATCH",
    "BCP_PROFILE_NOT_IN_VERSION",
    "BCP_ITEM_NOT_VISIBLE",
    "BCP_ORAL_NOT_ALLOWED",
    "BCP_ALREADY_SUBMITTED",
    "BCP_INCOMPLETE",
    "BCP_RESPONSE_IMMUTABLE",
    "BCP_ANSWER_FROZEN",
    "BCP_NOT_ASSIGNABLE",
  ]) {
    check(suite.includes(needle), `BCP-SUITE: the suite proves the ${needle} refusal`);
  }
  check(
    read(PR2_SUITE).length > 0,
    "BCP-SUITE: PR #218's own suite is left in place and still runs on its own",
  );
}

// ── 12. Release bookkeeping ───────────────────────────────────────────────
{
  const state = JSON.parse(read(RELEASE_STATE)) as {
    frontier: Array<{ file: string; hostedState: string; introduces?: Array<{ object: string }> }>;
  };
  const entry = state.frontier.find((f) => f.file === MIGRATION_NAME);
  check(entry !== undefined, "BCP-RELEASE: the PR 3 migration is on the release frontier");
  check(
    entry?.hostedState === "pending",
    "BCP-RELEASE: and is recorded as NOT applied to the hosted database",
  );
  check(
    /const expectedPending: string\[\] = \[[\s\S]*?"20261110090000_bcp_candidate_preparation\.sql",?[\s\S]*?\];/.test(
      read(FRONTIER),
    ),
    "BCP-RELEASE: the release frontier declares it pending BY DESIGN, so a genuinely stuck migration cannot hide behind it",
  );
  const introduced = new Set((entry?.introduces ?? []).map((i) => i.object));
  for (const table of TABLES) {
    check(introduced.has(table), `BCP-RELEASE: ${table} is declared as introduced`);
  }
  for (const fn of CLIENT_MUTATIONS) {
    check(introduced.has(fn), `BCP-RELEASE: ${fn} is declared as introduced`);
  }
}

// ── 13. Application surface: truthful, bilingual, and never a test ────────
{
  const dict = read(DICTIONARIES);
  const svBlock = dict.slice(0, dict.indexOf("  en: {"));
  const enBlock = dict.slice(dict.indexOf("  en: {"));
  const keyRe = /"(beskt\.[a-zA-Z0-9_.]+)":/g;
  const sv = new Set(Array.from(svBlock.matchAll(keyRe), (m) => m[1]));
  const en = new Set(Array.from(enBlock.matchAll(keyRe), (m) => m[1]));
  check(sv.size > 80, `BCP-UI: the BESKT copy exists (${sv.size} keys)`);
  check(
    sv.size === en.size && Array.from(sv).every((k) => en.has(k)),
    "BCP-UI: every BESKT key exists in BOTH Swedish and English",
  );
  for (const key of NOTICE_SECTIONS) {
    check(
      sv.has(`beskt.notice.${key}.title`) && sv.has(`beskt.notice.${key}.body`),
      `BCP-UI: the notice section "${key}" has bilingual wording`,
    );
  }

  check(
    dict.includes('"beskt.library.title": "Metodstöd för rekrytering"'),
    'BCP-UI: the employer section is named "Metodstöd för rekrytering"',
  );
  // Per VALUE, not one concatenated blob: a value with no terminal punctuation
  // would otherwise be glued to its neighbour and inherit its denial.
  const besktValues = Array.from(dict.matchAll(/"beskt\.[a-zA-Z0-9_.]+":\s*"([^"]*)"/g)).map(
    (m) => m[1] ?? "",
  );
  const besktCopy = besktValues.join("   ");
  check(
    !/personlighetstest|lämplighetstest|personality test|suitability test|aptitude test/i.test(
      besktCopy,
    ),
    "BCP-UI: no BESKT copy calls the method a personality, suitability or aptitude test",
  );
  // Scoring vocabulary may appear ONLY inside a sentence that denies a score.
  // Scoring vocabulary is not banned from the copy -- the product has to be
  // able to say "this produces no score" and "distinct from the scored
  // assessments above", and a candidate who is never told either is left to
  // assume the opposite. What is banned is ASSERTING one, so every sentence
  // that names scoring must also deny or distinguish it.
  const denies =
    /\b(inte|inget|ingen|inga|aldrig|utan|skilt|skild|åtskild|not|no|never|nobody|none|without|distinct|separate|rather than|instead of)\b/i;
  const scoringSentences = besktValues
    .flatMap((value) => value.split(/(?<=[.!?])\s+/))
    .filter((sentence) => /\b(poäng|betyg|rangordn|score|ranking|grade)\w*/i.test(sentence));
  const asserted = scoringSentences.filter((sentence) => !denies.test(sentence));
  check(
    scoringSentences.length >= 4 && asserted.length === 0,
    `BCP-NO-SCORE: scoring vocabulary appears only inside sentences that DENY or distinguish a score (${scoringSentences.length} checked, ${asserted.length} asserting: ${asserted.join(" | ").slice(0, 200)})`,
  );

  const section = read(LIBRARY_SECTION);
  check(
    section.includes('t("beskt.library.emptyTitle")') &&
      section.includes('t("beskt.library.underDevelopment")'),
    "BCP-UI: the library section renders an honest empty / under-development state",
  );
  for (const state of ["loading", "error", "denied"] as const) {
    check(
      section.includes(`t("beskt.library.${state}")`),
      `BCP-UI: it renders a distinct ${state} state`,
    );
  }
  check(
    section.includes("listAssignableBesktMethods"),
    "BCP-UI: it lists only what the database says is genuinely assignable",
  );
  check(
    read(LIBRARY_ROUTE).includes("<MethodSupportSection"),
    "BCP-UI: the section is mounted on the existing Testbibliotek page as a sibling",
  );

  const panel = read(APPLICATION_PANEL);
  check(
    panel.includes("startBesktPreparation") && panel.includes("applicationId"),
    "BCP-UI: a preparation is started from the existing job/application context",
  );
  check(
    panel.includes('t("beskt.start.noMethod")'),
    "BCP-UI: and refuses honestly when no compatible published version is available",
  );
  check(
    panel.includes("beskt-readback-draft-private") && panel.includes("answers === null"),
    "BCP-UI: an unsubmitted draft is reported as unreadable, not rendered in part",
  );
  check(
    read(APPLICATION_ROUTE).includes("<BesktApplicationPanel"),
    "BCP-UI: the panel is mounted on the existing application page",
  );

  const candidate = read(CANDIDATE_UI);
  check(
    candidate.includes('t("beskt.answer.skip")') && candidate.includes('t("beskt.answer.oral")'),
    'BCP-UI: the candidate can choose "Hoppa över" and "Ta muntligt under intervjun"',
  );
  check(
    /role="alert"[\s\S]{0,200}data-testid="beskt-error-summary"/.test(candidate) &&
      /tabIndex=\{-1\}[\s\S]{0,200}data-testid="beskt-error-summary"/.test(candidate),
    "BCP-UI: the error summary ITSELF is announced and focusable, not merely present",
  );
  check(
    (candidate.match(/min-h-\[44px\]/g) ?? []).length >= 8,
    "BCP-UI: interaction targets are at least 44px",
  );
  check(
    candidate.includes("<fieldset>") && candidate.includes("<legend"),
    "BCP-UI: each question is a labelled group for a screen reader",
  );
  check(
    candidate.includes('setPhase("review")') &&
      candidate.includes("<ReviewList items={data.items} drafts={drafts} readOnly={false} />") &&
      candidate.indexOf('data-testid="beskt-to-review"') <
        candidate.indexOf('data-testid="beskt-submit"'),
    "BCP-UI: the candidate reviews every response, in an editable review, before the submit control is reachable",
  );
  check(
    candidate.includes('data-testid="beskt-submitted"') && candidate.includes("submitted.readOnly"),
    "BCP-UI: a submitted preparation is a clear read-only confirmation",
  );
  check(
    !/text-(red|amber|orange|yellow|green)-\d|bg-(red|amber|orange|yellow|green)-\d/.test(
      candidate,
    ),
    "BCP-UI: no risk or performance colour is used anywhere in the candidate journey",
  );
  const candidateCode = candidate.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  check(
    !/progress|percent|procent/i.test(candidateCode),
    "BCP-UI: there is no progress bar or completion percentage to be read as performance",
  );
  check(
    read(CANDIDATE_ROUTE).includes("/_authenticated/my-career/preparation/$assignmentId"),
    "BCP-UI: the candidate journey lives inside the authenticated My Career area",
  );
  check(
    read(MY_PREPARATIONS).includes("listMyBesktPreparations"),
    "BCP-UI: My Career lists the candidate's own preparations",
  );

  const fnsCode = read(FUNCTIONS)
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  check(
    !/score|ranking|suitab|credib|verdict|recommendation/i.test(fnsCode),
    "BCP-NO-SCORE: the application layer has no scoring, suitability or recommendation concept",
  );
  check(
    !/\.from\("bcp_/.test(fnsCode),
    "BCP-SECURITY: the application layer reaches the runtime only through governed RPCs, never a direct table write",
  );

  const types = read(TYPES);
  for (const table of TABLES) {
    check(types.includes(`      ${table}: {`), `BCP-TYPES: ${table} is in the generated types`);
  }
  for (const fn of [...CLIENT_MUTATIONS, "bcp_candidate_preparation", "bcp_employer_readback"]) {
    check(types.includes(`      ${fn}: {`), `BCP-TYPES: ${fn} is in the generated types`);
  }
}

// ── 14. Registration ──────────────────────────────────────────────────────
{
  const pkg = JSON.parse(read(PACKAGE)) as { scripts: Record<string, string> };
  check(
    pkg.scripts["beskt-candidate-preparation:check"] ===
      "bun run scripts/beskt-candidate-preparation-check.ts",
    "BCP-REGISTRATION: the PR 3 guard is registered",
  );
  check(
    pkg.scripts["negative-controls:beskt-candidate-preparation"] ===
      "bun run scripts/negative-controls/beskt-candidate-preparation-controls.ts",
    "BCP-REGISTRATION: its planted negative controls are registered",
  );
  check(
    (pkg.scripts["negative-controls:all"] ?? "").includes(
      "negative-controls:beskt-candidate-preparation",
    ),
    "BCP-REGISTRATION: and run as part of negative-controls:all",
  );
  check(
    (pkg.scripts["negative-controls:all"] ?? "").includes(
      "negative-controls:beskt-governed-content",
    ) && (pkg.scripts["negative-controls:all"] ?? "").includes("negative-controls:beskt "),
    "BCP-REGISTRATION: PR 1's and PR 2's controls stay registered",
  );
  const ci = read(CI);
  check(
    ci.includes("run: bun run beskt-candidate-preparation:check") &&
      ci.includes("run: bun run beskt-governed-content:check") &&
      ci.includes("run: bun run beskt-architecture:check"),
    "BCP-REGISTRATION: CI runs the PR 1, PR 2 and PR 3 guards",
  );
  const tsconfig = read(TSCONFIG);
  check(
    tsconfig.includes('"scripts/beskt-candidate-preparation-check.ts"') &&
      tsconfig.includes('"scripts/negative-controls/beskt-candidate-preparation-controls.ts"'),
    "BCP-REGISTRATION: the guard and its controls are typechecked",
  );
  const e2e = read(E2E);
  check(
    e2e.includes("beskt") && /mobile/i.test(e2e) && /sv|en/.test(e2e),
    "BCP-EVIDENCE: a routed browser evidence walk exists for the preparation journey",
  );
}

if (failures.length > 0) {
  console.error(
    `\nBESKT candidate-preparation guard FAILED (${failures.length} of ${assertions}).`,
  );
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  `\nBESKT candidate-preparation guard: ${assertions} of ${assertions} assertions passed.`,
);
