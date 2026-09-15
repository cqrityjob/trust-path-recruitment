/**
 * Negative controls for the Passport / CV boundary.
 *
 * The owner's review named the defect: general profile and CV information
 * presented as Security Passport trust evidence. It also named the two
 * wrong fixes -- relabelling the editors where they stand, and copying the
 * fact into a profile table so it exists twice.
 *
 * So these mutations reintroduce the defect and both wrong fixes, plus the
 * failure modes a MOVE has that a relabel does not: the old editor left
 * behind, the new one never mounted, a deep link pointing at an anchor that
 * no longer exists, and one language's copy drifting from the other's.
 *
 * Several mutations DELETE rather than add. That is deliberate: an earlier
 * version of this guard used `indexOf(a) < indexOf(b)` ordering assertions,
 * which pass when `a` is missing because -1 sorts first. A control that
 * removes the thing is the only one that catches that class of assertion.
 *
 * Each mutation changes exactly one thing, the guard must fail with the
 * named diagnostic, and every file is restored byte-for-byte (proved by the
 * shared runner).
 *
 * Run: bun run negative-controls:passport-cv-boundary
 */
import { runControls, type Mutation } from "./runner";

const INFO = "src/routes/_authenticated.passport.information.tsx";
const I18N = "src/lib/security-passport/i18n.ts";
const EDITOR = "src/components/professional-identity/GeneralProfileClaims.tsx";
const PROFILE = "src/routes/_authenticated.my-career.profile.tsx";
const DESTINATIONS = "src/lib/professional-identity/profile-destinations.ts";
const GUARD = "passport-cv-boundary:check";

