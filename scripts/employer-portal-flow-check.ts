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
  const pages: [string, string | null][] = [
    [OVERVIEW, null],
    [`${R}jobs.index.tsx`, "requirements"],
    [`${R}applications.index.tsx`, "applications"],
    [`${R}assessments.index.tsx`, "tests"],
    [`${R}interview-intelligence.index.tsx`, "interviews"],
    [`${R}reports.tsx`, "report"],
  ];
  for (const [file, current] of pages) {
    const src = code(file);
    expect(/<RecruitmentFlowStrip/.test(src), `${file}: the flow strip is gone from this page.`);
    if (current) {
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
    ["in-interview-stage", /stage: "interview" as const/, "the applications at the interview stage"],
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
      Boolean(sv[`rec.overview.stat.${stat}.hint`]) && Boolean(en[`rec.overview.stat.${stat}.hint`]),
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
  for (const screen of ["prepare", "tests", "interview", "evidence", "assessment", "panel", "summary"]) {
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
  for (const k of ["archivedState", "archivedStateJob", "archivedNotice", "restoredNotice"]) {
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
    /process\?\.error\s*\?\s*"iiu\.iv\.process\.saveFailed"/.test(
      code(`${R}interview-intelligence.$caseId.interview.tsx`),
    ) && Boolean(sv["iiu.iv.process.saveFailed"]),
    "the closing panel must tell a failed save apart from an unsaved draft.",
  );
}

if (errors.length > 0) {
  for (const e of errors) console.error("[employer-portal-flow:check][error]", e);
  console.error(`\n${errors.length} problem(s).`);
  process.exit(1);
}
console.log("employer-portal-flow:check — ok");
