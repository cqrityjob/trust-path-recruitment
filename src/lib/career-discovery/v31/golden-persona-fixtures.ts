// The golden personas, as plain dimension-score data. Shared by
// scripts/career-discovery-v31-golden-personas.ts (engine-level regression)
// and the admin owner-preview route
// (src/routes/_authenticated.admin.career-discovery-preview.tsx), so the
// two never drift into describing different personas.
//
// Originally the 9 required by Execution Mandate §30, extended to today's
// 16 by the Final Autonomous Matching Engine Completion Mandate's
// real-world validation list: Student, New entrant, Väktare 1-3y,
// Experienced Väktare, Security Coordinator, Security Manager 8+, Career
// changer, Technical, Cyber (distinct from Technical), Investigation, AML/
// compliance, Risk/crisis, Operational guarding, Broad junior, Broad
// senior, Sparse/ambiguous.

import type { DimensionId } from "./dimensions";
import type { ContextStatus } from "../types";
import type { ExperienceBand } from "../career-context";

export interface GoldenPersona {
  readonly id: string;
  readonly name: { readonly sv: string; readonly en: string };
  readonly contextStatus: ContextStatus;
  readonly dims: Partial<Record<DimensionId, number>>;
  /** Self-reported current profession (career-context.ts), as a CIG slug —
   *  set ONLY for personas whose identity genuinely includes "already
   *  working as X" (Väktare, Experienced Coordinator). Absent for personas
   *  who are new to security or whose current role isn't part of their
   *  defined identity — Master Completion Mandate item 2 is explicit that
   *  this must never be inferred, so most personas correctly have none. */
  readonly currentProfessionCigSlug?: string;
  /** Self-reported years in the current profession — Owner Approval Gate
   *  item 3: personas whose own name names an experience tier (Väktare
   *  1-3 years, Experienced Väktare, Säkerhetschef 8+ years) carry it here
   *  so the fixture is self-contained and the regression script actually
   *  exercises resolveStageBaseline's experience-refinement path, which no
   *  golden persona previously did (matchProfessions was always called
   *  without an experienceBand argument at all). Absent where experience
   *  isn't part of the persona's defined identity, same rule as
   *  currentProfessionCigSlug. */
  readonly experienceBand?: ExperienceBand;
}

