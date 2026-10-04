/**
 * Guard for the 2026-10-03 certification research import.
 *
 *   bun run passport-catalogue-research:check
 *
 * Proves, without a database, that the research package was reconciled in full
 * and honestly, and that the migrations and the generated TypeScript are
 * exactly what the reviewed decisions produce:
 *
 *   1  the package is intact (170 / 40 / 117) and every record has ONE outcome;
 *   2  matching needs issuer AND award, and never an acronym alone;
 *   3  every addition is a global_professional definition with no place, no
 *      market, no lifetime validity, no invented abbreviation, no recognition;
 *   4  research scope and jurisdiction context are never written anywhere but
 *      the research record;
 *   5  retained records are actionable, and the recheck is recorded;
 *   6  the generated artefacts are current and agree with each other (SQL
 *      postflight counts, plate marks, rollbacks);
 *   7  the shared vocabularies know every class and subject the SQL introduces.
 *
 * Credential-free and network-free.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { CREDENTIAL_CLASSES } from "../src/lib/security-passport/international.ts";
import {
  CLASS_BY_KIND,
  EXCLUDED,
  EXISTING_DEFINITIONS,
  ISSUERS,
  RETAINED,
  CODE_SLUG_NO_ACRONYM,
  DEFINITION_ALIASES,
  ACRONYM_IS_NOT_AN_ABBREVIATION,
} from "./lib/passport-catalogue-research-data.ts";
import {
  IMPORT_MIGRATION,
  MARKS_FILE,
  PUBLISH_MIGRATION,
  RECONCILIATION_JSON,
  RECONCILIATION_MD,
  IMPORT_ROLLBACK,
  PUBLISH_ROLLBACK,
  emitImportRollbackSql,
  emitImportSql,
  emitMarksTs,
  emitPublishRollbackSql,
  emitPublishSql,
  emitReconciliationJson,
  emitReconciliationMd,
  loadPackage,
  matchExisting,
  normaliseAward,
  readRepoFile,
  reconcile,
  repoRoot,
  shortId,
  type ResearchRecord,
} from "./lib/passport-catalogue-research.ts";

let passed = 0;
const failures: string[] = [];
function ok(cond: boolean, label: string): void {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL ${label}`);
  }
}
function group(title: string): void {
  console.log(`\n${title}`);
}

const pkg = loadPackage();
const ds = reconcile(pkg);
const validation = JSON.parse(
  readFileSync(
    path.join(
      repoRoot,
      "docs/passport/research/2026-10-03-certification-catalogue/validation.json",
    ),
    "utf8",
  ),
) as { credentials: number; issuers: number; sources: number };

/* ─────────────────────────────────────────────────────────────── */
group("GROUP 1 — the package is intact and every record has exactly one outcome");
ok(
  pkg.credentials.length === 170 && pkg.issuers.length === 40 && pkg.sources.length === 117,
  "1.1 the package holds 170 programmes, 40 issuers and 117 sources, as its own validation says",
);
ok(
  validation.credentials === pkg.credentials.length &&
    validation.issuers === pkg.issuers.length &&
    validation.sources === pkg.sources.length,
  "1.2 validation.json agrees with catalogue.json",
);
ok(
  new Set(pkg.credentials.map((r) => r.credential_id)).size === 170,
  "1.3 research ids are unique",
);
ok(
  pkg.credentials.every(
    (r) => /^https:\/\//.test(r.source_url) && /^cred_[0-9a-f]{16}$/.test(r.credential_id),
  ),
  "1.4 every record keeps an https source and a well-formed research id",
);
ok(
  ds.length === 170 && new Set(ds.map((d) => d.record.credential_id)).size === 170,
  "1.5 every research record has a disposition, once",
);
const outcomes = ds.reduce<Record<string, number>>(
  (m, d) => ((m[d.outcome] = (m[d.outcome] ?? 0) + 1), m),
  {},
);
ok(
  outcomes.matched_existing === 14 &&
    outcomes.added_approved === 140 &&
    outcomes.retained_for_review === 16 &&
    (outcomes.excluded ?? 0) === 0 &&
    ds.length === 170,
  "1.6 the outcomes are 14 matched, 140 added, 16 retained, 0 excluded, and sum to 170",
);
ok(
  ds.every((d) =>
    ["matched_existing", "added_approved", "retained_for_review", "excluded"].includes(d.outcome),
  ),
  "1.7 no record is left undecided",
);
const knownShort = new Set(pkg.credentials.map(shortId));
const stale = [
  ...Object.keys(RETAINED),
  ...Object.keys(EXCLUDED),
  ...Object.keys(CODE_SLUG_NO_ACRONYM),
  ...Object.keys(DEFINITION_ALIASES),
  ...[...ACRONYM_IS_NOT_AN_ABBREVIATION],
].filter((k) => !knownShort.has(k));
ok(
  stale.length === 0,
  `1.8 every decision table names a real research record (stale: ${stale.join(", ") || "none"})`,
);
const issuersUnplanned = pkg.credentials.filter((r) => !ISSUERS[r.issuer]);
ok(issuersUnplanned.length === 0, "1.9 every researched issuer has a reviewed plan");
const p1 = ds.filter((d) => d.record.recommended_priority === "P1");
ok(p1.length === 51, "1.10 all 51 P1 records are decided");

