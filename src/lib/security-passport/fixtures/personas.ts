// Security Passport — Phase 1 fixture personas.
//
// ── ENTIRELY FICTIONAL, DELIBERATELY OBVIOUS ───────────────────────────
//
// Every person, employer, issuer and date here is invented. Surnames are
// transparently fabricated (Testsson, Exempelsson, Provsson, Fiktivsson)
// and employer names are constructed, so a screenshot of this prototype
// cannot be mistaken for production data even without the banner. No real
// candidate, employer, certificate number or personal data appears, and no
// hosted row was read to build them.
//
// ── DETERMINISTIC ──────────────────────────────────────────────────────
//
// `FIXTURE_EVALUATION_DATE` is fixed rather than `today`, so an open-ended
// ("current") period produces the same totals in a check run today and in a
// year. Without it, every recognition assertion would slowly drift.
//
// Coverage — the thirteen cases Phase 1 must support:
//   1  Career Discovery result, no Passport      → career-discovery-only
//   2  Passport, no Career Discovery result      → passport-only
//   3  New Väktare, self-reported                → new-vaktare
//   4  Several employers, overlapping periods    → overlapping-employers
//   5  Part-time Väktare                         → part-time
//   6  Career break                              → career-break
//   7  Mixed self/documented/verified evidence   → mixed-evidence
//   8  Five fully verified years                 → five-verified-years
//   9  Documented but unverified certification   → mixed-evidence (ASIS row)
//  10  Expired verified licence                  → expired-licence
//  11  Disputed claim                            → disputed-claim
//  12  Valid / expired / revoked disclosures     → DISCLOSURE_FIXTURES
//  13  Swedish credential seen elsewhere         → VIEWING_JURISDICTIONS

import { deriveVerifiedIdentity } from "../identity/visibility";
import { MIRRORED_TITLE_RULES } from "../identity/market-rules";
import type { ProfessionalIdentity } from "../identity/types";
import type { Claim, ExperiencePeriod, PassportHolder } from "../types";
import type { DisclosureRequest } from "../disclosure";

/** Frozen "today" for every fixture calculation. */
export const FIXTURE_EVALUATION_DATE = "2026-08-16";

/** Jurisdictions the prototype can be *viewed* from, to demonstrate that a
 *  Swedish credential is never presented as eligibility elsewhere. */
export const VIEWING_JURISDICTIONS: readonly string[] = ["SE", "NO", "DE"] as const;

const VAKTARE_SV = "Väktare";
const VAKTARE_EN = "Security Officer (Väktare)";

function period(p: ExperiencePeriod): ExperiencePeriod {
  return p;
}

/** Phase 11 added `skillCode` and `skillLevel` to every claim; the three-market
 *  work added `subJurisdictionCode` and `authorisationScope`. None of these
 *  personas is a language, a practical skill, or a credential from outside
 *  Sweden, so the helper supplies the null defaults rather than repeating them
 *  eighteen times — and a persona that genuinely needs one still passes it
 *  explicitly.
 *
 *  The defaults are honest, not merely convenient: a Swedish credential HAS no
 *  sub-jurisdiction, and an unscoped one HAS no scope. Null is the right
 *  answer in both cases, not a placeholder for a value nobody filled in. */
type ClaimDefaults = "skillCode" | "skillLevel" | "subJurisdictionCode" | "authorisationScope";

function claim(c: Omit<Claim, ClaimDefaults> & Partial<Claim>): Claim {
  return {
    skillCode: null,
    skillLevel: null,
    subJurisdictionCode: null,
    authorisationScope: null,
    ...c,
  };
}

// ── Reusable claim rows ──────────────────────────────────────────────────

const grundutbildningSelfDeclared = claim({
  id: "c-grund-self",
  claimType: "training",
  credentialCode: "VU1",
  titleSv: "Väktargrundutbildning (VU1)",
  titleEn: "Basic security guard training (VU1)",
  issuerName: "Nordvakt Bevakning AB",
  jurisdictionCode: "SE",
  issuedOn: "2024-02-10",
  validFrom: "2024-02-10",
  validUntil: null,
  assertionLevel: "self_declared",
  lifecycleState: "active",
  verifierName: null,
  limitationSv: "Uppgiften kommer från innehavaren och är inte kontrollerad.",
  limitationEn: "Stated by the holder and not checked by anyone else.",
  versionNo: 1,
  supersedesClaimId: null,
});

const licenceActiveVerified = claim({
  id: "c-licence-active",
  claimType: "licence",
  credentialCode: null,
  titleSv: "Väktarlegitimation",
  titleEn: "Security guard licence",
  issuerName: "Länsstyrelsen (fiktiv referens)",
  jurisdictionCode: "SE",
  issuedOn: "2023-04-01",
  validFrom: "2023-04-01",
  validUntil: "2028-03-31",
  assertionLevel: "verified",
  lifecycleState: "active",
  verifierName: "Nordvakt Bevakning AB",
  limitationSv: "Gäller enligt svenska regler. Ger inte behörighet i annat land.",
  limitationEn: "Applies under Swedish rules. Confers no eligibility in another country.",
  versionNo: 1,
  supersedesClaimId: null,
});

