/**
 * The importer for the 2026-10-03 certification research snapshot.
 *
 * A pure module: it reads the checked-in research package, applies the
 * reviewed decisions in ./passport-catalogue-research-data.ts, and returns
 * (a) one explicit disposition per research record and (b) the generated
 * artefacts that carry those dispositions into the existing catalogue:
 *
 *   supabase/migrations/20270207090000_sp_catalogue_research_import.sql
 *   docs/passport/research/2026-10-03-certification-catalogue/staged/20270208090000_sp_catalogue_research_publish.sql  (STAGED; released third)
 *   src/lib/security-passport/catalogue-research-marks.ts
 *   docs/passport/research/2026-10-03-certification-catalogue/reconciliation.json
 *   docs/passport/research/2026-10-03-certification-catalogue/RECONCILIATION.md
 *
 * scripts/passport-catalogue-research-build.ts writes them (or, with --check,
 * proves the committed copies are exactly what this module produces), and
 * scripts/passport-catalogue-research-check.ts asserts every invariant below.
 *
 * It never connects to a database and holds no credentials.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ACRONYM_IS_NOT_AN_ABBREVIATION,
  CLASS_BY_KIND,
  CODE_SLUG_NO_ACRONYM,
  CONTRIBUTES_BY_KIND,
  DEFINITION_ALIASES,
  EXCLUDED,
  EXISTING_DEFINITIONS,
  ISSUERS,
  REFERENCE_LABEL_BY_KIND,
  RETAINED,
  REVIEWED_AT,
  REVIEWER,
  SNAPSHOT_DATE,
  professionalDomainFor,
  type HolderReason,
  type IssuerPlan,
  type ProfessionalDomain,
  type ResearchKind,
} from "./passport-catalogue-research-data.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const RESEARCH_DIR = "docs/passport/research/2026-10-03-certification-catalogue";
export const IMPORT_MIGRATION =
  "supabase/migrations/20270207090000_sp_catalogue_research_import.sql";
/**
 * The publication is STAGED here, outside supabase/migrations/, until the application
 * that renders the new kinds has been published. It is generated, reviewed and verified
 * by the guard like every other artefact, but nothing applies it: moving it into
 * supabase/migrations/ (and its rollback into supabase/rollback/) is the third release.
 */
export const PUBLISH_MIGRATION = `${RESEARCH_DIR}/staged/20270208090000_sp_catalogue_research_publish.sql`;
export const IMPORT_ROLLBACK =
  "supabase/rollback/20270207090000_sp_catalogue_research_import_rollback.sql";
export const PUBLISH_ROLLBACK = `${RESEARCH_DIR}/staged/20270208090000_sp_catalogue_research_publish_rollback.sql`;
export const MARKS_FILE = "src/lib/security-passport/catalogue-research-marks.ts";
export const RECONCILIATION_JSON = `${RESEARCH_DIR}/reconciliation.json`;
export const RECONCILIATION_MD = `${RESEARCH_DIR}/RECONCILIATION.md`;

/* ------------------------------------------------------------------ */
/* The research package                                                 */
/* ------------------------------------------------------------------ */

export type ResearchRecord = {
  credential_id: string;
  issuer_id: string;
  issuer: string;
  acronym: string | null;
  official_name: string;
  research_area: "cyber" | "insurance" | "physical" | "resilience" | "risk";
  domain: string;
  credential_kind: ResearchKind;
  research_scope: "international" | "regional" | "national";
  jurisdiction_context: string | null;
  recommended_priority: "P1" | "P2" | "P3";
  source_id: string;
  source_url: string;
  source_title: string | null;
  evidence_level: "official_page" | "issuer_badge_page" | "official_search_excerpt";
  evidence_note: string | null;
  renewal_note: string | null;
  limitations: string | null;
  research_status: "catalogue_review_required" | "source_recheck_required";
  catalogue_decision: string;
  holder_verification_policy: string;
  legal_recognition_status: string;
  passport_scope_code: string | null;
  existing_definition_id: string | null;
  researched_at: string;
};

type Package = {
  schema_version: string;
  researched_at: string;
  issuers: { issuer_id: string; official_name: string }[];
  sources: { source_id: string; url: string; title: string | null; checked_at: string }[];
  credentials: ResearchRecord[];
  evidence: {
    credential_id: string;
    source_id: string;
    evidence_level: string;
    supported_fields: string | null;
    note: string | null;
  }[];
};

export function loadPackage(): Package {
  return JSON.parse(
    readFileSync(path.join(root, RESEARCH_DIR, "catalogue.json"), "utf8"),
  ) as Package;
}

/** The first six hex digits after `cred_`: the short id used in the decision tables. */
export const shortId = (r: { credential_id: string }) => r.credential_id.slice(5, 11);

/* ------------------------------------------------------------------ */
/* Matching: issuer + exact award, never an acronym alone               */
/* ------------------------------------------------------------------ */

/** Lower-case, ASCII-folded, punctuation-free, with a trailing "(ABBR)" removed. */
export function normaliseAward(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*$/, "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9+]+/g, " ")
    .trim();
}

export type MatchResult =
  { kind: "matched"; code: string; basis: string } | { kind: "none"; nearMisses: string[] };

/**
 * A research record matches an existing definition only when ALL hold:
 *   1. its issuer resolves to the existing definition's issuer,
 *   2. its award name equals the definition's, after normalisation, and
 *   3. the two abbreviations do not DISAGREE.
 * Condition 3 exists because normalisation removes a trailing "(ABBR)": without
 * it "OffSec Certified Professional (OSCP+)" and "OffSec Certified Professional"
 * would be one award, when OSCP and OSCP+ are two. An acronym on its own is never
 * enough: records that share only an acronym with an existing definition, or only
 * a name, are reported as near misses, so the reconciliation shows that the
 * collision was seen and refused.
 */
export function matchExisting(r: ResearchRecord): MatchResult {
  const issuer = ISSUERS[r.issuer];
  if (!issuer) throw new Error(`research issuer has no plan: ${r.issuer}`);
  const wanted = normaliseAward(r.official_name);
  const nearMisses: string[] = [];
  for (const d of EXISTING_DEFINITIONS) {
    const sameIssuer = d.issuerCode === issuer.code;
    const sameName = normaliseAward(d.nameEn) === wanted;
    const sameAcronym = !!r.acronym && r.acronym.toLowerCase() === d.abbreviation.toLowerCase();
    const acronymsDisagree = !!r.acronym && !sameAcronym;
    if (sameIssuer && sameName && !acronymsDisagree) {
      return {
        kind: "matched",
        code: d.code,
        basis: `issuer ${issuer.code} and exact award name "${normaliseAward(d.nameEn)}"`,
      };
    }
    if (sameIssuer && sameName && acronymsDisagree) {
      nearMisses.push(
        `${d.code} (same issuer and name, but the abbreviation ${r.acronym} differs from ${d.abbreviation}: a different award)`,
      );
    } else if (sameAcronym && !(sameIssuer && sameName)) {
      nearMisses.push(`${d.code} (shares the acronym ${r.acronym}, but not issuer and award)`);
    }
  }
  return { kind: "none", nearMisses };
}

