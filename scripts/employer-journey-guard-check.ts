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
const REVIEWS = `${R}assessments.reviews.index.tsx`;
const SETTINGS = `${R}settings.tsx`;
const TEAM_PANEL = "src/components/employer/EmployerTeamPanel.tsx";
const JOIN = "src/routes/_authenticated.employer.join.tsx";
const ONBOARDING_FNS = "src/lib/job-intelligence/employer-onboarding.functions.ts";
const ROUTE_TREE = "src/routeTree.gen.ts";

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
// G. Team & permissions: an owner can actually produce a colleague.
// ---------------------------------------------------------------------------
//
// The capability was complete in the database for months and had no interface:
// listAccessRequestsForMyEmployer and decideAccessRequest were written,
// wrapped and RLS-tested, and called from nowhere in the application. An owner
// told "a colleague with review authorisation must take this one" had no way
// to produce one. These assertions exist so that cannot silently become true
// again -- a server function with no call site is invisible to every other
// check in this repository.

{
  const team = stripComments(read(TEAM_PANEL));
  const join = stripComments(read(JOIN));
  const settings = stripComments(read(SETTINGS));
  const tree = read(ROUTE_TREE);

  // The owner's half is wired.
  for (const fn of ["listAccessRequestsForMyEmployer", "decideAccessRequest", "getEmployerTeam"]) {
    expect(
      team.includes(fn),
      `G: ${TEAM_PANEL} must call ${fn} -- it is the surface that makes the ` +
        `existing access-request model reachable by the customer.`,
    );
  }
  expect(
    settings.includes("<EmployerTeamPanel"),
    `G: the Organisation page must render the team panel.`,
  );

  // The invite is a link to the join route, carrying the organisation.
  expect(
    /\/employer\/join\?org=\$\{employerId\}/.test(team),
    `G: the invite control must produce /employer/join?org=<employerId>.`,
  );

  // The colleague's half is wired, and is a REQUEST -- never a membership.
  expect(join.includes("requestAccessToEmployer"), `G: ${JOIN} must call requestAccessToEmployer.`);
  expect(
    /org:\s*z\.string\(\)\.uuid\(\)/.test(join),
    `G: the join route must validate the organisation as a uuid.`,
  );
  expect(
    tree.includes("_authenticated.employer.join"),
    `G: the join route is not registered in the route tree. Run a build.`,
  );

  // The reason the previous self-service request page was removed was
  // DISCOVERY, not the request itself. That objection must stay answered:
  // no directory, no search, no name lookup on this page.
  for (const banned of ["findMatchingEmployers", "employers"]) {
    expect(
      !join.includes(banned),
      `G: ${JOIN} must not reach for an employer directory (${banned}). The ` +
        `organisation comes from the link and is never searched for.`,
    );
  }

  // No parallel membership architecture, and no privilege escalation path.
  for (const banned of [
    "adminCreateEmployerMembership",
    "adminUpdateEmployerMembershipRole",
    "adminUpdateEmployerMembershipStatus",
    "employer_memberships",
  ]) {
    expect(
      !team.includes(banned),
      `G: ${TEAM_PANEL} must not touch ${banned}. Membership is created only by ` +
        `approve_access_request(), which does its own owner/admin check.`,
    );
  }

  // Handing over the organisation is not a queue action.
  expect(
    !/grantedRole:\s*"owner"/.test(team),
    `G: approving a request must never grant the owner role.`,
  );
  // Only the three roles the database already has.
  const roles = [...team.matchAll(/grantedRole:\s*"([a-z]+)"/g)].map((m) => m[1]);
  for (const role of roles) {
    expect(
      role === "admin" || role === "member",
      `G: unknown employer role "${role}" -- the model is owner/admin/member and ` +
        `this pass introduces no new one.`,
    );
  }

  // Reviewer grant/revoke still goes through the governed functions.
  for (const fn of ["grantEmployerReviewer", "revokeEmployerReviewer"]) {
    expect(team.includes(fn), `G: ${TEAM_PANEL} must manage review access through ${fn}.`);
  }
  // Granting recruitment review must not silently drop a workforce scope the
  // person already holds.
  expect(
    /new Set\(\[\.\.\.m\.reviewerUseCases,\s*"recruitment"\]\)/.test(team),
    `G: granting recruitment review must preserve any existing use-case scope.`,
  );
}

