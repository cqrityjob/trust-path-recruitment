/**
 * BESKT PR 2 — the governed-content source guard.
 *
 * The database suite (supabase/tests/beskt_governed_content_test.sql) proves
 * behaviour against a replayed schema, but it runs only in the database job.
 * This guard reads the migration, the rollback, the suite and the release
 * bookkeeping STRUCTURALLY, in the fast job, so a defect that never reaches a
 * replay is still caught, and so every material assertion has a planted
 * negative control (scripts/negative-controls/beskt-governed-content-controls.ts).
 *
 * It inspects the real computation: function bodies with comments stripped,
 * DDL column lists, trigger definitions, grant statements and array literals
 * compared against PR 1's normative JSON — never a reassuring comment, never
 * an error-message string on its own.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const MIGRATION_NAME = "20261108090000_beskt_governed_method_content.sql";
const MIGRATION = join(ROOT, "supabase/migrations", MIGRATION_NAME);
const ROLLBACK = join(
  ROOT,
  "supabase/rollback/20261108090000_beskt_governed_method_content_rollback.sql",
);
const SUITE = join(ROOT, "supabase/tests/beskt_governed_content_test.sql");
const DB_TEST = join(ROOT, "scripts/db-test.sh");
const ROLLBACK_SUITE = join(ROOT, "supabase/tests/scp_a_rollback_test.sql");
const ADR = join(ROOT, "docs/architecture/beskt-recruitment-method-discovery.md");
const RELEASE_STATE = join(ROOT, "supabase/release-state.json");
const HOSTED_LEDGER = join(ROOT, "supabase/hosted-ledger.json");
const FRONTIER = join(ROOT, "scripts/release-frontier-check.ts");
const PACKAGE = join(ROOT, "package.json");
const CI = join(ROOT, ".github/workflows/ci.yml");
const TSCONFIG = join(ROOT, "tsconfig.scripts.json");

/**
 * SHA-256 of the normative PR 1 JSON block, whitespace-normalised. A change
 * to the contract is an explicit ADR change with its own negative control;
 * this pin makes silent weakening visible in PR 2's own gate.
 */
const PR1_CONTRACT_SHA256 = "f2f1e5497a6a07972c52cd38f5b7fd864fc3c7e671e87e160d94771518e4fa03";

const TABLES = [
  "beskt_method_versions",
  "beskt_exposure_profiles",
  "beskt_activation_requirements",
  "beskt_sections",
  "beskt_items",
  "beskt_item_options",
  "beskt_prompts",
  "beskt_routing_rules",
  "beskt_evidence_anchors",
  "beskt_observation_fields",
  "beskt_method_reviews",
  "beskt_method_events",
] as const;

const CHILD_TABLES = TABLES.filter(
  (t) => !["beskt_method_versions", "beskt_method_reviews", "beskt_method_events"].includes(t),
);

const RESCOPED_OLD_FLOW = [
  "scp_iv_case_start_basis",
  "scp_iv_startable_pack_versions",
  "scp_iv_create_case",
  "scp_interview_pack_validate",
  "scp_interview_create_version",
] as const;

const MUTATIONS = [
  "beskt_create_method",
  "beskt_create_method_version",
  "beskt_touch_draft",
  "beskt_submit_for_review",
  "beskt_record_review",
  "beskt_publish_version",
  "beskt_suspend_version",
  "beskt_retire_version",
] as const;

const REVISION_MUTATIONS = MUTATIONS.filter(
  (m) => !["beskt_create_method", "beskt_create_method_version"].includes(m),
);

const INTERNAL_FUNCTIONS = [
  "beskt_record_event",
  "beskt_operation_begin",
  "beskt_lock_version",
  "beskt_canonical_content",
] as const;

const ANCHOR_COMPONENTS = [
  "DEFINITION",
  "INCLUSION_CRITERIA",
  "EXCLUSION_CRITERIA",
  "SUPPORTING_EVIDENCE_EXAMPLES",
  "COUNTER_EVIDENCE_AND_PROTECTIVE_FACTORS",
  "PROHIBITED_INFERENCES",
  "REQUIRED_NEXT_ACTION",
] as const;

const FORBIDDEN_COLUMN =
  /(score|level|weight|threshold|total|rank|pass|fail|suitab|credib|truthful|recommend|risk|verdict|probab|sentiment|emotion|deception|hire)|^points$/i;

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

/** SQL with every line comment and every block comment blanked. */
function sqlOnly(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, "");
}

/** The text of one `CREATE OR REPLACE FUNCTION public.<name>(` up to its terminating `$$;`. */
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

function functionHeader(fn: string): string {
  return fn.slice(0, fn.indexOf("$$"));
}

function functionBody(fn: string): string {
  return fn.slice(fn.indexOf("$$") + 2);
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
  const body = sql.slice(open + 1, i);
  // Split on top-level commas only.
  const parts: string[] = [];
  let buf = "";
  depth = 0;
  for (const ch of body) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(buf);
      buf = "";
    } else buf += ch;
  }
  parts.push(buf);
  return parts
    .map((p) => p.trim())
    .filter((p) => p.length > 0 && !/^(CONSTRAINT|UNIQUE|CHECK|PRIMARY KEY|FOREIGN KEY)\b/i.test(p))
    .map((p) => p.split(/\s+/)[0]);
}

function normaliseJson(text: string): string {
  return JSON.stringify(JSON.parse(text));
}

function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

// ---------------------------------------------------------------------------

console.log("BESKT governed-content guard\n");

if (!existsSync(MIGRATION)) {
  console.error(`BESKT-DB-MIGRATION: ${MIGRATION_NAME} is missing`);
  process.exit(1);
}

const raw = read(MIGRATION);
const proofAt = raw.indexOf("DO $proof$");
const sql = sqlOnly(raw.slice(0, proofAt === -1 ? raw.length : proofAt)).replace(
  /COMMENT ON [^;]*;/g,
  " ",
);
const proof = proofAt === -1 ? "" : raw.slice(proofAt);

