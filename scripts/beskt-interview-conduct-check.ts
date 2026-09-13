/**
 * BESKT PR 5A — the interview-conduct source guard.
 *
 * The database suite (supabase/tests/bcp_interview_conduct_test.sql) proves
 * behaviour against a replayed schema, but it runs only in the database job.
 * This guard reads the migration, the rollback, the suite, the race fixture
 * and the release bookkeeping STRUCTURALLY, in the fast job, so a defect that
 * never reaches a replay is still caught — and so every material assertion has
 * a planted negative control
 * (scripts/negative-controls/beskt-interview-conduct-controls.ts).
 *
 * It inspects the real computation: function bodies with comments stripped,
 * DDL column lists, grants, trigger definitions and index predicates. Never a
 * reassuring comment, and never an error-message string on its own.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

const MIGRATION_NAME = "20261113090000_bcp_interview_conduct.sql";
const MIGRATION = join(ROOT, "supabase/migrations", MIGRATION_NAME);
const ROLLBACK = join(ROOT, "supabase/rollback/20261113090000_bcp_interview_conduct_rollback.sql");
const SUITE = join(ROOT, "supabase/tests/bcp_interview_conduct_test.sql");
const RACE = join(ROOT, "supabase/tests/bcp_conduct_race_fixture.sql");
const PR4_MIGRATION = join(
  ROOT,
  "supabase/migrations/20261112090000_bcp_interview_case_bridge.sql",
);
const DB_TEST = join(ROOT, "scripts/db-test.sh");
const ROLLBACK_SUITE = join(ROOT, "supabase/tests/scp_a_rollback_test.sql");
const RELEASE_STATE = join(ROOT, "supabase/release-state.json");
const PACKAGE = join(ROOT, "package.json");
const CI = join(ROOT, ".github/workflows/ci.yml");
const TSCONFIG = join(ROOT, "tsconfig.scripts.json");
const FRONTIER = join(ROOT, "scripts/release-frontier-check.ts");
const TYPES = join(ROOT, "src/integrations/supabase/types.ts");

/** The six tables PR 5A adds. Nothing else may appear. */
const TABLES = [
  "bcp_conduct_sessions",
  "bcp_conduct_positions",
  "bcp_conduct_entries",
  "bcp_conduct_verifications",
  "bcp_conduct_panels",
  "bcp_conduct_panel_resolutions",
] as const;

/** Every governed mutation a browser principal can reach. */
const CLIENT_MUTATIONS = [
  "bcp_conduct_start_session",
  "bcp_conduct_join_session",
  "bcp_conduct_save_entry",
  "bcp_conduct_record_verification",
  "bcp_conduct_lock_position",
  "bcp_conduct_reopen_position",
  "bcp_conduct_open_panel",
  "bcp_conduct_reveal_panel",
  "bcp_conduct_record_resolution",
] as const;

/** Read models and visibility helpers a browser principal can reach. */
const CLIENT_READS = [
  "bcp_conduct_workspace",
  "bcp_conduct_entry_history",
  "bcp_conduct_may_see_others",
  "bcp_conduct_can_read_session",
] as const;

/** Trigger functions. Reached BY a trigger, never by a caller. */
const TRIGGER_FUNCTIONS = [
  "bcp_guard_conduct_session",
  "bcp_guard_conduct_position",
  "bcp_guard_conduct_entry",
  "bcp_guard_conduct_panel",
  "bcp_guard_conduct_append_only",
] as const;

/**
 * The method's information model. Each of these is a SEPARATE column because
 * they are separate kinds of thing; collapsing them is the conflation the
 * whole model exists to prevent.
 */
