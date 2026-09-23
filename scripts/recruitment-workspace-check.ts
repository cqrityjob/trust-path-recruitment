/**
 * Recruitment workspace guard (20261207090000 and its application half).
 *
 * The database rules are proved by EXECUTING them in
 * supabase/tests/recruitment_workspace_test.sql. This guard covers what only
 * the application can get wrong, each by behaviour where the code is pure and
 * by source where it is not:
 *
 *   A · one vocabulary     "new", "active", the phase of a recruitment and the
 *                          candidate list's filter/order are one pure module,
 *                          and the overview counts with the same predicate
 *                          the list it opens filters with
 *   B · no silent contact  a stage change or a batch move never writes to a
 *                          candidate; sending is claim -> e-mail -> settle
 *   C · permissions shown  decision and message controls are withheld from a
 *                          seat the database will refuse
 *   D · AI boundaries      the writing help reads no candidate material,
 *                          ranks nobody, and always has a labelled template
 *   E · honest copy        both languages complete; no template gives a reason
 *                          or a score for a decision
 *
 * Run: bun run recruitment-workspace:check
 */

import { readFileSync } from "node:fs";
import { dictionaries } from "../src/i18n/dictionaries";
import { recruitmentSv, recruitmentEn } from "../src/i18n/recruitment-copy";
import * as D from "../src/lib/recruitment/definitions";
import { messageTemplate, MESSAGE_KINDS } from "../src/lib/recruitment/message-templates";
import { buildInterviewContext } from "../src/lib/interview-intelligence/context";

