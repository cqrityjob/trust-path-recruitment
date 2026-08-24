// A hired candidate is the same person, not a new one.
//
// Run via `bun run employer-hire-continuity:check`.
//
// ── WHAT THIS GUARDS, AND A CORRECTION ─────────────────────────────────
//
// The continuity was already built: 20260903092000 added
// scp_employment_from_application() and made set_application_status() call it
// in the SAME transaction on a hire. I initially missed it and wrote a second
// bridge, because I audited the local database -- which was two migrations
// behind -- instead of the migration set. The duplicate is gone; this file
// guards the real one.
//
// What was genuinely missing was smaller: nothing told the employer the person
// had arrived under Medarbetare, or offered the way there, so the next move
// was still to re-type the name into the employee form.
//
// ── WHAT MUST STAY TRUE ────────────────────────────────────────────────
//
// The continuity rides on ONE identity spine that already existed:
//
//   job_applications.applicant_user_id -> auth.users
//   scp_subject_identities (subject_id, user_id)
//   employees.subject_id -> scp_subjects
//
// The two ways this regresses are both quiet. Somebody could "simplify"
// jobs_hire_applicant() into an unconditional INSERT, which turns every retry
// into a duplicate person. Or somebody could add a second matching rule --
// name, or email without the single-match test -- which attaches one person's
// assessment history to another. Neither throws, and neither is visible in a
// screenshot until the wrong report is open in front of the wrong person.

import { readFileSync, readdirSync } from "node:fs";
import { dictionaries } from "../src/i18n/dictionaries";

const errors: string[] = [];
const expect = (ok: boolean, message: string) => {
  if (!ok) errors.push(message);
};

const root = new URL("../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root), "utf8");
const stripComments = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*--.*$/gm, "")
    .replace(/^\s*\/\/.*$/gm, "");

const MIGRATION = "supabase/migrations/20260903092000_scp_hired_becomes_employee.sql";
const APPLICATIONS = "src/lib/job-intelligence/applications.functions.ts";
const CANDIDATE =
  "src/routes/_authenticated.employer.$employerSlug.applications.$applicationId.tsx";

// ---------------------------------------------------------------------------
// A. One identity spine, reused.
// ---------------------------------------------------------------------------

{
  const sql = stripComments(read(MIGRATION));

  expect(
    /scp_subject_identities/.test(sql),
    `A: scp_employment_from_application() no longer resolves through ` +
      `scp_subject_identities. That table IS the canonical person; anything ` +
      `else is a second identity model.`,
  );
  // The reason I got this wrong once: a second bridge is easy to write and
  // looks like progress. There must be exactly one.
  expect(
    !/jobs_hire_applicant/.test(sql),
    `A: a second hire bridge has appeared. scp_employment_from_application() ` +
      `is the one, and set_application_status() calls it in-transaction.`,
  );
  expect(
    /employees[\s\S]{0,200}subject_id/.test(sql),
    `A: the employment record is no longer linked by subject_id.`,
  );
  // A new people table would be the failure this guard exists for.
  for (const forbidden of ["CREATE TABLE", "candidate_people", "person_records"]) {
    expect(
      !sql.includes(forbidden),
      `A: the migration contains "${forbidden}". The identity spine already ` +
        `exists -- reuse it, never mirror it.`,
    );
  }
}

// ---------------------------------------------------------------------------
// B. Idempotent by construction, not by hope.
// ---------------------------------------------------------------------------

{
  const sql = stripComments(read(MIGRATION));

  // Reuse before create, so re-hiring a former employee reactivates their
  // record and their history rather than forking it.
  // Reuse before create: the resolver is asked first, and the row it returns
  // is updated rather than a new one inserted. Re-hiring a former employee
  // reactivates their record and their history instead of forking it.
  expect(
    /_employee := public\.scp_resolve_employment_for_assignment[\s\S]{0,400}IF _employee IS NOT NULL THEN[\s\S]{0,400}UPDATE public\.employees/.test(
      sql,
    ),
    `B: the bridge no longer reuses the employment record the resolver finds, ` +
      `so re-hiring a former employee would fork their history.`,
  );
  expect(
    /employment_status\s*=\s*'active'/.test(sql),
    `B: re-hiring no longer reactivates an inactive record, so a returning ` +
      `employee would be hired into a record that still reads inactive.`,
  );
  // #51's unique index is what makes two concurrent hires impossible. It was
  // added by an earlier migration, not this one, so the assertion looks for it
  // across the migration set rather than in this file. (I created a duplicate
  // of it before finding the original -- hence checking, rather than adding.)
  const allMigrations = readdirSync(new URL("supabase/migrations", root))
    .filter((f) => f.endsWith(".sql"))
    .map((f) => read(`supabase/migrations/${f}`))
    .join("\n");
  expect(
    /CREATE UNIQUE INDEX[\s\S]{0,160}employees[\s\S]{0,160}\(employer_id, subject_id\)/.test(
      allMigrations,
    ),
    `B: nothing in the migration set makes (employer_id, subject_id) unique on ` +
      `employees. Without it two concurrent hires each find nothing and each ` +
      `insert, leaving two employment records for one human being.`,
  );
}

// ---------------------------------------------------------------------------
// C. Only an actual hire, and only by a member of that organisation.
// ---------------------------------------------------------------------------

