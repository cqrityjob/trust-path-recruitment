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
const FIXTURE = join(ROOT, "supabase/tests/beskt_governed_content_fixture.sql");
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
  "beskt_governance_grants",
  "beskt_method_reviews",
  "beskt_method_events",
] as const;

const CHILD_TABLES = TABLES.filter(
  (t) =>
    ![
      "beskt_method_versions",
      "beskt_governance_grants",
      "beskt_method_reviews",
      "beskt_method_events",
    ].includes(t),
);

/** Every parent / owning key per child family; each is immutable. */
const PARENT_KEYS: Record<string, readonly string[]> = {
  beskt_exposure_profiles: ["method_version_id"],
  beskt_activation_requirements: ["method_version_id"],
  beskt_sections: ["method_version_id"],
  beskt_items: ["method_version_id", "section_id", "exposure_profile_id"],
  beskt_item_options: ["item_id"],
  beskt_prompts: ["method_version_id", "exposure_profile_id", "item_id"],
  beskt_routing_rules: [
    "method_version_id",
    "source_item_id",
    "target_item_id",
    "condition_option_id",
  ],
  beskt_evidence_anchors: ["method_version_id"],
  beskt_observation_fields: ["method_version_id"],
};

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
  "beskt_method_content_hash",
  "beskt_holds_grant",
  "beskt_reader_access_classes",
] as const;

const ADMIN_MUTATIONS = ["beskt_grant_governance", "beskt_revoke_governance"] as const;

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
  `BESKT-DB-TABLES: exactly the thirteen BESKT tables are created (${createdTables.length} found)`,
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

