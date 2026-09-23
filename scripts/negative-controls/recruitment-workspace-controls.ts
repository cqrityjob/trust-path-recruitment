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
    file: DEFS,
    find: '  switch (filter ?? "open") {',
    replace: '  switch (filter ?? "all") {',
    guard: G,
    expect: "the default view is open candidates",
  },
  {
    id: "RW-OVERVIEW-COUNTS-ANOTHER-SET",
    defect:
      "the overview's 'new applications' counts every open candidate while its link opens only the new ones",
    file: FNS,
    find: "newCount: mine.filter((a) => isNewApplication(a.status)).length,",
    replace: "newCount: mine.filter((a) => isUnresolved(a.status)).length,",
    guard: G,
    expect: "the overview's new count uses isNewApplication",
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
];

await runControls("recruitment-workspace", MUTATIONS);
