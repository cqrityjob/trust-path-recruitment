// The employer portal as ONE journey: the guard for the UX pass of 2026-10-08.
//
// What it pins, and why each needs pinning:
//
//   1. Every area page carries the flow strip and names its own station. A
//      strip that quietly disappeared from one page would make the journey
//      break exactly where the reader is.
//   2. Every overview row opens the rows it counted. The two stages a row used
//      to count under one link are two rows now; drafts open drafts; "ready to
//      complete" opens a filter that means ready, not merely closed.
//   3. A requirement status is text and a symbol, never colour alone.
//   4. The recruitment menu says what each area is for, in both languages.
//   5. A recruiter who comes back from a candidate lands on the candidate list
//      with the filters, sort and page they left; a candidate's results and
//      reviews carry the application; every interview screen links to its
//      application.
//   6. A control the database would refuse on a closed application is hidden,
//      and the refusal copy is not about bookings only.
//
// Run: bun run employer-portal-flow:check

import { readFileSync } from "node:fs";
import { dictionaries } from "../src/i18n/dictionaries";

const sv = dictionaries.sv as Record<string, string>;
const en = dictionaries.en as Record<string, string>;

const errors: string[] = [];
const expect = (cond: boolean, msg: string) => {
  if (!cond) errors.push(msg);
};
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
/** Source without comments, so a line quoted in a comment cannot satisfy a check. */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const R = "src/routes/_authenticated.employer.$employerSlug.";
const OVERVIEW = `${R}index.tsx`;
const STRIP = "src/components/employer/RecruitmentFlowStrip.tsx";
const SHELL = "src/components/employer/EmployerAppShell.tsx";
const STATUS = "src/components/recruitment/RecruiterStatus.tsx";
const DEFS = "src/lib/recruitment/definitions.ts";
const STEP_NAV = "src/components/recruitment/ProcessStepNav.tsx";
const HUB = `${R}jobs.$jobId.index.tsx`;
const CANDIDATE = `${R}applications.$applicationId.tsx`;
const PANELS = "src/components/recruitment/ApplicationPanels.tsx";
const UI = "src/components/employer/interview/InterviewUi.tsx";