const licenceExpiredVerified = claim({
  id: "c-licence-expired",
  claimType: "licence",
  credentialCode: null,
  titleSv: "Väktarlegitimation",
  titleEn: "Security guard licence",
  issuerName: "Länsstyrelsen (fiktiv referens)",
  jurisdictionCode: "SE",
  issuedOn: "2019-05-02",
  validFrom: "2019-05-02",
  // The case a single status enum cannot express: still verified, no
  // longer valid. Assertion level stays `verified`; only lifecycle moves.
  validUntil: "2024-05-01",
  assertionLevel: "verified",
  lifecycleState: "expired",
  verifierName: "Stadsskydd Sverige AB",
  limitationSv: "Giltighetstiden har gått ut. Historiken är oförändrad.",
  limitationEn: "The validity period has ended. The history is unchanged.",
  versionNo: 1,
  supersedesClaimId: null,
});

const asisDocumented = claim({
  id: "c-asis-doc",
  claimType: "certification",
  credentialCode: null,
  titleSv: "Certifiering i säkerhetsskydd (fiktiv utfärdare)",
  titleEn: "Protective security certification (fictional issuer)",
  issuerName: "Nordic Security Institute (fiktiv)",
  jurisdictionCode: null,
  issuedOn: "2023-09-15",
  validFrom: "2023-09-15",
  validUntil: "2027-09-14",
  // Documentation exists; nobody has confirmed the entry. The distinction
  // that most needs to survive the UI.
  assertionLevel: "document_provided",
  lifecycleState: "active",
  verifierName: null,
  limitationSv: "Ett dokument har lämnats. Uppgiften är inte verifierad av utfärdaren.",
  limitationEn: "A document has been provided. The entry is not verified by the issuer.",
  versionNo: 1,
  supersedesClaimId: null,
});

const controlRoomVerified = claim({
  id: "c-spec-controlroom",
  claimType: "specialisation",
  credentialCode: null,
  titleSv: "Kontrollrum och larmhantering",
  titleEn: "Control room and alarm handling",
  issuerName: "Datacenter Syd AB",
  jurisdictionCode: "SE",
  issuedOn: "2022-06-01",
  validFrom: "2022-06-01",
  validUntil: null,
  assertionLevel: "verified",
  lifecycleState: "active",
  verifierName: "Datacenter Syd AB",
  limitationSv: "Bekräftad för angiven roll och period hos arbetsgivaren.",
  limitationEn: "Confirmed for the stated role and period at that employer.",
  versionNo: 1,
  supersedesClaimId: null,
});

const dataCentreSelfDeclared = claim({
  id: "c-spec-datacenter",
  claimType: "specialisation",
  credentialCode: null,
  titleSv: "Datacentersäkerhet",
  titleEn: "Data centre security",
  issuerName: "—",
  jurisdictionCode: "SE",
  issuedOn: null,
  validFrom: null,
  validUntil: null,
  assertionLevel: "self_declared",
  lifecycleState: "active",
  verifierName: null,
  limitationSv: "Angiven av innehavaren. Ett intresse eller en titel är inte en specialisering.",
  limitationEn: "Stated by the holder. An interest or job title is not a specialisation.",
  versionNo: 1,
  supersedesClaimId: null,
});

const disputedTraining = claim({
  id: "c-training-disputed",
  claimType: "training",
  credentialCode: null,
  titleSv: "Utbildning i konflikthantering",
  titleEn: "Conflict management training",
  issuerName: "Eventvakt Norr AB",
  jurisdictionCode: "SE",
  issuedOn: "2023-03-20",
  validFrom: "2023-03-20",
  validUntil: null,
  assertionLevel: "document_provided",
  lifecycleState: "disputed",
  verifierName: null,
  limitationSv: "Uppgiften är bestridd och utreds. Den räknas inte under tiden.",
  limitationEn: "This entry is disputed and under review. It is not counted meanwhile.",
  versionNo: 2,
  supersedesClaimId: "c-training-disputed-v1",
});

const firstAidSelfDeclared = claim({
  id: "c-firstaid",
  claimType: "training",
  credentialCode: null,
  titleSv: "Hjärt-lungräddning (HLR)",
  titleEn: "Cardiopulmonary resuscitation (CPR)",
  issuerName: "Stadsskydd Sverige AB",
  jurisdictionCode: "SE",
  issuedOn: "2025-01-14",
  validFrom: "2025-01-14",
  validUntil: "2027-01-13",
  assertionLevel: "self_declared",
  lifecycleState: "active",
  verifierName: null,
  limitationSv: "Uppgiften kommer från innehavaren och är inte kontrollerad.",
  limitationEn: "Stated by the holder and not checked by anyone else.",
  versionNo: 1,
  supersedesClaimId: null,
});

