// Public assessment + OAuth return-path regression guard.
//
// Covers the two corrective fixes:
//   * the OAuth destination surviving a full page unload;
//   * the sessionStorage buffer that makes the assessment takeable without an
//     account, without granting `anon` anything in the database.
//
// Both modules are pure apart from a storage call, so these are real behaviour
// tests. A minimal sessionStorage stub stands in for the browser.
//
// Plain TS script, matching this repository's scripts/*-check.ts convention.

import { readFileSync } from "node:fs";
import path from "node:path";

// --- sessionStorage stub, installed before the modules load ---------------
class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
  clear() {
    this.map.clear();
  }
}
const storage = new MemoryStorage();
(globalThis as unknown as { window: unknown }).window = {
  sessionStorage: storage,
  location: { origin: "https://preview.example.test" },
};

const {
  rememberOAuthReturn,
  consumeOAuthReturn,
  clearOAuthReturn,
  oauthRedirectUri,
  oauthErrorMessage,
} = await import("../src/lib/auth/oauth-return");
const {
  readBuffer,
  startBuffer,
  recordAnswer,
  isComplete,
  isCoreComplete,
  clearBuffer,
  remainingItemIds,
  contextStatusOf,
  sessionItemIds,
} = await import("../src/lib/career-discovery/v31-public-buffer");
const { CORE_ITEMS } = await import("../src/lib/career-discovery/v31/core-items");
const {
  ADAPTIVE_ITEMS_PER_SESSION,
  CONTEXT_ITEMS,
  CONTEXT_STATUS_ITEM_ID,
  DISCOVERY_GOAL_ITEM_ID,
  MVP_QUESTION_COUNT,
  adaptiveItemsForStatus,
  isPersonalItemId,
  pathForContextStatus,
  reportTagsFor,
} = await import("../src/lib/career-discovery/v31/personal-layer");
const { CONTENT_VERSION, DEFINITION_VERSION } =
  await import("../src/lib/career-discovery/v31/version");

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

const read = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

// =========================================================================
group("1 · OAuth return path survives the redirect");
// =========================================================================

storage.clear();
ok(rememberOAuthReturn("/my-career", "/") === "/my-career", "1.1 an internal path is remembered");
ok(consumeOAuthReturn() === "/my-career", "1.2 it is returned after the redirect");
ok(
  consumeOAuthReturn() === null,
  "1.3 consuming CLEARS it — a stale path cannot teleport a later visit",
);

storage.clear();
rememberOAuthReturn("/security-career-assessment/session?session=abc-123", "/");
ok(
  consumeOAuthReturn() === "/security-career-assessment/session?session=abc-123",
  "1.4 the query string survives — this is the dead-end defect that was fixed before",
);

// Open-redirect rejection. Every one must fall back, never be stored.
storage.clear();
for (const hostile of [
  "https://evil.test/x",
  "//evil.test",
  "javascript:alert(1)",
  "http://evil.test",
  "/\\evil.test",
  "https://evil.test",
]) {
  const result = rememberOAuthReturn(hostile, "/my-career");
  ok(result === "/my-career", `1.5 hostile redirect rejected: ${hostile}`);
  ok(consumeOAuthReturn() !== hostile, `1.6 hostile redirect never stored: ${hostile}`);
  storage.clear();
}
ok(
  rememberOAuthReturn("/auth", "/my-career") === "/my-career",
  "1.7 /auth is rejected — loop prevention",
);
storage.clear();

// A path written directly into storage is still re-validated on read.
storage.setItem("cqj:auth:oauth-return:v1", "https://evil.test/x");
ok(
  consumeOAuthReturn() === null,
  "1.8 storage is not a trust boundary — a poisoned value is rejected on read",
);

storage.clear();
rememberOAuthReturn("/my-career", "/");
clearOAuthReturn();
ok(consumeOAuthReturn() === null, "1.9 a failed attempt clears the pending path");

ok(
  oauthRedirectUri("/my-career") === "https://preview.example.test/my-career",
  "1.10 redirect_uri is built from the CURRENT origin, so preview and production self-return",
);
ok(
  !oauthErrorMessage("sv").toLowerCase().includes("supabase") &&
    !oauthErrorMessage("en").toLowerCase().includes("oauth"),
  "1.11 the user-facing error names no infrastructure",
);
ok(
  oauthErrorMessage("sv") !== oauthErrorMessage("en"),
  "1.12 the error is localised in both languages",
);

