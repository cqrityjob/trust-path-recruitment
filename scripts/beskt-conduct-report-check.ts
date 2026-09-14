/**
 * BESKT PR 6 — the governed conduct prompts and the immutable report chain.
 *
 * The behaviour suite (supabase/tests/bcp_conduct_prompts_and_report_test.sql)
 * proves this layer against a replayed schema, but it runs only in the
 * database job. This guard reads the migration, the rollback, the suite and
 * the release bookkeeping STRUCTURALLY, in the fast job, so a defect that
 * never reaches a replay is still caught — and so every material assertion
 * here has a planted negative control
 * (scripts/negative-controls/beskt-conduct-report-controls.ts).
 *
 * It reads the real computation: function bodies with comments stripped,
 * DDL column lists, grants, trigger definitions, index predicates and the
 * order guards appear in. Never a reassuring comment, and never an
 * error-message string on its own — a message is evidence only when the
 * condition that raises it is checked beside it.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

const MIGRATION_NAME = "20261116090000_bcp_conduct_prompts_and_report.sql";
const MIGRATION = join(ROOT, "supabase/migrations", MIGRATION_NAME);
const ROLLBACK = join(
  ROOT,
  "supabase/rollback/20261116090000_bcp_conduct_prompts_and_report_rollback.sql",
);
const SUITE = join(ROOT, "supabase/tests/bcp_conduct_prompts_and_report_test.sql");
const PR5A_MIGRATION = join(ROOT, "supabase/migrations/20261113090000_bcp_interview_conduct.sql");
const PR216_MIGRATION = join(
  ROOT,
  "supabase/migrations/20261107090000_scp_iv_report_basis_integrity.sql",
);
const DB_TEST = join(ROOT, "scripts/db-test.sh");
const RELEASE_STATE = join(ROOT, "supabase/release-state.json");
const PACKAGE = join(ROOT, "package.json");
const CI = join(ROOT, ".github/workflows/ci.yml");
const TSCONFIG = join(ROOT, "tsconfig.scripts.json");
const FRONTIER = join(ROOT, "scripts/release-frontier-check.ts");

/** The one table PR 6 adds. Nothing else may appear. */
const TABLE = "bcp_conduct_reports";

/** Functions a browser principal may reach. */
const CLIENT_FUNCTIONS = [
  "bcp_conduct_topic_prompts",
  "bcp_conduct_report_blockers",
  "bcp_conduct_preview_report",
  "bcp_conduct_finalise_report",
  "bcp_conduct_final_report",
  "bcp_conduct_report_versions",
] as const;

/** Reached only from inside a function that has already checked authority. */
const INTERNAL_FUNCTIONS = ["bcp_conduct_build_report_basis"] as const;

/** A pure value function. Definer privileges would be a liability, not a help. */
const PURE_FUNCTIONS = ["bcp_conduct_basis_hash"] as const;

/** Reached BY a trigger, never by a caller. */
const TRIGGER_FUNCTIONS = ["bcp_guard_conduct_report"] as const;

/** Every read the chain performs must be gated by the EXISTING case authority. */
const READ_GATED = [
  "bcp_conduct_topic_prompts",
  "bcp_conduct_preview_report",
  "bcp_conduct_final_report",
  "bcp_conduct_report_versions",
] as const;

/** Anything that would be a judgement, a score or a ranking. */
const FORBIDDEN_WORDS = [
  "score",
  "points",
  "weight",
  "threshold",
  "total",
  "rank",
  "suitab",
  "credib",
  "truthful",
  "recommend",
  "risk",
  "verdict",
  "probab",
  "deception",
  "hire",
  "confidence",
  "rating",
  "grade",
  "level",
] as const;

/** Every column the immutability trigger has to compare, one by one. */
const FROZEN_COLUMNS = [
  "id",
  "session_id",
  "case_id",
  "employer_id",
  "assignment_id",
  "version_number",
  "payload",
  "content_hash",
  "content_hash_algorithm",
  "basis_hash",
  "bound_method_version_id",
  "bound_content_hash",
  "bound_answers_content_hash",
  "bound_response_id",
  "finalised_by",
  "finalised_at",
  "operation_id",
  "created_at",
] as const;

/** The human steps the report cannot be written without. */
const BLOCKER_CODES = [
  "BCP_CONDUCT_SESSION_NOT_FOUND",
  "BCP_CONDUCT_NO_POSITION",
  "BCP_CONDUCT_POSITION_OPEN",
  "BCP_CONDUCT_NOTHING_DOCUMENTED",
  "BCP_CONDUCT_PANEL_REQUIRED",
  "BCP_CONDUCT_PANEL_NOT_REVEALED",
  "BCP_CONDUCT_RESOLUTION_MISSING",
] as const;

/** What the frozen rendering has to carry to be a report rather than a summary. */
const PAYLOAD_SECTIONS = [
  "candidate_preparation",
  "themes",
  "positions",
  "entries",
  "corrections",
  "verifications",
  "information_gaps",
  "panel",
  "resolutions",
  "audit_events",
] as const;

/** The typed record each of those sections is rendered FROM. */
const RECORDED_FIELDS = [
  "observable_fact",
  "candidate_explanation",
  "interviewer_interpretation",
  "alternative_explanation",
  "protective_factor",
  "verification_need",
  "verification_state",
  "correction_reason",
  "sensitivity_class",
] as const;

/** Fields the builder renders twice: on the live entry AND in its correction
 *  history. verification_need, verification_state, sensitivity_class and
 *  correction_reason are deliberately NOT in this set -- a verification belongs
 *  to the entry that is current, and correction_reason exists only on the
 *  history side -- so requiring two renderings of them would be requiring a
 *  duplication the model does not have. */
const LIVE_AND_HISTORY_FIELDS = new Set<string>([
  "observable_fact",
  "candidate_explanation",
  "interviewer_interpretation",
  "alternative_explanation",
  "protective_factor",
]);

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

/** The whole `CREATE OR REPLACE FUNCTION … $$;` statement, header included. */
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

/** The inside of one `CREATE TABLE public.<name> ( … );`. */
function tableText(sql: string, table: string): string {
  const start = sql.indexOf(`CREATE TABLE public.${table} (`);
  if (start === -1) return "";
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
  return sql.slice(open + 1, i);
}

