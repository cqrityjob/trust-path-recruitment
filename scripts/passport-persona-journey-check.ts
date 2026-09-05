/**
 * Security Passport — the three market personas, driven through the RENDER path.
 *
 * ── WHY THIS EXISTS BESIDE THE ENGINE CHECK ────────────────────────────
 *
 * `passport-identity-engine:check` proves what the engine DERIVES.
 * This proves what a person is TOLD, which is a different question and the
 * one a pilot customer actually experiences. A derivation can be perfectly
 * correct and still reach a reader as the wrong sentence — that is precisely
 * how the jurisdiction label came to say "Sverige" on screen and "SE" on the
 * PNG rendered from the same model.
 *
 * Three personas, because the product claims three markets and only one of
 * them is open:
 *
 *   Sweden   ACTIVE. Every realistic state a Swedish worker moves through.
 *   UK       AUTHORED, INACTIVE. Must fail closed and SAY so.
 *   Dubai    AUTHORED, INACTIVE. Same, plus the emirate must never be lost.
 *
 * ── THE INVARIANT THIS SUITE DEFENDS ───────────────────────────────────
 *
 * Training may show as training. Training must never become an active title,
 * a licence, an appointment or current eligibility. The Swedish states below
 * walk a real career from "only VU1" to "appointed, then expired", asserting
 * at every step that the headline says no more than the evidence supports.
 *
 * Run: bun run passport-persona-journey:check
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { deriveVerifiedIdentity } from "../src/lib/security-passport/identity/visibility";
import { MIRRORED_TITLE_RULES } from "../src/lib/security-passport/identity/market-rules";
import {
  eligibilityTitles,
  headlineTitles,
  professionLine,
  toPublicEligibility,
} from "../src/lib/security-passport/identity/presentation";
import { formatJurisdiction } from "../src/lib/security-passport/format";
import { passportCopy } from "../src/lib/security-passport/i18n";
import {
  ONBOARDING_STEPS,
  confirmedWorkLocation,
  needsWorkLocationConfirmation,
  splitWorkCountry,
} from "../src/lib/security-passport/onboarding";
import type { Claim, LifecycleState, AssertionLevel } from "../src/lib/security-passport/types";

const TODAY = "2026-08-24";
const ROOT = join(import.meta.dir, "..");

let checks = 0;
const failures: string[] = [];

function assert(condition: boolean, label: string) {
  checks += 1;
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures.push(label);
    console.log(`  FAIL ${label}`);
  }
}

let seq = 0;
function claim(
  credentialCode: string,
  o: {
    assertion?: AssertionLevel;
    lifecycle?: LifecycleState;
    validUntil?: string | null;
    jurisdiction?: string | null;
    subJurisdiction?: string | null;
    scope?: string | null;
  } = {},
): Claim {
  seq += 1;
  return {
    id: `c-${seq}`,
    claimType: "training",
    credentialCode,
    skillCode: null,
    skillLevel: null,
    titleSv: credentialCode,
    titleEn: credentialCode,
    issuerName: "Fixture issuer",
    jurisdictionCode: (o.jurisdiction ?? "SE") as Claim["jurisdictionCode"],
    subJurisdictionCode: o.subJurisdiction ?? null,
    authorisationScope: o.scope ?? null,
    issuedOn: "2025-01-01",
    validFrom: "2025-01-01",
    validUntil: o.validUntil === undefined ? "2028-01-01" : o.validUntil,
    assertionLevel: o.assertion ?? "verified",
    lifecycleState: o.lifecycle ?? "active",
    // SOURCE-CONFIRMED by default (owner decision, 2026-09-05): the journeys
    // below are about what confirmed credentials support. A CQrityjob
    // document review is DOCUMENTED and supports no title or eligibility --
    // asserted explicitly at the end of this file.
    verifierName: "Fixture issuer",
    verificationMethod: "issuer_confirmation" as const,
    verifiedOn: "2026-01-01",
    limitationSv: null,
    limitationEn: null,
    versionNo: 1,
    supersedesClaimId: null,
  };
}

const derive = (claims: readonly Claim[]) =>
  deriveVerifiedIdentity(claims, MIRRORED_TITLE_RULES, TODAY);

/** The words that may only ever appear because an APPOINTMENT or LICENCE was
 *  derived — never because a course was completed. Checked as whole words so
 *  "Väktarutbildning" does not trip the "Väktare" probe. */
