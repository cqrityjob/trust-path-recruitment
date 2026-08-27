/**
 * Interview Intelligence Phase 1 — the source-level contract guard.
 *
 * The database suite (supabase/tests/scp_interview_role_pack_test.sql) proves
 * these properties of the SCHEMA. This proves them of the REPOSITORY, which is
 * the half a schema test structurally cannot reach: a column that does not
 * exist yet is added by editing a migration, and an AI provider is enabled by
 * editing a source file. Both are diffs a human should have to approve.
 *
 * What it asserts:
 *
 *   1. Q1–Q8 exist in the seed, in order, with the exact governed wording of
 *      the Väktare source document, and the right question type each.
 *   2. Levels 0–4 are complete and level 0 is never aggregable.
 *   3. No prohibited field, function or vocabulary appears in the domain —
 *      not in the migration, not in the server functions, not in the UI.
 *   4. No AI provider, model id, prompt template or credential appears
 *      anywhere in the Interview Intelligence source.
 *   5. The employer never reaches the platform's content-authoring surface.
 *   6. The generic assessment guards are not attached to the new tables.
 *
 * Every check self-tests where it can, and the guard fails closed: a file it
 * expects and cannot read is a failure, not a skip.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const MIGRATION = "supabase/migrations/20260918090000_scp_interview_role_packs.sql";
const SERVER_FN = "src/lib/interview-intelligence/role-packs.functions.ts";
const UI_DIR = "src/components/admin/interview";
const ROUTE_PREFIX = "_authenticated.admin.interview-role-packs";
const EMPLOYER_SHELL = "src/components/employer/EmployerAppShell.tsx";

const failures: string[] = [];
let checks = 0;

function ok(condition: boolean, label: string): void {
  checks += 1;
  if (!condition) failures.push(label);
}

function read(path: string): string {
  if (!existsSync(path)) {
    failures.push(`MISSING FILE: ${path} — this guard fails closed rather than skipping.`);
    return "";
  }
  return readFileSync(path, "utf8");
}

const migration = read(MIGRATION);
const serverFn = read(SERVER_FN);

const routeFiles = existsSync("src/routes")
  ? readdirSync("src/routes")
      .filter((f) => f.startsWith(ROUTE_PREFIX))
      .map((f) => join("src/routes", f))
  : [];

const uiFiles = existsSync(UI_DIR)
  ? readdirSync(UI_DIR)
      .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
      .map((f) => join(UI_DIR, f))
  : [];

const domainSources = [
  { path: MIGRATION, text: migration },
  { path: SERVER_FN, text: serverFn },
  ...routeFiles.map((p) => ({ path: p, text: read(p) })),
  ...uiFiles.map((p) => ({ path: p, text: read(p) })),
];

ok(
  routeFiles.length >= 3,
  `expected at least 3 Interview Intelligence routes, found ${routeFiles.length}`,
);
ok(uiFiles.length >= 1, `expected the shared governance UI in ${UI_DIR}`);

/* ------------------------------------------------------------------ */
/* 1. The eight core questions, verbatim and in order                   */
/* ------------------------------------------------------------------ */

/**
 * The exact governed wording. These strings ARE the contract: if the migration
 * stops containing one of them, a candidate somewhere would be asked a
 * different question than the one the source document and the expert panel
 * approved.
 */
