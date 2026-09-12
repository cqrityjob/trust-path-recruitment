/**
 * Negative controls for the governed international-certification foundation.
 *
 * Every mutation below is a defect this phase exists to make impossible. The
 * harness plants it, runs the guard, and REQUIRES the guard to fail with a
 * named diagnostic. A guard that keeps printing "ok" with the defect applied
 * is a dead assertion, and this is the only thing that makes that visible.
 *
 * The set is chosen from the load-bearing invariants rather than from what is
 * easy to mutate: the ownership predicate, the global-scope constraint, the
 * no-eligibility rule, the private-reference exclusion, and the no-fuzzy-
 * upgrade rule. Each one, removed, must break a focused check.
 *
 * Run: bun run negative-controls:global-certification
 */
import { runControls, type Mutation } from "./runner";

const MIGRATION = "supabase/migrations/20261110090000_sp_global_professional_certifications.sql";
const ROLLBACK =
  "supabase/rollback/20261110090000_sp_global_professional_certifications_rollback.sql";
const SCOPE = "src/lib/security-passport/certification-scope.ts";
const CLASSIFIER = "src/lib/security-passport/classification.ts";
const CREDENTIALS = "src/lib/security-passport/credentials.ts";
const DISCLOSURE = "src/lib/security-passport/disclosure.ts";

const GUARD = "passport-global-certification:check";
const PRIVATE_GUARD = "passport-private-reference:check";