const APPOINTMENT_WORDS = [
  "Ordningsvakt",
  "Skyddsvakt",
  "Public Order Guard",
  "Protective Security Guard",
];

function headlineFor(claims: readonly Claim[]) {
  const id = derive(claims);
  return {
    id,
    sv: professionLine(id, "sv", "(none)"),
    en: professionLine(id, "en", "(none)"),
    kinds: headlineTitles(id).map((t) => t.outputKind),
  };
}

/* ══════════════════════════════════════════════════════════════════════
   PERSONA 1 — SWEDEN. The only open market, walked as a real career.
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nPERSONA 1 -- Sweden");

// A. only VU1
{
  const h = headlineFor([claim("VU1")]);
  assert(
    h.kinds.every((k) => k === "education_completed"),
    "1A VU1 alone is EDUCATION and nothing higher",
  );
  assert(
    !APPOINTMENT_WORDS.some((w) => h.sv.includes(w) || h.en.includes(w)),
    "1A VU1 alone names no appointment",
  );
  assert(h.id.activeTitles.length === 0, "1A VU1 alone produces no active title");
}

// B. VU1 + VU2
{
  const h = headlineFor([claim("VU1"), claim("VU2")]);
  assert(h.id.activeTitles.length === 0, "1B VU1+VU2 produces NO active title");
  assert(h.id.localEligibility.length === 0, "1B VU1+VU2 produces NO current eligibility");
  assert(
    h.sv.includes("utbildning") && /Training/i.test(h.en),
    "1B VU1+VU2 headline says TRAINING in both languages",
  );
  assert(
    !APPOINTMENT_WORDS.some((w) => h.sv === w || h.en === w),
    "1B VU1+VU2 headline is never the bare appointment word",
  );
}

// C. VU1 + VU2 + verified personnel approval — the working vaktare
{
  const h = headlineFor([claim("VU1"), claim("VU2"), claim("SE_PERSONNEL_APPROVAL")]);
  assert(h.id.activeTitles.length === 0, "1C personnel approval still grants NO active title");
  assert(
    h.id.localEligibility.length === 1,
    "1C personnel approval IS derived as current local eligibility",
  );
}

/* -- GAP 1: training and current eligibility are SEPARATE facts ------ */

// VU1 + VU2 only -> training shown, NO current eligibility.
{
  const h = headlineFor([claim("VU1"), claim("VU2")]);
  assert(
    eligibilityTitles(h.id).length === 0,
    "1B-elig VU1+VU2 alone produces NO current eligibility line",
  );
  assert(
    /Training|utbildning/i.test(h.en + h.sv),
    "1B-elig and the training is still shown, as training",
  );
}

// VU1 + VU2 + verified personnel approval -> BOTH, separately, no title.
{
  const claims = [claim("VU1"), claim("VU2"), claim("SE_PERSONNEL_APPROVAL")];
  const h = headlineFor(claims);
  const elig = eligibilityTitles(h.id);

  assert(elig.length === 1, "1C-elig a verified personnel approval DOES produce an eligibility");
  assert(
    elig[0].nameEn === "Personnel approval checked",
    "1C-elig and it is named as a CHECK, not as a title",
  );
  assert(
    /Training|utbildning/i.test(h.en + h.sv),
    "1C-elig the headline still shows the TRAINING, separately",
  );
  assert(
    h.id.activeTitles.length === 0,
    "1C-elig and no appointment, licence or active title is invented",
  );
  assert(
    !APPOINTMENT_WORDS.some((w) => elig.some((e) => e.nameEn === w || e.nameLocal === w)),
    "1C-elig the eligibility line never carries an appointment word",
  );
  const pub = toPublicEligibility(h.id);
  for (const key of [
    "expiresOn",
    "sourceClaimIds",
    "scopeRestriction",
    "evidence",
    "selfDeclared",
  ]) {
    assert(
      pub.every((t) => !(key in t)),
      "1C-elig public eligibility carries no '" + key + "'",
    );
  }
}

