/**
 * Security Passport — the credential form contract.
 *
 * ── WHY THIS EXISTS ────────────────────────────────────────────────────
 *
 * The taxonomy decides what a credential asks for. `requires_issuer`,
 * `requires_valid_until`, `requires_scope` and `narrow_result_only` are
 * columns, and both the form and a database trigger read them — which is the
 * whole design, and is also exactly how the two can silently disagree.
 *
 * They did. Adding `requires_scope` to the Swedish skyddsvakt approval made the
 * database refuse a new SV claim without a scope, while the form still had no
 * scope field. Every attempt to record a skyddsvakt förordnande through the UI
 * would have failed with a constraint error, in a market that is live.
 *
 * So this asserts, for every credential in the taxonomy, that what the form
 * asks for is what the database will accept — and that every rule refuses the
 * thing it exists to refuse.
 *
 * Run: bun run passport-credential-form:check
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  CREDENTIAL_CODE_MAX_LENGTH,
  clearIncompatible,
  emptyCredentialDraft,
  fieldsFor,
  titleIsControlled,
  validateCredential,
  type CredentialDraft,
  type CredentialType,
} from "../src/lib/security-passport/credentials";
import { FIXTURE_CREDENTIAL_TYPES } from "../src/lib/security-passport/fixtures/credential-types";
import { passportCopy } from "../src/lib/security-passport/i18n";

let failures = 0;
let checks = 0;

function ok(condition: boolean, label: string) {
  checks += 1;
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}`);
  }
}

const keysFor = (type: CredentialType, draft: CredentialDraft, mode: "draft" | "active") =>
  validateCredential(draft, type, mode).map((e) => e.messageKey);

/** A draft that satisfies everything the taxonomy row asks for. Built FROM the
 *  row rather than hand-written per credential, so a credential added later is
 *  covered without editing this file. */
function completeDraft(type: CredentialType): CredentialDraft {
  const fields = fieldsFor(type);
  return {
    ...emptyCredentialDraft(),
    credentialCode: type.code,
    title: type.narrowResultOnly ? "" : type.nameSv,
    issuerName: fields.issuer ? "Fiktiv Myndighet" : "",
    jurisdictionCode: "SE",
    issuedOn: "2026-01-15",
    validUntil: fields.validUntil ? "2029-01-15" : null,
    authorisationScope: fields.scope ? "Skyddsobjekt: Fiktiv anläggning" : "",
  };
}

/* ------------------------------------------------------------------ */
/* The canonical SQL, not a handwritten mirror                         */
/* ------------------------------------------------------------------ */

/** Every credential code the migrations actually seed, and the CHECK the
 *  database enforces on them.
 *
 *  This guard used to read only `fixtures/credential-types.ts` — a mirror
 *  maintained by hand. That is precisely why A2 shipped: the database relaxed
 *  its code CHECK to 48 characters, the Zod schemas kept 16, and nothing
 *  compared them. `SE_PERSONNEL_APPROVAL` (21) ships ACTIVE in Sweden and
 *  could not be recorded at all.
 *
 *  So the source of truth here is the SQL. */
const MIGRATIONS_DIR = join(process.cwd(), "supabase/migrations");

function migrationSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n");
}

const SQL = migrationSql();

/** The LAST definition wins — migrations replay in filename order, and
 *  20260907091000 relaxes what 20260817160000 first declared. */
function canonicalCodeCheck(): { min: number; max: number } {
  const all = [...SQL.matchAll(/code\s*~\s*'\^\[A-Z0-9_\]\{(\d+),(\d+)\}\$'/g)];
  if (all.length === 0)
    throw new Error("No sp_credential_types code CHECK found in the migrations.");
  const last = all[all.length - 1];
  return { min: Number(last[1]), max: Number(last[2]) };
}

/** Codes seeded by any migration, from the INSERT column lists. Anchored on
 *  the quoted code in first position of each VALUES tuple. */
