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
    requiresScope: false,
    narrowResultOnly: false,
    // Every fixture row is Swedish, and now says so explicitly. The live
    // catalogue is partitioned by market pack, so a fixture without a
    // jurisdiction would be the one credential in the harness that belongs
    // nowhere.
    jurisdictionCode: "SE",
    subJurisdictionCode: null,
    referenceLabelEn: null,
    referenceLabelLocal: null,
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
    requiresScope: false,
    narrowResultOnly: false,
    // Every fixture row is Swedish, and now says so explicitly. The live
    // catalogue is partitioned by market pack, so a fixture without a
    // jurisdiction would be the one credential in the harness that belongs
    // nowhere.
    jurisdictionCode: "SE",
    subJurisdictionCode: null,
    referenceLabelEn: null,
    referenceLabelLocal: null,
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
    requiresScope: false,
    narrowResultOnly: false,
    // Every fixture row is Swedish, and now says so explicitly. The live
    // catalogue is partitioned by market pack, so a fixture without a
    // jurisdiction would be the one credential in the harness that belongs
    // nowhere.
    jurisdictionCode: "SE",
    subJurisdictionCode: null,
    referenceLabelEn: null,
    referenceLabelLocal: null,
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
    // The one scoped credential in the Swedish set. A skyddsvakt approval is
    // limited to an employer, principal or protected object, and shown without
    // one it reads as a general national licence — so the form asks, and the
    // database refuses a new one that does not say.
    requiresScope: true,
    narrowResultOnly: false,
    // Every fixture row is Swedish, and now says so explicitly. The live
    // catalogue is partitioned by market pack, so a fixture without a
    // jurisdiction would be the one credential in the harness that belongs
    // nowhere.
    jurisdictionCode: "SE",
    subJurisdictionCode: null,
    referenceLabelEn: null,
    referenceLabelLocal: null,
  },

  // ── Added by the Swedish truth model (20260907091000) ─────────────────
  // The course is not the appointment. Somebody who has done ordningsvakt
  // training and has no förordnande previously had to choose between
  // recording nothing and recording an appointment they do not hold.
  {
    code: "OV_TRAINING",
    category: "qualification",
    claimType: "training",
    nameSv: "Ordningsvaktsutbildning (grundutbildning)",
    nameEn: "Public Order Guard Training",
    symbolLabel: "OVU",
    requiresValidUntil: false,
    requiresIssuer: false,
    requiresScope: false,
    narrowResultOnly: false,
    // Every fixture row is Swedish, and now says so explicitly. The live
    // catalogue is partitioned by market pack, so a fixture without a
    // jurisdiction would be the one credential in the harness that belongs
    // nowhere.
    jurisdictionCode: "SE",
    subJurisdictionCode: null,
    referenceLabelEn: null,
    referenceLabelLocal: null,
  },
  {
    code: "OV_REFRESHER",
    category: "qualification",
    claimType: "training",
    nameSv: "Fortbildning för ordningsvakter",
    nameEn: "Public Order Guard Refresher Training",
    symbolLabel: "OVF",
    requiresValidUntil: false,
    requiresIssuer: false,
    requiresScope: false,
    narrowResultOnly: false,
    // Every fixture row is Swedish, and now says so explicitly. The live
    // catalogue is partitioned by market pack, so a fixture without a
    // jurisdiction would be the one credential in the harness that belongs
    // nowhere.
    jurisdictionCode: "SE",
    subJurisdictionCode: null,
    referenceLabelEn: null,
    referenceLabelLocal: null,
  },
  {
    code: "OV_TRANSPORT",
    category: "qualification",
    claimType: "training",
    nameSv: "Ordningsvakt — särskild utbildning för transport",
    nameEn: "Public Order Guard — Special Transport Training",
    symbolLabel: "OVT",
    requiresValidUntil: false,
    requiresIssuer: false,
    requiresScope: false,
    narrowResultOnly: false,
    // Every fixture row is Swedish, and now says so explicitly. The live
    // catalogue is partitioned by market pack, so a fixture without a
    // jurisdiction would be the one credential in the harness that belongs
    // nowhere.
    jurisdictionCode: "SE",
    subJurisdictionCode: null,
    referenceLabelEn: null,
    referenceLabelLocal: null,
  },
  // The narrow result. Nothing about the police register behind it may enter
  // the Passport, so the form hides the note and title fields and the database
  // refuses both for every caller.
  {
    code: "SE_PERSONNEL_APPROVAL",
    category: "appointment",
    claimType: "licence",
    nameSv: "Personalgodkännande (bevakningsföretag)",
    nameEn: "Personnel approval (authorised guarding company)",
    symbolLabel: "PG",
    requiresValidUntil: false,
    requiresIssuer: true,
    requiresScope: false,
    narrowResultOnly: true,
    // Every fixture row is Swedish, and now says so explicitly. The live
    // catalogue is partitioned by market pack, so a fixture without a
    // jurisdiction would be the one credential in the harness that belongs
    // nowhere.
    jurisdictionCode: "SE",
    subJurisdictionCode: null,
    referenceLabelEn: null,
    referenceLabelLocal: null,
  },
] as const;
