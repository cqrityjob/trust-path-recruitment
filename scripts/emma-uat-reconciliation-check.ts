// Emma's twelve points, each tied to the thing that keeps it fixed.
//
// Run via `bun run emma-uat:check`.
//
// ── WHY A RECONCILIATION FILE ───────────────────────────────────────────
//
// Twelve findings from one real user, closed across five subsystems, eight
// commits and four migrations. The risk now is not that a fix breaks -- each
// has its own guard for that -- it is that a fix gets quietly undone by
// somebody who never saw the feedback, and nothing in the repository connects
// the code back to the person who asked for it.
//
// So this file is the index. Every point names where it lives and what proves
// it, and it fails if the trail goes cold. It deliberately asserts THIN --
// existence and wiring, not behaviour -- because the behaviour is asserted by
// the nine guards it points at, and a second copy of those assertions would
// be a second thing to keep true.
//
// ── WHAT IT DOES NOT CLAIM ──────────────────────────────────────────────
//
// #6 is AI-READY, not AI. scp_ai_providers has 'anthropic' registered with
// is_enabled = false and there is no credential in this environment, so
// nothing calls a model. The contract, the validation, the audit binding and
// the human-confirmation flow exist and are tested; the execution is
// deliberately absent and this file asserts that it stays absent.

import { readFileSync, existsSync } from "node:fs";
import { dictionaries } from "../src/i18n/dictionaries";

const errors: string[] = [];
const expect = (point: string, ok: boolean, message: string) => {
  if (!ok) errors.push(`#${point}: ${message}`);
};

const root = new URL("../", import.meta.url);
const read = (p: string) =>
  existsSync(new URL(p, root)) ? readFileSync(new URL(p, root), "utf8") : "";

/** Source with comments removed.
 *
 *  Used for every assertion that looks for the ABSENCE of something. Three
 *  guards in this workstream have now failed on the comment explaining the
 *  rule they assert -- a comment saying "window.location.href used to be here"
 *  reads identically to the code being there. A guard that fails on correct
 *  code trains its author to weaken it, so the stripping is the default and
 *  not an afterthought. */
const readCode = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^\s*--.*$/gm, "");
const sv = dictionaries.sv as Record<string, string>;
const en = dictionaries.en as Record<string, string>;

/** Every guard this reconciliation delegates to. If one disappears, the point
 *  it covers is unprotected however good the code still looks. */
const GUARDS = [
  "scripts/employer-job-lifecycle-check.ts",
  "scripts/employer-hire-continuity-check.ts",
  "scripts/employer-other-taxonomy-check.ts",
  "scripts/review-proposal-contract-check.ts",
  "scripts/candidate-notification-check.ts",
  "scripts/employer-decision-error-check.ts",
  "scripts/passport-recipient-card-check.tsx",
  "scripts/recruitment-report-render-check.tsx",
  "scripts/employer-library-purpose-check.ts",
];
for (const g of GUARDS) {
  expect("guards", read(g).length > 0, `${g} is missing, so whatever it covered is unguarded.`);
}
{
  const pkg = read("package.json");
  for (const g of GUARDS) {
    expect(
      "guards",
      pkg.includes(g),
      `${g} is not registered in package.json, so nothing runs it.`,
    );
  }

  // Registered is not the same as run. Five of these guards existed for a
  // week without being wired into the workflow, which meant the invariants
  // they encode were only ever checked by whoever remembered to run them.
  const ci = read(".github/workflows/ci.yml");
  for (const script of [
    "employer-job-lifecycle:check",
    "employer-hire-continuity:check",
    "employer-other-taxonomy:check",
    "review-proposal-contract:check",
    "candidate-notification:check",
    "emma-uat:check",
  ]) {
    expect(
      "guards",
      ci.includes(script),
      `${script} is registered but not in the CI workflow, so it runs only on ` +
        `the machine of whoever remembers.`,
    );
  }
}

// ---------------------------------------------------------------------------
// #1  Add employee CTA on the employer overview            DONE (PR #87)
// ---------------------------------------------------------------------------
{
  const overview = read("src/routes/_authenticated.employer.$employerSlug.index.tsx");
  expect("1", overview.includes("employer.workforce.action.add"), "the Overview CTA is gone.");
  expect(
    "1",
    /search: \{ add: true as const \}/.test(overview),
    "the CTA no longer opens the form the workforce page owns, so a second " +
      "creation flow is the only way it can still work.",
  );
}