// A dead approval must never read as current eligibility.
for (const st of ["expired", "revoked", "disputed", "superseded", "draft"] as LifecycleState[]) {
  const h = headlineFor([
    claim("VU1"),
    claim("VU2"),
    claim("SE_PERSONNEL_APPROVAL", { lifecycle: st }),
  ]);
  assert(
    eligibilityTitles(h.id).length === 0,
    "1C-elig a '" + st + "' approval shows NO current eligibility",
  );
}
{
  const h = headlineFor([
    claim("VU1"),
    claim("VU2"),
    claim("SE_PERSONNEL_APPROVAL", { validUntil: "2026-01-01" }),
  ]);
  assert(
    eligibilityTitles(h.id).length === 0,
    "1C-elig an approval that simply ran out shows NO current eligibility",
  );
}
{
  const h = headlineFor([
    claim("VU1"),
    claim("VU2"),
    claim("SE_PERSONNEL_APPROVAL", { assertion: "self_declared" }),
  ]);
  assert(
    eligibilityTitles(h.id).length === 0,
    "1C-elig a self-declared approval is NOT current eligibility to a recipient",
  );
}

// The eligibility line must actually be rendered, on the surfaces that may.
{
  const RENDERS = [
    "src/components/security-passport/PassportOverview.tsx",
    "src/components/security-passport/PassportCard.tsx",
    "src/components/security-passport/RecipientVerification.tsx",
    "src/components/security-passport/live/RecipientPassportCard.tsx",
  ];
  for (const rel of RENDERS) {
    // `<EligibilityLine`, not merely the import: deleting the JSX and leaving
    // the import behind is exactly the regression an includes() check misses.
    assert(
      /<EligibilityLine[\s/>]/.test(readFileSync(join(ROOT, rel), "utf8")),
      rel + " renders the eligibility line",
    );
  }
  assert(
    readFileSync(join(ROOT, "src/routes/p.$token.tsx"), "utf8").includes(
      'pt("identity.eligibility")',
    ),
    "the public token page renders the eligibility row",
  );
  const social = readFileSync(join(ROOT, "src/lib/security-passport/social.ts"), "utf8");
  const socialCode = social.replace(/\/\/[^\n]*/g, "");
  assert(
    !/eligibility/i.test(socialCode),
    "the social image publishes NO eligibility outside its explanatory comment",
  );
  assert(
    /ELIGIBILITY IS DELIBERATELY ABSENT/.test(social),
    "and records that omission as a decision rather than leaving it a gap",
  );
}

// D. Ordningsvakt appointment
{
  const h = headlineFor([claim("OV")]);
  assert(h.kinds.includes("active_title"), "1D an OV appointment DOES produce an active title");
  assert(h.sv === "Ordningsvakt", "1D and the Swedish reader sees the legal word");
}

// E. Skyddsvakt with an authorisation scope
{
  const h = headlineFor([claim("SV", { scope: "Skyddsobjekt: Hamnen, Kaj 12" })]);
  assert(h.kinds.includes("active_title"), "1E an SV approval produces an active title");
  assert(
    h.id.activeTitles[0]?.scopeRestriction === "Skyddsobjekt: Hamnen, Kaj 12",
    "1E and the scope travels WITH the title rather than being dropped",
  );
}

// F. expired appointment
{
  const h = headlineFor([claim("OV", { validUntil: "2026-01-01" })]);
  assert(h.sv === "(none)", "1F an appointment that lapsed derives NOTHING, without a sweep job");
}

// G. corrected appointment — superseded must not survive alongside its replacement
{
  const h = headlineFor([
    claim("OV", { lifecycle: "superseded", scope: "WRONG — corrected away" }),
    claim("OV", { scope: "Stockholm C" }),
  ]);
  assert(
    h.id.activeTitles[0]?.scopeRestriction === "Stockholm C",
    "1G a corrected appointment shows only the CORRECTED scope",
  );
}

// H. self-reported vs verified
{
  const h = headlineFor([claim("OV", { assertion: "self_declared" })]);
  assert(h.sv === "(none)", "1H a self-declared appointment reaches NO recipient-facing headline");
}

// Every non-active lifecycle state must derive nothing.
for (const st of ["superseded", "revoked", "disputed", "expired", "draft"] as LifecycleState[]) {
  const h = headlineFor([claim("OV", { lifecycle: st })]);
  assert(h.sv === "(none)", `1H lifecycle '${st}' derives no title`);
}

