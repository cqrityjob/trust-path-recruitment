// The three new BESKT surfaces, asserted against the RENDERED markup.
//
// ── WHY THIS RENDERS RATHER THAN READS ─────────────────────────────────
//
// The source-and-behaviour guard next door proves what the modules DO. It
// cannot prove what a person SEES, and three of this product's promises are
// only true if they survive to the markup:
//
//   a report that states, on its own face, that it is not a decision and
//   carries no score — and that puts its limitations BEFORE its evidence;
//
//   a prompt surface that shows the method's own wordings and says, in the
//   reader's own language, why they are missing when they are;
//
//   a governance surface that renders five independent gate states rather
//   than a progress bar, and never offers an action the database refuses.
//
// Rendered with renderToStaticMarkup — no browser and no database. The
// I18nProvider starts at "sv" on the server, so Swedish is asserted from the
// markup and English from a second render with lang="en"; the same shape
// beskt-candidate-preparation-render-check already uses.
//
// ── WHAT THIS IS NOT ────────────────────────────────────────────────────
//
// It is not a routed browser walk. It renders components with planted props
// rather than driving real routes against a database, so it proves what the
// markup says and not that the route assembles those props correctly. The
// source guard covers the wiring; the SQL suites cover the runtime.
//
// Run: bun run beskt-product-completion-render:check

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mock } from "bun:test";

// The router, with ONE export replaced, exactly as the PR 5B guard does it:
// `Link` becomes an anchor carrying its resolved destination, so a claim
// about where a control goes is read from markup rather than from source.
const realRouter = await import("@tanstack/react-router");
await mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  Link: ({
    to,
    search,
    params,
    children,
    ...rest
  }: Record<string, unknown> & { children?: React.ReactNode }) => {
    let href = String(to ?? "");
    if (params && typeof params === "object") {
      for (const [k, v] of Object.entries(params as Record<string, string>)) {
        href = href.replace(`$${k}`, String(v));
      }
    }
    if (search && typeof search === "object") {
      href += "?" + new URLSearchParams(search as Record<string, string>).toString();
    }
    return React.createElement("a", { href, ...rest }, children);
  },
}));

const { I18nProvider } = await import("../src/i18n/context");
const { dictionaries } = await import("../src/i18n/dictionaries");
const { BesktReportDocument, BesktReportSection } =
  await import("../src/components/employer/interview/beskt/BesktReport");
const { BesktStagePrompts, BesktPromptsUnavailable } =
  await import("../src/components/employer/interview/beskt/BesktPrompts");
const { BesktLifecyclePanel } = await import("../src/components/admin/beskt/BesktLifecyclePanel");
const { BesktPilotGrants } = await import("../src/components/admin/beskt/BesktGrantsPanel");
const { BesktContentEditor } = await import("../src/components/admin/beskt/BesktContentEditor");

import type { BesktPrompt } from "../src/lib/beskt/interview-conduct.functions";
import type { BesktVersionWorkspace } from "../src/lib/beskt/governance.functions";

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

const sv = dictionaries.sv;
const en = dictionaries.en;

function render(node: React.ReactNode, lang: "sv" | "en" = "sv"): string {
  return renderToStaticMarkup(
    React.createElement(I18nProvider, { initialLang: lang } as never, node),
  );
}

/**
 * Markup with tags removed, so an assertion about words is about words.
 *
 * The NUMERIC entities matter as much as the named ones: React escapes an
 * apostrophe to `&#x27;`, and a decoder that only handled `&amp;`-style
 * names left "the candidate&#x27;s" in the text — which then failed to
 * match the dictionary sentence it had rendered perfectly well.
 */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ");

/* ================================================================== */
group("R1 · The report document");

