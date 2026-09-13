/**
 * Negative controls for the Passport / CV boundary.
 *
 * Each mutation reintroduces a real form of the defect the owner's pilot
 * review named -- general profile and CV information presented as Security
 * Passport trust evidence -- or the wrong fix for it, which is copying the
 * fact somewhere else instead of labelling it where it lives.
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
const GUARD = "passport-cv-boundary:check";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "PCB-NC-EDUCATION-BACK-AS-CREDENTIAL",
    defect:
      "THE ORIGINAL DEFECT: general education goes back into the Passport's credential table, where it reads as security trust evidence",
    file: INFO,
    find: '  { kind: "training", titleKey: "claims.type.training" },',
    replace:
      '  { kind: "education", titleKey: "claims.type.education" },\n  { kind: "training", titleKey: "claims.type.training" },',
    guard: GUARD,
    expect: "general education is NOT a Passport credential section",
  },
  {
    id: "PCB-NC-CERTIFICATION-DRIFTS-TO-CV",
    defect:
      "a security certification drifts the other way into CV information, so real trust evidence stops being presented as Passport content",
    file: INFO,
    find: '  { kind: "education", titleKey: "claims.type.education" },\n];',
    replace:
      '  { kind: "education", titleKey: "claims.type.education" },\n  { kind: "certification", titleKey: "claims.type.certification" },\n];',
    guard: GUARD,
    expect: "did not follow education across into CV information",
  },
  {
    id: "PCB-NC-REGION-UNLABELLED",
    defect:
      "the profile/CV region loses its heading, so the sections sit under the Passport's own headings again and read as evidence",
    file: INFO,
    find: "            {pt(\"info.cvSection.title\")}",
    replace: "            {pt(\"info.employment\")}",
    guard: GUARD,
    expect: "the region carries its own heading and explanation",
  },
  {
    id: "PCB-NC-LEAD-STOPS-DENYING",
    defect:
      "the region's lead stops saying these are not the Passport's security evidence, so the heading is decoration rather than a statement",
    file: I18N,
    find: "inte till säkerhetsbevisningen i ditt Passport",
    replace: "och till säkerhetsbevisningen i ditt Passport",
    guard: GUARD,
    expect: "the Swedish lead says these are NOT the Passport's security evidence",
  },
  {
    id: "PCB-NC-SECOND-SKILLS-EDITOR",
    defect:
      "a second skills/languages editor appears, so one fact gains a second writer -- the two-writer defect migration 20261007090000 removed",
    file: INFO,
    find: "        {CV_CLAIM_SECTIONS.map(claimSection)}",
    replace:
      "        {CV_CLAIM_SECTIONS.map(claimSection)}\n        <SkillSection claimType=\"language\" types={skillTypes} jurisdictions={jurisdictions} entries={[]} draft={null} errors={{}} busy={busy} onDraftChange={() => {}} onStart={() => {}} onCancel={() => {}} onSave={() => {}} onRemove={() => {}} onOpen={() => {}} />",
    guard: GUARD,
    expect: "exactly one skills/languages editor",
  },
  {
    id: "PCB-NC-CREDENTIALS-VANISH",
    defect:
      "the Passport credential sections disappear from the page entirely, leaving profile/CV information as the only thing the Passport shows -- and, before the fix, satisfying the ordering assertion because a missing index is -1",
    file: INFO,
    find: "      {/* ── Security-relevant credentials ─────────────────────────────── */}\n      {PASSPORT_CLAIM_SECTIONS.map(claimSection)}\n",
    replace: "",
    guard: GUARD,
    expect: "the Passport credential sections are rendered at all",
  },
  {
    id: "PCB-NC-PAGES-CONTRADICT",
    defect:
      "the profile page goes back to saying education and languages LIVE in the Security Passport, so the two pages tell the candidate different things about the same facts",
    file: "src/routes/_authenticated.my-career.profile.tsx",
    find: '    "Anställningar och säkerhetsintyg är bevisning i ditt Security Passport. Utbildning, språk och färdigheter hör till din profil och ditt CV — de redigeras tillsammans med Passportet eftersom uppgiften lagras en enda gång och kan granskas där, men de är inte säkerhetsbevisning.",',
    replace:
      '    "Anställningar, utbildningar, intyg och språk bor i Security Passport. Där kan de granskas och verifieras — vilket en profiluppgift aldrig kan.",',
    guard: GUARD,
    expect: "no longer says education and languages LIVE in the Passport",
  },
  {
    id: "PCB-NC-DEEP-LINK-BROKEN",
    defect:
      "the education anchor is dropped, so profile-destinations' deep link lands at the top of a long page instead of the section it names",
    file: INFO,
    find: '            id={section.kind === "education" ? "sp-education" : undefined}',
    replace: "            id={undefined}",
    guard: GUARD,
    expect: "sp-education is still a real id",
  },
];

runControls("passport-cv-boundary", MUTATIONS);
