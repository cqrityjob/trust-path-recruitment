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
  format: "src/lib/recruitment/format.ts",
  booking: "src/components/recruitment/BookingDialog.tsx",
  listContext: "src/lib/recruitment/list-context.ts",
  migration: "supabase/migrations/20261212090000_recruitment_candidate_view.sql",
  receipts: "supabase/migrations/20261213090000_recruitment_application_receipts.sql",
  receiptsSuite: "supabase/tests/recruitment_application_receipts_test.sql",
  receiptSection: "src/components/recruitment/ReceiptSettingsSection.tsx",
  receiptServer: "src/lib/recruitment/receipt.server.ts",
  transport: "src/lib/email/send-recruitment-message-email.server.ts",
  sweepRoute: "src/routes/api.recruitment.receipts-sweep.ts",
  sweepWorkflow: ".github/workflows/recruitment-receipts-sweep.yml",
  evidenceWorkflow: ".github/workflows/recruitment-evidence.yml",
  jobsIndex: "src/routes/_authenticated.employer.$employerSlug.jobs.index.tsx",
  submit: "src/lib/job-intelligence/applications.functions.ts",
  employerJobs: "src/lib/job-intelligence/employer-jobs.functions.ts",
  candidateApps: "src/routes/_authenticated.my-career.applications.tsx",
  candidateInbox: "src/components/recruitment/CandidateApplicationInbox.tsx",
  workflow: ".github/workflows/recruitment-evidence.yml",
  verify: "scripts/recruitment-evidence-verify.ts",
  suite: "supabase/tests/recruitment_candidate_view_test.sql",
  dbTest: "scripts/db-test.sh",
};

console.log("recruitment workspace\n");

