/**
 * INTERVIEW REPORT SHARING (E4) — are the two documents two documents, and is
 * sharing its own act?
 *
 * ── THE TWO THINGS THIS UNIT EXISTS TO MAKE STRUCTURALLY TRUE ───────────
 *
 * ONE INTERVIEW, TWO AUDIENCES, TWO DOCUMENTS. The employer's report is
 * private decision support and carries levels, rationales, uncertainty notes,
 * unresolved findings and panel material. The candidate's summary carries
 * governed competency definitions and the candidate's own confirmed words. The
 * brief is explicit that the second must not be the first with sections
 * hidden, and the danger is not that somebody would write it that way on
 * purpose -- it is that a projection which starts as "the same document minus
 * four fields" is one careless join away from being the same document.
 *
 * FINALISING IS NOT SHARING. Two acts, in one direction. A product that
 * released the candidate's copy as a side effect of locking the employer's
 * would be disclosing something to a person because somebody pressed a button
 * about somebody else.
 *
 * ── WHAT THIS PROVES, AND HOW ───────────────────────────────────────────
 *
 * TABLE    The release projection is pure, so it is exercised exhaustively:
 *          every gate, every step state, every error, every read-back.
 *
 * RENDER   The candidate document is drawn from a payload, in both languages,
 *          and read for what it says -- and for what it cannot say, because
 *          the type has no field for it.
 *
 * SOURCE   The properties a render cannot reach: that the builder reads no
 *          employer-only table; that finalisation does not call the release;
 *          that preview and release call the same builder; that one component
 *          serves all three surfaces.
 *
 * Deterministic, offline, no database, no network.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CandidateSummaryPayload } from "../src/lib/interview-intelligence/runtime.functions";

await mock.module("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: Record<string, unknown> & { children?: React.ReactNode }) =>
    React.createElement("a", { href: String(to ?? ""), ...rest }, children),
  createFileRoute: () => () => ({}),
  useRouter: () => ({ navigate: () => {}, history: { back: () => {} } }),
  useNavigate: () => () => {},
  useSearch: () => ({}),
  useParams: () => ({}),
  redirect: (o: unknown) => o,
  notFound: () => undefined,
  isRedirect: () => false,
  isNotFound: () => false,
}));

const { I18nProvider } = await import("../src/i18n/context");
const { dictionaries } = await import("../src/i18n/dictionaries");
const R = await import("../src/lib/interview-intelligence/summary-release");
const P = await import("../src/lib/employer-continuity/process-projection");
const { CandidateSummaryDocument } =
  await import("../src/components/employer/interview/CandidateSummaryDocument");

const root = process.cwd();
let failures = 0;
let passes = 0;

function ok(cond: boolean, label: string): void {
  if (cond) passes += 1;
  else {
    failures += 1;
    console.error(`  FAIL  ${label}`);
  }
}

const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
/** SQL with line comments stripped. Every SOURCE assertion about the migration
 *  runs against this: the migration's own comments name each field they exist
 *  to say is absent, and a grep satisfied by the sentence describing a
 *  property rather than by the property is a guard against nothing. */
const sqlOnly = (src: string) =>
  src
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");

const MIGRATION = "supabase/migrations/20261106090000_scp_iv_candidate_summary.sql";
const ROLLBACK = "supabase/rollback/20261106090000_scp_iv_candidate_summary_rollback.sql";
const SUITE = "supabase/tests/scp_iv_candidate_summary_test.sql";
const RELEASE = "src/lib/interview-intelligence/summary-release.ts";
const RUNTIME = "src/lib/interview-intelligence/runtime.functions.ts";
const CANDIDATE_FN = "src/lib/interview-intelligence/candidate.functions.ts";
const DOC = "src/components/employer/interview/CandidateSummaryDocument.tsx";
const RELEASE_UI = "src/components/employer/interview/CandidateSummaryRelease.tsx";
const REPORT_ROUTE =
  "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.report.tsx";
const CANDIDATE_PAGE = "src/routes/_authenticated.my-career.interviews.$caseId.tsx";
const PROJECTION = "src/lib/employer-continuity/process-projection.ts";
const STRIP = "src/components/employer/ProcessContinuityStrip.tsx";