// ── Phase 6: supported-credential fixtures ───────────────────────────────
//
// The four taxonomy credentials in every state the credential UI must
// present. Names, issuers and dates are entirely fictional; the taxonomy
// names mirror sp_credential_types so the fixtures read like live rows.

const CRED_NAMES: Record<string, { sv: string; en: string; type: Claim["claimType"] }> = {
  VU1: {
    sv: "Väktarutbildning 1 (VU1)",
    en: "Security Guard Training 1 (VU1)",
    type: "training",
  },
  VU2: {
    sv: "Väktarutbildning 2 (VU2)",
    en: "Security Guard Training 2 (VU2)",
    type: "training",
  },
  OV: { sv: "Ordningsvaktsförordnande", en: "Public Order Guard Appointment", type: "licence" },
  // Not an appointment and not a qualification: the employer-side check that a
  // väktare may actually be put to work. It is the ordinary Swedish case and
  // the reason the eligibility tier exists at all.
  SE_PERSONNEL_APPROVAL: {
    sv: "Personalgodkännande",
    en: "Personnel approval",
    // 'licence' to match sp_credential_types, which files it that way. The
    // claim TYPE is a storage fact; what it may DERIVE is decided by the title
    // rules, and there it is local_eligibility and nothing else.
    type: "licence",
  },
  SV: {
    sv: "Skyddsvaktsförordnande",
    en: "Protective Security Guard Appointment",
    type: "licence",
  },
};

function credentialClaim(c: {
  id: string;
  code: "VU1" | "VU2" | "OV" | "SV" | "SE_PERSONNEL_APPROVAL";
  assertionLevel: Claim["assertionLevel"];
  lifecycleState: Claim["lifecycleState"];
  issuedOn: string | null;
  validUntil?: string | null;
  issuer?: string;
  verifier?: string | null;
  versionNo?: number;
  supersedes?: string | null;
}): Claim {
  const names = CRED_NAMES[c.code];
  const isAppointment = c.code === "OV" || c.code === "SV";
  const isApproval = c.code === "SE_PERSONNEL_APPROVAL";
  return claim({
    id: c.id,
    claimType: names.type,
    credentialCode: c.code,
    titleSv: names.sv,
    titleEn: names.en,
    issuerName:
      c.issuer ??
      (isApproval
        ? "Fiktiva Bevakning AB"
        : isAppointment
          ? "Fiktiva Myndigheten"
          : "Väktarskolan Fiktiv AB"),
    jurisdictionCode: "SE",
    issuedOn: c.issuedOn,
    validFrom: c.issuedOn,
    validUntil: c.validUntil ?? null,
    assertionLevel: c.assertionLevel,
    lifecycleState: c.lifecycleState,
    verifierName: c.verifier ?? null,
    limitationSv: isApproval
      ? "Ett personalgodkännande är inte ett förordnande och ger ingen yrkestitel."
      : isAppointment
        ? "Ett förordnande är tidsbegränsat och gäller enligt beslutet."
        : "En genomförd utbildning är inte ett gällande förordnande.",
    limitationEn: isAppointment
      ? "An appointment is time-limited and applies as decided."
      : "Completed training is not a current appointment.",
    versionNo: c.versionNo ?? 1,
    supersedesClaimId: c.supersedes ?? null,
  });
}

/** Every persona's professional identity is DERIVED from its own claims, by
 *  the same engine the product uses, against the same rules the migration
 *  seeds (mirrored in identity/market-rules.ts and checked against it by
 *  scripts/passport-title-derivation-check.ts).
 *
 *  This is what makes the fixtures worth having. When they carried a hand-
 *  written `professionTitleSv`, a persona could claim to be an Ordningsvakt
 *  while holding nothing but VU1 — and the harness would render it happily,
 *  which is exactly the bug the fixtures were supposed to catch. Now a
 *  persona's title is a consequence of its credentials and cannot be typed. */
function identityFor(claims: readonly Claim[]): ProfessionalIdentity {
  return deriveVerifiedIdentity(claims, MIRRORED_TITLE_RULES, FIXTURE_EVALUATION_DATE);
}

/** A persona as it is written down: everything except the one field nobody
 *  may write. `persona()` supplies `identity` by derivation, so the type
 *  system itself refuses a fixture that states its own title. */
// Seeds omit `subJurisdictionCode`: only a persona in a country WITH sub-
// jurisdictions needs one, and defaulting it in `persona()` keeps 24 Swedish
// fixtures from each carrying an explicit null.
type PersonaSeed = Omit<PassportHolder, "identity" | "subJurisdictionCode"> & {
  readonly subJurisdictionCode?: string | null;
};

