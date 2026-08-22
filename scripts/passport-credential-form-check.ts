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

import {
  clearIncompatible,
  emptyCredentialDraft,
  fieldsFor,
  validateCredential,
  type CredentialDraft,
  type CredentialType,
} from "../src/lib/security-passport/credentials";
import { FIXTURE_CREDENTIAL_TYPES } from "../src/lib/security-passport/fixtures/credential-types";

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

console.log("passport-credential-form-check\n");
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

  if (type.narrowResultOnly) {
    ok(!fields.note, `${type.code}: the note field is hidden`);
    ok(!fields.title, `${type.code}: the title field is hidden`);

    // Both bind a DRAFT, exactly as the database does. A draft that has
    // already stored register commentary has already done the harm.
    for (const mode of ["draft", "active"] as const) {
      ok(
        keysFor(type, { ...completeDraft(type), holderNote: "Anmärkning" }, mode).includes(
          "cred.error.noNoteAllowed",
        ),
        `${type.code}: a note is refused in ${mode} mode`,
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
  } else {
    ok(fields.note, `${type.code}: an ordinary credential still offers a note`);
    ok(
      keysFor(type, { ...completeDraft(type), title: "" }, "active").includes(
        "cred.error.titleRequired",
      ),
      `${type.code}: an ordinary credential still requires a title`,
    );
  }
}

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

console.log("");
if (failures > 0) {
  console.error(`passport-credential-form-check FAILED (${failures} of ${checks}).`);
  process.exit(1);
}
console.log(`passport-credential-form-check: ${checks} assertions passed.`);