// ---- PR 1 contract ----------------------------------------------------------
const adr = read(ADR);
const contractMatch = adr.match(/```json beskt-architecture-contract\n([\s\S]*?)\n```/);
const contract = contractMatch ? (JSON.parse(contractMatch[1]) as Record<string, unknown>) : null;
check(
  contract !== null && sha256(normaliseJson(contractMatch![1])) === PR1_CONTRACT_SHA256,
  "BESKT-DB-PR1-CONTRACT: PR 1's machine-readable contract is byte-for-byte the reviewed one (PR 2 weakens nothing)",
);
const evidenceStates = (contract?.evidenceStates as string[] | undefined) ?? [];
const requiredReviews =
  (contract?.pilotGate as { requiredReviews?: string[] })?.requiredReviews ?? [];
const activation =
  (contract?.method as { securityVettingActivation?: string[] })?.securityVettingActivation ?? [];
const observationFields = (contract?.observationFields as string[] | undefined) ?? [];

// ---- the migration exists once, at the canonical slot, with its proof ------
check(
  proofAt > 0 && /RAISE NOTICE 'BESKT_GOVERNED_CONTENT_PROOF ok'/.test(proof),
  "BESKT-DB-MIGRATION: the migration ends in the BESKT_GOVERNED_CONTENT_PROOF ok postflight",
);
check(
  readdirSync(join(ROOT, "supabase/migrations")).filter((f) => /beskt/i.test(f)).length === 1,
  "BESKT-DB-MIGRATION: exactly one BESKT migration exists in the active path",
);
check(
  !/CREATE OR REPLACE FUNCTION public\.scp_interview_pack_content_hash\(/.test(sql),
  "BESKT-DB-MIGRATION: the role-interview content hash is not redefined (every recorded review hash stays checkable)",
);

// ---- tables ---------------------------------------------------------------
const createdTables = [...sql.matchAll(/CREATE TABLE public\.([a-z_]+) \(/g)].map((m) => m[1]);
check(
  createdTables.length === TABLES.length && TABLES.every((t) => createdTables.includes(t)),
  `BESKT-DB-TABLES: exactly the twelve BESKT tables are created (${createdTables.length} found)`,
);
check(
  createdTables
    .filter((t) => !(TABLES as readonly string[]).includes(t))
    .every(
      (t) =>
        !/(candidate|assignment|invitation|notice|acknowledg|response|answer|case|session|observation|correction|verification_outcome|assessor|panel|report|preview|share|notification)/.test(
          t,
        ),
    ),
  "BESKT-DB-NO-RUNTIME-TABLES: no candidate, assignment, response, case, session, observation, assessor, panel or report table is added",
);
for (const t of TABLES) {
  const cols = tableColumns(sql, t);
  const forbidden = cols.filter((c) => FORBIDDEN_COLUMN.test(c));
  check(
    cols.length > 0 && forbidden.length === 0,
    `BESKT-DB-FORBIDDEN-COLUMNS: ${t} carries no score/level/weight/threshold/total/rank/pass-fail/suitability/credibility/truthfulness/recommendation/risk/verdict column${forbidden.length ? ` (found ${forbidden.join(", ")})` : ""}`,
  );
}
check(
  TABLES.every((t) => {
    const start = sql.indexOf(`CREATE TABLE public.${t} (`);
    const end = sql.indexOf(");", start);
    const body = sql.slice(start, end);
    return t === "beskt_method_events" || !/\bjsonb\b/.test(body);
  }),
  "BESKT-DB-FORBIDDEN-COLUMNS: no governed content table carries a jsonb column where a scoring key could hide",
);
check(
  TABLES.every((t) => {
    const start = sql.indexOf(`CREATE TABLE public.${t} (`);
    const end = sql.indexOf(");", start);
    const body = sql.slice(start, end);
    return (
      !/REFERENCES public\.(jobs|job_applications|scp_interview_cases|scp_interview_sessions|employers|profiles)\b/.test(
        body,
      ) &&
      !/(candidate|applicant|application|job_id|employer_id|case_id|session|assignment|answer_value|report)\w* /i.test(
        body.replace(/'[^']*'/g, "''"),
      )
    );
  }),
  "BESKT-DB-NO-RUNTIME-TABLES: no BESKT table references a job, application, candidate, case, session or employer",
);
check(
  !/CREATE (OR REPLACE )?VIEW/i.test(sql),
  "BESKT-DB-NO-RUNTIME-TABLES: no view is created (a view is where a hidden score would hide)",
);

// ---- RLS, grants, policies --------------------------------------------------
for (const t of TABLES) {
  const enable = new RegExp(`ALTER TABLE public\\.${t}\\s+ENABLE ROW LEVEL SECURITY;`).test(sql);
  const force = new RegExp(`ALTER TABLE public\\.${t}\\s+FORCE ROW LEVEL SECURITY;`).test(sql);
  const noForce = new RegExp(`ALTER TABLE public\\.${t}\\s+NO FORCE ROW LEVEL SECURITY;`).test(sql);
  check(
    enable && force && !noForce,
    `BESKT-DB-FORCE-RLS: ${t} carries both ENABLE and FORCE ROW LEVEL SECURITY`,
  );
  const revoke = new RegExp(
    `REVOKE ALL ON public\\.${t}\\s+FROM PUBLIC, anon, authenticated;`,
  ).test(sql);
  const clientWrite = new RegExp(
    `GRANT [^;]*\\b(INSERT|UPDATE|DELETE|ALL|TRUNCATE)\\b[^;]* ON public\\.${t}\\s+TO [^;]*\\b(anon|authenticated|PUBLIC)\\b`,
    "i",
  ).test(sql);
  const anonRead = new RegExp(`GRANT [^;]* ON public\\.${t}\\s+TO [^;]*\\banon\\b`, "i").test(sql);
  check(
    revoke && !clientWrite && !anonRead,
    `BESKT-DB-TABLE-GRANTS: ${t} is revoked to zero and re-granted SELECT only, never a client write, never anon`,
  );
  const policies = [
    ...sql.matchAll(
      new RegExp(
        `CREATE POLICY (\\w+) ON public\\.${t}\\s+FOR (\\w+) TO authenticated USING \\(([^;]*)\\);`,
        "g",
      ),
    ),
  ];
  check(
    policies.length === 1 &&
      policies[0][2] === "SELECT" &&
      /scp_interview_can_read\(auth\.uid\(\)\)/.test(policies[0][3]) &&
      !/\btrue\b/.test(policies[0][3]),
    `BESKT-DB-TABLE-GRANTS: ${t} has exactly one SELECT policy, for governance readers, never unconditional`,
  );
}

// ---- functions: search_path, revokes, no anon ------------------------------
const functionNames = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z_]+)\(/g)].map(
  (m) => m[1],
);
const uniqueFunctions = [...new Set(functionNames)];
check(
  uniqueFunctions.length === functionNames.length,
  "BESKT-DB-DEFINER-SEARCH-PATH: no function is defined twice in the migration",
);
for (const name of uniqueFunctions) {
  const fn = functionText(sql, name)!;
  const header = functionHeader(fn);
  check(
    /\bSET search_path = public\b/.test(header),
    `BESKT-DB-DEFINER-SEARCH-PATH: ${name} pins search_path = public`,
  );
  const revoke = new RegExp(
    `REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\)\\s+FROM PUBLIC, anon`,
  ).test(sql);
  const grantAnon = new RegExp(
    `GRANT [^;]*ON FUNCTION public\\.${name}\\([^)]*\\)\\s+TO [^;]*\\b(anon|PUBLIC)\\b`,
    "i",
  ).test(sql);
  check(
    revoke && !grantAnon,
    `BESKT-DB-ANON-EXECUTE: ${name} is revoked from PUBLIC and anon and never re-granted to them`,
  );
  if (/RETURNS trigger/.test(header)) {
    check(
      new RegExp(
        `REVOKE ALL ON FUNCTION public\\.${name}\\(\\) FROM PUBLIC, anon, authenticated;`,
      ).test(sql),
      `BESKT-DB-ANON-EXECUTE: trigger function ${name} is unreachable by authenticated`,
    );
  }
}
for (const name of [...INTERNAL_FUNCTIONS, "scp_iv_case_start_basis"]) {
  check(
    new RegExp(
      `REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\)\\s+FROM PUBLIC, anon, authenticated;`,
    ).test(sql) &&
      !new RegExp(
        `GRANT [^;]*ON FUNCTION public\\.${name}\\([^)]*\\)\\s+TO [^;]*\\bauthenticated\\b`,
      ).test(sql),
    `BESKT-DB-ANON-EXECUTE: internal function ${name} is unreachable by authenticated`,
  );
}