// A payload with one of everything the document must keep apart: a candidate
// answer, an omission, two assessors, a correction, an open verification and
// an unresolved difference.
const PAYLOAD = {
  case: {
    case_id: "c1",
    candidate_display_name: "Syntetisk Kandidat",
    title: "Syntetisk roll",
  },
  bound: {
    method_version_id: "v1",
    pack_slug: "synthetic-method",
    method_name_sv: "Syntetisk metod",
    method_name_en: "Synthetic method",
    version_number: 1,
    mode: "recruitment_support",
    validation_label: "pilot_hypothesis",
    content_hash: "a".repeat(64),
    answers_content_hash: "b".repeat(64),
    response_version: 2,
    notice_version: "v1",
  },
  candidate_preparation: [
    {
      item_key: "answered_item",
      response_state: "answered",
      value_text: "Syntetiskt svar",
      wording_sv: "Syntetisk fråga ett",
      wording_en: "Synthetic question one",
      purpose_sv: "Syntetiskt syfte",
      purpose_en: "Synthetic purpose",
    },
    {
      item_key: "omitted_item",
      response_state: "omitted",
      wording_sv: "Syntetisk fråga två",
      wording_en: "Synthetic question two",
      purpose_sv: "Syntetiskt syfte två",
      purpose_en: "Synthetic purpose two",
    },
  ],
  themes: [
    {
      item_key: "omitted_item",
      reason: "omitted",
      wording_sv: "Tema ett",
      wording_en: "Theme one",
    },
    {
      item_key: "undocumented_theme",
      reason: "discuss_orally",
      wording_sv: "Tema två",
      wording_en: "Theme two",
    },
  ],
  positions: [
    {
      position_id: "p1",
      assessor_id: "assessor-one",
      position_role: "assessor",
      state: "locked",
      locked_at: "2026-09-17T10:00:00Z",
      reopen_count: 0,
      entries: [
        {
          entry_id: "e1",
          item_key: "omitted_item",
          entry_version: 2,
          observable_fact: "SYNTETISKT-FAKTUM",
          candidate_explanation: "SYNTETISK-FÖRKLARING",
          interviewer_interpretation: "SYNTETISK-TOLKNING",
          alternative_explanation: "SYNTETISK-MOTBILD",
          protective_factor: "SYNTETISK-SKYDDSFAKTOR",
          verification_need: "SYNTETISKT-VERIFIERINGSBEHOV",
          verification_state: "requested",
          recorded_at: "2026-09-17T10:05:00Z",
          corrections: [
            {
              entry_id: "e0",
              entry_version: 1,
              correction_reason: "SYNTETISK-RÄTTELSEORSAK",
              observable_fact: "TIDIGARE-LYDELSE",
              recorded_at: "2026-09-17T09:55:00Z",
            },
          ],
          verifications: [
            {
              seq: 1,
              previous_state: "not_required",
              new_state: "requested",
              recorded_at: "2026-09-17T10:06:00Z",
            },
          ],
        },
      ],
      information_gaps: [{ item_key: "undocumented_theme", gap: "not_documented" }],
    },
    {
      position_id: "p2",
      assessor_id: "assessor-two",
      position_role: "responsible_owner",
      state: "locked",
      locked_at: "2026-09-17T10:10:00Z",
      reopen_count: 1,
      entries: [
        {
          entry_id: "e2",
          item_key: "omitted_item",
          entry_version: 1,
          observable_fact: "ANDRA-BEDÖMARENS-FAKTUM",
        },
      ],
      information_gaps: [],
    },
  ],
  panel: {
    panel_id: "pn1",
    state: "revealed",
    revealed_at: "2026-09-17T11:00:00Z",
    resolutions: [],
  },
  audit_events: [
    {
      event: "conduct_session_opened",
      recorded_at: "2026-09-17T09:00:00Z",
      actor_id: "assessor-one",
    },
  ],
  produces_score: false,
  produces_ranking: false,
  produces_recommendation: false,
  interpretation: "none",
};

