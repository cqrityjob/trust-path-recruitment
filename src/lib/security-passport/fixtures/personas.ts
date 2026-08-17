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

function claim(c: Claim): Claim {
  return c;
}

// ── Reusable claim rows ──────────────────────────────────────────────────

const grundutbildningSelfDeclared = claim({
  id: "c-grund-self",
  claimType: "training",
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

// ── Personas ─────────────────────────────────────────────────────────────

export const PERSONAS: readonly PassportHolder[] = [
  // 1 — Career Discovery result, no Passport. Proves the two products are
  //     independent: the candidate home shows one entry populated, one not.
  {
    id: "career-discovery-only",
    displayName: "Nils Exempelsson",
    professionSlug: null,
    professionTitleSv: "Ej angivet",
    professionTitleEn: "Not stated",
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
    professionTitleSv: VAKTARE_SV,
    professionTitleEn: VAKTARE_EN,
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
    professionTitleSv: VAKTARE_SV,
    professionTitleEn: VAKTARE_EN,
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
    professionTitleSv: VAKTARE_SV,
    professionTitleEn: VAKTARE_EN,
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
    professionTitleSv: VAKTARE_SV,
    professionTitleEn: VAKTARE_EN,
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
    professionTitleSv: VAKTARE_SV,
    professionTitleEn: VAKTARE_EN,
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
    professionTitleSv: VAKTARE_SV,
    professionTitleEn: VAKTARE_EN,
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
    professionTitleSv: VAKTARE_SV,
    professionTitleEn: VAKTARE_EN,
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
    professionTitleSv: VAKTARE_SV,
    professionTitleEn: VAKTARE_EN,
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
    professionTitleSv: VAKTARE_SV,
    professionTitleEn: VAKTARE_EN,
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
] as const;

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
