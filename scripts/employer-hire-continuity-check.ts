// A hired candidate is the same person, not a new one.
//
// Run via `bun run employer-hire-continuity:check`.
//
// ── WHAT WAS BROKEN ────────────────────────────────────────────────────
//
// "Markera som anställd" moved job_applications.status to 'hired' and stopped.
// The person stayed a candidate forever, never appeared under Medarbetare, and
// an employer who wanted them there re-typed their name into the employee form
// -- producing a second record of one human being with no link to the
// application, the assessment history or the Passport.
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

import { readFileSync } from "node:fs";
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

const MIGRATION = "supabase/migrations/20260909091000_jobs_hire_applicant_continuity.sql";
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
    `A: jobs_hire_applicant() no longer resolves through scp_subject_identities. ` +
      `That table IS the canonical person; anything else is a second identity model.`,
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

  // The lookup handles the ordinary repeat.
  expect(
    /SELECT e\.id INTO _employee[\s\S]{0,240}RETURN _employee;/.test(sql),
    `B: jobs_hire_applicant() no longer returns an existing employment record ` +
      `before inserting. Pressing the button twice would create two people.`,
  );
  // The index handles what the lookup cannot: two concurrent hires.
  expect(
    /CREATE UNIQUE INDEX[\s\S]{0,200}employees[\s\S]{0,120}\(employer_id, subject_id\)/.test(sql),
    `B: the unique index on (employer_id, subject_id) is gone. The lookup alone ` +
      `loses a race between two concurrent hires, and the duplicate it leaves ` +
      `behind is a second record of one human being.`,
  );
  expect(
    /WHERE subject_id IS NOT NULL/.test(sql),
    `B: the index is no longer partial. subject_id is NULLable on purpose -- an ` +
      `employer may add employees who have no account, and several of those ` +
      `must stay legal.`,
  );
  expect(
    /ON CONFLICT[\s\S]{0,120}DO NOTHING/.test(sql),
    `B: the insert no longer tolerates the race it is guarded against, so a ` +
      `concurrent hire raises instead of returning the other transaction's row.`,
  );
}

// ---------------------------------------------------------------------------
// C. Only an actual hire, and only by a member of that organisation.
// ---------------------------------------------------------------------------

{
  const sql = stripComments(read(MIGRATION));

  expect(
    /_app\.status <> 'hired'/.test(sql),
    `C: jobs_hire_applicant() no longer requires the application to be hired. ` +
      `It could then manufacture an employee for somebody who was not hired.`,
  );
  expect(
    /employer_memberships[\s\S]{0,200}auth\.uid\(\)[\s\S]{0,120}'active'/.test(sql),
    `C: the membership check is gone or no longer requires active membership.`,
  );
  expect(
    /a\.employer_id = _employer_id/.test(sql),
    `C: the application is no longer loaded scoped to the employer, so an ` +
      `application id from another tenant could be hired.`,
  );
  // set_application_status owns the lifecycle; this must not move a status.
  expect(
    !/UPDATE public\.job_applications/.test(sql),
    `C: jobs_hire_applicant() writes to job_applications. set_application_status() ` +
      `is the single authority on the recruitment lifecycle.`,
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
  const sql = stripComments(read(MIGRATION));
  expect(
    /_matches = 1/.test(sql),
    `D: the email match no longer requires exactly one candidate row. Two ` +
      `people sharing an address would bind one person's history to the other.`,
  );
  expect(
    /subject_id IS NULL/.test(sql),
    `D: the email match no longer restricts itself to unbound records, so it ` +
      `could re-point an employment record that already belongs to someone.`,
  );
  expect(
    !/first_name[\s\S]{0,60}=[\s\S]{0,60}display_name|lower\(btrim\(e\.first_name\)\)/.test(sql),
    `D: a name-based match has appeared. Names are not identifiers.`,
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
  expect(
    /rpc\("jobs_hire_applicant"/.test(app),
    `E: updateApplicationStatusAsEmployer no longer calls jobs_hire_applicant, ` +
      `so hiring is back to moving a status and stopping.`,
  );
  expect(
    /status === "hired"/.test(app),
    `E: the bridge is no longer conditional on the hired transition.`,
  );
  // A swallowed failure leaves an employer believing somebody is under
  // Medarbetare who is not.
  // The flag has to be SET, not merely declared. Checking for the identifier
  // passed while the assignment inside the error branch had been removed --
  // which is exactly the silent-swallow this assertion exists to catch.
  expect(
    /hireErr\)[\s\S]{0,320}continuityFailed = true/.test(app),
    `E: a failed workforce link no longer sets continuityFailed, so the employer ` +
      `would believe the person is under Medarbetare when they are not.`,
  );
  expect(
    /return \{[\s\S]{0,400}continuityFailed,/.test(app),
    `E: continuityFailed is no longer returned to the surface that reports it.`,
  );

  const page = read(CANDIDATE);
  expect(
    /hiredEmployeeId/.test(page) && /workforce\/\$personId/.test(page),
    `E: the candidate page no longer offers the way to the new employment ` +
      `record, which is what stops an employer re-typing the name.`,
  );
  expect(
    /employer\.applications\.error\.hireContinuity/.test(page),
    `E: the candidate page no longer surfaces a failed workforce link.`,
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
    "employer.applications.error.hireContinuity",
  ]) {
    if (!sv[key]) errors.push(`F: dictionaries.sv is missing "${key}".`);
    if (!en[key]) errors.push(`F: dictionaries.en is missing "${key}".`);
  }
  // Retrying is the fix, so the message has to say so.
  expect(
    /igen/i.test(sv["employer.applications.error.hireContinuity"] ?? ""),
    `F: the sv continuity failure does not tell the employer to try again, ` +
      `which is the whole reason the action was made idempotent.`,
  );
  expect(
    /again/i.test(en["employer.applications.error.hireContinuity"] ?? ""),
    `F: the en continuity failure does not tell the employer to try again.`,
  );
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
