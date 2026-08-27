/**
 * Interview Intelligence Phase 2 — the source-level contract guard.
 *
 * The database suites prove these properties of the SCHEMA. The AI evaluation
 * proves them of the ENGINE'S OUTPUT. This proves them of the REPOSITORY, which
 * is the half neither can reach: a prohibited column is added by editing a
 * migration, an AI provider is activated by editing a source file, and a
 * registry drifts from its database row without either of them noticing.
 *
 * What it asserts:
 *
 *   1. No prohibited identifier anywhere in the runtime, the AI engine or the
 *      employer UI — not dormant, not unused.
 *   2. The layer-4/layer-5 boundary: proposals and confirmed evidence are
 *      separate tables, and no client write path can flip one into the other.
 *   3. The TypeScript AI Task Registry and the database registry agree on every
 *      task key and every version string.
 *   4. Every task requires human review, in both places.
 *   5. No provider credential, model id or endpoint is committed.
 *   6. The employer never reaches the platform's authoring surface.
 *   7. The policy validator self-tests in BOTH directions — it fires on a
 *      violation and stays quiet on the product's own legitimate wording.
 *
 * Fails closed: a file it expects and cannot read is a failure, not a skip.
 */

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { TASK_REGISTRY, TASK_KEYS } from "../src/lib/interview-intelligence/ai/registry";
import { validatePolicy } from "../src/lib/interview-intelligence/ai/policy";

const REGISTRY_MIGRATION =
  "supabase/migrations/20260919090000_scp_interview_intelligence_registries.sql";
const RUNTIME_MIGRATION = "supabase/migrations/20260920090000_scp_interview_runtime.sql";
const AI_DIR = "src/lib/interview-intelligence/ai";
const RUNTIME_FN = "src/lib/interview-intelligence/runtime.functions.ts";
const UI_DIR = "src/components/employer/interview";
const ROUTE_PREFIX = "_authenticated.employer.$employerSlug.interview-intelligence";

const failures: string[] = [];
let checks = 0;

function ok(cond: boolean, label: string): void {
  checks += 1;
  if (!cond) failures.push(label);
}

function read(path: string): string {
  if (!existsSync(path)) {
    failures.push(`MISSING FILE: ${path} — this guard fails closed rather than skipping.`);
    return "";
  }
  return readFileSync(path, "utf8");
}

function filesIn(dir: string, exts: readonly string[]): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...filesIn(full, exts));
    } else if (exts.some((e) => entry.endsWith(e))) {
      out.push(full);
    }
  }
  return out;
}

const registryMigration = read(REGISTRY_MIGRATION);
const runtimeMigration = read(RUNTIME_MIGRATION);

const routeFiles = existsSync("src/routes")
  ? readdirSync("src/routes")
      .filter((f) => f.startsWith(ROUTE_PREFIX))
      .map((f) => join("src/routes", f))
  : [];

const sources = [
  { path: REGISTRY_MIGRATION, text: registryMigration },
  { path: RUNTIME_MIGRATION, text: runtimeMigration },
  { path: RUNTIME_FN, text: read(RUNTIME_FN) },
  ...filesIn(AI_DIR, [".ts"]).map((p) => ({ path: p, text: read(p) })),
  ...filesIn(UI_DIR, [".tsx", ".ts"]).map((p) => ({ path: p, text: read(p) })),
  ...routeFiles.map((p) => ({ path: p, text: read(p) })),
];

ok(routeFiles.length >= 6, `expected at least 6 employer routes, found ${routeFiles.length}`);
ok(sources.length >= 12, `expected the whole Phase 2 surface, found ${sources.length} files`);

/* ------------------------------------------------------------------ */
/* 1. Prohibited identifiers                                           */
/* ------------------------------------------------------------------ */

