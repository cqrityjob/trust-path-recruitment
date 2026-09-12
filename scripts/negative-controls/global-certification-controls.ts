/**
 * Negative controls for the governed international-certification SCHEMA.
 *
 * Every mutation below is a defect this release exists to make impossible. The
 * harness plants it, runs the guard, and REQUIRES the guard to fail with a
 * named diagnostic. A guard that keeps printing "ok" with the defect applied
 * is a dead assertion, and this is the only thing that makes that visible.
 *
 * ── SCHEMA RELEASE ONLY ────────────────────────────────────────────────
 *
 * Every file mutated here is SQL, or the generated types. The controls for the
 * write mapping, the scope predicates and the classifier belong to the
 * application release, with the guard groups that check them.
 *
 * The set is chosen from the load-bearing invariants rather than from what is
 * easy to mutate: the ownership predicate, the global-scope constraint, the
 * no-eligibility rule, the no-fuzzy-upgrade rule, the grant boundaries and the
 * rollback contract. Each one, removed, must break a focused check.
 *
 * Run: bun run negative-controls:global-certification
 */
import { runControls, type Mutation } from "./runner";

const MIGRATION = "supabase/migrations/20261111090000_sp_global_professional_certifications.sql";
const ROLLBACK =
  "supabase/rollback/20261111090000_sp_global_professional_certifications_rollback.sql";

const GUARD = "passport-global-certification:check";

const MUTATIONS: readonly Mutation[] = [
  /* ── The global scope is unbound from every territory ────────────── */
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
    defect:
      "the constraint is added NOT VALID and never validated, so existing rows are never scanned",
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
    replace:
      "  IF false\n     AND (NEW.jurisdiction_code IS NOT NULL OR NEW.sub_jurisdiction_code IS NOT NULL) THEN",
    guard: GUARD,
    expect: "and it reads the DEFINITION's scope, not the submitted row",
  },
  {
    id: "GC-NC-PR222-TRIGGER-RULE-LOST",
    defect: "the rewritten trigger drops one of PR #222's market refusals",
    file: MIGRATION,
    find: "          'SP_SUB_JURISDICTION_REQUIRED: % regulates security locally; name the emirate or region',",
    replace:
      "          'SP_MARKET_UNAVAILABLE: % regulates security locally; name the emirate or region',",
    guard: GUARD,
    expect: "PR #222's SP_SUB_JURISDICTION_REQUIRED survives the rewritten trigger",
  },

  /* ── Ownership and least privilege ───────────────────────────────── */
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
  {
    id: "GC-NC-WIDE-GRANT-SURVIVES",
    defect: "a new table keeps the platform default's TRUNCATE, REFERENCES and TRIGGER",
    file: MIGRATION,
    find: "REVOKE ALL ON public.sp_certification_issuers         FROM PUBLIC, anon, authenticated;",
    replace:
      "REVOKE INSERT, UPDATE, DELETE ON public.sp_certification_issuers FROM PUBLIC, anon, authenticated;",
    guard: GUARD,
    expect: "and everything is revoked before anything is granted on sp_certification_issuers",
  },
  {
    id: "GC-NC-HISTORY-ERASABLE",
    defect: "a holder may DELETE their own lifecycle history",
    file: MIGRATION,
    find: "GRANT SELECT, INSERT, UPDATE ON public.sp_claim_certification_lifecycle TO authenticated;",
    replace:
      "GRANT SELECT, INSERT, UPDATE, DELETE ON public.sp_claim_certification_lifecycle TO authenticated;",
    guard: GUARD,
    expect: "no application role is GRANTed DELETE on the lifecycle table",
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
  {
    id: "GC-NC-TRUNCATED-MARK",
    defect: "a five-character mark is truncated to fit the old plate bound",
    file: MIGRATION,
    find: "'Certified Information Systems Security Professional (CISSP)',  'CISSP', 1140)",
    replace: "'Certified Information Systems Security Professional (CISSP)',  'CISS',  1140)",
    guard: GUARD,
    expect: "CISSP is seeded whole, five characters",
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

  /* ── The schema release stays schema-only ────────────────────────── */
  //
  // The property that makes this branch safe to merge on its own: the running
  // application must not reference anything the migration introduces. If it
  // did, Lovable would rebuild from main against a database that has never
  // heard of it — the 2026-08-25 outage.
  {
    id: "GC-NC-APPLICATION-DEPENDS-ON-SCHEMA",
    defect: "application code starts reading a column this migration has not applied yet",
    file: "src/lib/security-passport/credentials.ts",
    find: "export const CREDENTIAL_CODE_MAX_LENGTH = 48;",
    replace: "export const CREDENTIAL_CODE_MAX_LENGTH = 48;\nexport const PENDING = 'scope_code';",
    guard: GUARD,
    expect: "no application file references scope_code",
  },
  {
    id: "GC-NC-TYPES-REGENERATED-EARLY",
    defect: "the generated Supabase types claim a table that is not hosted yet",
    file: "src/integrations/supabase/types.ts",
    find: "export type Json =",
    replace: "// sp_certification_definitions\nexport type Json =",
    guard: GUARD,
    expect: "the generated Supabase types do NOT yet describe sp_certification_definitions",
  },
];

runControls("global-certification", MUTATIONS);
