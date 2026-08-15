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
    // every profession is strong (Master Completion Mandate item 24). The
    // previous version of this fixture was near-perfectly flat (0.64-0.70
    // across all 16 dimensions), which trivially cleared every profession's
    // central-fit floor and produced 14 of 14 matches — indistinguishable
    // from "everything fits" in practice, even though the engine itself was
    // working correctly. Redesigned with three genuine relative peaks
    // (operational, analytical/technical, coordination — the same three
    // directions item 24's own example names) at 0.8, and a clearly lower
    // baseline (0.45, below most professions' central band floors) on
    // everything else — so a real subset of professions should now
    // genuinely miss on their own defining dimensions, not just average out
    // close either way.
    dims: {
      // Operational cluster
      CID01: 0.8,
      CID06: 0.8,
      CID12: 0.8,
      CID16: 0.8,
      // Analytical / technical cluster
      CID03: 0.8,
      CID04: 0.8,
      CID10: 0.8,
      CID11: 0.8,
      // Coordination cluster
      CID02: 0.8,
      CID05: 0.8,
      CID07: 0.8,
      CID13: 0.8,
      // Baseline — clearly lower, not just "a bit lower"
      CID08: 0.45,
      CID09: 0.45,
      CID14: 0.45,
    },
  },
  {
    id: "sparse",
    name: { sv: "Gles / tvetydig profil", en: "Sparse / ambiguous profile" },
    contextStatus: "exploring_security",
    dims: { CID01: 0.5, CID06: 0.5 },
  },
];
