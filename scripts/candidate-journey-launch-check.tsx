// Candidate journey, launch readiness — what the surfaces SAY is true, and a
// failed read is never shown as an empty one.
//
// Run via `bun run candidate-journey-launch:check`.
//
// ── WHAT THIS PINS ─────────────────────────────────────────────────────
//
// A launch review of the candidate journey found eight places where the
// product told a candidate something it could not stand behind. Each is a
// small fix that nothing fails loudly over if it regresses, so each is held
// here, against the source and, where the behaviour can be rendered, against
// the rendered output.
//
//   1  The career analysis is NOT an "internal test": it is open to anybody who
//      visits, signed out. What is true is that its content has not been
//      reviewed by specialists. The note says that, and it is said only where
//      it is about Career Discovery: the shell is shared with employer-assigned
//      assessments and the Academy's runs, where "this is not a test" and an
//      exit into the career centre are simply wrong. The report carries the
//      caveat itself, and a history row carries a test-version tag only when
//      its session is marked as one.
//   2  The front door of the main funnel could hang on "Förbereder…" for ever.
//   3  The CV: printing with the editor open printed a blank page; leaving by a
//      link lost unsaved wording silently; three failures were silent.
//   4  A report-history read that failed said "you have no reports yet".
//   5  A profile read that failed said "not filled in", inviting an overwrite.
//   6  Feedback sent document.referrer, which is stale in a client-side app and
//      over the schema's limit rejected the whole submission.
//   7  "Ask Security AI" was printed on every Security Work page while no AI is
//      approved.
//   8  /journey was an orphaned English page promising a Career Card the owner
//      has hidden.
//
// Its planted defects are in scripts/negative-controls/
// candidate-journey-launch-controls.ts (`bun run
// negative-controls:candidate-journey-launch`).

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import React from "react";
import { mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider, LanguageScope } from "../src/i18n/context";
import { dictionaries } from "../src/i18n/dictionaries";
import { CV } from "../src/components/professional-identity/cv-copy";

