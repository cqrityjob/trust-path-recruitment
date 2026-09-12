// Fixture mirrors of the three pilot-market catalogues in sp_credential_types.
//
// ── WHY A SECOND FIXTURE FILE ──────────────────────────────────────────
//
// `credential-types.ts` mirrors the Swedish rows, and the credential-form
// guard checks that mirror against the Swedish migrations — every Swedish
// code must be in it and nothing else. The British and Dubai catalogues are
// mirrored HERE so that guard keeps its meaning, and so the dev harness and
// the market-catalogue guard can render the real thirteen, one and thirty
// choices offline, in database sort order, without a Supabase session.
//
// Values match, row for row:
//   20260907092000_sp_uk_market_pack.sql            (GB: 7 licences, 6 qualifications)
//   20260914090000_sp_uk_vehicle_immobilisation.sql (GB-NI: 1 licence)
//   20260907093000_sp_uae_dubai_market_pack.sql     (AE-DU: 3 cards, 6 courses)
//   20260914091000_sp_uae_dubai_cadre_catalogue.sql (AE-DU: 12 cards, 9 courses)
//
// scripts/passport-market-catalogue-check.tsx re-parses those migrations and
// fails if a code, a category or a sort order here disagrees with them. This
// file therefore cannot quietly become a fourth catalogue of its own.
//
// ── NOTHING HERE IS OPEN ───────────────────────────────────────────────
//
// These packs are `is_active = false`, `legal_review_state = 'pending'` and
// reachable only through an internal-pilot entitlement. Rendering them from
// a fixture demonstrates the UI; it opens nothing. `name_sv` equals
// `name_en` for every row below because the migrations author them that
// way: no Swedish translation of a British or Dubai regulator's own
// vocabulary has been reviewed, and inventing one here would be inventing
// regulatory content.

import type { CredentialType } from "../credentials";

interface Row {
  readonly code: string;
  readonly name: string;
  readonly symbol: string;
  readonly sortOrder: number;
}

function licence(
  jurisdictionCode: string,
  subJurisdictionCode: string | null,
  requiresScope: boolean,
  rows: readonly Row[],
): readonly (CredentialType & { readonly sortOrder: number })[] {
  return rows.map((r) => ({
    code: r.code,
    category: "appointment",
    claimType: "licence",
    nameSv: r.name,
    nameEn: r.name,
    symbolLabel: r.symbol,
    requiresValidUntil: true,
    requiresIssuer: true,
    requiresScope,
    narrowResultOnly: false,
    titleIsHolderWritten: false,
    jurisdictionCode,
    subJurisdictionCode,
    sortOrder: r.sortOrder,
  }));
}

function training(
  jurisdictionCode: string,
  subJurisdictionCode: string | null,
  rows: readonly Row[],
): readonly (CredentialType & { readonly sortOrder: number })[] {
  return rows.map((r) => ({
    code: r.code,
    category: "qualification",
    claimType: "training",
    nameSv: r.name,
    nameEn: r.name,
    symbolLabel: r.symbol,
    requiresValidUntil: false,
    requiresIssuer: true,
    requiresScope: false,
    narrowResultOnly: false,
    titleIsHolderWritten: false,
    jurisdictionCode,
    subJurisdictionCode,
    sortOrder: r.sortOrder,
  }));
}

/* ------------------------------------------------------------------ */
/* Great Britain — SIA                                                 */
/* ------------------------------------------------------------------ */

const GB_LICENCES: readonly Row[] = [
  {
    code: "UK_SIA_LICENCE_SG",
    name: "SIA Licence — Security Guarding",
    symbol: "SG",
    sortOrder: 110,
  },
  {
    code: "UK_SIA_LICENCE_DS",
    name: "SIA Licence — Door Supervision",
    symbol: "DS",
    sortOrder: 120,
  },
  {
    code: "UK_SIA_LICENCE_CCTV",
    name: "SIA Licence — Public Space Surveillance (CCTV)",
    symbol: "CCTV",
    sortOrder: 130,
  },
  {
    code: "UK_SIA_LICENCE_CP",
    name: "SIA Licence — Close Protection",
    symbol: "CP",
    sortOrder: 140,
  },
  {
    code: "UK_SIA_LICENCE_CVIT",
    name: "SIA Licence — Cash and Valuables in Transit",
    symbol: "CVIT",
    sortOrder: 150,
  },
  { code: "UK_SIA_LICENCE_KH", name: "SIA Licence — Key Holding", symbol: "KH", sortOrder: 160 },
  {
    code: "UK_SIA_LICENCE_NFL",
    name: "SIA Licence — Non-Front-Line",
    symbol: "NFL",
    sortOrder: 170,
  },
];