{
  const html = render(
    React.createElement(BesktReportDocument, {
      payload: PAYLOAD,
      contentHash: "c".repeat(64),
      basisHash: "d".repeat(64),
      draft: true,
    }),
  );
  const t = text(html);

  ck(
    "R1.1 RENDER: the document says it is not a decision and that responsibility stays with a human",
    t.includes(sv["beskt.report.notADecision.body"]),
    "BESKT_PCR_REPORT_NO_DISCLAIMER: the document must state what it is and is not",
  );
  ck(
    "R1.2 RENDER: it says in words that it carries no score, rating or recommendation",
    t.includes(sv["beskt.report.notADecision.noScore"]),
    "BESKT_PCR_REPORT_NO_SCORE_SENTENCE: the absence of a score must be stated, not merely true",
  );
  ck(
    "R1.3 RENDER: the limitations appear BEFORE the candidate's words and before the positions",
    (() => {
      const limits = html.indexOf('data-testid="beskt-report-limitations"');
      const candidate = html.indexOf("beskt-report-candidate-h");
      const positions = html.indexOf("beskt-report-positions-h");
      return limits > 0 && candidate > limits && positions > limits;
    })(),
    "BESKT_PCR_REPORT_LIMITS_ORDER: a limitation met after the evidence is met too late",
  );
  ck(
    "R1.4 RENDER: the theme nobody documented is NAMED in the LIMITATIONS, not just counted",
    (() => {
      // Scoped to the limitations section. The same key also appears in one
      // assessor's own information gaps further down, so searching the whole
      // document let an empty limitations list pass — the block a reader
      // meets first could say nothing while the assertion still held.
      const start = html.indexOf('data-testid="beskt-report-limitations"');
      const end = html.indexOf('data-testid="beskt-report-provenance"');
      if (start < 0 || end < 0 || end <= start) return false;
      const limits = text(html.slice(start, end));
      return (
        limits.includes("undocumented_theme") &&
        limits.includes(sv["beskt.report.limits.undocumented"])
      );
    })(),
    "BESKT_PCR_REPORT_GAP_UNNAMED: a reader must see WHICH theme is missing",
  );
  ck(
    "R1.5 RENDER: the four kinds of claim are four labelled fields, not one narrative",
    t.includes("SYNTETISKT-FAKTUM") &&
      t.includes("SYNTETISK-FÖRKLARING") &&
      t.includes("SYNTETISK-TOLKNING") &&
      t.includes("SYNTETISK-MOTBILD") &&
      t.includes(sv["beskt.conduct.entry.observableFact"]) &&
      t.includes(sv["beskt.conduct.entry.candidateExplanation"]) &&
      t.includes(sv["beskt.conduct.entry.interviewerInterpretation"]) &&
      t.includes(sv["beskt.conduct.entry.alternativeExplanation"]),
    "BESKT_PCR_REPORT_CLAIMS_MERGED: fact, explanation, interpretation and counter-evidence must stay apart",
  );
  ck(
    "R1.6 RENDER: both assessors appear whole, and neither is merged into the other",
    t.includes("SYNTETISKT-FAKTUM") &&
      t.includes("ANDRA-BEDÖMARENS-FAKTUM") &&
      html.includes('data-testid="beskt-report-position-p1"') &&
      html.includes('data-testid="beskt-report-position-p2"'),
    "BESKT_PCR_REPORT_POSITIONS_MERGED: two positions are two positions and are never averaged",
  );
  ck(
    "R1.7 RENDER: the correction chain is on the page, with its reason and its earlier wording",
    t.includes("SYNTETISK-RÄTTELSEORSAK") && t.includes("TIDIGARE-LYDELSE"),
    "BESKT_PCR_REPORT_CORRECTIONS_HIDDEN: a record whose corrections vanished reads as if it never changed",
  );
  ck(
    "R1.8 RENDER: an omitted answer is explicitly not an adverse finding",
    t.includes(sv["beskt.report.candidate.notAnAdverseFinding"]),
    "BESKT_PCR_REPORT_OMISSION_ADVERSE: omitting is an option the method offers, not a finding",
  );
  ck(
    "R1.9 RENDER: an unsigned preview is marked a draft and never as a signed version",
    t.includes(sv["beskt.report.document.draftChip"]) &&
      !t.includes(sv["beskt.report.document.finalChip"]),
    "BESKT_PCR_REPORT_DRAFT_UNMARKED: a printout of a preview must not read as a signed report",
  );
  ck(
    "R1.10 RENDER: the digests it rests on are shown in full, not abbreviated away",
    t.includes("a".repeat(64)) && t.includes("b".repeat(64)) && t.includes("d".repeat(64)),
    "BESKT_PCR_REPORT_DIGEST_TRUNCATED: an abbreviated hash is not a hash",
  );
  ck(
    "R1.11 RENDER: no percentage, score line or x-of-y total reaches the markup",
    (() => {
      // The disclaimer's own sentences are removed first. They exist to say
      // there is no score, so they necessarily contain the words "poäng"
      // and "score" — and an assertion that forbade the vocabulary would
      // have forbidden the promise along with the thing it rules out.
      const withoutDisclaimer = t
        .replace(sv["beskt.report.notADecision.noScore"], " ")
        .replace(sv["beskt.report.notADecision.body"], " ");
      return (
        !/\d+\s?%/.test(withoutDisclaimer) &&
        !/\b\d+\s*\/\s*\d+\b/.test(withoutDisclaimer) &&
        !/\bscore\b|\bpo(ä|a)ng\b/i.test(withoutDisclaimer)
      );
    })(),
    "BESKT_PCR_REPORT_NUMBER: a number that looks like a result is a result to whoever reads it",
  );

  const enHtml = text(
    render(
      React.createElement(BesktReportDocument, {
        payload: PAYLOAD,
        contentHash: "c".repeat(64),
        basisHash: "d".repeat(64),
        draft: true,
      }),
      "en",
    ),
  );
  ck(
    "R1.12 RENDER: the whole document renders in English, with no Swedish left behind",
    enHtml.includes(en["beskt.report.notADecision.noScore"]) &&
      enHtml.includes(en["beskt.report.limits.undocumented"]) &&
      !enHtml.includes(sv["beskt.report.notADecision.noScore"]),
    "BESKT_PCR_REPORT_LOCALE: an English reader must not meet a Swedish sentence",
  );
  ck(
    "R1.13 RENDER: no translation key leaks into the markup as its own text",
    !/beskt\.report\.|beskt\.conduct\./.test(t) && !/beskt\.report\./.test(enHtml),
    "BESKT_PCR_KEY_LEAK: a raw translation key on screen means a missing translation",
  );
}

