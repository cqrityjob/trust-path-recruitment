/**
 * Negative controls for the one canonical "Redigera mina uppgifter" entry.
 *
 * The owner's decision is one button leading to one complete place. The
 * ways that regresses are specific and all planted here: the button going
 * back to the limited quick-edit dialog, pointing somewhere else entirely,
 * a general profile/CV editor reappearing inside the Security Passport,
 * and a verification editor leaking the other way into the profile.
 *
 * Each mutation changes exactly one thing, the guard must fail with the
 * named diagnostic, and every file is restored byte-for-byte (proved by
 * the shared runner).
 *
 * Run: bun run negative-controls:profile-entry
 */
import { runControls, type Mutation } from "./runner";

// The "Edit Profile" control is the Profile card's one button since the
// 2026-09-17 refinement; it was a text link in CareerPageHeader before.
const HEADER = "src/components/professional-identity/OverviewSurfaces.tsx";
const CV_PAGE = "src/routes/_authenticated.my-career.cv.index.tsx";
const EDITOR = "src/components/professional-identity/EmploymentHistoryEditor.tsx";
const BASICS = "src/components/professional-identity/ProfileBasicsSection.tsx";
const PROFILE = "src/routes/_authenticated.my-career.profile.tsx";
const DESTINATIONS = "src/lib/professional-identity/profile-destinations.ts";
const INFO = "src/routes/_authenticated.passport.information.tsx";
const CLAIMS = "src/components/professional-identity/GeneralProfileClaims.tsx";
const DASH = "my-career-dashboard:check";
const BOUNDARY = "passport-cv-boundary:check";

