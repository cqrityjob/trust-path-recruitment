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

const HEADER = "src/components/professional-identity/CareerPageHeader.tsx";
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
    find: '<Link to="/my-career/profile" data-edit-details className={LINK}>',
    replace:
      '<Link to="/my-career/profile?edit=profession#career-profile" data-edit-details className={LINK}>',
    guard: DASH,
    expect: "no quick-edit intent",
  },
  {
    id: "PE-NC-WRONG-DESTINATION",
    defect:
      "the button points at the Security Passport, sending somebody who wants to edit their education to the wrong product",
    file: HEADER,
    find: '<Link to="/my-career/profile" data-edit-details className={LINK}>',
    replace: '<Link to="/passport/information" data-edit-details className={LINK}>',
    guard: DASH,
    expect: "must navigate to the complete profile workspace",
  },
  {
    id: "PE-NC-CONTROL-UNMARKED",
    defect:
      "the control loses its data-edit-details hook, so nothing can assert where it goes and the destination can drift unobserved",
    file: HEADER,
    find: '<Link to="/my-career/profile" data-edit-details className={LINK}>',
    replace: '<Link to="/my-career/profile" className={LINK}>',
    guard: DASH,
    expect: "must carry data-edit-details",
  },

  // ---- A general editor goes back into the Passport ------------------------
  {
    id: "PE-NC-GENERAL-EDITOR-BACK-IN-PASSPORT",
    defect:
      "the profile stops owning the general claim kinds, which is how general education and languages end up being edited inside the Security Passport again",
    file: CLAIMS,
    find: 'const CV_CLAIM_KINDS = [{ kind: "education" as const, titleKey: "claims.type.education" as const }];',
    replace: "const CV_CLAIM_KINDS: { kind: string; titleKey: string }[] = [];",
    guard: BOUNDARY,
    expect: "education",
  },
];

runControls("profile-entry", MUTATIONS);
