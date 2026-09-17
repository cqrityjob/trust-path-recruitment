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
  // ---- The dead label comes back ------------------------------------------
  {
    id: "PSN-NC-DEAD-LABEL-RESTORED",
    defect:
      "the Profile page labels a section 'Edited here' again beside something that is not a control, which is the defect the owner's refinement removed",
    file: ROUTE,
    find: '  ownedCv: c("Tillhör ditt CV", "Belongs to your CV"),',
    replace:
      '  ownedCv: c("Tillhör ditt CV", "Belongs to your CV"),\n  ownedHere: c("Redigeras här", "Edited here"),',
    guard: GUARD,
    expect: "no dead ownership label",
  },

  // ---- Career history gets a second editing home ---------------------------
  {
    id: "PSN-NC-CV-EDITOR-BACK-ON-PROFILE",
    defect:
      "the employment editor is mounted on the Profile page again, so career history has two editing homes and the Profile/CV split is gone",
    file: ROUTE,
    find: "              <ProfileBasicsSection />",
    replace: "              <ProfileBasicsSection />\n              <EmploymentHistoryEditor />",
    guard: GUARD,
    expect: "exactly one editing home",
  },
  {
    id: "PSN-NC-CV-SECTION-ROUTED-TO-PROFILE",
    defect:
      "the contract sends 'add your employment' to the Profile page, where the editor no longer is: the recommendation can never be retired",
    file: DESTINATIONS,
    find: '  employment: { owner: "cv", href: "/my-career/cv#cv-employment" },',
    replace: '  employment: { owner: "cv", href: "/my-career/profile#cv-employment" },',
    guard: GUARD,
    expect: "employment is edited on /my-career/cv",
  },

  // ---- Completion starts gating an editor ----------------------------------
  {
    id: "PSN-NC-COMPLETION-GATES-THE-EDITOR",
    defect:
      "the name-and-title editor is only mounted while something is missing, so a completed profile can no longer be corrected -- precisely when somebody wants to",
    file: ROUTE,
    find: "              <ProfileBasicsSection />",
    replace: "              {missing.length > 0 && <ProfileBasicsSection />}",
    guard: GUARD,
    expect: "<ProfileBasicsSection is mounted unconditionally",
  },

  // ---- A second source of truth for the destination -----------------------
  {
    id: "PSN-NC-TARGET-NOT-FROM-CONTRACT",
    defect:
      "the route stops deriving its destination from SECTION_DESTINATIONS, so the shortcut and the recommendation ladder can disagree about where a section is edited",
    file: ROUTE,
    find: "                  const target = sectionLinkTarget(section);",
    replace:
      '                  const target = { to: "/my-career/profile", search: undefined, hash: undefined };',
    guard: GUARD,
    expect: "derive their targets from the shared contract",
  },
  {
    id: "PSN-NC-ANCHOR-RESPELLED-IN-ROUTE",
    defect:
      "an anchor is written again in the route beside the link, which is the second source of truth that drifts the first time a section moves",
    file: ROUTE,
    find: "                        data-section-link={section}",
    replace:
      '                        data-section-link={section}\n                        data-anchor="profile-basics"',
    guard: GUARD,
    expect: "the Profile route does not re-spell #profile-basics",
  },
  {
    id: "PSN-NC-HASH-DROPPED-FROM-LINK",
    defect:
      "the link stops carrying the fragment, so every shortcut lands at the top of the page instead of at its field — the URL changes and nothing else does",
    file: ROUTE,
    find: "                        hash={target.hash}\n                        data-section-link={section}",
    replace: "                        data-section-link={section}",
    guard: GUARD,
    expect: "built from that target, part by part",
  },
  {
    id: "PSN-NC-SHORTCUTS-OFFER-CV-SECTIONS",
    defect:
      "the Profile's 'missing' list stops filtering on ownership, so it asks for an education on the page that cannot record one",
    file: ROUTE,
    find: '          SECTION_DESTINATIONS[section].owner === "profile" &&',
    replace: "",
    guard: GUARD,
    expect: "offers only what the Profile owns",
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
    expect: "no rendered id= anywhere on the owning surface",
  },
  {
    id: "PSN-NC-ANCHOR-DUPLICATED",
    defect:
      "a second element claims the employment anchor, so which section the link reaches depends on document order rather than on intent",
    file: CLAIMS,
    find: "    <div className={`space-y-4 ${className}`} data-general-profile-claims>",
    replace:
      '    <div id="cv-employment" className={`space-y-4 ${className}`} data-general-profile-claims>',
    guard: GUARD,
    expect: "rendered 2 times",
  },
  {
    id: "PSN-NC-TABLE-ANCHOR-LOST",
    defect:
      "the languages anchor is dropped from the table that feeds the shell, which is the indirection the guard's first draft could not see at all",
    file: CLAIMS,
    find: '{ kind: "language" as const, titleKey: "info.languages" as const, anchor: "cv-languages" },',
    replace: '{ kind: "language" as const, titleKey: "info.languages" as const, anchor: "gone" },',
    guard: GUARD,
    expect: "no rendered id= anywhere on the owning surface",
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

  // ---- A profile-owned anchor drifts onto the wrong page ------------------
  {
    id: "PSN-NC-ANCHOR-ON-THE-WRONG-SURFACE",
    defect:
      "the work-country anchor only exists on the CV surface, so the Profile's link has a live id on a page it does not point at",
    file: DESTINATIONS,
    find: '  location: { owner: "profile", href: "/my-career/profile#profile-work-country" },',
    replace: '  location: { owner: "profile", href: "/my-career/profile#cv-languages" },',
    guard: GUARD,
    expect: "#cv-languages is rendered exactly once on the profile surface",
  },

  // ---- The target stops being reachable by hand or by keyboard ------------
  {
    id: "PSN-NC-TARGET-UNDER-44PX",
    defect:
      "the shortcut drops its 44px minimum, so on a phone the missing-field links become targets too small to hit",
    file: ROUTE,
    find: 'className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border border-dashed',
    replace: 'className="inline-flex items-center gap-1.5 rounded-md border border-dashed',
    guard: GUARD,
    expect: "declares a 44px minimum",
  },
  {
    id: "PSN-NC-FOCUS-RING-LOST",
    defect:
      "the shortcut loses its visible focus state, so a keyboard user tabbing the page cannot see where they are",
    file: ROUTE,
    find: "hover:bg-accent/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    replace: "hover:bg-accent/10 focus-visible:outline-none",
    guard: GUARD,
    expect: "keyboard focus is visible",
  },

  // ---- The link stops being named from bilingual copy ---------------------
  {
    id: "PSN-NC-LABEL-HARDCODED",
    defect:
      "the shortcut's text becomes a Swedish literal, so an English reader reads the wrong language and the authored pair is bypassed",
    file: ROUTE,
    find: "                        {L(ADD_LABEL[section]!, l)}",
    replace: "                        Lägg till",
    guard: GUARD,
    expect: "named from a bilingual pair",
  },
  {
    id: "PSN-NC-ROW-HOOK-LOST",
    defect:
      "the per-section hook disappears, so the browser suite can no longer address a specific shortcut and its proof goes dark",
    file: ROUTE,
    find: "                        data-section-link={section}\n",
    replace: "",
    guard: GUARD,
    expect: "carries a stable hook naming its section",
  },
];

runControls("profile-section-navigation", MUTATIONS);
