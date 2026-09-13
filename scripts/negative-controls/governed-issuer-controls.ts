/**
 * Negative controls for the APPLICATION half of the governed issuer.
 *
 * The database half is proved by
 * `supabase/tests/security_passport_governed_issuer_test.sql`, which is
 * itself proved to FAIL against the rolled-back schema. These controls prove
 * the other half binds: that the application resolves the governed issuer
 * server-side and discards whatever the browser sent, so a holder using the
 * product never meets the database's refusal.
 *
 * Each mutation is a way the client's string could get back into the row.
 * That is the defect that was reproduced: `credentialClaimFields` wrote
 * `claimed_issuer_name: nullIfBlank(draft.issuerName)` for every credential,
 * so INTL_ASIS_CPP could be stored as 'Fake Corporation'.
 *
 * Run: bun run negative-controls:governed-issuer
 */
import { runControls, type Mutation } from "./runner";

const MAPPER = "src/lib/security-passport/credentials.ts";
const SERVER = "src/lib/security-passport/credentials.functions.ts";

const GUARD = "passport-governed-issuer:check";

const MUTATIONS: readonly Mutation[] = [
  /* ── The client's value must never reach the row ──────────────────── */
  {
    id: "ISSUER-NC-CLIENT-VALUE-STORED",
    defect: "THE ORIGINAL DEFECT: the browser's issuerName is written for a governed certification",
    file: MAPPER,
    find: "  if (!isGlobalCertification(type)) return nullIfBlank(draft.issuerName);\n  return governedIssuerName ? nullIfBlank(governedIssuerName) : null;",
    replace: "  return nullIfBlank(draft.issuerName);",
    guard: GUARD,
    expect: "the forged name the browser sent is DISCARDED",
  },
  {
    id: "ISSUER-NC-CLIENT-VALUE-AS-FALLBACK",
    defect: "the client's issuer is kept as a fallback when the catalogue resolves nothing",
    file: MAPPER,
    find: "  return governedIssuerName ? nullIfBlank(governedIssuerName) : null;",
    replace:
      "  return governedIssuerName ? nullIfBlank(governedIssuerName) : nullIfBlank(draft.issuerName);",
    guard: GUARD,
    expect: "a global definition with no resolved issuer writes NULL",
  },
  {
    id: "ISSUER-NC-CORRECTION-KEEPS-THE-OLD-ONE",
    defect:
      "the submitted issuer wins over the governed one, so correcting a CPP to a CISSP keeps ASIS",
    file: MAPPER,
    find: "  return governedIssuerName ? nullIfBlank(governedIssuerName) : null;",
    replace: "  return nullIfBlank(draft.issuerName) ?? (governedIssuerName ?? null);",
    guard: GUARD,
    expect: "the corrected claim carries ISC2",
  },

  /* ── The rule is keyed on the DECLARED scope, and only that ───────── */
  {
    id: "ISSUER-NC-NATIONAL-GOVERNED-TOO",
    defect:
      "the governed issuer is applied to every credential, so a national appointing authority is erased",
    file: MAPPER,
    find: "  if (!isGlobalCertification(type)) return nullIfBlank(draft.issuerName);",
    replace: "  if (false) return nullIfBlank(draft.issuerName);",
    guard: GUARD,
    expect: "a Swedish credential keeps the holder's appointing authority",
  },

  /* ── The server must do the resolving ─────────────────────────────── */
  {
    id: "ISSUER-NC-SERVER-RESOLUTION-REMOVED",
    defect: "saveCredential stops reading the catalogue and maps with no governed issuer",
    file: SERVER,
    find: "    const fields = credentialClaimFields(draft, type, mode, governedIssuerName);",
    replace: "    const fields = credentialClaimFields(draft, type, mode);",
    guard: GUARD,
    expect: "and hands the resolved name to the mapper",
  },
  {
    id: "ISSUER-NC-READ-FAILURE-FALLS-BACK",
    defect: "a failed catalogue read is swallowed, so the write proceeds without a governed issuer",
    file: SERVER,
    find: "      if (issuerError) throw new Error(issuerError.message);",
    replace: "      if (issuerError) governedIssuerName = null;",
    guard: GUARD,
    expect: "a failed catalogue read throws rather than falling back",
  },
  {
    id: "ISSUER-NC-MISSING-DEFINITION-TOLERATED",
    defect: "a global definition with no issuer row is written silently instead of refused",
    file: SERVER,
    find: '      if (!definition) throw new Error("SP_GLOBAL_CERTIFICATION_ISSUER_UNKNOWN");',
    replace: "      if (!definition) governedIssuerName = null;",
    guard: GUARD,
    expect: "a global definition with no issuer row is REFUSED by name",
  },
];

runControls("governed-issuer", MUTATIONS);
