/**
 * Recruiter workflow — does the interview read as a guided four-step journey?
 *
 * ── THE PRODUCT PROBLEM ─────────────────────────────────────────────────
 *
 * Pilot testing found the interview product worked and felt like an internal
 * system: seven navigation steps named for screens, TRUST stage banners above
 * the work, runtime enum values and provider modes on customer screens, and no
 * single obvious next action. The recruiter had to understand the engine.
 *
 * ── WHAT THIS PROVES, AND HOW ──────────────────────────────────────────
 *
 * RENDER   The workflow shell, the status chip and the next-step action are
 *          actually drawn (Swedish, through the real provider) and read for
 *          what they say: four stages, in order, in the recruiter's words,
 *          driven by the runtime status, with exactly one primary action.
 *
 * SOURCE   The properties a render cannot reach: that no route puts a raw
 *          enum, a checksum or a provider mode in front of a recruiter; that
 *          TRUST is rendered only as method support; that Q1–Q8 are still
 *          rendered verbatim from the pinned guide; that follow-ups sit in
 *          the support column, subordinate to the governed question; that the
 *          PR18 context and the finalisation boundary are intact.
 *
 * Every assertion is labelled with the acceptance criterion it stands for
 * (A–N in the PR19 brief). Deterministic, offline, no database.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// <Link> needs a live router and does not render synchronously under
// renderToStaticMarkup. Params are resolved faithfully so the href proved here
// is the href a recruiter clicks. Installed BEFORE the components load.
await mock.module("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: Record<string, unknown> & { children?: React.ReactNode }) => {
    let href = String(to ?? "");
    if (params && typeof params === "object") {
      for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
        href = href.replace(`$${k}`, String(v));
      }
    }
    // `search` is not part of the href here; nothing this file asserts on
    // depends on a query string.
    const { search: _search, ...attrs } = rest as Record<string, unknown> & { search?: unknown };
    return React.createElement("a", { href, ...attrs }, children);
  },
  createFileRoute: () => () => ({}),
}));

const { I18nProvider } = await import("../src/i18n/context");
const ui = await import("../src/components/employer/interview/InterviewUi");
const { ReportFinalisation } =
  await import("../src/components/employer/interview/ReportFinalisation");
const { dictionaries } = await import("../src/i18n/dictionaries");

const root = process.cwd();
let failures = 0;
let passes = 0;

function ok(cond: boolean, label: string): void {
  if (cond) {
    passes += 1;
  } else {
    failures += 1;
    console.error(`  FAIL  ${label}`);
  }
}

const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");

/** Source with comments stripped, so a guard never trips on the prose that
 *  explains the rule it checks. */
const codeOnly = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*)/.test(l))
    .join("\n");

const sv = dictionaries.sv as Record<string, string>;
const en = dictionaries.en as Record<string, string>;

const R = "src/routes/_authenticated.employer.$employerSlug.interview-intelligence";
const ROUTES = {
  list: `${R}.index.tsx`,
  new: `${R}.new.tsx`,
  overview: `${R}.$caseId.index.tsx`,
  prepare: `${R}.$caseId.prepare.tsx`,
  interview: `${R}.$caseId.interview.tsx`,
  evidence: `${R}.$caseId.evidence.tsx`,
  assessment: `${R}.$caseId.assessment.tsx`,
  summary: `${R}.$caseId.summary.tsx`,
  report: `${R}.$caseId.report.tsx`,
  panel: `${R}.$caseId.panel.tsx`,
};
const COMPONENTS = {
  ui: "src/components/employer/interview/InterviewUi.tsx",
  layout: "src/components/employer/interview/InterviewLayout.tsx",
  outcome: "src/components/employer/interview/InterviewOutcome.tsx",
  context: "src/components/employer/interview/InterviewContextPanel.tsx",
  finalisation: "src/components/employer/interview/ReportFinalisation.tsx",
};
const RECRUITER_SURFACES = [...Object.values(ROUTES), ...Object.values(COMPONENTS)];

