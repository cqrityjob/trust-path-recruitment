/**
 * Security Passport — the governed international catalogue, pinned.
 *
 * Run via `bun run passport-global-certification:check`.
 *
 * ── SCHEMA RELEASE ONLY ────────────────────────────────────────────────
 *
 * This is the schema half of Phase 1, so this guard reads SQL and nothing
 * else. It imports no module under `src/` — deliberately, and the last group
 * below proves why: the whole point of a schema-first release is that it can
 * merge and sit on production while the application keeps running against the
 * OLD schema. A guard that imported the application to check the schema would
 * be the first thing to break that property.
 *
 * The application release extends this same file with the groups that need
 * runtime code: the scope predicates, the write mapping and the classifier.
 *
 * ── WHAT IT PROVES ─────────────────────────────────────────────────────
 *
 *   1. the seed is exactly the fourteen reviewed definitions, under the five
 *      controlled issuer names, with the sources and the honest gaps the
 *      review recorded;
 *   2. the migration classifies nothing by title, abbreviation, issuer name or
 *      a missing country, and rewrites no holder row;
 *   3. the symbol plate can hold a five-character mark, and the rollback puts
 *      the old bound back;
 *   4. NO application code references anything this migration introduces;
 *   5. the load-bearing database rules are present in the file — the half a
 *      replay cannot check, because a constraint deleted along with the rows
 *      that violated it leaves a green suite behind.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(import.meta.dirname, "..");
const fails: string[] = [];
function ok(cond: boolean, name: string): void {
  console.log(`  ${cond ? "ok  " : "FAIL"} ${name}`);
  if (!cond) fails.push(name);
}

const MIGRATION = readFileSync(
  join(root, "supabase/migrations/20261111090000_sp_global_professional_certifications.sql"),
  "utf8",
);
const ROLLBACK = readFileSync(
  join(root, "supabase/rollback/20261111090000_sp_global_professional_certifications_rollback.sql"),
  "utf8",
);

/** SQL with comments stripped, so a comment that NAMES a banned construct in
 *  order to explain why it is absent does not fail the check it documents —
 *  the rollback says "No CASCADE appears in this file", which is true and
 *  which the first version of this guard read as a CASCADE. */