// ---- pack_kind and the old flow ---------------------------------------------
check(
  /ADD COLUMN pack_kind text NOT NULL DEFAULT 'role_interview'\s+CONSTRAINT scp_interview_packs_pack_kind_check\s+CHECK \(pack_kind IN \('role_interview', 'beskt_method'\)\)/.test(
    sql,
  ),
  "BESKT-DB-PACK-KIND: pack_kind is constrained text, defaulted and backfilled to role_interview, vocabulary exactly role_interview | beskt_method",
);
check(
  /ALTER COLUMN role_id DROP NOT NULL/.test(sql) &&
    /\(pack_kind = 'role_interview' AND role_id IS NOT NULL\)\s+OR \(pack_kind = 'beskt_method' AND role_id IS NULL\)/.test(
      sql,
    ),
  "BESKT-DB-PACK-KIND: role linkage is conditional under the role_interview => present, beskt_method => absent invariant",
);
check(
  /CREATE TRIGGER scp_interview_pack_versions_role_interview_only\s+BEFORE INSERT ON public\.scp_interview_pack_versions/.test(
    sql,
  ) &&
    /IF _kind IS DISTINCT FROM 'role_interview' THEN\s+RAISE EXCEPTION\s+'SCP_INTERVIEW_PACK_KIND_MISMATCH/.test(
      functionBody(functionText(sql, "beskt_guard_role_interview_version") ?? ""),
    ),
  "BESKT-DB-PACK-KIND: the role-interview version spine refuses any non-role-interview pack by trigger",
);
for (const name of RESCOPED_OLD_FLOW) {
  const fn = functionText(sql, name);
  const body = fn ? functionBody(fn) : "";
  check(
    fn !== null && /(WHERE|AND|IF)[^;]*\bp\.pack_kind = 'role_interview'/.test(body),
    `BESKT-DB-PACK-KIND: ${name} is re-created with an explicit pack_kind = 'role_interview' scope in its computation`,
  );
}
check(
  /CREATE OR REPLACE FUNCTION public\.scp_iv_create_case\(\s*_employer_id uuid, _title text, _pack_version_id uuid, _candidate_display_name text,\s*_candidate_user_id uuid DEFAULT NULL, _candidate_external_ref text DEFAULT NULL,\s*_job_id uuid DEFAULT NULL, _application_id uuid DEFAULT NULL\)/.test(
    sql,
  ) &&
    /CREATE OR REPLACE FUNCTION public\.scp_iv_startable_pack_versions\(_employer_id uuid\)/.test(
      sql,
    ) &&
    /CREATE OR REPLACE FUNCTION public\.scp_iv_case_start_basis\(\s*_employer_id uuid, _pack_version_id uuid, _user_id uuid DEFAULT NULL\)/.test(
      sql,
    ) &&
    /CREATE OR REPLACE FUNCTION public\.scp_interview_pack_validate\(_pack_version_id uuid\)/.test(
      sql,
    ) &&
    /CREATE OR REPLACE FUNCTION public\.scp_interview_create_version\(\s*_pack_id uuid,\s*_locale text,\s*_role_version_id uuid,\s*_source_reference text,\s*_source_document_version text,\s*_summary_sv text DEFAULT NULL\)/.test(
      sql,
    ),
  "BESKT-DB-PACK-KIND: every re-scoped function keeps its exact original signature (no PostgREST-ambiguous overload)",
);
{
  const body = functionBody(functionText(sql, "scp_interview_pack_validate") ?? "");
  const kindAt = body.indexOf("PACK_KIND_NOT_ROLE_INTERVIEW");
  const firstContract = body.search(/scp_interview_pack_competencies|scp_interview_rating_anchors/);
  check(
    kindAt > 0 &&
      firstContract > kindAt &&
      /IF NOT EXISTS \(SELECT 1 FROM public\.scp_interview_packs p\s+WHERE p\.id = _v\.pack_id AND p\.pack_kind = 'role_interview'\) THEN\s+RETURN QUERY SELECT 'PACK_KIND_NOT_ROLE_INTERVIEW'/.test(
        body,
      ),
    "BESKT-DB-OLD-VALIDATOR: the role-interview validator blocks a non-role-interview pack BEFORE reading any competency or 0-4 anchor",
  );
  const beskt = functionBody(functionText(sql, "beskt_method_validate") ?? "");
  check(
    beskt.length > 0 &&
      !/rating_anchor|competenc|level BETWEEN|counts_toward_aggregation|scp_interview_pack_validate/i.test(
        beskt,
      ),
    "BESKT-DB-OLD-VALIDATOR: the BESKT validator never reads the role-interview 0-4 or competency contract",
  );
}