function persona(seed: PersonaSeed): PassportHolder {
  return { subJurisdictionCode: null, ...seed, identity: identityFor(seed.claims) };
}

function credentialPersona(
  id: string,
  displayName: string,
  claims: readonly Claim[],
): PassportHolder {
  return {
    id,
    displayName,
    professionSlug: "vaktare",
    identity: identityFor(claims),
    jurisdictionCode: "SE",
    subJurisdictionCode: null,
    periods: [],
    claims,
    hasCareerDiscoveryResult: false,
  };
}

const CREDENTIAL_PERSONAS: readonly PassportHolder[] = [
  // A saved, unfinished VU1 — the resume-a-draft state.
  credentialPersona("cred-vu1-draft", "Sixten Testsson", [
    credentialClaim({
      id: "c-vu1-draft",
      code: "VU1",
      assertionLevel: "self_declared",
      lifecycleState: "draft",
      issuedOn: null,
    }),
  ]),
  // VU1 alone, self-declared → documented → approved.
  credentialPersona("cred-vu1-documented", "Ylva Provsson", [
    credentialClaim({
      id: "c-vu1-doc",
      code: "VU1",
      assertionLevel: "document_provided",
      lifecycleState: "active",
      issuedOn: "2025-11-20",
    }),
  ]),
  credentialPersona("cred-vu1-approved", "Ebbe Exempelsson", [
    credentialClaim({
      id: "c-vu1-appr",
      code: "VU1",
      assertionLevel: "verified",
      lifecycleState: "active",
      issuedOn: "2025-10-05",
      verifier: "Väktarskolan Fiktiv AB",
    }),
  ]),
  // VU1 and VU2 coexisting — the mandatory pair.
  credentialPersona("cred-vu1-vu2", "Klara Fiktivsson", [
    credentialClaim({
      id: "c-pair-vu1",
      code: "VU1",
      assertionLevel: "verified",
      lifecycleState: "active",
      issuedOn: "2024-03-11",
      verifier: "Väktarskolan Fiktiv AB",
    }),
    credentialClaim({
      id: "c-pair-vu2",
      code: "VU2",
      assertionLevel: "verified",
      lifecycleState: "active",
      issuedOn: "2024-09-02",
      verifier: "Väktarskolan Fiktiv AB",
    }),
  ]),
  // ── The ordinary working väktare ─────────────────────────────────────
  //
  // Both training steps AND a current personnel approval. This is the most
  // common real Swedish case and the one that read wrongly for longest: the
  // Passport showed the training line and nothing else, so the single fact an
  // employer is trying to establish — that somebody has checked this person
  // and currently permits the work — was derived and shown to nobody.
  //
  // Training and eligibility must appear as TWO separate facts here, and
  // neither may become the title "Väktare".
  credentialPersona("cred-vaktare-approved", "Elsa Fiktivsson", [
    credentialClaim({
      id: "c-appr-vu1",
      code: "VU1",
      assertionLevel: "verified",
      lifecycleState: "active",
      issuedOn: "2023-02-14",
      verifier: "Väktarskolan Fiktiv AB",
    }),
    credentialClaim({
      id: "c-appr-vu2",
      code: "VU2",
      assertionLevel: "verified",
      lifecycleState: "active",
      issuedOn: "2023-08-21",
      verifier: "Väktarskolan Fiktiv AB",
    }),
    credentialClaim({
      id: "c-appr-personnel",
      code: "SE_PERSONNEL_APPROVAL",
      assertionLevel: "verified",
      lifecycleState: "active",
      issuedOn: "2023-09-01",
      validUntil: "2027-09-01",
      verifier: "Fiktiva Bevakning AB",
    }),
  ]),
  // The same person after the approval ran out. The training is unchanged and
  // still shown; the eligibility must simply be gone, with nothing having
  // written to the record to make that happen.
  credentialPersona("cred-vaktare-approval-lapsed", "Arvid Provsson", [
    credentialClaim({
      id: "c-lapse-vu1",
      code: "VU1",
      assertionLevel: "verified",
      lifecycleState: "active",
      issuedOn: "2021-02-14",
      verifier: "Väktarskolan Fiktiv AB",
    }),
    credentialClaim({
      id: "c-lapse-vu2",
      code: "VU2",
      assertionLevel: "verified",
      lifecycleState: "active",
      issuedOn: "2021-08-21",
      verifier: "Väktarskolan Fiktiv AB",
    }),
    credentialClaim({
      id: "c-lapse-personnel",
      code: "SE_PERSONNEL_APPROVAL",
      assertionLevel: "verified",
      lifecycleState: "active",
      issuedOn: "2021-09-01",
      // Stored ACTIVE on purpose: only the calendar ends it, and the engine
      // must notice without a sweep job.
      validUntil: "2025-09-01",
      verifier: "Fiktiva Bevakning AB",
    }),
  ]),
  // Completed training beside a merely claimed appointment: the combination
  // where "training is not an appointment" must be visibly true.
  credentialPersona("cred-vu2-ov-self", "Lova Provsson", [
    credentialClaim({
      id: "c-vu2-appr",
      code: "VU2",
      assertionLevel: "verified",
      lifecycleState: "active",
      issuedOn: "2023-05-15",
      verifier: "Väktarskolan Fiktiv AB",
    }),
    credentialClaim({
      id: "c-ov-self",
      code: "OV",
      assertionLevel: "self_declared",
      lifecycleState: "active",
      issuedOn: "2024-06-01",
      validUntil: "2027-05-31",
    }),
  ]),
  credentialPersona("cred-ov-documented", "Alfred Fiktivsson", [
    credentialClaim({
      id: "c-ov-doc",
      code: "OV",
      assertionLevel: "document_provided",
      lifecycleState: "active",
      issuedOn: "2024-02-19",
      validUntil: "2027-02-18",
    }),
  ]),
  credentialPersona("cred-ov-current", "Stina Testsson", [
    credentialClaim({
      id: "c-ov-curr",
      code: "OV",
      assertionLevel: "verified",
      lifecycleState: "active",
      issuedOn: "2025-02-01",
      validUntil: "2028-01-31",
      verifier: "Fiktiva Myndigheten",
    }),
    credentialClaim({
      id: "c-ov-curr-vu2",
      code: "VU2",
      assertionLevel: "verified",
      lifecycleState: "active",
      issuedOn: "2023-08-21",
      verifier: "Väktarskolan Fiktiv AB",
    }),
  ]),
  // A verified appointment whose validity has ended: still verified,
  // no longer current — the state the symbols must never dress up.
  credentialPersona("cred-ov-expired", "Rut Provsson", [
    credentialClaim({
      id: "c-ov-exp",
      code: "OV",
      assertionLevel: "verified",
      lifecycleState: "expired",
      issuedOn: "2023-03-01",
      validUntil: "2026-02-28",
      verifier: "Fiktiva Myndigheten",
    }),
    credentialClaim({
      id: "c-ov-exp-vu1",
      code: "VU1",
      assertionLevel: "verified",
      lifecycleState: "active",
      issuedOn: "2022-11-14",
      verifier: "Väktarskolan Fiktiv AB",
    }),
  ]),
  // The case a stored-state filter gets wrong: still recorded `active`,
  // because nothing writes `expired` on the day a licence lapses, but its
  // validity ended before the evaluation date. Every surface must derive
  // the expiry rather than believe the row.
  credentialPersona("cred-ov-lapsed-silently", "Ingrid Testsson", [
    credentialClaim({
      id: "c-ov-lapsed",
      code: "OV",
      assertionLevel: "verified",
      lifecycleState: "active",
      issuedOn: "2023-06-01",
      validUntil: "2026-05-31",
      verifier: "Fiktiva Myndigheten",
    }),
  ]),
  credentialPersona("cred-sv-current", "Folke Exempelsson", [
    credentialClaim({
      id: "c-sv-curr",
      code: "SV",
      assertionLevel: "verified",
      lifecycleState: "active",
      issuedOn: "2026-01-16",
      validUntil: "2029-01-15",
      verifier: "Fiktiva Myndigheten",
    }),
  ]),
  credentialPersona("cred-sv-disputed", "Tyra Fiktivsson", [
    credentialClaim({
      id: "c-sv-disp",
      code: "SV",
      assertionLevel: "document_provided",
      lifecycleState: "disputed",
      issuedOn: "2024-10-01",
      validUntil: "2027-09-30",
    }),
  ]),
  // A corrected credential: the superseded version stays in history, the
  // correction carries the code forward and starts unverified again.
  credentialPersona("cred-corrected", "Greta Provsson", [
    credentialClaim({
      id: "c-corr-v1",
      code: "VU1",
      assertionLevel: "verified",
      lifecycleState: "superseded",
      issuedOn: "2024-01-20",
      verifier: "Väktarskolan Fiktiv AB",
    }),
    credentialClaim({
      id: "c-corr-v2",
      code: "VU1",
      assertionLevel: "self_declared",
      lifecycleState: "active",
      issuedOn: "2024-01-22",
      versionNo: 2,
      supersedes: "c-corr-v1",
    }),
  ]),
];

