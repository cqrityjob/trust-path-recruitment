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

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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

/** The database suite. Read here so this fast guard can assert that the
 *  attack matrix still EXISTS — deleting an assertion is the cheapest way to
 *  make a security suite green, and it happens in the same file the fix lives
 *  in. This reader runs in the lint job, minutes before the database one. */
const SUITE = readFileSync(
  join(root, "supabase/tests/security_passport_global_certification_test.sql"),
  "utf8",
);

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
   GROUP 4 — THE APPLICATION NOW DEPENDS ON THIS SCHEMA, DELIBERATELY
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nGROUP 4 -- the application release rests on an APPLIED schema");

/* ── WHAT THIS GROUP USED TO PROVE, AND WHY IT CHANGED ─────────────────
 *
 * Through the schema release this group proved the opposite of what it proves
 * now: that NO file under `src/` mentioned any object the migration
 * introduced, and that the generated types did not describe them either. That
 * was the property that made the schema safe to merge on its own — Lovable
 * rebuilds from `main` the moment a PR merges, canonical migrations do not run
 * then, and on 2026-08-25 that gap took down all job publishing.
 *
 * That gap is closed. 20261111090000 is applied on the owner project through
 * the official Supabase integration and `release-state.json` records it with
 * its evidence, so the application release is exactly the deliberate change
 * the schema guard said it would be. The guard is therefore INVERTED rather
 * than deleted: the same objects are named in the same list, and every one of
 * them must now be present in the generated types, reachable from the runtime,
 * and reached only through the governed catalogue.
 *
 * Deleting this group would have been the cheap way past a red check. The
 * order was the point, and it still is — so the guard now proves the order was
 * FOLLOWED instead of proving it had not been started.
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
  "sp_certification_lifecycle_declare",
  "scope_code",
] as const;

const CANONICAL_MIGRATION = "20261111090000_sp_global_professional_certifications.sql";
const OBSOLETE_MIGRATION_STEM = "20261110090000_sp_global_professional_certifications";

const SRC = join(root, "src");
const appFiles = walk(SRC, [".ts", ".tsx"]);
const appText = new Map(appFiles.map((f) => [relative(root, f), readFileSync(f, "utf8")] as const));
function read(rel: string): string {
  const t = appText.get(rel);
  if (t === undefined) throw new Error(`guard expected ${rel} to exist`);
  return t;
}
/** Every application file EXCEPT the generated types, which are data. */
function handWritten(): ReadonlyArray<readonly [string, string]> {
  return [...appText].filter(([rel]) => rel !== "src/integrations/supabase/types.ts");
}

const GENERATED = read("src/integrations/supabase/types.ts");
const SCOPE_MODULE = read("src/lib/security-passport/certification-scope.ts");
const CLASSIFIER = read("src/lib/security-passport/classification.ts");
const CREDENTIALS = read("src/lib/security-passport/credentials.ts");
const CRED_FUNCTIONS = read("src/lib/security-passport/credentials.functions.ts");

/* ── 4.1 the schema this code depends on is recorded APPLIED ─────────── */
{
  const releaseState = JSON.parse(
    readFileSync(join(root, "supabase/release-state.json"), "utf8"),
  ) as { frontier: ReadonlyArray<{ file: string; hostedState: string; evidenceSource?: string }> };
  const entry = releaseState.frontier.find((e) => e.file === CANONICAL_MIGRATION);
  ok(Boolean(entry), `release-state.json carries ${CANONICAL_MIGRATION}`);
  ok(entry?.hostedState === "applied", "and classifies it as applied on the hosted database");
  ok(
    (entry?.evidenceSource ?? "").length > 0,
    "and names the evidence by which that was established",
  );
}