// ---- hash -------------------------------------------------------------------
{
  const hash = functionBody(functionText(sql, "beskt_method_content_hash") ?? "");
  const canon = functionBody(functionText(sql, "beskt_canonical_content") ?? "");
  check(
    /encode\(sha256\(convert_to\(public\.beskt_canonical_content\(_method_version_id\), 'UTF8'\)\), 'hex'\)/.test(
      hash,
    ) && !/md5\(|digest\(/.test(hash),
    "BESKT-DB-HASH: the content hash is core sha256 over the canonical UTF-8 bytes, never md5 or pgcrypto",
  );
  const aggs = [...canon.matchAll(/string_agg\(/g)].length;
  const ordered = [...canon.matchAll(/string_agg\([\s\S]*?E'\\n' ORDER BY /g)].length;
  check(
    aggs >= 9 && ordered === aggs && CHILD_TABLES.every((t) => canon.includes(`public.${t}`)),
    "BESKT-DB-HASH: every governed table is in the canonical representation and every aggregate is explicitly ordered on stable keys",
  );
  check(
    !/content_status|revision|published_at|created_by|validation_label/.test(canon),
    "BESKT-DB-HASH: lifecycle columns are excluded from the canonical representation",
  );
}

// ---- validator: evidence states, anchors, gates, activation -----------------
{
  const v = functionBody(functionText(sql, "beskt_method_validate") ?? "");
  const statesLiteral = /_evidence_states text\[\] := ARRAY\[([\s\S]*?)\];/.exec(v);
  const states = statesLiteral
    ? [...statesLiteral[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    : [];
  check(
    evidenceStates.length === 7 &&
      states.length === 7 &&
      states.every((s, i) => s === evidenceStates[i]) &&
      /FOREACH _state IN ARRAY _evidence_states LOOP[\s\S]*?a\.evidence_state = _state\)[\s\S]*?'EVIDENCE_STATE_MISSING_' \|\| upper\(_state\)/.test(
        v,
      ),
    "BESKT-DB-EVIDENCE-STATES: the validator requires exactly PR 1's seven evidence states, in order, each blocking on its own",
  );
  const tableStates =
    /evidence_state text NOT NULL CHECK \(evidence_state IN \(([\s\S]*?)\)\)/.exec(sql);
  const tableList = tableStates
    ? [...tableStates[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    : [];
  check(
    tableList.length === 7 && tableList.every((s, i) => s === evidenceStates[i]),
    "BESKT-DB-EVIDENCE-STATES: the anchor table admits exactly those seven states and no numeric level",
  );
  for (const c of ANCHOR_COMPONENTS) {
    const re = new RegExp(
      `RETURN QUERY\\s+SELECT 'ANCHOR_COMPONENT_MISSING_${c}', 'blocking',[\\s\\S]{0,600}?FROM public\\.beskt_evidence_anchors a WHERE a\\.method_version_id = _method_version_id\\s+AND `,
    );
    check(
      re.test(v),
      `BESKT-DB-ANCHOR-COMPONENTS: a missing ${c.toLowerCase()} component blocks publication`,
    );
  }
  check(
    /coalesce\(a\.definition_sv, ''\)\)\) = 0 OR length\(btrim\(coalesce\(a\.definition_en, ''\)\)\) = 0/.test(
      v,
    ) &&
      /coalesce\(cardinality\(a\.prohibited_inferences\), 0\) = 0/.test(v) &&
      /a\.required_next_action IS NULL/.test(v),
    "BESKT-DB-ANCHOR-COMPONENTS: the component checks test the real columns in both languages",
  );
  const gatesLiteral = /_review_gates text\[\] := ARRAY\[([\s\S]*?)\];/.exec(v);
  const gates = gatesLiteral ? [...gatesLiteral[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]) : [];
  check(
    requiredReviews.length === 5 &&
      gates.length === 5 &&
      gates.every((g, i) => g === requiredReviews[i]) &&
      /FOREACH _gate IN ARRAY _review_gates LOOP[\s\S]*?rv\.gate = _gate\s+AND rv\.decision = 'approved'\s+AND rv\.content_hash_at_review = _hash\)/.test(
        v,
      ) &&
      /_hash := public\.beskt_method_content_hash\(_method_version_id\);\s+FOREACH _gate/.test(v),
    "BESKT-DB-REVIEW-GATES: all five PR 1 reviews must be approved at the CURRENT content hash",
  );
  const tableGates = /gate text NOT NULL CHECK \(gate IN \(([\s\S]*?)\)\)/.exec(sql);
  const tableGateList = tableGates
    ? [...tableGates[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    : [];
  check(
    tableGateList.length === 5 && tableGateList.every((g, i) => g === requiredReviews[i]),
    "BESKT-DB-REVIEW-GATES: the review table admits exactly the five gates",
  );
  for (const key of activation) {
    const code = {
      security_sensitive_role_attested: "SV_SECURITY_SENSITIVE_ROLE_NOT_ATTESTED",
      lawful_basis_recorded: "SV_LAWFUL_BASIS_NOT_RECORDED",
      authorised_security_owner_assigned: "SV_AUTHORISED_SECURITY_OWNER_NOT_ASSIGNED",
    }[key];
    const re = new RegExp(
      `IF NOT EXISTS \\(SELECT 1 FROM public\\.beskt_activation_requirements a\\s+WHERE a\\.method_version_id = _method_version_id\\s+AND a\\.requirement_key = '${key}'[\\s\\S]{0,400}?RETURN QUERY SELECT '${code}'::text, 'blocking'::text`,
    );
    check(
      re.test(v),
      `BESKT-DB-SV-GATES: the ${key} requirement is independently fail-closed (${code})`,
    );
  }
  const activationTable =
    /requirement_key text NOT NULL CHECK \(requirement_key IN \(([\s\S]*?)\)\)/.exec(sql);
  const activationList = activationTable
    ? [...activationTable[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    : [];
  check(
    activation.length === 3 &&
      activationList.length === 3 &&
      activationList.every((k, i) => k === activation[i]) &&
      /IF _v\.mode = 'security_vetting_support' THEN/.test(v),
    "BESKT-DB-SV-GATES: the requirement vocabulary is exactly PR 1's three activation requirements and the gates apply to security_vetting_support",
  );
  check(
    /SELECT 'ROUTE_RECRUITMENT_INTO_SECURITY_VETTING', 'blocking',[\s\S]{0,500}?AND r\.applies_mode = 'recruitment_support'\s+AND \(ti\.permitted_mode = 'security_vetting_support' OR si\.permitted_mode = 'security_vetting_support'\)/.test(
      v,
    ),
    "BESKT-DB-MODE-ESCALATION: the validator re-proves on the stored graph that no recruitment-support rule reaches or reads security-vetting content",
  );
  check(
    /WITH RECURSIVE walk AS[\s\S]*?SELECT 1 FROM walk WHERE walk\.node = walk\.origin\) THEN\s+RETURN QUERY SELECT 'ROUTE_CYCLE'/.test(
      v,
    ) && /SELECT 'ROUTE_TARGET_UNREACHABLE', 'blocking'/.test(v),
    "BESKT-DB-ROUTING: cycles and unreachable targets block publication",
  );
  check(
    /SELECT 'OPTION_KEY_ENCODES_NON_ANSWER', 'blocking'/.test(v) &&
      /SELECT 'ANCHOR_UNADDRESSED_PERMITS_OMISSION_INFERENCE', 'blocking'/.test(v),
    "BESKT-DB-OMISSION-NEUTRAL: an option encoding a non-answer and an unaddressed anchor permitting the omission inference both block",
  );
  const fieldsLiteral = /_observation_fields text\[\] := ARRAY\[([\s\S]*?)\];/.exec(v);
  const fields = fieldsLiteral
    ? [...fieldsLiteral[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1])
    : [];
  check(
    observationFields.length === 10 &&
      fields.length === 10 &&
      fields.every((f, i) => f === observationFields[i]),
    "BESKT-DB-OBSERVATION-FIELDS: the ten PR 1 observation fields are defined, in order, as governed concepts",
  );
  check(
    /BESKT_NOT_AUTHORISED/.test(v) && /scp_interview_can_read\(auth\.uid\(\)\)/.test(v),
    "BESKT-DB-ANON-EXECUTE: the validator refuses callers without a content role",
  );
}

// ---- routing: structure and neutrality ---------------------------------------
{
  check(
    /condition_kind text NOT NULL\s+CHECK \(condition_kind IN \('always', 'option_selected', 'boolean_equals'\)\)/.test(
      sql,
    ),
    "BESKT-DB-OMISSION-NEUTRAL: routing conditions are exactly always | option_selected | boolean_equals — no condition can read an omission or a discuss-orally answer",
  );
  const cols = tableColumns(sql, "beskt_routing_rules");
  check(
    !cols.some((c) => /expression|script|jsonb|formula|prompt|llm/i.test(c)) &&
      !/jsonb/.test(
        sql.slice(
          sql.indexOf("CREATE TABLE public.beskt_routing_rules ("),
          sql.indexOf(");", sql.indexOf("CREATE TABLE public.beskt_routing_rules (")),
        ),
      ),
    "BESKT-DB-ROUTING: a routing rule carries no expression, jsonb action or free-text condition",
  );
  const r = functionBody(functionText(sql, "beskt_resolve_item_sequence") ?? "");
  check(
    /WHEN 'option_selected' THEN\s+_answer IS NOT NULL\s+AND _answer ->> 'kind' = 'option'/.test(
      r,
    ) &&
      /WHEN 'boolean_equals' THEN\s+_answer IS NOT NULL\s+AND _answer ->> 'kind' = 'boolean'/.test(
        r,
      ) &&
      !/'omitted'|'discuss_orally'/.test(r) &&
      /ORDER BY s\.display_order, i\.display_order, i\.item_key/.test(r) &&
      /ORDER BY r\.evaluation_order/.test(r),
    "BESKT-DB-OMISSION-NEUTRAL: the resolver fires a rule only on an explicit option or boolean answer and orders on stable keys",
  );
  check(
    /\(i\.permitted_mode = 'recruitment_support' OR _mode = 'security_vetting_support'\)/.test(r) &&
      /IF NOT public\.beskt_can_read_version\(_method_version_id\) THEN/.test(r),
    "BESKT-DB-MODE-ESCALATION: the resolver never surfaces security-vetting items in recruitment mode and authorises its caller",
  );
}

// ---- guards: cross-version, mode escalation, immutability, append-only ------
{
  const g = functionBody(functionText(sql, "beskt_guard_child_row") ?? "");
  check(
    /IF _src\.method_version_id IS DISTINCT FROM NEW\.method_version_id\s+OR _tgt\.method_version_id IS DISTINCT FROM NEW\.method_version_id THEN\s+RAISE EXCEPTION 'BESKT_CROSS_VERSION_REFERENCE/.test(
      g,
    ) &&
      /SELECT s\.method_version_id INTO _other FROM public\.beskt_sections s WHERE s\.id = NEW\.section_id;\s+IF _other IS DISTINCT FROM NEW\.method_version_id THEN\s+RAISE EXCEPTION 'BESKT_CROSS_VERSION_REFERENCE/.test(
        g,
      ) &&
      /IF _opt_item IS DISTINCT FROM NEW\.source_item_id THEN\s+RAISE EXCEPTION 'BESKT_ROUTE_OPTION_SCOPE/.test(
        g,
      ),
    "BESKT-DB-CROSS-VERSION: the child guard compares the real owning versions of source, target, section, profile and option and refuses a mismatch",
  );
  check(
    /IF NEW\.applies_mode = 'recruitment_support'\s+AND \(_tgt\.permitted_mode = 'security_vetting_support'\s+OR _src\.permitted_mode = 'security_vetting_support'\) THEN\s+RAISE EXCEPTION 'BESKT_ROUTE_MODE_ESCALATION/.test(
      g,
    ),
    "BESKT-DB-MODE-ESCALATION: the child guard refuses a recruitment-support rule that reaches or reads security-vetting content at write time",
  );
  check(
    /IF _status NOT IN \('draft', 'in_review'\) THEN\s+RAISE EXCEPTION\s+'BESKT_PUBLISHED_IMMUTABLE/.test(
      g,
    ) &&
      /ELSE\s+RAISE EXCEPTION\s+'BESKT_GUARD_UNKNOWN_TABLE/.test(g) &&
      CHILD_TABLES.every((t) =>
        new RegExp(
          `CREATE TRIGGER ${t}_child_guard\\s+BEFORE INSERT OR UPDATE OR DELETE ON public\\.${t}\\s+FOR EACH ROW EXECUTE FUNCTION public\\.beskt_guard_child_row\\(\\);`,
        ).test(sql),
      ),
    "BESKT-DB-PUBLISHED-IMMUTABLE: every child table is guarded on INSERT, UPDATE and DELETE by a fail-closed guard that freezes published, suspended and retired versions",
  );
  const vt = functionBody(functionText(sql, "beskt_guard_version_transition") ?? "");
  check(
    /IF NOT \(OLD\.content_status = ANY \(_editable\)\) THEN[\s\S]*?RAISE EXCEPTION\s+'BESKT_PUBLISHED_IMMUTABLE/.test(
      vt,
    ) &&
      /_editable text\[\] := ARRAY\['draft', 'in_review'\];/.test(vt) &&
      /IF NEW\.revision < OLD\.revision THEN\s+RAISE EXCEPTION 'BESKT_REVISION_REGRESSION/.test(
        vt,
      ) &&
      /IF NOT _governed THEN\s+RAISE EXCEPTION\s+'BESKT_UNGOVERNED_WRITE/.test(vt) &&
      /WHEN 'published' THEN NEW\.content_status IN \('suspended', 'retired'\)/.test(vt) &&
      /WHEN 'retired'\s+THEN false/.test(vt),
    "BESKT-DB-PUBLISHED-IMMUTABLE: the version guard freezes content from published onward, refuses ungoverned writes and revision regression, and retired is terminal",
  );
  check(
    /CREATE TRIGGER beskt_method_versions_no_delete\s+BEFORE DELETE ON public\.beskt_method_versions/.test(
      sql,
    ) &&
      /RAISE EXCEPTION\s+'BESKT_VERSION_NO_DELETE/.test(
        functionBody(functionText(sql, "beskt_guard_version_no_delete") ?? ""),
      ),
    "BESKT-DB-PUBLISHED-IMMUTABLE: a method version is never deleted",
  );
  for (const [t, fn, code] of [
    ["beskt_method_reviews", "beskt_guard_reviews_append_only", "BESKT_REVIEW_APPEND_ONLY"],
    ["beskt_method_events", "beskt_guard_events_append_only", "BESKT_EVENT_APPEND_ONLY"],
  ] as const) {
    const body = functionBody(functionText(sql, fn) ?? "");
    check(
      new RegExp(
        `CREATE TRIGGER ${t}_append_only\\s+BEFORE UPDATE OR DELETE ON public\\.${t}\\s+FOR EACH ROW EXECUTE FUNCTION public\\.${fn}\\(\\);`,
      ).test(sql) && new RegExp(`^\\s*BEGIN\\s+RAISE EXCEPTION\\s+'${code}`).test(body),
      `BESKT-DB-APPEND-ONLY: ${t} refuses UPDATE and DELETE unconditionally, for every caller`,
    );
  }
  const rv = functionBody(functionText(sql, "beskt_guard_review_insert") ?? "");
  check(
    /IF _v\.created_by IS NOT NULL AND _v\.created_by = NEW\.reviewer_id THEN\s+RAISE EXCEPTION\s+'BESKT_SELF_REVIEW/.test(
      rv,
    ) &&
      /AND r\.gate <> NEW\.gate\) THEN\s+RAISE EXCEPTION\s+'BESKT_REVIEW_ONE_GATE_PER_REVIEWER/.test(
        rv,
      ) &&
      /IF NEW\.content_hash_at_review IS DISTINCT FROM _v\.content_hash\s+OR NEW\.revision_at_review IS DISTINCT FROM _v\.revision THEN/.test(
        rv,
      ) &&
      /IF _v\.created_by IS NOT NULL AND _v\.created_by = auth\.uid\(\) THEN\s+RAISE EXCEPTION 'BESKT_PUBLISHER_IS_AUTHOR/.test(
        functionBody(functionText(sql, "beskt_publish_version") ?? ""),
      ),
    "BESKT-DB-REVIEW-GATES: separation of duties — no self-review, one gate per reviewer per hash, hash-bound reviews, author never publishes",
  );
}