const sv = dictionaries.sv as Record<string, string>;
const en = dictionaries.en as Record<string, string>;

/* ================================================================== */
/* 1 · The gate: four states, and only one of them shares             */
/* ================================================================== */
{
  const seen = new Set<string>();
  for (const reportIsFinal of [true, false]) {
    for (const canRelease of [true, false]) {
      for (const released of [null, { versionNumber: 2, releasedAt: "2026-03-03T09:00:00Z" }]) {
        const g = R.summaryGate({ reportIsFinal, canRelease, released });
        seen.add(g.kind);

        // RELEASED IS TERMINAL AND OUTRANKS EVERYTHING, including a report
        // that somehow reads as not final: what the person can see is what the
        // person can see.
        if (released) {
          ok(
            g.kind === "released" && g.versionNumber === 2,
            "1 · a shared summary is shared whatever else is true, and names its version",
          );
          continue;
        }
        if (!reportIsFinal) {
          ok(
            g.kind === "reportNotFinal",
            "1 · nothing may be shared before the employer report is final",
          );
          continue;
        }
        ok(
          g.kind === (canRelease ? "ready" : "notPermitted"),
          "1 · a final report is ready or not permitted, by capability alone",
        );
      }
    }
  }
  for (const k of ["released", "ready", "notPermitted", "reportNotFinal"]) {
    ok(seen.has(k), `1 · the gate member ${k} is reachable`);
  }

  // `notPermitted` is about the READER. Two readers, one case, two answers.
  const base = { reportIsFinal: true, released: null } as const;
  ok(
    R.summaryGate({ ...base, canRelease: true }).kind === "ready" &&
      R.summaryGate({ ...base, canRelease: false }).kind === "notPermitted",
    "1 · the same case reads differently for two readers, which is what makes it a permission",
  );
}

/* ================================================================== */
/* 2 · The steps: preview is never done, release is never before      */
/* ================================================================== */
{
  ok(
    R.SUMMARY_STEPS.join(",") === "review,finalise,preview,release",
    "2 · the sequence is review, finalise, preview, share — in that order",
  );

  const notFinal = R.summarySteps({ kind: "reportNotFinal" });
  ok(
    notFinal.release === "blocked" && notFinal.preview === "blocked",
    "2 · before the report is final, neither previewing nor sharing is offered",
  );
  ok(notFinal.finalise === "todo", "2 · and finalising is what remains");

  const ready = R.summarySteps({ kind: "ready" });
  ok(
    ready.finalise === "done" && ready.preview === "current" && ready.release === "todo",
    "2 · with a final report, the preview is where you are and sharing is what remains",
  );

  const notPermitted = R.summarySteps({ kind: "notPermitted" });
  ok(
    notPermitted.release === "blocked",
    "2 · a reader who may not share is not shown sharing as something they can do",
  );
  ok(notPermitted.preview === "current", "2 · but may still see what the candidate would receive");

  const shared = R.summarySteps({ kind: "released", versionNumber: 1, releasedAt: "x" });
  ok(
    Object.values(shared).every((v) => v === "done"),
    "2 · once shared, every step is done",
  );

  // PREVIEW IS NEVER `done` BEFORE RELEASE. Previewing leaves no trace, and
  // that is deliberate: a "preview" that recorded having happened is one step
  // from being a consent the product collected without asking.
  for (const g of [
    { kind: "reportNotFinal" },
    { kind: "ready" },
    { kind: "notPermitted" },
  ] as const) {
    ok(
      R.summarySteps(g).preview !== "done",
      `2 · previewing is never recorded as done from the ${g.kind} gate`,
    );
  }

  // And RELEASE is never `done` before it happened.
  for (const g of [
    { kind: "reportNotFinal" },
    { kind: "ready" },
    { kind: "notPermitted" },
  ] as const) {
    ok(
      R.summarySteps(g).release !== "done",
      `2 · and sharing is never reported as done from the ${g.kind} gate`,
    );
  }
}