/* ── 4.2 the generated types describe every object the runtime names ─── */
{
  for (const object of INTRODUCED) {
    ok(GENERATED.includes(object), `the generated Supabase types describe ${object}`);
  }
  // The exact holder write contract, by its six argument names. A guard that
  // only looked for the function name would pass against a different overload.
  const declare = /sp_certification_lifecycle_declare: \{\s*Args: \{([\s\S]*?)\}/.exec(GENERATED);
  ok(Boolean(declare), "the generated types describe the lifecycle declare RPC's arguments");
  for (const arg of [
    "_claim_id",
    "_awarded_on",
    "_cycle_ends_on",
    "_cycle_end_semantics",
    "_holder_lifecycle_status",
    "_status_as_of",
  ]) {
    ok(Boolean(declare?.[1]?.includes(arg)), `  and its argument ${arg}`);
  }
  // Every one of the six tables, as a TABLE the client can be typed against.
  for (const table of INTRODUCED.filter(
    (o) => o.startsWith("sp_") && o.includes("certification"),
  )) {
    if (table === "sp_certification_lifecycle_declare") continue;
    ok(
      new RegExp(`^      ${table}: \\{$`, "m").test(GENERATED),
      `  and ${table} as a table the client is typed against`,
    );
  }
}

/* ── 4.3 no escape hatch survived the apply ──────────────────────────── */
{
  ok(
    !existsSync(join(SRC, "lib/security-passport/pending-schema.ts")),
    "the pending-schema escape hatch module is gone",
  );
  const hatches: ReadonlyArray<readonly [string, RegExp]> = [
    ["fromPendingSchema", /fromPendingSchema/],
    ["pending-schema", /pending-schema/],
    ["aheadOfHostedSchema", /aheadOfHostedSchema/],
  ];
  for (const [label, re] of hatches) {
    const offenders = handWritten()
      .filter(([, text]) => re.test(text))
      .map(([rel]) => rel);
    ok(
      offenders.length === 0,
      `no application file uses ${label}${offenders.length ? ` — ${offenders.join(", ")}` : ""}`,
    );
  }
  // The generic missing-column / missing-relation predicates existed ONLY to
  // survive the unapplied schema. The pilot-specific ones they were factored
  // out of are pre-existing and stay.
  const marketAccess = read("src/lib/security-passport/market-access.ts");
  ok(
    !/export function isMissingColumn\b/.test(marketAccess),
    "the generic isMissingColumn helper added for the schema gap is gone",
  );
  ok(
    !/export function isMissingRelation\b/.test(marketAccess),
    "the generic isMissingRelation helper added for the schema gap is gone",
  );
  ok(
    /export function isMissingPilotStateColumn\b/.test(marketAccess),
    "and the pre-existing pilot-state tolerance is untouched",
  );
  ok(
    /export function isMissingPilotMembersTable\b/.test(marketAccess),
    "and so is the pre-existing pilot-members tolerance",
  );
  // The retry that read the taxonomy a second time without scope_code.
  ok(
    !/TAXONOMY_BASE_COLUMNS/.test(CRED_FUNCTIONS),
    "the retry-without-scope_code column list is gone",
  );
  ok(!/withoutScope/.test(CRED_FUNCTIONS), "and so is the second read it fell back to");
}

/* ── 4.4 the runtime reads the GOVERNED catalogue ────────────────────── */
{
  ok(
    /const TAXONOMY_COLUMNS =[\s\S]{0,600}?scope_code/.test(CRED_FUNCTIONS),
    "every taxonomy read selects the declared scope",
  );
  const selects = [
    ...CRED_FUNCTIONS.matchAll(/\.from\("sp_credential_types"\)\s*\n\s*\.select\(([^)]*)\)/g),
  ];
  ok(selects.length > 0, "the taxonomy reads are found");
  for (const [i, m] of selects.entries()) {
    ok(
      m[1].includes("TAXONOMY_COLUMNS"),
      `taxonomy read #${i + 1} goes through the one shared column list`,
    );
  }
  ok(
    /\.from\("sp_certification_definitions"\)/.test(CRED_FUNCTIONS),
    "the international catalogue is read from the governed definitions table",
  );
  // The definitions table references sp_credential_types TWICE. An unhinted
  // embed is ambiguous and PostgREST refuses the whole request.
  ok(
    /sp_credential_types!sp_certification_definitions_credential_code_fkey!inner/.test(
      CRED_FUNCTIONS,
    ),
    "and its taxonomy embed is hinted with the credential_code foreign key",
  );
  ok(
    /issuerDisplayName: r\.sp_certification_issuers\.display_name/.test(CRED_FUNCTIONS),
    "issuer names come from the controlled display name",
  );
  const aliasOffenders = handWritten()
    .filter(([, t]) => /sp_certification_issuer_aliases/.test(t))
    .map(([rel]) => rel);
  ok(
    aliasOffenders.length === 0,
    `no surface renders from the search aliases${aliasOffenders.length ? ` — ${aliasOffenders.join(", ")}` : ""}`,
  );
}