// ---- mutations: actor, replay before CAS, stale revision, events -----------
{
  const lock = functionBody(functionText(sql, "beskt_lock_version") ?? "");
  check(
    /IF _v\.revision <> _expected_revision THEN\s+RAISE EXCEPTION 'BESKT_STALE_REVISION/.test(
      lock,
    ) &&
      /IF _expected_revision IS NULL THEN\s+RAISE EXCEPTION 'BESKT_REVISION_REQUIRED/.test(lock) &&
      /FOR UPDATE;/.test(lock),
    "BESKT-DB-STALE-REVISION: the lock helper locks the row and refuses a stale or missing expected revision",
  );
  const begin = functionBody(functionText(sql, "beskt_operation_begin") ?? "");
  check(
    /pg_advisory_xact_lock\(hashtextextended\('beskt_operation:' \|\| _operation_id::text, 0\)\)/.test(
      begin,
    ) &&
      /IF _receipt\.actor_id IS DISTINCT FROM auth\.uid\(\) THEN\s+RAISE EXCEPTION 'BESKT_OPERATION_ACTOR_MISMATCH/.test(
        begin,
      ) &&
      /IF _receipt\.request_hash IS DISTINCT FROM _request_hash THEN\s+RAISE EXCEPTION 'BESKT_OPERATION_PAYLOAD_MISMATCH/.test(
        begin,
      ) &&
      /RETURN _receipt\.result;/.test(begin) &&
      /IF _operation_id IS NULL THEN\s+RAISE EXCEPTION 'BESKT_OPERATION_ID_REQUIRED/.test(begin),
    "BESKT-DB-REPLAY: an operation is serialised on its id, replayed only for the same actor and request, and refused on a changed payload",
  );
  check(
    /CREATE UNIQUE INDEX beskt_method_events_operation_idx\s+ON public\.beskt_method_events \(operation_id\) WHERE operation_id IS NOT NULL;/.test(
      sql,
    ) &&
      /encode\(sha256\(convert_to\(_request::text, 'UTF8'\)\), 'hex'\)/.test(
        functionBody(functionText(sql, "beskt_request_hash") ?? ""),
      ),
    "BESKT-DB-REPLAY: receipts are unique per operation id and the request hash is sha256 over the canonical request",
  );
  for (const m of MUTATIONS) {
    const body = functionBody(functionText(sql, m) ?? "");
    const uidAt = body.indexOf("IF auth.uid() IS NULL THEN");
    const hashAt = body.indexOf("_request_hash := public.beskt_request_hash(");
    const replayAt = body.indexOf(
      "_replay := public.beskt_operation_begin(_operation_id, _request_hash);",
    );
    const replayReturn = body.indexOf("IF _replay IS NOT NULL THEN RETURN _replay; END IF;");
    const lockAt = REVISION_MUTATIONS.includes(m)
      ? body.indexOf("public.beskt_lock_version(_method_version_id, _expected_revision)")
      : replayAt + 1;
    const eventAt = body.indexOf("PERFORM public.beskt_record_event(");
    check(
      uidAt >= 0 &&
        hashAt > uidAt &&
        replayAt > hashAt &&
        replayReturn > replayAt &&
        lockAt > replayAt &&
        eventAt > lockAt &&
        /_operation_id, _request_hash, _result/.test(body),
      `BESKT-DB-REPLAY: ${m} derives its actor, hashes its request, answers a replay BEFORE the compare-and-swap, and writes its receipt-bearing event`,
    );
    const header = functionHeader(functionText(sql, m) ?? "");
    check(
      /_operation_id uuid,/.test(header) &&
        (!REVISION_MUTATIONS.includes(m) || /_expected_revision integer[,)]/.test(header)) &&
        !/_expected_revision integer DEFAULT/.test(header),
      `BESKT-DB-STALE-REVISION: ${m} takes an operation id${REVISION_MUTATIONS.includes(m) ? " and a required expected revision" : ""}`,
    );
  }
  const publish = functionBody(functionText(sql, "beskt_publish_version") ?? "");
  const lockAt = publish.indexOf("beskt_lock_version(");
  const validateAt = publish.indexOf("FROM public.beskt_method_validate(_method_version_id, true)");
  const updateAt = publish.indexOf("SET content_status = 'published'");
  check(
    lockAt > 0 &&
      validateAt > lockAt &&
      updateAt > validateAt &&
      /IF _blocker_count > 0 THEN\s+RAISE EXCEPTION E'BESKT_PUBLISH_BLOCKED/.test(publish) &&
      /IF _hash IS DISTINCT FROM _v\.content_hash THEN\s+RAISE EXCEPTION 'BESKT_CONTENT_HASH_STALE/.test(
        publish,
      ) &&
      /IF _v\.content_status <> 'in_review' THEN/.test(publish),
    "BESKT-DB-REVIEW-GATES: publication runs the validator with reviews inside the locked transaction and refuses stale content, blockers and the wrong state",
  );
  check(
    /FROM public\.beskt_method_validate\(_method_version_id, false\)/.test(
      functionBody(functionText(sql, "beskt_submit_for_review") ?? ""),
    ) &&
      /BESKT_SUBMIT_BLOCKED/.test(functionBody(functionText(sql, "beskt_submit_for_review") ?? "")),
    "BESKT-DB-REVIEW-GATES: submission validates content completeness before any reviewer sees it",
  );
}

