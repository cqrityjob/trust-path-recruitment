// /my-career — the candidate dashboard's shape.
//
// ── WHAT THIS DEFENDS ──────────────────────────────────────────────────
//
// The dashboard was redesigned around the Passport, jobs and the career
// profile. Three of the properties that redesign depended on are invisible in
// the code unless you go looking, and every one of them is a single class or
// a single component swap away from silently coming back:
//
//   1. A COMPLETED Career Discovery report must still be reachable. This is
//      the hard regression rule: the report is the most valuable thing a
//      candidate owns on this page and no layout change may cost them access
//      to it, or to the history behind it.
//
//   2. The Career Profile EDITOR must not be expanded on the dashboard. It
//      used to be, and because CSS grid items stretch to the tallest sibling
//      it dragged the Passport and Jobs cards to the editor's height — the
//      large empty panels the redesign removed. `items-start` and the dialog
//      are jointly load-bearing; losing either brings the holes back.
//
//   3. Role navigation must stay a question about DATA, never a role literal
//      in the client. A candidate must never see the reviewer queue.
//
// Plain TS run with Bun, matching this repository's scripts/*-check.ts
// convention.

import { readFileSync } from "node:fs";
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
const academyPath = "src/components/academy/MyAcademyWorkCard.tsx";
const headerPath = "src/components/site/SiteHeader.tsx";

const route = read(routePath);
const routeCode = code(route);
const card = read(cardPath);
const cardCode = code(card);
const academy = code(read(academyPath));
const header = code(read(headerPath));

// ---------------------------------------------------------------------------
// 1. A completed Career Discovery report stays reachable
// ---------------------------------------------------------------------------
// Each stored report contract reaches its own renderer. A contract that loses
// its renderer does not error — it renders nothing, and the candidate simply
// stops seeing a report they completed.
for (const [kind, renderer] of [
  ["discovery_v3_0", "DiscoveryCareerSummary"],
  ["discovery_v3_1", "DiscoveryV31Pending"],
  ["discovery_unreadable", "DiscoveryReportUnreadable"],
] as const) {
  expect(
    routeCode.includes(kind) && routeCode.includes(renderer),
    `${routePath}: the ${kind} report contract must still reach ${renderer}. ` +
      "A contract without a renderer costs the candidate a report they completed.",
  );
}