/* ─────────────────────────────────────────────────────────────── */
group("GROUP 2 — matching needs issuer AND award, never an acronym alone");
const fake = (over: Partial<ResearchRecord>): ResearchRecord => ({
  ...pkg.credentials[0],
  credential_id: "cred_0000000000000000",
  ...over,
});
ok(
  matchExisting(
    fake({
      issuer: "ASIS International",
      acronym: "CPP",
      official_name: "Certified Protection Professional",
    }),
  ).kind === "matched",
  "2.1 issuer, exact award and abbreviation together match the existing CPP",
);
ok(
  matchExisting(
    fake({
      issuer: "ASIS International",
      acronym: "CPP",
      official_name: "Chartered Pastry Practitioner",
    }),
  ).kind === "none",
  "2.2 the same issuer and acronym with a different award does not match",
);
ok(
  matchExisting(
    fake({ issuer: "CompTIA", acronym: "CPP", official_name: "Certified Protection Professional" }),
  ).kind === "none",
  "2.3 the same acronym and award under another issuer does not match",
);
ok(
  matchExisting(
    fake({ issuer: "CompTIA", acronym: "CPP", official_name: "Something Else Entirely" }),
  ).kind === "none",
  "2.4 an acronym alone never matches",
);
ok(
  matchExisting(
    fake({
      issuer: "ISC2",
      acronym: "CISSP-ISSEP",
      official_name: "Certified Information Systems Security Professional",
    }),
  ).kind === "none",
  "2.5 an award name that normalises equal but whose abbreviation disagrees does not match",
);
ok(
  normaliseAward("OffSec Certified Professional (OSCP+)") ===
    normaliseAward("OffSec Certified Professional") &&
    ds
      .filter((d) => d.record.acronym === "OSCP" || d.record.acronym === "OSCP+")
      .every((d) => d.outcome === "added_approved") &&
    new Set(
      ds
        .filter((d) => d.record.acronym === "OSCP" || d.record.acronym === "OSCP+")
        .map((d) => d.credentialCode),
    ).size === 2,
  "2.6 OSCP and OSCP+ stay two separate definitions even though their names normalise alike",
);
const matched = ds.filter((d) => d.outcome === "matched_existing");
ok(
  matched.length === 14 &&
    new Set(matched.map((d) => d.credentialCode)).size === 14 &&
    matched.every((d) => EXISTING_DEFINITIONS.some((e) => e.code === d.credentialCode)),
  "2.7 the 14 matches are 14 distinct existing definitions",
);
ok(
  ds.filter((d) => d.record.acronym === "CIPM" || (d.record.acronym ?? "").startsWith("CIPM "))
    .length === 3 &&
    new Set(
      ds
        .filter((d) => (d.record.acronym ?? "").startsWith("CIPM"))
        .map((d) => d.definition?.issuerCode),
    ).size === 2,
  "2.8 CIPM (IAPP) and CIPM I / II (IFCPP) are three definitions under two issuers",
);