// ---- the read contract --------------------------------------------------------
{
  const can = functionBody(functionText(sql, "beskt_can_read_version") ?? "");
  check(
    /AND v\.content_status = 'published'\s+AND v\.mode = 'recruitment_support'/.test(can) &&
      /employer_is_active_status\(em\.employer_id\)/.test(can) &&
      /scp_interview_can_read\(auth\.uid\(\)\)/.test(can),
    "BESKT-DB-READ-CONTRACT: employer principals reach published recruitment-support content only; security-vetting content fails closed",
  );
  const pub = functionBody(functionText(sql, "beskt_published_method") ?? "");
  check(
    /IF NOT public\.beskt_can_read_version\(_method_version_id\) THEN\s+RAISE EXCEPTION 'BESKT_NOT_AUTHORISED/.test(
      pub,
    ) &&
      /IF _v\.content_status <> 'published' THEN\s+RAISE EXCEPTION 'BESKT_NOT_PUBLISHED/.test(
        pub,
      ) &&
      !/'(score|level|weight|threshold|total|rank|pass_fail|suitability|credibility|truthfulness|recommendation|risk|verdict|startable|start_route|case_id|candidate)[a-z_]*'/.test(
        pub,
      ) &&
      !/scp_iv_create_case|scp_iv_case_start_basis/.test(pub),
    "BESKT-DB-READ-CONTRACT: the read returns published content only, to authorised callers only, with no score, verdict, candidate or start key",
  );
  const list = functionBody(functionText(sql, "beskt_readable_published_versions") ?? "");
  check(
    /AND v\.content_status = 'published'\s+AND public\.beskt_can_read_version\(v\.id\)/.test(
      list,
    ) && /p\.pack_kind = 'beskt_method'/.test(list),
    "BESKT-DB-READ-CONTRACT: the listing names published, readable BESKT versions only",
  );
  check(
    ["scp_iv_create_case", "scp_iv_case_start_basis", "scp_iv_startable_pack_versions"].every(
      (f) => {
        const fn = functionText(sql, f);
        return fn !== null && !/beskt_method_versions|beskt_exposure_profiles/.test(fn);
      },
    ),
    "BESKT-DB-READ-CONTRACT: no start path reads a BESKT method version — nothing is startable in PR 2",
  );
}

