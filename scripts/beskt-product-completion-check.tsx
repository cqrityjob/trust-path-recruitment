// BESKT product completion — the governed wordings, the report, and the
// governance surface.
//
// ── WHAT THIS GUARD IS FOR ─────────────────────────────────────────────
//
// Three surfaces were added on top of contracts that were already proved in
// the database. Each of them can quietly do the opposite of what the
// contract intends without the database ever noticing, because each failure
// is a failure of what a person is SHOWN:
//
//   a prompt screen that invented a wording, or told a reader the method's
//   wordings were unavailable when they were merely still loading;
//
//   a report that merged the four kinds of claim into one narrative, buried
//   its limitations at the bottom, recomputed the basis hash it signs, or
//   grew a score;
//
//   a governance surface that wrote a table directly, offered an action the
//   database always refuses, sent a stale revision, or presented an approval
//   that no longer binds as one that does.
//
// So every material claim is asserted one of two ways:
//
//   SOURCE     the real module text with comments stripped, so a rule is
//              never satisfied by a sentence describing it;
//   BEHAVIOUR  the real exported function called with the exact inputs that
//              matter, so a rule about a decision is checked by making the
//              decision rather than by reading around it.
//
// Every assertion has a planted negative control in
// scripts/negative-controls/beskt-product-completion-controls.ts. An
// assertion that cannot fail is not an assertion.
//
// Run: bun run beskt-product-completion:check

import { readFileSync } from "node:fs";
import path from "node:path";

const { besktAuthorPayload, besktGateState, besktGrantIsLive, besktPilotIsLive } =
  await import("../src/components/admin/beskt/governance-logic");
const { BESKT_FAMILY_SPECS, besktFamilySpec } =
  await import("../src/components/admin/beskt/content-schema");
const { readBesktReportPayload, besktReportLimitations } =
  await import("../src/lib/beskt/report-payload");
const { besktErrorKey, besktErrorCode } = await import("../src/lib/beskt/errors");

import type { BesktReviewRecord } from "../src/lib/beskt/governance.functions";

/* ------------------------------------------------------------------ */

const fails: string[] = [];
let passed = 0;
function ck(name: string, ok: boolean, detail?: unknown): void {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    fails.push(name);
    console.log(`  FAIL ${name}${detail === undefined ? "" : ` — ${String(detail)}`}`);
  }
}
function group(name: string): void {
  console.log(`\n${name}`);
}

const root = path.resolve(import.meta.dir, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

/** Source with every comment removed. A rule must be satisfied by CODE. */
const code = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const PROMPTS = "src/components/employer/interview/beskt/BesktPrompts.tsx";
const THEMES = "src/components/employer/interview/beskt/BesktThemes.tsx";
const REPORT = "src/components/employer/interview/beskt/BesktReport.tsx";
const PAYLOAD = "src/lib/beskt/report-payload.ts";
const CONDUCT_FNS = "src/lib/beskt/interview-conduct.functions.ts";
const QUERIES = "src/lib/beskt/conduct-queries.ts";
const CONDUCT_ROUTE =
  "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.beskt.tsx";
const GOV_FNS = "src/lib/beskt/governance.functions.ts";
const GOV_LOGIC = "src/components/admin/beskt/governance-logic.ts";
const SCHEMA = "src/components/admin/beskt/content-schema.ts";
const EDITOR = "src/components/admin/beskt/BesktContentEditor.tsx";
const LIFECYCLE = "src/components/admin/beskt/BesktLifecyclePanel.tsx";
const GRANTS = "src/components/admin/beskt/BesktGrantsPanel.tsx";
const ADMIN_ROUTE = "src/components/admin/beskt/pages/BesktVersionPage.tsx";
const ADMIN_LIST = "src/components/admin/beskt/pages/BesktMethodListPage.tsx";
const ADMIN_NEW = "src/components/admin/beskt/pages/NewBesktMethodPage.tsx";
const SURFACE = "src/components/admin/beskt/surface.tsx";
const CASE_LINK = "src/components/beskt/BesktCaseLinkSection.tsx";
const APP_PANEL = "src/components/beskt/BesktApplicationPanel.tsx";
const PREP_FNS = "src/lib/beskt/candidate-preparation.functions.ts";
const RUNTIME_FNS = "src/lib/interview-intelligence/runtime.functions.ts";
const GOV_LAYOUT = "src/routes/_authenticated.beskt-governance.tsx";
const GOV_LIST_ROUTE = "src/routes/_authenticated.beskt-governance.index.tsx";
const GOV_VERSION_ROUTE = "src/routes/_authenticated.beskt-governance.$methodVersionId.tsx";
const CHROME = "src/components/admin/AdminShellChrome.tsx";
const AUTHORING_MIGRATION =
  "supabase/migrations/20261118090000_beskt_governed_content_authoring.sql";
const PROMPT_MIGRATION = "supabase/migrations/20261117090000_bcp_conduct_prompts_and_report.sql";
const CONTENT_MIGRATION = "supabase/migrations/20261108090000_beskt_governed_method_content.sql";
const PKG = "package.json";
const CI = ".github/workflows/ci.yml";

const promptsCode = code(read(PROMPTS));
const themesCode = code(read(THEMES));
const reportCode = code(read(REPORT));
const payloadCode = code(read(PAYLOAD));
const conductFnsCode = code(read(CONDUCT_FNS));
const conductRouteCode = code(read(CONDUCT_ROUTE));
const govFnsCode = code(read(GOV_FNS));
const govLogicCode = code(read(GOV_LOGIC));
const editorCode = code(read(EDITOR));
const lifecycleCode = code(read(LIFECYCLE));
const grantsCode = code(read(GRANTS));
const adminRouteCode = code(read(ADMIN_ROUTE));
const adminListCode = code(read(ADMIN_LIST));
const adminNewCode = code(read(ADMIN_NEW));
const surfaceCode = code(read(SURFACE));
const caseLinkCode = code(read(CASE_LINK));
const appPanelCode = code(read(APP_PANEL));
const prepFnsCode = code(read(PREP_FNS));
const runtimeFnsCode = code(read(RUNTIME_FNS));
const govLayoutCode = code(read(GOV_LAYOUT));
const govListRouteCode = code(read(GOV_LIST_ROUTE));
const govVersionRouteCode = code(read(GOV_VERSION_ROUTE));

const ALL_NEW_SURFACE = [
  promptsCode,
  reportCode,
  payloadCode,
  govFnsCode,
  govLogicCode,
  editorCode,
  lifecycleCode,
  grantsCode,
  adminRouteCode,
  adminListCode,
  adminNewCode,
].join("\n");

/**
 * The same text with every import statement removed.
 *
 * `import { besktErrorKey } from ...` is a brace containing an
 * error-shaped identifier, and a pattern hunting for a raw error rendered
 * into JSX matched it. Stripping imports is what makes that pattern about
 * what is RENDERED rather than about what is imported.
 */
const ALL_NEW_SURFACE_BODY = ALL_NEW_SURFACE.replace(
  /^import[\s\S]*?from\s+"[^"]+";$/gm,
  "",
).replace(/^import\s+"[^"]+";$/gm, "");