// The call sites must actually use it.
const form = read("src/components/auth/PortalAuthForm.tsx");
ok(
  form.includes("rememberOAuthReturn"),
  "1.13 the auth form remembers the destination before leaving",
);
ok(form.includes("oauthRedirectUri("), "1.14 redirect_uri carries the destination");
ok(
  !/redirect_uri: window\.location\.origin,/.test(form),
  "1.15 the bare-origin redirect_uri is gone",
);
ok(
  form.includes("consumeOAuthReturn"),
  "1.16 a broker that drops the path is covered by the stash",
);
ok(form.includes("oauthErrorMessage"), "1.17 raw provider errors are not rendered");
{
  // Scoped to the Google handler's own body, so an unrelated handler elsewhere
  // in the file cannot make this pass or fail.
  const start = form.indexOf("async function onGoogle");
  const body = form.slice(start, form.indexOf("\n  }", start));
  ok(body.includes("oauthErrorMessage"), "1.18 the Google handler shows a sanitised message");
  ok(!body.includes("err.message"), "1.18b the Google handler surfaces no raw error text");
}
const adminLogin = read("src/routes/admin.login.tsx");
ok(adminLogin.includes("oauthErrorMessage"), "1.19 admin login also sanitises OAuth errors");
ok(
  !read("src/integrations/lovable/index.ts").includes("oauth-return"),
  "1.20 the autogenerated Lovable file is untouched",
);

// =========================================================================
group("2 · The public assessment buffer");
// =========================================================================

storage.clear();
ok(readBuffer() === null, "2.1 no buffer exists before a run starts");

let buf = startBuffer("sv", "2026-07-30T10:00:00.000Z");
ok(readBuffer() !== null, "2.2 starting a run creates a buffer");
ok(!isComplete(buf), "2.3 a fresh buffer is not complete");
// 22 before the path is known: the four Discovery Path questions do not exist
// until C1 decides which four they are.
ok(
  remainingItemIds(buf).length === CONTEXT_ITEMS.length + CORE_ITEMS.length,
  "2.4 every knowable item is initially outstanding",
);

/** Answer all 26 questions of the frozen MVP, in the shape each stage requires. */
function answerWholeRun(
  start: ReturnType<typeof startBuffer>,
  status = "working_in_security",
): ReturnType<typeof startBuffer> {
  let b = recordAnswer(start, {
    itemId: CONTEXT_STATUS_ITEM_ID,
    format: "personal",
    value: status,
  });
  b = recordAnswer(b, {
    itemId: DISCOVERY_GOAL_ITEM_ID,
    format: "personal",
    value: "find_direction",
  });
  for (const item of CORE_ITEMS) {
    b =
      item.format === "scale"
        ? recordAnswer(b, { itemId: item.id, format: "scale", value: 7 })
        : recordAnswer(b, { itemId: item.id, format: "single_choice", optionId: `${item.id}_A` });
  }
  for (const item of adaptiveItemsForStatus(status as never)) {
    b = recordAnswer(b, { itemId: item.id, format: "personal", value: item.options[0].value });
  }
  return b;
}

buf = answerWholeRun(buf);
ok(isComplete(buf), "2.5 answering the whole run completes the buffer");
ok(remainingItemIds(buf).length === 0, "2.6 nothing remains outstanding");

// Survives a refresh: re-reading from storage returns the same answers.
const reread = readBuffer();
ok(
  reread !== null && reread.answers.length === MVP_QUESTION_COUNT,
  "2.7 progress survives a refresh in the same tab",
);
ok(isComplete(reread), "2.8 a restored buffer is still complete");

// Changing an answer replaces it rather than appending a second one.
const before = readBuffer()!.answers.length;
buf = recordAnswer(buf, { itemId: "CQ01", format: "scale", value: 2 });
ok(readBuffer()!.answers.length === before, "2.9 re-answering replaces rather than appends");
ok(
  readBuffer()!.answers.find((a) => a.itemId === "CQ01")?.format === "scale" &&
    (readBuffer()!.answers.find((a) => a.itemId === "CQ01") as { value: number }).value === 2,
  "2.10 the replacement value is the one kept",
);