// The renderers must actually offer the report and the history.
const summary = code(read("src/components/career-discovery/DiscoveryCareerSummary.tsx"));
const states = code(read("src/components/career-discovery/DiscoveryReportStates.tsx"));
expect(
  summary.includes('to="/security-career-assessment/report/$snapshotId"') ||
    states.includes('to="/security-career-assessment/report/$snapshotId"'),
  "Career Discovery: a completed report must be openable from the dashboard.",
);
expect(
  summary.includes('to="/security-career-assessment/history"') &&
    states.includes('to="/security-career-assessment/history"'),
  "Career Discovery: report history must stay reachable from the dashboard.",
);
// Legacy runs keep their own history list on the route.
expect(
  routeCode.includes("ReportHistoryList"),
  `${routePath}: the legacy report history list must stay on the dashboard.`,
);
// The no-report state is a real empty state, not a missing branch.
expect(
  /\{noAssessment && \(/.test(routeCode),
  `${routePath}: the dashboard must render an explicit no-report state.`,
);

// ---------------------------------------------------------------------------
// 2. The Career Profile editor is not expanded on the dashboard
// ---------------------------------------------------------------------------
// `<Dialog ` with its open binding — NOT a bare "<Dialog" substring, which
// `<DialogContent` also satisfies. A mutation that swapped the Dialog root for
// a plain <div> and left DialogContent behind passed the looser check while
// putting the questionnaire straight back on the page.
const dialogRoot = /<Dialog\s+open=\{/.exec(cardCode);
expect(
  dialogRoot !== null && cardCode.includes("SecurityCareerProfileForm"),
  `${cardPath}: the editor must live in a real <Dialog open={...}> root, not ` +
    "inline on the dashboard.",
);
// The form must be INSIDE the dialog. Rendering it in both places would pass
// the check above while putting the questionnaire straight back on the page.
const dialogIdx = dialogRoot ? dialogRoot.index : -1;
const formIdx = cardCode.indexOf("<SecurityCareerProfileForm");
expect(
  dialogIdx !== -1 && formIdx > dialogIdx,
  `${cardPath}: the profile form must render inside the dialog, not above it.`,
);
// The default view is a summary of what the holder already told us.
expect(
  /sca\.scp\.summary\.(status|profession|experience)/.test(cardCode),
  `${cardPath}: the default state must summarise the stored profile.`,
);
expect(
  cardCode.includes("sca.scp.summary.empty"),
  `${cardPath}: a profile with nothing filled in needs a real empty state.`,
);
// No completeness score computed HERE. There is a governed definition now --
// src/lib/professional-identity/completeness.ts, versioned, weighted to
// exactly 100 and asserted by scripts/professional-identity-check.ts -- and
// it is rendered by the identity header. What must never come back is this
// card growing a second, inline one: two percentages for one profile, and
// the one nobody versioned is the one that drifts.
expect(
  !/completion|percentComplete|profileScore|\bcompleteness\b/i.test(cardCode),
  `${cardPath}: no profile-completion score may be computed here — the ` +
    "governed one lives in professional-identity/completeness.ts and is " +
    "rendered by the identity header.",
);
// The Career Profile / Security Passport boundary survives the redesign.
expect(
  card.includes("sca.scp.notPassport"),
  `${cardPath}: the Career Profile / Security Passport boundary must be stated.`,
);

// ---------------------------------------------------------------------------
// 3. The product rows do not stretch
// ---------------------------------------------------------------------------
// This is what turned one tall card into three tall cards.
const gridMatches = [...routeCode.matchAll(/className=\{?"[^"]*\bgrid\b[^"]*"/g)].map((m) => m[0]);
const productGrids = gridMatches.filter((g) => /lg:grid-cols/.test(g));
expect(productGrids.length > 0, `${routePath}: expected the dashboard product grids.`);
for (const g of productGrids) {
  expect(
    /items-start/.test(g),
    `${routePath}: every product grid must set items-start. Grid items stretch ` +
      `to the tallest sibling by default, which is where the dashboard's empty ` +
      `panels came from. Offending grid: ${g.slice(0, 90)}`,
  );
}

// ---------------------------------------------------------------------------
// 4. Employer tasks appear only when there is one
// ---------------------------------------------------------------------------
expect(
  /hasEmployerTask\s*=/.test(routeCode) && /\{hasEmployerTask && \(/.test(routeCode),
  `${routePath}: the tasks area must render only when a task exists — an ` +
    "empty assessment block on a career dashboard reads as a broken product.",
);

// ---------------------------------------------------------------------------
// 5. Assessment wording is purpose-aware
// ---------------------------------------------------------------------------
// The card can hold a recruitment assessment and a competence-development one
// at the same time, so it must not state one purpose for all of them.
expect(
  /purposeEn|purposeSv/.test(academy),
  `${academyPath}: each assessment must name its own governed purpose. The ` +
    "card used to hardcode competence development, which mislabelled every " +
    "recruitment assessment on the page.",
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
// 6. Role navigation is decided by data, not by a role literal
// ---------------------------------------------------------------------------
// The review queue is a security-invoker read: a non-reviewer gets zero rows
// and the entry never renders. That is the gate. A client-side role string
// would be a second copy of the capability rule, free to drift from the one
// the database enforces.
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
  routeCode.includes("MyReviewQueueCard"),
  `${routePath}: the self-hiding reviewer queue card must stay on the page.`,
);

// ---------------------------------------------------------------------------
// 7. Account chrome belongs to the header, not to the dashboard
// ---------------------------------------------------------------------------
// /my-career used to end on a strip carrying the whole product's account
// controls — name, email, workspace switch, sign out — because until the
// header had an account menu there was nowhere else to sign out. It read as an
// unfinished footer on an otherwise finished dashboard.
const accountMenu = code(read("src/components/site/AccountMenu.tsx"));

// The dashboard no longer signs anyone out or renders identity chrome.
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
  `${routePath}: the context switch belongs to the account menu — a second ` +
    "copy on the dashboard is the duplicate this cleanup removed.",
);

// The header genuinely provides all three, so nothing was merely deleted.
expect(
  /supabase\.auth\.signOut/.test(header) && accountMenu.includes("account.signOut"),
  `${headerPath}: the header must own sign-out. Removing the dashboard row ` +
    "without this would leave the product with no way to sign out at all.",
);
// The account menu is now the CONTEXT SWITCHER, and each organisation is
// named. "Arbetsgivaryta" told somebody who belongs to two organisations
// nothing about which one it would open, so the generic label is gone and
// the list is rendered from the rows themselves.
expect(
  /identity\.workspaces\.map\(/.test(accountMenu) && accountMenu.includes("employerName"),
  "AccountMenu must list each organisation the person belongs to BY NAME — a " +
    "single generic 'employer workspace' entry cannot say which workspace it " +
    "opens for somebody who holds two.",
);

// Gated on DATA — active memberships the database returned — never on a
// client-side role string, which would be a second copy of the rule.
expect(
  /identity\.workspaces\.length > 0 && \(/.test(accountMenu),
  "AccountMenu: the context switch must be conditional on the database having " +
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

// The switcher must never gain a second copy of the access rule. It changes
// the ROUTE; /employer/$employerSlug re-verifies membership itself.
expect(
  !/employer_memberships|has_employer_role|employer_is_active_status/.test(
    header + accountMenu,
  ),
  "The context switcher must not reimplement the membership rule in the " +
    "client — it lists what RLS returned and changes a route, nothing more.",
);

// One switcher, not several: exactly the two account surfaces (the desktop
// dropdown and the mobile sheet), and never a third copy on the dashboard.
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
    `the context switcher must render on exactly the two account surfaces ` +
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
    "(every report contract reaches its renderer; a completed report and the " +
    "history stay openable; the profile editor is behind a dialog with a real " +
    "summary and no invented score; product grids do not stretch; tasks render " +
    "only when one exists; assessment wording is purpose-aware; reviewer " +
    "navigation is gated on the queue, not a role literal; account chrome " +
    "lives in the header, with the workspace switch gated on holding one and " +
    "rendered exactly once per viewport)",
);