const CORE_QUESTIONS: readonly {
  readonly code: string;
  readonly order: number;
  readonly type: "behavioural" | "situational";
  readonly prompt: string;
}[] = [
  {
    code: "Q1",
    order: 1,
    type: "behavioural",
    prompt:
      "Berätta om en konkret situation där du upptäckte något som andra först inte verkade uppmärksamma och där det kunde ha fått betydelse för säkerheten eller verksamheten.",
  },
  {
    code: "Q2",
    order: 2,
    type: "behavioural",
    prompt:
      "Berätta om en situation där en person blev arg, hotfull eller starkt frustrerad och du behövde förhindra att läget eskalerade.",
  },
  {
    code: "Q3",
    order: 3,
    type: "behavioural",
    prompt:
      "Berätta om en situation där någon ville att du skulle göra ett undantag från en regel eller rutin, eller där det hade varit enklare att inte rapportera ett problem.",
  },
  {
    code: "Q4",
    order: 4,
    type: "behavioural",
    prompt:
      "Berätta om en incident där din rapport eller överlämning behövde göra det möjligt för någon annan att förstå vad som hänt och agera vidare.",
  },
  {
    code: "Q5",
    order: 5,
    type: "behavioural",
    prompt:
      "Berätta om en situation där du behövde fatta ett snabbt beslut med ofullständig information och där säkerheten kunde påverkas.",
  },
  {
    code: "Q6",
    order: 6,
    type: "behavioural",
    prompt:
      "Berätta om en situation där en kund, besökare eller kollega ville ha en snabb lösning som stod i konflikt med en säkerhetsrutin eller ditt uppdrag.",
  },
  {
    code: "Q7",
    order: 7,
    type: "situational",
    prompt:
      "Du arbetar vid en behörighetskontrollerad entré. En välkänd medarbetare kommer med en person som saknar giltig behörighet och säger att det bara gäller några minuter. Det är kö bakom och medarbetaren blir irriterad. Hur hanterar du situationen?",
  },
  {
    code: "Q8",
    order: 8,
    type: "situational",
    prompt:
      "Under en rond får du ett larm från ett område samtidigt som du ser en upprörd grupp nära den tänkta vägen dit. Du är ensam i den omedelbara närheten och har begränsad information. Beskriv hur du skulle resonera och agera steg för steg.",
  },
];

// The seed rows look like:  ('Q1', 1, 'behavioural',\n   '<prompt>'),
const seedPositions: number[] = [];
for (const q of CORE_QUESTIONS) {
  const rowStart = migration.indexOf(`('${q.code}', ${q.order}, '${q.type}',`);
  ok(rowStart !== -1, `${q.code} is not seeded with order ${q.order} and type ${q.type}`);
  seedPositions.push(rowStart);

  const promptAt = migration.indexOf(q.prompt);
  ok(promptAt !== -1, `${q.code} governed wording is missing or altered in ${MIGRATION}`);

  // The wording must belong to THIS question's row, not merely appear somewhere.
  if (rowStart !== -1 && promptAt !== -1) {
    ok(
      promptAt > rowStart && promptAt - rowStart < 400,
      `${q.code} wording is present but not attached to the ${q.code} seed row`,
    );
  }
}

// The seed rows must appear in Q1..Q8 order in the file, so the migration reads
// the way the interview runs.
ok(
  seedPositions.every(
    (p, i) => i === 0 || (p !== -1 && seedPositions[i - 1] !== -1 && p > seedPositions[i - 1]),
  ),
  "the eight core questions are not seeded in Q1..Q8 order",
);

// Self-test: a wording that is NOT in the pack must not be found.
ok(
  !migration.includes(
    "Berätta om en situation där du kände dig obekväm med en kollegas personlighet.",
  ),
  "self-test: the guard reports a match for a question that is not in the pack",
);

/* ------------------------------------------------------------------ */
/* 2. The 0–4 scale, and what level 0 means                             */
/* ------------------------------------------------------------------ */

ok(
  migration.includes("CHECK (level BETWEEN 0 AND 4)"),
  "the anchor level constraint 0..4 is missing",
);
ok(
  migration.includes("CHECK ((level = 0) = (counts_toward_aggregation = false))"),
  "the constraint tying level 0 to counts_toward_aggregation = false is missing",
);
ok(
  migration.includes("Detta är inte samma sak som låg kompetens."),
  "the level-0 anchor no longer states that it is not low competence",
);
ok(
  /expected 40 anchors \(8 questions x levels 0-4\)/.test(migration),
  "the migration no longer asserts the 40-anchor contract",
);

for (const label of [
  "Otillräcklig evidens",
  "Riskfyllt/otillräckligt",
  "Grundläggande/ojämnt",
  "Effektivt och säkert",
  "Mycket starkt/systematiskt",
]) {
  ok(migration.includes(label), `anchor level label "${label}" is missing from the seed`);
}