export const GOLDEN_PERSONAS: readonly GoldenPersona[] = [
  {
    id: "student",
    name: { sv: "Student / ingen erfarenhet", en: "Student / no experience" },
    contextStatus: "exploring_security",
    dims: {
      CID01: 0.6,
      CID02: 0.4,
      CID03: 0.5,
      CID04: 0.4,
      CID05: 0.3,
      CID06: 0.6,
      CID07: 0.6,
      CID08: 0.7,
      CID09: 0.6,
      CID10: 0.4,
      CID11: 0.55,
      CID12: 0.55,
      CID13: 0.6,
      CID14: 0.75,
      CID16: 0.65,
      CID17: 0.4,
    },
  },
  {
    id: "new-to-security",
    name: { sv: "Ny inom säkerhet", en: "New to security" },
    contextStatus: "exploring_security",
    dims: {
      CID01: 0.75,
      CID02: 0.35,
      CID03: 0.45,
      CID04: 0.4,
      CID05: 0.3,
      CID06: 0.65,
      CID07: 0.5,
      CID08: 0.5,
      CID09: 0.55,
      CID10: 0.4,
      CID11: 0.6,
      CID12: 0.55,
      CID13: 0.55,
      CID14: 0.6,
      CID16: 0.6,
      CID17: 0.4,
    },
  },
  {
    // Owner Approval Gate item 3.A. Early-career: genuinely operational and
    // risk-aware from the start (why they chose the role), but the traits
    // that only come from years of real incidents -- composure,
    // independent decision-making, procedural structure -- are still
    // developing, not yet at a veteran's level. High learning orientation
    // reflects early-career growth.
    id: "vaktare",
    name: { sv: "Väktare (1-3 år)", en: "Väktare (1-3 years)" },
    contextStatus: "working_in_security",
    currentProfessionCigSlug: "vaktare",
    experienceBand: "1_3y",
    dims: {
      CID01: 0.75,
      CID02: 0.3,
      CID03: 0.45,
      CID04: 0.35,
      CID05: 0.25,
      CID06: 0.7,
      CID07: 0.55,
      CID08: 0.6,
      CID09: 0.55,
      CID10: 0.35,
      CID11: 0.6,
      CID12: 0.5,
      CID13: 0.6,
      CID14: 0.75,
      CID16: 0.6,
      CID17: 0.45,
    },
  },
  {
    // Owner Approval Gate item 3.B. A genuine veteran who chose depth in
    // the frontline role over pursuing management -- composure, structure
    // and independent decision-making are now at their peak (sharpened by
    // years of real incidents), but leadership/strategic orientation stay
    // low precisely because that path was never pursued. This is the
    // control case against 3.A: same profession, same central dimensions,
    // years of real experience are the only thing that moved.
    id: "experienced-vaktare",
    name: { sv: "Erfaren väktare (8+ år)", en: "Experienced Väktare (8+ years)" },
    contextStatus: "developing_current_role",
    currentProfessionCigSlug: "vaktare",
    experienceBand: "8_plus_y",
    dims: {
      CID01: 0.85,
      CID02: 0.35,
      CID03: 0.5,
      CID04: 0.45,
      CID05: 0.3,
      CID06: 0.88,
      CID07: 0.65,
      CID08: 0.6,
      CID09: 0.7,
      CID10: 0.4,
      CID11: 0.85,
      CID12: 0.8,
      CID13: 0.65,
      CID14: 0.55,
      CID16: 0.9,
      CID17: 0.55,
    },
  },
  {
    // Final Autonomous Matching Engine Completion Mandate: pure operational/
    // protective DNA evidence with NO current profession set -- deliberately
    // distinct from "vaktare"/"experienced-vaktare" (which both carry
    // currentProfessionCigSlug: "vaktare"). Tests that raw Career DNA alone,
    // with zero context/current-role influence, correctly surfaces Guarding
    // & Operational Protection professions strongly -- a candidate who has
    // never worked in security but whose answers show a decisive
    // operational/risk/conflict-handling lean, exactly Väktare/Ordningsvakt/
    // Skyddsvakt's shared central profile.
    id: "operational-guarding",
    name: { sv: "Operativ vaktprofil", en: "Operational guarding profile" },
    contextStatus: "exploring_security",
    dims: {
      CID01: 0.85,
      CID02: 0.3,
      CID03: 0.4,
      CID04: 0.3,
      CID05: 0.25,
      CID06: 0.8,
      CID07: 0.55,
      CID08: 0.55,
      CID09: 0.65,
      CID10: 0.35,
      CID11: 0.6,
      CID12: 0.55,
      CID13: 0.55,
      CID14: 0.55,
      CID16: 0.7,
      CID17: 0.4,
    },
  },
  {
    // Owner Approval Gate item 3.C — mandatory. A genuine senior security
    // leader, 8+ years, years removed from frontline work: leadership,
    // strategic thinking and communication are the defining traits;
    // operational/conflict/investigative orientation are real but
    // secondary, reflecting oversight rather than hands-on frontline work.
    // This is the exact profile shape the Career Area structural-bias fix
    // (career-areas.ts, AREA_RANK_METHOD) must rank correctly: SCA04
    // Security Leadership & Coordination should outrank SCA01 Guarding &
    // Operational Protection for this candidate, not the other way round.
    id: "sakerhetschef-senior",
    name: { sv: "Säkerhetschef (8+ år)", en: "Säkerhetschef / Head of Security (8+ years)" },
    contextStatus: "security_leader",
    currentProfessionCigSlug: "sakerhetschef",
    experienceBand: "8_plus_y",
    dims: {
      CID01: 0.3,
      CID02: 0.9,
      CID03: 0.7,
      CID04: 0.4,
      CID05: 0.88,
      CID06: 0.8,
      CID07: 0.88,
      CID08: 0.5,
      CID09: 0.5,
      CID10: 0.35,
      CID11: 0.78,
      CID12: 0.78,
      CID13: 0.85,
      CID14: 0.65,
      CID16: 0.78,
      CID17: 0.55,
    },
  },
  {
    id: "experienced-coordinator",
    name: { sv: "Erfaren säkerhetssamordnare", en: "Experienced Säkerhetssamordnare" },
    contextStatus: "developing_current_role",
    currentProfessionCigSlug: "sakerhetssamordnare",
    dims: {
      CID01: 0.4,
      CID02: 0.8,
      CID03: 0.6,
      CID04: 0.45,
      CID05: 0.65,
      CID06: 0.7,
      CID07: 0.85,
      CID08: 0.55,
      CID09: 0.6,
      CID10: 0.4,
      CID11: 0.85,
      CID12: 0.7,
      CID13: 0.8,
      CID14: 0.7,
      CID16: 0.65,
      CID17: 0.55,
    },
  },
  {
    id: "career-changer",
    name: {
      sv: "Karriärbytare (redan i säkerhet)",
      en: "Career changer (already working in security)",
    },
    contextStatus: "changing_career_area",
    dims: {
      CID01: 0.5,
      CID02: 0.55,
      CID03: 0.55,
      CID04: 0.4,
      CID05: 0.5,
      CID06: 0.6,
      CID07: 0.65,
      CID08: 0.65,
      CID09: 0.55,
      CID10: 0.45,
      CID11: 0.7,
      CID12: 0.6,
      CID13: 0.65,
      CID14: 0.65,
      CID16: 0.6,
      CID17: 0.5,
    },
  },
  {
    id: "technical",
    name: { sv: "Teknisk profil", en: "Technical profile" },
    contextStatus: "working_in_security",
    dims: {
      CID01: 0.3,
      CID02: 0.4,
      CID03: 0.8,
      CID04: 0.85,
      CID05: 0.5,
      CID06: 0.6,
      CID07: 0.5,
      CID08: 0.3,
      CID09: 0.25,
      CID10: 0.6,
      CID11: 0.6,
      CID12: 0.55,
      CID13: 0.5,
      CID14: 0.75,
      CID16: 0.55,
      CID17: 0.35,
    },
  },
  {
    // Final Autonomous Matching Engine Completion Mandate: distinct from
    // "technical" (SP014 Sakerhetstekniker -- physical installation/
    // maintenance, CID01+CID04 central). This persona is forward-looking
    // information-security work: strategic orientation (staying ahead of
    // evolving threats, SP009 Cybersakerhetsanalytiker's third central
    // dimension) is genuinely elevated, not just "high analytical/technical
    // again" -- and CID01 is pushed low enough to clearly miss
    // Sakerhetstekniker's central band, so the two personas separate.
    id: "cyber",
    name: { sv: "Cybersäkerhetsprofil", en: "Cyber profile" },
    contextStatus: "working_in_security",
    dims: {
      CID01: 0.25,
      CID02: 0.35,
      CID03: 0.8,
      CID04: 0.85,
      CID05: 0.7,
      CID06: 0.65,
      CID07: 0.45,
      CID08: 0.25,
      CID09: 0.2,
      CID10: 0.45,
      CID11: 0.55,
      CID12: 0.55,
      CID13: 0.5,
      CID14: 0.8,
      CID16: 0.55,
      CID17: 0.4,
    },
  },
  {
    id: "investigation",
    name: { sv: "Utredande / analytisk profil", en: "Investigation / analysis profile" },
    contextStatus: "working_in_security",
    dims: {
      CID01: 0.35,
      CID02: 0.4,
      CID03: 0.75,
      CID04: 0.5,
      CID05: 0.5,
      CID06: 0.6,
      CID07: 0.6,
      CID08: 0.35,
      CID09: 0.35,
      CID10: 0.85,
      CID11: 0.8,
      CID12: 0.6,
      CID13: 0.5,
      CID14: 0.65,
      CID16: 0.55,
      // Investigative genuinely overlaps compliance-review work, but
      // deliberately kept short of the AML persona's 0.85 -- a real
      // Sakerhetsutredare/AML pairwise test needs one to clear CID17's
      // central-coverage gate and the other not to.
      CID17: 0.45,
    },
  },
  {
    // Final Autonomous Matching Engine Completion Mandate: the persona
    // CID17 (Regulatory & Compliance Orientation) was built for. Analytical
    // + Investigative are genuinely present (shared with "investigation"),
    // but CID17 is the clearly dominant, distinguishing signal at 0.85 --
    // without it this profile would be indistinguishable from
    // Sakerhetsutredare (Security Investigator), exactly the pairing
    // DOMAIN_ONLY_CENTRAL_RULE's recalibration had to solve. Operational
    // and conflict-handling are pushed low: this is desk-based transaction
    // review, not frontline work.
    id: "aml-compliance",
    name: { sv: "AML / regelefterlevnadsprofil", en: "AML / compliance profile" },
    contextStatus: "working_in_security",
    dims: {
      CID01: 0.2,
      CID02: 0.3,
      CID03: 0.8,
      CID04: 0.4,
      CID05: 0.45,
      CID06: 0.6,
      CID07: 0.5,
      CID08: 0.25,
      CID09: 0.25,
      CID10: 0.7,
      CID11: 0.65,
      CID12: 0.55,
      CID13: 0.5,
      CID14: 0.6,
      CID16: 0.55,
      CID17: 0.85,
    },
  },
  {
    // Final Autonomous Matching Engine Completion Mandate: built to clear
    // both Riskchef (SP011: Analytical + Strategic + Risk central) and
    // Krisberedskapssamordnare (SP012: Strategic + Risk central) -- a real
    // risk/crisis-oriented profile, genuinely different from
    // "sakerhetschef-senior" (leadership-led) and "aml-compliance"
    // (compliance-led) despite sharing some analytical/strategic ground.
    id: "risk-crisis",
    name: { sv: "Risk- och krisprofil", en: "Risk / crisis profile" },
    contextStatus: "working_in_security",
    dims: {
      CID01: 0.3,
      CID02: 0.55,
      CID03: 0.75,
      CID04: 0.4,
      CID05: 0.8,
      CID06: 0.85,
      CID07: 0.55,
      CID08: 0.3,
      CID09: 0.4,
      CID10: 0.4,
      CID11: 0.7,
      CID12: 0.6,
      CID13: 0.65,
      CID14: 0.65,
      CID16: 0.65,
      CID17: 0.5,
    },
  },
  {
    id: "broad-profile",
    name: { sv: "Bred profil (junior)", en: "Broad profile (junior)" },
    contextStatus: "working_in_security",
    // "Broad" means several genuine directions remain plausible, NOT that
    // every profession is strong (Autonomous Quality Pass, golden persona
    // audit). Two earlier versions of this fixture both collapsed into
    // "everything fits": v1 was near-perfectly flat (0.64-0.70 everywhere,
    // 14/14 matched); v2 elevated three full clusters to 0.8 (12 of 16
    // scored dimensions), which was still "flat-high" wearing a disguise,
    // producing 13/14 matches (missing only Ordningsvakt). Root cause found
    // by reading scoreProfession's actual arithmetic (professions.ts): the
    // central-fit penalty is a WEIGHTED AVERAGE across all central bands, so
    // exceeding 3 of 4 central bands makes a single narrow miss on the 4th
    // nearly invisible -- it can never mathematically fail
    // PROFESSION_MIN_CENTRAL_FIT alone. The only real disqualifier is the
    // hard CENTRAL_DIMENSION_MAX_MISS gate (0.18), so a fixture needs every
    // dimension it wants a profession to genuinely fail on to miss by
    // clearly more than that, not just "somewhat lower".
    //
    // Redesigned a third time: ONE genuine primary strength (operational +
    // risk, a real, coherent frontline profile) at 0.78; structure &
    // documentation kept at a solid 0.62, since it is a near-universal
    // secondary requirement across the catalogue (suppressing it also wrongly
    // disqualifies Väktare itself); a modest, deliberately non-dominant
    // coordination lean at 0.55 (present, but on its own not enough to clear
    // Head of Security, which also needs genuine strategic evidence); and
    // true specialty dimensions -- analytical, technical, strategic,
    // service, conflict, investigative, learning -- clearly suppressed at
    // 0.35, comfortably past the 0.18 max-miss gate against every specialty
    // profession's band floor. A real "broad, capable, no dominant
    // specialty" candidate should read as operationally strong with decent
    // general structure and a plausible coordination stretch goal, not as
    // equally excellent at investigation, cybersecurity, and risk strategy
    // too.
    dims: {
      // Primary strength: operational + risk (coherent frontline profile)
      CID01: 0.78,
      CID06: 0.78,
      CID12: 0.78,
      CID16: 0.78,
      // Near-universal secondary competence: structure & documentation
      CID11: 0.62,
      // Modest, deliberately non-dominant coordination lean
      CID02: 0.55,
      CID07: 0.55,
      CID13: 0.55,
      // True specialty dimensions -- clearly suppressed, not just "lower"
      CID03: 0.35,
      CID04: 0.35,
      CID05: 0.35,
      CID08: 0.35,
      CID09: 0.35,
      CID10: 0.35,
      CID14: 0.35,
      CID17: 0.35,
    },
  },
  {
    // Final Autonomous Matching Engine Completion Mandate: senior-tier
    // counterpart to "broad-profile" (junior) -- a capable senior candidate
    // who genuinely spans several senior-appropriate directions (Head of
    // Security, Risk Manager, Security Coordinator) rather than one narrow
    // specialty. Same design discipline as the junior version: one coherent
    // primary cluster (leadership + strategic + risk, all senior-central
    // dimensions across SP007/SP011/SP012) at 0.75, not a flat-high wall --
    // true specialty dimensions (technical, investigative, service) stay
    // clearly suppressed at 0.35 so this remains "broad within a plausible
    // senior band", not "matches everything".
    id: "broad-profile-senior",
    name: { sv: "Bred profil (senior)", en: "Broad profile (senior)" },
    contextStatus: "security_leader",
    experienceBand: "8_plus_y",
    dims: {
      // Primary strength: leadership + strategic + risk (coherent senior
      // cluster spanning Head of Security / Risk Manager / Crisis Coord.)
      CID02: 0.75,
      CID05: 0.75,
      CID06: 0.75,
      // Near-universal senior secondary competence
      CID07: 0.65,
      CID11: 0.65,
      CID13: 0.6,
      CID16: 0.65,
      // True specialty dimensions -- clearly suppressed, not just "lower"
      CID01: 0.35,
      CID03: 0.4,
      CID04: 0.3,
      CID08: 0.35,
      CID09: 0.4,
      CID10: 0.35,
      CID12: 0.55,
      CID14: 0.5,
      CID17: 0.4,
    },
  },
  {
    id: "sparse",
    name: { sv: "Gles / tvetydig profil", en: "Sparse / ambiguous profile" },
    contextStatus: "exploring_security",
    dims: { CID01: 0.5, CID06: 0.5 },
  },
];
