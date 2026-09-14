/**
 * Negative controls for `profile-section-navigation:check`.
 *
 * The guard's own first draft passed while two anchors it could not see were
 * perfectly alive, and failed an offset that was genuinely applied one
 * component away. A guard that reads source through regular expressions is
 * exactly the kind that dies quietly, so each assertion it makes is proved
 * here by planting the defect and requiring the named diagnostic.
 *
 * Each mutation changes exactly one thing, the guard must fail with the named
 * diagnostic, and every file is restored byte-for-byte by the shared runner.
 *
 * Run: bun run negative-controls:profile-section-navigation
 */
import { runControls, type Mutation } from "./runner";

const ROUTE = "src/routes/_authenticated.my-career.profile.tsx";
const DESTINATIONS = "src/lib/professional-identity/profile-destinations.ts";
const BASICS = "src/components/professional-identity/ProfileBasicsSection.tsx";
const EMPLOYMENT = "src/components/professional-identity/EmploymentHistoryEditor.tsx";
const CLAIMS = "src/components/professional-identity/GeneralProfileClaims.tsx";
const GUARD = "profile-section-navigation:check";

const MUTATIONS: readonly Mutation[] = [
  // ---- The original defect, restored --------------------------------------
  {
    id: "PSN-NC-PROFILE-ROWS-INERT",
    defect:
      "the overview withholds the link again when the section is profile-owned, which is the defect this whole change exists to remove: nine of ten rows become inert",
    file: ROUTE,
    find: '                  if (owner === "profile") {',
    replace: '                  if (owner === "profile" && owner !== "profile") {',
    guard: GUARD,
    expect: "renders the link as the row itself",
  },

  // ---- Completion starts gating navigation again --------------------------
  {
    id: "PSN-NC-DONE-GATES-THE-ROW",
    defect:
      "a completed profile section stops being openable, which is precisely when somebody wants to go and correct what they entered",
    file: ROUTE,
    find: '                  if (owner === "profile") {',
    replace: '                  if (owner === "profile" && !done) {',
    guard: GUARD,
    expect: "never consults `done`",
  },

  // ---- Truthful completeness presentation is dropped ----------------------
  {
    id: "PSN-NC-COMPLETENESS-PRESENTATION-LOST",
    defect:
      "the row stops distinguishing filled from unfilled, so navigation was bought by giving up the status the overview exists to show",
    file: ROUTE,
    find: "                  const done = completeness.completedSections.includes(section);",
    replace: "                  const isDone = completeness.completedSections.includes(section);",
    guard: GUARD,
    expect: "truthful completeness presentation was not removed",
  },

  // ---- A second source of truth for the destination -----------------------
  {
    id: "PSN-NC-TARGET-NOT-FROM-CONTRACT",
    defect:
      "the route stops deriving its destination from SECTION_DESTINATIONS, so the overview and the recommendation ladder can disagree about where a section is edited",
    file: ROUTE,
    find: "                  const target = sectionLinkTarget(section);",
    replace:
      '                  const target = { to: "/my-career/profile", search: undefined, hash: undefined };',
    guard: GUARD,
    expect: "derives its targets from the shared contract",
  },
  {
    id: "PSN-NC-ANCHOR-RESPELLED-IN-ROUTE",
    defect:
      "an anchor is written again in the route beside the link, which is the second source of truth that drifts the first time a section moves",
    file: ROUTE,
    find: "                          aria-label={L(SECTION_TITLE[section], l)}",
    replace:
      '                          aria-label={L(SECTION_TITLE[section], l)}\n                          data-anchor="profile-employment"',
    guard: GUARD,
    expect: "does not re-spell #profile-employment",
  },
  {
    id: "PSN-NC-HASH-DROPPED-FROM-LINK",
    defect:
      "the link stops carrying the fragment, so every row lands at the top of the page instead of at its section — the URL changes and nothing else does",
    file: ROUTE,
    find: "                          hash={target.hash}\n                          aria-label=",
    replace: "                          aria-label=",
    guard: GUARD,
    expect: "built from that target, part by part",
  },

  // ---- The parser silently loses a part of the destination ----------------
  {
    id: "PSN-NC-PARSER-DROPS-QUERY",
    defect:
      "sectionLinkTarget stops returning the query, so the three sections that open the profession editor reach the page without the intent that opens it",
    file: DESTINATIONS,
    find: "    ...(search ? { search } : {}),",
    replace: "",
    guard: GUARD,
    expect: "round-trips to its canonical href",
  },
  {
    id: "PSN-NC-PARSER-KEEPS-FRAGMENT-IN-PATH",
    defect:
      "sectionLinkTarget returns the whole href as the path, so the router is handed a route that does not exist",
    file: DESTINATIONS,
    find: '  const [to = "", query = ""] = beforeHash.split("?");',
    replace: '  const [to = href, query = ""] = [href, ""];',
    guard: GUARD,
    expect: "yields a path, never a fragment or a query",
  },

  // ---- A destination anchor dies ------------------------------------------
  {
    id: "PSN-NC-ANCHOR-REMOVED",
    defect:
      "the work-country anchor is renamed, so the overview row points at an id that is no longer on the page and the reader arrives nowhere",
    file: BASICS,
    find: '<div id="profile-work-country" className="mt-6 scroll-mt-24" data-profile-work-country>',
    replace: '<div className="mt-6 scroll-mt-24" data-profile-work-country>',
    guard: GUARD,
    expect: "no rendered id= anywhere on the surface",
  },
  {
    id: "PSN-NC-ANCHOR-DUPLICATED",
    defect:
      "a second element claims the employment anchor, so which section the link reaches depends on document order rather than on intent",
    file: BASICS,
    find: '<div id="profile-work-country" className="mt-6 scroll-mt-24" data-profile-work-country>',
    replace:
      '<div id="profile-employment" className="mt-6 scroll-mt-24" data-profile-work-country>',
    guard: GUARD,
    expect: "rendered 2 times",
  },
  {
    id: "PSN-NC-TABLE-ANCHOR-LOST",
    defect:
      "the languages anchor is dropped from the table that feeds the shell, which is the indirection the guard's first draft could not see at all",
    file: CLAIMS,
    find: '{ kind: "language" as const, titleKey: "info.languages" as const, anchor: "profile-languages" },',
    replace: '{ kind: "language" as const, titleKey: "info.languages" as const, anchor: "gone" },',
    guard: GUARD,
    expect: "no rendered id= anywhere on the surface",
  },

  // ---- The reader lands under the fixed header ----------------------------
  {
    id: "PSN-NC-OFFSET-LOST-ON-ELEMENT",
    defect:
      "the employment section loses its scroll offset, so following the link puts the heading underneath the fixed header",
    file: EMPLOYMENT,
    find: "      className={`scroll-mt-24 ${className}`}",
    replace: "      className={className}",
    guard: GUARD,
    expect: "carries a scroll offset",
  },
  {
    id: "PSN-NC-OFFSET-LOST-IN-SHELL",
    defect:
      "the shell that renders education, languages and skills loses its offset, so three destinations land under the header at once",
    file: CLAIMS,
    find: 'className="scroll-mt-24 rounded-xl border border-border bg-card p-5"',
    replace: 'className="rounded-xl border border-border bg-card p-5"',
    guard: GUARD,
    expect: "carries a scroll offset",
  },

  // ---- The target stops being reachable by hand or by keyboard ------------
  {
    id: "PSN-NC-TARGET-UNDER-44PX",
    defect:
      "the row link drops its 44px minimum, so on a phone the overview becomes a column of targets too small to hit",
    file: ROUTE,
    find: "flex min-h-[44px] flex-col justify-center p-4",
    replace: "flex flex-col justify-center p-4",
    guard: GUARD,
    expect: "declares a 44px minimum",
  },
  {
    id: "PSN-NC-FOCUS-RING-LOST",
    defect:
      "the row link loses its visible focus state, so a keyboard user tabbing the overview cannot see where they are",
    file: ROUTE,
    find: "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    replace: "focus-visible:outline-none",
    guard: GUARD,
    expect: "keyboard focus is visible",
  },

  // ---- The link stops being named from bilingual copy ---------------------
  {
    id: "PSN-NC-LABEL-HARDCODED",
    defect:
      "the accessible name becomes a Swedish literal, so an English reader hears the wrong language and the existing copy table is bypassed",
    file: ROUTE,
    find: "                          aria-label={L(SECTION_TITLE[section], l)}",
    replace: '                          aria-label="Avsnitt"',
    guard: GUARD,
    expect: "named from the section title",
  },
  {
    id: "PSN-NC-ROW-HOOK-LOST",
    defect:
      "the per-section hook disappears, so the browser suite can no longer address a specific overview row and its proof goes dark",
    file: ROUTE,
    find: '                          data-section-link={section}\n                          className="flex min-h-[44px]',
    replace: '                          className="flex min-h-[44px]',
    guard: GUARD,
    expect: "carries a stable hook naming its section",
  },
];

runControls("profile-section-navigation", MUTATIONS);
