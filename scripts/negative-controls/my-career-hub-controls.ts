/**
 * PR #211 negative controls — eight mutations against my-career-hub:check.
 *
 * ── WHY EACH ONE IS HERE ───────────────────────────────────────────────
 *
 * The hub guard renders components and reads the router's route table, and
 * both of those are ways for an assertion to go quietly dead. A rendered
 * assertion passes when the branch it was about stops being reachable; a
 * route-table assertion passes when the id it names is renamed and the
 * lookup simply matches nothing. The eight mutations below introduce the
 * exact defects the guard exists to catch, one at a time.
 *
 * They are deliberately not variations on one theme. Each targets a
 * different class of regression this hub could suffer:
 *
 *   HUB-ORDER-DROP        an area disappears from the navigation
 *   HUB-SHARE-PREFIX      longest-match breaks and Sharing lights the
 *                         Passport instead of itself
 *   HUB-CURRENT-COLOUR    the current tab is marked by colour alone
 *   HUB-EMPTY-IS-LOADING  the empty state and the loading skeleton
 *                         collapse into one another
 *   HUB-FAILED-IS-EMPTY   a failed read starts claiming the thing does not
 *                         exist
 *   HUB-CV-ACTION-FROZEN  the CV module stops changing its action with its
 *                         state, so a new candidate is sent to an empty
 *                         list instead of the creator
 *   HUB-GATE-IGNORED      the career module offers a door the route
 *                         refuses — my-career-gate:check's defect, one
 *                         level down
 *   HUB-SECOND-CHROME     a child route mounts its own <SiteLayout> again,
 *                         so the page renders two headers and two footers
 *
 * Run: bun run negative-controls:my-career-hub
 */

import { runControls, type Mutation } from "./runner";

const SECTIONS = "src/lib/professional-identity/hub-sections.ts";
const NAV = "src/components/professional-identity/MyCareerHubNav.tsx";
const GRID = "src/components/professional-identity/HubStatusGrid.tsx";
const APPLICATIONS = "src/routes/_authenticated.my-career.applications.tsx";
const GUARD = "my-career-hub:check";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "HUB-ORDER-DROP",
    defect: "Sharing is dropped from the hub, exactly as it was missing before #211",
    file: SECTIONS,
    find: `  {
    key: "sharing",
    to: "/passport/share",`,
    replace: `  {
    key: "cv" as never,
    to: "/passport/share",`,
    guard: GUARD,
    expect: "the hub is exactly six areas, in the agreed order",
  },
  {
    id: "HUB-SHARE-PREFIX",
    defect:
      "the share screen's own prefix is removed, so /passport/share falls back to the Passport",
    file: SECTIONS,
    find: `    routeIds: ["/_authenticated/passport/share"],`,
    replace: `    routeIds: ["/_authenticated/passport"],`,
    guard: GUARD,
    expect: "/_authenticated/passport/share → sharing",
  },
  {
    id: "HUB-CURRENT-COLOUR",
    defect: "the current tab loses its rule and its weight, leaving colour as the only signal",
    file: NAV,
    find: `                    ? "border-accent font-semibold text-foreground"`,
    replace: `                    ? "border-transparent font-medium text-accent"`,
    guard: GUARD,
    expect: "the current tab is weighted",
  },
  {
    id: "HUB-EMPTY-IS-LOADING",
    defect: "a module still reading renders its empty sentence, so 'no CV yet' appears mid-read",
    file: GRID,
    find: `        {cv.state === "loading" ? (
          <ModuleLoading label={loading} />`,
    replace: `        {cv.state === "loading" ? (
          <Status muted>{L(HUB_TILE.cv.none, l)}</Status>`,
    guard: GUARD,
    expect: "loading says nothing about having none",
  },
  {
    id: "HUB-FAILED-IS-EMPTY",
    defect: "a failed CV read is reported as having no CV, pushing the holder to make another",
    file: GRID,
    find: `        ) : cv.state === "unavailable" ? (
          <Failed message={unavailable} onRetry={onRetryCv} className="mt-2" />`,
    replace: `        ) : cv.state === "unavailable" ? (
          <Status muted>{L(HUB_TILE.cv.none, l)}</Status>`,
    guard: GUARD,
    expect: "a failed read is an alert with a retry",
  },
  {
    id: "HUB-CV-ACTION-FROZEN",
    defect:
      "the CV module always points at the list, so a candidate with no CV is sent to an empty page instead of the creator",
    file: GRID,
    find: `          <Go to={cv.state === "none" ? "/my-career/cv/new" : "/my-career/cv"}>`,
    replace: `          <Go to="/my-career/cv">`,
    guard: GUARD,
    expect: "empty CV offers the creator, populated CV offers the list",
  },
  {
    id: "HUB-GATE-IGNORED",
    defect:
      "the career module offers 'take the career analysis' to somebody the tester gate will refuse",
    file: GRID,
    find: `        {career.state === "none" && !careerClosed && (`,
    replace: `        {career.state === "none" && (`,
    guard: GUARD,
    expect: "a closed career analysis says so and offers no door",
  },
  {
    id: "HUB-SECOND-CHROME",
    defect: "a child route mounts its own site chrome again, so the page renders two headers",
    file: APPLICATIONS,
    find: `import { Section } from "@/components/site/Section";`,
    replace: `import { Section } from "@/components/site/Section";
import { SiteLayout } from "@/components/site/SiteLayout";`,
    guard: GUARD,
    expect: "_authenticated.my-career.applications.tsx does not mount a second site chrome",
  },
];

runControls("my-career-hub", MUTATIONS);