const MUTATIONS: readonly Mutation[] = [
  /* ── The scope is declared, never inferred ───────────────────────── */
  {
    id: "GC-NC-NULL-IS-GLOBAL",
    defect: "an undeclared scope is treated as international",
    file: SCOPE,
    find: "  return definition?.scopeCode === GLOBAL_PROFESSIONAL_SCOPE;",
    replace:
      "  return definition?.scopeCode === GLOBAL_PROFESSIONAL_SCOPE || definition?.scopeCode == null;",
    guard: GUARD,
    expect: "an UNDECLARED scope is not global",
  },
  {
    id: "GC-NC-UNDECLARED-COLLAPSES",
    defect: "undeclared collapses into national, losing the third state",
    file: SCOPE,
    find: "  return definition?.scopeCode === NATIONAL_REGULATED_SCOPE;",
    replace: "  return definition?.scopeCode !== GLOBAL_PROFESSIONAL_SCOPE;",
    guard: GUARD,
    expect: "undeclared is neither",
  },

  /* ── The write path stores no territory for a portable credential ── */
  {
    id: "GC-NC-DRAFT-COUNTRY-WINS",
    defect: "a global certification falls back to the draft's country",
    file: CREDENTIALS,
    find: "    ...(isGlobalCertification(type)\n      ? GLOBAL_CERTIFICATION_TERRITORY",
    replace: "    ...(false\n      ? GLOBAL_CERTIFICATION_TERRITORY",
    guard: GUARD,
    expect: "a global certification stores NULL jurisdiction_code",
  },
  {
    id: "GC-NC-SUB-JURISDICTION-OMITTED",
    defect: "the sub-jurisdiction column is omitted instead of cleared",
    file: SCOPE,
    find: "export const GLOBAL_CERTIFICATION_TERRITORY = {\n  jurisdiction_code: null,\n  sub_jurisdiction_code: null,\n} as const;",
    replace: "export const GLOBAL_CERTIFICATION_TERRITORY = {\n  jurisdiction_code: null,\n} as const;",
    guard: GUARD,
    expect: "the sub-jurisdiction column is present, not omitted",
  },
  {
    id: "GC-NC-PR222-MARKET-FROM-DRAFT",
    defect: "PR #222's rule is reverted: a national credential takes the draft's country",
    file: CREDENTIALS,
    find: "          jurisdiction_code: type.jurisdictionCode ?? nullIfBlank(draft.jurisdictionCode),",
    replace: "          jurisdiction_code: nullIfBlank(draft.jurisdictionCode),",
    guard: GUARD,
    expect: "PR #222: a British licence still stores GB, not the draft's SE",
  },

  /* ── The classifier ─────────────────────────────────────────────── */
  {
    id: "GC-NC-CLASSIFIER-INFERS",
    defect: "the classifier calls any country-less claim an international certification",
    file: CLASSIFIER,
    find: "  if (isGlobalCertification(claim.definition)) {",
    replace: "  if (isGlobalCertification(claim.definition) || !claim.jurisdictionCode) {",
    guard: GUARD,
    expect: "the four free-text rows are self-declared merits, not certifications",
  },
  {
    id: "GC-NC-HISTORY-AFTER-CURRENT",
    defect: "a revoked credential is classified before its lifecycle is considered",
    file: CLASSIFIER,
    find: '  "disputed",\n  "withdrawn",',
    replace: '  "withdrawn",',
    guard: GUARD,
    expect: "claim e -> historical",
  },
  {
    id: "GC-NC-GROUP-BY-HOLDER",
    defect: "other-country credentials are grouped under the holder's country",
    file: CLASSIFIER,
    find: "          groupKey: claim.subJurisdictionCode ?? claim.jurisdictionCode,",
    replace: "          groupKey: work.subJurisdictionCode ?? work.jurisdictionCode ?? null,",
    guard: GUARD,
    expect: "and the group keys are stable and alphabetical",
  },
  {
    id: "GC-NC-ORDER-NOT-TOTAL",
    defect: "the highlight order loses its tie-breaker and depends on input order",
    file: CLASSIFIER,
    find: "  return a.claim.id < b.claim.id ? -1 : a.claim.id > b.claim.id ? 1 : 0;",
    replace: "  return 0;",
    guard: GUARD,
    expect: "the comparator is total",
  },
  {
    id: "GC-NC-HOLDER-OUTRANKS-TRUST",
    defect: "recency outranks trust, so a self-declared claim can lead a verified one",
    file: CLASSIFIER,
    find: "  const trust = (TRUST_RANK[b.claim.assertionLevel] ?? 0) - (TRUST_RANK[a.claim.assertionLevel] ?? 0);\n  if (trust !== 0) return trust;",
    replace: "  const trust = 0;\n  if (trust !== 0) return trust;",
    guard: GUARD,
    expect: "a verified older claim outranks a self-declared newer one",
  },
  {
    id: "GC-NC-DRAFT-DISCLOSABLE",
    defect: "a draft becomes disclosable",
    file: CLASSIFIER,
    find: 'export const DISCLOSABLE_BUCKETS: readonly PassportBucket[] = [\n  "historical",',
    replace: 'export const DISCLOSABLE_BUCKETS: readonly PassportBucket[] = [\n  "draft",\n  "historical",',
    guard: GUARD,
    expect: "a draft is never disclosable",
  },

  /* ── The database invariants ─────────────────────────────────────── */
  {
    id: "GC-NC-GLOBAL-SCOPE-UNBOUND",
    defect: "the global-scope constraint stops pinning the jurisdiction to NULL",
    file: MIGRATION,
    find: "            AND market_pack_code IS NULL\n            AND jurisdiction_code IS NULL",
    replace: "            AND market_pack_code IS NULL",
    guard: GUARD,
    expect: "and it pins jurisdiction_code IS NULL",
  },
  {
    id: "GC-NC-NO-ELIGIBILITY",
    defect: "a certification is allowed to create national eligibility",
    file: MIGRATION,
    find: "            AND NOT (contributes_to && ARRAY['local_eligibility', 'active_title']::text[]))",
    replace: "            AND true)",
    guard: GUARD,
    expect: "it forbids any contribution to local eligibility or a professional title",
  },
  {
    id: "GC-NC-CONSTRAINT-NEVER-VALIDATED",
    defect: "the constraint is added NOT VALID and never validated, so existing rows are never scanned",
    file: MIGRATION,
    find: "ALTER TABLE public.sp_credential_types\n  VALIDATE CONSTRAINT sp_credential_type_global_scope_unbound;",
    replace: "-- (validation removed)",
    guard: GUARD,
    expect: "the constraint is VALIDATEd",
  },
  {
    id: "GC-NC-TRIGGER-TRUSTS-CLIENT",
    defect: "the trigger reads the submitted row's scope instead of the definition's",
    file: MIGRATION,
    find: "  IF _t.scope_code = 'global_professional'\n     AND (NEW.jurisdiction_code IS NOT NULL OR NEW.sub_jurisdiction_code IS NOT NULL) THEN",
    replace: "  IF false\n     AND (NEW.jurisdiction_code IS NOT NULL OR NEW.sub_jurisdiction_code IS NOT NULL) THEN",
    guard: GUARD,
    expect: "and it reads the DEFINITION's scope, not the submitted row",
  },
  {
    id: "GC-NC-PR222-TRIGGER-RULE-LOST",
    defect: "the rewritten trigger drops one of PR #222's market refusals",
    file: MIGRATION,
    find: "          'SP_SUB_JURISDICTION_REQUIRED: % regulates security locally; name the emirate or region',",
    replace: "          'SP_MARKET_UNAVAILABLE: % regulates security locally; name the emirate or region',",
    guard: GUARD,
    expect: "PR #222's SP_SUB_JURISDICTION_REQUIRED survives the rewritten trigger",
  },
  {
    id: "GC-NC-OWNERSHIP-PREDICATE",
    defect: "the lifecycle table's ownership predicate is removed",
    file: MIGRATION,
    find: "  USING (holder_user_id = auth.uid())\n  WITH CHECK (",
    replace: "  USING (true)\n  WITH CHECK (",
    guard: GUARD,
    expect: "reading is scoped to the owner",
  },
  {
    id: "GC-NC-CLAIM-OWNERSHIP",
    defect: "a holder may attach a lifecycle row to somebody else's claim",
    file: MIGRATION,
    find: "    AND EXISTS (SELECT 1 FROM public.sp_claims c\n                 WHERE c.id = claim_id AND c.holder_user_id = auth.uid())",
    replace: "    AND true",
    guard: GUARD,
    expect: "including that the CLAIM is the caller's own",
  },
  {
    id: "GC-NC-ANON-READS-CATALOGUE",
    defect: "anonymous regains a grant on the issuer registry",
    file: MIGRATION,
    find: "REVOKE ALL ON public.sp_certification_issuers         FROM anon;",
    replace: "GRANT SELECT ON public.sp_certification_issuers TO anon;",
    guard: GUARD,
    expect: "and anon holds nothing on it",
  },
  {
    id: "GC-NC-HOLDER-WRITES-CATALOGUE",
    defect: "a holder may write the issuer registry",
    file: MIGRATION,
    find: "REVOKE INSERT, UPDATE, DELETE ON public.sp_certification_issuers        FROM authenticated;",
    replace: "-- (revoke removed)",
    guard: GUARD,
    expect: "and no holder may write sp_certification_issuers",
  },

  /* ── Free text is never upgraded ─────────────────────────────────── */
  {
    id: "GC-NC-FUZZY-BACKFILL",
    defect: "the backfill upgrades rows by matching their name",
    file: MIGRATION,
    find: "   AND market_pack_code IS NOT NULL\n   AND jurisdiction_code IS NOT NULL;",
    replace: "   AND name_en ILIKE '%Protection%';",
    guard: GUARD,
    expect: "keyed on an EXACT existing governed relationship",
  },
  {
    id: "GC-NC-BACKFILL-WRITES-GLOBAL",
    defect: "the backfill can declare a row international",
    file: MIGRATION,
    find: "   SET scope_code = 'national_regulated'",
    replace: "   SET scope_code = 'global_professional'",
    guard: GUARD,
    expect: "it can only ever write 'national_regulated'",
  },
  {
    id: "GC-NC-MIGRATION-REWRITES-CLAIMS",
    defect: "the migration starts updating holder claims",
    file: MIGRATION,
    find: "-- STEP 2 — REPORT what was not classified, without touching it.",
    replace:
      "UPDATE public.sp_claims SET credential_code = 'INTL_ASIS_CPP' WHERE title = 'CPP';\n-- STEP 2 — REPORT what was not classified, without touching it.",
    guard: GUARD,
    expect: "the migration never UPDATEs a holder claim",
  },

  /* ── The reviewed gaps stay gaps ─────────────────────────────────── */
  {
    id: "GC-NC-ACAMS-SUBSTITUTE-URL",
    defect: "ACAMS is given a substitute verification URL",
    file: MIGRATION,
    find: "   'none', NULL,\n   true, DATE '2026-09-12', DATE '2026-09-12')",
    replace:
      "   'exact_match_lookup', 'https://www.credly.com/organizations/acams/badges',\n   true, DATE '2026-09-12', DATE '2026-09-12')",
    guard: GUARD,
    expect: "no Credly or other third-party badge URL stands in for a verification service",
  },
  {
    id: "GC-NC-ACFE-CONCLUSIVE",
    defect: "the opt-in ACFE directory is recorded as a conclusive lookup",
    file: MIGRATION,
    find: "   'opt_in_directory', 'https://www.acfe.com/fraud-resources/find-a-cfe',",
    replace: "   'exact_match_lookup', 'https://www.acfe.com/fraud-resources/find-a-cfe',",
    guard: GUARD,
    expect: "the ACFE directory is recorded as opt-in",
  },
  {
    id: "GC-NC-ISO-AS-CREDENTIAL",
    defect: "an ISO standard is seeded as a personal certification",
    file: MIGRATION,
    find: "    ('INTL_ACAMS_CAMS',  'Certified Anti-Money Laundering Specialist (CAMS)',            'CAMS',  1410)",
    replace:
      "    ('INTL_ACAMS_CAMS',  'Certified Anti-Money Laundering Specialist (CAMS)',            'CAMS',  1410),\n    ('INTL_ISO_27001',   'ISO/IEC 27001 Lead Implementer',                              'ISO',   1510)",
    guard: GUARD,
    expect: "ISO/IEC 27001 is not seeded as a personal certification",
  },
  {
    id: "GC-NC-UNREVIEWED-CODE",
    defect: "an unreviewed certification is added to the catalogue",
    file: MIGRATION,
    find: "    ('INTL_ACFE_CFE',    'Certified Fraud Examiner (CFE)',                               'CFE',   1310),",
    replace:
      "    ('INTL_ACFE_CFE',    'Certified Fraud Examiner (CFE)',                               'CFE',   1310),\n    ('INTL_ACFE_CFCS',   'Certified Financial Crime Specialist',                         'CFCS',  1320),",
    guard: GUARD,
    expect: "and no unreviewed code was added",
  },

  /* ── The rollback contract ───────────────────────────────────────── */
  {
    id: "GC-NC-ROLLBACK-DELETES-DATA",
    defect: "the rollback deletes holder claims instead of refusing",
    file: ROLLBACK,
    find: "    RAISE EXCEPTION\n      'SP_GLOBAL_CERT_ROLLBACK_REFUSED: % claim(s) (%) and % lifecycle row(s) reference the definitions this rollback removes. Rolling back would delete holder data. Correct the defect with a FORWARD migration instead.',",
    replace:
      "    DELETE FROM public.sp_claims WHERE credential_code IN (SELECT credential_code FROM public.sp_certification_definitions);\n    RAISE NOTICE\n      'removed % claim(s) (%) and % lifecycle row(s)',",
    guard: GUARD,
    expect: "the rollback REFUSES once a holder's claim references a definition",
  },
  {
    id: "GC-NC-ROLLBACK-BY-PATTERN",
    defect: "the rollback sweeps definitions by pattern rather than by name",
    file: ROLLBACK,
    find: "DELETE FROM public.sp_credential_types WHERE code IN (\n  'INTL_ASIS_APP', 'INTL_ASIS_CPP', 'INTL_ASIS_PCI', 'INTL_ASIS_PSP',",
    replace:
      "DELETE FROM public.sp_credential_types WHERE code LIKE 'INTL%' OR code IN (\n  'INTL_ASIS_APP', 'INTL_ASIS_CPP', 'INTL_ASIS_PCI', 'INTL_ASIS_PSP',",
    guard: GUARD,
    expect: "so a future INTL_ code cannot be swept up by it",
  },

  /* ── The private credential reference ────────────────────────────── */
  {
    id: "GC-NC-PRIVATE-REFERENCE-DISCLOSED",
    defect: "the private credential reference enters a disclosure module",
    file: DISCLOSURE,
    find: "// Security Passport — controlled disclosure packages.",
    replace: "const leaked = claim.credential_reference;",
    guard: PRIVATE_GUARD,
    expect: "src/lib/security-passport/disclosure.ts names no private reference",
  },
  {
    id: "GC-NC-PRIVATE-REFERENCE-CLASSIFIED",
    defect: "the classifier gains a field for the private reference",
    file: CLASSIFIER,
    find: "  readonly issuedOn?: string | null;",
    replace: "  readonly issuedOn?: string | null;\n  readonly credentialReference?: string | null;",
    guard: PRIVATE_GUARD,
    expect: "classification.ts does not mention the private reference at all",
  },
];

runControls("global-certification", MUTATIONS);
