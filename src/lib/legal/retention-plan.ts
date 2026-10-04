// The retention plan, named once (owner decisions, 2026-10-04).
//
// The periods the owner approved are approved as a product decision. They are
// NOT yet working commitments: the owner's condition is "check and carry out
// the routines before the times are published as commitments", and no
// destructive production action is part of that decision. So every row says
// what makes it true, and the privacy policy cannot become final while a row
// is `pending` (status.ts). That is the one place the text and the function are
// tied together: the policy's section 9 is built from THIS list, row for row.
//
// Two things are tracked per row and must not be mixed up:
//
//   approval   `approved`  the owner approved this period in the retention plan
//                          of the attached privacy policy (decision 3, 2026-10-04)
//              `proposed`  NOT approved. Written by the preparer, or not in the
//                          owner's plan. The public text shows an open point
//                          instead of the number, and the number stays in
//                          `proposal`, internal, until the owner decides.
//   mechanism  `live`                the routine runs in production, has been
//                                    carried out and logged, and verified
//              `platform_confirmed`  the platform supplier enforces it and the
//                                    owner has confirmed the actual period in
//                                    the supplier's account
//              `pending`             not yet true: a routine is missing, not
//                                    carried out, not verified, or the period is
//                                    still an undecided fact
//
// Owner instruction, 2026-10-04 (second message): 13 months of usage statistics,
// 24 months of audit logs and a general anonymisation after 24 months are NOT
// treated as decisions already made. They are `proposed` below. Candidates' own
// test results are account data (they belong to the `account` row), not
// "anonymous usage statistics".
//
// `evidence` is internal: what exists today and what is missing, as read from
// the code and, read-only, from production on 2026-10-04. It is never shown to a
// visitor. The smallest working routine behind each row, who runs it, how often
// and where it is logged: docs/legal/retention-runbook-v1.md. Section-by-section
// verification for the independent reviewer:
// docs/legal/2026-10-04-text-function-verification.md.
//
// Rule for changing a row: a period changes only with the owner's decision;
// `pending` becomes `live` only with a carried-out, logged routine AND its
// verification, never by editing this file alone. launch-legal:check pins the
// periods against the policy text.

export type RetentionMechanism = "live" | "platform_confirmed" | "pending";
export type RetentionApproval = "approved" | "proposed";

export type RetentionRow = {
  readonly id: string;
  /** Column 1 in the policy: what is kept. */
  readonly data: string;
  /** Column 2 in the policy: how long. For an approved row this is the
   *  commitment; for a proposed row it is an open point, never a number. */
  readonly period: string;
  readonly approval: RetentionApproval;
  /** Internal. The period proposed to the owner, until the owner decides. */
  readonly proposal?: string;
  /** False when the processing does not take place in version 1, so the policy
   *  does not describe it. The row still blocks a final policy until decided. */
  readonly inPolicy: boolean;
  readonly mechanism: RetentionMechanism;
  /** Internal. The routine that makes the period true: runbook section,
   *  interval, and the first date any data could be due. */
  readonly routine: string;
  readonly evidence: string;
};

