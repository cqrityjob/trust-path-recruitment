// BESKT PR 5B — the VISIBLE interview tool inside Interview Intelligence.
//
// ── WHAT THIS GUARD IS FOR ─────────────────────────────────────────────
//
// PR 5A proved the governed runtime: the tables, the policies, the RPCs, the
// append-only history, the independence rule. None of that is worth anything
// if the screen built on top of it quietly does the opposite — renders a
// withheld position, merges four kinds of claim into one note box, shows a
// skipped question as a warning, or totals two assessors into a number.
//
// So this guard asserts the properties of the SURFACE, and it asserts them
// two ways for every material claim:
//
//   SOURCE   the real module text, with comments stripped, so a rule is never
//            satisfied by a sentence describing it;
//   RENDER   the real components, rendered with renderToStaticMarkup through
//            the real dictionaries, so a claim about what a person SEES is
//            checked against markup rather than intent.
//
// Every assertion here has a planted negative control in
// scripts/negative-controls/beskt-interview-tool-controls.ts: the defect is
// introduced, this guard must fail with a named diagnostic, and the file is
// restored byte-for-byte. An assertion that cannot fail is not an assertion.
//
// Run: bun run beskt-interview-tool:check

import { readFileSync } from "node:fs";
import path from "node:path";
import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The router, with ONE export replaced: `Link` becomes an anchor carrying its
// resolved destination, so an assertion about where a control goes can read
// the rendered markup rather than the source text. Everything else is the real
// module, spread through — replacing the whole thing would mean this guard
// passed or failed on the health of a hand-written stub rather than on the
// BESKT surface.
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
const { BesktSnapshot } = await import("../src/components/employer/interview/beskt/BesktSnapshot");
const { BesktThemes } = await import("../src/components/employer/interview/beskt/BesktThemes");
const { BesktPositionSection } =
  await import("../src/components/employer/interview/beskt/BesktPosition");
const { BesktPanelSection } = await import("../src/components/employer/interview/beskt/BesktPanel");
const { BesktMethodHeader, BesktLimitsPanel } =
  await import("../src/components/employer/interview/beskt/BesktMethodHeader");
const { BesktModuleCard } =
  await import("../src/components/employer/interview/beskt/BesktModuleCard");
const { BesktEntryForm } =
  await import("../src/components/employer/interview/beskt/BesktEntryForm");
const { besktModuleKey, besktWorkspaceKey, besktEntryHistoryKey } =
  await import("../src/lib/beskt/conduct-queries");
const { besktErrorKey } = await import("../src/lib/beskt/errors");

import type {
  BesktConductEntry,
  BesktConductTopic,
  BesktOtherPosition,
  BesktSnapshotAnswer,
} from "../src/lib/beskt/interview-conduct.functions";

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

const FUNCTIONS = "src/lib/beskt/interview-conduct.functions.ts";
const QUERIES = "src/lib/beskt/conduct-queries.ts";
const ROUTE =
  "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.beskt.tsx";
const SNAPSHOT = "src/components/employer/interview/beskt/BesktSnapshot.tsx";
const THEMES = "src/components/employer/interview/beskt/BesktThemes.tsx";
const ENTRY_FORM = "src/components/employer/interview/beskt/BesktEntryForm.tsx";
const HISTORY = "src/components/employer/interview/beskt/BesktEntryHistory.tsx";
const POSITION = "src/components/employer/interview/beskt/BesktPosition.tsx";
const PANEL = "src/components/employer/interview/beskt/BesktPanel.tsx";
const UI = "src/components/employer/interview/beskt/BesktConductUi.tsx";
const MODULE_CARD = "src/components/employer/interview/beskt/BesktModuleCard.tsx";
const VERIFY_FORM = "src/components/employer/interview/beskt/BesktVerificationForm.tsx";

const functionsCode = code(read(FUNCTIONS));
const queriesCode = code(read(QUERIES));
const routeCode = code(read(ROUTE));
const snapshotCode = code(read(SNAPSHOT));
const themesCode = code(read(THEMES));
const entryFormCode = code(read(ENTRY_FORM));
const historyCode = code(read(HISTORY));
const positionCode = code(read(POSITION));
const panelCode = code(read(PANEL));
const uiCode = code(read(UI));
const moduleCardCode = code(read(MODULE_CARD));
const verifyFormCode = code(read(VERIFY_FORM));

const ALL_SURFACE_CODE = [
  routeCode,
  snapshotCode,
  themesCode,
  entryFormCode,
  historyCode,
  positionCode,
  panelCode,
  uiCode,
  moduleCardCode,
  verifyFormCode,
].join("\n");

const sv = dictionaries.sv as Record<string, string>;
const en = dictionaries.en as Record<string, string>;

type Lang = "sv" | "en";
const render = (node: React.ReactNode, lang: Lang = "sv") =>
  renderToStaticMarkup(
    React.createElement(I18nProvider, { initialLang: lang }, node as React.ReactElement),
  );

/** The markup with tags removed: what a person actually READS. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/* ---- Synthetic fixtures. Clearly synthetic, never product content. ---- */

const ANSWERS: readonly BesktSnapshotAnswer[] = [
  {
    itemKey: "synthetic_answered",
    responseState: "answered",
    wordingSv: "Syntetisk fråga ett",
    wordingEn: "Synthetic question one",
    purposeSv: "Syntetiskt syfte ett",
    purposeEn: "Synthetic purpose one",
    valueBoolean: null,
    valueText: "Syntetiskt svar",
    valueDate: null,
    selectedOptionKeys: [],
  },
  {
    itemKey: "synthetic_omitted",
    responseState: "omitted",
    wordingSv: "Syntetisk fråga två",
    wordingEn: "Synthetic question two",
    purposeSv: "Syntetiskt syfte två",
    purposeEn: "Synthetic purpose two",
    valueBoolean: null,
    valueText: null,
    valueDate: null,
    selectedOptionKeys: [],
  },
  {
    itemKey: "synthetic_oral",
    responseState: "discuss_orally",
    wordingSv: "Syntetisk fråga tre",
    wordingEn: "Synthetic question three",
    purposeSv: "Syntetiskt syfte tre",
    purposeEn: "Synthetic purpose three",
    valueBoolean: null,
    valueText: null,
    valueDate: null,
    selectedOptionKeys: [],
  },
];

const TOPICS: readonly BesktConductTopic[] = [
  {
    topicId: "00000000-0000-4000-8000-000000000001",
    itemKey: "synthetic_omitted",
    reason: "omitted",
    wordingSv: "Syntetisk fråga två",
    wordingEn: "Synthetic question two",
    purposeSv: "Syntetiskt syfte två",
    purposeEn: "Synthetic purpose two",
  },
  {
    topicId: "00000000-0000-4000-8000-000000000002",
    itemKey: "synthetic_oral",
    reason: "discuss_orally",
    wordingSv: "Syntetisk fråga tre",
    wordingEn: "Synthetic question three",
    purposeSv: "Syntetiskt syfte tre",
    purposeEn: "Synthetic purpose three",
  },
];

