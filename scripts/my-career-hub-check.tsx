// The My Career hub — asserted against the RENDERED markup and against the
// router's own route table.
//
// ── WHAT THIS DEFENDS ──────────────────────────────────────────────────
//
// Before #211 the candidate's career was one page nine sections tall. Every
// area was on it, in full, and the only way to reach the CV was to scroll
// 1425px into a list called "Karriärverktyg"; sharing was not on the page
// at all, in either language, at any width. The destinations all existed.
// Nothing said so.
//
// The hub is the correction, and every property below is one careless edit
// from being undone, none of which a type checker can see:
//
//   1. SIX areas, each exactly once, in the agreed order, and each one a
//      route the router actually generated. A tab pointing at an invented
//      path is a dead end wearing a product name.
//
//   2. Current location survives NESTING and resolves by LONGEST match.
//      /passport/share must mark Sharing and not Security Passport, even
//      though the second is a prefix of the first; /my-career/cv/new must
//      mark CV; /my-career/reports/$runId must mark the career analysis.
//
//   3. Current location is never colour alone: aria-current, a weight
//      change and a rule.
//
//   4. NOTHING is marked current when nothing is. /my-career/profile and
//      /my-career/career-card are inside the shell and belong to none of
//      the six; lighting a tab the reader is not standing on is worse than
//      lighting none.
//
//   5. FOUR VISIBLY DIFFERENT NON-CONTENT STATES per module. Loading,
//      empty, unavailable and ready collapsing into one another is the
//      defect this product has fixed twice already at section scale; a
//      module is where it would come back.
//
//   6. ONE primary action per module, pointing at the area's CANONICAL
//      page, and the action CHANGES with the state — an empty CV module
//      offers "create my first CV" and a populated one offers "open my
//      CVs".
//
//   7. NO CARD IS SECRETLY A LINK, and no link is secretly disabled. The
//      module box carries no href and no click handler; the refusal states
//      render no control at all rather than a dead-looking one.
//
//   8. THE CLOSED GATE IS HONOURED. Career Discovery answers to a tester
//      allowlist. A module that offered "take the career analysis" to
//      somebody the route will refuse is the exact dead door
//      my-career-gate:check was written for, one level down.
//
//   9. Swedish and English are authored together and neither is missing.
//
// ── WHY IT RENDERS, AND WHY IT READS THE ROUTE TABLE ───────────────────
//
// Rendered, because every property above is a property of what somebody
// SEES; a rule that holds while the component renders nothing passes a
// source scan and fixes nothing. Against routeTree.gen.ts, because "this
// tab resolves" is a claim about the router, and the router already wrote
// it down.
//
// I18nProvider starts at "sv" on the server, so Swedish is asserted from
// markup and English from the copy tables — the same constraint and the
// same split as candidate-app-navigation-check.
//
// Run: bun run my-career-hub:check

import { readFileSync } from "node:fs";
import path from "node:path";
import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Same substitute, and for the same reason, as candidate-app-navigation-
// check: <Link> needs a live router and does not render synchronously
// under renderToStaticMarkup. `search` is resolved into a real query
// string so an href proved here is the href a candidate clicks.
await mock.module("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    search,
    children,
    ...rest
  }: Record<string, unknown> & { children?: React.ReactNode }) => {
    let href = String(to ?? "");
    if (params && typeof params === "object") {
      for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
        href = href.replace(`$${k}`, String(v));
      }
    }
    if (search && typeof search === "object") {
      const q = new URLSearchParams(
        Object.entries(search as Record<string, unknown>).map(([k, v]) => [k, String(v)]),
      ).toString();
      if (q) href = `${href}?${q}`;
    }
    return React.createElement("a", { href, ...rest }, children);
  },
  createFileRoute: () => () => ({}),
}));

const { I18nProvider } = await import("../src/i18n/context");
const { MyCareerHubNav } = await import("../src/components/professional-identity/MyCareerHubNav");
const { HubStatusGrid } = await import("../src/components/professional-identity/HubStatusGrid");
const { MY_CAREER_HUB, resolveHubSection } =
  await import("../src/lib/professional-identity/hub-sections");