/* ================================================================== */
/* 3 · The outcome: a write is not a share until a read says so       */
/* ================================================================== */
{
  const back = R.summaryReadback({ versionNumber: 3, releasedAt: "2026-03-03T09:00:00Z" });
  ok(
    back.kind === "confirmed" && back.versionNumber === 3,
    "3 · a read-back row confirms the share, and carries the version",
  );
  ok(
    R.summaryReadback(null).kind === "writtenNotConfirmed",
    "3 · a read-back that produced nothing is NOT a confirmation",
  );
  ok(
    R.summaryReadback(undefined).kind === "writtenNotConfirmed",
    "3 · and neither is one that broke",
  );

  ok(
    R.summaryErrorOutcome("SCP_IV_SUMMARY_BEFORE_REPORT: finalise first").kind === "reportNotFinal",
    "3 · sharing before a final report is named as such",
  );
  ok(
    R.summaryErrorOutcome("SCP_IV_SUMMARY_RELEASE_ROLE: requires owner").kind === "refused",
    "3 · the database re-deciding authority is a refusal, not a generic failure",
  );
  ok(
    R.summaryErrorOutcome("something nobody has seen").kind === "failed",
    "3 · an unrecognised message falls to failed, which claims nothing",
  );
  ok(R.summaryErrorOutcome(null).kind === "failed", "3 · so does no message");
  ok(R.summaryErrorOutcome("").kind === "failed", "3 · and so does an empty one");

  // THE CONTROL. `writtenNotConfirmed` means the irreversible act is DONE.
  const ready = { kind: "ready" } as const;
  ok(R.summaryControlEnabled(ready, { kind: "idle" }), "3 · ready and idle: the control is live");
  ok(
    R.summaryControlEnabled(ready, { kind: "failed" }),
    "3 · a failure that claims nothing may be retried",
  );
  for (const o of [
    { kind: "releasing" },
    { kind: "confirmed", versionNumber: 1, releasedAt: "x" },
    { kind: "writtenNotConfirmed" },
    { kind: "refused" },
    { kind: "reportNotFinal" },
  ] as const) {
    ok(!R.summaryControlEnabled(ready, o), `3 · and is NOT offered again after ${o.kind}`);
  }
  for (const g of [
    { kind: "released", versionNumber: 1, releasedAt: "x" },
    { kind: "notPermitted" },
    { kind: "reportNotFinal" },
  ] as const) {
    ok(!R.summaryControlEnabled(g, { kind: "idle" }), `3 · and never from the ${g.kind} gate`);
  }
}