function seededCredentialCodes(): string[] {
  const codes = new Set<string>();
  const inserts = [...SQL.matchAll(/INSERT INTO public\.sp_credential_types[\s\S]*?ON CONFLICT/g)];
  for (const block of inserts) {
    for (const m of block[0].matchAll(/\(\s*'([A-Z][A-Z0-9_]{1,47})'\s*,/g)) codes.add(m[1]);
  }
  return [...codes].sort();
}

console.log("passport-credential-form-check\n");

console.log("GROUP 0 -- the app agrees with the canonical SQL about codes");

const check = canonicalCodeCheck();
ok(
  CREDENTIAL_CODE_MAX_LENGTH === check.max,
  `CREDENTIAL_CODE_MAX_LENGTH (${CREDENTIAL_CODE_MAX_LENGTH}) matches the database CHECK (${check.min}..${check.max})`,
);

const seeded = seededCredentialCodes();
ok(seeded.length >= 20, `parsed ${seeded.length} seeded credential codes from the migrations`);

const tooLongForApp = seeded.filter((c) => c.length > CREDENTIAL_CODE_MAX_LENGTH);
ok(
  tooLongForApp.length === 0,
  `every seeded code is accepted by the application cap` +
    (tooLongForApp.length ? ` — rejected: ${tooLongForApp.join(", ")}` : ""),
);

const tooLongForDb = seeded.filter((c) => c.length > check.max || c.length < check.min);
ok(
  tooLongForDb.length === 0,
  `every seeded code satisfies the database CHECK itself` +
    (tooLongForDb.length ? ` — violating: ${tooLongForDb.join(", ")}` : ""),
);

// The specific code that A2 made unrecordable, named so a regression is
// unmistakable rather than a count that quietly drops by one.
const longest = seeded.reduce((a, b) => (b.length > a.length ? b : a), "");
ok(
  seeded.includes("SE_PERSONNEL_APPROVAL"),
  "SE_PERSONNEL_APPROVAL is seeded (the credential A2 made unrecordable)",
);
ok(
  "SE_PERSONNEL_APPROVAL".length <= CREDENTIAL_CODE_MAX_LENGTH,
  `SE_PERSONNEL_APPROVAL (21 chars) is within the application cap`,
);
ok(
  longest.length <= CREDENTIAL_CODE_MAX_LENGTH,
  `the longest seeded code ${longest} (${longest.length}) is within the application cap`,
);

console.log("\nGROUP 0b -- the form mirror agrees with the canonical SQL");

/** The credentials, as the SQL declares them.
 *
 *  The mirror in fixtures/credential-types.ts is Sweden-only by design: the UK
 *  and Dubai packs ship inactive, so a form offering them would be a screen
 *  nobody can reach. This compares the two sets and the attributes that decide
 *  what the form ASKS FOR — the agreement B3 is about, and the one A2 shipped
 *  without. */
function seededCredentialRows(): Map<
  string,
  { requiresValidUntil: boolean; requiresIssuer: boolean; category: string; claimType: string }
> {
  const out = new Map<
    string,
    { requiresValidUntil: boolean; requiresIssuer: boolean; category: string; claimType: string }
  >();
  const row =
    /\(\s*'([A-Z][A-Z0-9_]*)'\s*,\s*'([a-z_]+)'\s*,\s*'(qualification|appointment)'\s*,\s*'(?:[^']|'')*'\s*,\s*'(?:[^']|'')*'\s*,\s*'[^']*'\s*,\s*(true|false)\s*,\s*(true|false)/g;
  for (const m of SQL.matchAll(row)) {
    out.set(m[1], {
      claimType: m[2],
      category: m[3],
      requiresValidUntil: m[4] === "true",
      requiresIssuer: m[5] === "true",
    });
  }
  return out;
}

/** Attributes turned on by a later UPDATE rather than in the INSERT.
 *
 *  Statement-scoped on purpose. The first attempt matched
 *  `narrow_result_only = true` then lazily ran to the first `WHERE code =`,
 *  which in the Swedish migration belongs to a SUBQUERY —
 *  `(SELECT id FROM sp_authorities WHERE code = 'SE_LANSSTYRELSEN')` — so it
 *  attributed the flag to the authority instead of the credential. The guard
 *  reported a mismatch that was entirely its own. */
function updatedFlag(flag: string): Set<string> {
  const out = new Set<string>();

  for (const stmt of SQL.split(";")) {
    if (!/UPDATE\s+public\.sp_credential_types/.test(stmt)) continue;
    if (!new RegExp(flag + "\\s*=\\s*true").test(stmt)) continue;

    // The statement's OWN predicate is the last one in it; anything earlier
    // belongs to a subquery.
    const targets = [...stmt.matchAll(/WHERE\s+code\s*(?:=\s*'([A-Z0-9_]+)'|IN\s*\(([^)]*)\))/g)];
    const last = targets[targets.length - 1];
    if (!last) continue;
    if (last[1]) out.add(last[1]);
    if (last[2]) for (const c of last[2].matchAll(/'([A-Z0-9_]+)'/g)) out.add(c[1]);
  }
  return out;
}

