/**
 * BESKT PR 7 — the content-authoring source guard.
 *
 * The behaviour suite (supabase/tests/beskt_governed_content_authoring_test.sql)
 * proves the doors work against a replayed schema, but it runs only in the
 * database job. This guard reads the migration, the rollback, the suite and
 * the release bookkeeping STRUCTURALLY, in the fast job, so a defect that
 * never reaches a replay is still caught — and so every material assertion
 * here has a planted negative control
 * (scripts/negative-controls/beskt-content-authoring-controls.ts).
 *
 * The thing it exists to protect is subtle. These functions run as the table
 * owner, so if a door ever started deciding for itself what content is legal,
 * or stopped going through beskt_guard_child_row(), every invariant in the
 * BESKT domain would become bypassable by anybody holding the editor role.
 * The guard therefore checks what the doors DO NOT do as carefully as what
 * they do.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

const MIGRATION_NAME = "20261118090000_beskt_governed_content_authoring.sql";
const MIGRATION = join(ROOT, "supabase/migrations", MIGRATION_NAME);
const ROLLBACK = join(
  ROOT,
  "supabase/rollback/20261118090000_beskt_governed_content_authoring_rollback.sql",
);
const SUITE = join(ROOT, "supabase/tests/beskt_governed_content_authoring_test.sql");
const DOMAIN = join(ROOT, "supabase/migrations/20261108090000_beskt_governed_method_content.sql");
const DB_TEST = join(ROOT, "scripts/db-test.sh");
const RELEASE_STATE = join(ROOT, "supabase/release-state.json");
const PACKAGE = join(ROOT, "package.json");
const CI = join(ROOT, ".github/workflows/ci.yml");
const TSCONFIG = join(ROOT, "tsconfig.scripts.json");
const FRONTIER = join(ROOT, "scripts/release-frontier-check.ts");

/** The nine doors a browser principal may reach. */
const DOORS = [
  "beskt_author_exposure_profile",
  "beskt_author_section",
  "beskt_author_item",
  "beskt_author_prompt",
  "beskt_author_routing_rule",
  "beskt_author_evidence_anchor",
  "beskt_author_observation_field",
  "beskt_author_activation_requirement",
  "beskt_delete_content",
] as const;

/** The eight that take a jsonb payload and upsert by key. */
const AUTHORING_DOORS = DOORS.filter((d) => d !== "beskt_delete_content");

/** Reached only from inside a door that has already authorised the caller. */
const INTERNALS = ["beskt_content_gate", "beskt_content_commit"] as const;

/** A pure value function: no privileges it has no use for. */
const PURE = "beskt_content_reject_unknown_keys";

/** Every content table the domain has. All nine must stay guarded. */
const CONTENT_TABLES = [
  "beskt_exposure_profiles",
  "beskt_sections",
  "beskt_items",
  "beskt_item_options",
  "beskt_prompts",
  "beskt_routing_rules",
  "beskt_evidence_anchors",
  "beskt_observation_fields",
  "beskt_activation_requirements",
] as const;

/** Invariants that belong to beskt_guard_child_row and must NOT be restated
 *  in a door. A second copy is a second place to be wrong, and the copy is
 *  the one that will drift. */
const GUARD_OWNED = [
  "BESKT_ROUTE_BACKWARD",
  "BESKT_ROUTE_PHASE",
  "BESKT_ROUTE_MODE_ESCALATION",
  "BESKT_CROSS_PROFILE_REFERENCE",
  "BESKT_CROSS_VERSION_REFERENCE",
  "BESKT_EVALUATION_NOT_TEMPLATED",
  "BESKT_PROMPT_STAGE_MISMATCH",
  "BESKT_PARENT_IMMUTABLE",
] as const;

