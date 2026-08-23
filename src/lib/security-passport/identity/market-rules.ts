// Security Passport — the Swedish derivation rules, mirrored for callers with
// no database.
//
// ── WHY A MIRROR EXISTS AT ALL ─────────────────────────────────────────
//
// `sp_professional_titles` is authoritative. The live product reads it, and
// adding a rule is an INSERT rather than a deploy.
//
// But two callers legitimately have no database: the fixture personas that
// drive the prototype harness, and the table-driven engine tests. Giving them
// their own hand-written rules would be a second source of truth — one that
// agrees today and drifts the first time somebody edits the migration.
//
// So this file is a MIRROR, and `scripts/passport-title-derivation-check.ts`
// parses the seed block out of
// 20260907091000_sp_sweden_truth_model.sql and fails the build if the two
// disagree on a single code, credential, output kind, label or priority.
// Editing one without the other cannot reach main.
//
// It is deliberately not used at runtime. `listTitleRules` reads the database,
// so a rule added in production takes effect without touching this file.

import type { TitleRule } from "./types";

const SE = "SE";

/** Sweden. Mirrors the seed in 20260907091000_sp_sweden_truth_model.sql. */
export const SWEDEN_TITLE_RULES: readonly TitleRule[] = [
  // ── Education: what you finished, and nothing more ────────────────────
  {
    code: "SE_VU1_COMPLETED",
    marketPackCode: SE,
    professionFamilyCode: null,
    regulatedRoleCode: null,
    outputKind: "education_completed",
    nameLocal: "Väktarutbildning 1 (VU1) genomförd",
    nameEn: "Security Guard Training 1 (VU1) completed",
    nameAr: null,
    requiresCredentialCodes: ["VU1"],
    requiresAssertionLevel: "verified",
    requiresCurrentValidity: true,
    priority: 10,
  },
  {
    code: "SE_VU2_COMPLETED",
    marketPackCode: SE,
    professionFamilyCode: null,
    regulatedRoleCode: null,
    outputKind: "education_completed",
    nameLocal: "Väktarutbildning 2 (VU2) genomförd",
    nameEn: "Security Guard Training 2 (VU2) completed",
    nameAr: null,
    requiresCredentialCodes: ["VU2"],
    requiresAssertionLevel: "verified",
    requiresCurrentValidity: true,
    priority: 11,
  },
  {
    code: "SE_OV_TRAINING_COMPLETED",
    marketPackCode: SE,
    professionFamilyCode: null,
    regulatedRoleCode: null,
    outputKind: "education_completed",
    nameLocal: "Ordningsvaktsutbildning genomförd",
    nameEn: "Public order guard training completed",
    nameAr: null,
    requiresCredentialCodes: ["OV_TRAINING"],
    requiresAssertionLevel: "verified",
    requiresCurrentValidity: true,
    priority: 12,
  },
  {
    code: "SE_OV_REFRESHER_COMPLETED",
    marketPackCode: SE,
    professionFamilyCode: null,
    regulatedRoleCode: null,
    outputKind: "education_completed",
    nameLocal: "Fortbildning genomförd",
    nameEn: "Refresher training completed",
    nameAr: null,
    requiresCredentialCodes: ["OV_REFRESHER"],
    requiresAssertionLevel: "verified",
    requiresCurrentValidity: true,
    priority: 13,
  },
  {
    code: "SE_OV_TRANSPORT_COMPLETED",
    marketPackCode: SE,
    professionFamilyCode: null,
    regulatedRoleCode: null,
    outputKind: "education_completed",
    nameLocal: "Särskild transportutbildning genomförd",
    nameEn: "Special transport training completed",
    nameAr: null,
    requiresCredentialCodes: ["OV_TRANSPORT"],
    requiresAssertionLevel: "verified",
    requiresCurrentValidity: true,
    priority: 14,
  },

  // ── Competence: BOTH steps. The AND that the mutation test defends. ───
  {
    code: "SE_VAKTARE_COMPETENCE",
    marketPackCode: SE,
    professionFamilyCode: "SECURITY_GUARD",
    regulatedRoleCode: "SE_VAKTARE",
    outputKind: "professional_competence",
    nameLocal: "Väktare",
    nameEn: "Security Guard · Sweden",
    nameAr: null,
    requiresCredentialCodes: ["VU1", "VU2"],
    requiresAssertionLevel: "verified",
    requiresCurrentValidity: true,
    priority: 20,
  },

  // ── Local eligibility: an authority currently permits this ────────────
  {
    code: "SE_PERSONNEL_APPROVAL_CHECKED",
    marketPackCode: SE,
    professionFamilyCode: "SECURITY_GUARD",
    regulatedRoleCode: "SE_VAKTARE",
    outputKind: "local_eligibility",
    nameLocal: "Personalgodkännande kontrollerat",
    nameEn: "Personnel approval checked",
    nameAr: null,
    requiresCredentialCodes: ["SE_PERSONNEL_APPROVAL"],
    requiresAssertionLevel: "verified",
    requiresCurrentValidity: true,
    priority: 30,
  },
  {
    code: "SE_ORDNINGSVAKT_ELIGIBILITY",
    marketPackCode: SE,
    professionFamilyCode: "SECURITY_GUARD",
    regulatedRoleCode: "SE_ORDNINGSVAKT",
    outputKind: "local_eligibility",
    nameLocal: "Förordnande giltigt",
    nameEn: "Appointment valid",
    nameAr: null,
    requiresCredentialCodes: ["OV"],
    requiresAssertionLevel: "verified",
    requiresCurrentValidity: true,
    priority: 31,
  },
  {
    code: "SE_SKYDDSVAKT_ELIGIBILITY",
    marketPackCode: SE,
    professionFamilyCode: "SECURITY_GUARD",
    regulatedRoleCode: "SE_SKYDDSVAKT",
    outputKind: "local_eligibility",
    nameLocal: "Godkännande giltigt",
    nameEn: "Approval valid",
    nameAr: null,
    requiresCredentialCodes: ["SV"],
    requiresAssertionLevel: "verified",
    requiresCurrentValidity: true,
    priority: 32,
  },

  // ── Active titles: from the APPOINTMENT, never from the training ──────
  {
    code: "SE_ORDNINGSVAKT_TITLE",
    marketPackCode: SE,
    professionFamilyCode: "SECURITY_GUARD",
    regulatedRoleCode: "SE_ORDNINGSVAKT",
    outputKind: "active_title",
    nameLocal: "Ordningsvakt",
    nameEn: "Public Order Guard (Ordningsvakt) · Sweden",
    nameAr: null,
    requiresCredentialCodes: ["OV"],
    requiresAssertionLevel: "verified",
    requiresCurrentValidity: true,
    priority: 40,
  },
  {
    code: "SE_SKYDDSVAKT_TITLE",
    marketPackCode: SE,
    professionFamilyCode: "SECURITY_GUARD",
    regulatedRoleCode: "SE_SKYDDSVAKT",
    outputKind: "active_title",
    nameLocal: "Skyddsvakt",
    nameEn: "Protective Security Guard (Skyddsvakt) · Sweden",
    nameAr: null,
    requiresCredentialCodes: ["SV"],
    requiresAssertionLevel: "verified",
    requiresCurrentValidity: true,
    priority: 41,
  },
] as const;

/** Every rule the mirror knows. UK and Dubai arrive with their own packs, and
 *  until they do this is the complete set — which is why an empty derivation
 *  for a GB credential is correct rather than a gap. */
export const MIRRORED_TITLE_RULES: readonly TitleRule[] = SWEDEN_TITLE_RULES;