const MY_ENTRY: BesktConductEntry = {
  entryId: "00000000-0000-4000-8000-0000000000e1",
  itemKey: "synthetic_omitted",
  topicId: "00000000-0000-4000-8000-000000000001",
  entryVersion: 2,
  observableFact: "Syntetiskt observerbart faktum",
  candidateExplanation: "Syntetisk kandidatförklaring",
  interviewerInterpretation: "Syntetisk tolkning",
  alternativeExplanation: "Syntetisk alternativ förklaring",
  protectiveFactor: "Syntetisk skyddande faktor",
  verificationNeed: "Syntetiskt verifieringsbehov",
  verificationState: "requested",
  verificationSource: "Syntetisk källa",
  sensitivityClass: "ordinary",
  recordedAt: "2026-02-01T09:00:00.000Z",
};

const OTHER: BesktOtherPosition = {
  positionId: "00000000-0000-4000-8000-0000000000p2",
  assessorId: "00000000-0000-4000-8000-0000000000u2",
  positionRole: "assessor",
  state: "locked",
  lockedAt: "2026-02-01T10:00:00.000Z",
  entries: [
    {
      entryId: "00000000-0000-4000-8000-0000000000e2",
      itemKey: "synthetic_oral",
      observableFact: "SYNTHETIC_OTHER_FACT",
      candidateExplanation: null,
      interviewerInterpretation: "SYNTHETIC_OTHER_INTERPRETATION",
      alternativeExplanation: null,
      protectiveFactor: null,
      verificationState: "not_required",
    },
  ],
};

const NO_ACTIONS = {
  canWrite: false,
  pendingItemKey: null,
  savedItemKey: null,
  saveError: null,
  verifyPendingEntryId: null,
  verifiedEntryId: null,
  verifyError: null,
  saveEntry: () => {},
  recordVerification: () => {},
};

const WRITE_ACTIONS = { ...NO_ACTIONS, canWrite: true };

const BINDING = {
  nameSv: "Syntetisk metod",
  nameEn: "Synthetic method",
  versionNumber: 1,
  mode: "recruitment_support",
  validationLabel: "pilot_hypothesis",
  releaseScope: "synthetic_internal_only",
  methodVersionId: "00000000-0000-4000-8000-0000000000mv",
  contentHash: "a".repeat(64),
  answersContentHash: "b".repeat(64),
  responseVersion: 1,
  linkedAt: "2026-01-15T08:00:00.000Z",
};

/* ================================================================== */
group("T1 · The server functions are thin, governed pass-throughs");

ck(
  "T1.1 the conduct module never names service_role",
  !/service_role/.test(functionsCode),
  "BESKT_TOOL_SERVICE_ROLE: the conduct server functions must never name service_role",
);

