/**
 * INTERVIEW CONTEXT AND NOTICE GOVERNANCE (E3) — can a read that did not land
 * be told from a fact about the world?
 *
 * ── THE DEFECT CLASS THIS GUARD EXISTS FOR ──────────────────────────────
 *
 * `getInterviewCaseContext` answered five materially different situations with
 * two values, and every one of the collapses turned an outage of OURS into a
 * statement about SOMEBODY ELSE:
 *
 *   the case names no application            -> "standalone interview"
 *   the case names one and it cannot be read -> "standalone interview"   ← the
 *       worst of them, because it is not an omission but an assertion: a
 *       recruiter with an application, an advert and a released assessment
 *       behind their interview was told there was no advertised role, and
 *       prepared for a different conversation
 *   the advert read failed or was refused    -> an advert stating no
 *       requirements
 *   the assessment read failed               -> "no assessment has been sent"
 *   the case read failed / the case is not
 *       yours / the case does not exist      -> three bare Error messages that
 *       three screens told apart by substring
 *
 * And one more, on the candidate's own side: `retain_until` has exactly one
 * writer, so every case without a transcript has none — and the page rendered
 * that as no line at all. Silence is not an answer to "how long will you keep
 * this".
 *
 * ── WHAT THIS PROVES, AND HOW ───────────────────────────────────────────
 *
 * TABLE    Both projections are pure, so both are exercised exhaustively:
 *          every link state against every read outcome, and every notice
 *          element against every input that can change it.
 *
 * RENDER   The context panel and the notice panel are actually drawn, in both
 *          languages, and read for what they say — including that the words
 *          for "standalone" never appear on an unreadable case.
 *
 * SOURCE   The properties a render cannot reach: that no code path turns a
 *          failure into an absence; that the case read's two failure modes are
 *          result members rather than thrown messages; that an action which
 *          depends on the context is withheld when it is unusable.
 *
 * Deterministic, offline, no database, no network.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type {
  ContextInput,
  ContextReads,
  InterviewContextResult,
  SourceRead,
} from "../src/lib/interview-intelligence/context";
import type { NoticeInput } from "../src/lib/interview-intelligence/candidate-notice";

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
const C = await import("../src/lib/interview-intelligence/context");
const N = await import("../src/lib/interview-intelligence/candidate-notice");
const { InterviewContextPanel } =
  await import("../src/components/employer/interview/InterviewContextPanel");
const { CandidateNoticePanel } =
  await import("../src/components/employer/interview/CandidateNoticePanel");
const { ContextUnavailable } =
  await import("../src/components/employer/interview/InterviewContextOutcome");
// The two pure answers live beside the projection they are about, not in the
// component file: see src/lib/interview-intelligence/context-outcome.ts.
const { contextOf, contextIsUsable } =
  await import("../src/lib/interview-intelligence/context-outcome");

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

const CONTEXT = "src/lib/interview-intelligence/context.ts";
const CONTEXT_FN = "src/lib/interview-intelligence/context.functions.ts";
const NOTICE = "src/lib/interview-intelligence/candidate-notice.ts";
const PANEL = "src/components/employer/interview/InterviewContextPanel.tsx";
const OUTCOME = "src/components/employer/interview/InterviewContextOutcome.tsx";
const OUTCOME_HELPERS = "src/lib/interview-intelligence/context-outcome.ts";
const NOTICE_PANEL = "src/components/employer/interview/CandidateNoticePanel.tsx";
const CASE_INDEX =
  "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.index.tsx";
const PREPARE =
  "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.prepare.tsx";
const LIVE =
  "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.interview.tsx";
const CANDIDATE_PAGE = "src/routes/_authenticated.my-career.interviews.$caseId.tsx";

const sv = dictionaries.sv as Record<string, string>;
const en = dictionaries.en as Record<string, string>;

const ALL_READS: readonly SourceRead[] = ["ok", "absent", "refused", "failed"];
const reads = (over: Partial<ContextReads> = {}): ContextReads => ({
  application: "ok",
  job: "ok",
  cv: "ok",
  assessment: "ok",
  ...over,
});

const baseInput: ContextInput = {
  candidateName: "Fixture Kandidat",
  application: {
    status: "reviewing",
    appliedAt: "2026-08-01T09:00:00Z",
    coverNote: null,
    jobTitleSv: "Väktare",
    jobTitleEn: "Security officer",
  },
  job: null,
  cv: null,
  assessment: null,
  assessmentPending: false,
  reads: reads(),
};

/* ================================================================== */
/* 1 · The link state: standalone is reachable ONE way                */
/* ================================================================== */
{
  // EXHAUSTIVE. Every application read outcome, with and without a row.
  for (const application of ALL_READS) {
    const withRow = C.buildInterviewContext({ ...baseInput, reads: reads({ application }) });
    ok(
      withRow.link === "linked",
      `1 · an application ROW is always linked, whatever the read said (${application})`,
    );

    const withoutRow = C.buildInterviewContext({
      ...baseInput,
      application: null,
      reads: reads({ application }),
    });
    if (application === "absent") {
      ok(withoutRow.link === "standalone", "1 · no row AND nothing to read is the standalone case");
    } else {
      // THE ASSERTION THE WHOLE UNIT TURNS ON.
      ok(
        withoutRow.link === "linkedUnreadable",
        `1 · no row because the read said "${application}" is linkedUnreadable, NOT standalone`,
      );
      ok(
        withoutRow.reads.application === application,
        `1 · and the reason "${application}" survives to the surface`,
      );
    }
  }

  // `standaloneContext` is the only builder that can assert standalone, and it
  // records that there was nothing to read rather than that a read succeeded.
  const st = C.standaloneContext("X");
  ok(st.link === "standalone", "1 · standaloneContext produces standalone");
  ok(
    ALL_READS.every((r) => r === "absent" || st.reads.application !== r),
    "1 · with the application read recorded as absent",
  );
  ok(
    st.reads.job === "absent" && st.reads.cv === "absent" && st.reads.assessment === "absent",
    "1 · and every other source absent too — there was nothing to fetch, so nothing failed",
  );
  ok(st.cvPresence === "none", "1 · a standalone case may claim there is no CV");

  // A CV IS ONLY CLAIMED ABSENT WHEN A READ SAID SO. "none" is a statement.
  for (const cv of ALL_READS) {
    const e = C.emptyContext("X", "linkedUnreadable", reads({ cv }));
    const claimed = e.cvPresence === "none";
    ok(
      claimed === (cv === "ok" || cv === "absent"),
      `1 · an empty context claims "no CV" only when the CV read landed (${cv})`,
    );
  }

  // Type-level: `emptyContext` cannot be handed "linked". The compiler enforces
  // it; this asserts the signature has not been widened back.
  ok(
    /link: Exclude<LinkState, "linked">/.test(codeOnly(read(CONTEXT))),
    "1 · emptyContext structurally cannot produce a linked context",
  );
}