{
  const sqlCreds = seededCredentialRows();
  const scoped = updatedFlag("requires_scope");
  const narrow = updatedFlag("narrow_result_only");
  const mirror = new Map(FIXTURE_CREDENTIAL_TYPES.map((t) => [t.code, t]));

  const ghosts = [...mirror.keys()].filter((c) => !sqlCreds.has(c));
  ok(
    ghosts.length === 0,
    "every credential the form offers exists in the database" +
      (ghosts.length ? " — not seeded: " + ghosts.join(", ") : ""),
  );

  const swedish = [...sqlCreds.keys()].filter((c) => !c.startsWith("UK_") && !c.startsWith("AE_"));
  const missing = swedish.filter((c) => !mirror.has(c));
  ok(
    missing.length === 0,
    "every seeded Swedish credential is offered by the form" +
      (missing.length ? " — missing from the form: " + missing.join(", ") : ""),
  );

  const mismatched: string[] = [];
  for (const [code, sqlRow] of sqlCreds) {
    const m = mirror.get(code);
    if (!m) continue;
    if (m.requiresValidUntil !== sqlRow.requiresValidUntil)
      mismatched.push(code + ".requiresValidUntil");
    if (m.requiresIssuer !== sqlRow.requiresIssuer) mismatched.push(code + ".requiresIssuer");
    if (m.category !== sqlRow.category) mismatched.push(code + ".category");
    if (m.claimType !== sqlRow.claimType) mismatched.push(code + ".claimType");
    if (m.requiresScope !== scoped.has(code)) mismatched.push(code + ".requiresScope");
    if (m.narrowResultOnly !== narrow.has(code)) mismatched.push(code + ".narrowResultOnly");
  }
  ok(
    mismatched.length === 0,
    "the form and the database agree on every credential attribute" +
      (mismatched.length ? " — differing: " + mismatched.join(", ") : ""),
  );

  ok(scoped.has("SV"), "SV is parsed from the SQL as requiring a scope");
  ok(
    narrow.has("SE_PERSONNEL_APPROVAL"),
    "SE_PERSONNEL_APPROVAL is parsed from the SQL as narrow-result-only",
  );
}

console.log(
  `GROUP 1 -- every credential can actually be completed (${FIXTURE_CREDENTIAL_TYPES.length} types)`,
);

for (const type of FIXTURE_CREDENTIAL_TYPES) {
  const problems = keysFor(type, completeDraft(type), "active");
  ok(
    problems.length === 0,
    `${type.code}: a draft built from its own taxonomy row validates clean` +
      (problems.length ? ` — got ${problems.join(", ")}` : ""),
  );
}

console.log("\nGROUP 2 -- each rule refuses the thing it exists to refuse");

