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
const snapshotPath = "src/components/professional-identity/CareerSnapshot.tsx";
const workspacePath = "src/components/professional-identity/NextActions.tsx";
const modelPath = "src/lib/professional-identity/home-presentation.ts";
const headerPath = "src/components/site/SiteHeader.tsx";

const route = read(routePath);
const routeCode = code(route);
const card = read(cardPath);
const cardCode = code(card);
const snapshot = code(read(snapshotPath));
const workspace = code(read(workspacePath));
const model = code(read(modelPath));
const header = code(read(headerPath));

// ---------------------------------------------------------------------------
// 1. A completed Career Discovery report stays reachable
// ---------------------------------------------------------------------------
// Each stored report contract reaches a named state on the Career Analysis
// card. A contract that loses its branch does not error — it renders
// nothing, and the candidate simply stops seeing a report they completed.
for (const kind of ["discovery_v3_0", "discovery_v3_1", "discovery_unreadable"] as const) {
  expect(
    routeCode.includes(kind),
    `${routePath}: the ${kind} report contract must still be resolved to a card state. ` +
      "A contract without a branch costs the candidate a report they completed.",
  );
}
expect(
  routeCode.includes("/security-career-assessment/report/${activeQ.data.snapshotId}"),
  `${routePath}: a completed v3 report must be openable from the home.`,
);
expect(
  /kind: "unreadable"/.test(routeCode) && snapshot.includes('analysis.kind === "unreadable"'),
  `${snapshotPath}: a v3 report this build cannot read must be stated as unreadable, ` +
    "never degraded into 'no report'.",
);
expect(
  snapshot.includes('to="/security-career-assessment/history"'),
  `${snapshotPath}: report history must stay reachable from the home.`,
);
// Legacy runs keep their own history list on the route, and the legacy
// report keeps its own link.
expect(
  routeCode.includes("ReportHistoryList"),
  `${routePath}: the legacy report history list must stay on the home.`,
);
expect(
  routeCode.includes("/my-career/reports/${legacyRun.id}"),
  `${routePath}: a legacy report must stay openable from the home.`,
);
// The no-report state is a real state, not a missing branch, and it carries
// the gate's answer so the card can say why the test is closed.
expect(
  /kind: "none", closed: assessmentClosed/.test(routeCode),
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
// 3. Nothing stretches, and the route hosts no product grid
// ---------------------------------------------------------------------------
// Grid items stretch to the tallest sibling by default, which is where the
// old dashboard's empty panels came from. The workspace grid pins
// items-start; the route itself composes sections and owns no grid.
const workspaceGrids = [...workspace.matchAll(/className=\{?[^}]*\bgrid\b[^}]*\}?/g)].map(
  (m) => m[0],
);
expect(
  workspaceGrids.some((g) => /lg:grid-cols-12/.test(g) && /items-start/.test(g)),
  `${workspacePath}: the priority workspace grid must set items-start on its 12-column row.`,
);
expect(
  !/lg:grid-cols/.test(routeCode),
  `${routePath}: the route must not host a product grid — the sections are components.`,
);

// ---------------------------------------------------------------------------
// 4. Sections self-hide when they are irrelevant
// ---------------------------------------------------------------------------
for (const [file, guard] of [
  [
    "src/components/professional-identity/ActiveWork.tsx",
    /if \(items\.length === 0 && !children\) return null;/,
  ],
  [
    "src/components/professional-identity/RecentActivity.tsx",
    /if \(activity\.items\.length === 0 && !activity\.partial\) return null;/,
  ],
  [
    "src/components/professional-identity/ExploreAndGrow.tsx",
    /if \(items\.length === 0 && !children\) return null;/,
  ],
] as const) {
  expect(
    guard.test(code(read(file))),
    `${file}: an empty section must render nothing — an empty panel on a career home reads ` +
      "as a broken product.",
  );
}
expect(
  /presentation\.showJourney && \(/.test(routeCode),
  `${routePath}: the onboarding journey renders only for an account that has not started.`,
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
    `${retired}: retired — its facts are owned by the presentation model now. A second ` +
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
  /primary\.meta\.purposeSv/.test(workspace) && /primary\.meta\.purposeEn/.test(workspace),
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
    "(every report contract reaches a card state; a completed report and the " +
    "history stay openable; the profile editor is behind a dialog with a real " +
    "summary and no percentage; nothing stretches and the route hosts no grid; " +
    "empty sections render nothing; assessment wording is purpose-aware; the home " +
    "carries no reviewer surface and the reviewer view is gated on the queue; " +
    "account chrome lives in the header, with the workspace switch rendered " +
    "exactly once per viewport)",
);