/* ================================================================== */
/* 4 · The migration: two documents, and the direction of the two acts */
/* ================================================================== */
{
  ok(existsSync(path.join(root, MIGRATION)), "4 · the migration exists");
  const sql = sqlOnly(read(MIGRATION));

  // THE PROPERTY THE WHOLE UNIT RESTS ON. The builder reads governed pack
  // content and confirmed evidence, and nothing else.
  const builder = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION public.scp_iv_build_candidate_summary"),
    sql.indexOf("COMMENT ON FUNCTION public.scp_iv_build_candidate_summary"),
  );
  ok(builder.length > 0, "4 · the builder is where it is expected to be");
  for (const table of [
    "scp_interview_assessments",
    "scp_interview_findings",
    "scp_interview_evidence_proposals",
    "scp_interview_session_notes",
    "scp_interview_source_passages",
    "scp_interview_ai_runs",
    "scp_interview_rating_anchors",
    "scp_interview_reports",
  ]) {
    ok(!builder.includes(table), `4 · the candidate builder never reads ${table}`);
  }
  for (const field of ["original_excerpt", "correction_note", "confirmed_by", "a.level"]) {
    ok(!builder.includes(field), `4 · and never carries ${field}`);
  }
  ok(
    builder.includes("scp_interview_pack_competencies") &&
      builder.includes("scp_interview_evidence"),
    "4 · it reads the governed competencies and the confirmed evidence, which is the whole of it",
  );
  // The interview QUESTIONS stay withheld: publishing them turns a structured
  // interview into a memory test.
  ok(
    !builder.includes("scp_interview_core_questions"),
    "4 · and not the core questions — the areas are what a person can be told",
  );

  // ONE PRODUCER. Preview and release both call it, so they cannot drift.
  const preview = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION public.scp_iv_preview_candidate_summary"),
    sql.indexOf("COMMENT ON FUNCTION public.scp_iv_preview_candidate_summary"),
  );
  const release = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION public.scp_iv_release_candidate_summary"),
    sql.indexOf("COMMENT ON FUNCTION public.scp_iv_release_candidate_summary"),
  );
  ok(
    preview.includes("public.scp_iv_build_candidate_summary(_case_id)"),
    "4 · the preview calls the builder",
  );
  ok(
    release.includes("public.scp_iv_build_candidate_summary(_case_id)"),
    "4 · and so does the release — one producer, two callers",
  );
  ok(
    !preview.includes("INSERT INTO") && !preview.includes("UPDATE public."),
    "4 · and previewing writes nothing",
  );

  // THE DIRECTION. A final report is a precondition; nothing makes it a
  // trigger.
  ok(
    release.includes("SCP_IV_SUMMARY_BEFORE_REPORT"),
    "4 · the release refuses until the employer report is final",
  );
  const finaliseSrc = read(
    "supabase/migrations/20261020090000_scp_interview_evidence_reliability.sql",
  );
  ok(
    !finaliseSrc.includes("scp_iv_release_candidate_summary"),
    "4 · and finalising the report does not call the release",
  );
  ok(
    sql.includes("scp_iv_finalise_report") &&
      sql.includes("SCP_IV_SUMMARY: finalising the report must not release the summary."),
    "4 · which the migration asserts at apply time rather than leaving to a reader",
  );

  // IDEMPOTENT, VERSIONED, IMMUTABLE.
  ok(
    release.includes("_latest_hash = _hash") && release.includes("RETURN _latest_id;"),
    "4 · an unchanged re-release returns the version that already exists",
  );
  ok(release.includes("coalesce(max(version_number), 0) + 1"), "4 · a changed one is version N+1");
  ok(
    release.includes("SET status = 'superseded'"),
    "4 · and the previous version is superseded rather than rewritten",
  );

  // AUTHORITY AND EXPOSURE.
  for (const fn of [
    "scp_iv_preview_candidate_summary",
    "scp_iv_release_candidate_summary",
    "scp_iv_my_candidate_summary",
    "scp_iv_released_candidate_summary",
    "scp_iv_application_summary_releases",
  ]) {
    ok(
      new RegExp(`REVOKE ALL\\s+ON FUNCTION public\\.${fn}\\(uuid\\) FROM PUBLIC, anon;`).test(sql),
      `4 · ${fn} is revoked from PUBLIC and anon`,
    );
  }
  ok(
    /REVOKE ALL ON FUNCTION public\.scp_iv_build_candidate_summary\(uuid\)\s+FROM PUBLIC, anon, authenticated;/.test(
      sql,
    ),
    "4 · and the builder is not client-executable at all",
  );
  ok(
    /REVOKE ALL ON TABLE public\.scp_iv_candidate_summaries FROM PUBLIC, anon, authenticated;/.test(
      sql,
    ),
    "4 · the table has no client read: the functions are the only doors",
  );
  ok(
    sql.includes("ENABLE ROW LEVEL SECURITY") &&
      !/CREATE POLICY[^;]*scp_iv_candidate_summaries/.test(sql),
    "4 · with RLS on and no policy, so a direct read is refused rather than filtered",
  );
  ok(
    release.includes("ARRAY['owner','admin']"),
    "4 · sharing requires the same seat finalising requires",
  );

  // THE FACT-ONLY READ CARRIES NO DOCUMENT. It is granted to every member.
  const facts = sql.slice(
    sql.indexOf("CREATE OR REPLACE FUNCTION public.scp_iv_application_summary_releases"),
    sql.indexOf("COMMENT ON FUNCTION public.scp_iv_application_summary_releases"),
  );
  ok(facts.length > 0, "4 · the fact-only read is where it is expected to be");
  ok(
    !facts.includes("payload") && !facts.includes("content_hash"),
    "4 · and carries neither the payload nor the hash — only that, when and which version",
  );
  ok(
    facts.includes("m.status = 'active'"),
    "4 · to an active member of the organisation that shared it",
  );

  // ROLLBACK, and the sweep that would notice a new function.
  ok(existsSync(path.join(root, ROLLBACK)), "4 · a rollback file exists");
  const rb = read(ROLLBACK);
  for (const fn of [
    "scp_iv_released_candidate_summary",
    "scp_iv_my_candidate_summary",
    "scp_iv_release_candidate_summary",
    "scp_iv_preview_candidate_summary",
    "scp_iv_build_candidate_summary",
    "scp_iv_application_summary_releases",
  ]) {
    ok(rb.includes(`DROP FUNCTION IF EXISTS public.${fn}(uuid);`), `4 · the rollback drops ${fn}`);
  }
  ok(
    rb.includes("DROP TABLE    IF EXISTS public.scp_iv_candidate_summaries;"),
    "4 · and the table",
  );
  ok(rb.includes("report_finalised"), "4 · and restores the event vocabulary it extended");
  ok(
    read("supabase/tests/scp_a_rollback_test.sql").includes(
      "public.scp_iv_build_candidate_summary(uuid) CASCADE",
    ),
    "4 · and the full PR-A unwind knows about the new functions",
  );

  // THE DATABASE SUITE IS WIRED IN, AND RUNS BEFORE THE DESTRUCTIVE UNWIND.
  ok(existsSync(path.join(root, SUITE)), "4 · the database suite exists");
  const runner = read("scripts/db-test.sh");
  ok(runner.includes("scp_iv_candidate_summary_test.sql"), "4 · and db-test.sh runs it");
  ok(
    runner.includes('suite_failed "E4 candidate summary"'),
    "4 · and records its failure rather than passing over it",
  );
  ok(
    runner.indexOf("scp_iv_candidate_summary_test.sql") <
      runner.indexOf('echo "==> Verifying the documented rollback procedure"'),
    "4 · before the PR-A rollback, which drops every scp_ table it needs",
  );
}