/* ── 4.5 nothing is inferred from a title, an abbreviation or an issuer ─ */
{
  // The scope module reads scopeCode and nothing else.
  ok(
    /definition\?\.scopeCode === GLOBAL_PROFESSIONAL_SCOPE/.test(SCOPE_MODULE),
    "isGlobalCertification compares the DECLARED scope",
  );
  for (const forbidden of ["nameSv", "nameEn", "title", "issuer", "abbreviation", "symbolLabel"]) {
    ok(
      !new RegExp(`\\b${forbidden}\\b`, "i").test(
        SCOPE_MODULE.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""),
      ),
      `certification-scope.ts reads no ${forbidden}`,
    );
  }
  const classifierCode = CLASSIFIER.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  for (const forbidden of ["title", "issuer", "abbreviation", "INTL_"]) {
    ok(!new RegExp(forbidden, "i").test(classifierCode), `the classifier reads no ${forbidden}`);
  }
  ok(
    /isGlobalCertification\(claim\.definition\)/.test(CLASSIFIER),
    "the international bucket is entered only through the definition's declared scope",
  );
  // An undeclared scope is not global — the one direction this may fail in.
  ok(
    /isNationalCredential/.test(SCOPE_MODULE) &&
      !/!isGlobalCertification/.test(SCOPE_MODULE.replace(/\/\*[\s\S]*?\*\//g, "")),
    "national is its own declared state, not the negation of global",
  );
}

/* ── 4.6 a global scope CLEARS the territory; national is unchanged ──── */
{
  ok(
    /GLOBAL_CERTIFICATION_TERRITORY = \{[\s\S]*?jurisdiction_code: null,[\s\S]*?sub_jurisdiction_code: null,[\s\S]*?\}/.test(
      SCOPE_MODULE,
    ),
    "the global territory writes BOTH jurisdiction columns as null",
  );
  ok(
    /isGlobalCertification\(type\)\s*\?\s*GLOBAL_CERTIFICATION_TERRITORY/.test(CREDENTIALS),
    "the write path uses it for a global certification",
  );
  // PR #222's rule, verbatim, for everything else.
  ok(
    /jurisdiction_code: type\.jurisdictionCode \?\? nullIfBlank\(draft\.jurisdictionCode\)/.test(
      CREDENTIALS,
    ),
    "and a national credential still takes its jurisdiction from the definition",
  );
  ok(
    /sub_jurisdiction_code: type\.subJurisdictionCode/.test(CREDENTIALS),
    "and its sub-jurisdiction from the definition, so a correction clears the emirate",
  );
  ok(
    /!isGlobalCertification\(type\) && isBlank\(draft\.jurisdictionCode\)/.test(CREDENTIALS),
    "the form demands a jurisdiction of a credential that has one, and only of those",
  );
}

/* ── 4.7 an international certification is never permission to work ──── */
{
  const offenders = handWritten()
    .filter(([rel]) => rel.startsWith("src/lib/security-passport/"))
    .filter(([, t]) => {
      const code = t.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
      return /local_eligibility|active_title/.test(code) && /global_professional/.test(code);
    })
    .map(([rel]) => rel);
  ok(
    offenders.length === 0,
    `no module joins the global scope to eligibility or to a derived title${offenders.length ? ` — ${offenders.join(", ")}` : ""}`,
  );
  // The classifier's international bucket carries no group key, so it can
  // never be presented under a country heading.
  ok(
    /bucket: "international_certification", groupKey: null/.test(CLASSIFIER),
    "an international certification is grouped under no jurisdiction",
  );
}

/* ── 4.8 a catalogue failure is never a trusted fact ─────────────────── */
{
  const fn = /listGlobalCertificationTypes[\s\S]*?^ {2}\}\);$/m.exec(CRED_FUNCTIONS)?.[0] ?? "";
  ok(fn.length > 0, "the international catalogue reader is found");
  ok(/if \(error\) throw new Error\(error\.message\);/.test(fn), "it throws on every read error");
  ok(
    !/isMissingRelation|isMissingColumn/.test(fn),
    "and tolerates no missing relation or column, so an outage cannot read as an empty catalogue",
  );
  ok(
    !/return \[\];/.test(fn),
    "and has no path that answers with an empty catalogue instead of failing",
  );
}

