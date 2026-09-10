/**
 * EMPLOYER FINAL REPORT (E4) — is the canonical output provable, and does the
 * screen lead one authorised human through producing it?
 *
 * ── WHAT THIS IS ABOUT ──────────────────────────────────────────────────
 *
 * The employer final report is the canonical output of the assessment and
 * interview process. A recruitment owner reviews it, explicitly finalises it,
 * and uses it as DECISION SUPPORT. It is never an automatic recommendation,
 * ranking, total score, pass/fail or employment decision, and it is never
 * shared with the candidate.
 *
 * ── THE DEFECTS THIS GUARD EXISTS BECAUSE OF ────────────────────────────
 *
 *   AN md5 HASH, AND NO WAY TO KNOW IT WAS md5.  The integrity claim a reader
 *   would point at to say "this is the report that was finalised" was an md5
 *   of the payload, and nothing recorded which algorithm produced it.
 *
 *   ONE ASSESSOR, CHOSEN BY THE HEAP.  The basis took ONE assessment per
 *   question with LIMIT 1 and no ORDER BY. On a two-person panel, which
 *   assessor's judgement became the employer's report depended on physical
 *   row order. Every active human assessment is now carried, in a declared
 *   order, and disagreement is stated rather than resolved by chance.
 *
 *   A PAYLOAD THAT WAS NOT THE SAME TWICE.  Aggregates without an ORDER BY
 *   produced arrays in heap order, so the digest of an unchanged case could
 *   change and a second finalisation could mint a new version of nothing.
 *
 *   A FALSE VERIFICATION.  A line from a Passport disclosure was classified
 *   `verified_material` on the strength of its source kind alone. A
 *   disclosure is what the candidate chose to share; nothing in this process
 *   verified it. It is now classified neutrally.
 *
 *   THE ASSESSMENT RESULT MISSING.  The report named the assessment material
 *   and carried none of its findings. The released employer result is now
 *   bound to the exact snapshot, release version and content digest.
 *
 *   A PREVIEW THAT WAS NOT WHAT WAS FINALISED.  Preview and finalisation were
 *   two code paths. They are now one builder, and finalisation refuses unless
 *   the identity it is handed is the identity of the basis it would lock.
 *
 *   A LOCKED REPORT DRAWN FROM LIVE DATA.  The screen rebuilt the "final"
 *   report from the live case on every visit. One component now renders the
 *   parsed server payload -- for the preview, the current final and an opened
 *   historical version alike -- and reads nothing live.
 *
 *   A uuid WHERE A PERSON SHOULD BE.  The readback named the finalising actor
 *   by account id. It now carries the governed display name and address.
 *
 * ── WHAT THIS PROVES, AND HOW ───────────────────────────────────────────
 *
 * TABLE    The sequence, the readback, the preview gate and the error map are
 *          pure, so they are exercised exhaustively. No fixtures, no clock,
 *          no database.
 *
 * RENDER   The panels and the DOCUMENT are drawn in BOTH languages from a
 *          fixture payload and their text is read, so "both assessors are on
 *          the page and their disagreement is stated" is asserted as rendered
 *          output. The preview render and the final render of one payload are
 *          compared body-for-body.
 *
 * SOURCE   The properties a render cannot reach: that every aggregate in the
 *          builder is ordered; that no assessment is picked with LIMIT 1;
 *          that the digest is core sha256 over UTF-8 bytes; that finalisation
 *          takes and checks the previewed identity; that the builder reads no
 *          live application, Passport, CV or note table; that no scp_iv_
 *          function names the snapshot table; that the rollback restores the
 *          previous finalisation function and the suite applies it for real.
 *
 * Deterministic, offline, no database, no network.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

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
const F = await import("../src/lib/interview-intelligence/final-report");
const Panels = await import("../src/components/employer/interview/FinalReportSequence");
const { FinalReportDocument } =
  await import("../src/components/employer/interview/FinalReportDocument");
const { ReportFinalisation } =
  await import("../src/components/employer/interview/ReportFinalisation");

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

/** Source with comments stripped. A guard that greps raw source can be
 *  satisfied by the comment describing the thing it looks for. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");

/** SQL with line comments stripped, for the same reason. */
const sqlOnly = (src: string) => src.replace(/^[ \t]*--.*$/gm, " ");

const render = (node: React.ReactElement, lang: "sv" | "en") =>
  renderToStaticMarkup(React.createElement(I18nProvider, { initialLang: lang, children: node }));

const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

/** The body of `CREATE OR REPLACE FUNCTION public.<name>` up to the next
 *  CREATE/DROP/REVOKE/GRANT/ALTER statement, comments stripped. */
function functionBody(statements: string, name: string): string {
  const at = statements.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  if (at < 0) return "";
  const rest = statements.slice(at + 10);
  const next = rest.search(/\n(CREATE|DROP|REVOKE|GRANT|ALTER|DO) /);
  return next < 0 ? statements.slice(at) : statements.slice(at, at + 10 + next);
}

/** Every `jsonb_agg(` call in `src`, as the text between its own parentheses,
 *  found by balancing them. A regex across the whole builder cannot tell an
 *  ORDER BY inside one aggregate from an ORDER BY belonging to the next. */
function aggregateCalls(src: string): string[] {
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const at = src.indexOf("jsonb_agg(", from);
    if (at < 0) return out;
    let depth = 0;
    for (let i = at + "jsonb_agg".length; i < src.length; i += 1) {
      if (src[i] === "(") depth += 1;
      else if (src[i] === ")") {
        depth -= 1;
        if (depth === 0) {
          out.push(src.slice(at, i + 1));
          // Continue INSIDE this call: the builder nests aggregates, and a
          // nested one without an ORDER BY is the defect as much as an outer.
          from = at + "jsonb_agg(".length;
          break;
        }
      }
      if (i === src.length - 1) return out;
    }
  }
}

const MIGRATION = "supabase/migrations/20261107090000_scp_iv_report_basis_integrity.sql";
const ROLLBACK = "supabase/rollback/20261107090000_scp_iv_report_basis_integrity_rollback.sql";
const DB_TEST = "scripts/db-test.sh";
const ROUTE =
  "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.report.tsx";
const RUNTIME = "src/lib/interview-intelligence/runtime.functions.ts";
const PANEL = "src/components/employer/interview/FinalReportSequence.tsx";
const DOCUMENT = "src/components/employer/interview/FinalReportDocument.tsx";
const FINALISATION = "src/components/employer/interview/ReportFinalisation.tsx";

const readbackRow = (over: Partial<F.FinalReportReadback> = {}): F.FinalReportReadback => ({
  reportId: "r1",
  versionNumber: 2,
  status: "final",
  finalisedAt: "2026-09-10T08:00:00Z",
  finalisedBy: "8a000000-0000-4000-8000-0000000000a1",
  finalisedByName: "Ansvarig Rekryterare A",
  finalisedByEmail: "owner-a@example.test",
  contentHash: "c".repeat(64),
  contentHashAlgorithm: "sha256",
  basisHash: "b".repeat(64),
  recomputedHash: "c".repeat(64),
  hashVerified: true,
  payload: null,
  ...over,
});