// Version fencing: a buffer from another instrument version is discarded, not
// replayed into a changed instrument.
const good = readBuffer()!;
storage.setItem(
  "cqj:discovery:v31:public-buffer:v1",
  JSON.stringify({ ...good, definitionVersion: "2099-scd-v9.9.9" }),
);
ok(readBuffer() === null, "2.11 a buffer from a different definition version is discarded");
storage.setItem(
  "cqj:discovery:v31:public-buffer:v1",
  JSON.stringify({ ...good, contentVersion: "v9.9-later" }),
);
ok(readBuffer() === null, "2.12 a buffer from a different content version is discarded");

// Malformed buffers are treated as absent, never partially trusted.
for (const [label, payload] of [
  ["not json", "{{{"],
  [
    "unknown item",
    JSON.stringify({ ...good, answers: [{ itemId: "NOPE", format: "scale", value: 5 }] }),
  ],
  [
    "out-of-range scale",
    JSON.stringify({ ...good, answers: [{ itemId: "CQ01", format: "scale", value: 99 }] }),
  ],
  [
    "foreign option",
    JSON.stringify({
      ...good,
      answers: [{ itemId: "CQ02", format: "single_choice", optionId: "CQ09_A" }],
    }),
  ],
  ["bad locale", JSON.stringify({ ...good, locale: "de" })],
] as const) {
  storage.setItem("cqj:discovery:v31:public-buffer:v1", payload);
  ok(readBuffer() === null, `2.13 malformed buffer treated as absent: ${label}`);
}

// Clearing is explicit and total.
storage.setItem("cqj:discovery:v31:public-buffer:v1", JSON.stringify(good));
clearBuffer();
ok(readBuffer() === null, "2.14 clearBuffer removes the buffer");

// The buffer must be fenced to the CURRENT versions, so the constants it
// records are the ones a replay will be validated against.
ok(
  good.definitionVersion === DEFINITION_VERSION && good.contentVersion === CONTENT_VERSION,
  "2.15 a new buffer records the current definition and content versions",
);

// =========================================================================
group("2b · The frozen MVP: 2 context + 22 Career DNA + 4 Discovery Path");
// =========================================================================
//
// The failure this section exists to catch is a SHORT INSTRUMENT: a run that
// serves fewer questions than the registry defines, or skips the routing
// question, or persists as complete without a Discovery Path. None of those
// is visible by reading the flow.

ok(MVP_QUESTION_COUNT === 28, "2b.1 the frozen MVP is twenty-eight questions");
ok(CONTEXT_ITEMS.length === 2, "2b.2 exactly two context questions");
ok(CORE_ITEMS.length === 22, "2b.3 exactly twenty-two Career DNA questions");
ok(ADAPTIVE_ITEMS_PER_SESSION === 4, "2b.4 exactly four Discovery Path questions per run");

// The owner-locked context questions, by id. If either id changes, the
// registry migration and every stored answer stop lining up.
ok(
  CONTEXT_STATUS_ITEM_ID === "CTX_CURRENT_STATUS" &&
    DISCOVERY_GOAL_ITEM_ID === "CTX_DISCOVERY_GOAL",
  "2b.5 the two context questions are the owner-approved originals",
);

// Every path serves exactly four items, and every path is reachable from a
// real C1 answer. A path with three would strand a candidate at question 25.
for (const option of CONTEXT_ITEMS[0].options) {
  const status = option.value as never;
  const items = adaptiveItemsForStatus(status);
  ok(
    items.length === ADAPTIVE_ITEMS_PER_SESSION,
    `2b.6 ${option.value} serves four Discovery Path questions`,
  );
  ok(
    sessionItemIds(status).length === MVP_QUESTION_COUNT,
    `2b.7 ${option.value} produces a full-length run`,
  );
  ok(
    typeof pathForContextStatus(status) === "string",
    `2b.8 ${option.value} maps to a Discovery Path`,
  );
}

// The five paths are distinct: no two C1 answers serve the same four items.
{
  const signatures = CONTEXT_ITEMS[0].options.map((o) =>
    adaptiveItemsForStatus(o.value as never)
      .map((i) => i.id)
      .join(","),
  );
  ok(new Set(signatures).size === 5, "2b.9 the five Discovery Paths are distinct");
}