/** Every case status the runtime can produce, from the lifecycle itself. */
const STATUSES = [
  "draft",
  "sources_ready",
  "prep_generated",
  "prep_approved",
  "interview_in_progress",
  "interview_complete",
  "evidence_review",
  "assessed",
  "reported",
] as const;

const render = (node: React.ReactNode) => renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);

const strip = (markup: string) => markup.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

console.log("interview-recruiter-workflow-check\n");

/* ================================================================== */
/* A · The visible workflow is Prepare → Interview → Assess → Report    */
/* ================================================================== */

ok(ui.STAGES.length === 4, "A · the journey has exactly four stages");
ok(
  ui.STAGES.join(",") === "prepare,interview,assess,report",
  "A · in the order prepare, interview, assess, report",
);

{
  const nav = render(
    <ui.WorkflowNav status="draft" current="prepare" employerSlug="e" caseId="c" />,
  );
  const items = nav.match(/<li\b/g) ?? [];
  ok(items.length === 4, `A · the rendered journey has four steps (found ${items.length})`);
  const text = strip(nav);
  const order = ["Förbered", "Intervjua", "Bedöm", "Rapport"].map((w) => text.indexOf(w));
  ok(
    order.every((i) => i >= 0) && order.every((v, i) => i === 0 || v > order[i - 1]),
    "A · the four stages read Förbered → Intervjua → Bedöm → Rapport, in that order",
  );
  for (const old of ["Översikt", "Granska", "Sammanfattning"]) {
    ok(!text.includes(old), `A · "${old}" is no longer a stage of the journey`);
  }
  ok(
    en["iiu.wf.prepare"] === "Prepare" &&
      en["iiu.wf.interview"] === "Interview" &&
      en["iiu.wf.assess"] === "Assess" &&
      en["iiu.wf.report"] === "Report",
    "A/M · the four stages read Prepare → Interview → Assess → Report in English",
  );
}

// The two halves of Assess are shown only inside Assess, and never as
// stages of their own.
{
  const inAssess = strip(
    render(
      <ui.WorkflowNav
        status="evidence_review"
        current="assess"
        step="material"
        employerSlug="e"
        caseId="c"
      />,
    ),
  );
  ok(
    inAssess.includes(sv["iiu.wf.assess.material"]) && inAssess.includes(sv["iiu.wf.assess.judge"]),
    "A · inside Assess the recruiter sees its two halves: choose the material, assess against the requirements",
  );
  const inPrepare = strip(
    render(<ui.WorkflowNav status="draft" current="prepare" employerSlug="e" caseId="c" />),
  );
  ok(
    !inPrepare.includes(sv["iiu.wf.assess.material"]),
    "A · and those halves are not shown outside Assess",
  );
}

/* ================================================================== */
/* B · The runtime status still drives the state                        */
/* ================================================================== */

const EXPECTED_STAGE: Record<(typeof STATUSES)[number], string> = {
  draft: "prepare",
  sources_ready: "prepare",
  prep_generated: "prepare",
  prep_approved: "interview",
  interview_in_progress: "interview",
  interview_complete: "assess",
  evidence_review: "assess",
  assessed: "report",
  reported: "report",
};

for (const status of STATUSES) {
  ok(
    ui.stageOf(status) === EXPECTED_STAGE[status],
    `B · status "${status}" is projected onto the ${EXPECTED_STAGE[status]} stage`,
  );
  // Rendered without `current`, the nav marks the stage the STATUS puts the
  // recruiter in -- the overview relies on exactly this.
  const nav = render(<ui.WorkflowNav status={status} employerSlug="e" caseId="c" />);
  const currentItem = nav.split("<li").find((li) => li.includes('aria-current="step"')) ?? "";
  const label = strip(currentItem);
  ok(
    label.includes(sv[`iiu.wf.${EXPECTED_STAGE[status]}`]),
    `B · the rendered journey marks "${EXPECTED_STAGE[status]}" as current for "${status}" (got "${label.trim()}")`,
  );
}
ok(
  ui.stageOf("not_a_status") === null,
  "B · an unknown status projects onto no stage rather than a wrong one",
);