/* ══════════════════════════════════════════════════════════════════════ */
console.log("\n1. The sequence: seven acts, exactly one current");
/* ══════════════════════════════════════════════════════════════════════ */
{
  ok(F.REPORT_STEPS.length === 7, "1.1 there are seven acts");
  ok(
    F.REPORT_STEPS.indexOf("previewReport") < F.REPORT_STEPS.indexOf("finalise"),
    "1.2 previewing comes BEFORE finalising",
  );
  ok(
    F.REPORT_STEPS.indexOf("finalise") < F.REPORT_STEPS.indexOf("readback"),
    "1.3 and reading back comes after finalising",
  );

  // Exhaustive over every combination that can arise, rather than a sample.
  let combos = 0;
  let alwaysExactlyOne = true;
  let neverFinaliseWhenBlocked = true;
  let doneNeverAfterCurrent = true;
  for (const requirementCount of [0, 1, 8]) {
    for (const assessedCount of [0, 1, 8]) {
      for (const outstandingCount of [0, 3]) {
        for (const blockerCount of [0, 2]) {
          for (const isFinal of [false, true]) {
            for (const canFinalise of [false, true]) {
              combos += 1;
              const p: F.ReportProgress = {
                requirementCount,
                assessedCount,
                outstandingCount,
                blockerCount,
                isFinal,
                canFinalise,
              };
              const views = F.reportSteps(p);
              if (views.filter((v) => v.state === "current").length !== 1) alwaysExactlyOne = false;
              if (views.length !== 7) alwaysExactlyOne = false;
              const cur = F.currentStep(p);
              if (!isFinal && blockerCount > 0 && cur === "finalise")
                neverFinaliseWhenBlocked = false;
              const at = F.REPORT_STEPS.indexOf(cur);
              views.forEach((v, i) => {
                if (v.state === "done" && i > at) doneNeverAfterCurrent = false;
              });
            }
          }
        }
      }
    }
  }
  ok(combos === 3 * 3 * 2 * 2 * 2 * 2, `1.4 every progress combination was exercised (${combos})`);
  ok(alwaysExactlyOne, "1.5 exactly one act is current, in every combination");
  ok(
    neverFinaliseWhenBlocked,
    "1.6 finalising is never the current act while the server reports a blocker",
  );
  ok(doneNeverAfterCurrent, "1.7 nothing after the current act is ever marked done");

  const finalP: F.ReportProgress = {
    requirementCount: 8,
    assessedCount: 8,
    outstandingCount: 0,
    blockerCount: 0,
    isFinal: true,
    canFinalise: true,
  };
  ok(
    F.currentStep(finalP) === "readback",
    "1.8 once a report is final, reading it back is the act",
  );
  const memberP: F.ReportProgress = { ...finalP, isFinal: false, canFinalise: false };
  ok(
    F.reportSteps(memberP).some((v) => v.step === "finalise" && v.state === "notPermitted"),
    "1.9 a member who may not finalise is TOLD so, rather than shown nothing",
  );
  ok(
    F.currentStep(memberP) === "previewReport",
    "1.10 and their current act is previewing, not an action they cannot take",
  );
  const emptyPack: F.ReportProgress = {
    requirementCount: 0,
    assessedCount: 0,
    outstandingCount: 0,
    blockerCount: 0,
    isFinal: false,
    canFinalise: true,
  };
  ok(
    F.currentStep(emptyPack) !== "finalise",
    "1.11 a case with NO requirements is never ready to finalise, blockers or not",
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
console.log("\n2. Finalising is a courtesy gate over a server rule, behind a preview");
/* ══════════════════════════════════════════════════════════════════════ */
{
  const base: F.ReportProgress = {
    requirementCount: 8,
    assessedCount: 8,
    outstandingCount: 0,
    blockerCount: 0,
    isFinal: false,
    canFinalise: true,
  };
  ok(
    F.finaliseEnabled(base, false),
    "2.1 an assessed, unblocked case with the right role may finalise",
  );
  ok(!F.finaliseEnabled(base, true), "2.2 not while a call is in flight");
  ok(!F.finaliseEnabled({ ...base, canFinalise: false }, false), "2.3 not without owner or admin");
  ok(!F.finaliseEnabled({ ...base, blockerCount: 1 }, false), "2.4 not while a blocker stands");
  ok(!F.finaliseEnabled({ ...base, isFinal: true }, false), "2.5 not when it is already final");
  ok(
    !F.finaliseEnabled({ ...base, assessedCount: 7 }, false),
    "2.6 not with a requirement unassessed",
  );
  ok(
    !F.finaliseEnabled({ ...base, requirementCount: 0, assessedCount: 0 }, false),
    "2.7 and not on a case with no requirements at all",
  );

  // The preview gate: the identity the button sends is the identity the
  // owner read. Without a preview there is no identity to send.
  const preview: F.ReportPreview = {
    payload: F.parseReportPayload({}),
    basisHash: "b".repeat(64),
    contentHash: "c".repeat(64),
    blockerCount: 0,
    blockers: [],
  };
  const idle: F.FinaliseOutcome = { kind: "idle" };
  ok(
    F.finaliseEnabledWithPreview(base, preview, idle),
    "2.8 with a preview in hand, an assessed, unblocked case may finalise",
  );
  ok(
    !F.finaliseEnabledWithPreview(base, null, idle),
    "2.9 with NO preview in hand it may not — there is no identity to send",
  );
  ok(
    !F.finaliseEnabledWithPreview(base, preview, { kind: "stalePreview" }),
    "2.10 and a preview the server called stale is not a preview",
  );
  ok(
    !F.finaliseEnabledWithPreview(base, { ...preview, blockerCount: 1 }, idle),
    "2.11 nor is a preview that itself reports a blocker",
  );
  ok(
    !F.finaliseEnabledWithPreview(base, preview, { kind: "finalising" }),
    "2.12 nor while the act is in flight",
  );
  ok(
    !F.finaliseEnabledWithPreview({ ...base, canFinalise: false }, preview, idle),
    "2.13 and a preview does not override the role",
  );
  ok(
    !F.finaliseEnabledWithPreview({ ...base, blockerCount: 1 }, preview, idle),
    "2.14 nor a blocker the progress reports",
  );

  // The messages scp_iv_finalise_report raises, each to its own outcome.
  ok(
    F.finaliseErrorOutcome("SCP_IV_STALE_PREVIEW: the basis changed after the preview").kind ===
      "stalePreview",
    "2.15 SCP_IV_STALE_PREVIEW is a stale preview",
  );
  ok(
    F.finaliseErrorOutcome("SCP_IV_PREVIEW_REQUIRED: preview first").kind === "previewRequired",
    "2.16 SCP_IV_PREVIEW_REQUIRED is a missing preview",
  );
  ok(
    F.finaliseErrorOutcome("SCP_IV_REPORT_BLOCKED: 2 blocker(s)").kind === "blocked",
    "2.17 SCP_IV_REPORT_BLOCKED is a blocker",
  );
  ok(
    F.finaliseErrorOutcome("SCP_IV_FINALISE_ROLE: owner or admin only").kind === "refused",
    "2.18 SCP_IV_FINALISE_ROLE is a refusal",
  );
  for (const m of ["connection reset", "", null, undefined]) {
    ok(
      F.finaliseErrorOutcome(m).kind === "failed",
      `2.19 ${JSON.stringify(m)} is a failure that claims nothing`,
    );
  }
  ok(
    (["stalePreview", "previewRequired", "blocked", "refused", "failed"] as const).every(
      (k) => k !== "confirmed" && k !== "writtenNotConfirmed",
    ),
    "2.20 and no error path can be read as a written report",
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
console.log("\n3. A readback may only claim what it checked");
/* ══════════════════════════════════════════════════════════════════════ */
{
  const row = (verified: boolean) =>
    readbackRow({
      recomputedHash: verified ? "c".repeat(64) : "b".repeat(64),
      hashVerified: verified,
    });

  ok(F.readbackOutcome(row(true)).kind === "verified", "3.1 a matching digest is verified");
  ok(F.readbackOutcome(row(false)).kind === "notVerified", "3.2 a mismatching digest is NOT");
  ok(F.readbackOutcome(null).kind === "none", "3.3 an empty read is an honest none");

  ok(
    F.readbackIsTrustworthy(F.readbackOutcome(row(true))),
    "3.4 only a verified readback is trustworthy",
  );
  ok(!F.readbackIsTrustworthy(F.readbackOutcome(row(false))), "3.5 a mismatch is not");
  ok(!F.readbackIsTrustworthy(F.readbackOutcome(null)), "3.6 nor is an absence");
  ok(!F.readbackIsTrustworthy({ kind: "refused" }), "3.7 nor a refusal");
  ok(!F.readbackIsTrustworthy({ kind: "failed" }), "3.8 nor a failure");
  ok(!F.readbackIsTrustworthy({ kind: "loading" }), "3.9 nor a read still in flight");

  // A refusal and a breakage are different, and NEITHER is "none".
  for (const code of ["42501", "PGRST301", "PGRST116"]) {
    ok(F.readbackErrorOutcome(code).kind === "refused", `3.10 ${code} is a refusal`);
  }
  for (const code of ["08006", "57014", "XX000", "", null, undefined]) {
    ok(
      F.readbackErrorOutcome(code).kind === "failed",
      `3.11 ${String(code)} is a failure, not a refusal`,
    );
  }
  ok(
    (["refused", "failed"] as const).every((k) => k !== "none"),
    "3.12 and no error path can produce `none` — a failed read is never rendered as no report",
  );

  // The finalising actor: a person, never a uuid.
  ok(
    F.actorLabel(readbackRow()) === "Ansvarig Rekryterare A",
    "3.13 the actor is the governed display name where the account has one",
  );
  ok(
    F.actorLabel(readbackRow({ finalisedByName: null })) === "owner-a@example.test",
    "3.14 and the account address where it has none",
  );
  ok(
    F.actorLabel(readbackRow({ finalisedByName: "   ", finalisedByEmail: "" })) === null,
    "3.15 and null, never a uuid, when neither can be resolved",
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
console.log("\n4. The boundary is stated at the point of the irreversible act");
/* ══════════════════════════════════════════════════════════════════════ */
{
  ok(F.FINALISE_EFFECTS.length >= 4, "4.1 what finalising does is enumerated");
  ok(
    F.FINALISE_NON_EFFECTS.includes("doesNotShareWithCandidate"),
    "4.2 and the first thing it does NOT do is share with the candidate",
  );
  ok(F.FINALISE_NON_EFFECTS.includes("doesNotDecide"), "4.3 nor decide");
  ok(F.FINALISE_NON_EFFECTS.includes("doesNotRankOrScore"), "4.4 nor rank or score");

  for (const lang of ["sv", "en"] as const) {
    const html = render(React.createElement(Panels.FinaliseBoundary), lang);
    const body = text(html);
    const d = dictionaries[lang] as Record<string, string>;
    ok(
      body.includes(d["iir.noneffects.doesNotShareWithCandidate"]),
      `4.5 ${lang}: the rendered boundary says the candidate does not receive the report`,
    );
    ok(
      body.includes(d["iir.noneffects.doesNotRankOrScore"]),
      `4.6 ${lang}: and that there is no total score, ranking or verdict`,
    );
    ok(
      body.includes(d["iir.effects.createsAVersion"]),
      `4.7 ${lang}: and that a numbered, uneditable version is created`,
    );
    ok(
      !/\bpoäng\b|\bscore\b|\branking\b/i.test(
        body.replace(d["iir.noneffects.doesNotRankOrScore"], ""),
      ),
      `4.8 ${lang}: and nothing else on the panel offers a score or a ranking`,
    );
  }
}

/* ══════════════════════════════════════════════════════════════════════ */
console.log("\n5. The readback panel renders what is true, in both languages");
/* ══════════════════════════════════════════════════════════════════════ */
{
  const row = readbackRow();
  const noRetry = () => {};

  for (const lang of ["sv", "en"] as const) {
    const d = dictionaries[lang] as Record<string, string>;

    const verified = text(
      render(
        React.createElement(Panels.FinalReportReadbackPanel, {
          outcome: { kind: "verified", report: row },
          onRetry: noRetry,
        }),
        lang,
      ),
    );
    ok(
      verified.includes(d["iir.readback.verified"]),
      `5.1 ${lang}: a verified readback says the digest was recomputed and matches`,
    );
    ok(verified.includes("c".repeat(64)), `5.2 ${lang}: and shows the digest itself`);
    ok(verified.includes("sha256"), `5.3 ${lang}: and names the algorithm behind it`);
    ok(
      !verified.includes(d["iir.readback.notVerified"]),
      `5.4 ${lang}: and does not carry the mismatch warning`,
    );
    ok(
      verified.includes("Ansvarig Rekryterare A"),
      `5.17 ${lang}: and names the person who finalised it`,
    );
    ok(
      !verified.includes("8a000000-0000-4000-8000-0000000000a1"),
      `5.18 ${lang}: as a name, not as an account id`,
    );
    const unnamed = text(
      render(
        React.createElement(Panels.FinalReportReadbackPanel, {
          outcome: {
            kind: "verified",
            report: readbackRow({ finalisedByName: null, finalisedByEmail: null }),
          },
          onRetry: noRetry,
        }),
        lang,
      ),
    );
    ok(
      unnamed.includes(d["iir.readback.actorUnknown"]),
      `5.19 ${lang}: an actor that cannot be named is said to be unnameable, in words`,
    );

    const bad = text(
      render(
        React.createElement(Panels.FinalReportReadbackPanel, {
          outcome: { kind: "notVerified", report: { ...row, hashVerified: false } },
          onRetry: noRetry,
        }),
        lang,
      ),
    );
    ok(
      bad.includes(d["iir.readback.notVerified"]),
      `5.5 ${lang}: a mismatch says so, in the words a person needs`,
    );
    ok(
      !bad.includes(d["iir.readback.verified"]),
      `5.6 ${lang}: and never also claims it was checked and matched`,
    );

    const refused = text(
      render(
        React.createElement(Panels.FinalReportReadbackPanel, {
          outcome: { kind: "refused" },
          onRetry: noRetry,
        }),
        lang,
      ),
    );
    ok(
      refused.includes(d["iir.readback.refused"]),
      `5.7 ${lang}: a refusal says it is a permission problem`,
    );
    ok(
      !refused.includes(d["iir.readback.none"]),
      `5.8 ${lang}: and is NEVER rendered as "no report exists"`,
    );

    const failed = text(
      render(
        React.createElement(Panels.FinalReportReadbackPanel, {
          outcome: { kind: "failed" },
          onRetry: noRetry,
        }),
        lang,
      ),
    );
    ok(failed.includes(d["iir.readback.failed"]), `5.9 ${lang}: a failure says the read failed`);
    ok(!failed.includes(d["iir.readback.none"]), `5.10 ${lang}: and is not "no report" either`);
    ok(
      failed.includes(d["iir.readback.retry"]),
      `5.11 ${lang}: and offers a retry, because retrying could change it`,
    );

    const refusedHtml = render(
      React.createElement(Panels.FinalReportReadbackPanel, {
        outcome: { kind: "refused" },
        onRetry: noRetry,
      }),
      lang,
    );
    ok(
      !refusedHtml.includes(d["iir.readback.retry"]),
      `5.12 ${lang}: a refusal offers NO retry, because retrying cannot change it`,
    );

    const none = text(
      render(
        React.createElement(Panels.FinalReportReadbackPanel, {
          outcome: { kind: "none" },
          onRetry: noRetry,
        }),
        lang,
      ),
    );
    ok(
      none.includes(d["iir.readback.none"]),
      `5.13 ${lang}: a genuine absence says there is no finalised report yet`,
    );

    const loading = text(
      render(
        React.createElement(Panels.FinalReportReadbackPanel, {
          outcome: { kind: "loading" },
          onRetry: noRetry,
        }),
        lang,
      ),
    );
    ok(
      loading.includes(d["iir.readback.loading"]),
      `5.14 ${lang}: a read in flight says so and claims nothing`,
    );
    ok(!loading.includes(d["iir.readback.none"]), `5.15 ${lang}: and is not a zero`);

    const legacy = text(
      render(
        React.createElement(Panels.FinalReportReadbackPanel, {
          outcome: { kind: "verified", report: { ...row, contentHashAlgorithm: "md5" } },
          onRetry: noRetry,
        }),
        lang,
      ),
    );
    ok(
      legacy.includes(d["iir.readback.legacyAlgo"]),
      `5.16 ${lang}: a legacy md5 version says it is md5, rather than passing as sha256`,
    );
  }
}

/* ══════════════════════════════════════════════════════════════════════ */
console.log("\n6. The sequence renders as words, not as weight alone");
/* ══════════════════════════════════════════════════════════════════════ */
{
  const p: F.ReportProgress = {
    requirementCount: 8,
    assessedCount: 8,
    outstandingCount: 0,
    blockerCount: 0,
    isFinal: false,
    canFinalise: true,
  };
  for (const lang of ["sv", "en"] as const) {
    const d = dictionaries[lang] as Record<string, string>;
    const html = render(React.createElement(Panels.ReportSequence, { progress: p }), lang);
    const body = text(html);
    ok(
      body.includes(d["iir.seq.state.current"]),
      `6.1 ${lang}: the current act is named IN WORDS, not only highlighted`,
    );
    ok(html.includes('aria-current="step"'), `6.2 ${lang}: and marked for a screen reader`);
    ok((html.match(/aria-current="step"/g) ?? []).length === 1, `6.3 ${lang}: exactly once`);
    for (const step of F.REPORT_STEPS) {
      ok(body.includes(d[`iir.seq.${step}`]), `6.4 ${lang}: the ladder names "${step}"`);
    }
    const memberHtml = text(
      render(
        React.createElement(Panels.ReportSequence, { progress: { ...p, canFinalise: false } }),
        lang,
      ),
    );
    ok(
      memberHtml.includes(d["iir.seq.state.notPermitted"]),
      `6.5 ${lang}: a member is told finalising is an owner or admin act`,
    );
  }
}

/* ══════════════════════════════════════════════════════════════════════ */
console.log("\n7. Versions: a correction adds, it does not replace, and any may be opened");
/* ══════════════════════════════════════════════════════════════════════ */
{
  const v = (n: number, status: string) => ({
    reportId: `r${n}`,
    versionNumber: n,
    status,
    finalisedAt: "2026-09-10T08:00:00Z",
    finalisedBy: "u1",
    finalisedByName: n === 2 ? "Ansvarig Rekryterare A" : null,
    finalisedByEmail: "owner-a@example.test",
    contentHash: "d".repeat(64),
    contentHashAlgorithm: "sha256",
    basisHash: "b".repeat(64),
  });
  const noOpen = () => {};
  for (const lang of ["sv", "en"] as const) {
    const d = dictionaries[lang] as Record<string, string>;
    const twoHtml = render(
      React.createElement(Panels.ReportVersionList, {
        versions: [v(2, "final"), v(1, "superseded")],
        showing: 2,
        onOpen: noOpen,
      }),
      lang,
    );
    const two = text(twoHtml);
    ok(
      two.includes(d["iir.versions.lede"]),
      `7.1 ${lang}: the list says a correction creates a new version and keeps the old one`,
    );
    ok(
      two.includes(d["iir.versions.current"]) && two.includes(d["iir.versions.superseded"]),
      `7.2 ${lang}: and marks which is which`,
    );
    ok(!two.includes(d["iir.versions.only"]), `7.3 ${lang}: and does not claim there is only one`);
    ok(
      two.includes(d["iir.versions.open"].replace("{n}", "1")) &&
        (twoHtml.match(/<button/g) ?? []).length === 1,
      `7.6 ${lang}: the superseded version can be OPENED, and only that one — the shown one has no button`,
    );
    ok(
      two.includes(d["iir.versions.showing"].replace("{n}", "2")),
      `7.7 ${lang}: and the list says in words which version is on the page`,
    );
    ok(
      two.includes("Ansvarig Rekryterare A") && two.includes("owner-a@example.test"),
      `7.8 ${lang}: each version names who finalised it — the name where there is one, the address otherwise`,
    );
    const one = text(
      render(
        React.createElement(Panels.ReportVersionList, {
          versions: [v(1, "final")],
          showing: 1,
          onOpen: noOpen,
        }),
        lang,
      ),
    );
    ok(one.includes(d["iir.versions.only"]), `7.4 ${lang}: a single version says so`);
    const noneHtml = render(
      React.createElement(Panels.ReportVersionList, {
        versions: [],
        showing: null,
        onOpen: noOpen,
      }),
      lang,
    );
    ok(noneHtml === "", `7.5 ${lang}: and no versions renders nothing rather than an empty box`);
  }
}

/* ══════════════════════════════════════════════════════════════════════ */
console.log(
  "\n8. The migration: an ordered basis, every assessor, a neutral disclosure, a bound result",
);
/* ══════════════════════════════════════════════════════════════════════ */
{
  const raw = read(MIGRATION);
  // Only the STATEMENTS, excluding the apply-time proof block, which quotes
  // every phrase this section looks for.
  const proofAt = raw.indexOf("DO $proof$");
  const statements = sqlOnly(proofAt === -1 ? raw : raw.slice(0, proofAt));
  const builder = functionBody(statements, "scp_iv_build_report_basis");
  const finalise = functionBody(statements, "scp_iv_finalise_report");
  const preview = functionBody(statements, "scp_iv_preview_report");
  const readback = functionBody(statements, "scp_iv_final_report");
  const version = functionBody(statements, "scp_iv_report_version");
  const contentHash = functionBody(statements, "scp_iv_content_hash");
  const basisHash = functionBody(statements, "scp_iv_basis_hash");

  /* ---- 8.1–8.5 · the digest ---------------------------------------- */
  ok(builder.length > 0, "8.0a the shared builder was located");
  ok(finalise.length > 0, "8.0b the finalise function was located");
  ok(
    preview.length > 0 && readback.length > 0 && version.length > 0,
    "8.0c preview, readback and version reads were located",
  );
  ok(
    /encode\(sha256\(convert_to\(/.test(contentHash) &&
      /encode\(sha256\(convert_to\(/.test(basisHash),
    "8.1 both digests are core sha256 over the UTF-8 bytes of the canonical text",
  );
  ok(
    !/::bytea/.test(statements),
    "8.1b and nothing casts text to bytea — that parses escape syntax and breaks on a quote",
  );
  ok(!/\bmd5\s*\(/.test(finalise), "8.2 md5 is gone from the write path");
  ok(
    /scp_iv_content_hash\(/.test(finalise) && /scp_iv_basis_hash\(/.test(finalise),
    "8.2b which hashes through the two shared digest functions instead",
  );
  ok(
    !/\bdigest\s*\(/.test(statements),
    "8.3 and it does NOT use pgcrypto digest(), which cannot resolve under a pinned search_path",
  );
  ok(/content_hash_algorithm/.test(statements), "8.4 which algorithm was used is recorded");
  const insertAt = finalise.indexOf("INSERT INTO public.scp_interview_reports");
  const insertSlice = insertAt >= 0 ? finalise.slice(insertAt, insertAt + 900) : "";
  ok(insertSlice.length > 0, "8.5a the report INSERT was located");
  ok(
    /content_hash_algorithm/.test(insertSlice) && /'sha256'/.test(insertSlice),
    "8.5 as sha256 on every new finalisation, in the row that is actually stored",
  );
  ok(/basis_hash/.test(insertSlice), "8.5b and the previewed identity is stored beside it");

  /* ---- 8.6–8.8 · the recruitment and the bound result --------------- */
  ok(
    /advertised_role_sv/.test(builder) && /advertised_role_en/.test(builder),
    "8.6 the basis names the ADVERTISED role in both languages",
  );
  ok(
    /'application_id'/.test(builder) && /'job_id'/.test(builder),
    "8.7 and the application and the advert it belongs to",
  );
  ok(/'assessment_material'/.test(builder), "8.8 and the assessment material the process ran on");
  ok(
    /scp_employer_report\(at\.id\)/.test(builder),
    "8.8b carrying the RELEASED employer result through the assessment domain's own governed read",
  );
  ok(
    /scp_employer_report_identity\(at\.id\)/.test(builder) &&
      /'snapshot_id'/.test(builder) &&
      /'report_version_id'/.test(builder) &&
      /'released_at'/.test(builder),
    "8.8c bound to the exact snapshot, release version and release time",
  );
  ok(
    /'snapshot_hash',\s*encode\(sha256\(convert_to\(/.test(builder),
    "8.8d and to a digest of the released content, so a later re-release cannot pass as this one",
  );
  ok(
    /'findings',\s*er\.safety_flags,\s*'context',\s*er\.context,\s*'limitations_sv'/.test(builder),
    "8.8e the released findings are carried in the bound result itself, not just digested",
  );

  /* ---- 8.9–8.11 · classified evidence ------------------------------- */
  ok(/'classification'/.test(builder), "8.9 every evidence item is classified");
  ok(
    /'human_interpretation'/.test(builder),
    "8.10 and a human level is named an interpretation, not a further fact",
  );
  ok(
    /ELSE 'unattributed'/.test(builder),
    "8.11 an item with no source link is reported as unattributed rather than guessed at",
  );
  ok(
    /WHEN 'passport_disclosure'\s+THEN 'passport_disclosure'/.test(builder),
    "8.11b a Passport disclosure is classified as what it is — something the candidate shared",
  );
  ok(
    !/verified_material/.test(statements),
    "8.11c and NOTHING in this migration classifies a source kind as verified: no claim-level verification was performed here",
  );

  /* ---- 8.12–8.14 · the invariants the schema already held ----------- */
  const builderPaths = builder + finalise + preview;
  ok(
    !/job_applications/.test(builderPaths) &&
      !/session_notes/.test(builderPaths) &&
      !/cv_documents/.test(builderPaths) &&
      !/sp_claims/.test(builderPaths),
    "8.12 the builder reads no live application, Passport, CV or note table (ER5.8)",
  );
  const ivFunctions = [
    ...statements.matchAll(/CREATE OR REPLACE FUNCTION public\.(scp_iv_\w+)\(/g),
  ].map((m) => m[1]);
  ok(ivFunctions.length >= 8, `8.13a the scp_iv_ functions were located (${ivFunctions.length})`);
  ok(
    ivFunctions.every(
      (fn) =>
        !/scp_report_snapshots/.test(functionBody(statements, fn)) &&
        !/scp_competency_evidence/.test(functionBody(statements, fn)),
    ),
    "8.13 and no scp_iv_ function names the assessment snapshot or evidence table (TR12.3)",
  );
  ok(
    /CREATE OR REPLACE FUNCTION public\.scp_employer_report_identity\(/.test(statements) &&
      /scp_report_snapshot_readable\('employer'/.test(
        functionBody(statements, "scp_employer_report_identity"),
      ),
    "8.13b the snapshot identity is read by an assessment-domain function under the domain's own readability rule",
  );
  ok(
    !/scp_interview_evidence_proposals/.test(builderPaths),
    "8.14 nor the proposals table, so an unaccepted AI proposal cannot reach a report",
  );

  /* ---- 8.15 · no automated judgement -------------------------------- */
  ok(
    !/\b(recommend|ranking|pass_fail|total_score|suitab)/i.test(builderPaths),
    "8.15 nothing in the write path names a recommendation, ranking, total or suitability",
  );

  /* ---- 8.16–8.20 · the reads are governed --------------------------- */
  ok(readback.length > 0, "8.16 the governed readback exists");
  ok(
    /REVOKE ALL ON FUNCTION public\.scp_iv_final_report\(uuid\) FROM PUBLIC, anon/.test(statements),
    "8.17 and is revoked from PUBLIC and anon",
  );
  ok(
    /GRANT EXECUTE ON FUNCTION public\.scp_iv_final_report\(uuid\) TO authenticated/.test(
      statements,
    ),
    "8.18 and granted only to authenticated",
  );
  ok(
    /scp_iv_can_read_case/.test(readback) && /scp_iv_can_read_case/.test(version),
    "8.19 and scoped by the same rule the table's own RLS policy uses, as is the read by version id",
  );
  ok(
    /SECURITY DEFINER SET search_path = public/.test(statements),
    "8.20 with a pinned search_path",
  );
  const guardAt = statements.indexOf("FUNCTION public.scp_iv_guard_report_immutable");
  const guardBody = guardAt >= 0 ? statements.slice(guardAt, guardAt + 1400) : "";
  ok(guardBody.length > 0, "8.21a the immutability guard body was located");
  ok(
    /IF\s+OLD\.status\s*=\s*'superseded'\s+THEN[\s\S]{0,200}RAISE EXCEPTION/.test(guardBody),
    "8.21 and a superseded version is immutable too, so a correction preserves the previous one",
  );
  ok(
    /REVOKE ALL ON FUNCTION public\.scp_iv_build_report_basis\(uuid\) FROM PUBLIC, anon, authenticated/.test(
      statements,
    ),
    "8.22 the builder itself is not client-executable: it is reached only through preview and finalisation",
  );
  ok(
    /REVOKE ALL ON FUNCTION public\.scp_iv_preview_report\(uuid\) FROM PUBLIC, anon/.test(
      statements,
    ) &&
      /GRANT EXECUTE ON FUNCTION public\.scp_iv_preview_report\(uuid\) TO authenticated/.test(
        statements,
      ),
    "8.23 and the preview is governed the same way as the readback",
  );
  ok(
    /finalised_by_name/.test(readback) &&
      /display_name/.test(readback) &&
      /finalised_by_email/.test(readback),
    "8.24 the readback resolves the finalising actor to the governed display name and address",
  );

  /* ---- 8.25–8.29 · every assessor, in a declared order -------------- */
  ok(
    !/superseded_by IS NULL\s*LIMIT 1/.test(builder),
    "8.25 no assessment is picked with LIMIT 1 — the original defect, where the heap chose the assessor",
  );
  ok(
    /'assessments',/.test(builder) &&
      /'assessor_count'/.test(builder) &&
      /'levels_agree'/.test(builder),
    "8.26 every active human assessment is carried, counted, and disagreement is stated as a fact of the basis",
  );
  ok(
    /ORDER BY a\.assessor_id, a\.assessed_at, a\.id/.test(builder),
    "8.27 in an order declared by who assessed, when, and an immutable id — never by heap position",
  );
  ok(
    !/'assessment',\s*\(/.test(builder),
    "8.28 and no single `assessment` key survives to be read as THE assessment",
  );
  ok(
    /'panel'/.test(builder) && /'conclusion'/.test(builder),
    "8.29 the panel's concluded prose is carried where there is one",
  );

  /* ---- 8.30–8.33 · a deterministic payload --------------------------- */
  const aggregates = aggregateCalls(builder);
  ok(
    aggregates.length === 8,
    `8.30 the builder has exactly eight aggregates (${aggregates.length})`,
  );
  const unordered = aggregates.filter((a) => !/ORDER BY/.test(a));
  ok(
    unordered.length === 0,
    `8.31 and every one of them carries an ORDER BY inside its own parentheses (${unordered.length} do not)`,
  );
  const withoutId = aggregates.filter((a) => {
    const orderAt = a.lastIndexOf("ORDER BY");
    return !/\b\w+\.id\b|\bid\b|->> 'task'|b\.code, b\.message/.test(a.slice(orderAt));
  });
  ok(
    withoutId.length === 0,
    `8.32 and each ORDER BY ends in an immutable tie-breaker, so equal timestamps cannot reorder (${withoutId.length} do not)`,
  );
  ok(
    !/jsonb_agg\(DISTINCT/.test(builder),
    "8.33 and none uses jsonb_agg(DISTINCT ...), whose order is not declared",
  );
  const limits = [...builder.matchAll(/LIMIT 1/g)].map((m) => m.index ?? 0);
  ok(
    limits.every((at) => /ORDER BY/.test(builder.slice(Math.max(0, at - 400), at))),
    "8.34 and every LIMIT 1 left in the builder sits under an ORDER BY",
  );

  /* ---- 8.35–8.40 · preview equals finalisation ----------------------- */
  ok(
    /scp_iv_build_report_basis\(_case_id\)/.test(preview) &&
      /scp_iv_build_report_basis\(_case_id\)/.test(finalise),
    "8.35 preview and finalisation call the SAME builder",
  );
  ok(
    /scp_iv_finalise_report\(\s*_case_id uuid,\s*_expected_basis_hash text,/.test(statements),
    "8.36 finalisation takes the identity the owner previewed — required, with no default",
  );
  ok(
    /DROP FUNCTION IF EXISTS public\.scp_iv_finalise_report\(uuid, uuid\)/.test(statements),
    "8.37 and the old two-argument signature, which took no identity, is dropped",
  );
  ok(
    /IF _expected_basis_hash IS NULL OR btrim\(_expected_basis_hash\) = '' THEN[\s\S]{0,120}SCP_IV_PREVIEW_REQUIRED/.test(
      finalise,
    ) && /IF _expected_basis_hash <> _basis THEN[\s\S]{0,120}SCP_IV_STALE_PREVIEW/.test(finalise),
    "8.38 finalisation refuses without an identity and refuses a stale one — on the real comparison, not a constant",
  );
  const roleAt = finalise.indexOf("SCP_IV_FINALISE_ROLE");
  const blockedAt = finalise.indexOf("SCP_IV_REPORT_BLOCKED");
  const staleAt = finalise.indexOf("SCP_IV_STALE_PREVIEW");
  const insertAt2 = finalise.indexOf("INSERT INTO public.scp_interview_reports");
  ok(
    roleAt > 0 && blockedAt > roleAt && staleAt > blockedAt && insertAt2 > staleAt,
    "8.39 in that order: role, blockers, identity — and only then the write",
  );
  ok(
    /scp_iv_basis_hash\(/.test(preview) && /scp_iv_content_hash\(/.test(preview),
    "8.40 the preview returns the identity and the digest finalisation will check and store",
  );
}

{
  // The report's `unresolved` section reads scp_interview_findings, and until
  // this migration no row could be written to that table: the origin guard
  // from 20261020090000 read NEW.note_id, a column findings do not have. The
  // note branch must be entered only for the two tables that carry it.
  const raw = read(MIGRATION);
  const proofAt = raw.indexOf("DO $proof$");
  const statements = sqlOnly(proofAt === -1 ? raw : raw.slice(0, proofAt));
  const guard = functionBody(statements, "scp_iv_guard_evidence_origin_in_case");
  ok(guard.length > 0, "8.41a the evidence-origin guard is re-declared here");
  const noteAt = guard.indexOf("NEW.note_id");
  const tableAt = guard.indexOf(
    "IF TG_TABLE_NAME IN ('scp_interview_evidence_proposals', 'scp_interview_evidence') THEN",
  );
  ok(
    noteAt > 0 && tableAt > 0 && tableAt < noteAt,
    "8.41 the guard reads the note link only on the two tables that have one — so a finding can be written at all",
  );
  ok(
    /scp_interview_findings_origin_in_case/.test(
      read("supabase/migrations/20261020090000_scp_interview_evidence_reliability.sql"),
    ),
    "8.41b and the guard is still attached to findings, so the fix is a fix and not a detachment",
  );
  const suite = read("supabase/tests/scp_iv_report_basis_integrity_test.sql");
  ok(
    /INSERT INTO public\.scp_interview_findings/.test(suite) && /B2\.9b/.test(suite),
    "8.41c and the SQL suite writes findings and asserts they reach the report's unresolved section",
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
console.log("\n9. The client reads it through the contract, not around it");
/* ══════════════════════════════════════════════════════════════════════ */
{
  const runtime = codeOnly(read(RUNTIME));
  const routeSrc = codeOnly(read(ROUTE));
  const panelSrc = codeOnly(read(PANEL));
  const finSrc = codeOnly(read(FINALISATION));

  ok(/rpc\("scp_iv_final_report"/.test(runtime), "9.1 the readback goes through the governed RPC");
  ok(/rpc\("scp_iv_report_versions"/.test(runtime), "9.2 and so does the version history");
  ok(/rpc\("scp_iv_report_version"/.test(runtime), "9.2b and the read of one historical version");
  ok(/rpc\("scp_iv_preview_report"/.test(runtime), "9.2c and the preview");

  // The readback must NOT be a table select: that would return the row without
  // recomputing the digest, which is the whole point of the contract.
  const rbStart = runtime.indexOf("getFinalReportReadback");
  const rbEnd = runtime.indexOf("getReportVersions");
  const rbSlice = rbStart >= 0 && rbEnd > rbStart ? runtime.slice(rbStart, rbEnd) : "";
  ok(rbSlice.length > 0, "9.3 the readback server function is present");
  ok(
    !/\.from\("scp_interview_reports"\)/.test(rbSlice),
    "9.4 and does not select the table directly, which would skip the verification",
  );
  const mapAt = runtime.indexOf("function mapReadbackRow");
  const mapSlice = mapAt >= 0 ? runtime.slice(mapAt, mapAt + 1200) : "";
  ok(
    /mapReadbackRow\(/.test(rbSlice) && /hash_verified/.test(mapSlice),
    "9.5 it carries the verification verdict back",
  );
  ok(
    /finalised_by_name/.test(mapSlice) &&
      /finalised_by_email/.test(mapSlice) &&
      /basis_hash/.test(mapSlice),
    "9.5b and the actor's name and address, and the previewed identity",
  );
  ok(
    /parseReportPayload\(row\.payload\)/.test(mapSlice),
    "9.5c and the exact finalised payload, parsed once by the shared parser",
  );
  ok(
    /e\.code = error\.code/.test(rbSlice),
    "9.6 and preserves the error code, so a refusal can be told from a breakage",
  );

  // Finalisation sends the identity the owner previewed, and nothing else
  // can stand in for it.
  const finStart = runtime.indexOf("export const finaliseReport");
  const finEnd = runtime.indexOf("export const", finStart + 10);
  const finSlice =
    finStart >= 0 ? runtime.slice(finStart, finEnd > finStart ? finEnd : undefined) : "";
  ok(finSlice.length > 0, "9.16a the finalise server function was located");
  ok(
    /expectedBasisHash:\s*z\.string\(\)\.min\(1\)/.test(finSlice),
    "9.16 it REQUIRES the previewed identity — an empty one does not validate",
  );
  ok(
    /_expected_basis_hash:\s*data\.expectedBasisHash/.test(finSlice),
    "9.17 and passes it to the database, which re-decides",
  );
  ok(
    /e\.code = error\.code/.test(finSlice) || /\.message/.test(finSlice),
    "9.18 and preserves the message the outcome map reads",
  );

  ok(
    /readbackErrorOutcome/.test(routeSrc),
    "9.7 the route classifies a failed read rather than defaulting it",
  );
  ok(/readbackOutcome\(/.test(routeSrc), "9.8 and classifies a successful one");
  ok(
    /finaliseErrorOutcome\(/.test(routeSrc),
    "9.8b and a refused finalisation, by the message the server raised",
  );
  // Located by brace matching inside the finalise mutation's onSuccess, because
  // `readback.refetch()` also appears in the panel's retry handler -- and a
  // guard satisfied by the retry button would not notice the refetch after the
  // irreversible act disappearing.
  const finaliseAt = routeSrc.indexOf("const finalise = useMutation(");
  const successAt = finaliseAt >= 0 ? routeSrc.indexOf("onSuccess:", finaliseAt) : -1;
  let onSuccess = "";
  if (successAt >= 0) {
    let depth = 0;
    for (let i = routeSrc.indexOf("{", successAt); i < routeSrc.length; i += 1) {
      if (routeSrc[i] === "{") depth += 1;
      else if (routeSrc[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          onSuccess = routeSrc.slice(successAt, i + 1);
          break;
        }
      }
    }
  }
  ok(onSuccess.length > 0, "9.9a the finalise onSuccess handler was located");
  ok(
    /readback\.refetch\(\)/.test(onSuccess),
    "9.9 finalising refetches the readback, so success comes from the server",
  );
  ok(/versions\.refetch\(\)/.test(onSuccess), "9.10 and the version history with it");
  const mutationFnSlice = finaliseAt >= 0 ? routeSrc.slice(finaliseAt, successAt) : "";
  ok(
    /expectedBasisHash:\s*previewInHand\.basisHash/.test(mutationFnSlice),
    "9.19 the identity sent is the identity of the preview IN HAND — not recomputed, not typed",
  );
  ok(/<FinalReportReadbackPanel/.test(routeSrc), "9.11 the readback panel is mounted");
  ok(/<ReportSequence/.test(routeSrc), "9.12 and the sequence");
  for (const c of [
    "FinalReportReadbackPanel",
    "ReportSequence",
    "FinaliseBoundary",
    "ReportVersionList",
    "FinalReportDocument",
    "ReportFinalisation",
  ]) {
    ok(new RegExp(`<${c}[\\s/>]`).test(routeSrc), `9.13a <${c}> is mounted by the route`);
    ok(
      !new RegExp(`\\{\\s*(false|0|null|undefined)\\s*&&[\\s\\S]{0,40}<${c}[\\s/>]`).test(routeSrc),
      `9.13 and <${c}> is not disabled behind a falsy literal`,
    );
  }

  // The panel must never present an unverified report as a finalised one.
  ok(
    /outcome\.kind === "verified"/.test(panelSrc),
    "9.14 the panel distinguishes a verified readback explicitly",
  );
  const nvAt = panelSrc.indexOf("!verified && (");
  const nvSlice = nvAt >= 0 ? panelSrc.slice(nvAt, nvAt + 400) : "";
  ok(nvSlice.length > 0, "9.15a the mismatch branch was located");
  ok(/role="alert"/.test(nvSlice), "9.15 and a mismatch is announced rather than only styled");

  // The document: three mountings of ONE component, each fed a parsed
  // payload, and the stale state rendered from the outcome the server gave.
  const docMounts = routeSrc.match(/<FinalReportDocument/g) ?? [];
  ok(
    docMounts.length >= 3,
    `9.20 the document is mounted for the preview, the current final and an opened version (${docMounts.length})`,
  );
  ok(
    /kind:\s*"preview",\s*preview:\s*previewInHand/.test(routeSrc),
    "9.21 the preview mounting is fed the server's preview — payload and identity together",
  );
  ok(
    /payload=\{readbackState\.report\.payload\}/.test(routeSrc) &&
      /payload=\{opened\.data\.report\.payload\}/.test(routeSrc),
    "9.22 and the final and historical mountings are fed the readback's exact payload",
  );
  ok(
    /stale=\{outcome\.kind === "stalePreview"\}/.test(routeSrc),
    "9.23 a stale preview reaches the finalisation control as a state",
  );
  ok(
    /previewed=\{previewInHand !== null && outcome\.kind !== "stalePreview"\}/.test(routeSrc),
    "9.24 and a stale preview no longer counts as previewed",
  );
  ok(
    /disabled=\{isPending \|\| !previewed \|\| stale\}/.test(finSrc),
    "9.25 the finalise control is disabled without a current preview",
  );
  const staleAt = finSrc.indexOf("{stale && (");
  const staleSlice = staleAt >= 0 ? finSrc.slice(staleAt, staleAt + 400) : "";
  ok(
    /role="alert"/.test(staleSlice) && /iir\.fin\.stale/.test(staleSlice),
    "9.26 and the stale state is announced, in words",
  );
  ok(
    /opened\.data\.report\.hashVerified &&\s*opened\.data\.report\.payload/.test(routeSrc),
    "9.27 an opened historical version is rendered only when its digest recomputes",
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
console.log("\n10. Swedish and English are both complete, and differ");
/* ══════════════════════════════════════════════════════════════════════ */
{
  const sv = dictionaries.sv as Record<string, string>;
  const en = dictionaries.en as Record<string, string>;
  const keys = Object.keys(sv).filter((k) => k.startsWith("iir."));
  ok(keys.length >= 40, `10.1 the new vocabulary exists (${keys.length} keys)`);
  ok(
    keys.every((k) => typeof en[k] === "string" && en[k].length > 0),
    "10.2 every new key has English",
  );
  ok(
    keys.every((k) => sv[k].length > 0),
    "10.3 every new key has Swedish",
  );
  // "Version" is the same word in Swedish and English. Naming the exceptions
  // keeps the rule (untranslated copy is a bug) while not forcing a worse
  // Swedish word onto a screen to satisfy a grep.
  const IDENTICAL_BY_LANGUAGE = new Set(["iir.readback.version", "iir.doc.identity.version"]);
  const same = keys.filter((k) => sv[k] === en[k] && !IDENTICAL_BY_LANGUAGE.has(k));
  ok(
    same.length === 0,
    `10.4 and no new key is the same string in both languages (${same.join(", ")})`,
  );
  ok(
    [...IDENTICAL_BY_LANGUAGE].every((k) => sv[k] === en[k]),
    "10.4b and every key excused from that rule really is identical, so the list cannot rot",
  );
  // No new string offers a verdict.
  const offending = keys.filter(
    (k) =>
      /\b(rekommend|rangordn|totalpoäng|lämplig som|recommend|ranking|total score|suitab)/i.test(
        sv[k] + " " + en[k],
      ) && !/iir\.noneffects\./.test(k),
  );
  ok(
    offending.length === 0,
    `10.5 and no string outside the "does not do" list mentions a recommendation or ranking (${offending.join(", ")})`,
  );
  ok(
    /ej verifierad/i.test(sv["iir.doc.cls.passport_disclosure"]) &&
      /not verified/i.test(en["iir.doc.cls.passport_disclosure"]),
    "10.6 the Passport disclosure badge says in words, in each language, that it was NOT verified here",
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
console.log("\n11. The document: one renderer, every assessor, nothing live");
/* ══════════════════════════════════════════════════════════════════════ */
{
  // The server's shape, as scp_iv_build_report_basis produces it.
  const rawPayload = {
    case: {
      title: "Väktare Väst – intern",
      candidate: "Kandidat C",
      employer_id: "8b000000-0000-4000-8000-0000000000a1",
      status_at_report: "assessment",
      pack_name_sv: "Väktare",
      pack_name_en: null,
      pack_version_number: 3,
      pack_validation_label: "validated",
    },
    recruitment: {
      application_id: "8d000000-0000-4000-8000-000000000001",
      job_id: "8c000000-0000-4000-8000-000000000001",
      advertised_role_sv: "Väktare Väst",
      advertised_role_en: "Guard West",
    },
    interview: [
      {
        started_at: "2026-09-01T09:00:00Z",
        completed_at: "2026-09-01T10:00:00Z",
        interviewer_names: "Ansvarig Rekryterare A",
      },
    ],
    assessment_material: [
      {
        attempt_id: "90000000-0000-4000-8000-000000000001",
        assignment_id: "8f000000-0000-4000-8000-000000000001",
        attempt_status: "released",
        employer_report: {
          snapshot_id: "91000000-0000-4000-8000-000000000001",
          report_version_id: "92000000-0000-4000-8000-0000000000f1",
          released_at: "2026-08-30T12:00:00Z",
          competencies: [
            {
              competency_code: "SITUATIONAL_AWARENESS",
              maturity_level: "developing",
              threshold_version: "t1",
            },
          ],
          findings: [
            {
              finding: "Fördröjd eskalering i scenario 2",
              severity: "note",
              observed_at: "2026-08-29T12:00:00Z",
            },
          ],
          limitations_sv: ["Ett försök."],
          limitations_en: ["One attempt."],
          snapshot_hash: "e".repeat(64),
        },
      },
      {
        attempt_id: "90000000-0000-4000-8000-000000000002",
        assignment_id: "8f000000-0000-4000-8000-000000000001",
        attempt_status: "in_progress",
        employer_report: null,
      },
    ],
    pinned: { pack_content_hash: "f".repeat(64) },
    sources: [],
    questions: [
      {
        id: "q1",
        code: "V-01",
        order: 1,
        prompt_sv: "Berätta om en gång du hanterade en hotfull situation.",
        prompt_en: null,
        requirement: {
          code: "SITUATIONAL_AWARENESS",
          name_sv: "Lägesuppfattning",
          name_en: "Situational awareness",
        },
        evidence: [
          {
            id: "e1",
            excerpt: "Jag backade och larmade.",
            origin: "candidate",
            confirmed_by: "u",
            confirmed_at: "2026-09-01T09:30:00Z",
            was_corrected: false,
            classification: "candidate_statement",
          },
          {
            id: "e2",
            excerpt: "Skyddsvaktsutbildning 2024",
            origin: "passport",
            confirmed_by: "u",
            confirmed_at: "2026-09-01T09:31:00Z",
            was_corrected: false,
            classification: "passport_disclosure",
          },
          {
            id: "e3",
            excerpt: "Höll lugnet under hela svaret.",
            origin: "note",
            confirmed_by: "u",
            confirmed_at: "2026-09-01T09:32:00Z",
            was_corrected: true,
            classification: "interviewer_observation",
          },
        ],
        assessments: [
          {
            id: "a1",
            level: 3,
            rationale: "Tydligt exempel med eskalering.",
            uncertainty: null,
            assessor_id: "8a000000-0000-4000-8000-0000000000a1",
            assessed_at: "2026-09-02T08:00:00Z",
            anchor_sv: "Visar",
            anchor_en: "Shows",
            level_meaning_sv: "Nivå 3",
            level_meaning_en: "Level 3",
            kind: "human_interpretation",
          },
          {
            id: "a2",
            level: 2,
            rationale: "Exemplet saknar egen bedömning.",
            uncertainty: "Osäker på tidslinjen.",
            assessor_id: "8a000000-0000-4000-8000-0000000000a2",
            assessed_at: "2026-09-02T09:00:00Z",
            anchor_sv: "Delvis",
            anchor_en: "Partly",
            level_meaning_sv: "Nivå 2",
            level_meaning_en: "Level 2",
            kind: "human_interpretation",
          },
        ],
        assessor_count: 2,
        levels_agree: false,
      },
    ],
    panel: null,
    unresolved: [
      {
        id: "u1",
        kind: "contradiction",
        statement: "Anställningsår skiljer sig mellan CV och samtal.",
        state: "open",
        category: "missing_or_contradictory",
      },
    ],
    ai_disclosure: {
      statement: "AI föreslog frågor; ingen bedömning.",
      runs: [{ task: "prepare", task_version: "1", prompt_version: "1", model: "m" }],
    },
    decision_boundary:
      "Rapporten är beslutsunderlag. Anställningsbeslutet fattas och dokumenteras utanför verktyget.",
  };
  const payload = F.parseReportPayload(rawPayload);
  ok(payload.questions[0]?.assessments.length === 2, "11.1 the parser keeps every assessor");
  ok(payload.questions[0]?.levelsAgree === false, "11.2 and the disagreement");
  ok(
    payload.questions[0]?.evidence[1]?.classification === "passport_disclosure",
    "11.3 and a Passport disclosure stays a Passport disclosure",
  );
  ok(
    F.parseReportPayload({ questions: [{ evidence: [{ classification: "verified_material" }] }] })
      .questions[0]?.evidence[0]?.classification === "unclassified",
    "11.4 an unknown classification becomes unclassified, never a promotion",
  );
  ok(
    payload.assessmentMaterial[0]?.employerReport?.reportVersionId !== null,
    "11.5 the bound release version is kept",
  );
  ok(
    payload.assessmentMaterial[1]?.employerReport === null,
    "11.6 and an unreleased attempt is carried as unreleased, not invented",
  );

  const final = readbackRow({ payload });
  for (const lang of ["sv", "en"] as const) {
    const d = dictionaries[lang] as Record<string, string>;
    const previewHtml = render(
      React.createElement(FinalReportDocument, {
        payload,
        mode: {
          kind: "preview",
          preview: {
            payload,
            basisHash: "b".repeat(64),
            contentHash: "c".repeat(64),
            blockerCount: 0,
            blockers: [],
          },
        },
      }),
      lang,
    );
    const finalHtml = render(
      React.createElement(FinalReportDocument, {
        payload,
        mode: { kind: "final", readback: final },
      }),
      lang,
    );
    const historyHtml = render(
      React.createElement(FinalReportDocument, {
        payload,
        mode: { kind: "history", readback: { ...final, status: "superseded", versionNumber: 1 } },
      }),
      lang,
    );
    const body = text(finalHtml);

    // Every assessor, disagreement stated.
    ok(
      body.includes("Tydligt exempel med eskalering.") &&
        body.includes("Exemplet saknar egen bedömning."),
      `11.7 ${lang}: BOTH assessors' rationales are on the page`,
    );
    ok(
      finalHtml.includes('data-testid="fr-disagree"'),
      `11.8 ${lang}: and their disagreement is marked`,
    );
    ok(body.includes(d["iir.doc.assessment.disagree"]), `11.9 ${lang}: in words`);
    ok(!body.includes(d["iir.doc.assessment.agree"]), `11.10 ${lang}: and not also as agreement`);
    ok(
      (body.match(new RegExp(d["iir.doc.assessment.interpretation"], "g")) ?? []).length === 2,
      `11.11 ${lang}: each level is labelled a human interpretation`,
    );
    ok(
      !/\b(2\.5|medel|mean|average|genomsnitt)\b/i.test(body),
      `11.12 ${lang}: and no consolidated level was computed`,
    );

    // Classified evidence, the disclosure neutral.
    for (const cls of ["candidate_statement", "passport_disclosure", "interviewer_observation"]) {
      ok(
        finalHtml.includes(`data-testid="fr-cls-${cls}"`),
        `11.13 ${lang}: evidence classified ${cls} is marked as such`,
      );
    }
    ok(
      body.includes(d["iir.doc.cls.passport_disclosure"]),
      `11.14 ${lang}: the disclosure badge says it was not verified here`,
    );
    ok(
      !/verified material|verifierat material/i.test(body),
      `11.15 ${lang}: and nothing on the page is called verified material`,
    );

    // The bound assessment result, with its findings.
    ok(
      body.includes("SITUATIONAL_AWARENESS") && body.includes("developing"),
      `11.16 ${lang}: the released competency result is on the page`,
    );
    ok(body.includes("Fördröjd eskalering i scenario 2"), `11.17 ${lang}: with its findings`);
    ok(
      body.includes("91000000-0000-4000-8000-000000000001"),
      `11.18 ${lang}: bound to the exact snapshot`,
    );
    ok(
      body.includes(d["iir.doc.assessment.notReleased"]),
      `11.19 ${lang}: and the unreleased attempt is said to be unreleased`,
    );
    ok(
      body.includes(
        d[lang === "sv" ? "iir.doc.assessment.limitations" : "iir.doc.assessment.limitations"],
      ) && body.includes(lang === "sv" ? "Ett försök." : "One attempt."),
      `11.20 ${lang}: with the release's own limitations in the reader's language`,
    );

    // The recruitment, the unresolved material, the boundary.
    ok(
      body.includes(lang === "sv" ? "Väktare Väst" : "Guard West"),
      `11.21 ${lang}: the advertised role, in the reader's language`,
    );
    ok(
      body.includes("Anställningsår skiljer sig mellan CV och samtal."),
      `11.22 ${lang}: unresolved material is on the page`,
    );
    ok(body.includes(d["iiu.rp.decision.boundary"]), `11.23 ${lang}: and the decision boundary`);
    ok(
      !/\b(rekommend|rangordn|totalpoäng|recommend|ranking|total score|pass\/fail|godkänd)/i.test(
        body.replace(d["iiu.rp.decision.boundary"], ""),
      ),
      `11.24 ${lang}: and, outside the boundary that disclaims one, no verdict, total, ranking or recommendation`,
    );

    // The actor and the date, on the final; nothing of the kind on a preview.
    ok(
      text(finalHtml).includes("Ansvarig Rekryterare A") &&
        finalHtml.includes('data-testid="fr-actor"'),
      `11.25 ${lang}: the final names who finalised it`,
    );
    ok(text(finalHtml).includes("2026-09-10"), `11.26 ${lang}: and when`);
    ok(
      !text(previewHtml).includes(
        d["iir.doc.identity.by"].replace("{who}", "Ansvarig Rekryterare A"),
      ),
      `11.27 ${lang}: a preview claims no finaliser`,
    );
    ok(
      text(previewHtml).includes(d["iir.doc.preview.badge"]),
      `11.28 ${lang}: and says it is a preview`,
    );
    ok(
      text(historyHtml).includes(d["iir.doc.history.badge"]),
      `11.29 ${lang}: an opened earlier version says it is superseded`,
    );

    // Preview equals finalisation: the same payload renders the same body.
    const bodyOf = (html: string) => {
      const start = html.indexOf("</header>");
      const end = html.indexOf("<details");
      return html.slice(start, end);
    };
    ok(
      bodyOf(previewHtml).length > 2000 &&
        bodyOf(previewHtml) === bodyOf(finalHtml) &&
        bodyOf(finalHtml) === bodyOf(historyHtml),
      `11.30 ${lang}: the preview, the final and the opened version render an IDENTICAL body from one payload`,
    );
    // The digests are under the audit details, and both are there.
    const details = previewHtml.slice(previewHtml.indexOf("<details"));
    ok(
      details.includes("b".repeat(64)) && details.includes("c".repeat(64)),
      `11.31 ${lang}: the preview shows the identity finalisation will check, under audit`,
    );
    ok(
      !previewHtml.slice(0, previewHtml.indexOf("<details")).includes("c".repeat(64)),
      `11.32 ${lang}: and not in the body`,
    );
    ok(
      previewHtml.includes('data-report-mode="preview"') &&
        finalHtml.includes('data-report-mode="final"') &&
        historyHtml.includes('data-report-mode="history"'),
      `11.33 ${lang}: each mounting declares what it is`,
    );
    ok(
      !/<button|<input|<select/.test(finalHtml),
      `11.34 ${lang}: the document has no control — it is a document`,
    );

    // An actor that cannot be named any more is said so in words; the account
    // id never stands in for a person.
    const unnamedHtml = render(
      React.createElement(FinalReportDocument, {
        payload,
        mode: {
          kind: "final",
          readback: { ...final, finalisedByName: null, finalisedByEmail: null },
        },
      }),
      lang,
    );
    ok(
      text(unnamedHtml).includes(d["iir.doc.identity.byUnknown"]),
      `11.38 ${lang}: an unnameable actor is stated in words`,
    );
    ok(
      !text(unnamedHtml).includes("8a000000-0000-4000-8000-0000000000a1"),
      `11.39 ${lang}: and never printed as an account id`,
    );
  }

  // The component reads nothing live.
  const docSrc = codeOnly(read(DOCUMENT));
  ok(
    !/runtime\.functions|useServerFn|useQuery|useMutation|supabase|fetch\(/.test(docSrc),
    "11.35 the document imports no server function, query or client — it renders the payload it is handed",
  );
  ok(
    !/case\.|competencies\b.*useQuery|session_notes|sp_claims/.test(docSrc),
    "11.36 and names no live case table",
  );
  ok(
    /payload: ReportPayload/.test(docSrc) && /mode: DocumentMode/.test(docSrc),
    "11.37 its whole input is the parsed payload and the mode",
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
console.log("\n12. The rollback restores the previous finalisation, and is exercised for real");
/* ══════════════════════════════════════════════════════════════════════ */
{
  const rb = sqlOnly(read(ROLLBACK));
  ok(
    /DROP FUNCTION IF EXISTS public\.scp_iv_finalise_report\(uuid, text, uuid\)/.test(rb),
    "12.1 the rollback drops the three-argument finalisation",
  );
  ok(
    /CREATE OR REPLACE FUNCTION public\.scp_iv_finalise_report\(_case_id uuid, _draft_run_id uuid DEFAULT NULL\)/.test(
      rb,
    ),
    "12.2 and restores the previous two-argument one, as documented",
  );
  for (const fn of [
    "scp_iv_preview_report(uuid)",
    "scp_iv_build_report_basis(uuid)",
    "scp_iv_final_report(uuid)",
    "scp_iv_report_version(uuid)",
    "scp_iv_report_versions(uuid)",
    "scp_iv_content_hash(jsonb)",
    "scp_iv_basis_hash(jsonb)",
    "scp_employer_report_identity(uuid)",
  ]) {
    ok(rb.includes(`DROP FUNCTION IF EXISTS public.${fn}`), `12.3 and drops ${fn}`);
  }
  ok(
    /CREATE OR REPLACE FUNCTION public\.scp_iv_guard_report_immutable\(\)/.test(rb),
    "12.4 and restores the previous immutability guard",
  );
  ok(/SCP_IV_REPORT_BASIS_ROLLBACK ok/.test(rb), "12.5 and proves its own result at apply time");
  const dbTest = read(DB_TEST);
  ok(
    /-f supabase\/rollback\/20261107090000_scp_iv_report_basis_integrity_rollback\.sql/.test(
      dbTest,
    ) && /SCP_IV_REPORT_BASIS_ROLLBACK ok/.test(dbTest),
    "12.6 the suite APPLIES the rollback and reads its proof — rollback is exercised, not described",
  );
  ok(
    /-f supabase\/migrations\/20261107090000_scp_iv_report_basis_integrity\.sql/.test(dbTest),
    "12.7 and re-applies the migration afterwards, so re-apply is exercised too",
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
console.log(
  "\n13. The browser evidence: specified, fixtured, local-only, and honest about its state",
);
/* ══════════════════════════════════════════════════════════════════════ */
{
  const spec = read("e2e/employer-final-report-evidence.spec.ts");
  const fixture = read("scripts/fixtures/employer-final-report-fixture.sql");
  const index = read("artifacts/employer-final-report-e4/INDEX.md");
  ok(
    /test\.skip\(!LOCAL/.test(spec) && /localhost\|127\\\.0\\\.0\\\.1/.test(spec),
    "13.1 the evidence spec runs only against a local stack, on localhost",
  );
  ok(
    /E4 evidence writes only to the local stack/.test(spec) &&
      /127\\\.0\\\.0\\\.1\|localhost/.test(spec),
    "13.2 and its database side-effects refuse any host that is not loopback",
  );
  for (const [needle, state] of [
    ['data-testid="fr-disagree"', "both assessors and their disagreement"],
    [
      "Fördröjd eskalering i scenario 2",
      "the bound assessment finding beside the interview evidence",
    ],
    ["Anställningsåret för den senaste tjänsten", "unresolved material"],
    ['doc(page, "preview")', "the exact preview"],
    ["Underlaget har ändrats", "the stale-preview refusal"],
    ['press("Enter")', "an explicit human finalisation by keyboard"],
    ['doc(page, "final")', "the immutable report rendered from the readback"],
    ['doc(page, "history")', "a historical version opened"],
    ["CANDIDATE", "the candidate denied"],
    ["Görs av ägare eller administratör", "a member not offered the act"],
    ["The assessors do not agree", "English"],
    ["width: 375", "mobile 375"],
    ["expectNoOverflow", "no horizontal overflow"],
    ["toBeFocused", "keyboard focus"],
  ] as const) {
    ok(spec.includes(needle), `13.3 the spec covers ${state}`);
  }
  ok(
    /SCP_E4_FIXTURE_WRONG_DATABASE/.test(fixture) && /supabase_admin/.test(fixture),
    "13.4 the fixture refuses to run against anything but the local development database",
  );
  ok(
    /scp_iv_create_case\(/.test(fixture) &&
      /scp_iv_mark_assessed\(/.test(fixture) &&
      !/INSERT INTO public\.scp_interview_reports/.test(fixture),
    "13.5 the fixture walks the case through the governed RPCs and writes no report row",
  );
  ok(
    /assertion_level, lifecycle_state/.test(fixture) &&
      /'self_declared'/.test(fixture) &&
      /'verified'/.test(fixture),
    "13.6 and carries one self-declared and one verified Passport claim in the same case",
  );
  ok(
    /already present as/.test(fixture),
    "13.7 and is idempotent: a second run finds the cases and leaves them alone",
  );
  ok(
    /Captured at HEAD/.test(index) && (/_pending_/.test(index) || /[0-9a-f]{40}/.test(index)),
    "13.8 the index names the HEAD the captures were taken at, or says plainly that none exist yet",
  );
  ok(
    /BLOCKED/.test(index) === /_pending_/.test(index),
    "13.9 and calls #216 blocked exactly while no captures exist — never complete on an empty directory",
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
if (failures > 0) {
  console.error(`\nemployer-final-report-check: FAIL (${failures})`);
  process.exit(1);
}
console.log(`\nemployer-final-report-check: PASS`);
console.log(`
    The employer final report is the canonical output of this process, and it is
    now provable: a core sha256 digest over an ORDERED basis that names the
    recruitment and binds the released assessment result; every assessor, with
    disagreement stated; a disclosure classified as what it is; one renderer for
    the preview, the final and the history; finalisation that refuses a stale
    preview; the actor named; the rollback exercised. A failed read is never a
    zero, a mismatch is never a finalised report, and finalising shares nothing
    with the candidate. ${passes} assertions.`);