/* ================================================================== */
/* 5 · The client: one shape, one mapper, one component               */
/* ================================================================== */
{
  const runtime = codeOnly(read(RUNTIME));
  const candidate = codeOnly(read(CANDIDATE_FN));

  // THE TYPE HAS NO FIELD FOR ANY OF IT. This is what makes the absence
  // structural rather than a discipline somebody has to keep.
  //
  // From CandidateSummaryArea, not from CandidateSummaryPayload: the per-area
  // shape is where a level or a rationale would actually be added, and slicing
  // from the payload alone skipped it -- which a negative control proved by
  // adding both and going undetected.
  const payloadType = runtime.slice(
    runtime.indexOf("export interface CandidateSummaryArea"),
    runtime.indexOf("export interface CandidateSummary {"),
  );
  ok(payloadType.length > 0, "5 · the payload type is where it is expected to be");
  for (const field of [
    "level",
    "rationale",
    "uncertainty",
    "assessor",
    "anchor",
    "finding",
    "proposal",
    "confirmedBy",
    "originalExcerpt",
  ]) {
    ok(
      !new RegExp(`\\b${field}`, "i").test(payloadType),
      `5 · the candidate payload type has no ${field} field`,
    );
  }

  // ONE MAPPER, THREE CALLERS.
  ok(
    (runtime.match(/export function mapCandidateSummaryPayload\(/g) ?? []).length === 1,
    "5 · exactly one payload mapper is defined",
  );
  ok(
    candidate.includes("mapCandidateSummaryPayload"),
    "5 · and the candidate's own read imports it rather than writing a second",
  );
  ok(!/function mapCandidateSummaryPayload/.test(candidate), "5 · which it does not define");

  // ONE COMPONENT, THREE SURFACES.
  ok(existsSync(path.join(root, DOC)), "5 · the candidate document is its own component");
  for (const [file, who] of [
    [RELEASE_UI, "the employer's preview and verification"],
    [CANDIDATE_PAGE, "the candidate's own page"],
  ] as const) {
    ok(
      codeOnly(read(file)).includes("<CandidateSummaryDocument"),
      `5 · ${who} renders the shared component`,
    );
  }

  // A FAILED READ IS NOT AN UNSHARED SUMMARY. On both sides.
  const ui = codeOnly(read(RELEASE_UI));
  ok(
    ui.includes("released.isError") && ui.includes("iicr.readFailed"),
    "5 · the employer is told when what-was-shared could not be re-read",
  );
  const page = codeOnly(read(CANDIDATE_PAGE));
  ok(
    page.includes("summary.isError"),
    "5 · and so is the candidate, rather than being told nothing was shared",
  );
  ok(
    page.indexOf("summary.isError") < page.indexOf("!summary.data"),
    "5 · in that order, so an error cannot fall through to the empty state",
  );

  // THE READ-BACK. Success is not the mutation resolving.
  ok(
    ui.includes("summaryReadback("),
    "5 · the outcome is decided by the released row, not by the call returning",
  );
  ok(
    ui.includes("summaryControlEnabled(gate, outcome)"),
    "5 · and the control's own state comes from the projection",
  );

  // NO SERVICE ROLE ANYWHERE NEAR IT.
  for (const [file, who] of [
    [RUNTIME, "the employer functions"],
    [CANDIDATE_FN, "the candidate function"],
  ] as const) {
    const src = codeOnly(read(file));
    ok(
      !/service_role|serviceRole|SERVICE_ROLE/.test(src),
      `5 · ${who} hold no service-role client`,
    );
  }

  // The report route mounts the sequence, and mounts it AFTER the report.
  const route = codeOnly(read(REPORT_ROUTE));
  ok(route.includes("<CandidateSummaryRelease"), "5 · the report screen mounts the sequence");
  ok(
    route.indexOf("<CandidateSummaryRelease") > route.indexOf("s-report"),
    "5 · after the employer's own report, never before it",
  );
  ok(
    /reportIsFinal=\{isFinal\}/.test(route),
    "5 · and tells it whether the report is final rather than deciding for it",
  );
}

/* ================================================================== */
/* 6 · The document, drawn                                            */
/* ================================================================== */
{
  const payload: CandidateSummaryPayload = {
    schemaVersion: "cis-v1",
    employerName: "Vaktbolaget AB",
    roleTitle: "Väktare",
    method: "Väktare SE",
    scopeSv: "Intervjun följde en granskad struktur.",
    scopeEn: "The interview followed a reviewed structure.",
    areas: [
      {
        code: "C1",
        name: "Situationsbedömning",
        definition: "Bedömer läget innan hen agerar.",
        yourExamples: [{ statement: "Jag kontrollerade dörren och larmade." }],
        covered: true,
      },
      {
        code: "C2",
        name: "Dokumentation",
        definition: "Skriver ned det som hänt.",
        yourExamples: [],
        covered: false,
      },
    ],
    limitationsSv: ["Det här är en sammanfattning av samtalet, inte en bedömning av dig."],
    limitationsEn: ["This is a summary of the conversation, not an assessment of you."],
    decisionSv: "Beslutet fattas av arbetsgivaren.",
    decisionEn: "The employer makes the decision.",
  };

  for (const lang of ["sv", "en"] as const) {
    const html = renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        { initialLang: lang } as never,
        React.createElement(CandidateSummaryDocument, { payload, lang }),
      ),
    )
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ");

    const d = lang === "sv" ? sv : en;

    ok(html.includes("Situationsbedömning"), `6 · [${lang}] every area is named`);
    ok(html.includes("Dokumentation"), `6 · [${lang}] including the uncovered one`);
    ok(
      html.includes("Jag kontrollerade dörren"),
      `6 · [${lang}] the person's own words are given back to them`,
    );

    // AN UNCOVERED AREA IS ABOUT THE HOUR, NOT THE PERSON.
    ok(
      html.includes(d["iics.notCovered"]),
      `6 · [${lang}] an area with no example says we did not get there`,
    );
    ok(
      /(säger ingenting om din erfarenhet|says nothing about your experience)/.test(html),
      `6 · [${lang}] and says so in exactly those terms`,
    );

    // THE LANGUAGE IS THE ONE ASKED FOR, not the one in context. This is what
    // lets the employer's preview be proved identical to the candidate's view.
    ok(
      html.includes(lang === "sv" ? payload.scopeSv : payload.scopeEn),
      `6 · [${lang}] the scope is rendered in the requested language`,
    );
    ok(
      !html.includes(lang === "sv" ? payload.scopeEn : payload.scopeSv),
      `6 · [${lang}] and not in the other one`,
    );
    ok(
      html.includes(lang === "sv" ? payload.decisionSv : payload.decisionEn),
      `6 · [${lang}] and the employer is named as the decider`,
    );

    // NO VERDICT VOCABULARY IN THE CHROME. The payload's own limitations are
    // allowed to deny a score; the component's own copy must not introduce one.
    for (const k of ["iics.heading", "iics.areas", "iics.yourExamples", "iics.notCovered"]) {
      ok(
        !/(poäng|score|rangordn|ranking|rekommend|recommend|lämplig|suitab|godkänd|pass\/fail)/i.test(
          d[k] ?? "",
        ),
        `6 · [${lang}] ${k} expresses no verdict`,
      );
    }
  }

  // Copy exists in both languages for every key the document and the sequence
  // use, and is genuinely translated.
  for (const k of [
    "iics.heading",
    "iics.areas",
    "iics.yourExamples",
    "iics.notCovered",
    "iics.limitations",
    "iics.version",
    "iicr.heading",
    "iicr.lede",
    "iicr.step.review",
    "iicr.step.finalise",
    "iicr.step.preview",
    "iicr.step.release",
    "iicr.blocked",
    "iicr.notPermitted",
    "iicr.released",
    "iicr.readFailed",
    "iicr.preview.open",
    "iicr.preview.title",
    "iicr.preview.releasedTitle",
    "iicr.release",
    "iicr.release.explain",
    "iicr.confirm.title",
    "iicr.confirm.body",
    "iicr.confirm.action",
    "iicr.outcome.confirmed",
    "iicr.outcome.writtenNotConfirmed",
    "iicr.outcome.refused",
    "continuity.track.candidateSummary",
    "continuity.candidateSummary.shared",
    "continuity.candidateSummary.notShared",
  ]) {
    ok(typeof sv[k] === "string" && sv[k].length > 0, `6 · ${k} exists in Swedish`);
    ok(typeof en[k] === "string" && en[k].length > 0, `6 · ${k} exists in English`);
    ok(sv[k] !== en[k], `6 · ${k} is genuinely translated`);
  }

  // THE CONFIRMATION NAMES THE EXACT IRREVERSIBLE EFFECT, and the
  // written-not-confirmed sentence does not invite a second attempt.
  for (const [d, lang] of [
    [sv, "sv"],
    [en, "en"],
  ] as const) {
    ok(
      /(inget sätt att ta tillbaka|no way to take it back)/.test(d["iicr.confirm.body"]),
      `6 · [${lang}] the confirmation says the sharing cannot be taken back`,
    );
    ok(
      /(ny version|new version)/.test(d["iicr.confirm.body"]),
      `6 · [${lang}] and that a correction is a new version`,
    );
    ok(
      !/(försök igen|try again|dela igen|share again)/i.test(d["iicr.outcome.writtenNotConfirmed"]),
      `6 · [${lang}] and the written-not-confirmed sentence never suggests repeating it`,
    );
    // The strip's "no summary shared" row must not read as an obligation.
    ok(
      !/(måste|bör|should|must|required)/i.test(d["continuity.candidateSummary.notShared"]),
      `6 · [${lang}] "no summary shared" is a fact, not an instruction`,
    );
  }
}