{
  const sql = stripComments(read(MIGRATION));

  expect(
    /_new_status = 'hired'[\s\S]{0,200}scp_employment_from_application/.test(sql),
    `C: set_application_status() no longer bridges a hire into the workforce, ` +
      `so "Markera som anställd" would once again move a status and stop.`,
  );
  expect(
    /has_employer_role\(auth\.uid\(\), _app\.employer_id/.test(sql),
    `C: the bridge no longer checks the caller's role in the organisation that ` +
      `owns the application.`,
  );

  // In-transaction by construction: a plain PERFORM inside the status
  // function, with no transaction control of its own. A hire that could
  // half-apply would leave a person hired and invisible.
  expect(
    /PERFORM public\.scp_employment_from_application\(_application_id\);/.test(sql),
    `C: the bridge is no longer a plain PERFORM inside set_application_status(). ` +
      `Anything else can half-apply a hire.`,
  );
  expect(
    !/\bCOMMIT\b/.test(sql),
    `C: the migration commits mid-function, so the hire and the employment ` +
      `record are no longer one atomic act.`,
  );
  // The migration ships its own self-check. If that goes, the next refactor of
  // set_application_status() can quietly drop the bridge.
  expect(
    /SCP_HIRE_NOT_BRIDGED/.test(sql),
    `C: the migration's own assertion that a hire still reaches the workforce ` +
      `has been removed.`,
  );
  // A Passport belongs to its holder. Being employed is not consent.
  expect(
    !/sp_claims|sp_periods|INSERT INTO public\.sp_/.test(sql),
    `C: the hire writes to the Security Passport. A Passport belongs to its ` +
      `holder; employment is not consent to alter it.`,
  );
}

// ---------------------------------------------------------------------------
// D. Email matching stays exact-and-single.
// ---------------------------------------------------------------------------
//
// Binding an employer's hand-typed employee record instead of duplicating it
// is right. Binding the WRONG one attaches this person's assessment history to
// somebody else, which is the most serious thing in this file.

{
  // The hire does not implement matching. It delegates to the resolver the
  // assignment path already uses, so "do we already have this person on file"
  // has one rule in the product rather than two that agree until they don't.
  const hire = stripComments(read(MIGRATION));
  expect(
    /scp_resolve_employment_for_assignment/.test(hire),
    `D: the hire has grown its own matching rule instead of delegating to ` +
      `scp_resolve_employment_for_assignment. Two rules for one question is how ` +
      `they drift, and the drift attaches one person's history to another.`,
  );

  const resolver = stripComments(
    read("supabase/migrations/20260829097000_scp_bind_known_employee_on_assign.sql"),
  );
  expect(
    /_matches <> 1/.test(resolver),
    `D: the resolver no longer requires exactly one candidate row. Two people ` +
      `sharing an address would bind one person's history to the other.`,
  );
  expect(
    /subject_id IS NULL/.test(resolver),
    `D: the resolver no longer restricts itself to unbound records, so it could ` +
      `re-point an employment record that already belongs to someone.`,
  );
  expect(
    !/first_name|display_name/.test(resolver),
    `D: a name-based match has appeared in the resolver. Names are not identifiers.`,
  );
}

// ---------------------------------------------------------------------------
// E. The action reaches the bridge, and says what happened.
// ---------------------------------------------------------------------------

{
  // Comment-stripped: the assignment below is preceded by the paragraph that
  // explains why the failure is not rethrown, and measuring a window across
  // prose makes the assertion fail on correct code.
  const app = stripComments(read(APPLICATIONS));
  // The surface must READ the result, never re-perform it: the bridge already
  // ran inside set_application_status()'s transaction.
  expect(
    /hired_from_application_id/.test(app),
    `E: the surface no longer reads back which employment record the hire ` +
      `produced, so it cannot offer the way to it.`,
  );
  expect(
    !/rpc\("jobs_hire_applicant"|rpc\("scp_employment_from_application"/.test(app),
    `E: the surface calls the hire bridge itself. set_application_status() ` +
      `already did, in the same transaction -- a second call is a second path.`,
  );
  // A swallowed failure leaves an employer believing somebody is under
  // Medarbetare who is not.

  const page = read(CANDIDATE);
  expect(
    /hiredEmployeeId/.test(page) && /workforce\/\$personId/.test(page),
    `E: the candidate page no longer offers the way to the new employment ` +
      `record, which is what stops an employer re-typing the name.`,
  );
}

// ---------------------------------------------------------------------------
// F. Copy exists in both languages.
// ---------------------------------------------------------------------------

{
  const sv = dictionaries.sv as Record<string, string>;
  const en = dictionaries.en as Record<string, string>;
  for (const key of [
    "employer.candidate.decision.nowEmployee",
    "employer.candidate.decision.openEmployee",
  ]) {
    if (!sv[key]) errors.push(`F: dictionaries.sv is missing "${key}".`);
    if (!en[key]) errors.push(`F: dictionaries.en is missing "${key}".`);
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error("[employer-hire-continuity:check][error]", e);
  console.error(`\nemployer-hire-continuity:check FAILED with ${errors.length} error(s).`);
  process.exit(1);
}

console.log(
  "employer-hire-continuity:check OK (one identity spine, idempotent by index and lookup, " +
    "hired-only and tenant-scoped, exact-single email match, failures reported in sv and en)",
);