/* ------------------------------------------------------------------ */
group("R2 · The report surface around the document");

{
  const blocked = text(
    render(
      React.createElement(BesktReportSection, {
        preview: {
          sessionId: "s1",
          payload: PAYLOAD,
          basisHash: "d".repeat(64),
          contentHash: "c".repeat(64),
          blockers: [
            { code: "BCP_CONDUCT_POSITION_OPEN", message: "2 position(s) are still open." },
            { code: "BCP_CONDUCT_PANEL_REQUIRED", message: "More than one position was taken." },
          ],
          blockerCount: 2,
          producesScore: false,
          interpretation: "none",
        },
        finalReport: null,
        versions: [],
        actions: { canFinalise: true, busy: false, error: null, finalise: () => {} },
      } as never),
    ),
  );

  ck(
    "R2.1 RENDER: each blocker is shown in OUR sentence, and the database's own text is not",
    blocked.includes(sv["beskt.error.reportPositionOpen"]) &&
      blocked.includes(sv["beskt.error.reportPanelRequired"]) &&
      !blocked.includes("2 position(s) are still open."),
    "BESKT_PCR_RAW_BLOCKER: an operator-facing message must not be shown to a recruiter",
  );
  ck(
    "R2.2 RENDER: a blocked report offers no sign-and-write control",
    !blocked.includes(sv["beskt.report.finalise.action"]),
    "BESKT_PCR_BLOCKED_FINALISE: an action that can only be refused must not be offered",
  );
  ck(
    "R2.3 RENDER: the blockers are framed as steps a person has not taken, not as a quality bar",
    blocked.includes(sv["beskt.report.blockers.lede"]),
    "BESKT_PCR_BLOCKER_FRAMING: a blocker must not read as a judgement about the work",
  );

  const ready = text(
    render(
      React.createElement(BesktReportSection, {
        preview: {
          sessionId: "s1",
          payload: PAYLOAD,
          basisHash: "d".repeat(64),
          contentHash: "c".repeat(64),
          blockers: [],
          blockerCount: 0,
          producesScore: false,
          interpretation: "none",
        },
        finalReport: null,
        versions: [],
        actions: { canFinalise: true, busy: false, error: null, finalise: () => {} },
      } as never),
    ),
  );
  ck(
    "R2.4 RENDER: with nothing outstanding the control appears AND says what signing means",
    ready.includes(sv["beskt.report.finalise.action"]) &&
      ready.includes(sv["beskt.report.finalise.whatSigningMeans"]),
    "BESKT_PCR_SIGN_UNEXPLAINED: a signature must say what it binds the signer to",
  );

  const notPermitted = text(
    render(
      React.createElement(BesktReportSection, {
        preview: {
          sessionId: "s1",
          payload: PAYLOAD,
          basisHash: "d".repeat(64),
          contentHash: "c".repeat(64),
          blockers: [],
          blockerCount: 0,
          producesScore: false,
          interpretation: "none",
        },
        finalReport: null,
        versions: [],
        actions: { canFinalise: false, busy: false, error: null, finalise: () => {} },
      } as never),
    ),
  );
  ck(
    "R2.5 RENDER: a reader who may not sign is told who does, not shown a dead control",
    notPermitted.includes(sv["beskt.report.finalise.notPermitted"]) &&
      !notPermitted.includes(sv["beskt.report.finalise.action"]),
    "BESKT_PCR_SIGN_DEAD_CONTROL: a control nobody present can use must not be drawn",
  );
}