/* ================================================================== */
/* 2 · Every source carries its own read, and none is inferred        */
/* ================================================================== */
{
  for (const job of ALL_READS) {
    const c = C.buildInterviewContext({ ...baseInput, job: null, reads: reads({ job }) });
    ok(c.reads.job === job, `2 · the advert's read outcome "${job}" is carried unchanged`);
    ok(
      c.requirements.length === 0,
      `2 · and the requirement list is empty either way (${job}) — which is why the outcome beside it is the only thing that makes it honest`,
    );
  }
  for (const assessment of ALL_READS) {
    const c = C.buildInterviewContext({ ...baseInput, reads: reads({ assessment }) });
    ok(
      c.reads.assessment === assessment,
      `2 · the assessment's read outcome "${assessment}" is carried unchanged`,
    );
  }

  // NOTHING INFERS A READ FROM ITS CONTENT. A guard against the shape the
  // defect would take on the way back in.
  const src = codeOnly(read(CONTEXT));
  ok(
    !/reads:\s*\{[^}]*job:\s*job\s*\?/.test(src),
    "2 · no read outcome is derived from whether its content is present",
  );
  ok(
    !/requirements\.length === 0\s*\?\s*"absent"/.test(src),
    "2 · and none is derived from a list being empty",
  );
}