/** Anything that would be a judgement. */
const FORBIDDEN_WORDS = [
  "score",
  "points",
  "weight",
  "threshold",
  "rank",
  "suitab",
  "credib",
  "truthful",
  "verdict",
  "deception",
  "hire",
  "rating",
  "grade",
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

/** The whole `CREATE OR REPLACE FUNCTION … $$;` statement. */
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
const proof = postflightText(bare);

// ── 1 · The doors exist, and nothing else does ─────────────────────────────
{
  const created = [...bare.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z0-9_]+)\(/g)].map(
    (m) => m[1],
  );
  const known = new Set<string>([...DOORS, ...INTERNALS, PURE]);
  check(
    DOORS.every((d) => created.includes(d)),
    `AUTHORING-SURFACE: all nine doors exist (missing: ${DOORS.filter((d) => !created.includes(d)).join(", ") || "none"})`,
  );
  check(
    created.every((n) => known.has(n)),
    `AUTHORING-SURFACE: and PR 7 creates no function outside its declared surface (unexpected: ${created.filter((n) => !known.has(n)).join(", ") || "none"})`,
  );
  check(
    !/CREATE TABLE public\./.test(bare),
    "AUTHORING-SURFACE: PR 7 creates no table — the content tables it writes to already existed",
  );
  check(
    !/CREATE POLICY|ALTER POLICY/.test(bare),
    "AUTHORING-SURFACE: and no policy — the doors are functions, not a widened read surface",
  );
}

// ── 2 · No new client DML. This is the whole design. ───────────────────────
{
  for (const table of CONTENT_TABLES) {
    check(
      !new RegExp(`GRANT [A-Z, ]*(INSERT|UPDATE|DELETE|ALL)[A-Z, ]* ON public\\.${table}`).test(
        bare,
      ),
      `AUTHORING-NO-DML: nothing in PR 7 grants a write privilege on ${table}`,
    );
  }
  check(
    !/GRANT [A-Z, ]*ON public\.beskt_[a-z_]+ TO (authenticated|anon|PUBLIC)/.test(bare),
    "AUTHORING-NO-DML: and no table grant to a browser role appears anywhere in the migration",
  );
  check(
    /privilege_type IN \('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'\)[\s\S]{0,200}grantee IN \('anon', 'authenticated', 'PUBLIC'\)/.test(
      proof,
    ),
    "AUTHORING-NO-DML: and the postflight PROVES it against information_schema rather than restating the migration's own grants",
  );
}

// ── 3 · Authorisation, and the ORDER it happens in ─────────────────────────
{
  const gate = functionBody(functionText(sql, "beskt_content_gate") ?? "");
  check(gate.length > 0, "AUTHORING-GATE: the shared gate exists");
  check(
    /IF auth\.uid\(\) IS NULL THEN[\s\S]{0,160}BESKT_NOT_AUTHENTICATED/.test(gate),
    "AUTHORING-GATE: it refuses an unauthenticated caller",
  );
  check(
    /IF NOT public\.scp_interview_can_edit\(auth\.uid\(\)\) THEN[\s\S]{0,200}BESKT_NOT_EDITOR/.test(
      gate,
    ),
    "AUTHORING-GATE: it requires the EXISTING platform content editor role, the same one beskt_touch_draft demands",
  );
  check(
    /_v := public\.beskt_lock_version\(_method_version_id, _expected_revision\);/.test(gate),
    "AUTHORING-GATE: it locks the version at the revision the caller was looking at, through the existing lock",
  );
  check(
    /_v\.content_status NOT IN \('draft', 'in_review'\)[\s\S]{0,260}BESKT_PUBLISHED_IMMUTABLE/.test(
      gate,
    ),
    "AUTHORING-GATE: and refuses a version that has left the editable states, by name",
  );
  const editorAt = gate.indexOf("scp_interview_can_edit");
  const lockAt = gate.indexOf("beskt_lock_version");
  check(
    editorAt > 0 && lockAt > editorAt,
    "AUTHORING-ORDER: the editor check precedes the lock, so a stranger cannot hold a version row while being refused",
  );

  for (const door of DOORS) {
    const body = functionBody(functionText(sql, door) ?? "");
    check(
      /_v := public\.beskt_content_gate\(_method_version_id, _expected_revision\);/.test(body),
      `AUTHORING-GATE: ${door} goes through the shared gate rather than deciding for itself`,
    );
    const gateAt = body.indexOf("beskt_content_gate");
    const firstWrite = Math.min(
      ...["INSERT INTO public.beskt", "UPDATE public.beskt", "DELETE FROM public.beskt"]
        .map((k) => body.indexOf(k))
        .filter((n) => n >= 0)
        .concat([body.length]),
    );
    check(
      gateAt >= 0 && gateAt < firstWrite,
      `AUTHORING-ORDER: and reaches the gate BEFORE its first write, not merely somewhere in the body`,
    );
  }
}

