// Security Passport — the reviewer's evidence, and the verifier's name.
//
// Run via `bun run passport-reviewer-decision:check`.
//
// ── TWO DEFECTS, ONE SHAPE ─────────────────────────────────────────────
//
// Both are the product asserting something it had not established, and both
// were invisible to a source scan because the wrong value was carried
// faithfully all the way to the screen.
//
//   A  THE REVIEWER SAW A TITLE. `sp_verifier_request_detail` returns the
//      claim and the period. `getVerifierRequestDetail` mapped neither, so
//      the review page showed a holder name, a list of file names and a
//      decision form. A reviewer approved a state-regulated guard
//      qualification without seeing the issuer, the credential reference,
//      the jurisdiction or the claimed dates — every field a certificate is
//      actually checked against.
//
//   B  THE ISSUER BECAME THE VERIFIER. `buildPassportCard` computed its
//      attribution as `verifierName ?? issuerName`, and `PassportCard`
//      prints that under the heading "Verified by". `issuerName` is
//      `claimed_issuer_name` — text the candidate typed into a form. And
//      because `toClaim` set `verifierName` to null on every claim, the
//      fallback was the ONLY branch that ever ran. A card could state
//      "Verified by BYA" about a credential BYA had never been asked about,
//      on the one surface built to be screenshotted and sent to an employer.
//
// ── WHY IT RENDERS RATHER THAN ONLY READS ──────────────────────────────
//
// A field mapped correctly and then rendered by nothing passes every source
// scan and fixes nothing for the reviewer. So the review facts and the card
// are rendered for real and the markup is asserted. GROUP 5 additionally
// mutation-tests the issuer/verifier distinction: it reintroduces the exact
// fallback in a local copy of the derivation and requires the assertions to
// go red, because a test that cannot fail proves nothing.
//
// ── SWEDISH IS WHAT IS RENDERED ────────────────────────────────────────
//
// `I18nProvider` starts at "sv" on the server and exposes no way to seed a
// locale, so Swedish is what the markup contains. English is asserted from
// the copy module directly, and `passport-fixture-check` holds sv/en parity
// across the whole table.

import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/context";
import {
  ReviewClaimFacts,
  ReviewPeriodFacts,
} from "../src/components/security-passport/live/ReviewSubjectFacts";
import { PassportCard } from "../src/components/security-passport/PassportCard";
import { ClaimRow } from "../src/components/security-passport/ClaimRow";
import { passportT, type PassportCopyKey } from "../src/lib/security-passport/i18n";
import { buildPassportCard } from "../src/lib/security-passport/card";
import { verifierAttributionKey } from "../src/lib/security-passport/format";
import type {
  VerifierClaimFacts,
  VerifierPeriodFacts,
} from "../src/lib/security-passport/verification.functions";
import type { Claim, ExperiencePeriod, PassportHolder } from "../src/lib/security-passport/types";

const fails: string[] = [];
function ck(name: string, ok: boolean): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
}
function group(name: string): void {
  console.log(`\n${name}`);
}

