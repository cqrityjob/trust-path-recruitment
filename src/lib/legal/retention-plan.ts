// The retention plan, named once (owner decision, 2026-10-04).
//
// The periods are approved as a product decision. They are NOT yet working
// commitments: the owner's condition is "check and carry out the routines
// before the times are published as commitments", and no destructive
// production action is part of that decision. So every row says what makes it
// true, and the privacy policy cannot become final while a row is `pending`
// (status.ts). That is the one place the text and the function are tied
// together: the policy's section 9 is built from THIS list, row for row.
//
//   live                the routine runs in production and has been verified
//   platform_confirmed  the platform supplier enforces it and the owner has
//                       confirmed the actual period in the supplier's account
//   pending             not yet true. A routine is missing, not scheduled,
//                       not verified, or the period is still an undecided fact
//
// `evidence` is internal: what exists today and what is missing, as read from
// the code and, read-only, from production on 2026-10-04. It is never shown to
// a visitor. Section-by-section verification for the independent reviewer:
// docs/legal/2026-10-04-text-function-verification.md.
//
// Rule for changing a row: a period changes only with the owner's decision;
// `pending` becomes `live` only with the migration or routine that makes it so
// AND its hosted verification (docs/release/...), never by editing this file
// alone. launch-legal:check pins the periods against the policy text.

export type RetentionMechanism = "live" | "platform_confirmed" | "pending";

export type RetentionRow = {
  readonly id: string;
  /** Column 1 in the policy: what is kept. */
  readonly data: string;
  /** Column 2 in the policy: how long. This is the commitment. */
  readonly period: string;
  readonly mechanism: RetentionMechanism;
  readonly evidence: string;
};