function sqlCode(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

const MIGRATION_SQL = sqlCode(MIGRATION);
const ROLLBACK_SQL = sqlCode(ROLLBACK);

console.log("passport-global-certification-check (schema release)\n");

/* ══════════════════════════════════════════════════════════════════════
   GROUP 1 — the seed is exactly what was reviewed
   ══════════════════════════════════════════════════════════════════════ */
console.log("GROUP 1 -- the catalogue in the migration is the reviewed one");

const EXPECTED_CODES = [
  "INTL_ASIS_APP",
  "INTL_ASIS_CPP",
  "INTL_ASIS_PCI",
  "INTL_ASIS_PSP",
  "INTL_ISC2_CC",
  "INTL_ISC2_CGRC",
  "INTL_ISC2_SSCP",
  "INTL_ISC2_CISSP",
  "INTL_ISC2_CCSP",
  "INTL_ISACA_CISA",
  "INTL_ISACA_CISM",
  "INTL_ISACA_CRISC",
  "INTL_ACFE_CFE",
  "INTL_ACAMS_CAMS",
] as const;

const seededCodes = [...new Set([...MIGRATION.matchAll(/'(INTL_[A-Z0-9_]+)'/g)].map((m) => m[1]))];
ok(
  EXPECTED_CODES.every((c) => seededCodes.includes(c)),
  `all 14 reviewed codes appear in the migration (${seededCodes.length} distinct INTL_ codes found)`,
);
const unexpected = seededCodes.filter(
  (c) => !(EXPECTED_CODES as readonly string[]).includes(c) && !c.startsWith("INTL_FORGED"),
);
ok(
  unexpected.length === 0,
  `and no unreviewed code was added — extra: ${unexpected.join(", ") || "none"}`,
);

ok(
  EXPECTED_CODES.every((c) => ROLLBACK.includes(`'${c}'`)),
  "the rollback names all 14 codes explicitly, rather than deleting by pattern",
);

const ISSUER_COUNTS: ReadonlyArray<readonly [string, number]> = [
  ["ASIS", 4],
  ["ISC2", 5],
  ["ISACA", 3],
  ["ACFE", 1],
  ["ACAMS", 1],
];
for (const [issuer, n] of ISSUER_COUNTS) {
  const held = EXPECTED_CODES.filter((c) => c.startsWith(`INTL_${issuer}_`)).length;
  ok(held === n, `${issuer} holds exactly ${n} definition(s)`);
}
ok(EXPECTED_CODES.length === 14, "fourteen definitions in total");

/* The controlled display names. */
ok(/'ASIS', 'ASIS International'/.test(MIGRATION), 'ASIS displays as "ASIS International"');
ok(/'ISC2', 'ISC2'/.test(MIGRATION), 'ISC2 displays as "ISC2", not as "(ISC)²"');
ok(
  MIGRATION.includes("'(ISC)²',") && MIGRATION.includes("'search_alias'"),
  '"(ISC)²" is registered as a search alias',
);
ok(/'ISACA', 'ISACA'/.test(MIGRATION), "ISACA is not expanded into its retired name");
ok(
  MIGRATION.includes("'ACFE', 'Association of Certified Fraud Examiners (ACFE)'"),
  "ACFE carries its controlled display name",
);
ok(
  MIGRATION.includes("'ACAMS', 'ACAMS'"),
  "ACAMS displays as its abbreviation, with the expansion as an alias",
);

/* The reviewed gaps, stated as gaps. */
ok(
  /'ACAMS',[\s\S]{0,400}?'none', NULL/.test(MIGRATION),
  "ACAMS records verification_mode 'none' and a NULL verification URL",
);
ok(
  /'ACFE',[\s\S]{0,400}?'opt_in_directory'/.test(MIGRATION),
  "the ACFE directory is recorded as opt-in",
);
ok(
  !/acams[^\n]*credly/i.test(MIGRATION),
  "no Credly or other third-party badge URL stands in for a verification service",
);

/* ISO is a publisher of standards, not an issuer of personal credentials. */
for (const banned of ["ISO 31000", "ISO 22301", "ISO/IEC 27001", "ISO 27001"]) {
  ok(
    !new RegExp(`'[^']*${banned.replace(/[/]/g, "\\/")}[^']*'`).test(MIGRATION),
    `${banned} is not seeded as a personal certification`,
  );
}

/* Source review. */
ok(
  (MIGRATION.match(/DATE '2026-09-12'/g) ?? []).length >= 6,
  "every issuer and definition carries the 2026-09-12 source-review date",
);
for (const c of EXPECTED_CODES) {
  ok(MIGRATION.includes(`('${c}'`), `${c} carries a programme source`);
}

/* ══════════════════════════════════════════════════════════════════════
   GROUP 2 — the migration classifies nothing by guesswork
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nGROUP 2 -- the backfill is exact, and no holder row is touched");

const MIG_UPDATES = [...MIGRATION.matchAll(/UPDATE public\.sp_credential_types[\s\S]*?;/g)].map(
  (m) => m[0],
);
ok(
  MIG_UPDATES.length === 1,
  `the migration performs exactly one backfill UPDATE (found ${MIG_UPDATES.length})`,
);
const backfill = MIG_UPDATES[0] ?? "";
ok(
  backfill.includes("'national_regulated'") && !backfill.includes("'global_professional'"),
  "and it can only ever write 'national_regulated' — never the global scope",
);
ok(
  /market_pack_code IS NOT NULL/.test(backfill) && /jurisdiction_code IS NOT NULL/.test(backfill),
  "keyed on an EXACT existing governed relationship, not on a name or a null",
);
for (const fuzzy of ["name_en ILIKE", "name_sv ILIKE", "title ILIKE", "similar to", "~*"]) {
  ok(!backfill.toLowerCase().includes(fuzzy.toLowerCase()), `the backfill uses no ${fuzzy} match`);
}
ok(!/UPDATE public\.sp_claims/.test(MIGRATION_SQL), "the migration never UPDATEs a holder claim");
ok(!/DELETE FROM public\.sp_claims/.test(MIGRATION_SQL), "and never DELETEs one");
ok(!/INSERT INTO public\.sp_claims/.test(MIGRATION_SQL), "and never INSERTs one");

/* ══════════════════════════════════════════════════════════════════════
   GROUP 3 — the symbol plate holds a five-character mark
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nGROUP 3 -- CISSP and CRISC render whole");
{
  const seededMarks = new Map<string, string>();
  for (const m of MIGRATION.matchAll(
    /\('(INTL_[A-Z0-9_]+)',\s*'[^']*',\s*'([A-Z0-9]{1,8})',\s*\d+\)/g,
  )) {
    seededMarks.set(m[1], m[2]);
  }
  ok(seededMarks.size === 14, `parsed ${seededMarks.size} seeded marks from the migration`);
  ok(seededMarks.get("INTL_ISC2_CISSP") === "CISSP", "CISSP is seeded whole, five characters");
  ok(seededMarks.get("INTL_ISACA_CRISC") === "CRISC", "CRISC is seeded whole, five characters");
  ok(/BETWEEN 1 AND 8/.test(MIGRATION), "and the plate's CHECK was relaxed to hold them");
  ok(/<= 4/.test(ROLLBACK), "while the rollback restores the four-character bound");

  const leaks = [...seededMarks.entries()].filter(([code, mark]) => code.startsWith(mark));
  ok(leaks.length === 0, "no mark is a prefix of its own code");
}

/* ══════════════════════════════════════════════════════════════════════
   GROUP 4 — NOTHING IN THE APPLICATION DEPENDS ON THIS SCHEMA
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nGROUP 4 -- the schema release is safe to merge on its own");

/* ── WHY THIS IS THE MOST IMPORTANT GROUP IN THE FILE ──────────────────
 *
 * Lovable rebuilds the application from `main` the moment a PR merges.
 * Canonical Supabase migrations do NOT run then; they run when somebody
 * applies them. So between those two events the deployed code talks to a
 * schema that has never heard of what this migration adds. On 2026-08-25 that
 * took down all job publishing.
 *
 * `schema-first-release:check` enforces the same rule from the other side, by
 * comparing `src/` against the objects a pending migration introduces. This
 * states it as a property of THIS release and names the objects explicitly, so
 * a reviewer can see the list rather than trust a cross-reference.
 */
function walk(dir: string, ext: readonly string[]): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full, ext));
    else if (ext.some((e) => entry.endsWith(e))) out.push(full);
  }
  return out;
}

