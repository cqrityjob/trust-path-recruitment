/**
 * EMPLOYER ASSESSMENT RELEASE (E2) — does the employer share the RIGHT result,
 * know what the candidate will get, and find out whether it worked?
 *
 * ── THE THREE DEFECTS THIS GUARD EXISTS BECAUSE OF ──────────────────────
 *
 *   A DESTINATION THAT NAMED A SET.  E1's ladder already chose which attempt
 *   "share the candidate material" was about — the one whose brief is ready
 *   and which has waited longest — and then discarded it, linking to a
 *   FILTERED LIST. One ready attempt and that was rude; two and the choice was
 *   invisible, so the result that got shared was whichever card the recruiter
 *   read first.
 *
 *   A SUCCESS PRINTED ON THE STRENGTH OF A WRITE NOBODY READ BACK.  The route
 *   treated the mutation settling as the end of the story. If the refetch
 *   failed the card re-rendered from the stale row, still offering to share a
 *   result that had just been shared, and nobody was told the irreversible
 *   thing had happened.
 *
 *   A BOUNDARY NOBODY COULD CHECK.  "The candidate gets their own copy" was
 *   the whole of what a recruiter was told before an irreversible disclosure,
 *   and there was no way for them to look at the copy afterwards either.
 *
 * ── WHAT THIS PROVES, AND HOW ───────────────────────────────────────────
 *
 * TABLE    The release projection is pure, so it is exercised exhaustively:
 *          every gate, every focus outcome, every error code, every readback,
 *          over generated rows. No fixtures, no clock, no database.
 *
 * RENDER   The continuity strip is drawn and its release href is READ, so the
 *          attempt in the URL is asserted as a value rather than as a source
 *          string. Both languages.
 *
 * SOURCE   The properties a render cannot reach: that the preview renders the
 *          same component the candidate's own page renders; that the server
 *          function goes through the governed read; that the migration keeps
 *          the participant projection a copy rather than a re-rendering; that
 *          the candidate boundary never promises a score.
 *
 * Deterministic, offline, no database, no network.
 */

import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { PipelineRow } from "../src/lib/security-competency/assessment-lifecycle.functions";
import type { ProcessProjection } from "../src/lib/employer-continuity/process-projection";

