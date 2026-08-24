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

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deriveVerifiedIdentity } from "../src/lib/security-passport/identity/visibility";
import { MIRRORED_TITLE_RULES } from "../src/lib/security-passport/identity/market-rules";
import { headlineTitles, professionLine } from "../src/lib/security-passport/identity/presentation";
import { formatJurisdiction } from "../src/lib/security-passport/format";
import { passportCopy } from "../src/lib/security-passport/i18n";
import { ONBOARDING_STEPS } from "../src/lib/security-passport/onboarding";
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
    verifierName: "Fixture verifier",
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
const SURFACES = [
  "src/components/security-passport/PassportCard.tsx",
  "src/components/security-passport/PassportOverview.tsx",
  "src/components/security-passport/RecipientVerification.tsx",
  "src/components/security-passport/ClaimRow.tsx",
  "src/components/security-passport/social/SocialFrame.tsx",
  "src/components/security-passport/live/LinkedInShareSection.tsx",
  "src/lib/security-passport/share-image.ts",
];
for (const rel of SURFACES) {
  const src = readFileSync(join(ROOT, rel), "utf8");
  assert(
    src.includes("formatJurisdiction("),
    `${rel} renders the jurisdiction through the shared formatter`,
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

const jurisdictionStep = ONBOARDING_STEPS.find((s) => s.id === "jurisdiction");
assert(
  jurisdictionStep?.bodyKey === "jurisdiction.marketAvailability",
  "the onboarding country step explains why the list is short",
);
assert(
  readFileSync(join(ROOT, "src/components/security-passport/CredentialForm.tsx"), "utf8").includes(
    'pt("jurisdiction.marketAvailability")',
  ),
  "and so does the credential form's country field",
);

/* ------------------------------------------------------------------ */
console.log(`\n${checks} assertions, ${failures.length} failed`);
if (failures.length > 0) {
  console.error("\nFAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("Passport persona journey check OK");