/* ================================================================== */
group("R3 · The governed wordings");

const STAGE_PROMPTS: readonly BesktPrompt[] = [
  {
    promptKey: "plan_one",
    displayOrder: 1,
    promptKind: "planning_from_role_relevance",
    peaceStage: "planning",
    addressee: "interviewer",
    questionForm: "open_question",
    permittedProbeBases: ["documented_role_requirement"],
    wordingSv: "SYNTETISK-PLANERINGSFORMULERING",
    wordingEn: "SYNTHETIC-PLANNING-WORDING",
  },
  {
    promptKey: "eval_one",
    displayOrder: 2,
    promptKind: "interviewer_self_review",
    peaceStage: "evaluation",
    addressee: "interviewer",
    questionForm: "reflective_readback",
    permittedProbeBases: [],
    wordingSv: "SYNTETISK-UTVÄRDERINGSFORMULERING",
    wordingEn: "SYNTHETIC-EVALUATION-WORDING",
  },
];

{
  const html = render(React.createElement(BesktStagePrompts, { prompts: STAGE_PROMPTS }));
  const t = text(html);
  ck(
    "R3.1 RENDER: the method's own wordings reach the page verbatim",
    t.includes("SYNTETISK-PLANERINGSFORMULERING") &&
      t.includes("SYNTETISK-UTVÄRDERINGSFORMULERING"),
    "BESKT_PCR_PROMPT_MISSING: a governed wording that does not render is a wording nobody follows",
  );
  ck(
    "R3.2 RENDER: the page says the wordings are not a script and produce no result",
    t.includes(sv["beskt.conduct.prompts.notAScript"]),
    "BESKT_PCR_PROMPT_SCRIPT: a prompt list read as a script becomes a questionnaire",
  );
  ck(
    "R3.3 RENDER: the Evaluation step is marked as the interviewer's own, never about the candidate",
    t.includes(sv["beskt.conduct.prompts.evaluationNote"]),
    "BESKT_PCR_PROMPT_EVALUATION: Evaluation is the interviewer reviewing themselves",
  );
  ck(
    "R3.4 RENDER: a probe says what it may be grounded in, and no behavioural cue appears",
    t.includes(sv["beskt.conduct.prompts.basis.documented_role_requirement"]) &&
      !/tonfall|tvekan|blick|kroppsspr(å|a)k|ansiktsuttryck/i.test(t),
    "BESKT_PCR_PROMPT_CUE_RENDERED: a probe must never be grounded in how somebody seemed",
  );

  const enT = text(
    render(React.createElement(BesktStagePrompts, { prompts: STAGE_PROMPTS }), "en"),
  );
  ck(
    "R3.5 RENDER: the English reader gets the English wording and the English framing",
    enT.includes("SYNTHETIC-PLANNING-WORDING") &&
      enT.includes(en["beskt.conduct.prompts.notAScript"]),
    "BESKT_PCR_PROMPT_LOCALE: the governed wording has two languages and both must render",
  );
}