for (const type of FIXTURE_CREDENTIAL_TYPES) {
  const fields = fieldsFor(type);

  if (type.requiresIssuer) {
    ok(
      keysFor(type, { ...completeDraft(type), issuerName: "" }, "active").includes(
        "cred.error.authorityRequired",
      ),
      `${type.code}: without an authority it is refused with a field message`,
    );
  }

  if (type.requiresValidUntil) {
    ok(
      keysFor(type, { ...completeDraft(type), validUntil: null }, "active").includes(
        "cred.error.validUntilRequired",
      ),
      `${type.code}: without an end date it is refused`,
    );
  }

  if (type.requiresScope) {
    ok(fields.scope, `${type.code}: the form shows a scope field`);
    ok(
      keysFor(type, { ...completeDraft(type), authorisationScope: "" }, "active").includes(
        "cred.error.scopeRequired",
      ),
      `${type.code}: without a scope it is refused HERE, not by a database constraint`,
    );
  } else {
    ok(!fields.scope, `${type.code}: no scope field is shown for an unscoped credential`);
  }

  // ── The note: narrow-result credentials only ─────────────────────────
  //
  // A note on a register check is where the contents of the register would
  // arrive. Every other credential may carry one.
  if (type.narrowResultOnly) {
    ok(!fields.note, `${type.code}: the note field is hidden`);

    // Binds a DRAFT too, exactly as the database does. A draft that has
    // already stored register commentary has already done the harm.
    for (const mode of ["draft", "active"] as const) {
      ok(
        keysFor(type, { ...completeDraft(type), holderNote: "Anmärkning" }, mode).includes(
          "cred.error.noNoteAllowed",
        ),
        `${type.code}: a note is refused in ${mode} mode`,
      );
    }
  } else {
    ok(fields.note, `${type.code}: an ordinary credential still offers a note`);
  }

  // ── The title: EVERY governed credential ─────────────────────────────
  //
  // This block used to sit inside the narrow-result branch, and that was the
  // defect. A pilot tester chose Skyddsvaktsförordnande — which is not a
  // narrow result — typed "Bajskorv" into Benämning and saved it. Six of the
  // eight Swedish credentials had a freely writable name.
  //
  // `titleIsControlled` is the rule now, and it is asked of every type in the
  // fixture set rather than of a subset, so a credential added later cannot
  // quietly fall outside it: the column DEFAULTs to controlled and this
  // asserts what that means in the form.
  if (titleIsControlled(type)) {
    ok(!fields.title, `${type.code}: the title is not an input`);

    // THE REGRESSION, by name. Both modes: a draft holding a renamed
    // authorisation has already recorded the wrong thing.
    for (const mode of ["draft", "active"] as const) {
      ok(
        keysFor(type, { ...completeDraft(type), title: "Bajskorv" }, mode).includes(
          "cred.error.controlledLabelOnly",
        ),
        `${type.code}: an arbitrary title is refused in ${mode} mode`,
      );
    }
    ok(
      keysFor(type, { ...completeDraft(type), title: "Omskriven benämning" }, "active").includes(
        "cred.error.controlledLabelOnly",
      ),
      `${type.code}: a reworded title is refused`,
    );
    ok(
      keysFor(type, { ...completeDraft(type), title: type.nameEn }, "active").length === 0,
      `${type.code}: POSITIVE CONTROL its own English label is accepted`,
    );
    ok(
      keysFor(type, { ...completeDraft(type), title: type.nameSv }, "active").length === 0,
      `${type.code}: POSITIVE CONTROL its own Swedish label is accepted`,
    );
    // A controlled title is never the holder's to supply, so it is never
    // theirs to be missing either — demanding one would demand it of a field
    // the form does not offer.
    ok(
      !keysFor(type, { ...completeDraft(type), title: "" }, "active").includes(
        "cred.error.titleRequired",
      ),
      `${type.code}: a blank controlled title is not reported as a missing field`,
    );
  } else {
    ok(fields.title, `${type.code}: a holder-written title is an input`);
    ok(
      keysFor(type, { ...completeDraft(type), title: "" }, "active").includes(
        "cred.error.titleRequired",
      ),
      `${type.code}: a holder-written title is still required`,
    );
  }
}

// ── The whole shipped vocabulary is controlled ─────────────────────────
//
// The per-type assertions above are conditional, so a fixture set that
// accidentally set `titleIsHolderWritten: true` everywhere would take the
// other branch and still pass. This is the unconditional statement: nothing
// CQrityjob ships today lets a holder name a regulated authorisation.
ok(
  FIXTURE_CREDENTIAL_TYPES.every((t) => titleIsControlled(t)),
  `every shipped credential is named by its definition (${FIXTURE_CREDENTIAL_TYPES.length} checked)`,
);

console.log("\nGROUP 3 -- switching credential type drops what no longer applies");

// A holder fills in everything the most demanding credential asks for, then
// changes their mind. Nothing they typed for the old one may survive into the
// new one unless the new one asks for it too.
const scoped = FIXTURE_CREDENTIAL_TYPES.find((t) => t.requiresScope);
const narrow = FIXTURE_CREDENTIAL_TYPES.find((t) => t.narrowResultOnly);
const plainCourse = FIXTURE_CREDENTIAL_TYPES.find(
  (t) => !t.requiresScope && !t.requiresValidUntil && !t.narrowResultOnly,
);

ok(Boolean(scoped && narrow && plainCourse), "the fixture set covers all three shapes");