/* ══════════════════════════════════════════════════════════════════════
   PERSONAS 2 & 3 — UK and Dubai. Authored, closed, and honest about it.
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nPERSONA 2/3 -- United Kingdom and Dubai (inactive packs)");

const foundation = readFileSync(
  join(ROOT, "supabase/migrations/20260907090000_sp_three_market_foundation.sql"),
  "utf8",
);

for (const pack of ["GB", "AE-DU"]) {
  const row = new RegExp(`\\('${pack}',[\\s\\S]{0,200}?'pending', false`).test(foundation);
  assert(row, `${pack} ships pending + inactive in the foundation seed`);
}
assert(
  /CONSTRAINT sp_market_pack_active_needs_review[\s\S]{0,200}?legal_review_state IN \('approved', 'grandfathered'\)/.test(
    foundation,
  ),
  "and a CHECK constraint — not a convention — stops an unreviewed pack being switched on",
);

// A GB or AE-DU credential cannot derive anything: the mirror carries no rule
// for a market that is not open, so an inactive market fails closed in the
// engine as well as at the write.
for (const [label, c] of [
  ["UK SIA licence", claim("UK_SIA_LICENCE_DS", { jurisdiction: "GB" })],
  ["UK security guard training", claim("UK_SIA_TRAINING_SG", { jurisdiction: "GB" })],
  [
    "Dubai cadre card",
    claim("AE_DU_CADRE_GUARD", { jurisdiction: "AE", subJurisdiction: "AE-DU" }),
  ],
  [
    "Dubai SIRA course",
    claim("AE_DU_SIRA_COURSE_GUARD", { jurisdiction: "AE", subJurisdiction: "AE-DU" }),
  ],
] as const) {
  const h = headlineFor([c]);
  assert(h.sv === "(none)", `${label} in a closed market derives no title at all`);
}

// The Dubai titles must keep their emirate, so a cadre card can never be read
// as a UAE-wide licence. Asserted on the authored labels themselves.
const titleLabel = readFileSync(
  join(ROOT, "supabase/migrations/20260908091000_sp_title_country_and_training_label.sql"),
  "utf8",
);
const dubaiTitleLines = titleLabel.split("\n").filter((l) => l.includes("SIRA cadre card"));
assert(dubaiTitleLines.length >= 3, "the three Dubai titles are present in the label migration");
assert(
  dubaiTitleLines.every((l) => l.includes("Dubai")),
  "every Dubai title names its EMIRATE, so none reads as a UAE-wide licence",
);
assert(
  /AND name_en NOT LIKE '%Dubai%'[\s\S]{0,160}?RAISE EXCEPTION/.test(titleLabel),
  "and the migration itself aborts if a Dubai title ever loses its emirate",
);

/* ══════════════════════════════════════════════════════════════════════
   JURISDICTION IS RENDERED FROM STRUCTURED DATA — ONCE
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nJURISDICTION -- one formatter, every surface, exports included");

assert(formatJurisdiction("SE", "sv") === "Sverige", "SE renders as Sverige to a Swedish reader");
assert(formatJurisdiction("SE", "en") === "Sweden", "SE renders as Sweden to an English reader");
assert(formatJurisdiction("GB", "en") === "United Kingdom", "GB has a name, not a bare code");
assert(formatJurisdiction("AE", "en") === "United Arab Emirates", "AE has a name, not a bare code");
assert(formatJurisdiction("AE-DU", "en") === "Dubai", "AE-DU renders as the EMIRATE");
assert(
  formatJurisdiction("AE-DU", "en") !== formatJurisdiction("AE", "en"),
  "and the emirate is never collapsed into its country",
);
assert(formatJurisdiction("ZZ", "en") === "ZZ", "an unreviewed code returns ITSELF, never a guess");

// The regression that motivated the formatter: the surfaces must not carry
// their own copy of the mapping, and the two EXPORT paths must use it.
// A WHOLE-TREE sweep, not a list.
//
// The first version of this check named seven files. Four more surfaces were
// carrying their own copy of the ternary — useCardContent, RecipientPassportCard
// and p.$token twice — and a fixed list cannot find the one nobody remembered
// to add. Walking the tree means a NEW surface with a private mapping fails
// this check on the day it is written.
{
  const dirs = ["src/components/security-passport", "src/lib/security-passport", "src/routes"];
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.tsx?$/.test(e.name)) files.push(rel);
    }
  };
  for (const d of dirs) walk(d);

  const offenders = files.filter((rel) =>
    /jurisdiction[A-Za-z]*\s*===\s*"[A-Z]{2}"\s*\?/.test(readFileSync(join(ROOT, rel), "utf8")),
  );
  assert(
    offenders.length === 0,
    "no Passport surface maps a jurisdiction code by hand (found: " +
      (offenders.join(", ") || "none") +
      ")",
  );
  assert(files.length > 50, `the sweep actually walked the tree (${files.length} files)`);
}

const SURFACES = [
  "src/components/security-passport/PassportCard.tsx",
  "src/components/security-passport/PassportOverview.tsx",
  "src/components/security-passport/RecipientVerification.tsx",
  "src/components/security-passport/ClaimRow.tsx",
  "src/components/security-passport/social/SocialFrame.tsx",
  "src/components/security-passport/live/LinkedInShareSection.tsx",
  "src/lib/security-passport/share-image.ts",
  // The public token page was missed on the first pass and carried its own
  // copy of the ternary; it is in the list now so it cannot drift again.
  "src/routes/p.$token.tsx",
];
for (const rel of SURFACES) {
  const src = readFileSync(join(ROOT, rel), "utf8");
  // `formatWorkLocation` counts: it is the shared formatter for a HOLDER's
  // work location and delegates to `formatJurisdiction` for both halves. What
  // must never come back is a surface formatting a jurisdiction by itself.
  assert(
    src.includes("formatJurisdiction(") || src.includes("formatWorkLocation("),
    `${rel} renders the jurisdiction through a shared formatter`,
  );
  assert(
    !/jurisdictionCode\s*===\s*"SE"\s*\?/.test(src),
    `${rel} carries no private copy of the SE-only mapping`,
  );
  assert(
    !/·\s*\$\{[a-zA-Z.]*jurisdictionCode\}/.test(src),
    `${rel} never interpolates a RAW jurisdiction code into reader-facing text`,
  );
}

// An identity line is assembled from parts that can legitimately be absent —
// `displayName` is `?? ""` upstream, and a jurisdiction nobody has stated
// renders as "not stated". Interpolating those between literal "·" produced a
// line opening with a dangling separator, which reads as a value that failed
// to load rather than one nobody has given yet. Joining a filtered list cannot
// produce a leading, trailing or doubled separator for ANY combination.
{
  const rel = "src/components/security-passport/PassportOverview.tsx";
  const src = readFileSync(join(ROOT, rel), "utf8");
  assert(
    !/\{holder\.displayName\}\s*·/.test(src),
    `${rel} does not interpolate the display name against a literal separator`,
  );
  assert(
    /\.join\(" · "\)/.test(src),
    `${rel} builds the identity line by joining the parts that exist`,
  );
}

/* ══════════════════════════════════════════════════════════════════════
   A CLOSED MARKET IS STATED, NOT MERELY OMITTED
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nMARKET AVAILABILITY -- fails closed AND says so");

for (const lang of ["sv", "en"] as const) {
  const copy = passportCopy[lang]["jurisdiction.marketAvailability"];
  assert(Boolean(copy && copy.length > 40), `${lang}: the availability note exists`);
  assert(
    /Dubai/.test(copy) && /(Storbritannien|United Kingdom)/.test(copy),
    `${lang}: it NAMES the markets a reader might be looking for`,
  );
  assert(
    !/\b20\d\d\b/.test(copy),
    `${lang}: and promises no date, because no launch date is known`,
  );
}

assert(
  readFileSync(join(ROOT, "src/components/security-passport/CredentialForm.tsx"), "utf8").includes(
    'pt("jurisdiction.marketAvailability")',
  ),
  "the credential form's country field says a closed market is closed",
);

/* ══════════════════════════════════════════════════════════════════════
   WHERE A PERSON WORKS IS NOT WHICH CREDENTIALS ARE SUPPORTED
   ══════════════════════════════════════════════════════════════════════

   The defect this defends: the onboarding country step offered Sweden and
   nothing else, because it was built from the ACTIVE market packs. A holder
   working in Dubai could not say so, `sp_passport_profiles.jurisdiction_code`
   kept its `DEFAULT 'SE'`, and their Passport Card then told every reader they
   were in Sweden — the product asserting a false country about a real person.

   The two questions are independent and must stay that way:

     * the WORK COUNTRY list is the countries `sp_jurisdictions` holds, which
       is what the profile column's foreign key accepts;
     * CREDENTIAL availability remains the ACTIVE market packs alone.

   Widening the first must never widen the second.                        */
