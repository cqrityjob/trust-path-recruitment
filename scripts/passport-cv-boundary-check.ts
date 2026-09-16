// The boundary between Security Passport evidence and profile/CV information.
//
// ── WHAT THIS DEFENDS ──────────────────────────────────────────────────
//
// The owner's pilot review asked that the Security Passport be short and
// focused: security trust evidence, and nothing else. General education,
// languages, driving licence, ordinary work history, general skills and
// profile prose belong to the candidate's canonical profile/CV.
//
// ── THE UI MOVES; THE DATA DOES NOT ────────────────────────────────────
//
// An earlier attempt at this only RELABELLED the education, language and
// skill editors where they stood, inside /passport/information. The owner's
// review was explicit that relabelling is not enough: the general fields
// must LEAVE the Passport experience so the Passport becomes short. So the
// editors moved to /my-career/profile.
//
// What did NOT move is the data. Every one of those facts is an `sp_claims`
// row and must stay exactly one row with exactly one writer. `sp_claims` is
// where a fact can carry evidence, a review and a verification state --
// which is why education and languages were put there -- and
// profile-destinations.ts records the owner decision behind migration
// 20261007090000 in so many words: copying a Passport fact into a profile
// table "would recreate precisely the two-writer defect it removed".
//
// So the move is a move of the EDITOR, not of the record.
// GeneralProfileClaims mounts the same ClaimEntryForm and SkillSection
// against the same saveClaimEntry/saveSkillEntry write path, and
// cv/source-bundle.ts keeps projecting the same rows into the CV.
//
// This guard asserts every side of that:
//
//   1. The Passport's claim table carries only security-relevant kinds.
//   2. /passport/information renders NO editor for the general kinds --
//      not a relabelled one, not a read-only mirror.
//   3. The profile page DOES render them, through the shared components
//      and the existing write functions.
//   4. Exactly one editor per claim kind across the whole tree: no second
//      table, no copy, no duplicate writer.
//   4b. The old Passport deep links redirect to the new location instead
//      of landing on an anchor that no longer exists.
//   5. The CV reads those same rows, so nothing stops rendering.
//   5b. Both pages tell the candidate the same story about ownership, in
//      both languages.
//   6. The Passport keeps only the anchors it still owns.
//
// Run: bun run passport-cv-boundary:check

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");

const INFO = "src/routes/_authenticated.passport.information.tsx";
const DESTINATIONS = "src/lib/professional-identity/profile-destinations.ts";
const SOURCE_BUNDLE = "src/lib/professional-identity/cv/source-bundle.ts";
const CV_VIEW = "src/components/professional-identity/CvDocumentView.tsx";
const TYPES = "src/lib/professional-identity/types.ts";
const EDITOR = "src/components/professional-identity/GeneralProfileClaims.tsx";
const PROFILE_PAGE = "src/routes/_authenticated.my-career.profile.tsx";
const WORKSPACE = "src/components/security-passport/PassportWorkspace.tsx";
const I18N = "src/lib/security-passport/i18n.ts";

const failures: string[] = [];
let assertions = 0;

function check(ok: boolean, diagnostic: string): void {
  assertions += 1;
  if (!ok) failures.push(diagnostic);
  else console.log(`  ok ${diagnostic}`);
}

/** Comments stripped, so no rule is satisfied by prose about the rule. */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*$/gm, "");
}

const infoRaw = read(INFO);
const info = code(infoRaw);

/* ------------------------------------------------------------------ */
console.log("\n1 · the Passport keeps only security-relevant claim kinds");