// No second status engine: the stage is a projection, and nothing writes it.
{
  const src = codeOnly(read(COMPONENTS.ui));
  const block = src.slice(
    src.indexOf("export type Stage ="),
    src.indexOf("export function WorkflowNav"),
  );
  ok(
    !/useMutation|useServerFn|supabase|\.rpc\(/.test(block),
    "B · the stage projection reads the status and writes nothing",
  );
}

/* ================================================================== */
/* C · No raw enum reaches a recruiter                                  */
/* ================================================================== */

for (const status of [...STATUSES, "cancelled"]) {
  ok(
    typeof sv[`iiu.status.${status}`] === "string" &&
      typeof en[`iiu.status.${status}`] === "string",
    `C · status "${status}" has recruiter wording in both locales`,
  );
  const chip = strip(render(<ui.CaseStatusChip status={status} />));
  ok(!chip.includes(status), `C · the status chip never shows the raw value "${status}"`);
}

// The recruiter language the brief locked (§15).
ok(sv["iiu.status.draft"] === "Förbereds", "C · draft reads Förbereds");
ok(
  sv["iiu.status.prep_approved"] === "Redo för intervju",
  "C · prep_approved reads Redo för intervju",
);
ok(
  sv["iiu.status.interview_in_progress"] === "Intervju pågår",
  "C · interview_in_progress reads Intervju pågår",
);
ok(
  sv["iiu.status.interview_complete"] === "Underlag granskas" &&
    sv["iiu.status.evidence_review"] === "Underlag granskas",
  "C · interview_complete and evidence_review read Underlag granskas",
);
ok(sv["iiu.status.assessed"] === "Rapport redo", "C · assessed reads Rapport redo");
ok(sv["iiu.status.reported"] === "Rapport klar", "C · reported reads Rapport klar");

// Source: the internal identifiers that were reaching screens, and where each
// now belongs. None of them may be rendered on an ordinary recruiter screen;
// the report's audit disclosure is the one place technical provenance lives.
{
  const RAW = [
    [/(?<![=\w])\{\s*d\.status\s*\}/, "the raw case status"],
    [/\{\s*s\.kind\s*\}/, "a raw source kind"],
    [/purposeCode\s*\}/, "the processing purpose enum"],
    [/(?<![=\w])\{\s*[a-z]+\.providerMode\s*\}/, "a raw provider mode"],
    [/(?<![=\w])\{\s*[a-z]+\.validationLabel\s*\}/, "a raw validation label"],
    [/ProviderModeChip/, "the provider mode chip"],
    [/extractionConfidence\s*\*\s*100/, "the extraction confidence percentage"],
    [/packContentHash/, "the pack content hash"],
    [/\{\s*[a-z]+\.taskKey\s*\}/, "a task key"],
    [/\{\s*[a-z]+\.modelName\s*\}/, "a model id"],
  ] as const;
  for (const file of Object.values(ROUTES)) {
    let body = codeOnly(read(file));
    // The report's audit section is where provenance belongs; it is excluded.
    const auditAt = body.indexOf('aria-labelledby="s-audit"');
    if (auditAt > 0) body = body.slice(0, auditAt);
    for (const [re, what] of RAW) {
      ok(!re.test(body), `C · ${path.basename(file)} renders ${what} on a recruiter screen`);
    }
  }
  // And provenance is not deleted: the audit disclosure still carries it.
  const audit = read(ROUTES.report).slice(read(ROUTES.report).indexOf('aria-labelledby="s-audit"'));
  ok(audit.includes("pack_content_hash"), "C · the pack content hash survives under audit");
  ok(audit.includes("contentHash"), "C · the report content hash survives under audit");
}

/* ================================================================== */
/* D · "Interview Intelligence" is not the recruiter's navigation       */
/* ================================================================== */