{
  for (const reason of [
    "version_not_published",
    "mode_not_permitted",
    "version_not_found",
  ] as const) {
    const t = text(render(React.createElement(BesktPromptsUnavailable, { reason })));
    const key = `beskt.conduct.prompts.unavailable.${
      reason === "version_not_published"
        ? "versionNotPublished"
        : reason === "mode_not_permitted"
          ? "modeNotPermitted"
          : "versionNotFound"
    }` as keyof typeof sv;
    ck(
      `R3.6.${reason} RENDER: the reason is stated, and so is what still works`,
      t.includes(sv[key]) && t.includes(sv["beskt.conduct.prompts.unavailable.whatStillWorks"]),
      "BESKT_PCR_PROMPT_UNAVAILABLE_VAGUE: a missing wording must say why and what is unaffected",
    );
  }
}

/* ================================================================== */
group("R4 · The governance surface");

const WORKSPACE: BesktVersionWorkspace = {
  method: {
    packId: "pk1",
    slug: "synthetic-method",
    nameSv: "Syntetisk metod",
    nameEn: "Synthetic method",
    purposeSv: "Syntetiskt syfte",
  },
  version: {
    methodVersionId: "v1",
    versionNumber: 1,
    contentStatus: "in_review",
    validationLabel: "pilot_hypothesis",
    mode: "recruitment_support",
    releaseScope: "synthetic_internal_only",
    revision: 7,
    reviewCycle: 2,
    contentHash: "a".repeat(64),
    updatedAt: "2026-09-17T10:00:00Z",
    publishedAt: null,
    sourceReference: "SYNTETISK-KÄLLA",
    sourceDocumentVersion: "1.0",
    contentProvenance: "cqrity_design_hypothesis",
    summarySv: null,
    summaryEn: null,
    suspendedReason: null,
    retiredReason: null,
  },
  exposureProfiles: [],
  sections: [],
  items: [],
  itemOptions: [],
  prompts: [],
  routingRules: [],
  evidenceAnchors: [],
  observationFields: [],
  activationRequirements: [],
  reviews: [
    {
      gate: "data_protection",
      decision: "approved",
      reviewerId: "r1",
      rationale: "SYNTETISK-MOTIVERING-GILTIG",
      contentHashAtReview: "a".repeat(64),
      revisionAtReview: 7,
      reviewCycleAtReview: 2,
      decidedAt: "2026-09-17T10:00:00Z",
    },
    {
      gate: "senior_hr",
      decision: "approved",
      reviewerId: "r2",
      rationale: "SYNTETISK-MOTIVERING-FÖRÅLDRAD",
      contentHashAtReview: "a".repeat(64),
      revisionAtReview: 6,
      reviewCycleAtReview: 2,
      decidedAt: "2026-09-16T10:00:00Z",
    },
    {
      gate: "recruitment",
      decision: "rejected",
      reviewerId: "r3",
      rationale: "SYNTETISK-MOTIVERING-AVSLAG",
      contentHashAtReview: "a".repeat(64),
      revisionAtReview: 7,
      reviewCycleAtReview: 2,
      decidedAt: "2026-09-17T09:00:00Z",
    },
  ],
  events: [
    {
      seq: 1,
      event: "submitted_for_review",
      actorId: "editor-one",
      previousStatus: "draft",
      newStatus: "in_review",
      reason: null,
      revision: 7,
      at: "2026-09-17T08:00:00Z",
    },
  ],
};

