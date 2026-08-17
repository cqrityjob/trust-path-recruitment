// Fixture mirror of the sp_credential_types seed rows.
//
// The live form reads the taxonomy from the database so a fifth credential
// needs no deploy; the dev harness cannot, so it uses this mirror. Values
// match supabase/migrations/20260817160000_sp_phase6_credential_taxonomy.sql
// exactly — if they drift, the harness is reviewing a form the product
// does not ship.

import type { CredentialType } from "../credentials";

export const FIXTURE_CREDENTIAL_TYPES: readonly CredentialType[] = [
  {
    code: "VU1",
    category: "qualification",
    claimType: "training",
    nameSv: "Väktarutbildning 1 (VU1)",
    nameEn: "Security Guard Training 1 (VU1)",
    symbolLabel: "VU1",
    requiresValidUntil: false,
    requiresIssuer: false,
  },
  {
    code: "VU2",
    category: "qualification",
    claimType: "training",
    nameSv: "Väktarutbildning 2 (VU2)",
    nameEn: "Security Guard Training 2 (VU2)",
    symbolLabel: "VU2",
    requiresValidUntil: false,
    requiresIssuer: false,
  },
  {
    code: "OV",
    category: "appointment",
    claimType: "licence",
    nameSv: "Ordningsvaktsförordnande",
    nameEn: "Public Order Guard Appointment",
    symbolLabel: "OV",
    requiresValidUntil: true,
    requiresIssuer: true,
  },
  {
    code: "SV",
    category: "appointment",
    claimType: "licence",
    nameSv: "Skyddsvaktsförordnande",
    nameEn: "Protective Security Guard Appointment",
    symbolLabel: "SV",
    requiresValidUntil: true,
    requiresIssuer: true,
  },
] as const;