ok(
  sv["employer.nav.interviewIntelligence"] === "Intervjuer" &&
    en["employer.nav.interviewIntelligence"] === "Interviews",
  "D · the sidebar item reads Intervjuer / Interviews",
);
for (const file of Object.values(ROUTES)) {
  ok(
    !/>\s*Interview Intelligence\s*</.test(codeOnly(read(file))),
    `D · ${path.basename(file)} shows no "Interview Intelligence" label`,
  );
}
for (const key of Object.keys(sv).filter((k) =>
  /^(iiu|iic|employer\.nav|employer\.candidate)\./.test(k),
)) {
  ok(
    !sv[key].includes("Interview Intelligence") &&
      !(en[key] ?? "").includes("Interview Intelligence"),
    `D · ${key} does not call the product "Interview Intelligence" to a recruiter`,
  );
}

/* ================================================================== */
/* E · TRUST is methodology, never the navigation                       */
/* ================================================================== */

{
  for (const status of STATUSES) {
    const nav = render(<ui.WorkflowNav status={status} employerSlug="e" caseId="c" />);
    ok(!/TRUST/.test(nav), `E · the journey for "${status}" carries no TRUST label`);
  }
  // Which dictionary keys may mention TRUST: the method's own sections.
  const allowed = /^(iiu\.trust\.|iiu\.cd\.|ii\.)/;
  const offenders = Object.keys(sv).filter(
    (k) =>
      /^(iiu|iic)\./.test(k) &&
      !allowed.test(k) &&
      (/TRUST/.test(sv[k]) || /TRUST/.test(en[k] ?? "")),
  );
  ok(
    offenders.length === 0,
    `E · TRUST appears only in method copy, not in workflow, status or action copy (${offenders.slice(0, 4).join(", ")})`,
  );
  // The stage banner is rendered only inside method support.
  const prepare = codeOnly(read(ROUTES.prepare));
  const bannerAt = prepare.indexOf("<TrustStageBanner");
  const methodAt = prepare.indexOf('id="s-about"');
  ok(
    bannerAt > 0 && methodAt > 0 && bannerAt > methodAt,
    "E · on Prepare the TRUST stage banner sits inside the method-support panel",
  );
  ok(
    sv["iiu.pp.about.title"] === "Metodstöd" && en["iiu.pp.about.title"] === "Method support",
    "E · and that panel is called Metodstöd / Method support",
  );
  const panel = codeOnly(read(ROUTES.panel));
  ok(
    panel.indexOf("<TrustStageBanner") >
      panel.indexOf('<Disclosure summary={t("iiu.pp.about.title")}'),
    "E · on joint review the TRUST stage banner sits inside a method-support disclosure",
  );
  for (const key of [
    "overview",
    "interview",
    "evidence",
    "assessment",
    "report",
    "list",
  ] as const) {
    ok(
      !read(ROUTES[key]).includes("<TrustStageBanner"),
      `E · ${key} does not open with the TRUST stage banner`,
    );
  }
  // The live interview's method support is named as support, and the method's
  // conduct sequence and prohibitions are still inside it.
  const live = read(ROUTES.interview);
  ok(
    live.includes('t("iiu.lv.method")') &&
      live.includes('t("iiu.cd.sequence")') &&
      live.includes('t("iiu.cd.never")'),
    "E · the live interview keeps the conduct sequence and the prohibitions under Metodstöd",
  );
  ok(
    !/Förstå-steget|Understand stage/.test(sv["iiu.iv.copilot.noai"] + en["iiu.iv.copilot.noai"]),
    "E · the support panel no longer names an internal method stage",
  );
  ok(
    sv["iiu.iv.copilot.title"] === "Intervjustöd" &&
      en["iiu.iv.copilot.title"] === "Interview support",
    "E · the support panel is called Intervjustöd / Interview support",
  );
}

/* ================================================================== */
/* F · Q1–Q8 are unchanged                                              */
/* ================================================================== */

{
  const live = codeOnly(read(ROUTES.interview));
  ok(live.includes("{question.promptSv}"), "F · the live question is the pinned wording, verbatim");
  ok(
    !/promptSv\s*\.\s*(replace|slice|toUpperCase|toLowerCase|split)/.test(live),
    "F · nothing on the live screen rewrites the pinned wording",
  );
  ok(!/promptEn/.test(live), "F · the pinned wording is not swapped for a translation");
  // The full verbatim contract (wording, order, type) is proved by
  // interview-pack-contract:check; it must still be a merge gate.
  const ci = read(".github/workflows/ci.yml");
  ok(ci.includes("interview-pack-contract:check"), "F · the pack contract check is still in CI");
  ok(ci.includes("interview-recruiter-workflow:check"), "· and so is this check");
}