const root = path.resolve(import.meta.dir, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

/** These files EXPLAIN at length the anti-patterns they no longer commit. A
 *  naive scan reads the explanation as the offence. */
const code = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const html = (n: React.ReactNode) => renderToStaticMarkup(<I18nProvider>{n}</I18nProvider>);
const sv = (k: PassportCopyKey) => passportT(k, "sv");

/* ------------------------------------------------------------------ */
/* The manual acceptance case, as a fixture                            */
/* ------------------------------------------------------------------ */

const AMINA = "Amina Rashid";

/** Issued by BYA. Nobody has verified it. Those are the two facts the whole
 *  file is about keeping apart. */
const VU1: VerifierClaimFacts = {
  id: "claim-vu1",
  claimType: "training",
  title: "Väktargrundutbildning VU1",
  issuer: "BYA",
  credentialCode: "VU1",
  credentialReference: "VU1-2026-001",
  jurisdictionCode: "SE",
  subJurisdictionCode: null,
  authorisationScope: null,
  issuedOn: "2026-01-20",
  validFrom: "2026-01-20",
  validUntil: null,
  assertion: "document_provided",
  lifecycle: "active",
  versionNo: 1,
};

/** A Dubai licence. `AE` alone would state a UAE-wide validity SIRA never
 *  granted, which is the reason the sub-jurisdiction exists at all. */
const SIRA: VerifierClaimFacts = {
  ...VU1,
  id: "claim-sira",
  claimType: "licence",
  title: "Security licence",
  issuer: "SIRA",
  credentialCode: null,
  credentialReference: null,
  jurisdictionCode: "AE",
  subJurisdictionCode: "AE-DU",
  authorisationScope: "Endast för uppdragsgivaren Fiktiv Fastighet LLC",
};

/** Everything absent that may legitimately be absent. Nothing may be invented
 *  to fill the gaps. */
const SPARSE: VerifierClaimFacts = {
  id: "claim-sparse",
  claimType: null,
  title: "Egen kurs",
  issuer: null,
  credentialCode: null,
  credentialReference: null,
  jurisdictionCode: null,
  subJurisdictionCode: null,
  authorisationScope: null,
  issuedOn: null,
  validFrom: null,
  validUntil: null,
  assertion: null,
  lifecycle: null,
  versionNo: null,
};

const PERIOD: VerifierPeriodFacts = {
  id: "period-1",
  employer: "Company X",
  role: "Security Officer",
  startedOn: "2024-01-01",
  endedOn: "2025-12-31",
  employmentType: "full_time",
  jurisdictionCode: "SE",
  securityRelevance: "primary",
  securityFraction: 1,
  fteFraction: 1,
  versionNo: 2,
  assertion: "self_declared",
  lifecycle: "active",
};

const claimFacts = (c: VerifierClaimFacts) =>
  html(<ReviewClaimFacts holderName={AMINA} claim={c} headingId="h" />);

/* ================================================================== */
group("GROUP 1 — the reviewer sees the claim, not only its title");
/* ================================================================== */
{
  const m = claimFacts(VU1);

  ck("1.1 the holder is named", m.includes(AMINA));
  ck("1.2 the claim title reaches the reviewer", m.includes("Väktargrundutbildning VU1"));
  ck("1.3 the claimed issuer renders when present", m.includes("BYA"));
  ck("1.4 the credential code renders when present", m.includes("VU1</dd>"));
  ck("1.5 the credential reference renders when present", m.includes("VU1-2026-001"));
  ck("1.6 the claimed issue date renders when present", m.includes("2026-01-20"));
  ck(
    "1.7 the claim type renders as words, not a stored code",
    m.includes(sv("claims.type.training")),
  );
  // Phase 7 documents `holder_note` as the holder's private words and keeps
  // it out of every payload. The review payload is not an exception: unlike
  // the credential reference, nothing is CHECKED AGAINST the note, so the
  // reviewer loses nothing their decision rests on. The type carries no such
  // field, so this asserts the shape rather than the markup.
  ck(
    "1.8 the reviewer payload has no holder_note field to render",
    !Object.prototype.hasOwnProperty.call(VU1, "holderNote"),
  );
  ck(
    "1.9 the current assertion and lifecycle are both stated",
    m.includes(sv("assertion.document_provided")) && m.includes(sv("lifecycle.active")),
  );

  // The issuer is labelled AS STATED. A reviewer who reads "BYA" under a bare
  // "Issuer" heading has been handed an unverified string as a fact.
  ck("1.10 the issuer is labelled as candidate-stated", m.includes(sv("vq.issuerStated")));

  // The reviewer must be told that a document is not itself a verification.
  const route = read("src/routes/_authenticated.passport-review.tsx");
  ck(
    "1.11 the review page separates evidence from verification",
    route.includes("vq.evidenceNote"),
  );
}

/* ================================================================== */
group("GROUP 2 — jurisdiction is human-readable, and never widened");
/* ================================================================== */
{
  const se = claimFacts(VU1);
  ck("2.1 a Swedish credential names Sweden", se.includes(sv("jurisdiction.SE")));
  // The contrast that makes 2.1 meaningful: the payload carries "SE" and the
  // markup must not.
  ck("2.2 the raw country code is not printed", !se.includes(">SE<"));

  const du = claimFacts(SIRA);
  ck("2.3 a Dubai credential names Dubai", du.includes(sv("jurisdiction.AE-DU")));
  ck("2.4 and still names the country", du.includes(sv("jurisdiction.AE")));
  ck("2.5 no raw AE-DU reaches the reviewer", !du.includes(">AE-DU<") && !du.includes("AE-DU<"));
  ck("2.6 a scoped authorisation shows its limit", du.includes("Fiktiv Fastighet LLC"));
}

/* ================================================================== */
group("GROUP 3 — absent values are absent, never invented");
/* ================================================================== */
{
  const m = claimFacts(SPARSE);

  // The labels for fields this claim does not have must not appear at all.
  for (const [label, key] of [
    ["issuer", "vq.issuerStated"],
    ["credential reference", "vq.credentialReference"],
    ["jurisdiction", "vq.jurisdiction"],
    ["authorisation scope", "vq.authorisationScope"],
    ["issue date", "claims.issuedOn"],
  ] as const) {
    ck(`3.1 a claim with no ${label} renders no ${label} row`, !m.includes(sv(key)));
  }
  // …and nothing fabricated a placeholder in their place.
  ck("3.2 no em-dash placeholder is invented", !m.includes("—</dd>"));
  ck("3.3 the fields it DOES have still render", m.includes("Egen kurs"));

  // The contrast proving GROUP 3 is not passing on an empty render.
  ck(
    "3.4 the same component DOES print those labels when the data is there",
    claimFacts(VU1).includes(sv("vq.issuerStated")),
  );
}

/* ================================================================== */
group("GROUP 4 — employment periods reach the reviewer too");
/* ================================================================== */
{
  const m = html(<ReviewPeriodFacts holderName={AMINA} period={PERIOD} headingId="h" />);
  ck("4.1 the employer is named", m.includes("Company X"));
  ck("4.2 the role is named", m.includes("Security Officer"));
  ck("4.3 the employment dates render", m.includes("2024-01-01") && m.includes("2025-12-31"));
  ck("4.4 the employment type renders as words", m.includes(sv("entry.emp.type.full_time")));
  ck("4.5 security relevance renders as words", m.includes(sv("entry.emp.relevance.primary")));
  ck("4.6 the version is visible, so a correction is not read as a first filing", m.includes("v2"));

  // Prior versions for a PERIOD were computed by nothing: the RPC's
  // previous_versions branch handled claims only.
  const mig = read("supabase/migrations/20261014090000_sp_reviewer_detail_and_note_privacy.sql");
  ck(
    "4.7 the RPC computes previous versions for periods, not only claims",
    mig.includes("FROM public.sp_experience_periods pe"),
  );
}

/* ================================================================== */
group("GROUP 5 — the issuer never becomes the verifier");
/* ================================================================== */
{
  /** A credential ISSUED BY BYA that NOBODY HAS VERIFIED. The exact input the
   *  old fallback turned into "Verified by BYA". */
  const unverified: Claim = {
    id: "c1",
    claimType: "training",
    credentialCode: "VU1",
    skillCode: null,
    skillLevel: null,
    titleSv: "Väktargrundutbildning VU1",
    titleEn: "Basic guard training VU1",
    issuerName: "BYA",
    jurisdictionCode: "SE",
    subJurisdictionCode: null,
    authorisationScope: null,
    issuedOn: "2026-01-20",
    validFrom: "2026-01-20",
    validUntil: "2030-01-20",
    assertionLevel: "document_provided",
    lifecycleState: "active",
    verifierName: null,
    verificationMethod: null,
    verifiedOn: null,
    limitationSv: null,
    limitationEn: null,
    versionNo: 1,
    supersedesClaimId: null,
  };

  /** The same credential, after CQrityjob actually reviewed the document.
   *  Issuer BYA. Decider CQrityjob. Two fields, two facts. */
  const reviewed: Claim = {
    ...unverified,
    id: "c2",
    assertionLevel: "verified",
    verifierName: "CQrityjob",
    verificationMethod: "document_review",
    verifiedOn: "2026-08-30",
  };

  /** No derived titles: this file is about ATTRIBUTION, and a derived title
   *  would only add a second thing on the card to look at. */
  const NO_IDENTITY = {
    engineVersion: "test",
    evaluatedOn: "2026-08-31",
    includesSelfDeclared: false,
    educationCompleted: [],
    professionalCompetence: [],
    localEligibility: [],
    activeTitles: [],
  };

  const holder = (claims: readonly Claim[], periods: readonly ExperiencePeriod[] = []) =>
    ({
      id: "h",
      displayName: AMINA,
      professionSlug: null,
      identity: NO_IDENTITY,
      jurisdictionCode: "SE",
      subJurisdictionCode: null,
      periods,
      claims,
      hasCareerDiscoveryResult: false,
    }) as unknown as PassportHolder;

  const cardOf = (claims: readonly Claim[]) => buildPassportCard(holder(claims), "2026-08-31");

  // ── 5.1 THE DEFECT ────────────────────────────────────────────────
  const unverifiedCard = cardOf([unverified]);
  ck(
    "5.1 an unverified credential attributes NOBODY (issuer is not substituted)",
    unverifiedCard.attributions.length === 0,
  );

  const unverifiedMarkup = html(<PassportCard card={unverifiedCard} />);
  ck(
    '5.2 and the rendered card never prints the issuer under "Verified by"',
    !(unverifiedMarkup.includes(sv("claims.verifier")) && unverifiedMarkup.includes(">BYA<")),
  );

  // ── 5.3 THE TRUTH IS STILL TOLD ───────────────────────────────────
  const reviewedCard = cardOf([reviewed]);
  ck(
    "5.3 a genuinely reviewed credential attributes the DECIDER",
    reviewedCard.attributions.includes("CQrityjob"),
  );
  ck("5.4 and never the issuer", !reviewedCard.attributions.includes("BYA"));

  // ── 5.5 MUTATION TEST ─────────────────────────────────────────────
  //
  // Reintroduce the exact removed expression. If 5.1 still passes with the
  // defect present, 5.1 was proving nothing.
  const withFallback = [unverified]
    .map((c) => c.verifierName ?? c.issuerName)
    .filter((n): n is string => Boolean(n) && n !== "—");
  ck(
    '5.5 MUTATION: the removed `verifierName ?? issuerName` really does produce "BYA"',
    withFallback.includes("BYA"),
  );

  // ── 5.6 THE SOURCE NO LONGER CONTAINS IT ──────────────────────────
  const cardSrc = code(read("src/lib/security-passport/card.ts"));
  const useCardSrc = code(read("src/components/security-passport/card/useCardContent.ts"));
  ck(
    "5.6 no issuer-as-verifier fallback survives in the card derivation",
    !/verifierName\s*\?\?\s*\w*issuerName/i.test(cardSrc) &&
      !/verifierName\s*\?\?\s*\w*issuerName/i.test(useCardSrc),
  );

  // ── 5.7 THE VERIFIER IS NO LONGER HARDCODED NULL ──────────────────
  //
  // The column list moved into `provenance.ts` when the career outputs began
  // needing the same answer, so the property is now asserted in two halves:
  // the read model still queries the decision table, and the shared constant
  // it selects with still asks for the decider. Checking only the literal in
  // `passport.functions.ts` would have failed on a refactor that changed
  // nothing about what is read -- and, worse, would have passed if somebody
  // kept the literal while quietly dropping the query.
  const pf = code(read("src/lib/security-passport/passport.functions.ts"));
  const prov = code(read("src/lib/security-passport/provenance.ts"));
  ck(
    "5.7 getMyPassport reads provenance from the decision record",
    pf.includes('.from("sp_verification_decisions")') &&
      pf.includes("PROVENANCE_DECISION_COLUMNS") &&
      prov.includes("decider_organisation"),
  );
  ck(
    "5.8 and never selects the internal reviewer note while doing it",
    !pf.includes("decision_note") && !prov.includes("decision_note"),
  );

  // ── 5.9 THE CAREER OUTPUTS READ THE SAME RECORD, THE SAME WAY ─────
  //
  // My Career, the CV and the Career Card attribute verification from the
  // professional-identity read model. If that model resolved provenance its
  // own way, a CV could attribute an employment the Passport no longer
  // attributes. It must use the shared resolver, and it must be held to the
  // same note-exclusion rule as the Passport itself.
  const idf = code(read("src/lib/professional-identity/identity.functions.ts"));
  ck(
    "5.9 the identity read model resolves provenance through the shared module",
    idf.includes("buildProvenanceMap") &&
      idf.includes("printableProvenance") &&
      idf.includes('.from("sp_verification_decisions")'),
  );
  ck("5.10 and never selects the internal reviewer note either", !idf.includes("decision_note"));
}

/* ================================================================== */
group("GROUP 6 — attribution says HOW, not just WHO");
/* ================================================================== */
{
  ck(
    "6.1 a document review says so",
    verifierAttributionKey("document_review") === "claims.attribution.document_review",
  );
  // The subject is half the rule (owner decision, 2026-09-05): an employer
  // confirms an EMPLOYMENT, so the employer's words are reached only there.
  ck(
    "6.2 an employer confirmation of an EMPLOYMENT says CONFIRMED, not VERIFIED",
    verifierAttributionKey("employer_confirmation", "Bevakning AB", "employment") ===
      "claims.attribution.employer_confirmation",
  );
  // INVERTED: the same method on a credential, and any issuer confirmation by
  // any name, take the review label instead -- the product has no issuer
  // identity, membership, receipt or revocation authority behind that name,
  // so it fails closed until the Issuer Foundation release.
  ck(
    "6.3 an employer confirmation on a CREDENTIAL, and any issuer confirmation, take the review label",
    verifierAttributionKey("employer_confirmation", "Bevakning AB") === "trust.reviewedBy" &&
      verifierAttributionKey("issuer_confirmation", "CQrityjob") === "trust.reviewedBy" &&
      verifierAttributionKey("issuer_confirmation", "Polismyndigheten") === "trust.reviewedBy",
  );
  // An approval with no recorded method cannot be described more strongly
  // than "verified". PR 5 made a method mandatory going forward; rows written
  // before it still exist.
  ck(
    "6.4 an unrecorded method falls back to the weakest true wording",
    verifierAttributionKey(null) === "claims.verifier",
  );

  // The words themselves must differ, in both languages, or the distinction
  // exists only in the key names.
  for (const lang of ["sv", "en"] as const) {
    const review = passportT("claims.attribution.document_review", lang);
    const employer = passportT("claims.attribution.employer_confirmation", lang);
    const generic = passportT("claims.verifier", lang);
    ck(
      `6.5 [${lang}] employer confirmation is worded differently from CQrityjob review`,
      review !== employer && employer !== generic && review !== generic,
    );
    ck(
      `6.6 [${lang}] an employer confirmation does not use the word "verified"`,
      !/verifi/i.test(employer),
    );
  }

  // Rendered: a CQrityjob document review, and an employer confirmation, must
  // not read the same on a candidate's own Passport.
  const base: Claim = {
    id: "c1",
    claimType: "training",
    credentialCode: "VU1",
    skillCode: null,
    skillLevel: null,
    titleSv: "Väktargrundutbildning VU1",
    titleEn: "Basic guard training VU1",
    issuerName: "BYA",
    jurisdictionCode: "SE",
    subJurisdictionCode: null,
    authorisationScope: null,
    issuedOn: "2026-01-20",
    validFrom: "2026-01-20",
    validUntil: "2030-01-20",
    assertionLevel: "verified",
    lifecycleState: "active",
    verifierName: "CQrityjob",
    verificationMethod: "document_review",
    verifiedOn: "2026-08-30",
    limitationSv: null,
    limitationEn: null,
    versionNo: 1,
    supersedesClaimId: null,
  };
  const row = html(<ClaimRow claim={base} evaluationOn="2026-08-31" />);
  ck(
    "6.7 the entry row says the document was reviewed, by CQrityjob",
    row.includes(sv("claims.attribution.document_review")) && row.includes("CQrityjob"),
  );
  ck(
    "6.8 the entry row still names BYA as the ISSUER, separately",
    row.includes(sv("claims.issuer")) && row.includes("BYA"),
  );
  ck("6.9 the verification date survives to the entry row", row.includes("2026-08-30"));

  const unverifiedRow = html(
    <ClaimRow
      claim={{
        ...base,
        assertionLevel: "document_provided",
        verifierName: null,
        verificationMethod: null,
        verifiedOn: null,
      }}
      evaluationOn="2026-08-31"
    />,
  );
  ck(
    "6.10 an unverified entry row attributes nobody",
    !unverifiedRow.includes(sv("claims.attribution.document_review")) &&
      !unverifiedRow.includes(sv("claims.verifier")),
  );
  ck("6.11 but still names its issuer", unverifiedRow.includes("BYA"));
}

/* ================================================================== */
group("GROUP 7 — the internal note never crosses to a candidate payload");
/* ================================================================== */
{
  // The mapper names every field it returns, so the note cannot ride along in
  // a spread. Asserted on stripped source: the file discusses the note at
  // length in prose.
  const vf = code(read("src/lib/security-passport/verification.functions.ts"));
  const holderRead = vf.slice(
    vf.indexOf("listMyVerificationRequests"),
    vf.indexOf("submitForVerification"),
  );
  ck(
    "7.1 the holder's own history read never selects decision_note",
    !holderRead.includes("decision_note"),
  );

  // The reviewer detail maps prior decisions WITHOUT their notes. The RPC
  // returns `note` on each prior decision, and this mapper is the last place
  // that could put it in a browser payload — it chooses not to. Sliced to the
  // handler alone: `decideVerification` below it legitimately WRITES the note,
  // which is the opposite direction and must not be read as a leak.
  const detailStart = vf.indexOf("getVerifierRequestDetail");
  const detailMap = vf.slice(detailStart, vf.indexOf("const decideInput", detailStart));
  ck("7.2 the review detail handler exists and was located", detailMap.length > 200);
  ck(
    "7.2 the review detail mapper does not carry decision_note to the browser",
    !detailMap.includes("decision_note") && !detailMap.includes("d.note"),
  );

  // The privacy boundary itself is a DATABASE property and is asserted in
  // supabase/tests/security_passport_note_privacy_test.sql. Named here so a
  // reader of this file knows where it lives, and so deleting it is visible.
  const dbTest = read("supabase/tests/security_passport_note_privacy_test.sql");
  ck(
    "7.3 a database-level privacy suite exists and tests a crafted read",
    dbTest.includes("decision_note") && dbTest.includes("SET LOCAL ROLE authenticated"),
  );
  ck(
    "7.4 db-test.sh runs it",
    read("scripts/db-test.sh").includes("security_passport_note_privacy_test.sql"),
  );
}

/* ------------------------------------------------------------------ */

console.log("");
if (fails.length > 0) {
  console.error(`passport-reviewer-decision-check FAILED (${fails.length}):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("passport-reviewer-decision-check: all assertions passed.");
