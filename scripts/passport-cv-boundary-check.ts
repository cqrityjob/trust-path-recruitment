// The boundary between Security Passport evidence and profile/CV information.
//
// ── WHAT THIS DEFENDS ──────────────────────────────────────────────────
//
// The owner's pilot review asked that the Security Passport be short and
// focused: security trust evidence, and nothing else. General education,
// languages, driving licence, ordinary work history, general skills and
// profile prose belong to the candidate's canonical profile/CV.
//
// ── WHY THE FIX IS PRESENTATIONAL, AND WHY THAT IS THE RIGHT FIX ───────
//
// Every one of those facts is an `sp_claims` row, and must stay one.
// `sp_claims` is where a fact can carry evidence, a review and a
// verification state -- which is why education and languages were put there
// -- and profile-destinations.ts records the owner decision behind migration
// 20261007090000 in so many words: copying a Passport fact into a profile
// table "would recreate precisely the two-writer defect it removed".
//
// The single source of truth the review asks for therefore already exists:
// cv/source-bundle.ts projects education, languages and skills out of those
// same rows, and CvDocumentView renders them. What was missing was the
// Passport page SAYING which of the two products each section belongs to.
//
// So this guard asserts the boundary in both directions:
//
//   1. The CV-owned sections are inside a region that names them as profile
//      and CV information, and that region says they are not the security
//      evidence the Passport carries.
//   2. They are NOT in the Passport's own credential table.
//   3. The security-relevant kinds ARE, and did not follow them across.
//   4. One row, one writer: no second table, no copy, no duplicate editor.
//   5. The CV reads those same rows, so nothing stops rendering.
//   6. The deep links that point at these sections still resolve.
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
console.log("\n1 · the two section tables are split by product");

const passportTable = /const PASSPORT_CLAIM_SECTIONS[^[]*\[([\s\S]*?)\];/.exec(info)?.[1] ?? "";
const cvTable = /const CV_CLAIM_SECTIONS[^[]*\[([\s\S]*?)\];/.exec(info)?.[1] ?? "";

check(passportTable.length > 0, "the Passport credential table exists");
check(cvTable.length > 0, "the CV information table exists");

check(
  !/"education"/.test(passportTable),
  "general education is NOT a Passport credential section",
);
check(/"education"/.test(cvTable), "it is a CV information section");

for (const kind of ["training", "certification", "specialisation", "professional_membership"]) {
  check(
    new RegExp(`"${kind}"`).test(passportTable),
    `${kind} stays a Passport credential — it is security-relevant`,
  );
  check(
    !new RegExp(`"${kind}"`).test(cvTable),
    `and did not follow education across into CV information`,
  );
}

/* ------------------------------------------------------------------ */
console.log("\n2 · CV-owned sections render inside a region that names them");

const region = info.slice(
  info.indexOf('aria-labelledby="sp-cv-information-heading"'),
  info.lastIndexOf("</section>"),
);
check(region.length > 0, "the profile/CV region exists and is labelled");
check(
  /CV_CLAIM_SECTIONS\.map\(claimSection\)/.test(region),
  "education is rendered inside it",
);
check(/<SkillSection/.test(region), "languages and practical skills are rendered inside it");
check(
  /info\.cvSection\.title/.test(region) && /info\.cvSection\.lead/.test(region),
  "and the region carries its own heading and explanation",
);

// Security evidence comes first on the page; profile/CV information follows.
//
// BOTH indices are required to exist. A bare `a < b` on two indexOf results
// is true whenever the first is missing, because -1 is less than everything
// -- so deleting the Passport credential sections altogether would have
// SATISFIED this assertion. PCB-NC-ORDER-INVERTED found exactly that, which
// is what a negative control is for.
const passportIdx = info.indexOf("PASSPORT_CLAIM_SECTIONS.map(claimSection)");
const cvRegionIdx = info.indexOf('aria-labelledby="sp-cv-information-heading"');
check(passportIdx >= 0, "the Passport credential sections are rendered at all");
check(cvRegionIdx >= 0, "and the profile/CV region is rendered at all");
check(
  passportIdx >= 0 && cvRegionIdx >= 0 && passportIdx < cvRegionIdx,
  "security evidence comes first; profile/CV information follows it",
);

/* ------------------------------------------------------------------ */
console.log("\n3 · the copy says what the boundary is");

const i18n = read("src/lib/security-passport/i18n.ts");
for (const key of ["info.cvSection.title", "info.cvSection.lead"]) {
  const n = i18n.split(`"${key}":`).length - 1;
  check(n === 2, `${key} is authored in Swedish and English (found ${n})`);
}
check(
  /inte till säkerhetsbevisningen/i.test(i18n),
  "the Swedish lead says these are NOT the Passport's security evidence",
);
check(
  /not to the security evidence your Passport carries/i.test(i18n),
  "and the English lead says the same",
);

/* ------------------------------------------------------------------ */
console.log("\n4 · one fact, one row, one writer");

// No second storage. The fix must never have been "copy it somewhere else".
check(
  !/security_career_profiles/.test(info),
  "the Passport information page writes nothing into the profile table",
);
check(
  (infoRaw.match(/<SkillSection/g) ?? []).length === 1,
  "there is exactly one skills/languages editor, not one per region",
);
check(
  (info.match(/const claimSection =/g) ?? []).length === 1,
  "and one claim-section renderer shared by both groups, not two copies",
);

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
console.log("\n6 · nothing that pointed at these sections is now a dead link");

const dest = read(DESTINATIONS);
for (const anchor of ["sp-education", "sp-languages", "sp-skills", "sp-employment"]) {
  if (!dest.includes(anchor)) continue;
  check(
    infoRaw.includes(`"${anchor}"`),
    `${anchor} is still a real id on the page that profile-destinations points at`,
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