console.log("\nWORK COUNTRY -- stated truthfully, and grants no market");

const jurisdictionStep = ONBOARDING_STEPS.find((s) => s.id === "jurisdiction");
assert(
  jurisdictionStep?.bodyKey === "jurisdiction.workCountryAvailability",
  "the onboarding country step separates work country from credential support",
);

const workCountries = (jurisdictionStep?.fields[0]?.options ?? []).map((o) => o.value);
// Every market the product names must be answerable, or a holder in it has no
// way to be described except by somebody else's country.
for (const code of ["SE", "GB", "AE"]) {
  assert(workCountries.includes(code), `a holder working in ${code} can say so`);
}
// Dubai is its own answer. SIRA licenses the emirate and not the country, so a
// product that can only record "United Arab Emirates" has already made the
// UAE-wide claim the market pack exists to refuse.
assert(
  workCountries.includes("AE-DU"),
  "a holder working in Dubai can say Dubai, not merely 'the UAE'",
);

// The answer is one string; the profile stores two columns, and
// `sp_profile_sub_matches_country` requires them to agree. Every option must
// therefore split into a country the FK accepts, with its emirate attached to
// the right one.
for (const answer of workCountries) {
  const split = splitWorkCountry(answer);
  assert(
    split.jurisdictionCode !== null && ["SE", "GB", "AE"].includes(split.jurisdictionCode),
    `${answer} splits into a country sp_jurisdictions holds (${split.jurisdictionCode})`,
  );
  assert(
    split.subJurisdictionCode === null ||
      split.subJurisdictionCode.slice(0, 2) === split.jurisdictionCode,
    `${answer} keeps its sub-jurisdiction under its own country`,
  );
}
// An unanswered step must stay unanswered. The whole defect was a country
// appearing where nobody had stated one.
assert(
  splitWorkCountry("").jurisdictionCode === null &&
    splitWorkCountry(null).jurisdictionCode === null &&
    splitWorkCountry(undefined).jurisdictionCode === null,
  "no answer yields no country, rather than a default",
);