/* ================================================================== */
/* 7 · The continuity strip tells the two audiences apart             */
/* ================================================================== */
{
  const iCase = (over: Record<string, unknown>) =>
    ({
      id: "c1",
      title: "t",
      status: "reported",
      updatedAt: "2026-03-01T00:00:00Z",
      packName: null,
      validationLabel: null,
      proposalsAwaitingReview: 0,
      reportFinalised: true,
      reportContentHash: "h",
      candidateSummaryVersion: null,
      candidateSummaryReleasedAt: null,
      ...over,
    }) as never;

  const notShared = P.projectReportTrack("ready", [iCase({})]);
  ok(
    notShared.availability === "finalised" && notShared.candidateSharing === "notShared",
    "7 · a finalised report with nothing shared says BOTH — they are different questions",
  );

  const shared = P.projectReportTrack("ready", [
    iCase({ candidateSummaryVersion: 2, candidateSummaryReleasedAt: "2026-03-03T00:00:00Z" }),
  ]);
  ok(
    shared.availability === "finalised" && shared.candidateSharing === "shared",
    "7 · and a shared one is the same employer state with a different candidate state",
  );
  ok(shared.candidateSummaryVersion === 2, "7 · carrying the version the person is reading");

  // NOT APPLICABLE BEFORE A REPORT. "Nothing shared" about an interview nobody
  // has reported on reads as a task.
  const noReport = P.projectReportTrack("ready", [
    iCase({ status: "assessed", reportFinalised: false, reportContentHash: null }),
  ]);
  ok(
    noReport.candidateSharing === "notApplicable",
    "7 · before a report is final, sharing is not a question that arises",
  );

  // A FAILED READ KNOWS NOTHING ABOUT SHARING EITHER.
  for (const read of ["failed", "refused", "loading"] as const) {
    ok(
      P.projectReportTrack(read, []).candidateSharing === "notApplicable",
      `7 · a ${read} read does not claim nothing was shared`,
    );
  }

  // THE MIXED CASE. One case finalised and shared, another still owing work:
  // both facts survive.
  const mixed = P.projectReportTrack("ready", [
    iCase({
      id: "done",
      candidateSummaryVersion: 1,
      candidateSummaryReleasedAt: "2026-03-03T00:00:00Z",
    }),
    iCase({
      id: "owing",
      status: "assessed",
      reportFinalised: false,
      reportContentHash: null,
      updatedAt: "2026-02-01T00:00:00Z",
    }),
  ]);
  ok(
    mixed.availability === "materialAndFinalised",
    "7 · a finalised report beside outstanding material still reports both",
  );
  ok(mixed.materialCaseId === "owing", "7 · and still names the case that owes work");
  ok(
    mixed.candidateSharing === "shared",
    "7 · while the sharing state follows the case that HAS a report",
  );

  // The strip renders it, and only when it applies.
  const strip = codeOnly(read(STRIP));
  ok(
    strip.includes('report.candidateSharing !== "notApplicable"'),
    "7 · the strip hides the row entirely before a report is final",
  );
  ok(
    strip.includes("continuity.track.candidateSummary"),
    "7 · and gives it its own term rather than folding it into the report row",
  );

  // The projection reads it from the FINALISED case and nowhere else.
  const proj = codeOnly(read(PROJECTION));
  ok(
    /candidateSharing: !finalised/.test(proj),
    "7 · sharing is read from the finalised case, because that is the only case that can have one",
  );
  ok(
    !/candidateSharing[\s\S]{0,200}material\./.test(proj),
    "7 · and never from the case holding material",
  );
}

/* ================================================================== */
/* 8 · Nothing here became a judgement about the person               */
/* ================================================================== */
{
  for (const file of [RELEASE, DOC, RELEASE_UI]) {
    const src = codeOnly(read(file));
    for (const [pattern, label] of [
      [/\bscore\b|totalScore|scoreValue/i, "a score"],
      [/\brank\b|ranking|percentile/i, "a rank"],
      [/suitab|recommendHire|shortlist/i, "a suitability verdict"],
      [/passFail|pass_fail/i, "a pass/fail"],
      [/compareCandidates|versusOther|betterThan/i, "a comparison"],
    ] as const) {
      ok(!pattern.test(src), `8 · ${file.split("/").pop()} expresses ${label} nowhere`);
    }
  }
}

/* ------------------------------------------------------------------ */

if (failures > 0) {
  console.error(`\n${passes} passed, ${failures} failed`);
  process.exit(1);
}
console.log(`
OK: one interview produces two documents for two audiences, and the candidate's is not the
    employer's with sections hidden. Finalising is a precondition and never a trigger, the
    preview is the thing previewed, a share is not a share until a read says so, and the
    strip can tell "finalised" from "finalised and shared". ${passes} assertions.`);