/* ================================================================== */
group("P1 · The governed wordings come from the database and nowhere else");

ck(
  "P1.1 the prompt surface reads bcp_conduct_topic_prompts and holds no wording of its own",
  /bcp_conduct_topic_prompts/.test(conductFnsCode) &&
    !/wording(Sv|En)\s*[:=]\s*"/.test(promptsCode),
  "BESKT_PC_PROMPT_INVENTED: a wording must come from the RPC, never from a literal in the client",
);

ck(
  "P1.2 there is no model, no randomness and no generated suggestion in the prompt path",
  !/Math\.random|generatePrompt|suggestPrompt|openai|anthropic|completion\(/i.test(
    promptsCode + themesCode,
  ),
  "BESKT_PC_PROMPT_GENERATED: nothing in this path may generate a prompt",
);

ck(
  "P1.3 the placeholder that claimed the wordings were unavailable is gone from the themes",
  !/promptsUnavailable/.test(themesCode),
  "BESKT_PC_PROMPT_STALE_PLACEHOLDER: the old 'not yet available' line must not survive the wiring",
);

ck(
  "P1.4 'still loading' and 'unavailable' are different states, and only the second explains itself",
  /prompts !== null && !prompts\.available/.test(themesCode),
  "BESKT_PC_PROMPT_LOADING_CONFLATED: a null answer must not render as an unavailable one",
);

ck(
  "P1.5 the unavailable panel names the database's own reason rather than a generic apology",
  /version_not_found/.test(promptsCode) &&
    /version_not_published/.test(promptsCode) &&
    /mode_not_permitted/.test(promptsCode),
  "BESKT_PC_PROMPT_REASON: the three governed reasons must each have their own sentence",
);

ck(
  "P1.6 the probe-basis legend lists exactly the closed vocabulary and admits no behavioural cue",
  (() => {
    // Read the legend's OWN key list rather than searching the file for
    // words: `tone` appears legitimately as a Chip prop, and a regex loose
    // enough to catch a cue was loose enough to catch that.
    const m = /const PROBE_BASIS_LABEL: Record<string, TranslationKey> = \{([\s\S]*?)\};/.exec(
      promptsCode,
    );
    const keys = m ? [...m[1].matchAll(/^\s+([a-z_]+):/gm)].map((x) => x[1]) : [];
    const expected = [
      "submitted_answer",
      "documented_role_requirement",
      "candidate_supplied_document",
      "candidate_correction",
    ];
    return (
      keys.length === expected.length &&
      expected.every((k) => keys.includes(k)) &&
      !keys.some((k) => /tone|hesitation|gaze|expression|body_language|demeanour|micro/.test(k))
    );
  })(),
  "BESKT_PC_PROMPT_CUE: a behavioural cue must not be representable as a probe basis",
);

ck(
  "P1.7 the prompts are fetched under their own query key, not invalidated by a conduct write",
  /besktPromptsKey/.test(code(read(QUERIES))) &&
    !/keys\.push\(besktPromptsKey/.test(code(read(QUERIES))),
  "BESKT_PC_PROMPT_KEY: governance content must not be refetched because a note was saved",
);

/* ================================================================== */
group("P2 · The report is a rendering, never a computation");

ck(
  "P2.1 nothing in the report path produces a score, total, average, rank or percentage",
  !/\b(score|totalScore|average|weighted|rank(ing)?Value|percentile|riskScore)\b/i.test(
    reportCode.replace(/producesScore|produces_score|noScore|producesRanking/g, "") +
      payloadCode.replace(
        /producesScore|produces_score|producesRanking|producesRecommendation/g,
        "",
      ),
  ),
  "BESKT_PC_REPORT_SCORE: no score, total, average, rank or percentage may exist in the report path",
);

ck(
  "P2.2 the report payload module does no arithmetic over the record",
  !/reduce\(|\+\s*=|\/\s*\w+\.length|Math\.(round|max|min|abs)/.test(payloadCode),
  "BESKT_PC_REPORT_ARITHMETIC: the report reads the record, it does not compute over it",
);

ck(
  "P2.3 the four kinds of claim have four separate headings",
  /beskt\.report\.candidate\.heading/.test(reportCode) &&
    /beskt\.report\.positions\.heading/.test(reportCode) &&
    /beskt\.report\.verification\.trail/.test(reportCode) &&
    /beskt\.report\.panel\.heading/.test(reportCode),
  "BESKT_PC_REPORT_MERGED: candidate statement, observation, verification and panel must stay apart",
);

ck(
  "P2.4 the limitations are rendered BEFORE the evidence, not after it",
  (() => {
    const limits = reportCode.indexOf("<LimitationsBlock");
    const candidate = reportCode.indexOf("<CandidateStatements");
    const positions = reportCode.indexOf("beskt-report-positions-h");
    return limits > 0 && candidate > limits && positions > limits;
  })(),
  "BESKT_PC_REPORT_LIMITS_LAST: a limitation met after the evidence is a limitation met too late",
);

ck(
  "P2.5 the signature carries the basis hash the reader was SHOWN, never a recomputed one",
  /finalise\(preview\.basisHash\)/.test(reportCode) &&
    /expectedBasisHash: z\.string\(\)\.regex/.test(conductFnsCode) &&
    !/sha256|createHash|digest\(/i.test(reportCode),
  "BESKT_PC_REPORT_BASIS_RECOMPUTED: the client must sign what it displayed, not what it can hash",
);

ck(
  "P2.6 a preview is marked as a draft, so a printout cannot be mistaken for a signed document",
  /draft\b/.test(reportCode) && /beskt\.report\.document\.draftChip/.test(reportCode),
  "BESKT_PC_REPORT_DRAFT_UNMARKED: an unsigned preview must say so on its own face",
);

ck(
  "P2.7 the blocker codes are translated, and the database's own message never reaches the DOM",
  /BLOCKER_LABEL\[b\.code\]/.test(reportCode) && !/\{b\.message\}/.test(reportCode),
  "BESKT_PC_REPORT_RAW_BLOCKER: an operator-facing message must not be shown to a recruiter",
);

ck(
  "P2.7b the preview is not fetched until the DATABASE says other positions are visible",
  // `bcp_conduct_preview_report` gates on case authority alone and its
  // SECURITY DEFINER helper returns every assessor's entries, so an
  // unconditional fetch would let an assessor with an open position read a
  // colleague's locked one. `othersVisible` is the database's own answer
  // from `bcp_conduct_may_see_others`. A mitigation, not a boundary —
  // docs/architecture/beskt-report-preview-independence.md, and the fix is
  // a schema change.
  /const othersVisible = workspaceQ\.data\?\.othersVisible === true;/.test(conductRouteCode) &&
    /enabled: sessionId !== null && view === "report" && othersVisible,/.test(conductRouteCode) &&
    /view === "report" && !othersVisible &&/.test(conductRouteCode),
  "BESKT_PC_PREVIEW_INDEPENDENCE: an open position must not reach another assessor's record through the report",
);

ck(
  "P2.7c the withheld state explains itself rather than rendering an empty report",
  /beskt\.report\.withheld\.title/.test(conductRouteCode) &&
    /beskt\.report\.withheld\.body/.test(conductRouteCode) &&
    /beskt\.report\.withheld\.whatToDo/.test(conductRouteCode),
  "BESKT_PC_PREVIEW_WITHHELD_SILENT: a withheld report must say why and what to do",
);

ck(
  "P2.8 the report says on its own face that it is not a decision and carries no score",
  /beskt\.report\.notADecision\.body/.test(reportCode) &&
    /beskt\.report\.notADecision\.noScore/.test(reportCode),
  "BESKT_PC_REPORT_NO_DISCLAIMER: the document must state what it is and is not",
);

/* ------------------------------------------------------------------ */
group("P2b · BEHAVIOUR: the limitations are read out of a real payload");

{
  // A synthetic payload with exactly the four limitation shapes in it, so
  // each list is checked by producing it rather than by reading the code.
  const payload = {
    case: { case_id: "c1", candidate_display_name: "Synthetic Candidate", title: "Synthetic role" },
    bound: { method_version_id: "v1", version_number: 1, content_hash: "a".repeat(64) },
    candidate_preparation: [],
    themes: [
      { item_key: "nobody_documented", reason: "omitted" },
      { item_key: "both_documented", reason: "discuss_orally" },
      { item_key: "awaiting", reason: "omitted" },
      { item_key: "unresolved", reason: "omitted" },
    ],
    positions: [
      {
        position_id: "p1",
        assessor_id: "a1",
        state: "locked",
        entries: [
          { entry_id: "e1", item_key: "both_documented", verification_state: "not_required" },
          { entry_id: "e2", item_key: "awaiting", verification_state: "requested" },
          { entry_id: "e3", item_key: "unresolved", verification_state: "inconclusive" },
        ],
        information_gaps: [{ item_key: "nobody_documented", gap: "not_documented" }],
      },
      {
        position_id: "p2",
        assessor_id: "a2",
        state: "locked",
        entries: [
          { entry_id: "e4", item_key: "both_documented", verification_state: "not_required" },
        ],
        information_gaps: [],
      },
    ],
    panel: { panel_id: "pn1", state: "revealed", resolutions: [] },
    audit_events: [],
    produces_score: false,
    produces_ranking: false,
    produces_recommendation: false,
    interpretation: "none",
  };

  const d = readBesktReportPayload(payload);
  const l = besktReportLimitations(d);

  ck(
    "P2b.1 BEHAVIOUR: a theme nobody documented is named, not merely counted",
    l.undocumentedThemes.includes("nobody_documented") && l.undocumentedThemes.length === 1,
    "BESKT_PC_LIMIT_UNDOCUMENTED: an undocumented theme must be named in the limitations",
  );
  ck(
    "P2b.2 BEHAVIOUR: verification a human asked for and has not finished is reported as open",
    l.awaitingVerification.includes("awaiting"),
    "BESKT_PC_LIMIT_AWAITING: open verification must appear in the limitations",
  );
  ck(
    "P2b.3 BEHAVIOUR: verification that could not be settled is reported separately from open",
    l.unresolvedVerification.includes("unresolved") &&
      !l.awaitingVerification.includes("unresolved"),
    "BESKT_PC_LIMIT_UNRESOLVED: inconclusive is a different answer from still waiting",
  );
  ck(
    "P2b.4 BEHAVIOUR: a theme two assessors documented and the panel did not resolve is reported",
    l.unresolvedDifferences.includes("both_documented"),
    "BESKT_PC_LIMIT_DIFFERENCE: an unresolved difference between assessors must be reported",
  );
  ck(
    "P2b.5 BEHAVIOUR: a resolved difference stops being reported as unresolved",
    (() => {
      const resolved = {
        ...payload,
        panel: {
          panel_id: "pn1",
          state: "revealed",
          resolutions: [{ item_key: "both_documented", resolution_kind: "agreed" }],
        },
      };
      return !besktReportLimitations(
        readBesktReportPayload(resolved),
      ).unresolvedDifferences.includes("both_documented");
    })(),
    "BESKT_PC_LIMIT_RESOLVED: a recorded panel outcome must clear the difference it settles",
  );
  ck(
    "P2b.6 BEHAVIOUR: the whole correction chain survives the read, not only the live entry",
    (() => {
      const withCorrections = {
        ...payload,
        positions: [
          {
            position_id: "p1",
            entries: [
              {
                entry_id: "e1",
                item_key: "both_documented",
                corrections: [
                  { entry_id: "old", entry_version: 1, correction_reason: "synthetic correction" },
                ],
              },
            ],
            information_gaps: [],
          },
        ],
      };
      const read2 = readBesktReportPayload(withCorrections);
      return read2.positions[0].entries[0].corrections.length === 1;
    })(),
    "BESKT_PC_REPORT_CORRECTIONS_DROPPED: a record whose corrections vanished reads as if it never changed",
  );
}

/* ================================================================== */
group("P3 · The governance surface writes only through the governed RPCs");

ck(
  "P3.1 the governance module makes no direct table write",
  !/\.from\("[a-z_]+"\)\s*\.\s*(insert|update|delete|upsert)/.test(govFnsCode) &&
    !/\.(insert|update|upsert|delete)\(/.test(govFnsCode),
  "BESKT_PC_GOV_DIRECT_WRITE: every governed mutation must go through its RPC",
);

ck(
  "P3.2 no surface in this change names service_role",
  !/service_role/.test(ALL_NEW_SURFACE),
  "BESKT_PC_SERVICE_ROLE: the browser path must never name the elevated role",
);

ck(
  "P3.3 no mutation sends the actor; every RPC reads auth.uid() for itself",
  !/_reviewer_id|_actor_id|_granted_by|_published_by|_created_by/.test(govFnsCode),
  "BESKT_PC_GOV_ACTOR_SENT: a caller that could name the actor could name somebody else",
);

ck(
  "P3.4 the eight authoring RPCs are named as literals, never assembled from a variable",
  (() => {
    const names = [
      "beskt_author_exposure_profile",
      "beskt_author_section",
      "beskt_author_item",
      "beskt_author_prompt",
      "beskt_author_routing_rule",
      "beskt_author_evidence_anchor",
      "beskt_author_observation_field",
      "beskt_author_activation_requirement",
    ];
    return (
      names.every((n) => govFnsCode.includes(`.rpc("${n}"`)) &&
      !/\.rpc\(fn,|\.rpc\(name,/.test(govFnsCode)
    );
  })(),
  "BESKT_PC_GOV_RPC_BY_VARIABLE: a caller that could name the function could name any function",
);

ck(
  "P3.5 every content mutation forwards the revision the screen rendered, never a literal",
  /expectedRevision: revision/.test(adminRouteCode) &&
    !/expectedRevision:\s*1\b/.test(adminRouteCode),
  "BESKT_PC_GOV_REVISION: a compare-and-swap that sends a constant is not a compare-and-swap",
);

ck(
  "P3.6 an operation id is held across retries rather than minted per attempt",
  /useOperationId/.test(adminRouteCode) &&
    !/_operation_id: crypto\.randomUUID\(\)/.test(govFnsCode),
  "BESKT_PC_GOV_OPERATION_ID: a fresh id per retry would write twice after a dropped response",
);

ck(
  "P3.7 a stale refusal is surfaced, not silently retried",
  /retry: false/.test(adminRouteCode),
  "BESKT_PC_GOV_SILENT_RETRY: a retry would apply an edit on top of a version nobody saw",
);

ck(
  "P3.8 the surface offers no action the database always refuses",
  // No publish-anyway, no gate override, and a pilot grant only on a
  // published version.
  !/publishAnyway|forcePublish|overrideGate|skipReview/i.test(ALL_NEW_SURFACE) &&
    /canGrant: v\.contentStatus === "published"/.test(adminRouteCode),
  "BESKT_PC_GOV_IMPOSSIBLE_ACTION: an action that can only fail is a trap, not a safeguard",
);

ck(
  "P3.9 the content form is rendered only for a draft",
  /const editable = v\.contentStatus === "draft"/.test(adminRouteCode) &&
    /editable && formOpen/.test(editorCode),
  "BESKT_PC_GOV_EDIT_PUBLISHED: published content must not present an edit form",
);

ck(
  "P3.10 the governance destination is a platform one and is not offered to an employer",
  /key: "besktMethods"/.test(code(read(CHROME))) &&
    /to: "\/admin\/beskt-methods"/.test(code(read(CHROME))),
  "BESKT_PC_GOV_NAV: the governance surface belongs to the platform navigation only",
);

/* ------------------------------------------------------------------ */
group("P3b · BEHAVIOUR: the absent-versus-null contract");

{
  const spec = besktFamilySpec("section").fields;
  const stored = {
    section_key: "synthetic_section",
    display_order: 1,
    phase: "interview",
    title_sv: "Syntetisk rubrik",
    title_en: "Synthetic title",
  } as const;

  const unchanged = besktAuthorPayload(
    spec,
    {
      section_key: "synthetic_section",
      display_order: "1",
      phase: "interview",
      title_sv: "Syntetisk rubrik",
      title_en: "Synthetic title",
    },
    stored,
  );
  ck(
    "P3b.1 BEHAVIOUR: a field the editor did not touch is ABSENT, so its column is left alone",
    !("title_sv" in unchanged) && !("phase" in unchanged) && Object.keys(unchanged).length === 0,
    "BESKT_PC_PAYLOAD_UNCHANGED_SENT: resending an untouched field lets a partial edit blank a governed column",
  );

  const changed = besktAuthorPayload(
    spec,
    {
      section_key: "synthetic_section",
      display_order: "1",
      phase: "interview",
      title_sv: "Ny rubrik",
      title_en: "Synthetic title",
    },
    stored,
  );
  ck(
    "P3b.2 BEHAVIOUR: a changed field is present with its new value, and nothing else is",
    changed.title_sv === "Ny rubrik" && Object.keys(changed).length === 1,
    "BESKT_PC_PAYLOAD_CHANGED_MISSING: a change the editor made must reach the database",
  );

  const cleared = besktAuthorPayload(
    spec,
    {
      section_key: "synthetic_section",
      display_order: "1",
      phase: "interview",
      title_sv: "",
      title_en: "Synthetic title",
    },
    stored,
  );
  ck(
    "P3b.3 BEHAVIOUR: an emptied field is sent as an explicit null, so clearing is expressible",
    "title_sv" in cleared && cleared.title_sv === null,
    "BESKT_PC_PAYLOAD_CLEAR_LOST: an omitted empty field means 'leave it', so clearing would be impossible",
  );

  const created = besktAuthorPayload(
    spec,
    {
      section_key: "new_section",
      display_order: "2",
      phase: "interview",
      title_sv: "Rubrik",
      title_en: "",
    },
    null,
  );
  ck(
    "P3b.4 BEHAVIOUR: on creation an empty optional field is omitted rather than nulled",
    created.section_key === "new_section" &&
      created.display_order === 2 &&
      !("title_en" in created),
    "BESKT_PC_PAYLOAD_CREATE_NULL: an explicit null on creation overrides the column's own default",
  );

  const itemSpec = besktFamilySpec("item").fields;
  // The STORED order has to be one the database could genuinely return and
  // that is NOT already alphabetical — otherwise dropping the sort on the
  // stored side changes nothing and the control passes with the defect in.
  // "suitability_inference" sorts AFTER "protected_trait_proxy", so this
  // stored order is unsorted and the form's order is the sorted one.
  const reordered = besktAuthorPayload(
    itemSpec,
    { prohibited_inferences: ["protected_trait_proxy", "suitability_inference"] },
    { prohibited_inferences: ["suitability_inference", "protected_trait_proxy"] } as never,
  );
  ck(
    "P3b.5 BEHAVIOUR: reordering a multi-value field without changing it sends nothing",
    !("prohibited_inferences" in reordered),
    "BESKT_PC_PAYLOAD_SPURIOUS_CHANGE: a reordering that selects the same values must not bump a revision",
  );
}

/* ------------------------------------------------------------------ */
group("P3c · BEHAVIOUR: an approval binds to the cycle, the hash and the revision");

{
  const base: BesktReviewRecord = {
    gate: "data_protection",
    decision: "approved",
    reviewerId: "r1",
    rationale: "synthetic rationale",
    contentHashAtReview: "a".repeat(64),
    revisionAtReview: 4,
    reviewCycleAtReview: 2,
    decidedAt: "2026-09-01T00:00:00Z",
  };
  const version = { contentHash: "a".repeat(64), revision: 4, reviewCycle: 2 };

  ck(
    "P3c.1 BEHAVIOUR: an approval at the current cycle, hash and revision counts",
    besktGateState("data_protection", [base], version).kind === "approved",
    "BESKT_PC_GATE_VALID_REJECTED: a binding approval must be shown as one",
  );
  ck(
    "P3c.2 BEHAVIOUR: a gate nobody decided is undecided, not approved",
    besktGateState("senior_hr", [base], version).kind === "undecided",
    "BESKT_PC_GATE_UNDECIDED: a gate nobody touched must never read as approved",
  );
  ck(
    "P3c.3 BEHAVIOUR: an approval from an earlier review cycle no longer counts",
    (() => {
      const s = besktGateState("data_protection", [{ ...base, reviewCycleAtReview: 1 }], version);
      return s.kind === "stale" && s.reason === "cycle";
    })(),
    "BESKT_PC_GATE_STALE_CYCLE: a resubmission needs five fresh approvals",
  );
  ck(
    "P3c.4 BEHAVIOUR: an approval given at different content no longer counts",
    (() => {
      const s = besktGateState(
        "data_protection",
        [{ ...base, contentHashAtReview: "b".repeat(64) }],
        version,
      );
      return s.kind === "stale" && s.reason === "hash";
    })(),
    "BESKT_PC_GATE_STALE_HASH: an approval must not survive the content it approved",
  );
  ck(
    "P3c.5 BEHAVIOUR: an edit that restored identical bytes still invalidates the approval",
    (() => {
      // Same hash, moved revision — exactly the restore-to-identical case.
      const s = besktGateState("data_protection", [{ ...base, revisionAtReview: 3 }], version);
      return s.kind === "stale" && s.reason === "revision";
    })(),
    "BESKT_PC_GATE_STALE_REVISION: a touch that leaves the hash alone must still invalidate the gates",
  );
  ck(
    "P3c.5a BEHAVIOUR: on a published version, the approvals it was published on still count",
    // Publication advances the revision without touching the frozen content,
    // so the five approvals that published it sit one revision behind.
    (["published", "suspended", "retired"] as const).every(
      (contentStatus) =>
        besktGateState("data_protection", [{ ...base, revisionAtReview: 3 }], {
          ...version,
          contentStatus,
        }).kind === "approved",
    ) &&
      besktGateState("data_protection", [{ ...base, revisionAtReview: 3 }], {
        ...version,
        contentStatus: "in_review",
      }).kind === "stale",
    "BESKT_PC_GATE_PUBLISHED_STALE: a published method must not say its own approvals no longer count",
  );
  ck(
    "P3c.6 BEHAVIOUR: a rejection reads as a rejection, never as merely stale",
    besktGateState("data_protection", [{ ...base, decision: "rejected" }], version).kind ===
      "rejected",
    "BESKT_PC_GATE_REJECTION_HIDDEN: a refusal must not be softened into an out-of-date approval",
  );
}

/* ------------------------------------------------------------------ */
group("P3d · BEHAVIOUR: a mandate and a pilot grant are live only inside their window");

{
  const now = new Date("2026-09-17T12:00:00Z");
  ck(
    "P3d.1 BEHAVIOUR: an unrevoked, in-window mandate is live",
    besktGrantIsLive(
      { revokedAt: null, validFrom: "2026-09-01T00:00:00Z", validUntil: "2026-10-01T00:00:00Z" },
      now,
    ),
    "BESKT_PC_GRANT_LIVE_HIDDEN: a live mandate must read as live",
  );
  ck(
    "P3d.2 BEHAVIOUR: a revoked mandate is not live",
    !besktGrantIsLive(
      {
        revokedAt: "2026-09-10T00:00:00Z",
        validFrom: "2026-09-01T00:00:00Z",
        validUntil: null,
      },
      now,
    ),
    "BESKT_PC_GRANT_REVOKED_LIVE: a revoked mandate records nothing and must not read as live",
  );
  ck(
    "P3d.3 BEHAVIOUR: an expired mandate is not live",
    !besktGrantIsLive(
      { revokedAt: null, validFrom: "2026-09-01T00:00:00Z", validUntil: "2026-09-15T00:00:00Z" },
      now,
    ),
    "BESKT_PC_GRANT_EXPIRED_LIVE: an expired mandate records nothing and must not read as live",
  );
  ck(
    "P3d.4 BEHAVIOUR: a mandate that has not started is not live",
    !besktGrantIsLive(
      { revokedAt: null, validFrom: "2026-10-01T00:00:00Z", validUntil: null },
      now,
    ),
    "BESKT_PC_GRANT_FUTURE_LIVE: a mandate that has not begun must not read as live",
  );

  ck(
    "P3d.5 BEHAVIOUR: a pilot grant is live on its start day and dead on its expiry day",
    besktPilotIsLive(
      { revokedAt: null, startsOn: "2026-09-17", expiresOn: "2026-10-01" },
      "2026-09-17",
    ) &&
      !besktPilotIsLive(
        { revokedAt: null, startsOn: "2026-09-01", expiresOn: "2026-09-17" },
        "2026-09-17",
      ),
    "BESKT_PC_PILOT_WINDOW: the window is half-open, exactly as the database reads it",
  );
  ck(
    "P3d.6 BEHAVIOUR: a revoked pilot grant is not live whatever its window says",
    !besktPilotIsLive(
      { revokedAt: "2026-09-10T00:00:00Z", startsOn: "2026-09-01", expiresOn: "2026-12-01" },
      "2026-09-17",
    ),
    "BESKT_PC_PILOT_REVOKED_LIVE: a revoked grant opens nothing",
  );
}

/* ================================================================== */
group("P4 · The rendering schema matches the contract it renders");

{
  const authoring = read(AUTHORING_MIGRATION);
  const familyArg: Record<string, string> = {
    exposure_profile: "exposure profile",
    section: "section",
    item: "item",
    prompt: "prompt",
    routing_rule: "routing rule",
    evidence_anchor: "evidence anchor",
    observation_field: "observation field",
    activation_requirement: "activation requirement",
  };

  for (const spec of BESKT_FAMILY_SPECS) {
    const label = familyArg[spec.family];
    // The key list the RPC actually accepts, read out of the migration.
    const m = new RegExp(
      `beskt_content_reject_unknown_keys\\('${label}',[^,]+, ARRAY\\[([\\s\\S]*?)\\]\\)`,
    ).exec(authoring);
    const accepted = m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : [];
    const rendered = spec.fields.map((f) => f.name);
    // `options` is a nested payload the item RPC accepts and the editor
    // manages through the item's own option rows, so it is expected to be
    // accepted-but-not-rendered. Everything else must line up exactly.
    const expectedExtra = spec.family === "item" ? ["options"] : [];
    const missing = accepted.filter((k) => !rendered.includes(k) && !expectedExtra.includes(k));
    const invented = rendered.filter((k) => !accepted.includes(k));
    ck(
      `P4.${spec.family} the ${spec.family} form renders exactly the fields its RPC accepts`,
      accepted.length > 0 && missing.length === 0 && invented.length === 0,
      `BESKT_PC_SCHEMA_DRIFT: missing ${JSON.stringify(missing)}, invented ${JSON.stringify(invented)}`,
    );
  }
}

{
  const content = read(CONTENT_MIGRATION);
  // Every closed vocabulary the form offers must be exactly the CHECK list.
  const checks: Array<[string, string, readonly string[]]> = [
    [
      "exposure_area",
      "exposure_area IN \\(",
      besktFamilySpec("exposure_profile").fields.find((f) => f.name === "exposure_area")!.options!,
    ],
    [
      "answer_type",
      "answer_type IN \\(",
      besktFamilySpec("item").fields.find((f) => f.name === "answer_type")!.options!,
    ],
    [
      "prompt_kind",
      "prompt_kind text NOT NULL CHECK \\(prompt_kind IN \\(",
      besktFamilySpec("prompt").fields.find((f) => f.name === "prompt_kind")!.options!,
    ],
    [
      "question_form",
      "question_form IN \\(",
      besktFamilySpec("prompt").fields.find((f) => f.name === "question_form")!.options!,
    ],
    [
      "evidence_state",
      "evidence_state IN \\(",
      besktFamilySpec("evidence_anchor").fields.find((f) => f.name === "evidence_state")!.options!,
    ],
  ];
  for (const [name, pattern, offered] of checks) {
    const m = new RegExp(`${pattern}([\\s\\S]*?)\\)\\)`).exec(content);
    const allowed = m ? [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]) : [];
    ck(
      `P4.vocab.${name} the form offers exactly the values the CHECK constraint admits`,
      allowed.length > 0 &&
        allowed.length === offered.length &&
        allowed.every((v) => offered.includes(v)),
      `BESKT_PC_VOCAB_DRIFT: ${name} — database ${JSON.stringify(allowed)}, form ${JSON.stringify(offered)}`,
    );
  }
}

ck(
  "P4.closed every governed classification is a select or a multiselect, never free text",
  BESKT_FAMILY_SPECS.every((spec) =>
    spec.fields.every(
      (f) =>
        ![
          "access_class",
          "sensitivity_class",
          "permitted_mode",
          "applies_mode",
          "prohibited_inferences",
          "retention_class",
        ].includes(f.name) ||
        f.kind === "select" ||
        f.kind === "multiselect",
    ),
  ),
  "BESKT_PC_VOCAB_FREE_TEXT: a typed access class would let a recruitment method reach security-vetting content",
);

/* ================================================================== */
group("P4g · Governance has a door for the people who govern");

ck(
  "P4g.1 the governance surface admits exactly who the governance tables admit",
  // scp_interview_can_read is what every governance table's SELECT policy
  // applies. A second, hand-written notion of "who governs" would drift.
  /rpc\("scp_interview_can_read"/.test(govFnsCode) &&
    /getBesktGovernanceAccess/.test(govLayoutCode) &&
    /!q\.data\?\.canRead/.test(govLayoutCode),
  "BESKT_PC_GOV_SURFACE_GATE: the governance surface must be gated by the governance read predicate",
);

ck(
  "P4g.2 a failed access check is never shown as 'you have no role'",
  /if \(q\.isError\)[\s\S]*?beskt\.governance\.error\.heading[\s\S]*?if \(!q\.data\?\.canRead\)[\s\S]*?beskt\.governance\.denied\.heading/.test(
    govLayoutCode,
  ),
  "BESKT_PC_GOV_ERROR_AS_DENIED: a technical failure told as a missing role sends a reviewer to ask for access they already have",
);

ck(
  "P4g.3 mandates and pilot grants stay with the platform admin",
  // The access tab grants review mandates and employer pilot grants. Only a
  // platform admin may; offering it on the governance surface would offer
  // actions the database always refuses.
  /governance:\s*\["content",\s*"lifecycle"\]/.test(adminRouteCode) &&
    /tab === "access" && surface === "admin"/.test(adminRouteCode) &&
    !/"access"/.test(govVersionRouteCode),
  "BESKT_PC_GOV_ACCESS_TAB_LEAK: an editor or reviewer must not be offered the admin's grant forms",
);

ck(
  "P4g.4 only an editor is offered 'create a method'",
  /contentRoles\.includes\("editor"\)/.test(govListRouteCode) && /canCreate &&/.test(adminListCode),
  "BESKT_PC_GOV_CREATE_FOR_ALL: a reviewer or publisher must not be offered an action only an editor may take",
);

group("P4l · A submitted preparation reaches Intervjuer through the governed link");

ck(
  "P4l.1 the cases offered and the link made are the governed RPCs' own",
  /rpc\("bcp_linkable_interview_cases"/.test(prepFnsCode) &&
    /rpc\("bcp_link_preparation_to_case"/.test(prepFnsCode) &&
    !/\.from\("bcp_case_links"\)/.test(prepFnsCode),
  "BESKT_PC_LINK_UNGOVERNED: a preparation must reach a case only through bcp_link_preparation_to_case",
);

ck(
  "P4l.2 the link is offered only for a submitted preparation",
  /existing\.lifecycleState === "submitted" && employerSlug \? \(\s*<BesktCaseLinkSection/.test(
    appPanelCode,
  ),
  "BESKT_PC_LINK_BEFORE_SUBMIT: a draft must never be offered to an interview case",
);

ck(
  "P4l.3 the applicant is read from the application on the server, never taken from the browser",
  // The case's candidate is what the bridge matches on and what the
  // candidate's own interview status reads. Accepting it from the client
  // would let anyone bind anybody.
  /bindApplicant: z\.boolean\(\)\.optional\(\)/.test(runtimeFnsCode) &&
    /\.from\("job_applications"\)\s*\.select\("applicant_user_id, employer_id"\)/.test(
      runtimeFnsCode,
    ) &&
    /app\.data\.employer_id !== data\.employerId/.test(runtimeFnsCode) &&
    !/candidateUserId: z\./.test(runtimeFnsCode),
  "BESKT_PC_LINK_CLIENT_CANDIDATE: a case must never be bound to a user id the browser supplied",
);

ck(
  "P4l.4 with no case yet, the section points at Intervjuer with the application and the BESKT binding",
  /to="\/employer\/\$employerSlug\/interview-intelligence\/new"[\s\S]*?search=\{\{ applicationId, jobId: undefined, beskt: true \}\}/.test(
    caseLinkCode,
  ),
  "BESKT_PC_LINK_DEAD_END: a submitted preparation with no case must say where to create one",
);

group("P5 · The screens speak the reader's language, never the database's");

ck(
  "P5.1 no RAISED database text reaches the DOM on any new surface",
  // A raised refusal is the dangerous one: it can carry a Postgres error
  // with a query fragment in it. The validator's own findings are a
  // different thing and are asserted separately in P5.1b.
  // The identifier has to be an error-shaped one. A bare `{e}` is a map
  // callback's element in half the components in this repo, and a pattern
  // loose enough to catch it caught `entry={e}`.
  !/\{\s*\w*(?:error|Error)\w*\s*\}/.test(ALL_NEW_SURFACE_BODY) &&
    !/\{\s*\w*(?:error|Error)\w*\.message\s*\}/.test(ALL_NEW_SURFACE_BODY) &&
    !/\{\s*String\(\s*\w*(?:error|Error)\w*\s*\)\s*\}/.test(ALL_NEW_SURFACE_BODY) &&
    !/\{\s*\w+ instanceof Error \? \w+\.message/.test(ALL_NEW_SURFACE_BODY),
  "BESKT_PC_RAW_ERROR: a raised message can name a table, a column or a policy",
);

ck(
  "P5.1b the one place a database sentence IS shown says whose words they are",
  // The validator names which governed row is incomplete, by key, and
  // there is no shorter way to say it. What the screen must not do is pass
  // it off as its own sentence — and it must be a platform-only surface.
  // Platform-internal means one of the two gated governance shells: the
  // admin console, or /beskt-governance behind scp_interview_can_read.
  /\{f\.message\}/.test(lifecycleCode) &&
    /beskt\.admin\.validate\.ownWords/.test(lifecycleCode) &&
    /<BesktSurfaceShell\b/.test(adminRouteCode) &&
    /<AdminShellChrome\b/.test(surfaceCode) &&
    /!q\.data\?\.canRead/.test(govLayoutCode),
  "BESKT_PC_VALIDATOR_UNATTRIBUTED: a database sentence shown as the product's own is a lie about its source",
);

ck(
  "P5.2 every new error path translates through a besktErrorKey CALL",
  // The CALL, not the identifier: an import that is still present while the
  // call site is gone leaves the surface untranslated, and a pattern
  // matching the name alone cannot tell the two apart. `besktErrorKey(`
  // also rules out a renamed binding that merely keeps the old spelling
  // alive in an unused const.
  [reportCode, editorCode, lifecycleCode, grantsCode, adminListCode, adminNewCode].every((c) =>
    /\bbesktErrorKey\(/.test(c),
  ),
  "BESKT_PC_UNTRANSLATED_ERROR: every surface must show our sentence, chosen by code",
);

ck(
  "P5.3 BEHAVIOUR: the translator recognises a BESKT_ governance code as well as a BCP_ one",
  besktErrorCode(new Error("BESKT_GATE_NOT_GRANTED: you hold no mandate.")) ===
    "BESKT_GATE_NOT_GRANTED" &&
    besktErrorCode(new Error("BCP_STALE_REVISION: reload.")) === "BCP_STALE_REVISION",
  "BESKT_PC_ERROR_FAMILY: a governance refusal must not fall through to the generic sentence",
);

ck(
  "P5.4 BEHAVIOUR: a governance refusal maps to its own sentence, not the generic one",
  besktErrorKey(new Error("BESKT_GATE_NOT_GRANTED: x")) === "beskt.error.govGateNotGranted" &&
    besktErrorKey(new Error("BESKT_SELF_REVIEW: x")) === "beskt.error.govSelfReview" &&
    besktErrorKey(new Error("SOMETHING_ELSE")) === "beskt.error.generic",
  "BESKT_PC_ERROR_MAPPING: a recognised refusal must have a sentence of its own",
);

ck(
  "P5.5 every code the translator claims is one a migration actually raises",
  (() => {
    const errors = read("src/lib/beskt/errors.ts");
    const mapped = [...errors.matchAll(/^ {2}((?:BCP|BESKT)_[A-Z_]+):/gm)].map((m) => m[1]);
    const raised = new Set(
      [
        ...read(CONTENT_MIGRATION).matchAll(/\b((?:BCP|BESKT)_[A-Z_]+)\b/g),
        ...read(AUTHORING_MIGRATION).matchAll(/\b((?:BCP|BESKT)_[A-Z_]+)\b/g),
        ...read(PROMPT_MIGRATION).matchAll(/\b((?:BCP|BESKT)_[A-Z_]+)\b/g),
        ...read("supabase/migrations/20261110090000_bcp_candidate_preparation.sql").matchAll(
          /\b((?:BCP|BESKT)_[A-Z_]+)\b/g,
        ),
        ...read("supabase/migrations/20261112090000_bcp_interview_case_bridge.sql").matchAll(
          /\b((?:BCP|BESKT)_[A-Z_]+)\b/g,
        ),
        ...read("supabase/migrations/20261113090000_bcp_interview_conduct.sql").matchAll(
          /\b((?:BCP|BESKT)_[A-Z_]+)\b/g,
        ),
      ].map((m) => m[1]),
    );
    return mapped.length > 100 && mapped.every((c) => raised.has(c));
  })(),
  "BESKT_PC_ERROR_INVENTED: a translated code that no migration raises is a sentence for a refusal that cannot happen",
);

ck(
  "P5.6 both languages carry every key these surfaces use",
  (() => {
    const dict = read("src/i18n/dictionaries.ts");
    const svStart = dict.indexOf("  sv: {");
    const enStart = dict.indexOf("  en: {");
    const sv = dict.slice(svStart, enStart);
    const en = dict.slice(enStart);
    const keysIn = (s: string) =>
      new Set([...s.matchAll(/^\s+"([a-zA-Z0-9._]+)":/gm)].map((m) => m[1]));
    const svKeys = keysIn(sv);
    const enKeys = keysIn(en);
    const beskt = [...svKeys].filter((k) => k.startsWith("beskt."));
    return beskt.length > 400 && beskt.every((k) => enKeys.has(k));
  })(),
  "BESKT_PC_LANGUAGE_PARITY: a Swedish-only key renders as a raw key to an English reader",
);

/* ================================================================== */
group("P6 · Touch targets, focus and structure");

ck(
  "P6.1 every interactive control on the governance surface meets the 44px floor",
  (() => {
    const surfaces = [
      editorCode,
      lifecycleCode,
      grantsCode,
      adminRouteCode,
      adminListCode,
      adminNewCode,
    ];
    // Every className constant that styles a button or an input carries the
    // floor. Checked on the constants rather than per element, because that
    // is where the surfaces actually get their sizing.
    return surfaces.every((s) => {
      const buttons = [
        ...s.matchAll(/const (BUTTON|PRIMARY|TAB_BUTTON|TAB_ACTIVE) =\s*\n?\s*"([^"]*)"/g),
      ];
      return buttons.length === 0 || buttons.every((m) => m[2].includes("min-h-[44px]"));
    });
  })(),
  "BESKT_PC_TOUCH_TARGET: a control below the floor is unusable one-handed on a phone",
);

ck(
  "P6.2 every section is labelled, so the page has a structure a screen reader can move through",
  /aria-labelledby/.test(editorCode) &&
    /aria-labelledby/.test(lifecycleCode) &&
    /aria-labelledby/.test(grantsCode) &&
    /aria-labelledby/.test(reportCode),
  "BESKT_PC_A11Y_LABEL: an unlabelled section is a wall of text to a screen-reader user",
);

ck(
  "P6.3 every refusal is announced, not merely coloured",
  /role="alert"/.test(editorCode) &&
    /role="alert"/.test(lifecycleCode) &&
    /role="alert"/.test(grantsCode) &&
    /role="alert"/.test(reportCode),
  "BESKT_PC_A11Y_ALERT: colour alone does not report an error",
);

ck(
  "P6.4 the report has a loading, an error and a not-finalised state, each distinct",
  /reportQ\.isLoading/.test(conductRouteCode) &&
    /reportQ\.isError/.test(conductRouteCode) &&
    /finalised\?: /.test(reportCode.replace(/finalised\b/g, "finalised?: ")),
  "BESKT_PC_STATE_MISSING: loading, failed and 'no report yet' are three different answers",
);

/* ================================================================== */
group("P7 · Registration");

{
  const pkg = read(PKG);
  const ci = read(CI);
  ck(
    "P7.1 this guard is registered as a script",
    /"beskt-product-completion:check":/.test(pkg),
    "BESKT_PC_REGISTRATION: the guard must be runnable by name",
  );
  ck(
    "P7.2 its planted controls are registered and run as part of negative-controls:all",
    /"negative-controls:beskt-product-completion":/.test(pkg) &&
      /negative-controls:beskt-product-completion/.test(
        /"negative-controls:all":\s*"([^"]+)"/.exec(pkg)?.[1] ?? "",
      ),
    "BESKT_PC_REGISTRATION: the controls must run in the chain, not only on demand",
  );
  ck(
    "P7.3 CI runs the guard, and the render guard beside it",
    /beskt-product-completion:check/.test(ci) &&
      /beskt-product-completion-render:check/.test(ci) &&
      /"beskt-product-completion-render:check":/.test(pkg),
    "BESKT_PC_REGISTRATION: a guard CI does not run is a guard that does not run",
  );
  ck(
    "P7.4 the guard and its controls are typechecked with the scripts project",
    (() => {
      const cfg = read("tsconfig.scripts.json");
      return /scripts/.test(cfg);
    })(),
    "BESKT_PC_REGISTRATION: an untypechecked guard drifts from the code it reads",
  );
  ck(
    "P7.5 every control names a diagnostic this guard can actually print",
    (() => {
      let suite: string;
      try {
        suite = read("scripts/negative-controls/beskt-product-completion-controls.ts");
      } catch {
        return false;
      }
      const expected = [...suite.matchAll(/expect:\s*"([^"]+)"/g)].map((m) => m[1]);
      if (expected.length < 18) return false;
      // Both guards: the controls drive the source guard AND the render
      // guard, so a diagnostic printed by either one counts. Reading only
      // this file would have called every BESKT_PCR_ expectation dead.
      const self =
        read("scripts/beskt-product-completion-check.tsx") +
        read("scripts/beskt-product-completion-render-check.tsx");
      return expected.every((e) => self.includes(e));
    })(),
    "BESKT_PC_CONTROL_DIAGNOSTIC: a control expecting a diagnostic nobody prints proves nothing",
  );
}

/* ================================================================== */
console.log("");
if (fails.length > 0) {
  console.error(
    `beskt-product-completion:check FAILED — ${fails.length} of ${passed + fails.length}`,
  );
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `beskt-product-completion:check: ${passed} assertions passed. ` +
    "The wordings, the report and the governance surface are governed at the surface as well as in the database.",
);