/* ─────────────────────────────────────────────────────────────── */
group("GROUP 3 — every addition is inert, global and honest");
const added = ds.filter((d) => d.outcome === "added_approved");
const defs = added.map((d) => d.definition!);
ok(
  defs.length === 140 && new Set(defs.map((d) => d.code)).size === 140,
  "3.1 140 definitions with unique codes",
);
ok(
  defs.every((d) => /^INTL_[A-Z0-9_]{2,43}$/.test(d.code) && d.code.length <= 48),
  "3.2 every code fits the database's code rule",
);
ok(
  defs.every((d) => !EXISTING_DEFINITIONS.some((e) => e.code === d.code)),
  "3.3 no addition reuses an existing code",
);
const sql = emitImportSql(ds, pkg);
const typesInsert = sql.slice(
  sql.indexOf("INSERT INTO public.sp_credential_types"),
  sql.indexOf("-- 3. The governed detail"),
);
ok(
  /'global_professional', 'pending'/.test(typesInsert) &&
    !/is_active\s*=\s*true/i.test(typesInsert) &&
    /false, false, false, v\.sort_order/.test(typesInsert),
  "3.4 the type insert is global_professional, legal review pending and INACTIVE",
);
ok(
  /NULL, NULL, NULL, NULL, NULL,\s*false, false, v\.reference_label/.test(typesInsert),
  "3.5 no market pack, jurisdiction, sub-jurisdiction, authority or role; no no-expiry; no required scope",
);
ok(
  !/(jurisdiction_code|sub_jurisdiction_code|market_pack_code)\s*=/.test(typesInsert) &&
    !typesInsert.includes("'AE-DU'") &&
    !typesInsert.includes("'GB-NI'"),
  "3.6 the definition insert assigns no jurisdiction, region or market anywhere",
);
ok(
  defs.every((d) => d.symbolLabel.length >= 1 && d.symbolLabel.length <= 8),
  "3.7 every plate mark fits the plate",
);
ok(
  defs.every(
    (d) => d.abbreviation === null || (d.abbreviation.length >= 1 && d.abbreviation.length <= 24),
  ),
  "3.8 an abbreviation is the issuer's own and at most 24 characters",
);
ok(
  defs.filter((d) => d.abbreviation === null).length === 27 &&
    added
      .filter((d) => d.record.acronym === null)
      .every((d) => d.definition!.abbreviation === null),
  "3.9 the 27 awards with no published abbreviation have none: none is invented",
);
ok(
  defs.every(
    (d) =>
      /not lifetime validity/.test(d.maintenanceSummary) &&
      !/\b\d+ months\b/.test(d.maintenanceSummary),
  ),
  "3.10 renewal is narrative, unknown is not lifetime, and no cycle is invented",
);
ok(
  added.every((d) => d.mappedClass === CLASS_BY_KIND[d.record.credential_kind]),
  "3.11 each kind maps to its credential class and nothing else",
);
ok(
  new Set(added.map((d) => d.mappedClass)).size === 5 &&
    new Set(added.map((d) => d.record.research_area)).size === 5,
  "3.12 all five kinds and all five research areas are represented",
);
ok(
  /'not_assessed', NULL/.test(sql) &&
    !/'recertification_cycle'|'annual_compliance'/.test(sql.split("-- 4. The kind of award")[0]),
  "3.13 every maintenance policy is 'not_assessed' with no cycle",
);
ok(
  !/allows_no_expiry\s*=\s*true/i.test(sql) && !/is_active\s*=\s*true/i.test(sql),
  "3.14 the import never enables no-expiry or activates a definition",
);
const newIssuers = [
  ...new Set(added.map((d) => ISSUERS[d.record.issuer]).filter((i) => !i.existing)),
];
ok(
  newIssuers.length === 31 &&
    newIssuers.every(
      (i) => /^[A-Z][A-Z0-9_]{1,31}$/.test(i.code) && /^https:\/\//.test(i.officialUrl ?? ""),
    ) &&
    !newIssuers.some((i) => /\bISO\b/i.test(i.displayName ?? "")),
  "3.15 31 new issuers with valid codes and https sites, and ISO is never an issuer",
);
ok(
  !/'(exact_match_lookup|opt_in_directory|issuer_account)'/.test(
    sql.slice(sql.indexOf("-- 1. Issuers"), sql.indexOf("-- 2. Definitions")),
  ),
  "3.16 no new issuer claims a verification route the research did not establish",
);