const GB_QUALIFICATIONS: readonly Row[] = [
  {
    code: "UK_SIA_QUAL_SG",
    name: "Licence-linked qualification — Security Guarding",
    symbol: "QSG",
    sortOrder: 210,
  },
  {
    code: "UK_SIA_QUAL_DS",
    name: "Licence-linked qualification — Door Supervision",
    symbol: "QDS",
    sortOrder: 220,
  },
  {
    code: "UK_SIA_QUAL_CCTV",
    name: "Licence-linked qualification — Public Space Surveillance",
    symbol: "QCTV",
    sortOrder: 230,
  },
  {
    code: "UK_SIA_QUAL_CP",
    name: "Licence-linked qualification — Close Protection",
    symbol: "QCP",
    sortOrder: 240,
  },
  {
    code: "UK_SIA_QUAL_CVIT",
    name: "Licence-linked qualification — Cash and Valuables in Transit",
    symbol: "QCVT",
    sortOrder: 250,
  },
  {
    code: "UK_SIA_TOP_UP",
    name: "SIA top-up / refresher training",
    symbol: "TOPU",
    sortOrder: 260,
  },
];

/* ------------------------------------------------------------------ */
/* Northern Ireland — the one licence Great Britain does not have       */
/* ------------------------------------------------------------------ */

const GB_NI_LICENCES: readonly Row[] = [
  {
    code: "UK_SIA_LICENCE_VI",
    name: "SIA Licence — Vehicle Immobilisation (Northern Ireland)",
    symbol: "VI",
    sortOrder: 180,
  },
];

/* ------------------------------------------------------------------ */
/* Dubai — SIRA                                                        */
/* ------------------------------------------------------------------ */

const AE_DU_CARDS: readonly Row[] = [
  {
    code: "AE_DU_SIRA_CARD_GUARD",
    name: "SIRA Security Cadre Card — Security Guard",
    symbol: "SCG",
    sortOrder: 410,
  },
  {
    code: "AE_DU_SIRA_CARD_MONEY_TRANSPORT",
    name: "SIRA Security Cadre Card — Money Transport Guard",
    symbol: "SCMT",
    sortOrder: 411,
  },
  {
    code: "AE_DU_SIRA_CARD_EVENT_GUARD",
    name: "SIRA Security Cadre Card — Event Security Guard",
    symbol: "SCEV",
    sortOrder: 412,
  },
  {
    code: "AE_DU_SIRA_CARD_BODYGUARD",
    name: "SIRA Security Cadre Card — Bodyguard",
    symbol: "SCBG",
    sortOrder: 413,
  },
  {
    code: "AE_DU_SIRA_CARD_WATCHMAN",
    name: "SIRA Security Cadre Card — Watchman",
    symbol: "SCWM",
    sortOrder: 414,
  },
  {
    code: "AE_DU_SIRA_CARD_SUPERVISOR",
    name: "SIRA Security Cadre Card — Security Supervisor",
    symbol: "SCS",
    sortOrder: 420,
  },
  {
    code: "AE_DU_SIRA_CARD_OPS_MANAGER",
    name: "SIRA Security Cadre Card — Security Operations Manager",
    symbol: "SCM",
    sortOrder: 430,
  },
  {
    code: "AE_DU_SIRA_CARD_SECURITY_MANAGER",
    name: "SIRA Security Cadre Card — Security Manager",
    symbol: "SCSM",
    sortOrder: 431,
  },
  {
    code: "AE_DU_SIRA_CARD_HEAD_OF_SECURITY",
    name: "SIRA Security Cadre Card — Head of Security Department",
    symbol: "SCHD",
    sortOrder: 432,
  },
  {
    code: "AE_DU_SIRA_CARD_SYSTEMS_OPERATOR",
    name: "SIRA Security Cadre Card — Security Systems Operator",
    symbol: "SCSO",
    sortOrder: 440,
  },
  {
    code: "AE_DU_SIRA_CARD_SYSTEMS_TECHNICIAN",
    name: "SIRA Security Cadre Card — Security Systems Technician",
    symbol: "SCST",
    sortOrder: 441,
  },
  {
    code: "AE_DU_SIRA_CARD_SYSTEMS_ENGINEER",
    name: "SIRA Security Cadre Card — Security Systems Engineer",
    symbol: "SCSE",
    sortOrder: 442,
  },
  {
    code: "AE_DU_SIRA_CARD_TRAINER",
    name: "SIRA Security Cadre Card — Security Trainer",
    symbol: "SCTR",
    sortOrder: 450,
  },
  {
    code: "AE_DU_SIRA_CARD_EXPERT",
    name: "SIRA Security Cadre Card — Security Expert",
    symbol: "SCEX",
    sortOrder: 451,
  },
  {
    code: "AE_DU_SIRA_CARD_CONSULTANT",
    name: "SIRA Security Cadre Card — Security Consultant",
    symbol: "SCCO",
    sortOrder: 452,
  },
];