ck(
  "T1.2 the conduct module writes no table directly",
  !/\.\s*(insert|update|upsert|delete)\s*\(/.test(functionsCode),
  "BESKT_TOOL_DIRECT_WRITE: the conduct server functions must write only through governed RPCs",
);

// Every mutation names an operation id: the database answers a replay before
// it writes, and it can only do that if the id is carried.
const MUTATIONS = [
  "startBesktConductSession",
  "joinBesktConductSession",
  "saveBesktConductEntry",
  "recordBesktVerification",
  "lockBesktPosition",
  "reopenBesktPosition",
  "openBesktPanel",
  "revealBesktPanel",
  "recordBesktPanelResolution",
] as const;

/**
 * Exactly one exported function's source, and nothing of the next one.
 *
 * A fixed-length slice was the first version of this and it was WRONG: it ran
 * past the end of a short mutation into the next one, so a defect planted in
 * the short one was answered by its neighbour's correct code. The planted
 * control caught it, which is what planted controls are for.
 */
function bodyOf(name: string): string {
  const start = functionsCode.indexOf(`export const ${name} =`);
  if (start === -1) return "";
  const next = functionsCode.indexOf("\nexport ", start + 1);
  return functionsCode.slice(start, next === -1 ? undefined : next);
}

for (const name of MUTATIONS) {
  const start = functionsCode.indexOf(`export const ${name} =`);
  const rest = bodyOf(name);
  ck(
    `T1.3 ${name} validates with Zod and forwards the CALLER'S operation id`,
    start !== -1 && /\.validator\(/.test(rest) && /_operation_id:\s*data\.operationId/.test(rest),
    "BESKT_TOOL_OPERATION_ID: every governed mutation must forward the caller's own operation id",
  );
}

// The compare-and-swap mutations name the revision the caller was looking at.
for (const name of [
  "saveBesktConductEntry",
  "recordBesktVerification",
  "lockBesktPosition",
  "reopenBesktPosition",
  "revealBesktPanel",
  "recordBesktPanelResolution",
] as const) {
  const rest = bodyOf(name);
  ck(
    `T1.4 ${name} forwards the revision the caller was looking at`,
    /_expected_revision:\s*data\.expectedRevision/.test(rest),
    "BESKT_TOOL_EXPECTED_REVISION: every compare-and-swap mutation must forward the revision it read",
  );
}

// Tenant and actor facts the database derives itself must never be accepted
// from the client: a request that could name them could name someone else's.
const DERIVABLE = ["employerId", "tenantId", "assessorId", "actorId", "userId", "candidateId"];
for (const field of DERIVABLE) {
  ck(
    `T1.5 the client never supplies ${field}`,
    !new RegExp(`${field}\\s*:\\s*z\\.`).test(functionsCode),
    `BESKT_TOOL_CLIENT_FACT: ${field} is derivable by the database and must not be accepted from the client`,
  );
}

ck(
  "T1.6 every conduct read and write goes through supabase.rpc or a policy-governed select",
  (functionsCode.match(/supabase\.rpc\(/g) ?? []).length >= 12,
  "BESKT_TOOL_RPC_COUNT: the conduct module must call the governed RPCs, not compose its own SQL",
);

/* ================================================================== */
group("T2 · The independence rule survives the client");

ck(
  "T2.1 the route converts a withheld list into null, never an empty array",
  /othersVisible\s*\?\s*w\.others\s*:\s*null/.test(routeCode),
  "BESKT_TOOL_INDEPENDENCE: the route must pass null — not [] — while positions are withheld",
);

/**
 * EVERY declaration of an others list must admit the withheld case.
 *
 * The first version of this looked for one nullable declaration anywhere in
 * the file and was satisfied by the inner component while the outer one had
 * quietly lost its `| null`. The planted control caught that, so the check is
 * now over all of them: a single non-nullable declaration is a place the
 * withholding cannot be expressed.
 */
function everyOthersDeclarationIsNullable(src: string): boolean {
  const decls = [...src.matchAll(/\bothers:\s*readonly\s+BesktOtherPosition\[\][^;\n]*/g)].map(
    (m) => m[0],
  );
  return decls.length > 0 && decls.every((d) => /\|\s*null/.test(d));
}

ck(
  "T2.2 every others declaration in the position section admits the withheld case",
  everyOthersDeclarationIsNullable(positionCode),
  "BESKT_TOOL_INDEPENDENCE_TYPE: the position section must take a nullable others list",
);

ck(
  "T2.3 every others declaration in the panel section admits the withheld case",
  everyOthersDeclarationIsNullable(panelCode),
  "BESKT_TOOL_INDEPENDENCE_TYPE: the panel section must take a nullable others list",
);

ck(
  "T2.4 no surface fetches positions or entries outside the workspace payload",
  !/from\(\s*["'`]bcp_conduct_(positions|entries|verifications)["'`]/.test(
    `${functionsCode}\n${ALL_SURFACE_CODE}`,
  ),
  "BESKT_TOOL_INDEPENDENCE_FETCH: positions and entries must arrive only in the governed workspace payload",
);

// RENDER: with others withheld, nothing of the other position is in the DOM.
{
  const html = render(
    <BesktPositionSection
      position={{
        positionId: "p1",
        state: "open",
        positionRole: "assessor",
        revision: 3,
        lockedAt: null,
        reopenCount: 0,
      }}
      entries={[MY_ENTRY]}
      topics={TOPICS}
      others={null}
      lockBusy={false}
      lockError={null}
      reopenBusy={false}
      reopenError={null}
      onLock={() => {}}
      onReopen={() => {}}
    />,
  );
  // T2.5 and T2.7 are one assertion in two halves: the same code path must
  // render NOTHING when the list is withheld and EVERYTHING when it is not.
  // Neither half can be satisfied by a component that renders nothing ever,
  // which is what keeps the absence assertion from being vacuous.
  ck(
    "T2.5 RENDER: a withheld position is not in the markup at all",
    !html.includes("SYNTHETIC_OTHER_FACT") && !html.includes("SYNTHETIC_OTHER_INTERPRETATION"),
    "BESKT_TOOL_INDEPENDENCE_DOM: no part of a withheld position may reach the DOM",
  );
  ck(
    "T2.6 RENDER: the reader is told positions are withheld, and why",
    text(html).includes(sv["beskt.conduct.others.hidden.title"]) &&
      text(html).includes(sv["beskt.conduct.others.hidden.body"]),
    "BESKT_TOOL_INDEPENDENCE_SAID: a withheld position must be explained, not silently absent",
  );

  const visible = render(
    <BesktPositionSection
      position={{
        positionId: "p1",
        state: "locked",
        positionRole: "assessor",
        revision: 4,
        lockedAt: "2026-02-01T11:00:00.000Z",
        reopenCount: 0,
      }}
      entries={[MY_ENTRY]}
      topics={TOPICS}
      others={[OTHER]}
      lockBusy={false}
      lockError={null}
      reopenBusy={false}
      reopenError={null}
      onLock={() => {}}
      onReopen={() => {}}
    />,
  );
  ck(
    "T2.7 RENDER: once the reader has locked, the other position is shown in full",
    visible.includes("SYNTHETIC_OTHER_FACT") && visible.includes("SYNTHETIC_OTHER_INTERPRETATION"),
    "BESKT_TOOL_INDEPENDENCE_REVEAL: a revealed position must be shown, not summarised away",
  );
  ck(
    "T2.8 RENDER: the difference is stated factually and never aggregated",
    text(visible).includes(sv["beskt.conduct.others.noAggregation"]),
    "BESKT_TOOL_NO_AGGREGATION_SAID: the surface must say positions are not weighed together",
  );
}

/* ================================================================== */
group("T3 · No score, no ranking, no verdict — in computation, not only copy");

// The forbidden operation is ARITHMETIC OVER POSITIONS OR ENTRIES. Copy that
// denies a score is welcome; code that computes one is not.
const AGGREGATIONS = [
  /\.reduce\s*\(/,
  /\/\s*(others|positions|entries|assessors)\.length/,
  /Math\.(round|max|min)\s*\(\s*(others|positions|entries)/,
  /\baverage\b|\bmedelvärde\b|\bweightedScore\b|\btotalScore\b|\bconsensusScore\b/i,
];
for (const [i, re] of AGGREGATIONS.entries()) {
  ck(
    `T3.${i + 1} no aggregation over positions or entries (${re.source})`,
    !re.test(ALL_SURFACE_CODE),
    "BESKT_TOOL_AGGREGATION: the surface must not compute a total, an average or a score",
  );
}

ck(
  "T3.5 the limits are stated on the working surface",
  (() => {
    const html = text(render(<BesktLimitsPanel />));
    return (
      html.includes(sv["beskt.conduct.limits.is"]) &&
      html.includes(sv["beskt.conduct.limits.isNot"])
    );
  })(),
  "BESKT_TOOL_LIMITS: the surface must say in words what BESKT is and is not",
);

ck(
  "T3.6 the panel states that it produces no score, ranking or recommendation",
  (() => {
    const html = text(
      render(
        <BesktPanelSection
          panel={null}
          myEntries={[MY_ENTRY]}
          others={null}
          openBusy={false}
          openError={null}
          revealBusy={false}
          revealError={null}
          resolutionBusy={false}
          resolutionError={null}
          onOpen={() => {}}
          onReveal={() => {}}
          onRecord={() => {}}
        />,
      ),
    );
    return html.includes(sv["beskt.conduct.panel.noTotal"]);
  })(),
  "BESKT_TOOL_PANEL_NO_TOTAL: the panel must say it produces no score, ranking or recommendation",
);

/* ================================================================== */
group("T4 · The candidate's submitted answers are immutable here");

ck(
  "T4.1 the snapshot renders no control that could edit an answer",
  !/<input|<textarea|<select|<button|onChange|contentEditable/.test(snapshotCode),
  "BESKT_TOOL_SNAPSHOT_EDITABLE: the interviewer surface must not offer to edit a submitted answer",
);

{
  const html = render(<BesktSnapshot answers={ANSWERS} />);
  ck(
    "T4.2 RENDER: the snapshot markup contains no form control",
    !/<input|<textarea|<select|<button/.test(html),
    "BESKT_TOOL_SNAPSHOT_CONTROL: the rendered snapshot must contain no form control",
  );
  ck(
    "T4.3 RENDER: the snapshot says the answers cannot be changed here",
    text(html).includes(sv["beskt.conduct.snapshot.readOnly"]),
    "BESKT_TOOL_SNAPSHOT_READONLY_SAID: the snapshot must say the answers are read-only",
  );
  ck(
    "T4.4 RENDER: all three response states are shown in words",
    text(html).includes(sv["beskt.conduct.snapshot.state.answered"]) &&
      text(html).includes(sv["beskt.conduct.snapshot.state.omitted"]) &&
      text(html).includes(sv["beskt.conduct.snapshot.state.discuss_orally"]),
    "BESKT_TOOL_SNAPSHOT_STATES: every response state must be rendered as words",
  );
  ck(
    "T4.5 RENDER: a skipped answer carries no warning or error styling",
    (() => {
      // The list item that carries the omitted chip must not use the amber or
      // destructive families. Colour is not the carrier of meaning here, and
      // the meaning it would carry is a verdict this product does not give.
      const item = html.slice(
        html.indexOf("synthetic_omitted") - 2000,
        html.indexOf("synthetic_omitted"),
      );
      return !/destructive|amber|text-red|bg-red/.test(item);
    })(),
    "BESKT_TOOL_OMITTED_NEUTRAL: a skipped or oral answer must be shown neutrally, never as a warning",
  );
  ck(
    "T4.6 RENDER: the snapshot says what the candidate's states do and do not mean",
    text(html).includes(sv["beskt.conduct.snapshot.stateMeaning"]),
    "BESKT_TOOL_STATE_MEANING: the surface must say a skipped answer means nothing beyond itself",
  );
}

ck(
  "T4.7 the neutral chip never uses an attention or governance tone",
  (() => {
    const start = uiCode.indexOf("export function ResponseStateChip");
    const body = uiCode.slice(start, uiCode.indexOf("}", uiCode.indexOf("return", start)) + 1);
    return start !== -1 && !/"attention"/.test(body) && !/"governance"/.test(body);
  })(),
  "BESKT_TOOL_RESPONSE_TONE: the candidate's own response state must never render as attention or governance",
);

/* ================================================================== */
group("T5 · The themes are the database's, not the screen's");

{
  const html = render(
    <BesktThemes
      sessionId="s1"
      methodVersionId={BINDING.methodVersionId}
      topics={TOPICS}
      entries={[]}
      prompts={null}
      actions={NO_ACTIONS}
    />,
  );
  const t = text(html);
  ck(
    "T5.1 RENDER: every derived theme appears with the method's own wording",
    t.includes("Syntetisk fråga två") && t.includes("Syntetisk fråga tre"),
    "BESKT_TOOL_THEME_WORDING: each theme must render the governed wording it carries",
  );
  ck(
    "T5.2 RENDER: each theme says WHY it exists, in the candidate's own terms",
    t.includes(sv["beskt.conduct.themes.reason.omitted"]) &&
      t.includes(sv["beskt.conduct.themes.reason.discuss_orally"]),
    "BESKT_TOOL_THEME_REASON: each theme must say which candidate choice produced it",
  );
  ck(
    "T5.3 RENDER: the governed question basis is shown",
    t.includes("Syntetiskt syfte två"),
    "BESKT_TOOL_THEME_PURPOSE: each theme must show the method's own purpose for the question",
  );
  ck(
    "T5.4 RENDER: the exact item key and method version are shown",
    t.includes("synthetic_omitted") && t.includes(BINDING.methodVersionId),
    "BESKT_TOOL_THEME_IDENTITY: each theme must show its exact item key and method version",
  );
  ck(
    "T5.5 RENDER: an empty theme list is explained rather than filled",
    text(
      render(
        <BesktThemes
          sessionId="s1"
          methodVersionId={BINDING.methodVersionId}
          topics={[]}
          entries={[]}
          prompts={null}
          actions={NO_ACTIONS}
        />,
      ),
    ).includes(sv["beskt.conduct.themes.empty"]),
    "BESKT_TOOL_THEME_EMPTY: no themes must be said, never manufactured",
  );
}

ck(
  "T5.6 no theme, prompt or question text is invented in the client",
  !/\bconst\s+(THEMES|PROMPTS|QUESTIONS|SUGGESTED)\b/.test(ALL_SURFACE_CODE) &&
    !/Math\.random|generatePrompt|suggestTheme/.test(ALL_SURFACE_CODE),
  "BESKT_TOOL_INVENTED_CONTENT: the client must not invent a theme, a prompt or a question",
);

/* ================================================================== */
group("T6 · Eight separate fields, never one note box");

const SEPARATE_FIELDS = [
  "beskt.conduct.entry.observableFact",
  "beskt.conduct.entry.candidateExplanation",
  "beskt.conduct.entry.interviewerInterpretation",
  "beskt.conduct.entry.alternativeExplanation",
  "beskt.conduct.entry.protectiveFactor",
  "beskt.conduct.entry.verificationNeed",
  "beskt.conduct.entry.verificationSource",
  "beskt.conduct.entry.sensitivityClass",
] as const;

for (const key of SEPARATE_FIELDS) {
  ck(
    `T6.1 the form has its own control for ${key.split(".").pop()}`,
    entryFormCode.includes(`"${key}"`),
    `BESKT_TOOL_FIELD_MISSING: ${key} must be its own labelled control`,
  );
}

ck(
  "T6.2 there is no merged note, summary or free-text catch-all field",
  !/\b(notes|note|summary|comment|freeText)\s*:\s*(string|z\.)/.test(entryFormCode) ||
    !/BesktEntryFields[\s\S]*?\bnotes\b/.test(entryFormCode),
  "BESKT_TOOL_MERGED_NOTE: the structured record must not grow a merged note field",
);

ck(
  "T6.3 every field carries helper text separating observation from interpretation",
  ["observableFactHelp", "candidateExplanationHelp", "interviewerInterpretationHelp"].every((h) =>
    entryFormCode.includes(h),
  ),
  "BESKT_TOOL_FIELD_HELP: each field must carry helper text saying which kind of claim belongs there",
);

{
  const html = render(
    <BesktThemes
      sessionId="s1"
      methodVersionId={BINDING.methodVersionId}
      topics={TOPICS}
      entries={[MY_ENTRY]}
      prompts={null}
      actions={WRITE_ACTIONS}
    />,
  );
  const t = text(html);
  ck(
    "T6.4 RENDER: every one of the eight fields is labelled on the read-only record",
    [
      "beskt.conduct.entry.observableFact",
      "beskt.conduct.entry.candidateExplanation",
      "beskt.conduct.entry.interviewerInterpretation",
      "beskt.conduct.entry.alternativeExplanation",
      "beskt.conduct.entry.protectiveFactor",
      "beskt.conduct.entry.verificationNeed",
      "beskt.conduct.entry.verificationSource",
    ].every((k) => t.includes(sv[k])),
    "BESKT_TOOL_FIELD_RENDER: each structured field must be labelled where it is read",
  );
}

{
  // The form itself, rendered. A claim about what a person documenting the
  // interview is TOLD has to be checked where they are told it.
  const form = render(
    <BesktEntryForm
      itemKey="synthetic_omitted"
      correcting={false}
      existing={null}
      busy={false}
      error={null}
      onSubmit={() => {}}
      onCancel={() => {}}
    />,
  );
  const ft = text(form);
  ck(
    "T6.5 RENDER: the form says observation and interpretation stay apart",
    ft.includes(sv["beskt.conduct.entry.separation"]),
    "BESKT_TOOL_SEPARATION_SAID: the form must say observation and interpretation stay apart",
  );
  ck(
    "T6.6 RENDER: every one of the eight fields is a labelled control in the form",
    SEPARATE_FIELDS.every((k) => ft.includes(sv[k])),
    "BESKT_TOOL_FIELD_FORM: each structured field must be a labelled control in the form",
  );
  ck(
    "T6.7 RENDER: the two fields most easily confused carry their own helper text",
    ft.includes(sv["beskt.conduct.entry.observableFactHelp"]) &&
      ft.includes(sv["beskt.conduct.entry.interviewerInterpretationHelp"]),
    "BESKT_TOOL_FIELD_HELP_RENDER: observation and interpretation must each carry their own help",
  );
  ck(
    "T6.8 RENDER: every field label is wired to its control and its help",
    (() => {
      const labels = [...form.matchAll(/<label[^>]*for="([^"]+)"/g)].map((m) => m[1]);
      if (labels.length < 9) return false;
      return labels.every((id) => form.includes(`id="${id}"`));
    })(),
    "BESKT_TOOL_LABEL_WIRING: every field label must name the control it labels",
  );
  ck(
    "T6.9 RENDER: a new record offers no correction-reason field",
    !ft.includes(sv["beskt.conduct.correction.reason"]),
    "BESKT_TOOL_REASON_SCOPE: a first record must not ask for a correction reason",
  );

  const correction = text(
    render(
      <BesktEntryForm
        itemKey="synthetic_omitted"
        correcting={true}
        existing={MY_ENTRY}
        busy={false}
        error={null}
        onSubmit={() => {}}
        onCancel={() => {}}
      />,
    ),
  );
  ck(
    "T6.10 RENDER: a correction asks for a reason and says a new version is created",
    correction.includes(sv["beskt.conduct.correction.reason"]) &&
      correction.includes(sv["beskt.conduct.correction.note"]),
    "BESKT_TOOL_CORRECTION_FORM: a correction must ask why and say nothing is overwritten",
  );
  ck(
    "T6.11 RENDER: a correction starts from the version being corrected",
    correction.includes("Syntetiskt observerbart faktum"),
    "BESKT_TOOL_CORRECTION_PREFILL: a correction must start from the version it supersedes",
  );
}

/* ================================================================== */
group("T7 · Corrections create versions; nothing is overwritten or hidden");

ck(
  "T7.1 a correction refuses to submit without a reason",
  /reason\.trim\(\)\.length\s*<\s*3/.test(entryFormCode),
  "BESKT_TOOL_CORRECTION_REASON: a correction must require a reason before it is sent",
);

ck(
  "T7.2 a correction names the entry it supersedes rather than replacing it",
  /correctsEntryId/.test(entryFormCode + themesCode + routeCode),
  "BESKT_TOOL_CORRECTION_CHAIN: a correction must name the entry it supersedes",
);

ck(
  "T7.3 the history renders every version, current and earlier alike",
  /beskt\.conduct\.history\.current/.test(historyCode) &&
    /beskt\.conduct\.history\.historical/.test(historyCode),
  "BESKT_TOOL_HISTORY_LABELS: the history must distinguish the current version from earlier ones",
);

ck(
  "T7.4 the history never filters superseded versions out of the list",
  !/versions\s*\.\s*filter\s*\(/.test(historyCode),
  "BESKT_TOOL_HISTORY_FILTER: no version may be filtered out of the history",
);

ck(
  "T7.5 the history shows who recorded each version and when",
  /v\.recordedBy\s*&&/.test(historyCode) &&
    /\{v\.recordedBy\}/.test(historyCode) &&
    /v\.recordedAt\s*&&/.test(historyCode),
  "BESKT_TOOL_HISTORY_ATTRIBUTION: each version must show who wrote it and when",
);

ck(
  "T7.6 the history shows the reason each version was corrected",
  /correctionReason/.test(historyCode),
  "BESKT_TOOL_HISTORY_REASON: each corrected version must show why it changed",
);

/* ================================================================== */
group("T8 · Verification is work, never a conclusion about a person");

ck(
  "T8.1 the verification form offers exactly the governed states",
  /BESKT_VERIFICATION_STATES/.test(verifyFormCode) &&
    !/["'`](suspicious|dishonest|untruthful|lying)["'`]/i.test(verifyFormCode),
  "BESKT_TOOL_VERIFICATION_VOCAB: only the governed verification states may be offered",
);

ck(
  "T8.2 a settled verification state requires a source",
  /SOURCE_REQUIRED\.includes\(\s*state\s*\)/.test(verifyFormCode) &&
    /source\.trim\(\)\s*===\s*""/.test(verifyFormCode) &&
    /beskt\.conduct\.verify\.sourceRequired/.test(verifyFormCode),
  "BESKT_TOOL_VERIFICATION_SOURCE: a settled verification must name its source",
);

ck(
  "T8.3 an open verification need is described as work, not as a finding",
  /beskt\.conduct\.verification\.openNote/.test(verifyFormCode + entryFormCode),
  "BESKT_TOOL_VERIFICATION_NEUTRAL: an open verification need must be described as remaining work",
);

ck(
  "T8.4 the surface says what 'not verified' does NOT mean",
  /beskt\.conduct\.verification\.notVerifiedMeaning/.test(themesCode),
  "BESKT_TOOL_NOT_VERIFIED_MEANING: the surface must say 'not verified' is not a truth judgement",
);

ck(
  "T8.5 no verification state renders as a governance error",
  (() => {
    const start = uiCode.indexOf("export function VerificationChip");
    const body = uiCode.slice(start, start + 700);
    return start !== -1 && !/"governance"/.test(body);
  })(),
  "BESKT_TOOL_VERIFICATION_TONE: no verification state may render as a governance error",
);

/* ================================================================== */
group("T9 · Locking, reopening, and the read-only state");

ck(
  "T9.1 locking is confirmed through a real, described dialog",
  /role="dialog"/.test(positionCode) &&
    /aria-modal="true"/.test(positionCode) &&
    /aria-describedby=/.test(positionCode),
  "BESKT_TOOL_LOCK_DIALOG: locking must be confirmed through a described dialog",
);

ck(
  "T9.2 the confirmation says what locking changes",
  sv["beskt.conduct.position.lockDialog.body"].length > 60 &&
    en["beskt.conduct.position.lockDialog.body"].length > 60,
  "BESKT_TOOL_LOCK_BODY: the lock confirmation must explain what locking changes",
);

ck(
  "T9.3 reopening refuses without a reason",
  /reason\.trim\(\)\.length\s*<\s*3/.test(positionCode),
  "BESKT_TOOL_REOPEN_REASON: reopening a locked position must require a reason",
);

{
  const lockedHtml = render(
    <BesktPositionSection
      position={{
        positionId: "p1",
        state: "locked",
        positionRole: "assessor",
        revision: 7,
        lockedAt: "2026-02-01T11:30:00.000Z",
        reopenCount: 1,
      }}
      entries={[MY_ENTRY]}
      topics={TOPICS}
      others={[]}
      lockBusy={false}
      lockError={null}
      reopenBusy={false}
      reopenError={null}
      onLock={() => {}}
      onReopen={() => {}}
    />,
  );
  const t = text(lockedHtml);
  ck(
    "T9.4 RENDER: a locked position says it is read-only and shows revision and time",
    t.includes(sv["beskt.conduct.position.readOnly"]) &&
      t.includes("7") &&
      t.includes("2026-02-01 11:30"),
    "BESKT_TOOL_LOCKED_FACTS: a locked position must show that it is locked, when, and at which revision",
  );
  ck(
    "T9.5 RENDER: a locked position offers no lock control",
    !t.includes(sv["beskt.conduct.position.lock"]),
    "BESKT_TOOL_LOCKED_CONTROL: a locked position must not offer to lock again",
  );

  const openHtml = text(
    render(
      <BesktPositionSection
        position={{
          positionId: "p1",
          state: "open",
          positionRole: "assessor",
          revision: 1,
          lockedAt: null,
          reopenCount: 0,
        }}
        entries={[]}
        topics={TOPICS}
        others={null}
        lockBusy={false}
        lockError={null}
        reopenBusy={false}
        reopenError={null}
        onLock={() => {}}
        onReopen={() => {}}
      />,
    ),
  );
  ck(
    "T9.6 RENDER: an empty position names the completeness blocker",
    openHtml.includes(sv["beskt.conduct.position.blocker.noEntries"]),
    "BESKT_TOOL_LOCK_BLOCKER: a position with nothing in it must say why it cannot be locked",
  );
}

/* ================================================================== */
group("T10 · The panel records disagreement rather than resolving it away");

ck(
  "T10.1 a disagreement refuses to submit without the divergent statement",
  /conductDivergenceRequired/.test(panelCode),
  "BESKT_TOOL_DIVERGENCE_REQUIRED: a recorded disagreement must carry the divergent position",
);

ck(
  "T10.2 the panel never writes into an assessor's entries",
  !/saveBesktConductEntry|bcp_conduct_save_entry/.test(panelCode),
  "BESKT_TOOL_PANEL_WRITES_ENTRIES: the panel must not write into an assessor's own record",
);

ck(
  "T10.3 the panel says it preserves the assessors' own positions",
  /beskt\.conduct\.panel\.preservesPositions/.test(panelCode),
  "BESKT_TOOL_PANEL_PRESERVES: the panel must say it leaves the assessors' positions untouched",
);

{
  const html = text(
    render(
      <BesktPanelSection
        panel={{
          panelId: "pan1",
          state: "revealed",
          revision: 2,
          revealedAt: "2026-02-01T12:00:00.000Z",
          resolutions: [
            {
              resolutionId: "r1",
              itemKey: "synthetic_oral",
              resolutionKind: "disagreed",
              agreedStatement: null,
              divergentStatement: "SYNTHETIC_DIVERGENT_POSITION",
              rationale: "Syntetisk motivering",
              recordedAt: "2026-02-01T12:05:00.000Z",
            },
          ],
        }}
        myEntries={[MY_ENTRY]}
        others={[OTHER]}
        openBusy={false}
        openError={null}
        revealBusy={false}
        revealError={null}
        resolutionBusy={false}
        resolutionError={null}
        onOpen={() => {}}
        onReveal={() => {}}
        onRecord={() => {}}
      />,
    ),
  );
  ck(
    "T10.4 RENDER: a recorded disagreement keeps the divergent position word for word",
    html.includes("SYNTHETIC_DIVERGENT_POSITION"),
    "BESKT_TOOL_DIVERGENT_PRESERVED: a divergent position must be shown verbatim",
  );
  ck(
    "T10.5 RENDER: disagreement is a first-class outcome with its own words",
    html.includes(sv["beskt.conduct.panel.resolution.kind.disagreed"]),
    "BESKT_TOOL_DISAGREED_LABEL: disagreement must be a named outcome, not an absence",
  );
  ck(
    "T10.6 RENDER: common points and differences are both shown",
    html.includes(sv["beskt.conduct.panel.common"]) &&
      html.includes(sv["beskt.conduct.panel.divergent"]),
    "BESKT_TOOL_PANEL_COMPARISON: the panel must show both what is common and what differs",
  );
}

/* ================================================================== */
group("T11 · Errors, query identity and the module gate");

ck(
  "T11.1 every surface that shows a failure routes it through the governed map",
  [routeCode, historyCode, positionCode, panelCode, entryFormCode, verifyFormCode].every((c) =>
    /besktErrorKey\(/.test(c),
  ),
  "BESKT_TOOL_ERROR_MAP: every failure shown to a person must go through besktErrorKey",
);

ck(
  "T11.2 no surface renders a raw error message",
  // Any JSX expression that reaches `.message` off something called `error`,
  // however it is cast or parenthesised, and any stringified error. The first
  // version of this required the expression to start with the identifier and
  // was walked straight past by `{(q.error as Error).message}`.
  !/\{[^{}]*\berror\b[^{}]*\.message[^{}]*\}/.test(ALL_SURFACE_CODE) &&
    !/String\(\s*[\w.]*[eE]rror[\w.]*\s*\)/.test(ALL_SURFACE_CODE),
  "BESKT_TOOL_RAW_ERROR: an original error message must never reach the DOM",
);

ck(
  "T11.3 the governed conduct codes are translated rather than falling through",
  [
    "BCP_CONDUCT_NOT_PERMITTED",
    "BCP_CONDUCT_POSITION_LOCKED",
    "BCP_CONDUCT_NOT_VISIBLE_YET",
    "BCP_CONDUCT_REVEAL_TOO_EARLY",
    "BCP_CONDUCT_CORRECTION_REASON_REQUIRED",
    "BCP_STALE_REVISION",
  ].every((c) => besktErrorKey(new Error(`${c}: synthetic`)) !== "beskt.error.generic"),
  "BESKT_TOOL_ERROR_COVERAGE: every conduct refusal a person can provoke must have its own sentence",
);

ck(
  "T11.4 the query keys isolate employer, case and session",
  (() => {
    const k = besktWorkspaceKey("emp-a", "case-b", "sess-c");
    const m = besktModuleKey("emp-a", "case-b");
    const h = besktEntryHistoryKey("sess-c", "entry-d");
    return (
      k.includes("emp-a") &&
      k.includes("case-b") &&
      k.includes("sess-c") &&
      m.includes("emp-a") &&
      m.includes("case-b") &&
      h.includes("sess-c") &&
      h.includes("entry-d")
    );
  })(),
  "BESKT_TOOL_QUERY_KEYS: a cache key must name the employer, the case and the session",
);

ck(
  "T11.5 there is no separate cache key for other people's positions",
  !/others.*Key|otherPositionsKey/i.test(queriesCode),
  "BESKT_TOOL_OTHERS_KEY: withheld positions must have no cache key of their own",
);

ck(
  "T11.6 the module gate is the server's answer, not a client decision",
  /mod\.linked/.test(routeCode) &&
    /mod\.submitted/.test(routeCode) &&
    /mod\.methodBindingValid/.test(routeCode),
  "BESKT_TOOL_MODULE_GATE: the route must read the server's gate rather than re-deciding it",
);

ck(
  "T11.7 the module card is absent only when there is no link at all",
  /if\s*\(!module\.linked\)\s*return null/.test(moduleCardCode),
  "BESKT_TOOL_MODULE_CARD_GATE: the card must explain a blocked module rather than vanish",
);

{
  const card = text(
    render(
      <BesktModuleCard
        module={{
          caseId: "c1",
          linked: true,
          linkId: "l1",
          assignmentId: "a1",
          applicationId: "ap1",
          linkedAt: "2026-01-15T08:00:00.000Z",
          submitted: false,
          methodBindingValid: false,
          method: null,
          answers: [],
          topics: [],
          sessionId: null,
          sessionState: null,
          available: false,
        }}
        employerSlug="synthetic-ab"
        caseId="c1"
      />,
    ),
  );
  ck(
    "T11.8 RENDER: an unsubmitted preparation is explained on the case overview",
    card.includes(sv["beskt.module.notSubmitted"]),
    "BESKT_TOOL_MODULE_NOT_SUBMITTED: a linked but unsubmitted preparation must be explained",
  );
  ck(
    "T11.9 RENDER: the module card states the limits where a recruiter first meets it",
    card.includes(sv["beskt.module.limits"]),
    "BESKT_TOOL_MODULE_LIMITS: the module card must state what BESKT does not produce",
  );
}

/* ================================================================== */
group("T12 · Language, accessibility and the design system");

const CONDUCT_KEYS = Object.keys(sv).filter(
  (k) => k.startsWith("beskt.conduct.") || k.startsWith("beskt.module."),
);

ck(
  "T12.1 there is a Swedish and an English sentence for every conduct key",
  CONDUCT_KEYS.length > 150 &&
    CONDUCT_KEYS.every((k) => typeof en[k] === "string" && en[k].trim().length > 0),
  "BESKT_TOOL_LANG_PARITY: every conduct key must exist in both languages",
);

ck(
  "T12.2 the English is translated rather than copied",
  (() => {
    const identical = CONDUCT_KEYS.filter((k) => sv[k] === en[k]);
    // Identical strings are legitimate only for a proper noun or a bare
    // identifier; a whole sentence repeated verbatim is an untranslated key.
    return identical.every((k) => sv[k].split(" ").length <= 2);
  })(),
  "BESKT_TOOL_LANG_COPY: an English sentence identical to the Swedish is an untranslated key",
);

ck(
  "T12.3 no user-facing sentence leaks a table, a column or an error code",
  CONDUCT_KEYS.every(
    (k) =>
      !/bcp_|beskt_|scp_|BCP_[A-Z]|select |insert |row level|RLS/i.test(sv[k]) &&
      !/bcp_|beskt_|scp_|BCP_[A-Z]|select |insert |row level|RLS/i.test(en[k]),
  ),
  "BESKT_TOOL_SCHEMA_LEAK: no user-facing sentence may name a table, a column or a raw code",
);

ck(
  "T12.4 the touch-target floor is 44px and is applied to the controls",
  /min-h-\[44px\]/.test(uiCode) &&
    [entryFormCode, positionCode, panelCode, verifyFormCode, moduleCardCode].every((c) =>
      /TOUCH/.test(c),
    ),
  "BESKT_TOOL_TOUCH_TARGET: interactive controls must meet the 44px floor",
);

{
  // RENDER: every interactive control in the documentation form carries the
  // floor. A control that does not is unusable one-handed on a phone.
  const html = render(
    <BesktThemes
      sessionId="s1"
      methodVersionId={BINDING.methodVersionId}
      topics={TOPICS}
      entries={[MY_ENTRY]}
      prompts={null}
      actions={WRITE_ACTIONS}
    />,
  );
  const form = render(
    <BesktEntryForm
      itemKey="synthetic_omitted"
      correcting={true}
      existing={MY_ENTRY}
      busy={false}
      error={null}
      onSubmit={() => {}}
      onCancel={() => {}}
    />,
  );
  const controls = `${html}${form}`.match(/<(button|select|textarea|input)\b[^>]*>/g) ?? [];
  const short = controls.filter((c) => !c.includes("min-h-[44px]"));
  ck(
    "T12.5 RENDER: every rendered control meets the 44px floor",
    controls.length > 0 && short.length === 0,
    `BESKT_TOOL_TOUCH_RENDER: ${short.length} rendered control(s) are below the 44px floor`,
  );
}

{
  const html = render(<BesktMethodHeader binding={BINDING} />);
  ck(
    "T12.6 RENDER: the method header names the method, its version and its mode",
    text(html).includes("Syntetisk metod") &&
      text(html).includes(sv["beskt.conduct.method.mode.recruitment_support"]),
    "BESKT_TOOL_METHOD_HEADER: the header must name the method, version and mode",
  );
  ck(
    "T12.7 RENDER: the content hash and the binding are disclosed, collapsed",
    html.includes("<details") && html.includes("a".repeat(64)) && html.includes("b".repeat(64)),
    "BESKT_TOOL_METHOD_BINDING: the bound digests must be disclosed behind a collapsible summary",
  );
  const enHtml = text(render(<BesktMethodHeader binding={BINDING} />, "en"));
  ck(
    "T12.8 RENDER: the English surface renders English",
    enHtml.includes(en["beskt.conduct.method.heading"]) &&
      !enHtml.includes(sv["beskt.conduct.method.binding"]),
    "BESKT_TOOL_ENGLISH_RENDER: the English surface must render the English dictionary",
  );
}

ck(
  "T12.9 every section heading is a real heading element with an accessible name",
  [snapshotCode, themesCode, positionCode, panelCode, moduleCardCode].every(
    (c) => /<h2\b/.test(c) && /aria-labelledby=/.test(c),
  ),
  "BESKT_TOOL_HEADINGS: every section must carry a real heading and an accessible name",
);

ck(
  "T12.10 the surface uses the existing design-system primitives",
  [positionCode, panelCode, entryFormCode].every((c) =>
    /@\/components\/employer\/interview\/InterviewUi/.test(c),
  ),
  "BESKT_TOOL_DESIGN_SYSTEM: the surface must be built from the existing interview primitives",
);

ck(
  "T12.11 colour never carries a meaning the words do not",
  (() => {
    // Every chip in the conduct vocabulary renders a translated sentence as
    // its child, so no state is conveyed by tone alone.
    const start = uiCode.indexOf("export function VerificationChip");
    const body = uiCode.slice(start, start + 900);
    return start !== -1 && /t\(VERIFICATION_LABEL\[state\]\)/.test(body);
  })(),
  "BESKT_TOOL_COLOUR_ALONE: every state must render as words as well as tone",
);

ck(
  "T12.12 no conduct label is a bare verdict word",
  (() => {
    // A one-word label is where a verdict sneaks back in: "Utfall" / "Outcome"
    // over a control that records how a conversation was handled reads as a
    // result the method produced. The repository already forbids those two
    // outright (recruitment-assessment-ux:check, section 15, which caught this
    // surface doing exactly that); this extends the same rule to the rest of
    // the family, on this vocabulary, so it cannot come back under a synonym.
    const BARE_VERDICT =
      /^(utfall|outcome|resultat|result|bedömning|assessment|omdöme|verdict|betyg|grade|poäng|score|slutsats|conclusion)$/i;
    const offenders = CONDUCT_KEYS.filter(
      (k) => BARE_VERDICT.test(sv[k].trim()) || BARE_VERDICT.test(en[k].trim()),
    );
    return offenders.length === 0;
  })(),
  "BESKT_TOOL_VERDICT_LABEL: no conduct label may be a bare verdict word",
);

/* ================================================================== */
group("T13 · Saving waits for the server");

ck(
  "T13.1 the save confirmation can only come from the server's own answer",
  (() => {
    // Every call is either "clear it" or "set it from the value the server
    // returned". An optimistic `setSavedItemKey(input.itemKey)` is exactly the
    // defect this exists to catch, so the check is over the ARGUMENTS rather
    // than over the presence of one correct call somewhere in the file.
    const calls = [...routeCode.matchAll(/setSavedItemKey\(([^)]*)\)/g)].map((m) => m[1].trim());
    const confirmed = calls.filter((a) => a === "result.itemKey");
    return (
      confirmed.length === 1 &&
      calls.every((a) => a === "null" || a === "result.itemKey") &&
      /onSuccess:\s*async\s*\(result\)\s*=>\s*\{[\s\S]{0,240}setSavedItemKey\(result\.itemKey\)/.test(
        routeCode,
      )
    );
  })(),
  "BESKT_TOOL_SAVE_CONFIRM: a save may be reported only after the server confirms it",
);

ck(
  "T13.1b a form closes on the SERVER'S confirmation, never on the click",
  (() => {
    // Both forms watch the confirmation the route sets from the RPC's own
    // answer, and they compare it against the previous one so that reopening a
    // form deliberately is not undone. A form that closed in its own submit
    // handler would be telling the interviewer their work was recorded at the
    // moment it left the browser.
    const entryCloses =
      /lastConfirmed\.current/.test(themesCode) &&
      /actions\.savedItemKey === itemKey\)\s*setMode\("view"\)/.test(themesCode);
    const verifyCloses =
      /lastConfirmed\.current/.test(verifyFormCode) &&
      /confirmedEntryId === entry\.entryId\)\s*setOpen\(false\)/.test(verifyFormCode);
    // And neither closes itself from inside its own submit path.
    const noOptimisticClose =
      !/onSubmit\([^)]*\);\s*setMode\("view"\)/.test(themesCode) &&
      !/onSubmit\([^)]*\);\s*setOpen\(false\)/.test(verifyFormCode);
    return entryCloses && verifyCloses && noOptimisticClose;
  })(),
  "BESKT_TOOL_FORM_CLOSE: a form may close only when the server has confirmed the write",
);

ck(
  "T13.2 the surface never navigates away on a mutation",
  !/navigate\(|router\.navigate|window\.location/.test(ALL_SURFACE_CODE),
  "BESKT_TOOL_NAVIGATE_ON_SAVE: the surface must not navigate away from unconfirmed work",
);

ck(
  "T13.3 a retry replays the same operation rather than writing twice",
  /if\s*\(id\s*!==\s*null\)\s*return id/.test(routeCode),
  "BESKT_TOOL_IDEMPOTENT_RETRY: a retried mutation must carry the same operation id",
);

ck(
  "T13.4 a mutation invalidates exactly the module and workspace queries",
  /for\s*\(const key of besktInvalidateAfterMutation\(/.test(routeCode) &&
    /besktModuleKey/.test(queriesCode) &&
    /besktWorkspaceKey/.test(queriesCode),
  "BESKT_TOOL_INVALIDATION: a successful mutation must invalidate exactly the affected queries",
);

ck(
  "T13.5 no mutation invalidates the whole cache",
  !/invalidateQueries\(\s*\)/.test(routeCode) &&
    !/invalidateQueries\(\s*\{\s*\}\s*\)/.test(routeCode),
  "BESKT_TOOL_BLANKET_INVALIDATION: a mutation must not invalidate the whole cache",
);

/* ================================================================== */
group("T14 · This guard, and its controls, actually run");

const pkg = read("package.json");
const ci = read(".github/workflows/ci.yml");
const tsconfigScripts = read("tsconfig.scripts.json");
const controlsSuite = "scripts/negative-controls/beskt-interview-tool-controls.ts";

ck(
  "T14.1 the guard is a package script",
  /"beskt-interview-tool:check":\s*"bun run scripts\/beskt-interview-tool-check\.tsx"/.test(pkg),
  "BESKT_TOOL_NOT_REGISTERED: the guard must be runnable as beskt-interview-tool:check",
);

ck(
  "T14.2 CI runs the guard",
  /bun run beskt-interview-tool:check/.test(ci),
  "BESKT_TOOL_NOT_IN_CI: CI must run beskt-interview-tool:check",
);

ck(
  "T14.3 the planted controls exist and run in negative-controls:all",
  (() => {
    const declared =
      /"negative-controls:beskt-interview-tool":\s*"bun run scripts\/negative-controls\/beskt-interview-tool-controls\.ts"/.test(
        pkg,
      );
    // The VALUE of negative-controls:all, not "everything after its name" --
    // the latter is satisfied by the suite's own declaration further down the
    // file, which says nothing about whether it RUNS.
    const chain = /"negative-controls:all":\s*"([^"]*)"/.exec(pkg)?.[1] ?? "";
    return declared && chain.includes("negative-controls:beskt-interview-tool");
  })(),
  "BESKT_TOOL_CONTROLS_NOT_WIRED: the planted controls must run in negative-controls:all",
);

ck(
  "T14.4 the guard and its controls are typechecked with the scripts project",
  /scripts\/\*\*\/\*|scripts/.test(tsconfigScripts),
  "BESKT_TOOL_NOT_TYPECHECKED: the guard must be inside the scripts typecheck project",
);

ck(
  "T14.5 every control names a diagnostic this guard can actually print",
  (() => {
    let suite: string;
    try {
      suite = read(controlsSuite);
    } catch {
      return false;
    }
    const expected = [...suite.matchAll(/expect:\s*"([^"]+)"/g)].map((m) => m[1]);
    if (expected.length < 25) return false;
    const self = readFileSync(path.join(root, "scripts/beskt-interview-tool-check.tsx"), "utf8");
    return expected.every((e) => self.includes(e));
  })(),
  "BESKT_TOOL_CONTROL_DIAGNOSTIC: every control must expect a diagnostic this guard prints",
);

/* ================================================================== */
console.log("");
if (fails.length > 0) {
  console.error(`beskt-interview-tool:check FAILED — ${fails.length} of ${passed + fails.length}`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `beskt-interview-tool:check: ${passed} assertions passed. ` +
    "The BESKT interview tool is governed at the surface as well as in the database.",
);