/* ================================================================== */
/* 2b · The per-source decision, exercised rather than grepped        */
/* ================================================================== */
{
  // ── WHY THIS SECTION EXISTS ─────────────────────────────────────────
  //
  // The four readers live in a server module that talks to PostgREST, so the
  // only guard available to them was one that greps their source. A negative
  // control proved what that was worth: four separate mutations, each turning
  // a failed read back into an absence inside a reader, and every one of them
  // went undetected because the assertions read text instead of running code.
  //
  // The decision is a pure function now, and this exercises it over every
  // combination of the three facts a reader has.

  const errors = [
    null,
    { code: "42501", message: "permission denied for table jobs" },
    { code: "PGRST301", message: "JWT expired" },
    { code: "PGRST116", message: "no rows" },
    { code: "57014", message: "canceling statement due to statement timeout" },
    { code: null, message: "fetch failed" },
    { code: "XX000", message: "internal error" },
    { message: "permission denied" },
  ];

  for (const referenced of [true, false]) {
    for (const error of errors) {
      for (const hasRow of [true, false]) {
        const r = C.resolveSourceRead({ referenced, error, hasRow });

        // NOT REFERENCED IS THE ONLY ROUTE TO `absent`. Everything else is
        // about a record that was named, and a named record that cannot be
        // produced is not an absent one.
        if (!referenced) {
          ok(r === "absent", "2b · a source nothing referenced is absent, whatever else is true");
          continue;
        }
        ok(r !== "absent", "2b · a REFERENCED source is never reported as absent");

        if (error) {
          const refusal =
            error.code === "42501" ||
            error.code === "PGRST301" ||
            error.code === "PGRST116" ||
            /permission denied/.test(error.message ?? "");
          ok(
            r === (refusal ? "refused" : "failed"),
            `2b · ${error.code ?? "(no code)"} classifies as ${refusal ? "refused" : "failed"}`,
          );
          continue;
        }

        // Named, read cleanly, and nothing came back: gone or withheld.
        ok(
          r === (hasRow ? "ok" : "refused"),
          `2b · a clean read with${hasRow ? "" : "out"} a row is ${hasRow ? "ok" : "refused"}`,
        );
      }
    }
  }

  // AN UNRECOGNISED FAILURE MUST NOT BECOME A REFUSAL. `refused` says somebody
  // made a decision, and it withholds the retry that would have cleared an
  // outage.
  ok(
    C.classifyReadError({ code: "NOBODY_HAS_SEEN_THIS" }) === "failed",
    "2b · an unrecognised code falls to failed, never to refused",
  );
  ok(C.classifyReadError(null) === "ok", "2b · no error is not a failure");
  ok(C.classifyReadError(undefined) === "ok", "2b · and neither is an absent one");
  ok(
    C.classifyReadError({ code: "42501" }) === "refused",
    "2b · the privilege SQLSTATE is a refusal",
  );

  // EVERY READER GOES THROUGH IT, NAMED ONE AT A TIME.
  //
  // A count of call sites catches a reader that stopped delegating, but it
  // reports "found 4 call sites" -- which tells nobody WHICH source has begun
  // lying about its own failures. Each reader is sliced out and asserted on
  // its own, so the diagnostic names the source.
  const fn = codeOnly(read(CONTEXT_FN));

  /** One function body, from its declaration to the next one. */
  const bodyOf = (name: string): string => {
    const start = fn.indexOf(name);
    if (start < 0) return "";
    const rest = fn.slice(start + name.length);
    const next = rest.search(/\nasync function |\nfunction |\nexport const /);
    return next < 0 ? rest : rest.slice(0, next);
  };

  for (const [decl, source] of [
    ["async function readJob", "the advert"],
    ["async function readCv", "the CV"],
    ["async function readAssessment", "the released assessment"],
  ] as const) {
    const body = bodyOf(decl);
    ok(body.length > 0, `2b · ${source}'s reader is where it is expected to be`);
    ok(
      body.includes("resolveSourceRead("),
      `2b · ${source}'s reader delegates its read outcome rather than deciding it`,
    );
    // A literal outcome is allowed in two places: `absent`, for a reference
    // that was never made, and `ok` on a path that has already established the
    // read landed. `refused` and `failed` are never a reader's to write --
    // that is where four separate defects hid.
    const literals = [...body.matchAll(/read:\s*"(ok|absent|refused|failed)"/g)].map((m) => m[1]);
    ok(
      literals.every((l) => l === "absent" || l === "ok"),
      `2b · and ${source}'s reader never writes "refused" or "failed" by hand`,
    );

    // ── AND `absent` IS NEVER WRITTEN ON A FAILURE PATH ──────────────
    //
    // Allowing the literal anywhere in a reader was too weak, and a negative
    // control proved it: `readAssessment`'s error branch was changed to
    // `read: "absent"` -- a failed read reported as an application with no
    // assessment, the original defect -- and every assertion above went on
    // passing, because a reader is legitimately allowed to write `absent` on
    // its no-reference path.
    //
    // The rule is about WHERE. Each `if (error…)` and each `catch` block is
    // sliced out by brace matching and required to delegate, because those are
    // exactly the branches on which an absence would be a lie.
    for (const m of body.matchAll(
      /(if \(\s*(?:error|err|snapErr|appErr)\b[^)]*\)\s*\{|catch\s*\([^)]*\)\s*\{)/g,
    )) {
      const from = (m.index ?? 0) + m[0].length;
      let depth = 1;
      let i = from;
      while (i < body.length && depth > 0) {
        if (body[i] === "{") depth += 1;
        else if (body[i] === "}") depth -= 1;
        i += 1;
      }
      const branch = body.slice(from, i);
      ok(
        !/read:\s*"(ok|absent)"/.test(branch),
        `2b · ${source}'s reader never writes an absence on a failure path`,
      );
      ok(
        branch.includes("resolveSourceRead(") || !branch.includes("read:"),
        `2b · and every failure path of ${source}'s reader delegates its outcome`,
      );
    }
  }

  // The application branch, which lives in the handler rather than in a reader.
  ok(
    /application: resolveSourceRead\(/.test(fn),
    "2b · the application's read outcome is delegated too",
  );
  // `absent` is the one value that must never be written by hand here: it means
  // "this case names no application", and the whole defect was a branch that
  // said so about a case that named one. `ok` IS written by hand, on the branch
  // that has already established the row came back -- so that literal is
  // asserted to be inside the successful branch rather than forbidden.
  ok(
    !/application:\s*"absent"/.test(fn),
    "2b · and `absent` is never written by hand -- it would mean a case with no application",
  );
  const happy = fn.slice(fn.indexOf("const [job, cv, assessment] = await Promise.all"));
  ok(
    /application: "ok"/.test(happy),
    "2b · the one hand-written `ok` is on the branch that already has the application row",
  );
  ok(
    !/application: "ok"/.test(fn.slice(0, fn.indexOf("const [job, cv, assessment]"))),
    "2b · and nowhere before it",
  );
}

/* ================================================================== */
/* 3 · The server contract: results, not thrown messages              */
/* ================================================================== */
{
  const fn = codeOnly(read(CONTEXT_FN));

  // The case read's two failure modes are MEMBERS. They used to be
  // `throw new Error("INTERVIEW_CASE_NOT_FOUND")` and `throw new
  // Error(error.message)`, told apart downstream by substring.
  ok(fn.includes('return { kind: "caseReadFailed" }'), "3 · a broken case read is a result member");
  ok(fn.includes('return { kind: "caseNotFoundOrRefused" }'), "3 · and so is an empty one");
  ok(!/throw new Error\("INTERVIEW_CASE_NOT_FOUND"\)/.test(fn), "3 · the thrown sentinel is gone");
  ok(
    !/if \(caseRes\.error\) throw new Error/.test(fn),
    "3 · and so is the bare rethrow of a database message",
  );

  // NO PATH FROM A FAILURE TO STANDALONE. The single most important source
  // property in this file.
  ok(
    !/if \(!a\) return standaloneContext|if \(appErr\) return standaloneContext/.test(fn),
    "3 · an unreadable application never reaches standaloneContext",
  );
  ok(
    /if \(appErr \|\| !a\)[\s\S]{0,700}?"linkedUnreadable"/.test(fn),
    "3 · it reaches linkedUnreadable instead",
  );
  ok(
    /if \(!applicationId\)[\s\S]{0,200}?standaloneContext\(candidateName\)/.test(fn),
    "3 · and only a case naming NO application reaches standalone",
  );

  // Refusal and breakage are told apart -- see section 2b, which exercises the
  // decision rather than reading it. What this section asserts is that the
  // server module still DELEGATES to it: the classifier moved into context.ts
  // precisely so that it could be run, and a reader that quietly grew its own
  // copy would be back outside anything that can test it.
  ok(
    !/const REFUSAL_CODES|function classify\(/.test(fn),
    "3 · the server module keeps no classifier of its own",
  );
  ok(
    fn.includes("resolveSourceRead("),
    "3 · it delegates to the pure one, which section 2b exercises",
  );

  // No service-role client, still.
  ok(
    !/service_role|serviceRole|SERVICE_ROLE/.test(fn),
    "3 · the read still holds no service-role client",
  );
  // The application id is never taken from the request.
  ok(
    fn.includes("const applicationId = str(c.application_id)"),
    "3 · the application is identified by the case's own persisted column",
  );
  ok(
    fn.includes("const jobId = str(a.job_id);"),
    "3 · and the job by the application's, never by the request",
  );
  // NEVER BY A NAME. E1's rule, re-asserted on the corrected read.
  //
  // The subject is a FILTER, not a mention: `candidate_display_name` is in the
  // select list and has to be, because the name is what the surfaces show. The
  // earlier form of this assertion matched that select list followed by the
  // `.eq("id", …)` on the next line and reported a defect that was not there —
  // which is a guard failing in the safe direction, but still a guard nobody
  // could trust. It now looks at what is inside the filter calls.
  const filters = [...fn.matchAll(/\.(eq|ilike|like|match|filter|or)\(([^)]*)\)/g)].map(
    (m) => m[2],
  );
  ok(filters.length > 0, "3 · the read applies filters this assertion can inspect");
  ok(
    !filters.some((f) => /candidate_display_name|display_name|full_name/.test(f)),
    "3 · nothing is looked up by a candidate name",
  );
  ok(!filters.some((f) => /email|recipient/.test(f)), "3 · or by an address");
  ok(
    !filters.some((f) => /title|role_title|job_title|pack/.test(f)),
    "3 · or by a role title or the guide's name",
  );
}

/* ================================================================== */
/* 4 · The screens: what they say, and what they refuse to say        */
/* ================================================================== */
{
  const draw = (node: React.ReactNode, lang: "sv" | "en") =>
    renderToStaticMarkup(React.createElement(I18nProvider, { initialLang: lang } as never, node));

  const strip = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  for (const lang of ["sv", "en"] as const) {
    const standaloneWords =
      sv["iic.unlinked"] && lang === "sv" ? sv["iic.unlinked"] : en["iic.unlinked"];

    // The unreadable case must NOT say the standalone sentence.
    const unreadable = C.emptyContext(
      "Fixture Kandidat",
      "linkedUnreadable",
      reads({
        application: "failed",
        job: "failed",
        cv: "failed",
        assessment: "failed",
      }),
    );
    const htmlUnreadable = strip(
      draw(
        React.createElement(InterviewContextPanel, {
          context: unreadable,
          employerSlug: "acme",
          applicationId: null,
          isLoading: false,
          isError: false,
        }),
        lang,
      ),
    );
    ok(
      !htmlUnreadable.includes(standaloneWords),
      `4 · [${lang}] an unreadable application never renders the standalone sentence`,
    );
    ok(
      htmlUnreadable.includes(
        lang === "sv" ? sv["iic.linkedUnreadable"] : en["iic.linkedUnreadable"],
      ),
      `4 · [${lang}] it says the application could not be read`,
    );

    // And the genuinely standalone case still does say it.
    const htmlStandalone = strip(
      draw(
        React.createElement(InterviewContextPanel, {
          context: C.standaloneContext("Fixture Kandidat"),
          employerSlug: "acme",
          applicationId: null,
          isLoading: false,
          isError: false,
        }),
        lang,
      ),
    );
    ok(
      htmlStandalone.includes(standaloneWords),
      `4 · [${lang}] a genuinely standalone case still says so`,
    );

    // A REFUSED ADVERT IS NOT AN ABSENT ONE.
    for (const [jobRead, key] of [
      ["refused", "iic.field.roleRefused"],
      ["failed", "iic.field.roleUnavailable"],
    ] as const) {
      const ctx = C.buildInterviewContext({
        ...baseInput,
        application: { ...baseInput.application!, jobTitleSv: null, jobTitleEn: null },
        job: null,
        reads: reads({ job: jobRead }),
      });
      const html = strip(
        draw(
          React.createElement(InterviewContextPanel, {
            context: ctx,
            employerSlug: "acme",
            applicationId: "app-1",
            isLoading: false,
            isError: false,
          }),
          lang,
        ),
      );
      const expected = lang === "sv" ? sv[key] : en[key];
      ok(
        html.includes(expected),
        `4 · [${lang}] an advert read that said "${jobRead}" renders as "${expected}"`,
      );
      ok(
        !html.includes(lang === "sv" ? sv["iic.field.noRole"] : en["iic.field.noRole"]),
        `4 · [${lang}] and never as "no advertised role"`,
      );
    }

    // A FAILED ASSESSMENT READ IS NOT "NO ASSESSMENT HAS BEEN SENT".
    for (const assessment of ["refused", "failed"] as const) {
      const ctx = C.buildInterviewContext({ ...baseInput, reads: reads({ assessment }) });
      const html = strip(
        draw(
          React.createElement(InterviewContextPanel, {
            context: ctx,
            employerSlug: "acme",
            applicationId: "app-1",
            isLoading: false,
            isError: false,
          }),
          lang,
        ),
      );
      ok(
        !html.includes(lang === "sv" ? sv["iic.assessment.none"] : en["iic.assessment.none"]),
        `4 · [${lang}] an assessment read that "${assessment}" never renders as no assessment`,
      );
      ok(
        html.includes(
          lang === "sv" ? sv[`iic.assessment.${assessment}`] : en[`iic.assessment.${assessment}`],
        ),
        `4 · [${lang}] it says the material ${assessment === "refused" ? "cannot be shown" : "could not be fetched"}`,
      );
    }

    // THE CASE-LEVEL ANSWERS, each with its own sentence.
    for (const [result, key] of [
      [{ kind: "caseNotFoundOrRefused" } as const, "iic.caseUnavailable.notFound"],
      [{ kind: "caseReadFailed" } as const, "iic.caseUnavailable.failed"],
    ] as const) {
      const html = strip(
        draw(
          React.createElement(ContextUnavailable, {
            result,
            isLoading: false,
            isError: false,
          }),
          lang,
        ),
      );
      ok(
        html.includes(lang === "sv" ? sv[key] : en[key]),
        `4 · [${lang}] ${result.kind} has its own sentence`,
      );
    }

    // AN UNKNOWN MEMBER FAILS CLOSED. A build that meets a state it has never
    // heard of must not render it as "there is nothing here".
    const htmlUnknown = strip(
      draw(
        React.createElement(ContextUnavailable, {
          result: { kind: "somethingFromTheFuture" } as unknown as InterviewContextResult,
          isLoading: false,
          isError: false,
        }),
        lang,
      ),
    );
    ok(
      htmlUnknown.includes(lang === "sv" ? sv["iic.error"] : en["iic.error"]),
      `4 · [${lang}] an unknown result member renders as a failure, not as an absence`,
    );
    ok(!htmlUnknown.includes(standaloneWords), `4 · [${lang}] and never as a standalone interview`);
  }

  // A RETRY IS OFFERED ONLY WHERE IT COULD CHANGE THE ANSWER.
  const outcome = codeOnly(read(OUTCOME));
  ok(
    /caseNotFoundOrRefused"[\s\S]{0,200}?false\]/.test(outcome),
    "4 · a not-found-or-refused case offers no retry: it is a decision, not an outage",
  );
  ok(/caseReadFailed"[\s\S]{0,200}?true\]/.test(outcome), "4 · and a failed read does");
}

/* ================================================================== */
/* 5 · An action that depends on the context is withheld without it   */
/* ================================================================== */
{
  // The predicate, first. `context !== null` is NOT the question: a
  // linkedUnreadable context is a real object with fifteen empty fields, and a
  // screen that treated it as "I have the context" would offer to approve a
  // plan built against requirements it never read.
  ok(
    !contextIsUsable(undefined) && !contextIsUsable(null),
    "5 · no result at all is not a usable context",
  );
  ok(!contextIsUsable({ kind: "caseReadFailed" }), "5 · and neither is a failed case read");
  ok(
    !contextIsUsable({ kind: "caseNotFoundOrRefused" }),
    "5 · nor a case that is not found or not yours",
  );
  ok(
    !contextIsUsable({
      kind: "context",
      context: C.emptyContext("X", "linkedUnreadable", reads({ application: "failed" })),
    }),
    "5 · nor a context whose application could not be read, although it IS an object",
  );
  ok(
    contextIsUsable({ kind: "context", context: C.standaloneContext("X") }),
    "5 · a standalone case IS usable — nothing failed, there is simply nothing to inherit",
  );
  ok(
    contextIsUsable({ kind: "context", context: C.buildInterviewContext(baseInput) }),
    "5 · and so is a linked one",
  );

  // `contextOf` never manufactures a context to render.
  ok(contextOf({ kind: "caseReadFailed" }) === null, "5 · contextOf returns null for a failure");
  ok(
    contextOf({ kind: "caseNotFoundOrRefused" }) === null,
    "5 · and for a case that cannot be reached",
  );

  // WHICH member arrived, not merely whether something context-shaped is
  // attached to it.
  //
  // Found by its own negative control: every fixture above is a member with
  // no `context` field at all, so a helper rewritten as
  // `result?.context ?? null` passed all of them. The union has three members
  // today and will have more; the day one of them carries a context for its
  // own reasons -- a superseded case, a case read from a stale cache -- a
  // helper that reads the FIELD instead of the KIND starts rendering it as
  // the context of this interview. These two fixtures are deliberately
  // impossible today, which is the point: they fail closed in advance.
  ok(
    contextOf({
      kind: "caseReadFailed",
      context: C.standaloneContext("X"),
    } as unknown as Parameters<typeof contextOf>[0]) === null,
    "5 · and for an unhappy member that happens to carry a context, because the KIND decides",
  );
  ok(
    contextOf({
      kind: "somethingAddedLater",
      context: C.standaloneContext("X"),
    } as unknown as Parameters<typeof contextOf>[0]) === null,
    "5 · and for a member this build has never heard of, which fails closed rather than rendering",
  );
  ok(
    !/\?\?\s*(standaloneContext|emptyContext)/.test(codeOnly(read(OUTCOME_HELPERS))),
    "5 · and never defaults to an empty context, which would be a set of unearned claims",
  );

  // THE MODULE BOUNDARY THESE TWO ANSWERS LIVE ON.
  //
  // They are pure and three routes plus this guard call them. Kept in the
  // component file they would make it a module that exports both a component
  // and a plain function, which Fast Refresh cannot reload reliably -- so the
  // component file renders and this module decides. The rule is followed, not
  // silenced: an eslint-disable here would be the defect.
  const helpers = read(OUTCOME_HELPERS);
  ok(
    /export function contextOf\(/.test(helpers) &&
      /export function contextIsUsable\(/.test(helpers),
    "5 · both answers are exported from the pure module beside the projection",
  );
  const outcomeSrc = read(OUTCOME);
  ok(
    !/export (function|const) (contextOf|contextIsUsable)\b/.test(outcomeSrc) &&
      !/export \{[^}]*context(Of|IsUsable)/.test(outcomeSrc),
    "5 · and the component file neither defines nor re-exports them",
  );
  const outcomeExports = outcomeSrc.match(/^export .*/gm) ?? [];
  const nonComponentExports = outcomeExports.filter(
    (line) =>
      !/^export function [A-Z]/.test(line) && !/^export type |^export interface /.test(line),
  );
  ok(
    outcomeExports.length > 0 && nonComponentExports.length === 0,
    `5 · the component file exports React components only, so Fast Refresh stays reliable (${nonComponentExports.join(" | ")})`,
  );
  ok(
    !/eslint-disable/.test(outcomeSrc) && !/eslint-disable/.test(helpers),
    "5 · and neither file silences the rule that says so",
  );

  // The preparation screen withholds APPROVAL, and says why.
  const prep = codeOnly(read(PREPARE));
  ok(
    prep.includes("contextIsUsable(contextQ.data)"),
    "5 · the preparation screen asks whether the context is usable",
  );
  ok(
    /contextIsUsable\(contextQ\.data\)[\s\S]{0,900}?approve\.mutate/.test(prep),
    "5 · and the approval control is inside that branch",
  );
  ok(
    /iiu\.pp\.approve\.blockedBody/.test(prep),
    "5 · with a stated reason rather than a greyed-out button",
  );
  for (const k of ["iiu.pp.approve.blockedTitle", "iiu.pp.approve.blockedBody"]) {
    ok(typeof sv[k] === "string" && typeof en[k] === "string", `5 · ${k} exists in both languages`);
  }

  // Every consumer goes through the shared helper. Three copies of the mapping
  // is where one of them quietly stops handling a member.
  for (const [file, who] of [
    [CASE_INDEX, "the case overview"],
    [PREPARE, "the preparation screen"],
    [LIVE, "the live interview"],
  ] as const) {
    const src = codeOnly(read(file));
    ok(src.includes("contextOf("), `5 · ${who} reads the result through the shared helper`);
    ok(
      !/contextQ\.data\?\.(linked|roleSv|roleEn|followUps|requirements)/.test(src),
      `5 · and ${who} never reaches into the result as though it were a context`,
    );
  }

  // The live interview must not render an EMPTY briefing as an absent one.
  const live = codeOnly(read(LIVE));
  ok(
    live.includes("contextAreasKnown"),
    "5 · the live interview distinguishes an empty briefing from an unfetched one",
  );
  ok(
    /contextAreas\.length === 0 && !contextAreasKnown/.test(live),
    "5 · and says so rather than rendering nothing at all",
  );
}

/* ================================================================== */
/* 6 · The notice: eleven things, and what cannot be said             */
/* ================================================================== */
{
  const baseNotice: NoticeInput = {
    employerName: "Vaktbolaget AB",
    roleTitle: "Väktare",
    roleRead: "ok",
    sourceKinds: ["cv"],
    transcriptInUse: false,
    retainUntil: "2027-01-01",
    retentionRead: "ok",
    correctionPathAvailable: true,
  };

  ok(N.NOTICE_ELEMENTS.length === 11, "6 · eleven elements, as the brief enumerates");
  const complete = N.projectCandidateNotice(baseNotice);
  ok(N.noticeIsComplete(complete), "6 · a fully configured case can state all of them");
  ok(N.noticeGaps(complete).length === 0, "6 · and has no gaps");

  // THE DEFECT. `retain_until` has one writer, so most cases have none — and
  // the page rendered that as no line at all.
  const noRetention = N.projectCandidateNotice({ ...baseNotice, retainUntil: null });
  ok(
    noRetention.retention === "notConfigured",
    "6 · a case with no retention date says the employer has not set one",
  );
  ok(
    !N.noticeIsComplete(noRetention) && N.noticeGaps(noRetention).includes("retention"),
    "6 · and that is a gap, not a silence",
  );

  // A FAILED READ IS NOT "NOT CONFIGURED". "The employer has not set a
  // retention date" is a claim about somebody's setup.
  for (const retentionRead of ["refused", "failed"] as const) {
    const r = N.projectCandidateNotice({ ...baseNotice, retainUntil: null, retentionRead });
    ok(
      r.retention === "unknown",
      `6 · a retention read that "${retentionRead}" is unknown, never notConfigured`,
    );
    // Even with a date present, an unreliable read must not be reported as
    // configured: the date may be stale.
    const withDate = N.projectCandidateNotice({ ...baseNotice, retentionRead });
    ok(
      withDate.retention === "unknown",
      `6 · and a date read under "${retentionRead}" is still unknown`,
    );
  }

  // THE ROLE, again: three answers, not two.
  for (const roleRead of ["absent", "ok"] as const) {
    ok(
      N.projectCandidateNotice({ ...baseNotice, roleTitle: null, roleRead }).whichRole ===
        "notConfigured",
      `6 · a role that was read and is not there is notConfigured (${roleRead})`,
    );
  }
  for (const roleRead of ["refused", "failed"] as const) {
    ok(
      N.projectCandidateNotice({ ...baseNotice, roleTitle: null, roleRead }).whichRole ===
        "unknown",
      `6 · a role whose read "${roleRead}" is unknown, never reported as absent`,
    );
  }

  // The method properties are always statable: they are true of every
  // interview this product runs, so a case that failed to say them would be a
  // bug rather than a configuration.
  for (const e of ["purpose", "aiProposes", "humanConfirms", "aiDoesNotDecide"] as const) {
    for (const input of [
      baseNotice,
      { ...baseNotice, retainUntil: null },
      { ...baseNotice, roleTitle: null, roleRead: "failed" as const },
      { ...baseNotice, employerName: null },
    ]) {
      ok(
        N.projectCandidateNotice(input)[e] === "stated",
        `6 · ${e} is stated whatever else is unknown`,
      );
    }
  }

  // NO CONSENT VOCABULARY, and no compliance claim. The notice tells somebody
  // what is happening; it does not ask them to agree, and it certifies nothing.
  // Comments only, stripped: this file's own header explains that it does NOT
  // use the word consent, and a guard satisfied by the sentence describing the
  // property rather than by the property is a guard against nothing.
  const noticeSrc = codeOnly(read(NOTICE));
  for (const forbidden of ["consent", "samtycke", "GDPR", "lawful basis is", "compliant"]) {
    ok(
      !new RegExp(forbidden, "i").test(noticeSrc),
      `6 · the notice projection never says "${forbidden}"`,
    );
  }
  for (const dict of [sv, en]) {
    const copy = N.NOTICE_ELEMENTS.map((e) => dict[`iin.el.${e}`] ?? "").join(" ");
    for (const forbidden of ["samtyck", "consent", "GDPR", "godkänner", "you agree"]) {
      ok(!new RegExp(forbidden, "i").test(copy), `6 · and neither does its copy ("${forbidden}")`);
    }
  }
  // The employer's panel says explicitly that this is not a legal sufficiency
  // claim. That sentence is the whole reason the panel is safe to show.
  for (const dict of [sv, en]) {
    ok(
      /juridisk|legal/i.test(dict["iin.footnote"] ?? ""),
      "6 · the employer panel says the content still needs legal review",
    );
  }

  // Copy exists for every element, in both languages.
  for (const e of N.NOTICE_ELEMENTS) {
    const k = `iin.el.${e}`;
    ok(typeof sv[k] === "string" && sv[k].length > 0, `6 · ${k} has Swedish copy`);
    ok(typeof en[k] === "string" && en[k].length > 0, `6 · ${k} has English copy`);
    ok(sv[k] !== en[k], `6 · ${k} is genuinely translated`);
  }
}

/* ================================================================== */
/* 7 · The notice, drawn — and the retention gap named                */
/* ================================================================== */
{
  const draw = (input: NoticeInput, lang: "sv" | "en") =>
    renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        { initialLang: lang } as never,
        React.createElement(CandidateNoticePanel, { input }),
      ),
    )
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ");

  const configured: NoticeInput = {
    employerName: "Vaktbolaget AB",
    roleTitle: "Väktare",
    roleRead: "ok",
    sourceKinds: ["cv"],
    transcriptInUse: false,
    retainUntil: "2027-01-01",
    retentionRead: "ok",
    correctionPathAvailable: true,
  };

  for (const lang of ["sv", "en"] as const) {
    const d = lang === "sv" ? sv : en;

    const okHtml = draw(configured, lang);
    ok(
      !okHtml.includes(d["iin.gaps.title"]),
      `7 · [${lang}] a fully configured case shows no gap block`,
    );
    for (const e of N.NOTICE_ELEMENTS) {
      ok(
        okHtml.includes(d[`iin.el.${e}`]),
        `7 · [${lang}] and names every element, including ${e}`,
      );
    }

    const gapHtml = draw({ ...configured, retainUntil: null }, lang);
    ok(
      gapHtml.includes(d["iin.gaps.title"]),
      `7 · [${lang}] a case with no retention names the gap`,
    );
    ok(
      gapHtml.includes(d["iin.state.notConfigured"]),
      `7 · [${lang}] and says it is the employer who has not set it`,
    );
    ok(
      gapHtml.includes(d["iin.retention.howToSet"]),
      `7 · [${lang}] and says where it would be set`,
    );
    // NO INVENTED PERIOD, anywhere. The one thing this must never do.
    ok(
      !/\b(30|60|90|180|365|12|24)\s*(dagar|days|månader|months)\b/i.test(gapHtml),
      `7 · [${lang}] and invents no retention period to fill the gap`,
    );

    const unknownHtml = draw({ ...configured, retentionRead: "failed" }, lang);
    ok(
      unknownHtml.includes(d["iin.state.unknown"]),
      `7 · [${lang}] a retention read that failed says so, rather than "not set"`,
    );
    ok(
      !unknownHtml.includes(d["iin.state.notConfigured"]),
      `7 · [${lang}] and does not accuse the employer of not setting it`,
    );
  }

  // The panel is a report, not a control: nothing here writes, acknowledges or
  // confirms anything. The product has no candidate acknowledgement step, and
  // a checkbox recording one would record something that did not happen.
  const panel = codeOnly(read(NOTICE_PANEL));
  ok(!/useMutation|useServerFn|onClick=/.test(panel), "7 · the notice panel writes nothing");
  ok(
    !/acknowledg|bekräfta|checkbox|type="checkbox"/i.test(panel),
    "7 · and records no acknowledgement, because there is none to record",
  );
}

/* ================================================================== */
/* 8 · The candidate's own page states retention in every case        */
/* ================================================================== */
{
  const page = codeOnly(read(CANDIDATE_PAGE));

  // It went through the shared projection rather than testing the field.
  ok(
    page.includes("projectCandidateNotice("),
    "8 · the candidate's page derives the notice from the shared projection",
  );
  // THE DEFECT: `{d.retainUntil && (...)}` rendered nothing at all for every
  // case without a transcript.
  //
  // Matched on `&&` OR `?`, because the defect's shape is "the region is
  // entered only when there is a date" and a ternary expresses that just as
  // well as a short-circuit. A control that reintroduced it as a ternary
  // slipped past the narrower form of this assertion.
  ok(
    !/\{\s*d\.retainUntil\s*(&&|\?)/.test(page),
    "8 · and no longer renders retention only when there is a date",
  );
  ok(
    /retention === "notConfigured"/.test(page),
    "8 · a case with none says the employer has not set one",
  );
  ok(/retention === "stated"/.test(page), "8 · a case with one states it");
  // Every branch of the three is reachable: `stated`, `notConfigured` and the
  // unknown fallback.
  const branch = page.slice(page.indexOf('retention === "stated"'));
  ok(
    branch.includes('retention === "notConfigured"') && branch.includes(") : ("),
    "8 · and a read that did not land has a third answer",
  );

  // Who can access, and WHAT STAYS ON THE EMPLOYER'S SIDE.
  ok(page.includes('aria-labelledby="ci-access"'), "8 · the page says who can see the material");
  for (const needle of [
    "Behöriga personer hos arbetsgivaren",
    "Authorised people at the employer",
  ]) {
    ok(read(CANDIDATE_PAGE).includes(needle), `8 · in both languages ("${needle.slice(0, 20)}…")`);
  }

  // ── THE PROMISE THAT MAY NOT COME BACK ────────────────────────────
  //
  // This page used to tell a candidate the employer "may choose to share a
  // summary of the interview with you". Nothing in this product can produce
  // one: the candidate-summary feature was removed, and the employer final
  // report is decision support the product owner decided is NOT shared with
  // the candidate. A person reading that sentence waits for a document that
  // is never coming, and then reads the silence as the employer having
  // chosen not to share -- a decision nobody made.
  //
  // What is banned is the PROMISE -- "may choose to share a summary" and the
  // model element that carried it -- and not the noun itself: the page's own
  // denial has to be able to say the word "summary" out loud, or it cannot
  // deny anything. A ban on the noun would forbid the correction along with
  // the defect.
  const noticeSrc = read(NOTICE);
  const panelSrc = read(NOTICE_PANEL);
  for (const [needle, where, src] of [
    // `page` is comment-stripped: the ban is on what the page SAYS to a
    // person, and the comment recording why the promise was removed has to be
    // able to quote it.
    ["dela en sammanfattning", "the candidate page", page],
    ["share a summary", "the candidate page", page],
    ["kan välja att dela", "the candidate page", page],
    ["may choose to share", "the candidate page", page],
    ["summaryMayBeShared", "the notice model", noticeSrc],
    ["summaryMayBeShared", "the notice panel", panelSrc],
    ["summaryMayBeShared", "the dictionaries", read("src/i18n/dictionaries.ts")],
  ] as const) {
    ok(
      !src.includes(needle),
      `8 · ${where} promises no interview summary ("${needle}") -- no governed contract shares one`,
    );
  }

  // What it says INSTEAD, in both languages: the boundary, which is true
  // today and stays true without any future capability.
  for (const needle of [
    "visas inte här",
    "are not shown here",
    "färdigställer sin rapport betyder inte att den delas",
    "finalising their report does not share it",
    "lovar ingen sammanfattning",
    "promises you no summary",
  ]) {
    ok(
      read(CANDIDATE_PAGE).includes(needle),
      `8 · and states the boundary instead ("${needle.slice(0, 28)}…")`,
    );
  }

  // The notice model carries the boundary as an element of its own, so a
  // surface cannot quietly stop saying it.
  ok(
    (N.NOTICE_ELEMENTS as readonly string[]).includes("employerMaterialNotShared"),
    "8 · and the notice model names that boundary as one of its elements",
  );

  // E2 IS NOT COLLATERAL. The assessment RESULT is a separate, genuinely
  // governed document with its own release path, shared only by an explicit
  // human decision. Nothing above may deny it exists.
  ok(
    !/ingen bedömning delas|no assessment (is|will be) shared|delas aldrig med dig/i.test(
      read(CANDIDATE_PAGE),
    ),
    "8 · while saying nothing that would deny the separately governed assessment result",
  );
}

/* ================================================================== */
/* 9 · Nothing here became a judgement about the person               */
/* ================================================================== */
{
  for (const file of [CONTEXT, CONTEXT_FN, NOTICE, OUTCOME, OUTCOME_HELPERS, NOTICE_PANEL]) {
    const src = codeOnly(read(file));
    for (const [pattern, label] of [
      [/\bscore\b|totalScore|scoreValue/i, "a score"],
      [/\brank\b|ranking|percentile/i, "a rank"],
      [/suitab|recommendHire|shortlist/i, "a suitability verdict"],
      [/passFail|pass_fail/i, "a pass/fail"],
      [/compareCandidates|versusOther/i, "a comparison"],
    ] as const) {
      ok(!pattern.test(src), `9 · ${file.split("/").pop()} expresses ${label} nowhere`);
    }
  }
  ok(existsSync(path.join(root, NOTICE)), "9 · the notice projection exists");
  ok(existsSync(path.join(root, OUTCOME)), "9 · and so does the shared result helper");
  ok(
    existsSync(path.join(root, OUTCOME_HELPERS)),
    "9 · and the pure module the two answers live in",
  );
}

/* ------------------------------------------------------------------ */

if (failures > 0) {
  console.error(`\n${passes} passed, ${failures} failed`);
  process.exit(1);
}
console.log(`
OK: a read that did not land is never rendered as a fact. An unreadable application is
    not a standalone interview, an unfetched advert is not an advert with no requirements,
    an unread assessment is not an absent one, and a case with no retention date says so
    instead of saying nothing. ${passes} assertions.`);