await mock.module("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    search,
    children,
    ...rest
  }: Record<string, unknown> & { children?: React.ReactNode }) => {
    let href = String(to ?? "");
    if (params && typeof params === "object") {
      for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
        href = href.replace(`$${k}`, String(v));
      }
    }
    if (search && typeof search === "object") {
      const q = Object.entries(search as Record<string, unknown>)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}=${String(v)}`)
        .join("&");
      if (q) href += `?${q}`;
    }
    return React.createElement("a", { href, ...rest }, children);
  },
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
const R = await import("../src/lib/employer-continuity/assessment-release");
const P = await import("../src/lib/employer-continuity/process-projection");
const { ProcessContinuityStrip } =
  await import("../src/components/employer/ProcessContinuityStrip");

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

/** Source with comments removed.
 *
 *  Every SOURCE assertion below runs against this. A guard that greps raw
 *  source can be satisfied by the sentence in the comment that describes the
 *  thing it is looking for, which makes it a guard against nothing. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const PARTICIPANTS_ROUTE =
  "src/routes/_authenticated.employer.$employerSlug.assessments.participants.tsx";
const STRIP = "src/components/employer/ProcessContinuityStrip.tsx";
const PROJECTION = "src/lib/employer-continuity/process-projection.ts";
const RELEASE = "src/lib/employer-continuity/assessment-release.ts";
const PREVIEW = "src/components/academy/CandidateCopyPreview.tsx";
const DOCUMENT = "src/components/academy/CandidateReportDocument.tsx";
const CANDIDATE_ROUTE = "src/routes/_authenticated.academy.report.$attemptId.tsx";
const ACADEMY_FN = "src/lib/security-competency/academy-employer.functions.ts";
const MIGRATION = "supabase/migrations/20261105090000_scp_participant_report_issuer_preview.sql";
const DB_SUITE = "supabase/tests/scp_participant_report_issuer_preview_test.sql";

const sv = dictionaries.sv as Record<string, string>;
const en = dictionaries.en as Record<string, string>;

/** One pipeline row, with only the fields the release projection reads varied.
 *
 *  Everything else is filled with values that are legal but deliberately
 *  uninteresting, so a gate that started reading one of them would produce a
 *  wrong answer here rather than an accidentally right one. */
function pRow(over: Partial<PipelineRow> & { attemptId: string }): PipelineRow {
  return {
    attemptId: over.attemptId,
    assignmentId: "as-1",
    subjectId: "su-1",
    employeeId: null,
    participantRef: "ABC123",
    participantName: null,
    assessmentSlug: "sg-operational-baseline",
    assessmentNameSv: "Test",
    assessmentNameEn: "Test",
    purposeCode: "recruitment",
    useCase: "recruitment",
    governanceMode: "production",
    lifecycleState: "ready_to_release",
    invitedAt: "2026-01-01T00:00:00Z",
    startedAt: "2026-01-02T00:00:00Z",
    submittedAt: "2026-01-03T00:00:00Z",
    scoredAt: "2026-01-04T00:00:00Z",
    releasedAt: null,
    deadline: null,
    answered: 18,
    totalItems: 18,
    reviewsTotal: 12,
    reviewsOpen: 0,
    identityResolvable: false,
    canRelease: true,
    ...over,
  };
}

/* ================================================================== */
/* 1 · The gate: every release state has a reason, and only one       */
/* ================================================================== */
{
  // EXHAUSTIVE over the fields the gate reads. Four booleans-worth of input,
  // enumerated rather than sampled, so a branch reordered into the wrong
  // priority shows up as a wrong answer somewhere in the grid.
  const seen = new Set<string>();
  for (const releasedAt of [null, "2026-02-01T00:00:00Z"]) {
    for (const reviewsOpen of [0, 3]) {
      for (const scoredAt of [null, "2026-01-04T00:00:00Z"]) {
        for (const canRelease of [true, false]) {
          const g = R.releaseGate(
            pRow({ attemptId: "a", releasedAt, reviewsOpen, scoredAt, canRelease }),
          );
          seen.add(g.kind);

          // RELEASED IS TERMINAL AND OUTRANKS EVERYTHING. An attempt whose
          // report is shared is shared whatever else is true of it, and a card
          // that offered to share it again would be offering a second
          // irreversible act the database would refuse.
          if (releasedAt) {
            ok(g.kind === "released", "1 · a released attempt is released, whatever else is true");
            continue;
          }
          // AN OUTSTANDING REVIEW OUTRANKS SCORED-NESS. This is the order
          // scp_release_attempt_report enforces with SCP_RELEASE_BEFORE_SCORED,
          // and the card has to say it BEFORE the click rather than after.
          if (reviewsOpen > 0) {
            ok(
              g.kind === "reviewsOutstanding" && g.open === 3 && g.total === 12,
              "1 · an outstanding review outranks a score, and carries both numbers",
            );
            continue;
          }
          if (!scoredAt) {
            ok(g.kind === "notScored", "1 · an unscored attempt has nothing to share");
            continue;
          }
          ok(
            g.kind === (canRelease ? "ready" : "notPermitted"),
            "1 · a scored, unshared attempt is ready or not permitted, by capability alone",
          );
        }
      }
    }
  }
  // Every member of the union is reachable. A member nothing can produce reads
  // as a state the product has, and it does not.
  for (const k of ["released", "ready", "notPermitted", "reviewsOutstanding", "notScored"]) {
    ok(seen.has(k), `1 · the gate member ${k} is reachable`);
  }

  // `notPermitted` is a statement about the READER, not about the attempt.
  // Two readers, one attempt, two answers -- and the attempt is unchanged.
  const row = pRow({ attemptId: "a" });
  ok(
    R.releaseGate({ ...row, canRelease: true }).kind === "ready" &&
      R.releaseGate({ ...row, canRelease: false }).kind === "notPermitted",
    "1 · the same attempt reads differently for two readers, which is what makes it a permission",
  );

  // NO SCORE, NO VERDICT. The gate reports a release lifecycle; if it ever
  // started reporting on the person, this is where it would show first.
  //
  // CANDIDATE_DOES_NOT_RECEIVE is excluded from the sweep, and has to be: its
  // entire job is to NAME a total score, a ranking and a recommendation as
  // things the product does not produce, and a vocabulary check that forbade
  // it from doing so would forbid the honest half of the boundary. Everything
  // above that list — the gate, the focus, the outcome, the read-back — is
  // swept, which is where a verdict would actually appear.
  const releaseSrc = codeOnly(read(RELEASE));
  const withheldAt = releaseSrc.indexOf("CANDIDATE_DOES_NOT_RECEIVE");
  ok(withheldAt > 0, "1 · the withheld list is where this file's forbidden vocabulary is allowed");
  const gateSrc = releaseSrc.slice(0, withheldAt);
  //
  // "scored" is NOT on this list and must not be: `scoredAt`, `notScored` and
  // SCP_RELEASE_BEFORE_SCORED are the assessment engine's own lifecycle -- an
  // ATTEMPT is scored the way a form is submitted -- and the release gate has
  // to read it. What must never appear is a score, a rank or a verdict about
  // the PERSON, so the patterns below are anchored to exclude that word and
  // to catch the shapes such a thing would actually take.
  for (const [pattern, label] of [
    [/\bscore\b|totalScore|scoreValue|scoreOf/i, "a score"],
    [/\brank\b|ranking|rankOf|percentile/i, "a rank or a percentile"],
    [/passFail|pass_fail|\bpassed\b|\bfailedCandidate\b/i, "a pass/fail"],
    [/suitab|recommend|shortlist|\bhire\b|rejectCandidate/i, "a hiring verdict"],
    [/compare|versusOther|betterThan/i, "a comparison between candidates"],
  ] as const) {
    ok(!pattern.test(gateSrc), `1 · the release projection expresses ${label} nowhere`);
  }
}

/* ================================================================== */
/* 2 · Focus: a request for one record is answered as one record      */
/* ================================================================== */
{
  const rows = [pRow({ attemptId: "a1" }), pRow({ attemptId: "a2" }), pRow({ attemptId: "a3" })];

  ok(R.focusAttempt(null, rows).kind === "noneRequested", "2 · no request is not a failed request");
  ok(
    R.focusAttempt(undefined, rows).kind === "noneRequested",
    "2 · and neither is an absent search param",
  );
  ok(R.focusAttempt("", rows).kind === "noneRequested", "2 · nor an empty one");

  const hit = R.focusAttempt("a2", rows);
  ok(hit.kind === "focused" && hit.attemptId === "a2", "2 · a reachable attempt is focused");

  // THE MEMBER THE WHOLE UNION EXISTS FOR. A link naming an attempt this
  // employer cannot see used to produce an ordinary list, and the recruiter had
  // no way to know the record they came for was not in it.
  const miss = R.focusAttempt("a9", rows);
  ok(
    miss.kind === "notInReach" && miss.attemptId === "a9",
    "2 · an unreachable attempt is NOT silently downgraded to no request",
  );
  ok(
    R.focusAttempt("a1", []).kind === "notInReach",
    "2 · and an empty reachable set does not make it one either",
  );

  // ORDERING. The focused record is first and present exactly once, whatever
  // the filter did -- including when the filter excluded it entirely, which is
  // the case that produced the dead end.
  const filteredWithout = [rows[0], rows[2]];
  const ordered = R.orderWithFocus(filteredWithout, rows, R.focusAttempt("a2", rows));
  ok(ordered[0].attemptId === "a2", "2 · the focused record is first even when the filter hid it");
  ok(ordered.length === 3, "2 · and is added, not substituted");
  ok(
    ordered.filter((r) => r.attemptId === "a2").length === 1,
    "2 · exactly once, never duplicated",
  );
  const orderedIncluded = R.orderWithFocus(rows, rows, R.focusAttempt("a3", rows));
  ok(
    orderedIncluded.map((r) => r.attemptId).join(",") === "a3,a1,a2",
    "2 · a focused record already in the list is moved to the front, and nothing else re-sorts",
  );
  ok(
    R.orderWithFocus(filteredWithout, rows, { kind: "noneRequested" }) === filteredWithout,
    "2 · with no request the filtered list is returned untouched",
  );
  ok(
    R.orderWithFocus(filteredWithout, rows, { kind: "notInReach", attemptId: "a9" }).length === 2,
    "2 · and an unreachable request adds nothing to it",
  );
}

/* ================================================================== */
/* 3 · Outcome: a write is not a success until a read says so         */
/* ================================================================== */
{
  // THE DEFECT, DIRECTLY. `releaseReadback` is handed what the refetch
  // produced; only a row carrying a release time is allowed to mean success.
  const confirmed = R.releaseReadback(pRow({ attemptId: "a", releasedAt: "2026-02-01T10:00:00Z" }));
  ok(
    confirmed.kind === "confirmed" && confirmed.releasedAt === "2026-02-01T10:00:00Z",
    "3 · a row that carries a release time confirms the release, and carries the moment",
  );
  ok(
    R.releaseReadback(pRow({ attemptId: "a", releasedAt: null })).kind === "writtenNotConfirmed",
    "3 · a row that does NOT carry one is not a success, however the call went",
  );
  ok(
    R.releaseReadback(null).kind === "writtenNotConfirmed",
    "3 · a refetch that produced nothing is not a success either",
  );
  ok(
    R.releaseReadback(undefined).kind === "writtenNotConfirmed",
    "3 · and neither is a refetch that broke",
  );

  // ERROR CODES. The three the database actually raises, each mapped to its own
  // sentence, and everything else to `failed` -- which claims nothing about
  // whether the write landed.
  ok(
    R.releaseErrorOutcome("SCP_ALREADY_RELEASED").kind === "alreadyReleased",
    "3 · a second call on a one-way door is the success case arriving late",
  );
  ok(
    R.releaseErrorOutcome("SCP_RELEASE_BEFORE_SCORED").kind === "blocked",
    "3 · releasing over an unreviewed response is blocked, and named as such",
  );
  ok(
    R.releaseErrorOutcome("SCP_NOT_AUTHORISED_TO_RELEASE").kind === "refused",
    "3 · the database re-deciding authority is a refusal, not a generic failure",
  );
  ok(
    R.releaseErrorOutcome("SCP_SOMETHING_NOBODY_HAS_SEEN").kind === "failed",
    "3 · an unknown code falls to failed rather than into the last branch",
  );
  ok(R.releaseErrorOutcome(null).kind === "failed", "3 · so does no code at all");
  ok(R.releaseErrorOutcome("").kind === "failed", "3 · and so does an empty one");

  // THE CONTROL. Enabled only from a ready gate, and only while the release has
  // neither happened nor is happening. `alreadyReleased` and
  // `writtenNotConfirmed` both mean the irreversible act is DONE: offering to
  // do it again is the worst thing this screen could do.
  const ready = { kind: "ready" } as const;
  ok(R.releaseControlEnabled(ready, { kind: "idle" }), "3 · ready and idle: the control is live");
  ok(
    R.releaseControlEnabled(ready, { kind: "failed" }),
    "3 · a failure that claims nothing may be retried",
  );
  for (const o of [
    { kind: "releasing" },
    { kind: "confirmed", releasedAt: "x" },
    { kind: "writtenNotConfirmed" },
    { kind: "alreadyReleased" },
    { kind: "blocked" },
    { kind: "refused" },
  ] as const) {
    ok(!R.releaseControlEnabled(ready, o), `3 · the control is NOT offered again after ${o.kind}`);
  }
  for (const g of [
    { kind: "released", releasedAt: "x" },
    { kind: "notPermitted" },
    { kind: "reviewsOutstanding", open: 1, total: 2 },
    { kind: "notScored" },
  ] as const) {
    ok(
      !R.releaseControlEnabled(g, { kind: "idle" }),
      `3 · and never from the ${g.kind} gate, whatever the outcome`,
    );
  }
}

/* ================================================================== */
/* 4 · The destination names the attempt — read out of the href       */
/* ================================================================== */
{
  const projection = (releaseAttemptId: string | null): ProcessProjection =>
    P.projectProcess({
      application: { read: "ready", status: "reviewing" },
      assessment: P.projectAssessmentTrack("ready", []),
      interview: P.projectInterviewTrack("ready", []),
      report: { read: "ready", finalisedCaseId: null, materialCaseId: null, caseCount: 0 },
      capabilities: { canReviewAssessment: false, canShareAssessmentBrief: true },
    });

  // Built through the real projection so the destination is the one the ladder
  // actually produces, not one written here.
  const ATTEMPT = "11111111-2222-4333-8444-555555555555";
  const OTHER = "99999999-8888-4777-8666-555555555555";
  const track = P.projectAssessmentTrack("ready", [
    {
      attemptId: OTHER,
      attemptStatus: "released",
      reportAvailable: true,
      reviewsOutstanding: 0,
      answered: 18,
      invitedAt: "2026-01-01T00:00:00Z",
    },
    {
      attemptId: ATTEMPT,
      attemptStatus: "scored",
      reportAvailable: false,
      reviewsOutstanding: 0,
      answered: 18,
      invitedAt: "2026-01-02T00:00:00Z",
    },
  ] as never);

  ok(
    track.releaseAttemptId === ATTEMPT,
    "4 · the release target is the attempt whose brief is ready, not the released one",
  );

  const proj = P.projectProcess({
    application: { read: "ready", status: "reviewing" },
    assessment: track,
    interview: P.projectInterviewTrack("ready", []),
    report: { read: "ready", finalisedCaseId: null, materialCaseId: null, caseCount: 0 },
    capabilities: { canReviewAssessment: false, canShareAssessmentBrief: true },
  });
  ok(proj.nextAction.kind === "shareAssessmentBrief", "4 · and the ladder proposes sharing it");
  ok(
    proj.nextAction.destination.kind === "assessmentParticipants" &&
      proj.nextAction.destination.attemptId === ATTEMPT,
    "4 · the destination NAMES that attempt rather than a filter that contains it",
  );

  for (const lang of ["sv", "en"] as const) {
    const html = renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        { initial: lang } as never,
        React.createElement(ProcessContinuityStrip, {
          projection: proj,
          employerSlug: "acme",
          applicationId: "app-1",
          onRetry: () => {},
        }),
      ),
    );
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    const target = hrefs.find((h) => h.includes("/assessments/participants"));
    ok(Boolean(target), `4 · [${lang}] the strip draws the participants destination`);
    // READ OUT OF THE URL, as a value. A source grep would pass on a link that
    // interpolated the wrong variable.
    ok(
      Boolean(target?.includes(`attempt=${ATTEMPT}`)),
      `4 · [${lang}] and the exact attempt travels in it`,
    );
    ok(!target?.includes(`attempt=${OTHER}`), `4 · [${lang}] and the released attempt does not`);
    ok(
      Boolean(target?.includes("state=ready_to_release")),
      `4 · [${lang}] the filter travels beside it, not instead of it`,
    );
    // NOTHING HUMAN-READABLE IN A URL. E1's rule, re-asserted on the new param.
    for (const h of hrefs) {
      ok(
        !/[?&]attempt=[^&]*[@ ]/.test(h),
        `4 · [${lang}] no address or name reaches the attempt parameter`,
      );
    }
  }

  // The route ACCEPTS it. A link that carries a parameter the destination
  // discards is a link that lies.
  const routeSrc = codeOnly(read(PARTICIPANTS_ROUTE));
  // Whitespace-insensitive: prettier is free to break this across lines and
  // the property is about the validator, not about its layout.
  const searchDecl = routeSrc.slice(
    routeSrc.indexOf("const searchSchema"),
    routeSrc.indexOf("});", routeSrc.indexOf("const searchSchema")),
  );
  const flatSearch = searchDecl.replace(/\s+/g, "");
  ok(
    flatSearch.includes("attempt:z.string().uuid()"),
    "4 · the participants route validates the attempt as a uuid",
  );
  ok(
    flatSearch.includes(".catch("),
    "4 · and a malformed one is no request rather than a broken page",
  );
  ok(
    flatSearch.includes(".optional()"),
    "4 · and it is optional, so no other link to this route has to name it",
  );
  ok(
    routeSrc.includes("focusAttempt(search.attempt, recruitment)") ||
      routeSrc.includes("focusAttempt(search.attempt, reachable(rows))"),
    "4 · and it resolves the request through the projection rather than by hand",
  );
  // AGAINST THE REACHABLE SET, NOT THE FILTERED ONE. Resolving focus against
  // the filtered rows would answer "your chip hides it" with "it is not there".
  ok(
    !/focusAttempt\(\s*search\.attempt,\s*(matched|sorted|visible)/.test(routeSrc),
    "4 · focus is never resolved against the filtered view",
  );
}

/* ================================================================== */
/* 5 · The boundary the recruiter is shown before an irreversible act */
/* ================================================================== */
{
  ok(R.CANDIDATE_RECEIVES.length >= 6, "5 · what the candidate receives is enumerated");
  ok(
    R.CANDIDATE_DOES_NOT_RECEIVE.length >= 9,
    "5 · and so is what they do not — the half a recruiter is actually unsure about",
  );

  // Every identifier has copy in BOTH languages. A boundary that renders a raw
  // key in Swedish is a boundary nobody read.
  for (const k of R.CANDIDATE_RECEIVES) {
    const key = `academy.participants.boundary.shared.${k}`;
    ok(typeof sv[key] === "string" && sv[key].length > 0, `5 · ${key} has Swedish copy`);
    ok(typeof en[key] === "string" && en[key].length > 0, `5 · ${key} has English copy`);
  }
  for (const k of R.CANDIDATE_DOES_NOT_RECEIVE) {
    const key = `academy.participants.boundary.withheld.${k}`;
    ok(typeof sv[key] === "string" && sv[key].length > 0, `5 · ${key} has Swedish copy`);
    ok(typeof en[key] === "string" && en[key].length > 0, `5 · ${key} has English copy`);
  }

  // THE PRODUCT INVARIANT, ON THE COPY ITSELF. The withheld side must name a
  // total, a ranking and a recommendation explicitly: a recruiter left to infer
  // whether the product produces one will assume it does.
  const withheld = R.CANDIDATE_DOES_NOT_RECEIVE.map(
    (k) =>
      `${sv[`academy.participants.boundary.withheld.${k}`]} ${en[`academy.participants.boundary.withheld.${k}`]}`,
  ).join(" ");
  for (const [needle, label] of [
    ["poäng|score", "a total score"],
    ["rangordning|ranking", "a ranking"],
    ["rekommendation|recommendation", "a recommendation"],
    ["godkänt|pass", "pass/fail"],
  ] as const) {
    ok(new RegExp(needle, "i").test(withheld), `5 · the withheld side names ${label} explicitly`);
  }

  // AND THE SHARED SIDE PROMISES NONE OF THEM. This is the assertion that
  // stops the boundary drifting into a description of something the
  // participant document does not contain.
  const shared = R.CANDIDATE_RECEIVES.map(
    (k) =>
      `${sv[`academy.participants.boundary.shared.${k}`]} ${en[`academy.participants.boundary.shared.${k}`]}`,
  ).join(" ");
  for (const forbidden of [
    "rangordn",
    "ranking",
    "totalpoäng",
    "total score",
    "rekommend",
    "recommend",
    "lämplig",
    "suitab",
  ]) {
    ok(
      !new RegExp(forbidden, "i").test(shared),
      `5 · the shared side never promises "${forbidden}"`,
    );
  }
}

/* ================================================================== */
/* 6 · The preview is the document, not a description of it           */
/* ================================================================== */
{
  ok(existsSync(path.join(root, DOCUMENT)), "6 · the candidate document is its own component");
  const previewSrc = codeOnly(read(PREVIEW));
  const candidateSrc = codeOnly(read(CANDIDATE_ROUTE));

  // ONE PIECE OF MARKUP, TWO SURFACES. The preview is a guarantee only while
  // it is impossible for the two to differ.
  for (const [src, who] of [
    [previewSrc, "the employer preview"],
    [candidateSrc, "the candidate's own page"],
  ] as const) {
    ok(
      src.includes("<CandidateReportDocument report="),
      `6 · ${who} renders the shared document component`,
    );
    ok(
      src.includes("<CandidateReportRights report="),
      `6 · ${who} renders the shared rights section`,
    );
  }
  // And neither has kept a private copy of the sections it used to own.
  for (const [src, who] of [
    [previewSrc, "the employer preview"],
    [candidateSrc, "the candidate's own page"],
  ] as const) {
    ok(
      !src.includes("<EvidenceStateRow"),
      `6 · ${who} does not render competency lines of its own`,
    );
    ok(
      !src.includes("<ReportContextPanel"),
      `6 · ${who} does not render a context panel of its own`,
    );
  }

  // THE READ IS THE GOVERNED ONE. A preview that reached for the snapshot
  // table, or re-used the participant's own entry point, would be a different
  // and much larger change.
  ok(
    previewSrc.includes("getParticipantReportAsIssuer"),
    "6 · the preview goes through the issuer read",
  );
  ok(!previewSrc.includes("scp_report_snapshots"), "6 · and never at the snapshot table");
  const fnSrc = codeOnly(read(ACADEMY_FN));
  ok(
    fnSrc.includes('rpc("scp_participant_report_for_issuer"'),
    "6 · which calls the governed RPC and nothing else",
  );
  ok(fnSrc.includes("requireSupabaseAuth"), "6 · under the authenticated middleware");
  // NO SERVICE ROLE IN THE PATH. The whole authority argument is that the
  // caller's own client is used and the database decides.
  ok(
    !/service_role|serviceRole|SERVICE_ROLE/.test(
      fnSrc.slice(fnSrc.indexOf("getParticipantReportAsIssuer")),
    ),
    "6 · with no service-role client anywhere near it",
  );

  // A FAILED READ IS NOT AN ABSENT DOCUMENT. The one place a reader would be
  // most inclined to believe it was.
  ok(
    previewSrc.includes("preview.isError") &&
      previewSrc.includes("academy.participants.preview.unavailable"),
    "6 · a failed preview read says it failed",
  );
  ok(
    previewSrc.includes("academy.participants.preview.notReleased"),
    "6 · and a genuinely absent document says that instead",
  );
  ok(
    read(PREVIEW).indexOf("preview.isError") < read(PREVIEW).indexOf("!preview.data"),
    "6 · in that order, so an error cannot fall through to the empty state",
  );

  // ONE MAPPER. The safety argument for the preview is that it is a copy; a
  // second client-side mapper is how a copy stops being one.
  // `competencyCode: String(` is not unique to the snapshot mapper --
  // scp_subject_progress maps the same field -- so the subject is the mapper
  // itself: one definition, and both audience entry points calling it.
  ok(
    (fnSrc.match(/function mapReportSnapshot\(/g) ?? []).length === 1,
    "6 · exactly one snapshot mapper is defined",
  );
  ok(
    (fnSrc.match(/return mapReportSnapshot\(row\);/g) ?? []).length === 2,
    "6 · and both audience entry points return through it",
  );
}

/* ================================================================== */
/* 7 · The migration keeps the projection a copy                      */
/* ================================================================== */
{
  ok(existsSync(path.join(root, MIGRATION)), "7 · the migration exists");
  const sqlRaw = read(MIGRATION);
  // The header comment names every function it is careful NOT to touch, and
  // the apply-time DO block quotes the fragments it forbids. Both would
  // satisfy a naive grep for exactly the things this section must prove are
  // absent, so the assertions below read the STATEMENTS: SQL line comments
  // stripped, and the proof block -- which starts at the last `DO $$` --
  // excluded.
  const sql = sqlRaw
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");
  const statements = sql.slice(0, sql.lastIndexOf("DO $$"));
  ok(statements.length > 0, "7 · the migration has statements outside its proof block");
  const participantSql = read(
    "supabase/migrations/20260904171840_scp_trust_evidence_report_r2a_report_version_continuity.sql",
  );

  ok(sql.includes("SECURITY DEFINER"), "7 · the read is SECURITY DEFINER");
  ok(/SET search_path = public, pg_temp/.test(sql), "7 · with a pinned search_path");
  ok(
    /REVOKE ALL\s+ON FUNCTION public\.scp_participant_report_for_issuer\(uuid\) FROM PUBLIC, anon;/.test(
      sql,
    ),
    "7 · revoked from PUBLIC and anon",
  );
  ok(
    /GRANT\s+EXECUTE ON FUNCTION public\.scp_participant_report_for_issuer\(uuid\) TO authenticated;/.test(
      sql,
    ),
    "7 · and granted only to authenticated",
  );
  // NOT service_role. Several older functions carry it; this one has no server
  // caller that needs it, and adding it would widen the surface for nothing.
  ok(
    !/scp_participant_report_for_issuer\(uuid\) TO [^;]*service_role/.test(sql),
    "7 · and never to service_role",
  );

  // THE COPY PROPERTY, asserted against the file the original lives in.
  for (const fragment of [
    "'[]'::jsonb",
    "LEFT JOIN public.scp_report_versions",
    "audience = 'participant'",
    "public.scp_audience_brief(s.brief)",
  ]) {
    ok(sql.includes(fragment), `7 · the issuer read carries ${fragment}`);
    ok(participantSql.includes(fragment), `7 · exactly as scp_participant_report does`);
  }
  // The one thing it must NOT carry: the stored severities.
  ok(
    !/s\.safety_flags/.test(statements),
    "7 · and never the stored safety flags the employer document has",
  );

  // AUTHORITY: the same seat releasing requires, and it is checked on
  // membership STATUS as well as role.
  ok(/m\.role IN \('owner','admin'\)/.test(sql), "7 · the predicate requires owner or admin");
  ok(/m\.status = 'active'/.test(sql), "7 · with an active membership");

  // IT DOES NOT WIDEN THE EXISTING RULE. A migration that edited
  // scp_report_snapshot_readable instead would hand the participant document
  // to every member of every organisation.
  ok(
    !statements.includes("scp_report_snapshot_readable"),
    "7 · and the canonical audience predicate is not touched",
  );
  ok(
    !/CREATE\s+(TABLE|TYPE)|ALTER\s+TABLE|DROP\s+TABLE/i.test(statements),
    "7 · no table, type or column is created or altered",
  );
  ok(!/INSERT INTO|UPDATE\s+public\.|DELETE FROM/i.test(statements), "7 · and nothing is written");

  // A ROLLBACK EXISTS AND IS VERIFIED.
  const rb = "supabase/rollback/20261105090000_scp_participant_report_issuer_preview_rollback.sql";
  ok(existsSync(path.join(root, rb)), "7 · a rollback file exists");
  const rbSrc = read(rb);
  ok(
    rbSrc.includes("DROP FUNCTION IF EXISTS public.scp_participant_report_for_issuer(uuid)") &&
      rbSrc.includes("DROP FUNCTION IF EXISTS public.scp_report_issuer_admin(uuid)"),
    "7 · which drops both functions",
  );
  ok(
    rbSrc.includes("scp_participant_report") && rbSrc.includes("scp_report_snapshot_readable"),
    "7 · and asserts the contracts it was added beside survive",
  );

  // AND THE DATABASE SUITE THAT PROVES IT AT RUNTIME IS WIRED IN.
  ok(existsSync(path.join(root, DB_SUITE)), "7 · the database suite exists");
  const runner = read("scripts/db-test.sh");
  ok(
    runner.includes("scp_participant_report_issuer_preview_test.sql"),
    "7 · and db-test.sh runs it",
  );
  ok(
    runner.includes('suite_failed "E2 issuer participant-preview"'),
    "7 · and records its failure rather than passing over it",
  );
  // The PR-A unwind sweeps every scp_ function; a new one that is not listed
  // there fails that sweep, which is the reminder it is meant to be.
  ok(
    read("supabase/tests/scp_a_rollback_test.sql").includes(
      "public.scp_participant_report_for_issuer(uuid) CASCADE",
    ),
    "7 · and the full rollback unwind knows about it",
  );
}

/* ================================================================== */
/* 8 · The release invalidates what the release changed               */
/* ================================================================== */
{
  const routeSrc = codeOnly(read(PARTICIPANTS_ROUTE));

  // THE READ-BACK. `refetchQueries` rather than `invalidateQueries` for the
  // pipeline itself, because the answer is needed NOW: it is what decides
  // whether the recruiter is told this worked.
  ok(
    /refetchQueries\(\{\s*queryKey: \["academy", "participants", employerId\]/.test(routeSrc),
    "8 · the pipeline is refetched, not merely invalidated",
  );
  ok(
    routeSrc.includes("releaseReadback(await refreshAfterRelease())"),
    "8 · and the outcome is decided by the row that came back",
  );

  // THE E1 SURFACES. Sharing changes what the continuity strip says, and it
  // would have gone on proposing "share the candidate material" -- pointing at
  // an attempt that had just been shared -- until something else happened to
  // invalidate it.
  ok(
    routeSrc.includes('["employer", employerId, "application", applicationId, "assessments"]'),
    "8 · the application's continuity projection is invalidated",
  );
  ok(
    routeSrc.includes('["employer", employerId, "applications"]'),
    "8 · and so is the applications list that carries the same badge",
  );

  // The refresh runs on BOTH paths. A release that returns
  // SCP_ALREADY_RELEASED is the success case arriving late, and leaving the
  // caches stale there would leave the card offering the button again.
  const success = routeSrc.indexOf("onSuccess");
  const error = routeSrc.indexOf("onError");
  ok(success > 0 && error > success, "8 · the mutation has both handlers");
  ok(
    routeSrc.slice(error).includes("refreshAfterRelease"),
    "8 · and the already-released path refreshes too",
  );

  // SINGLE FLIGHT, both halves. The ref is the synchronous half that survives
  // a second activation landing before React re-renders; the projection is the
  // declarative half.
  ok(routeSrc.includes("releasingRef.current"), "8 · the synchronous single-flight ref survives");
  ok(
    routeSrc.includes("releaseControlEnabled(gate, outcome)"),
    "8 · and the declarative half comes from the projection",
  );
}

/* ================================================================== */
/* 9 · Every state the card can reach has a sentence                  */
/* ================================================================== */
{
  for (const k of [
    "academy.participants.focus.badge",
    "academy.participants.focus.title",
    "academy.participants.focus.body",
    "academy.participants.focus.clear",
    "academy.participants.focus.notInReachTitle",
    "academy.participants.focus.notInReachBody",
    "academy.participants.readiness.title",
    "academy.participants.readiness.ready",
    "academy.participants.readiness.reviewsOutstanding",
    "academy.participants.readiness.notScored",
    "academy.participants.readiness.notPermitted",
    "academy.participants.readiness.released",
    "academy.participants.readiness.releasedByUnknown",
    "academy.participants.boundary.title",
    "academy.participants.boundary.sharedTitle",
    "academy.participants.boundary.withheldTitle",
    "academy.participants.boundary.note",
    "academy.participants.outcome.confirmed",
    "academy.participants.outcome.writtenNotConfirmed",
    "academy.participants.outcome.recheck",
    "academy.participants.outcome.refused",
    "academy.participants.preview.open",
    "academy.participants.preview.close",
    "academy.participants.preview.title",
    "academy.participants.preview.lede",
    "academy.participants.preview.loading",
    "academy.participants.preview.unavailable",
    "academy.participants.preview.notReleased",
    "academy.participants.preview.beforeRelease",
  ]) {
    ok(typeof sv[k] === "string" && sv[k].length > 0, `9 · ${k} exists in Swedish`);
    ok(typeof en[k] === "string" && en[k].length > 0, `9 · ${k} exists in English`);
    ok(sv[k] !== en[k], `9 · ${k} is genuinely translated`);
  }

  // The two placeholder pairs actually survive into both languages. A missing
  // token renders a literal "{open}" to a recruiter.
  for (const [k, tokens] of [
    ["academy.participants.readiness.reviewsOutstanding", ["{open}", "{total}"]],
    ["academy.participants.readiness.released", ["{date}"]],
    ["academy.participants.outcome.confirmed", ["{date}"]],
  ] as const) {
    for (const tok of tokens) {
      ok(sv[k].includes(tok), `9 · ${k} keeps ${tok} in Swedish`);
      ok(en[k].includes(tok), `9 · ${k} keeps ${tok} in English`);
    }
  }

  // `writtenNotConfirmed` must NOT tell anybody to try again. The write landed;
  // sharing is one-way; a retry is the one thing that must not be suggested.
  for (const d of [sv, en]) {
    const s = d["academy.participants.outcome.writtenNotConfirmed"].toLowerCase();
    ok(
      !/(försök igen|try again|dela igen|share again|retry)/.test(s),
      "9 · the written-not-confirmed sentence never suggests repeating an irreversible act",
    );
  }

  // The card renders the focus badge in WORDS as well as in colour, because a
  // border is not an affordance a colour-blind or screen-reader user can use.
  const routeSrc = codeOnly(read(PARTICIPANTS_ROUTE));
  ok(
    routeSrc.includes('t("academy.participants.focus.badge")'),
    "9 · the focused card names itself in words, not only with a border",
  );
  ok(routeSrc.includes('role="status"'), "9 · and the focus notice is announced");
}

/* ------------------------------------------------------------------ */

if (failures > 0) {
  console.error(`\n${passes} passed, ${failures} failed`);
  process.exit(1);
}
console.log(`
OK: the release action opens the exact attempt it chose, the recruiter is told what the
    candidate will and will not receive before an irreversible disclosure, a write is not
    a success until a read says so, and the preview is the candidate's own document
    rather than a second account of it. ${passes} assertions.`);