/* ══════════════════════════════════════════════════════════════════════
   LINKEDIN LEAVES THE APP, IT DOES NOT LOAD INSIDE IT
   ══════════════════════════════════════════════════════════════════════

   LinkedIn refuses to be framed, so an embedded preview shows
   ERR_BLOCKED_BY_RESPONSE. The application is already correct — every LinkedIn
   link is a top-level navigation — and these assertions keep it that way, so
   the next person who sees that error in a preview does not "fix" a working
   anchor by turning it into something that really would break.             */
console.log("\nLINKEDIN -- top-level navigation, never an embed");

for (const rel of [
  "src/components/security-passport/live/LinkedInShareSection.tsx",
  "src/components/security-passport/live/LinkedInProfileSection.tsx",
  "src/components/security-passport/live/CredentialShareActions.tsx",
]) {
  const src = readFileSync(join(ROOT, rel), "utf8");
  assert(/target="_blank"/.test(src), `${rel} opens LinkedIn in a new top-level tab`);
  assert(/rel="noopener noreferrer"/.test(src), `${rel} opens it with noopener noreferrer`);
  // An iframe or a script-driven same-frame navigation is the shape that would
  // actually hit LinkedIn's frame refusal.
  assert(!/<iframe/i.test(src), `${rel} never embeds LinkedIn`);
}

/* ══════════════════════════════════════════════════════════════════════
   A STORED COUNTRY IS NOT A CONFIRMED ONE
   ══════════════════════════════════════════════════════════════════════

   `jurisdiction_code` carries two facts that look identical: a country the
   holder chose, and the `DEFAULT 'SE'` written before they were ever asked.
   Presenting the second as the first is the same false assertion the default
   was making, so every reader goes through `confirmedWorkLocation`.        */
console.log("\nWORK LOCATION PROVENANCE -- unconfirmed is not shown");