/* ================================================================== */
/* G · Follow-up prompts are subordinate to the governed question       */
/* ================================================================== */

{
  const live = read(ROUTES.interview);
  const questionAt = live.indexOf("{question.promptSv}");
  const asideAt = live.indexOf('aria-labelledby="s-copilot"');
  ok(
    questionAt > 0 && asideAt > questionAt,
    "G · the support column, where follow-ups live, comes after the question",
  );
  // The question is the largest type on the screen; the follow-ups are the
  // smallest.
  const h2 = live.slice(live.lastIndexOf("<h2", questionAt), questionAt);
  ok(/text-xl/.test(h2), "G · the question is set in the screen's largest type");
  const followBlock = live.slice(
    live.indexOf('t("iiu.lv.cat.followup")'),
    live.indexOf('t("iiu.lv.cat.clarify")'),
  );
  ok(
    /text-xs/.test(followBlock) &&
      !/text-xl|text-2xl|font-semibold text-foreground/.test(followBlock),
    "G · follow-ups are set small, never as a second question",
  );
  ok(sv["iiu.lv.cat.followup"] === "Fördjupningsfrågor", "G · they are called Fördjupningsfrågor");
  // Suggestions that come from the assessment are labelled as such, and are
  // never presented as questions the candidate must be asked.
  ok(
    sv["iic.suggestion"].startsWith("Förslag från bedömningen"),
    "G · an assessment-sourced follow-up is labelled Förslag från bedömningen",
  );
  ok(
    /behöver ställas som fråga/.test(sv["iiu.lv.context.note"]) &&
      /has to be asked/.test(en["iiu.lv.context.note"]),
    "G · the context areas say they do not have to be asked",
  );
}

/* ================================================================== */
/* H · One obvious primary action per stage                             */
/* ================================================================== */