// The UI must draw level 0 as insufficient evidence, not as the bottom of a scale.
const anchorUi = routeFiles.map((p) => read(p)).join("\n");
ok(
  anchorUi.includes("ii.anchor.zeroRule"),
  "the version screen no longer explains what level 0 means",
);

/* ------------------------------------------------------------------ */
/* 3. Prohibited fields and vocabulary                                  */
/* ------------------------------------------------------------------ */

/**
 * A prohibited capability must be ABSENT FROM THE CONTRACT, not hidden from the
 * UI. Each entry is matched as an identifier, so prose that merely says the
 * feature does not exist ("no total score", "ingen totalpoäng") does not trip
 * the guard — only a real field, column or property does.
 */
const FORBIDDEN_IDENTIFIERS: readonly string[] = [
  "total_score",
  "totalScore",
  "suitability_score",
  "suitabilityScore",
  "fit_score",
  "fitScore",
  "culture_fit",
  "cultureFit",
  "hire_recommendation",
  "hireRecommendation",
  "pass_threshold",
  "passThreshold",
  "cut_score",
  "cutScore",
  "credibility_score",
  "credibilityScore",
  "deception_probability",
  "deceptionProbability",
  "emotion_score",
  "stress_level",
  "personality_type",
  "candidate_rank",
  "candidateRank",
  "ranking_position",
];

for (const src of domainSources) {
  if (src.text === "") continue;
  for (const ident of FORBIDDEN_IDENTIFIERS) {
    const re = new RegExp(`\\b${ident}\\b`);
    ok(!re.test(src.text), `prohibited identifier "${ident}" appears in ${src.path}`);
  }
}

// Self-test: the guard must actually be able to see a forbidden identifier.
ok(
  new RegExp("\\btotal_score\\b").test("column total_score integer"),
  "self-test: the forbidden-identifier matcher does not match",
);

// ...and must NOT fire on prose that names the prohibition in order to forbid it.
ok(
  !new RegExp("\\btotal_score\\b").test("Ingen automatisk totalpoäng eller rangordning."),
  "self-test: the forbidden-identifier matcher fires on prose",
);

/* ------------------------------------------------------------------ */
/* 4. No AI provider is activated                                       */
/* ------------------------------------------------------------------ */

const AI_MARKERS: readonly string[] = [
  "openai",
  "anthropic",
  "@anthropic-ai",
  "gpt-4",
  "gpt-5",
  "claude-",
  "gemini",
  "mistral",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "LOVABLE_API_KEY",
  "chat.completions",
  "messages.create",
  "generateText",
  "systemPrompt",
  "promptTemplate",
];