/* 1 · The flow strip, on every area page, naming its station. */
{
  const strip = code(STRIP);
  for (const step of [
    "requirements",
    "applications",
    "review",
    "tests",
    "interviews",
    "report",
    "decision",
  ]) {
    expect(strip.includes(`"${step}"`), `${STRIP}: the strip lost the "${step}" station.`);
    expect(
      Boolean(sv[`rec.flow.${step}`]) && Boolean(en[`rec.flow.${step}`]),
      `rec.flow.${step} is missing in sv or en.`,
    );
  }
  expect(
    /current === step \? \(\s*<span\s+aria-current="step"/.test(strip),
    `${STRIP}: the current station must be a plain span marked aria-current="step", not a link to the page you are on.`,
  );
  expect(
    /const active = \{ exact: true, includeSearch: true \} as const;/.test(strip) &&
      (strip.match(/activeOptions=\{active\}/g) ?? []).length === 7,
    `${STRIP}: every station link must match exactly (search included), so two stations on one route are never both current.`,
  );
  expect(
    /rec\.flow\.lede/.test(strip) && Boolean(sv["rec.flow.lede"]) && Boolean(en["rec.flow.lede"]),
    `${STRIP}: the strip must say it is the order of work, not a checklist.`,
  );
  expect(
    !/overflow-x-auto|min-w-max/.test(strip),
    `${STRIP}: the stations wrap on a phone; nothing scrolls sideways.`,
  );
  expect(
    /search=\{\{ phase: "active" as const \}\}/.test(strip),
    `${STRIP}: Decision & close opens the active recruitments, where decisions are made while a recruitment is still open.`,
  );
  expect(
    /search=\{\{ review: "remaining" as const \}\}/.test(strip) &&
      !/stage: "received" as const, review: "remaining"/.test(strip),
    `${STRIP}: Kravgranskning opens the OPEN applications without a confirmed review (the work that can be done), not the historical remainder that includes archived and decided ones.`,
  );
  expect(
    /rec\.flow\.decisionContext/.test(code(`${R}jobs.index.tsx`)) &&
      /data-testid="decision-station-context"/.test(code(`${R}jobs.index.tsx`)) &&
      Boolean(sv["rec.flow.decisionContext"]) &&
      Boolean(en["rec.flow.decisionContext"]),
    `${R}jobs.index.tsx: under the active/ready filter the list must say in one line where outcomes are given and where a recruitment is closed.`,
  );
  expect(
    /inte hur långt en kandidat/.test(sv["rec.flow.lede"] ?? "") &&
      /not how far a candidate/.test(en["rec.flow.lede"] ?? ""),
    "rec.flow.lede must say the marker is the page you are on, not a candidate's progress.",
  );
  // The two pages that host two stations derive `current` from their URL:
  // the application list is "review" under a review filter, the recruitment
  // list is "decision" under the active/ready filter. The marker then follows
  // the link that was clicked, and never a candidate's progress.
  const pages: [string, string | RegExp | null][] = [
    [OVERVIEW, null],
    [
      `${R}jobs.index.tsx`,
      /current=\{\s*phaseFilter === "active" \|\| phaseFilter === "ready" \? "decision" : "requirements"\s*\}/,
    ],
    [`${R}applications.index.tsx`, /current=\{view\.review \? "review" : "applications"\}/],
    [`${R}assessments.index.tsx`, "tests"],
    [`${R}interview-intelligence.index.tsx`, "interviews"],
    [`${R}reports.tsx`, "report"],
  ];
  for (const [file, current] of pages) {
    const src = code(file);
    expect(/<RecruitmentFlowStrip/.test(src), `${file}: the flow strip is gone from this page.`);
    if (current instanceof RegExp) {
      expect(
        current.test(src),
        `${file}: the flow strip's station must follow the URL filter (${current}).`,
      );
    } else if (current) {
      expect(
        new RegExp(`<RecruitmentFlowStrip[\\s\\S]{0,200}current="${current}"`).test(src),
        `${file}: the flow strip must name this page's station ("${current}").`,
      );
    } else {
      expect(
        !/<RecruitmentFlowStrip[\s\S]{0,200}current=/.test(src),
        `${file}: the overview is the map, not a station; it names no current step.`,
      );
    }
  }
}

/* 2 · Every overview row opens exactly the rows it counted. */
{
  const ov = code(OVERVIEW);
  const block = (key: string) => {
    const at = ov.indexOf(`key: "${key}"`);
    if (at === -1) return null;
    const end = ov.indexOf("});", at);
    return end === -1 ? null : ov.slice(at, end);
  };
  const rows: [string, RegExp, string][] = [
    ["new-applications", /status: "submitted" as const/, "the submitted applications"],
    ["awaiting-next-step", /stage: "review" as const/, "the applications under review"],
    [
      "in-interview-stage",
      /stage: "interview" as const/,
      "the applications at the interview stage",
    ],
    ["draft-jobs", /phase: "draft" as const/, "the draft recruitments"],
    ["ready-to-complete", /phase: "ready" as const/, "the recruitments ready to complete"],
  ];
  for (const [key, filter, what] of rows) {
    const b = block(key);
    expect(b !== null, `${OVERVIEW}: the "${key}" row is gone.`);
    if (b) expect(filter.test(b), `${OVERVIEW}: the "${key}" row must open ${what} (${filter}).`);
  }
  // The review-stage row counts reviewing ONLY: the interview stage has its own row.
  expect(
    /r\.unresolved - r\.newCount - r\.interviewStage/.test(ov),
    `${OVERVIEW}: the next-step count must exclude the interview stage, which has its own row.`,
  );
  expect(
    Boolean(sv["employer.actions.inInterviewStage.one"]) &&
      Boolean(en["employer.actions.inInterviewStage.other"]),
    "employer.actions.inInterviewStage needs both plural forms in both languages.",
  );
  // Summary numbers say what they cover.
  for (const stat of ["active", "new", "interviews"]) {
    expect(
      ov.includes(`hint={t("rec.overview.stat.${stat}.hint")}`),
      `${OVERVIEW}: the "${stat}" summary number lost its one-line explanation.`,
    );
    expect(
      Boolean(sv[`rec.overview.stat.${stat}.hint`]) &&
        Boolean(en[`rec.overview.stat.${stat}.hint`]),
      `rec.overview.stat.${stat}.hint is missing in sv or en.`,
    );
  }
  // The "ready" phase filter means ready, not closed.
  const defs = code(DEFS);
  expect(
    /case "ready":\s*return isReadyToComplete\(phase, unresolved\);/.test(defs),
    `${DEFS}: the "ready" phase filter must be isReadyToComplete, not "closed".`,
  );
  expect(
    Boolean(sv["rec.list.phase.ready"]) && Boolean(en["rec.list.phase.ready"]),
    "rec.list.phase.ready is missing in sv or en.",
  );
  // The interview card's single-stage numbers open their cases.
  for (const stage of ["readyToInterview", "inEvidenceReview"]) {
    expect(
      new RegExp(`stat\\.(ready|evidence)"\\)[\\s\\S]{0,400}stage: "${stage}" as const`).test(ov),
      `${OVERVIEW}: the interview card's ${stage} number must link to that stage.`,
    );
  }
  // Two reads the page never rendered stay gone.
  expect(
    !/listApplicationsForEmployer|listAssignmentsForEmployer/.test(ov),
    `${OVERVIEW}: a read whose result the page never shows is back.`,
  );
}

/* 3 · Requirement status: text and a symbol, never colour alone. */
{
  const st = code(STATUS);
  expect(
    /const STATUS_ICON: Record<RequirementStatus, LucideIcon> = \{[\s\S]*green:[\s\S]*yellow:[\s\S]*gray:[\s\S]*not_established:[\s\S]*\}/.test(
      st,
    ),
    `${STATUS}: every requirement status needs its own icon.`,
  );
  expect(
    /data-testid="requirement-status"[\s\S]{0,300}<Icon className="[^"]*" aria-hidden="true" \/>\s*\{requirementLabels\[lang\]\[status\]\}/.test(
      st,
    ),
    `${STATUS}: the badge must render the icon beside the text label.`,
  );
  expect(
    /data-testid="counts-explanation"/.test(st) && /rec\.counts\.explain\.status/.test(st),
    `${STATUS}: the counts block must carry the plain-language explanation of what each number covers.`,
  );
  for (const k of ["received", "reviewed", "remaining", "status", "open"]) {
    expect(
      Boolean(sv[`rec.counts.explain.${k}`]) && Boolean(en[`rec.counts.explain.${k}`]),
      `rec.counts.explain.${k} is missing in sv or en.`,
    );
  }
  expect(
    /Skallkrav inte fastställda” gäller rekryteringen/.test(sv["rec.counts.explain.status"] ?? ""),
    "the Swedish explanation must say not_established is about the recruitment, not the candidate.",
  );
}