{
  for (const status of STATUSES) {
    const next = ui.NEXT_STEP[status];
    ok(Boolean(next), `H · status "${status}" has a next step`);
    const markup = render(<ui.NextStepLink status={status} employerSlug="e" caseId="c" />);
    const anchors = markup.match(/<a\b/g) ?? [];
    ok(anchors.length === 1, `H · exactly one primary action for "${status}"`);
    ok(
      markup.includes(`href="${next.to.replace("$employerSlug", "e").replace("$caseId", "c")}"`),
      `H · it leads to the stage's own surface for "${status}"`,
    );
    ok(
      ui.NEXT_STEP_LABEL[status] === next.cta,
      `H · the list's next-step column agrees with the action for "${status}"`,
    );
  }
  // The brief's contract, status by status.
  ok(sv[ui.NEXT_STEP.prep_approved.cta] === "Starta intervju", "H · prepared → Starta intervju");
  ok(
    sv[ui.NEXT_STEP.interview_complete.cta] === "Gå till bedömning",
    "H · interview complete → Gå till bedömning",
  );
  ok(
    sv[ui.NEXT_STEP.assessed.cta] === "Granska rapport",
    "H · assessment complete → Granska rapport",
  );
  ok(
    ui.NEXT_STEP.assessed.to.endsWith("/report"),
    "H · assessment complete leads to the report, not a screen in between",
  );

  // Each work surface: its header carries at most one primary action, drawn
  // from that map or from the one lifecycle move the screen exists for.
  const overview = codeOnly(read(ROUTES.overview)).replace(/import[\s\S]*?from "[^"]+";/g, "");
  ok(
    (overview.match(/PRIMARY_BUTTON/g) ?? []).length === 1,
    "H · the overview has exactly one primary button",
  );
  const prepare = codeOnly(read(ROUTES.prepare));
  ok(
    /d\.status === "prep_approved" \? \(/.test(prepare) && prepare.includes("<NextStepLink"),
    "H · Prepare's header action is Start when the plan is approved, the next step once started, nothing before",
  );
  const live = codeOnly(read(ROUTES.interview));
  ok(
    /toCover\.length === 0 \? PRIMARY_BUTTON : BUTTON/.test(live),
    "H · ending the interview is primary only once every question is covered",
  );
  ok(
    live.includes("completed ? (") && live.includes("<NextStepLink"),
    "H · once the conversation is complete the header carries the one next step",
  );
  const assess = codeOnly(read(ROUTES.assessment));
  ok(
    /d\.status === "assessed" \|\| d\.status === "reported"[\s\S]{0,80}<NextStepLink/.test(assess),
    "H · Assess offers the next step only once the assessment is done",
  );
  // Prepare: no separate "mark the material ready" click.
  ok(
    !prepare.includes("iiu.pp.markready"),
    "H · marking material ready is no longer a click of its own",
  );
  ok(
    prepare.includes("readyIfNeeded") && /await readyIfNeeded\(\)/.test(prepare),
    "H · it runs inside the preparation save instead",
  );
  ok(
    /const \{ planId \} = await manualPrepFn[\s\S]{0,400}await approveFn\(\{ data: \{ planId \} \}\)/.test(
      prepare,
    ),
    "H · a self-written plan is approved as it is saved",
  );
  ok(
    /d\.plan\?\.status === "draft" &&/.test(prepare) &&
      prepare.includes('t("iiu.pp.approve.title")'),
    "H · an AI-drafted plan keeps its separate human approval",
  );
}

/* ================================================================== */
/* I / J · Finalisation truthfulness, preserved                         */
/* ================================================================== */

{
  const renderFinal = (canFinalise: boolean, applicationId: string | null) =>
    render(
      <ReportFinalisation
        canFinalise={canFinalise}
        onFinalise={() => {}}
        isPending={false}
        employerSlug="e"
        caseId="00000000-0000-4000-8000-000000000001"
        applicationId={applicationId}
      />,
    );
  const owner = renderFinal(true, null);
  const member = renderFinal(false, "00000000-0000-4000-8000-0000000000aa");
  ok(
    owner.includes("<button") && owner.includes(sv["iiu.rp.finalise"]),
    "J · owner/admin sees the finalise button",
  );
  ok(owner.includes(sv["iiu.rp.confirm"]), "J · with the irreversibility confirmation");
  ok(!member.includes("<button"), "I · a member sees no finalise button");
  ok(member.includes(sv["iiu.rp.await.title"]), "I · and sees the ready-for-approval state");
  ok(member.includes("ägare eller administratör"), "I · naming who must approve");
  ok(
    member.includes('href="/employer/e/applications/00000000-0000-4000-8000-0000000000aa"') &&
      member.includes(sv["iiu.rp.await.back"]),
    "I · the member's way out leads back to the candidate",
  );
  ok(
    sv["iiu.rp.await.back"] === "Tillbaka till kandidaten",
    "I · and is called Tillbaka till kandidaten",
  );
  const noApp = renderFinal(false, null);
  ok(
    noApp.includes(
      'href="/employer/e/interview-intelligence/00000000-0000-4000-8000-000000000001"',
    ),
    "I · a standalone interview falls back to its own overview",
  );
  ok(!/role="alert"/.test(member), "I · the waiting state is not an error");
  // The report route still gates through the shared capability and passes
  // the application through.
  const report = codeOnly(read(ROUTES.report));
  ok(
    report.includes("canFinaliseInterviewReport(ws.workspace.role)") &&
      report.includes("applicationId={d.applicationId}"),
    "I/J · the report derives capability from the membership role and hands the application to the block",
  );
}

/* ================================================================== */
/* K · No ranking, suitability, pass/fail, hire or reject               */
/* ================================================================== */

{
  const FORBIDDEN: readonly [RegExp, string][] = [
    [/totalpoäng|total\s*score/i, "a total score"],
    [/rangordn|ranking\b|rankad/i, "a ranking"],
    [/godkänd\s*\/\s*underkänd|pass\s*\/\s*fail|\bunderkänd\b/i, "a pass/fail verdict"],
    [/lämplighet|suitab/i, "suitability"],
    [
      /rekommenderar\s+(anställning|att anställa)|recommends?\s+(hiring|to hire)/i,
      "a hiring recommendation",
    ],
    [/\bavslag\b.*kandidat|reject(ed)?\s+the\s+candidate/i, "a rejection"],
    [/\bfit score|matchpoäng/i, "a fit score"],
  ];
  const NEGATED = /\b(Ingen|Inget|Inga|inte|aldrig|utan|No |never|not |nothing)\b/i;
  // Dictionary values first: everything a recruiter reads.
  for (const key of Object.keys(sv).filter((k) => /^(iiu|iic)\./.test(k))) {
    for (const value of [sv[key], en[key] ?? ""]) {
      for (const [re, what] of FORBIDDEN) {
        if (re.test(value) && !NEGATED.test(value)) {
          ok(false, `K · ${key} appears to offer ${what}: "${value.slice(0, 80)}"`);
        }
      }
    }
  }
  passes += 1; // the sweep above ran
  // Then the components and routes, line by line.
  for (const file of RECRUITER_SURFACES) {
    const lines = codeOnly(read(file)).split("\n");
    for (const [re, what] of FORBIDDEN) {
      const hit = lines.findIndex((l) => re.test(l) && !NEGATED.test(l));
      ok(hit === -1, `K · ${path.basename(file)}:${hit + 1} appears to offer ${what}`);
    }
  }
  // The level-0 rule and the no-scoring boundary are untouched.
  ok(
    sv["iiu.level0.note"].startsWith("Nivå 0 betyder otillräcklig evidens") &&
      en["iiu.level0.note"].startsWith("Level 0 means insufficient evidence"),
    "K · the level-0 rule is unchanged",
  );
  ok(
    sv["iiu.as2.lvl.0"] === "Går inte att bedöma" && en["iiu.as2.lvl.0"] === "Cannot be assessed",
    "K · level 0 still reads as cannot be assessed",
  );
  ok(
    sv["iiu.ix.boundary.body"].startsWith("Ingen totalpoäng, ingen rangordning"),
    "K · the no-score, no-ranking boundary is still stated",
  );
}

/* ================================================================== */
/* L · The PR18 application context remains visible                    */
/* ================================================================== */

{
  const prepare = read(ROUTES.prepare);
  ok(prepare.includes("<InterviewContextPanel"), "L · Prepare renders the application context");
  ok(
    prepare.indexOf("<InterviewContextPanel") < prepare.indexOf('id="s-setup"'),
    "L · above the setup work, so the recruiter reads what is known before being asked for more",
  );
  const live = read(ROUTES.interview);
  ok(
    live.includes("getInterviewCaseContext") && live.includes('t("iiu.lv.context.areas")'),
    "L · the live interview shows the areas the application pointed at",
  );
  ok(
    live.indexOf('t("iiu.lv.context.areas")') > live.indexOf('aria-labelledby="s-copilot"'),
    "L · in the support column, subordinate to the governed question",
  );
  for (const key of [
    "iic.heading",
    "iic.explore",
    "iic.reason.assessment",
    "iic.reason.limited",
    "iic.reason.requirement",
    "iic.suggestion",
  ]) {
    ok(
      typeof sv[key] === "string" && typeof en[key] === "string" && sv[key] !== en[key],
      `L · ${key} intact in both locales`,
    );
  }
  ok(sv["iic.heading"] === "Intervjuunderlag", "L · the briefing is called Intervjuunderlag");
  // Read live, written nowhere: no mutation reaches the context functions.
  const ctx = codeOnly(read("src/lib/interview-intelligence/context.functions.ts"));
  ok(
    !/\.insert\(|\.update\(|\.upsert\(|\.delete\(/.test(ctx),
    "L · the context bridge still writes nothing",
  );
}

/* ================================================================== */
/* M · SV / EN                                                          */
/* ================================================================== */

{
  const NEW_KEYS = [
    "iiu.wf.assess.material",
    "iiu.wf.assess.judge",
    "iiu.wf.assess.aria",
    "iiu.wf.notyet",
    "iiu.ov.cta.reviewreport",
    "iiu.lv.method",
    "iiu.lv.context.areas",
    "iiu.lv.context.note",
    "iiu.rp.preview.title",
    "iiu.rp.preview.body",
    "iiu.pp.plan.saveapprove",
    "iiu.pp.plan.saveapprove.note",
    "iiu.pl.conclusion.save",
    "iiu.pl.saving",
    "iiu.pl.you",
    "iiu.pl.srprefix.stage",
  ];
  for (const key of NEW_KEYS) {
    ok(typeof sv[key] === "string" && sv[key].trim() !== "", `M · ${key} exists in Swedish`);
    ok(typeof en[key] === "string" && en[key].trim() !== "", `M · ${key} exists in English`);
    ok(sv[key] !== en[key], `M · ${key} is genuinely translated`);
  }
  // Retired keys are gone from both locales and from every surface.
  for (const key of [
    "iiu.rail.sources",
    "iiu.next.title",
    "iiu.wf.overview",
    "iiu.wf.summary",
    "iiu.ov.cta.summary",
    "iiu.as.tosummary",
    "iiu.pp.markready",
  ]) {
    ok(!(key in sv) && !(key in en), `M · retired key ${key} is gone`);
    ok(
      !RECRUITER_SURFACES.some((f) => read(f).includes(`"${key}"`)),
      `M · and nothing references ${key}`,
    );
  }
  // The locked terminology (§4).
  ok(sv["iiu.new.title"] === "Planera intervju", "M · New interview → Planera intervju");
  ok(
    sv["iiu.new.field.pack"] === "Intervjuguide för rollen",
    "M · Role package → Intervjuguide för rollen",
  );
  ok(
    sv["employer.candidate.structuredInterview.heading"] === "Kompetensbaserad intervju",
    "M · Structured interview → Kompetensbaserad intervju",
  );
  ok(
    sv["employer.candidate.structuredInterview.start"] === "Planera intervju",
    "M · the application hub offers Planera intervju",
  );
  ok(sv["iiu.find.gap"] === "Begränsat underlag", "M · Evidence gap → Begränsat underlag");
  ok(
    !Object.keys(sv).some((k) => /^(iiu|iic)\./.test(k) && /\bRollpaket/i.test(sv[k])),
    "M · no recruiter copy still says Rollpaket",
  );
  ok(
    !Object.keys(en).some((k) => /^(iiu|iic)\./.test(k) && /\brole pack(age)?\b/i.test(en[k])),
    "M · no English recruiter copy still says role package",
  );
}

/* ================================================================== */
/* N · 375 / 768 / 1440                                                 */
/* ================================================================== */

{
  // The layout properties the responsive walk depends on, provable here; the
  // walk itself is e2e/interview-recruiter-workflow.spec.ts against the local
  // stack.
  const nav = read(COMPONENTS.ui).slice(read(COMPONENTS.ui).indexOf("export function WorkflowNav"));
  ok(/overflow-x-auto/.test(nav), "N · the journey row scrolls rather than wraps at 375");
  ok(
    /relative inline-flex/.test(nav),
    "N · steps are positioned, so sr-only spans cannot widen the page",
  );
  ok(/min-h-11/.test(nav), "N · stage links meet the 44px touch target");
  ok(/sm:hidden/.test(nav), "N · the 'step n of 4' line is spoken where the row can scroll");
  const spec = read("e2e/interview-recruiter-workflow.spec.ts");
  for (const w of ["375", "768", "1440"]) {
    ok(spec.includes(`["${w}"`), `N · the signed-in walk covers ${w}px`);
  }
  ok(spec.includes("scrollWidth"), "N · and asserts no horizontal overflow");
}

/* ================================================================== */

console.log(`\n${passes} passed, ${failures} failed`);
if (failures > 0) process.exit(1);
console.log(
  "\nOK: the recruiter sees Förbered → Intervjua → Bedöm → Rapport, driven by the runtime status,",
);
console.log(
  "    with one next action per stage, no raw enums, TRUST as method support, Q1–Q8 verbatim,",
);
console.log("    follow-ups subordinate, PR18 context intact and finalisation truthful.");