for (const src of domainSources) {
  if (src.text === "") continue;
  const lower = src.text.toLowerCase();
  for (const marker of AI_MARKERS) {
    ok(
      !lower.includes(marker.toLowerCase()),
      `AI provider marker "${marker}" appears in ${src.path} — enabling AI is an owner decision, not a code change`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* 5. The employer never reaches the AUTHORING surface                  */
/* ------------------------------------------------------------------ */
//
// Phase 1 asserted that no employer surface mentioned Interview Intelligence at
// all, because no employer runtime existed and a link would have led nowhere.
// Phase 2 ships that runtime, so the rule is now the one that actually matters
// and always did: an employer may reach their own interview WORKSPACE, and may
// never reach the platform's content AUTHORING surface.
//
// Role-pack authoring stays a platform-governed admin capability. That is owner
// decision 1, and it is unchanged.

if (existsSync(EMPLOYER_SHELL)) {
  const shell = readFileSync(EMPLOYER_SHELL, "utf8");
  ok(
    !shell.includes("interview-role-packs"),
    `${EMPLOYER_SHELL} links to the platform Role Interview Builder; employers author no governed content`,
  );
}

const employerDir = "src/components/employer";
if (existsSync(employerDir)) {
  for (const f of readdirSync(employerDir)) {
    const full = join(employerDir, f);
    if (statSync(full).isDirectory()) continue;
    const text = readFileSync(full, "utf8");
    ok(
      !text.includes("/admin/interview-role-packs"),
      `${full} links to the platform Role Interview Builder`,
    );
  }
}

const employerRoutes = existsSync("src/routes")
  ? readdirSync("src/routes").filter(
      (f) => f.includes("employer") && f.toLowerCase().includes("interview-role-pack"),
    )
  : [];
ok(employerRoutes.length === 0, "an employer-facing Role Interview PACK (authoring) route exists");

// And the authoring routes stay admin-only.
const adminOnlyRoutes = existsSync("src/routes")
  ? readdirSync("src/routes").filter((f) => f.includes("interview-role-packs"))
  : [];
ok(
  adminOnlyRoutes.every((f) => f.startsWith("_authenticated.admin.")),
  "a Role Interview Pack authoring route exists outside the admin surface",
);

/* ------------------------------------------------------------------ */
/* 6. The generic guards stay off the new tables                        */
/* ------------------------------------------------------------------ */

for (const generic of [
  "scp_guard_published_immutable",
  "scp_guard_child_of_published",
  "scp_guard_version_starts_as_draft",
]) {
  const re = new RegExp(
    `CREATE TRIGGER[^;]*ON public\\.scp_interview_[a-z_]+[^;]*EXECUTE FUNCTION public\\.${generic}`,
    "s",
  );
  ok(
    !re.test(migration),
    `the generic guard ${generic}() is attached to an interview-pack table; its status vocabulary and parent lookup do not fit this domain (see the ADR)`,
  );
}

// And the purpose-built ones are present.
for (const guard of [
  "scp_interview_guard_version_starts_as_draft",
  "scp_interview_guard_version_transition",
  "scp_interview_guard_child_of_locked_parent",
  "scp_interview_guard_events_append_only",
  "scp_interview_guard_reviews_append_only",
  "scp_interview_guard_reviewer_not_author",
]) {
  ok(
    migration.includes(`CREATE OR REPLACE FUNCTION public.${guard}()`),
    `the purpose-built guard ${guard}() is missing`,
  );
}

// The child guard must still fail closed on an unknown table.
ok(
  migration.includes("SCP_INTERVIEW_GUARD_UNKNOWN_TABLE"),
  "the child guard no longer raises on a table it does not know — it would fail OPEN",
);

/* ------------------------------------------------------------------ */
/* 7. Publication stays governed                                        */
/* ------------------------------------------------------------------ */

ok(
  migration.includes("SCP_INTERVIEW_UNGOVERNED_TRANSITION"),
  "a direct table update can now change content_status",
);
ok(
  migration.includes("SCP_INTERVIEW_PUBLISH_BLOCKED"),
  "the publish RPC no longer refuses an incomplete pack",
);
ok(
  migration.includes("content_hash_at_review"),
  "reviews are no longer bound to the content hash they approved",
);
ok(migration.includes("SCP_INTERVIEW_SELF_REVIEW"), "an author can now review their own version");
ok(
  !serverFn.includes("supabaseAdmin") && !serverFn.includes("service_role"),
  `${SERVER_FN} reaches for a service-role client; every read here must run as the caller under RLS`,
);
ok(
  serverFn.includes("scp_interview_publish_version"),
  "the server functions no longer publish through the governed RPC",
);

// The Väktare pilot must arrive as a draft hypothesis with provisional mappings.
ok(
  migration.includes("'draft', 'pilot_hypothesis', 'sv-SE'"),
  "the Väktare seed no longer enters as draft + pilot_hypothesis",
);
ok(
  migration.includes("SCP_INTERVIEW_ASSERT: the seeded Vaktare pilot reports no blocking reasons"),
  "the migration no longer asserts that the seeded pilot cannot be published",
);

/* ------------------------------------------------------------------ */

if (failures.length > 0) {
  console.error(
    `\ninterview-pack-contract-check FAILED (${failures.length} of ${checks} checks):\n`,
  );
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error("");
  process.exit(1);
}

console.log(`interview-pack-contract-check passed`);
console.log(`  checks run:                 ${checks}`);
console.log(
  `  core questions verified:    ${CORE_QUESTIONS.length} (verbatim wording, order and type)`,
);
console.log(
  `  forbidden identifiers:      ${FORBIDDEN_IDENTIFIERS.length} across ${domainSources.length} files`,
);
console.log(
  `  AI provider markers:        ${AI_MARKERS.length} across ${domainSources.length} files`,
);