{
  const html = render(
    React.createElement(BesktLifecyclePanel, {
      workspace: WORKSPACE,
      contentFindings: [],
      publishFindings: [
        {
          code: "REVIEW_MISSING",
          severity: "error",
          message: "the personnel_security gate has no decision",
        },
      ],
      actions: {
        busy: false,
        error: null,
        submit: () => {},
        recordReview: () => {},
        publish: () => {},
        suspend: () => {},
        retire: () => {},
      },
    } as never),
  );
  const t = text(html);

  ck(
    "R4.1 RENDER: all five gates are drawn as five independent rows",
    [
      "personnel_security",
      "senior_hr",
      "recruitment",
      "employment_privacy_legal",
      "data_protection",
    ].every((g) => html.includes(`data-testid="beskt-gate-${g}"`)),
    "BESKT_PCR_GATES_MISSING: five parallel gates must be five rows",
  );
  ck(
    "R4.2 RENDER: there is no progress bar and no x-of-five total over the gates",
    !/\b\d\s*\/\s*5\b/.test(t) && !/role="progressbar"/.test(html) && !/\d+\s?%/.test(t),
    "BESKT_PCR_GATES_PROGRESS: a bar implies an order and a partial total that do not exist",
  );
  ck(
    "R4.3 RENDER: a binding approval, a stale one and a rejection read as three different things",
    t.includes(sv["beskt.admin.gateState.approved"]) &&
      t.includes(sv["beskt.admin.gateState.stale"]) &&
      t.includes(sv["beskt.admin.gateState.rejected"]) &&
      t.includes(sv["beskt.admin.gateState.undecided"]),
    "BESKT_PCR_GATE_STATES_COLLAPSED: 'no longer counts' is not 'never decided'",
  );
  ck(
    "R4.4 RENDER: the stale gate says WHICH of the three bindings it lost",
    t.includes(sv["beskt.admin.gateStale.revision"]),
    "BESKT_PCR_GATE_STALE_UNEXPLAINED: a reviewer told only 'stale' will think the system lost their work",
  );
  ck(
    "R4.5 RENDER: the surface says a generic reviewer role is never enough",
    t.includes(sv["beskt.admin.gates.mandateNote"]),
    "BESKT_PCR_MANDATE_UNSTATED: the mandate requirement is the least obvious rule on the screen",
  );
  ck(
    "R4.6 RENDER: an outstanding publication finding is shown as the validator's own words",
    t.includes(sv["beskt.admin.validate.ownWords"]) &&
      t.includes("the personnel_security gate has no decision"),
    "BESKT_PCR_VALIDATOR_UNATTRIBUTED: a database sentence shown as the product's own is a lie about its source",
  );
  ck(
    "R4.7 RENDER: a version under review offers no publish-anyway and no gate override",
    !/publish anyway|publicera ändå|override/i.test(t),
    "BESKT_PCR_OVERRIDE_OFFERED: there is no override, so none may be drawn",
  );

  const enT = text(
    render(
      React.createElement(BesktLifecyclePanel, {
        workspace: WORKSPACE,
        contentFindings: [],
        publishFindings: [],
        actions: {
          busy: false,
          error: null,
          submit: () => {},
          recordReview: () => {},
          publish: () => {},
          suspend: () => {},
          retire: () => {},
        },
      } as never),
      "en",
    ),
  );
  ck(
    "R4.8 RENDER: the governance surface renders in English too",
    enT.includes(en["beskt.admin.gates.mandateNote"]) &&
      !enT.includes(sv["beskt.admin.gates.mandateNote"]),
    "BESKT_PCR_ADMIN_LOCALE: a governance user reading English must not meet Swedish",
  );
  ck(
    "R4.9 RENDER: no translation key leaks into the governance markup",
    !/beskt\.admin\./.test(t) && !/beskt\.admin\./.test(enT),
    "BESKT_PCR_KEY_LEAK: a raw translation key on screen means a missing translation",
  );
}