const ENTRY_COLUMNS = [
  "observable_fact",
  "candidate_explanation",
  "interviewer_interpretation",
  "alternative_explanation",
  "protective_factor",
  "verification_need",
  "verification_state",
  "verification_source",
  "sensitivity_class",
  "recorded_by",
  "recorded_at",
  "correction_reason",
  "supersedes_entry_id",
  "superseded_by_entry_id",
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

/** The raw text of one `CREATE TABLE public.<name> ( ... );` statement. */
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

/** The text of the bcp_events CHECK the migration rebuilds, and nothing else. */
function eventCheckText(sql: string): string {
  const at = sql.indexOf("ADD CONSTRAINT bcp_events_event_check");
  if (at === -1) return "";
  const end = sql.indexOf("));", at);
  return end === -1 ? "" : sql.slice(at, end + 3);
}

const sql = read(MIGRATION);
const bare = stripComments(sql);
const rb = read(ROLLBACK);
const rbBare = stripComments(rb);
const suite = read(SUITE);
const race = read(RACE);

// ── 1. No parallel case, candidate or report system ──────────────────────
{
  const created = [...bare.matchAll(/CREATE TABLE public\.([a-z0-9_]+) \(/g)].map((m) => m[1]);
  check(
    created.length === TABLES.length && TABLES.every((t) => created.includes(t)),
    `CONDUCT-NO-PARALLEL: PR 5A creates exactly its six conduct tables and nothing else (found: ${created.join(", ") || "none"})`,
  );
  check(
    !/CREATE TABLE public\.(scp_|.*_case[s]?\b|.*_candidate|.*_report|.*_application)/.test(
      bare.replace(/CREATE TABLE public\.bcp_conduct_[a-z_]+ \(/g, ""),
    ),
    "CONDUCT-NO-PARALLEL: and nothing resembling a second case, candidate, application or report store",
  );
  check(
    !/INSERT INTO public\.scp_interview_cases/.test(bare) &&
      !/UPDATE public\.scp_interview_cases/.test(bare),
    "CONDUCT-REUSE: it neither creates nor mutates an interview case — the case must already exist",
  );
  for (const reused of ["scp_iv_can_read_case", "scp_iv_can_write_case", "bcp_operation_begin"]) {
    check(
      new RegExp(`public\\.${reused}\\(`).test(bare),
      `CONDUCT-REUSE: it reuses the existing ${reused} rather than inventing a second one`,
    );
  }
  // COUNT the ledger writes, don't merely find one. Every governed mutation
  // must record its event, and a single call site renamed away would leave a
  // "does bcp_record_event appear anywhere" check perfectly satisfied -- a
  // planted control proved exactly that.
  const ledgerWrites = (bare.match(/PERFORM public\.bcp_record_event\(/g) ?? []).length;
  check(
    ledgerWrites >= CLIENT_MUTATIONS.length,
    `CONDUCT-REUSE: every one of the ${CLIENT_MUTATIONS.length} governed mutations writes to PR 3's existing ledger (found ${ledgerWrites} calls)`,
  );
  check(
    !/CREATE TABLE public\.[a-z0-9_]*event/.test(bare),
    "CONDUCT-REUSE: and opens no event ledger of its own — PR 3's bcp_events carries the conduct events",
  );
  check(
    /REFERENCES public\.bcp_case_links\(id\)/.test(bare) &&
      /REFERENCES public\.bcp_case_topics\(id\)/.test(bare) &&
      /REFERENCES public\.scp_interview_cases\(id\)/.test(bare),
    "CONDUCT-REUSE: the session stands on PR 4's link and PR 4's topics, against the existing case",
  );
}

// ── 2. The information model is columns, not a blob ──────────────────────
{
  const cols = tableColumns(sql, "bcp_conduct_entries");
  for (const col of ENTRY_COLUMNS) {
    check(
      cols.includes(col),
      `CONDUCT-MODEL: the entry carries ${col} as its own column, so it cannot be conflated with another kind of statement`,
    );
  }
  const allText = TABLES.map((t) => stripComments(tableText(sql, t))).join("\n");
  check(
    !/\bjsonb\b/.test(allText),
    "CONDUCT-MODEL: no conduct table carries a jsonb column — the distinctions cannot collapse back into one blob",
  );
  check(
    /CONSTRAINT bcp_conduct_entries_not_empty CHECK/.test(stripComments(sql)),
    "CONDUCT-MODEL: an entry that records nothing at all is refused",
  );
  check(
    /verification_state text NOT NULL DEFAULT 'not_required'[\s\S]{0,200}'verified', 'not_verified', 'inconclusive'/.test(
      stripComments(sql),
    ),
    "CONDUCT-MODEL: verification_state is a governed vocabulary, not free text",
  );
  check(
    /sensitivity_class text NOT NULL DEFAULT 'ordinary'[\s\S]{0,120}'sensitive', 'special_category'/.test(
      stripComments(sql),
    ),
    "CONDUCT-MODEL: sensitivity_class is a governed vocabulary too",
  );
}

// ── 3. Nowhere to put a judgement ────────────────────────────────────────
{
  const allCols = TABLES.flatMap((t) => tableColumns(sql, t))
    .join(" ")
    .toLowerCase();
  for (const word of FORBIDDEN_WORDS) {
    check(
      !allCols.includes(word),
      `CONDUCT-NO-JUDGEMENT: no column named for "${word}" exists anywhere in the conduct layer`,
    );
  }
  check(
    /resolution_kind text NOT NULL CHECK \(resolution_kind IN \('agreed', 'disagreed'\)\)/.test(
      stripComments(sql),
    ),
    "CONDUCT-NO-JUDGEMENT: a panel records agreement or disagreement and nothing else — there is no averaging outcome",
  );
  const res = functionText(sql, "bcp_conduct_record_resolution");
  const resBody = res ? functionBody(res) : "";
  check(
    /BCP_CONDUCT_DIVERGENCE_REQUIRED/.test(resBody) &&
      /_resolution_kind = 'disagreed' AND length\(btrim\(coalesce\(_divergent_statement, ''\)\)\) = 0/.test(
        resBody,
      ),
    "CONDUCT-DISAGREEMENT: a recorded disagreement must carry what the parties differ on, or it is refused",
  );
  check(
    !/\b(avg|sum|count\(\*\) *\/|percentile|median)\b/i.test(resBody),
    "CONDUCT-DISAGREEMENT: and the resolution path computes no average, total or percentile",
  );
  const ws = functionText(sql, "bcp_conduct_workspace");
  const wsBody = ws ? functionBody(ws) : "";
  check(
    /'produces_score', false/.test(wsBody) &&
      /'produces_ranking', false/.test(wsBody) &&
      /'produces_recommendation', false/.test(wsBody) &&
      /'interpretation', 'none'/.test(wsBody),
    "CONDUCT-NO-JUDGEMENT: the workspace says in its own payload that it produces no score, ranking or recommendation",
  );
}

// ── 4. Independence: nobody sees another position before their own locks ─
{
  const vis = functionText(sql, "bcp_conduct_may_see_others");
  check(vis !== null, "CONDUCT-INDEPENDENCE: the visibility helper exists");
  const visBody = vis ? functionBody(vis) : "";
  check(
    /me\.assessor_id = auth\.uid\(\)[\s\S]{0,80}me\.state = 'locked'/.test(visBody),
    "CONDUCT-INDEPENDENCE: the reader's OWN position must be locked — the harm is anchoring on someone else, so it is their own lock that gates it",
  );
  check(
    /NOT EXISTS \(SELECT 1 FROM public\.bcp_conduct_positions o[\s\S]{0,200}o\.state <> 'locked'\)/.test(
      visBody,
    ),
    "CONDUCT-INDEPENDENCE: and either the panel revealed or no position is still open",
  );
  for (const table of [
    "bcp_conduct_positions",
    "bcp_conduct_entries",
    "bcp_conduct_verifications",
  ]) {
    check(
      new RegExp(
        `CREATE POLICY [a-z_]+ ON public\\.${table}[\\s\\S]{0,600}bcp_conduct_may_see_others`,
      ).test(bare),
      `CONDUCT-INDEPENDENCE: ${table}'s row policy asks the same question, so the rule holds at the row and not only in a read model`,
    );
  }
  const reopen = functionText(sql, "bcp_conduct_reopen_position");
  const reopenBody = reopen ? functionBody(reopen) : "";
  check(
    /BCP_CONDUCT_PANEL_ALREADY_REVEALED/.test(reopenBody) &&
      /p\.state IN \('revealed', 'concluded'\)/.test(reopenBody),
    "CONDUCT-INDEPENDENCE: a position cannot be reopened once the panel has read it, so no recorded view is revised in the light of others'",
  );
  const panelGuard = functionText(sql, "bcp_guard_conduct_panel");
  const panelGuardBody = panelGuard ? functionBody(panelGuard) : "";
  check(
    /BCP_CONDUCT_REVEAL_TOO_EARLY/.test(panelGuardBody) &&
      /p\.state <> 'locked'/.test(panelGuardBody),
    "CONDUCT-INDEPENDENCE: the reveal-after-everyone-locks rule is a row trigger, so it holds against the table owner too",
  );
}

// ── 5. Correction appends; nothing is overwritten ────────────────────────
{
  const entryGuard = functionText(sql, "bcp_guard_conduct_entry");
  const g = entryGuard ? functionBody(entryGuard) : "";
  check(
    /BCP_CONDUCT_ENTRY_NO_DELETE/.test(g) && /TG_OP = 'DELETE'/.test(g),
    "CONDUCT-APPEND-ONLY: an entry can never be deleted",
  );
  check(
    /BCP_CONDUCT_ENTRY_EDITED_IN_PLACE/.test(g) &&
      /NEW\.observable_fact IS DISTINCT FROM OLD\.observable_fact/.test(g) &&
      /NEW\.candidate_explanation IS DISTINCT FROM OLD\.candidate_explanation/.test(g) &&
      /NEW\.interviewer_interpretation IS DISTINCT FROM OLD\.interviewer_interpretation/.test(g),
    "CONDUCT-APPEND-ONLY: what an entry SAYS is frozen — a correction supersedes instead",
  );
  check(
    /BCP_CONDUCT_VERIFICATION_UNRECORDED/.test(g) &&
      /IF NOT EXISTS \(\s*SELECT 1 FROM public\.bcp_conduct_verifications v/.test(g),
    "CONDUCT-APPEND-ONLY: the one field that moves in place — the verification state — moves only with a history row behind it",
  );
  check(
    /CREATE UNIQUE INDEX bcp_conduct_entries_one_live_per_position_item_idx/.test(bare),
    "CONDUCT-APPEND-ONLY: one live entry per position and item is a unique index, so it holds under concurrency",
  );
  const save = functionText(sql, "bcp_conduct_save_entry");
  const saveBody = save ? functionBody(save) : "";
  check(
    /IF length\(btrim\(coalesce\(_correction_reason, ''\)\)\) < 3 THEN[\s\S]{0,200}BCP_CONDUCT_CORRECTION_REASON_REQUIRED/.test(
      saveBody,
    ),
    "CONDUCT-CORRECTION: a correction states why, by a REACHABLE condition and not merely a message",
  );
  check(
    // Both indexes must be real. indexOf returns -1 when the vacate step is
    // deleted outright, and -1 is less than everything, so the bare comparison
    // passed with the defect applied -- a planted control caught it.
    saveBody.includes("UPDATE public.bcp_conduct_entries") &&
      saveBody.includes("INSERT INTO public.bcp_conduct_entries") &&
      saveBody.indexOf("UPDATE public.bcp_conduct_entries") <
        saveBody.indexOf("INSERT INTO public.bcp_conduct_entries"),
    "CONDUCT-CORRECTION: the predecessor vacates the live slot BEFORE the successor enters it, or the index would refuse both",
  );
  check(
    /DEFERRABLE INITIALLY DEFERRED/.test(stripComments(sql)),
    "CONDUCT-CORRECTION: and the self-reference is deferred, which is the only thing that makes that ordering legal",
  );
  for (const t of ["bcp_conduct_verifications", "bcp_conduct_panel_resolutions"]) {
    check(
      new RegExp(
        `CREATE TRIGGER ${t}_append_only\\s+BEFORE UPDATE OR DELETE ON public\\.${t}`,
      ).test(bare),
      `CONDUCT-APPEND-ONLY: ${t} refuses every update and delete`,
    );
  }
}

// ── 6. Idempotency, revision and concurrency on every mutation ───────────
{
  for (const fn of CLIENT_MUTATIONS) {
    const text = functionText(sql, fn);
    check(text !== null, `CONDUCT-RPC: ${fn} exists`);
    const body = text ? functionBody(text) : "";
    check(
      /_replay := public\.bcp_operation_begin\(_operation_id, _hash\);/.test(body) &&
        /IF _replay IS NOT NULL THEN RETURN _replay; END IF;/.test(body),
      `CONDUCT-IDEMPOTENCY: ${fn} answers a replay through bcp_operation_begin`,
    );
    const replayAt = body.indexOf("bcp_operation_begin");
    const firstWrite = Math.min(
      ...["INSERT INTO", "UPDATE public."]
        .map((k) => body.indexOf(k))
        .filter((n) => n >= 0)
        .concat([body.length]),
    );
    check(
      replayAt >= 0 && replayAt < firstWrite,
      `CONDUCT-IDEMPOTENCY: and the replay check precedes ${fn}'s first write, not merely appears in it`,
    );
    check(
      /pg_advisory_xact_lock\(hashtextextended\(/.test(body),
      `CONDUCT-CONCURRENCY: ${fn} serialises on a transaction-scoped advisory lock`,
    );
    check(
      /public\.scp_iv_can_write_case\(/.test(body),
      `CONDUCT-AUTHORISATION: ${fn} goes through the EXISTING case write authority, which already refuses a non-member, a cancelled case and a retained one`,
    );
  }

  for (const fn of [
    "bcp_conduct_save_entry",
    "bcp_conduct_record_verification",
    "bcp_conduct_lock_position",
    "bcp_conduct_reopen_position",
    "bcp_conduct_reveal_panel",
    "bcp_conduct_record_resolution",
  ]) {
    const text = functionText(sql, fn);
    const body = text ? functionBody(text) : "";
    check(
      /BCP_STALE_REVISION/.test(body) && /BCP_REVISION_REQUIRED/.test(body),
      `CONDUCT-REVISION: ${fn} requires the revision the caller saw and refuses a stale one`,
    );
  }

  for (const fn of [
    "bcp_conduct_save_entry",
    "bcp_conduct_record_verification",
    "bcp_conduct_lock_position",
    "bcp_conduct_reopen_position",
  ]) {
    const text = functionText(sql, fn);
    const body = text ? functionBody(text) : "";
    check(
      /IF _p\.assessor_id <> _caller THEN[\s\S]{0,200}BCP_CONDUCT_NOT_OWN_POSITION/.test(body),
      `CONDUCT-INDEPENDENCE: ${fn} refuses to touch anybody else's position`,
    );
  }
}

// ── 7. RLS, grants and the PostgREST surface ─────────────────────────────
{
  for (const table of TABLES) {
    check(
      new RegExp(`ALTER TABLE public\\.${table}\\s+ENABLE ROW LEVEL SECURITY`).test(bare) &&
        new RegExp(`ALTER TABLE public\\.${table}\\s+FORCE\\s+ROW LEVEL SECURITY`).test(bare),
      `CONDUCT-RLS: ${table} carries ENABLE and FORCE ROW LEVEL SECURITY`,
    );
    check(
      new RegExp(
        `REVOKE ALL ON public\\.${table}\\s+FROM PUBLIC, anon, authenticated, service_role;`,
      ).test(bare),
      `CONDUCT-GRANTS: ${table} is revoked from every role first — silence would be a grant`,
    );
    check(
      new RegExp(`GRANT SELECT ON public\\.${table}\\s+TO authenticated, service_role;`).test(bare),
      `CONDUCT-GRANTS: ${table} re-grants SELECT only`,
    );
    check(
      !new RegExp(`GRANT (ALL|INSERT|UPDATE|DELETE)[^;]*ON public\\.${table}`).test(bare),
      `CONDUCT-GRANTS: no write privilege is granted on ${table} to any role`,
    );
    check(
      new RegExp(`CREATE POLICY [a-z_]+ ON public\\.${table}\\s+FOR SELECT`).test(bare),
      `CONDUCT-RLS: ${table} carries a SELECT policy, so its grant is not dead`,
    );
    check(
      !new RegExp(
        `CREATE POLICY [a-z_]+ ON public\\.${table}\\s+FOR (INSERT|UPDATE|DELETE|ALL)`,
      ).test(bare),
      `CONDUCT-RLS: ${table} carries no write policy — every write goes through a governed RPC`,
    );
  }
  check(
    !/USING \(\s*true\b/.test(bare) && !/WITH CHECK \(\s*true\b/.test(bare),
    "CONDUCT-RLS: no policy predicate opens on an unconditional true",
  );

  for (const fn of TRIGGER_FUNCTIONS) {
    check(
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${fn}\\(\\)\\s+FROM PUBLIC, anon, authenticated, service_role;`,
      ).test(bare),
      `CONDUCT-SURFACE: ${fn}() is revoked from every role, so PostgREST does not publish an invariant-checker as an API`,
    );
    check(
      !new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\(\\)`).test(bare),
      `CONDUCT-SURFACE: and nothing grants EXECUTE on ${fn}() back`,
    );
  }

  for (const fn of [...CLIENT_MUTATIONS, ...CLIENT_READS]) {
    const text = functionText(sql, fn);
    check(
      text !== null && /SECURITY DEFINER/.test(text) && /SET search_path = public/.test(text),
      `CONDUCT-SURFACE: ${fn} is SECURITY DEFINER with a pinned search_path`,
    );
    check(
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${fn}\\([\\s\\S]{0,120}?\\)\\s*\\n?\\s*FROM PUBLIC, anon`,
      ).test(bare),
      `CONDUCT-SURFACE: ${fn} is revoked from PUBLIC and anon before any grant`,
    );
    check(
      new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${fn}\\([\\s\\S]{0,120}?\\)\\s*\\n?\\s*TO authenticated, service_role;`,
      ).test(bare),
      `CONDUCT-SURFACE: and re-granted only to authenticated and service_role`,
    );
  }

  const created = [...bare.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z0-9_]+)\(/g)].map(
    (m) => m[1],
  );
  const known = new Set<string>([...CLIENT_MUTATIONS, ...CLIENT_READS, ...TRIGGER_FUNCTIONS]);
  check(
    created.every((n) => known.has(n)),
    `CONDUCT-SURFACE: PR 5A creates no function outside its declared surface (unexpected: ${created.filter((n) => !known.has(n)).join(", ") || "none"})`,
  );
}

// ── 8. The vocabulary is extended, never narrowed ────────────────────────
{
  // Read the CONSTRAINT, not the file. Every one of these names also appears in
  // the postflight loop and in the RPCs that raise them, so testing the whole
  // migration would pass even after the CHECK had dropped the member -- which a
  // planted control proved, twice.
  const eventCheck = eventCheckText(bare);
  check(eventCheck.length > 0, "CONDUCT-VOCABULARY: the migration rebuilds the bcp_events CHECK");
  for (const existing of [
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
  ]) {
    check(
      new RegExp(`'${existing}'`).test(eventCheck),
      `CONDUCT-VOCABULARY: the rebuilt event CHECK still admits '${existing}' — a rebuild that dropped one would break PR 3 or PR 4 silently`,
    );
  }
  for (const added of [
    "conduct_session_started",
    "conduct_entry_saved",
    "conduct_entry_corrected",
    "conduct_verification_requested",
    "conduct_verification_updated",
    "conduct_position_locked",
    "conduct_position_reopened",
    "conduct_panel_opened",
    "conduct_panel_revealed",
    "conduct_panel_resolution_recorded",
  ]) {
    check(
      new RegExp(`'${added}'`).test(eventCheck),
      `CONDUCT-AUDIT: the ledger's own CHECK admits '${added}', so that action is explainable afterwards`,
    );
  }
}

// ── 9. Preflight and postflight ──────────────────────────────────────────
{
  check(
    // BOTH refusals, counted. There are two -- one for a missing table, one for
    // a missing function -- so requiring merely that the phrase appears left
    // the table one free to become a RAISE NOTICE, which a control proved.
    (bare.match(/RAISE EXCEPTION 'BCP_CONDUCT_PREFLIGHT/g) ?? []).length === 2 &&
      /to_regclass\('public\.' \|\| t\) IS NULL/.test(bare),
    "CONDUCT-PREFLIGHT: the migration REFUSES early and by name, for a missing table and a missing function alike",
  );
  check(
    /RAISE NOTICE 'BESKT_INTERVIEW_CONDUCT_PROOF ok'/.test(bare),
    "CONDUCT-POSTFLIGHT: the migration proves its own outcome before it commits",
  );
  check(
    /has_table_privilege\('authenticated'/.test(bare) &&
      /has_function_privilege\('anon'/.test(bare),
    "CONDUCT-POSTFLIGHT: and interrogates real privileges through the catalogue rather than restating its own GRANTs",
  );
  check(
    /the migration created % session\(s\); it must seed none/.test(sql),
    "CONDUCT-POSTFLIGHT: and proves it seeded nothing",
  );
}

// ── 10. The rollback refuses rather than discards ───────────────────────
{
  check(
    /FROM public\.bcp_conduct_sessions;[\s\S]{0,800}RAISE EXCEPTION[\s\S]{0,300}BCP_CONDUCT_ROLLBACK/.test(
      rbBare,
    ),
    "CONDUCT-ROLLBACK: it refuses while any conduct session exists — a recorded interview about a named person is not a script's to discard",
  );
  check(
    /event LIKE 'conduct\\_%'[\s\S]{0,600}RAISE EXCEPTION/.test(rbBare),
    "CONDUCT-ROLLBACK: and refuses while conduct events sit on the append-only ledger it would un-declare",
  );
  check(!/CASCADE/.test(rbBare), "CONDUCT-ROLLBACK: it drops nothing with CASCADE");
  const order = [
    "DROP TABLE IF EXISTS public.bcp_conduct_panel_resolutions;",
    "DROP TABLE IF EXISTS public.bcp_conduct_panels;",
    "DROP TABLE IF EXISTS public.bcp_conduct_verifications;",
    "DROP TABLE IF EXISTS public.bcp_conduct_entries;",
    "DROP TABLE IF EXISTS public.bcp_conduct_positions;",
    "DROP TABLE IF EXISTS public.bcp_conduct_sessions;",
  ].map((d) => rbBare.indexOf(d));
  check(
    order.every((n) => n >= 0) && order.every((n, i) => i === 0 || n > order[i - 1]),
    "CONDUCT-ROLLBACK: and drops children before their parents, in an explicit order",
  );
  for (const fn of [...CLIENT_MUTATIONS, ...CLIENT_READS, ...TRIGGER_FUNCTIONS]) {
    check(
      new RegExp(`DROP FUNCTION IF EXISTS public\\.${fn}\\(`).test(rbBare),
      `CONDUCT-ROLLBACK: it drops ${fn} by name, so nothing of PR 5A survives an unwind that claims nothing does`,
    );
  }
  check(
    /'case_linked', 'case_unlinked'\)\)/.test(rbBare) &&
      !/conduct_session_started/.test(
        rbBare.slice(rbBare.indexOf("ADD CONSTRAINT bcp_events_event_check")),
      ),
    "CONDUCT-ROLLBACK: the restored vocabulary is PR 4's exactly — its members kept, PR 5A's gone",
  );
  check(
    /RAISE NOTICE 'BESKT_INTERVIEW_CONDUCT_ROLLBACK ok'/.test(rbBare),
    "CONDUCT-ROLLBACK: it proves its own outcome rather than assuming it",
  );
  check(
    /PR 4''s tables were dropped; this rollback unwinds PR 5A only/.test(rb),
    "CONDUCT-ROLLBACK: and proves it left PR 4 standing",
  );
}

// ── 11. Registration ─────────────────────────────────────────────────────
{
  const dbTest = read(DB_TEST);
  check(
    dbTest.includes("supabase/tests/bcp_interview_conduct_test.sql"),
    "CONDUCT-REGISTRATION: the behaviour suite runs in scripts/db-test.sh",
  );
  const floor = /CND_PASSED" -lt (\d+)/.exec(dbTest);
  check(
    floor !== null && Number(floor[1]) >= 90,
    "CONDUCT-REGISTRATION: with an assertion floor, so a silently shrinking suite fails rather than passes",
  );
  check(
    dbTest.includes("supabase/tests/bcp_conduct_race_fixture.sql") &&
      dbTest.includes("BCP_CONDUCT_ALREADY_LOCKED|BCP_STALE_REVISION"),
    "CONDUCT-REGISTRATION: the two-connection lock race runs too, and requires exactly one winner and one named refusal",
  );
  check(
    dbTest.includes("BESKT_INTERVIEW_CONDUCT_ROLLBACK ok") &&
      dbTest.includes("BESKT_INTERVIEW_CONDUCT_PROOF ok"),
    "CONDUCT-REGISTRATION: and the rollback and re-apply are executed for real, with their proofs required",
  );
  check(
    dbTest.includes("the rollback REFUSES to discard a recorded interview"),
    "CONDUCT-REGISTRATION: and the refusal itself is proved, not merely the success path",
  );
  // PR 4's own rollback test unwinds bcp_case_links for real. The conduct
  // tables hold foreign keys into it, so PR 5A must be STOOD DOWN before that
  // point -- not merely before PR 4's final stand-down. Ordering the whole PR
  // 5A block ahead of PR 4's rollback section is what makes the replay work,
  // and this assertion is what noticed it was in the wrong place.
  const suiteAt = dbTest.indexOf("bcp_interview_conduct_test.sql");
  const conductStandDown = dbTest.indexOf("# Stand PR 5A down so PR 4 can be unwound below");
  const pr4RollbackSection = dbTest.indexOf(
    "# The PR 4 rollback, for real, then the migration re-applied over it.",
  );
  check(
    suiteAt >= 0 && conductStandDown > suiteAt,
    "CONDUCT-REGISTRATION: the suite runs before PR 5A is stood down",
  );
  check(
    conductStandDown >= 0 && pr4RollbackSection > conductStandDown,
    "CONDUCT-REGISTRATION: and PR 5A is stood down before PR 4's rollback runs, because the conduct layer's foreign keys into PR 4 are real",
  );

  const rollbackSuite = read(ROLLBACK_SUITE);
  const conductAt = rollbackSuite.indexOf("DROP TABLE IF EXISTS public.bcp_conduct_sessions;");
  const linksAt = rollbackSuite.indexOf("DROP TABLE IF EXISTS public.bcp_case_links;");
  check(
    conductAt >= 0 && linksAt >= 0 && conductAt < linksAt,
    "CONDUCT-REGISTRATION: the documented full-unwind drops the conduct layer before PR 4's, because its foreign keys into PR 4 are real",
  );

  const pkg = read(PACKAGE);
  check(
    pkg.includes('"beskt-interview-conduct:check"'),
    "CONDUCT-REGISTRATION: the guard has a package script",
  );
  check(
    pkg.includes('"negative-controls:beskt-interview-conduct"') &&
      /"negative-controls:all":[^\n]*negative-controls:beskt-interview-conduct/.test(pkg),
    "CONDUCT-REGISTRATION: its controls have a script AND are part of negative-controls:all",
  );
  const ci = read(CI);
  check(ci.includes("beskt-interview-conduct:check"), "CONDUCT-REGISTRATION: the guard runs in CI");
  check(
    ci.includes("negative-controls:all"),
    "CONDUCT-REGISTRATION: and CI runs negative-controls:all, which the package script puts these controls inside",
  );
  const tsconfig = read(TSCONFIG);
  check(
    tsconfig.includes('"scripts/beskt-interview-conduct-check.ts"') &&
      tsconfig.includes('"scripts/negative-controls/beskt-interview-conduct-controls.ts"'),
    "CONDUCT-REGISTRATION: the guard and its controls are typechecked",
  );

  const state = JSON.parse(read(RELEASE_STATE)) as {
    frontier?: Array<{
      file?: string;
      hostedState?: string;
      verify?: unknown;
      rollback?: unknown;
      introduces?: unknown[];
    }>;
  };
  const entry = (state.frontier ?? []).find((m) => m.file === MIGRATION_NAME);
  check(
    entry !== undefined,
    "CONDUCT-REGISTRATION: the migration is declared in release-state.json",
  );
  check(
    entry?.hostedState === "pending",
    "CONDUCT-REGISTRATION: and declared PENDING — it has not been applied to the hosted project, and saying otherwise would be the claim this whole stack exists to prevent",
  );
  check(
    entry?.verify !== undefined && entry?.rollback !== undefined,
    "CONDUCT-REGISTRATION: and carries both how to verify it and how to undo it",
  );
  check(
    Array.isArray(entry?.introduces) &&
      TABLES.every((t) =>
        (entry?.introduces as Array<{ object?: string }>).some((i) => i.object === t),
      ) &&
      [...CLIENT_MUTATIONS, ...CLIENT_READS, ...TRIGGER_FUNCTIONS].every((f) =>
        (entry?.introduces as Array<{ object?: string }>).some((i) => i.object === f),
      ),
    'CONDUCT-REGISTRATION: and declares every object it introduces, so "can code depend on this yet?" is answerable from the file',
  );
  const frontier = read(FRONTIER);
  check(
    (/const expectedPending: string\[\] = \[([\s\S]*?)\]/.exec(frontier)?.[1] ?? "").includes(
      MIGRATION_NAME,
    ),
    "CONDUCT-REGISTRATION: the frontier check expects this pending migration by name",
  );

  // SCHEMA-FIRST: nothing may depend on it while it is pending.
  const types = read(TYPES);
  check(
    TABLES.every((t) => !types.includes(t)),
    "CONDUCT-SCHEMA-FIRST: the generated types do NOT yet describe the conduct tables, because the migration is pending",
  );
}

// ── 12. The suite proves rather than reports ────────────────────────────
{
  check(
    /SYNTETISK/.test(suite),
    "CONDUCT-SUITE: everything the suite plants is labelled synthetic",
  );
  check(
    /^BEGIN;/m.test(suite) && /^ROLLBACK;/m.test(suite),
    "CONDUCT-SUITE: and the whole suite runs in one transaction that is rolled back, so it seeds nothing",
  );
  const labels = [...suite.matchAll(/'(C\d+\.\d+ [^']+)'/g)].map((m) => m[1]);
  check(
    labels.length >= 90,
    `CONDUCT-SUITE: it carries at least 90 labelled assertions (found ${labels.length})`,
  );
  check(
    new Set(labels).size === labels.length,
    "CONDUCT-SUITE: and no two assertions share a label, so a failure names exactly one thing",
  );
  check(
    /SYNTETISK/.test(race) && /b6000000/.test(race) && !/b5000000/.test(race),
    "CONDUCT-SUITE: the race fixture is synthetic too, on its OWN actor prefix and none of the suite's, so the two cannot collide",
  );
  for (const needle of [
    ...CLIENT_MUTATIONS,
    "bcp_conduct_workspace",
    "bcp_conduct_entry_history",
  ]) {
    check(suite.includes(needle), `CONDUCT-SUITE: the suite exercises ${needle}`);
  }
  check(
    /must_fail_as\('anon'/.test(suite),
    "CONDUCT-SUITE: and proves what an unauthenticated principal gets, rather than assuming",
  );
}

// ── 13. PR 3 and PR 4 are not disturbed ─────────────────────────────────
{
  check(!/DROP TABLE/.test(bare), "CONDUCT-NO-REGRESSION: PR 5A drops no table at all");
  check(
    !/ALTER TABLE public\.bcp_(case_links|case_topics|assignments|responses|answers)\s+(ADD|DROP|ALTER) COLUMN/i.test(
      bare,
    ),
    "CONDUCT-NO-REGRESSION: and adds, drops or alters no column on any PR 3 or PR 4 table",
  );
  check(
    !/DROP FUNCTION[^;]*bcp_(link_preparation_to_case|unlink_preparation_from_case|assign|submit|save_answers)/.test(
      bare,
    ),
    "CONDUCT-NO-REGRESSION: and drops none of PR 3's or PR 4's governed mutations",
  );
  check(
    read(PR4_MIGRATION).includes("CREATE TABLE public.bcp_case_links ("),
    "CONDUCT-NO-REGRESSION: the link PR 5A stands on is PR 4's, read from PR 4's own migration",
  );
}

if (failures.length > 0) {
  console.error(`\nBESKT interview-conduct guard FAILED (${failures.length} of ${assertions}).`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`\nBESKT interview-conduct guard: ${assertions} of ${assertions} assertions passed.`);
