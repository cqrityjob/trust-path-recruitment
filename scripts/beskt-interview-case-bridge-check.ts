/**
 * BESKT PR 4 — the interview-case bridge source guard.
 *
 * The database suite (supabase/tests/bcp_interview_case_bridge_test.sql)
 * proves behaviour against a replayed schema, but it runs only in the database
 * job. This guard reads the migration, the rollback, the suite and the release
 * bookkeeping STRUCTURALLY, in the fast job, so a defect that never reaches a
 * replay is still caught — and so every material assertion has a planted
 * negative control
 * (scripts/negative-controls/beskt-interview-case-bridge-controls.ts).
 *
 * It inspects the real computation: function bodies with comments stripped,
 * DDL column lists, grants, trigger definitions and index predicates. Never a
 * reassuring comment, and never an error-message string on its own.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

const MIGRATION_NAME = "20261112090000_bcp_interview_case_bridge.sql";
const MIGRATION = join(ROOT, "supabase/migrations", MIGRATION_NAME);
const ROLLBACK = join(
  ROOT,
  "supabase/rollback/20261112090000_bcp_interview_case_bridge_rollback.sql",
);
const SUITE = join(ROOT, "supabase/tests/bcp_interview_case_bridge_test.sql");
const PR3_MIGRATION = join(
  ROOT,
  "supabase/migrations/20261110090000_bcp_candidate_preparation.sql",
);
const DB_TEST = join(ROOT, "scripts/db-test.sh");
const RELEASE_STATE = join(ROOT, "supabase/release-state.json");
const PACKAGE = join(ROOT, "package.json");
const CI = join(ROOT, ".github/workflows/ci.yml");
const TSCONFIG = join(ROOT, "tsconfig.scripts.json");
const FRONTIER = join(ROOT, "scripts/release-frontier-check.ts");
const ROLLBACK_SUITE = join(ROOT, "supabase/tests/scp_a_rollback_test.sql");

/** The two tables PR 4 adds. Nothing else may appear. */
const TABLES = ["bcp_case_links", "bcp_case_topics"] as const;

/** The governed mutations a browser principal can reach. */
const CLIENT_MUTATIONS = [
  "bcp_link_preparation_to_case",
  "bcp_unlink_preparation_from_case",
] as const;

/** The read models a browser principal can reach. */
const CLIENT_READS = [
  "bcp_linkable_interview_cases",
  "bcp_case_preparation_basis",
  "bcp_my_preparation_link",
] as const;

/** Trigger functions. Reached BY a trigger, never by a caller. */
const TRIGGER_FUNCTIONS = ["bcp_guard_case_link", "bcp_guard_case_topic"] as const;

/**
 * Words for a reading of a voluntary omission. PR 1 section 7 forbids every
 * one of them, and a schema that could store one would be where it appeared.
 */