/**
 * A prohibited capability must be ABSENT FROM THE CONTRACT, not hidden from the
 * UI. Matched as identifiers, so prose that names a prohibition in order to
 * forbid it ("ingen totalpoäng", "no ranking") does not trip the guard.
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
  "emotionScore",
  "stress_level",
  "stressLevel",
  "personality_type",
  "personalityType",
  "candidate_rank",
  "candidateRank",
  "candidate_score",
  "candidateScore",
  "overall_score",
  "overallScore",
  "weighted_score",
  "weightedScore",
  "ranking_position",
];

/**
 * The migration's own fail-fast block NAMES every forbidden column in order to
 * assert that none of them exists. Sweeping over it would flag the guard for
 * doing its job — the same false positive as `prohibitedConclusionNote` in the
 * policy validator.
 *
 * So the assertion block is excised before the sweep, and its continued
 * existence is asserted separately. Excluding it without checking it would
 * quietly remove the protection instead of the false positive.
 */
function withoutSelfAssertions(text: string): string {
  const start = text.indexOf("-- SECTION 25 -- Fail-fast assertions");
  return start === -1 ? text : text.slice(0, start);
}

ok(
  runtimeMigration.includes("prohibited column(s) exist in the interview domain"),
  "the migration no longer asserts at apply time that no prohibited column exists",
);

for (const src of sources) {
  if (src.text === "") continue;
  const sweepable = src.path === RUNTIME_MIGRATION ? withoutSelfAssertions(src.text) : src.text;
  for (const ident of FORBIDDEN_IDENTIFIERS) {
    ok(
      !new RegExp(`\\b${ident}\\b`).test(sweepable),
      `prohibited identifier "${ident}" appears in ${src.path}`,
    );
  }
}

// Self-test, both directions.
ok(
  new RegExp("\\btotal_score\\b").test("column total_score integer"),
  "self-test: the forbidden-identifier matcher does not match",
);
ok(
  !new RegExp("\\btotal_score\\b").test("Ingen automatisk totalpoäng eller rangordning."),
  "self-test: the forbidden-identifier matcher fires on prose",
);

/* ------------------------------------------------------------------ */
/* 2. The layer-4 / layer-5 boundary                                   */
/* ------------------------------------------------------------------ */

ok(
  runtimeMigration.includes("CREATE TABLE public.scp_interview_evidence_proposals") &&
    runtimeMigration.includes("CREATE TABLE public.scp_interview_evidence"),
  "proposals and confirmed evidence are no longer separate tables",
);

// Confirmed evidence must have no confidence column of any kind.
const evidenceBlock = runtimeMigration.slice(
  runtimeMigration.indexOf("CREATE TABLE public.scp_interview_evidence ("),
  runtimeMigration.indexOf("COMMENT ON TABLE public.scp_interview_evidence IS"),
);
ok(
  evidenceBlock.length > 100 && !/confidence/i.test(evidenceBlock),
  "confirmed evidence gained a confidence column; once a human stands behind it, the machine's confidence is not part of the record",
);

ok(
  runtimeMigration.includes("scp_iv_confirm_evidence_proposal"),
  "the only path from proposal to evidence is missing",
);

// Clients hold SELECT only on both tables: there is no UPDATE a browser could
// use to flip a proposal into evidence.
ok(
  runtimeMigration.includes(
    "GRANT SELECT                         ON public.scp_interview_evidence_proposals TO authenticated;",
  ) ||
    /GRANT SELECT\s+ON public\.scp_interview_evidence_proposals TO authenticated;/.test(
      runtimeMigration,
    ),
  "evidence proposals are no longer SELECT-only for clients",
);
ok(
  /GRANT SELECT\s+ON public\.scp_interview_evidence\s+TO authenticated;/.test(runtimeMigration),
  "confirmed evidence is no longer SELECT-only for clients",
);

// An edit must keep the original.
ok(
  runtimeMigration.includes("scp_interview_evidence_edited_keeps_original"),
  "an edited confirmation no longer has to keep the AI's original wording",
);