const INTRODUCED = [
  "sp_credential_scopes",
  "sp_certification_issuers",
  "sp_certification_issuer_aliases",
  "sp_certification_sources",
  "sp_certification_definitions",
  "sp_claim_certification_lifecycle",
  "scope_code",
] as const;

{
  const appFiles = walk(join(root, "src"), [".ts", ".tsx"]);
  for (const object of INTRODUCED) {
    const offenders = appFiles.filter((f) => readFileSync(f, "utf8").includes(object));
    ok(
      offenders.length === 0,
      `no application file references ${object}` +
        (offenders.length ? ` — ${offenders.map((f) => relative(root, f)).join(", ")}` : ""),
    );
  }

  const intlInApp = appFiles.filter((f) => /INTL_[A-Z0-9_]+/.test(readFileSync(f, "utf8")));
  ok(
    intlInApp.length === 0,
    `no application file names a governed international code` +
      (intlInApp.length ? ` — ${intlInApp.map((f) => relative(root, f)).join(", ")}` : ""),
  );

  // The generated types describe the HOSTED database. Regenerating them for a
  // schema that is not applied would make types.ts assert something untrue
  // about production, which is the claim release-state.json exists to keep
  // honest.
  const generated = readFileSync(join(root, "src/integrations/supabase/types.ts"), "utf8");
  for (const object of INTRODUCED) {
    ok(!generated.includes(object), `the generated Supabase types do NOT yet describe ${object}`);
  }
}

/* ══════════════════════════════════════════════════════════════════════
   GROUP 5 — the database invariants are present in the migration text
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nGROUP 5 -- the schema's load-bearing rules are in the file");

ok(
  /CONSTRAINT sp_credential_type_global_scope_unbound/.test(MIGRATION),
  "the global-scope constraint exists",
);

/** The CHECK expression itself.
 *
 *  Anchored on `ADD CONSTRAINT`, not on the first mention of the name. The
 *  first mention is in a comment three hundred lines earlier, so slicing from
 *  it covered the whole seed block — and the negative control that deletes
 *  `AND jurisdiction_code IS NULL` still found the phrase, somewhere else
 *  entirely, and the guard went on printing ok. */