// ── Personas ─────────────────────────────────────────────────────────────

const PERSONA_SEEDS: readonly PersonaSeed[] = [
  // 1 — Career Discovery result, no Passport. Proves the two products are
  //     independent: the candidate home shows one entry populated, one not.
  {
    id: "career-discovery-only",
    displayName: "Nils Exempelsson",
    professionSlug: null,
    jurisdictionCode: "SE",
    periods: [],
    claims: [],
    hasCareerDiscoveryResult: true,
  },

  // 2 — Passport, no Career Discovery result. The mirror case: a Passport
  //     never requires Career Discovery, and nothing suggests it does.
  {
    id: "passport-only",
    displayName: "Alva Testsson",
    professionSlug: "vaktare",
    jurisdictionCode: "SE",
    periods: [
      period({
        id: "p-alva-1",
        employerName: "Stadsskydd Sverige AB",
        roleTitle: "Väktare",
        professionSlug: "vaktare",
        jurisdictionCode: "SE",
        employmentType: "full_time",
        fteFraction: 1,
        securityRelevance: "primary",
        securityFraction: 1,
        startedOn: "2023-09-01",
        endedOn: null,
        assertionLevel: "self_declared",
        lifecycleState: "active",
        verifierName: null,
      }),
    ],
    claims: [grundutbildningSelfDeclared, firstAidSelfDeclared],
    hasCareerDiscoveryResult: false,
  },

  // 3 — New Väktare. The empty-to-partial state most first users will see:
  //     everything self-reported, no recognition, and that stated plainly.
  {
    id: "new-vaktare",
    displayName: "Iris Provsson",
    professionSlug: "vaktare",
    jurisdictionCode: "SE",
    periods: [
      period({
        id: "p-iris-1",
        employerName: "Nordvakt Bevakning AB",
        roleTitle: "Väktare",
        professionSlug: "vaktare",
        jurisdictionCode: "SE",
        employmentType: "full_time",
        fteFraction: 1,
        securityRelevance: "primary",
        securityFraction: 1,
        startedOn: "2025-12-01",
        endedOn: null,
        assertionLevel: "self_declared",
        lifecycleState: "active",
        verifierName: null,
      }),
    ],
    claims: [grundutbildningSelfDeclared],
    hasCareerDiscoveryResult: false,
  },

  // 4 — Overlapping employers. Naïve addition gives ~6.95 years; the union
  //     gives ~5.46. The gap between those two numbers is the whole reason
  //     experience.ts works in segments.
  {
    id: "overlapping-employers",
    displayName: "Björn Fiktivsson",
    professionSlug: "vaktare",
    jurisdictionCode: "SE",
    periods: [
      period({
        id: "p-bjorn-1",
        employerName: "Nordvakt Bevakning AB",
        roleTitle: "Väktare",
        professionSlug: "vaktare",
        jurisdictionCode: "SE",
        employmentType: "full_time",
        fteFraction: 1,
        securityRelevance: "primary",
        securityFraction: 1,
        startedOn: "2021-03-01",
        endedOn: "2024-03-01",
        assertionLevel: "verified",
        lifecycleState: "active",
        verifierName: "Nordvakt Bevakning AB",
      }),
      period({
        id: "p-bjorn-2",
        employerName: "Eventvakt Norr AB",
        roleTitle: "Eventvärd, säkerhet",
        professionSlug: "vaktare",
        jurisdictionCode: "SE",
        employmentType: "part_time",
        fteFraction: 0.4,
        securityRelevance: "primary",
        securityFraction: 1,
        // Wholly inside p-bjorn-1 — contributes no additional elapsed time.
        startedOn: "2022-01-01",
        endedOn: "2023-06-30",
        assertionLevel: "self_declared",
        lifecycleState: "active",
        verifierName: null,
      }),
      period({
        id: "p-bjorn-3",
        employerName: "Stadsskydd Sverige AB",
        roleTitle: "Väktare",
        professionSlug: "vaktare",
        jurisdictionCode: "SE",
        employmentType: "full_time",
        fteFraction: 1,
        securityRelevance: "primary",
        securityFraction: 1,
        startedOn: "2024-03-01",
        endedOn: null,
        assertionLevel: "self_declared",
        lifecycleState: "active",
        verifierName: null,
      }),
    ],
    claims: [licenceActiveVerified, grundutbildningSelfDeclared],
    hasCareerDiscoveryResult: true,
  },

  // 5 — Part-time. Elapsed ≈ 4.0 years, FTE ≈ 2.0. Both shown; neither
  //     silently replaces the other.
  {
    id: "part-time",
    displayName: "Saga Testsson",
    professionSlug: "vaktare",
    jurisdictionCode: "SE",
    periods: [
      period({
        id: "p-saga-1",
        employerName: "Nordvakt Bevakning AB",
        roleTitle: "Väktare, deltid",
        professionSlug: "vaktare",
        jurisdictionCode: "SE",
        employmentType: "part_time",
        fteFraction: 0.5,
        securityRelevance: "primary",
        securityFraction: 1,
        startedOn: "2022-08-01",
        endedOn: null,
        assertionLevel: "verified",
        lifecycleState: "active",
        verifierName: "Nordvakt Bevakning AB",
      }),
    ],
    claims: [licenceActiveVerified],
    hasCareerDiscoveryResult: false,
  },

  // 6 — Career break. The gap is simply absent from the union: not
  //     penalised, not annotated, not explained away.
  {
    id: "career-break",
    displayName: "Otto Exempelsson",
    professionSlug: "vaktare",
    jurisdictionCode: "SE",
    periods: [
      period({
        id: "p-otto-1",
        employerName: "Stadsskydd Sverige AB",
        roleTitle: "Väktare",
        professionSlug: "vaktare",
        jurisdictionCode: "SE",
        employmentType: "full_time",
        fteFraction: 1,
        securityRelevance: "primary",
        securityFraction: 1,
        startedOn: "2018-01-01",
        endedOn: "2020-01-01",
        assertionLevel: "verified",
        lifecycleState: "active",
        verifierName: "Stadsskydd Sverige AB",
      }),
      period({
        id: "p-otto-2",
        employerName: "Nordvakt Bevakning AB",
        roleTitle: "Väktare",
        professionSlug: "vaktare",
        jurisdictionCode: "SE",
        employmentType: "full_time",
        fteFraction: 1,
        securityRelevance: "primary",
        securityFraction: 1,
        startedOn: "2021-07-01",
        endedOn: "2023-07-01",
        assertionLevel: "verified",
        lifecycleState: "active",
        verifierName: "Nordvakt Bevakning AB",
      }),
    ],
    claims: [licenceActiveVerified, grundutbildningSelfDeclared],
    hasCareerDiscoveryResult: false,
  },

  // 7 — Mixed evidence. Reported clears five years; verified does not. This
  //     persona is the one that proves mixed evidence yields NO badge, and
  //     it also carries the documented-but-unverified certification and a
  //     partly-security role.
  {
    id: "mixed-evidence",
    displayName: "Vera Provsson",
    professionSlug: "vaktare",
    jurisdictionCode: "SE",
    periods: [
      period({
        id: "p-vera-1",
        employerName: "Eventvakt Norr AB",
        roleTitle: "Väktare",
        professionSlug: "vaktare",
        jurisdictionCode: "SE",
        employmentType: "full_time",
        fteFraction: 1,
        securityRelevance: "primary",
        securityFraction: 1,
        startedOn: "2019-01-01",
        endedOn: "2022-01-01",
        assertionLevel: "self_declared",
        lifecycleState: "active",
        verifierName: null,
      }),
      period({
        id: "p-vera-2",
        employerName: "Datacenter Syd AB",
        roleTitle: "Väktare, kontrollrum",
        professionSlug: "vaktare",
        jurisdictionCode: "SE",
        employmentType: "full_time",
        fteFraction: 1,
        securityRelevance: "primary",
        securityFraction: 1,
        startedOn: "2022-01-01",
        endedOn: "2025-07-01",
        assertionLevel: "verified",
        lifecycleState: "active",
        verifierName: "Datacenter Syd AB",
      }),
      period({
        id: "p-vera-3",
        employerName: "Stadsskydd Sverige AB",
        roleTitle: "Receptionist med säkerhetsansvar",
        professionSlug: null,
        jurisdictionCode: "SE",
        employmentType: "full_time",
        fteFraction: 1,
        // Half the role was security work, stated explicitly. The
        // calculation never infers a fraction.
        securityRelevance: "partial",
        securityFraction: 0.5,
        startedOn: "2025-07-01",
        endedOn: null,
        assertionLevel: "self_declared",
        lifecycleState: "active",
        verifierName: null,
      }),
    ],
    claims: [asisDocumented, controlRoomVerified, dataCentreSelfDeclared, firstAidSelfDeclared],
    hasCareerDiscoveryResult: true,
  },

  // 8 — Fully verified. The only persona that earns a badge, and the
  //     reference point for what a populated Passport looks like.
  {
    id: "five-verified-years",
    displayName: "Elias Fiktivsson",
    professionSlug: "vaktare",
    jurisdictionCode: "SE",
    periods: [
      period({
        id: "p-elias-1",
        employerName: "Nordvakt Bevakning AB",
        roleTitle: "Väktare",
        professionSlug: "vaktare",
        jurisdictionCode: "SE",
        employmentType: "full_time",
        fteFraction: 1,
        securityRelevance: "primary",
        securityFraction: 1,
        startedOn: "2019-06-01",
        endedOn: "2022-06-01",
        assertionLevel: "verified",
        lifecycleState: "active",
        verifierName: "Nordvakt Bevakning AB",
      }),
      period({
        id: "p-elias-2",
        employerName: "Datacenter Syd AB",
        roleTitle: "Väktare, kontrollrum",
        professionSlug: "vaktare",
        jurisdictionCode: "SE",
        employmentType: "full_time",
        fteFraction: 1,
        securityRelevance: "primary",
        securityFraction: 1,
        startedOn: "2022-06-01",
        endedOn: null,
        assertionLevel: "verified",
        lifecycleState: "active",
        verifierName: "Datacenter Syd AB",
      }),
    ],
    claims: [licenceActiveVerified, controlRoomVerified, asisDocumented, firstAidSelfDeclared],
    hasCareerDiscoveryResult: true,
  },

  // 10 — Expired verified licence. Verified history intact, validity gone.
  {
    id: "expired-licence",
    displayName: "Maja Testsson",
    professionSlug: "vaktare",
    jurisdictionCode: "SE",
    periods: [
      period({
        id: "p-maja-1",
        employerName: "Stadsskydd Sverige AB",
        roleTitle: "Väktare",
        professionSlug: "vaktare",
        jurisdictionCode: "SE",
        employmentType: "full_time",
        fteFraction: 1,
        securityRelevance: "primary",
        securityFraction: 1,
        startedOn: "2019-05-02",
        endedOn: "2024-05-01",
        assertionLevel: "verified",
        lifecycleState: "active",
        verifierName: "Stadsskydd Sverige AB",
      }),
    ],
    claims: [licenceExpiredVerified, grundutbildningSelfDeclared],
    hasCareerDiscoveryResult: false,
  },

  // 11 — Disputed. A disputed period drops out of every total immediately,
  //      and the disputed claim keeps its history rather than vanishing.
  {
    id: "disputed-claim",
    displayName: "Hugo Exempelsson",
    professionSlug: "vaktare",
    jurisdictionCode: "SE",
    periods: [
      period({
        id: "p-hugo-1",
        employerName: "Nordvakt Bevakning AB",
        roleTitle: "Väktare",
        professionSlug: "vaktare",
        jurisdictionCode: "SE",
        employmentType: "full_time",
        fteFraction: 1,
        securityRelevance: "primary",
        securityFraction: 1,
        startedOn: "2021-01-01",
        endedOn: "2024-01-01",
        assertionLevel: "verified",
        lifecycleState: "active",
        verifierName: "Nordvakt Bevakning AB",
      }),
      period({
        id: "p-hugo-2",
        employerName: "Eventvakt Norr AB",
        roleTitle: "Väktare",
        professionSlug: "vaktare",
        jurisdictionCode: "SE",
        employmentType: "full_time",
        fteFraction: 1,
        securityRelevance: "primary",
        securityFraction: 1,
        startedOn: "2024-01-01",
        endedOn: "2025-06-01",
        assertionLevel: "self_declared",
        // Excluded from every total while disputed.
        lifecycleState: "disputed",
        verifierName: null,
      }),
    ],
    claims: [disputedTraining, licenceActiveVerified],
    hasCareerDiscoveryResult: false,
  },

  // 12+ — Phase 6 credential states, one persona per required visual
  //       fixture. See CREDENTIAL_PERSONAS above.
  ...CREDENTIAL_PERSONAS,
] as const;

