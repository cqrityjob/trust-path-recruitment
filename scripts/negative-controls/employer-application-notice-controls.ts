/**
 * Negative controls for employer-application-notice:check.
 *
 * Each mutation plants one real defect in the e-mail the employer gets on a new
 * application -- the sender, the server module, the wiring, the sweep or the
 * migration's own SQL -- and the guard must fail on every one. Run: bun run
 * negative-controls:employer-application-notice (a clean git tree is required:
 * commit first).
 */

import { runControls, type Mutation } from "./runner";

const GUARD = "employer-application-notice:check";
const SENDER = "src/lib/email/send-employer-application-notice-email.server.ts";
const SERVER = "src/lib/recruitment/employer-notice.server.ts";
const SUBMIT = "src/lib/job-intelligence/applications.functions.ts";
const ROUTE = "src/routes/api.recruitment.receipts-sweep.ts";
const MIGRATION = "supabase/migrations/20270205090000_employer_new_application_notices.sql";

const MUTATIONS: Mutation[] = [
  // ── the mail ──────────────────────────────────────────────────────────
  {
    id: "EN-NC-TITLE-UNESCAPED",
    defect: "the vacancy's title and the organisation's name go into the HTML as written",
    file: SENDER,
    find: '<p style="margin: 0 0 12px;">${escapeHtml(lead)}</p>',
    replace: '<p style="margin: 0 0 12px;">${lead}</p>',
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "EN-NC-CANDIDATE-PARAMETER",
    defect: "the mail's parameters gain a place to put the candidate",
    file: SENDER,
    find: "  employerSlug: string;\n  jobTitle: string;",
    replace: "  employerSlug: string;\n  candidateName?: string;\n  jobTitle: string;",
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "EN-NC-CANDIDATE-IN-THE-MAIL",
    defect: "the mail prints a candidate's name when it is handed one",
    file: SENDER,
    find: "const lead = copy.lead(job, org);",
    replace:
      'const lead = `${copy.lead(job, org)} ${String((params as unknown as { candidateName?: string }).candidateName ?? "")}`;',
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "EN-NC-ORGANISATION-SENDER-NAME",
    defect:
      "the mail asks to be sent under the organisation's name, though it is CQrityjob writing",
    file: SENDER,
    find: "      kind: EMPLOYER_NOTICE_EMAIL_KINDS[params.noticeKind],\n      to: params.recipientEmail,",
    replace:
      "      kind: EMPLOYER_NOTICE_EMAIL_KINDS[params.noticeKind],\n      senderName: params.employerName,\n      to: params.recipientEmail,",
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "EN-NC-REPLY-TO",
    defect: "the mail asks for a Reply-To",
    file: SENDER,
    find: "      kind: EMPLOYER_NOTICE_EMAIL_KINDS[params.noticeKind],\n      to: params.recipientEmail,",
    replace:
      "      kind: EMPLOYER_NOTICE_EMAIL_KINDS[params.noticeKind],\n      replyTo: params.recipientEmail,\n      to: params.recipientEmail,",
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "EN-NC-NO-IDEMPOTENCY-KEY",
    defect: "the provider's idempotency key is not sent, so a retry can be a second mail",
    file: SENDER,
    find: "      idempotencyKey: params.idempotencyKey,",
    replace: "      idempotencyKey: undefined,",
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "EN-NC-SENT-ON-ANY-ANSWER",
    defect: "any provider answer is reported as sent, a 500 included",
    file: SENDER,
    find: "return { result: classified.result, status: res.status };",
    replace: 'return { result: "sent", status: res.status };',
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "EN-NC-NOT-CONFIGURED-AS-SENT",
    defect: "a function that is not deployed is reported as sent",
    file: SENDER,
    find: 'if (res.notConfigured) return { result: "not_configured" };',
    replace: 'if (res.notConfigured) return { result: "sent", status: 200 };',
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "EN-NC-SENDER-THROWS",
    defect: "the sender rethrows what its call threw, so a mail outage can reach the apply request",
    file: SENDER,
    find: '    return { result: "unknown", status: 0 };\n  } finally {',
    replace: "    throw err;\n  } finally {",
    guard: GUARD,
    expect: "FAILED",
  },

  // ── the server module ─────────────────────────────────────────────────
  {
    id: "EN-NC-ORIGIN-FROM-HOST-SETTING",
    defect:
      "the link is built on PUBLIC_SITE_URL as configured, so a Lovable host reaches a sent mail",
    file: SERVER,
    find: "return serverSiteOrigin(process.env.PUBLIC_SITE_URL);",
    replace: 'return process.env.PUBLIC_SITE_URL || "https://www.cqrityjob.com";',
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "EN-NC-RECIPIENT-FROM-THE-CALLER",
    defect: "enqueue is handed a recipient besides the application id",
    file: SERVER,
    find: "      _application_id: applicationId,\n    });",
    replace:
      '      _application_id: applicationId,\n      _recipient: "someone@example.test",\n    });',
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "EN-NC-BUDGET-CEILING-RAISED",
    defect: "the apply request may be held for four seconds instead of three",
    file: SERVER,
    find: "export const EMPLOYER_NOTICE_BUDGET_MS = 3000;",
    replace: "export const EMPLOYER_NOTICE_BUDGET_MS = 4000;",
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "EN-NC-MISSING-MIGRATION-IS-AN-ERROR",
    defect: "a database without the migration is treated as a failure instead of a logged no-op",
    file: SERVER,
    find: "      if (isMissingNoticeObject(error)) {\n        console.warn(",
    replace: "      if (false as boolean) {\n        console.warn(",
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "EN-NC-FAILURE-RECORDED-AS-SENT",
    defect: "an attempt the provider refused is settled as sent",
    file: SERVER,
    find: '      result = "failed";\n      status = answer.status;',
    replace: '      result = "sent";\n      status = answer.status;',
    guard: GUARD,
    expect: "FAILED",
  },

  // ── the wiring ────────────────────────────────────────────────────────
  {
    id: "EN-NC-NOT-WIRED-INTO-THE-SUBMISSION",
    defect: "the submission no longer queues or sends the employer's notice",
    file: SUBMIT,
    find: "await notifyEmployerOfNewApplication(result.id, { dispatch: result.replayed !== true });",
    replace: "void notifyEmployerOfNewApplication;",
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "EN-NC-CANDIDATE-IS-TOLD",
    defect: "the candidate's answer reports whether the employer was e-mailed",
    file: SUBMIT,
    find: "        passportShared: result.passport_shared,\n      };",
    replace:
      "        passportShared: result.passport_shared,\n        employerNotified: true,\n      };",
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "EN-NC-REPLAY-SENDS",
    defect:
      "a replayed submission sends mail from the request instead of only making sure it is queued",
    file: SUBMIT,
    find: "            dispatch: false,\n            budgetMs: 1000,",
    replace: "            dispatch: true,\n            budgetMs: 1000,",
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "EN-NC-SWEEP-NOT-WIRED",
    defect: "the scheduled sweep no longer sends the employer's notices",
    file: ROUTE,
    find: "const employerNotices = await sweepEmployerNotices({ limit });",
    replace: "const employerNotices = {};",
    guard: GUARD,
    expect: "FAILED",
  },

  // ── the migration's own SQL ───────────────────────────────────────────
  {
    id: "EN-NC-CLAIM-OPEN-TO-A-CLIENT",
    defect: "a client role may execute the claim, and so read recipients' addresses",
    file: MIGRATION,
    find: "GRANT EXECUTE ON FUNCTION public.rec_claim_employer_notices(uuid, integer, text[]) TO service_role;",
    replace:
      "GRANT EXECUTE ON FUNCTION public.rec_claim_employer_notices(uuid, integer, text[]) TO service_role, authenticated;",
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "EN-NC-CLAIM-WITHOUT-SKIP-LOCKED",
    defect: "two workers can wait on, and take, the same notice",
    file: MIGRATION,
    find: "     FOR UPDATE OF n SKIP LOCKED\n  LOOP",
    replace: "     FOR UPDATE OF n\n  LOOP",
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "EN-NC-NO-LEASE",
    defect: "a claim that is held can be handed to a second worker at once",
    file: MIGRATION,
    find: "OR (n.status = 'claimed' AND n.claimed_at < now() - interval '3 minutes')",
    replace: "OR (n.status = 'claimed' AND n.claimed_at < now())",
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "EN-NC-TRIGGER-QUEUES-NOTICES",
    defect:
      "a trigger on job_applications queues the notice, so mail can fail or slow the apply request",
    file: MIGRATION,
    find: "-- 8. Postflight: the migration fails, and rolls back, unless this holds",
    replace:
      "CREATE TRIGGER employer_notice_on_apply AFTER INSERT ON public.job_applications FOR EACH ROW EXECUTE FUNCTION public.rec_create_application_receipt();\n-- 8. Postflight: the migration fails, and rolls back, unless this holds",
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "EN-NC-KIND-NOT-IN-THE-KEY",
    defect:
      "a second kind of notice to the same person about the same application would be refused",
    file: MIGRATION,
    find: "UNIQUE (application_id, recipient_user_id, kind)",
    replace: "UNIQUE (application_id, recipient_user_id)",
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "EN-NC-CLAIM-RETURNS-THE-CANDIDATE",
    defect: "what the claim hands over includes the applicant",
    file: MIGRATION,
    find: "  job_title       text,\n  attempts        integer\n)",
    replace: "  job_title       text,\n  applicant_user_id uuid,\n  attempts        integer\n)",
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "EN-NC-OUTBOX-READABLE-BY-A-CLIENT",
    defect: "the outbox loses its REVOKE from client roles",
    file: MIGRATION,
    find: "REVOKE ALL ON TABLE public.recruitment_employer_notices FROM PUBLIC, anon, authenticated;",
    replace: "REVOKE ALL ON TABLE public.recruitment_employer_notices FROM PUBLIC;",
    guard: GUARD,
    expect: "FAILED",
  },

  // ── another kind is a table entry; the retention and its one caller ──
  {
    id: "EN-NC-KIND-HARD-WIRED-IN-THE-CLAIM",
    defect: "the claim names the one kind, so a second kind would need the function rewritten",
    file: MIGRATION,
    find: "       AND n.created_at > now() - interval '23 hours'\n       AND n.attempts < 6",
    replace:
      "       AND n.created_at > now() - interval '23 hours'\n       AND n.kind = 'new_application'\n       AND n.attempts < 6",
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "EN-NC-KIND-TABLE-POINTS-NOWHERE",
    defect: "the table maps the kind to an e-mail kind the function does not know",
    file: SENDER,
    find: '  new_application: "employer_new_application",',
    replace: '  new_application: "employer_new_application_typo",',
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "EN-NC-KIND-WRITTEN-OUT-IN-THE-WORKER",
    defect: "the worker asks the claim for a literal kind instead of the table's kinds",
    file: SERVER,
    find: "const KINDS: string[] = Object.keys(EMPLOYER_NOTICE_EMAIL_KINDS);",
    replace: 'const KINDS: string[] = ["new_application"];',
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "EN-NC-PURGE-NOT-IN-THE-SWEEP",
    defect: "the sweep never applies the retention, so settled notices are kept for ever",
    file: SERVER,
    find: "summary.purged = await purgeEmployerNotices(deps);",
    replace: "summary.purged = 0;",
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "EN-NC-PURGE-IN-THE-APPLY-REQUEST",
    defect: "the apply request runs the retention, so a delete can slow or fail an application",
    file: SERVER,
    find: "    outcome.enqueue = queued.state;",
    replace: "    outcome.enqueue = queued.state;\n    await purgeEmployerNotices(deps);",
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "EN-NC-ENQUEUE-FROM-THE-SWEEP",
    defect:
      "the sweep route queues notices, so a purged row could be queued again for an old application",
    file: ROUTE,
    find: "const employerNotices = await sweepEmployerNotices({ limit });",
    replace:
      "await enqueueEmployerNotices(String(limit));\n        const employerNotices = await sweepEmployerNotices({ limit });",
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "EN-NC-DIRECT-ENQUEUE-FROM-SWEEP",
    defect: "the sweep invokes the enqueue RPC directly outside the approved module",
    file: ROUTE,
    find: "const employerNotices = await sweepEmployerNotices({ limit });",
    replace:
      'await supabase.rpc("rec_enqueue_employer_new_application_notices", { _application_id: String(limit) });\n        const employerNotices = await sweepEmployerNotices({ limit });',
    guard: GUARD,
    expect: "enqueue is reached only",
  },
  {
    id: "EN-NC-PURGE-DELETES-A-PENDING-ROW",
    defect: "the retention may delete a pending row",
    file: MIGRATION,
    find: "            n.status IN ('sent', 'skipped')\n",
    replace: "            n.status IN ('sent', 'skipped', 'pending')\n",
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "EN-NC-PURGE-HAS-NO-FLOOR",
    defect:
      "the retention accepts a window of nothing, so a fresh row could be deleted and re-queued",
    file: MIGRATION,
    find: "_older_than < interval '1 day'",
    replace: "_older_than < interval '0'",
    guard: GUARD,
    expect: "FAILED",
  },
  {
    id: "EN-NC-PURGE-OPEN-TO-A-CLIENT",
    defect: "a client role may execute the retention",
    file: MIGRATION,
    find: "GRANT EXECUTE ON FUNCTION public.rec_purge_employer_notices(interval) TO service_role;",
    replace:
      "GRANT EXECUTE ON FUNCTION public.rec_purge_employer_notices(interval) TO service_role, authenticated;",
    guard: GUARD,
    expect: "FAILED",
  },
];

runControls("employer-application-notice", MUTATIONS);