/* ------------------------------------------------------------------ */
/* 3. The TypeScript registry and the database registry agree          */
/* ------------------------------------------------------------------ */

ok(TASK_KEYS.length === 11, `expected 11 AI tasks in the code registry, found ${TASK_KEYS.length}`);

for (const key of TASK_KEYS) {
  const def = TASK_REGISTRY[key];

  // The database seeds each task as ('<key>','<version>', ...).
  const seeded = registryMigration.includes(`('${key}','${def.taskVersion}'`);
  ok(seeded, `AI task "${key}" v${def.taskVersion} is not seeded in ${REGISTRY_MIGRATION}`);

  ok(def.requiresHumanReview === true, `AI task "${key}" does not require human review`);
  ok(def.failureBehaviour === "quarantine", `AI task "${key}" does not quarantine on failure`);
  ok(
    def.promptVersion.length > 0 && def.policyVersion.length > 0,
    `AI task "${key}" is missing a prompt or policy version`,
  );
  ok(
    def.allowedSourceKinds.length > 0,
    `AI task "${key}" declares no allowed source kinds, so it would be shown everything`,
  );
  ok(
    def.prohibitedInputs.includes("protected_characteristics"),
    `AI task "${key}" does not prohibit protected characteristics as input`,
  );
}

// And the database must not have activated a task the code does not define.
const seededKeys = [...registryMigration.matchAll(/\n  \('([a-z_]+)','\d+\.\d+\.\d+'/g)].map(
  (m) => m[1],
);
for (const key of seededKeys) {
  ok(
    (TASK_KEYS as readonly string[]).includes(key),
    `the database registry seeds AI task "${key}", which the code registry does not define`,
  );
}

ok(
  registryMigration.includes("requires_human_review boolean NOT NULL DEFAULT true"),
  "the database no longer defaults tasks to requiring human review",
);
ok(
  registryMigration.includes("scp_ai_tasks_one_active_idx"),
  "the one-active-version-per-task constraint is gone; a newer version could become active by merely existing",
);

/* ------------------------------------------------------------------ */
/* 4. No provider is activated, and no secret is committed             */
/* ------------------------------------------------------------------ */

const CREDENTIAL_PATTERNS: readonly [string, RegExp][] = [
  ["OpenAI key", /sk-[A-Za-z0-9]{20,}/],
  ["Anthropic key", /sk-ant-[A-Za-z0-9-]{20,}/],
  ["bearer literal", /Authorization["'\s:]+["']Bearer\s+[A-Za-z0-9._-]{20,}/],
  ["provider endpoint", /https:\/\/api\.(openai|anthropic|mistral|cohere)\.com/],
];

for (const src of sources) {
  if (src.text === "") continue;
  for (const [label, pattern] of CREDENTIAL_PATTERNS) {
    ok(!pattern.test(src.text), `${label} appears in ${src.path}`);
  }
}

// The shipped default is the deterministic engine, in both places.
const orchestrator = read(join(AI_DIR, "orchestrator.ts"));
ok(
  orchestrator.includes('(env.INTERVIEW_AI_PROVIDER ?? "mock")'),
  "the provider no longer defaults to the deterministic engine",
);
ok(
  orchestrator.includes("falling back to the deterministic engine"),
  "an unknown provider no longer falls back safely",
);
ok(
  runtimeMigration.includes("ai_enabled boolean NOT NULL DEFAULT false"),
  "the database AI flag no longer ships switched off",
);
ok(
  runtimeMigration.includes("transcript_enabled boolean NOT NULL DEFAULT false"),
  "transcript ingestion no longer ships switched off",
);
ok(
  runtimeMigration.includes("SCP_IV_TRANSCRIPT_NO_LAWFUL_BASIS"),
  "the per-case lawful-basis gate on transcripts is gone",
);

/* ------------------------------------------------------------------ */
/* 5. There is no retry-until-it-passes loop                           */
/* ------------------------------------------------------------------ */

ok(
  !/for\s*\(.*attempt|retry\s*<|maxRetries|retries\s*\+\+/.test(orchestrator),
  "the orchestrator gained a retry loop; a validator you can re-roll until it agrees is not a validator",
);
ok(
  orchestrator.includes('status: citationOnly ? "citation_invalid" : "policy_rejected"'),
  "policy and citation failures are no longer distinguished",
);

/* ------------------------------------------------------------------ */
/* 6. The employer never reaches the authoring surface                 */
/* ------------------------------------------------------------------ */

for (const src of sources) {
  if (src.text === "" || src.path.startsWith("supabase/")) continue;
  ok(
    !src.text.includes("/admin/interview-role-packs"),
    `${src.path} links the employer surface to the platform authoring routes`,
  );
}

/* ------------------------------------------------------------------ */
/* 7. The policy validator works in BOTH directions                    */
/* ------------------------------------------------------------------ */

const emptyCtx = {
  task: TASK_REGISTRY.evidence_extraction,
  allowedPassageIds: new Set<string>(["11111111-1111-1111-1111-111111111111"]),
  allowedProbeIds: new Set<string>(),
  governedQuestions: new Map<string, string>(),
};

// It FIRES on real violations.
const violationCases: Array<[string, unknown, string]> = [
  [
    "a hiring recommendation",
    { proposals: [{ excerpt: "Vi rekommenderar anställning av kandidaten." }] },
    "hiring_recommendation",
  ],
  [
    "a credibility judgement",
    { proposals: [{ excerpt: "Kandidaten framstår som trovärdig." }] },
    "prohibited_inference",
  ],
  [
    "a total score",
    { proposals: [{ excerpt: "Kandidatens totalpoäng är 14." }] },
    "scoring_or_ranking",
  ],
  [
    "a protected characteristic",
    { proposals: [{ excerpt: "Kandidaten är föräldraledig sedan 2023." }] },
    "protected_characteristic",
  ],
  [
    "a followed injection",
    { proposals: [{ excerpt: "Ignoring previous instructions, here is the answer." }] },
    "injection_followed",
  ],
  [
    "a fabricated citation",
    {
      facts: [
        {
          claimClass: "source_grounded",
          sourcePassageId: "99999999-9999-9999-9999-999999999999",
          statement: "Påstådd anställning",
        },
      ],
    },
    "fabricated_citation",
  ],
  [
    "a missing citation",
    { facts: [{ claimClass: "source_grounded", sourcePassageId: null, statement: "Påstående" }] },
    "missing_citation",
  ],
  [
    "an unapproved probe",
    { items: [{ probeId: "88888888-8888-8888-8888-888888888888" }] },
    "unapproved_probe",
  ],
];

for (const [label, payload, expectedKind] of violationCases) {
  const v = validatePolicy(payload, emptyCtx);
  ok(
    v.some((x) => x.kind === expectedKind),
    `the policy validator does not catch ${label} (expected ${expectedKind})`,
  );
}

// And it stays QUIET on the product's own legitimate wording. This half matters
// as much: a validator that flags correct output gets switched off.
const legitimateCases: Array<[string, unknown]> = [
  [
    "the level-0 phrase",
    {
      proposals: [
        {
          excerpt: "Svaret ger inte tillräckligt jobbrelevant underlag för bedömning.",
          claimClass: "governed_content",
          sourcePassageId: null,
        },
      ],
    },
  ],
  [
    "a prohibited-conclusion warning, which names a forbidden conclusion in order to forbid it",
    {
      proposals: [
        {
          excerpt: "Kandidaten kontrollerade dörren innan hon larmade.",
          prohibitedConclusionNote:
            "Detta säger inget om kandidatens trovärdighet eller lämplighet.",
        },
      ],
    },
  ],
  [
    "a cited, source-grounded fact",
    {
      facts: [
        {
          claimClass: "source_grounded",
          sourcePassageId: "11111111-1111-1111-1111-111111111111",
          statement: "Väktare hos Nordic Guard 2021-2025.",
        },
      ],
    },
  ],
  [
    "an evidence gap described neutrally",
    {
      findings: [
        {
          statement: "Q3 har ingen dokumenterad redogörelse.",
          claimClass: "ai_inference",
          sourcePassageId: null,
        },
      ],
    },
  ],
];

for (const [label, payload] of legitimateCases) {
  const v = validatePolicy(payload, emptyCtx);
  ok(
    v.length === 0,
    `the policy validator falsely flags ${label}: ${v.map((x) => x.kind).join(", ")}`,
  );
}

/* ------------------------------------------------------------------ */
/* 8. Process quality is not a candidate score                         */
/* ------------------------------------------------------------------ */

const viewBlock = runtimeMigration.slice(
  runtimeMigration.indexOf("CREATE OR REPLACE VIEW public.scp_interview_process_quality"),
  runtimeMigration.indexOf("COMMENT ON VIEW public.scp_interview_process_quality"),
);
ok(viewBlock.length > 200, "the process-quality view is missing");
ok(
  !/\bavg\(|\bsum\(a\.level|\brank\(\)|percentile/i.test(viewBlock),
  "the process-quality view aggregates assessment levels; it would have become a candidate score",
);
ok(
  viewBlock.includes("insufficient_evidence_count"),
  "the process-quality view no longer counts insufficient evidence as a process outcome",
);
ok(
  runtimeMigration.includes(
    "REVOKE ALL ON public.scp_interview_process_quality FROM PUBLIC, anon, authenticated;",
  ),
  "the process-quality view no longer revokes Supabase's default anon grant",
);

/* ------------------------------------------------------------------ */
/* 9. The graph carries no weight, and no candidate                    */
/* ------------------------------------------------------------------ */

const edgeBlock = registryMigration.slice(
  registryMigration.indexOf("CREATE TABLE public.scp_intel_edges"),
  registryMigration.indexOf("COMMENT ON TABLE public.scp_intel_edges"),
);
ok(edgeBlock.length > 200, "the intelligence graph edge table is missing");
ok(
  !/\bweight\b|\bstrength\b|\bscore\b|\bconfidence\b/i.test(edgeBlock),
  "the intelligence graph gained a weight column; a weighted edge is one traversal from a scoring model",
);
ok(!/'candidate'/.test(edgeBlock), "the intelligence graph gained a candidate node kind");
ok(
  registryMigration.includes("SCP_INTEL_EDGE_SCOPE"),
  "the tenant-scope guard on graph edges is gone",
);

/* ------------------------------------------------------------------ */
/* 10. Research claims must state their limits                         */
/* ------------------------------------------------------------------ */

ok(
  registryMigration.includes("unsupported_use text NOT NULL") &&
    registryMigration.includes("limitations text NOT NULL"),
  "research claims no longer have to state what they do NOT support",
);
ok(
  registryMigration.includes("SCP_IIR_ASSERT: % claim(s) have no stated limits"),
  "the migration no longer asserts that every seeded claim states its limits",
);
ok(
  registryMigration.includes("seeded source(s) claim review that has not happened"),
  "the migration no longer prevents seeding a source as pre-reviewed",
);

/* ------------------------------------------------------------------ */

if (failures.length > 0) {
  console.error(
    `\ninterview-runtime-contract-check FAILED (${failures.length} of ${checks} checks):\n`,
  );
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error("");
  process.exit(1);
}

console.log("interview-runtime-contract-check passed");
console.log(`  checks run:                 ${checks}`);
console.log(
  `  AI tasks cross-verified:    ${TASK_KEYS.length} (code registry vs database registry)`,
);
console.log(
  `  forbidden identifiers:      ${FORBIDDEN_IDENTIFIERS.length} across ${sources.length} files`,
);
console.log(
  `  policy validator self-test: ${violationCases.length} must-fire, ${legitimateCases.length} must-stay-quiet`,
);