/* 4 · The recruitment menu says what each area is for. */
{
  const shell = code(SHELL);
  for (const key of ["jobs", "applications", "assessments", "interviewIntelligence"]) {
    expect(
      shell.includes(`descKey: "employer.nav.${key}.desc"`),
      `${SHELL}: the "${key}" menu item lost its one-line purpose.`,
    );
    expect(
      Boolean(sv[`employer.nav.${key}.desc`]) && Boolean(en[`employer.nav.${key}.desc`]),
      `employer.nav.${key}.desc is missing in sv or en.`,
    );
  }
  expect(
    /\{item\.descKey && \(/.test(shell),
    `${SHELL}: the menu must render an item's description under its label.`,
  );
  expect(
    /activeSection="interviewIntelligence"/.test(code(`${R}reports.tsx`)),
    `${R}reports.tsx: Rapporter is a view over the interview cases and keeps Intervjuer lit.`,
  );
  expect(
    !/activeSection="settings"/.test(code(`${R}preferences.tsx`)),
    `${R}preferences.tsx: "settings" is not a menu section; the page lights nothing.`,
  );
}

/* 5 · Context survives the trip. */
{
  const nav = code(STEP_NAV);
  expect(
    /search=\{\{ \.\.\.preserve, step \}\}/.test(nav),
    `${STEP_NAV}: step links must carry the candidate list's view (preserve).`,
  );
  expect(
    /<ProcessStepNav[\s\S]{0,400}preserve=\{candidateView\}/.test(code(HUB)),
    `${HUB}: the hub must hand the step nav its candidate view.`,
  );
  const cand = code(CANDIDATE);
  expect(
    /rec\.candidate\.backToRecruitment[\s\S]{0,40}/.test(cand) &&
      /to="\/employer\/\$employerSlug\/jobs\/\$jobId"\s*params=\{\{ employerSlug, jobId: jobIdForBack \}\}\s*search=\{\{ step: "applications" as const \}\}/.test(
        cand,
      ),
    `${CANDIDATE}: "back to the recruitment" must land on its candidate list (step=applications).`,
  );
  expect(
    /params=\{\{ employerSlug, jobId: c\.jobId \}\}\s*search=\{\{ step: "applications" as const \}\}/.test(
      cand,
    ),
    `${CANDIDATE}: the job link in the header must land on the candidate list.`,
  );
  // The interview-notes row's result link carries the application.
  {
    const a = cand.indexOf("{interviewNotes.map((n) => (");
    const b = cand.indexOf("</ul>", a);
    const block = a === -1 || b === -1 ? "" : cand.slice(a, b);
    expect(
      /results\/\$attemptId"[\s\S]{0,200}search=\{\{ application: applicationId \}\}/.test(block),
      `${CANDIDATE}: the interview-notes link to a result must carry the application.`,
    );
  }
  expect(
    /reviews\/\$attemptId"[\s\S]{0,160}search=\{applicationId \? \{ application: applicationId \} : \{\}\}/.test(
      code(`${R}assessments.participants.tsx`),
    ),
    `${R}assessments.participants.tsx: the review link must carry the application like the result link does.`,
  );
  const ui = code(UI);
  expect(
    /applicationLink\?: \{ employerSlug: string; applicationId: string \| null \}/.test(ui) &&
      /data-testid="case-application-link"/.test(ui),
    `${UI}: CaseHeader must offer the case's application as one link.`,
  );
  for (const screen of [
    "prepare",
    "tests",
    "interview",
    "evidence",
    "assessment",
    "panel",
    "summary",
  ]) {
    expect(
      /<CaseHeader[\s\S]{0,400}applicationLink=\{\{ employerSlug, applicationId: d\.applicationId \}\}/.test(
        code(`${R}interview-intelligence.$caseId.${screen}.tsx`),
      ),
      `interview-intelligence/$caseId/${screen}: the case header must link to the application.`,
    );
  }
  expect(
    /before=\{\s*<SentinelWayBack/.test(code(`${R}assessments.results.$attemptId.tsx`)),
    `${R}assessments.results.$attemptId.tsx: a Sentinel report needs the same way back as every other report.`,
  );
}

/* 6 · Closed state. */
{
  expect(
    /b\.status === "planned" && open && \(/.test(code(PANELS)),
    `${PANELS}: editing a booking must be hidden once the application is closed; the database refuses it.`,
  );
  expect(
    !/intervjutid/.test(sv["rec.error.applicationClosed"] ?? "") &&
      !/booking|interview/i.test(en["rec.error.applicationClosed"] ?? ""),
    "rec.error.applicationClosed is raised by more than bookings and must not talk about bookings only.",
  );
  expect(
    /applicationId\s*\?\s*archived\s*\?\s*"rec\.lifecycle\.restoredNotice"\s*:\s*"rec\.lifecycle\.archivedNotice"\s*:\s*archived\s*\?\s*"rec\.lifecycle\.restoredNoticeJob"\s*:\s*"rec\.lifecycle\.archivedNoticeJob"/.test(
      code("src/components/recruitment/MaterialLifecycle.tsx"),
    ),
    "MaterialLifecycle: the archive notice must name what was archived (application or recruitment).",
  );
  for (const k of [
    "archivedState",
    "archivedStateJob",
    "archivedNotice",
    "restoredNotice",
    "archivedNoticeJob",
    "restoredNoticeJob",
  ]) {
    expect(
      Boolean(sv[`rec.lifecycle.${k}`]) && Boolean(en[`rec.lifecycle.${k}`]),
      `rec.lifecycle.${k} is missing in sv or en.`,
    );
  }
  expect(
    /data-testid="archived-state"/.test(code("src/components/recruitment/MaterialLifecycle.tsx")),
    "MaterialLifecycle: an archived application or recruitment must say so on the page.",
  );
  expect(
    /data-testid="decision-completed-hint"/.test(code(CANDIDATE)) &&
      Boolean(sv["rec.candidate.decision.completedHint"]),
    `${CANDIDATE}: inert decision buttons on a completed recruitment need their reason beside them.`,
  );
  expect(
    /process\?\.error\s*\?\s*"iiu\.iv\.process\.savefailed"/.test(
      code(`${R}interview-intelligence.$caseId.interview.tsx`),
    ) &&
      Boolean(sv["iiu.iv.process.savefailed"]) &&
      Boolean(en["iiu.iv.process.savefailed"]),
    "the closing panel must distinguish save failure with the existing frozen SV/EN key, without requiring new case copy.",
  );
}

/* 8b · The draft row counts the population its link opens. */
{
  const ov = code(OVERVIEW);
  expect(
    /overview\.recruitments\.filter\(\(r\) => r\.phase === "draft" && !r\.archivedAt\)\.length/.test(
      ov,
    ) &&
      /const draftCount = draftRecruitments \?\? data\.draftJobs;/.test(ov) &&
      /count: draftCount,/.test(ov),
    `${OVERVIEW}: the draft row must count the not-yet-published recruitments (phase=draft), the same population its link opens, with the dashboard count only as the fallback before the overview has answered.`,
  );
}

/* 9 · The actionable review queue stands apart from the historical coverage. */
{
  const oc = code("src/components/recruitment/RecruiterOverviewCounts.tsx");
  const st = code("src/components/recruitment/RecruiterStatus.tsx");
  expect(
    /const queueView = \{ stage: "open", review: "remaining" \} as const;/.test(oc) &&
      /view: queueView/.test(oc) &&
      /count: queue\.isSuccess \? queue\.data\.total/.test(oc),
    "RecruiterOverviewCounts: the queue is a second read of the OPEN applications without a confirmed review, and its number is that list's total.",
  );
  expect(
    /data-testid="review-queue"/.test(st) &&
      /data-testid="review-queue-count"/.test(st) &&
      /data-testid="review-queue-open"/.test(st) &&
      /rec\.counts\.history\.heading/.test(st),
    "RecruiterStatus: the queue is rendered first, with its own count and button, and the historical block is headed as historical.",
  );
  for (const k of [
    "queue.label",
    "queue.hint",
    "queue.cta",
    "queue.unavailable",
    "history.heading",
  ]) {
    expect(
      Boolean(sv[`rec.counts.${k}`]) && Boolean(en[`rec.counts.${k}`]),
      `rec.counts.${k} is missing in sv or en.`,
    );
  }
  expect(
    /[Aa]rkiverade och avgjorda ansökningar ingår inte här/.test(sv["rec.counts.queue.hint"] ?? ""),
    "rec.counts.queue.hint must say the archived and decided applications are not in the queue.",
  );
}

/* 10 · The menu's active item is marked for assistive technology, not only by colour. */
{
  const shell = code("src/components/employer/EmployerAppShell.tsx");
  expect(
    /data-active=\{active \|\| undefined\}/.test(shell) &&
      /\{active && <span className="sr-only">\(\{t\("rec\.flow\.current"\)\}\) <\/span>\}/.test(
        shell,
      ),
    "EmployerAppShell: the active menu item carries data-active and a visually hidden 'you are here'.",
  );
}

/* 11 · The requirement profile reads krav → underlag → kontroll → fastställ, ids behind details. */
{
  const rp = code("src/components/recruitment/RequirementProfilePanel.tsx");
  const order = [
    'stepHeading(1, sv ? "Krav"',
    'stepHeading(2, sv ? "Godtagbart underlag"',
    'stepHeading(3, sv ? "Kontrollinstruktion"',
    'stepHeading(4, sv ? "Fastställ"',
  ];
  let at = -1;
  for (const marker of order) {
    const next = rp.indexOf(marker, at + 1);
    expect(
      next > at,
      `RequirementProfilePanel: the steps must read in order; "${marker}" is missing or out of place.`,
    );
    at = next;
  }
  expect(
    /<details className="mt-2 text-xs text-muted-foreground">[\s\S]{0,400}Befintligt krav-ID/.test(
      rp,
    ) &&
      !/<p className="mt-1 break-all text-xs text-muted-foreground">\s*\{sv \? "Befintligt krav-ID"/.test(
        rp,
      ),
    "RequirementProfilePanel: the requirement id lives behind a details element, not as a line of the form.",
  );
  for (const anchor of [
    'data-testid="requirement-profile"',
    'data-testid="profile-start-date"',
    'data-testid="profile-confirm-ack"',
    "data-requirement-id={rule.requirementId}",
    "rules.some((r) => r.acceptedSources.length === 0 || !r.instructionSv.trim())",
    '(rules.some((r) => r.decisionRule === "valid_at_start") && !startDate)',
  ]) {
    expect(
      rp.includes(anchor),
      `RequirementProfilePanel: "${anchor}" must stay; the rules and the test anchors are unchanged.`,
    );
  }
}

/* 12 · The application list is a working list: views, sub-steps, a fold for the rest. */
{
  const ct = code("src/components/recruitment/CandidateTable.tsx");
  const wf = code("src/lib/recruitment/application-workflow.ts");
  for (const v of ["open", "decided", "archived", "all"]) {
    expect(
      Boolean(sv[`rec.view.${v}`]) &&
        Boolean(en[`rec.view.${v}`]) &&
        Boolean(sv[`rec.view.hint.${v}`]) &&
        Boolean(en[`rec.view.hint.${v}`]),
      `rec.view.${v} / rec.view.hint.${v} is missing in sv or en.`,
    );
  }
  expect(
    /export const PRIMARY_VIEWS = \["open", "decided", "archived", "all"\] as const;/.test(wf),
    "application-workflow: the primary views are Aktiva, Avslutade, Arkiv and the secondary Alla, in that order.",
  );
  expect(
    /case "decided":\s*return "decided";[\s\S]*case "archived":\s*return "archived";[\s\S]*case "all":\s*case "received":\s*return "all";[\s\S]*default:\s*return "open";/.test(
      wf,
    ),
    "application-workflow: every stage filter maps to one primary view; the active sub-stages are the open view.",
  );
  expect(
    /if \(stage === "open" && view\.requirement === "gray"\) return "clarify";/.test(wf),
    "application-workflow: 'Behöver klarläggande' is the server's open+gray list, a view and never a new status.",
  );
  expect(
    /data-testid="list-views"/.test(ct) &&
      /data-testid=\{`view-\$\{v\}`\}/.test(ct) &&
      /aria-current=\{active \? "page" : undefined\}/.test(ct) &&
      /data-testid="list-substeps"/.test(ct) &&
      /data-testid="more-filters"/.test(ct) &&
      /data-testid="owner-filter"/.test(ct),
    "CandidateTable: view tabs (aria-current), active sub-steps, the responsible filter in the open and a 'Fler filter' fold.",
  );
  const moreFold = ct.indexOf('data-testid="more-filters"');
  for (const id of ["requirement-filter", "review-filter", "analysis-filter", "stage-filter"]) {
    expect(
      ct.indexOf(`data-testid="${id}"`) > moreFold,
      `CandidateTable: ${id} belongs behind 'Fler filter'; the everyday filters are responsible and recruitment.`,
    );
  }
  expect(
    /open=\{advancedOpen \|\| advancedCount > 0\}/.test(ct),
    "CandidateTable: the fold opens by itself whenever one of its filters is in the URL, so a filtered link never hides the filter that narrowed it.",
  );
  expect(
    !/<AnalysisStatusBadge \/>/.test(ct) && /rec\.table\.analysisNote/.test(ct),
    "CandidateTable: 'technical analysis: not used' is said once, not once per row.",
  );
  expect(
    /data-testid="next-step"/.test(ct) &&
      /nextStepOf\(\{/.test(ct) &&
      /rec\.col\.nextStep/.test(ct),
    "CandidateTable: every row carries the suggested next step, from the shared projection.",
  );
  expect(
    /collapsible\s*scopeLabel=/.test(ct) &&
      ct.indexOf("<RecruiterCounts") > ct.indexOf("{/* ── Pagination"),
    "CandidateTable: the historical statistics are folded and come after the list, not before it.",
  );
  const st = code(STATUS);
  expect(
    /data-testid="counts-history"/.test(st) &&
      /if \(!collapsible\) return <>\{children\}<\/>;/.test(st) &&
      st.indexOf('data-testid="review-queue"') < st.indexOf("<HistoryFold"),
    "RecruiterStatus: the queue stays in the open; only the historical coverage folds.",
  );
  expect(
    /collapsible\s*title=\{t\("rec\.overview\.counts\.title"\)\}/.test(
      code("src/components/recruitment/RecruiterOverviewCounts.tsx"),
    ),
    "RecruiterOverviewCounts: the overview folds the historical statistics.",
  );
  const ov = code(OVERVIEW);
  expect(
    ov.indexOf('aria-labelledby="employer-actions"') <
      ov.indexOf('aria-labelledby="active-recruitments"') &&
      ov.indexOf('aria-labelledby="active-recruitments"') < ov.indexOf("<RecruiterOverviewCounts"),
    "Overview: 'Att göra idag' comes before the recruitments table, and the statistics come last.",
  );
  for (const k of [
    "review",
    "clarify",
    "profile",
    "decideNotMet",
    "prepareInterview",
    "interview",
    "reconfirm",
    "tellCandidate",
    "archive",
    "none",
  ]) {
    expect(
      Boolean(sv[`rec.next.${k}`]) && Boolean(en[`rec.next.${k}`]),
      `rec.next.${k} is missing in sv or en.`,
    );
  }
}

/* 13 · The requirement review is summarised in the application header. */
{
  const cand = code(CANDIDATE);
  const sum = code("src/components/recruitment/RequirementSummary.tsx");
  const wf = code("src/lib/recruitment/application-workflow.ts");
  expect(
    /<RequirementSummary/.test(cand) &&
      cand.indexOf("<RequirementSummary") < cand.indexOf("<ProcessContinuityStrip"),
    "Application page: the requirement summary sits in the header, before the process strip.",
  );
  expect(
    /queryKey: \["employer", employerId, "requirement-review", applicationId\]/.test(sum),
    "RequirementSummary: reads the review under the SAME query key as the review panel, so header and panel cannot disagree.",
  );
  expect(
    /const human = \(c: SummaryCriterion\) => c\.reviewedAt !== null \|\| c\.reviewedBy !== null;/.test(
      wf,
    ) &&
      /c\.state === "met" && human\(c\) && c\.sourceCurrent/.test(wf) &&
      /c\.state === "met" && !human\(c\)/.test(wf) &&
      /allConfirmed: mandatory\.length > 0 && confirmedMet\.length === mandatory\.length/.test(wf),
    "application-workflow: 'confirmed' means a PERSON recorded met on a current source; preliminary basis is counted apart; merits never complete the count.",
  );
  for (const id of [
    'data-testid="requirement-summary"',
    'data-testid="requirement-summary-count"',
    'data-testid="requirement-summary-preliminary"',
    'data-testid="requirement-summary-details"',
    'data-testid="requirement-summary-criterion"',
    'data-testid="summary-action-confirm"',
    'data-testid="summary-action-supplement"',
    'data-testid="summary-action-prepare"',
    'data-testid="summary-action-reject"',
  ]) {
    expect(sum.includes(id), `RequirementSummary: "${id}" must stay.`);
  }
  expect(
    /<RequirementStatusBadge status=\{review\.requirementStatus\} \/>/.test(sum),
    "RequirementSummary: the colour is the server's requirementStatus (text + symbol), never a client classification.",
  );
  expect(
    /disabled=\{supplementBody\.length === 0\}/.test(sum) &&
      /\.filter\(\(c\) => c\.kind === "mandatory" && c\.state === "clarify" && c\.neutralQuestion\?\.trim\(\)\)/.test(
        wf,
      ),
    "A supplement request carries only the reviewer's own neutral questions; with none written there is nothing to send.",
  );
  expect(
    /aldrig ett skallkrav/.test(sv["rec.summary.greenRule"] ?? "") &&
      /bara när alla skallkrav är bekräftade av en person/.test(
        sv["rec.summary.greenRule"] ?? "",
      ) &&
      /inte en genomförd granskning/.test(sv["rec.summary.preliminaryNote"] ?? "") &&
      /ingen AI/.test(sv["rec.summary.preliminaryNote"] ?? ""),
    "rec.summary.greenRule / preliminaryNote must state: green only when a person confirmed every mandatory requirement, merits never compensate, preliminary basis is no review, no AI.",
  );
}

/* 14 · 'Ej aktuell' is saved, said, and the candidate's notice is a separate fact. */
{
  const cand = code(CANDIDATE);
  const wf = code("src/lib/recruitment/application-workflow.ts");
  expect(
    /data-testid="decision-saved"/.test(cand) &&
      /rec\.decision\.saved\.rejected/.test(cand) &&
      /data-testid="decision-next-candidate"/.test(cand) &&
      /data-testid="decision-back-to-active"/.test(cand),
    "Application page: a saved decision is announced once, with the way to the next candidate and back to the active list.",
  );
  expect(
    /onMutate: \(newStatus\) => \{[\s\S]*nextId: nextIdAtMutation\(\)/.test(cand) &&
      /nextIdRef\.current = nextId;/.test(cand),
    "Application page: the next candidate is captured BEFORE the decision lands, because a rejected candidate is no longer in the open list.",
  );
  expect(
    /data-testid="candidate-notice-state"/.test(cand) &&
      /candidateNoticeStateOf\(c\.applicationStatus, rw\.messages\)/.test(cand),
    "Application page: the candidate's notice state is read from the messages, apart from the decision.",
  );
  expect(
    /case "failed":\s*case "unknown":\s*return "failed";/.test(wf) &&
      /if \(m\.status === "draft"\) return "prepared";/.test(wf),
    "application-workflow: a failed or unknown e-mail is 'failed', a draft is 'prepared' -- never delivered.",
  );
  for (const k of ["internal", "prepared", "queued", "delivered", "failed"]) {
    expect(
      Boolean(sv[`rec.decision.notice.${k}`]) &&
        Boolean(en[`rec.decision.notice.${k}`]) &&
        !/\bSkickat\b/.test(sv[`rec.decision.notice.${k}`] ?? ""),
      `rec.decision.notice.${k} is missing, or says "Skickat".`,
    );
  }
  expect(
    /Ingenting har skickats till kandidaten/.test(sv["rec.decision.saved.rejected"] ?? "") &&
      /lämnat den aktiva listan och granskningskön/.test(sv["rec.decision.saved.rejected"] ?? "") &&
      /under Avslutade/.test(sv["rec.decision.saved.rejected"] ?? ""),
    "rec.decision.saved.rejected must say where the application went and that nothing was sent.",
  );
  expect(
    /data-testid="decision-closed-view"/.test(cand) &&
      /rec\.decision\.reopenNote/.test(cand) &&
      /inget raderas automatiskt/.test(sv["rec.decision.closedView.rejected"] ?? "") &&
      /separat behörig åtgärd med angiven orsak/.test(sv["rec.decision.reopenNote"] ?? ""),
    "Application page: the closed view says nothing is deleted automatically and that reopening is a separate authorised act with a reason.",
  );
  expect(
    /setDecisionNotice\(null\);\s*setActionError\(\s*`\$\{t\("rec\.decision\.saveFailed"\)\}/.test(
      cand,
    ),
    "Application page: a failed save clears any success notice and says nothing changed.",
  );
}

/* 15 · The interview guide's C1–C6 is written once on the preparation screen. */
{
  const prep = code(`${R}interview-intelligence.$caseId.prepare.tsx`);
  const saved = code("src/components/employer/interview/SavedCaseSources.tsx");
  const seed = code("src/lib/interview-intelligence/seeded-guide-source.ts");
  expect(
    /data-testid="ii-requirement-headings"/.test(prep) &&
      /data-testid="ii-requirement-definitions"/.test(prep),
    "Prepare: the role-requirements panel shows short headings with the definitions behind a fold.",
  );
  expect(
    /isSeededGuideRequirementsSource\(source\)/.test(saved) &&
      /href="#s-reqs"/.test(saved) &&
      /data-testid="ii-seeded-guide-source"/.test(saved),
    "SavedCaseSources: the seeded guide copy is named and linked to the role-requirements panel, not printed again.",
  );
  expect(
    /source\.kind === "employer_requirements" &&\s*source\.label === SEEDED_GUIDE_SOURCE_LABEL &&\s*\(source\.origin \?\? "employer_supplied"\) === "employer_supplied"/.test(
      seed,
    ) && /"Rollens krav \(ur intervjuguiden\)"/.test(seed),
    "seeded-guide-source: kind, label and origin all have to match the seeding; an employer's own requirements text is never folded away.",
  );
  expect(
    !/scp_iv_add_source[\s\S]*Rollens krav \(ur intervjuguiden\)/.test(saved) &&
      /seedCaseSources/.test(code("src/lib/interview-intelligence/runtime.functions.ts")),
    "The seeding itself stays: the source is citable case material; only its display is folded.",
  );
}

/* 16 · Lifecycle v0.3 on the client: tolerant of an uninstalled schema, never a hidden fallback. */
{
  const fn = code("src/lib/recruitment/lifecycle-v03.functions.ts");
  const cand = code(CANDIDATE);
  const sup = code("src/components/recruitment/SupplementPanel.tsx");
  const reopen = code("src/components/recruitment/ReopenDecision.tsx");
  const comp = code("src/components/recruitment/InterviewCompositionPanel.tsx");
  const lib = code("src/lib/recruitment/interview-composition.ts");
  expect(
    /error\.code === "PGRST202"/.test(fn) &&
      /if \(isSchemaMissing\(error\)\) return new Error\("SCHEMA_NOT_INSTALLED"\);/.test(fn) &&
      (fn.match(/if \(isSchemaMissing\(result\.error\)\) return \{ installed: false \};/g) ?? [])
        .length >= 4,
    "lifecycle-v03.functions: a missing RPC is 'not installed' on every read and SCHEMA_NOT_INSTALLED on every write, never a generic failure.",
  );
  expect(
    /if \(code === "SCHEMA_NOT_INSTALLED"\) \{\s*setComposeRequest\(\{\s*kind: "information"/.test(
      cand,
    ) && /supplement\.mutate\(\{ body, profileId, requirementIds \}\)/.test(cand),
    "Application page: 'Begär komplettering' uses the supplement record when installed and falls back to the plain message draft when not -- the same words either way.",
  );
  expect(
    /data-testid="supplement-not-installed"/.test(sup) &&
      /data-testid="supplement-awaiting"/.test(sup) &&
      /data-testid="supplement-answered"/.test(sup) &&
      /data-testid="supplement-withdraw"/.test(sup),
    "SupplementPanel: says when the slot is not installed, shows the open request, and lets a person resolve it.",
  );
  expect(
    /c\.applicationStatus === "rejected" && canDecide && !completed && \(\s*<ReopenDecision/.test(
      cand,
    ) &&
      /expectedStatus: "rejected"/.test(reopen) &&
      /reason\.trim\(\)\.length < 5/.test(reopen) &&
      /code === "SCHEMA_NOT_INSTALLED"\s*\? t\("rec\.reopen\.notInstalled"\)/.test(reopen),
    "ReopenDecision: only on a rejected application a manager may act on, with the page's status as expected status, a reason of at least five characters, and the honest sentence when the slot is missing.",
  );
  expect(
    /export const COMPOSITION_GROUPS = \[\s*"intro",\s*"competence",\s*"scenarios",\s*"probes",\s*"beskt",\s*"clarifications",\s*"closing",\s*\] as const;/.test(
      lib,
    ) && /new Set\(\[\s*"competence",\s*"scenarios",\s*"probes",\s*\]\)/.test(lib),
    "interview-composition: the seven groups in the brief's order; only the three with governed content are selectable.",
  );
  expect(
    /kind: "core_question",\s*itemId: q\.id,/.test(lib) &&
      !/checked=\{chosen\.has\(q\.id\)\}/.test(comp),
    "The core questions are always in the selection and never offered as a checkbox; only approved probes are chosen.",
  );
  expect(
    /data-testid="composition-not-installed"/.test(comp) &&
      /rec\.composition\.noAi/.test(comp) &&
      /data-testid="composition-coverage"/.test(comp) &&
      /data-testid="composition-reason"/.test(comp) &&
      /window\.sessionStorage\.setItem\(\s*draftKey/.test(comp),
    "InterviewCompositionPanel: not-installed sentence, no-AI sentence, order/time/coverage, a reason field for a new version, and a resumable draft.",
  );
  expect(
    /<InterviewCompositionPanel\s+employerId=\{employerId\}\s+employerSlug=\{employerSlug\}\s+jobId=\{jobId\}\s*\/>/.test(
      code(HUB),
    ) &&
      /<CaseCompositionRail caseId=\{caseId\} jobId=\{d\.jobId\} employerSlug=\{employerSlug\} \/>/.test(
        code(`${R}interview-intelligence.$caseId.prepare.tsx`),
      ),
    "The setup is edited on the recruitment and read, pinned, on the case.",
  );
  for (const k of [
    "rec.supplement.notInstalled",
    "rec.reopen.notInstalled",
    "rec.composition.notInstalled",
    "rec.composition.noAi",
    "rec.composition.group.besktHint",
    "rec.error.schemaNotInstalled",
  ]) {
    expect(Boolean(sv[k]) && Boolean(en[k]), `${k} is missing in sv or en.`);
  }
  expect(
    /endast rekryteringsläget får användas/i.test(sv["rec.composition.group.besktHint"] ?? ""),
    "rec.composition.group.besktHint must say only the recruitment mode may be used in the interview guide.",
  );
}

if (errors.length > 0) {
  for (const e of errors) console.error("[employer-portal-flow:check][error]", e);
  console.error(`\n${errors.length} problem(s).`);
  process.exit(1);
}
console.log("employer-portal-flow:check — ok");