// The migration the list's vocabulary now lives in; read by several sections.
const sql = read(F.migration);

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

  // The list's filters, sorts and paging live in ONE place, the database
  // function rec_candidate_view (20261212090000): the page, the counts and
  // previous/next all read the same ordering, and there is no in-memory copy
  // of the vocabulary to drift from it. Read here for the words; EXECUTED by
  // supabase/tests/recruitment_candidate_view_test.sql with 5 200
  // applications, in scripts/db-test.sh, before and after a rollback cycle.
  ok(
    /CREATE OR REPLACE FUNCTION public\.rec_candidate_view\(/.test(sql) &&
      /CREATE OR REPLACE FUNCTION public\.rec_job_counts\(/.test(sql),
    "A · the candidate list and its counts are database reads",
  );
  ok(
    /WHEN 'open' THEN ja\.status IN \('submitted', 'reviewing', 'interview'\)/.test(sql) &&
      /WHEN 'new' THEN ja\.status = 'submitted'/.test(sql) &&
      /WHEN 'decided' THEN ja\.status NOT IN \('submitted', 'reviewing', 'interview'\)/.test(sql),
    "A · the stage filters are the same predicates the workspace uses (open = unresolved, new = submitted)",
  );
  ok(
    /count\(\*\) FILTER \(WHERE ja\.status = 'submitted'\)/.test(sql) &&
      /count\(\*\) FILTER \(WHERE ja\.status IN \('submitted', 'reviewing', 'interview'\)\)/.test(
        sql,
      ),
    "A · and the counts count with the same predicates",
  );
  ok(
    /\(_owner = 'none' AND m\.responsible_user_id IS NULL\)/.test(sql),
    "A · 'no one assigned' filters on the owner",
  );
  ok(
    /p\.display_name ILIKE _like ESCAPE '\\'/.test(sql) &&
      /replace\(replace\(replace\(btrim\(_q\), '\\', '\\\\'\), '%', '\\%'\), '_', '\\_'\)/.test(
        sql,
      ),
    "A · search matches the name as a plain substring, wildcards escaped",
  );
  ok(
    /display_name COLLATE "sv-SE-x-icu" END ASC NULLS LAST/.test(sql) &&
      /display_name COLLATE "sv-SE-x-icu" END DESC NULLS LAST/.test(sql),
    "A · sorting by name is Swedish-alphabetical, unnamed last either way",
  );
  ok(
    /base\.next_at END ASC NULLS LAST/.test(sql) && /base\.next_at END DESC NULLS LAST/.test(sql),
    "A · sorting by activity puts the unplanned last either way",
  );
  ok(
    /\n\s+base\.id ASC\) AS rn,/.test(sql),
    "A · every sort breaks ties on the application id, so previous/next never jumps",
  );
  ok(
    /IF _employer IS NULL OR NOT public\.rec_is_member\(_employer\) THEN\n\s+RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED'/.test(
      sql,
    ) &&
      /IF NOT public\.rec_is_member\(_employer_id\) THEN\n\s+RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED'/.test(
        sql,
      ),
    "A · both reads refuse a non-member with one error, whether the vacancy exists or not",
  );
  ok(
    /REVOKE ALL ON FUNCTION public\.rec_candidate_view\([^)]*\)\n\s+FROM PUBLIC, anon;/.test(sql) &&
      /REVOKE ALL ON FUNCTION public\.rec_job_counts\(uuid, uuid\) FROM PUBLIC, anon;/.test(sql) &&
      (sql.match(/\nSECURITY DEFINER\n/g) ?? []).length === 2 &&
      (sql.match(/\nSTABLE\n/g) ?? []).length === 2,
    "A · both are SECURITY DEFINER, STABLE, and anon cannot execute them",
  );
  const suite = read(F.suite);
  const dbTest = read(F.dbTest);
  ok(
    /generate_series\(1, 5200\)/.test(suite) &&
      /run_candidate_view_suite "before rollback"/.test(dbTest) &&
      /run_candidate_view_suite "after reapply"/.test(dbTest) &&
      /-lt 47 \]/.test(dbTest) &&
      /the candidate view suite passed WITHOUT its migration/.test(dbTest),
    "A · the suite runs with 5 200 applications, before and after a rollback cycle, and must fail without the migration",
  );

  // The overview counts with the predicate and links to the filter with the
  // same meaning; the list filters `status === "submitted"`.
  const fns = code(F.fns);
  ok(
    /newCount: Number\(c\.new_count\),/.test(fns) &&
      /count\(\*\) FILTER \(WHERE ja\.status = 'submitted'\)/.test(sql),
    "A · the overview's new count is the database's count of 'submitted' -- the same predicate",
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
    /\{canManage && \(/.test(table) &&
      /canManage=\{recruitment\?\.canManage \?\? false\}/.test(code(F.hub)),
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

  // A test is offered only for a candidate still in the process.
  ok(
    /canAssign=\{canAssign && !completed && status !== null && isUnresolved\(status\)\}/.test(cand),
    "G · no test is offered for a decided or withdrawn candidate, or in a completed recruitment",
  );

  // Back from a report or an interview (no ?list=), the list is recalled --
  // but only one that holds this very candidate.
  {
    const store = new Map<string, string>();
    (globalThis as unknown as { window: unknown }).window = {
      sessionStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    };
    const L = await import("../src/lib/recruitment/list-context");
    L.saveListContext("k1", {
      ids: ["a1", "a2"],
      href: "/employer/x/jobs/j?stage=new",
      scrollY: 120,
      labelKey: "recruitment",
      restorePending: false,
    });
    ok(L.recallListKeyFor("a2") === "k1", "G · the list a candidate was opened from is recalled");
    ok(
      L.recallListKeyFor("zz") === undefined,
      "G · a list that does not hold this candidate is never recalled",
    );
    L.saveListContext("k2", {
      query: { employerId: "e1", jobId: "j1", view: { stage: "new", page: 2 } },
      href: "/employer/x/jobs/j1?step=applications&stage=new&page=2",
      scrollY: 0,
      labelKey: "recruitment",
      restorePending: false,
    });
    ok(
      L.readListContext("k2")?.query?.jobId === "j1" && L.readListContext("k2")?.ids === undefined,
      "G · a recruitment list stores its DEFINITION, never its ids",
    );
    ok(
      L.recallListKeyFor("any", "j1") === "k2" &&
        L.recallListKeyFor("any", "j2") === undefined &&
        L.recallListKeyFor("any") === undefined,
      "G · a recruitment list is recalled for the vacancy it belongs to, and for no other",
    );
    ok(
      /const key = listParam \?\? recallListKeyFor\(applicationId, listJobId\)/.test(cand),
      "G · the candidate view falls back to the recalled list only when the URL carries none, and only once the vacancy is known",
    );
    ok(
      /neighboursFn\(\{\n\s+data: \{ employerId, jobId: listQuery!\.jobId, applicationId, view: listQuery!\.view \},/.test(
        cand,
      ) && /\? \(neighboursQuery\.data \?\? null\)/.test(cand),
      "G · previous/next for a recruitment list come from the server's ordering, not from ids in the browser",
    );
  }

  // "Upcoming interviews" counts only live processes.
  {
    const now = new Date("2026-10-01T12:00:00Z");
    const soon = { status: "confirmed", startsAt: "2026-10-02T12:00:00Z" };
    ok(
      D.isOpenInterview(soon, "interview", "open", now),
      "G · an open candidate's interview is upcoming",
    );
    ok(
      !D.isOpenInterview(soon, "hired", "open", now),
      "G · a hired candidate's leftover booking is not upcoming",
    );
    ok(!D.isOpenInterview(soon, "withdrawn", null, now), "G · nor a withdrawn candidate's");
    ok(
      !D.isOpenInterview(soon, "interview", "completed", now),
      "G · nor any in a completed recruitment",
    );
    ok(
      /\.filter\(\(b\) =>\s*isOpenInterview\(/.test(code(F.fns)),
      "G · the overview's upcoming interviews go through isOpenInterview",
    );
  }

  // The overview has one recruitment entry point, not a second card for it.
  const ov = code(F.overview);
  ok(
    !ov.includes('title={t("employer.overview.card.jobs.title")}'),
    "G · the overview no longer repeats recruitment as a card below the recruitment table",
  );
}

/* ================================================================== */
/* H · One case, five steps, one page at a time                        */
/* ================================================================== */
{
  // The step a case is at is computed from the data, never from a visit,
  // and every combination the product can be in lands somewhere sensible.
  const base = {
    requirementsCount: 0,
    questionsCount: 0,
    hasRequirementsText: false,
    advertReady: false,
    total: 0,
    unresolved: 0,
  };
  const at = (i: Partial<D.StepInput> & { phase: D.RecruitmentPhase }) =>
    D.currentStepOf({ ...base, ...i });
  ok(at({ phase: "draft" }) === "requirements", "H · an empty draft starts at the requirements");
  ok(
    at({ phase: "draft", requirementsCount: 1 }) === "advert",
    "H · a draft with requirements but no advert text is at the advert",
  );
  ok(
    at({ phase: "draft", hasRequirementsText: true, advertReady: true }) === "publishing",
    "H · a draft ready to publish is at publishing",
  );
  ok(
    at({ phase: "published", advertReady: true }) === "applications",
    "H · a live advert is at applications",
  );
  const live = D.stepStatesOf({
    ...base,
    phase: "published",
    advertReady: true,
    requirementsCount: 2,
  });
  ok(
    live.requirements === "done" && live.advert === "done" && live.publishing === "done",
    "H · and its first three steps are done because the data says so",
  );
  ok(
    at({ phase: "closed", advertReady: true, total: 4, unresolved: 2 }) === "applications",
    "H · a closed advert with undecided candidates is still at applications",
  );
  ok(
    at({ phase: "closed", advertReady: true, total: 4, unresolved: 0 }) === "closing",
    "H · a closed advert with every candidate decided is at closing",
  );
  const done = D.stepStatesOf({ ...base, phase: "completed", advertReady: true, total: 4 });
  ok(
    done.applications === "done" && done.closing === "current",
    "H · a completed recruitment shows every step done and rests on the close",
  );
  ok(
    D.RECRUITMENT_STEPS.join(",") === "requirements,advert,publishing,applications,closing",
    "H · the five steps are the five steps, in order",
  );

  // Paging is the database's: one page per read, clamped into range, and
  // the numbers around it from the same read.
  const fns = code(F.fns);
  const pageFn = fns.slice(
    fns.indexOf("export const listRecruitmentCandidatesPage"),
    fns.indexOf("export const getCandidateNeighbours"),
  );
  ok(
    /rpc\("rec_candidate_view", viewArgs\(data\.jobId, view, null\)\)/.test(pageFn) &&
      /_size: PAGE_SIZE,/.test(fns) &&
      !/\.limit\(/.test(pageFn) &&
      !/applyCandidateView|pageSlice/.test(fns),
    "H · the case page reads ONE page from the database and pages nothing in memory",
  );
  ok(
    !/orderedIds/.test(fns) && !/orderedIds/.test(code(F.table)) && !/orderedIds/.test(code(F.hub)),
    "H · no read ships the ids of the whole list to the browser",
  );
  ok(
    /_stage: view\.stage \?\? "open",/.test(fns),
    "H · the default view is open candidates -- the server asks for 'open' unless the URL says otherwise",
  );
  ok(
    /o\.rn > \(LEAST\(_page_v, GREATEST\(1, ceil\(o\.n::numeric \/ _size_v\)::integer\)\) - 1\) \* _size_v/.test(
      sql,
    ),
    "H · a page past the end opens the last page, not nothing",
  );
  ok(
    (fns.match(/rpc\("rec_job_counts"/g) ?? []).length === 2 &&
      /_job_id: data\.jobId \}\)/.test(pageFn),
    "H · the case page's counts and the overview's counts are the same database count",
  );
  ok(
    /viewArgs\(data\.jobId, data\.view, data\.applicationId\)/.test(fns) &&
      /around\.find\(\(r\) => r\.rank === self\.rank - 1\)/.test(fns),
    "H · previous/next are read around ONE application in the same ordering",
  );
  ok(
    /awaitingReview: page\.counts\.new,/.test(code(F.hub)) &&
      /assessmentOpen: openAssessments\.ids\.size,/.test(code(F.hub)) &&
      /useOpenAssessmentApplications\(employerId, true, jobId\)/.test(code(F.hub)),
    "H · the chips are counted over the whole vacancy, never over the page on screen",
  );
  ok(!("page" in D.firstPage({ q: "a", page: 4 })), "H · a filter change goes back to page 1");
  ok(
    D.compactView({ page: 1 }).page === undefined && D.compactView({ page: 2 }).page === 2,
    "H · page 1 needs no parameter",
  );

  // Answer filters: strict, deduplicated, and never widened by a bad value.
  const q1 = "11111111-1111-4111-8111-111111111111";
  const q2 = "22222222-2222-4222-8222-222222222222";
  const parsed = D.parseAnswerFilter(`${q1}:y,${q2}:n,not-a-uuid:y,${q1}:n,${q2}:maybe`);
  ok(
    parsed.length === 2 && parsed[0].value === true && parsed[1].value === false,
    "H · an answer filter keeps the first valid entry per question and drops the rest",
  );
  ok(
    D.serializeAnswerFilter(parsed) === `${q1}:y,${q2}:n` &&
      D.serializeAnswerFilter([]) === undefined,
    "H · and round-trips through the URL",
  );
  ok(
    /AND NOT EXISTS \(\n\s+SELECT 1 FROM jsonb_array_elements\(_answers\) f\n\s+WHERE NOT EXISTS \(/.test(
      sql,
    ) && /AND a\.answer_bool = \(f ->> 'value'\)::boolean\)\)/.test(sql),
    "H · an answer filter keeps exactly the candidates who answered so -- a 'no' filter is not 'anything but yes', an unanswered question matches neither",
  );

  // The surfaces read those definitions, and the selection is per page.
  const hub = code(F.hub);
  ok(
    /<ProcessStepNav/.test(hub) && /stepStatesOf\(stepInput\)/.test(hub),
    "H · the case page renders the step nav from the step model",
  );
  ok(
    /listRecruitmentCandidatesPage/.test(hub) &&
      !/listRecruitmentCandidates\b/.test(hub.replace(/listRecruitmentCandidatesPage/g, "")),
    "H · the case page reads ONE page from the server, never the whole list",
  );
  ok(
    /step: "applications" as const/.test(code(F.overview)),
    "H · the overview's counts open the applications step",
  );
  const table = code(F.table);
  ok(/rec\.table\.selectAllPage/.test(table), "H · 'select all' says it is the page");
  ok(
    /const pageIds = useMemo\(\(\) => new Set\(rows\.map\(\(r\) => r\.applicationId\)\), \[rows\]\)/.test(
      table,
    ) && /\[\.\.\.prev\]\.filter\(\(id\) => pageIds\.has\(id\)\)/.test(table),
    "H · a selection never outlives the page it was made on",
  );
  ok(
    /e\.target\.checked \? new Set\(rows\.map\(\(r\) => r\.applicationId\)\) : new Set\(\)/.test(
      table,
    ),
    "H · select-all selects the rows on screen, never the ids of other pages",
  );
  ok(
    /itemResults\.map\(\(i\)/.test(table) && /keepFailed\(items\)/.test(table),
    "H · a batch reports per candidate and keeps the failed ones selected",
  );
  ok(
    /query: \{ employerId, jobId, view: compactView\(view\) \},/.test(table) &&
      !/\bids:/.test(table),
    "H · opening a candidate remembers the list's definition, never its ids",
  );
  ok(
    /rec\.pager\.showing/.test(table) && /setPage\(page\.page \+ 1\)/.test(table),
    "H · the pager shows the hit count and moves a page at a time",
  );

  // Booking from the list: separate bookings, nothing sent.
  const booking = code("src/components/recruitment/BookingDialog.tsx");
  ok(
    /for \(const p of plan\)/.test(booking) && /bookingId: null,/.test(booking),
    "H · several selected candidates become several bookings, one call each",
  );
  ok(
    !/rec_claim_message_send|sendRecruitmentMessages|saveMessageDraft/.test(booking),
    "H · saving a time sends nothing -- the invitation is its own act",
  );
  ok(
    /consecutiveStarts\(start, duration, candidates\.length\)/.test(booking) &&
      /rec\.bookingDialog\.slots/.test(booking),
    "H · the prefilled slots are back to back, and each candidate's own is shown",
  );

  // The series is checked as a whole BEFORE the first save, by executing the
  // arithmetic -- the reproduction is 25 candidates, 45 minutes, from 10:00.
  const Fm = await import("../src/lib/recruitment/format");
  const twentyFive = Fm.consecutiveStarts("10:00", 45, 25);
  ok(
    twentyFive.length === 25 &&
      twentyFive[0] === "10:00" &&
      twentyFive[17] === "22:45" &&
      twentyFive[18] === "23:30" &&
      twentyFive[19] === null &&
      twentyFive[24] === null &&
      !twentyFive.includes("23:59"),
    "H · 25 slots of 45 minutes from 10:00: the 20th and later are on the next day and say so -- never 23:59",
  );
  const overflow = Fm.checkBookingSeries(
    twentyFive.map((start, i) => ({ id: `c${i}`, start })),
    45,
  );
  ok(
    overflow?.kind === "overflow" && overflow.fits === 18 && overflow.total === 25,
    "H · that series is refused as a whole: 18 of 25 fit, so nothing may be saved",
  );
  ok(
    Fm.checkBookingSeries([{ id: "a", start: "23:30" }], 45)?.kind === "overflow",
    "H · a single slot that ends after midnight does not fit either",
  );
  ok(
    Fm.checkBookingSeries(
      [
        { id: "a", start: "10:00" },
        { id: "b", start: "10:45" },
        { id: "c", start: "11:30" },
      ],
      45,
    ) === null,
    "H · three back-to-back slots are a valid series",
  );
  const overlap = Fm.checkBookingSeries(
    [
      { id: "a", start: "10:00" },
      { id: "b", start: "11:30" },
      { id: "c", start: "10:30" },
    ],
    45,
  );
  ok(
    overlap?.kind === "overlap" && overlap.first === "a" && overlap.second === "c",
    "H · a slot typed by hand into another's time is caught, whichever order they were entered in",
  );
  ok(
    Fm.checkBookingSeries(
      [
        { id: "a", start: "10:00" },
        { id: "b", start: "10:00" },
      ],
      45,
    )?.kind === "overlap",
    "H · two candidates at the same time is an overlap",
  );
  ok(
    Fm.addMinutes("23:30", 45) === null && Fm.addMinutes("10:00", 45) === "10:45",
    "H · addMinutes never clamps",
  );
  ok(
    /const problem = checkBookingSeries\(slots, duration\);\n\s+if \(problem\) return setError\(seriesMessage\(problem\)\);/.test(
      booking,
    ) &&
      booking.indexOf("checkBookingSeries(slots, duration)") <
        booking.indexOf("for (const p of plan)") &&
      booking.indexOf("resolveZonedTime(date, time, timezone)") <
        booking.indexOf("for (const p of plan)"),
    "H · the dialog checks the whole series and every zone-resolved instant before the first save",
  );
  ok(
    /startFor\(c\.applicationId, i\) \?\? ""/.test(booking) &&
      /rec\.bookingDialog\.slotOverflow/.test(booking),
    "H · a slot that does not fit is shown empty and named, not as 23:59",
  );

  // Daylight-saving time in the chosen zone: a wall-clock time that does not
  // exist, or exists twice, is refused rather than guessed at.
  const gap = Fm.resolveZonedTime("2026-03-29", "02:30", "Europe/Stockholm");
  const repeat = Fm.resolveZonedTime("2026-10-25", "02:30", "Europe/Stockholm");
  const plain = Fm.resolveZonedTime("2026-10-06", "10:00", "Europe/Stockholm");
  ok(
    !gap.ok && gap.reason === "nonexistent",
    "H · 02:30 on the night the clocks go forward does not exist in Stockholm, and is said not to",
  );
  ok(
    !repeat.ok && repeat.reason === "ambiguous",
    "H · 02:30 on the night the clocks go back happens twice in Stockholm, and is said to",
  );
  ok(
    plain.ok && plain.iso === "2026-10-06T08:00:00.000Z",
    "H · 10:00 on an ordinary day in Stockholm is 08:00Z",
  );
  const dubai = Fm.resolveZonedTime("2026-03-29", "02:30", "Asia/Dubai");
  ok(dubai.ok && dubai.iso === "2026-03-28T22:30:00.000Z", "H · a zone without DST has no gap");
  ok(
    !Fm.resolveZonedTime("2026-13-01", "10:00", "Europe/Stockholm").ok &&
      !Fm.resolveZonedTime("2026-10-06", "10:00", "Mars/Olympus").ok,
    "H · a bad date or an unknown zone is invalid, not a guess",
  );
  ok(
    /rec\.bookingDialog\.error\.nonexistent/.test(booking) &&
      /rec\.bookingDialog\.error\.ambiguous/.test(booking),
    "H · and each of those has its own sentence in the dialog",
  );
  ok(
    /rec\.bookingDialog\.linkNote/.test(booking),
    "H · a pasted meeting link is called a link, not an integration",
  );
}

/* ================================================================== */
/* I · The automatic receipt                                            */
/* ================================================================== */
{
  const rc = read(F.receipts);
  const suite = read(F.receiptsSuite);
  const section = code(F.receiptSection);
  const server = code(F.receiptServer);
  const transport = code(F.transport);
  const sweepRoute = code(F.sweepRoute);
  const submit = code(F.submit);
  const jobs = code(F.employerJobs);
  const panels = code(F.panels);
  const fns = code(F.fns);
  const copy = read("src/i18n/recruitment-copy.ts");
  const dbTest = read(F.dbTest);
  const between = (text: string, from: string, to: string) => {
    const i = text.indexOf(from);
    const j = i < 0 ? -1 : text.indexOf(to, i);
    return i < 0 || j < 0 ? "" : text.slice(i, j);
  };

  // Written by the database, once, in the application's own transaction.
  ok(
    /CREATE CONSTRAINT TRIGGER job_applications_zz_receipt\n\s+AFTER INSERT ON public\.job_applications\n\s+DEFERRABLE INITIALLY DEFERRED/.test(
      rc,
    ),
    "I · the receipt is written by a deferred trigger at the commit of the application, never before",
  );
  ok(
    /CREATE UNIQUE INDEX IF NOT EXISTS recruitment_messages_receipt_once_idx\n\s+ON public\.recruitment_messages \(application_id\) WHERE kind = 'receipt'/.test(
      rc,
    ) && /ON CONFLICT \(application_id\) WHERE kind = 'receipt' DO NOTHING/.test(rc),
    "I · one receipt per application is the index's rule, not the code's",
  );
  ok(
    /IF NEW\.status <> 'submitted' THEN\n\s+RETURN NULL;/.test(rc) &&
      /IF NOT FOUND OR NOT _s\.receipt_enabled THEN\n\s+RETURN NULL;/.test(rc),
    "I · nothing is written for an application that is not a new submission, or for a recruitment with the receipt off",
  );
  const triggerFn = between(
    rc,
    "FUNCTION public.rec_create_application_receipt()",
    "REVOKE ALL ON FUNCTION public.rec_create_application_receipt()",
  );
  ok(
    triggerFn.length > 0 &&
      !/EXCEPTION WHEN/.test(triggerFn) &&
      /position\('EXCEPTION' in pg_get_functiondef\('public\.rec_create_application_receipt\(\)'::regprocedure\)\) > 0/.test(
        rc,
      ) &&
      /G1 a receipt that cannot be written fails the application''s own transaction/.test(suite),
    "I · a receipt that cannot be written fails the application's own transaction: no silent gap, proved at apply time and in the suite",
  );
  ok(
    /'sent', now\(\), NULL, NULL, 'not_attempted', 'receipt:' \|\| NEW\.id::text/.test(rc),
    "I · the receipt is a SENT message by nobody with the e-mail not yet attempted, under the logical e-mail's key",
  );
  ok(
    !/CREATE TRIGGER jobs_receipt_default/.test(rc) &&
      /receipt_enabled\s+boolean NOT NULL DEFAULT false/.test(rc) &&
      /rpc\("rec_set_receipt_settings", \{\n\s+_job_id: inserted\.id,\n\s+_enabled: true,/.test(
        jobs,
      ),
    "I · the database default is off (existing recruitments keep their behaviour); a NEW recruitment is switched on by the product",
  );
  // The standard text: no promised response time, both languages, a link.
  ok(
    /rec_receipt_default\(_language text, _part text\)/.test(rc) &&
      /Hej \{namn\}!/.test(rc) &&
      /Hi \{name\}!/.test(rc) &&
      /\{länk\}/.test(rc) &&
      /\{link\}/.test(rc) &&
      !/inom \d+ (arbets)?dag/i.test(rc) &&
      !/within \d+ (working )?days?/i.test(rc),
    "I · the standard text greets by name, links the application, in both languages, and promises no response time",
  );
  // Who may change it: the database's rule, mirrored, never widened.
  ok(
    /FUNCTION public\.rec_set_receipt_settings\([\s\S]*?IF NOT public\.rec_can_manage\(_job_id\) THEN\n\s+RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED'/.test(
      rc,
    ) &&
      /canManage=\{r\.canManage\}/.test(
        code("src/components/recruitment/RecruitmentWorkspaceTabs.tsx"),
      ),
    "I · the setting is written by whoever may write to candidates (rec_can_manage), refused for everyone else at the database",
  );

  // The e-mail truth: trusted server code only.
  const serviceOnly = [
    "public.rec_claim_receipt_send(uuid, uuid, boolean, boolean)",
    "public.rec_settle_receipt_send(uuid, text, text, text)",
    "public.rec_claim_due_receipts(integer, uuid)",
  ];
  ok(
    serviceOnly.every(
      (f) =>
        rc.includes(`REVOKE ALL ON FUNCTION ${f} FROM PUBLIC, anon, authenticated;`) &&
        rc.includes(`GRANT EXECUTE ON FUNCTION ${f} TO service_role;`) &&
        !new RegExp(
          `GRANT EXECUTE ON FUNCTION ${f.replace(/[()]/g, "\\$&")} TO [^;]*authenticated`,
        ).test(rc),
    ) &&
      /OR has_function_privilege\('authenticated', _f, 'EXECUTE'\) THEN\n\s+RAISE EXCEPTION 'REC_RECEIPT_PROOF: a signed-in person could drive the e-mail truth/.test(
        rc,
      ) &&
      /S2 the applicant cannot attest "sent"/.test(suite) &&
      /S5 an employer cannot attest "sent"/.test(suite),
    "I · claim, settle and recovery are executable by service_role alone: no candidate or employer can attest 'sent' through the API",
  );
  ok(
    /import \{ supabaseAdmin \} from "@\/integrations\/supabase\/client\.server"/.test(server) &&
      /\(supabaseAdmin as Loose\)\.rpc\("rec_claim_receipt_send", \{\n\s+_application_id: applicationId,\n\s+_actor: opts\.actorUserId \?\? null,/.test(
        server,
      ) &&
      /actorUserId: ctx\.userId,\n\s+retry: true,\n\s+acceptDuplicate: data\.acceptDuplicate === true,/.test(
        fns,
      ),
    "I · the server drives the e-mail with its own credentials and names the person it acts for; the database checks that person",
  );
  ok(
    /WHEN _app\.applicant_user_id = _user THEN 'applicant'/.test(rc) &&
      /IF \(_retry OR _accept_duplicate\) AND _who <> 'manager' THEN\n\s+RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED'/.test(
        rc,
      ) &&
      /ELSIF _accept_duplicate THEN\n[\s\S]*?RAISE EXCEPTION 'RECRUITMENT_NOT_PERMITTED'/.test(rc),
    "I · only a manager may retry, and accepting a possible duplicate is a person's decision, never the system's",
  );
  // Every attempt has an identity; an answer counts for its own attempt only.
  ok(
    /email_attempt_id = gen_random_uuid\(\),/.test(rc) &&
      /FUNCTION public\.rec_settle_receipt_send\(\n\s+_attempt_id uuid,/.test(rc) &&
      /WHERE m\.email_attempt_id = _attempt_id AND m\.kind = 'receipt' FOR UPDATE;\n\s+IF NOT FOUND THEN\n\s+RETURN 'stale';/.test(
        rc,
      ) &&
      /_attempt_id: claim\.attempt_id,/.test(server) &&
      /U7 the old attempt''s late answer cannot touch the new attempt/.test(suite),
    "I · every technical attempt has its own id, and a settle applies to the attempt it names -- a late answer for A never touches B",
  );
  // Unknown is unknown; the provider's window decides what is safe.
  ok(
    /SET email_status = 'unknown', email_error = 'NO_SETTLE'/.test(rc) &&
      /IF _m\.email_status IN \('unknown', 'failed', 'not_configured'\) AND NOT _retry THEN/.test(
        rc,
      ) &&
      /IF _result NOT IN \('sent', 'failed', 'not_configured', 'unknown'\) THEN/.test(rc),
    "I · an unsettled or unanswered claim is UNKNOWN, recordable as such, and never resent by a plain claim",
  );
  ok(
    /_first_used_at > now\(\) - interval '23 hours'/.test(rc) &&
      /IF _m\.email_status = 'unknown' AND NOT public\.rec_receipt_window_open\(_m\.email_key_first_used_at\) THEN\n\s+IF NOT _accept_duplicate THEN/.test(
        rc,
      ) &&
      /SET email_key_generation = email_key_generation \+ 1,/.test(rc) &&
      /THEN ':r' \|\| _m\.email_key_generation::text ELSE '' END/.test(rc) &&
      /email_recipient = coalesce\(email_recipient,/.test(rc) &&
      /U9 after the provider''s window the recovery never resends by itself/.test(suite) &&
      /U12 a manager who accepts the possible duplicate resends under a NEW key generation, to the same address/.test(
        suite,
      ),
    "I · inside the provider's 24-hour window a resend goes under the same key to the same address; after it only a person's acceptance of a possible duplicate resends, under a new key generation",
  );
  // Recovery: bounded, one sweep at a time, nothing retroactive.
  ok(
    /FUNCTION public\.rec_claim_due_receipts\(/.test(rc) &&
      /FOR UPDATE SKIP LOCKED/.test(rc) &&
      /\(m\.email_status = 'not_attempted' AND m\.created_at < now\(\) - interval '1 minute'\)/.test(
        rc,
      ) &&
      /\(m\.email_status = 'unknown' AND m\.email_attempts < 5/.test(rc) &&
      /coalesce\(m\.email_error, ''\) <> 'IDEMPOTENCY_PAYLOAD_MISMATCH'/.test(rc) &&
      /\(m\.email_status = 'failed' AND m\.email_error = 'HTTP_429' AND m\.email_attempts < 5/.test(
        rc,
      ) &&
      /D3 a second recovery right after finds nothing: the claim is in flight/.test(suite) &&
      /D8 after five attempts the recovery stops, even inside the window/.test(suite) &&
      /D14 through all of that the recovery generated nothing/.test(suite) &&
      /5l-bis-4\. The receipt e-mail under a REAL race/.test(dbTest) &&
      /two concurrent recoveries: the first took the receipt, the second took nothing/.test(dbTest),
    "I · the recovery takes what is due under SKIP LOCKED, bounded to five attempts, retries only a rate limit among the refusals, generates nothing, and is raced for real in db-test.sh",
  );
  ok(
    /export async function sweepReceipts\(/.test(server) &&
      /rpc\("rec_claim_due_receipts", \{\n\s+_limit: opts\.limit \?\? 20,\n\s+_employer_id: opts\.employerId \?\? null,/.test(
        server,
      ) &&
      /m\.sweepReceipts\(\{ limit: 3, employerId: data\.employerId \}\)/.test(fns) &&
      /rpc\("rec_receipts_needing_attention", \{ _employer_id: data\.employerId \}\)/.test(fns) &&
      /data-testid="receipts-attention"/.test(code(F.jobsIndex)),
    "I · the product recovers by itself from the employer's overview, and says how many receipts need a person",
  );
  ok(
    /const expected = process\.env\.RECRUITMENT_SWEEP_TOKEN;\n\s+if \(!expected \|\| expected\.length < 16\) return false;/.test(
      sweepRoute,
    ) &&
      /if \(!authorised\(request\)\) return notFound\(\);/.test(sweepRoute) &&
      !/VITE_/.test(sweepRoute) &&
      /schedule:/.test(read(F.sweepWorkflow)) &&
      /secrets\.RECRUITMENT_SWEEP_TOKEN/.test(read(F.sweepWorkflow)) &&
      /NOT CONFIGURED/.test(read(F.sweepWorkflow)) &&
      /"receipts:sweep": "bun run scripts\/receipts-sweep\.ts"/.test(read("package.json")),
    "I · the sweep endpoint is closed unless a server-side token opens it, and a scheduled workflow knocks on it with a repository secret, saying so when not configured",
  );
  // The submission: the e-mail after the commit, never failing the application.
  ok(
    /const \{ dispatchApplicationReceipt \} = await import\("@\/lib\/recruitment\/receipt\.server"\);\n\s+await dispatchApplicationReceipt\(result\.id\);/.test(
      submit,
    ) &&
      submit.indexOf("dispatchApplicationReceipt(result.id)") >
        submit.indexOf("if (insertErr) {") &&
      !/dispatchApplicationReceipt\(ctx\.supabase/.test(submit),
    "I · the e-mail goes after the submission succeeded, from the same request, with the server's credentials rather than the candidate's session",
  );
  ok(
    /export async function dispatchApplicationReceipt[\s\S]*?try \{[\s\S]*?\} catch \(e\) \{\n\s+console\.error/.test(
      server,
    ) &&
      !/throw/.test(
        server.slice(
          server.indexOf("export async function dispatchApplicationReceipt"),
          server.indexOf("export type ReceiptSweepSummary"),
        ),
      ),
    "I · a mail outage never fails a saved application",
  );
  ok(
    /sendRecruitmentMessageEmail\(\{/.test(server) &&
      !/api\.resend\.com|RESEND_API_KEY/.test(server) &&
      /idempotencyKey: claim\.provider_key \?\? undefined,/.test(server) &&
      /timeoutMs: 15_000,/.test(server) &&
      /link: receiptLink\(origin, claim\.application_id\),/.test(server) &&
      /idempotencyKey: `msg:\$\{messageId\}`,/.test(fns),
    "I · the same e-mail transport as every other recruitment message, no second provider and no key in this file; the receipt sends under the logical e-mail's idempotency key, bounded, with a button to exactly this application -- and a person's message sends under a key of its own",
  );

  // The transport, executed against controlled answers. Never a network.
  const T = await import("../src/lib/email/send-recruitment-message-email.server");
  ok(
    T.classifyProviderResponse(200, null).result === "sent" &&
      T.classifyProviderResponse(422, "validation_error").result === "failed" &&
      T.classifyProviderResponse(429, null).result === "failed" &&
      T.classifyProviderResponse(500, null).result === "unknown" &&
      T.classifyProviderResponse(502, null).result === "unknown" &&
      T.classifyProviderResponse(408, null).result === "unknown" &&
      (T.classifyProviderResponse(409, "concurrent_idempotent_requests") as { error: string })
        .error === "IDEMPOTENCY_CONFLICT" &&
      (T.classifyProviderResponse(409, "invalid_idempotent_request") as { error: string }).error ===
        "IDEMPOTENCY_PAYLOAD_MISMATCH",
    "I · transport: 2xx is accepted, a 4xx (429 included) is a definite refusal, 5xx/408 are unknown, and both 409s name what the provider already holds under this key",
  );
  {
    const savedKey = process.env.RESEND_API_KEY;
    const savedFrom = process.env.RESEND_FROM_EMAIL;
    process.env.RESEND_API_KEY = "guard-only-not-a-key";
    process.env.RESEND_FROM_EMAIL = "guard@example.invalid";
    const calls: { url: string; headers: Record<string, string>; body: string }[] = [];
    const answering =
      (status: number, body: unknown): typeof fetch =>
      async (url, init) => {
        calls.push({
          url: String(url),
          headers: Object.fromEntries(new Headers(init?.headers).entries()),
          body: String(init?.body ?? ""),
        });
        return new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        });
      };
    const hanging: typeof fetch = (_url, init) =>
      new Promise((_, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
        );
      });
    const failing: typeof fetch = async () => {
      throw new TypeError("fetch failed");
    };
    const base = {
      recipientEmail: "guard@example.invalid",
      language: "sv" as const,
      subject: "Vi har tagit emot din ansökan – Väktare",
      body: "Hej Kim!\n\nLänk: /my-career/applications?application=abc",
      employerName: "Nordvakt",
      jobTitle: "Väktare",
      siteOrigin: "https://cqrityjob.example",
      link: "https://cqrityjob.example/my-career/applications?application=abc",
      cta: "Öppna din ansökan",
      idempotencyKey: "receipt:abc",
    };
    try {
      const sent = await T.sendRecruitmentMessageEmail({
        ...base,
        fetchImpl: answering(200, { id: "em_1" }),
      });
      const refused = await T.sendRecruitmentMessageEmail({
        ...base,
        fetchImpl: answering(422, { name: "validation_error" }),
      });
      const down = await T.sendRecruitmentMessageEmail({
        ...base,
        fetchImpl: answering(500, { name: "internal" }),
      });
      const busy = await T.sendRecruitmentMessageEmail({
        ...base,
        fetchImpl: answering(409, { name: "concurrent_idempotent_requests" }),
      });
      const timedOut = await T.sendRecruitmentMessageEmail({
        ...base,
        fetchImpl: hanging,
        timeoutMs: 30,
      });
      const network = await T.sendRecruitmentMessageEmail({ ...base, fetchImpl: failing });
      ok(
        sent.result === "sent" &&
          sent.providerId === "em_1" &&
          refused.result === "failed" &&
          refused.error === "HTTP_422" &&
          down.result === "unknown" &&
          down.error === "HTTP_500" &&
          busy.result === "unknown" &&
          busy.error === "IDEMPOTENCY_CONFLICT" &&
          timedOut.result === "unknown" &&
          timedOut.error === "TIMEOUT" &&
          network.result === "unknown" &&
          network.error === "NETWORK_ERROR",
        "I · transport, executed: accepted with the provider's id; refused; 5xx, a busy key, an abort and a network error are all UNKNOWN, never 'failed'",
      );
      ok(
        calls.length === 4 &&
          calls.every((c) => c.url === "https://api.resend.com/emails") &&
          calls.every((c) => c.headers["idempotency-key"] === "receipt:abc") &&
          calls.every((c) => JSON.parse(c.body).to[0] === "guard@example.invalid"),
        "I · transport, executed: every call carries the Idempotency-Key of the logical e-mail and goes to the one provider",
      );
      delete process.env.RESEND_API_KEY;
      const inert = await T.sendRecruitmentMessageEmail({ ...base, fetchImpl: failing });
      ok(
        inert.result === "not_configured" && calls.length === 4,
        "I · transport, executed: without a mail key nothing is called and the answer is not_configured",
      );
    } finally {
      if (savedKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = savedKey;
      if (savedFrom === undefined) delete process.env.RESEND_FROM_EMAIL;
      else process.env.RESEND_FROM_EMAIL = savedFrom;
    }
    const receipt = T.renderRecruitmentMessageEmail(base);
    const ordinary = T.renderRecruitmentMessageEmail({ ...base, link: undefined, cta: undefined });
    const hostile = T.renderRecruitmentMessageEmail({
      ...base,
      link: "https://evil.example/phish?application=abc",
      cta: '"><script>alert(1)</script>',
    });
    ok(
      receipt.html.includes(
        'href="https://cqrityjob.example/my-career/applications?application=abc"',
      ) &&
        receipt.html.includes(">Öppna din ansökan</a>") &&
        ordinary.html.includes('href="https://cqrityjob.example/my-career/applications"') &&
        ordinary.html.includes(">Läs och svara i CQrityjob</a>") &&
        hostile.html.includes('href="https://cqrityjob.example/my-career/applications"') &&
        !hostile.html.includes("<script") &&
        hostile.html.includes("&lt;script&gt;"),
      "I · the e-mail's button opens exactly the application (escaped, on the site's own origin only); a person's message keeps its own button; a hostile link or label cannot get through",
    );
  }

  // Delivery states, said apart; no sentence claims an arrival.
  ok(
    /case "unknown":\n\s+return "delivered_email_unknown";/.test(code(F.defs)) &&
      /kind === "receipt" \? "delivered_email_pending" : "delivered_in_app_only"/.test(
        code(F.defs),
      ) &&
      /"rec\.message\.delivery\.emailPending"/.test(copy) &&
      /"rec\.message\.delivery\.emailUnknown"/.test(copy) &&
      /"rec\.message\.delivery\.emailSent": "Levererat i CQrityjob · e-post accepterad av leverantören"/.test(
        copy,
      ),
    "I · in CQrityjob, e-mail waiting, accepted by the provider, failed, unknown and not configured are six different sentences",
  );
  ok(
    !/rec\.message\.delivery\.emailDelivered|bekräftad leverans|confirmed delivery|nått inkorgen\.|reached the inbox\./i.test(
      copy.replace(
        /inte att det nått kandidatens inkorg|not that it reached the candidate's inbox/g,
        "",
      ),
    ) &&
      /"rec\.receipt\.acceptedNote"/.test(copy) &&
      /rec\.receipt\.acceptedNote/.test(section),
    "I · no sentence claims a confirmed delivery, and the setting says in words that 'accepted' is not 'arrived'",
  );
  ok(
    /\(m\.kind === "receipt" && m\.emailStatus === "not_attempted"\)/.test(panels) &&
      /\(m\.emailStatus === "unknown" && \(m\.kind !== "receipt" \|\| m\.emailWindowOpen\)\)/.test(
        panels,
      ) &&
      /retryReceiptFn\(\{\n\s+data: \{ employerId, applicationId: ws\.applicationId, acceptDuplicate \},/.test(
        panels,
      ) &&
      /confirmResend === m\.id \?/.test(panels) &&
      /rec\.receipt\.resendConfirm/.test(panels) &&
      /onRetry\(m\.id, true\)/.test(panels) &&
      /rec\.receipt\.unknownWindowClosed/.test(panels) &&
      /"rec\.receipt\.resendConfirm": "Kandidaten kan få bekräftelsen två gånger\. Skicka ändå\?"/.test(
        copy,
      ),
    "I · a receipt whose e-mail is waiting, failed or unknown-inside-the-window can be sent again by a person; outside the window only after an explicit acceptance that the candidate may get it twice",
  );
  // The section, the preview, the summary, the label, the link.
  ok(
    /import \{ renderReceiptTemplate \} from "@\/lib\/recruitment\/receipt-template"/.test(
      section,
    ) &&
      /data-testid="receipt-preview"/.test(section) &&
      /rec\.receipt\.reset/.test(section) &&
      /rec\.receipt\.channel\.inApp/.test(section) &&
      /rec\.receipt\.channel\.email/.test(section) &&
      /rec\.receipt\.futureOnly/.test(section),
    "I · the section has a live preview, a reset to the standard text, the two channels in words, and says it is not retroactive",
  );
  ok(
    /data-testid="receipt-summary"/.test(code(F.hub)) &&
      /sections=\{\["responsible", "team", "communication"\]\}/.test(code(F.hub)),
    "I · Publiceringsläge states the receipt's state; the section lives under Team och inställningar",
  );
  ok(
    /"rec\.message\.kind\.receipt": "Automatisk mottagningsbekräftelse"/.test(copy) &&
      /rec\.message\.kind\.receipt/.test(code(F.candidateInbox)),
    "I · the receipt is labelled as automatic on both sides",
  );
  ok(
    /application: z\.string\(\)\.uuid\(\)\.optional\(\)\.catch\(undefined\)/.test(
      code(F.candidateApps),
    ) &&
      /'\/my-career\/applications\?application=' \|\| NEW\.id::text/.test(rc) &&
      /export function receiptLink\(siteOrigin: string, applicationId: string\): string \{\n\s+return `\$\{siteOrigin\.replace\(\/\\\/\$\/, ""\)\}\/my-career\/applications\?application=\$\{encodeURIComponent\(applicationId\)\}`;/.test(
        server,
      ),
    "I · the link in the receipt names the application in the query string, which survives a sign-in redirect; the e-mail's button carries the same address, absolute",
  );
  // The TypeScript preview renders exactly as the database does.
  const R = await import("../src/lib/recruitment/receipt-template");
  ok(
    R.renderReceiptTemplate("Hej {namn}! {tjänst} hos {företag}: {länk}", {
      name: "",
      job: "Väktare",
      company: "AB",
      link: "/x",
    }) === "Hej! Väktare hos AB: /x" &&
      R.renderReceiptTemplate("Hi {name}, {job} at {company}: {link}", {
        name: "Kim",
        job: "Guard",
        company: "AB",
        link: "/x",
      }) === "Hi Kim, Guard at AB: /x",
    "I · the preview renders the placeholders exactly as rec_render_receipt does, an empty name included",
  );
  const W = await import("../src/lib/recruitment/recruitment.functions");
  const hour = 60 * 60 * 1000;
  ok(
    W.receiptWindowOpen(null) &&
      W.receiptWindowOpen(new Date(Date.now() - 22 * hour).toISOString()) &&
      !W.receiptWindowOpen(new Date(Date.now() - 24 * hour).toISOString()) &&
      !W.receiptWindowOpen("not a date"),
    "I · the page's idea of the provider's window is the database's: 23 trusted hours from the first attempt",
  );
  // Proved by executing, in the database, before and after a rollback.
  ok(
    /GROUP S — server only/.test(suite) &&
      /GROUP R — the receipt/.test(suite) &&
      /R4 a replayed submission answers "replayed" and writes no second receipt/.test(suite) &&
      /R9 a later template change leaves the receipts already written exactly as they were/.test(
        suite,
      ) &&
      /R11 switching it on again writes nothing retroactively/.test(suite) &&
      /E3 an answer for an attempt that is not the current one is stale and changes nothing/.test(
        suite,
      ) &&
      /run_receipts_suite "before rollback"/.test(dbTest) &&
      /run_receipts_suite "after reapply"/.test(dbTest) &&
      /-lt 80 \]/.test(dbTest),
    "I · the suite proves replay, history, non-retroactivity, attempt identity and the unknown outcome, before and after a rollback cycle",
  );
  const e2e = read("e2e/recruitment-workspace.spec.ts");
  ok(
    /the automatic receipt: switched on with a preview/.test(e2e) &&
      /the receipt's e-mail button opens exactly this application after a sign-in; another candidate cannot read it, and nobody can forge its delivery through the API/.test(
        e2e,
      ) &&
      /the recovery: a send that never started is sent by the sweep once/.test(e2e) &&
      /rpc\/rec_settle_receipt_send/.test(e2e) &&
      /getByRole\("button", \{ name: "Ja, skicka igen" \}\)/.test(e2e) &&
      /const EXPECTED_AT_LEAST = 15;/.test(read(F.verify)) &&
      /SUPABASE_SERVICE_ROLE_KEY=\$\{SERVICE_ROLE_KEY\}/.test(read(F.evidenceWorkflow)) &&
      /RECRUITMENT_SWEEP_TOKEN=\$\{SWEEP_TOKEN\}/.test(read(F.evidenceWorkflow)) &&
      /if grep -q 'RESEND_API_KEY' \.env\.local; then fail/.test(read(F.evidenceWorkflow)),
    "I · the browser walk covers the receipt, its button after a sign-in, the API refusals and the recovery; the CI stack has the server's own key, no mail key, and the verifier expects every test to have run",
  );
}

console.log(`${passed} assertions`);
if (fails.length) {
  for (const f of fails) console.error(`  FAIL ${f}`);
  console.error(`\nrecruitment-workspace:check FAILED (${fails.length})`);
  process.exit(1);
}
console.log("recruitment-workspace:check OK");
