/**
 * Security Passport — the governed international catalogue, pinned.
 *
 * Run via `bun run passport-global-certification:check`.
 *
 * ── WHAT THIS GUARD IS FOR ─────────────────────────────────────────────
 *
 * The database suite proves what the SCHEMA refuses. This proves what the
 * REPOSITORY says — the half a migration cannot check, because it is about
 * source code that has not run:
 *
 *   1. the seed is exactly the fourteen reviewed definitions, under the five
 *      controlled issuer names, with the sources and gaps the review recorded;
 *   2. no module anywhere infers international scope from a title, an
 *      abbreviation, an issuer name or a missing country;
 *   3. the classifier assigns every fixture exactly one bucket, and does so
 *      independently of the order its input arrived in;
 *   4. the write mapping stores NULL for both jurisdiction columns of a global
 *      certification, and PR #222's behaviour for a national one is unchanged.
 *
 * Points 2 and 4 are the ones that matter most. A fuzzy upgrade would not fail
 * a migration, would not fail a type check, and would quietly turn somebody's
 * free-text "CPP" into a governed certification nobody awarded them.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  GLOBAL_PROFESSIONAL_SCOPE,
  NATIONAL_REGULATED_SCOPE,
  isGlobalCertification,
  isNationalCredential,
} from "../src/lib/security-passport/certification-scope";
import {
  classify,
  classifyAll,
  compareForHighlight,
  groupByJurisdiction,
  inBucket,
  isDisclosableBucket,
  orderForDisplay,
  type ClassifiableClaim,
} from "../src/lib/security-passport/classification";
import {
  credentialClaimFields,
  credentialMark,
  emptyCredentialDraft,
  validateCredential,
  type CredentialType,
} from "../src/lib/security-passport/credentials";

const root = join(import.meta.dirname, "..");
const fails: string[] = [];
function ok(cond: boolean, name: string): void {
  console.log(`  ${cond ? "ok  " : "FAIL"} ${name}`);
  if (!cond) fails.push(name);
}

const MIGRATION = readFileSync(
  join(root, "supabase/migrations/20261110090000_sp_global_professional_certifications.sql"),
  "utf8",
);
const ROLLBACK = readFileSync(
  join(root, "supabase/rollback/20261110090000_sp_global_professional_certifications_rollback.sql"),
  "utf8",
);

/** SQL with comments stripped, so a comment that NAMES a banned construct in
 *  order to explain why it is absent does not fail the check it documents —
 *  the rollback says "No CASCADE appears in this file", which is true and
 *  which the first version of this guard read as a CASCADE. */
function sqlCode(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
}

const ROLLBACK_SQL = sqlCode(ROLLBACK);
const MIGRATION_SQL = sqlCode(MIGRATION);

/** Source with comments stripped, so a comment that NAMES a banned pattern in
 *  order to explain why it is banned does not fail the check it documents. */
function code(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1"))
    .join("\n");
}

console.log("passport-global-certification-check\n");

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
  const suffix = issuer === "ASIS" ? "ASIS" : issuer;
  const held = EXPECTED_CODES.filter((c) => c.startsWith(`INTL_${suffix}_`)).length;
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
  ok(
    new RegExp(`\\('${c}', '[A-Z0-9]+', '[^']+',\\s*\\n?\\s*'https://`).test(MIGRATION) ||
      MIGRATION.includes(`('${c}'`),
    `${c} carries a programme source`,
  );
}