export const RETENTION_PLAN: readonly RetentionRow[] = [
  {
    id: "account",
    data: "Konto, kandidatprofil, egna tester och Security Passport, med underlag och CV-filer",
    period:
      "Så länge ditt konto finns. Vi raderar eller anonymiserar uppgifterna inom 30 dagar efter att du har begärt att kontot ska avslutas. Ett konto som inte har använts på 24 månader får en påminnelse och raderas 30 dagar efter påminnelsen, om du inte loggar in.",
    approval: "approved",
    inPolicy: true,
    mechanism: "pending",
    routine:
      "Runbook R1 (closing on request, on request, within 30 days) and R2 (inactive accounts, quarterly; first due 2028-07, no account is older). Mostafa.",
    evidence:
      "Closing on request is manual through the admin console (adminDeleteUser -> admin_delete_user_if_safe, then the storage erasure sweep). #416 (20270208090000) is merged and applied, and the migration is verified in production by catalogue and function hash (#418). The whole call path (admin console, server function, PostgREST, the function, the storage sweep) is proven on the disposable local stack with a synthetic holder of credential details, an uploaded document and a reading of it (docs/release/2026-10-04-account-erasure-full-path-evidence.md, PR #425): everything the database owns is gone and the account is a tombstone; the file is queued, because the stack has no Storage service. NOT verified: the Storage deletion and production end to end; the owner closes the test account through the admin console, steps in the evidence note. The audit row for the closure keeps the erased address (see admin-audit). The candidate's own test results (cd_sessions, ON DELETE CASCADE) are account data and go with the account. Feedback rows (beta_feedback, cd_test_feedback) survive account closure with the link to the account removed (ON DELETE SET NULL) and follow their own 12-month row. The inactive-account reminder and deletion are a manual quarterly routine, not automated; no account is old enough (oldest data 2026-07).",
  },
  {
    id: "recruitment",
    data: "Rekryteringsmaterial som hanteras för arbetsgivare: ansökningar, meddelanden, tester och intervjuer",
    period:
      "Enligt arbetsgivarens dokumenterade regler och biträdesavtalet. Arbetsgivaren kan begära en kortare tid. [Ange hur länge materialet sparas när arbetsgivaren inte har bestämt något annat. Väntar på ägarens beslut.]",
    approval: "proposed",
    proposal:
      "24 months after the recruitment ended, then anonymisation. A general default of 24 months and anonymisation is NOT an owner decision; the owner approved only that the employer's documented rules and the processor agreement govern, and that an employer may ask for a shorter time.",
    inPolicy: true,
    mechanism: "pending",
    routine:
      "Runbook R7: when an employer asks for deletion or a shorter time, manual, per request, logged. No default and no automatic routine until the owner decides.",
    evidence:
      "No scheduled anonymisation exists. The older sweep_application_retention() (migration 20260719173615) deletes applications 12 months after a withdrawn application or a closed job, is service-role only and is not scheduled; it deviates from every version of the plan (12 months, deletes instead of anonymising) and must not be used or scheduled before it is aligned with a decided period. Nothing is old enough to be affected yet (oldest application 2026-08-17).",
  },
  {
    id: "info-mailbox",
    data: "Kontaktförfrågningar till info@cqrityjob.com",
    period: "12 månader efter senaste kontakt.",
    approval: "approved",
    inPolicy: true,
    mechanism: "pending",
    routine:
      "Runbook R5 (monthly, first working day, Mostafa, logged). First possible due date: the owner reads the mailbox's oldest thread.",
    evidence:
      "The enquiries live in the mailbox, not in the platform. The manual monthly clean-up is documented and assigned in the runbook and has a log; it is not carried out yet, so the row stays pending until the first check is logged.",
  },
  {
    id: "job-mailbox",
    data: "Kandidatsvar och annan rekryteringskommunikation via job@cqrityjob.com",
    period: "24 månader efter avslutad rekrytering.",
    approval: "approved",
    inPolicy: true,
    mechanism: "pending",
    routine:
      "Runbook R6 (monthly, first working day, Mostafa, logged). Rule used: a conversation whose last message is older than 24 months. Nothing can be due before 2028-10 (the address was introduced for the launch).",
    evidence:
      "Replies to an employer's mail go to the job@ mailbox (Reply-To) and are handled by CQrityjob; nothing forwards them automatically. The manual monthly clean-up is documented and assigned and has a log; it is not carried out yet.",
  },
  {
    id: "feedback",
    data: "Beta- och testfeedback",
    period: "12 månader.",
    approval: "approved",
    inPolicy: true,
    mechanism: "pending",
    routine:
      "Runbook R3 (monthly, first working day, Mostafa, logged). Dry-run and delete statements in supabase/retention/, proven on synthetic data by supabase/tests/retention_manual_routines_test.sql. First due 2027-08-15.",
    evidence:
      "Tables beta_feedback (0 rows) and cd_test_feedback (4 rows, 2026-08-15 to 2026-08-25). The routine is documented, tested on synthetic data and assigned; it is not carried out yet because nothing is old enough.",
  },
  {
    id: "usage-statistics",
    data: "Användningsstatistik",
    period: "[Ange lagringstid för användningsstatistik. Väntar på ägarens beslut.]",
    approval: "proposed",
    proposal:
      "13 months was in the plan the preparer worked from; it is NOT treated as an approved decision. Version 1 measures nothing (FUNNEL_MEASUREMENT_ENABLED = false), so the policy does not describe usage statistics at all. What remains is the 339 rows collected before 2026-10-04.",
    inPolicy: false,
    mechanism: "pending",
    routine:
      "Owner decision: approve deleting the 339 historic rows (statement prepared in docs/release/2026-10-04-funnel-measurement-off.md, not run), or approve a period for them.",
    evidence:
      "Table cd_v31_funnel_events (339 rows, 2026-08-15 to 2026-10-03). user_id and session_id are empty in every row, which does not make the rows anonymous: each has a time, an event name and a detail. Nothing reads them. Candidates' own test results are NOT in this table: they are cd_sessions, account data (the `account` row). The older sweep_analytics_retention() covers a different table (job_analytics_events, 0 rows) and is not scheduled.",
  },
  {
    id: "admin-audit",
    data: "Granskningsloggar för administrativa åtgärder",
    period: "[Ange lagringstid för granskningsloggar. Väntar på ägarens beslut.]",
    approval: "proposed",
    proposal:
      "24 months. NOT treated as an approved decision. Audit logs are kept to answer for what administrators did, which argues for a longer period than a candidate's data, so the owner decides.",
    inPolicy: true,
    mechanism: "pending",
    routine: "None until the period is decided; then a quarterly manual check like R3.",
    evidence:
      "Tables audit_logs (27 rows from 2026-07-19), job_audit_events (66), employer_moderation_events (5), sw_audit_events (5). No routine deletes by age. Nothing is older than 24 months yet. On account closure the rows stay. The audit row written for the closure (audit_logs, action user_deleted) keeps the erased person's e-mail address and the administrator's typed reason in its metadata (found in the full-path run, docs/release/2026-10-04-account-erasure-full-path-evidence.md). So until the owner decides this period, or a later migration stops writing the address, the policy must not promise that every trace of the address is gone.",
  },
  {
    id: "platform-logs",
    data: "Tekniska loggar hos plattformsleverantören: IP-adress, inloggning och förfrågningar",
    period: "[Ange faktisk lagringstid hos leverantören]",
    approval: "approved",
    inPolicy: true,
    mechanism: "pending",
    routine:
      "Runbook R8 (supplier setting, read by the owner in the supplier's account, re-read quarterly, logged).",
    evidence:
      "Controlled by the platform supplier (Supabase). Log retention follows the project's plan (Supabase docs, Logs in Studio); the organisation's plan is Pro (read with the platform tools 2026-10-04), but the number of days is not shown there. The owner reads the actual period in the supplier's account. Open fact.",
  },
  {
    id: "mail-logs",
    data: "E-postloggar hos e-postleverantören",
    period: "[Ange faktisk lagringstid hos leverantören]",
    approval: "approved",
    inPolicy: true,
    mechanism: "pending",
    routine: "Runbook R8 (supplier setting, read by the owner in the supplier's account).",
    evidence:
      "Controlled by the mail supplier (Resend). The period is read in the supplier's account. Open fact for the owner.",
  },
  {
    id: "sessions",
    data: "Inloggningssessioner",
    period: "Tills du loggar ut eller sessionen går ut.",
    approval: "approved",
    inPolicy: true,
    mechanism: "pending",
    routine: "Runbook R8 (the owner confirms the session settings in Supabase Auth).",
    evidence:
      "Handled by Supabase Auth. By default a session lasts until sign-out; time-boxed and inactivity-limited sessions are Pro-plan settings (Supabase docs, User sessions) and the configured values are not in the repository. The organisation's plan is Pro (2026-10-04). The owner confirms the configured values in the Supabase Auth settings.",
  },
  {
    id: "backups",
    data: "Säkerhetskopior",
    period: "[Ange faktisk lagringstid för säkerhetskopior]",
    approval: "approved",
    inPolicy: true,
    mechanism: "pending",
    routine:
      "Runbook R8 (supplier setting). Also decides how fast an erased account leaves the backups.",
    evidence:
      "Controlled by the platform supplier. On the Pro plan Supabase keeps the last 7 daily backups, or the Point-in-Time window if that add-on is enabled (Supabase docs, Database Backups); the organisation's plan is Pro (read with the platform tools 2026-10-04) and whether the add-on is on is read in the dashboard (Database, Backups). Storage objects are not part of a database backup. Open fact for the owner.",
  },
  {
    id: "notice-outbox",
    data: "Systemutskick till arbetsgivarens användare, till exempel notiser om nya ansökningar",
    period: "90 dagar efter avslutat utskick.",
    approval: "approved",
    inPolicy: true,
    mechanism: "pending",
    routine:
      "Runbook R4 (monthly, first working day, Mostafa, logged): select public.rec_purge_employer_notices(); until the sweep is configured. First due 2027-01-01.",
    evidence:
      "Built and tested: rec_purge_employer_notices() removes settled rows after 90 days (supabase/tests/employer_new_application_notices_test.sql). The scheduled sweep is not configured in production (it reports NOT CONFIGURED: RECRUITMENT_SWEEP_URL and RECRUITMENT_SWEEP_TOKEN are empty), so until it is, the manual monthly call in the runbook is the routine. One row exists, created 2026-10-03.",
  },
  {
    id: "accounting",
    data: "Avtals- och bokföringsunderlag",
    period:
      "Så länge lagen kräver, det vill säga sju år efter utgången av det kalenderår då räkenskapsåret avslutades.",
    approval: "proposed",
    proposal:
      "Added by the preparer for completeness (section 2 of the policy lists contract and invoicing data). It states the statutory period and is not part of the owner's retention plan; the owner confirms it against the company's accounting routine.",
    inPolicy: true,
    mechanism: "pending",
    routine: "Not in the product: the company's bookkeeping.",
    evidence:
      "Not in the product: kept in the company's bookkeeping. The owner confirms the row against the company's accounting routine.",
  },
];

/** The rows the policy describes, in order. */
export const RETENTION_POLICY_ROWS = RETENTION_PLAN.filter((r) => r.inPolicy);

/** True when every row is decided by the owner AND backed by a carried-out,
 *  verified routine or a confirmed platform setting. */
export const RETENTION_READY = RETENTION_PLAN.every(
  (r) => r.approval === "approved" && r.mechanism !== "pending",
);