// ---------------------------------------------------------------------------
// #2 / #3  Close, delete and closed jobs                   DONE
// ---------------------------------------------------------------------------
{
  const fns = readCode("src/lib/job-intelligence/employer-jobs.functions.ts");
  // The behaviour, not just the wiring: the refusals, the cascade, the
  // notification dedupe and the Annat constraints are asserted against a real
  // database in supabase/tests/employer_job_lifecycle_test.sql. A guard over
  // source text cannot prove that a delete leaves the applications alone.
  expect(
    "3",
    read("supabase/tests/employer_job_lifecycle_test.sql").includes("JOB_HAS_APPLICATIONS"),
    "the database suite that proves the cascade guard is gone.",
  );
  expect(
    "3",
    read("scripts/db-test.sh").includes("supabase/tests/employer_job_lifecycle_test.sql"),
    "the database suite exists but db-test.sh no longer runs it.",
  );
  expect("2", !/export const archiveEmployerJob/.test(fns), "the duplicate archive path is back.");
  expect("3", /export const deleteEmployerJob/.test(fns), "a draft can no longer be deleted.");
  expect(
    "3",
    read("supabase/migrations/20260909090000_jobs_delete_unpublished_draft.sql").includes(
      "JOB_HAS_APPLICATIONS",
    ),
    "the guarded delete function is gone; job_applications cascades from jobs.",
  );
  for (const [lang, d] of [
    ["sv", sv],
    ["en", en],
  ] as const) {
    expect(
      "2",
      !/arkiv|archiv/i.test(d["employer.jobs.list.filterArchived"] ?? ""),
      `the ${lang} closed-jobs view is called an archive again.`,
    );
  }
  expect(
    "2",
    read("src/components/employer/ConfirmAction.tsx").length > 0,
    "the product dialog is gone, so confirmation is the browser's again.",
  );
  // The only destructive action in the product, and the audit vocabulary that
  // has to contain the word for it. writeAudit() swallows a rejected insert,
  // so this failure would be completely silent.
  expect(
    "3",
    read("supabase/migrations/20260909094000_job_audit_vocabulary_lifecycle.sql").includes(
      "'deleted'",
    ),
    "a permanent delete can no longer be recorded in the audit trail.",
  );
}

// ---------------------------------------------------------------------------
// #4  Annat / Other                                        DONE
// ---------------------------------------------------------------------------
{
  const model = read("src/components/employer/job-form/model.ts");
  expect("4", /OTHER_OPTION/.test(model), "the Other selection is gone.");
  expect(
    "4",
    (sv["employer.jobs.form.option.other"] ?? "") !== (sv["employer.jobs.form.option.none"] ?? ""),
    "Annat and Ej angivet have been collapsed back into one answer.",
  );
  expect(
    "4",
    read("supabase/migrations/20260909092000_jobs_other_profession_selection.sql").includes(
      "jobs_family_other_excludes_id",
    ),
    "the constraints keeping Annat out of the canonical taxonomy are gone.",
  );
}

// ---------------------------------------------------------------------------
// #5a  Passport internal URL         DONE (PR #87)
// #5b  Candidate communication       DONE
// ---------------------------------------------------------------------------
{
  const panel = readCode("src/components/employer/ApplicationPassportPanel.tsx");
  expect(
    "5a",
    !/window\.location\.href/.test(panel),
    "the internal deep link is back on the card.",
  );
  expect(
    "5b",
    read("src/lib/email/send-application-status-email.server.ts").length > 0,
    "candidate status notifications are gone.",
  );
  expect(
    "5b",
    read("supabase/migrations/20260909093000_application_status_notifications.sql").includes(
      "jase_notification_payload",
    ),
    "the notification payload and audit functions are gone.",
  );
}

// ---------------------------------------------------------------------------
// #6  AI-assisted review     AI-READY — EXECUTION DISABLED
// ---------------------------------------------------------------------------
{
  const contract = read("src/lib/security-competency/review-proposal.ts");
  expect("6", contract.length > 0, "the proposal contract is gone.");
  expect("6", /validateProposal/.test(contract), "server-side validation is gone.");
  expect("6", /deriveOutcome/.test(contract), "the human-confirmation audit is gone.");

  // The whole point of this classification: no execution.
  const src = [
    readCode("src/lib/security-competency/review-proposal.ts"),
    readCode("src/components/academy/ReviewQueue.tsx"),
  ].join("\n");
  for (const forbidden of [
    "api.anthropic.com",
    "api.openai.com",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
  ]) {
    expect(
      "6",
      !src.includes(forbidden),
      `a provider call or credential (${forbidden}) has appeared. This point is ` +
        `AI-READY precisely because execution is absent; enabling it is an owner ` +
        `decision with a calibration step, not a code change.`,
    );
  }
}