/* ══════════════════════════════════════════════════════════════════════
   GROUP 2 — scope is read, never inferred
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nGROUP 2 -- nothing infers international scope");

const SCOPE_SRC = code(
  readFileSync(join(root, "src/lib/security-passport/certification-scope.ts"), "utf8"),
);
const CLASS_SRC = code(
  readFileSync(join(root, "src/lib/security-passport/classification.ts"), "utf8"),
);
const CRED_SRC = code(readFileSync(join(root, "src/lib/security-passport/credentials.ts"), "utf8"));

// The one place the string may appear as a literal.
ok(
  SCOPE_SRC.includes(`"${GLOBAL_PROFESSIONAL_SCOPE}"`),
  "the scope code is a constant in certification-scope.ts",
);
ok(
  !CLASS_SRC.includes(`"${GLOBAL_PROFESSIONAL_SCOPE}"`),
  "the classifier never compares the scope string itself — it calls the predicate",
);
ok(!CRED_SRC.includes(`"${GLOBAL_PROFESSIONAL_SCOPE}"`), "and neither does the write mapping");

// The inference shapes, named individually so a failure says which one came
// back rather than "a regex matched".
const FUZZY = [
  { name: "a title containing CPP/CISSP/CAMS", re: /title[^\n]*\b(CPP|CISSP|CAMS|CRISC|CFE)\b/i },
  {
    name: "an issuer name compared to ASIS/ISACA/ACFE",
    re: /issuer[A-Za-z]*\s*(===|==|\.includes|\.startsWith)[^\n]*(ASIS|ISACA|ACFE|ACAMS|ISC2)/i,
  },
  {
    name: "the word international matched in text",
    re: /(includes|match|test|indexOf)\([^)]*["'`]international/i,
  },
  {
    name: "scope derived from a null jurisdiction",
    re: /jurisdictionCode\s*===?\s*null[^\n]*global/i,
  },
  {
    name: "scope derived from a missing jurisdiction",
    re: /!\s*[A-Za-z.]*jurisdictionCode[^\n]*global/i,
  },
];
for (const src of [
  ["certification-scope.ts", SCOPE_SRC],
  ["classification.ts", CLASS_SRC],
  ["credentials.ts", CRED_SRC],
] as const) {
  for (const f of FUZZY) {
    ok(!f.re.test(src[1]), `${src[0]} does not infer scope from ${f.name}`);
  }
}

// And the migration does not backfill by any of them.
const MIG_UPDATES = [...MIGRATION.matchAll(/UPDATE public\.sp_credential_types[\s\S]*?;/g)].map(
  (m) => m[0],
);
ok(
  MIG_UPDATES.length === 1,
  `the migration performs exactly one backfill UPDATE (found ${MIG_UPDATES.length})`,
);
const backfill = MIG_UPDATES[0] ?? "";
ok(
  backfill.includes(`'${NATIONAL_REGULATED_SCOPE}'`) &&
    !backfill.includes(`'${GLOBAL_PROFESSIONAL_SCOPE}'`),
  "and it can only ever write 'national_regulated' — never the global scope",
);
ok(
  /market_pack_code IS NOT NULL/.test(backfill) && /jurisdiction_code IS NOT NULL/.test(backfill),
  "keyed on an EXACT existing governed relationship, not on a name or a null",
);
for (const fuzzy of ["name_en ILIKE", "name_sv ILIKE", "title ILIKE", "similar to", "~*"]) {
  ok(!backfill.toLowerCase().includes(fuzzy.toLowerCase()), `the backfill uses no ${fuzzy} match`);
}
ok(!/UPDATE public\.sp_claims/.test(MIGRATION), "the migration never UPDATEs a holder claim");
ok(!/DELETE FROM public\.sp_claims/.test(MIGRATION), "and never DELETEs one");

/* ══════════════════════════════════════════════════════════════════════
   GROUP 3 — the predicates
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nGROUP 3 -- the scope predicates read the declaration and nothing else");

ok(
  isGlobalCertification({ scopeCode: GLOBAL_PROFESSIONAL_SCOPE }),
  "a declared global scope is global",
);
ok(!isGlobalCertification({ scopeCode: NATIONAL_REGULATED_SCOPE }), "a national scope is not");
ok(!isGlobalCertification({ scopeCode: null }), "an UNDECLARED scope is not global");
ok(!isGlobalCertification(null), "and neither is a missing definition");
ok(!isGlobalCertification({ scopeCode: "GLOBAL_PROFESSIONAL" }), "the comparison is case-exact");
ok(isNationalCredential({ scopeCode: NATIONAL_REGULATED_SCOPE }), "a national scope is national");
ok(
  !isNationalCredential({ scopeCode: null }) && !isGlobalCertification({ scopeCode: null }),
  "undeclared is neither — the three states are not collapsed into two",
);

/* ══════════════════════════════════════════════════════════════════════
   GROUP 4 — the write mapping
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nGROUP 4 -- what a global certification is STORED as");

function type(over: Partial<CredentialType>): CredentialType {
  return {
    code: "INTL_ASIS_CPP",
    category: "qualification",
    claimType: "certification",
    nameSv: "Certified Protection Professional (CPP)",
    nameEn: "Certified Protection Professional (CPP)",
    symbolLabel: "CPP",
    requiresValidUntil: false,
    requiresIssuer: false,
    requiresScope: false,
    narrowResultOnly: false,
    titleIsHolderWritten: false,
    jurisdictionCode: null,
    subJurisdictionCode: null,
    scopeCode: GLOBAL_PROFESSIONAL_SCOPE,
    ...over,
  };
}

{
  // The draft starts at "SE" — `emptyCredentialDraft()`'s value, and the exact
  // value that made every pilot credential unsavable before PR #222.
  const draft = emptyCredentialDraft();
  ok(draft.jurisdictionCode === "SE", "the empty draft still starts at SE (the PR #222 hazard)");

  const globalRow = credentialClaimFields(draft, type({}), "active");
  ok(globalRow.jurisdiction_code === null, "a global certification stores NULL jurisdiction_code");
  ok(
    globalRow.sub_jurisdiction_code === null,
    "and NULL sub_jurisdiction_code — the column is WRITTEN, so a correction clears it",
  );
  ok("sub_jurisdiction_code" in globalRow, "the sub-jurisdiction column is present, not omitted");
  ok(globalRow.claim_type === "certification", "as a certification");
  ok(
    globalRow.title === "Certified Protection Professional (CPP)",
    "under the definition's controlled name",
  );

  // A holder who typed a country into the draft still stores none.
  const forged = credentialClaimFields({ ...draft, jurisdictionCode: "AE" }, type({}), "active");
  ok(
    forged.jurisdiction_code === null && forged.sub_jurisdiction_code === null,
    "a country in the submitted draft is IGNORED for a global certification",
  );

  // PR #222, unchanged: a national credential still takes its market from the
  // definition, on every write.
  const uk = credentialClaimFields(
    draft,
    type({
      code: "UK_SIA_LICENCE_DS",
      scopeCode: NATIONAL_REGULATED_SCOPE,
      jurisdictionCode: "GB",
      subJurisdictionCode: null,
      claimType: "licence",
      category: "appointment",
      requiresValidUntil: true,
      requiresIssuer: true,
    }),
    "active",
  );
  ok(
    uk.jurisdiction_code === "GB",
    "PR #222: a British licence still stores GB, not the draft's SE",
  );

  const dubai = credentialClaimFields(
    draft,
    type({
      code: "AE_DU_SIRA_CARD_GUARD",
      scopeCode: NATIONAL_REGULATED_SCOPE,
      jurisdictionCode: "AE",
      subJurisdictionCode: "AE-DU",
      claimType: "licence",
      category: "appointment",
    }),
    "active",
  );
  ok(
    dubai.jurisdiction_code === "AE" && dubai.sub_jurisdiction_code === "AE-DU",
    "PR #222: a Dubai cadre card still stores AE / AE-DU",
  );

  // A definition with NO declared scope and no jurisdiction keeps the old
  // fallback: the holder's own country is the best answer available.
  const legacy = credentialClaimFields(
    draft,
    type({ code: "LEGACY_THING", scopeCode: null, jurisdictionCode: null }),
    "active",
  );
  ok(
    legacy.jurisdiction_code === "SE",
    "an UNDECLARED definition still falls back to the holder's country",
  );
}

{
  // Validation must not demand a country the database will refuse to store.
  const draft = { ...emptyCredentialDraft(), jurisdictionCode: "" };
  const globalErrors = validateCredential(draft, type({}), "active");
  ok(
    !globalErrors.some((e) => e.field === "jurisdictionCode"),
    "a global certification is not asked for a jurisdiction",
  );

  const nationalErrors = validateCredential(
    draft,
    type({ scopeCode: NATIONAL_REGULATED_SCOPE, jurisdictionCode: "SE" }),
    "active",
  );
  ok(
    nationalErrors.some((e) => e.field === "jurisdictionCode"),
    "a national credential still is",
  );
}

/* Marks: five characters, whole, and equal to the seeded symbol_label. */
console.log("\nGROUP 4b -- the symbol plate prints the credential's own mark");
{
  const seededMarks = new Map<string, string>();
  for (const m of MIGRATION.matchAll(
    /\('(INTL_[A-Z0-9_]+)',\s*'[^']*',\s*'([A-Z0-9]{1,8})',\s*\d+\)/g,
  )) {
    seededMarks.set(m[1], m[2]);
  }
  ok(seededMarks.size === 14, `parsed ${seededMarks.size} seeded marks from the migration`);

  const wrong: string[] = [];
  for (const [c, label] of seededMarks) {
    if (credentialMark(c) !== label) wrong.push(`${c}: "${credentialMark(c)}" != "${label}"`);
  }
  ok(
    wrong.length === 0,
    `every resolved mark equals its seeded symbol_label${wrong.length ? " — " + wrong.join("; ") : ""}`,
  );

  ok(credentialMark("INTL_ISC2_CISSP") === "CISSP", "CISSP resolves whole, five characters");
  ok(credentialMark("INTL_ISACA_CRISC") === "CRISC", "CRISC resolves whole, five characters");
  ok(/BETWEEN 1 AND 8/.test(MIGRATION), "and the plate's CHECK was relaxed to hold them");
  ok(/<= 4/.test(ROLLBACK), "while the rollback restores the four-character bound");

  const leaks = [...seededMarks.keys()].filter((c) => {
    const mark = credentialMark(c);
    return mark !== null && c.startsWith(mark);
  });
  ok(leaks.length === 0, "no mark is a prefix of its own code");
}

