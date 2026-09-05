// /my-career — the candidate home's shape.
//
// ── WHAT THIS DEFENDS ──────────────────────────────────────────────────
//
// The home was restructured around ONE most-important next step. Several
// of the properties that restructure depends on are invisible in the code
// unless you go looking, and every one of them is a single class or a
// single component swap away from silently coming back:
//
//   1. A COMPLETED Career Discovery report must still be reachable. This is
//      the hard regression rule: the report is the most valuable thing a
//      candidate owns on this page and no layout change may cost them access
//      to it, or to the history behind it.
//
//   2. The Career Profile EDITOR must not be expanded on a dashboard. It
//      used to be, and because CSS grid items stretch to the tallest sibling
//      it dragged every neighbouring card to the editor's height.
//
//   3. No product panel may stretch to a sibling's height, and the route
//      itself hosts no product grid at all: the sections are components,
//      each as tall as what it contains.
//
//   4. Sections that are irrelevant self-hide rather than standing empty.
//
//   5. Role navigation must stay a question about DATA, never a role literal
//      in the client -- and a candidate's home must never carry a reviewer
//      surface: the reviewer view is reached from the account menu.
//
//   6. Account chrome belongs to the header, not to the dashboard.
//
// Plain TS run with Bun, matching this repository's scripts/*-check.ts
// convention.

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const errors: string[] = [];
function expect(condition: boolean, message: string): void {
  if (!condition) errors.push(message);
}