{
  const legacy = {
    jurisdictionCode: "SE",
    subJurisdictionCode: null,
    workLocationConfirmedAt: null,
  };
  assert(
    confirmedWorkLocation(legacy).jurisdictionCode === null,
    "a legacy SE row nobody confirmed reads as NOT STATED, never as Sweden",
  );
  assert(needsWorkLocationConfirmation(legacy), "and the holder is asked where they work");

  const confirmed = { ...legacy, workLocationConfirmedAt: "2026-08-24T00:00:00Z" };
  assert(
    confirmedWorkLocation(confirmed).jurisdictionCode === "SE",
    "a holder who states Sweden gets Sweden",
  );
  assert(!needsWorkLocationConfirmation(confirmed), "and is not asked again");

  const dubai = {
    jurisdictionCode: "AE",
    subJurisdictionCode: "AE-DU",
    workLocationConfirmedAt: "2026-08-24T00:00:00Z",
  };
  const shown = confirmedWorkLocation(dubai);
  assert(
    shown.jurisdictionCode === "AE" && shown.subJurisdictionCode === "AE-DU",
    "a confirmed Dubai holder keeps the emirate through the gate",
  );
  // A confirmation cannot conjure a country, and an unconfirmed emirate must
  // not survive on its own either.
  assert(
    confirmedWorkLocation({ ...dubai, workLocationConfirmedAt: null }).subJurisdictionCode === null,
    "an unconfirmed emirate is withheld with its country",
  );
  assert(confirmedWorkLocation(null).jurisdictionCode === null, "no profile yields no country");
  assert(needsWorkLocationConfirmation(null), "and a holder with no profile is asked");
}

for (const lang of ["sv", "en"] as const) {
  const copy = passportCopy[lang]["jurisdiction.workCountryAvailability"];
  assert(Boolean(copy && copy.length > 40), `${lang}: the work-country note exists`);
  assert(
    /(Sverige|Sweden)/.test(copy),
    `${lang}: it names the one market whose credentials ARE supported`,
  );
  assert(
    !/\b20\d\d\b/.test(copy),
    `${lang}: and promises no date, because no launch date is known`,
  );
}