// ---------------------------------------------------------------------------
// H. Self-review stays blocked, and stops being a dead end.
// ---------------------------------------------------------------------------

{
  const panel = stripComments(read(PANEL));
  const reviews = stripComments(read(REVIEWS));

  for (const [name, src] of [
    [PANEL, panel],
    [REVIEWS, reviews],
  ] as const) {
    // The protection itself.
    expect(
      src.includes("conflict:is_participant"),
      `H: ${name} must still recognise the self-review conflict.`,
    );
    expect(
      src.includes("academy.reviews.whyNotOwnResponses"),
      `H: ${name} must still say why a participant cannot review their own answers.`,
    );
    // The way out, and only for somebody who can actually take it.
    expect(
      src.includes("employer.team.manageLink") && src.includes("canManageReviewers"),
      `H: ${name} must offer "Hantera team & behörigheter" to a reader who can ` +
        `staff the team -- otherwise the block is a dead end.`,
    );
    expect(
      /hash="team"/.test(src),
      `H: ${name} must deep-link to the team section, not the top of the ` + `Organisation page.`,
    );
  }

  // The anchor the deep link needs.
  expect(
    /id="team"/.test(read(TEAM_PANEL)),
    `H: the team panel must carry id="team" for the deep link to land on.`,
  );
}

// ---------------------------------------------------------------------------
// I. The request queue identifies people, without becoming a contact export.
// ---------------------------------------------------------------------------

{
  const fns = stripComments(read(ONBOARDING_FNS));
  expect(
    fns.includes("requesterDisplayName"),
    `I: the access-request queue must resolve a display name -- an owner cannot ` +
      `decide about a UUID.`,
  );
  expect(
    !/select\("id, display_name, email|\bemail\b/.test(
      fns.split("listAccessRequestsForMyEmployer")[1]?.slice(0, 2000) ?? "",
    ),
    `I: the access-request queue must not return email addresses.`,
  );
}

// ---------------------------------------------------------------------------
// J. Both languages, for every key the team and join surfaces render.
// ---------------------------------------------------------------------------

{
  const sv = dictionaries.sv as Record<string, string>;
  const en = dictionaries.en as Record<string, string>;
  const rendered = [read(TEAM_PANEL), read(JOIN), read(SETTINGS), read(PANEL), read(REVIEWS)].join(
    "\n",
  );

  const used = new Set<string>();
  for (const m of rendered.matchAll(
    /["'`](employer\.(?:team|join|settings\.section)\.[a-zA-Z0-9.]+|academy\.reviews\.ownResponsesFix)["'`]/g,
  )) {
    used.add(m[1]);
  }

  expect(
    used.size >= 30,
    `J: expected the team/join keys to be found in the surfaces that render them, ` +
      `found ${used.size}. Has the scan stopped matching?`,
  );

  for (const key of [...used].sort()) {
    if (!sv[key]) errors.push(`J: dictionaries.sv is missing "${key}".`);
    if (!en[key]) errors.push(`J: dictionaries.en is missing "${key}".`);
    if (sv[key] && en[key] && sv[key] === en[key]) {
      // Verified as genuinely identical in both languages.
      const SAME_IS_FINE = new Set(["employer.team.col.status", "employer.team.col.person"]);
      if (!SAME_IS_FINE.has(key)) {
        errors.push(
          `J: "${key}" is identical in sv and en ("${sv[key]}") -- a missed translation.`,
        );
      }
    }
  }
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