// ---- no application, hosted or deployment change -----------------------------
{
  const srcFiles = walk(join(ROOT, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
  const offenders = srcFiles.filter((f) => /\bbeskt_/i.test(read(f)));
  check(
    offenders.length === 0,
    `BESKT-DB-NO-APP-CODE: no application file references the BESKT schema (${offenders.length} offender(s))`,
  );
  const fnDir = join(ROOT, "supabase/functions");
  const fnOffenders = existsSync(fnDir)
    ? walk(fnDir).filter((f) => /\.(ts|js)$/.test(f) && /\bbeskt/i.test(read(f)))
    : [];
  check(fnOffenders.length === 0, "BESKT-DB-NO-APP-CODE: no edge function references BESKT");
  const state = JSON.parse(read(RELEASE_STATE)) as {
    frontier: { file: string; hostedState: string; rollback?: string; introduces?: unknown[] }[];
  };
  const entry = state.frontier.find((e) => e.file === MIGRATION_NAME);
  check(
    entry !== undefined &&
      entry.hostedState === "pending" &&
      entry.rollback ===
        "supabase/rollback/20261108090000_beskt_governed_method_content_rollback.sql" &&
      (entry.introduces?.length ?? 0) >= 13,
    "BESKT-DB-NO-HOSTED: the migration is recorded pending (never applied) with its objects and rollback in release-state.json",
  );
  check(
    !read(HOSTED_LEDGER).includes("20261108090000"),
    "BESKT-DB-NO-HOSTED: the hosted ledger snapshot does not claim the migration was applied",
  );
  check(
    /const expectedPending: string\[\] = \["20261108090000_beskt_governed_method_content\.sql"\];/.test(
      read(FRONTIER),
    ),
    "BESKT-DB-NO-HOSTED: the release frontier expects exactly this migration to be pending",
  );
}

// ---- registration: suite, runner, rollback, controls ---------------------------
{
  const suite = existsSync(SUITE) ? read(SUITE) : "";
  check(
    ["GROUP B0", "GROUP B0b", "GROUP B1", "GROUP B2", "GROUP B3", "GROUP B4", "GROUP B5"].every(
      (g) => suite.includes(g),
    ) &&
      [
        "B0b.2",
        "B0b.11",
        "B1.7",
        "B2.24",
        "B2.25",
        "B2.40",
        "B2.48",
        "B2.51",
        "B2.56",
        "B3.21",
        "B3.27",
        "B3.62",
        "B4.3",
        "B4.7",
        "B5.1",
        "B5.30",
      ].every((l) => suite.includes(l)) &&
      /ROLLBACK;\s*$/.test(suite),
    "BESKT-DB-SUITE: the behaviour suite exists with every group and the material assertions, and rolls back",
  );
  const db = read(DB_TEST);
  const suiteAt = db.indexOf("-f supabase/tests/beskt_governed_content_test.sql");
  const rollbackAt = db.indexOf(
    "-f supabase/rollback/20261108090000_beskt_governed_method_content_rollback.sql",
  );
  const reapplyAt = db.indexOf(`-f supabase/migrations/${MIGRATION_NAME}`);
  const floor = /BG_PASSED" -lt (\d+)/.exec(db);
  check(
    suiteAt > 0 &&
      rollbackAt > suiteAt &&
      reapplyAt > rollbackAt &&
      db.includes('grep -q "BESKT_GOVERNED_CONTENT_ROLLBACK ok"') &&
      db.includes('grep -q "BESKT_GOVERNED_CONTENT_PROOF ok"') &&
      floor !== null &&
      Number(floor[1]) >= 150,
    "BESKT-DB-SUITE: db-test.sh runs the suite with a floor, applies the rollback file for real, reads its proof and re-applies the migration",
  );
  check(
    read(ROLLBACK_SUITE).includes("beskt_method_versions") &&
      read(ROLLBACK_SUITE).includes("DROP COLUMN IF EXISTS pack_kind"),
    "BESKT-DB-SUITE: the documented rollback procedure unwinds BESKT first",
  );
  const rb = existsSync(ROLLBACK) ? sqlOnly(read(ROLLBACK)) : "";
  check(
    TABLES.every((t) => new RegExp(`DROP TABLE IF EXISTS public\\.${t}\\s+CASCADE;`).test(rb)) &&
      /ALTER TABLE public\.scp_interview_packs ALTER COLUMN role_id SET NOT NULL;/.test(rb) &&
      /ALTER TABLE public\.scp_interview_packs DROP COLUMN IF EXISTS pack_kind;/.test(rb) &&
      RESCOPED_OLD_FLOW.every((f) => {
        const fn = functionText(rb, f);
        return fn !== null && !/pack_kind/.test(functionBody(fn));
      }) &&
      /RAISE NOTICE 'BESKT_GOVERNED_CONTENT_ROLLBACK ok'/.test(rb),
    "BESKT-DB-ROLLBACK: the rollback drops the domain and the discriminator, restores role_id NOT NULL and restores every re-scoped function without the scope",
  );
  const pkg = JSON.parse(read(PACKAGE)) as { scripts: Record<string, string> };
  check(
    pkg.scripts["beskt-governed-content:check"] ===
      "bun run scripts/beskt-governed-content-check.ts" &&
      pkg.scripts["negative-controls:beskt-governed-content"] ===
        "bun run scripts/negative-controls/beskt-governed-content-controls.ts" &&
      pkg.scripts["negative-controls:all"].includes("negative-controls:beskt-governed-content") &&
      pkg.scripts["beskt-architecture:check"] ===
        "bun run scripts/beskt-architecture-contract-check.ts" &&
      pkg.scripts["negative-controls:all"].includes("negative-controls:beskt"),
    "BESKT-DB-REGISTRATION: the PR 2 guard and controls are registered beside PR 1's, and PR 1's stay registered",
  );
  const ci = read(CI);
  check(
    ci.includes("run: bun run beskt-governed-content:check") &&
      ci.includes("run: bun run beskt-architecture:check") &&
      ci.includes("run: bun run negative-controls:all"),
    "BESKT-DB-REGISTRATION: CI runs the PR 1 guard, the PR 2 guard and every negative control",
  );
  const ts = read(TSCONFIG);
  check(
    ts.includes('"scripts/beskt-governed-content-check.ts"') &&
      ts.includes('"scripts/negative-controls/beskt-governed-content-controls.ts"'),
    "BESKT-DB-REGISTRATION: the guard and its controls are typechecked",
  );
}

if (failures.length > 0) {
  console.error(`\nBESKT governed-content guard FAILED (${failures.length} of ${assertions}).`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`\nBESKT governed-content guard: ${assertions} of ${assertions} assertions passed.`);
