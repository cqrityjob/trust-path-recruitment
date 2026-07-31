// cd_evidence payload regression guard.
//
// ── THE BUG THIS EXISTS TO CATCH ───────────────────────────────────────
//
// `persistPublicV31Run` sent `answer_tags: null` on every row. The column is
//
//     answer_tags text[] NOT NULL DEFAULT ARRAY[]::text[]
//
// and an EXPLICIT null is not the same as an omitted column: the default only
// applies when the column is absent from the INSERT. So all 26 rows were
// rejected with SQLSTATE 23502, the whole statement aborted, cd_evidence stayed
// empty, the server threw persist_failed, and the candidate saw
// "Rapporten kunde inte sparas" after answering twenty-six questions.
//
// The SQL suite did not catch it because the suite wrote its own INSERT and
// simply left answer_tags out — testing a payload the application never sends.
// That is the real lesson, and it is why this guard asserts the payload built
// by the SHIPPING function rather than a restatement of it.
//
// Plain TS script, matching this repository's scripts/*-check.ts convention.

const { buildEvidenceRows } = await import("../src/lib/career-discovery/v31-public.functions");
const { CORE_ITEMS } = await import("../src/lib/career-discovery/v31/core-items");
const {
  CONTEXT_STATUS_ITEM_ID,
  DISCOVERY_GOAL_ITEM_ID,
  adaptiveItemsForStatus,
  isAdaptiveItemId,
  reportTagsFor,
} = await import("../src/lib/career-discovery/v31/personal-layer");
const { CONTEXT_STATUS_VALUES } = await import("../src/lib/career-discovery/context-items");

let failures = 0;
let checks = 0;
function ok(cond: boolean, label: string) {
  checks += 1;
  if (!cond) {
    failures += 1;
    console.error(`  FAIL  ${label}`);
  }
}
function group(n: string) {
  console.log(`\n${n}`);
}

const SESSION = "00000000-0000-0000-0000-0000000000aa";

/** The 20 scored answers, in the shape the buffer produces. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function coreAnswers(): any[] {
  return CORE_ITEMS.map((i) =>
    i.format === "scale"
      ? { itemId: i.id, format: "scale", value: 7 }
      : { itemId: i.id, format: "single_choice", optionId: `${i.id}_A` },
  );
}

/** The 6 unscored answers for one Discovery Path. */
function personalAnswers(status: string): Map<string, string> {
  const m = new Map<string, string>();
  m.set(CONTEXT_STATUS_ITEM_ID, status);
  m.set(DISCOVERY_GOAL_ITEM_ID, "find_direction");
  for (const item of adaptiveItemsForStatus(status as never)) {
    m.set(item.id, item.options[0].value);
  }
  return m;
}

// =========================================================================
group("1 · answer_tags is never null — the 23502 that emptied cd_evidence");
// =========================================================================

for (const status of CONTEXT_STATUS_VALUES) {
  const rows = buildEvidenceRows(SESSION, coreAnswers(), personalAnswers(status));

  ok(rows.length === 26, `1.1 ${status}: the payload is twenty-six rows`);

  // The exact defect. `null` here fails the column's NOT NULL constraint and
  // takes the entire multi-row statement with it.
  ok(
    rows.every((r) => r.answer_tags !== null && r.answer_tags !== undefined),
    `1.2 ${status}: no row sends a null answer_tags`,
  );
  ok(
    rows.every((r) => Array.isArray(r.answer_tags)),
    `1.3 ${status}: every answer_tags is an array`,
  );
  ok(
    rows.every((r) => r.answer_tags.every((t) => typeof t === "string" && t.length > 0)),
    `1.4 ${status}: every tag is a non-empty string`,
  );

  // Tags belong to adaptive items ONLY. The database enforces this with
  // CD_REPORT_TAGS_ONLY_ON_ADAPTIVE, which rejects a non-empty array on any
  // other kind — so a core or context row must send exactly [].
  ok(
    rows.every((r) => isAdaptiveItemId(r.item_id) || r.answer_tags.length === 0),
    `1.5 ${status}: only Discovery Path rows carry Career Context Signals`,
  );
  ok(
    rows.filter((r) => r.answer_tags.length > 0).length === 4,
    `1.6 ${status}: all four Discovery Path rows carry their signals`,
  );

  // Every NOT NULL column must have a value. session_id, item_id, answer_value
  // and answer_tags are NOT NULL on cd_evidence.
  ok(
    rows.every(
      (r) =>
        typeof r.session_id === "string" &&
        r.session_id.length > 0 &&
        typeof r.item_id === "string" &&
        r.item_id.length > 0 &&
        typeof r.answer_value === "string" &&
        r.answer_value.length > 0,
    ),
    `1.7 ${status}: no NOT NULL column is empty or missing`,
  );
}

// =========================================================================
group("2 · The option-presence constraint");
// =========================================================================
//
// cd_evidence_option_presence:
//   single_choice => option_id NOT NULL
//   scale         => option_id IS NULL
//   anything else => unconstrained
//
// The database derives item_kind from the registry, so the payload cannot talk
// its way out of this one.

