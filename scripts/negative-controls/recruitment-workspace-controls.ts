/**
 * Recruitment workspace negative controls.
 *
 * recruitment-workspace:check proves nothing on its own until each of its
 * properties has been broken for real and the guard has failed with a named
 * diagnostic. Every mutation below plants one defect in the shape a careless
 * edit would produce -- a stage change that e-mails the candidate, a decision
 * offered to a seat the database refuses, an AI draft that reads candidate
 * answers -- and requires the guard to catch it.
 *
 * The harness restores every file byte-for-byte and verifies the tree is clean
 * afterwards. See scripts/negative-controls/runner.ts.
 *
 * Run: bun run negative-controls:recruitment-workspace
 */

import { runControls, type Mutation } from "./runner";

const DEFS = "src/lib/recruitment/definitions.ts";
const FNS = "src/lib/recruitment/recruitment.functions.ts";
const AI = "src/lib/recruitment/ai.functions.ts";
const TEMPLATES = "src/lib/recruitment/message-templates.ts";
const COPY = "src/i18n/recruitment-copy.ts";
const CANDIDATE =
  "src/routes/_authenticated.employer.$employerSlug.applications.$applicationId.tsx";
const PANELS = "src/components/recruitment/ApplicationPanels.tsx";
const COMPOSER = "src/components/recruitment/MessageComposer.tsx";
const APPLY = "src/components/jobs/ApplyInternalDialog.tsx";
const IV_CONTEXT = "src/lib/interview-intelligence/context.functions.ts";
const IV_DERIVE = "src/lib/interview-intelligence/context.ts";
const ASSESSMENT_PANEL = "src/components/academy/ApplicationAssessmentPanel.tsx";
const TABLE = "src/components/recruitment/CandidateTable.tsx";
const BOOKING = "src/components/recruitment/BookingDialog.tsx";
const HUB = "src/routes/_authenticated.employer.$employerSlug.jobs.$jobId.index.tsx";
const FORMAT = "src/lib/recruitment/format.ts";
const MIGRATION = "supabase/migrations/20261212090000_recruitment_candidate_view.sql";
const RECEIPTS = "supabase/migrations/20261213090000_recruitment_application_receipts.sql";
const RECEIPT_SERVER = "src/lib/recruitment/receipt.server.ts";
const TRANSPORT = "src/lib/email/send-recruitment-message-email.server.ts";
const SWEEP_ROUTE = "src/routes/api.recruitment.receipts-sweep.ts";
const SUBMIT = "src/lib/job-intelligence/applications.functions.ts";
const EMPLOYER_JOBS = "src/lib/job-intelligence/employer-jobs.functions.ts";
const PANELS_FILE = "src/components/recruitment/ApplicationPanels.tsx";
const G = "recruitment-workspace:check";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "RW-NEW-MEANS-OPENED",
    defect:
      "'new' starts counting applications somebody has already moved, so the overview and the list disagree",
    file: DEFS,
    find: '  return status === "submitted";\n}',
    replace: '  return status === "submitted" || status === "reviewing";\n}',
    guard: G,
    expect: "'reviewing' is not new",
  },
  {
    id: "RW-DEFAULT-VIEW-SHOWS-DECIDED",
    defect: "the candidate list opens on everybody, burying the open candidates under settled ones",
    file: FNS,
    find: '    _stage: view.stage ?? "open",',
    replace: '    _stage: view.stage ?? "all",',
    guard: G,
    expect: "the default view is open candidates",
  },
  {
    id: "RW-OVERVIEW-COUNTS-ANOTHER-SET",
    defect:
      "the overview's 'new applications' counts every open candidate while its link opens only the new ones",
    file: FNS,
    find: "          newCount: Number(c.new_count),",
    replace: "          newCount: Number(c.unresolved_count),",
    guard: G,
    expect: "the same predicate",
  },
  {
    id: "RW-BATCH-MOVE-EMAILS",
    defect:
      "moving candidates in a batch writes to each of them -- a rejection leaves because a stage was clicked",
    file: FNS,
    find: "      results.push({\n        applicationId: item.applicationId,",
    replace:
      "      await sendOne(ctx, item.applicationId);\n      results.push({\n        applicationId: item.applicationId,",
    guard: G,
    expect: "a batch stage move sends nothing",
  },
  {
    id: "RW-SEND-WITHOUT-CLAIM",
    defect: "the e-mail goes out without the database claim that makes a double-click one message",
    file: FNS,
    find: 'const { data: rows, error } = await ctx.supabase.rpc("rec_claim_message_send", {\n    _message_id: messageId,\n  });',
    replace:
      'const { data: rows, error } = { data: [{ outcome: "claimed" }], error: null } as any;',
    guard: G,
    expect: "sending is claim, then e-mail, then settle",
  },
  {
    id: "RW-DECISION-OFFERED-TO-EVERYONE",
    defect: "a member who may not decide is shown hire and reject buttons the database will refuse",
    file: CANDIDATE,
    find: 'nextStatuses.filter((n) => canDecide || (n !== "hired" && n !== "rejected"))',
    replace: "nextStatuses.filter(() => true)",
    guard: G,
    expect: "offers hire/reject only to a seat that may decide",
  },
  {
    id: "RW-DECISION-UNCONFIRMED",
    defect: "a hire or rejection is recorded on one click, with no statement of what it does",
    file: CANDIDATE,
    find: 'next === "hired" || next === "rejected"\n                    ? setPendingDecision(next)\n                    : setStatus.mutate(next)',
    replace: "setStatus.mutate(next)",
    guard: G,
    expect: "a decision is confirmed before it is recorded",
  },
  {
    id: "RW-COMPOSER-FOR-RESTRICTED-SEAT",
    defect: "a restricted member is handed a composer whose every send the database refuses",
    file: PANELS,
    find: '  if (!ws.canManage) {\n    return (\n      <div className="space-y-3">',
    replace: '  if (false) {\n    return (\n      <div className="space-y-3">',
    guard: G,
    expect: "a restricted seat gets no composer",
  },
  {
    id: "RW-AI-READS-ANSWERS",
    defect: "the message draft reads the candidate's answers into a model prompt",
    file: AI,
    find: '        .from("job_applications")\n        .select("id, applicant_user_id, jobs(title_sv, title_en, employers(name))")',
    replace:
      '        .from("job_application_answers")\n        .select("id, applicant_user_id, jobs(title_sv, title_en, employers(name))")',
    guard: G,
    expect: "reads nothing from job_application_answers",
  },
  {
    id: "RW-AI-IGNORES-KILL-SWITCH",
    defect: "a real model runs while the platform has AI switched off",
    file: AI,
    find: 'await supabaseAdmin.rpc("scp_iv_ai_real_model_permitted");',
    replace: "{ data: true, error: null };",
    guard: G,
    expect: "the platform's AI switch is honoured",
  },
  {
    id: "RW-REJECTION-GIVES-A-REASON",
    defect:
      "the rejection template explains the decision, which is the product arguing the employer's case",
    file: TEMPLATES,
    find: '"Vi har nu valt att gå vidare med andra kandidater i den här rekryteringen."',
    replace:
      '"Vi har nu valt att gå vidare med andra kandidater eftersom ni inte uppfyllde kraven."',
    guard: G,
    expect: "the sv rejection gives no reason",
  },
  {
    id: "RW-ENGLISH-KEY-MISSING",
    defect: "a label exists in Swedish only, so the English interface shows a raw key",
    file: COPY,
    find: '  "rec.table.stage": "Stage",\n',
    replace: "",
    guard: G,
    expect: '"rec.table.stage" is missing in one language',
  },
  {
    id: "RW-DRAFT-WITHOUT-KEY",
    defect: "a new draft carries no idempotency key, so a repeated click makes a second message",
    file: COMPOSER,
    find: "idempotencyKey: draftId ? null : key.current,",
    replace: "idempotencyKey: null,",
    guard: G,
    expect: "a new draft carries an idempotency key",
  },
  {
    id: "RW-RETRY-IS-A-NEW-APPLICATION",
    defect:
      "a submission retry after a lost response is a fresh attempt, refused as a duplicate of itself",
    file: APPLY,
    find: "applicationId: attemptId.current,",
    replace: "applicationId: undefined,",
    guard: G,
    expect: "a submission retry reuses its attempt id",
  },
  {
    id: "RW-ASSESSMENT-SENT-TWICE",
    defect:
      "the send button stays after the test was sent, so a second click sends the candidate the same test again",
    file: ASSESSMENT_PANEL,
    find: "const sendable = options.filter((o) => !alreadySent.has(o.slug));",
    replace: "const sendable = options;",
    guard: G,
    expect: "the send button is withheld for an assessment already sent on this application",
  },
  {
    id: "RW-NOTES-FROM-OTHER-APPLICATION",
    defect: "interview notes from the same candidate's other application appear on this one",
    file: CANDIDATE,
    find: '(r) => r.rowKind === "interview_note" && r.attemptId !== null && ownAttempts.has(r.attemptId),',
    replace: '(r) => r.rowKind === "interview_note",',
    guard: G,
    expect: "interview notes from the same candidate's other application stay off this one",
  },
  {
    id: "RW-ANSWERS-FOR-ANOTHER-ID",
    defect: "the interview reads answers for an id that is not the case row's own application",
    file: IV_CONTEXT,
    find: "const answersRead = readAnswers(db, applicationId);",
    replace: "const answersRead = readAnswers(db, data.caseId);",
    guard: G,
    expect: "answers are read for the case row's own application",
  },
  {
    id: "RW-UNREADABLE-ANSWERS-AS-NONE",
    defect: "a failed answers read is shown to the interviewer as a candidate who answered nothing",
    file: IV_DERIVE,
    find: "  if (application?.answers === null) {",
    replace: "  if (false) {",
    guard: G,
    expect: "a failed answers read is said on the surface",
  },
  {
    id: "RW-CLOSED-CASE-INTERVIEW-UPCOMING",
    defect: "a hired candidate's leftover booking is still counted as an upcoming interview",
    file: DEFS,
    find: "    isUnresolved(applicationStatus) &&\n",
    replace: "",
    guard: G,
    expect: "a hired candidate's leftover booking is not upcoming",
  },
  {
    id: "RW-STEP-DONE-BY-VISIT",
    defect:
      "a live advert is reported as still at 'publishing', so the case never lands on its applications",
    file: DEFS,
    find: '  } else if (i.phase === "published") current = "applications";',
    replace: '  } else if (i.phase === "published") current = "publishing";',
    guard: G,
    expect: "a live advert is at applications",
  },
  {
    id: "RW-PAGE-PAST-END-IS-EMPTY",
    defect: "a stale link to page 9 of a 2-page list opens an empty page instead of the last one",
    file: MIGRATION,
    find: "             o.rn > (LEAST(_page_v, GREATEST(1, ceil(o.n::numeric / _size_v)::integer)) - 1) * _size_v",
    replace: "             o.rn > (_page_v - 1) * _size_v",
    guard: G,
    expect: "a page past the end opens the last page",
  },
  {
    id: "RW-LIST-CONTEXT-SHIPS-IDS",
    defect:
      "opening a candidate stores the list's ids in the browser again, so previous/next stop at the page and the ids leave the server",
    file: TABLE,
    find: "      query: { employerId, jobId, view: compactView(view) },",
    replace: "      ids: rows.map((r) => r.applicationId),",
    guard: G,
    expect: "never its ids",
  },
  {
    id: "RW-ANSWER-NO-MEANS-NOT-YES",
    defect: "a 'no' answer filter matches candidates who never answered the question",
    file: MIGRATION,
    find: "               AND a.answer_bool = (f ->> 'value')::boolean))",
    replace:
      "               AND (a.answer_bool = (f ->> 'value')::boolean OR a.answer_bool IS NULL)))",
    guard: G,
    expect: "an unanswered question matches neither",
  },
  {
    id: "RW-BOOKING-SENDS",
    defect: "saving an interview time also sends the candidate a message",
    file: BOOKING,
    find: 'import { saveInterviewBooking } from "@/lib/recruitment/recruitment.functions";',
    replace:
      'import { saveInterviewBooking, sendRecruitmentMessages } from "@/lib/recruitment/recruitment.functions";\nvoid sendRecruitmentMessages;',
    guard: G,
    expect: "saving a time sends nothing",
  },
  {
    id: "RW-READ-PAGES-IN-MEMORY",
    defect: "the server reads thousands of rows and pages them in its own memory again",
    file: FNS,
    find: '      ctx.supabase.rpc("rec_candidate_view", viewArgs(data.jobId, view, null)),',
    replace:
      '      ctx.supabase.rpc("rec_candidate_view", viewArgs(data.jobId, { ...view, page: 1 }, null)).limit(5000),',
    guard: G,
    expect: "pages nothing in memory",
  },
  {
    id: "RW-OVERVIEW-SAMPLES-APPLICATIONS",
    defect:
      "the overview counts a sample of the organisation's applications instead of all of them",
    file: FNS,
    find: '      ctx.supabase.rpc("rec_job_counts", { _employer_id: data.employerId, _job_id: null }),',
    replace:
      '      ctx.supabase.from("job_applications").select("job_id, status").eq("employer_id", data.employerId).limit(5000),',
    guard: G,
    expect: "the same database count",
  },
  {
    id: "RW-CHIPS-COUNT-THE-PAGE",
    defect: "the pipeline chips count the 25 rows on screen and call it the vacancy",
    file: HUB,
    find: "          awaitingReview: page.counts.new,",
    replace: '          awaitingReview: page.rows.filter((r) => r.status === "submitted").length,',
    guard: G,
    expect: "never over the page on screen",
  },
  {
    id: "RW-NEIGHBOURS-FROM-THE-BROWSER",
    defect:
      "previous/next ignore the server's answer, so the candidate page stops at the page edge",
    file: CANDIDATE,
    find: "    ? (neighboursQuery.data ?? null)",
    replace: "    ? null",
    guard: G,
    expect: "not from ids in the browser",
  },
  {
    id: "RW-BOOKING-CLAMPS-MIDNIGHT",
    defect:
      "a slot past the end of the day is clamped to the last minute again, so several candidates share 23:59",
    file: FORMAT,
    find: "  if (total < 0 || total >= 24 * 60) return null;",
    replace: "  if (total < 0) return null;",
    guard: G,
    expect: "never 23:59",
  },
  {
    id: "RW-BOOKING-SAVES-INVALID-SERIES",
    defect: "the dialog logs the series problem and saves the bookings anyway",
    file: BOOKING,
    find: "    if (problem) return setError(seriesMessage(problem));",
    replace: "    if (problem) console.warn(seriesMessage(problem));",
    guard: G,
    expect: "before the first save",
  },
  {
    id: "RW-OVERLAP-UNCHECKED",
    defect: "two slots only count as overlapping when the second starts before the first",
    file: FORMAT,
    find: "    if (parsed[i].at < parsed[i - 1].at + minutes) {",
    replace: "    if (parsed[i].at < parsed[i - 1].at) {",
    guard: G,
    expect: "typed by hand into another's time is caught",
  },
  {
    id: "RW-DST-GAP-SILENT",
    defect: "a wall-clock time the clocks skip is booked an hour off instead of refused",
    file: FORMAT,
    find: '  if (instants.size === 0) return { ok: false, reason: "nonexistent" };',
    replace: "  if (instants.size === 0) instants.add(wall - [...offsets][0]);",
    guard: G,
    expect: "does not exist in Stockholm",
  },
  {
    id: "RW-DST-REPEAT-SILENT",
    defect: "a wall-clock time that happens twice is booked on whichever came first",
    file: FORMAT,
    find: '  if (instants.size > 1) return { ok: false, reason: "ambiguous" };',
    replace: "  // the first instant wins",
    guard: G,
    expect: "happens twice in Stockholm",
  },
  {
    id: "RW-RECEIPT-BEFORE-COMMIT",
    defect:
      "the receipt is written when the application row is inserted, before its answers exist and before the commit that may still be refused",
    file: RECEIPTS,
    find: "CREATE CONSTRAINT TRIGGER job_applications_zz_receipt\n  AFTER INSERT ON public.job_applications\n  DEFERRABLE INITIALLY DEFERRED\n",
    replace:
      "CREATE TRIGGER job_applications_zz_receipt\n  AFTER INSERT ON public.job_applications\n",
    guard: G,
    expect: "at the commit of the application",
  },
  {
    id: "RW-RECEIPT-TWICE",
    defect:
      "a second receipt for the same application is only prevented by the code path that happens to run",
    file: RECEIPTS,
    find: "  ON CONFLICT (application_id) WHERE kind = 'receipt' DO NOTHING;",
    replace: "  ;",
    guard: G,
    expect: "the index's rule",
  },
  {
    id: "RW-RECEIPT-SWALLOWED",
    defect:
      "a receipt that cannot be written is logged and swallowed, so the application commits without it and nobody can see the gap",
    file: RECEIPTS,
    find: "  INSERT INTO public.recruitment_messages (\n    application_id, job_id, employer_id, kind, subject, body, language,\n    status, sent_at, sent_by, created_by, email_status, idempotency_key)\n  VALUES (NEW.id, NEW.job_id, NEW.employer_id, 'receipt',\n          left(_subject, 200), left(_body, 8000), _lang,\n          'sent', now(), NULL, NULL, 'not_attempted', 'receipt:' || NEW.id::text)\n  ON CONFLICT (application_id) WHERE kind = 'receipt' DO NOTHING;\n  RETURN NULL;",
    replace:
      "  BEGIN\n  INSERT INTO public.recruitment_messages (\n    application_id, job_id, employer_id, kind, subject, body, language,\n    status, sent_at, sent_by, created_by, email_status, idempotency_key)\n  VALUES (NEW.id, NEW.job_id, NEW.employer_id, 'receipt',\n          left(_subject, 200), left(_body, 8000), _lang,\n          'sent', now(), NULL, NULL, 'not_attempted', 'receipt:' || NEW.id::text)\n  ON CONFLICT (application_id) WHERE kind = 'receipt' DO NOTHING;\n  EXCEPTION WHEN OTHERS THEN RAISE WARNING 'REC_RECEIPT_NOT_WRITTEN';\n  END;\n  RETURN NULL;",
    guard: G,
    expect: "no silent gap",
  },
  {
    id: "RW-RECEIPT-RETROACTIVE-DEFAULT",
    defect:
      "the database default flips every existing recruitment on, so recruitments nobody touched start sending",
    file: RECEIPTS,
    find: "  ADD COLUMN IF NOT EXISTS receipt_enabled    boolean NOT NULL DEFAULT false,",
    replace: "  ADD COLUMN IF NOT EXISTS receipt_enabled    boolean NOT NULL DEFAULT true,",
    guard: G,
    expect: "existing recruitments keep their behaviour",
  },
  {
    id: "RW-RECEIPT-ANYONE-MAY-RETRY",
    defect:
      "the applicant can force a retry, so a candidate can make the employer's mail provider resend at will",
    file: RECEIPTS,
    find: "    IF (_retry OR _accept_duplicate) AND _who <> 'manager' THEN\n      RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED' USING ERRCODE = 'insufficient_privilege';\n    END IF;",
    replace: "",
    guard: G,
    expect: "only a manager may retry",
  },
  {
    id: "RW-RECEIPT-UNKNOWN-IS-NOT-SENT",
    defect: "a claim that was never settled is treated as nothing sent and resent on its own",
    file: RECEIPTS,
    find: "    UPDATE public.recruitment_messages\n       SET email_status = 'unknown', email_error = 'NO_SETTLE', email_settled_at = now(), updated_at = now()\n     WHERE id = _m.id;\n    _m.email_status := 'unknown';\n    _m.email_error := 'NO_SETTLE';",
    replace: "    _m.email_status := 'not_attempted';",
    guard: G,
    expect: "never resent by a plain claim",
  },
  {
    id: "RW-RECEIPT-PROMISES-A-RESPONSE-TIME",
    defect: "the standard text promises an answer within a number of days the employer never chose",
    file: RECEIPTS,
    find: "Vi har tagit emot din ansökan.\\n\\nDu kan följa den",
    replace:
      "Vi har tagit emot din ansökan och återkommer inom 5 arbetsdagar.\\n\\nDu kan följa den",
    guard: G,
    expect: "promises no response time",
  },
  {
    id: "RW-RECEIPT-MAIL-OUTAGE-FAILS-THE-APPLICATION",
    defect:
      "a mail outage during the receipt throws out of the submission, so a saved application is reported as failed",
    file: RECEIPT_SERVER,
    find: '  } catch (e) {\n    console.error("[recruitment] receipt e-mail dispatch failed", e);\n  }',
    replace:
      '  } catch (e) {\n    console.error("[recruitment] receipt e-mail dispatch failed", e);\n    throw e;\n  }',
    guard: G,
    expect: "never fails a saved application",
  },
  {
    id: "RW-RECEIPT-SECOND-PROVIDER",
    defect: "the receipt grows a mail transport of its own, with the key read in this file",
    file: RECEIPT_SERVER,
    find: '    const { sendRecruitmentMessageEmail } =\n      await import("@/lib/email/send-recruitment-message-email.server");',
    replace:
      '    const key = process.env.RESEND_API_KEY;\n    const { sendRecruitmentMessageEmail } =\n      await import("@/lib/email/send-recruitment-message-email.server");\n    void key;',
    guard: G,
    expect: "no second provider and no key in this file",
  },
  {
    id: "RW-RECEIPT-NEW-JOB-STARTS-OFF",
    defect:
      "a new recruitment starts with the receipt off, so nothing is visible before publication unless somebody remembers",
    file: EMPLOYER_JOBS,
    find: '      _job_id: inserted.id,\n      _enabled: true,\n    });\n    if (receiptErr) console.error("[employer-jobs] receipt default not set", receiptErr);',
    replace:
      '      _job_id: inserted.id,\n      _enabled: false,\n    });\n    if (receiptErr) console.error("[employer-jobs] receipt default not set", receiptErr);',
    guard: G,
    expect: "switched on by the product",
  },
  {
    id: "RW-RECEIPT-PENDING-READS-AS-DELIVERED",
    defect:
      "a receipt whose e-mail is still waiting is shown as delivered in the app only, as if no e-mail were coming",
    file: DEFS,
    find: '      return kind === "receipt" ? "delivered_email_pending" : "delivered_in_app_only";',
    replace: '      return "delivered_in_app_only";',
    guard: G,
    expect: "six different sentences",
  },
  {
    id: "RW-RECEIPT-CLAIMS-DELIVERY",
    defect: "a sentence claims the e-mail was delivered, which nothing in this product knows",
    file: COPY,
    find: '  "rec.message.delivery.emailSent": "Levererat i CQrityjob · e-post accepterad av leverantören",',
    replace: '  "rec.message.delivery.emailSent": "Levererat i CQrityjob · bekräftad leverans",',
    guard: G,
    expect: "no sentence claims a confirmed delivery",
  },
  {
    id: "RW-RECEIPT-NO-RETRY-FROM-THE-APPLICATION",
    defect: "a receipt whose e-mail never went cannot be sent again by anyone",
    file: PANELS_FILE,
    find: '                (m.kind === "receipt" && m.emailStatus === "not_attempted")) &&',
    replace: "                false) &&",
    guard: G,
    expect: "can be sent again by a person",
  },
  {
    id: "RW-RECEIPT-EMAIL-BEFORE-COMMIT",
    defect: "the receipt e-mail is dispatched before the submission's own outcome is known",
    file: SUBMIT,
    find: '      const { dispatchApplicationReceipt } = await import("@/lib/recruitment/receipt.server");\n      await dispatchApplicationReceipt(result.id);\n',
    replace: "",
    guard: G,
    expect: "after the submission succeeded",
  },
  {
    id: "RW-RECEIPT-CLIENT-MAY-SETTLE",
    defect:
      "a signed-in person can call the settle through the API and attest that the provider accepted an e-mail",
    file: RECEIPTS,
    find: "GRANT EXECUTE ON FUNCTION public.rec_settle_receipt_send(uuid, text, text, text) TO service_role;",
    replace:
      "GRANT EXECUTE ON FUNCTION public.rec_settle_receipt_send(uuid, text, text, text) TO service_role, authenticated;",
    guard: G,
    expect: "service_role alone",
  },
  {
    id: "RW-RECEIPT-SETTLE-IGNORES-ATTEMPT",
    defect:
      "a settle applies to whatever attempt is current, so a late answer from an old attempt overwrites the new one",
    file: RECEIPTS,
    find: "   WHERE m.email_attempt_id = _attempt_id AND m.kind = 'receipt' FOR UPDATE;\n  IF NOT FOUND THEN\n    RETURN 'stale';",
    replace:
      "   WHERE m.email_attempt_id IS NOT NULL AND m.kind = 'receipt' FOR UPDATE;\n  IF NOT FOUND THEN\n    RETURN 'stale';",
    guard: G,
    expect: "the attempt it names",
  },
  {
    id: "RW-RECEIPT-RESEND-AFTER-WINDOW",
    defect:
      "an unknown outcome is resent after the provider's idempotency window as if the window were still open, so the candidate can get the receipt twice with nobody deciding it",
    file: RECEIPTS,
    find: "  IF _m.email_status = 'unknown' AND NOT public.rec_receipt_window_open(_m.email_key_first_used_at) THEN\n    IF NOT _accept_duplicate THEN",
    replace: "  IF false THEN\n    IF NOT _accept_duplicate THEN",
    guard: G,
    expect: "possible duplicate",
  },
  {
    id: "RW-RECEIPT-SWEEP-WAITS",
    defect:
      "two recoveries queue on the same rows instead of skipping them, so a second worker takes the receipt the first is sending",
    file: RECEIPTS,
    find: "     FOR UPDATE SKIP LOCKED",
    replace: "     FOR UPDATE",
    guard: G,
    expect: "SKIP LOCKED",
  },
  {
    id: "RW-RECEIPT-SWEEP-UNBOUNDED",
    defect: "the recovery retries an unknown outcome forever",
    file: RECEIPTS,
    find: "         OR (m.email_status = 'unknown' AND m.email_attempts < 5\n",
    replace: "         OR (m.email_status = 'unknown' AND m.email_attempts < 500000\n",
    guard: G,
    expect: "bounded",
  },
  {
    id: "RW-RECEIPT-NO-IDEMPOTENCY-KEY",
    defect:
      "the receipt is sent without the logical e-mail's idempotency key, so a retry after a lost answer is a second e-mail",
    file: RECEIPT_SERVER,
    find: "            idempotencyKey: claim.provider_key ?? undefined,\n",
    replace: "",
    guard: G,
    expect: "idempotency key",
  },
  {
    id: "RW-RECEIPT-TIMEOUT-IS-FAILURE",
    defect:
      "an aborted call is recorded as a definite failure, although the provider may have accepted the e-mail after we stopped listening",
    file: TRANSPORT,
    find: '    return { result: "unknown", error: aborted ? "TIMEOUT" : "NETWORK_ERROR" };',
    replace: '    return { result: "failed", error: aborted ? "TIMEOUT" : "NETWORK_ERROR" };',
    guard: G,
    expect: "UNKNOWN, never 'failed'",
  },
  {
    id: "RW-RECEIPT-5XX-IS-FAILURE",
    defect: "a 5xx from the provider is recorded as a definite refusal",
    file: TRANSPORT,
    find: '  if (status === 408 || status === 425 || status >= 500) {\n    return { result: "unknown", error: `HTTP_${status}` };\n  }\n',
    replace: "",
    guard: G,
    expect: "5xx/408 are unknown",
  },
  {
    id: "RW-RECEIPT-BUTTON-OPENS-INBOX",
    defect: "the receipt's e-mail button opens the inbox instead of the application it is about",
    file: RECEIPT_SERVER,
    find: "            link: receiptLink(origin, claim.application_id),\n",
    replace: "",
    guard: G,
    expect: "exactly this application",
  },
  {
    id: "RW-RECEIPT-LINK-OFF-ORIGIN",
    defect:
      "the e-mail's button accepts a link on any origin, so a message could point a candidate off the site",
    file: TRANSPORT,
    find: "  if (url.origin !== new URL(fallback).origin) return fallback;\n",
    replace: "",
    guard: G,
    expect: "hostile link",
  },
  {
    id: "RW-RECEIPT-RESEND-WITHOUT-CONFIRM",
    defect:
      "the plain 'send again' button resends an unknown outcome after the provider's window, with no word about a possible duplicate",
    file: PANELS_FILE,
    find: '                (m.emailStatus === "unknown" && (m.kind !== "receipt" || m.emailWindowOpen)) ||',
    replace: '                m.emailStatus === "unknown" ||',
    guard: G,
    expect: "explicit acceptance",
  },
  {
    id: "RW-RECEIPT-SWEEP-OPEN",
    defect: "the recovery endpoint answers anyone when no token is configured",
    file: SWEEP_ROUTE,
    find: "  if (!expected || expected.length < 16) return false;",
    replace: "  if (!expected) return true;",
    guard: G,
    expect: "closed unless",
  },
  {
    id: "RW-RECEIPT-CANDIDATE-SESSION-DRIVES-EMAIL",
    defect:
      "the submission drives the receipt's e-mail with the candidate's own session instead of the server's credentials",
    file: SUBMIT,
    find: "      await dispatchApplicationReceipt(result.id);\n",
    replace: "      await dispatchApplicationReceipt(ctx.supabase, result.id);\n",
    guard: G,
    expect: "server's credentials",
  },
  {
    id: "RW-CASE-LOADS-WHOLE-LIST",
    defect: "the case page fetches every candidate and pages in the browser",
    file: HUB,
    find: 'import {\n  getRecruitment,\n  listRecruitmentCandidatesPage,\n} from "@/lib/recruitment/recruitment.functions";',
    replace:
      'import {\n  getRecruitment,\n  listRecruitmentCandidates,\n  listRecruitmentCandidatesPage,\n} from "@/lib/recruitment/recruitment.functions";\nvoid listRecruitmentCandidates;',
    guard: G,
    expect: "reads ONE page from the server",
  },
];

await runControls("recruitment-workspace", MUTATIONS);