// The scoring boundary, from the flow's side: no personal item is a Career DNA
// item, and no Career DNA item is a personal item.
{
  const coreIds = new Set(CORE_ITEMS.map((i) => i.id));
  const personalIds = sessionItemIds("working_in_security" as never).filter(isPersonalItemId);
  ok(
    personalIds.every((id) => !coreIds.has(id)),
    "2b.10 no context or Discovery Path item is a Career DNA item",
  );
  ok(
    CORE_ITEMS.every((i) => !isPersonalItemId(i.id)),
    "2b.11 no Career DNA item is treated as contextual",
  );
  ok(personalIds.length === 6, "2b.12 a run carries exactly six unscored questions");
}

// Career Context Signals: every Discovery Path answer produces at least one
// tag for the Career Intelligence Engine, and no context answer produces any
// — the database refuses tags on non-adaptive items.
{
  let tagged = 0;
  for (const item of adaptiveItemsForStatus("security_leader" as never)) {
    for (const o of item.options) {
      if (reportTagsFor(item.id, o.value).length > 0) tagged += 1;
    }
  }
  ok(tagged > 0, "2b.13 Discovery Path answers produce Career Context Signals");
  ok(
    CONTEXT_ITEMS.every((i) => i.options.every((o) => reportTagsFor(i.id, o.value).length === 0)),
    "2b.14 context answers carry no report tags",
  );
}

// Completeness is all 26, not 20. A run answered only through the Career DNA
// block must NOT be persistable: it has no Discovery Path.
storage.clear();
{
  let b = startBuffer("sv", "2026-07-31T10:00:00.000Z");
  for (const item of CORE_ITEMS) {
    b =
      item.format === "scale"
        ? recordAnswer(b, { itemId: item.id, format: "scale", value: 5 })
        : recordAnswer(b, { itemId: item.id, format: "single_choice", optionId: `${item.id}_A` });
  }
  ok(isCoreComplete(b), "2b.15 the twenty Career DNA answers are recognised as complete");
  ok(!isComplete(b), "2b.16 twenty answers alone do NOT complete the run");
  ok(contextStatusOf(b) === null, "2b.17 with no C1 answer there is no routing state");

  b = recordAnswer(b, {
    itemId: CONTEXT_STATUS_ITEM_ID,
    format: "personal",
    value: "exploring_security",
  });
  b = recordAnswer(b, { itemId: DISCOVERY_GOAL_ITEM_ID, format: "personal", value: "curious" });
  ok(contextStatusOf(b) === "exploring_security", "2b.18 C1 sets the routing state");
  ok(!isComplete(b), "2b.19 the run is still short of its Discovery Path answers");

  for (const item of adaptiveItemsForStatus("exploring_security" as never)) {
    b = recordAnswer(b, { itemId: item.id, format: "personal", value: item.options[0].value });
  }
  ok(isComplete(b), "2b.20 answering the whole run completes it");
}

// Changing C1 re-routes the run and drops the now-foreign Discovery Path
// answers — WITHOUT discarding the twenty Career DNA answers, which are the
// same on every path. Losing those over a corrected first question would be
// the worst bug in this file.
storage.clear();
{
  let b = answerWholeRun(startBuffer("sv", "2026-07-31T11:00:00.000Z"), "exploring_security");
  const dnaBefore = b.answers.filter((a) => !isPersonalItemId(a.itemId)).length;

  b = recordAnswer(b, {
    itemId: CONTEXT_STATUS_ITEM_ID,
    format: "personal",
    value: "security_leader",
  });

  const dnaAfter = b.answers.filter((a) => !isPersonalItemId(a.itemId)).length;
  ok(
    dnaBefore === CORE_ITEMS.length && dnaAfter === CORE_ITEMS.length,
    "2b.21 re-routing keeps all Career DNA answers",
  );

  const stillHeld = new Set(b.answers.map((a) => a.itemId));
  ok(
    adaptiveItemsForStatus("exploring_security" as never).every((i) => !stillHeld.has(i.id)),
    "2b.22 re-routing drops the previous path's Discovery Path answers",
  );
  // C2 is not routing state and must survive. Dropping it would silently lose
  // an answer the candidate gave and never be asked for again.
  ok(stillHeld.has(DISCOVERY_GOAL_ITEM_ID), "2b.22b re-routing keeps the C2 answer");
  ok(!isComplete(b), "2b.23 a re-routed run is incomplete until the new path is answered");
  ok(readBuffer() !== null, "2b.24 a re-routed buffer is still readable, not discarded");
}