// The load-bearing one, and it got stronger.
//
// It used to assert that the credential COUNTRY SELECT was built from the
// markets the server hands the form rather than from a literal list — the
// defect being a hardcoded `["SE", "NO", "DK", "FI", "DE"]` of which four
// values did not exist in sp_jurisdictions.
//
// There is no country select any more, and its absence is the stronger
// property. `sp_claims_credential_rules` pins a claim's jurisdiction to its
// credential type's, so the control had exactly one correct answer and every
// other answer produced SP_CREDENTIAL_JURISDICTION_MISMATCH. The form now
// STATES the credential's own jurisdiction from the definition. A Swedish VU1
// says Sweden for a holder who has moved to Dubai, and nobody — holder or
// component — can say otherwise.
//
// The original assertion is kept in substance: no literal country list may
// return to this file, under any name.
const credentialForm = readFileSync(
  join(ROOT, "src/components/security-passport/CredentialForm.tsx"),
  "utf8",
);
assert(
  !/options=\{?\[/.test(credentialForm),
  "the credential form declares no literal list of countries",
);
assert(
  !/\bmarkets\b/.test(credentialForm),
  "the credential form no longer offers a country to choose from at all",
);
assert(
  credentialForm.includes("type.jurisdictionCode") &&
    credentialForm.includes("formatWorkLocation("),
  "the credential's country is STATED from its own definition, not selected",
);
// And the selector itself follows the holder's market rather than showing
// every active credential type. The defect: `listCredentialTypes` returns the
// eight Swedish credentials and nothing else, so a holder who had told the
// product they work in Dubai was offered VU1 and Skyddsvaktsförordnande as
// though they were Dubai credentials.
const credentialRoute = readFileSync(
  join(ROOT, "src/routes/_authenticated.passport.credentials.new.tsx"),
  "utf8",
);
assert(
  credentialRoute.includes("getRegulatedCredentialAvailability") &&
    // The comment above the import legitimately NAMES the function it replaced
    // in order to explain why, so this looks for a call rather than the word.
    !/useServerFn\(listCredentialTypes\)/.test(credentialRoute),
  "the add-credential route asks what THIS holder's market allows, not what is active anywhere",
);
assert(
  credentialForm.includes("closedMarket") &&
    credentialForm.includes('pt("cred.market.unavailableTitle")'),
  "a closed market renders a stated reason rather than an empty credential list",
);
// Three different facts, three different sentences. An empty list could only
// ever have said the first, and it did not say even that.
for (const lang of ["sv", "en"] as const) {
  for (const key of [
    "cred.market.unavailableTitle",
    "cred.market.noWorkCountry",
    "cred.market.stillPossible",
    "cred.market.keepsExisting",
  ] as const) {
    assert(Boolean(passportCopy[lang][key]), `${lang}: the closed-market copy has ${key}`);
  }
  // The line that must never appear. "Not supported yet" is true; "not
  // eligible", "not qualified" and "invalid" are legal claims this product has
  // no basis for and section 11 of the brief forbids outright.
  const closed = [
    passportCopy[lang]["cred.market.unavailableTitle"],
    passportCopy[lang]["cred.market.noWorkCountry"],
    passportCopy[lang]["cred.market.stillPossible"],
    passportCopy[lang]["cred.market.keepsExisting"],
  ].join(" ");
  assert(
    !/(inte behörig|ej behörig|inte kvalificerad|ogiltig|not eligible|not qualified|invalid|not allowed to work)/i.test(
      closed,
    ),
    `${lang}: a closed market is described as unavailable, never as the holder being ineligible`,
  );
}

/* ══════════════════════════════════════════════════════════════════════
   THE WRITE PATH ACTUALLY REACHES THE SERVER
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nWRITE PATH -- the save payload cannot desync from the schema");

// The regression this defends is the one that made the product unusable:
// `submit()` hand-copied ten named draft fields into the server call and
// `authorisationScope` was not among them. The validator requires it as a
// string, so EVERY save — every credential, every holder — failed schema
// validation and surfaced as "Something went wrong. Please try again."
//
// Nothing caught it. The browser suite drives the fixture harness, which does
// not use this route, and the guards are static. So the assertion is made
// here, on the two files that have to agree.
{
  const route = readFileSync(
    join(ROOT, "src/routes/_authenticated.passport.credentials.new.tsx"),
    "utf8",
  );
  const domain = readFileSync(join(ROOT, "src/lib/security-passport/credentials.ts"), "utf8");
  const server = readFileSync(
    join(ROOT, "src/lib/security-passport/credentials.functions.ts"),
    "utf8",
  );

  assert(
    /doSave\(\{\s*data:\s*\{[^}]*\.\.\.draft/.test(route),
    "the route SPREADS the draft into the save payload",
  );

  // Every field the draft carries must exist in the server's input schema.
  // A field in one and not the other is the desync itself.
  const draftBlock = domain.slice(
    domain.indexOf("export interface CredentialDraft"),
    domain.indexOf("export function emptyCredentialDraft"),
  );
  const draftFields = Array.from(draftBlock.matchAll(/readonly (\w+):/g)).map((m) => m[1]);
  assert(draftFields.length >= 10, "the draft's fields were found to check");
  for (const f of draftFields) {
    assert(
      new RegExp(`\\b${f}:\\s*z\\b`).test(server),
      `the server input schema accepts draft field '${f}'`,
    );
  }

  // And the route must not go back to enumerating them: a hand-copied list is
  // how the field went missing, and it type-checks perfectly while doing it.
  const submitBlock = route.slice(
    route.indexOf("async function submit"),
    route.indexOf("if (activate)"),
  );
  const enumerated = draftFields.filter((f) => new RegExp(`${f}:\\s*draft\\.`).test(submitBlock));
  assert(
    enumerated.length === 0,
    "and does not re-enumerate draft fields by hand (found: " +
      (enumerated.join(", ") || "none") +
      ")",
  );
}

/* ------------------------------------------------------------------ */
console.log("\nINVERTED -- a CQrityjob document review is documented, never a title");
{
  const reviewed = derive([
    { ...claim("VU1"), verifierName: "CQrityjob", verificationMethod: "document_review" },
    { ...claim("VU2"), verifierName: "CQrityjob", verificationMethod: "document_review" },
    {
      ...claim("SE_PERSONNEL_APPROVAL"),
      verifierName: "CQrityjob",
      verificationMethod: "document_review",
    },
  ]);
  assert(
    reviewed.activeTitles.length === 0 &&
      reviewed.localEligibility.length === 0 &&
      reviewed.professionalCompetence.length === 0 &&
      reviewed.educationCompleted.length === 0,
    "INV-1 VU1+VU2+personnel approval, all CQrityjob-reviewed, derive no title, competence, education or eligibility",
  );
}

/* ------------------------------------------------------------------ */
console.log(`\n${checks} assertions, ${failures.length} failed`);
if (failures.length > 0) {
  console.error("\nFAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("Passport persona journey check OK");