const root = path.resolve(import.meta.dir, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

/** Comments in these files DISCUSS the classes and copy they are about, so a
 *  naive scan reads prose as code. */
function code(src: string): string {
  return src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const routePath = "src/routes/_authenticated.my-career.index.tsx";
const cardPath = "src/components/assessment/SecurityCareerProfileCard.tsx";
const snapshotPath = "src/components/professional-identity/CareerDirectionSection.tsx";
const workspacePath = "src/components/professional-identity/NextBestAction.tsx";
const modelPath = "src/lib/professional-identity/home-presentation.ts";
const directionPath = "src/lib/professional-identity/career-direction.ts";
const headerPath = "src/components/site/SiteHeader.tsx";

const route = read(routePath);
const routeCode = code(route);
const card = read(cardPath);
const cardCode = code(card);
const snapshot = code(read(snapshotPath));
const workspace = code(read(workspacePath));
const model = code(read(modelPath));
const direction = code(read(directionPath));
const header = code(read(headerPath));

// ---------------------------------------------------------------------------
// 1. A completed career analysis stays reachable, whichever instrument
//    produced it
// ---------------------------------------------------------------------------
// Every stored report contract reaches a NAMED state on the career section.
// A contract that loses its branch does not error — it renders nothing, and
// the candidate simply stops seeing a result they completed. Worse, the
// identity seam only knows about cd_report_snapshots, so a candidate whose
// only assessment is v2.1 looks report-less to it: `legacy_v21` is the
// branch that stops the home telling them they never took one.
for (const kind of ["legacy_v21", "discovery_unreadable"] as const) {
  expect(
    model.includes(kind),
    `${modelPath}: the ${kind} report contract must still reach a named career state. ` +
      "A contract without a branch costs the candidate a result they completed.",
  );
}
// v3.0 stores career AREAS and axis strengths; v3.1 stores the ranked
// occupational recommendation. They share no field name, so each is read by
// its own branch and neither may quietly answer for the other.
expect(
  direction.includes('result.status === "v3.0"'),
  `${directionPath}: the v3.0 report contract must still be read on its own terms.`,
);
expect(
  /snapshot\?\.professions\?\.ranked/.test(direction),
  `${directionPath}: the v3.1 recommendation must be READ from the frozen snapshot, ` +
    "never recomputed — a dashboard that recomputes eventually disagrees with the report.",
);
expect(
  direction.includes("/security-career-assessment/report/${result.snapshotId}"),
  `${directionPath}: a completed v3 report must be openable from the home.`,
);
expect(
  /state: "unreadable"/.test(model) && snapshot.includes('career.state === "unreadable"'),
  `${snapshotPath}: a v3 report this build cannot read must be stated as unreadable, ` +
    "never degraded into 'no report'.",
);
expect(
  snapshot.includes('to="/security-career-assessment/history"'),
  `${snapshotPath}: report history must stay reachable from the home.`,
);
// Legacy runs keep their own history list, now inside the career section
// rather than as a full-width panel that rendered empty for everybody with a
// single report.
expect(
  routeCode.includes("ReportHistoryList") && /runsQ\.data\.length > 1 && \(/.test(routeCode),
  `${routePath}: earlier legacy reports must stay reachable, and only when there are any.`,
);
expect(
  model.includes("/my-career/reports/${active.runId}"),
  `${modelPath}: a legacy report must stay openable from the home.`,
);
// The no-report state is a real state, not a missing branch, and the section
// carries the gate's answer so it can say why the analysis is closed.
expect(
  /state: "none"/.test(model) && /closed=\{assessmentClosed\}/.test(routeCode),
  `${routePath}: the home must resolve an explicit no-report state carrying the gate.`,
);

// ---------------------------------------------------------------------------
// 2. The Career Profile editor is not expanded on a dashboard
// ---------------------------------------------------------------------------
// `<Dialog ` with its open binding — NOT a bare "<Dialog" substring, which
// `<DialogContent` also satisfies.
const dialogRoot = /<Dialog\s+open=\{/.exec(cardCode);
expect(
  dialogRoot !== null && cardCode.includes("SecurityCareerProfileForm"),
  `${cardPath}: the editor must live in a real <Dialog open={...}> root, not ` +
    "inline on the dashboard.",
);
const dialogIdx = dialogRoot ? dialogRoot.index : -1;
const formIdx = cardCode.indexOf("<SecurityCareerProfileForm");
expect(
  dialogIdx !== -1 && formIdx > dialogIdx,
  `${cardPath}: the profile form must render inside the dialog, not above it.`,
);
expect(
  /sca\.scp\.summary\.(status|profession|experience)/.test(cardCode),
  `${cardPath}: the default state must summarise the stored profile.`,
);
expect(
  cardCode.includes("sca.scp.summary.empty"),
  `${cardPath}: a profile with nothing filled in needs a real empty state.`,
);
// No completeness score computed HERE. The governed one lives in
// professional-identity/completeness.ts; the home states "Grundprofil
// komplett" from it and never a percentage.
expect(
  !/completion|percentComplete|profileScore|\bcompleteness\b/i.test(cardCode),
  `${cardPath}: no profile-completion score may be computed here.`,
);
expect(
  !/% ifyllt|% filled in/.test(routeCode + workspace + snapshot),
  `${routePath}: the home must not print a profile percentage — "Grundprofil komplett" is the only ` +
    "completion statement it makes.",
);
// The Career Profile / Security Passport boundary survives the redesign.
expect(
  card.includes("sca.scp.notPassport"),
  `${cardPath}: the Career Profile / Security Passport boundary must be stated.`,
);

// ---------------------------------------------------------------------------
// 3. One layout row, and it is the one above the fold
// ---------------------------------------------------------------------------
// The recommended next step and the Security Passport share the top of the
// page on desktop, and that ONE row is the only grid the route owns. Every
// other section is a component that lays itself out, which is what stopped
// the route growing a product grid full of half-empty panels.
const routeGrids = [...routeCode.matchAll(/lg:grid-cols-12/g)];
expect(
  routeGrids.length === 1,
  `${routePath}: exactly one 12-column row — the above-the-fold pair. Found ${routeGrids.length}.`,
);
expect(
  /grid items-stretch gap-4 lg:grid-cols-12/.test(routeCode),
  `${routePath}: the above-the-fold pair must stretch to equal height rather than ` +
    "leaving one card floating beside a taller sibling.",
);
// Source order IS mobile order: one column at 375, the recommendation first
// and the Passport second. A CSS reordering would make the two disagree.
expect(
  routeCode.indexOf("<NextBestAction") < routeCode.indexOf("<PassportSummary"),
  `${routePath}: the recommended next step must precede the Passport in source order, ` +
    "so the single mobile column shows it first.",
);
expect(
  !/order-\d|lg:order-/.test(routeCode),
  `${routePath}: no CSS reordering — source order and reading order must agree.`,
);

// ---------------------------------------------------------------------------
// 4. Sections self-hide, and no empty container is rendered
// ---------------------------------------------------------------------------
for (const [file, guard] of [
  [
    "src/components/professional-identity/RecentActivity.tsx",
    /if \(activity\.items\.length === 0 && !activity\.partial\) return null;/,
  ],
  [
    "src/components/professional-identity/CareerTools.tsx",
    /if \(tools\.length === 0\) return null;/,
  ],
] as const) {
  expect(
    guard.test(code(read(file))),
    `${file}: an empty section must render nothing — an empty panel on a career home reads ` +
      "as a broken product.",
  );
}
// The full-width "Alla mina rapporter" panel rendered as a large empty box on
// every account with a single report. It is gone; earlier analyses are a
// compact disclosure inside the section that is about them.
expect(
  !/EXPLORE\.allReports|Alla mina rapporter/.test(
    routeCode + code(read("src/components/professional-identity/home-copy.ts")),
  ),
  `${routePath}: the standalone "all my reports" panel must not come back.`,
);
// The five-stage onboarding strip is gone: the lifecycle is preserved as the
// page's ORDER, not rendered as a checklist.
expect(
  !/showJourney|CareerJourney/.test(routeCode),
  `${routePath}: the lifecycle must not be rendered as a linear checklist.`,
);
expect(
  /linkableTasks\.length > 0 && \(/.test(routeCode),
  `${routePath}: the link-an-earlier-result strip renders only when there is something to link.`,
);
// The retired cards must not come back as mounted surfaces.
for (const retired of [
  "src/components/academy/MyAcademyWorkCard.tsx",
  "src/components/academy/MyReviewQueueCard.tsx",
  "src/components/security-passport/PassportSummaryCard.tsx",
]) {
  expect(
    !existsSync(path.join(root, retired)),
    `${retired}: retired — its facts are owned by the view model now. A second ` +
      "surface for the same status is the duplication the home was rebuilt to remove.",
  );
}

// ---------------------------------------------------------------------------
// 5. Assessment wording is purpose-aware
// ---------------------------------------------------------------------------
// The primary card can announce a recruitment assessment or a competence-
// development one, so it must state the row's own governed purpose rather
// than one purpose for all of them.
expect(
  /purposeSv: row\.purposeSv/.test(model) && /purposeEn: row\.purposeEn/.test(model),
  `${modelPath}: the primary card's metadata must carry the attempt's own governed purpose.`,
);
expect(
  /next\.meta\.purposeSv/.test(workspace) && /next\.meta\.purposeEn/.test(workspace),
  `${workspacePath}: the primary card must state the attempt's own purpose, per attempt.`,
);
{
  const dict = read("src/i18n/dictionaries.ts");
  const ledeSv = dict.match(/"academy\.myWork\.lede":\s*\n?\s*"([^"]*)"/)?.[1] ?? "";
  expect(
    !/kompetensutveckling/i.test(ledeSv),
    "academy.myWork.lede must not name competence development — it is shown " +
      "above recruitment assessments too.",
  );
}

// ---------------------------------------------------------------------------
// 6. Role navigation is decided by data, and the home stays personal
// ---------------------------------------------------------------------------
expect(
  header.includes("countMyReviewQueue") && /reviewCount > 0/.test(header),
  `${headerPath}: the reviewer entry must be gated on the review-queue count, ` +
    "so a candidate with no reviewable work never sees reviewer navigation.",
);
expect(
  !/isReviewer|hasReviewerRole|role === "reviewer"|role === "admin"/.test(header),
  `${headerPath}: role navigation must not be gated on a client-side role ` +
    "literal — the database capability is the only gate.",
);
expect(
  !/MyReviewQueueCard|\/reviews|listReviewQueue|countMyReviewQueue/.test(routeCode),
  `${routePath}: the candidate home carries no reviewer surface — the reviewer view is ` +
    "reached from the account menu's workspace switch.",
);
const accountMenu = code(read("src/components/site/AccountMenu.tsx"));
expect(
  /identity\.reviewQueueCount > 0 && \(/.test(accountMenu) && accountMenu.includes('to="/reviews"'),
  "AccountMenu must expose the reviewer view, gated on the queue the database returned.",
);
expect(
  /reviewQueueCount: reviewCount/.test(header),
  `${headerPath}: the header hands the queue count to the account menu.`,
);

// ---------------------------------------------------------------------------
// 7. Account chrome belongs to the header, not to the dashboard
// ---------------------------------------------------------------------------
expect(
  !/supabase\.auth\.signOut/.test(routeCode),
  `${routePath}: sign-out belongs to the header account menu, not to a page.`,
);
expect(
  !/account\.signOut|"Logga ut"|"Sign out"/.test(routeCode),
  `${routePath}: no sign-out control may render on the dashboard.`,
);
expect(
  !/employer\.workspace\.label|account\.context\.switchTo/.test(routeCode),
  `${routePath}: the workspace switch belongs to the account menu — a second ` +
    "copy on the dashboard is the duplicate this cleanup removed.",
);
expect(
  /supabase\.auth\.signOut/.test(header) && accountMenu.includes("account.signOut"),
  `${headerPath}: the header must own sign-out.`,
);
// The account menu is the WORKSPACE SWITCHER, and each organisation is named
// and typed: "PT-M AB – Arbetsgivare".
expect(
  /identity\.workspaces\.map\(/.test(accountMenu) &&
    accountMenu.includes("employerName") &&
    accountMenu.includes("account.context.employer"),
  "AccountMenu must list each organisation the person belongs to BY NAME and as an employer.",
);
expect(
  /identity\.workspaces\.length > 0 && \(/.test(accountMenu),
  "AccountMenu: the organisation list must be conditional on the database having " +
    "returned at least one workspace.",
);
expect(
  header.includes("listMyEmployerWorkspaces") && /workspaces\.data \?\? \[\]/.test(header),
  `${headerPath}: employer access must be decided by listMyEmployerWorkspaces, ` +
    "not by a role literal in the client.",
);
expect(
  !/isEmployer|hasEmployerRole|role === "employer"/.test(header + accountMenu),
  "Employer access must not be inferred from a client-side role literal.",
);
expect(
  !/employer_memberships|has_employer_role|employer_is_active_status/.test(header + accountMenu),
  "The workspace switcher must not reimplement the membership rule in the " +
    "client — it lists what RLS returned and changes a route, nothing more.",
);
{
  const surfaces = [
    ["SiteHeader", header],
    ["AccountMenu", accountMenu],
    ["my-career route", routeCode],
  ] as const;
  const total = surfaces.reduce(
    (n, [, src]) => n + (src.split("account.context.switchTo").length - 1),
    0,
  );
  expect(
    total === 2,
    `the workspace switcher must render on exactly the two account surfaces ` +
      `(desktop menu + mobile sheet), found ${total} use(s) of ` +
      "account.context.switchTo across the header, the menu and the dashboard.",
  );
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (errors.length > 0) {
  console.error(`my-career-dashboard:check FAILED (${errors.length} issue(s)):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  "my-career-dashboard:check OK " +
    "(every report contract reaches a named career state, legacy included; a " +
    "completed report and the history stay openable; the profile editor is behind " +
    "a dialog with a real summary and no percentage; the route owns one layout row " +
    "and source order is mobile order; empty sections render nothing and the " +
    "all-reports panel is gone; assessment wording is purpose-aware; the home " +
    "carries no reviewer surface and the reviewer view is gated on the queue; " +
    "account chrome lives in the header, with the workspace switch rendered " +
    "exactly once per viewport)",
);