// A buffer holding an answer from another path is not partially trusted.
storage.clear();
{
  const b = answerWholeRun(startBuffer("sv", "2026-07-31T12:00:00.000Z"), "exploring_security");
  const foreign = adaptiveItemsForStatus("security_leader" as never)[0];
  storage.setItem(
    "cqj:discovery:v31:public-buffer:v1",
    JSON.stringify({
      ...b,
      answers: [
        ...b.answers,
        { itemId: foreign.id, format: "personal", value: foreign.options[0].value },
      ],
    }),
  );
  ok(readBuffer() === null, "2b.25 an answer from another Discovery Path invalidates the buffer");
}

// A v1 buffer — the 20-question shape — is discarded rather than replayed as a
// 26-question run, which would persist a session with no Discovery Path.
storage.clear();
{
  const b = answerWholeRun(startBuffer("sv", "2026-07-31T13:00:00.000Z"));
  storage.setItem("cqj:discovery:v31:public-buffer:v1", JSON.stringify({ ...b, bufferVersion: 1 }));
  ok(readBuffer() === null, "2b.26 a pre-personal-layer buffer is discarded");
}

// An invented option value is rejected: the buffer accepts only authored
// answers, so a hand-edited sessionStorage cannot reach the database.
storage.clear();
{
  const b = answerWholeRun(startBuffer("sv", "2026-07-31T14:00:00.000Z"));
  storage.setItem(
    "cqj:discovery:v31:public-buffer:v1",
    JSON.stringify({
      ...b,
      answers: b.answers.map((a) =>
        a.itemId === DISCOVERY_GOAL_ITEM_ID ? { ...a, value: "invented_goal" } : a,
      ),
    }),
  );
  ok(readBuffer() === null, "2b.27 an unauthored context answer invalidates the buffer");
}

// =========================================================================
group("2c · The registry migration matches the code");
// =========================================================================
//
// The migration is the database's copy of what this run serves. If the two
// disagree, evidence is refused at insert time — after the candidate has
// answered everything.

{
  const reg = read("supabase/migrations/20260801090000_career_discovery_v31_personal_layer.sql");

  ok(
    reg.includes("'CTX_CURRENT_STATUS','context'") &&
      reg.includes("'CTX_DISCOVERY_GOAL','context'"),
    "2c.1 both context questions are registered for v3.1",
  );

  const adaptiveRows = [...reg.matchAll(/'(ADAPT_[A-Z]+_\d{2})',\s*'adaptive',\s*'([A-E])'/g)];
  ok(adaptiveRows.length === 20, "2c.2 all twenty adaptive items are registered for v3.1");

  // Set equality, both directions, keyed on id AND path. Counting rows is not
  // enough: a duplicated id would still total twenty while one real item went
  // unregistered and its path silently served three questions.
  const registered = new Set(adaptiveRows.map(([, id, p]) => `${p}:${id}`));
  const inCode = new Set(
    CONTEXT_ITEMS[0].options.flatMap((o) =>
      adaptiveItemsForStatus(o.value as never).map(
        (i) => `${pathForContextStatus(o.value as never)}:${i.id}`,
      ),
    ),
  );
  ok(registered.size === 20, "2c.3a the migration registers twenty DISTINCT path/item pairs");
  ok(
    registered.size === inCode.size && [...inCode].every((k) => registered.has(k)),
    "2c.3b the registered set is exactly the set the code serves",
  );
  ok(
    [...registered].every((k) => isPersonalItemId(k.slice(2))),
    "2c.3c the migration registers no item the code does not define",
  );

  // The migration must not touch the scored set, in either direction.
  ok(
    reg.includes("'contextual_self_report', false"),
    "2c.4 every registered row is unscored contextual evidence",
  );
  ok(
    !/'orientation_self_report'|'behavioural_signal'/.test(reg),
    "2c.5 the migration registers no scored evidence class",
  );
  ok(
    reg.includes("CD_V31_SCORED_SET_CHANGED"),
    "2c.6 the migration fails if the scored set moves off twenty",
  );
  ok(
    !/\b(ALTER|DROP|UPDATE|DELETE)\b/.test(reg.replace(/--.*$/gm, "")),
    "2c.7 the migration is INSERT-only: no ALTER, DROP, UPDATE or DELETE",
  );
}

// =========================================================================
group("3 · No anonymous database access was introduced");
// =========================================================================