function tableColumns(sql: string, table: string): string[] {
  const body = stripComments(tableText(sql, table));
  const parts: string[] = [];
  let buf = "";
  let depth = 0;
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

/** The `DO $proof$ … END $proof$;` postflight, and nothing around it. */
function postflightText(sql: string): string {
  const at = sql.indexOf("DO $proof$");
  if (at === -1) return "";
  const end = sql.indexOf("END $proof$;", at);
  return end === -1 ? "" : sql.slice(at, end + 12);
}

const sql = read(MIGRATION);
const bare = stripComments(sql);
const rb = read(ROLLBACK);
const rbBare = stripComments(rb);
const suite = read(SUITE);

// ── 1 · The prompt reader answers on the frozen version, not the catalogue ──
{
  const fn = functionText(sql, "bcp_conduct_topic_prompts");
  check(fn !== null, "PROMPTS-READER: bcp_conduct_topic_prompts exists");
  const body = fn ? functionBody(fn) : "";

  check(
    /_caller uuid := auth\.uid\(\)/.test(fn ?? "") &&
      /IF _caller IS NULL THEN[\s\S]{0,160}BCP_NOT_AUTHENTICATED/.test(body),
    "PROMPTS-AUTH: it refuses an unauthenticated caller before it reads anything",
  );
  check(
    /IF NOT public\.scp_iv_can_read_case\(_s\.case_id\) THEN[\s\S]{0,200}BCP_CONDUCT_NOT_PERMITTED/.test(
      body,
    ),
    "PROMPTS-AUTH: and gates on the EXISTING case authority rather than an authority of its own",
  );
  check(
    body.indexOf("scp_iv_can_read_case") > 0 &&
      body.indexOf("scp_iv_can_read_case") < body.indexOf("beskt_prompts"),
    "PROMPTS-AUTH: and does so BEFORE it reaches the prompt catalogue, not merely somewhere in the body",
  );

  // THE point of the whole function: the session's frozen version decides,
  // never the method's current published one.
  check(
    /FROM public\.beskt_method_versions WHERE id = _s\.bound_method_version_id/.test(body),
    "PROMPTS-FROZEN: the version it reads is the one the SESSION froze",
  );
  check(
    !/WHERE[^;]*is_current|ORDER BY v\.version_number DESC|MAX\(version_number\)/i.test(body),
    "PROMPTS-FROZEN: and it never resolves 'the latest version' behind the interview's back",
  );
  check(
    /pr\.method_version_id = _v\.id/.test(body) &&
      (body.match(/pr\.method_version_id = _v\.id/g) ?? []).length >= 2,
    "PROMPTS-FROZEN: both prompt lookups — per item and per stage — are pinned to that version",
  );
  check(
    (body.match(/pr\.exposure_profile_id = _a\.exposure_profile_id/g) ?? []).length >= 2,
    "PROMPTS-FROZEN: and to the exposure profile the assignment pinned, in both lookups",
  );

  check(
    /_v\.content_status <> 'published'/.test(body),
    "PROMPTS-PUBLISHED: a version that is not published stops answering",
  );
  check(
    // The CASE that names the reason repeats this comparison verbatim, so a
    // bare search for the phrase passed with the refusal itself disabled --
    // a planted control proved it. The GUARD condition is what must be read.
    /OR _v\.mode <> 'recruitment_support' THEN/.test(body),
    "PROMPTS-MODE: and a security-vetting method is never rendered as recruitment support",
  );
  for (const reason of ["version_not_found", "mode_not_permitted", "version_not_published"]) {
    check(
      new RegExp(`'${reason}'`).test(body),
      `PROMPTS-UNAVAILABLE: it says WHY nothing is available ('${reason}') instead of returning an empty list that looks like a method with no prompts`,
    );
  }
  check(
    /'available', false[\s\S]{0,400}'topics', '\[\]'::jsonb/.test(body),
    "PROMPTS-UNAVAILABLE: and returns no wording at all on that path",
  );

  check(
    (body.match(/permitted_mode = 'recruitment_support'/g) ?? []).length >= 4,
    "PROMPTS-MODE: every prompt and every item it returns must itself be recruitment-support content",
  );
  check(
    (body.match(/access_class <> 'authorised_security_function'/g) ?? []).length >= 2,
    "PROMPTS-ACCESS: and no wording reserved for an authorised security function is ever returned",
  );
  check(
    /t\.link_id = _s\.link_id/.test(body),
    "PROMPTS-SCOPE: the themes are the ones PR 4 froze for THIS case link",
  );
  check(
    /pr\.item_id IS NULL/.test(body),
    "PROMPTS-SCOPE: the stage wordings, which belong to no single item, are returned separately rather than attached to an arbitrary one",
  );
  check(
    /'produces_score', false/.test(body) && /'interpretation', 'none'/.test(body),
    "PROMPTS-NO-JUDGEMENT: the payload says in its own words that it produces no score and interprets nothing",
  );
}

// ── 2 · No new access to the governed catalogue ─────────────────────────────
{
  check(
    !/CREATE POLICY [a-z_]+ ON public\.beskt_prompts/.test(bare) &&
      !/ALTER POLICY [a-z_]+ ON public\.beskt_prompts/.test(bare),
    "PROMPTS-CATALOGUE: PR 6 adds and alters no policy on beskt_prompts — the reader is a function, not a widened table",
  );
  check(
    !/GRANT [A-Z, ]*ON public\.beskt_(prompts|items|method_versions)/.test(bare),
    "PROMPTS-CATALOGUE: and grants no client role table access to the prompt, item or version catalogue",
  );
  check(
    /tablename = 'beskt_prompts'[\s\S]{0,300}_n <> 1/.test(postflightText(bare)),
    "PROMPTS-CATALOGUE: and the postflight PROVES beskt_prompts still carries exactly one policy, against the catalogue",
  );
}

// ── 3 · One table, append-only, immutable by trigger ────────────────────────
{
  const created = [...bare.matchAll(/CREATE TABLE public\.([a-z0-9_]+) \(/g)].map((m) => m[1]);
  check(
    created.length === 1 && created[0] === TABLE,
    `REPORT-SCOPE: PR 6 creates exactly one table, ${TABLE} (found: ${created.join(", ") || "none"})`,
  );
  check(
    !/CREATE TABLE public\.(scp_|bcp_conduct_(sessions|positions|entries|panels))/.test(bare),
    "REPORT-SCOPE: and nothing resembling a second conduct record, case store or ledger",
  );

  const cols = tableColumns(sql, TABLE).join(" ").toLowerCase();
  for (const word of FORBIDDEN_WORDS) {
    check(
      !cols.includes(word),
      `REPORT-NO-JUDGEMENT: no column named for "${word}" exists on the report`,
    );
  }

  check(
    /content_hash text NOT NULL CHECK \(content_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/.test(
      stripComments(sql),
    ) &&
      /basis_hash text NOT NULL CHECK \(basis_hash ~ '\^\[0-9a-f\]\{64\}\$'\)/.test(
        stripComments(sql),
      ),
    "REPORT-INTEGRITY: both hashes are constrained to be real sha256 digests, not free text",
  );
  check(
    /content_hash_algorithm text NOT NULL DEFAULT 'sha256' CHECK \(content_hash_algorithm = 'sha256'\)/.test(
      stripComments(sql),
    ),
    "REPORT-INTEGRITY: and the algorithm is named in the row rather than assumed by whoever reads it later",
  );
  check(
    /status text NOT NULL CHECK \(status IN \('final', 'superseded'\)\)/.test(stripComments(sql)),
    "REPORT-LIFECYCLE: a report is final or superseded, and there is no draft, revoked or amended state to hide an edit in",
  );
  check(
    /operation_id uuid NOT NULL UNIQUE/.test(stripComments(sql)),
    "REPORT-IDEMPOTENCY: the operation id is UNIQUE in the table itself, so a duplicate finalisation cannot land twice even if the replay check were bypassed",
  );
  check(
    /UNIQUE \(session_id, version_number\)/.test(stripComments(sql)),
    "REPORT-LIFECYCLE: and version numbers within a session cannot collide",
  );
  check(
    /CREATE UNIQUE INDEX bcp_conduct_reports_one_final_per_session_idx\s+ON public\.bcp_conduct_reports \(session_id\)\s+WHERE status = 'final'/.test(
      bare,
    ),
    "REPORT-LIFECYCLE: at most one FINAL report per session, enforced by a partial unique index rather than by ordering luck",
  );
  for (const ref of [
    "public.bcp_conduct_sessions(id)",
    "public.scp_interview_cases(id)",
    "public.bcp_assignments(id)",
    "public.beskt_method_versions(id)",
    "public.bcp_responses(id)",
  ]) {
    check(
      new RegExp(`REFERENCES ${ref.replace(/[().]/g, (c) => `\\${c}`)} ON DELETE RESTRICT`).test(
        stripComments(sql),
      ),
      `REPORT-PROVENANCE: the report is anchored to ${ref} and that anchor cannot be deleted out from under it`,
    );
  }
}

// ── 4 · The immutability trigger compares, it does not trust ────────────────
{
  const fn = functionText(sql, "bcp_guard_conduct_report");
  check(fn !== null, "REPORT-IMMUTABLE: the guard function exists");
  const body = fn ? functionBody(fn) : "";

  check(
    /IF TG_OP = 'DELETE' THEN[\s\S]{0,200}RAISE EXCEPTION[\s\S]{0,160}BCP_CONDUCT_REPORT_IMMUTABLE/.test(
      body,
    ),
    "REPORT-IMMUTABLE: every DELETE is refused by a REACHABLE condition, not by a comment",
  );
  for (const col of FROZEN_COLUMNS) {
    const pattern =
      col === "payload"
        ? /NEW\.payload::text <> OLD\.payload::text/
        : new RegExp(`NEW\\.${col} <> OLD\\.${col}`);
    check(
      pattern.test(body),
      `REPORT-IMMUTABLE: an UPDATE that changed ${col} is refused — the column is compared field by field, not trusted`,
    );
  }
  check(
    /IF NOT \(OLD\.status = 'final' AND NEW\.status = 'superseded'\) THEN[\s\S]{0,260}BCP_CONDUCT_REPORT_IMMUTABLE/.test(
      body,
    ),
    "REPORT-IMMUTABLE: the ONLY permitted update is final stepping down to superseded",
  );
  check(
    /CREATE TRIGGER bcp_conduct_reports_immutable\s+BEFORE UPDATE OR DELETE ON public\.bcp_conduct_reports\s+FOR EACH ROW/.test(
      bare,
    ),
    "REPORT-IMMUTABLE: and the guard is wired as a ROW trigger on both UPDATE and DELETE, so it holds against the table owner too",
  );
  for (const fnName of TRIGGER_FUNCTIONS) {
    check(
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${fnName}\\(\\)\\s*\\n?\\s*FROM PUBLIC, anon, authenticated, service_role;`,
      ).test(bare),
      `REPORT-SURFACE: ${fnName}() is revoked from every role, so PostgREST does not publish an invariant-checker as an API`,
    );
    check(
      !new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fnName}\\(\\)`).test(bare),
      `REPORT-SURFACE: and nothing grants EXECUTE on ${fnName}() back`,
    );
  }
}

// ── 5 · RLS, grants and the PostgREST surface ───────────────────────────────
{
  check(
    new RegExp(`ALTER TABLE public\\.${TABLE} ENABLE ROW LEVEL SECURITY`).test(bare) &&
      new RegExp(`ALTER TABLE public\\.${TABLE} FORCE ROW LEVEL SECURITY`).test(bare),
    "REPORT-RLS: the report table carries ENABLE and FORCE ROW LEVEL SECURITY",
  );
  check(
    new RegExp(
      `REVOKE ALL ON public\\.${TABLE} FROM PUBLIC, anon, authenticated, service_role;`,
    ).test(bare),
    "REPORT-GRANTS: it is revoked from every role first — silence would be a grant",
  );
  check(
    new RegExp(`GRANT SELECT ON public\\.${TABLE} TO authenticated, service_role;`).test(bare),
    "REPORT-GRANTS: and re-granted SELECT only",
  );
  check(
    !new RegExp(`GRANT (ALL|INSERT|UPDATE|DELETE)[^;]*ON public\\.${TABLE}`).test(bare),
    "REPORT-GRANTS: no write privilege is granted on the report table to any role, service_role included",
  );
  check(
    new RegExp(
      `CREATE POLICY bcp_conduct_reports_member_read ON public\\.${TABLE}\\s+FOR SELECT TO authenticated\\s+USING \\(public\\.scp_iv_can_read_case\\(case_id\\)\\)`,
    ).test(bare),
    "REPORT-RLS: the single read policy routes through the EXISTING case authority",
  );
  check(
    !new RegExp(
      `CREATE POLICY [a-z_]+ ON public\\.${TABLE}\\s+FOR (INSERT|UPDATE|DELETE|ALL)`,
    ).test(bare),
    "REPORT-RLS: and no write policy exists — every write goes through the governed function",
  );
  check(
    !/USING \(\s*true\b/.test(bare) && !/WITH CHECK \(\s*true\b/.test(bare),
    "REPORT-RLS: no policy predicate opens on an unconditional true",
  );

  for (const fn of CLIENT_FUNCTIONS) {
    const text = functionText(sql, fn);
    check(
      text !== null && /SECURITY DEFINER/.test(text) && /SET search_path = public/.test(text),
      `REPORT-SURFACE: ${fn} is SECURITY DEFINER with a pinned search_path`,
    );
    check(
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${fn}\\([\\s\\S]{0,120}?\\)\\s*\\n?\\s*FROM PUBLIC, anon`,
      ).test(bare),
      `REPORT-SURFACE: ${fn} is revoked from PUBLIC and anon before any grant`,
    );
    check(
      new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${fn}\\([\\s\\S]{0,120}?\\)\\s*\\n?\\s*TO authenticated, service_role;`,
      ).test(bare),
      `REPORT-SURFACE: and re-granted only to authenticated and service_role`,
    );
  }

  for (const fn of INTERNAL_FUNCTIONS) {
    check(
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${fn}\\(uuid\\)\\s*\\n?\\s*FROM PUBLIC, anon, authenticated;`,
      ).test(bare),
      `REPORT-SURFACE: ${fn} is closed to authenticated — it applies no case authority of its own, so no client may reach it`,
    );
    check(
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\(uuid\\) TO service_role;`).test(
        bare,
      ) &&
        !new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\(uuid\\)[^;]*authenticated`).test(
          bare,
        ),
      `REPORT-SURFACE: and granted to service_role only`,
    );
    check(
      new RegExp(
        `has_function_privilege\\('authenticated', 'public\\.${fn}\\(uuid\\)', 'EXECUTE'\\)`,
      ).test(postflightText(bare)),
      `REPORT-POSTFLIGHT: and the postflight re-proves that closure against the catalogue rather than against this file`,
    );
  }

  for (const fn of PURE_FUNCTIONS) {
    const text = functionText(sql, fn);
    check(
      text !== null && !/SECURITY DEFINER/.test(text ?? ""),
      `REPORT-PURITY: ${fn} is NOT SECURITY DEFINER — it maps a value to a digest and has no use for privileges`,
    );
    check(
      /IMMUTABLE/.test(text ?? "") && /SET search_path = public/.test(text ?? ""),
      `REPORT-PURITY: and is IMMUTABLE with a pinned search_path, so a caller's path cannot decide which sha256 is reached`,
    );
  }

  const createdFns = [...bare.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z0-9_]+)\(/g)].map(
    (m) => m[1],
  );
  const known = new Set<string>([
    ...CLIENT_FUNCTIONS,
    ...INTERNAL_FUNCTIONS,
    ...PURE_FUNCTIONS,
    ...TRIGGER_FUNCTIONS,
  ]);
  check(
    createdFns.every((n) => known.has(n)),
    `REPORT-SURFACE: PR 6 creates no function outside its declared surface (unexpected: ${createdFns.filter((n) => !known.has(n)).join(", ") || "none"})`,
  );
}

