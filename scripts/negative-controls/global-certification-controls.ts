/**
 * Negative controls for the governed international-certification SCHEMA.
 *
 * Every mutation below is a defect this release exists to make impossible. The
 * harness plants it, runs the guard, and REQUIRES the guard to fail with a
 * named diagnostic. A guard that keeps printing "ok" with the defect applied
 * is a dead assertion, and this is the only thing that makes that visible.
 *
 * ── SCHEMA AND APPLICATION ─────────────────────────────────────────────
 *
 * The first set mutates the migration and the rollback SQL, and proves the
 * schema invariants still bind. The second set — added with the Phase 1B
 * application release — mutates the runtime, the generated types and the
 * release bookkeeping, and proves the INVERTED GROUP 4 binds: that the schema
 * is recorded applied, that the escape hatch is gone, that the catalogue is
 * read through its governed relationships, that a failure is never an empty
 * catalogue, and that no direct lifecycle write exists.
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
    defect: "the lifecycle table's ownership predicate is removed, so every holder reads every row",
    file: MIGRATION,
    find: "  FOR SELECT TO authenticated\n  USING (holder_user_id = auth.uid());",
    replace: "  FOR SELECT TO authenticated\n  USING (true);",
    guard: GUARD,
    expect: "reading is scoped to the owner",
  },
  {
    id: "GC-NC-CLAIM-OWNERSHIP",
    defect:
      "the write path stops proving the claim is the caller's own, so a holder writes lifecycle data onto somebody else's credential",
    file: MIGRATION,
    find: "   WHERE c.id = _claim_id AND c.holder_user_id = _uid;",
    replace: "   WHERE c.id = _claim_id;",
    guard: GUARD,
    expect: "the claim must be the caller's own",
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
    find: "GRANT SELECT ON public.sp_claim_certification_lifecycle TO authenticated;",
    replace: "GRANT SELECT, DELETE ON public.sp_claim_certification_lifecycle TO authenticated;",
    guard: GUARD,
    expect: "no application role is GRANTed DELETE on the lifecycle table",
  },

  /* ── THE TRUST BOUNDARY INDEPENDENT REVIEW FOUND ─────────────────────
   *
   * `status_source` says WHO established a holder's standing. Every control
   * below restores one piece of the design that let a holder answer that
   * question about themselves, and each must break a named assertion. They
   * are the most important controls in this file: the defect they model
   * passed a full green CI, because nothing tried the attack that worked. */
  {
    id: "GC-NC-DIRECT-WRITE-GRANT",
    defect: "the holder gets whole-row INSERT and UPDATE on the lifecycle table back",
    file: MIGRATION,
    find: "GRANT SELECT ON public.sp_claim_certification_lifecycle TO authenticated;",
    replace:
      "GRANT SELECT, INSERT, UPDATE ON public.sp_claim_certification_lifecycle TO authenticated;",
    guard: GUARD,
    expect: "and no application role is GRANTed INSERT, UPDATE or DELETE on it",
  },
  {
    id: "GC-NC-WRITE-REVOKE-NARROWED",
    defect: "only DELETE is revoked by name, so the platform default leaves INSERT and UPDATE",
    file: MIGRATION,
    find: "REVOKE INSERT, UPDATE, DELETE ON public.sp_claim_certification_lifecycle FROM anon, authenticated;",
    replace: "REVOKE DELETE ON public.sp_claim_certification_lifecycle FROM anon, authenticated;",
    guard: GUARD,
    expect: "with all three revoked by name, because the hosted default grants them",
  },
  {
    id: "GC-NC-POLICY-WRITABLE",
    defect: "the owner policy becomes FOR ALL again, so ownership is treated as authority",
    file: MIGRATION,
    find: "  FOR SELECT TO authenticated\n  USING (holder_user_id = auth.uid());",
    replace:
      "  FOR ALL TO authenticated\n  USING (holder_user_id = auth.uid())\n  WITH CHECK (holder_user_id = auth.uid());",
    guard: GUARD,
    expect: "and the policy is SELECT-only: ownership is not authority over status_source",
  },
  {
    id: "GC-NC-SOURCE-PARAMETERISED",
    defect: "the write path accepts status_source as a parameter",
    file: MIGRATION,
    find: "  _status_as_of            date DEFAULT NULL)",
    replace:
      "  _status_as_of            date DEFAULT NULL,\n  _status_source           text DEFAULT 'holder_declared')",
    guard: GUARD,
    expect: "status_source is not a parameter of the write path",
  },
  {
    id: "GC-NC-SOURCE-NOT-HARDCODED",
    defect: "the correction path stops restating holder_declared, so a forged source survives it",
    file: MIGRATION,
    find: "    status_source               = 'holder_declared',",
    replace: "    -- (source left as it was)",
    guard: GUARD,
    expect: "and the correction RESTATES it in the SET list, not merely in the predicate",
  },
  {
    id: "GC-NC-ISSUER-FIELDS-WRITABLE",
    defect: "the write path stops forcing the issuer-attribution fields to NULL on correction",
    file: MIGRATION,
    find: "    issuer_confirmed_at         = NULL,\n    issuer_confirmed_source_url = NULL,",
    replace: "",
    guard: GUARD,
    expect: "both issuer-attribution fields are forced to NULL on correction",
  },
  {
    id: "GC-NC-CREATED-AT-REWRITTEN",
    defect: "a correction rewrites created_at, so a holder can backdate their own statement",
    file: MIGRATION,
    find: "    updated_at                  = now()\n  WHERE",
    replace:
      "    created_at                  = now(),\n    updated_at                  = now()\n  WHERE",
    guard: GUARD,
    expect: "created_at is never rewritten by a correction",
  },
  {
    id: "GC-NC-WRITE-PATH-UNPINNED",
    defect: "the SECURITY DEFINER write path loses its fixed search_path",
    file: MIGRATION,
    find: "SET search_path = public, pg_temp\nAS $fn$\nDECLARE\n  _uid     uuid := auth.uid();",
    replace: "AS $fn$\nDECLARE\n  _uid     uuid := auth.uid();",
    guard: GUARD,
    expect: "with a fixed search_path, or SECURITY DEFINER is a privilege escalation",
  },
  {
    id: "GC-NC-WRITE-PATH-ANON",
    defect: "the write path is left executable by PUBLIC and anon",
    file: MIGRATION,
    find: "REVOKE ALL ON FUNCTION\n  public.sp_certification_lifecycle_declare(uuid, date, date, text, text, date)\n  FROM PUBLIC, anon;",
    replace: "-- (revoke removed)",
    guard: GUARD,
    expect: "revoked from PUBLIC and anon",
  },
  {
    id: "GC-NC-ENUMERATION-ORACLE",
    defect:
      "a claim that belongs to somebody else is refused differently from one that does not exist, so the write path answers questions about other holders",
    file: MIGRATION,
    find: "      'SP_CERTIFICATION_LIFECYCLE_CLAIM_NOT_YOURS: no credential of yours has that id'",
    replace:
      "      'SP_CERTIFICATION_LIFECYCLE_CLAIM_OTHER_HOLDER: that claim belongs to somebody else'",
    guard: GUARD,
    expect: "and one refusal covers both 'not yours' and 'no such claim', so it cannot enumerate",
  },
  {
    id: "GC-NC-ISSUER-ATTRIBUTION-EQUIVALENCE",
    defect:
      "the issuer-attribution constraint goes back to the equivalence, which let a holder_declared row carry exactly one issuer field",
    file: MIGRATION,
    find:
      "    CHECK (CASE WHEN status_source = 'issuer_confirmed'\n" +
      "                THEN issuer_confirmed_at IS NOT NULL\n" +
      "                 AND issuer_confirmed_source_url IS NOT NULL\n" +
      "                ELSE issuer_confirmed_at IS NULL\n" +
      "                 AND issuer_confirmed_source_url IS NULL\n" +
      "           END),",
    replace:
      "    CHECK ((status_source = 'issuer_confirmed')\n" +
      "           = (issuer_confirmed_at IS NOT NULL\n" +
      "              AND issuer_confirmed_source_url IS NOT NULL)),",
    guard: GUARD,
    expect: "it is written as a CASE, not as an equivalence",
  },
  {
    id: "GC-NC-ATTACK-ASSERTION-DELETED",
    defect: "the forged-issuer-confirmation attack assertion is deleted from the database suite",
    file: "supabase/tests/security_passport_global_certification_test.sql",
    find: "    '8b.4 nor forge a COMPLETE issuer confirmation with a time and an https source');",
    replace: "    '8b.4 (removed)');",
    guard: GUARD,
    expect: "the suite proves: 8b.4 nor forge a COMPLETE issuer confirmation",
  },
  {
    id: "GC-NC-DIRECT-WRITE-ASSERTION-DELETED",
    defect: "the direct-INSERT attack assertion is deleted from the database suite",
    file: "supabase/tests/security_passport_global_certification_test.sql",
    find: "    '8b.1 a holder cannot INSERT a lifecycle row directly, even their own');",
    replace: "    '8b.1 (removed)');",
    guard: GUARD,
    expect: "the suite proves: 8b.1 a holder cannot INSERT a lifecycle row directly",
  },
  {
    id: "GC-NC-PROVENANCE-OVERWRITE",
    defect:
      "the conflict update loses its holder_declared predicate, so a holder's declaration overwrites a reviewer- or issuer-established standing",
    file: MIGRATION,
    find: "    updated_at                  = now()\n  WHERE l.status_source = 'holder_declared'\n  RETURNING l.claim_id INTO _written;",
    replace: "    updated_at                  = now()\n  RETURNING l.claim_id INTO _written;",
    guard: GUARD,
    expect:
      "and the conflict update is permitted ONLY while the existing row is still holder_declared",
  },
  {
    id: "GC-NC-PROTECTION-FAILS-OPEN",
    defect:
      "a refused correction returns quietly instead of raising, so the caller cannot tell that nothing was written",
    file: MIGRATION,
    find: "  IF _written IS NULL THEN",
    replace: "  IF false THEN",
    guard: GUARD,
    expect: "and a refused correction fails CLOSED with one stable code, never as a silent no-op",
  },
  {
    id: "GC-NC-PROVENANCE-PRE-CHECK",
    defect:
      "the predicate moves out of the writing statement into a pre-check, which a concurrent reviewer's write can win between",
    file: MIGRATION,
    find: "  INSERT INTO public.sp_claim_certification_lifecycle AS l (",
    replace:
      "  PERFORM 1 FROM public.sp_claim_certification_lifecycle\n   WHERE claim_id = _claim_id AND status_source = 'holder_declared';\n\n  INSERT INTO public.sp_claim_certification_lifecycle AS l (",
    guard: GUARD,
    expect:
      "and nothing reads status_source before the write, which would be a race rather than a guard",
  },
  {
    id: "GC-NC-REVIEWED-PRESERVATION-ASSERTION-DELETED",
    defect:
      "the assertion that a document-reviewed standing survives a holder declaration is deleted from the database suite",
    file: "supabase/tests/security_passport_global_certification_test.sql",
    find: "    '8c.2 the holder cannot declare over it (got ' || _r || ')');",
    replace: "    '8c.2 (removed)');",
    guard: GUARD,
    expect: "the suite proves: 8c.2 the holder cannot declare over it",
  },
  {
    id: "GC-NC-ISSUER-PRESERVATION-ASSERTION-DELETED",
    defect:
      "the assertion that an issuer-confirmed revocation survives a holder declaration is deleted from the database suite",
    file: "supabase/tests/security_passport_global_certification_test.sql",
    find: "    '8c.6 the holder cannot declare themselves active over an issuer revocation (got ' || _r || ')');",
    replace: "    '8c.6 (removed)');",
    guard: GUARD,
    expect:
      "the suite proves: 8c.6 the holder cannot declare themselves active over an issuer revocation",
  },
  {
    id: "GC-NC-ROLLBACK-KEEPS-WRITE-PATH",
    defect:
      "the rollback drops the lifecycle table and leaves its SECURITY DEFINER writer behind, executable by every signed-in holder",
    file: ROLLBACK,
    find: "DROP FUNCTION IF EXISTS\n  public.sp_certification_lifecycle_declare(uuid, date, date, text, text, date);",
    replace: "-- (write path left in place)",
    guard: GUARD,
    expect: "the rollback drops the holder write path, by its exact signature",
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

  /* ── The application release rests on an APPLIED schema ──────────── */
  //
  // Through the schema release the property was that NOTHING under src/
  // referenced these objects. Phase 1B introduces those dependencies on
  // purpose, so the controls below prove the INVERTED guard binds: the
  // release-state classification, the generated types, the removal of the
  // escape hatch, the governed catalogue, the territory rules, the trust
  // boundary and the obsolete migration identity.
  {
    id: "GC-NC-SCHEMA-NOT-APPLIED",
    defect: "the application release proceeds while the schema is not recorded applied",
    file: "supabase/release-state.json",
    find: '"file": "20261111090000_sp_global_professional_certifications.sql",\n      "hostedState": "applied",',
    replace:
      '"file": "20261111090000_sp_global_professional_certifications.sql",\n      "hostedState": "pending",',
    guard: GUARD,
    expect: "and classifies it as applied on the hosted database",
  },
  {
    id: "GC-NC-TYPES-MISSING-OBJECT",
    defect: "the runtime names a table the generated types do not describe",
    file: "src/integrations/supabase/types.ts",
    find: "      sp_certification_definitions: {",
    replace: "      sp_certification_definitions_RENAMED: {",
    guard: GUARD,
    expect: "the generated Supabase types describe sp_certification_definitions",
  },
  {
    id: "GC-NC-PENDING-SCHEMA-RETURNS",
    defect: "an untyped escape hatch is reintroduced now that the schema is applied",
    file: "src/lib/security-passport/credentials.functions.ts",
    find: "const TAXONOMY_COLUMNS =",
    replace: "const RESURRECTED = fromPendingSchema;\nconst TAXONOMY_COLUMNS =",
    guard: GUARD,
    expect: "no application file uses fromPendingSchema",
  },
  {
    id: "GC-NC-TAXONOMY-SCOPE-DROPPED",
    defect: "the taxonomy read stops selecting the declared scope, so nothing is ever global",
    file: "src/lib/security-passport/credentials.functions.ts",
    find: 'jurisdiction_code, sub_jurisdiction_code, scope_code";',
    replace: 'jurisdiction_code, sub_jurisdiction_code";',
    guard: GUARD,
    expect: "every taxonomy read selects the declared scope",
  },
  {
    id: "GC-NC-CATALOGUE-EMBED-AMBIGUOUS",
    defect:
      "the taxonomy embed loses its foreign-key hint, so PostgREST refuses the whole catalogue read",
    file: "src/lib/security-passport/credentials.functions.ts",
    find: "         sp_credential_types!sp_certification_definitions_credential_code_fkey!inner (",
    replace: "         sp_credential_types!inner (",
    guard: GUARD,
    expect: "and its taxonomy embed is hinted with the credential_code foreign key",
  },
  {
    id: "GC-NC-CATALOGUE-ERROR-BECOMES-EMPTY",
    defect: "a failed catalogue read is presented to the holder as an empty catalogue",
    file: "src/lib/security-passport/credentials.functions.ts",
    find: '      .is("retired_on", null)\n      .order("credential_code", { ascending: true });\n\n    if (error) throw new Error(error.message);',
    replace:
      '      .is("retired_on", null)\n      .order("credential_code", { ascending: true });\n\n    if (error) return [];',
    guard: GUARD,
    expect: "it throws on every read error",
  },
  {
    id: "GC-NC-GLOBAL-TERRITORY-NOT-CLEARED",
    defect:
      "a global certification stops clearing the sub-jurisdiction, so a corrected Dubai card keeps its emirate",
    file: "src/lib/security-passport/certification-scope.ts",
    find: "  jurisdiction_code: null,\n  sub_jurisdiction_code: null,\n} as const;",
    replace: "  jurisdiction_code: null,\n} as const;",
    guard: GUARD,
    expect: "the global territory writes BOTH jurisdiction columns as null",
  },
  {
    id: "GC-NC-NATIONAL-BEHAVIOUR-CHANGED",
    defect: "a national credential stops taking its jurisdiction from the governed definition",
    file: "src/lib/security-passport/credentials.ts",
    find: "          jurisdiction_code: type.jurisdictionCode ?? nullIfBlank(draft.jurisdictionCode),",
    replace: "          jurisdiction_code: nullIfBlank(draft.jurisdictionCode),",
    guard: GUARD,
    expect: "and a national credential still takes its jurisdiction from the definition",
  },
  {
    id: "GC-NC-UNDECLARED-BECOMES-NATIONAL",
    defect: "an undeclared scope collapses into national, so three states become two",
    file: "src/lib/security-passport/certification-scope.ts",
    find: "  return definition?.scopeCode === NATIONAL_REGULATED_SCOPE;",
    replace: "  return !isGlobalCertification(definition);",
    guard: GUARD,
    expect: "national is its own declared state, not the negation of global",
  },
  {
    id: "GC-NC-CLASSIFIER-TITLE-INFERENCE",
    defect: "the classifier starts upgrading a free-text claim by matching its title",
    file: "src/lib/security-passport/classification.ts",
    find: '    return { claim, bucket: "international_certification", groupKey: null };',
    replace:
      '    return { claim, bucket: "international_certification", groupKey: null };\n  }\n  if (/CPP|CISSP/i.test(String((claim as { title?: string }).title ?? ""))) {\n    return { claim, bucket: "international_certification", groupKey: null };',
    guard: GUARD,
    expect: "the classifier reads no title",
  },
  {
    id: "GC-NC-DIRECT-LIFECYCLE-WRITE",
    defect: "a holder lifecycle row is written directly, bypassing the canonical RPC",
    file: "src/lib/security-passport/credentials.functions.ts",
    find: "const TAXONOMY_COLUMNS =",
    replace:
      'async function declareStanding(c: { from: (t: string) => { insert: (v: unknown) => unknown } }) {\n  return c.from("sp_claim_certification_lifecycle").insert({ status_source: "holder_declared" });\n}\nconst TAXONOMY_COLUMNS =',
    guard: GUARD,
    expect: "no application file performs a direct .insert() on sp_claim_certification_lifecycle",
  },
  {
    id: "GC-NC-OBSOLETE-MIGRATION-IDENTITY",
    defect: "application code still names the obsolete 20261110090000 certification migration",
    file: "src/lib/security-passport/certification-scope.ts",
    find: "export const GLOBAL_PROFESSIONAL_SCOPE",
    replace:
      "// Introduced by 20261110090000_sp_global_professional_certifications.\nexport const GLOBAL_PROFESSIONAL_SCOPE",
    guard: GUARD,
    expect: "no application file names the obsolete migration identity",
  },
];

runControls("global-certification", MUTATIONS);