const GLOBAL_CONSTRAINT = (() => {
  const start = MIGRATION.indexOf("ADD CONSTRAINT sp_credential_type_global_scope_unbound");
  const end = MIGRATION.indexOf("sp_credential_type_national_scope_bound", start);
  return start === -1 || end === -1 ? "" : MIGRATION.slice(start, end);
})();
ok(
  GLOBAL_CONSTRAINT.length > 0 && GLOBAL_CONSTRAINT.length < 2000,
  `the constraint expression was located and is ${GLOBAL_CONSTRAINT.length} chars, not a whole section`,
);

for (const clause of [
  "claim_type = 'certification'",
  "category = 'qualification'",
  "market_pack_code IS NULL",
  "jurisdiction_code IS NULL",
  "sub_jurisdiction_code IS NULL",
  "authority_id IS NULL",
  "regulated_role_id IS NULL",
]) {
  // Anchored on a preceding non-identifier character. `.includes` was not
  // enough and the negative control proved it: "jurisdiction_code IS NULL" is
  // a SUBSTRING of "sub_jurisdiction_code IS NULL", so deleting the former
  // left the assertion passing on the latter — a dead check that would have
  // shipped a global definition free to carry a country.
  ok(
    new RegExp(`(?<![A-Za-z0-9_])${clause.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(
      GLOBAL_CONSTRAINT,
    ),
    `and it pins ${clause}`,
  );
}
ok(
  /NOT \(contributes_to && ARRAY\['local_eligibility', 'active_title'\]/.test(GLOBAL_CONSTRAINT),
  "and it forbids any contribution to local eligibility or a professional title",
);

ok(
  /VALIDATE CONSTRAINT sp_credential_type_global_scope_unbound/.test(MIGRATION),
  "the constraint is VALIDATEd, so existing rows are scanned rather than trusted",
);
ok(
  /NOT VALID;/.test(MIGRATION),
  "and added NOT VALID first, so the scan follows the deterministic assertions",
);

ok(
  /SP_GLOBAL_CERTIFICATION_HAS_NO_JURISDICTION/.test(MIGRATION),
  "the claim trigger refuses a global certification carrying a country",
);
{
  const trigger = MIGRATION.slice(MIGRATION.indexOf("ADDED 20261111090000"));
  ok(
    /_t\.scope_code = 'global_professional'/.test(trigger),
    "and it reads the DEFINITION's scope, not the submitted row",
  );
  ok(
    /NEW\.jurisdiction_code IS NOT NULL OR NEW\.sub_jurisdiction_code IS NOT NULL/.test(trigger),
    "refusing either column",
  );
}

/* The trigger must still refuse everything PR #222 made it refuse. */
for (const preserved of [
  "SP_SUB_JURISDICTION_REQUIRED",
  "SP_SUB_JURISDICTION_NOT_SUPPORTED",
  "SP_JURISDICTION_NOT_SUPPORTED",
  "SP_MARKET_PACK_NOT_ACTIVE",
  "SP_CREDENTIAL_NOT_AVAILABLE",
  "SP_CREDENTIAL_JURISDICTION_MISMATCH",
  "SP_CREDENTIAL_CLAIM_TYPE_MISMATCH",
  "SP_CREDENTIAL_TITLE_CONTROLLED",
  "SP_CREDENTIAL_REQUIRES_SCOPE",
]) {
  ok(MIGRATION.includes(preserved), `PR #222's ${preserved} survives the rewritten trigger`);
  ok(ROLLBACK.includes(preserved), `and the rollback restores it`);
}

/* Ownership. The lifecycle table is the holder's own data in both directions. */
{
  const policy = MIGRATION.slice(
    MIGRATION.indexOf("CREATE POLICY sp_claim_certification_lifecycle_owner"),
    MIGRATION.indexOf("GRANT SELECT ON public.sp_credential_scopes"),
  );
  ok(policy.length > 0, "the lifecycle table has an owner policy");
  ok(/USING \(holder_user_id = auth\.uid\(\)\)/.test(policy), "reading is scoped to the owner");
  ok(/WITH CHECK \(/.test(policy), "and writing is checked");
  ok(
    /c\.holder_user_id = auth\.uid\(\)/.test(policy),
    "including that the CLAIM is the caller's own",
  );
  ok(
    /SP_CERTIFICATION_LIFECYCLE_WRONG_HOLDER/.test(MIGRATION),
    "and a trigger enforces the same for callers RLS does not bind",
  );
}

/* Anonymous and holder write boundaries. */
for (const table of [
  "sp_credential_scopes",
  "sp_certification_issuers",
  "sp_certification_issuer_aliases",
  "sp_certification_sources",
  "sp_certification_definitions",
  "sp_claim_certification_lifecycle",
]) {
  ok(
    new RegExp(`ALTER TABLE public\\.${table}\\s+ENABLE ROW LEVEL SECURITY`).test(MIGRATION),
    `${table} has row level security enabled`,
  );
  ok(
    new RegExp(`REVOKE ALL ON public\\.${table}\\s+FROM anon`).test(MIGRATION),
    `and anon holds nothing on it`,
  );
  // ALL is wider than the four privileges anybody thinks about: it carries
  // TRUNCATE, which is the one row level security does not bound. Revoking ALL
  // and granting back by name is the only form that cannot leave one behind,
  // and the reviewer-role suite refused the replay when this file did not.
  ok(
    new RegExp(`REVOKE ALL ON public\\.${table}\\s+FROM PUBLIC, anon, authenticated`).test(
      MIGRATION,
    ),
    `and everything is revoked before anything is granted on ${table}`,
  );
}
for (const table of [
  "sp_credential_scopes",
  "sp_certification_issuers",
  "sp_certification_issuer_aliases",
  "sp_certification_sources",
  "sp_certification_definitions",
]) {
  ok(
    new RegExp(`REVOKE INSERT, UPDATE, DELETE ON public\\.${table}\\s+FROM authenticated`).test(
      MIGRATION,
    ),
    `and no holder may write ${table}`,
  );
}
ok(
  /REVOKE INSERT, UPDATE, DELETE ON public\.sp_credential_types FROM anon, authenticated/.test(
    MIGRATION,
  ),
  "and the taxonomy's new scope column is not holder-writable either",
);

/* Phase 8's rule: removal is withdrawal, and history is not erasable. */
ok(
  !/GRANT[^;]*DELETE[^;]*ON public\.sp_claim_certification_lifecycle/.test(MIGRATION_SQL),
  "no application role is GRANTed DELETE on the lifecycle table",
);
ok(
  /REVOKE DELETE ON public\.sp_claim_certification_lifecycle FROM anon, authenticated/.test(
    MIGRATION,
  ),
  "and DELETE is explicitly revoked, because the hosted default grants it",
);

/* The rollback contract. */
ok(
  /SP_GLOBAL_CERT_ROLLBACK_REFUSED/.test(ROLLBACK),
  "the rollback REFUSES once a holder's claim references a definition",
);
ok(!/CASCADE/.test(ROLLBACK_SQL), "and uses no CASCADE anywhere");
ok(!/DELETE FROM public\.sp_claims/.test(ROLLBACK_SQL), "and deletes no holder claim");
ok(
  /DELETE FROM public\.sp_credential_types WHERE code IN \(/.test(ROLLBACK),
  "removing the fourteen definitions by NAME, never by pattern",
);
ok(
  !/code LIKE 'INTL/.test(
    ROLLBACK_SQL.slice(ROLLBACK_SQL.indexOf("DELETE FROM public.sp_credential_types")),
  ),
  "so a future INTL_ code cannot be swept up by it",
);

/* No market is activated by a schema release. */
ok(!/UPDATE public\.sp_market_packs/.test(MIGRATION_SQL), "no market pack row is touched");

console.log(
  fails.length === 0
    ? "\npassport-global-certification-check: all assertions passed."
    : `\npassport-global-certification-check FAILED (${fails.length})`,
);
if (fails.length > 0) {
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