// ── 4 · Idempotency ────────────────────────────────────────────────────────
{
  for (const door of DOORS) {
    const body = functionBody(functionText(sql, door) ?? "");
    check(
      /IF _operation_id IS NULL THEN[\s\S]{0,200}BESKT_OPERATION_ID_REQUIRED/.test(body),
      `AUTHORING-IDEMPOTENCY: ${door} refuses a mutation with no operation id`,
    );
    check(
      /_replay := public\.beskt_operation_begin\(_operation_id, _request_hash\);/.test(body) &&
        /IF _replay IS NOT NULL THEN RETURN _replay; END IF;/.test(body),
      `AUTHORING-IDEMPOTENCY: ${door} answers a replay through the EXISTING beskt_operation_begin`,
    );
    const replayAt = body.indexOf("beskt_operation_begin");
    const gateAt = body.indexOf("beskt_content_gate");
    check(
      replayAt >= 0 && gateAt > replayAt,
      `AUTHORING-IDEMPOTENCY: and answers it BEFORE the gate, so a retry costs no lock`,
    );
    check(
      /_request_hash := public\.beskt_request_hash\(jsonb_build_object\(/.test(body),
      `AUTHORING-IDEMPOTENCY: ${door} hashes the exact request it was given`,
    );
  }
}

// ── 5 · The payload is a typed contract, not a bag ─────────────────────────
{
  const pure = functionText(sql, PURE);
  check(pure !== null, `AUTHORING-PAYLOAD: ${PURE} exists`);
  check(
    pure !== null && !/SECURITY DEFINER/.test(pure),
    `AUTHORING-PAYLOAD: ${PURE} is NOT SECURITY DEFINER — it compares key names and has no use for privileges`,
  );
  check(
    /IMMUTABLE/.test(pure ?? "") && /SET search_path = public/.test(pure ?? ""),
    `AUTHORING-PAYLOAD: and is IMMUTABLE with a pinned search_path`,
  );
  const body = functionBody(pure ?? "");
  check(
    /WHERE NOT \(k = ANY \(_allowed\)\)/.test(body) && /BESKT_CONTENT_UNKNOWN_FIELD/.test(body),
    "AUTHORING-PAYLOAD: an unknown key is REFUSED BY NAME — the reason a jsonb payload here is a contract rather than a blob",
  );
  check(
    /jsonb_typeof\(_payload\) <> 'object'[\s\S]{0,200}BESKT_CONTENT_PAYLOAD/.test(body),
    "AUTHORING-PAYLOAD: and a payload that is not an object is refused before anything is read out of it",
  );

  for (const door of AUTHORING_DOORS) {
    const dbody = functionBody(functionText(sql, door) ?? "");
    check(
      /PERFORM public\.beskt_content_reject_unknown_keys\(/.test(dbody),
      `AUTHORING-PAYLOAD: ${door} checks its payload against a declared field list`,
    );
    check(
      /BESKT_CONTENT_KEY_REQUIRED/.test(dbody),
      `AUTHORING-PAYLOAD: ${door} refuses a payload that names no key`,
    );
    // A door that stored the payload itself would be exactly the blob this
    // design exists to avoid.
    check(
      !new RegExp(
        `(VALUES|SET)[\\s\\S]{0,400}_${door.replace("beskt_author_", "")}\\b(?!\\s*(\\?|->))`,
      ).test("") && !/jsonb_populate_record|to_jsonb\(NEW\)/.test(dbody),
      `AUTHORING-PAYLOAD: ${door} reads named fields out of the payload rather than storing it whole`,
    );
  }
  check(
    /'options'/.test(functionBody(functionText(sql, "beskt_author_item") ?? "")) &&
      /beskt_content_reject_unknown_keys\('item option'/.test(
        functionBody(functionText(sql, "beskt_author_item") ?? ""),
      ),
    "AUTHORING-PAYLOAD: the nested option payload is checked too, not trusted because it arrived inside a checked one",
  );
}

// ── 6 · THE LAW STAYS WHERE IT IS ──────────────────────────────────────────
//
// These functions run as the owner. If a door restated a rule the child guard
// owns, the copy would drift and the copy is what the editor would meet.
{
  for (const invariant of GUARD_OWNED) {
    check(
      !new RegExp(invariant).test(bare),
      `AUTHORING-ONE-LAW: PR 7 does not restate ${invariant} — beskt_guard_child_row owns it, and a second copy is a second place to be wrong`,
    );
  }
  check(
    /beskt_guard_child_row/.test(bare),
    "AUTHORING-ONE-LAW: and the migration names the guard it stands on, in its preflight",
  );
  check(
    /RAISE EXCEPTION[\s\S]{0,300}refusing to open a door onto an unguarded table/.test(sql),
    "AUTHORING-ONE-LAW: the preflight REFUSES to install a door on a table that has lost its guard",
  );
  for (const table of CONTENT_TABLES) {
    check(
      new RegExp(`'${table}'`).test(proof),
      `AUTHORING-ONE-LAW: the postflight re-proves the guard is attached to ${table}`,
    );
  }
  check(
    /has_function_privilege\('authenticated', 'public\.beskt_guard_child_row\(\)', 'EXECUTE'\)/.test(
      proof,
    ),
    "AUTHORING-ONE-LAW: and that the guard is still not published as an API",
  );
  check(
    !/DROP TRIGGER|ALTER TABLE[^;]*DISABLE TRIGGER/.test(bare),
    "AUTHORING-ONE-LAW: PR 7 drops and disables no trigger anywhere",
  );
}

// ── 7 · No composite-type coupling to the tables ───────────────────────────
//
// A function whose SIGNATURE names a table's row type becomes a dependency OF
// that table, and `DROP TABLE` then refuses. That broke the existing
// 20261108090000 rollback the first time this was written, so it is a rule
// now rather than a memory.
{
  const signatures = [
    ...bare.matchAll(
      /CREATE OR REPLACE FUNCTION public\.[a-z0-9_]+\(([\s\S]*?)\)\s*\nRETURNS ([a-z. _]+)/g,
    ),
  ];
  const coupled = signatures.filter(
    (m) => /public\.beskt_[a-z_]+\b(?!\()/.test(m[1]) || /public\.beskt_[a-z_]+/.test(m[2]),
  );
  check(
    coupled.length === 0,
    `AUTHORING-NO-COUPLING: no function signature names a BESKT table's composite type, so the domain stays droppable (found ${coupled.length})`,
  );
  check(
    /RETURNS jsonb/.test(functionText(sql, "beskt_content_gate") ?? ""),
    "AUTHORING-NO-COUPLING: the gate returns jsonb rather than the version row type",
  );
  check(
    /_gate jsonb,/.test(functionText(sql, "beskt_content_commit") ?? ""),
    "AUTHORING-NO-COUPLING: and the finisher takes jsonb rather than the version row type",
  );
}

// ── 8 · One finisher, so nine doors cannot drift ───────────────────────────
{
  const commit = functionBody(functionText(sql, "beskt_content_commit") ?? "");
  check(
    /_hash := public\.beskt_method_content_hash\(_version_id\);/.test(commit),
    "AUTHORING-HASH: the finisher recomputes the content hash from the stored bytes",
  );
  check(
    /SET content_hash = _hash, revision = _revision \+ 1, updated_at = now\(\)/.test(commit),
    "AUTHORING-HASH: and advances the revision with it, exactly as beskt_touch_draft does",
  );
  check(
    /set_config\('beskt\.governed_transition', 'on', true\)[\s\S]{0,400}set_config\('beskt\.governed_transition', 'off', true\)/.test(
      commit,
    ),
    "AUTHORING-HASH: through the governed-transition flag, so the version guard sees a governed write and an ungoverned one is still refused",
  );
  check(
    /PERFORM public\.beskt_record_event\(/.test(commit) &&
      /jsonb_build_object\('family', _family, 'key', _key, 'row_id', _row_id, 'created', _created\)/.test(
        commit,
      ),
    "AUTHORING-AUDIT: and appends an event naming exactly what was touched",
  );
  check(
    /'produces_score', false/.test(commit) && /'interpretation', 'none'/.test(commit),
    "AUTHORING-NO-JUDGEMENT: every authoring result says in its own payload that it produces no score and interprets nothing",
  );
  for (const door of DOORS) {
    const body = functionBody(functionText(sql, door) ?? "");
    check(
      /RETURN public\.beskt_content_commit\(_v, _operation_id, _request_hash,/.test(body),
      `AUTHORING-HASH: ${door} finishes through that one finisher`,
    );
    check(
      !/UPDATE public\.beskt_method_versions/.test(body),
      `AUTHORING-HASH: and ${door} never writes the version row itself`,
    );
  }
}

// ── 9 · Nothing here can author a judgement, or approve anything ───────────
{
  const allowed = [
    ...bare.matchAll(/beskt_content_reject_unknown_keys\([^,]+, [^,]+, ARRAY\[([\s\S]*?)\]\)/g),
  ]
    .map((m) => m[1])
    .join(" ")
    .toLowerCase();
  for (const word of FORBIDDEN_WORDS) {
    check(
      !allowed.includes(word),
      `AUTHORING-NO-JUDGEMENT: no door accepts a field named for "${word}"`,
    );
  }
  check(
    !/INSERT INTO public\.beskt_method_reviews|UPDATE public\.beskt_method_reviews/.test(bare),
    "AUTHORING-SEPARATION: authoring content is not reviewing it — no door writes a review",
  );
  check(
    !/INSERT INTO public\.beskt_governance_grants|UPDATE public\.beskt_governance_grants/.test(
      bare,
    ),
    "AUTHORING-SEPARATION: and no door grants anybody a governance mandate",
  );
  check(
    !/SET content_status/.test(bare),
    "AUTHORING-SEPARATION: and no door moves a version's lifecycle status — publishing is a separate act by a separate person",
  );
  check(
    !/INSERT INTO public\.beskt_(exposure_profiles|sections|items|prompts|routing_rules)[\s\S]{0,200}VALUES\s*\(\s*'/.test(
      bare.replace(/CREATE OR REPLACE FUNCTION[\s\S]*?\$\$;/g, ""),
    ),
    "AUTHORING-NO-SEED: the migration authors no content of its own — BESKT v1 is written by real editors through these doors",
  );
  check(
    /the migration recorded % authoring event\(s\); it must record none/.test(sql),
    "AUTHORING-NO-SEED: and the postflight proves it recorded no authoring event",
  );
}

// ── 10 · Postflight ────────────────────────────────────────────────────────
{
  check(proof.length > 0, "AUTHORING-POSTFLIGHT: the migration has a postflight");
  check(
    /RAISE NOTICE 'BESKT_GOVERNED_CONTENT_AUTHORING_PROOF ok'/.test(proof),
    "AUTHORING-POSTFLIGHT: which proves its own outcome before the migration commits",
  );
  check(
    /p\.prosecdef\s*\n?\s*AND EXISTS \(SELECT 1 FROM unnest\(p\.proconfig\) c WHERE c LIKE 'search\\_path=%'\)/.test(
      proof,
    ),
    "AUTHORING-POSTFLIGHT: it proves every door is SECURITY DEFINER with a pinned search_path, from the catalogue",
  );
  check(
    /has_function_privilege\('anon', _fn::regprocedure, 'EXECUTE'\)/.test(proof),
    "AUTHORING-POSTFLIGHT: it proves anon reaches none of them",
  );
  check(
    /applies no authorisation of its own and must not be callable by authenticated/.test(proof),
    "AUTHORING-POSTFLIGHT: and that the two internals are not callable by authenticated",
  );
  check(
    /NOT p\.prosecdef[\s\S]{0,120}provolatile = 'i'/.test(proof),
    "AUTHORING-POSTFLIGHT: it proves the payload checker is pure rather than a definer",
  );
  check(
    /column_name LIKE '%' \|\| _word \|\| '%'/.test(proof),
    "AUTHORING-POSTFLIGHT: it asks the catalogue whether a judgement column exists rather than promising none does",
  );

  const at = bare.indexOf("ADD CONSTRAINT beskt_method_events_event_check");
  const eventCheck = at === -1 ? "" : bare.slice(at, bare.indexOf("));", at) + 3);
  check(eventCheck.length > 0, "AUTHORING-VOCABULARY: the migration rebuilds the event CHECK");
  for (const member of [
    "method_created",
    "version_created",
    "new_version_created",
    "draft_touched",
    "submitted_for_review",
    "review_approved",
    "review_rejected",
    "published",
    "suspended",
    "retired",
  ]) {
    check(
      new RegExp(`'${member}'`).test(eventCheck),
      `AUTHORING-VOCABULARY: the rebuilt CHECK still admits '${member}' — a rebuild that dropped one would break the lifecycle silently`,
    );
  }
  check(
    /'content_upserted'/.test(eventCheck) && /'content_deleted'/.test(eventCheck),
    "AUTHORING-AUDIT: and admits the two authoring events, so writing content is explainable afterwards",
  );
}

// ── 11 · The rollback ──────────────────────────────────────────────────────
{
  check(
    /SELECT count\(\*\) INTO _events FROM public\.beskt_method_events\s+WHERE event IN \('content_upserted', 'content_deleted'\);\s+IF _events <> 0 THEN\s+RAISE EXCEPTION\s+'BESKT_CONTENT_AUTHORING_ROLLBACK/.test(
      rbBare,
    ),
    "AUTHORING-ROLLBACK: it refuses while the append-only ledger records authoring through these doors, by a REACHABLE condition",
  );
  check(!/CASCADE/.test(rbBare), "AUTHORING-ROLLBACK: it drops nothing with CASCADE");
  check(
    !/DELETE FROM public\.beskt_/.test(rbBare) && !/DROP TABLE/.test(rbBare),
    "AUTHORING-ROLLBACK: it deletes NO authored content and drops no table — removing the doors is not removing what was written through them",
  );
  for (const fn of [...DOORS, ...INTERNALS, PURE]) {
    check(
      new RegExp(`DROP FUNCTION IF EXISTS public\\.${fn}\\(`).test(rbBare),
      `AUTHORING-ROLLBACK: it drops ${fn} by name`,
    );
  }
  const doorAt = rbBare.indexOf("DROP FUNCTION IF EXISTS public.beskt_author_exposure_profile(");
  const internalAt = rbBare.indexOf("DROP FUNCTION IF EXISTS public.beskt_content_gate(");
  check(
    doorAt >= 0 && internalAt > doorAt,
    "AUTHORING-ROLLBACK: and drops the doors before the internals they stood on, in an explicit order",
  );
  check(
    /'method_created', 'version_created', 'new_version_created'/.test(rbBare) &&
      !/content_upserted/.test(
        rbBare.slice(rbBare.indexOf("ADD CONSTRAINT beskt_method_events_event_check")),
      ),
    "AUTHORING-ROLLBACK: the restored vocabulary is 20261108090000's exactly — its members kept, PR 7's gone",
  );
  check(
    /found %\.', _n;[\s\S]{0,4000}beskt_guard_child_row/.test(rbBare),
    "AUTHORING-ROLLBACK: it proves the child guard is still on all nine tables afterwards",
  );
  check(
    /should all survive, found %/.test(rbBare),
    "AUTHORING-ROLLBACK: and that the ten governed lifecycle RPCs survived",
  );
  check(
    /RAISE NOTICE 'BESKT_GOVERNED_CONTENT_AUTHORING_ROLLBACK ok'/.test(rbBare),
    "AUTHORING-ROLLBACK: it proves its own outcome rather than assuming it",
  );
}

// ── 12 · The suite proves the claim, not the plumbing ──────────────────────
{
  check(
    /SYNTETISK/.test(suite),
    "AUTHORING-SUITE: everything the suite plants is labelled synthetic",
  );
  check(
    /^BEGIN;/m.test(suite) && /^ROLLBACK;/m.test(suite),
    "AUTHORING-SUITE: and the whole suite runs in one transaction that is rolled back, so it seeds nothing",
  );
  const labels = [...suite.matchAll(/'(A\d+\.\d+ [^']+)'/g)].map((m) => m[1]);
  check(
    labels.length >= 55,
    `AUTHORING-SUITE: it carries at least 55 labelled assertions (found ${labels.length})`,
  );
  check(
    new Set(labels).size === labels.length,
    "AUTHORING-SUITE: and no two assertions share a label, so a failure names exactly one thing",
  );
  // THE claim. Without this the suite would only prove the functions run.
  check(
    /beskt_submit_for_review/.test(suite) && /A1\.8 and it SUBMITS to the five gates/.test(suite),
    "AUTHORING-SUITE: its first block authors a COMPLETE method through the doors and SUBMITS it — the claim this PR exists to make true",
  );
  check(
    /A1\.1 a method authored ENTIRELY through the doors validates with zero blocking issues/.test(
      suite,
    ),
    "AUTHORING-SUITE: proved against beskt_method_validate rather than by counting rows",
  );
  for (const door of DOORS) {
    check(suite.includes(door), `AUTHORING-SUITE: the suite exercises ${door}`);
  }
  // The important negative half: the doors did not become a bypass.
  for (const invariant of [
    "BESKT_ROUTE_BACKWARD",
    "BESKT_ROUTE_PHASE",
    "BESKT_EVALUATION_NOT_TEMPLATED",
    "BESKT_PROMPT_STAGE_MISMATCH",
    "BESKT_PUBLISHED_IMMUTABLE",
    "BESKT_STALE_REVISION",
    "BESKT_NOT_EDITOR",
    "BESKT_CONTENT_UNKNOWN_FIELD",
  ]) {
    check(
      new RegExp(invariant).test(suite),
      `AUTHORING-SUITE: and proves ${invariant} still refuses when the payload arrives through a door`,
    );
  }
  check(
    /must_fail_as\('anon'/.test(suite),
    "AUTHORING-SUITE: and proves what an unauthenticated principal gets, rather than assuming",
  );
  check(
    /an EDITOR writing straight at the table is refused by privilege/.test(suite),
    "AUTHORING-SUITE: and EXERCISES the absence of client DML rather than only reading the catalogue",
  );
}

// ── 13 · Registration ──────────────────────────────────────────────────────
{
  const dbTest = read(DB_TEST);
  check(
    dbTest.includes("supabase/tests/beskt_governed_content_authoring_test.sql"),
    "AUTHORING-REGISTRATION: the behaviour suite runs in scripts/db-test.sh",
  );
  const floor = /AUT_PASSED" -lt (\d+)/.exec(dbTest);
  check(
    floor !== null && Number(floor[1]) >= 55,
    "AUTHORING-REGISTRATION: with an assertion floor, so a silently shrinking suite fails rather than passes",
  );
  check(
    dbTest.includes("BESKT_GOVERNED_CONTENT_AUTHORING_ROLLBACK ok") &&
      dbTest.includes("BESKT_GOVERNED_CONTENT_AUTHORING_PROOF ok"),
    "AUTHORING-REGISTRATION: and the rollback and re-apply are executed for real, with their proofs required",
  );
  check(
    dbTest.includes('suite_failed "BESKT content authoring"'),
    "AUTHORING-REGISTRATION: and a failure in that block fails the run rather than printing and continuing",
  );
  // ORDERING. The 20261108090000 rollback drops the whole BESKT domain, so
  // PR 7's suite must run while that domain is still standing.
  const suiteAt = dbTest.indexOf("beskt_governed_content_authoring_test.sql");
  const domainRollbackAt = dbTest.indexOf(
    "-f supabase/rollback/20261108090000_beskt_governed_method_content_rollback.sql 2>&1)",
  );
  check(
    suiteAt >= 0 && domainRollbackAt > suiteAt,
    "AUTHORING-REGISTRATION: and the suite runs BEFORE the BESKT domain rollback, which drops every table it writes to",
  );

  const pkg = read(PACKAGE);
  check(
    pkg.includes('"beskt-content-authoring:check"'),
    "AUTHORING-REGISTRATION: the guard has a package script",
  );
  check(
    pkg.includes('"negative-controls:beskt-content-authoring"') &&
      /"negative-controls:all":[^\n]*negative-controls:beskt-content-authoring/.test(pkg),
    "AUTHORING-REGISTRATION: its controls have a script AND are part of negative-controls:all",
  );
  check(
    read(CI).includes("beskt-content-authoring:check"),
    "AUTHORING-REGISTRATION: the guard runs in CI",
  );
  const tsconfig = read(TSCONFIG);
  check(
    tsconfig.includes('"scripts/beskt-content-authoring-check.ts"') &&
      tsconfig.includes('"scripts/negative-controls/beskt-content-authoring-controls.ts"'),
    "AUTHORING-REGISTRATION: the guard and its controls are typechecked",
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
    "AUTHORING-REGISTRATION: the migration is declared in release-state.json",
  );
  check(
    entry?.hostedState === "pending",
    "AUTHORING-REGISTRATION: and declared PENDING — it has not been applied to the hosted database",
  );
  check(
    entry?.verify !== undefined && entry?.rollback !== undefined,
    "AUTHORING-REGISTRATION: and carries both how to verify it and how to undo it",
  );
  check(
    Array.isArray(entry?.introduces) &&
      [...DOORS, ...INTERNALS, PURE].every((o) =>
        (entry?.introduces ?? []).some((i) => i.object === o),
      ),
    "AUTHORING-REGISTRATION: and declares every object it introduces",
  );
  check(
    (
      /const expectedPending: string\[\] = \[([\s\S]*?)\];/.exec(read(FRONTIER))?.[1] ?? ""
    ).includes(MIGRATION_NAME),
    "AUTHORING-REGISTRATION: and is on the owner-level pending list, so the two files cannot disagree about production",
  );
}

// ── 14 · Schema-first: no application code rides on a pending migration ────
{
  const names = [...DOORS, ...INTERNALS, PURE];
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
    `AUTHORING-SCHEMA-FIRST: no application code names an object of this pending migration (${offenders.slice(0, 3).join("; ") || "none"})`,
  );
  check(
    read(DOMAIN).includes("CREATE OR REPLACE FUNCTION public.beskt_guard_child_row()"),
    "AUTHORING-SCHEMA-FIRST: the guard these doors stand on is read from the migration that actually defines it",
  );
}

if (failures.length > 0) {
  console.error(`\nBESKT content-authoring guard FAILED (${failures.length} of ${assertions}).`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`\nBESKT content-authoring guard: ${assertions} of ${assertions} assertions passed.`);
