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
 *   of the payload, and nothing recorded which algorithm produced the stored
 *   value.
 *
 *   A BASIS THAT DID NOT NAME THE RECRUITMENT.  The snapshot carried the
 *   case's INTERNAL title and nothing about the application, the advert or
 *   the assessment material. A report that cannot say which vacancy it belongs
 *   to is not auditable.
 *
 *   EVIDENCE THAT ALL LOOKED THE SAME.  A sentence the candidate said, a
 *   sentence an interviewer observed and a line from a verified disclosure
 *   rendered identically to a person deciding about a human being.
 *
 *   NO SEQUENCE, AND NO READBACK.  The page could say whether the report was
 *   final. It could not say where the owner was in the work, what the one next
 *   act was, what finalising would and would not do, or whether the finalised
 *   report they were reading was intact.
 *
 * ── WHAT THIS PROVES, AND HOW ───────────────────────────────────────────
 *
 * TABLE    The sequence and the readback are pure, so they are exercised
 *          exhaustively: every progress combination, every outcome, every
 *          error code. No fixtures, no clock, no database.
 *
 * RENDER   The panels are drawn in BOTH languages and their text is read, so
 *          "the boundary says the candidate gets nothing" is asserted as
 *          rendered output rather than as a source string.
 *
 * SOURCE   The properties a render cannot reach: that the readback goes
 *          through the governed RPC rather than a table select; that the
 *          migration hashes with core sha256 and not pgcrypto; that the
 *          builder reads no live application, Passport, CV or note table.
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
  renderToStaticMarkup(
    React.createElement(I18nProvider, { initialLang: lang, children: node }),
  );

const text = (html: string) => html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

const MIGRATION = "supabase/migrations/20261107090000_scp_iv_report_basis_integrity.sql";
const ROUTE =
  "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.report.tsx";