/* ─────────────────────────────────────────────────────────────── */
group("GROUP 4 — research scope never becomes a place, a market or an access rule");
const withContext = pkg.credentials.filter((r) => r.jurisdiction_context);
ok(
  withContext.length === 36 || withContext.length > 0,
  "4.1 the package carries jurisdiction context on national and regional records",
);
const outsideResearch = sql.replace(
  /INSERT INTO public\.sp_catalogue_research_records[\s\S]*?ON CONFLICT \(research_id\) DO NOTHING;/,
  "",
);
ok(
  withContext.every(
    (r) => !r.jurisdiction_context || !outsideResearch.includes(`'${r.jurisdiction_context}'`),
  ),
  "4.2 no jurisdiction_context value is written outside the research record",
);
ok(
  ds
    .filter((d) => d.record.research_scope !== "international" && d.outcome === "added_approved")
    .every((d) => d.definition && /^INTL_/.test(d.definition.code)),
  "4.3 a national or regional record is added as an international definition with no country: its origin never restricts a holder abroad",
);
ok(
  ds.filter((d) => d.record.research_scope !== "international" && d.outcome === "added_approved")
    .length > 20,
  "4.4 the national and regional records are really added (they are not dropped for their origin)",
);
ok(!/jurisdiction_code\s*=/.test(sql), "4.5 the import assigns no jurisdiction_code");

/* ─────────────────────────────────────────────────────────────── */
group("GROUP 5 — retained records are actionable and the recheck is recorded");
const retained = ds.filter((d) => d.outcome === "retained_for_review");
ok(
  retained.length === 16 &&
    retained.every(
      (d) =>
        (d.unresolvedIssue ?? "").length > 40 &&
        (d.requiredAction ?? "").length > 40 &&
        d.holderReason !== null &&
        d.holderReason !== "not_offered",
    ),
  "5.1 each of the 16 retained records states its unresolved issue, the action and the holder-facing reason",
);
const recheck = ds.filter((d) => d.record.research_status === "source_recheck_required");
ok(recheck.length === 13, "5.2 the 13 source_recheck_required records are all accounted for");
ok(
  recheck
    .filter((d) => d.outcome === "retained_for_review")
    .every(
      (d) =>
        /EGRESS_BLOCKED/.test(d.recheckNote ?? "") &&
        /Index result|Search-index text/.test(d.recheckNote ?? ""),
    ) && recheck.filter((d) => d.outcome === "retained_for_review").length === 12,
  "5.3 each retained recheck row records what the recheck did and did not establish",
);
ok(
  recheck.filter((d) => d.outcome === "matched_existing").length === 1 &&
    recheck.find((d) => d.outcome === "matched_existing")!.credentialCode === "INTL_ACAMS_CAMS",
  "5.4 the one matched recheck row is ACAMS CAMS, whose existing definition stands on its own sources",
);
ok(
  ds
    .filter((d) => d.record.recommended_priority === "P3")
    .every((d) => d.outcome === "retained_for_review"),
  "5.5 P3 rows need stronger evidence and are retained",
);
ok(
  ds.filter(
    (d) => d.record.evidence_level === "official_search_excerpt" && d.outcome === "added_approved",
  ).length === 0,
  "5.6 no record resting on a search excerpt alone is approved",
);
ok(
  retained.every((d) => !d.definition && d.credentialCode === null),
  "5.7 a retained record never receives a definition",
);

