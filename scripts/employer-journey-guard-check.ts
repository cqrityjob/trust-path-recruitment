// Employer journey guard — route and navigation assertions for the six
// journeys an employer cannot lose.
//
// Run via `bun run employer-journey:check`.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────
//
// A navigation defect is the cheapest bug to ship and the most expensive to
// notice. Nothing throws. Nothing looks wrong in a screenshot. Types still
// pass, because a <Link> that has quietly become a <button onClick> is still
// valid TypeScript, and a link that has lost its search parameter still
// renders and still navigates -- just to a page that no longer knows which
// candidate it is about.
//
// So these assertions are deliberately about the WIRE between surfaces, not
// about their contents:
//
//   is the control still a real anchor (keyboard-activable by construction)?
//   does it still carry the id the destination needs?
//   does the destination still accept the parameter the source sends?
//   does the way back still exist?
//
// ── THE SIX JOURNEYS ────────────────────────────────────────────────────
//
//   A  job list           -> one job
//   B  applications       -> one candidate
//   C  candidate          -> assign an assessment
//   D  candidate          -> review the outstanding responses
//   E  participants       -> open a released candidate brief      <- the P0
//   F  candidate brief    -> back to the candidate it belongs to
//
// E is the journey this file was written for. It is checked hardest.
//
// ── WHAT THIS FILE CANNOT DO ────────────────────────────────────────────
//
// It reads source. It does not run a browser, so it cannot prove a click
// navigates -- only that the control is built as a thing which navigates.
// A control covered by an overlay, or one whose label is a lookalike of a
// real control, is invisible to this check. Those need eyes or a browser
// test; see the label-collision assertion at the end, which catches the one
// species of that problem which IS deterministic.

import { readFileSync } from "node:fs";
import { dictionaries } from "../src/i18n/dictionaries";

const errors: string[] = [];
const expect = (ok: boolean, message: string) => {
  if (!ok) errors.push(message);
};

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const R = "src/routes/_authenticated.employer.$employerSlug.";
const JOBS_LIST = `${R}jobs.index.tsx`;
const APPLICATIONS = `${R}applications.index.tsx`;
const CANDIDATE = `${R}applications.$applicationId.tsx`;
const PARTICIPANTS = `${R}assessments.participants.tsx`;
const RESULTS = `${R}assessments.results.$attemptId.tsx`;
const PANEL = "src/components/academy/ApplicationAssessmentPanel.tsx";

/** The source of one JSX element, from its opening tag to the matching `>`
 *  of that tag plus a generous tail, so `params`/`search`/`to` on the same
 *  element can be asserted together rather than anywhere in the file. */
function elementWithTarget(src: string, to: string): string | null {
  const needle = `to="${to}"`;
  const at = src.indexOf(needle);
  if (at === -1) return null;
  const open = src.lastIndexOf("<", at);
  return src.slice(open, at + 600);
}

// ---------------------------------------------------------------------------
// A. Job list -> one job
// ---------------------------------------------------------------------------
{
  const src = stripComments(read(JOBS_LIST));
  const el = elementWithTarget(src, "/employer/$employerSlug/jobs/$jobId");
  expect(el !== null, `A: ${JOBS_LIST} no longer links to a single job.`);
  if (el) {
    expect(/^<Link/.test(el.trim()), `A: the job control must be a <Link>, not a button.`);
    expect(/jobId:\s*r\.id/.test(el), `A: the job link must pass the row's own id as jobId.`);
    expect(/employerSlug/.test(el), `A: the job link must stay inside the employer's own slug.`);
  }
}

// ---------------------------------------------------------------------------
// B. Applications -> one candidate
// ---------------------------------------------------------------------------
{
  const src = stripComments(read(APPLICATIONS));
  const el = elementWithTarget(src, "/employer/$employerSlug/applications/$applicationId");
  expect(el !== null, `B: ${APPLICATIONS} no longer links to a single candidate.`);
  if (el) {
    expect(/^<Link/.test(el.trim()), `B: the candidate control must be a <Link>.`);
    expect(/applicationId:\s*r\.id/.test(el), `B: the candidate link must pass the row's own id.`);
  }
}