const passportTable = /const PASSPORT_CLAIM_SECTIONS[^[]*\[([\s\S]*?)\];/.exec(info)?.[1] ?? "";
check(passportTable.length > 0, "the Passport credential table exists");

for (const kind of ["certification"]) {
  check(
    new RegExp(`"${kind}"`).test(passportTable),
    `${kind} stays a Passport credential — it is security-relevant`,
  );
}
for (const kind of [
  "education",
  "language",
  "practical_skill",
  "training",
  "specialisation",
  "professional_membership",
]) {
  check(
    !new RegExp(`"${kind}"`).test(passportTable),
    `${kind} is NOT a Passport credential section`,
  );
}

/* ------------------------------------------------------------------ */
console.log("\n2 · /passport/information renders no general CV editor");

check(!/<SkillSection/.test(info), "no languages or practical-skills editor on the Passport page");
check(
  !/emptySkillDraft|validateSkill|saveSkillEntry/.test(info),
  "and none of the skill editing machinery is left behind to be re-wired",
);
check(
  !/CV_CLAIM_SECTIONS/.test(info),
  "no general-education section table remains on the Passport page",
);
// The Passport MAY point at the profile. A link is not an editor.
// `info.generalMoved` is a PREFIX of `info.generalMovedLink`, so a loose
// substring test here stayed true with the pointer paragraph deleted and
// only the link label left. Both halves are matched exactly.
check(
  /pt\("info\.generalMoved"\)/.test(info) &&
    /pt\("info\.generalMovedLink"\)/.test(info) &&
    /data-cta="general-profile"/.test(info),
  "it links to the profile instead, which the owner's rule allows",
);
check(
  /const GENERAL_PROFILE_ROUTE = "\/my-career\/profile"/.test(info),
  "and that link points at the profile PAGE, not the overview",
);

/* ------------------------------------------------------------------ */
console.log("\n3 · the profile renders the canonical editors, on the same rows");

const profileEditor = code(read(EDITOR));
const profilePage = read(PROFILE_PAGE);

check(
  /<GeneralProfileClaims/.test(profilePage),
  "the profile page mounts the general profile/CV editors",
);
check(/<SkillSection/.test(profileEditor), "languages and practical skills are edited there");
check(/<ClaimEntryForm/.test(profileEditor), "and general education is edited there");

// THE SAME WRITE PATH. Not a new server function, not a profile table.
for (const fn of ["saveClaimEntry", "saveSkillEntry", "removeEntry"]) {
  check(
    new RegExp(`\\b${fn}\\b`).test(profileEditor),
    `it writes through the existing ${fn} server function`,
  );
}
// Not merely imported -- WIRED. The bare identifier matched the import
// line, so the editor could be pointed at a different read entirely and
// this still passed.
check(
  /useServerFn\(listMyEntries\)/.test(profileEditor),
  "and reads the same sp_claims entries the Passport reads",
);
check(
  !/security_career_profiles/.test(profileEditor),
  "it writes nothing into the profile table — one fact, one row",
);
check(
  !/createServerFn/.test(profileEditor),
  "and defines no server function of its own — no second write path",
);

/* ------------------------------------------------------------------ */
console.log("\n4 · exactly one editor per claim kind");

// Each kind must be editable in exactly one place. This is the assertion
// that would catch "moved the UI but left the old one behind".
for (const kind of [
  "education",
  "language",
  "practical_skill",
  "training",
  "specialisation",
  "professional_membership",
]) {
  const onPassport = new RegExp(`"${kind}"`).test(passportTable);
  const onProfile = new RegExp(`"${kind}"`).test(profileEditor);
  check(!onPassport && onProfile, `${kind} is edited on the profile and nowhere else`);
}
for (const kind of ["certification"]) {
  check(
    !new RegExp(`"${kind}"`).test(profileEditor),
    `${kind} did NOT follow them — security credentials stay in the Passport`,
  );
}

/* ------------------------------------------------------------------ */
console.log("\n4b · old deep links go to the new home rather than failing silently");

const dest = read(DESTINATIONS);
for (const [section, anchor] of [
  ["education", "profile-education"],
  ["skills", "profile-skills"],
  ["languages", "profile-languages"],
] as const) {
  check(
    new RegExp(`${section}: \\{ owner: "profile", href: "/my-career/profile#${anchor}" \\}`).test(
      dest,
    ),
    `profile-destinations routes ${section} to the profile editor`,
  );
  check(profileEditor.includes(`"${anchor}"`), `and ${anchor} is a real id the editor renders`);
}
// A fragment that names nothing is silent, so the retired ones redirect.
for (const old of ["#sp-education", "#sp-languages", "#sp-skills"]) {
  check(
    info.includes(`"${old}"`),
    `the retired ${old} deep link is redirected rather than left to fail quietly`,
  );
}
check(
  /GENERAL_PROFILE_ROUTE, hash: target, replace: true/.test(info),
  "the redirect replaces history, so Back does not bounce between the two pages",
);
// And the Passport's own add-merit control must not offer what moved.
const workspace = code(read(WORKSPACE));
check(
  !/hash: "sp-education"/.test(workspace),
  "the add-a-merit chooser no longer points at the retired education anchor",
);
check(/hash: "sp-credentials"/.test(workspace), "it points at the credential sections that remain");
check(/id="sp-credentials"/.test(info), "and that anchor is a real id on the Passport page");

/* ------------------------------------------------------------------ */
console.log("\n5 · the CV reads those same rows, so nothing stops rendering");

const types = read(TYPES);
check(
  /EDUCATION_CLAIM_TYPES/.test(types) &&
    /LANGUAGE_CLAIM_TYPES/.test(types) &&
    /SKILL_CLAIM_TYPES/.test(types),
  "the claim-type classification exists",
);
const bundle = read(SOURCE_BUNDLE);
for (const konst of ["EDUCATION_CLAIM_TYPES", "LANGUAGE_CLAIM_TYPES", "SKILL_CLAIM_TYPES"]) {
  check(
    bundle.includes(konst),
    `the CV source bundle projects ${konst} from the same sp_claims rows`,
  );
}
const cvView = read(CV_VIEW);
check(
  /doc\.education/.test(cvView) && /doc\.languages/.test(cvView) && /doc\.skills/.test(cvView),
  "and the CV renders education, languages and skills",
);

/* ------------------------------------------------------------------ */
console.log("\n5b · the two pages do not contradict each other about ownership");

// The profile page and the Passport page both describe the split. If they
// disagree, one of them is lying to the candidate -- and the profile page
// used to say, in so many words, that education and languages "live in the
// Security Passport", which is what the review read as the product calling
// CV facts Passport content.
check(
  !/utbildningar, intyg och språk bor i Security Passport/i.test(profilePage),
  "the profile page no longer says education and languages LIVE in the Passport",
);
check(
  /hör till din profil och ditt CV/i.test(profilePage) &&
    /belong to your profile and CV/i.test(profilePage),
  "it says, in both languages, that they belong to the profile and CV",
);
check(
  /inte säkerhetsbevisning/i.test(profilePage) && /not security evidence/i.test(profilePage),
  "and that they are not security evidence, in both languages",
);

// The Passport's pointer is the other half of the same sentence. If only
// one page denies it, a candidate who reads the other one still has no
// answer to "is my degree trust evidence?" -- and the pointer is now the
// ONLY thing the Passport says about these fields, so it carries the whole
// statement on its own.
const i18n = read(I18N);
const movedCopy = [...i18n.matchAll(/"info\.generalMoved":\s*"([^"]+)"/g)].map((m) => m[1]);
// Exactly two: the sv dictionary and the en one. Asserted before the two
// index reads below, so a dictionary that lost the key fails HERE rather
// than passing an `undefined` into a regex that then reads as "absent".
check(
  movedCopy.length === 2,
  `info.generalMoved is defined in both dictionaries (found ${movedCopy.length})`,
);
check(
  movedCopy.length === 2 && /inte säkerhetsbevisning/i.test(movedCopy[0]),
  "the Swedish Passport pointer also says these are not security evidence",
);
check(
  movedCopy.length === 2 && /not security evidence/i.test(movedCopy[1]),
  "and so does the English one — neither page denies it alone",
);

// The region heading these fields used to carry on the Passport is gone,
// so its copy keys must be gone too. A key left behind is how the region
// gets quietly reinstated later.
check(
  !/"info\.cvSection\./.test(i18n),
  "the removed CV region's copy keys are deleted rather than orphaned",
);
check(
  /(redigeras här nedan|edited below)/i.test(profilePage),
  "and says the general facts are edited HERE, on the profile",
);
check(
  /(redigeras där|edited there)/i.test(profilePage),
  "while security evidence is edited in the Passport",
);
check(
  /(lagras en enda gång|stored exactly once)/i.test(profilePage),
  "and that the fact is stored exactly once wherever it is entered",
);

/* ------------------------------------------------------------------ */
console.log("\n6 · the Passport keeps only the anchors it still owns");

// ── THE OWNER SUPERSEDED THE EDITOR LOCATION, NOT THE EVIDENCE BOUNDARY ─
//
// This assertion used to read "employment evidence is Passport content and
// is still EDITED there", and I treated the second half as immutable and
// reported the relocation as blocked. The owner corrected that directly:
//
//   "The sp-employment section may remain a real Passport section and
//    anchor. Employment evidence has not moved. However, the general
//    authoring editor for employment history must move to the canonical
//    Profile workspace. Do not interpret 'employment evidence did not
//    move' as 'employment history must still be authored inside Passport'."
//
// So the boundary is unchanged and sharper: Profile/CV owns AUTHORING of
// general personal and career information; the Security Passport owns
// evidence, provenance, verification and sharing. Both halves are now
// asserted, because a one-sided assertion is what let the two be confused.
check(
  infoRaw.includes('"sp-employment"'),
  "sp-employment is still a real Passport section — evidence and verification did not move",
);
// Bound to the employment section's OWN evidence control, not to the copy
// key: that key appears twice on this page, so a page-wide search stayed
// true with the employment one removed — which a negative control caught.
check(
  infoRaw.includes('to="/my-career/profile"') && !infoRaw.includes('openEntry("experience", e.id)'),
  "employment anchor points to the canonical profile without rendering CV history",
);

// 1 · The authoring editor is mounted on the profile, and only there.
{
  const EDITOR = "src/components/professional-identity/EmploymentHistoryEditor.tsx";
  const editor = read(EDITOR);
  const profileRoute = read("src/routes/_authenticated.my-career.profile.tsx");
  const destinations = read("src/lib/professional-identity/profile-destinations.ts");
  check(
    profileRoute.includes("<EmploymentHistoryEditor"),
    "the canonical employment authoring editor is mounted on /my-career/profile",
  );
  check(
    editor.includes("<ExperienceForm"),
    "and it mounts the EXISTING ExperienceForm rather than a second implementation",
  );
  // 2 · The Passport mounts no duplicate authoring editor.
  check(
    !infoRaw.includes("<ExperienceForm"),
    "the Passport mounts no employment authoring form — one editor, one place",
  );
  check(!/saveExperienceEntry/.test(infoRaw), "and it no longer holds the employment write path");
  // 3 · The same canonical record and writer.
  // Bound to the CALL, not the import. A negative control proved that
  // checking for the identifier alone passed with the writer replaced by a
  // stub, because the import line still carried the name.
  check(
    editor.includes("useServerFn(saveExperienceEntry)") &&
      editor.includes("useServerFn(listMyEntries)"),
    "the editor reuses the canonical employment reader and writer",
  );

  // The destination map must keep sending general employment here.
  // ── THE MARKET SELECTOR IS A FILTER, NOT AN ANSWER ──────────────────
  //
  // The owner separated two things that had been one control: the PERSISTED
  // work-country fact, whose editor is on the profile, and the Passport's
  // catalogue BROWSING filter, which changes what is displayed and nothing
  // else. Looking at what Great Britain regulates is not a statement that
  // you work there.
  //
  // Comments stripped first: the route explains that the filter never
  // writes, and a raw search matches that sentence as readily as a call.
  const infoCode = infoRaw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  check(
    infoRaw.includes("data-market-filter"),
    "the Passport keeps a market selector for browsing its catalogue",
  );
  check(
    !/useServerFn\(setWorkCountry\)|setWorkCountry\(\{/.test(infoCode),
    "and it never writes the work country — that is the profile's one editor",
  );
  check(
    /const \[browseMarket, setBrowseMarket\] = useState/.test(infoCode),
    "the filter is local state, discarded when the page is left",
  );
  check(
    /browseMarket \?\? undefined/.test(infoCode),
    "and the catalogue read follows it without persisting it",
  );
  check(
    infoRaw.includes("data-saved-work-country"),
    "the saved market is stated read-only beside it, so a browse is never mistaken for the answer",
  );

  check(
    destinations.includes(
      'employment: { owner: "profile", href: "/my-career/profile#profile-employment" }',
    ),
    "the employment destination is the profile workspace, not the Passport",
  );
  check(!editor.includes("createServerFn"), "and defines no server function of its own");
  // 4 · Evidence, reviewer decisions and verification do not follow it.
  const editorCode = editor.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  for (const leak of [
    "requestVerification",
    "reviewerDecision",
    "recordDecision",
    "evidenceUrl",
    "uploadEvidence",
  ]) {
    check(
      !editorCode.includes(leak),
      `the profile editor must not carry ${leak} — evidence and verification stay in the Passport`,
    );
  }
  // 5 · Neither side becomes a dead end.
  check(
    editor.includes("sp-employment"),
    "the profile editor links to the Passport section that documents and verifies these rows",
  );
  check(
    infoRaw.includes("profile-employment"),
    "and the Passport section links to the canonical editor",
  );

  // ── BASICS AND WORK COUNTRY FOLLOWED THE SAME RULE ──────────────────
  //
  // Neither is security evidence. Their editors moved to the profile with
  // the same treatment: the existing components, the existing writers, the
  // same rows — and the Passport's anchors kept alive as pointers so no
  // deep link lands on nothing.
  const basicsSection = read("src/components/professional-identity/ProfileBasicsSection.tsx");
  check(
    profileRoute.includes("<ProfileBasicsSection"),
    "basic information and work country are edited on /my-career/profile",
  );
  check(
    basicsSection.includes("<ProfileBasicsCard") && basicsSection.includes("<WorkCountryCard"),
    "and they mount the EXISTING cards rather than second implementations",
  );
  check(
    basicsSection.includes("useServerFn(savePassportBasics)") &&
      basicsSection.includes("useServerFn(setWorkCountry)"),
    "through the canonical basics and work-country writers",
  );
  check(
    !infoRaw.includes("<ProfileBasicsCard") && !infoRaw.includes("<WorkCountryCard"),
    "the Passport mounts neither card — one editor, one place",
  );
  check(
    !/useServerFn\(savePassportBasics\)|useServerFn\(setWorkCountry\)/.test(infoRaw),
    "and no longer holds their write paths",
  );
  // The deep links the move could have killed.
  // RENDERED, not merely referenced. This checked for the bare string and
  // passed while #sp-work-country was dead: its id= lived inside
  // WorkCountryCard, so removing that card took the anchor with it while
  // the route still mentioned the name in a comment and a getElementById
  // call. The browser suite caught what this did not.
  for (const anchorId of ["sp-profile-basics", "sp-work-country", "sp-employment"]) {
    check(
      new RegExp(`id=\\{?"${anchorId}"`).test(infoRaw) ||
        new RegExp("id=\\{`" + anchorId + "`\\}").test(infoRaw),
      `#${anchorId} must be RENDERED on the Passport — a moved editor must not kill a live deep link`,
    );
  }
  check(
    destinations.includes(
      'identity: { owner: "profile", href: "/my-career/profile#profile-basics" }',
    ) &&
      destinations.includes(
        'location: { owner: "profile", href: "/my-career/profile#profile-work-country" }',
      ),
    "and the destination map sends basics and work country to the profile",
  );
}
for (const retired of ["sp-education", "sp-languages", "sp-skills"]) {
  check(
    !new RegExp(`id=\\{?"${retired}"`).test(infoRaw) && !infoRaw.includes(`id="${retired}"`),
    `${retired} is no longer an id on the Passport page — its editor left`,
  );
}

/* ------------------------------------------------------------------ */
console.log("");
if (failures.length > 0) {
  console.error(`passport-cv-boundary-check FAILED (${failures.length} of ${assertions}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`Passport/CV boundary: ${assertions} of ${assertions} assertions passed.`);