const fails: string[] = [];
let passed = 0;
function ok(cond: boolean, label: string): void {
  if (cond) passed += 1;
  else fails.push(label);
}
const read = (p: string) => readFileSync(p, "utf8");
/** Line comments first: a "/*" inside a "//" line must not swallow the file. */
const code = (p: string) =>
  read(p)
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1")
    .replace(/\/\*[\s\S]*?\*\//g, "");

const F = {
  defs: "src/lib/recruitment/definitions.ts",
  fns: "src/lib/recruitment/recruitment.functions.ts",
  ai: "src/lib/recruitment/ai.functions.ts",
  apps: "src/lib/job-intelligence/applications.functions.ts",
  overview: "src/routes/_authenticated.employer.$employerSlug.index.tsx",
  hub: "src/routes/_authenticated.employer.$employerSlug.jobs.$jobId.index.tsx",
  candidate: "src/routes/_authenticated.employer.$employerSlug.applications.$applicationId.tsx",
  list: "src/routes/_authenticated.employer.$employerSlug.applications.index.tsx",
  table: "src/components/recruitment/CandidateTable.tsx",
  panels: "src/components/recruitment/ApplicationPanels.tsx",
  composer: "src/components/recruitment/MessageComposer.tsx",
  apply: "src/components/jobs/ApplyInternalDialog.tsx",
  ivContext: "src/lib/interview-intelligence/context.functions.ts",
  assessmentPanel: "src/components/academy/ApplicationAssessmentPanel.tsx",
};

console.log("recruitment workspace\n");

/* ================================================================== */
/* A · One vocabulary                                                   */
/* ================================================================== */
{
  ok(D.isNewApplication("submitted"), "A · 'submitted' is new");
  for (const s of ["reviewing", "interview", "hired", "rejected", "withdrawn"]) {
    ok(!D.isNewApplication(s), `A · '${s}' is not new`);
  }
  ok(
    ["submitted", "reviewing", "interview"].every(D.isUnresolved) &&
      !["hired", "rejected", "withdrawn"].some(D.isUnresolved),
    "A · unresolved is exactly the three open stages",
  );

  const now = new Date("2026-10-01T12:00:00Z");
  const base = {
    publishedAt: "2026-09-01T00:00:00Z",
    deadlineAt: null,
    expiresAt: null,
    completionState: null,
  } as const;
  ok(D.phaseOf({ ...base, jobStatus: "draft" }, now) === "draft", "A · a draft is a draft");
  ok(
    D.phaseOf({ ...base, jobStatus: "published" }, now) === "published",
    "A · a live advert is published",
  );
  ok(
    D.phaseOf({ ...base, jobStatus: "published", deadlineAt: "2026-09-30T00:00:00Z" }, now) ===
      "closed",
    "A · a published advert past its deadline is closed, as job_is_active says",
  );
  ok(
    D.phaseOf({ ...base, jobStatus: "archived" }, now) === "closed",
    "A · an archived advert is closed",
  );
  ok(
    D.phaseOf({ ...base, jobStatus: "archived", completionState: "completed" }, now) ===
      "completed",
    "A · completion outranks the advert's own status",
  );
  ok(D.isActiveRecruitment("published", 0), "A · a live advert is active with nobody in it");
  ok(D.isActiveRecruitment("closed", 2), "A · a closed advert with open candidates is active");
  ok(!D.isActiveRecruitment("closed", 0), "A · a closed advert with nobody left is not active");
  ok(
    D.isReadyToComplete("closed", 0) && !D.isReadyToComplete("closed", 1),
    "A · ready to complete means closed and resolved",
  );

  const row = (
    id: string,
    status: string,
    name: string,
    applied: string,
    owner: string | null = null,
  ) => ({
    applicationId: id,
    name,
    jobTitle: "Väktare",
    status,
    appliedAt: applied,
    responsibleUserId: owner,
    nextActivityAt: null,
  });
  const rows = [
    row("a", "submitted", "Anna", "2026-09-01T00:00:00Z"),
    row("b", "reviewing", "Bo", "2026-09-02T00:00:00Z", "u1"),
    row("c", "rejected", "Cia", "2026-09-03T00:00:00Z"),
    row("d", "submitted", "Dan", "2026-09-02T00:00:00Z"),
  ];
  ok(
    D.applyCandidateView(rows, {})
      .map((r) => r.applicationId)
      .join() === "b,d,a",
    "A · the default view is open candidates, newest application first, ties by id",
  );
  ok(
    D.applyCandidateView(rows, { stage: "new" }).every((r) => r.status === "submitted"),
    "A · the 'new' filter is the same predicate",
  );
  ok(D.applyCandidateView(rows, { stage: "all" }).length === 4, "A · 'all' hides nobody");
  ok(
    D.applyCandidateView(rows, { owner: "none" }).every((r) => r.responsibleUserId === null),
    "A · 'no one assigned' filters on the owner",
  );
  ok(
    D.applyCandidateView(rows, { q: "bo" })
      .map((r) => r.applicationId)
      .join() === "b",
    "A · search matches the name",
  );
  ok(
    D.applyCandidateView(rows, { stage: "all", sort: "name" })
      .map((r) => r.name)
      .join() === "Anna,Bo,Cia,Dan",
    "A · sorting by name is alphabetical",
  );
  const n = D.neighbours(D.applyCandidateView(rows, {}), "d");
  ok(
    n.previous?.applicationId === "b" &&
      n.next?.applicationId === "a" &&
      n.position === 2 &&
      n.total === 3,
    "A · previous/next follow the list's own order",
  );

  // The overview counts with the predicate and links to the filter with the
  // same meaning; the list filters `status === "submitted"`.
  const fns = code(F.fns);
  ok(
    /newCount: mine\.filter\(\(a\) => isNewApplication\(a\.status\)\)\.length/.test(fns),
    "A · the overview's new count uses isNewApplication",
  );
  const overview = code(F.overview);
  ok(
    /label=\{t\("rec\.overview\.stat\.new"\)\}[\s\S]{0,400}to: "\/employer\/\$employerSlug\/applications"[\s\S]{0,120}status: "submitted" as const/.test(
      overview,
    ),
    "A · the 'new applications' number opens the submitted applications",
  );
  ok(
    /isActiveRecruitment\(r\.phase, r\.unresolved\)/.test(overview) &&
      /phase: "active" as const/.test(overview),
    "A · the active count and the list it opens share isActiveRecruitment",
  );
}

/* ================================================================== */
/* B · No silent contact                                               */
/* ================================================================== */
{
  const fns = code(F.fns);
  const stages = fns.slice(
    fns.indexOf("export const setApplicationStages"),
    fns.indexOf("export const addRecruitmentComment"),
  );
  ok(
    stages.length > 100 &&
      !/sendOne|rec_claim_message_send|sendRecruitmentMessageEmail/.test(stages),
    "B · a batch stage move sends nothing",
  );
  ok(
    /rec_set_application_stage/.test(stages) && /expectedStatus/.test(stages),
    "B · batch moves state the stage they were made from",
  );

  const apps = code(F.apps);
  const status = apps.slice(apps.indexOf("export const updateApplicationStatusAsEmployer"));
  ok(
    !/send[A-Za-z]*Email|recruitment_messages|jase_notification_payload/.test(
      status.slice(0, status.indexOf("export const", 20)),
    ),
    "B · the status server function sends nothing",
  );

  const send = fns.slice(fns.indexOf("async function sendOne"));
  const body = send.slice(0, send.indexOf("\n}\n"));
  ok(
    body.indexOf("rec_claim_message_send") > 0 &&
      body.indexOf("rec_claim_message_send") < body.indexOf("sendRecruitmentMessageEmail(") &&
      body.indexOf("sendRecruitmentMessageEmail(") < body.indexOf("rec_settle_message_send"),
    "B · sending is claim, then e-mail, then settle",
  );
  ok(!/return[^;]*recipient_email/.test(body), "B · the address never goes back to the browser");

  const composer = code(F.composer);
  ok(
    /idempotencyKey: draftId \? null : key\.current/.test(composer),
    "B · a new draft carries an idempotency key",
  );
  ok(
    /`\$\{batchKey\.current\}:\$\{r\.applicationId\}`/.test(composer),
    "B · a batch keys every recipient's draft",
  );

  const apply = code(F.apply);
  ok(
    /applicationId: attemptId\.current/.test(apply),
    "B · a submission retry reuses its attempt id",
  );
}

/* ================================================================== */
/* C · Controls withheld where the database would refuse               */
/* ================================================================== */
{
  const candidate = code(F.candidate);
  ok(
    /nextStatuses\.filter\(\(n\) => canDecide \|\| \(n !== "hired" && n !== "rejected"\)\)/.test(
      candidate,
    ),
    "C · the candidate page offers hire/reject only to a seat that may decide",
  );
  ok(/expectedStatus:/.test(candidate), "C · the candidate page moves from the stage it showed");
  ok(
    /next === "hired" \|\| next === "rejected" \? setPendingDecision\(next\) : setStatus\.mutate\(next\)/.test(
      candidate.replace(/\s+/g, " "),
    ),
    "C · a decision is confirmed before it is recorded",
  );
  const panels = code(F.panels);
  ok(
    /if \(!ws\.canManage\) \{[\s\S]{0,200}rec\.message\.restricted/.test(panels),
    "C · a restricted seat gets no composer",
  );
  const table = code(F.table);
  ok(
    /manageAll &&/.test(table) && /canManageJob\(r\.jobId\)/.test(table),
    "C · batch decisions and messages need the right on every selected job",
  );
  const list = code(F.list);
  ok(
    /canDecideFor\(r\.jobId\) \|\| \(n !== "hired" && n !== "rejected"\)/.test(list),
    "C · the applications list offers decisions by the same rule",
  );
}

/* ================================================================== */
/* D · AI boundaries                                                    */
/* ================================================================== */
{
  const ai = code(F.ai);
  for (const table of [
    "job_application_answers",
    "cv_document",
    "sp_",
    "scp_attempt",
    "recruitment_comments",
    "scp_interview",
  ]) {
    ok(!ai.includes(`from("${table}`), `D · the writing help reads nothing from ${table}`);
  }
  ok(
    !/\b(score|rank|match percentage|matchScore|suitab)/i.test(ai.replace(/Never rank, score/, "")),
    "D · the writing help computes no score, rank or match",
  );
  ok(
    (ai.match(/source: "template"/g) ?? []).length >= 6,
    "D · every path without a model returns a labelled template",
  );
  ok(/scp_iv_ai_real_model_permitted/.test(ai), "D · the platform's AI switch is honoured");
  ok(
    /selected\.mode === "synthetic"\) return \{ ok: false/.test(ai),
    "D · the interview stand-in is never passed off as a model",
  );
  // Read raw: the pattern itself contains "//", which the comment stripper eats.
  ok(
    read(F.ai).includes("/\\d{1,2}[:.]\\d{2}|https?:\\/\\//.test(parsed.data.paragraph)"),
    "D · a model paragraph carrying a time or a link is refused",
  );
}

/* ================================================================== */
/* E · Copy                                                             */
/* ================================================================== */
{
  const sv = dictionaries.sv as Record<string, string>;
  const en = dictionaries.en as Record<string, string>;
  const keys = Object.keys(recruitmentSv);
  ok(keys.length >= 350, "E · the workspace copy is enumerated");
  const SAME = new Set([
    "rec.col.status",
    "rec.list.filterStatus",
    "rec.message.kind.information",
    "rec.booking.kind.video",
    "rec.section.passport",
  ]);
  for (const k of keys) {
    const a = sv[k];
    const b = en[k];
    if (!a || !b) fails.push(`E · "${k}" is missing in one language`);
    else if (a === b && !SAME.has(k)) fails.push(`E · "${k}" is identical in sv and en ("${a}")`);
    else passed += 1;
  }
  ok(
    Object.keys(recruitmentEn).length === keys.length,
    "E · the English copy has exactly the Swedish keys",
  );
  for (const lang of ["sv", "en"] as const) {
    for (const kind of MESSAGE_KINDS) {
      const m = messageTemplate({
        kind,
        language: lang,
        candidateName: "Kim",
        employerName: "AB",
        jobTitle: "Väktare",
      });
      ok(
        !/poäng|score|rank|resultat på test|test result|bedömningen visar|assessment showed/i.test(
          m.body,
        ),
        `E · the ${lang} ${kind} template states no score or test result`,
      );
    }
    const rej = messageTemplate({
      kind: "rejection",
      language: lang,
      candidateName: null,
      employerName: "AB",
      jobTitle: "Väktare",
    }).body;
    ok(
      !/eftersom|because|på grund av|due to/i.test(rej),
      `E · the ${lang} rejection gives no reason`,
    );
  }
  for (const k of keys) {
    const text = `${sv[k] ?? ""} ${en[k] ?? ""}`.toLowerCase();
    if (
      /rekommender|lämpligast|bäst lämpad|recommend|best candidate|most suitable|rangordna(?! inte)/.test(
        text,
      ) &&
      !/rangordnar inte|never rank|does not rank/.test(text)
    ) {
      fails.push(`E · "${k}" expresses an opinion about candidates`);
    }
  }
}

/* ================================================================== */
/* G · The hand-offs from the application                              */
/* ================================================================== */
{
  // The interview sees the candidate's answers -- as facts beside the cover
  // note, read for the case's OWN application, and never as a model input.
  const withAnswers = (answers: Parameters<typeof buildInterviewContext>[0]["application"]) =>
    buildInterviewContext({
      candidateName: "Kim Kandidat",
      application: answers,
      job: null,
      cv: null,
      assessment: null,
      assessmentPending: false,
      reads: { application: "ok", job: "ok", cv: "ok", assessment: "ok" },
    }).known;
  const app = {
    status: "reviewing",
    appliedAt: "2026-09-23T10:00:00Z",
    coverNote: null,
    jobTitleSv: "Väktare",
    jobTitleEn: "Security officer",
  };
  const known = withAnswers({
    ...app,
    answers: [
      {
        questionId: "q1",
        promptSv: "Har du väktarutbildning?",
        promptEn: "Security officer training?",
        kind: "yes_no",
        text: null,
        bool: false,
      },
      {
        questionId: "q2",
        promptSv: "Berätta om din erfarenhet.",
        promptEn: null,
        kind: "text",
        text: "Fem år i butik.",
        bool: null,
      },
    ],
  });
  ok(
    known.some(
      (f) =>
        f.sv === "Har du väktarutbildning? — Nej" && f.en === "Security officer training? — No",
    ),
    "G · a yes/no answer reaches the interviewer as the question and the answer, in both languages",
  );
  ok(
    known.some(
      (f) => f.sv === "Berätta om din erfarenhet. — Fem år i butik." && f.from === "application",
    ),
    "G · a text answer reaches the interviewer, attributed to the application",
  );
  ok(
    known.every((f) => f.verified === undefined),
    "G · an answer is never presented as verified",
  );
  ok(
    withAnswers({ ...app, answers: null }).some((f) => f.key === "answers-unreadable"),
    "G · a failed answers read is said on the surface, never shown as 'no answers'",
  );

  const ctx = code(F.ivContext);
  ok(
    /readAnswers\(db, applicationId\)/.test(ctx) &&
      /const applicationId = str\(c\.application_id\)/.test(ctx) &&
      /\.from\("job_application_answers"\)[\s\S]{0,300}\.eq\("application_id", applicationId\)/.test(
        ctx,
      ),
    "G · answers are read for the case row's own application, never one named by the request",
  );
  ok(
    !/case_source|scp_iv_add_case_source|addCaseSource/.test(
      ctx.slice(ctx.indexOf("async function readAnswers"), ctx.indexOf("async function readCv")),
    ),
    "G · answers are shown to the interviewer and never become a case source a model reads",
  );

  // An assessment already sent on this application is not offered again.
  const panel = code(F.assessmentPanel);
  ok(
    /alreadySent = new Set\([\s\S]{0,160}attemptStatus !== "abandoned"[\s\S]{0,80}assessmentSlug/.test(
      panel,
    ) &&
      /const sendable = options\.filter\(\(o\) => !alreadySent\.has\(o\.slug\)\)/.test(panel) &&
      /sendable\.map\(\(o\)/.test(panel) &&
      !/options\.map\(\(o\)/.test(panel),
    "G · the send button is withheld for an assessment already sent on this application",
  );

  // The candidate page's interview notes are this application's own.
  const cand = code(F.candidate);
  ok(
    /r\.rowKind === "assessment" && r\.applicationId === c\.applicationId/.test(cand) &&
      /r\.rowKind === "interview_note" && r\.attemptId !== null && ownAttempts\.has\(r\.attemptId\)/.test(
        cand,
      ),
    "G · interview notes from the same candidate's other application stay off this one",
  );

  // The overview has one recruitment entry point, not a second card for it.
  const ov = code(F.overview);
  ok(
    !ov.includes('title={t("employer.overview.card.jobs.title")}'),
    "G · the overview no longer repeats recruitment as a card below the recruitment table",
  );
}

console.log(`${passed} assertions`);
if (fails.length) {
  for (const f of fails) console.error(`  FAIL ${f}`);
  console.error(`\nrecruitment-workspace:check FAILED (${fails.length})`);
  process.exit(1);
}
console.log("recruitment-workspace:check OK");