/* ── 4.9 the holder lifecycle trust boundary ─────────────────────────── */
{
  for (const verb of ["insert", "update", "upsert", "delete"]) {
    const re = new RegExp(
      `from\\(\\s*["'\`]sp_claim_certification_lifecycle["'\`]\\s*\\)[\\s\\S]{0,200}?\\.${verb}\\(`,
    );
    const offenders = handWritten()
      .filter(([, text]) => re.test(text))
      .map(([rel]) => rel);
    ok(
      offenders.length === 0,
      `no application file performs a direct .${verb}() on sp_claim_certification_lifecycle` +
        (offenders.length ? ` — ${offenders.join(", ")}` : ""),
    );
  }
  // If a lifecycle write ever appears, it may only be the canonical RPC.
  const rpcCalls = handWritten().flatMap(([rel, t]) =>
    [...t.matchAll(/\.rpc\(\s*["'`]([a-z0-9_]+)["'`]/g)].map((m) => [rel, m[1]] as const),
  );
  const lifecycleRpcs = rpcCalls.filter(([, name]) => name.includes("certification_lifecycle"));
  for (const [rel, name] of lifecycleRpcs) {
    ok(
      name === "sp_certification_lifecycle_declare",
      `${rel} reaches the lifecycle only through the canonical RPC (found ${name})`,
    );
  }
  // This phase builds no holder lifecycle write at all, and says so.
  ok(
    lifecycleRpcs.length === 0,
    "this phase adds no holder lifecycle write, speculatively or otherwise",
  );
  // Reviewer and issuer write paths are not this phase's either.
  const provenance = [
    "status_source",
    "issuer_confirmed_at",
    "issuer_confirmation_url",
    "holder_user_id",
  ];
  for (const field of provenance) {
    const offenders = handWritten()
      .filter(([, t]) => {
        const code = t.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
        return code.includes("certification_lifecycle") && code.includes(field);
      })
      .map(([rel]) => rel);
    ok(
      offenders.length === 0,
      `no client chooses the protected provenance field ${field}${offenders.length ? ` — ${offenders.join(", ")}` : ""}`,
    );
  }
}

/* ── 4.10 the obsolete migration identity is gone ────────────────────── */
{
  ok(
    !existsSync(join(root, "supabase/migrations", `${OBSOLETE_MIGRATION_STEM}.sql`)),
    "the obsolete 20261110090000 certification migration was not reintroduced",
  );
  ok(
    !existsSync(join(root, "supabase/rollback", `${OBSOLETE_MIGRATION_STEM}_rollback.sql`)),
    "and neither was its rollback",
  );
  ok(
    existsSync(join(root, "supabase/migrations", CANONICAL_MIGRATION)),
    "the canonical migration is the one on disk",
  );
  const stale = handWritten()
    .filter(([, t]) => t.includes(OBSOLETE_MIGRATION_STEM) || /20261110090000/.test(t))
    .map(([rel]) => rel);
  ok(
    stale.length === 0,
    `no application file names the obsolete migration identity${stale.length ? ` — ${stale.join(", ")}` : ""}`,
  );
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

/* ── THE HOLDER WRITE BOUNDARY ─────────────────────────────────────────
 *
 * The defect independent review found, stated as the assertions that would
 * have caught it.
 *
 * The lifecycle table carries `status_source`, which says WHO established a
 * holder's standing: the holder, a CQrityjob document review, or the issuer.
 * The first version of this migration gave `authenticated` whole-row INSERT
 * and UPDATE behind a `FOR ALL` owner policy. The policy proved the ROW was
 * the caller's; the trigger proved the CLAIM was the caller's. Neither asked
 * whether the caller was a reviewer or an issuer — so a holder could POST
 * `issuer_confirmed` with a timestamp and any https:// URL and the Passport
 * would carry an issuer confirmation no issuer made.
 *
 * The fix is least privilege, not another CHECK: the holder holds SELECT and
 * nothing else, and one narrow SECURITY DEFINER function is the only writer.
 * Everything below fails if any part of that is undone.
 */
{
  const policy = MIGRATION.slice(
    MIGRATION.indexOf("CREATE POLICY sp_claim_certification_lifecycle_owner"),
    MIGRATION.indexOf("GRANT SELECT ON public.sp_credential_scopes"),
  );
  ok(policy.length > 0, "the lifecycle table has an owner policy");
  ok(policy.length < 2000, "and the policy slice is the policy, not half the file");
  ok(/USING \(holder_user_id = auth\.uid\(\)\)/.test(policy), "reading is scoped to the owner");

  // FOR SELECT, never FOR ALL. A write policy on this table would mean the
  // write boundary is "is this row yours", which is the wrong question.
  ok(
    /FOR SELECT TO authenticated/.test(policy),
    "and the policy is SELECT-only: ownership is not authority over status_source",
  );
  ok(!/FOR ALL/.test(policy), "no FOR ALL policy grants the holder a write path back");
  ok(
    !/WITH CHECK/.test(policy),
    "and there is no WITH CHECK, because there is no policy-mediated write at all",
  );

  ok(
    /SP_CERTIFICATION_LIFECYCLE_WRONG_HOLDER/.test(MIGRATION),
    "the trigger still pins the row to the claim's holder for callers RLS does not bind",
  );
}

/* The table grants: SELECT only, and the absence of the other three written
 * down rather than assumed, because the hosted platform's defaults grant them. */
{
  ok(
    /GRANT SELECT ON public\.sp_claim_certification_lifecycle TO authenticated;/.test(MIGRATION),
    "the holder keeps SELECT on their own lifecycle row",
  );
  ok(
    !/GRANT[^;]*\b(INSERT|UPDATE|DELETE)\b[^;]*ON public\.sp_claim_certification_lifecycle/.test(
      MIGRATION_SQL,
    ),
    "and no application role is GRANTed INSERT, UPDATE or DELETE on it",
  );
  ok(
    /REVOKE INSERT, UPDATE, DELETE ON public\.sp_claim_certification_lifecycle FROM anon, authenticated;/.test(
      MIGRATION,
    ),
    "with all three revoked by name, because the hosted default grants them",
  );
  ok(
    /SP_GLOBAL_CERT_LIFECYCLE_WRITABLE/.test(MIGRATION),
    "and the migration refuses to apply if any of the three survives",
  );
  ok(
    /SP_GLOBAL_CERT_LIFECYCLE_POLICY_WRITABLE/.test(MIGRATION),
    "or if a policy on the table is anything but SELECT-only",
  );
}

/* The one write path. */
{
  const fn = MIGRATION.slice(
    MIGRATION.indexOf("CREATE OR REPLACE FUNCTION public.sp_certification_lifecycle_declare"),
    MIGRATION.indexOf("COMMENT ON FUNCTION public.sp_certification_lifecycle_declare"),
  );
  ok(fn.length > 0, "a holder write path exists");
  ok(fn.length < 9000, "and the slice is the function, not the rest of the file");

  ok(/SECURITY DEFINER/.test(fn), "it is SECURITY DEFINER, since the holder holds no table grant");
  ok(
    /SET search_path = public, pg_temp/.test(fn),
    "with a fixed search_path, or SECURITY DEFINER is a privilege escalation",
  );
  ok(
    /REVOKE ALL ON FUNCTION\s+public\.sp_certification_lifecycle_declare\(uuid, date, date, text, text, date\)\s+FROM PUBLIC, anon;/.test(
      MIGRATION,
    ),
    "revoked from PUBLIC and anon",
  );
  ok(
    /GRANT EXECUTE ON FUNCTION\s+public\.sp_certification_lifecycle_declare\(uuid, date, date, text, text, date\)\s+TO authenticated;/.test(
      MIGRATION,
    ),
    "and granted to authenticated alone",
  );

  // auth.uid(), proved before anything is read or written.
  ok(/auth\.uid\(\)/.test(fn), "it reads the caller from auth.uid(), not from a parameter");
  ok(/SP_NOT_AUTHENTICATED/.test(fn), "and refuses a caller with no subject");

  // Ownership, and a refusal that cannot be used to enumerate.
  ok(
    /c\.id = _claim_id AND c\.holder_user_id = _uid/.test(fn),
    "the claim must be the caller's own",
  );
  ok(
    (fn.match(/SP_CERTIFICATION_LIFECYCLE_CLAIM_NOT_YOURS/g) ?? []).length === 1,
    "and one refusal covers both 'not yours' and 'no such claim', so it cannot enumerate",
  );
  ok(
    /SP_CERTIFICATION_LIFECYCLE_NOT_GLOBAL/.test(fn),
    "and a national credential has no certification lifecycle",
  );

  // The fields a holder may NOT supply are not parameters at all. Read off the
  // parameter list, which is the only thing a caller controls.
  const params = fn.slice(fn.indexOf("("), fn.indexOf("RETURNS"));
  for (const forbidden of [
    "holder_user_id",
    "status_source",
    "issuer_confirmed_at",
    "issuer_confirmed_source_url",
    "created_at",
    "updated_at",
  ]) {
    ok(!params.includes(forbidden), `${forbidden} is not a parameter of the write path`);
  }

  // And they are hardcoded in the body, in both the INSERT and the correction.
  // Counting occurrences is not enough, and the GC-NC-SOURCE-NOT-HARDCODED
  // control proved it: once the provenance predicate below was added, deleting
  // the restatement from the SET list still left two `'holder_declared'`
  // literals in the function, so the count assertion kept printing ok over a
  // real defect. Each of the two places is now asserted by its own shape.
  ok(
    /'holder_declared', NULL, NULL\)/.test(fn),
    "the INSERT writes status_source = holder_declared, with neither issuer field",
  );
  ok(
    /\n\s+status_source\s+= 'holder_declared',/.test(fn),
    "and the correction RESTATES it in the SET list, not merely in the predicate",
  );
  ok(
    !/'document_reviewed'|'issuer_confirmed'/.test(fn),
    "and the write path never mentions a source only a reviewer or issuer may establish",
  );
  ok(
    /issuer_confirmed_at\s*=\s*NULL/.test(fn) && /issuer_confirmed_source_url\s*=\s*NULL/.test(fn),
    "both issuer-attribution fields are forced to NULL on correction",
  );
  ok(/_claim_id, _uid,/.test(fn), "holder_user_id is hardcoded to auth.uid() rather than accepted");

  // Identity and audit survive a correction: absent from the DO UPDATE SET.
  const doUpdate = fn.slice(fn.indexOf("ON CONFLICT"));
  ok(doUpdate.length > 0, "the correction path is an ON CONFLICT DO UPDATE");

  // ── PROVENANCE: a holder may correct their OWN statement and nothing else.
  //
  // The second defect independent review found. The conflict update was
  // unconditional, and it sets status_source back to 'holder_declared' and
  // NULLs both issuer fields -- so the moment an authorised path wrote
  // 'document_reviewed' or 'issuer_confirmed', a holder's ordinary
  // declaration would ERASE it. An issuer records `revoked`; the holder
  // declares `active`; the revocation is gone. The trusted writer not
  // existing yet is not a defence: this is the foundation it will rely on.
  ok(
    /WHERE l\.status_source = 'holder_declared'/.test(doUpdate),
    "and the conflict update is permitted ONLY while the existing row is still holder_declared",
  );
  ok(
    /RETURNING l\.claim_id INTO _written/.test(doUpdate),
    "the statement reports what it actually wrote",
  );
  ok(
    /IF _written IS NULL THEN/.test(fn) && /SP_CERTIFICATION_LIFECYCLE_SOURCE_PROTECTED/.test(fn),
    "and a refused correction fails CLOSED with one stable code, never as a silent no-op",
  );

  // The guard must be part of the writing statement. A pre-check followed by
  // an unconditional update is a race: two callers both read holder_declared,
  // or a reviewer commits between the read and the write.
  {
    const guardAt = fn.indexOf("WHERE l.status_source = 'holder_declared'");
    const insertAt = fn.indexOf("INSERT INTO public.sp_claim_certification_lifecycle");
    const raiseAt = fn.indexOf("IF _written IS NULL THEN");
    ok(
      insertAt >= 0 && guardAt > insertAt && raiseAt > guardAt,
      "the predicate sits inside the INSERT statement, before the failure check — not as a separate pre-check",
    );
    ok(
      !/SELECT[^;]*status_source[^;]*FROM public\.sp_claim_certification_lifecycle/.test(
        fn.slice(0, insertAt),
      ),
      "and nothing reads status_source before the write, which would be a race rather than a guard",
    );
  }

  // The refusal must not say WHICH protected source it is.
  ok(
    !/SOURCE_PROTECTED[^;]*document_reviewed|SOURCE_PROTECTED[^;]*issuer_confirmed/.test(fn),
    "and the refusal does not reveal whether a reviewer or the issuer established it",
  );

  // The `created` flag is gone. It came from a NOT EXISTS read taken before
  // the write, so two concurrent first declarations could both see "not
  // exists" while only one inserted.
  ok(
    !/NOT EXISTS \(\s*SELECT 1 FROM public\.sp_claim_certification_lifecycle/.test(fn),
    "no pre-write existence read remains, whose answer a concurrent caller could invalidate",
  );
  ok(
    !/'created'/.test(fn),
    "and the return contract carries no created flag that could be wrong under concurrency",
  );
  for (const preserved of ["claim_id ", "holder_user_id ", "created_at "]) {
    ok(
      !new RegExp(`\\b${preserved.trim()}\\s*=`).test(doUpdate),
      `${preserved.trim()} is never rewritten by a correction`,
    );
  }
  ok(/updated_at\s*=\s*now\(\)/.test(doUpdate), "and updated_at is set here, not by the caller");

  ok(
    /SP_GLOBAL_CERT_NO_WRITE_PATH/.test(MIGRATION) &&
      /SP_GLOBAL_CERT_WRITE_PATH_NOT_DEFINER/.test(MIGRATION) &&
      /SP_GLOBAL_CERT_WRITE_PATH_UNPINNED/.test(MIGRATION) &&
      /SP_GLOBAL_CERT_WRITE_PATH_ANON/.test(MIGRATION) &&
      /SP_GLOBAL_CERT_WRITE_PATH_SOURCE/.test(MIGRATION) &&
      /SP_GLOBAL_CERT_WRITE_PATH_ATTRIBUTES/.test(MIGRATION) &&
      /SP_GLOBAL_CERT_WRITE_PATH_OVERWRITES_PROVENANCE/.test(MIGRATION) &&
      /SP_GLOBAL_CERT_WRITE_PATH_FAILS_OPEN/.test(MIGRATION),
    "and the migration asserts all of it at apply time",
  );
}

/* The issuer-attribution constraint, which was written as an equivalence and
 * therefore allowed a non-issuer row to carry exactly ONE issuer field. */
{
  const c = MIGRATION.slice(
    MIGRATION.indexOf("CONSTRAINT sp_certification_lifecycle_issuer_confirmation_is_attributed"),
    MIGRATION.indexOf("CONSTRAINT sp_certification_lifecycle_dates_ordered"),
  );
  ok(c.length > 0 && c.length < 900, "the issuer-attribution constraint is where it is expected");
  ok(
    /CASE WHEN status_source = 'issuer_confirmed'/.test(c),
    "it is written as a CASE, not as an equivalence",
  );
  ok(
    /ELSE issuer_confirmed_at IS NULL/.test(c) && /AND issuer_confirmed_source_url IS NULL/.test(c),
    "so every other source requires BOTH issuer fields to be NULL, not merely not-both",
  );
  ok(
    !/\)\s*=\s*\(issuer_confirmed_at IS NOT NULL/.test(c),
    "and the equivalence form that permitted exactly one field is gone",
  );
}

/* The attack matrix exists in the database suite, not only in this reader. */
{
  for (const attack of [
    "8b.1 a holder cannot INSERT a lifecycle row directly",
    "8b.2 nor UPDATE their own lifecycle row directly",
    "8b.3 nor declare that a document was reviewed",
    "8b.4 nor forge a COMPLETE issuer confirmation",
    "8b.5 a non-issuer source may not carry an issuer-confirmation time",
    "8b.5b nor an issuer-confirmation source URL",
    "8b.6 nor move the statement onto another credential",
    "8b.7 nor rewrite whose statement it is",
    "8b.8 nor backdate when they first made it",
    "8b.9 nor write lifecycle data for another holder",
    "8b.10 and a claim that does not exist is refused identically",
    "8b.11 a holder corrects their own statement",
    "8b.13 while claim_id, holder_user_id and created_at are preserved",
    "8b.15 and none of it has changed the claim",
    "8b.16 no application role holds INSERT, UPDATE or DELETE",
    "8b.19 anon cannot execute the write path",
    "8b.22 and a caller with no JWT subject is refused outright",
    "8c.2 the holder cannot declare over it",
    "8c.3 and the COMPLETE row is byte-for-byte what it was",
    "8c.4 including updated_at, so nothing was written and rolled back",
    "8c.5 an issuer-confirmed REVOCATION is on record, fully attributed",
    "8c.6 the holder cannot declare themselves active over an issuer revocation",
    "8c.8 the revocation, its source and both attribution fields all survive",
    "8c.9 neither trusted source was converted back to holder_declared",
    "8c.10 and the refusal does not reveal WHICH protected source it is",
    "8c.11 a holder still CREATES a new holder_declared row",
    "8c.13 and still CORRECTS an existing holder_declared row",
    "8c.14 with created_at preserved across the correction",
  ]) {
    ok(SUITE.includes(attack), `the suite proves: ${attack}`);
  }
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

/* Phase 8's rule: removal is withdrawal, and history is not erasable. Asserted
 * above as part of the write boundary; restated here because it is Phase 8's
 * rule and not this file's, and a reader looking for it should find it. */
ok(
  !/GRANT[^;]*DELETE[^;]*ON public\.sp_claim_certification_lifecycle/.test(MIGRATION_SQL),
  "no application role is GRANTed DELETE on the lifecycle table",
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

// The write path is SECURITY DEFINER and granted to every signed-in holder. A
// rollback that dropped its table and left the function behind would leave a
// privileged function over a table that no longer exists.
ok(
  /DROP FUNCTION IF EXISTS\s+public\.sp_certification_lifecycle_declare\(uuid, date, date, text, text, date\);/.test(
    ROLLBACK,
  ),
  "the rollback drops the holder write path, by its exact signature",
);
ok(
  ROLLBACK_SQL.indexOf("DROP FUNCTION IF EXISTS\n  public.sp_certification_lifecycle_declare") <
    ROLLBACK_SQL.indexOf("DROP TABLE IF EXISTS public.sp_claim_certification_lifecycle"),
  "and drops it BEFORE the table it writes to",
);
ok(
  /SP_GLOBAL_CERT_ROLLBACK_LEFTOVER/.test(ROLLBACK),
  "and refuses to finish if any function this migration created survives",
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