const AE_DU_COURSES: readonly Row[] = [
  {
    code: "AE_DU_SIRA_GUARD_COURSE",
    name: "SIRA Security Guard course",
    symbol: "SGC",
    sortOrder: 510,
  },
  {
    code: "AE_DU_SUPERVISOR_COURSE",
    name: "SIRA Security Supervisor course",
    symbol: "SVC",
    sortOrder: 511,
  },
  {
    code: "AE_DU_OPS_MANAGER_COURSE",
    name: "SIRA Security Operations Manager course",
    symbol: "OMC",
    sortOrder: 512,
  },
  {
    code: "AE_DU_SECURITY_MANAGER_COURSE",
    name: "SIRA Security Manager course",
    symbol: "SMC",
    sortOrder: 513,
  },
  {
    code: "AE_DU_SYSTEMS_OPERATOR_COURSE",
    name: "SIRA Security Systems Operator course",
    symbol: "SOC",
    sortOrder: 514,
  },
  {
    code: "AE_DU_SYSTEMS_TECHNICIAN_COURSE",
    name: "SIRA Security Systems Technician course",
    symbol: "STC",
    sortOrder: 515,
  },
  {
    code: "AE_DU_SYSTEMS_ENGINEER_COURSE",
    name: "SIRA Security Systems Engineer course",
    symbol: "SEC",
    sortOrder: 516,
  },
  {
    code: "AE_DU_TRAINER_COURSE",
    name: "SIRA Security Trainer course",
    symbol: "STR",
    sortOrder: 517,
  },
  {
    code: "AE_DU_EVENTS_COURSE",
    name: "SIRA Security Events course",
    symbol: "SEV",
    sortOrder: 518,
  },
  {
    code: "AE_DU_CASH_TRANSPORT_COURSE",
    name: "SIRA Cash Transport Guard course",
    symbol: "CTC",
    sortOrder: 519,
  },
  {
    code: "AE_DU_BASIC_FIRE_SAFETY",
    name: "Basic Fire Safety training",
    symbol: "BFS",
    sortOrder: 520,
  },
  {
    code: "AE_DU_BASIC_LIFE_SUPPORT",
    name: "Basic Life Support training",
    symbol: "BLS",
    sortOrder: 530,
  },
  {
    code: "AE_DU_PEOPLE_OF_DETERMINATION",
    name: "People of Determination training",
    symbol: "POD",
    sortOrder: 540,
  },
  {
    code: "AE_DU_SPECIALIST_COURSE",
    name: "SIRA specialist security course",
    symbol: "SPC",
    sortOrder: 550,
  },
];

/** The fitness requirement. A checked result and NOTHING else: no note may
 *  be attached, the title is the controlled label, and no health or medical
 *  detail exists anywhere in the row — the same narrow shape as the Swedish
 *  personnel approval, for the same reason. */
const AE_DU_FITNESS: CredentialType & { readonly sortOrder: number } = {
  code: "AE_DU_FITNESS_CHECKED",
  category: "qualification",
  claimType: "certification",
  nameSv: "Fitness requirement checked",
  nameEn: "Fitness requirement checked",
  symbolLabel: "FIT",
  requiresValidUntil: false,
  requiresIssuer: true,
  requiresScope: false,
  narrowResultOnly: true,
  titleIsHolderWritten: false,
  jurisdictionCode: "AE",
  subJurisdictionCode: "AE-DU",
  sortOrder: 560,
};

const bySortOrder = (
  a: { readonly sortOrder: number },
  b: { readonly sortOrder: number },
): number => a.sortOrder - b.sortOrder;

/** Every row a market's catalogue holds, in `sort_order` — exactly what
 *  `getRegulatedCredentialAvailability` returns for an entitled member. */
export type FixtureCatalogueRow = CredentialType & { readonly sortOrder: number };

export const FIXTURE_GB_CATALOGUE: readonly FixtureCatalogueRow[] = [
  ...licence("GB", null, false, GB_LICENCES),
  ...training("GB", null, GB_QUALIFICATIONS),
].sort(bySortOrder);

export const FIXTURE_GB_NI_CATALOGUE: readonly FixtureCatalogueRow[] = licence(
  "GB",
  "GB-NI",
  false,
  GB_NI_LICENCES,
);

export const FIXTURE_AE_DU_CATALOGUE: readonly FixtureCatalogueRow[] = [
  // SIRA links a cadre card to the licensed company the holder works for,
  // so every card requires a scope — shown without one it would read as a
  // portable personal licence, which is not what SIRA issued.
  ...licence("AE", "AE-DU", true, AE_DU_CARDS),
  ...training("AE", "AE-DU", AE_DU_COURSES),
  AE_DU_FITNESS,
].sort(bySortOrder);

/** The three pilot catalogues, keyed by market pack code. */
export const FIXTURE_PILOT_CATALOGUES: Readonly<Record<string, readonly FixtureCatalogueRow[]>> = {
  GB: FIXTURE_GB_CATALOGUE,
  "GB-NI": FIXTURE_GB_NI_CATALOGUE,
  "AE-DU": FIXTURE_AE_DU_CATALOGUE,
};