/** Every persona, with its professional identity derived from its own claims.
 *  Nothing here can state a title it does not hold the credentials for. */
export const PERSONAS: readonly PassportHolder[] = PERSONA_SEEDS.map(persona);

export function personaById(id: string): PassportHolder {
  return PERSONAS.find((p) => p.id === id) ?? PERSONAS[0];
}

/** Case 12 — the three recipient-facing disclosure states. Each pairs a
 *  persona with a share whose status is decided by dates and revocation,
 *  never by a hand-set label. */
export interface DisclosureFixture {
  readonly id: string;
  readonly personaId: string;
  readonly request: DisclosureRequest;
}

export const DISCLOSURE_FIXTURES: readonly DisclosureFixture[] = [
  {
    id: "valid",
    personaId: "five-verified-years",
    request: {
      packageId: "verified",
      optionalIncluded: ["recognition"],
      recipientHint: "Rekryterande arbetsgivare (fiktiv)",
      expiresOn: "2026-09-15",
      revoked: false,
    },
  },
  {
    id: "expired",
    personaId: "five-verified-years",
    request: {
      packageId: "overview",
      optionalIncluded: [],
      recipientHint: "Rekryterande arbetsgivare (fiktiv)",
      expiresOn: "2026-06-30",
      revoked: false,
    },
  },
  {
    id: "revoked",
    personaId: "mixed-evidence",
    request: {
      packageId: "training",
      optionalIncluded: [],
      recipientHint: null,
      expiresOn: "2026-12-01",
      revoked: true,
    },
  },
  {
    id: "disputed-content",
    personaId: "disputed-claim",
    request: {
      packageId: "employer",
      optionalIncluded: ["training"],
      recipientHint: "Uppdragsgivare (fiktiv)",
      expiresOn: "2026-10-01",
      revoked: false,
    },
  },
  {
    id: "licence-cross-border",
    personaId: "expired-licence",
    request: {
      packageId: "licence",
      optionalIncluded: [],
      recipientHint: null,
      expiresOn: "2026-11-01",
      revoked: false,
    },
  },
] as const;