// ── 6 · Authority on every path, in the right order ─────────────────────────
{
  for (const fn of READ_GATED) {
    const body = functionBody(functionText(sql, fn) ?? "");
    check(
      /IF _caller IS NULL THEN[\s\S]{0,160}BCP_NOT_AUTHENTICATED/.test(body),
      `REPORT-AUTH: ${fn} refuses an unauthenticated caller`,
    );
    check(
      /IF NOT public\.scp_iv_can_read_case\(_s\.case_id\) THEN[\s\S]{0,200}BCP_CONDUCT_NOT_PERMITTED/.test(
        body,
      ),
      `REPORT-AUTH: ${fn} gates on the existing case READ authority`,
    );
  }

  const fin = functionBody(functionText(sql, "bcp_conduct_finalise_report") ?? "");
  check(
    /IF NOT public\.scp_iv_can_write_case\(_s\.case_id\) THEN[\s\S]{0,200}BCP_CONDUCT_NOT_PERMITTED/.test(
      fin,
    ),
    "REPORT-AUTH: finalising requires the case WRITE authority — a reader may preview, only a writer may sign",
  );
  check(
    !/scp_iv_can_read_case/.test(fin),
    "REPORT-AUTH: and finalisation never settles for the weaker read authority",
  );

  // The order is the guarantee, not the presence. A blocker sweep that ran
  // before the authority check would tell an unauthorised member whether a
  // case was ready; a preview check before it would leak the basis hash.
  const writeAt = fin.indexOf("scp_iv_can_write_case");
  const blockerAt = fin.indexOf("bcp_conduct_report_blockers");
  const previewAt = fin.indexOf("BCP_CONDUCT_PREVIEW_REQUIRED");
  const insertAt = fin.indexOf("INSERT INTO public.bcp_conduct_reports");
  check(
    writeAt > 0 && blockerAt > writeAt,
    "REPORT-ORDER: the blocker sweep runs AFTER the write authority, so probing this call tells an outsider nothing about a case's readiness",
  );
  check(
    blockerAt > 0 && previewAt > blockerAt,
    "REPORT-ORDER: and the preview check runs after both, so the basis hash is never disclosed by a refusal",
  );
  check(
    insertAt > previewAt && previewAt > 0,
    "REPORT-ORDER: and nothing is written until all of them have passed",
  );
}