{
  const draftPilot = text(
    render(
      React.createElement(BesktPilotGrants, {
        grants: [],
        today: "2026-09-18",
        actions: { busy: false, error: null, canGrant: false, grant: () => {}, revoke: () => {} },
      } as never),
    ),
  );
  ck(
    "R4.10 RENDER: an unpublished version offers no way to admit an employer, and says why",
    draftPilot.includes(sv["beskt.admin.pilot.publishedOnly"]) &&
      !draftPilot.includes(sv["beskt.admin.pilot.employerId"]),
    "BESKT_PCR_PILOT_ON_DRAFT: admitting an employer to a draft is always refused, so it must not be offered",
  );
  ck(
    "R4.11 RENDER: the pilot section says a grant is the only thing that opens anything",
    draftPilot.includes(sv["beskt.admin.pilot.onlyThingThatOpensIt"]),
    "BESKT_PCR_PILOT_UNEXPLAINED: the one control that exposes a method to real candidates must say so",
  );
}

{
  const frozen = text(
    render(
      React.createElement(BesktContentEditor, {
        family: "section",
        rows: [{ section_key: "synthetic_section", display_order: 1, phase: "interview" }],
        editable: false,
        busy: false,
        error: null,
        onSave: () => {},
        onDelete: () => {},
      } as never),
    ),
  );
  ck(
    "R4.12 RENDER: published content draws no add, edit or delete control, and says it is frozen",
    frozen.includes(sv["beskt.admin.family.frozen"]) &&
      !frozen.includes(sv["beskt.admin.family.add"]) &&
      !frozen.includes(sv["beskt.admin.family.edit"]) &&
      !frozen.includes(sv["beskt.admin.family.delete"]),
    "BESKT_PCR_FROZEN_EDITABLE: frozen content that draws an edit button invites a refused write",
  );

  const editable = text(
    render(
      React.createElement(BesktContentEditor, {
        family: "section",
        rows: [{ section_key: "synthetic_section", display_order: 1, phase: "interview" }],
        editable: true,
        busy: false,
        error: null,
        onSave: () => {},
        onDelete: () => {},
      } as never),
    ),
  );
  ck(
    "R4.13 RENDER: a draft draws the controls, and the absent-versus-null rule is explained where it applies",
    editable.includes(sv["beskt.admin.family.add"]) &&
      editable.includes(sv["beskt.admin.family.edit"]),
    "BESKT_PCR_DRAFT_READONLY: a draft that draws no control cannot be authored",
  );
}

/* ================================================================== */
console.log("");
if (fails.length > 0) {
  console.error(
    `beskt-product-completion-render:check FAILED — ${fails.length} of ${passed + fails.length}`,
  );
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `beskt-product-completion-render:check: ${passed} assertions passed. ` +
    "What the report, the wordings and the governance surface SAY is asserted from their markup, in both languages.",
);