// ---------------------------------------------------------------------------
// #7  "Utfall" was incomprehensible                        DONE
// ---------------------------------------------------------------------------
{
  const ui = readCode("src/components/academy/ReviewQueue.tsx");
  expect(
    "7",
    !/academy\.reviews\.outcomeUpheld/.test(ui),
    "the reviewer is being asked to classify an outcome again. With no provider " +
      "enabled there is nothing to uphold or adjust.",
  );
  expect("7", /deriveOutcome\(/.test(ui), "the outcome is no longer derived from what happened.");
}

// ---------------------------------------------------------------------------
// #8  The 0-4 matrix was unreadable                        DONE
// ---------------------------------------------------------------------------
{
  const ui = readCode("src/components/academy/ReviewQueue.tsx");
  expect("8", /RubricLevelChoice/.test(ui), "the descriptor-first control is gone.");
  expect(
    "8",
    !/\$\{l\.level\} — /.test(ui),
    "the number leads the label again, which is the thing that could not be read.",
  );
  for (let level = 0; level <= 4; level++) {
    const key = `academy.reviews.level.${level}`;
    expect("8", Boolean(sv[key] && en[key]), `level ${level} has lost its name in one language.`);
  }
  expect("8", /academy\.reviews\.whatToAssess/.test(ui), "the plain-language framing is gone.");
}

// ---------------------------------------------------------------------------
// #9  The candidate summary was too long          DONE (PR #89)
// #10 / #11  Development actions in recruitment    DONE (PR #89)
// ---------------------------------------------------------------------------
{
  const brief = read(
    "src/routes/_authenticated.employer.$employerSlug.assessments.results.$attemptId.tsx",
  );
  expect(
    "9",
    /<InterviewQuestions/.test(brief),
    "the interview questions have left the first screen.",
  );
  expect(
    "9",
    /screen-fold/.test(brief),
    "the detail disclosure is gone, so the brief is long again.",
  );
  expect(
    "10",
    (brief.match(/<EmployerDecisionPanel/g) ?? []).length === 1,
    "the workforce decision panel renders more than once; it belongs only on " +
      "the employee report.",
  );
  // The print half of #9: a fold that shortened the printed report would make
  // two documents out of one piece of evidence.
  expect(
    "9",
    read("src/styles.css").includes("screen-fold"),
    "the screen-only fold rule is gone, so the fold now affects print.",
  );
}

// ---------------------------------------------------------------------------
// #10b  Hired continues as the same person                 DONE
// ---------------------------------------------------------------------------
{
  const hire = readCode("supabase/migrations/20260903092000_scp_hired_becomes_employee.sql");
  expect("10b", hire.includes("scp_employment_from_application"), "the hire bridge is gone.");
  expect(
    "10b",
    /PERFORM public\.scp_employment_from_application\(_application_id\);/.test(hire),
    "a hire no longer reaches the workforce in the status function's transaction.",
  );
  // The mistake worth not repeating: a second bridge.
  expect(
    "10b",
    !existsSync(
      new URL("supabase/migrations/20260909091000_jobs_hire_applicant_continuity.sql", root),
    ),
    "the duplicate hire bridge is back. There is one, and set_application_status() calls it.",
  );
  expect(
    "10b",
    /hired_from_application_id/.test(read("src/lib/job-intelligence/applications.functions.ts")),
    "the surface no longer reads back which employment record the hire produced, " +
      "so the employer is left to re-type the name -- the duplicate-person problem " +
      "reintroduced by the interface.",
  );
}

// ---------------------------------------------------------------------------
// #12  The decision could not be saved            DONE (PR #87)
// ---------------------------------------------------------------------------
{
  const panel = read("src/components/academy/EmployerDecisionPanel.tsx");
  expect("12", /DECISION_ERROR_COPY/.test(panel), "the refusal mapping is gone.");
  expect(
    "12",
    Boolean(sv["academy.decision.failedWithCode"]?.includes("{code}")),
    "an unrecognised failure no longer carries its code, which is what made the " +
      "original report impossible to diagnose.",
  );
}

// ---------------------------------------------------------------------------
// Governance that must survive all of it
// ---------------------------------------------------------------------------
{
  // Nothing anywhere in this workstream may produce an employment verdict.
  const surfaces = [
    "src/components/academy/ReviewQueue.tsx",
    "src/components/academy/DecisionSupportSummary.tsx",
    "src/lib/security-competency/review-proposal.ts",
    "src/lib/email/send-application-status-email.server.ts",
  ].map(read);
  for (const word of ["PASS/FAIL", "suitabilityScore", "hireRecommendation", "candidateRanking"]) {
    expect(
      "governance",
      !surfaces.some((s) => s.includes(word)),
      `"${word}" has appeared. The product records decisions; it never makes them.`,
    );
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error("[emma-uat:check][error]", e);
  console.error(`\nemma-uat:check FAILED with ${errors.length} error(s).`);
  process.exit(1);
}

console.log(
  "emma-uat:check OK (12 points accounted for, 9 guards present and registered, " +
    "no provider execution, no employment verdict)",
);