// ── 7 · Idempotency, concurrency and the basis contract ─────────────────────
{
  const fin = functionBody(functionText(sql, "bcp_conduct_finalise_report") ?? "");
  check(
    /_replay := public\.bcp_operation_begin\(_operation_id, _hash\);/.test(fin) &&
      /IF _replay IS NOT NULL THEN RETURN _replay; END IF;/.test(fin),
    "REPORT-IDEMPOTENCY: finalisation answers a replay through the EXISTING bcp_operation_begin",
  );
  const replayAt = fin.indexOf("bcp_operation_begin");
  const firstWrite = Math.min(
    ...["INSERT INTO", "UPDATE public."]
      .map((k) => fin.indexOf(k))
      .filter((n) => n >= 0)
      .concat([fin.length]),
  );
  check(
    replayAt >= 0 && replayAt < firstWrite,
    "REPORT-IDEMPOTENCY: and the replay check precedes the first write, rather than merely appearing in the body",
  );
  check(
    /IF _operation_id IS NULL THEN[\s\S]{0,200}BCP_OPERATION_ID_REQUIRED/.test(fin),
    "REPORT-IDEMPOTENCY: a mutation with no operation id is refused",
  );
  check(
    /pg_advisory_xact_lock\(hashtextextended\(_session_id::text, 0\)\)/.test(fin),
    "REPORT-CONCURRENCY: two finalisations of one session serialise on a transaction-scoped advisory lock",
  );
  check(
    /FROM public\.bcp_conduct_sessions WHERE id = _session_id FOR UPDATE/.test(fin),
    "REPORT-CONCURRENCY: and the session row itself is taken FOR UPDATE",
  );

  check(
    /IF _expected_basis_hash IS NULL OR btrim\(_expected_basis_hash\) = '' THEN[\s\S]{0,300}BCP_CONDUCT_PREVIEW_REQUIRED/.test(
      fin,
    ),
    "REPORT-BASIS: finalising without a preview is refused by a REACHABLE condition",
  );
  check(
    /IF _expected_basis_hash <> _basis THEN[\s\S]{0,300}BCP_CONDUCT_STALE_PREVIEW/.test(fin),
    "REPORT-BASIS: and finalising a preview the record has moved past is refused — what is signed is what was read",
  );
  check(
    /IF _existing\.id IS NOT NULL AND _existing\.basis_hash = _basis THEN/.test(fin),
    "REPORT-BASIS: an unchanged basis returns the report that already exists rather than writing a second one",
  );

  // The predecessor must vacate the one-final slot BEFORE the successor takes
  // it, or the partial unique index refuses both. indexOf returns -1 when the
  // step is deleted outright, and -1 is less than everything, so both indexes
  // are required to be real.
  const supersedeAt = fin.indexOf("SET status = 'superseded'");
  check(
    supersedeAt >= 0 && insertIndex(fin) >= 0 && supersedeAt < insertIndex(fin),
    "REPORT-LIFECYCLE: the predecessor steps down BEFORE the successor is inserted, or the one-final index would refuse both",
  );
  check(
    /'conduct_report_finalised'/.test(fin) && /PERFORM public\.bcp_record_event\(/.test(fin),
    "REPORT-AUDIT: finalisation writes to PR 3's existing ledger rather than to a ledger of its own",
  );
  check(
    !/CREATE TABLE public\.[a-z0-9_]*event/.test(bare),
    "REPORT-AUDIT: and PR 6 opens no event ledger of its own",
  );
}

function insertIndex(body: string): number {
  return body.indexOf("INSERT INTO public.bcp_conduct_reports");
}

// ── 8 · The basis excludes exactly what signing changes ─────────────────────
{
  const hashBody = functionBody(functionText(sql, "bcp_conduct_basis_hash") ?? "");
  check(
    /_payload #- '\{audit_events\}'/.test(hashBody),
    "REPORT-BASIS: the basis hash excludes the event ledger, which the act of finalising appends to — otherwise the basis would invalidate itself the instant the report was written",
  );
  check(
    /encode\(sha256\(convert_to\(/.test(hashBody),
    "REPORT-BASIS: and it is a real sha256 over the UTF-8 rendering, not a textual hash of a hash",
  );

  const preview = functionBody(functionText(sql, "bcp_conduct_preview_report") ?? "");
  check(
    /'basis_hash', public\.bcp_conduct_basis_hash\(_payload\)/.test(preview) &&
      /'content_hash', public\.scp_iv_content_hash\(_payload\)/.test(preview),
    "REPORT-BASIS: the preview returns BOTH — the basis a human signs, and the content hash covering the whole stored document",
  );
  const fin = functionBody(functionText(sql, "bcp_conduct_finalise_report") ?? "");
  check(
    /_basis := public\.bcp_conduct_basis_hash\(_payload\);/.test(fin) &&
      /_content := public\.scp_iv_content_hash\(_payload\);/.test(fin),
    "REPORT-BASIS: and finalisation computes both the same way, so preview and signature cannot drift",
  );
  check(
    /_payload := public\.bcp_conduct_build_report_basis\(_session_id\);/.test(preview) &&
      /_payload := public\.bcp_conduct_build_report_basis\(_session_id\);/.test(fin),
    "REPORT-BASIS: ONE builder assembles the payload for both paths, so what was previewed is what is stored",
  );
  check(
    read(PR216_MIGRATION).includes("CREATE OR REPLACE FUNCTION public.scp_iv_content_hash("),
    "REPORT-REUSE: the content hash is PR #216's existing one, read from PR #216's own migration, not a second implementation",
  );
}

// ── 9 · Blockers are missing human steps, never quality bars ────────────────
{
  const blockers = functionBody(functionText(sql, "bcp_conduct_report_blockers") ?? "");
  for (const code of BLOCKER_CODES) {
    check(
      new RegExp(`code := '${code}'`).test(blockers),
      `REPORT-BLOCKERS: ${code} is a blocker the caller can act on, assigned rather than merely mentioned`,
    );
  }
  check(
    /count\(\*\) FILTER \(WHERE state <> 'locked'\)/.test(blockers),
    "REPORT-BLOCKERS: an open position is counted from the real state, not inferred",
  );
  check(
    /IF _positions > 1 THEN/.test(blockers),
    "REPORT-BLOCKERS: a panel is required only where more than one position exists — a lone assessor has nobody to disagree with, and demanding a panel would be ceremony rather than safeguard",
  );
  check(
    /HAVING count\(DISTINCT e\.position_id\) > 1/.test(blockers),
    "REPORT-BLOCKERS: and a resolution is required exactly for the themes more than one assessor documented",
  );
  check(
    !/\b(avg|percentile|median|sum\()/i.test(blockers) &&
      !/>= *\d+ *(?:THEN|AND)/.test(blockers.replace(/count\(DISTINCT e\.position_id\) > 1/g, "")),
    "REPORT-BLOCKERS: nothing here is a quality threshold — the report refuses because a step is missing, never because work was judged insufficient",
  );
}

// ── 10 · The payload is a rendering of what humans recorded ─────────────────
{
  const builder = functionBody(functionText(sql, "bcp_conduct_build_report_basis") ?? "");
  check(builder.length > 0, "REPORT-PAYLOAD: the builder exists");
  for (const section of PAYLOAD_SECTIONS) {
    check(
      new RegExp(`'${section}',`).test(builder),
      `REPORT-PAYLOAD: the report carries ${section}, so the document says what was actually done rather than summarising it away`,
    );
  }
  for (const field of RECORDED_FIELDS) {
    // BOTH renderings, counted: the live entry and the correction history each
    // carry the field, so finding it once passed even after the live entry had
    // dropped it -- which a planted control proved twice.
    const renderings = (builder.match(new RegExp(`'${field}', `, "g")) ?? []).length;
    check(
      renderings >= (LIVE_AND_HISTORY_FIELDS.has(field) ? 2 : 1),
      `REPORT-PAYLOAD: and carries ${field} as its own field in every rendering that has one, so the method's distinctions survive into the frozen document (found ${renderings})`,
    );
  }
  check(
    /'produces_score', false/.test(builder) &&
      /'produces_ranking', false/.test(builder) &&
      /'produces_recommendation', false/.test(builder) &&
      /'interpretation', 'none'/.test(builder),
    "REPORT-NO-JUDGEMENT: the payload states in its own words that it produces no score, ranking or recommendation and interprets nothing",
  );
  check(
    !/\b(avg\(|sum\(|percentile|median|round\()/i.test(builder),
    "REPORT-NO-JUDGEMENT: and the builder computes no average, total or percentile over anything a human said",
  );
  check(
    // The phrase appears in four separate clauses, so finding it anywhere
    // proved nothing about the entries list -- a planted control removed the
    // one that matters and this assertion went on passing. Read the clause.
    /FROM public\.bcp_conduct_entries e\s+WHERE e\.position_id = pos\.id\s+AND e\.superseded_by_entry_id IS NULL/.test(
      builder,
    ),
    "REPORT-PAYLOAD: the live record is what is reported, and corrections are carried as history beside it rather than silently replacing it",
  );
  check(
    read(PR5A_MIGRATION).includes("CREATE TABLE public.bcp_conduct_entries ("),
    "REPORT-REUSE: every field above is rendered from PR 5A's own typed columns, read from PR 5A's migration",
  );
}

// ── 11 · Postflight ─────────────────────────────────────────────────────────
{
  const proof = postflightText(bare);
  check(proof.length > 0, "REPORT-POSTFLIGHT: the migration has a postflight at all");
  check(
    /RAISE NOTICE 'BESKT_CONDUCT_PROMPTS_AND_REPORT_PROOF ok'/.test(proof),
    "REPORT-POSTFLIGHT: which proves its own outcome before the migration commits",
  );
  check(
    /relrowsecurity AND relforcerowsecurity/.test(proof) &&
      /information_schema\.role_table_grants/.test(proof) &&
      /has_table_privilege\('anon'/.test(proof),
    "REPORT-POSTFLIGHT: and interrogates real privileges through the catalogue rather than restating the migration's own GRANTs",
  );
  check(
    /_forbidden text\[\] := ARRAY\[/.test(proof) &&
      /information_schema\.columns[\s\S]{0,300}column_name LIKE '%' \|\| _word \|\| '%'/.test(
        proof,
      ),
    "REPORT-POSTFLIGHT: it proves there is nowhere to store a judgement by asking the catalogue for such a column, not by promising there is none",
  );
  check(
    /indexname = 'bcp_conduct_reports_one_final_per_session_idx'/.test(proof),
    "REPORT-POSTFLIGHT: it proves the one-final index exists",
  );
  check(
    /tgname = 'bcp_conduct_reports_immutable' AND NOT tgisinternal/.test(proof),
    "REPORT-POSTFLIGHT: it proves the immutability trigger is installed",
  );
  check(
    /has_function_privilege\('authenticated', 'public\.bcp_guard_conduct_report\(\)', 'EXECUTE'\)/.test(
      proof,
    ),
    "REPORT-POSTFLIGHT: and that no client role can execute the invariant checker",
  );
  check(
    /p\.proname = 'bcp_conduct_basis_hash'[\s\S]{0,200}NOT p\.prosecdef[\s\S]{0,120}provolatile = 'i'/.test(
      proof,
    ),
    "REPORT-POSTFLIGHT: it proves the pure hash is NOT a definer function, which is the assertion this migration got wrong once",
  );
  check(
    /'conduct_report_finalised'/.test(proof) &&
      /'assignment_created'/.test(proof) &&
      /'case_linked'/.test(proof),
    "REPORT-POSTFLIGHT: and that the rebuilt event vocabulary added its member without dropping any earlier one",
  );
  check(
    /count\(\*\) INTO _n FROM public\.bcp_conduct_reports;[\s\S]{0,300}it must seed none/.test(sql),
    "REPORT-POSTFLIGHT: and that the migration seeded no report",
  );
  check(
    !/INSERT INTO public\.beskt_(method_versions|items|prompts|packs)/.test(bare) &&
      !/INSERT INTO public\.scp_interview_packs/.test(bare),
    "REPORT-NO-SEED: PR 6 seeds no method content — BESKT v1 is produced through the governance RPCs by real people, never by a migration",
  );

  // The rebuilt CHECK, read as the CONSTRAINT rather than as the file: every
  // one of these names also appears in the postflight loop, so testing the
  // whole migration would pass even after the CHECK itself dropped a member.
  const at = bare.indexOf("ADD CONSTRAINT bcp_events_event_check");
  const eventCheck = at === -1 ? "" : bare.slice(at, bare.indexOf("));", at) + 3);
  check(eventCheck.length > 0, "REPORT-VOCABULARY: the migration rebuilds the bcp_events CHECK");
  for (const member of [
    "assignment_created",
    "notice_acknowledged",
    "response_saved",
    "response_submitted",
    "assignment_cancelled",
    "assignment_opened",
    "pilot_granted",
    "pilot_revoked",
    "case_linked",
    "case_unlinked",
    "conduct_session_started",
    "conduct_entry_saved",
    "conduct_entry_corrected",
    "conduct_position_locked",
    "conduct_panel_revealed",
    "conduct_panel_resolution_recorded",
  ]) {
    check(
      new RegExp(`'${member}'`).test(eventCheck),
      `REPORT-VOCABULARY: the rebuilt CHECK still admits '${member}' — a rebuild that dropped one would break PR 3, PR 4 or PR 5A silently`,
    );
  }
  check(
    /'conduct_report_finalised'/.test(eventCheck),
    "REPORT-AUDIT: and admits 'conduct_report_finalised', so signing a report is explainable afterwards",
  );
}

// ── 12 · The rollback refuses rather than discards ──────────────────────────
{
  check(
    // The CONDITION, not merely a message near it: replacing `IF _reports <> 0`
    // with `IF false` left the RAISE in place and this assertion passed with
    // the refusal gone -- a planted control proved exactly that.
    /SELECT count\(\*\) INTO _reports FROM public\.bcp_conduct_reports;\s+IF _reports <> 0 THEN\s+RAISE EXCEPTION\s+'BCP_CONDUCT_REPORT_ROLLBACK/.test(
      rbBare,
    ),
    "REPORT-ROLLBACK: it refuses while any finalised report exists — a signed document about a named person is not a script's to discard",
  );
  check(
    /bcp_events WHERE event = 'conduct_report_finalised';\s+IF _events <> 0 THEN\s+RAISE EXCEPTION\s+'BCP_CONDUCT_REPORT_ROLLBACK/.test(
      rbBare,
    ),
    "REPORT-ROLLBACK: and refuses while the append-only ledger records that one was signed, because that entry can never be deleted to make the unwind fit",
  );
  check(!/CASCADE/.test(rbBare), "REPORT-ROLLBACK: it drops nothing with CASCADE");
  for (const fn of [
    ...CLIENT_FUNCTIONS,
    ...INTERNAL_FUNCTIONS,
    ...PURE_FUNCTIONS,
    ...TRIGGER_FUNCTIONS,
  ]) {
    check(
      new RegExp(`DROP FUNCTION IF EXISTS public\\.${fn}\\(`).test(rbBare),
      `REPORT-ROLLBACK: it drops ${fn} by name, so nothing of PR 6 survives an unwind that claims nothing does`,
    );
  }
  check(
    new RegExp(`DROP TABLE IF EXISTS public\\.${TABLE};`).test(rbBare),
    "REPORT-ROLLBACK: and drops the report table itself",
  );
  const readSurfaceAt = rbBare.indexOf("DROP FUNCTION IF EXISTS public.bcp_conduct_final_report(");
  const tableAt = rbBare.indexOf(`DROP TABLE IF EXISTS public.${TABLE};`);
  const guardAt = rbBare.indexOf("DROP FUNCTION IF EXISTS public.bcp_guard_conduct_report(");
  check(
    readSurfaceAt >= 0 && tableAt > readSurfaceAt && guardAt > tableAt,
    "REPORT-ROLLBACK: in an explicit order — the read surface, then the table, then the trigger function it depended on",
  );
  check(
    /'conduct_session_started'/.test(rbBare) &&
      !/'conduct_report_finalised'/.test(
        rbBare.slice(rbBare.indexOf("ADD CONSTRAINT bcp_events_event_check")),
      ),
    "REPORT-ROLLBACK: the restored vocabulary is PR 5A's exactly — its members kept, PR 6's gone",
  );
  check(
    /RAISE NOTICE 'BESKT_CONDUCT_PROMPTS_AND_REPORT_ROLLBACK ok'/.test(rbBare),
    "REPORT-ROLLBACK: it proves its own outcome rather than assuming it",
  );
  check(
    /bcp_conduct_start_session|bcp_conduct_workspace/.test(rbBare),
    "REPORT-ROLLBACK: and proves PR 5A is still standing afterwards, rather than leaving that to inspection",
  );
  check(
    !/DROP TABLE IF EXISTS public\.bcp_conduct_(sessions|positions|entries|panels|verifications|panel_resolutions)/.test(
      rbBare,
    ),
    "REPORT-ROLLBACK: it unwinds PR 6 only — PR 5A's conduct record is untouched",
  );
}

// ── 13 · The suite proves rather than reports ───────────────────────────────
{
  check(/SYNTETISK/.test(suite), "REPORT-SUITE: everything the suite plants is labelled synthetic");
  check(
    /^BEGIN;/m.test(suite) && /^ROLLBACK;/m.test(suite),
    "REPORT-SUITE: and the whole suite runs in one transaction that is rolled back, so it seeds nothing",
  );
  const labels = [...suite.matchAll(/'((?:P|R)\d+\.\d+ [^']+)'/g)].map((m) => m[1]);
  check(
    labels.length >= 60,
    `REPORT-SUITE: it carries at least 60 labelled assertions (found ${labels.length})`,
  );
  check(
    new Set(labels).size === labels.length,
    "REPORT-SUITE: and no two assertions share a label, so a failure names exactly one thing",
  );
  for (const needle of [...CLIENT_FUNCTIONS]) {
    check(suite.includes(needle), `REPORT-SUITE: the suite exercises ${needle}`);
  }
  check(
    /BCP_CONDUCT_STALE_PREVIEW/.test(suite) && /BCP_CONDUCT_REPORT_BLOCKED/.test(suite),
    "REPORT-SUITE: and proves the refusals, not only the success path",
  );
  const immutabilityProofs = (suite.match(/BCP_CONDUCT_REPORT_IMMUTABLE/g) ?? []).length;
  check(
    // COUNTED. The table promises five separate things -- the payload, both
    // hashes, the signer, the row itself and the status direction -- and one
    // surviving refusal is not proof of the other four.
    immutabilityProofs >= 5,
    `REPORT-SUITE: including that a finalised report cannot be changed, proved against the table OWNER for every frozen field (found ${immutabilityProofs} refusals)`,
  );
  check(
    /'anon'/.test(suite),
    "REPORT-SUITE: and proves what an unauthenticated principal gets, rather than assuming",
  );
}

// ── 14 · Registration ───────────────────────────────────────────────────────
{
  const dbTest = read(DB_TEST);
  check(
    dbTest.includes("supabase/tests/bcp_conduct_prompts_and_report_test.sql"),
    "REPORT-REGISTRATION: the behaviour suite runs in scripts/db-test.sh",
  );
  const floor = /RPT_PASSED" -lt (\d+)/.exec(dbTest);
  check(
    floor !== null && Number(floor[1]) >= 60,
    "REPORT-REGISTRATION: with an assertion floor, so a silently shrinking suite fails rather than passes",
  );
  check(
    dbTest.includes("BESKT_CONDUCT_PROMPTS_AND_REPORT_PROOF ok") ||
      dbTest.includes("supabase/migrations/20261116090000_bcp_conduct_prompts_and_report.sql"),
    "REPORT-REGISTRATION: and the migration is re-applied for real over the rolled-back state",
  );
  check(
    dbTest.includes("supabase/rollback/20261116090000_bcp_conduct_prompts_and_report_rollback.sql"),
    "REPORT-REGISTRATION: and the rollback is executed for real",
  );
  check(
    dbTest.includes('suite_failed "BESKT prompts and report"'),
    "REPORT-REGISTRATION: and a failure in this block fails the run rather than printing and continuing",
  );

  // PR 5A's rollback drops bcp_conduct_sessions, which bcp_conduct_reports
  // references without CASCADE. PR 6 must therefore be stood down BEFORE that
  // point, and this assertion is what makes the ordering a rule.
  const suiteAt = dbTest.indexOf("bcp_conduct_prompts_and_report_test.sql");
  const standDown = dbTest.indexOf("# Stand PR 6 down so PR 5A can be unwound below");
  // The PR 5A rollback that SUCCEEDS, not the earlier one run to prove it
  // refuses: indexOf would find that one and the ordering rule would be
  // asserted about the wrong statement.
  const pr5aRollback = dbTest.indexOf('CND_RB="$(psql');
  check(
    suiteAt >= 0 && standDown > suiteAt,
    "REPORT-REGISTRATION: the suite runs before PR 6 is stood down",
  );
  check(
    standDown >= 0 && pr5aRollback > standDown,
    "REPORT-REGISTRATION: and PR 6 is stood down before PR 5A's rollback runs, because bcp_conduct_reports holds a real foreign key into bcp_conduct_sessions and neither rollback uses CASCADE",
  );

  const pkg = read(PACKAGE);
  check(
    pkg.includes('"beskt-conduct-report:check"'),
    "REPORT-REGISTRATION: the guard has a package script",
  );
  check(
    pkg.includes('"negative-controls:beskt-conduct-report"') &&
      /"negative-controls:all":[^\n]*negative-controls:beskt-conduct-report/.test(pkg),
    "REPORT-REGISTRATION: its controls have a script AND are part of negative-controls:all",
  );
  const ci = read(CI);
  check(ci.includes("beskt-conduct-report:check"), "REPORT-REGISTRATION: the guard runs in CI");
  const tsconfig = read(TSCONFIG);
  check(
    tsconfig.includes('"scripts/beskt-conduct-report-check.ts"') &&
      tsconfig.includes('"scripts/negative-controls/beskt-conduct-report-controls.ts"'),
    "REPORT-REGISTRATION: the guard and its controls are typechecked",
  );

  const state = JSON.parse(read(RELEASE_STATE)) as {
    frontier?: Array<{
      file?: string;
      hostedState?: string;
      verify?: unknown;
      rollback?: unknown;
      introduces?: Array<{ object?: string }>;
    }>;
  };
  const entry = (state.frontier ?? []).find((m) => m.file === MIGRATION_NAME);
  check(
    entry !== undefined,
    "REPORT-REGISTRATION: the migration is declared in release-state.json",
  );
  check(
    entry?.hostedState === "pending",
    "REPORT-REGISTRATION: and declared PENDING — it has not been applied to the hosted database, and saying otherwise without evidence is the exact claim this stack exists to prevent",
  );
  check(
    entry?.verify !== undefined && entry?.rollback !== undefined,
    "REPORT-REGISTRATION: and carries both how to verify it and how to undo it",
  );
  check(
    Array.isArray(entry?.introduces) &&
      [
        TABLE,
        ...CLIENT_FUNCTIONS,
        ...INTERNAL_FUNCTIONS,
        ...PURE_FUNCTIONS,
        ...TRIGGER_FUNCTIONS,
      ].every((o) => (entry?.introduces ?? []).some((i) => i.object === o)),
    'REPORT-REGISTRATION: and declares every object it introduces, so "can code depend on this yet?" is answerable from the file',
  );

  const frontier = read(FRONTIER);
  check(
    (/const expectedPending: string\[\] = \[([\s\S]*?)\];/.exec(frontier)?.[1] ?? "").includes(
      MIGRATION_NAME,
    ),
    "REPORT-REGISTRATION: and is on the owner-level pending list, so the release frontier and release-state.json cannot disagree about production",
  );
}

// ── 15 · Schema-first: no application code rides on a pending migration ─────
{
  const names = [
    TABLE,
    ...CLIENT_FUNCTIONS,
    ...INTERNAL_FUNCTIONS,
    ...PURE_FUNCTIONS,
    ...TRIGGER_FUNCTIONS,
  ];
  const offenders: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(abs);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      const text = readFileSync(abs, "utf8");
      for (const name of names) {
        if (text.includes(name)) offenders.push(`${abs.slice(ROOT.length + 1)} names ${name}`);
      }
    }
  };
  walk(join(ROOT, "src"));
  check(
    offenders.length === 0,
    `REPORT-SCHEMA-FIRST: no application code names an object of this pending migration (${offenders.slice(0, 3).join("; ") || "none"})`,
  );
}

if (failures.length > 0) {
  console.error(
    `\nBESKT conduct prompts-and-report guard FAILED (${failures.length} of ${assertions}).`,
  );
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  `\nBESKT conduct prompts-and-report guard: ${assertions} of ${assertions} assertions passed.`,
);