if (scoped && narrow && plainCourse) {
  const filled: CredentialDraft = {
    ...completeDraft(scoped),
    holderNote: "En anteckning",
    credentialReference: "DNR-1",
  };

  // The leak that mattered most: a course carrying a scope and an expiry.
  const asCourse = clearIncompatible({ ...filled, credentialCode: plainCourse.code }, plainCourse);
  ok(
    asCourse.authorisationScope === "",
    `${scoped.code} → ${plainCourse.code}: the scope is dropped, not merely hidden`,
  );
  ok(
    asCourse.validUntil === null,
    `${scoped.code} → ${plainCourse.code}: the end date is dropped — a course has no expiry to fabricate`,
  );
  ok(
    asCourse.holderNote === "En anteckning",
    `${scoped.code} → ${plainCourse.code}: POSITIVE CONTROL a field the new type DOES ask for survives`,
  );
  ok(
    keysFor(plainCourse, asCourse, "active").length === 0,
    `${scoped.code} → ${plainCourse.code}: the cleaned draft validates clean`,
  );

  // Switching INTO a narrow-result credential: the retained note is refused by
  // both the validator and the database, so leaving it would show the holder an
  // error about a field the form is no longer displaying.
  const asNarrow = clearIncompatible({ ...filled, credentialCode: narrow.code }, narrow);
  ok(
    asNarrow.holderNote === "",
    `${scoped.code} → ${narrow.code}: the note is dropped rather than left to be refused`,
  );
  ok(
    keysFor(narrow, asNarrow, "active").length === 0,
    `${scoped.code} → ${narrow.code}: the cleaned draft validates clean`,
  );

  // MUTATION: without the clean, the same switch is invalid on a hidden field.
  const uncleaned = { ...filled, credentialCode: narrow.code };
  ok(
    keysFor(narrow, uncleaned, "active").includes("cred.error.noNoteAllowed"),
    `${scoped.code} → ${narrow.code}: MUTATION without clearing, the draft is invalid on a hidden field`,
  );
}

console.log("\nGROUP 4 -- a draft stays savable while incomplete");

for (const type of FIXTURE_CREDENTIAL_TYPES) {
  const bare = { ...emptyCredentialDraft(), credentialCode: type.code };
  const problems = keysFor(type, bare, "draft");
  ok(
    problems.length === 0,
    `${type.code}: an empty draft saves without complaint` +
      (problems.length ? ` — got ${problems.join(", ")}` : ""),
  );
}

console.log("\nGROUP 5 -- validity ordering is caught HERE, not by the constraint");

// The database rule is strict:
//
//     sp_claim_validity_ordered
//       CHECK (valid_until IS NULL OR valid_from IS NULL
//              OR valid_until > valid_from)
//
// The form's check used `<`, so two EQUAL dates passed validation, reached the
// insert, and surfaced as the constraint violation's generic "Something went
// wrong. Please try again." — naming no field and giving no reason. These
// assertions pin the form to the same strictness as the constraint, in both
// modes, so the database goes back to being the last line of defence rather
// than the first thing to notice.
{
  const dateType =
    FIXTURE_CREDENTIAL_TYPES.find((t) => t.requiresValidUntil) ?? FIXTURE_CREDENTIAL_TYPES[0];
  const withDates = (validFrom: string, validUntil: string): CredentialDraft => ({
    ...emptyCredentialDraft(),
    credentialCode: dateType.code,
    validFrom,
    validUntil,
  });

  for (const mode of ["draft", "active"] as const) {
    ok(
      keysFor(dateType, withDates("2026-01-01", "2026-01-01"), mode).includes(
        "cred.error.endBeforeStart",
      ),
      `${mode}: equal validFrom/validUntil is refused by the form, as the constraint would`,
    );
    ok(
      keysFor(dateType, withDates("2026-06-01", "2026-01-01"), mode).includes(
        "cred.error.endBeforeStart",
      ),
      `${mode}: an end date before the start date is refused`,
    );
    ok(
      !keysFor(dateType, withDates("2026-01-01", "2026-01-02"), mode).includes(
        "cred.error.endBeforeStart",
      ),
      `${mode}: one day of validity is still accepted`,
    );
  }

  // The message has to be true of the rule it now enforces: "cannot be before"
  // invites exactly the equal-date entry the constraint rejects.
  for (const lang of ["sv", "en"] as const) {
    const copy = passportCopy[lang]["cred.error.endBeforeStart"];
    ok(
      /(efter|after)/i.test(copy),
      `${lang}: the message says the end date must be AFTER the start date`,
    );
  }
}

console.log("");
if (failures > 0) {
  console.error(`passport-credential-form-check FAILED (${failures} of ${checks}).`);
  process.exit(1);
}
console.log(`passport-credential-form-check: ${checks} assertions passed.`);