export const RETENTION_PLAN: readonly RetentionRow[] = [
  {
    id: "account",
    data: "Konto, kandidatprofil, egna tester och Security Passport, med underlag och CV-filer",
    period:
      "Så länge ditt konto finns. Vi raderar eller anonymiserar uppgifterna inom 30 dagar efter att du har begärt att kontot ska avslutas. Ett konto som inte har använts på 24 månader får en påminnelse och raderas 30 dagar efter påminnelsen, om du inte loggar in.",
    mechanism: "pending",
    evidence:
      "Closing on request is manual (admin_delete_user_if_safe, then the storage erasure queue). It stops with ERASURE_INCOMPLETE for accounts that hold sp_credential_details or sp_evidence_extractions (4 holders in production); the correction is migration 20270208090000, in review. The inactive-account reminder and deletion are not built. No account is old enough yet: the oldest data is from 2026-07.",
  },
  {
    id: "recruitment",
    data: "Rekryteringsmaterial som hanteras för arbetsgivare: ansökningar, meddelanden, tester och intervjuer",
    period:
      "Enligt arbetsgivarens dokumenterade regler och biträdesavtalet. Om arbetsgivaren inte har bestämt något annat sparas materialet i 24 månader efter avslutad rekrytering och anonymiseras därefter. Arbetsgivaren kan begära en kortare tid.",
    mechanism: "pending",
    evidence:
      "No scheduled anonymisation exists. The older sweep_application_retention() (migration 20260719173615) deletes applications 12 months after a withdrawn application or a closed job, is service-role only and is not scheduled; it deviates from the plan (12 months, deletes instead of anonymising) and must be aligned before anyone uses it. Nothing is old enough to be affected yet (oldest application 2026-08-17).",
  },
  {
    id: "info-mailbox",
    data: "Kontaktförfrågningar till info@cqrityjob.com",
    period: "12 månader efter senaste kontakt.",
    mechanism: "pending",
    evidence:
      "The enquiries live in the mailbox, not in the platform. The monthly manual clean-up is not written down or assigned; it needs an owner and a record that it was done.",
  },
  {
    id: "job-mailbox",
    data: "Kandidatsvar och annan rekryteringskommunikation via job@cqrityjob.com",
    period: "24 månader efter avslutad rekrytering.",
    mechanism: "pending",
    evidence:
      "Replies to an employer's mail go to the job@ mailbox (Reply-To). The monthly manual clean-up is not written down or assigned; it needs an owner and a record that it was done.",
  },
  {
    id: "feedback",
    data: "Beta- och testfeedback",
    period: "12 månader.",
    mechanism: "pending",
    evidence:
      "Tables beta_feedback (0 rows) and cd_test_feedback (4 rows, 2026-08-15 to 2026-08-25). No routine deletes by age.",
  },
  {
    id: "usage-statistics",
    data: "Anonym användningsstatistik",
    period: "13 månader.",
    mechanism: "pending",
    evidence:
      "Table cd_v31_funnel_events (339 rows, 2026-08-15 to 2026-10-03; user_id and session_id empty in every row). No routine deletes by age. The older sweep_analytics_retention() covers a different table (job_analytics_events, 0 rows, 90 days then 24 months) and is not scheduled.",
  },
  {
    id: "admin-audit",
    data: "Granskningsloggar för administrativa åtgärder",
    period: "24 månader.",
    mechanism: "pending",
    evidence:
      "Tables audit_logs (27 rows from 2026-07-19), job_audit_events (66), employer_moderation_events (5), sw_audit_events (5). No routine deletes by age. Nothing is older than 24 months yet.",
  },
  {
    id: "platform-logs",
    data: "Tekniska loggar hos plattformsleverantören: IP-adress, inloggning och förfrågningar",
    period: "[Ange faktisk lagringstid hos leverantören]",
    mechanism: "pending",
    evidence:
      "Controlled by the platform supplier (Supabase). The actual period is read in the supplier's account, not in this repository. Open fact for the owner.",
  },
  {
    id: "mail-logs",
    data: "E-postloggar hos e-postleverantören",
    period: "[Ange faktisk lagringstid hos leverantören]",
    mechanism: "pending",
    evidence:
      "Controlled by the mail supplier (Resend). The period is read in the supplier's account. Open fact for the owner.",
  },
  {
    id: "sessions",
    data: "Inloggningssessioner",
    period: "Tills du loggar ut eller sessionen går ut.",
    mechanism: "pending",
    evidence:
      "Handled by Supabase Auth. The session timeout settings are not in the repository; the owner confirms them in the Supabase Auth settings.",
  },
  {
    id: "backups",
    data: "Säkerhetskopior",
    period: "[Ange faktisk lagringstid för säkerhetskopior]",
    mechanism: "pending",
    evidence:
      "Controlled by the platform supplier. The actual backup rotation is read in the Supabase dashboard (Database, Backups). Open fact for the owner.",
  },
  {
    id: "notice-outbox",
    data: "Systemutskick till arbetsgivarens användare, till exempel notiser om nya ansökningar",
    period: "90 dagar efter avslutat utskick.",
    mechanism: "pending",
    evidence:
      "Built: rec_purge_employer_notices() removes settled rows after 90 days, and it is run by the sweep (receipts-sweep). The sweep is not configured in production (the scheduled run reports NOT CONFIGURED: RECRUITMENT_SWEEP_URL and RECRUITMENT_SWEEP_TOKEN are empty), so the purge does not run. One row exists, created 2026-10-03.",
  },
  {
    id: "accounting",
    data: "Avtals- och bokföringsunderlag",
    period:
      "Så länge lagen kräver, det vill säga sju år efter utgången av det kalenderår då räkenskapsåret avslutades.",
    mechanism: "pending",
    evidence:
      "Not in the product: kept in the company's bookkeeping. Added for completeness (section 2 of the policy lists contract and invoicing data); the owner confirms it against the company's accounting routine. Not part of the owner's approved plan of 2026-10-04.",
  },
];

/** True when every row is backed by a verified mechanism or confirmed platform setting. */
export const RETENTION_READY = RETENTION_PLAN.every((r) => r.mechanism !== "pending");