const MUTATIONS: readonly Mutation[] = [
  // ---- The button goes back to the limited modal ---------------------------
  {
    id: "PE-NC-MODAL-RETURNS",
    defect:
      "the Overview button carries the quick-edit intent again, so it reopens the limited dialog instead of the complete workspace",
    file: HEADER,
    find: '<Link to="/my-career/profile" data-edit-details className={ACTION}>',
    replace:
      '<Link to="/my-career/profile?edit=profession#career-profile" data-edit-details className={ACTION}>',
    guard: DASH,
    expect: "no quick-edit intent",
  },
  {
    id: "PE-NC-WRONG-DESTINATION",
    defect:
      "the button points at the Security Passport, sending somebody who wants to edit their education to the wrong product",
    file: HEADER,
    find: '<Link to="/my-career/profile" data-edit-details className={ACTION}>',
    replace: '<Link to="/passport/information" data-edit-details className={ACTION}>',
    guard: DASH,
    expect: "must navigate to the complete profile workspace",
  },
  {
    id: "PE-NC-CONTROL-UNMARKED",
    defect:
      "the control loses its data-edit-details hook, so nothing can assert where it goes and the destination can drift unobserved",
    file: HEADER,
    find: '<Link to="/my-career/profile" data-edit-details className={ACTION}>',
    replace: '<Link to="/my-career/profile" className={ACTION}>',
    guard: DASH,
    expect: "must carry data-edit-details",
  },

  // ---- A general editor goes back into the Passport ------------------------
  {
    id: "PE-NC-GENERAL-EDITOR-BACK-IN-PASSPORT",
    defect:
      "the profile stops owning the general claim kinds, which is how general education and languages end up being edited inside the Security Passport again",
    file: CLAIMS,
    find: '  { kind: "education", titleKey: "claims.type.education", anchor: "cv-education" },',
    replace: "",
    guard: BOUNDARY,
    expect: "education",
  },

  // ---- The employment editor goes back to the Passport ---------------------
  {
    id: "PE-NC-EMPLOYMENT-EDITOR-BACK-IN-PASSPORT",
    defect:
      "the Passport mounts the employment authoring form again, so a person must go to the Security Passport to record ordinary work history",
    file: INFO,
    find: '      <div id="sp-credentials" className="scroll-mt-24 space-y-5">',
    replace:
      '      <ExperienceForm />\n      <div id="sp-credentials" className="scroll-mt-24 space-y-5">',
    guard: BOUNDARY,
    expect: "mounts no employment authoring form",
  },
  {
    id: "PE-NC-EMPLOYMENT-EDITOR-UNMOUNTED",
    defect:
      "the CV page stops mounting the canonical employment editor, so the authoring moved out of the Passport and landed nowhere",
    file: CV_PAGE,
    // Repointed twice: the defaultCountry prop was removed when the editor
    // took over resolving the CONFIRMED work country itself, and the mount
    // moved from the Profile page to the CV page with the Profile/CV split.
    find: "<EmploymentHistoryEditor",
    replace: "<NoEmploymentEditor",
    guard: BOUNDARY,
    expect: "mounted on /my-career/cv",
  },
  {
    id: "PE-NC-EMPLOYMENT-SECOND-IMPLEMENTATION",
    defect:
      "the profile editor stops using the shared ExperienceForm, which is how a second employment form quietly appears",
    file: EDITOR,
    find: "          <ExperienceForm",
    replace: "          <form data-second-implementation",
    guard: BOUNDARY,
    expect: "EXISTING ExperienceForm",
  },
  {
    id: "PE-NC-EMPLOYMENT-SECOND-WRITER",
    defect:
      "the profile editor stops using the canonical writer, which is the two-writer defect migration 20261007090000 removed",
    file: EDITOR,
    find: "  const saveExp = useServerFn(saveExperienceEntry);",
    replace: "  const saveExp = async (_: unknown) => undefined;",
    guard: BOUNDARY,
    expect: "canonical employment reader and writer",
  },

  // ---- Evidence leaks the other way ---------------------------------------
  {
    id: "PE-NC-VERIFICATION-LEAKS-INTO-PROFILE",
    defect:
      "a verification request control appears in the profile editor, so evidence and verification stop being the Passport's alone",
    file: EDITOR,
    find: "  const doRemove = useServerFn(removeEntry);",
    replace: "  const doRemove = useServerFn(removeEntry);\n  const ask = requestVerification;",
    guard: BOUNDARY,
    expect: "must not carry requestVerification",
  },
  {
    id: "PE-NC-CV-HISTORY-RETURNS-TO-PASSPORT",
    defect:
      "the retired employment anchor grows a CV history control inside Passport instead of pointing to the canonical Profile",
    file: INFO,
    find: "            data-employment-authoring-link",
    replace: '            onClick={() => openEntry("experience", e.id)}',
    guard: BOUNDARY,
    expect: "points to the CV's employment editor without rendering CV history",
  },

  // ---- The destination map points general information back at the Passport --
  {
    id: "PE-NC-DESTINATION-BACK-TO-PASSPORT",
    defect:
      "the employment destination points at the Passport again, so every recommendation and summary sends the candidate to the wrong product to edit ordinary work history",
    file: DESTINATIONS,
    find: '  employment: { owner: "cv", href: "/my-career/cv#cv-employment" },',
    replace: '  employment: { owner: "passport", href: "/passport/information#sp-employment" },',
    guard: BOUNDARY,
    expect: "the employment destination is the CV",
  },

  // ---- Basics and work country go back to the Passport ---------------------
  {
    id: "PE-NC-BASICS-BACK-IN-PASSPORT",
    defect:
      "the Passport mounts the profile-basics card again, so correcting a display name means opening the Security Passport",
    file: INFO,
    find: "      {/* The anchor STAYS.",
    replace: "      <ProfileBasicsCard />\n      {/* The anchor STAYS.",
    guard: BOUNDARY,
    expect: "mounts neither card",
  },
  {
    id: "PE-NC-WORK-COUNTRY-BACK-IN-PASSPORT",
    defect: "the Passport mounts the work-country card again",
    file: INFO,
    // Anchored on the element alone, not its surrounding markup: this
    // control broke when the pointer paragraph became the read-only
    // section that carries the anchor and the browsing filter.
    find: '<div\n            id="sp-work-country"',
    replace: '<WorkCountryCard />\n          <div\n            id="sp-work-country"',
    guard: BOUNDARY,
    expect: "mounts neither card",
  },
  {
    id: "PE-NC-BASICS-UNMOUNTED",
    defect:
      "the profile stops mounting the basics section, so the editors left the Passport and landed nowhere",
    file: PROFILE,
    find: "              <ProfileBasicsSection />",
    replace: "",
    guard: BOUNDARY,
    expect: "edited on /my-career/profile",
  },
  {
    id: "PE-NC-BASICS-SECOND-WRITER",
    defect:
      "the basics section stops using the canonical writer, which is the two-writer defect migration 20261007090000 removed",
    file: BASICS,
    find: "  const saveBasics = useServerFn(savePassportBasics);",
    replace: "  const saveBasics = async (_: unknown) => undefined;",
    guard: BOUNDARY,
    expect: "canonical basics and work-country writers",
  },

  // ---- A moved editor kills a live deep link -------------------------------
  {
    id: "PE-NC-DEAD-DEEP-LINK",
    defect:
      "the #sp-profile-basics anchor is dropped when its editor moves, so every existing deep link and PR #246 redirect lands on nothing",
    file: INFO,
    find: '        id="sp-profile-basics"',
    replace: '        id="sp-profile-basics-removed"',
    guard: BOUNDARY,
    // Matches the guard's message after it was strengthened to require a
    // RENDERED id rather than a mention of the name.
    expect: "must be RENDERED on the Passport",
  },
];

runControls("profile-entry", MUTATIONS);