// ---------------------------------------------------------------------------
// C. Candidate -> assign an assessment
// ---------------------------------------------------------------------------
{
  const src = stripComments(read(PANEL));
  expect(
    src.includes("assignFromApplication"),
    `C: the assessment step must assign through assignFromApplication, so the ` +
      `database resolves the candidate from the application.`,
  );
  expect(
    /assignFn\(\s*\{\s*data:\s*\{\s*employerId,\s*applicationId/.test(src),
    `C: assignment must pass the APPLICATION, never a retyped address.`,
  );
  expect(
    read(CANDIDATE).includes("<ApplicationAssessmentPanel"),
    `C: the candidate page must still carry the assessment panel.`,
  );
}

// ---------------------------------------------------------------------------
// D. Candidate -> review the outstanding responses
// ---------------------------------------------------------------------------
{
  const src = stripComments(read(PANEL));
  const el = elementWithTarget(src, "/employer/$employerSlug/assessments/reviews/$attemptId");
  expect(el !== null, `D: the candidate can no longer reach the review queue.`);
  if (el) {
    expect(/^<Link/.test(el.trim()), `D: the review control must be a <Link>.`);
    expect(/attemptId\s*\}/.test(el), `D: the review link must carry the attemptId.`);
  }
  expect(
    src.includes("getEmployerReviewBoard"),
    `D: the review gate must come from scp_employer_review_board, not be guessed.`,
  );
}

// ---------------------------------------------------------------------------
// E. Participants -> open a released candidate brief    ** the P0 journey **
// ---------------------------------------------------------------------------
{
  const src = stripComments(read(PARTICIPANTS));
  const el = elementWithTarget(src, "/employer/$employerSlug/assessments/results/$attemptId");

  expect(el !== null, `E: Deltagare no longer links to the candidate brief at all.`);
  if (el) {
    // An anchor, not a button. This is the keyboard assertion: a <Link>
    // renders <a href>, which the browser makes focusable and Enter-activable
    // for free. A <button onClick={() => navigate(...)}> would pass a
    // "does it navigate" test and still be the wrong control.
    expect(
      /^<Link/.test(el.trim()),
      `E: "Oppna kandidatunderlag" must be a <Link> (renders <a href>), never a ` +
        `button with an onClick -- that is what makes it keyboard-activable and ` +
        `middle-clickable.`,
    );
    expect(
      /attemptId:\s*row\.attemptId/.test(el),
      `E: the brief link must carry THIS row's attemptId. Losing it opens the ` +
        `wrong attempt or no attempt.`,
    );
    expect(
      /employerSlug/.test(el),
      `E: the brief link must stay inside the employer's own slug (tenant scope).`,
    );
    // Application context is optional data but a mandatory ATTEMPT to pass it:
    // dropping the conditional entirely is how the report silently loses its
    // way back to the candidate.
    expect(
      /search=\{\s*applicationId\s*\?/.test(el),
      `E: the brief link must forward the application when it has one, so the ` +
        `report can offer the way back to the candidate.`,
    );
  }

  // The control must be gated on the brief actually existing, not on a guess.
  expect(
    /row\.releasedAt\s*&&/.test(src),
    `E: the brief control must render only when the result has been released.`,
  );
}

// ---------------------------------------------------------------------------
// F. Candidate brief -> back to the candidate
// ---------------------------------------------------------------------------
{
  const src = stripComments(read(RESULTS));
  expect(
    /application:\s*z\.string\(\)\.uuid\(\)/.test(src),
    `F: the results route must still accept an "application" search parameter, ` +
      `or journey E's link is sending a parameter the destination discards.`,
  );
  expect(src.includes("validateSearch"), `F: the results route must declare validateSearch.`);
  expect(
    /applicationId\s*=\s*application\s*\?\?\s*null|applicationId=\{application/.test(src),
    `F: the results route must read the application through to the surface that ` +
      `renders the way back.`,
  );
}

// ---------------------------------------------------------------------------
// The dead-lookalike assertion.
// ---------------------------------------------------------------------------
//
// Deltagare renders TWO things on a released row: the real control
// ("Oppna kandidatunderlag", a link) and, directly under the status chip,
// LifecycleChip's next-action hint ("Oppna kandidatunderlaget", plain text).
// They differ by one Swedish definite-article suffix. The hint is the one the
// eye reaches first, it is phrased as an instruction, and clicking it does
// nothing -- which reads as a broken button, not as a caption.
//
// A hint that describes the next step is fine. A hint that is word-for-word
// the imperative on a real control sitting inches away is a dead click, and
// this is the deterministic half of that problem: compare the two strings.

{
  const sv = dictionaries.sv as Record<string, string>;
  const en = dictionaries.en as Record<string, string>;

  const normalise = (s: string) =>
    (s ?? "").toLowerCase().replace(/[.!:]/g, "").replace(/\s+/g, " ").trim();

  // Swedish attaches the definite article as a suffix, so "underlag" and
  // "underlaget" are the same word wearing a hat. Strip the common ones before
  // comparing, or the collision this exists to catch slips straight past.
  const stem = (s: string) => normalise(s).replace(/(et|en|na|t)\b/g, "");

  const COLLISIONS: { hint: string; control: string; where: string }[] = [
    {
      hint: "lifecycle.next.recruitment.viewResult",
      control: "academy.participants.openReportRecruitment",
      where: "Deltagare, released recruitment row",
    },
    {
      hint: "lifecycle.next.recruitment.release",
      control: "academy.participants.releaseRecruitment",
      where: "Deltagare, ready-to-release recruitment row",
    },
  ];

  for (const c of COLLISIONS) {
    for (const [lang, dict] of [
      ["sv", sv],
      ["en", en],
    ] as const) {
      const hint = dict[c.hint];
      const control = dict[c.control];
      if (!hint || !control) continue;
      expect(
        stem(hint) !== stem(control),
        `DEAD LOOKALIKE (${lang}, ${c.where}): the non-interactive status hint ` +
          `"${c.hint}" reads "${hint}", which is the same instruction as the real ` +
          `control "${c.control}" ("${control}") next to it. Users click the hint ` +
          `and nothing happens. Either make the hint describe state ("Klart att ` +
          `oppna") or drop it where a real control is present.`,
      );
    }
  }
}

// ---------------------------------------------------------------------------

if (errors.length > 0) {
  for (const e of errors) console.error("[employer-journey:check][error]", e);
  console.error(`\nemployer-journey:check FAILED with ${errors.length} error(s).`);
  process.exit(1);
}
console.log(
  "employer-journey:check OK (6 employer journeys wired: job list -> job, " +
    "applications -> candidate, candidate -> assign, candidate -> review, " +
    "Deltagare -> candidate brief, brief -> back to candidate; no dead lookalike labels)",
);