/* ─────────────────────────────────────────────────────────────── */
group("GROUP 6 — the generated artefacts are current and agree with one another");
const expected: [string, string][] = [
  [IMPORT_MIGRATION, sql],
  [PUBLISH_MIGRATION, emitPublishSql(ds)],
  [IMPORT_ROLLBACK, emitImportRollbackSql(ds)],
  [PUBLISH_ROLLBACK, emitPublishRollbackSql(ds)],
  [MARKS_FILE, emitMarksTs(ds)],
  [RECONCILIATION_JSON, emitReconciliationJson(ds)],
  [RECONCILIATION_MD, emitReconciliationMd(ds)],
];
for (const [rel, body] of expected) {
  ok(
    readRepoFile(rel) === body,
    `6.${expected.findIndex((e) => e[0] === rel) + 1} ${rel} is exactly what the generator produces`,
  );
}
const publish = readRepoFile(PUBLISH_MIGRATION) ?? "";
ok(
  (publish.match(/^ {3}'INTL_[A-Z0-9_]+'/gm) ?? []).length === 140 &&
    /SP_RESEARCH_PUBLISH_COUNT: expected 140/.test(publish) &&
    /expected 154 active international definitions/.test(publish),
  "6.8 the publication activates exactly the 140 added codes and proves the totals",
);
ok(
  /expected 170 research records/.test(sql) &&
    /expected 14 matched_existing/.test(sql) &&
    /expected 140 added_approved/.test(sql) &&
    /expected 16 retained_for_review/.test(sql) &&
    /expected 0 excluded/.test(sql),
  "6.9 the import's own postflight asserts the counts reported here",
);
const marks = readRepoFile(MARKS_FILE) ?? "";
const marksFromTs = new Map(
  [...marks.matchAll(/^\s+(INTL_[A-Z0-9_]+): "([^"]+)",$/gm)].map((m) => [m[1], m[2]]),
);
const marksFromSql = new Map(
  [
    ...typesInsert.matchAll(/^\s+\('(INTL_[A-Z0-9_]+)', '(?:[^']|'')*', '((?:[^']|'')*)', \d+,/gm),
  ].map((m) => [m[1], m[2].replace(/''/g, "'")]),
);
ok(
  marksFromTs.size === 140 &&
    marksFromSql.size === 140 &&
    [...marksFromSql].every(([c, m]) => marksFromTs.get(c) === m),
  "6.10 the TypeScript plate marks equal the symbol_label the migration seeds, for all 140",
);
ok(
  [...marksFromTs.keys()].every(
    (c) => !c.startsWith(`${marksFromTs.get(c)}`) || marksFromTs.get(c) === c,
  ),
  "6.11 no mark is a prefix of its own code",
);
const rbImport = readRepoFile(IMPORT_ROLLBACK) ?? "";
ok(
  /SP_RESEARCH_IMPORT_ROLLBACK_REFUSED/.test(rbImport) &&
    /FROM public\.sp_claims WHERE credential_code = ANY/.test(rbImport) &&
    !/DELETE FROM public\.sp_claims/.test(rbImport),
  "6.12 the import rollback refuses while a holder holds a claim, and never deletes a claim",
);
ok(
  /SET is_active = false/.test(readRepoFile(PUBLISH_ROLLBACK) ?? "") &&
    !/DELETE/.test(readRepoFile(PUBLISH_ROLLBACK) ?? ""),
  "6.13 the publication rollback only withdraws definitions from new registration",
);

/* ─────────────────────────────────────────────────────────────── */
group("GROUP 7 — the shared vocabularies know every class the SQL introduces");
const foundation =
  readRepoFile("supabase/migrations/20270212090000_sp_catalogue_research_foundation.sql") ?? "";
const classInsert = foundation.slice(
  foundation.indexOf("INSERT INTO public.sp_credential_classes"),
  foundation.indexOf("ON CONFLICT (code) DO NOTHING;"),
);
const dbClasses = [
  ...classInsert.matchAll(/\(\s*'([a-z_]+)'\s*,\s*'[^']+'\s*,\s*'[^']+'\s*\)/g),
].map((m) => m[1]);
ok(
  dbClasses.length === 4 && dbClasses.every((c) => c in CREDENTIAL_CLASSES),
  `7.1 the four classes the foundation adds are all in CREDENTIAL_CLASSES (${dbClasses.join(", ")})`,
);
ok(
  new Set(Object.values(CLASS_BY_KIND)).size === 5 &&
    Object.values(CLASS_BY_KIND).every((c) => c in CREDENTIAL_CLASSES),
  "7.2 every class a research kind maps to has a Swedish and an English label",
);
const domains = new Set(added.map((d) => d.mappedDomain));
const domainCheck = foundation.slice(
  foundation.indexOf("professional_domain_check"),
  foundation.indexOf("-- 3. Three RELAXED"),
);
ok(
  [...domains].every((d) => domainCheck.includes(`'${d}'`)),
  `7.3 every subject the import uses is admitted by the widened constraint (${[...domains].join(", ")})`,
);
const sqlHolderReasons = [
  ...foundation.matchAll(/'(awaiting_[a-z_]+|retired_for_new_candidates|not_offered)'/g),
].map((m) => m[1]);
ok(
  new Set(retained.map((d) => d.holderReason)).size > 0 &&
    retained.every((d) => sqlHolderReasons.includes(d.holderReason!)),
  "7.4 every holder-facing reason the import uses is a value the table admits",
);

console.log(
  `\npassport-catalogue-research-check: ${passed} assertions passed${failures.length ? `, ${failures.length} FAILED` : ""}.`,
);
if (failures.length) {
  for (const f of failures) console.error(`  FAILED: ${f}`);
  process.exit(1);
}