/* ------------------------------------------------------------------ */
/* Definition planning                                                  */
/* ------------------------------------------------------------------ */

export type DefinitionPlan = {
  code: string;
  issuerCode: string;
  nameEn: string;
  abbreviation: string | null;
  symbolLabel: string;
  credentialClass: string;
  kind: ResearchKind;
  professionalDomain: ProfessionalDomain;
  contributesTo: readonly string[];
  referenceLabel: string;
  programmeUrl: string;
  sourceTitle: string;
  sortOrder: number;
  aliases: { alias: string; kind: "historical_name" | "search_alias" }[];
  maintenanceSummary: string;
  needsMetadataRow: boolean;
};

function slugFromAcronym(ac: string): string {
  return ac
    .toUpperCase()
    .replace(/\+/g, "_PLUS")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function definitionName(r: ResearchRecord): string {
  const ac = r.acronym;
  const base = r.official_name;
  if (!ac || ACRONYM_IS_NOT_AN_ABBREVIATION.has(shortId(r))) return base;
  if (/[()]/.test(ac)) return base; // e.g. Cert(AML): the abbreviation field carries it, the title does not
  if (base.toLowerCase().includes(ac.toLowerCase())) return base;
  return `${base} (${ac})`;
}

export function symbolLabelFor(r: ResearchRecord, issuer: IssuerPlan): string {
  const ac = r.acronym;
  if (
    ac &&
    !ACRONYM_IS_NOT_AN_ABBREVIATION.has(shortId(r)) &&
    ac.length <= 8 &&
    /^[A-Za-z0-9+\-/ ]+$/.test(ac)
  ) {
    return ac;
  }
  // The award publishes no abbreviation that fits the plate: the ISSUER's own
  // acronym is the legend. Initials composed from a title are never invented.
  return issuer.mark;
}

export function maintenanceSummaryFor(r: ResearchRecord): string {
  const note = (r.renewal_note ?? "unknown").replace(/\s+/g, " ").trim();
  return (
    `Maintenance and renewal rules were not assessed when this definition was added (research snapshot ${SNAPSHOT_DATE}). ` +
    `Research note, narrative only: "${note}". ` +
    "Unknown renewal is not lifetime validity, a programme's cycle is not a holder's expiry date, and nothing here says that any holder is current."
  );
}

function planDefinition(r: ResearchRecord, sortOrder: number): DefinitionPlan {
  const issuer = ISSUERS[r.issuer];
  const id = shortId(r);
  const slug = CODE_SLUG_NO_ACRONYM[id] ?? (r.acronym ? slugFromAcronym(r.acronym) : null);
  if (!slug) throw new Error(`no code slug for ${r.credential_id} (${r.official_name})`);
  const code = `INTL_${issuer.code}_${slug}`;
  if (!/^[A-Z0-9_]{2,48}$/.test(code)) throw new Error(`invalid definition code ${code}`);
  const credentialClass = CLASS_BY_KIND[r.credential_kind];
  const abbreviation = r.acronym && !ACRONYM_IS_NOT_AN_ABBREVIATION.has(id) ? r.acronym : null;
  return {
    code,
    issuerCode: issuer.code,
    nameEn: definitionName(r),
    abbreviation,
    symbolLabel: symbolLabelFor(r, issuer),
    credentialClass,
    kind: r.credential_kind,
    professionalDomain: professionalDomainFor(r.research_area, r.domain),
    contributesTo: CONTRIBUTES_BY_KIND[r.credential_kind],
    referenceLabel: REFERENCE_LABEL_BY_KIND[r.credential_kind],
    programmeUrl: r.source_url,
    sourceTitle: r.source_title ?? r.official_name,
    sortOrder,
    aliases: [...(DEFINITION_ALIASES[id] ?? [])],
    maintenanceSummary: maintenanceSummaryFor(r),
    needsMetadataRow: credentialClass !== "certification",
  };
}

/* ------------------------------------------------------------------ */
/* Dispositions                                                         */
/* ------------------------------------------------------------------ */

export type Outcome = "matched_existing" | "added_approved" | "retained_for_review" | "excluded";
export type Decision = "approved" | "needs_information" | "excluded";

export type Disposition = {
  record: ResearchRecord;
  shortId: string;
  outcome: Outcome;
  decision: Decision;
  credentialCode: string | null;
  decisionNote: string;
  unresolvedIssue: string | null;
  requiredAction: string | null;
  holderReason: HolderReason | null;
  recheckNote: string | null;
  mappedClass: string | null;
  mappedDomain: ProfessionalDomain | null;
  definition: DefinitionPlan | null;
  nearMisses: string[];
};

const scopeNote = (r: ResearchRecord) =>
  `Research scope "${r.research_scope}"${r.jurisdiction_context ? ` / context "${r.jurisdiction_context}"` : ""} ` +
  "is kept verbatim as research metadata only: no jurisdiction, market pack or access rule is derived from it.";

export function reconcile(pkg: Package = loadPackage()): Disposition[] {
  const records = [...pkg.credentials].sort(
    (a, b) =>
      (ISSUERS[a.issuer]?.code ?? "").localeCompare(ISSUERS[b.issuer]?.code ?? "") ||
      a.official_name.localeCompare(b.official_name) ||
      a.credential_id.localeCompare(b.credential_id),
  );

  const out: Disposition[] = [];
  const seqByIssuer = new Map<string, number>();
  const issuerIndex = new Map<string, number>();
  const issuerCodes = [...new Set(records.map((r) => ISSUERS[r.issuer].code))].sort();
  issuerCodes.forEach((c, i) => issuerIndex.set(c, i));

  for (const r of records) {
    const id = shortId(r);
    const issuer = ISSUERS[r.issuer];
    if (!issuer) throw new Error(`research issuer has no plan: ${r.issuer}`);
    const match = matchExisting(r);
    const nearMisses = match.kind === "none" ? match.nearMisses : [];

    if (match.kind === "matched") {
      const recheck =
        r.research_status === "source_recheck_required"
          ? ` The research row's own source needs a recheck, but the existing definition rests on its own earlier reviewed sources (sp_certification_sources) and nothing about it changes here.`
          : "";
      out.push({
        record: r,
        shortId: id,
        outcome: "matched_existing",
        decision: "approved",
        credentialCode: match.code,
        decisionNote: `Matched to existing definition ${match.code} by ${match.basis}. The existing definition ID, issuer relationship and any claims are untouched; no duplicate is created.${recheck}`,
        unresolvedIssue: null,
        requiredAction: null,
        holderReason: null,
        recheckNote: null,
        mappedClass: null,
        mappedDomain: null,
        definition: null,
        nearMisses,
      });
      continue;
    }

    if (EXCLUDED[id]) {
      out.push({
        record: r,
        shortId: id,
        outcome: "excluded",
        decision: "excluded",
        credentialCode: null,
        decisionNote: EXCLUDED[id].reason,
        unresolvedIssue: null,
        requiredAction: null,
        holderReason: "not_offered",
        recheckNote: null,
        mappedClass: null,
        mappedDomain: null,
        definition: null,
        nearMisses,
      });
      continue;
    }

    if (RETAINED[id]) {
      const x = RETAINED[id];
      out.push({
        record: r,
        shortId: id,
        outcome: "retained_for_review",
        decision: "needs_information",
        credentialCode: null,
        decisionNote:
          `Retained for administrator review; not added to the catalogue. ${scopeNote(r)} ` +
          `Research status ${r.research_status}, evidence level ${r.evidence_level}, priority ${r.recommended_priority}.`,
        unresolvedIssue: x.unresolvedIssue,
        requiredAction: x.requiredAction,
        holderReason: x.holderReason,
        recheckNote: x.recheckNote ?? null,
        mappedClass: null,
        mappedDomain: null,
        definition: null,
        nearMisses,
      });
      continue;
    }

    // Default: sufficiently supported -> an approved definition, INACTIVE until published.
    if (r.research_status !== "catalogue_review_required") {
      throw new Error(`${r.credential_id} is ${r.research_status} but has no retained decision`);
    }
    const seq = (seqByIssuer.get(issuer.code) ?? 0) + 1;
    seqByIssuer.set(issuer.code, seq);
    const sortOrder = 20000 + (issuerIndex.get(issuer.code) ?? 0) * 1000 + seq * 10;
    const def = planDefinition(r, sortOrder);
    out.push({
      record: r,
      shortId: id,
      outcome: "added_approved",
      decision: "approved",
      credentialCode: def.code,
      decisionNote:
        `Added as definition ${def.code} under issuer ${issuer.code}, INACTIVE: publication is a separate reviewed migration. ` +
        `Basis: ${r.evidence_level} evidence (${r.source_title ?? r.source_url}). ` +
        `Kind ${r.credential_kind} -> class ${def.credentialClass}; subject ${def.professionalDomain}. ${scopeNote(r)} ` +
        "Renewal not assessed; no lifetime validity is implied. The definition verifies no holder.",
      unresolvedIssue: null,
      requiredAction: null,
      holderReason: null,
      recheckNote: null,
      mappedClass: def.credentialClass,
      mappedDomain: def.professionalDomain,
      definition: def,
      nearMisses,
    });
  }

  // Codes are identities: a collision would silently merge two awards.
  const codes = out.filter((d) => d.definition).map((d) => d.definition!.code);
  const dup = codes.filter((c, i) => codes.indexOf(c) !== i);
  if (dup.length) throw new Error(`duplicate definition codes: ${[...new Set(dup)].join(", ")}`);
  const existing = new Set(EXISTING_DEFINITIONS.map((d) => d.code));
  const clash = codes.filter((c) => existing.has(c));
  if (clash.length)
    throw new Error(`a new definition reuses an existing code: ${clash.join(", ")}`);
  return out;
}

/* ------------------------------------------------------------------ */
/* SQL emission                                                         */
/* ------------------------------------------------------------------ */

const q = (s: string | null | undefined): string =>
  s === null || s === undefined ? "NULL" : `'${s.replace(/'/g, "''")}'`;
const qa = (a: readonly string[]): string => `ARRAY[${a.map(q).join(", ")}]::text[]`;

export function emitImportSql(ds: Disposition[], pkg: Package = loadPackage()): string {
  const added = ds.filter((d) => d.outcome === "added_approved");
  const matched = ds.filter((d) => d.outcome === "matched_existing");
  const retained = ds.filter((d) => d.outcome === "retained_for_review");
  const excluded = ds.filter((d) => d.outcome === "excluded");
  const usedIssuers = new Map<string, IssuerPlan>();
  for (const d of added) {
    const plan = ISSUERS[d.record.issuer];
    if (!plan.existing) usedIssuers.set(plan.code, plan);
  }
  const issuers = [...usedIssuers.values()].sort((a, b) => a.code.localeCompare(b.code));
  const defs = added.map((d) => d.definition!);
  const evidenceById = new Map(pkg.evidence.map((e) => [e.credential_id, e]));
  const sourceById = new Map(pkg.sources.map((s) => [s.source_id, s]));
  const newClasses = new Set(defs.filter((d) => d.needsMetadataRow).map((d) => d.credentialClass));

  const lines: string[] = [];
  const w = (s = "") => lines.push(s);

  w(`-- Security Passport — the 2026-10-03 certification research import (DATA).`);
  w(`--`);
  w(`-- GENERATED by scripts/passport-catalogue-research-build.ts from`);
  w(`-- ${RESEARCH_DIR}/catalogue.json and the reviewed decisions in`);
  w(`-- scripts/lib/passport-catalogue-research-data.ts. Do not edit by hand:`);
  w(`-- scripts/passport-catalogue-research-check.ts fails when this file differs`);
  w(`-- from what the generator produces.`);
  w(`--`);
  w(`-- Depends on 20270206090000_sp_catalogue_research_foundation.sql.`);
  w(`--`);
  w(`-- ══ WHAT THIS MIGRATION DOES ═════════════════════════════════════════`);
  w(`--`);
  w(`--   * records all ${ds.length} research records, each with an explicit outcome`);
  w(`--       ${matched.length} matched to an existing definition (nothing changes)`);
  w(`--       ${added.length} added as approved definitions, INACTIVE (is_active = false)`);
  w(`--       ${retained.length} retained for review, each with its unresolved issue and action`);
  w(`--       ${excluded.length} excluded`);
  w(
    `--   * adds ${issuers.length} certification issuers and their aliases (the awarding organisation; never ISO`,
  );
  w(`--     itself, never a training provider);`);
  w(`--   * adds ${defs.length} definitions to the EXISTING tables (sp_credential_types,`);
  w(`--     sp_certification_definitions, sp_credential_definition_reviews,`);
  w(`--     sp_credential_definition_metadata, sp_certification_sources). There is no`);
  w(`--     second catalogue.`);
  w(`--`);
  w(`-- ══ WHAT IT DELIBERATELY DOES NOT DO ═════════════════════════════════`);
  w(`--`);
  w(`--   * It activates nothing. Every new definition is is_active = false, so no`);
  w(`--     holder can select one and the approved catalogue view is unchanged.`);
  w(`--     Publication is 20270208090000_sp_catalogue_research_publish.sql, which`);
  w(`--     is released only after the application that renders these kinds.`);
  w(`--   * It touches no existing definition, issuer, claim, market pack or grant.`);
  w(`--   * research_scope and jurisdiction_context stay verbatim research metadata.`);
  w(`--     No definition gets a jurisdiction, a market pack, a sub-jurisdiction, an`);
  w(`--     authority or a regulated role: scope_code is global_professional for all`);
  w(`--     of them, which the database already forbids from carrying any of those.`);
  w(`--   * legal_review_state is 'pending': no legal or expert review took place.`);
  w(`--   * allows_no_expiry stays false and every maintenance policy is`);
  w(`--     'not_assessed': unknown renewal is never lifetime validity.`);
  w(`--   * verification_mode is 'none' for every new issuer: the research does not`);
  w(`--     establish a public holder lookup, and nothing here verifies a holder.`);
  w(``);
  w(`BEGIN;`);
  w(``);

  /* issuers */
  w(`-- ---------------------------------------------------------------------------`);
  w(`-- 1. Issuers (awarding organisations)`);
  w(`-- ---------------------------------------------------------------------------`);
  w(`INSERT INTO public.sp_certification_issuers`);
  w(`  (issuer_code, display_name, legal_name, official_url, verification_mode,`);
  w(`   public_verification_url, absence_is_inconclusive, source_reviewed_on, effective_from)`);
  w(`VALUES`);
  w(
    issuers
      .map(
        (i) =>
          `  (${q(i.code)}, ${q(i.displayName)}, NULL, ${q(i.officialUrl)}, 'none', NULL, true, DATE '${SNAPSHOT_DATE}', DATE '${SNAPSHOT_DATE}')`,
      )
      .join(",\n"),
  );
  w(`ON CONFLICT (issuer_code) DO NOTHING;`);
  w(``);
  const issuerAliases = issuers.flatMap((i) => (i.aliases ?? []).map((a) => [i.code, a] as const));
  if (issuerAliases.length) {
    w(`INSERT INTO public.sp_certification_issuer_aliases (issuer_id, alias, alias_kind)`);
    w(`SELECT i.id, v.alias, 'search_alias'`);
    w(`FROM (VALUES`);
    w(issuerAliases.map(([c, a]) => `  (${q(c)}, ${q(a)})`).join(",\n"));
    w(`) AS v(issuer_code, alias)`);
    w(`JOIN public.sp_certification_issuers i ON i.issuer_code = v.issuer_code`);
    w(`ON CONFLICT (issuer_id, alias) DO NOTHING;`);
    w(``);
  }

  /* types */
  w(`-- ---------------------------------------------------------------------------`);
  w(`-- 2. Definitions: sp_credential_types (INACTIVE)`);
  w(`-- ---------------------------------------------------------------------------`);
  w(`-- claim_type 'certification' and category 'qualification' are what a`);
  w(`-- global_professional definition must carry (sp_credential_type_global_scope_unbound);`);
  w(`-- the KIND of award (certification, qualification, designation, assessed or`);
  w(`-- course certificate) lives in the credential class, in section 4.`);
  w(`-- name_sv equals name_en deliberately: these awards have one name, given by`);
  w(`-- their issuer, and a Swedish translation would name an award nobody issues.`);
  w(`INSERT INTO public.sp_credential_types`);
  w(`  (code, claim_type, category, name_sv, name_en, symbol_label,`);
  w(`   requires_valid_until, requires_issuer, is_active, sort_order,`);
  w(`   scope_code, legal_review_state, contributes_to, pilot_state,`);
  w(
    `   market_pack_code, jurisdiction_code, sub_jurisdiction_code, authority_id, regulated_role_id,`,
  );
  w(`   allows_no_expiry, requires_scope, reference_label_en, reference_label_local)`);
  w(`SELECT v.code, 'certification', 'qualification', v.name_en, v.name_en, v.symbol_label,`);
  w(`       false, false, false, v.sort_order,`);
  w(`       'global_professional', 'pending', v.contributes_to, 'closed',`);
  w(`       NULL, NULL, NULL, NULL, NULL,`);
  w(`       false, false, v.reference_label, v.reference_label`);
  w(`FROM (VALUES`);
  w(
    defs
      .map(
        (d) =>
          `  (${q(d.code)}, ${q(d.nameEn)}, ${q(d.symbolLabel)}, ${d.sortOrder}, ${qa(d.contributesTo)}, ${q(d.referenceLabel)})`,
      )
      .join(",\n"),
  );
  w(`) AS v(code, name_en, symbol_label, sort_order, contributes_to, reference_label)`);
  w(`ON CONFLICT (code) DO NOTHING;`);
  w(``);

  /* certification definitions */
  w(`-- ---------------------------------------------------------------------------`);
  w(`-- 3. The governed detail: sp_certification_definitions`);
  w(`-- ---------------------------------------------------------------------------`);
  w(`-- abbreviation is NULL where the issuer publishes none: the catalogue never`);
  w(`-- invents one. maintenance_policy_url repeats the programme page because it`);
  w(`-- is the only page the research read; the summary says plainly that renewal`);
  w(`-- was not assessed.`);
  w(`INSERT INTO public.sp_certification_definitions`);
  w(`  (credential_code, issuer_id, canonical_name_en, abbreviation, programme_url,`);
  w(`   maintenance_policy_url, maintenance_policy_type, maintenance_cycle_months,`);
  w(`   maintenance_summary_en, public_verification_url, source_reviewed_on, effective_from)`);
  w(`SELECT v.code, i.id, v.name_en, v.abbreviation, v.programme_url, v.programme_url,`);
  w(
    `       'not_assessed', NULL, v.summary, NULL, DATE '${SNAPSHOT_DATE}', DATE '${SNAPSHOT_DATE}'`,
  );
  w(`FROM (VALUES`);
  w(
    defs
      .map(
        (d) =>
          `  (${q(d.code)}, ${q(d.issuerCode)}, ${q(d.nameEn)}, ${q(d.abbreviation)}, ${q(d.programmeUrl)}, ${q(d.maintenanceSummary)})`,
      )
      .join(",\n"),
  );
  w(`) AS v(code, issuer_code, name_en, abbreviation, programme_url, summary)`);
  w(`JOIN public.sp_certification_issuers i ON i.issuer_code = v.issuer_code`);
  w(`ON CONFLICT (credential_code) DO NOTHING;`);
  w(``);

  /* metadata */
  w(`-- ---------------------------------------------------------------------------`);
  w(`-- 4. The kind of award: sp_credential_definition_metadata`);
  w(`-- ---------------------------------------------------------------------------`);
  w(`-- A personal certification keeps the default class (certification). Every`);
  w(`-- other kind is stated here, so a qualification, a designation, an assessed`);
  w(`-- subject certificate and a course certificate stay distinguishable.`);
  w(`INSERT INTO public.sp_credential_definition_metadata`);
  w(`  (credential_code, credential_class, original_name, original_language)`);
  w(`VALUES`);
  const metaRows = added.filter((d) => d.definition!.needsMetadataRow);
  w(
    metaRows
      .map(
        (d) =>
          `  (${q(d.definition!.code)}, ${q(d.definition!.credentialClass)}, ${q(d.record.official_name)}, 'en')`,
      )
      .join(",\n"),
  );
  w(`ON CONFLICT (credential_code) DO NOTHING;`);
  w(``);

  /* reviews */
  w(`-- ---------------------------------------------------------------------------`);
  w(`-- 5. The reviewed subject and source: sp_credential_definition_reviews`);
  w(`-- ---------------------------------------------------------------------------`);
  w(`INSERT INTO public.sp_credential_definition_reviews`);
  w(`  (credential_code, professional_domain, source_url, checked_on, validity_sv, validity_en)`);
  w(`VALUES`);
  w(
    defs
      .map(
        (d) =>
          `  (${q(d.code)}, ${q(d.professionalDomain)}, ${q(d.programmeUrl)}, DATE '${SNAPSHOT_DATE}', ` +
          `'Giltighet och förnyelse har inte bedömts. Okänd förnyelse betyder inte livslång giltighet.', ` +
          `'Validity and renewal were not assessed. Unknown renewal does not mean lifetime validity.')`,
      )
      .join(",\n"),
  );
  w(`ON CONFLICT (credential_code) DO NOTHING;`);
  w(``);

  /* aliases */
  const aliasRows = defs.flatMap((d) => d.aliases.map((a) => [d.code, a] as const));
  if (aliasRows.length) {
    w(`-- ---------------------------------------------------------------------------`);
    w(`-- 6. Definition aliases (search and reconciliation only; never a display name)`);
    w(`-- ---------------------------------------------------------------------------`);
    w(
      `INSERT INTO public.sp_certification_definition_aliases (credential_code, alias, alias_kind)`,
    );
    w(`VALUES`);
    w(aliasRows.map(([c, a]) => `  (${q(c)}, ${q(a.alias)}, ${q(a.kind)})`).join(",\n"));
    w(`ON CONFLICT (credential_code, alias) DO NOTHING;`);
    w(``);
  }

  /* sources */
  w(`-- ---------------------------------------------------------------------------`);
  w(`-- 7. Provenance: sp_certification_sources (the page the research read)`);
  w(`-- ---------------------------------------------------------------------------`);
  w(`INSERT INTO public.sp_certification_sources`);
  w(
    `  (issuer_id, credential_code, source_kind, title, url, reviewed_on, reviewed_by, review_note)`,
  );
  w(
    `SELECT i.id, v.code, 'programme', v.title, v.url, DATE '${SNAPSHOT_DATE}', ${q(REVIEWER)}, v.note`,
  );
  w(`FROM (VALUES`);
  w(
    added
      .map((d) => {
        const ev = evidenceById.get(d.record.credential_id);
        const note =
          `Research evidence level ${d.record.evidence_level}; supports ${ev?.supported_fields ?? "programme_existence"} only. ${ev?.note ?? ""}`.trim();
        return `  (${q(d.definition!.code)}, ${q(d.definition!.issuerCode)}, ${q(d.definition!.sourceTitle)}, ${q(d.record.source_url)}, ${q(note)})`;
      })
      .join(",\n"),
  );
  w(`) AS v(code, issuer_code, title, url, note)`);
  w(`JOIN public.sp_certification_issuers i ON i.issuer_code = v.issuer_code`);
  w(`ON CONFLICT DO NOTHING;`);
  w(``);

  /* research records */
  w(`-- ---------------------------------------------------------------------------`);
  w(`-- 8. The research records, every one with an explicit disposition`);
  w(`-- ---------------------------------------------------------------------------`);
  w(`INSERT INTO public.sp_catalogue_research_records`);
  w(`  (research_id, snapshot_date, issuer_research_id, issuer_name, acronym, official_name,`);
  w(`   research_area, research_domain, credential_kind, research_scope, jurisdiction_context,`);
  w(`   recommended_priority, source_id, source_url, source_title, source_checked_on,`);
  w(`   evidence_level, evidence_supported_fields, evidence_note, renewal_note, limitations,`);
  w(`   research_status, catalogue_decision, reconciliation_outcome, credential_code,`);
  w(`   mapped_credential_class, mapped_professional_domain, decision_note,`);
  w(`   unresolved_issue, required_action, holder_reason, recheck_checked_on, recheck_note,`);
  w(`   reviewer, reviewed_at)`);
  w(`VALUES`);
  w(
    ds
      .map((d) => {
        const r = d.record;
        const ev = evidenceById.get(r.credential_id);
        const src = sourceById.get(r.source_id);
        return (
          `  (${q(r.credential_id)}, DATE '${SNAPSHOT_DATE}', ${q(r.issuer_id)}, ${q(r.issuer)}, ${q(r.acronym)}, ${q(r.official_name)},\n` +
          `   ${q(r.research_area)}, ${q(r.domain)}, ${q(r.credential_kind)}, ${q(r.research_scope)}, ${q(r.jurisdiction_context)},\n` +
          `   ${q(r.recommended_priority)}, ${q(r.source_id)}, ${q(r.source_url)}, ${q(r.source_title)}, DATE '${src?.checked_at ?? SNAPSHOT_DATE}',\n` +
          `   ${q(r.evidence_level)}, ${q(ev?.supported_fields ?? null)}, ${q(r.evidence_note)}, ${q(r.renewal_note)}, ${q(r.limitations)},\n` +
          `   ${q(r.research_status)}, ${q(d.decision)}, ${q(d.outcome)}, ${q(d.credentialCode)},\n` +
          `   ${q(d.mappedClass)}, ${q(d.mappedDomain)}, ${q(d.decisionNote)},\n` +
          `   ${q(d.unresolvedIssue)}, ${q(d.requiredAction)}, ${q(d.holderReason)}, ${d.recheckNote ? `DATE '${SNAPSHOT_DATE}'` : "NULL"}, ${q(d.recheckNote)},\n` +
          `   ${q(REVIEWER)}, TIMESTAMPTZ '${REVIEWED_AT}')`
        );
      })
      .join(",\n"),
  );
  w(`ON CONFLICT (research_id) DO NOTHING;`);
  w(``);

  /* postflight */
  w(`-- ---------------------------------------------------------------------------`);
  w(`-- 9. Postflight: the migration proves its own counts, or it does not apply`);
  w(`-- ---------------------------------------------------------------------------`);
  w(`DO $post$`);
  w(`DECLARE _n integer;`);
  w(`BEGIN`);
  w(
    `  SELECT count(*) INTO _n FROM public.sp_catalogue_research_records WHERE snapshot_date = DATE '${SNAPSHOT_DATE}';`,
  );
  w(
    `  IF _n <> ${ds.length} THEN RAISE EXCEPTION 'SP_RESEARCH_IMPORT_COUNT: expected ${ds.length} research records, found %', _n; END IF;`,
  );
  for (const [label, o, n] of [
    ["matched_existing", "matched_existing", matched.length],
    ["added_approved", "added_approved", added.length],
    ["retained_for_review", "retained_for_review", retained.length],
    ["excluded", "excluded", excluded.length],
  ] as const) {
    w(
      `  SELECT count(*) INTO _n FROM public.sp_catalogue_research_records WHERE reconciliation_outcome = '${o}';`,
    );
    w(
      `  IF _n <> ${n} THEN RAISE EXCEPTION 'SP_RESEARCH_IMPORT_OUTCOME: expected ${n} ${label}, found %', _n; END IF;`,
    );
  }
  w(`  SELECT count(*) INTO _n FROM public.sp_credential_types t`);
  w(`    JOIN public.sp_catalogue_research_records r ON r.credential_code = t.code`);
  w(`    WHERE r.reconciliation_outcome = 'added_approved'`);
  w(`      AND (t.is_active OR t.scope_code IS DISTINCT FROM 'global_professional'`);
  w(`           OR t.jurisdiction_code IS NOT NULL OR t.market_pack_code IS NOT NULL`);
  w(`           OR t.allows_no_expiry OR t.legal_review_state <> 'pending');`);
  w(
    `  IF _n <> 0 THEN RAISE EXCEPTION 'SP_RESEARCH_IMPORT_NOT_INERT: % new definitions are active, scoped to a place, or allow no expiry', _n; END IF;`,
  );
  w(
    `  SELECT count(*) INTO _n FROM public.sp_credential_types WHERE code LIKE 'INTL\\_%' AND is_active;`,
  );
  w(
    `  IF _n <> ${EXISTING_DEFINITIONS.length} THEN RAISE EXCEPTION 'SP_RESEARCH_IMPORT_ACTIVATED: expected ${EXISTING_DEFINITIONS.length} active international definitions, found %', _n; END IF;`,
  );
  w(`END $post$;`);
  w(``);
  w(`COMMIT;`);
  w(``);
  void newClasses;
  return lines.join("\n");
}

/** The publication migration: activates exactly the added definitions, by explicit code. */
export function emitPublishSql(ds: Disposition[]): string {
  const added = ds.filter((d) => d.outcome === "added_approved");
  const codes = added.map((d) => d.definition!.code).sort();
  const lines: string[] = [];
  const w = (s = "") => lines.push(s);
  w(`-- Security Passport — publish the approved research definitions (DATA).`);
  w(`--`);
  w(`-- GENERATED by scripts/passport-catalogue-research-build.ts. Do not edit by hand.`);
  w(`--`);
  w(`-- Depends on 20270207090000_sp_catalogue_research_import.sql, which created`);
  w(`-- these ${codes.length} definitions inactive. This is the PUBLICATION step: it sets`);
  w(`-- is_active = true on exactly the listed codes and nothing else.`);
  w(`--`);
  w(`-- RELEASE ORDER. Merge and apply this only AFTER the application that renders`);
  w(`-- the new credential kinds has been published (docs/passport/`);
  w(`-- certification-catalogue-integration.md). Publication is separate from`);
  w(`-- research approval and from any verification of a holder: it makes a`);
  w(`-- definition SELECTABLE and nothing more. legal_review_state stays 'pending',`);
  w(`-- allows_no_expiry stays false, and no market, grant or claim changes.`);
  w(``);
  w(`BEGIN;`);
  w(``);
  w(`UPDATE public.sp_credential_types t`);
  w(`   SET is_active = true`);
  w(` WHERE t.code IN (`);
  w(codes.map((c) => `   ${q(c)}`).join(",\n"));
  w(`   )`);
  w(`   AND NOT t.is_active`);
  w(`   AND t.scope_code = 'global_professional'`);
  w(`   AND t.jurisdiction_code IS NULL AND t.market_pack_code IS NULL;`);
  w(``);
  w(`DO $post$`);
  w(`DECLARE _n integer;`);
  w(`BEGIN`);
  w(`  SELECT count(*) INTO _n FROM public.sp_credential_types t`);
  w(`    JOIN public.sp_catalogue_research_records r ON r.credential_code = t.code`);
  w(`   WHERE r.reconciliation_outcome = 'added_approved' AND t.is_active;`);
  w(
    `  IF _n <> ${codes.length} THEN RAISE EXCEPTION 'SP_RESEARCH_PUBLISH_COUNT: expected ${codes.length} published definitions, found %', _n; END IF;`,
  );
  w(
    `  SELECT count(*) INTO _n FROM public.sp_credential_types WHERE code LIKE 'INTL\\_%' AND is_active;`,
  );
  w(
    `  IF _n <> ${codes.length + EXISTING_DEFINITIONS.length} THEN RAISE EXCEPTION 'SP_RESEARCH_PUBLISH_TOTAL: expected ${codes.length + EXISTING_DEFINITIONS.length} active international definitions, found %', _n; END IF;`,
  );
  w(
    `  SELECT count(*) INTO _n FROM public.sp_credential_types WHERE is_active AND code NOT LIKE 'INTL\\_%' AND scope_code = 'global_professional';`,
  );
  w(
    `  IF _n <> 0 THEN RAISE EXCEPTION 'SP_RESEARCH_PUBLISH_STRAY: % non-research global definitions are active', _n; END IF;`,
  );
  w(`END $post$;`);
  w(``);
  w(`COMMIT;`);
  w(``);
  return lines.join("\n");
}

/** Rollback of the import: refuses once anything depends on the definitions, else removes exactly what the import added. */
export function emitImportRollbackSql(ds: Disposition[]): string {
  const added = ds.filter((d) => d.outcome === "added_approved");
  const codes = added.map((d) => d.definition!.code).sort();
  const newIssuers = [
    ...new Set(
      added
        .map((d) => ISSUERS[d.record.issuer])
        .filter((i) => !i.existing)
        .map((i) => i.code),
    ),
  ].sort();
  const list = (a: string[]) => a.map((c) => `   ${q(c)}`).join(",\n");
  const lines: string[] = [];
  const w = (s = "") => lines.push(s);
  w(`-- Rollback of 20270207090000_sp_catalogue_research_import.sql`);
  w(`--`);
  w(`-- GENERATED by scripts/passport-catalogue-research-build.ts. Do not edit by hand.`);
  w(`--`);
  w(`-- A rollback refuses rather than destroys. It stops if a holder holds a claim`);
  w(`-- against one of the ${codes.length} definitions the import added, if a catalogue request`);
  w(`-- refers to one, or if an administrator has already recorded a research decision`);
  w(`-- (that history would be lost). Prefer a forward fix; to withdraw a definition`);
  w(`-- without deleting it, roll back the publication instead.`);
  w(`--`);
  w(`-- It removes only what the import added: the research records of the`);
  w(`-- ${SNAPSHOT_DATE} snapshot, the ${codes.length} definitions and their detail rows, and the`);
  w(`-- ${newIssuers.length} issuers it created (and only while no other definition uses them).`);
  w(`-- Existing definitions, issuers, claims and markets are not touched.`);
  w(`BEGIN;`);
  w(``);
  w(`DO $$`);
  w(`DECLARE _codes text[] := ARRAY[`);
  w(list(codes));
  w(`  ];`);
  w(`BEGIN`);
  w(`  IF EXISTS (SELECT 1 FROM public.sp_claims WHERE credential_code = ANY (_codes)) THEN`);
  w(
    `    RAISE EXCEPTION 'SP_RESEARCH_IMPORT_ROLLBACK_REFUSED: holders hold claims against definitions this import added; roll back the publication instead, or fix forward';`,
  );
  w(`  END IF;`);
  w(`  IF to_regclass('public.sp_catalogue_requests') IS NOT NULL AND EXISTS (`);
  w(`       SELECT 1 FROM public.sp_catalogue_requests q`);
  w(
    `        WHERE q.answered_credential_code = ANY (_codes) OR q.research_record_id IS NOT NULL) THEN`,
  );
  w(
    `    RAISE EXCEPTION 'SP_RESEARCH_IMPORT_ROLLBACK_REFUSED: catalogue requests refer to these definitions or research records';`,
  );
  w(`  END IF;`);
  w(
    `  IF EXISTS (SELECT 1 FROM public.sp_catalogue_research_records WHERE reviewed_by_user_id IS NOT NULL) THEN`,
  );
  w(
    `    RAISE EXCEPTION 'SP_RESEARCH_IMPORT_ROLLBACK_REFUSED: an administrator has recorded research decisions that would be lost';`,
  );
  w(`  END IF;`);
  w(``);
  w(`  DELETE FROM public.sp_certification_sources WHERE credential_code = ANY (_codes);`);
  w(
    `  DELETE FROM public.sp_certification_definition_aliases WHERE credential_code = ANY (_codes);`,
  );
  w(`  DELETE FROM public.sp_credential_definition_reviews WHERE credential_code = ANY (_codes);`);
  w(`  DELETE FROM public.sp_credential_definition_metadata WHERE credential_code = ANY (_codes);`);
  w(
    `  DELETE FROM public.sp_catalogue_research_records WHERE snapshot_date = DATE '${SNAPSHOT_DATE}';`,
  );
  w(`  DELETE FROM public.sp_certification_definitions WHERE credential_code = ANY (_codes);`);
  w(`  DELETE FROM public.sp_credential_types WHERE code = ANY (_codes);`);
  w(``);
  w(`  DELETE FROM public.sp_certification_issuer_aliases a`);
  w(`   USING public.sp_certification_issuers i`);
  w(`   WHERE a.issuer_id = i.id AND i.issuer_code = ANY (ARRAY[`);
  w(list(newIssuers));
  w(
    `   ]) AND NOT EXISTS (SELECT 1 FROM public.sp_certification_definitions d WHERE d.issuer_id = i.id);`,
  );
  w(`  DELETE FROM public.sp_certification_issuers i`);
  w(`   WHERE i.issuer_code = ANY (ARRAY[`);
  w(list(newIssuers));
  w(
    `   ]) AND NOT EXISTS (SELECT 1 FROM public.sp_certification_definitions d WHERE d.issuer_id = i.id)`,
  );
  w(
    `     AND NOT EXISTS (SELECT 1 FROM public.sp_certification_sources s WHERE s.issuer_id = i.id);`,
  );
  w(`END $$;`);
  w(``);
  w(`COMMIT;`);
  w(``);
  return lines.join("\n");
}

/** Rollback of the publication: withdraws the definitions from new registration. Existing claims are untouched. */
export function emitPublishRollbackSql(ds: Disposition[]): string {
  const codes = ds
    .filter((d) => d.outcome === "added_approved")
    .map((d) => d.definition!.code)
    .sort();
  return [
    `-- Rollback of 20270208090000_sp_catalogue_research_publish.sql`,
    `--`,
    `-- GENERATED by scripts/passport-catalogue-research-build.ts. Do not edit by hand.`,
    `--`,
    `-- Withdraws the ${codes.length} published definitions from NEW registration (is_active = false).`,
    `-- It deletes nothing: a withdrawal never hides an existing claim from its holder, changes`,
    `-- its trust or destroys it. Existing claims stay readable and reviewable.`,
    `BEGIN;`,
    ``,
    `UPDATE public.sp_credential_types`,
    `   SET is_active = false`,
    ` WHERE code IN (`,
    codes.map((c) => `   ${q(c)}`).join(",\n"),
    `   );`,
    ``,
    `COMMIT;`,
    ``,
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Generated TypeScript: the plate marks                                */
/* ------------------------------------------------------------------ */

export function emitMarksTs(ds: Disposition[]): string {
  const rows = ds
    .filter((d) => d.definition)
    .map((d) => [d.definition!.code, d.definition!.symbolLabel] as const)
    .sort((a, b) => a[0].localeCompare(b[0]));
  return [
    "/**",
    " * GENERATED by scripts/passport-catalogue-research-build.ts. Do not edit by hand.",
    " *",
    " * The governed plate mark (sp_credential_types.symbol_label) of each definition",
    " * the 2026-10-03 certification research import adds. `credentialMark` reads this",
    " * table beside its own, because a mark is a designed abbreviation of a",
    " * credential somebody approved, never a slice of its code. Where an award",
    " * publishes no abbreviation that fits the plate, the mark is its ISSUER's",
    " * acronym; initials composed from a title are never invented.",
    " * scripts/passport-catalogue-research-check.ts pins this table against the",
    " * import migration.",
    " */",
    "export const RESEARCH_CREDENTIAL_MARKS: Readonly<Record<string, string>> = {",
    ...rows.map(([c, m]) => `  ${c}: ${JSON.stringify(m)},`),
    "};",
    "",
  ].join("\n");
}

/* ------------------------------------------------------------------ */
/* Reconciliation report                                                */
/* ------------------------------------------------------------------ */

export function counts(ds: Disposition[]) {
  const by = <K extends string>(f: (d: Disposition) => K) =>
    ds.reduce<Record<string, number>>((m, d) => ((m[f(d)] = (m[f(d)] ?? 0) + 1), m), {});
  return {
    total: ds.length,
    outcome: by((d) => d.outcome),
    priority: by((d) => d.record.recommended_priority as string),
    area: by((d) => d.record.research_area as string),
    kind: by((d) => d.record.credential_kind as string),
    status: by((d) => d.record.research_status as string),
    evidence: by((d) => d.record.evidence_level as string),
    outcomeByPriority: ds.reduce<Record<string, Record<string, number>>>((m, d) => {
      const p = d.record.recommended_priority;
      (m[p] ??= {})[d.outcome] = (m[p][d.outcome] ?? 0) + 1;
      return m;
    }, {}),
    sourceRecheck: {
      total: ds.filter((d) => d.record.research_status === "source_recheck_required").length,
      matched: ds.filter(
        (d) =>
          d.record.research_status === "source_recheck_required" &&
          d.outcome === "matched_existing",
      ).length,
      retained: ds.filter(
        (d) =>
          d.record.research_status === "source_recheck_required" &&
          d.outcome === "retained_for_review",
      ).length,
    },
  };
}

export function emitReconciliationJson(ds: Disposition[]): string {
  return (
    JSON.stringify(
      {
        snapshot: SNAPSHOT_DATE,
        generatedBy: "scripts/passport-catalogue-research-build.ts",
        counts: counts(ds),
        records: ds.map((d) => ({
          researchId: d.record.credential_id,
          issuer: d.record.issuer,
          issuerCode: ISSUERS[d.record.issuer].code,
          acronym: d.record.acronym,
          officialName: d.record.official_name,
          kind: d.record.credential_kind,
          area: d.record.research_area,
          priority: d.record.recommended_priority,
          researchStatus: d.record.research_status,
          evidenceLevel: d.record.evidence_level,
          outcome: d.outcome,
          decision: d.decision,
          credentialCode: d.credentialCode,
          credentialClass: d.mappedClass,
          professionalDomain: d.mappedDomain,
          holderReason: d.holderReason,
          unresolvedIssue: d.unresolvedIssue,
          requiredAction: d.requiredAction,
          recheckNote: d.recheckNote,
          acronymNearMisses: d.nearMisses,
          sourceUrl: d.record.source_url,
        })),
      },
      null,
      2,
    ) + "\n"
  );
}

const cell = (s: string | null | undefined) =>
  (s ?? "").replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();

export function emitReconciliationMd(ds: Disposition[]): string {
  const c = counts(ds);
  const o = c.outcome;
  const lines: string[] = [];
  const w = (s = "") => lines.push(s);
  w(`# Certification research reconciliation — snapshot ${SNAPSHOT_DATE}`);
  w();
  w(`_Generated by \`scripts/passport-catalogue-research-build.ts\`. Do not edit by hand._`);
  w();
  w(
    `Every one of the ${c.total} research records has one explicit outcome. Research approval, publication of a`,
  );
  w(
    `catalogue definition and verification of a holder's claim are three different things; this table records only the first.`,
  );
  w();
  w(`| Outcome | Records |`);
  w(`|---|---|`);
  w(`| Matched to an existing definition (nothing changes) | ${o.matched_existing ?? 0} |`);
  w(
    `| Added as an approved definition (inactive until the publication migration) | ${o.added_approved ?? 0} |`,
  );
  w(
    `| Retained for administrator review (unresolved issue and action recorded) | ${o.retained_for_review ?? 0} |`,
  );
  w(`| Excluded (reason recorded) | ${o.excluded ?? 0} |`);
  w(`| **Total** | **${c.total}** |`);
  w();
  w(
    `By research priority: ${Object.entries(c.outcomeByPriority)
      .map(
        ([p, m]) =>
          `${p} — ${Object.entries(m)
            .map(([k, v]) => `${v} ${k.replace(/_/g, " ")}`)
            .join(", ")}`,
      )
      .join("; ")}.`,
  );
  w();
  w(
    `Rows marked \`source_recheck_required\`: ${c.sourceRecheck.total} (${c.sourceRecheck.matched} matched to an existing definition whose own sources stand; ${c.sourceRecheck.retained} retained for review).`,
  );
  w();
  w(`## Retained for review`);
  w();
  w(`| Research id | Issuer | Award | Unresolved issue | Action |`);
  w(`|---|---|---|---|---|`);
  for (const d of ds.filter((x) => x.outcome === "retained_for_review")) {
    w(
      `| \`${d.shortId}\` | ${cell(d.record.issuer)} | ${cell(d.record.official_name)} | ${cell(d.unresolvedIssue)} | ${cell(d.requiredAction)} |`,
    );
  }
  w();
  w(`## Recheck of the \`source_recheck_required\` rows (${SNAPSHOT_DATE})`);
  w();
  for (const d of ds.filter((x) => x.recheckNote)) {
    w(
      `- **${cell(d.record.official_name)}** (${cell(d.record.issuer)}, \`${d.shortId}\`): ${cell(d.recheckNote)}`,
    );
  }
  w();
  w(`## Every record`);
  w();
  w(`| Id | P | Area | Kind | Issuer | Award | Outcome | Definition / issue |`);
  w(`|---|---|---|---|---|---|---|---|`);
  for (const d of ds) {
    const tail = d.credentialCode ? `\`${d.credentialCode}\`` : cell(d.holderReason);
    w(
      `| \`${d.shortId}\` | ${d.record.recommended_priority} | ${d.record.research_area} | ${d.record.credential_kind.replace(/_/g, " ")} | ${cell(d.record.issuer)} | ${cell(d.record.official_name)} | ${d.outcome.replace(/_/g, " ")} | ${tail} |`,
    );
  }
  w();
  return lines.join("\n");
}

export function readRepoFile(rel: string): string | null {
  try {
    return readFileSync(path.join(root, rel), "utf8");
  } catch {
    return null;
  }
}

export const repoRoot = root;