{
  const rows = buildEvidenceRows(SESSION, coreAnswers(), personalAnswers("security_leader"));
  const byId = new Map(rows.map((r) => [r.item_id, r]));

  ok(
    CORE_ITEMS.filter((i) => i.format === "single_choice").every(
      (i) => byId.get(i.id)?.option_id === `${i.id}_A`,
    ),
    "2.1 every single_choice row carries its option_id",
  );
  ok(
    CORE_ITEMS.filter((i) => i.format === "scale").every((i) => byId.get(i.id)?.option_id === null),
    "2.2 every scale row sends option_id null",
  );
  ok(
    [...personalAnswers("security_leader").keys()].every((id) => byId.get(id)?.option_id === null),
    "2.3 context and Discovery Path rows send option_id null",
  );

  // display_order is constrained to 0..3 AND requires option_id. The payload
  // omits it entirely, which is the only safe value for a scale row.
  ok(
    !Object.prototype.hasOwnProperty.call(rows[0], "display_order"),
    "2.4 display_order is not sent (it requires an option_id and a 0..3 value)",
  );
}

// =========================================================================
group("3 · Uniform keys — PostgREST builds one column list for the batch");
// =========================================================================
//
// supabase-js sends all 26 rows as one INSERT. If the objects did not share an
// identical key set, PostgREST would either drop a column for some rows or
// reject the batch outright. Uniformity is a correctness requirement, not a
// tidiness one.

{
  const rows = buildEvidenceRows(SESSION, coreAnswers(), personalAnswers("exploring_security"));
  const shape = (r: object) => Object.keys(r).sort().join(",");
  const first = shape(rows[0]);
  ok(
    rows.every((r) => shape(r) === first),
    "3.1 every row has an identical key set",
  );
  ok(
    first === "answer_tags,answer_value,item_id,item_version,option_id,session_id",
    `3.2 the payload sends exactly the six caller-supplied columns (got ${first})`,
  );

  // Derived columns must NOT be sent: the registry is the authority, and a
  // caller that supplied is_scored could claim a context answer is scored.
  for (const derived of ["item_kind", "evidence_class", "is_scored", "adaptive_path"]) {
    ok(
      !rows.some((r) => Object.prototype.hasOwnProperty.call(r, derived)),
      `3.3 the payload never sends the derived column ${derived}`,
    );
  }
}

// =========================================================================
group("4 · The scoring boundary survives the payload");
// =========================================================================

{
  const rows = buildEvidenceRows(SESSION, coreAnswers(), personalAnswers("changing_career_area"));
  const coreIds = new Set(CORE_ITEMS.map((i) => i.id));
  ok(
    rows.filter((r) => coreIds.has(r.item_id)).length === 20,
    "4.1 exactly twenty Career DNA rows",
  );
  ok(
    rows.filter((r) => !coreIds.has(r.item_id)).length === 6,
    "4.2 exactly six unscored personal rows",
  );
  ok(
    rows.filter((r) => isAdaptiveItemId(r.item_id)).length === 4,
    "4.3 exactly four Discovery Path rows",
  );

  // The tags actually stored must be the ones the option authored — this is
  // what the Career Intelligence Engine reads.
  const adaptive = rows.filter((r) => isAdaptiveItemId(r.item_id));
  ok(
    adaptive.every(
      (r) => reportTagsFor(r.item_id, r.answer_value).join(",") === r.answer_tags.join(","),
    ),
    "4.4 stored signals match the chosen option's authored tags",
  );
}

// =========================================================================
group("5 · The database error is surfaced, not swallowed");
// =========================================================================
//
// The insert previously failed with a bare "evidence", which made a NOT NULL
// violation indistinguishable from a network error and cost a full
// reproduce-and-isolate cycle in the live environment.

{
  const { readFileSync } = await import("node:fs");
  const path = await import("node:path");
  const src = readFileSync(
    path.join(process.cwd(), "src/lib/career-discovery/v31-public.functions.ts"),
    "utf8",
  );
  // Comments describe the bug; strip them so prose cannot satisfy the check.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  ok(!/answer_tags:\s*null/.test(code), "5.1 the source never sends answer_tags: null");
  ok(
    !/answer_tags:\s*[^,\n]*\?\s*[^:]*:\s*null/.test(code),
    "5.2 no conditional narrows answer_tags to null",
  );
  ok(
    /evidenceError\.code/.test(code) && /evidenceError\.message/.test(code),
    "5.3 the insert error's SQLSTATE and message reach the thrown error",
  );
  ok(
    /evidenceError\.details/.test(code) && /evidenceError\.hint/.test(code),
    "5.4 the error's DETAIL and HINT are logged server-side",
  );
  ok(
    !/throw new V31PublicError\("persist_failed",\s*"evidence"\)/.test(code),
    "5.5 the bare, information-free evidence failure is gone",
  );
}

console.log("");
if (failures > 0) {
  console.error(`FAILED: ${failures} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`v31-evidence-payload-check: all ${checks} checks passed.`);