// ---- hash: a typed canonical jsonb document, unambiguous by construction ----
{
  const hash = functionBody(functionText(sql, "beskt_method_content_hash") ?? "");
  const canonFn = functionText(sql, "beskt_canonical_content") ?? "";
  const canon = functionBody(canonFn);
  check(
    /encode\(sha256\(convert_to\(public\.beskt_canonical_content\(_method_version_id\)::text, 'UTF8'\)\), 'hex'\)/.test(
      hash,
    ) && !/md5\(|digest\(/.test(hash),
    "BESKT-DB-HASH: the content hash is core sha256 over the canonical jsonb text in UTF-8, never md5 or pgcrypto",
  );
  check(
    /RETURNS jsonb/.test(functionHeader(canonFn)) &&
      /'schema', 'beskt_canonical_content_v2'/.test(canon) &&
      !/string_agg\(|concat_ws\(|E'\\n'|E'\\x1f'|\|\| *'\|' *\|\|/.test(canon),
    "BESKT-DB-HASH: the canonical representation is a typed jsonb document with named fields, never a delimited string (no string_agg, concat_ws or delimiter literals)",
  );
  const aggs = [...canon.matchAll(/jsonb_agg\(jsonb_build_object\(/g)].length;
  const ordered = [
    ...canon.matchAll(/jsonb_agg\(jsonb_build_object\([\s\S]*?\)\s+ORDER BY [a-z]+\.[a-z_]+/g),
  ].length;
  check(
    aggs === 9 &&
      ordered === aggs &&
      CHILD_TABLES.every((t) => canon.includes(`public.${t}`)) &&
      [
        "'exposure_profiles'",
        "'activation_requirements'",
        "'sections'",
        "'items'",
        "'options'",
        "'prompts'",
        "'routing_rules'",
        "'evidence_anchors'",
        "'observation_fields'",
      ].every((k) => canon.includes(`${k}, coalesce((`)),
    "BESKT-DB-HASH: every governed table is a named array in the canonical document and every aggregate is explicitly ordered on stable keys",
  );
  check(
    /'prohibited_inferences', public\.beskt_sorted_array\(i\.prohibited_inferences\)/.test(canon) &&
      /'permitted_probe_bases', public\.beskt_sorted_array\(pr\.permitted_probe_bases\)/.test(
        canon,
      ) &&
      /'prohibited_inferences', public\.beskt_sorted_array\(a\.prohibited_inferences\)/.test(
        canon,
      ) &&
      /SELECT coalesce\(\(SELECT jsonb_agg\(x ORDER BY x\) FROM unnest\(_arr\) AS u\(x\)\), '\[\]'::jsonb\);/.test(
        functionBody(functionText(sql, "beskt_sorted_array") ?? ""),
      ),
    "BESKT-DB-HASH: set-valued fields are sorted JSON arrays, so element order cannot change the hash",
  );
  check(
    /'wording_sv', i\.wording_sv, 'wording_en', i\.wording_en/.test(canon) &&
      /'item_key', i\.item_key, 'section_key', s\.section_key, 'profile_key', p\.profile_key/.test(
        canon,
      ) &&
      /'condition_option_key', o\.option_key, 'condition_boolean', r\.condition_boolean/.test(
        canon,
      ),
    "BESKT-DB-HASH: every value sits under its own named key (a NULL is an explicit JSON null, an empty string stays a string)",
  );
  check(
    !/content_status|revision|published_at|created_by|validation_label|review_cycle/.test(canon),
    "BESKT-DB-HASH: lifecycle columns are excluded from the canonical representation",
  );
}

// ---- validator: evidence states, anchors, gates, activation -----------------
{
  const v = functionBody(functionText(sql, "beskt_method_validate") ?? "");
  const statesLiteral = /_evidence_states text\[\] := ARRAY\[([\s\S]*?)\];/.exec(v);
  const states = statesLiteral
    ? [...statesLiteral[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1])
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
    ? [...tableStates[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1])
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
  const gates = gatesLiteral
    ? [...gatesLiteral[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1])
    : [];
  check(
    requiredReviews.length === 5 &&
      gates.length === 5 &&
      gates.every((g, i) => g === requiredReviews[i]) &&
      /FOREACH _gate IN ARRAY _review_gates LOOP[\s\S]*?rv\.gate = _gate\s+AND rv\.decision = 'approved'\s+AND rv\.content_hash_at_review = _hash\s+AND rv\.review_cycle_at_review = _v\.review_cycle\s+AND rv\.revision_at_review = _v\.revision\)/.test(
        v,
      ) &&
      /_hash := public\.beskt_method_content_hash\(_method_version_id\);\s+FOREACH _gate/.test(v),
    "BESKT-DB-REVIEW-GATES: all five PR 1 reviews must be approved at the CURRENT content hash, review cycle AND review revision",
  );
  const tableGates = /gate text NOT NULL CHECK \(gate IN \(([\s\S]*?)\)\)/.exec(sql);
  const tableGateList = tableGates
    ? [...tableGates[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1])
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
    ? [...activationTable[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1])
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
    /WITH RECURSIVE walk AS[\s\S]*?SELECT 1 FROM walk WHERE walk\.node = walk\.origin\) THEN\s+RETURN QUERY SELECT 'ROUTE_CYCLE'::text, 'blocking'::text/.test(
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
    ? [...fieldsLiteral[1].matchAll(/'([a-z0-9_]+)'/g)].map((m) => m[1])
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

// ---- no scoring instruction in the CONTENT, either language --------------------
{
  const detector = functionBody(functionText(sql, "beskt_text_instructs_scoring") ?? "");
  check(
    /IMMUTABLE/.test(functionHeader(functionText(sql, "beskt_text_instructs_scoring") ?? "")) &&
      [
        "rate",
        "rating",
        "score",
        "grade",
        "rank",
        "suitability",
        "verdict",
        "pass/fail",
        "recommend",
        "hire",
      ].every((t) => detector.includes(t)) &&
      [
        "betyg",
        "poäng",
        "gradera",
        "rangordn",
        "lämplig",
        "godkän",
        "underkän",
        "rekommend",
        "anställ",
      ].every((t) => detector.includes(t)) &&
      /on a scale\|scale of/.test(detector) &&
      /på en skala\|skala/.test(detector),
    [
      "\\mstars?\\M",
      "classif\\w*|categoris\\w*",
      "tiers?|tiered",
      "proceed|proceeds|advance",
      "decide|decides|determine",
    ].every((t) => detector.includes(t)) &&
      [
        "\\mstjärn\\w*",
        "klassificer\\w*|kategoriser\\w*",
        "bedöm|bedömer|bedöma",
        "avgör|avgöra|avgörs",
        "(gå|föras|tas|slussas)\\s+vidare",
      ].every((t) => detector.includes(t)),
    "BESKT-DB-NO-SCORING: the detector reads scoring, rating, grading, ranking, stars, tiers, classification, suitability/verdict, pass/fail, recommendation and 'decide whether they proceed' instructions in English and Swedish. It is a best-effort content check over free text, NOT a proof that arbitrary prose is scoring-free: the structural guarantee is the closed Evaluation template above, and the five human gates carry the semantic review.",
  );
  const v = functionBody(functionText(sql, "beskt_method_validate") ?? "");
  check(
    /SELECT 'ITEM_INSTRUCTS_SCORING', 'blocking',[\s\S]{0,400}?public\.beskt_text_instructs_scoring\(i\.wording_sv\) OR public\.beskt_text_instructs_scoring\(i\.wording_en\)\s+OR public\.beskt_text_instructs_scoring\(i\.purpose_sv\) OR public\.beskt_text_instructs_scoring\(i\.purpose_en\)/.test(
      v,
    ) &&
      /SELECT 'PROMPT_INSTRUCTS_SCORING', 'blocking',[\s\S]{0,400}?public\.beskt_text_instructs_scoring\(pr\.wording_sv\) OR public\.beskt_text_instructs_scoring\(pr\.wording_en\)/.test(
        v,
      ) &&
      /SELECT 'ANCHOR_INSTRUCTS_SCORING', 'blocking',[\s\S]{0,1200}?beskt_text_instructs_scoring\(a\.definition_sv\)[\s\S]*?beskt_text_instructs_scoring\(a\.counter_evidence_and_protective_factors_en\)/.test(
        v,
      ),
    "BESKT-DB-NO-SCORING: the validator blocks publication on a scoring instruction in any item, prompt or anchor VALUE, not only on a forbidden key",
  );
}

// ---- PEACE: Evaluation is an interviewer-oriented governed step ---------------
{
  check(
    /peace_stage text NOT NULL CHECK \(peace_stage IN \(\s*'planning', 'engage_explain', 'account', 'closure', 'evaluation'\)\)/.test(
      sql,
    ) &&
      /CONSTRAINT beskt_prompts_interviewer_stages_check\s+CHECK \(\(peace_stage IN \('planning', 'evaluation'\)\) = \(addressee = 'interviewer'\)\)/.test(
        sql,
      ) &&
      /WHEN 'interviewer_self_review'\s+THEN 'evaluation'/.test(
        functionBody(functionText(sql, "beskt_prompt_stage") ?? ""),
      ) &&
      /'closure_next_step', 'interviewer_self_review'\];/.test(
        functionBody(functionText(sql, "beskt_method_validate") ?? ""),
      ),
    "BESKT-DB-PEACE-EVALUATION: Evaluation is a fixed PEACE stage addressed to the interviewer only, bound to interviewer_self_review, and required by the validator",
  );
  check(
    !tableColumns(sql, "beskt_prompts").some((c) => FORBIDDEN_COLUMN.test(c)) &&
      !/'evaluation'[^;]*?(score|verdict|rating|grade)/i.test(
        functionBody(functionText(sql, "beskt_published_method") ?? ""),
      ),
    "BESKT-DB-PEACE-EVALUATION: the evaluation step carries no candidate score, verdict, rating or grade",
  );
  const tpl = functionBody(functionText(sql, "beskt_evaluation_template") ?? "");
  const g2 = functionBody(functionText(sql, "beskt_guard_child_row") ?? "");
  check(
    /IMMUTABLE/.test(functionHeader(functionText(sql, "beskt_evaluation_template") ?? "")) &&
      ["method_adherence", "basis_gaps", "next_step_planning"].every((k) =>
        tpl.includes(`'${k}'`),
      ) &&
      /ELSE NULL END/.test(tpl) &&
      /evaluation_template_key text\s+CHECK \(evaluation_template_key IN \(\s*'method_adherence', 'basis_gaps', 'next_step_planning'\)\)/.test(
        sql,
      ) &&
      /CONSTRAINT beskt_prompts_evaluation_template_check\s+CHECK \(\(peace_stage = 'evaluation'\) = \(evaluation_template_key IS NOT NULL\)\)/.test(
        sql,
      ),
    "BESKT-DB-PEACE-EVALUATION: Evaluation names one of a CLOSED set of governed templates; the vocabulary is a CHECK and an unknown key has no text",
  );
  check(
    /IF NEW\.peace_stage = 'evaluation' THEN[\s\S]*?NEW\.wording_sv IS DISTINCT FROM public\.beskt_evaluation_template\(NEW\.evaluation_template_key, 'sv'\)\s+OR NEW\.wording_en IS DISTINCT FROM public\.beskt_evaluation_template\(NEW\.evaluation_template_key, 'en'\) THEN\s+RAISE EXCEPTION\s+'BESKT_EVALUATION_NOT_TEMPLATED/.test(
      g2,
    ) &&
      /IF NEW\.item_id IS NOT NULL OR coalesce\(cardinality\(NEW\.permitted_probe_bases\), 0\) <> 0 THEN\s+RAISE EXCEPTION\s+'BESKT_EVALUATION_NOT_TEMPLATED/.test(
        g2,
      ) &&
      /SELECT 'PROMPT_EVALUATION_NOT_TEMPLATED', 'blocking',/.test(
        functionBody(functionText(sql, "beskt_method_validate") ?? ""),
      ),
    "BESKT-DB-PEACE-EVALUATION: an Evaluation prompt's wording IS the governed template in both languages, it probes no item and grounds nothing — authored text, candidate questioning, a rating or a verdict is not representable there, and the validator re-proves it on the stored rows",
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
      /ORDER BY s\.display_order, i\.display_order, i\.item_key/.test(r),
    "BESKT-DB-OMISSION-NEUTRAL: the resolver fires a rule only on an explicit option or boolean answer and orders on stable keys",
  );
  check(
    /IF NOT \(_r\.source_item_id = ANY \(_shown\)\) THEN\s+CONTINUE;\s+END IF;/.test(r),
    "BESKT-DB-ROUTING: a rule fires only while its source item is currently shown; an answer for a hidden or skipped source is ignored",
  );
  // Order independence is structural: visibility is decided one item at a
  // time in the GOVERNED order, every rule targeting that item is read, a
  // firing skip beats a firing show, and nothing reads evaluation_order.
  check(
    !/r\.evaluation_order/.test(r) &&
      /FOR _it IN\s+SELECT i\.id[\s\S]*?ORDER BY s\.display_order, i\.display_order, i\.item_key\s+LOOP/.test(
        r,
      ) &&
      /AND r\.target_item_id = _it\.id/.test(r) &&
      /IF \(NOT _has_show OR _fired_show\) AND NOT _fired_skip THEN\s+_shown := _shown \|\| _it\.id;/.test(
        r,
      ) &&
      /RAISE EXCEPTION\s+'BESKT_ROUTE_NOT_ORDERED/.test(r),
    "BESKT-DB-ROUTING-ORDER: the resolver computes visibility in the governed order and never reads evaluation_order, and refuses a graph that is not forward-only instead of resolving it from one arbitrary pass",
  );
  const cg = functionBody(functionText(sql, "beskt_guard_child_row") ?? "");
  check(
    /IF \(_tgt\.section_order, _tgt\.display_order, _tgt\.item_key\)\s+<= \(_src\.section_order, _src\.display_order, _src\.item_key\) THEN\s+RAISE EXCEPTION 'BESKT_ROUTE_BACKWARD/.test(
      cg,
    ) &&
      /SELECT 'ROUTE_TARGET_BEFORE_SOURCE', 'blocking',[\s\S]{0,600}?AND \(ts\.display_order, ti\.display_order, ti\.item_key\) <= \(ss\.display_order, si\.display_order, si\.item_key\)/.test(
        functionBody(functionText(sql, "beskt_method_validate") ?? ""),
      ),
    "BESKT-DB-ROUTING: a target must come after its source in the governed order — refused at write time and re-proved by the validator on the stored graph",
  );
  check(
    /\(i\.permitted_mode = 'recruitment_support' OR _mode = 'security_vetting_support'\)/.test(r) &&
      /IF NOT public\.beskt_can_read_version\(_method_version_id\) THEN/.test(r),
    "BESKT-DB-MODE-ESCALATION: the resolver never surfaces security-vetting items in recruitment mode and authorises its caller",
  );
}

// ---- the shared identity table: no direct-DML bypass ----------------------------
{
  check(
    /CREATE POLICY scp_interview_packs_editor_insert ON public\.scp_interview_packs\s+FOR INSERT TO authenticated\s+WITH CHECK \(public\.scp_interview_can_edit\(auth\.uid\(\)\) AND pack_kind = 'role_interview'\);/.test(
      sql,
    ) &&
      /CREATE POLICY scp_interview_packs_editor_update ON public\.scp_interview_packs\s+FOR UPDATE TO authenticated\s+USING \(public\.scp_interview_can_edit\(auth\.uid\(\)\) AND pack_kind = 'role_interview'\)\s+WITH CHECK \(public\.scp_interview_can_edit\(auth\.uid\(\)\) AND pack_kind = 'role_interview'\);/.test(
        sql,
      ),
    "BESKT-DB-PACK-DML: the editor INSERT and UPDATE policies on scp_interview_packs are scoped to role_interview in USING and WITH CHECK",
  );
  const kind = functionBody(functionText(sql, "beskt_guard_pack_kind_immutable") ?? "");
  check(
    /IF OLD\.pack_kind = 'beskt_method'\s+AND coalesce\(current_setting\('beskt\.governed_transition', true\), ''\) <> 'on'\s+AND \(to_jsonb\(NEW\) - 'created_at'\) IS DISTINCT FROM \(to_jsonb\(OLD\) - 'created_at'\) THEN\s+RAISE EXCEPTION\s+'BESKT_IDENTITY_IMMUTABLE/.test(
      kind,
    ),
    "BESKT-DB-PACK-DML: a BESKT method identity is immutable outside the governed contract, for every caller",
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
    /IF _item_profile IS DISTINCT FROM NEW\.exposure_profile_id THEN\s+RAISE EXCEPTION 'BESKT_CROSS_PROFILE_REFERENCE/.test(
      g,
    ) &&
      /IF _src\.exposure_profile_id IS DISTINCT FROM _tgt\.exposure_profile_id THEN\s+RAISE EXCEPTION 'BESKT_CROSS_PROFILE_REFERENCE/.test(
        g,
      ) &&
      /SELECT i\.method_version_id, i\.exposure_profile_id INTO _other, _item_profile\s+FROM public\.beskt_items i WHERE i\.id = NEW\.item_id;/.test(
        g,
      ),
    "BESKT-DB-CROSS-PROFILE: the child guard refuses a prompt probing another profile's item and a routing rule connecting two profiles",
  );
  const v = functionBody(functionText(sql, "beskt_method_validate") ?? "");
  check(
    /SELECT 'PROMPT_CROSS_PROFILE', 'blocking',[\s\S]{0,400}?i\.exposure_profile_id <> pr\.exposure_profile_id/.test(
      v,
    ) &&
      /SELECT 'ROUTE_CROSS_PROFILE', 'blocking',[\s\S]{0,400}?si\.exposure_profile_id <> ti\.exposure_profile_id/.test(
        v,
      ),
    "BESKT-DB-CROSS-PROFILE: the validator re-proves on the stored graph that no prompt and no rule crosses an exposure profile",
  );
  const r = functionBody(functionText(sql, "beskt_resolve_item_sequence") ?? "");
  check(
    /IF _r\.source_profile <> _exposure_profile_id THEN\s+CONTINUE;\s+END IF;/.test(r) &&
      /AND i\.exposure_profile_id = _exposure_profile_id/.test(r) &&
      !/target_profile/.test(r),
    "BESKT-DB-CROSS-PROFILE: the resolver considers only this profile's items and only this profile's rules, so a cross-profile rule neither fires nor hides anything",
  );
  check(
    /IF TG_OP = 'UPDATE' THEN _old_version_id := OLD\.method_version_id; END IF;/.test(g) &&
      /SELECT i\.method_version_id INTO _old_version_id FROM public\.beskt_items i WHERE i\.id = OLD\.item_id;/.test(
        g,
      ) &&
      /IF TG_OP = 'UPDATE' AND _old_version_id IS DISTINCT FROM _version_id THEN\s+SELECT v\.content_status INTO _status FROM public\.beskt_method_versions v WHERE v\.id = _old_version_id;\s+IF _status IS NULL OR _status NOT IN \('draft', 'in_review'\) THEN\s+RAISE EXCEPTION\s+'BESKT_PUBLISHED_IMMUTABLE/.test(
        g,
      ),
    "BESKT-DB-REPARENT: on UPDATE the child guard resolves the OLD owner as well as the NEW one and refuses to move a child away from a frozen version",
  );
  const lockAt = g.indexOf(
    "PERFORM 1 FROM public.beskt_method_versions v WHERE v.id = _lock_id FOR SHARE;",
  );
  const statusAt = g.indexOf(
    "SELECT v.content_status INTO _status FROM public.beskt_method_versions v WHERE v.id = _version_id;",
  );
  check(
    lockAt > 0 &&
      statusAt > lockAt &&
      /SELECT x FROM unnest\(ARRAY\[_version_id, _old_version_id\]\) AS u\(x\) WHERE x IS NOT NULL ORDER BY x/.test(
        g,
      ) &&
      /FOR UPDATE;/.test(functionBody(functionText(sql, "beskt_lock_version") ?? "")),
    "BESKT-DB-CHILD-LOCK: the child guard locks the owning version row(s), in id order, with a lock that conflicts with publication's FOR UPDATE, BEFORE it reads the status",
  );
  for (const t of CHILD_TABLES) {
    const keys = PARENT_KEYS[t] ?? [];
    const ok = keys.every((k) => {
      if (k === "method_version_id") {
        return /ELSIF NEW\.method_version_id IS DISTINCT FROM OLD\.method_version_id THEN\s+RAISE EXCEPTION 'BESKT_PARENT_IMMUTABLE/.test(
          g,
        );
      }
      const re = new RegExp(
        `IF TG_TABLE_NAME = '${t}' THEN[\\s\\S]{0,400}?NEW\\.${k} IS DISTINCT FROM OLD\\.${k}[\\s\\S]{0,300}?RAISE EXCEPTION 'BESKT_PARENT_IMMUTABLE`,
      );
      return re.test(g);
    });
    check(
      ok,
      `BESKT-DB-REPARENT: ${t} keeps ${keys.join(", ")} immutable on UPDATE (BESKT_PARENT_IMMUTABLE)`,
    );
  }
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
      /IF NEW\.content_hash_at_review IS DISTINCT FROM _v\.content_hash\s+OR NEW\.revision_at_review IS DISTINCT FROM _v\.revision\s+OR NEW\.review_cycle_at_review IS DISTINCT FROM _v\.review_cycle THEN/.test(
        rv,
      ) &&
      /IF _v\.created_by IS NOT NULL AND _v\.created_by = auth\.uid\(\) THEN\s+RAISE EXCEPTION 'BESKT_PUBLISHER_IS_AUTHOR/.test(
        functionBody(functionText(sql, "beskt_publish_version") ?? ""),
      ),
    "BESKT-DB-REVIEW-GATES: separation of duties — no self-review, one gate per reviewer per hash, hash- and cycle-bound reviews, author never publishes",
  );
  check(
    /IF NOT public\.beskt_holds_grant\(NEW\.reviewer_id, NEW\.gate\) THEN\s+RAISE EXCEPTION\s+'BESKT_GATE_NOT_GRANTED/.test(
      rv,
    ) &&
      /IF NOT public\.beskt_holds_grant\(auth\.uid\(\), _gate\) THEN\s+RAISE EXCEPTION 'BESKT_GATE_NOT_GRANTED/.test(
        functionBody(functionText(sql, "beskt_record_review") ?? ""),
      ),
    "BESKT-DB-GATE-GRANTS: a review gate is recorded only by a holder of an active grant for exactly that gate, checked in the RPC and again in the row trigger",
  );
  const holds = functionBody(functionText(sql, "beskt_holds_grant") ?? "");
  check(
    /g\.user_id = _user_id\s+AND g\.grant_kind = _grant_kind\s+AND g\.revoked_at IS NULL\s+AND g\.valid_from <= now\(\)\s+AND \(g\.valid_until IS NULL OR g\.valid_until > now\(\)\)/.test(
      holds,
    ),
    "BESKT-DB-GATE-GRANTS: a grant counts only for its exact kind, unrevoked, inside its validity window",
  );
  const grantsDdl = sql.slice(
    sql.indexOf("CREATE TABLE public.beskt_governance_grants ("),
    sql.indexOf(");", sql.indexOf("CREATE TABLE public.beskt_governance_grants (")),
  );
  check(
    /grant_kind text NOT NULL CHECK \(grant_kind IN \(\s*'personnel_security', 'senior_hr', 'recruitment',\s*'employment_privacy_legal', 'data_protection',\s*'internal_qa'\)\)/.test(
      grantsDdl,
    ) &&
      /granted_by uuid REFERENCES auth\.users\(id\)/.test(grantsDdl) &&
      /valid_from timestamptz NOT NULL DEFAULT now\(\)/.test(grantsDdl) &&
      /source_reference text NOT NULL CHECK \(length\(btrim\(source_reference\)\) > 0\)/.test(
        grantsDdl,
      ) &&
      /revoked_at timestamptz,\s+revoked_by uuid REFERENCES auth\.users\(id\)/.test(grantsDdl) &&
      /CHECK \(valid_until IS NULL OR valid_until > valid_from\)/.test(grantsDdl),
    "BESKT-DB-GATE-GRANTS: the mapping records exact gate, grantor, provenance, validity and revocation, server-side",
  );
  const ga = functionBody(functionText(sql, "beskt_guard_grants_append_only") ?? "");
  check(
    /CREATE TRIGGER beskt_governance_grants_append_only\s+BEFORE INSERT OR UPDATE OR DELETE ON public\.beskt_governance_grants/.test(
      sql,
    ) &&
      /IF TG_OP = 'DELETE' THEN\s+RAISE EXCEPTION 'BESKT_GRANT_APPEND_ONLY/.test(ga) &&
      /IF OLD\.revoked_at IS NOT NULL\s+OR NEW\.revoked_at IS NULL\s+OR \(to_jsonb\(NEW\) - 'revoked_at' - 'revoked_by' - 'revoke_reason' - 'revoke_operation_id'\)\s+IS DISTINCT FROM \(to_jsonb\(OLD\) - 'revoked_at' - 'revoked_by' - 'revoke_reason' - 'revoke_operation_id'\) THEN\s+RAISE EXCEPTION 'BESKT_GRANT_APPEND_ONLY/.test(
        ga,
      ),
    "BESKT-DB-GATE-GRANTS: a grant is never deleted or rewritten; the only permitted change is one revocation",
  );
  check(
    /_governed boolean := coalesce\(current_setting\('beskt\.governance_grant_write', true\), ''\) = 'on';/.test(
      ga,
    ) &&
      /IF TG_OP = 'INSERT' AND NOT _governed THEN\s+RAISE EXCEPTION 'BESKT_GRANT_UNGOVERNED_WRITE/.test(
        ga,
      ) &&
      /IF NOT _governed THEN\s+RAISE EXCEPTION 'BESKT_GRANT_UNGOVERNED_WRITE: a governance grant is revoked only/.test(
        ga,
      ),
    "BESKT-DB-GATE-GRANTS: a direct INSERT and a direct revocation UPDATE on the mapping are refused unless the governed marker is set",
  );
  // The AUTHORITY is the privilege, not the marker: a caller that can set a
  // custom GUC must still have no way to write the row.
  for (const t of ["beskt_governance_grants", "beskt_method_reviews"] as const) {
    check(
      new RegExp(`GRANT SELECT ON public\\.${t}\\s+TO service_role;`).test(sql) &&
        !new RegExp(`GRANT ALL ON public\\.${t}\\s+TO service_role;`).test(sql) &&
        !new RegExp(
          `GRANT [^;]*\\b(INSERT|UPDATE|DELETE|ALL)\\b[^;]*ON public\\.${t}[^;]*TO [^;]*\\b(anon|authenticated|service_role)\\b`,
        ).test(sql),
      `BESKT-DB-RPC-AUTHORITY: ${t} is SELECT-only for every client role, service_role included — the write privilege belongs to the SECURITY DEFINER RPC owner, so a caller-settable GUC grants nothing`,
    );
  }
  const reviewRpc = functionBody(functionText(sql, "beskt_record_review") ?? "");
  check(
    /PERFORM set_config\('beskt\.review_write', 'on', true\);\s+INSERT INTO public\.beskt_method_reviews[\s\S]*?RETURNING id INTO _review_id;\s+PERFORM set_config\('beskt\.review_write', 'off', true\);/.test(
      reviewRpc,
    ) &&
      [...sql.matchAll(/set_config\('beskt\.review_write', 'on', true\)/g)].length === 1 &&
      /IF NOT _governed THEN\s+RAISE EXCEPTION\s+'BESKT_REVIEW_UNGOVERNED_WRITE/.test(rv) &&
      /IF _governed AND NEW\.reviewer_id IS DISTINCT FROM auth\.uid\(\) THEN\s+RAISE EXCEPTION\s+'BESKT_REVIEW_NOT_OWN/.test(
        rv,
      ),
    "BESKT-DB-RPC-AUTHORITY: a review row exists only when beskt_record_review wrote it for the signed-in reviewer, so no decision can exist without its lifecycle transition",
  );
  const grantRpc = functionBody(functionText(sql, "beskt_grant_governance") ?? "");
  const revokeRpc = functionBody(functionText(sql, "beskt_revoke_governance") ?? "");
  check(
    /PERFORM set_config\('beskt\.governance_grant_write', 'on', true\);\s+INSERT INTO public\.beskt_governance_grants[\s\S]*?RETURNING id INTO _id;\s+PERFORM set_config\('beskt\.governance_grant_write', 'off', true\);/.test(
      grantRpc,
    ) &&
      /PERFORM set_config\('beskt\.governance_grant_write', 'on', true\);\s+UPDATE public\.beskt_governance_grants[\s\S]*?WHERE id = _grant_id;\s+PERFORM set_config\('beskt\.governance_grant_write', 'off', true\);/.test(
        revokeRpc,
      ) &&
      [...sql.matchAll(/set_config\('beskt\.governance_grant_write', 'on', true\)/g)].length === 2,
    "BESKT-DB-GATE-GRANTS: only the two governed RPCs set the marker, narrowly around their one write, and clear it again",
  );
  for (const m of ADMIN_MUTATIONS) {
    const body = functionBody(functionText(sql, m) ?? "");
    check(
      /IF auth\.uid\(\) IS NULL THEN\s+RAISE EXCEPTION 'BESKT_NOT_AUTHENTICATED/.test(body) &&
        /IF NOT public\.is_platform_admin\(auth\.uid\(\)\) THEN\s+RAISE EXCEPTION 'BESKT_NOT_PLATFORM_ADMIN/.test(
          body,
        ) &&
        /pg_advisory_xact_lock\(hashtextextended\('beskt_operation:' \|\| _operation_id::text, 0\)\)/.test(
          body,
        ) &&
        /BESKT_OPERATION_ACTOR_MISMATCH/.test(body) &&
        /BESKT_OPERATION_PAYLOAD_MISMATCH/.test(body),
      `BESKT-DB-GATE-GRANTS: ${m} is a platform-admin-only, idempotent governed mutation`,
    );
  }
  check(
    /IF NEW\.grant_kind <> OLD\.grant_kind/.test(ga) === false &&
      !/GRANT (INSERT|UPDATE|DELETE|ALL) ON public\.beskt_governance_grants TO authenticated/.test(
        sql,
      ),
    "BESKT-DB-GATE-GRANTS: no client role holds a write privilege on the mapping",
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
  const create = functionBody(functionText(sql, "beskt_create_method_version") ?? "");
  const methodLockAt = create.indexOf(
    "PERFORM pg_advisory_xact_lock(hashtextextended('beskt_method:' || _pack_id::text, 0));",
  );
  const openCheckAt = create.indexOf(
    "WHERE v.pack_id = _pack_id AND v.content_status IN ('draft', 'in_review')) THEN",
  );
  check(
    methodLockAt > 0 && openCheckAt > methodLockAt && /BESKT_OPEN_VERSION_EXISTS/.test(create),
    "BESKT-DB-ONE-OPEN-VERSION: the per-method advisory lock is taken BEFORE the open-version check, so two concurrent creates serialise",
  );
  check(
    /CREATE UNIQUE INDEX beskt_method_versions_one_open_idx\s+ON public\.beskt_method_versions \(pack_id, open_slot\);/.test(
      sql,
    ) &&
      /open_slot text GENERATED ALWAYS AS \(\s+CASE WHEN content_status IN \('draft', 'in_review'\) THEN 'open' END\) STORED,/.test(
        sql,
      ) &&
      !/UNIQUE INDEX [a-z_]+\s+ON public\.beskt_method_versions \(pack_id\)/.test(sql) &&
      /'review_cycle', 'open_slot', 'updated_at'/.test(
        functionBody(functionText(sql, "beskt_guard_version_transition") ?? ""),
      ),
    "BESKT-DB-ONE-OPEN-VERSION: the invariant is a unique index on (pack_id, generated open_slot), never on pack_id alone, so PostgREST cannot infer a one-to-one relation",
  );
  const submit = functionBody(functionText(sql, "beskt_submit_for_review") ?? "");
  check(
    /review_cycle = _v\.review_cycle \+ 1/.test(submit) &&
      /review_cycle integer NOT NULL DEFAULT 0 CHECK \(review_cycle >= 0\)/.test(sql) &&
      /review_cycle_at_review integer NOT NULL/.test(sql) &&
      /revision_at_review, review_cycle_at_review\)\s+VALUES \(_method_version_id, _gate, _decision, auth\.uid\(\), btrim\(_rationale\), _hash, _v\.revision, _v\.review_cycle\)/.test(
        functionBody(functionText(sql, "beskt_record_review") ?? ""),
      ) &&
      /IF _decision = 'rejected' THEN\s+_new_status := 'draft';/.test(
        functionBody(functionText(sql, "beskt_record_review") ?? ""),
      ),
    "BESKT-DB-REVIEW-CYCLE: every submission opens a new review cycle, every review records the cycle it belongs to, and a rejection ends the cycle",
  );
  check(
    /rv\.revision_at_review = _v\.revision/.test(
      functionBody(functionText(sql, "beskt_method_validate") ?? ""),
    ) &&
      !/revision = _v\.revision \+ 1/.test(
        functionBody(functionText(sql, "beskt_record_review") ?? "").split(
          "IF _decision = 'rejected'",
        )[0],
      ) &&
      /SET content_status = 'draft', revision = _new_revision/.test(
        functionBody(functionText(sql, "beskt_record_review") ?? ""),
      ) &&
      /revision = _v\.revision \+ 1/.test(
        functionBody(functionText(sql, "beskt_touch_draft") ?? ""),
      ),
    "BESKT-DB-REVIEW-CYCLE: review revision semantics — an approval leaves the revision alone, so the five gates can be collected in parallel, while any governed touch advances it and invalidates every approval",
  );
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
      /public\.beskt_holds_grant\(auth\.uid\(\), 'internal_qa'\)/.test(can) &&
      /scp_interview_can_read\(auth\.uid\(\)\)/.test(can) &&
      !/employer_memberships|employer_is_active_status|employer_id|candidate/.test(can),
    "BESKT-DB-READ-CONTRACT: synthetic_internal_only — governance readers and explicit internal-QA grantees only; no employer, candidate or roleless branch exists",
  );
  check(
    /NOT EXISTS \(\s+SELECT 1 FROM public\.beskt_exposure_profiles p\s+WHERE p\.method_version_id = _method_version_id\s+AND NOT \(p\.access_class = ANY \(public\.beskt_reader_access_classes\(auth\.uid\(\)\)\)\)\)/.test(
      can,
    ) &&
      /NOT EXISTS \(\s+SELECT 1 FROM public\.beskt_items i\s+WHERE i\.method_version_id = _method_version_id\s+AND NOT \(i\.access_class = ANY \(public\.beskt_reader_access_classes\(auth\.uid\(\)\)\)\)\)/.test(
        can,
      ),
    "BESKT-DB-READ-CONTRACT: access_class is enforced on every profile and item of the document, so a document is never returned in part",
  );
  const classes = functionBody(functionText(sql, "beskt_reader_access_classes") ?? "");
  check(
    /WHEN public\.beskt_holds_grant\(_user_id, 'internal_qa'\) THEN\s+ARRAY\['recruiter', 'beskt_interviewer', 'independent_assessor', 'accountable_process_owner'\]/.test(
      classes,
    ) && /ELSE '\{\}'::text\[\]/.test(classes),
    "BESKT-DB-READ-CONTRACT: internal QA never holds the authorised_security_function class; everyone else holds no class",
  );
  // Prose, deliberately read from `raw`: the normalised `sql` above strips
  // comments, and a stale comment is exactly what this check is for.
  // Prose, deliberately read from `raw`: the normalised `sql` strips
  // comments, and a stale comment is exactly what this check is for. No
  // POSITIVE claim that an employer principal, a candidate or a roleless
  // user reads PR 2 BESKT content may survive anywhere in the migration.
  const employerClaim =
    /(employer|candidate|roleless)[^.]{0,120}(reach|reaches|read|reads|receive|receives)[^.]{0,120}(content|method|document)/i;
  // Comment PROSE, rejoined across line breaks: a claim split over two lines
  // is still a claim.
  const claimLines = raw
    .split("\n")
    .map((line, i) => ({ text: /^\s*--(.*)$/.exec(line)?.[1] ?? "", n: i + 1 }))
    .map(({ text, n }, i, all) => ({
      // each comment line plus the two that follow it, as one sentence window
      window: [text, all[i + 1]?.text ?? "", all[i + 2]?.text ?? ""].join(" "),
      n,
    }))
    .filter(({ window }) => employerClaim.test(window))
    .filter(({ window }) => !/\b(no|never|not|nothing|only|refus|denied|cannot)\b/i.test(window));
  check(
    claimLines.length === 0 &&
      !/for an employer principal\. A listing/.test(raw) &&
      !/security-vetting content is refused to employer/.test(raw) &&
      !/Employer\n-- principals reach published recruitment-support content through the read\n-- RPC only/.test(
        raw,
      ) &&
      /release_scope is synthetic_internal_only, so\n--\s+only governance readers and explicit internal-QA grantees read/.test(
        raw,
      ) &&
      /Under\n-- release_scope = synthetic_internal_only NO employer principal, candidate\n-- or roleless user reads BESKT content at all/.test(
        raw,
      ),
    `BESKT-DB-READ-CONTRACT: no comment claims an employer principal, candidate or roleless user reaches PR 2 BESKT content (${claimLines.map((c) => c.n).join(", ")})`,
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
  const TYPES = join(ROOT, "src/integrations/supabase/types.ts");
  const ROLE_PACKS = join(ROOT, "src/lib/interview-intelligence/role-packs.functions.ts");
  const srcFiles = walk(join(ROOT, "src")).filter((f) => /\.(ts|tsx)$/.test(f) && f !== TYPES);
  const offenders = srcFiles.filter((f) => /\bbeskt_/i.test(read(f)));
  check(
    offenders.length === 0,
    `BESKT-DB-NO-APP-CODE: no application file calls the BESKT schema; only the generated types describe it (${offenders.length} offender(s))`,
  );
  const types = read(TYPES);
  check(
    TABLES.every((t) => types.includes(`      ${t}: {`)) &&
      /scp_interview_packs: \{\s+Row: \{[\s\S]*?pack_kind: string[\s\S]*?role_id: string \| null/.test(
        types,
      ) &&
      [
        "beskt_create_method",
        "beskt_publish_version",
        "beskt_published_method",
        "beskt_readable_published_versions",
        "beskt_grant_governance",
        "beskt_revoke_governance",
      ].every((f) => types.includes(`      ${f}: {`)),
    "BESKT-DB-TYPES: the generated Supabase types carry pack_kind, the nullable role_id, every BESKT table and the BESKT RPCs",
  );
  check(
    /foreignKeyName: "beskt_method_versions_pack_id_fkey"\s+columns: \["pack_id"\]\s+isOneToOne: false/.test(
      types,
    ) &&
      /beskt_method_versions: \{\s+Row: \{[\s\S]*?open_slot: string \| null[\s\S]*?\}\s+Insert: \{(?:(?!open_slot)[\s\S])*?\}\s+Update: \{(?:(?!open_slot)[\s\S])*?\}/.test(
        types,
      ) &&
      /evaluation_template_key: string \| null/.test(types) &&
      types.includes("      beskt_evaluation_template: {"),
    "BESKT-DB-TYPES: a method has many versions (isOneToOne: false) and the generated open_slot is read-only in the types",
  );
  const rolePacks = read(ROLE_PACKS);
  check(
    /\.from\("scp_interview_packs"\)\s+\.select\("id, slug, name_sv, name_en, purpose_sv, created_at"\)\s+\.not\("role_id", "is", null\)/.test(
      rolePacks,
    ),
    "BESKT-DB-PACK-DML: listRolePacks() lists role-interview packs only (a BESKT method carries no canonical role)",
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
      (entry.introduces?.length ?? 0) >= 13 &&
      ["beskt_text_instructs_scoring", "beskt_evaluation_template"].every((fn) =>
        (entry.introduces ?? []).some((i) => (i as { object?: string }).object === fn),
      ),
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
    [
      "GROUP B0",
      "GROUP B0b",
      "GROUP B1",
      "GROUP B2",
      "GROUP B3",
      "GROUP B4",
      "GROUP B5",
      "GROUP B6",
    ].every((g) => suite.includes(g)) &&
      [
        "B0b.2",
        "B0b.11",
        "B1.7",
        "B1.20",
        "B1.32",
        "B2.24",
        "B2.25",
        "B2.40",
        "B2.48",
        "B2.49c",
        "B2.49d",
        "B2.49f",
        "B2.51",
        "B2.56",
        "B3.3c",
        "B3.5b",
        "B3.5d",
        "B3.17",
        "B3.17b",
        "B3.21",
        "B3.27",
        "B3.30c",
        "B3.30f",
        "B3.50c",
        "B3.50d",
        "B3.50m",
        "B3.52b",
        "B3.54c",
        "B3.55b",
        "B3.62",
        "B4.3",
        "B4.7",
        "B5.1",
        "B5.18b",
        "B5.30",
        "B5.36",
        "B5.40",
        "B6.4",
        "B6.7",
        "B6.10",
        "B6.9c",
        "B6.9d",
        "B6.13",
        "B6.15",
        "B6.35",
        "B2.50b",
        "B2.52a",
        "B2.52c",
        "B2.52e",
        "B2.52g",
        "B2.52k",
        "B2.52l",
        "B5.18d",
        "B5.18f",
        "B5.30b",
        "B6.9c",
        "B6.9d3",
        "B6.15b",
        "B6.17b",
        "B6.17c",
        "B2.52f2",
        "B2.52f3",
        "B2.52f4",
        "B2.52f5",
        "B2.52p",
        "B2.52r",
        "B2.52u",
        "B2.52y",
        "B2.52za",
        "B3.29b",
        "B3.29c",
        "B3.29d",
      ].every((l) => suite.includes(l)) &&
      suite.includes("\\ir beskt_governed_content_fixture.sql") &&
      existsSync(FIXTURE) &&
      /CREATE OR REPLACE FUNCTION pg_temp\.build_method\(/.test(read(FIXTURE)) &&
      !/\\echo[^\n]*ok {2}/.test(suite) &&
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
      Number(floor[1]) >= 430,
    "BESKT-DB-SUITE: db-test.sh runs the suite with a floor, applies the rollback file for real, reads its proof and re-applies the migration",
  );
  const raceAt = db.indexOf('echo "==> Running BESKT one-open-version race"');
  check(
    raceAt > suiteAt &&
      raceAt < rollbackAt &&
      /psql -tAq -d "\$TEST_DB" -f "\$BGR_A" > \/tmp\/bgr_a\.out 2>&1 &/.test(db) &&
      /SELECT pg_sleep\(3\);\s*COMMIT;\s*SQL\s+cat > "\$BGR_B"/.test(db) &&
      db.includes('grep -q "BESKT_OPEN_VERSION_EXISTS" /tmp/bgr_b.out') &&
      /if \[ "\$BGR_B_MS" -lt 1500 \]; then/.test(db) &&
      db.includes('if [ "$BGR_COUNT" != "1" ]; then'),
    "BESKT-DB-ONE-OPEN-VERSION: db-test.sh races two real sessions on one method and requires the second to wait, be refused, and leave exactly one version",
  );
  const pubRaceAt = db.indexOf('echo "==> Running BESKT child-write versus publication race"');
  check(
    pubRaceAt > raceAt &&
      pubRaceAt < rollbackAt &&
      db.includes("\\i supabase/tests/beskt_governed_content_fixture.sql") &&
      db.includes('grep -q "BESKT_CONTENT_HASH_STALE" /tmp/bgp_b.out') &&
      db.includes('grep -q "BESKT_PUBLISHED_IMMUTABLE" /tmp/bgp_b.out') &&
      /if \[ "\$BGP_B_MS" -lt 1500 \]; then # \(A\) publication waited/.test(db) &&
      /if \[ "\$BGP_B_MS" -lt 1500 \]; then # \(B\) the child waited/.test(db) &&
      db.includes('if [ "$BGP_STATUS" != "in_review ${BGP_HASH} false" ]; then') &&
      db.includes(
        'if [ "$BGP_STATUS" != "published ${BGP_HASH} true" ] || [ "$BGP_LATE" != "0" ]; then',
      ),
    "BESKT-DB-CHILD-LOCK: db-test.sh races an uncommitted child edit against publication both ways and requires the loser to wait and be refused, with the published bytes always at the approved hash",
  );
  const depAt = db.indexOf('echo "==> Running BESKT rollback planted-dependency refusal"');
  check(
    depAt > pubRaceAt &&
      depAt < rollbackAt &&
      db.includes(
        "CREATE VIEW public.probe_beskt_dependency_view AS SELECT id, content_status FROM public.beskt_method_versions;",
      ) &&
      db.includes("RETURNS SETOF public.beskt_method_versions") &&
      db.includes(
        'BGD_EXPECT="BESKT_ROLLBACK BLOCKED: catalogue objects outside the domain depend on it"',
      ) &&
      db.includes(
        'BGD_EXPECT="BESKT_ROLLBACK BLOCKED: objects outside the domain depend on a BESKT row type"',
      ) &&
      /BGD_OUT="\$\(psql -1 -v ON_ERROR_STOP=1 -d "\$TEST_DB" \\\s+-f supabase\/rollback\/20261108090000_beskt_governed_method_content_rollback\.sql 2>&1\)"/.test(
        db,
      ) &&
      db.includes('if [ "$BGD_AFTER" != "$BGD_BEFORE" ] || [ "$BGD_SHAPE_OK" -ne 1 ]; then') &&
      /BG_RB="\$\(psql -1 -v ON_ERROR_STOP=1 -d "\$TEST_DB" \\\s+-f supabase\/rollback\/20261108090000_beskt_governed_method_content_rollback\.sql 2>&1\)"/.test(
        db,
      ),
    "BESKT-DB-ROLLBACK: db-test.sh plants an outside view and a row-type function dependency, runs the rollback in one transaction, and requires refusal with nothing dropped; the real rollback runs in one transaction too",
  );
  const rbSuite = read(ROLLBACK_SUITE);
  check(
    TABLES.every((t) => rbSuite.includes(`DROP TABLE IF EXISTS public.${t};`)) &&
      rbSuite.includes(
        "DROP FUNCTION IF EXISTS public.beskt_revoke_governance(uuid, uuid, text);",
      ) &&
      rbSuite.includes("DROP FUNCTION IF EXISTS public.beskt_text_instructs_scoring(text);") &&
      rbSuite.includes("DROP FUNCTION IF EXISTS public.beskt_evaluation_template(text, text);") &&
      rbSuite.includes("DROP COLUMN IF EXISTS pack_kind") &&
      !/DROP TABLE IF EXISTS public\.beskt_[a-z_]+\s+CASCADE;/.test(rbSuite),
    "BESKT-DB-SUITE: the documented rollback procedure unwinds BESKT first, with the same drop set as the rollback file and no CASCADE",
  );
  const rb = existsSync(ROLLBACK) ? sqlOnly(read(ROLLBACK)) : "";
  const rbDrops = TABLES.map((t) => rb.indexOf(`DROP TABLE IF EXISTS public.${t};`));
  const rbOrder = [
    "beskt_method_events",
    "beskt_method_reviews",
    "beskt_governance_grants",
    "beskt_routing_rules",
    "beskt_prompts",
    "beskt_item_options",
    "beskt_items",
    "beskt_sections",
    "beskt_observation_fields",
    "beskt_evidence_anchors",
    "beskt_activation_requirements",
    "beskt_exposure_profiles",
    "beskt_method_versions",
  ].map((t) => rb.indexOf(`DROP TABLE IF EXISTS public.${t};`));
  check(
    rbDrops.every((i) => i > 0) &&
      rbOrder.every((at, i) => i === 0 || at > rbOrder[i - 1]) &&
      !/CASCADE;/.test(rb.replace(/--[^\n]*/g, "")) &&
      /pg_depend/.test(rb) &&
      /BESKT_ROLLBACK BLOCKED: catalogue objects outside the domain depend on it/.test(rb) &&
      /JOIN pg_type ty ON ty\.oid = d\.refobjid AND d\.refclassid = 'pg_type'::regclass\s+JOIN pg_class rc ON rc\.oid = ty\.typrelid/.test(
        rb,
      ) &&
      /RAISE EXCEPTION 'BESKT_ROLLBACK BLOCKED: objects outside the domain depend on a BESKT row type/.test(
        rb,
      ) &&
      /DROP FUNCTION IF EXISTS public\.beskt_text_instructs_scoring\(text\);/.test(rb) &&
      /DROP FUNCTION IF EXISTS public\.beskt_evaluation_template\(text, text\);/.test(rb) &&
      rb.indexOf(
        "DROP POLICY IF EXISTS scp_interview_packs_editor_update ON public.scp_interview_packs;",
      ) < rb.indexOf("ALTER TABLE public.scp_interview_packs DROP COLUMN IF EXISTS pack_kind;"),
    "BESKT-DB-ROLLBACK: the rollback checks catalogue dependencies first, drops child-first in an explicit order without CASCADE, and restores the identity policies before dropping pack_kind",
  );
  check(
    TABLES.every((t) => new RegExp(`DROP TABLE IF EXISTS public\\.${t};`).test(rb)) &&
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