const MUTATIONS: readonly Mutation[] = [
  /* ── THE ORIGINAL DEFECT, AND ITS MIRROR ───────────────────────────── */
  {
    id: "PCB-NC-EDUCATION-BACK-AS-CREDENTIAL",
    defect:
      "THE ORIGINAL DEFECT: general education goes back into the Passport's credential table, where it reads as security trust evidence",
    file: INFO,
    find: '  { kind: "certification", titleKey: "claims.type.certification" },',
    replace:
      '  { kind: "education", titleKey: "claims.type.education" },\n  { kind: "certification", titleKey: "claims.type.certification" },',
    guard: GUARD,
    expect: "education is NOT a Passport credential section",
  },
  {
    id: "PCB-NC-CERTIFICATION-DRIFTS-TO-PROFILE",
    defect:
      "a security certification drifts the other way onto the profile, so real trust evidence stops being Passport content and escapes its verification path",
    file: EDITOR,
    find: "const CV_CLAIM_KINDS = [",
    replace:
      'const CV_CLAIM_KINDS = [\n  { kind: "certification" as const, titleKey: "claims.type.certification" as const },',
    guard: GUARD,
    expect: "certification did NOT follow them",
  },

  /* ── A MOVE THAT DID NOT FINISH ────────────────────────────────────── */
  {
    id: "PCB-NC-SKILL-EDITOR-LEFT-BEHIND",
    defect:
      "the skills editor is left mounted on the Passport page as well, so the move is cosmetic and one fact has two editors",
    file: INFO,
    find: '      <div id="sp-credentials" className="scroll-mt-24 space-y-5">',
    replace:
      '      <SkillSection claimType="language" types={[]} entries={[]} draft={null} errors={{}} busy={false} onDraftChange={() => {}} onStart={() => {}} onCancel={() => {}} onSave={() => {}} onRemove={() => {}} onOpen={() => {}} />\n      <div id="sp-credentials" className="scroll-mt-24 space-y-5">',
    guard: GUARD,
    expect: "no languages or practical-skills editor on the Passport page",
  },
  {
    id: "PCB-NC-EDITOR-NEVER-MOUNTED",
    defect:
      "the editors leave the Passport but are never mounted on the profile, so the fields become uneditable anywhere -- the failure a relabel cannot have and a move can",
    file: PROFILE,
    find: "                <GeneralProfileClaims />",
    replace: "",
    guard: GUARD,
    expect: "the profile page mounts the general profile/CV editors",
  },
  {
    id: "PCB-NC-CREDENTIAL-ANCHOR-VANISHES",
    defect:
      "the credential sections and their anchor disappear from the Passport entirely, leaving a page that links away and shows nothing of its own",
    file: INFO,
    find: '      <div id="sp-credentials" className="scroll-mt-24 space-y-5">\n        {PASSPORT_CLAIM_SECTIONS.map(claimSection)}\n      </div>\n',
    replace: "",
    guard: GUARD,
    expect: "that anchor is a real id on the Passport page",
  },

  /* ── ONE FACT, ONE ROW, ONE WRITER ─────────────────────────────────── */
  {
    id: "PCB-NC-SECOND-WRITE-PATH",
    defect:
      "the moved editor grows a write function of its own instead of reusing saveClaimEntry, so the same fact gains a second writer",
    file: EDITOR,
    find: "function SectionShell({",
    replace:
      'const saveGeneralClaim = createServerFn({ method: "POST" }).handler(async () => null);\n\nfunction SectionShell({',
    guard: GUARD,
    expect: "defines no server function of its own",
  },
  {
    id: "PCB-NC-PROFILE-TABLE-COPY",
    defect:
      "the moved editor copies the fact into the profile table -- precisely the two-writer defect migration 20261007090000 removed",
    file: EDITOR,
    find: "function SectionShell({",
    replace: 'const MIRROR_TABLE = "security_career_profiles";\n\nfunction SectionShell({',
    guard: GUARD,
    expect: "writes nothing into the profile table",
  },
  {
    id: "PCB-NC-READS-STOP-SHARING-ROWS",
    defect:
      "the moved editor stops reading sp_claims through listMyEntries, so the profile and the Passport no longer see the same rows",
    file: EDITOR,
    find: "  const load = useServerFn(listMyEntries);",
    replace: "  const load = useServerFn(listProfileOnlyEntries);",
    guard: GUARD,
    expect: "reads the same sp_claims entries",
  },

  /* ── THE LINKS THAT HAVE TO FOLLOW THE EDITOR ──────────────────────── */
  {
    id: "PCB-NC-DEEP-LINK-UNREDIRECTED",
    defect:
      "the retired #sp-education fragment is no longer redirected, so a bookmark or a recommended next step opens the Passport at the top with no sign the section moved",
    file: INFO,
    find: '      "#sp-education": "profile-education",\n',
    replace: "",
    guard: GUARD,
    expect: "#sp-education deep link is redirected",
  },
  {
    id: "PCB-NC-REDIRECT-PUSHES-HISTORY",
    defect:
      "the redirect pushes instead of replacing, so Back returns to the Passport fragment and bounces the reader between the two pages",
    file: INFO,
    find: "GENERAL_PROFILE_ROUTE, hash: target, replace: true",
    replace: "GENERAL_PROFILE_ROUTE, hash: target, replace: false",
    guard: GUARD,
    expect: "the redirect replaces history",
  },
  {
    id: "PCB-NC-DESTINATION-STALE",
    defect:
      "profile-destinations still routes education into the Passport, so every recommended next step sends the candidate to the page the editor left",
    file: DESTINATIONS,
    find: '  education: { owner: "profile", href: "/my-career/profile#profile-education" },',
    replace: '  education: { owner: "passport", href: "/passport/information#sp-education" },',
    guard: GUARD,
    expect: "profile-destinations routes education to the profile editor",
  },
  {
    id: "PCB-NC-ANCHOR-MISSING",
    defect:
      "the languages anchor is dropped from the moved editor, so the destination's deep link names nothing and lands at the top of the profile",
    file: EDITOR,
    find: '{ kind: "language" as const, titleKey: "info.languages" as const, anchor: "profile-languages" },',
    replace:
      '{ kind: "language" as const, titleKey: "info.languages" as const, anchor: "languages" },',
    guard: GUARD,
    expect: "profile-languages is a real id",
  },
  {
    id: "PCB-NC-LINK-TO-OVERVIEW",
    defect:
      "the Passport's pointer aims at /my-career, which is the Overview -- a reader who follows it never reaches the editor it promised",
    file: INFO,
    find: 'const GENERAL_PROFILE_ROUTE = "/my-career/profile" as const;',
    replace: 'const GENERAL_PROFILE_ROUTE = "/my-career" as const;',
    guard: GUARD,
    expect: "points at the profile PAGE, not the overview",
  },
  {
    id: "PCB-NC-POINTER-REMOVED",
    defect:
      "the Passport drops the pointer as well as the editors, so the fields vanish from the Passport with nothing telling the candidate where they went",
    file: INFO,
    find: '        {pt("info.generalMoved")}{" "}',
    replace: "",
    guard: GUARD,
    expect: "it links to the profile instead",
  },

  /* ── THE TWO PAGES TELLING ONE STORY, IN TWO LANGUAGES ─────────────── */
  {
    id: "PCB-NC-PAGES-CONTRADICT",
    defect:
      "the profile page goes back to saying education and languages LIVE in the Security Passport, so the two pages tell the candidate different things about the same facts",
    file: PROFILE,
    find: '    "Anställningar och säkerhetsintyg är bevisning i ditt Security Passport och redigeras där. Utbildning, språk och färdigheter hör till din profil och ditt CV, redigeras här nedan och är inte säkerhetsbevisning.',
    replace:
      '    "Anställningar, utbildningar, intyg och språk bor i Security Passport. Där kan de granskas och verifieras — vilket en profiluppgift aldrig kan.',
    guard: GUARD,
    expect: "no longer says education and languages LIVE in the Passport",
  },
  {
    id: "PCB-NC-EN-DENIAL-DRIFTS",
    defect:
      "the English Passport pointer loses the denial the Swedish one keeps, so the boundary is stated to Swedish readers only",
    file: I18N,
    find: "belong to your profile and CV, are edited there, and are not security evidence.",
    replace: "belong to your profile and CV, and are edited there.",
    guard: GUARD,
    expect: "so does the English one",
  },
  {
    id: "PCB-NC-SV-DENIAL-DRIFTS",
    defect:
      "the Swedish Passport pointer loses the denial the English one keeps -- the same drift in the other direction, which a one-language assertion would miss",
    file: I18N,
    find: "hör till din profil och ditt CV, redigeras där och är inte säkerhetsbevisning.",
    replace: "hör till din profil och ditt CV och redigeras där.",
    guard: GUARD,
    expect: "the Swedish Passport pointer also says these are not security evidence",
  },
  {
    id: "PCB-NC-CV-REGION-KEYS-REINSTATED",
    defect:
      "the removed CV region's copy keys come back, which is how the region itself gets quietly reinstated on the Passport page later",
    file: I18N,
    find: '  "info.generalMovedLink": "Open profile and CV information",',
    replace:
      '  "info.generalMovedLink": "Open profile and CV information",\n  "info.cvSection.title": "Profile and CV information",',
    guard: GUARD,
    expect: "copy keys are deleted rather than orphaned",
  },
];

runControls("passport-cv-boundary", MUTATIONS);