const { HUB, HUB_TILE } = await import("../src/components/professional-identity/home-copy");
const { matchesRouteId } = await import("../src/components/site/candidate-app-nav");

type Lang = "sv" | "en";
type Copy = { readonly sv: string; readonly en: string };

const fails: string[] = [];
function ck(name: string, ok: boolean, detail?: string): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) fails.push(name);
}
function group(name: string): void {
  console.log(`\n${name}`);
}

const root = path.resolve(import.meta.dir, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
/** Comments DISCUSS the copy they are about, so a naive scan reads prose
 *  as code — the same stripper candidate-app-navigation-check uses. */
const code = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const render = (el: React.ReactElement): string =>
  renderToStaticMarkup(React.createElement(I18nProvider, null, el));

/** Every route id the router actually generated. Read from FileRoutesById
 *  specifically: routeTree.gen.ts declares three parallel maps, and mixing
 *  URL PATHS in with ROUTE IDS asserts a mapping for routes that will
 *  never be reported. */
const ROUTE_IDS: string[] = (() => {
  const src = read("src/routeTree.gen.ts");
  const start = src.indexOf("export interface FileRoutesById {");
  if (start < 0) throw new Error("FileRoutesById not found in routeTree.gen.ts");
  const block = src.slice(start, src.indexOf("\n}", start));
  return Array.from(block.matchAll(/^ {2}'(\/[^']*)': typeof /gm)).map((m) => m[1]!);
})();

const hrefsIn = (html: string) => Array.from(html.matchAll(/href="([^"]*)"/g)).map((m) => m[1]!);

/* ------------------------------------------------------------------ */
/* 1 · Six areas, once each, named, in order                           */
/* ------------------------------------------------------------------ */

group("1 · six areas, once each, in the candidate's order");
{
  // Overview first because it is where somebody lands; Security Passport
  // second because it is the product this company is built on; CV, the
  // career analysis and applications in the order a candidate produces
  // them; Sharing last because it is what you do once there is something
  // worth sharing.
  const EXPECTED: { key: string; to: string; sv: string; en: string }[] = [
    { key: "overview", to: "/my-career", sv: "Översikt", en: "Overview" },
    { key: "passport", to: "/passport", sv: "Security Passport", en: "Security Passport" },
    { key: "cv", to: "/my-career/cv", sv: "CV", en: "CV" },
    {
      key: "discovery",
      to: "/security-career-assessment",
      sv: "Karriäranalys",
      en: "Career analysis",
    },
    { key: "applications", to: "/my-career/applications", sv: "Ansökningar", en: "Applications" },
    { key: "sharing", to: "/passport/share", sv: "Delning", en: "Sharing" },
  ];

  ck(
    "the hub is exactly six areas, in the agreed order",
    MY_CAREER_HUB.map((s) => s.key).join(",") === EXPECTED.map((e) => e.key).join(","),
    MY_CAREER_HUB.map((s) => s.key).join(","),
  );

  const html = render(React.createElement(MyCareerHubNav, { activeKey: "overview" }));
  const hrefs = hrefsIn(html);
  ck("exactly six links", hrefs.length === 6, String(hrefs.length));
  ck(
    "the six destinations, in order",
    hrefs.join(",") === EXPECTED.map((e) => e.to).join(","),
    hrefs.join(","),
  );
  for (const e of EXPECTED) {
    ck(`"${e.sv}" appears exactly once`, html.split(`>${e.sv}<`).length - 1 === 1);
    ck(`${e.to} is linked exactly once`, hrefs.filter((h) => h === e.to).length === 1);
    const section = MY_CAREER_HUB.find((s) => s.key === e.key)!;
    ck(`sv "${e.key}" reads "${e.sv}"`, (HUB.sections as Record<string, Copy>)[e.key]!.sv === e.sv);
    ck(`en "${e.key}" reads "${e.en}"`, (HUB.sections as Record<string, Copy>)[e.key]!.en === e.en);
    ck(`${e.key} points at ${e.to}`, section.to === e.to);
  }
  ck("it is a real <nav>", html.startsWith("<nav "));
  ck("the nav is labelled", /aria-label="[^"]+"/.test(html));

  // Every destination must be a route the router generated. The Career
  // Discovery entry is the one that would break silently: it comes from a
  // constant, and a constant can be repointed at an alias.
  for (const section of MY_CAREER_HUB) {
    for (const prefix of section.routeIds) {
      ck(
        `${section.key}: "${prefix}" matches at least one generated route`,
        ROUTE_IDS.some((id) => matchesRouteId(id, prefix)),
      );
    }
  }
}

/* ------------------------------------------------------------------ */
/* 2 · Current location: nesting, longest match, and null              */
/* ------------------------------------------------------------------ */

group("2 · current location survives nesting and resolves by longest match");
{
  const CASES: [string, string | null][] = [
    ["/_authenticated/my-career/", "overview"],
    ["/_authenticated/my-career/cv/", "cv"],
    ["/_authenticated/my-career/cv/new", "cv"],
    ["/_authenticated/my-career/cv/$cvId", "cv"],
    ["/_authenticated/my-career/applications", "applications"],
    ["/_authenticated/my-career/reports/$runId", "discovery"],
    ["/_authenticated/security-career-assessment/session", "discovery"],
    ["/security-career-assessment", "discovery"],
    ["/_authenticated/passport/", "passport"],
    ["/_authenticated/passport/information", "passport"],
    ["/_authenticated/passport/entry/$kind/$entryId", "passport"],
    // THE longest-match case. "/_authenticated/passport" is a prefix of
    // this, and the array lists it first — order must not decide.
    ["/_authenticated/passport/share", "sharing"],
    // Inside the shell, belonging to none of the six.
    ["/_authenticated/my-career/profile", null],
    ["/_authenticated/my-career/career-card", null],
    // The employer's attestation desk lives under the Passport's NAME and
    // must not light the holder's Passport. A bare startsWith gets this
    // wrong; the segment boundary is what does it.
    ["/_authenticated/passport-attestations", null],
  ];
  for (const [routeId, expected] of CASES) {
    ck(`${routeId} → ${expected ?? "nothing"}`, resolveHubSection([routeId]) === expected);
    ck(`${routeId} is a real route`, ROUTE_IDS.includes(routeId));
  }

  // ── THE ROUTER MUST NOT DISAGREE WITH THE TABLE ───────────────────
  //
  // <Link> appends its own aria-current LAST on any URL it considers
  // active, and matches by PREFIX by default; it is pinned to exact, which
  // reduces its opinion to "the URL is literally this href". This proves
  // the only case that then survives is one where the two already agree:
  // each tab's OWN destination must resolve to that tab.
  //
  // Resolved from the whole MATCH CHAIN, not from one id. /my-career is a
  // layout route with an index beneath it, so the router reports BOTH
  // "/_authenticated/my-career" and "/_authenticated/my-career/" — and the
  // layout id alone resolves to nothing by design, because the layout is
  // not a destination. Asserting against a single id would have been
  // asserting against a state the router never produces.
  const chainFor = (to: string) =>
    ROUTE_IDS.filter((id) => {
      const asPath = id.replace(/^\/_authenticated/, "").replace(/\/+$/, "") || "/";
      return asPath === to;
    });
  for (const section of MY_CAREER_HUB) {
    const chain = chainFor(section.to);
    ck(`${section.key}: its destination is a generated route`, chain.length > 0, section.to);
    ck(
      `${section.key}: its own match chain resolves to ${section.key}`,
      resolveHubSection(chain) === section.key,
      chain.join(" + "),
    );
  }

  // ── AND THE CHAINS THE ROUTER ACTUALLY REPORTS ────────────────────
  //
  // Every real navigation carries its ancestors. These are the full chains
  // for the four cases where an ancestor could win and must not.
  const CHAINS: [string, string[], string | null][] = [
    [
      "/my-career",
      ["/_authenticated", "/_authenticated/my-career", "/_authenticated/my-career/"],
      "overview",
    ],
    [
      "/my-career/cv/new",
      [
        "/_authenticated",
        "/_authenticated/my-career",
        "/_authenticated/my-career/cv",
        "/_authenticated/my-career/cv/new",
      ],
      "cv",
    ],
    [
      "/my-career/profile",
      ["/_authenticated", "/_authenticated/my-career", "/_authenticated/my-career/profile"],
      null,
    ],
    [
      "/passport/share",
      ["/_authenticated", "/_authenticated/passport", "/_authenticated/passport/share"],
      "sharing",
    ],
  ];
  for (const [url, chain, expected] of CHAINS) {
    ck(`chain for ${url} → ${expected ?? "nothing"}`, resolveHubSection(chain) === expected);
    for (const id of chain) ck(`${id} is a real route`, ROUTE_IDS.includes(id));
  }
  ck(
    "the router's own matching is pinned to exact",
    read("src/components/professional-identity/MyCareerHubNav.tsx").includes(
      "activeOptions={{ exact: true }}",
    ),
  );
}

/* ------------------------------------------------------------------ */
/* 3 · The current tab is announced, weighted and ruled                */
/* ------------------------------------------------------------------ */

group("3 · the current tab is never colour alone");
{
  const html = render(React.createElement(MyCareerHubNav, { activeKey: "sharing" }));
  ck('exactly one aria-current="page"', html.split('aria-current="page"').length - 1 === 1);
  ck(
    "it is on the tab that is current",
    /<a[^>]*href="\/passport\/share"[^>]*aria-current="page"/.test(html) ||
      /<a[^>]*aria-current="page"[^>]*href="\/passport\/share"/.test(html),
  );
  const activeTag = html.split("<a ").find((chunk) => chunk.includes('aria-current="page"'))!;
  ck("the current tab is weighted", activeTag.includes("font-semibold"));
  ck("the current tab carries a rule, not just a colour", activeTag.includes("border-accent"));

  const none = render(React.createElement(MyCareerHubNav, { activeKey: null }));
  ck("nothing is marked current when nothing is", !none.includes('aria-current="page"'));
  ck("all six are still offered when none is current", hrefsIn(none).length === 6);

  // Six labels do not fit one 375px line. It wraps; it does not scroll.
  // A scrolling strip hides destinations behind a gesture with no
  // affordance, which is this hub's own defect at a smaller scale.
  const nav = read("src/components/professional-identity/MyCareerHubNav.tsx");
  ck("the strip wraps rather than scrolling sideways", code(nav).includes("flex-wrap"));
  ck("no horizontal scroll container", !/overflow-x/.test(code(nav)));
  ck("every tab is a 44px target", code(nav).includes("h-11"));
  ck("focus is visible", /focus-visible:outline/.test(code(nav)));
}

/* ------------------------------------------------------------------ */
/* 4 · Four modules, four states each, one action each                 */
/* ------------------------------------------------------------------ */

group("4 · each module's four states are four different renders");
{
  const CAREER_READY = {
    state: "ready" as const,
    completedAt: "2026-08-20T09:00:00Z",
    reportHref: "/security-career-assessment/report/snap-1",
    topRole: {
      rank: 1,
      titleSv: "Säkerhetssamordnare",
      titleEn: "Security coordinator",
      cigSlug: "sakerhetssamordnare",
      confidence: "supported" as const,
    },
    alternativeRoles: [],
    strengthThemes: [],
    frozenLocale: "sv" as const,
  };

  const grid = (over: Record<string, unknown> = {}) =>
    render(
      React.createElement(HubStatusGrid, {
        cv: { state: "none" },
        career: { state: "none" },
        careerClosed: false,
        careerJobsFamilyId: null,
        applications: {
          state: "ready",
          activeCount: 0,
          latestActive: null,
          concludedCount: 0,
          interviewCount: 0,
        },
        sharing: { state: "none" },
        onRetryCv: () => {},
        onRetryCareer: () => {},
        onRetryApplications: () => {},
        onRetrySharing: () => {},
        ...over,
      } as never),
    );

  const empty = grid();
  for (const key of ["cv", "discovery", "applications", "sharing"]) {
    ck(
      `${key}: the module is rendered`,
      empty.includes(`data-hub-module="${key}"`) &&
        empty.split(`data-hub-module="${key}"`).length - 1 === 1,
    );
  }

  // ── THE FOUR STATES ARE FOUR RENDERS ───────────────────────────────
  //
  // Asserted per module rather than once, because the way this fails is
  // one module losing a branch while the other three keep theirs.
  const loading = grid({
    cv: { state: "loading" },
    career: { state: "loading" },
    applications: { state: "loading" },
    sharing: { state: "loading" },
  });
  const failed = grid({
    cv: { state: "unavailable" },
    career: { state: "unavailable" },
    applications: { state: "unavailable" },
    sharing: { state: "unavailable" },
  });
  const ready = grid({
    cv: {
      state: "ready",
      count: 2,
      latest: { cvId: "cv-1", title: "Väktare – Nordvakt AB", updatedAt: "2026-09-03T11:20:00Z" },
    },
    career: CAREER_READY,
    careerJobsFamilyId: "guarding",
    applications: {
      state: "ready",
      activeCount: 2,
      latestActive: {
        id: "a1",
        jobTitleSv: "Väktare, Stockholm",
        jobTitleEn: "Security officer, Stockholm",
        employerName: "Nordväkt AB",
        status: "reviewing",
        updatedAt: "2026-09-03T09:00:00Z",
      },
      concludedCount: 0,
      interviewCount: 0,
    },
    sharing: { state: "ready", activeCount: 1, nextExpiryAt: "2026-10-01T09:00:00Z" },
  });

  ck("loading is announced and is a skeleton", loading.split("data-hub-loading").length - 1 === 4);
  ck("loading says nothing about having none", !loading.includes("Du har inget sparat CV"));
  ck("loading is not an error", !loading.includes('role="alert"'));
  ck("a failed read is an alert with a retry", failed.split("data-failed").length - 1 === 4);
  ck("a failed read offers a way to run it again", failed.split("data-retry").length - 1 === 4);
  ck("a failed read never says the thing does not exist", !failed.includes("Du har inget"));
  ck("a failed read never says zero", !/>0</.test(failed));
  ck(
    "empty is a sentence about absence, not a failure",
    empty.includes("Du har inget sparat CV") && !empty.includes('role="alert"'),
  );
  ck(
    "ready names what is there",
    ready.includes("2 sparade CV") && ready.includes("Väktare – Nordvakt AB"),
  );
  ck("ready names the analysis result", ready.includes("Säkerhetssamordnare"));
  ck("ready counts the active applications", ready.includes("2 aktiva ansökningar"));
  ck("ready counts the ACTIVE share links only", ready.includes("1 aktiv delningslänk"));

  // ── ONE ACTION PER MODULE, AND IT CHANGES WITH THE STATE ───────────
  ck("empty: exactly four primary actions", empty.split("data-hub-go").length - 1 === 4);
  ck("ready: exactly four primary actions", ready.split("data-hub-go").length - 1 === 4);
  ck(
    "empty CV offers the creator, populated CV offers the list",
    empty.includes('href="/my-career/cv/new"') &&
      !empty.includes('href="/my-career/cv"') &&
      ready.includes('href="/my-career/cv"') &&
      !ready.includes('href="/my-career/cv/new"'),
  );
  ck(
    "no applications at all offers jobs; some applications offers the list",
    empty.includes('href="/jobs"') && ready.includes('href="/my-career/applications"'),
  );
  ck(
    "empty sharing offers the share screen, and so does populated sharing",
    empty.split('href="/passport/share"').length - 1 === 1 &&
      ready.split('href="/passport/share"').length - 1 === 1,
  );
  ck("ready opens the frozen report by its own href", ready.includes(CAREER_READY.reportHref));

  // A failed read renders NO control at all — never a dead-looking one.
  ck("a failed module offers no primary action", !failed.includes("data-hub-go"));

  // ── NO CARD IS SECRETLY A LINK ─────────────────────────────────────
  //
  // The <section> that is the module box must carry no href, and every
  // href on the page must be inside a real <a>.
  const moduleTags = Array.from(ready.matchAll(/<section[^>]*data-hub-module[^>]*>/g)).map(
    (m) => m[0]!,
  );
  ck("four module boxes", moduleTags.length === 4);
  ck(
    "no module box is itself a link",
    moduleTags.every((t) => !/href=|onclick=/i.test(t)),
  );
  ck(
    "no control is rendered disabled",
    !/disabled|aria-disabled="true"|pointer-events-none/.test(ready),
  );

  // Every destination the grid can produce must be a real route.
  const DESTINATIONS = [...new Set([...hrefsIn(empty), ...hrefsIn(ready)])];
  ck("the grid produced destinations to check", DESTINATIONS.length >= 6);
  for (const href of DESTINATIONS) {
    const bare = href.split("?")[0]!.replace(/\/+$/, "") || "/";
    const resolves = ROUTE_IDS.some(
      (id) =>
        id.replace(/^\/_authenticated/, "").replace(/\/+$/, "") === bare ||
        // A parameterised route: /security-career-assessment/report/snap-1
        // is generated as .../report/$snapshotId.
        new RegExp(
          `^${id
            .replace(/^\/_authenticated/, "")
            .replace(/\/+$/, "")
            .replace(/\$[A-Za-z0-9_]+/g, "[^/]+")}$`,
        ).test(bare),
    );
    ck(`${href} resolves to a generated route`, resolves);
  }

  // ── THE GATE ──────────────────────────────────────────────────────
  const closed = grid({ careerClosed: true });
  ck(
    "a closed career analysis says so and offers no door",
    closed.includes("inte öppen för nya deltagare") &&
      !closed.includes('href="/security-career-assessment"'),
  );
  ck(
    "an open career analysis does offer the door",
    empty.includes('href="/security-career-assessment"'),
  );

  // ── A RESULT THAT EXISTS IS NEVER "NOT TAKEN YET" ─────────────────
  const unreadable = grid({ career: { state: "unreadable", completedAt: "2026-01-01T00:00:00Z" } });
  ck(
    "an unreadable result is not reported as no result",
    unreadable.includes("kan inte visas i den här versionen") &&
      !unreadable.includes("Du har inte gjort karriäranalysen ännu"),
  );

  // ── CONCLUDED APPLICATIONS ARE NOT "NONE" ─────────────────────────
  const concluded = grid({
    applications: {
      state: "ready",
      activeCount: 0,
      latestActive: null,
      concludedCount: 3,
      interviewCount: 0,
    },
  });
  ck(
    "somebody with only concluded applications is not told they have applied for nothing",
    concluded.includes("3 avslutade ansökningar") &&
      !concluded.includes("Du har inte sökt något jobb ännu"),
  );

  // ── THE JOBS LINK IS CONDITIONAL ON BOTH HALVES ───────────────────
  ck(
    "the jobs link carries the family the analysis named",
    ready.includes('href="/jobs?family=guarding"'),
  );
  const noFamily = grid({ career: CAREER_READY, careerJobsFamilyId: null });
  ck("no family, no jobs link", !noFamily.includes("data-hub-jobs"));
}

/* ------------------------------------------------------------------ */
/* 5 · The overview is a hub, not a stack of product pages             */
/* ------------------------------------------------------------------ */

group("5 · the overview stays compact");
{
  const route = code(read("src/routes/_authenticated.my-career.index.tsx"));
  const shell = code(read("src/routes/_authenticated.my-career.tsx"));

  ck("the shell mounts the hub navigation", shell.includes("<MyCareerHubNav"));
  ck(
    "the shell resolves the current section from the ROUTER, not the pathname",
    shell.includes("useMatches()") &&
      shell.includes("resolveHubSection") &&
      !/useLocation|pathname/.test(shell),
  );
  ck("the shell owns the site chrome", shell.includes("<SiteLayout>"));

  // Two <SiteLayout>s nest two headers and two footers. Every route under
  // the shell must have given its own up.
  const CHILDREN = [
    "src/routes/_authenticated.my-career.index.tsx",
    "src/routes/_authenticated.my-career.applications.tsx",
    "src/routes/_authenticated.my-career.career-card.tsx",
    "src/routes/_authenticated.my-career.cv.index.tsx",
    "src/routes/_authenticated.my-career.cv.new.tsx",
    "src/routes/_authenticated.my-career.cv.$cvId.tsx",
    "src/routes/_authenticated.my-career.profile.tsx",
    "src/routes/_authenticated.my-career.interviews.$caseId.tsx",
  ];
  for (const f of CHILDREN) {
    ck(`${path.basename(f)} does not mount a second site chrome`, !read(f).includes("SiteLayout"));
  }
  ck(
    "the saved report takes the shell's chrome rather than its own",
    read("src/routes/_authenticated.my-career.reports.$runId.tsx").includes("chrome={false}"),
  );

  // The overview mounts the hub grid and none of the six full product
  // sections it replaced.
  ck("the overview mounts the hub grid", route.includes("<HubStatusGrid"));
  for (const tag of [
    "<CareerDirectionSection",
    "<JobRecommendations",
    "<EmployerProcesses",
    "<DevelopmentSection",
    "<CareerTools",
  ]) {
    ck(`${tag} is on its own page, not on the overview`, !route.includes(tag));
  }
  // The grid lays itself out. The route owns ONE row — the pair above the
  // fold — which is what stopped the page growing a product grid before.
  ck(
    "the route still owns exactly one layout row",
    (route.match(/lg:grid-cols-12/g) ?? []).length === 1,
  );
  // Both disclosures are conditional. A summary that opens onto nothing is
  // the "all my reports" panel coming back one size smaller.
  ck(
    "earlier analyses open only when there are some",
    /model\.earlierReports\.state === "ready" && model\.earlierReports\.count > 0 && \(/.test(
      route,
    ),
  );
  ck(
    "the activity log opens only when there is any",
    /model\.activity\.items\.length > 0 \|\| model\.activity\.partial/.test(route),
  );
  ck("the share read feeds the hub", route.includes("listMyShares"));
  ck("the CV list feeds the hub, not just a count", route.includes("savedCvs:"));
}

/* ------------------------------------------------------------------ */
/* 6 · Swedish and English, authored together                          */
/* ------------------------------------------------------------------ */

group("6 · both languages, in one place");
{
  const pairs: { where: string; sv: string; en: string }[] = [];
  const walk = (value: unknown, where: string) => {
    if (!value || typeof value !== "object") return;
    const v = value as Record<string, unknown>;
    if (typeof v.sv === "string" && typeof v.en === "string") {
      pairs.push({ where, sv: v.sv, en: v.en });
      return;
    }
    for (const [k, child] of Object.entries(v)) walk(child, `${where}.${k}`);
  };
  walk(HUB, "HUB");
  walk(HUB_TILE, "HUB_TILE");
  ck("copy pairs were found", pairs.length > 20, String(pairs.length));
  ck(
    "every pair has both languages",
    pairs.every((p) => p.sv.trim().length > 0 && p.en.trim().length > 0),
    pairs
      .filter((p) => !p.sv.trim() || !p.en.trim())
      .map((p) => p.where)
      .join(","),
  );
  const swedishEnglish = pairs.filter(
    (p) => /[åäö]/i.test(p.en) && !/Career|CQrityjob|Passport/.test(p.en),
  );
  ck(
    "no English string is Swedish",
    swedishEnglish.length === 0,
    swedishEnglish.map((p) => p.where).join(","),
  );
  // One name per product: the Swedish surface calls the RESULT
  // "Karriäranalys". "Career Discovery" is the product that makes it and
  // may not appear in a Swedish string — the rule T15 of
  // my-career-premium-overview:check states for the rest of this module.
  ck(
    'no Swedish hub string says "Career Discovery"',
    !pairs
      .map((p) => p.sv)
      .join("\n")
      .includes("Career Discovery"),
  );
  ck('"Security Passport" keeps its name', HUB.sections.passport.sv === "Security Passport");

  // Rendered in English, from the table, so a label that exists only in
  // Swedish cannot reach a reader as a key.
  for (const lang of ["sv", "en"] as const) {
    for (const section of MY_CAREER_HUB) {
      const label = (HUB.sections as Record<string, Copy>)[section.key]![lang as Lang];
      ck(`${lang}: ${section.key} has a label`, label.trim().length > 0);
    }
  }
}

/* ------------------------------------------------------------------ */

console.log("");
if (fails.length > 0) {
  console.error(`FAIL — my-career-hub-check (${fails.length}):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("PASS — my-career-hub-check");
