// The 9 required golden personas (Execution Mandate §30), as plain
// dimension-score data. Shared by scripts/career-discovery-v31-golden-
// personas.ts (engine-level regression) and the admin owner-preview route
// (src/routes/_authenticated.admin.career-discovery-preview.tsx), so the
// two never drift into describing different personas.

import type { DimensionId } from "./dimensions";
import type { ContextStatus } from "../types";

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
    },
  },
  {
    id: "vaktare",
    name: { sv: "Väktare", en: "Väktare" },
    contextStatus: "working_in_security",
    currentProfessionCigSlug: "vaktare",
    dims: {
      CID01: 0.85,
      CID02: 0.4,
      CID03: 0.5,
      CID04: 0.4,
      CID05: 0.3,
      CID06: 0.85,
      CID07: 0.6,
      CID08: 0.6,
      CID09: 0.6,
      CID10: 0.4,
      CID11: 0.8,
      CID12: 0.65,
      CID13: 0.6,
      CID14: 0.55,
      CID16: 0.85,
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
    },
  },
  {
    id: "broad-profile",
    name: { sv: "Bred profil", en: "Broad profile" },
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
    },
  },
  {
    id: "sparse",
    name: { sv: "Gles / tvetydig profil", en: "Sparse / ambiguous profile" },
    contextStatus: "exploring_security",
    dims: { CID01: 0.5, CID06: 0.5 },
  },
];