const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(detail ? `${label} — ${detail}` : label);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
};
const group = (title: string) => console.log(`\n${title}`);

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const exists = (p: string) => existsSync(new URL(`../${p}`, import.meta.url));
/** Source with comments removed, so a name quoted in a comment cannot satisfy
 *  -- or fail -- an assertion about what the file does. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const sv = dictionaries.sv as Record<string, string>;
const en = dictionaries.en as Record<string, string>;

const SHELL = "src/components/career-discovery/v31/shell/AssessmentShell.tsx";
const CD_SHELL = "src/components/career-discovery/v31/shell/CareerDiscoveryShell.tsx";
const FLOW = "src/components/career-discovery/v31/PublicAssessmentFlow.tsx";
const REPORT_VIEW = "src/components/career-discovery/v31/V31ReportView.tsx";
const HISTORY_LIST = "src/components/career-discovery/ReportHistoryList.tsx";
const HISTORY_ROUTE = "src/routes/_authenticated.security-career-assessment.history.tsx";
const DISCOVERY_FNS = "src/lib/career-discovery/discovery.functions.ts";
const ATTEMPT = "src/routes/_authenticated.academy.$attemptId.tsx";
const TRAINING = "src/routes/_authenticated.academy.training.$assignmentId.$moduleVersionId.tsx";
const LEARNING = "src/routes/_authenticated.academy.learning.$formId.tsx";
const PROFILE_CARD = "src/components/assessment/SecurityCareerProfileCard.tsx";
const FEEDBACK_ROUTE = "src/routes/_authenticated.feedback.tsx";
const FEEDBACK_FNS = "src/lib/job-intelligence/beta-feedback.functions.ts";
const ASSISTANT = "src/components/security-work/SecurityAssistant.tsx";
const SW_E2E = "e2e/security-work-programme.spec.ts";
const JOURNEY = "src/routes/_authenticated.journey.tsx";
const CV_ROUTE = "src/routes/_authenticated.my-career.cv.$cvId.tsx";

/** Every .ts/.tsx file under src/, as [path, source]. */
function sourceFiles(dir = "src"): [string, string][] {
  const out: [string, string][] = [];
  for (const name of readdirSync(new URL(`../${dir}`, import.meta.url))) {
    const rel = `${dir}/${name}`;
    const full = new URL(`../${rel}`, import.meta.url);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(rel));
    else if (/\.(ts|tsx)$/.test(name)) out.push([rel, readFileSync(full, "utf8")]);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
group("1a · the shell says nothing about any one product");
{
  // AssessmentShell renders a TanStack Link, which is empty under
  // renderToStaticMarkup without a router. A plain anchor stands in, and it
  // fills a route's $params the way the router does so the destination can be
  // read from the markup.
  const hrefOf = (to: string, params?: Record<string, string>) =>
    to.replace(/\$(\w+)/g, (_, name: string) => params?.[name] ?? `$${name}`);
  await mock.module("@tanstack/react-router", () => ({
    Link: ({
      to,
      params,
      children,
      ...rest
    }: Record<string, unknown> & {
      to?: string;
      params?: Record<string, string>;
      children?: React.ReactNode;
    }) => React.createElement("a", { href: hrefOf(String(to ?? ""), params), ...rest }, children),
    createFileRoute: () => () => ({}),
  }));
  const { AssessmentShell } =
    await import("../src/components/career-discovery/v31/shell/AssessmentShell");
  const { CareerDiscoveryShell } =
    await import("../src/components/career-discovery/v31/shell/CareerDiscoveryShell");

  const page = (node: React.ReactNode, lang: "sv" | "en" = "sv") =>
    renderToStaticMarkup(
      <I18nProvider>
        <LanguageScope lang={lang}>{node}</LanguageScope>
      </I18nProvider>,
    );

  const bare = page(
    <AssessmentShell>
      <p>run</p>
    </AssessmentShell>,
  );
  check("1a.1 a shell given no note renders no footer at all", !/<footer/.test(bare), bare);
  check(
    "1a.2 a shell given no exit renders no way out into the career centre",
    !bare.includes('href="/career-center"') && !text(bare).includes(sv["cd.public.exit"]),
    text(bare),
  );
  check(
    "1a.3 and none of the Career Discovery wording, old or new, appears under it",
    !text(bare).includes("under utveckling") &&
      !text(bare).includes("Intern testversion") &&
      !text(bare).includes("inte ett prov"),
    text(bare),
  );

  const withExit = page(
    <AssessmentShell exit={{ to: "/academy", label: "Till Tester och utveckling" }}>
      <p>run</p>
    </AssessmentShell>,
  );
  check(
    "1a.4 a supplied exit is rendered with the supplied destination and words",
    withExit.includes('href="/academy"') && text(withExit).includes("Till Tester och utveckling"),
    withExit,
  );
  const withProgramme = page(
    <AssessmentShell
      exit={{
        to: "/academy/training/$assignmentId",
        params: { assignmentId: "a-1" },
        label: "Tillbaka till programmet",
      }}
    >
      <p>run</p>
    </AssessmentShell>,
  );
  check(
    "1a.5 an exit that needs the assignment goes to that assignment's programme",
    withProgramme.includes('href="/academy/training/a-1"'),
    withProgramme,
  );
  const withNote = page(
    <AssessmentShell footerNote="En anteckning">
      <p>run</p>
    </AssessmentShell>,
  );
  check(
    "1a.6 a supplied footer note is rendered, and only because it was supplied",
    /<footer/.test(withNote) && text(withNote).includes("En anteckning"),
    withNote,
  );

  const shellSrc = code(read(SHELL));
  check(
    "1a.7 the shell's own source names no Career Discovery key and hard-wires no career-centre link",
    !/careerDiscovery\./.test(shellSrc) &&
      !/cd\.public\.exit/.test(shellSrc) &&
      !/to="\/career-center"/.test(shellSrc),
  );

  // The Career Discovery wrapper.
  for (const lang of ["sv", "en"] as const) {
    const dict = lang === "sv" ? sv : en;
    const bareCd = text(
      page(
        <CareerDiscoveryShell>
          <p>run</p>
        </CareerDiscoveryShell>,
        lang,
      ),
    );
    check(
      `1a.8 (${lang}) the Career Discovery shell carries the Career Discovery note`,
      bareCd.includes(dict["careerDiscovery.dashboard.internalTestNote"]),
      bareCd,
    );
    const resultCd = page(
      <CareerDiscoveryShell showNote={false}>
        <p>run</p>
      </CareerDiscoveryShell>,
      lang,
    );
    check(
      `1a.9 (${lang}) and drops it where the page carries the sentence itself`,
      !/<footer/.test(resultCd),
      resultCd,
    );
  }
  const cdRunning = page(
    <CareerDiscoveryShell showExit>
      <p>run</p>
    </CareerDiscoveryShell>,
  );
  check(
    "1a.10 the Career Discovery shell's exit goes to the career centre, in its own words",
    cdRunning.includes('href="/career-center"') && text(cdRunning).includes(sv["cd.public.exit"]),
    cdRunning,
  );
  const cdBefore = page(
    <CareerDiscoveryShell>
      <p>intro</p>
    </CareerDiscoveryShell>,
  );
  check(
    "1a.11 and offers none before a run is in progress",
    !cdBefore.includes('href="/career-center"'),
    cdBefore,
  );

  // Who may use which shell.
  const files = sourceFiles();
  const importsCd = files
    .filter(([f, s]) => f !== CD_SHELL && /shell\/CareerDiscoveryShell/.test(s))
    .map(([f]) => f);
  check(
    "1a.12 only the Career Discovery flow imports the Career Discovery shell",
    importsCd.length === 1 && importsCd[0] === FLOW,
    importsCd.join(", "),
  );
  const flowSrc = code(read(FLOW));
  check(
    "1a.13 and that flow no longer renders the neutral shell's own element",
    !/<AssessmentShell[\s>]/.test(flowSrc) && /<CareerDiscoveryShell[\s>]/.test(flowSrc),
  );
  check(
    "1a.14 nothing passes the retired `showExit` to the neutral shell",
    files.every(([f, s]) => f === CD_SHELL || !/<AssessmentShell[^>]*\bshowExit\b/.test(code(s))),
  );

  // Where each Academy caller leaves to.
  const attempt = code(read(ATTEMPT));
  const attemptShells =
    attempt
      .slice(attempt.indexOf("function AcademyAttemptRunner("))
      .match(/<AssessmentShell\b[^>]*>/g) ?? [];
  const exiting = attemptShells.filter((s) => /\bexit=\{(?:exit|pauseExit)\}/.test(s));
  check(
    "1a.15 every assigned-assessment phase offers a return or a save-before-exit action",
    exiting.length === attemptShells.length &&
      attemptShells.length > 0 &&
      attemptShells.every((s) => /deliveryLanguage=\{lang\}/.test(s)),
    `${exiting.length} of ${attemptShells.length}`,
  );
  check(
    "1a.16 and that exit is the person's own assessments, worded neutrally",
    /const exit = \{ to: "\/academy", label: t\("academy\.attempt\.exit"\) \} as const;/.test(
      attempt,
    ),
  );
  check(
    "1a.17 the practice run leaves to the Academy home",
    /<AssessmentShell exit=\{\{ to: "\/academy", label: t\("academy\.learning\.backHome"\) \}\}>/.test(
      code(read(LEARNING)),
    ),
  );
  check(
    "1a.18 the training module leaves to its own programme",
    /to: "\/academy\/training\/\$assignmentId",\s*params: \{ assignmentId \},\s*label: t\("academy\.training\.backToProgramme"\)/.test(
      code(read(TRAINING)),
    ),
  );
  check(
    "1a.19 the reviewer workspace and the retired invite page carry no Career Discovery footer",
    /<AssessmentShell wide>/.test(code(read("src/routes/_authenticated.reviews.tsx"))) &&
      /<AssessmentShell>/.test(code(read("src/routes/invite.$token.tsx"))),
  );
  for (const k of ["academy.attempt.exit"]) {
    check(
      `1a.20 ${k} exists in both languages, differently`,
      Boolean(sv[k]) && Boolean(en[k]) && sv[k] !== en[k],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
group("1b–e · the wording is the true one");
{
  const SV_NOTE =
    "Karriäranalysen är under utveckling. Innehållet är framtaget men ännu inte granskat av sakkunniga. Det är vägledning som stöd för samtal och egna beslut – inte ett prov och inte ett besked om anställningsbarhet.";
  const EN_NOTE =
    "The career analysis is still in development. Its content has not yet been reviewed by specialists. It is guidance to support conversation and your own decisions – not a test and not a judgement about employability.";
  check(
    "1b.1 the Swedish note is the approved sentence",
    sv["careerDiscovery.dashboard.internalTestNote"] === SV_NOTE,
    sv["careerDiscovery.dashboard.internalTestNote"],
  );
  check(
    "1b.2 the English note is the approved sentence",
    en["careerDiscovery.dashboard.internalTestNote"] === EN_NOTE,
    en["careerDiscovery.dashboard.internalTestNote"],
  );
  check(
    "1b.3 neither calls the open analysis an internal test",
    !/intern testversion/i.test(sv["careerDiscovery.dashboard.internalTestNote"]) &&
      !/internal test/i.test(en["careerDiscovery.dashboard.internalTestNote"]),
  );

  check(
    "1c.1 the history tag says what is true, in Swedish",
    sv["careerDiscovery.history.internalTest"] ===
      "Testversion – innehållet är ännu inte granskat av sakkunniga",
    sv["careerDiscovery.history.internalTest"],
  );
  check(
    "1c.2 and in English",
    en["careerDiscovery.history.internalTest"] ===
      "Test version – content not yet reviewed by specialists",
    en["careerDiscovery.history.internalTest"],
  );
  const list = code(read(HISTORY_LIST));
  check(
    "1c.3 a history row is never marked as a test by default",
    !/internalTest:\s*true/.test(list),
  );
  check(
    "1c.4 the mark comes from the session's own flag, in both ways the list is filled",
    (list.match(/internalTest:\s*r\.isInternalTest/g) ?? []).length === 2,
  );
  const fns = code(read(DISCOVERY_FNS));
  const listFn = fns.slice(fns.indexOf("export const listMyDiscoveryReports"));
  check(
    "1c.5 the history read selects is_internal_test and returns it as a strict boolean",
    /select\([^)]*is_internal_test/.test(listFn) &&
      /isInternalTest:\s*r\.is_internal_test === true/.test(listFn),
  );

  const view = code(read(REPORT_VIEW));
  check(
    "1d.1 the v3.1 report takes no `isInternalTest` gate that no caller supplies",
    !/isInternalTest/.test(view),
  );
  check(
    "1d.2 it renders the caveat unconditionally, as a note, from the true wording",
    /<p\s+role="note"\s+data-testid="cd-report-caveat"[\s\S]{0,400}careerDiscovery\.dashboard\.internalTestNote/.test(
      view,
    ),
  );
  const flow = code(read(FLOW));
  const shellOpens = [...flow.matchAll(/<CareerDiscoveryShell\b[^>]*>/g)].map((m) => m[0]);
  const noNote = shellOpens.filter((s) => /showNote=\{false\}/.test(s));
  check(
    "1d.3 the result screen, which carries the caveat in the report, is the one screen without the footer",
    noNote.length === 1 &&
      flow.lastIndexOf(noNote[0]) === flow.lastIndexOf("<CareerDiscoveryShell wide") &&
      flow.slice(flow.lastIndexOf(noNote[0])).includes("<V31ReportView"),
    noNote.join(" | "),
  );
  check(
    "1d.4 every screen before the result, the intro and the questions included, shows the note",
    shellOpens.length >= 12 && shellOpens.length - noNote.length >= 11,
    String(shellOpens.length),
  );

  check(
    "1e.1 the closed state is stated, in Swedish, without a review it cannot promise",
    sv["cd.public.unavailableBody"] === "Karriäranalysen är inte öppen för nya deltagare just nu.",
    sv["cd.public.unavailableBody"],
  );
  check(
    "1e.2 and in English",
    en["cd.public.unavailableBody"] ===
      "The career analysis is not open to new participants right now.",
    en["cd.public.unavailableBody"],
  );
  check(
    "1e.3 neither mentions a review or a date",
    !/gransk|review|så snart|as soon as/i.test(
      `${sv["cd.public.unavailableBody"]} ${en["cd.public.unavailableBody"]}`,
    ),
  );
}

// ═══════════════════════════════════════════════════════════════════════
group("2 · the front door of the funnel cannot hang");
{
  const flow = code(read(FLOW));
  const boot = flow.slice(
    flow.indexOf("void Promise.all([checkAvailability"),
    flow.indexOf("const itemIds = useMemo"),
  );
  check(
    "2.1 the availability / session / tester chain ends in a catch",
    /\.then\(async \(\[availability, session\]\) => \{[\s\S]*\}\)\s*\.catch\(\(err: unknown\) => \{/.test(
      flow,
    ),
  );
  check(
    "2.2 the catch moves to a phase of its own, and respects an unmounted effect",
    /\.catch\(\(err: unknown\) => \{\s*if \(!alive\) return;[\s\S]{0,160}setPhase\("check-failed"\);/.test(
      flow,
    ),
  );
  check(
    "2.3 the tester check is awaited INSIDE the guarded chain, not beside it",
    boot.indexOf("await checkTesterStatus({})") > boot.indexOf(".then(async") &&
      boot.indexOf("await checkTesterStatus({})") < boot.indexOf(".catch("),
  );
  check(
    "2.4 the phase exists and renders an alert with a retry",
    /\| "check-failed"/.test(read(FLOW)) &&
      /phase === "check-failed"[\s\S]{0,400}role="alert"/.test(flow) &&
      /cd\.public\.checkFailedTitle/.test(flow) &&
      /cd\.public\.checkFailedBody/.test(flow),
  );
  check(
    "2.5 the retry returns to 'checking' and re-runs the boot effect",
    /setPhase\("checking"\);\s*setBootAttempt\(\(n\) => n \+ 1\);/.test(flow) &&
      /phaseAfterQuestions,\s*bootAttempt,\s*\]\);/.test(flow),
  );
  const catchBlock = /\.catch\(\(err: unknown\) => \{[\s\S]*?\}\);/.exec(flow)?.[0] ?? "";
  check(
    "2.6 the failure is not dressed as the closed state",
    catchBlock.includes('"check-failed"') && !catchBlock.includes('"unavailable"'),
    catchBlock,
  );
  for (const k of ["cd.public.checkFailedTitle", "cd.public.checkFailedBody"]) {
    check(
      `2.7 ${k} exists in both languages, differently`,
      Boolean(sv[k]) && Boolean(en[k]) && sv[k] !== en[k],
    );
  }
}

// ═══════════════════════════════════════════════════════════════════════
group("3 · the CV editor");
{
  const route = read(CV_ROUTE);
  const src = code(route);
  check(
    "3a.1 the print control is disabled while the editor is open (the saved document is not on the page)",
    /aria-describedby="cv-export-help"\s+disabled=\{busy \|\| editing\}\s+onClick=\{\(\) => window\.print\(\)\}/.test(
      src,
    ),
  );
  check(
    "3a.2 the line the button is described by gives the reason while it is disabled",
    /id="cv-export-help"[^>]*>\s*\{L\(editing \? CV\.exportCloseEditor : CV\.exportHelp, l\)\}/.test(
      src,
    ),
  );
  check(
    "3a.3 the reason is not a promise of a download",
    !/ladda ner|hämta pdf|download/i.test(`${CV.exportCloseEditor.sv} ${CV.exportCloseEditor.en}`),
  );

  check(
    "3b.1 the route holds in-app navigation with the router's blocker, with a resolver",
    /useBlocker\b/.test(src) &&
      /import \{[^}]*\buseBlocker\b[^}]*\} from "@tanstack\/react-router"/.test(src) &&
      /withResolver: true/.test(src),
  );
  check(
    "3b.2 the blocker is enabled only while the editor is open AND dirty (saving, closing and 'Show my CV' all release it)",
    /disabled: !\(dirty && editing\)/.test(src),
  );
  check(
    "3b.3 moving within the same page is never held",
    /current\.pathname !== next\.pathname/.test(src),
  );
  check(
    "3b.4 there is no second beforeunload listener beside the blocker's own",
    !/addEventListener\("beforeunload"/.test(src),
  );
  check(
    "3b.5 the question is asked in the product's own dialog: stay (default) or leave, in both languages",
    /<ConfirmAction[\s\S]{0,200}open=\{leaveBlocker\.status === "blocked"\}/.test(src) &&
      /if \(!open\) leaveBlocker\.reset\?\.\(\)/.test(src) &&
      /onConfirm=\{\(\) => leaveBlocker\.proceed\?\.\(\)\}/.test(src) &&
      /cancelLabel=\{L\(CV\.leaveStay, l\)\}/.test(src) &&
      /confirmLabel=\{L\(CV\.leaveAnyway, l\)\}/.test(src),
  );
  for (const k of ["leaveTitle", "leaveBody", "leaveStay", "leaveAnyway"] as const) {
    check(
      `3b.6 CV.${k} exists in both languages, differently`,
      Boolean(CV[k].sv) && Boolean(CV[k].en) && CV[k].sv !== CV[k].en,
    );
  }

  const blocks: [string, RegExp, "proposeFailed" | "proposalSaveFailed" | "deleteFailed"][] = [
    [
      "3c.1 a failed draft request",
      /\{propose\.isError && \(\s*<p role="alert"[^>]*>\s*\{L\(CV\.proposeFailed, l\)\}/,
      "proposeFailed",
    ],
    [
      "3c.2 a failed save of an accepted suggestion",
      /\{acceptProposal\.isError && conflict !== "changed" && \(\s*<p role="alert"[^>]*>\s*\{L\(CV\.proposalSaveFailed, l\)\}/,
      "proposalSaveFailed",
    ],
    [
      "3c.3 a failed delete",
      /\{destroy\.isError && conflict !== "changed" && \(\s*<p role="alert"[^>]*>\s*\{L\(CV\.deleteFailed, l\)\}/,
      "deleteFailed",
    ],
  ];
  for (const [label, re, key] of blocks) {
    check(`${label} is said, as an alert`, re.test(src));
    check(
      `${label}: CV.${key} exists in both languages and says nothing was changed`,
      Boolean(CV[key].sv) &&
        Boolean(CV[key].en) &&
        CV[key].sv !== CV[key].en &&
        /oförändrat|Ingenting ändrades/.test(CV[key].sv) &&
        /unchanged|Nothing changed/.test(CV[key].en),
    );
  }
  check(
    "3c.4 cancelling the delete confirmation clears its error",
    /setConfirmDelete\(false\);\s*destroy\.reset\(\);/.test(src),
  );
}

// ═══════════════════════════════════════════════════════════════════════
group("4 · a failed report-history read is not an empty history");
{
  const fns = code(read(DISCOVERY_FNS));
  const listFn = fns.slice(fns.indexOf("export const listMyDiscoveryReports"));
  const listBody = listFn;
  check(
    "4.1 the read keeps its error rather than discarding it",
    /const \{ data: rows, error \} = await ctx\.supabase/.test(listBody),
  );
  check(
    "4.2 and a failed read rejects, with a stable code and without the database's message",
    /if \(error\) \{[\s\S]{0,260}throw new DiscoveryError\("history_read_failed"\);/.test(
      listBody,
    ) && !/new DiscoveryError\([^)]*error\.message/.test(listBody),
  );
  check("4.3 the code is one of the declared ones", /\| "history_read_failed"/.test(fns));

  const route = code(read(HISTORY_ROUTE));
  check(
    "4.4 the history page catches a failed read, where it used to have no catch at all",
    /\.catch\(\(\) => mounted && setFailed\(true\)\)/.test(route) &&
      !/load\(\{\}\)\.then\(\(d\) => mounted && setData\(d\)\);/.test(route),
  );
  check(
    "4.5 and shows it as a failure with a retry, never the empty state",
    /!data && failed && \(\s*<div\s+role="alert"\s+data-history-read-failed/.test(route) &&
      /setAttempt\(\(n\) => n \+ 1\)/.test(route) &&
      /data && data\.reports\.length === 0/.test(route) &&
      !/failed && data\.reports/.test(route),
  );
  check(
    "4.6 the loading line is shown only while the read is outstanding, not after it failed",
    /!data && !failed && \(/.test(route),
  );

  const list = code(read(HISTORY_LIST));
  check(
    "4.7 the earlier-reports list no longer turns a failure into 'loaded'",
    !/setLoaded/.test(list) && /\.catch\(\(\) => alive && setStatus\("error"\)\)/.test(list),
  );
  check(
    "4.8 the empty sentence needs a read that answered",
    /if \(status === "ready" && rows\.length === 0\)/.test(list),
  );
  check(
    "4.9 the failure is an alert with a retry, and the legacy rows still render beside it",
    /status === "error" && \(\s*<div\s+role="alert"\s+data-history-read-failed/.test(list) &&
      /setStatus\("loading"\);\s*setAttempt\(\(n\) => n \+ 1\);/.test(list) &&
      /\.\.\.legacyRuns\.map/.test(list),
  );
  for (const k of ["careerDiscovery.history.error", "careerDiscovery.history.retry"]) {
    check(
      `4.10 ${k} exists in both languages, differently`,
      Boolean(sv[k]) && Boolean(en[k]) && sv[k] !== en[k],
    );
  }
  check(
    "4.11 the failure copy says the reports are not gone",
    /saknas/.test(sv["careerDiscovery.history.error"]) &&
      /gone/.test(en["careerDiscovery.history.error"]),
  );
}

// ═══════════════════════════════════════════════════════════════════════
group("5 · a profile that could not be read is not 'not filled in'");
{
  const card = code(read(PROFILE_CARD));
  check(
    "5.1 a failed read sets a state of its own",
    /\.catch\(\(err\) => \{[\s\S]{0,420}if \(alive\) setLoadFailed\(true\);/.test(card),
  );
  check(
    "5.2 it renders a retry and no way to fill the profile in",
    /data-profile-load-failed/.test(card) &&
      /role="alert"[\s\S]{0,120}sca\.scp\.loadFailed/.test(card) &&
      /sca\.scp\.retry/.test(card) &&
      /loadFailedView \?\? \(/.test(card),
  );
  check(
    "5.3 it is rendered inside the card's one #career-profile anchor, not a second one",
    (card.match(/id="career-profile"/g) ?? []).length === 1,
  );
  check(
    "5.4 the editor is never auto-opened over a profile that could not be read",
    /if \(!loaded \|\| loadFailed \|\| !editIntent \|\| autoOpened\.current\) return;/.test(card),
  );
  check(
    "5.5 retry re-reads (the load effect depends on the attempt counter)",
    /\}, \[loadAttempt\]\);/.test(card) && /setLoadAttempt\(\(n\) => n \+ 1\)/.test(card),
  );
  for (const k of ["sca.scp.loadFailed", "sca.scp.retry"]) {
    check(
      `5.6 ${k} exists in both languages, differently`,
      Boolean(sv[k]) && Boolean(en[k]) && sv[k] !== en[k],
    );
  }
  check(
    "5.7 the failure copy says the profile is not empty",
    /tom/.test(sv["sca.scp.loadFailed"]) && /empty/.test(en["sca.scp.loadFailed"]),
  );
}

// ═══════════════════════════════════════════════════════════════════════
group("6 · feedback names the page, within the schema's limit");
{
  const route = code(read(FEEDBACK_ROUTE));
  const fns = code(read(FEEDBACK_FNS));
  check("6.1 the form no longer sends document.referrer", !/document\.referrer/.test(route));
  check(
    "6.2 it sends the router's own current path, without query string or hash",
    /useRouterState\(\{ select: \(s\) => s\.location\.pathname \}\)/.test(route),
  );
  check(
    "6.3 cut to the same constant the server schema refuses above",
    /pagePath: pagePath\.slice\(0, BETA_FEEDBACK_PAGE_PATH_MAX\) \|\| null/.test(route) &&
      /\.max\(BETA_FEEDBACK_PAGE_PATH_MAX\)/.test(fns) &&
      /export const BETA_FEEDBACK_PAGE_PATH_MAX = 300;/.test(fns),
  );
}

// ═══════════════════════════════════════════════════════════════════════
group("7 · Ask Security AI is offered only when there is something to ask");
{
  const assistant = code(read(ASSISTANT));
  const button = assistant.slice(
    assistant.indexOf("export function AssistantButton"),
    assistant.indexOf("export function useAiAvailability"),
  );
  check(
    "7.1 the button reads the availability the panel itself reads",
    /const availability = useAiAvailability\(\);/.test(button),
  );
  check(
    "7.2 and renders nothing unless AI is available here, before it renders anything",
    /if \(!availability\.available\) return null;\s*return \(\s*<WorkButton/.test(button),
  );
  check(
    "7.3 'available' means enabled for this workspace AND the person can edit (a pending or failed read is not available)",
    /available: Boolean\(query\.data\?\.enabled\) && canEdit/.test(assistant),
  );
  const openers = sourceFiles()
    .filter(([f, s]) => /data-testid="sw-ai-open"/.test(s) && f !== ASSISTANT)
    .map(([f]) => f);
  check(
    "7.4 no page draws its own opener: every 'sw-ai-open' is the one gated button",
    openers.length === 0,
    openers.join(", "),
  );
  const heading = code(read("src/components/security-work/ui.tsx"));
  check(
    "7.5 a heading whose only action is the gated button leaves no empty box behind",
    /className="shrink-0 empty:hidden">\{action\}/.test(heading),
  );
  const e2e = read(SW_E2E);
  check(
    "7.6 the routed journey asserts the absence rather than clicking a button that is not there",
    /sw-ai-open"\)\)\.toHaveCount\(0\)/.test(e2e) && !/sw-ai-open"\)\.filter/.test(e2e),
  );
}

// ═══════════════════════════════════════════════════════════════════════
group("8 · /journey is retired, and its child still works");
{
  const route = code(read(JOURNEY));
  check(
    "8.1 /journey redirects to My Career, replacing the history entry",
    /throw redirect\(\{ to: "\/my-career", replace: true \}\)/.test(route),
  );
  check(
    "8.2 only for /journey itself: the child route runs beneath this one's beforeLoad",
    /location\.pathname\.replace\(\/\\\/\+\$\/, ""\) === "\/journey"/.test(route),
  );
  check(
    "8.3 the old page is gone: no component, no English-only list, no Career Card promise",
    !/component:/.test(route) &&
      !/Career Card|shareable|Saved assessment results|useQuery/.test(route),
  );
  check(
    "8.4 the child route is still there, and still a child of this one",
    exists("src/routes/_authenticated.journey.$targetId.tsx") &&
      /createFileRoute\("\/_authenticated\/journey\/\$targetId"\)/.test(
        read("src/routes/_authenticated.journey.$targetId.tsx"),
      ),
  );
  check(
    "8.5 the candidate navigation still resolves the retired path to Karriär (route id unchanged)",
    /"\/_authenticated\/journey",/.test(read("src/components/site/candidate-app-nav.ts")),
  );
}

console.log("");
if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} candidate-journey assertion(s) failed, ${passed} passed`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`ok: ${passed} candidate-journey launch assertions passed`);