const bufferSrc = read("src/lib/career-discovery/v31-public-buffer.ts");
ok(
  !/from "@\/integrations\/supabase|createServerFn|\.from\(/.test(bufferSrc),
  "3.1 the buffer never touches the database — it is browser storage only",
);

const publicFns = read("src/lib/career-discovery/v31-public.functions.ts");
ok(
  publicFns.includes("requireSupabaseAuth"),
  "3.2 persistence is authenticated — the replay runs as the real owner",
);
ok(
  /persistPublicV31Run[\s\S]*?requireSupabaseAuth/.test(publicFns),
  "3.3 the persist function specifically carries the auth middleware",
);
{
  // Strip comments first: the prose in this file legitimately discusses grants
  // and anonymity, and a naive scan matches its own documentation.
  const code = publicFns.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  ok(
    !/\bGRANT\b/i.test(code) && !code.includes("service_role"),
    "3.4 no grant and no service-role bypass in the public path",
  );
}

// The migration set must not have gained an anon grant on candidate data.
const migrations = read("supabase/migrations/20260730090000_career_discovery_v3_1_schema.sql");
ok(
  migrations.includes("anon gets nothing"),
  "3.5 PR1's stance that anon holds nothing is still recorded in the schema",
);

// =========================================================================
group("4 · Lifecycle and review gates are read, never bypassed");
// =========================================================================

ok(
  publicFns.includes("getV31Availability"),
  "4.1 the public route can ask whether v3.1 is actually takeable",
);
ok(
  /CANDIDATE_ADMINISTRABLE\s*=\s*\["pilot", "active"\]/.test(publicFns),
  "4.2 only pilot and active count as candidate-administrable",
);
// Governance gates must never refuse a candidate. They protect no data and
// enforce no boundary; treating them as a runtime block is what made the
// product unreachable while every real security control was already working.
ok(
  !/available:[^;]*outstanding === 0/.test(publicFns),
  "4.3 availability depends on lifecycle alone — a governance gate never refuses a candidate",
);
ok(
  !/UPDATE[\s\S]*cd_definition_versions/i.test(publicFns),
  "4.4 the application never promotes the instrument itself — that is a migration",
);

// Launch is a migration: it applies on deploy, with no manual step.
const launch = read("supabase/migrations/20260731100000_career_discovery_v31_launch.sql");
ok(/lifecycle_status = 'active'/.test(launch), "4.5 the launch migration activates v3.1");
// It must not mark any review as done that was not done.
ok(
  !/SET[\s\S]{0,80}review_status\s*=/i.test(launch),
  "4.6 the launch migration marks no review as approved",
);
ok(
  launch.includes("cd_outstanding_reviews"),
  "4.7 outstanding reviews stay visible after the block is removed",
);
ok(
  /anon gained a write grant/.test(launch),
  "4.8 the launch migration refuses to run if anon gained a write grant",
);

// =========================================================================
group("5 · The public route serves v3.1 only");
// =========================================================================

const canonicalRoute = read("src/routes/security-career-assessment.tsx");
const flow = read("src/components/career-discovery/v31/PublicAssessmentFlow.tsx");

ok(
  canonicalRoute.includes("<PublicAssessmentFlow"),
  "5.1 the canonical public route renders the v3.1 flow",
);
// The v3.0 fallback is gone: silently routing a candidate into the old
// assessment means they answer a different instrument from the one the page
// describes, scored by a retired model.
for (const v30 of ["DiscoveryLanding", "DiscoverySessionView", "unavailableFallback"]) {
  ok(!canonicalRoute.includes(v30), `5.2 the canonical route no longer references ${v30}`);
}
for (const v30Module of [
  "career-discovery/report",
  "career-discovery/scoring",
  "career-discovery/axes",
  "career-discovery/area-ranking",
  "career-discovery/core-items",
  "career-intelligence-engine",
]) {
  ok(!flow.includes(v30Module), `5.3 the v3.1 flow imports no v3.0 module: ${v30Module}`);
}
ok(
  flow.includes("v31/core-items") && flow.includes("v31/option-matrix"),
  "5.4 questions come from the v3.1 modules",
);
// An unavailable instrument must say so, not degrade into another assessment.
ok(
  flow.includes("cd.public.unavailableTitle"),
  "5.5 an unavailable v3.1 shows an explicit v3.1 state",
);

// =========================================================================
console.log("");
if (failures > 0) {
  console.error(`FAILED: ${failures} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`public-assessment-auth-check: all ${checks} checks passed.`);