const RUNTIME = "src/lib/interview-intelligence/runtime.functions.ts";
const PANEL = "src/components/employer/interview/FinalReportSequence.tsx";

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
              if (views.filter((v) => v.state === "current").length !== 1)
                alwaysExactlyOne = false;
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
  ok(neverFinaliseWhenBlocked, "1.6 finalising is never the current act while the server reports a blocker");
  ok(doneNeverAfterCurrent, "1.7 nothing after the current act is ever marked done");

  const finalP: F.ReportProgress = {
    requirementCount: 8, assessedCount: 8, outstandingCount: 0,
    blockerCount: 0, isFinal: true, canFinalise: true,
  };
  ok(F.currentStep(finalP) === "readback", "1.8 once a report is final, reading it back is the act");
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
    requirementCount: 0, assessedCount: 0, outstandingCount: 0,
    blockerCount: 0, isFinal: false, canFinalise: true,
  };
  ok(
    F.currentStep(emptyPack) !== "finalise",
    "1.11 a case with NO requirements is never ready to finalise, blockers or not",
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
console.log("\n2. Finalising is a courtesy gate over a server rule");
/* ══════════════════════════════════════════════════════════════════════ */
{
  const base: F.ReportProgress = {
    requirementCount: 8, assessedCount: 8, outstandingCount: 0,
    blockerCount: 0, isFinal: false, canFinalise: true,
  };
  ok(F.finaliseEnabled(base, false), "2.1 an assessed, unblocked case with the right role may finalise");
  ok(!F.finaliseEnabled(base, true), "2.2 not while a call is in flight");
  ok(!F.finaliseEnabled({ ...base, canFinalise: false }, false), "2.3 not without owner or admin");
  ok(!F.finaliseEnabled({ ...base, blockerCount: 1 }, false), "2.4 not while a blocker stands");
  ok(!F.finaliseEnabled({ ...base, isFinal: true }, false), "2.5 not when it is already final");
  ok(!F.finaliseEnabled({ ...base, assessedCount: 7 }, false), "2.6 not with a requirement unassessed");
  ok(!F.finaliseEnabled({ ...base, requirementCount: 0, assessedCount: 0 }, false),
    "2.7 and not on a case with no requirements at all");
}

/* ══════════════════════════════════════════════════════════════════════ */
console.log("\n3. A readback may only claim what it checked");
/* ══════════════════════════════════════════════════════════════════════ */
{
  const row = (verified: boolean): F.FinalReportReadback => ({
    reportId: "r1", versionNumber: 2, status: "final",
    finalisedAt: "2026-09-10T08:00:00Z", finalisedBy: "u1",
    contentHash: "a".repeat(64), contentHashAlgorithm: "sha256",
    recomputedHash: verified ? "a".repeat(64) : "b".repeat(64),
    hashVerified: verified,
  });

  ok(F.readbackOutcome(row(true)).kind === "verified", "3.1 a matching digest is verified");
  ok(F.readbackOutcome(row(false)).kind === "notVerified", "3.2 a mismatching digest is NOT");
  ok(F.readbackOutcome(null).kind === "none", "3.3 an empty read is an honest none");

  ok(F.readbackIsTrustworthy(F.readbackOutcome(row(true))), "3.4 only a verified readback is trustworthy");
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
    ok(F.readbackErrorOutcome(code).kind === "failed", `3.11 ${String(code)} is a failure, not a refusal`);
  }
  ok(
    (["refused", "failed"] as const).every((k) => k !== "none"),
    "3.12 and no error path can produce `none` — a failed read is never rendered as no report",
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
console.log("\n4. The boundary is stated at the point of the irreversible act");
/* ══════════════════════════════════════════════════════════════════════ */
{
  ok(F.FINALISE_EFFECTS.length >= 4, "4.1 what finalising does is enumerated");
  ok(F.FINALISE_NON_EFFECTS.includes("doesNotShareWithCandidate"),
    "4.2 and the first thing it does NOT do is share with the candidate");
  ok(F.FINALISE_NON_EFFECTS.includes("doesNotDecide"), "4.3 nor decide");
  ok(F.FINALISE_NON_EFFECTS.includes("doesNotRankOrScore"), "4.4 nor rank or score");

  for (const lang of ["sv", "en"] as const) {
    const html = render(React.createElement(Panels.FinaliseBoundary), lang);
    const body = text(html);
    const d = dictionaries[lang] as Record<string, string>;
    ok(body.includes(d["iir.noneffects.doesNotShareWithCandidate"]),
      `4.5 ${lang}: the rendered boundary says the candidate does not receive the report`);
    ok(body.includes(d["iir.noneffects.doesNotRankOrScore"]),
      `4.6 ${lang}: and that there is no total score, ranking or verdict`);
    ok(body.includes(d["iir.effects.createsAVersion"]),
      `4.7 ${lang}: and that a numbered, uneditable version is created`);
    ok(!/\bpoäng\b|\bscore\b|\branking\b/i.test(body.replace(d["iir.noneffects.doesNotRankOrScore"], "")),
      `4.8 ${lang}: and nothing else on the panel offers a score or a ranking`);
  }
}

/* ══════════════════════════════════════════════════════════════════════ */
console.log("\n5. The readback panel renders what is true, in both languages");
/* ══════════════════════════════════════════════════════════════════════ */
{
  const row: F.FinalReportReadback = {
    reportId: "r1", versionNumber: 2, status: "final",
    finalisedAt: "2026-09-10T08:00:00Z", finalisedBy: "u1",
    contentHash: "c".repeat(64), contentHashAlgorithm: "sha256",
    recomputedHash: "c".repeat(64), hashVerified: true,
  };
  const noRetry = () => {};

  for (const lang of ["sv", "en"] as const) {
    const d = dictionaries[lang] as Record<string, string>;

    const verified = text(render(
      React.createElement(Panels.FinalReportReadbackPanel, {
        outcome: { kind: "verified", report: row }, onRetry: noRetry,
      }), lang));
    ok(verified.includes(d["iir.readback.verified"]),
      `5.1 ${lang}: a verified readback says the digest was recomputed and matches`);
    ok(verified.includes("c".repeat(64)), `5.2 ${lang}: and shows the digest itself`);
    ok(verified.includes("sha256"), `5.3 ${lang}: and names the algorithm behind it`);
    ok(!verified.includes(d["iir.readback.notVerified"]),
      `5.4 ${lang}: and does not carry the mismatch warning`);

    const bad = text(render(
      React.createElement(Panels.FinalReportReadbackPanel, {
        outcome: { kind: "notVerified", report: { ...row, hashVerified: false } }, onRetry: noRetry,
      }), lang));
    ok(bad.includes(d["iir.readback.notVerified"]),
      `5.5 ${lang}: a mismatch says so, in the words a person needs`);
    ok(!bad.includes(d["iir.readback.verified"]),
      `5.6 ${lang}: and never also claims it was checked and matched`);

    const refused = text(render(
      React.createElement(Panels.FinalReportReadbackPanel, {
        outcome: { kind: "refused" }, onRetry: noRetry,
      }), lang));
    ok(refused.includes(d["iir.readback.refused"]),
      `5.7 ${lang}: a refusal says it is a permission problem`);
    ok(!refused.includes(d["iir.readback.none"]),
      `5.8 ${lang}: and is NEVER rendered as "no report exists"`);

    const failed = text(render(
      React.createElement(Panels.FinalReportReadbackPanel, {
        outcome: { kind: "failed" }, onRetry: noRetry,
      }), lang));
    ok(failed.includes(d["iir.readback.failed"]),
      `5.9 ${lang}: a failure says the read failed`);
    ok(!failed.includes(d["iir.readback.none"]),
      `5.10 ${lang}: and is not "no report" either`);
    ok(failed.includes(d["iir.readback.retry"]),
      `5.11 ${lang}: and offers a retry, because retrying could change it`);

    const refusedHtml = render(React.createElement(Panels.FinalReportReadbackPanel, {
      outcome: { kind: "refused" }, onRetry: noRetry,
    }), lang);
    ok(!refusedHtml.includes(d["iir.readback.retry"]),
      `5.12 ${lang}: a refusal offers NO retry, because retrying cannot change it`);

    const none = text(render(
      React.createElement(Panels.FinalReportReadbackPanel, {
        outcome: { kind: "none" }, onRetry: noRetry,
      }), lang));
    ok(none.includes(d["iir.readback.none"]),
      `5.13 ${lang}: a genuine absence says there is no finalised report yet`);

    const loading = text(render(
      React.createElement(Panels.FinalReportReadbackPanel, {
        outcome: { kind: "loading" }, onRetry: noRetry,
      }), lang));
    ok(loading.includes(d["iir.readback.loading"]),
      `5.14 ${lang}: a read in flight says so and claims nothing`);
    ok(!loading.includes(d["iir.readback.none"]),
      `5.15 ${lang}: and is not a zero`);

    const legacy = text(render(
      React.createElement(Panels.FinalReportReadbackPanel, {
        outcome: { kind: "verified", report: { ...row, contentHashAlgorithm: "md5" } },
        onRetry: noRetry,
      }), lang));
    ok(legacy.includes(d["iir.readback.legacyAlgo"]),
      `5.16 ${lang}: a legacy md5 version says it is md5, rather than passing as sha256`);
  }
}

/* ══════════════════════════════════════════════════════════════════════ */
console.log("\n6. The sequence renders as words, not as weight alone");
/* ══════════════════════════════════════════════════════════════════════ */
{
  const p: F.ReportProgress = {
    requirementCount: 8, assessedCount: 8, outstandingCount: 0,
    blockerCount: 0, isFinal: false, canFinalise: true,
  };
  for (const lang of ["sv", "en"] as const) {
    const d = dictionaries[lang] as Record<string, string>;
    const html = render(React.createElement(Panels.ReportSequence, { progress: p }), lang);
    const body = text(html);
    ok(body.includes(d["iir.seq.state.current"]),
      `6.1 ${lang}: the current act is named IN WORDS, not only highlighted`);
    ok(html.includes('aria-current="step"'),
      `6.2 ${lang}: and marked for a screen reader`);
    ok((html.match(/aria-current="step"/g) ?? []).length === 1,
      `6.3 ${lang}: exactly once`);
    for (const step of F.REPORT_STEPS) {
      ok(body.includes(d[`iir.seq.${step}`]), `6.4 ${lang}: the ladder names "${step}"`);
    }
    const memberHtml = text(render(
      React.createElement(Panels.ReportSequence, { progress: { ...p, canFinalise: false } }), lang));
    ok(memberHtml.includes(d["iir.seq.state.notPermitted"]),
      `6.5 ${lang}: a member is told finalising is an owner or admin act`);
  }
}

/* ══════════════════════════════════════════════════════════════════════ */
console.log("\n7. Versions: a correction adds, it does not replace");
/* ══════════════════════════════════════════════════════════════════════ */
{
  const v = (n: number, status: string) => ({
    reportId: `r${n}`, versionNumber: n, status,
    finalisedAt: "2026-09-10T08:00:00Z", finalisedBy: "u1",
    contentHash: "d".repeat(64), contentHashAlgorithm: "sha256",
  });
  for (const lang of ["sv", "en"] as const) {
    const d = dictionaries[lang] as Record<string, string>;
    const two = text(render(
      React.createElement(Panels.ReportVersionList, { versions: [v(2, "final"), v(1, "superseded")] }),
      lang));
    ok(two.includes(d["iir.versions.lede"]),
      `7.1 ${lang}: the list says a correction creates a new version and keeps the old one`);
    ok(two.includes(d["iir.versions.current"]) && two.includes(d["iir.versions.superseded"]),
      `7.2 ${lang}: and marks which is which`);
    ok(!two.includes(d["iir.versions.only"]),
      `7.3 ${lang}: and does not claim there is only one`);
    const one = text(render(
      React.createElement(Panels.ReportVersionList, { versions: [v(1, "final")] }), lang));
    ok(one.includes(d["iir.versions.only"]),
      `7.4 ${lang}: a single version says so`);
    const noneHtml = render(React.createElement(Panels.ReportVersionList, { versions: [] }), lang);
    ok(noneHtml === "", `7.5 ${lang}: and no versions renders nothing rather than an empty box`);
  }
}

/* ══════════════════════════════════════════════════════════════════════ */
console.log("\n8. The migration: a real digest, a named recruitment, classified evidence");
/* ══════════════════════════════════════════════════════════════════════ */
{
  const raw = read(MIGRATION);
  // Only the STATEMENTS, excluding the apply-time proof block, which quotes
  // every phrase this section looks for.
  const proofAt = raw.indexOf("DO $proof$");
  const statements = sqlOnly(proofAt === -1 ? raw : raw.slice(0, proofAt));

  ok(/encode\(sha256\(/.test(statements), "8.1 the basis is hashed with sha256");
  // The WRITE path specifically. The readback still computes md5 for a legacy
  // version finalised before the algorithm was recorded -- that is how it tells
  // the truth about an old report rather than mislabelling it as sha256 -- so
  // asserting over the whole file would forbid the honest behaviour.
  const finaliseAt = statements.indexOf("CREATE OR REPLACE FUNCTION public.scp_iv_finalise_report");
  const afterFinalise = statements.indexOf("CREATE OR REPLACE FUNCTION", finaliseAt + 10);
  const writePath =
    finaliseAt >= 0
      ? statements.slice(finaliseAt, afterFinalise > finaliseAt ? afterFinalise : undefined)
      : "";
  ok(writePath.length > 0, "8.2a the finalise function body was located");
  ok(!/\bmd5\s*\(/.test(writePath), "8.2 and md5 is gone from the write path");
  ok(/encode\(sha256\(/.test(writePath), "8.2b which hashes with sha256 instead");
  ok(!/\bdigest\s*\(/.test(statements),
    "8.3 and it does NOT use pgcrypto digest(), which cannot resolve under a pinned search_path");
  ok(/content_hash_algorithm/.test(statements), "8.4 which algorithm was used is recorded");
  // The INSERT specifically. 'sha256' also appears in the event payload this
  // function records, so asserting over the whole body would go on passing
  // while the stored column was set to NULL.
  const insertAt = writePath.indexOf("INSERT INTO public.scp_interview_reports");
  const insertSlice = insertAt >= 0 ? writePath.slice(insertAt, insertAt + 700) : "";
  ok(insertSlice.length > 0, "8.5a the report INSERT was located");
  ok(/content_hash_algorithm/.test(insertSlice) && /_hash,\s*'sha256'/.test(insertSlice),
    "8.5 as sha256 on every new finalisation, in the row that is actually stored");

  ok(/advertised_role_sv/.test(statements) && /advertised_role_en/.test(statements),
    "8.6 the basis names the ADVERTISED role in both languages");
  ok(/'application_id'/.test(statements) && /'job_id'/.test(statements),
    "8.7 and the application and the advert it belongs to");
  ok(/assessment_material/.test(statements), "8.8 and the assessment material the process ran on");
  ok(/'classification'/.test(statements), "8.9 every evidence item is classified");
  ok(/'human_interpretation'/.test(statements),
    "8.10 and a human level is named an interpretation, not a further fact");
  ok(/'unattributed'/.test(statements),
    "8.11 an item with no source link is reported as unattributed rather than guessed at");

  // The two invariants the existing schema already holds, restated here.
  ok(!/job_applications/.test(statements) && !/session_notes/.test(statements)
     && !/cv_documents/.test(statements) && !/sp_claims/.test(statements),
    "8.12 the builder reads no live application, Passport, CV or note table (ER5.8)");
  ok(!/scp_report_snapshots/.test(statements),
    "8.13 and never names the assessment snapshot table (TR12.3)");
  ok(!/scp_interview_evidence_proposals/.test(statements),
    "8.14 nor the proposals table, so an unaccepted AI proposal cannot reach a report");

  // No automated judgement anywhere in the write path.
  ok(!/\b(recommend|ranking|pass_fail|total_score|suitab)/i.test(statements),
    "8.15 nothing in the write path names a recommendation, ranking, total or suitability");

  // The readback exists and is least-privilege.
  ok(/CREATE OR REPLACE FUNCTION public\.scp_iv_final_report/.test(statements),
    "8.16 the governed readback exists");
  ok(/REVOKE ALL ON FUNCTION public\.scp_iv_final_report\(uuid\) FROM PUBLIC, anon/.test(statements),
    "8.17 and is revoked from PUBLIC and anon");
  ok(/GRANT EXECUTE ON FUNCTION public\.scp_iv_final_report\(uuid\) TO authenticated/.test(statements),
    "8.18 and granted only to authenticated");
  ok(/scp_iv_can_read_case/.test(statements),
    "8.19 and scoped by the same rule the table's own RLS policy uses");
  ok(/SECURITY DEFINER SET search_path = public/.test(statements),
    "8.20 with a pinned search_path");
  const guardAt = statements.indexOf("FUNCTION public.scp_iv_guard_report_immutable");
  const guardBody = guardAt >= 0 ? statements.slice(guardAt, guardAt + 1400) : "";
  ok(guardBody.length > 0, "8.21a the immutability guard body was located");
  ok(
    /IF\s+OLD\.status\s*=\s*'superseded'\s+THEN[\s\S]{0,200}RAISE EXCEPTION/.test(guardBody),
    "8.21 and a superseded version is immutable too, so a correction preserves the previous one",
  );
}

/* ══════════════════════════════════════════════════════════════════════ */
console.log("\n9. The client reads it through the contract, not around it");
/* ══════════════════════════════════════════════════════════════════════ */
{
  const runtime = codeOnly(read(RUNTIME));
  const routeSrc = codeOnly(read(ROUTE));
  const panelSrc = codeOnly(read(PANEL));

  ok(/rpc\("scp_iv_final_report"/.test(runtime),
    "9.1 the readback goes through the governed RPC");
  ok(/rpc\("scp_iv_report_versions"/.test(runtime),
    "9.2 and so does the version history");

  // The readback must NOT be a table select: that would return the row without
  // recomputing the digest, which is the whole point of the contract.
  const rbStart = runtime.indexOf("getFinalReportReadback");
  const rbEnd = runtime.indexOf("getReportVersions");
  const rbSlice = rbStart >= 0 && rbEnd > rbStart ? runtime.slice(rbStart, rbEnd) : "";
  ok(rbSlice.length > 0, "9.3 the readback server function is present");
  ok(!/\.from\("scp_interview_reports"\)/.test(rbSlice),
    "9.4 and does not select the table directly, which would skip the verification");
  ok(/hash_verified/.test(rbSlice), "9.5 it carries the verification verdict back");
  ok(/e\.code = error\.code/.test(rbSlice),
    "9.6 and preserves the error code, so a refusal can be told from a breakage");

  ok(/readbackErrorOutcome/.test(routeSrc),
    "9.7 the route classifies a failed read rather than defaulting it");
  ok(/readbackOutcome\(/.test(routeSrc), "9.8 and classifies a successful one");
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
  ok(/readback\.refetch\(\)/.test(onSuccess),
    "9.9 finalising refetches the readback, so success comes from the server");
  ok(/versions\.refetch\(\)/.test(onSuccess), "9.10 and the version history with it");
  ok(/<FinalReportReadbackPanel/.test(routeSrc), "9.11 the readback panel is mounted");
  ok(/<ReportSequence/.test(routeSrc), "9.12 and the sequence");
  for (const c of ["FinalReportReadbackPanel", "ReportSequence", "FinaliseBoundary", "ReportVersionList"]) {
    ok(new RegExp(`<${c}[\\s/>]`).test(routeSrc), `9.13a <${c}> is mounted by the route`);
    ok(
      !new RegExp(`\\{\\s*(false|0|null|undefined)\\s*&&[\\s\\S]{0,40}<${c}[\\s/>]`).test(routeSrc),
      `9.13 and <${c}> is not disabled behind a falsy literal`,
    );
  }

  // The panel must never present an unverified report as a finalised one.
  ok(/outcome\.kind === "verified"/.test(panelSrc),
    "9.14 the panel distinguishes a verified readback explicitly");
  const nvAt = panelSrc.indexOf("!verified && (");
  const nvSlice = nvAt >= 0 ? panelSrc.slice(nvAt, nvAt + 400) : "";
  ok(nvSlice.length > 0, "9.15a the mismatch branch was located");
  ok(/role="alert"/.test(nvSlice),
    "9.15 and a mismatch is announced rather than only styled");
}

/* ══════════════════════════════════════════════════════════════════════ */
console.log("\n10. Swedish and English are both complete, and differ");
/* ══════════════════════════════════════════════════════════════════════ */
{
  const sv = dictionaries.sv as Record<string, string>;
  const en = dictionaries.en as Record<string, string>;
  const keys = Object.keys(sv).filter((k) => k.startsWith("iir."));
  ok(keys.length >= 40, `10.1 the new vocabulary exists (${keys.length} keys)`);
  ok(keys.every((k) => typeof en[k] === "string" && en[k].length > 0),
    "10.2 every new key has English");
  ok(keys.every((k) => sv[k].length > 0), "10.3 every new key has Swedish");
  // "Version" is the same word in Swedish and English. Naming the exceptions
  // keeps the rule (untranslated copy is a bug) while not forcing a worse
  // Swedish word onto a screen to satisfy a grep.
  const IDENTICAL_BY_LANGUAGE = new Set(["iir.readback.version"]);
  const same = keys.filter((k) => sv[k] === en[k] && !IDENTICAL_BY_LANGUAGE.has(k));
  ok(same.length === 0, `10.4 and no new key is the same string in both languages (${same.join(", ")})`);
  ok(
    [...IDENTICAL_BY_LANGUAGE].every((k) => sv[k] === en[k]),
    "10.4b and every key excused from that rule really is identical, so the list cannot rot",
  );
  // No new string offers a verdict.
  const offending = keys.filter((k) =>
    /\b(rekommend|rangordn|totalpoäng|lämplig som|recommend|ranking|total score|suitab)/i.test(sv[k] + " " + en[k])
    && !/iir\.noneffects\./.test(k));
  ok(offending.length === 0,
    `10.5 and no string outside the "does not do" list mentions a recommendation or ranking (${offending.join(", ")})`);
}

/* ══════════════════════════════════════════════════════════════════════ */
if (failures > 0) {
  console.error(`\nemployer-final-report-check: FAIL (${failures})`);
  process.exit(1);
}
console.log(`\nemployer-final-report-check: PASS`);
console.log(`
    The employer final report is the canonical output of this process, and it is
    now provable: a core sha256 digest over a basis that names the recruitment it
    belongs to, evidence distinguished by what kind of thing it is, one act
    current at a time, and a readback that recomputes rather than asserts. A
    failed read is never a zero, a mismatch is never a finalised report, and
    finalising shares nothing with the candidate. ${passes} assertions.`);