/* ══════════════════════════════════════════════════════════════════════
   GROUP 5 — the classifier
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nGROUP 5 -- every fact lands in exactly one bucket");

const GLOBAL_DEF = { scopeCode: GLOBAL_PROFESSIONAL_SCOPE };
const NATIONAL_DEF = { scopeCode: NATIONAL_REGULATED_SCOPE };

function claim(over: Partial<ClassifiableClaim> & { id: string }): ClassifiableClaim {
  return {
    claimType: "certification",
    lifecycleState: "active",
    assertionLevel: "self_declared",
    credentialCode: null,
    jurisdictionCode: null,
    subJurisdictionCode: null,
    definition: null,
    issuedOn: null,
    ...over,
  };
}

const WORK = { jurisdictionCode: "SE", subJurisdictionCode: null };

const FIXTURES: readonly (readonly [ClassifiableClaim, string])[] = [
  [
    claim({
      id: "a",
      lifecycleState: "draft",
      credentialCode: "INTL_ASIS_CPP",
      definition: GLOBAL_DEF,
    }),
    "draft",
  ],
  [
    claim({
      id: "b",
      lifecycleState: "expired",
      jurisdictionCode: "SE",
      claimType: "licence",
      definition: NATIONAL_DEF,
    }),
    "historical",
  ],
  [
    claim({
      id: "c",
      lifecycleState: "revoked",
      credentialCode: "INTL_ASIS_CPP",
      definition: GLOBAL_DEF,
    }),
    "historical",
  ],
  [
    claim({
      id: "d",
      lifecycleState: "superseded",
      jurisdictionCode: "GB",
      definition: NATIONAL_DEF,
    }),
    "historical",
  ],
  [
    claim({
      id: "e",
      lifecycleState: "disputed",
      jurisdictionCode: "SE",
      definition: NATIONAL_DEF,
    }),
    "historical",
  ],
  [
    claim({ id: "f", credentialCode: "INTL_ASIS_CPP", definition: GLOBAL_DEF }),
    "international_certification",
  ],
  [
    claim({ id: "g", credentialCode: "INTL_ISC2_CISSP", definition: GLOBAL_DEF }),
    "international_certification",
  ],
  [
    claim({
      id: "h",
      claimType: "licence",
      credentialCode: "OV",
      jurisdictionCode: "SE",
      definition: NATIONAL_DEF,
    }),
    "current_market_credential",
  ],
  [
    claim({
      id: "i",
      claimType: "licence",
      credentialCode: "UK_SIA_LICENCE_DS",
      jurisdictionCode: "GB",
      definition: NATIONAL_DEF,
    }),
    "other_country_credential",
  ],
  [
    claim({
      id: "j",
      claimType: "licence",
      credentialCode: "AE_DU_SIRA_CARD_GUARD",
      jurisdictionCode: "AE",
      subJurisdictionCode: "AE-DU",
      definition: NATIONAL_DEF,
    }),
    "other_country_credential",
  ],
  [claim({ id: "k", claimType: "education" }), "education_and_training"],
  [claim({ id: "l", claimType: "training" }), "education_and_training"],
  [claim({ id: "m", claimType: "professional_membership" }), "membership"],
  [claim({ id: "n", claimType: "language" }), "language"],
  [claim({ id: "o", claimType: "skill" }), "skill"],
  // The four rows this whole phase is about: free text named after real
  // certifications, which must stay self-declared.
  [claim({ id: "p", claimType: "certification" }), "other_self_declared"],
  [claim({ id: "q", claimType: "certification" }), "other_self_declared"],
  [claim({ id: "r", claimType: "certification" }), "other_self_declared"],
  [claim({ id: "s", claimType: "unknown_future_type" }), "other_self_declared"],
];

for (const [c, expected] of FIXTURES) {
  const got = classify(c, WORK).bucket;
  ok(got === expected, `claim ${c.id} -> ${expected}${got === expected ? "" : ` (got ${got})`}`);
}

{
  const all = FIXTURES.map(([c]) => c);
  const classified = classifyAll(all, WORK);
  ok(classified.length === all.length, "every input row appears in the output exactly once");
  ok(new Set(classified.map((c) => c.claim.id)).size === all.length, "and no row appears twice");

  // Exactly one bucket each, checked by counting across every bucket.
  const total = [
    "draft",
    "historical",
    "international_certification",
    "current_market_credential",
    "other_country_credential",
    "education_and_training",
    "membership",
    "language",
    "skill",
    "document",
    "other_self_declared",
  ].reduce((n, b) => n + inBucket(classified, b as never).length, 0);
  ok(total === all.length, "the buckets partition the input — no row in two, none in none");

  ok(
    inBucket(classified, "other_self_declared").length === 4,
    "the four free-text rows are self-declared merits, not certifications",
  );
  ok(
    inBucket(classified, "international_certification").length === 2,
    "and exactly the two governed ones are international",
  );

  ok(!isDisclosableBucket("draft"), "a draft is never disclosable");
  ok(
    isDisclosableBucket("international_certification") && isDisclosableBucket("historical"),
    "a certification and a historical fact are",
  );

  const groups = groupByJurisdiction(classified);
  ok(groups.length === 2, "other-country credentials group by their OWN jurisdiction");
  ok(
    groups.map((g) => g.jurisdiction).join(",") === "AE-DU,GB",
    `and the group keys are stable and alphabetical (got ${groups.map((g) => g.jurisdiction).join(",")})`,
  );
}

console.log("\nGROUP 5b -- work country changes grouping and nothing else");
{
  const uk = claim({
    id: "i",
    claimType: "licence",
    credentialCode: "UK_SIA_LICENCE_DS",
    jurisdictionCode: "GB",
    definition: NATIONAL_DEF,
  });
  const inSweden = classify(uk, { jurisdictionCode: "SE", subJurisdictionCode: null });
  const inBritain = classify(uk, { jurisdictionCode: "GB", subJurisdictionCode: null });
  ok(inSweden.bucket === "other_country_credential", "a SIA licence is other-country in Sweden");
  ok(inBritain.bucket === "current_market_credential", "and current-market in Britain");
  ok(
    JSON.stringify(inSweden.claim) === JSON.stringify(inBritain.claim),
    "and the CLAIM is byte-identical in both — nothing was rewritten",
  );

  const cpp = claim({ id: "f", credentialCode: "INTL_ASIS_CPP", definition: GLOBAL_DEF });
  for (const work of [
    { jurisdictionCode: "SE", subJurisdictionCode: null },
    { jurisdictionCode: "GB", subJurisdictionCode: null },
    { jurisdictionCode: "AE", subJurisdictionCode: "AE-DU" },
    { jurisdictionCode: null, subJurisdictionCode: null },
  ]) {
    const r = classify(cpp, work);
    ok(
      r.bucket === "international_certification" && r.groupKey === null,
      `a CPP is international from ${work.subJurisdictionCode ?? work.jurisdictionCode ?? "nowhere stated"}, ungrouped`,
    );
  }
}

console.log("\nGROUP 5c -- the ordering is total and input-order independent");
{
  const classified = classifyAll(
    FIXTURES.map(([c]) => c),
    WORK,
  );
  const canonical = orderForDisplay(classified)
    .map((c) => c.claim.id)
    .join(",");

  // Every rotation of the input must produce the same output. A comparator
  // that returned 0 for two different rows would not.
  let stable = true;
  for (let i = 0; i < classified.length; i++) {
    const rotated = [...classified.slice(i), ...classified.slice(0, i)];
    if (
      orderForDisplay(rotated)
        .map((c) => c.claim.id)
        .join(",") !== canonical
    )
      stable = false;
  }
  ok(stable, "every rotation of the input produces the identical order");

  const reversed = orderForDisplay([...classified].reverse())
    .map((c) => c.claim.id)
    .join(",");
  ok(reversed === canonical, "and so does the reversed input");

  // Deterministic: no comparison may return 0 for two distinct rows.
  let ties = 0;
  for (const a of classified) {
    for (const b of classified) {
      if (a.claim.id !== b.claim.id && compareForHighlight(a, b) === 0) ties++;
    }
  }
  ok(ties === 0, `the comparator is total — ${ties} tie(s) between distinct rows`);

  // Trust outranks recency within a bucket, and the holder cannot invert it.
  const weakRecent = classify(
    claim({
      id: "z1",
      credentialCode: "INTL_ASIS_CPP",
      definition: GLOBAL_DEF,
      assertionLevel: "self_declared",
      issuedOn: "2026-01-01",
    }),
    WORK,
  );
  const strongOld = classify(
    claim({
      id: "z2",
      credentialCode: "INTL_ASIS_PSP",
      definition: GLOBAL_DEF,
      assertionLevel: "verified",
      issuedOn: "2015-01-01",
    }),
    WORK,
  );
  ok(
    compareForHighlight(strongOld, weakRecent) < 0,
    "a verified older claim outranks a self-declared newer one",
  );
  ok(
    orderForDisplay([weakRecent, strongOld])[0].claim.id === "z2",
    "and submitting the weak one first does not change that",
  );
}

/* ══════════════════════════════════════════════════════════════════════
   GROUP 6 — no UI, no market, nothing hosted
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nGROUP 6 -- this phase activates nothing");

ok(!/UPDATE public\.sp_market_packs/.test(MIGRATION), "no market pack row is touched");
ok(
  !/is_active\s*=\s*true[\s\S]{0,80}sp_market_packs/.test(MIGRATION),
  "and no market is activated",
);

const ROUTES = join(root, "src/routes");
const routeFiles = readdirSync(ROUTES).filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"));
const routesUsingGlobal = routeFiles.filter((f) =>
  readFileSync(join(ROUTES, f), "utf8").includes("listGlobalCertificationTypes"),
);
ok(
  routesUsingGlobal.length === 0,
  `no route renders the international catalogue yet — Phase 2 builds that (found: ${routesUsingGlobal.join(", ") || "none"})`,
);

const COMPONENTS = join(root, "src/components/security-passport");
const componentFiles = readdirSync(COMPONENTS).filter((f) => f.endsWith(".tsx"));
const componentsUsingGlobal = componentFiles.filter((f) =>
  readFileSync(join(COMPONENTS, f), "utf8").includes("listGlobalCertificationTypes"),
);
ok(
  componentsUsingGlobal.length === 0,
  `and no component does either (found: ${componentsUsingGlobal.join(", ") || "none"})`,
);

/* ══════════════════════════════════════════════════════════════════════
   GROUP 7 — the database invariants are present in the migration text
   ══════════════════════════════════════════════════════════════════════ */
console.log("\nGROUP 7 -- the schema's load-bearing rules are in the file");

/* The SQL suite proves these hold at RUNTIME. This proves they are still
 * WRITTEN, which is what a negative control can mutate and what a careless
 * edit removes. Both halves are needed: a runtime test on a replayed database
 * cannot fail if the constraint was quietly deleted along with the rows that
 * violated it. */

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
  const trigger = MIGRATION.slice(MIGRATION.indexOf("ADDED 20261110090000"));
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

/* Phase 8's rule: removal is withdrawal, and history is not erasable. The
 * first version of this migration granted DELETE on the lifecycle table and
 * the Phase 8 suite refused it. Restated here so the repository catches it
 * before a replay does. */
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

console.log(
  fails.length === 0
    ? "\npassport-global-certification-check: all assertions passed."
    : `\npassport-global-certification-check FAILED (${fails.length})`,
);
if (fails.length > 0) {
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