const JUDGEMENT_WORDS = [
  "refused",
  "evasive",
  "withheld",
  "concealed",
  "suspicious",
  "risk_level",
  "risk_score",
  "credibility",
  "truthfulness",
  "veracity",
  "concern_level",
  "red_flag",
  "recommendation",
  "suitability",
  "ranking",
  "rank_order",
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
const suite = read(SUITE);
const pr3 = stripComments(read(PR3_MIGRATION));

// ── 1. No parallel case system ────────────────────────────────────────────
//
// The brief's first requirement. PR 4 is a BRIDGE: it must reuse the case,
// application, evidence and event structures that already exist. The way that
// stops being true is a second case table, so the guard reads the DDL rather
// than trusting the word "bridge" in a comment.
{
  const created = [...bare.matchAll(/CREATE TABLE public\.([a-z0-9_]+) \(/g)].map((m) => m[1]);
  check(
    created.length === TABLES.length && TABLES.every((t) => created.includes(t)),
    `BRIDGE-NO-PARALLEL: PR 4 creates exactly ${TABLES.join(" and ")} — no second case, application or evidence store (found: ${created.join(", ") || "none"})`,
  );
  check(
    !/CREATE TABLE public\.[a-z0-9_]*(case|interview|application|evidence|session)[a-z0-9_]*s? \(/.test(
      bare.replace(/CREATE TABLE public\.bcp_case_(links|topics) \(/g, ""),
    ),
    "BRIDGE-NO-PARALLEL: and nothing resembling a parallel case, interview, application, evidence or session store",
  );
  check(
    // The word boundary is load-bearing: without it, renaming the target to
    // scp_interview_case_sources_disabled would still satisfy a prefix match,
    // and the assertion would go on passing while the evidence row was never
    // written. A planted control proved exactly that.
    /INSERT INTO public\.scp_interview_case_sources\b(?!_)/.test(bare),
    "BRIDGE-REUSE: the link registers itself on the EXISTING scp_interview_case_sources evidence structure",
  );
  check(
    !/INSERT INTO public\.scp_interview_cases/.test(bare) &&
      !/UPDATE public\.scp_interview_cases/.test(bare),
    "BRIDGE-REUSE: and it neither creates nor mutates an interview case — the case must already exist",
  );
  check(
    /PERFORM public\.bcp_record_event\(/.test(bare),
    "BRIDGE-REUSE: the operation is recorded on the EXISTING bcp_events ledger through PR 3's own writer",
  );
  check(
    /CREATE TABLE public\.[a-z0-9_]*event/.test(bare) === false,
    "BRIDGE-REUSE: and PR 4 opens no event ledger of its own",
  );
}

// ── 2. The two governed vocabularies are EXTENDED, by catalogue lookup ────
{
  check(
    /'beskt_preparation'/.test(bare) &&
      /FROM pg_constraint c[\s\S]{0,400}pg_get_constraintdef\(c\.oid\) LIKE '%source_kind%'/.test(
        bare,
      ),
    "BRIDGE-VOCABULARY: the source-kind CHECK is found in the CATALOGUE, not by a generated name a future Postgres could spell differently",
  );
  check(
    /'case_linked'/.test(bare) && /'case_unlinked'/.test(bare),
    "BRIDGE-VOCABULARY: the event vocabulary gains case_linked and case_unlinked",
  );
  for (const existing of [
    "assignment_created",
    "notice_acknowledged",
    "response_saved",
    "response_submitted",
    "assignment_cancelled",
    "assignment_opened",
    "pilot_granted",
    "pilot_revoked",
  ]) {
    check(
      new RegExp(`'${existing}'`).test(bare),
      `BRIDGE-VOCABULARY: the rebuilt event CHECK still admits '${existing}' — a rebuild that dropped a member would break PR 3 silently`,
    );
  }
}

// ── 3. The bound snapshot is a copy, not a pointer ────────────────────────
{
  const cols = tableColumns(sql, "bcp_case_links");
  for (const col of [
    "bound_response_id",
    "bound_response_version",
    "bound_assignment_revision",
    "bound_method_version_id",
    "bound_content_hash",
    "bound_answers_content_hash",
    "bound_notice_version",
    "bound_notice_content_hash",
    "bound_notice_locale",
  ]) {
    check(
      cols.includes(col),
      `BRIDGE-SNAPSHOT: bcp_case_links carries ${col}, so what was answered against what content is answerable from the row`,
    );
  }
  for (const col of [
    "bound_content_hash",
    "bound_answers_content_hash",
    "bound_notice_content_hash",
  ]) {
    check(
      new RegExp(`${col} text NOT NULL CHECK \\(${col} ~ '\\^\\[0-9a-f\\]\\{64\\}\\$'\\)`).test(
        stripComments(sql),
      ),
      `BRIDGE-SNAPSHOT: ${col} is constrained to a lowercase 64-hex digest, so a placeholder cannot be bound`,
    );
  }

  const guard = functionText(sql, "bcp_guard_case_link");
  check(guard !== null, "BRIDGE-SNAPSHOT: the link guard trigger function exists");
  const guardBody = guard ? functionBody(guard) : "";
  check(
    /NEW\.bound_response_version <> _r\.response_version/.test(guardBody) &&
      /NEW\.bound_assignment_revision <> _a\.revision/.test(guardBody) &&
      /NEW\.bound_method_version_id <> _a\.method_version_id/.test(guardBody) &&
      /NEW\.bound_content_hash <> _a\.pinned_content_hash/.test(guardBody) &&
      /NEW\.bound_answers_content_hash <> _r\.submitted_content_hash/.test(guardBody),
    "BRIDGE-SNAPSHOT: the trigger re-derives every bound field from the preparation itself, so a direct write cannot assert a snapshot it does not have",
  );
  check(
    /FROM public\.bcp_notice_acknowledgements ack[\s\S]{0,400}ack\.locale = NEW\.bound_notice_locale/.test(
      guardBody,
    ),
    "BRIDGE-SNAPSHOT: and the bound notice must match a real acknowledgement IN THE LOCALE it was acknowledged in",
  );
  check(
    /_r\.response_state <> 'submitted' OR _r\.submitted_at IS NULL/.test(guardBody) &&
      /_a\.lifecycle_state <> 'submitted'/.test(guardBody) &&
      /BCP_NOT_SUBMITTED/.test(guardBody),
    "BRIDGE-SUBMITTED-ONLY: the trigger refuses anything but a submitted preparation, so a draft cannot be linked even by the table owner",
  );
}

// ── 4. Employers never see a draft ────────────────────────────────────────
{
  const basis = functionText(sql, "bcp_case_preparation_basis");
  check(basis !== null, "BRIDGE-NO-DRAFTS: the employer read model exists");
  const basisBody = basis ? functionBody(basis) : "";
  check(
    /an\.response_id = _l\.bound_response_id/.test(basisBody),
    "BRIDGE-NO-DRAFTS: the employer read model reads answers ONLY by the bound submitted response id",
  );
  check(
    !/response_state = 'draft'/.test(basisBody) && !/'draft'/.test(basisBody),
    "BRIDGE-NO-DRAFTS: and names no draft anywhere, so there is no path from the case to an unsubmitted answer",
  );
  check(
    /'produces_score', false/.test(basisBody) && /'interpretation', 'none'/.test(basisBody),
    "BRIDGE-NO-SCORE: the read model states in its own payload that it produces no score and no interpretation",
  );

  const mine = functionText(sql, "bcp_my_preparation_link");
  check(mine !== null, "BRIDGE-CANDIDATE-VIEW: the candidate read model exists");
  const mineBody = mine ? functionBody(mine) : "";
  check(
    /bcp_is_assignment_candidate/.test(mineBody) && /BCP_NOT_CANDIDATE/.test(mineBody),
    "BRIDGE-CANDIDATE-VIEW: it refuses anyone but the candidate the preparation belongs to",
  );
  check(
    !/'case_id'/.test(mineBody) && !/_l\.case_id/.test(mineBody),
    "BRIDGE-CANDIDATE-VIEW: and returns nothing about the employer's case beyond the fact that a link exists",
  );
}

// ── 5. Nowhere to put a judgement ─────────────────────────────────────────
{
  const allCols = [...TABLES.flatMap((t) => tableColumns(sql, t))].join(" ").toLowerCase();
  for (const word of JUDGEMENT_WORDS) {
    check(
      !allCols.includes(word),
      `BRIDGE-NO-JUDGEMENT: no column named for "${word}" exists on either bridge table`,
    );
  }
  check(
    !/\bjsonb\b/.test(
      TABLES.map((t) => tableColumns(sql, t)).join(" ") +
        " " +
        TABLES.map((t) => {
          const start = sql.indexOf(`CREATE TABLE public.${t} (`);
          return start === -1 ? "" : stripComments(sql.slice(start, sql.indexOf(");", start)));
        }).join(" "),
    ),
    "BRIDGE-NO-JUDGEMENT: neither bridge table carries a free-form jsonb column a judgement could hide inside",
  );
  check(
    /topic_reason text NOT NULL CHECK \(topic_reason IN \('omitted', 'discuss_orally'\)\)/.test(
      stripComments(sql),
    ),
    "BRIDGE-NEUTRAL-STATES: topic_reason admits EXACTLY the candidate's own two states and no third value",
  );

  const link = functionText(sql, "bcp_link_preparation_to_case");
  check(link !== null, "BRIDGE-DERIVATION: the link RPC exists");
  const linkBody = link ? functionBody(link) : "";
  check(
    /an\.response_state IN \('omitted', 'discuss_orally'\)/.test(linkBody),
    "BRIDGE-DERIVATION: the topic set is exactly the answers in those two states — not a selection, not a filter on anything else",
  );
  check(
    /row_number\(\) OVER \(ORDER BY s\.display_order, i\.display_order, an\.item_key\)/.test(
      linkBody,
    ),
    "BRIDGE-DERIVATION: and their order is the governed content's own order, deterministic down to the tie-break — never a weighting",
  );
  check(
    !/\b(score|weight|rank|priority|severity|confidence)\b/i.test(linkBody),
    "BRIDGE-DERIVATION: the derivation scores, weights, ranks and prioritises nothing",
  );
}

// ── 6. Idempotency, revision control and concurrency ──────────────────────
{
  for (const fn of CLIENT_MUTATIONS) {
    const text = functionText(sql, fn);
    check(text !== null, `BRIDGE-RPC: ${fn} exists`);
    const body = text ? functionBody(text) : "";
    check(
      /_replay := public\.bcp_operation_begin\(_operation_id, _hash\);/.test(body) &&
        /IF _replay IS NOT NULL THEN RETURN _replay; END IF;/.test(body),
      `BRIDGE-IDEMPOTENCY: ${fn} answers a replay through bcp_operation_begin BEFORE it writes anything`,
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
      `BRIDGE-IDEMPOTENCY: and the replay check precedes ${fn}'s first write in the body, not merely appears in it`,
    );
    check(
      /pg_advisory_xact_lock\(hashtextextended\(_(l\.)?assignment_id::text, 0\)\)/.test(body),
      `BRIDGE-CONCURRENCY: ${fn} serialises on the preparation with a transaction-scoped advisory lock`,
    );
    // Revision control differs by operation, and asserting the same shape for
    // both would have been a guard that measured nothing. Linking is a
    // compare-and-swap against the preparation, so it names the revision it
    // was looking at. Unlinking addresses one existing LINK by id, whose own
    // state is the concurrency control: an already-unlinked link is refused,
    // and the reason is mandatory because the history is read afterwards.
    if (fn === "bcp_link_preparation_to_case") {
      check(
        /BCP_STALE_REVISION/.test(body) && /BCP_REVISION_REQUIRED/.test(body),
        `BRIDGE-REVISION: ${fn} requires the caller to name the revision it was looking at, and refuses a stale one`,
      );
    } else {
      check(
        /_l\.unlinked_at IS NOT NULL THEN[\s\S]{0,200}BCP_CASE_LINK_ALREADY_UNLINKED/.test(body),
        `BRIDGE-REVISION: ${fn} refuses a link that is already unlinked, so a replayed or concurrent unlink cannot double-mark it`,
      );
      check(
        /length\(btrim\(coalesce\(_reason, ''\)\)\) < 3/.test(body) &&
          /BCP_REASON_REQUIRED/.test(body),
        `BRIDGE-REVISION: and ${fn} requires a usable reason, because the unlink is what an audit of the interview reads afterwards`,
      );
    }
    check(
      /public\.has_employer_role\(_caller, [_a-z.]+, ARRAY\['owner', 'admin', 'member'\]\)/.test(
        body,
      ),
      `BRIDGE-AUTHORISATION: ${fn} admits only members of the preparation's own employer`,
    );
  }

  check(
    /live_slot uuid GENERATED ALWAYS AS \(CASE WHEN unlinked_at IS NULL THEN assignment_id END\) STORED/.test(
      stripComments(sql),
    ) &&
      /CREATE UNIQUE INDEX bcp_case_links_one_live_per_assignment_idx\s+ON public\.bcp_case_links \(live_slot\) WHERE live_slot IS NOT NULL;/.test(
        bare,
      ),
    "BRIDGE-CONCURRENCY: one live link per preparation is a UNIQUE INDEX on a generated column, which holds under concurrency — not a read-then-write a second transaction could race past",
  );
  check(
    /live_case_slot uuid GENERATED ALWAYS AS \(CASE WHEN unlinked_at IS NULL THEN case_id END\) STORED/.test(
      stripComments(sql),
    ) &&
      /CREATE UNIQUE INDEX bcp_case_links_one_live_per_case_idx\s+ON public\.bcp_case_links \(live_case_slot\) WHERE live_case_slot IS NOT NULL;/.test(
        bare,
      ),
    "BRIDGE-CONCURRENCY: and one live link per case, the same way",
  );
  check(
    /link_operation_id uuid NOT NULL UNIQUE/.test(stripComments(sql)) &&
      /unlink_operation_id uuid UNIQUE/.test(stripComments(sql)),
    "BRIDGE-IDEMPOTENCY: both operation ids are UNIQUE on the row itself, so a replay that got past the ledger still cannot duplicate",
  );
}

// ── 7. Append-only: unlink marks, never deletes ──────────────────────────
{
  const unlink = functionText(sql, "bcp_unlink_preparation_from_case");
  const unlinkBody = unlink ? functionBody(unlink) : "";
  check(
    /UPDATE public\.bcp_case_links/.test(unlinkBody) &&
      !/DELETE FROM public\.bcp_case_links/.test(unlinkBody),
    "BRIDGE-APPEND-ONLY: unlinking UPDATES the row and deletes nothing — the history of the attachment survives",
  );
  check(
    !/DELETE FROM public\.bcp_case_topics/.test(unlinkBody),
    "BRIDGE-APPEND-ONLY: and it discards no derived topic either",
  );

  const guardBody = (() => {
    const t = functionText(sql, "bcp_guard_case_link");
    return t ? functionBody(t) : "";
  })();
  check(
    /IF TG_OP = 'DELETE' THEN[\s\S]{0,200}BCP_CASE_LINK_NO_DELETE/.test(guardBody),
    "BRIDGE-APPEND-ONLY: the trigger refuses a DELETE outright, so append-only holds against the table owner too",
  );
  check(
    /OLD\.unlinked_at IS NOT NULL THEN[\s\S]{0,200}BCP_CASE_LINK_IMMUTABLE/.test(guardBody),
    "BRIDGE-APPEND-ONLY: and an already-unlinked link cannot be touched again",
  );
  check(
    /NEW\.case_id <> OLD\.case_id/.test(guardBody),
    "BRIDGE-APPEND-ONLY: and a link cannot be re-pointed at another case, which would break the binding the table exists to provide",
  );

  const topicGuard = functionText(sql, "bcp_guard_case_topic");
  const topicBody = topicGuard ? functionBody(topicGuard) : "";
  check(
    /IF TG_OP <> 'INSERT' THEN[\s\S]{0,200}BCP_CASE_TOPIC_APPEND_ONLY/.test(topicBody),
    "BRIDGE-APPEND-ONLY: a derived topic admits nothing but an INSERT — no update, no delete",
  );
  check(
    /SELECT an\.response_state INTO _state[\s\S]{0,300}an\.response_id = _l\.bound_response_id/.test(
      topicBody,
    ) &&
      /IF _state <> NEW\.topic_reason THEN[\s\S]{0,200}BCP_TOPIC_REASON_MISMATCH/.test(topicBody),
    "BRIDGE-DERIVATION: and a topic's reason is READ from the bound snapshot, so a caller cannot assert 'omitted' against a question the candidate answered in full",
  );
}

// ── 8. RLS, grants and the PostgREST surface ─────────────────────────────
{
  for (const table of TABLES) {
    check(
      new RegExp(`ALTER TABLE public\\.${table}\\s+ENABLE ROW LEVEL SECURITY`).test(bare) &&
        new RegExp(`ALTER TABLE public\\.${table}\\s+FORCE  ?ROW LEVEL SECURITY`).test(bare),
      `BRIDGE-RLS: ${table} carries ENABLE and FORCE ROW LEVEL SECURITY`,
    );
    check(
      new RegExp(
        `REVOKE ALL ON public\\.${table}\\s+FROM PUBLIC, anon, authenticated, service_role;`,
      ).test(bare),
      `BRIDGE-GRANTS: ${table} is revoked from PUBLIC, anon, authenticated AND service_role — silence would be a grant`,
    );
    check(
      new RegExp(`GRANT SELECT ON public\\.${table}\\s+TO authenticated, service_role;`).test(bare),
      `BRIDGE-GRANTS: ${table} re-grants SELECT only`,
    );
    check(
      !new RegExp(`GRANT (ALL|INSERT|UPDATE|DELETE)[^;]*ON public\\.${table}`).test(bare),
      `BRIDGE-GRANTS: no write privilege is granted on ${table} to any role`,
    );
    check(
      new RegExp(`CREATE POLICY [a-z_]+ ON public\\.${table}\\s+FOR SELECT`).test(bare),
      `BRIDGE-RLS: ${table} carries a SELECT policy, so its grant is not dead`,
    );
    check(
      !new RegExp(
        `CREATE POLICY [a-z_]+ ON public\\.${table}\\s+FOR (INSERT|UPDATE|DELETE|ALL)`,
      ).test(bare),
      `BRIDGE-RLS: ${table} carries no write policy — every write goes through a governed RPC`,
    );
  }
  check(
    // `USING (true)` is the obvious spelling; `USING (true OR ...)` is the one
    // that reads like a real predicate and admits everyone anyway. A planted
    // control got past the first form of this check with exactly that, so the
    // assertion now refuses a predicate that OPENS on true however it
    // continues.
    !/USING \(\s*true\b/.test(bare) && !/WITH CHECK \(\s*true\b/.test(bare),
    "BRIDGE-RLS: no policy predicate opens on an unconditional true anywhere in PR 4",
  );

  // A definer-rights trigger function granted to `authenticated` is published
  // by PostgREST as a callable API. It is revoked from everyone.
  for (const fn of TRIGGER_FUNCTIONS) {
    check(
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${fn}\\(\\) FROM PUBLIC, anon, authenticated, service_role;`,
      ).test(bare),
      `BRIDGE-SURFACE: ${fn}() is revoked from every role, so PostgREST does not publish an invariant-checker as an API`,
    );
    check(
      !new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\(\\)`).test(bare),
      `BRIDGE-SURFACE: and nothing grants EXECUTE on ${fn}() back`,
    );
  }

  for (const fn of [...CLIENT_MUTATIONS, ...CLIENT_READS]) {
    const text = functionText(sql, fn);
    check(
      text !== null && /SECURITY DEFINER/.test(text) && /SET search_path = public/.test(text),
      `BRIDGE-SURFACE: ${fn} is SECURITY DEFINER with a pinned search_path`,
    );
    check(
      new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([a-z, ]*\\)\\s+FROM PUBLIC, anon`).test(
        bare,
      ),
      `BRIDGE-SURFACE: ${fn} is revoked from PUBLIC and anon before any grant`,
    );
    check(
      new RegExp(
        `GRANT EXECUTE ON FUNCTION public\\.${fn}\\([a-z, ]*\\)\\s+TO authenticated, service_role;`,
      ).test(bare),
      `BRIDGE-SURFACE: and re-granted only to authenticated and service_role`,
    );
  }

  const created = [...bare.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z0-9_]+)\(/g)].map(
    (m) => m[1],
  );
  const known = new Set<string>([...CLIENT_MUTATIONS, ...CLIENT_READS, ...TRIGGER_FUNCTIONS]);
  check(
    created.every((n) => known.has(n)),
    `BRIDGE-SURFACE: PR 4 creates no function outside its declared surface (unexpected: ${created.filter((n) => !known.has(n)).join(", ") || "none"})`,
  );
}

// ── 9. The rollback refuses rather than discards ─────────────────────────
{
  check(
    /FROM public\.bcp_case_links;[\s\S]{0,600}RAISE EXCEPTION[\s\S]{0,200}BCP_BRIDGE_ROLLBACK/.test(
      rbBare,
    ),
    "BRIDGE-ROLLBACK: the rollback refuses to run while any link exists, live or unlinked — recruitment history is not a script's to discard",
  );
  check(
    /source_kind = 'beskt_preparation'[\s\S]{0,600}RAISE EXCEPTION/.test(rbBare),
    "BRIDGE-ROLLBACK: and refuses while any case source still carries the kind it would un-declare",
  );
  check(
    !/CASCADE/.test(rbBare),
    "BRIDGE-ROLLBACK: it drops nothing with CASCADE — what else depends on this is the question a rollback most needs answered, not suppressed",
  );
  const topicsAt = rbBare.indexOf("DROP TABLE IF EXISTS public.bcp_case_topics");
  const linksAt = rbBare.indexOf("DROP TABLE IF EXISTS public.bcp_case_links");
  check(
    topicsAt >= 0 && linksAt >= 0 && topicsAt < linksAt,
    "BRIDGE-ROLLBACK: and drops the child table before its parent",
  );
  for (const kind of [
    "job_description",
    "employer_requirements",
    "candidate_cv",
    "application_answers",
    "interviewer_notes",
    "transcript",
    "passport_disclosure",
  ]) {
    check(
      new RegExp(`'${kind}'`).test(rbBare),
      `BRIDGE-ROLLBACK: the restored source vocabulary still admits '${kind}' verbatim`,
    );
  }
  check(
    !/'beskt_preparation'/.test(
      rbBare.slice(rbBare.indexOf("ADD CONSTRAINT scp_interview_case_sources_source_kind_check")),
    ),
    "BRIDGE-ROLLBACK: and the restored vocabulary no longer admits beskt_preparation",
  );
  check(
    /RAISE NOTICE 'BESKT_INTERVIEW_CASE_BRIDGE_ROLLBACK ok'/.test(rbBare),
    "BRIDGE-ROLLBACK: it proves its own outcome rather than assuming it",
  );
}

// ── 10. Postflight ────────────────────────────────────────────────────────
{
  check(
    /RAISE NOTICE 'BESKT_INTERVIEW_CASE_BRIDGE_PROOF ok'/.test(bare),
    "BRIDGE-POSTFLIGHT: the migration proves its own outcome before it commits",
  );
  check(
    /BCP_BRIDGE_PROOF/.test(bare),
    "BRIDGE-POSTFLIGHT: and raises a named diagnostic when a postflight assertion fails",
  );
  check(
    /has_function_privilege\('anon'/.test(bare) || /has_table_privilege\('anon'/.test(bare),
    "BRIDGE-POSTFLIGHT: the postflight interrogates anon's real privileges through the catalogue rather than restating the GRANT statements above it",
  );
}

// ── 11. Registration: a guard nothing runs is not a guard ────────────────
{
  const dbTest = read(DB_TEST);
  check(
    dbTest.includes("supabase/tests/bcp_interview_case_bridge_test.sql"),
    "BRIDGE-REGISTRATION: the behaviour suite runs in scripts/db-test.sh",
  );
  check(
    dbTest.includes("supabase/rollback/20261112090000_bcp_interview_case_bridge_rollback.sql") &&
      dbTest.includes("BESKT_INTERVIEW_CASE_BRIDGE_ROLLBACK ok"),
    "BRIDGE-REGISTRATION: and the rollback is executed for real and its proof required",
  );
  check(
    dbTest.includes("BESKT_INTERVIEW_CASE_BRIDGE_PROOF ok"),
    "BRIDGE-REGISTRATION: and the migration is re-applied over the rolled-back state",
  );
  const floor = /BRG_PASSED" -lt (\d+)/.exec(dbTest);
  check(
    floor !== null && Number(floor[1]) >= 45,
    "BRIDGE-REGISTRATION: the suite carries an assertion floor, so a suite that silently stopped running would fail rather than pass",
  );
  const suiteAt = dbTest.indexOf("bcp_interview_case_bridge_test.sql");
  const pr3RollbackAt = dbTest.indexOf(
    "supabase/rollback/20261110090000_bcp_candidate_preparation_rollback.sql",
  );
  check(
    suiteAt >= 0 && pr3RollbackAt >= 0 && suiteAt < pr3RollbackAt,
    "BRIDGE-REGISTRATION: and it runs before PR 3 is stood down, because the bridge's foreign keys into PR 3's tables are real",
  );

  // The DOCUMENTED full-unwind procedure, which is a separate artefact from
  // this migration's own rollback: it takes the whole stack down in one pass,
  // newest first. PR 4 holds foreign keys into PR 3's tables, so if it is not
  // unwound there first, the documented procedure is simply wrong -- and the
  // place that must fail is here, not production.
  const rollbackSuite = read(ROLLBACK_SUITE);
  const bridgeAt = rollbackSuite.indexOf("DROP TABLE IF EXISTS public.bcp_case_links;");
  const pr3At = rollbackSuite.indexOf("DROP TABLE IF EXISTS public.bcp_assignments;");
  check(
    bridgeAt >= 0,
    "BRIDGE-REGISTRATION: the documented full-unwind procedure drops the bridge tables",
  );
  check(
    bridgeAt >= 0 && pr3At >= 0 && bridgeAt < pr3At,
    "BRIDGE-REGISTRATION: and drops them BEFORE PR 3's, because the bridge's foreign keys into PR 3 are real",
  );
  check(
    rollbackSuite.includes("ADD CONSTRAINT scp_interview_case_sources_source_kind_check"),
    "BRIDGE-REGISTRATION: and restores the source vocabulary on the table that SURVIVES the unwind, so it stops admitting a kind nothing can produce",
  );

  const pkg = read(PACKAGE);
  check(
    pkg.includes('"beskt-interview-case-bridge:check"'),
    "BRIDGE-REGISTRATION: the guard has a package script",
  );
  check(
    pkg.includes('"negative-controls:beskt-interview-case-bridge"') &&
      /"negative-controls:all":[^\n]*negative-controls:beskt-interview-case-bridge/.test(pkg),
    "BRIDGE-REGISTRATION: its controls have a script AND are part of negative-controls:all",
  );

  const ci = read(CI);
  check(
    ci.includes("beskt-interview-case-bridge:check"),
    "BRIDGE-REGISTRATION: the guard runs in CI",
  );
  check(
    ci.includes("negative-controls:all"),
    "BRIDGE-REGISTRATION: and CI runs negative-controls:all, which the package script above puts these controls inside — the whole chain, not one half of it",
  );

  const tsconfig = read(TSCONFIG);
  check(
    tsconfig.includes('"scripts/beskt-interview-case-bridge-check.ts"') &&
      tsconfig.includes('"scripts/negative-controls/beskt-interview-case-bridge-controls.ts"'),
    "BRIDGE-REGISTRATION: the guard and its controls are typechecked",
  );

  const state = JSON.parse(read(RELEASE_STATE)) as {
    frontier?: Array<{
      file?: string;
      hostedState?: string;
      evidenceSource?: string;
      verify?: unknown;
      rollback?: unknown;
      introduces?: unknown[];
    }>;
  };
  const entry = (state.frontier ?? []).find((m) => m.file === MIGRATION_NAME);
  check(
    entry !== undefined,
    "BRIDGE-REGISTRATION: the migration is declared in release-state.json",
  );
  check(
    entry?.hostedState === "applied",
    "BRIDGE-REGISTRATION: and declared APPLIED — the Supabase GitHub integration applied it to production when PR #229 merged",
  );
  check(
    typeof entry?.evidenceSource === "string" && entry.evidenceSource.length > 0,
    'BRIDGE-REGISTRATION: and an applied entry carries evidence, because "applied" without it is exactly the unverified claim this stack exists to prevent',
  );
  check(
    typeof entry?.evidenceSource === "string" &&
      entry.evidenceSource.includes("20261112090000") &&
      entry.evidenceSource.includes("bcp_interview_case_bridge") &&
      entry.evidenceSource.includes("wrygicdfxwjnrugduxnt"),
    "BRIDGE-REGISTRATION: and that evidence names the real hosted version, the recorded name and the project it was verified against",
  );
  check(
    entry?.verify !== undefined && entry?.rollback !== undefined,
    "BRIDGE-REGISTRATION: and carries both how to verify it and how to undo it",
  );
  check(
    Array.isArray(entry?.introduces) &&
      TABLES.every((t) =>
        (entry?.introduces as Array<{ object?: string }>).some((i) => i.object === t),
      ) &&
      [...CLIENT_MUTATIONS, ...CLIENT_READS, ...TRIGGER_FUNCTIONS].every((f) =>
        (entry?.introduces as Array<{ object?: string }>).some((i) => i.object === f),
      ),
    'BRIDGE-REGISTRATION: and declares every object it introduces, so "can code depend on this yet?" is answerable from the file',
  );

  const frontier = read(FRONTIER);
  check(
    // The mirror of the assertion above: once applied, the migration must NOT be
    // on the owner-level pending list. A resolved name left there hides the next
    // genuinely stuck migration behind an expectation.
    !(/const expectedPending: string\[\] = \[([\s\S]*?)\]/.exec(frontier)?.[1] ?? "").includes(
      MIGRATION_NAME,
    ),
    "BRIDGE-REGISTRATION: and is no longer declared pending on the release frontier",
  );
}

// ── 12. The suite itself proves, rather than reports ─────────────────────
{
  check(/SYNTETISK/.test(suite), "BRIDGE-SUITE: everything the suite plants is labelled synthetic");
  check(
    /^BEGIN;/m.test(suite) && /^ROLLBACK;/m.test(suite),
    "BRIDGE-SUITE: and the whole suite runs in one transaction that is rolled back, so it seeds nothing",
  );
  check(
    !/INSERT INTO public\.scp_interview_case_sources[\s\S]{0,200}'beskt_preparation'/.test(
      stripComments(suite),
    ),
    "BRIDGE-SUITE: the suite never plants the bridge's own source row by hand — the RPC must create it, or the assertion proves nothing",
  );
  const labels = [...suite.matchAll(/'(L\d+\.\d+ [^']+)'/g)].map((m) => m[1]);
  check(
    labels.length >= 45,
    `BRIDGE-SUITE: it carries at least 45 labelled assertions (found ${labels.length})`,
  );
  check(
    new Set(labels).size === labels.length,
    "BRIDGE-SUITE: and no two assertions share a label, so a failure names exactly one thing",
  );
  for (const needle of [
    "must_fail_as",
    "bcp_link_preparation_to_case",
    "bcp_unlink_preparation_from_case",
    "bcp_case_preparation_basis",
    "bcp_my_preparation_link",
    "bcp_linkable_interview_cases",
  ]) {
    check(suite.includes(needle), `BRIDGE-SUITE: the suite exercises ${needle}`);
  }
  check(
    /SET LOCAL ROLE anon/.test(suite) || /must_fail_as\('anon'/.test(suite),
    "BRIDGE-SUITE: and it proves what an unauthenticated principal gets, rather than assuming",
  );
}

// ── 13. PR 3's contracts are not disturbed ───────────────────────────────
{
  check(
    !/DROP FUNCTION[^;]*bcp_(assign|submit|save_answers|cancel|acknowledge_notice)/.test(bare),
    "BRIDGE-NO-REGRESSION: PR 4 drops none of PR 3's governed mutations",
  );
  check(
    !/ALTER TABLE public\.bcp_(assignments|responses|answers|notice_acknowledgements)\s+(ADD|DROP|ALTER) COLUMN/i.test(
      bare,
    ),
    "BRIDGE-NO-REGRESSION: and adds, drops or alters no column on any PR 3 runtime table",
  );
  check(
    pr3.includes("CREATE TABLE public.bcp_events ("),
    "BRIDGE-NO-REGRESSION: the event ledger PR 4 writes to is PR 3's, read from PR 3's own migration",
  );
  check(!/DROP TABLE/.test(bare), "BRIDGE-NO-REGRESSION: PR 4 drops no table at all");
}

if (failures.length > 0) {
  console.error(
    `\nBESKT interview-case bridge guard FAILED (${failures.length} of ${assertions}).`,
  );
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  `\nBESKT interview-case bridge guard: ${assertions} of ${assertions} assertions passed.`,
);
