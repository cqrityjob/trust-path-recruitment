// Recruitment assessment UX guard — the invariants of Tester & bedömningar.
//
// Run via `bun run recruitment-assessment-ux:check`.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────
//
// This area was rebuilt around two rules, and both are the kind that fails
// silently. Nothing throws when a card loses its button; nothing throws when a
// list quietly starts showing employees again. Types still pass in both cases,
// and a screenshot taken on the wrong tenant looks fine.
//
//   RULE 1  A card that reports work must be the thing that opens the work.
//           The defect this whole rebuild came from was a candidate card
//           reading "Svar att granska: 10" with no control on it that led to
//           those ten responses. That is a dead end, and a dead end on the one
//           state where the employer is the blocker.
//
//   RULE 2  This area is recruitment. It sits under Rekrytering in the
//           sidebar, it is about people the organisation is considering, and
//           competence development for existing staff is a different product
//           with a different governance story. The two were merged once and
//           the merge is what made "Kandidater" a filter rather than a page.
//
// Everything below is one of those two rules, the vocabulary that expresses
// them, or the governance that must survive both.
//
// ── WHAT THIS FILE CANNOT DO ────────────────────────────────────────────
//
// It reads source and the dictionary. It does not run a browser, so it cannot
// prove that a click navigates — only that the control is built as a thing
// which navigates, carries the id its destination needs, and is reachable by
// keyboard because it is a real anchor or button rather than a div.

import { readFileSync } from "node:fs";
import { dictionaries } from "../src/i18n/dictionaries";

const failures: string[] = [];
let passed = 0;
const check = (label: string, ok: boolean, detail = "") => {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(detail ? `${label} — ${detail}` : label);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
};

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
/** Source with comments removed. Every assertion below is about what the file
 *  DOES, and a phrase quoted in a comment must never be able to satisfy one. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const R = "src/routes/_authenticated.employer.$employerSlug.";
const OVERVIEW_ROUTE = `${R}assessments.index.tsx`;
const CANDIDATES = `${R}assessments.participants.tsx`;
const REVIEWS = `${R}assessments.reviews.index.tsx`;
const REVIEW_ATTEMPT = `${R}assessments.reviews.$attemptId.tsx`;
const RESULTS = `${R}assessments.results.$attemptId.tsx`;
const LANDING = `${R}index.tsx`;
const OVERVIEW = "src/components/academy/AcademyOverview.tsx";
const WORKSPACE = "src/components/academy/AcademyWorkspace.tsx";
const LIBRARY = "src/components/academy/ContentLibrary.tsx";
const DECISION_PANEL = "src/components/academy/EmployerDecisionPanel.tsx";

const candidates = stripComments(read(CANDIDATES));
const reviews = stripComments(read(REVIEWS));
const overview = stripComments(read(OVERVIEW));
const overviewRoute = stripComments(read(OVERVIEW_ROUTE));
const workspace = stripComments(read(WORKSPACE));
const library = stripComments(read(LIBRARY));
const landing = stripComments(read(LANDING));

const sv = dictionaries.sv as Record<string, string>;
const en = dictionaries.en as Record<string, string>;

/** The source of one JSX element, from its opening tag to a generous tail, so
 *  `to`, `params` and `search` on the same element can be asserted together
 *  rather than anywhere in the file. */
function elementWithTarget(src: string, to: string, from = 0): string | null {
  const at = src.indexOf(`to="${to}"`, from);
  if (at === -1) return null;
  const open = src.lastIndexOf("<", at);
  return src.slice(open, at + 500);
}

// ---------------------------------------------------------------------------
console.log("\n1. The information architecture is four tabs, named for the employer");
{
  const tabs = workspace.slice(
    workspace.indexOf("const ASSESSMENT_TABS"),
    workspace.indexOf("const TRAINING_TABS"),
  );
  const expected: [string, string][] = [
    ["/employer/$employerSlug/assessments", "academy.nav.overview"],
    ["/employer/$employerSlug/assessments/library", "academy.nav.library"],
    ["/employer/$employerSlug/assessments/participants", "academy.nav.candidates"],
    ["/employer/$employerSlug/assessments/reviews", "academy.nav.reviews"],
  ];
  for (const [to, label] of expected) {
    check(
      `tab ${label} points at ${to}`,
      new RegExp(`to: "${to.replace(/\$/g, "\\$")}",\\s*label: "${label}"`).test(tabs),
    );
  }
  check("there is no fifth tab", (tabs.match(/label: "/g) ?? []).length === 4);

  check(
    "the tabs read Översikt / Testbibliotek / Kandidater / Granskning",
    sv["academy.nav.overview"] === "Översikt" &&
      sv["academy.nav.library"] === "Testbibliotek" &&
      sv["academy.nav.candidates"] === "Kandidater" &&
      sv["academy.nav.reviews"] === "Granskning",
    [
      sv["academy.nav.overview"],
      sv["academy.nav.library"],
      sv["academy.nav.candidates"],
      sv["academy.nav.reviews"],
    ].join(" / "),
  );
}

// ---------------------------------------------------------------------------
console.log("\n2. RULE 1 — every state that has work has the control that clears it");
{
  // The one this rebuild exists for. A candidate card in under_review must
  // carry a link to the review workspace for THAT attempt.
  const el = elementWithTarget(
    candidates,
    "/employer/$employerSlug/assessments/reviews/$attemptId",
  );
  check("the candidate card links to the review workspace", el !== null);
  check(
    "and carries the attempt the card is about",
    el !== null && /attemptId:\s*row\.attemptId/.test(el),
    el ?? "",
  );
  check(
    "and it is an anchor, so it is keyboard-activable by construction",
    el !== null && el.trimStart().startsWith("<Link"),
  );
  check(
    "the review link is rendered exactly on the under_review state",
    /state === "under_review" && \(\s*<Link\s+to="\/employer\/\$employerSlug\/assessments\/reviews\/\$attemptId"/.test(
      candidates,
    ),
  );
  check(
    "its label is Granska svar",
    candidates.includes('t("academy.participants.ctaReview")') &&
      sv["academy.participants.ctaReview"] === "Granska svar",
    sv["academy.participants.ctaReview"],
  );

  // The finished state opens the brief that already exists.
  const brief = elementWithTarget(
    candidates,
    "/employer/$employerSlug/assessments/results/$attemptId",
  );
  check("the finished card opens the candidate brief", brief !== null);
  check(
    "and carries the application forward when it has one, so the brief knows who it is about",
    brief !== null && /search=\{applicationId \? \{ application: applicationId \}/.test(brief),
    brief ?? "",
  );
  check(
    "its label is Öppna kandidatunderlag",
    candidates.includes('t("academy.participants.ctaOpenBrief")') &&
      sv["academy.participants.ctaOpenBrief"] === "Öppna kandidatunderlag",
    sv["academy.participants.ctaOpenBrief"],
  );

  // No card is ever a greyed-out rectangle with no explanation.
  check(
    "a state with no control still says why, in words",
    /function supportText\(/.test(candidates) &&
      /case "ready_to_release":/.test(candidates) &&
      /case "under_review":/.test(candidates),
  );
  check("and the card renders that sentence", /\{supportText\(/.test(candidates));
}

// ---------------------------------------------------------------------------
console.log("\n3. RULE 2 — this area is recruitment, with no employee filter to get wrong");
{
  check(
    "the candidate list filters to recruitment rows",
    /rows\.filter\(\(r\) => r\.useCase === "recruitment"\)/.test(candidates),
  );
  check(
    "the overview counts recruitment rows",
    /\.filter\(\(r\) => r\.useCase === "recruitment"\)/.test(overview),
  );
  check(
    "the review queue drops rows it knows to be workforce",
    /useCase === "recruitment"/.test(reviews),
  );
  check(
    "the employer landing card counts the same population it links into",
    /\.filter\(\(r\) => r\.useCase === "recruitment"\)/.test(landing),
  );

  // The audience toggle is gone, and cannot come back by accident: the strings
  // it was built from no longer exist.
  for (const key of [
    "academy.participants.filterEmployees",
    "academy.participants.filterCandidates",
    "academy.participants.contextEmployee",
    "academy.participants.contextCandidate",
    "academy.participants.contextFilter",
  ]) {
    check(`the audience toggle string ${key} is gone`, sv[key] === undefined);
  }
  check(
    "no audience state survives in the candidate list",
    !/setContext|"workforce"/.test(candidates),
  );
  check(
    "and the workforce person link is gone from it",
    !candidates.includes("/employer/$employerSlug/workforce/$personId"),
  );

  // The library shows recruitment content only, and stops labelling every row
  // with the one category it holds.
  check(
    "the recruitment library is still filtered by governed designed_for",
    /if \(area === "workforce"\) return e\.libraryKind === "training";/.test(library) &&
      /e\.designedFor === "recruitment_support"/.test(library),
  );
  check(
    "and the kind / recruitment chips only render in the workforce library",
    /\{area === "workforce" && <KindChip/.test(library) &&
      /\{area === "workforce" && <RecruitmentChip/.test(library),
  );
}

// ---------------------------------------------------------------------------
console.log("\n4. The filters name states the employer recognises, and match what they select");
{
  const filters = ["all", "active", "under_review", "ready_to_release", "result_available"];
  for (const f of filters) {
    check(`the ${f} filter exists in the URL schema`, candidates.includes(`"${f}"`));
  }
  // Every non-"all" filter has a predicate, and every predicate a label.
  const matches = candidates.slice(
    candidates.indexOf("const MATCHES"),
    candidates.indexOf("const STATE_LABEL"),
  );
  for (const f of filters.slice(1)) {
    check(`the ${f} filter has a predicate`, matches.includes(`${f}:`));
  }
  check(
    "active means invited OR started, because to an employer both mean sent out",
    /active: \(s\) => s === "invited" \|\| s === "in_progress"/.test(matches),
  );

  const labels: [string, string][] = [
    ["academy.participants.filterStateAll", "Alla"],
    ["academy.participants.filterOngoing", "Pågående"],
    ["academy.participants.filterUnderReview", "Väntar på granskning"],
    ["academy.participants.filterReady", "Underlag klart"],
    ["academy.participants.filterCompleted", "Slutförda"],
  ];
  for (const [key, expected] of labels) {
    check(`the filter chip ${key} reads "${expected}"`, sv[key] === expected, sv[key]);
  }
}

// ---------------------------------------------------------------------------
console.log("\n5. The lifecycle state is the database's, never rebuilt in the client");
{
  // scp_attempt_lifecycle_state decides when review completion moves a
  // candidate to the ready state. Two surfaces deriving that themselves is how
  // they end up telling one employer two different things about one attempt.
  for (const [name, src] of [
    ["the candidate list", candidates],
    ["the overview", overview],
    ["the review queue", reviews],
  ] as const) {
    check(
      `${name} reads lifecycleState rather than deriving it`,
      /lifecycleState/.test(src) && !/lifecycleState\s*=\s*[^=]/.test(src),
    );
  }
  check(
    "and the ready state is still the server's own gate on sharing",
    /row\.canRelease/.test(candidates),
  );
}

// ---------------------------------------------------------------------------
console.log(
  "\n6. Identity: the application's name where there is one, the reference where there is not",
);
{
  // ── THE RULE ────────────────────────────────────────────────────────
  //
  //   assessment came from a job application  ->  the candidate's name
  //   assessment sent straight to an address  ->  the pseudonymous reference
  //
  // The name is the employer's OWN application record, read through the call
  // the applications page already makes. What must never happen is a second
  // access path appearing here: a direct profiles read, a subject-identity
  // join, or a bulk identity resolution.
  check(
    "the name comes from the governed applications read model",
    /listApplicationsForEmployer/.test(candidates),
  );
  check(
    "on the same query key the applications page uses, so the two cannot disagree",
    /queryKey: \["employer", employerId, "applications"\]/.test(candidates),
  );
  check(
    "and no second access path to a person was opened",
    !/from\("profiles"\)|supabaseAdmin|scp_subject_identities|subject_identities/.test(candidates),
  );
  check(
    "the card renders that name when the application supplies one",
    /\{candidate\?\.name \? \(/.test(candidates) && /\{candidate\.name\}/.test(candidates),
  );
  check(
    "and falls back to the governed reference when nothing identified the person",
    /row\.participantRef/.test(candidates),
  );
  check(
    "never the employment-record name, which is the workforce product's disclosure",
    !/participantName/.test(candidates),
  );

  // Blind assessment is a real governed context, and it is Granskning.
  check(
    "the review queue stays pseudonymous",
    /a\?\.participantRef/.test(reviews) && !/participantName/.test(reviews),
  );
  check(
    "and reads no application identity at all",
    !/listApplicationsForEmployer/.test(reviews) && !/applicantDisplayName/.test(reviews),
  );
  check(
    "the review workspace names no candidate either",
    !/listApplicationsForEmployer/.test(stripComments(read(REVIEW_ATTEMPT))),
  );

  check(
    "the rule is stated to the reader rather than left to be inferred",
    candidates.includes('t("academy.participants.referenceExplain")') &&
      /[Rr]eferens/.test(sv["academy.participants.referenceExplain"] ?? "") &&
      /namn/i.test(sv["academy.participants.referenceExplain"] ?? ""),
    sv["academy.participants.referenceExplain"],
  );
  check(
    "resolving one identity is unchanged and still asks the server",
    /resolveParticipantIdentity/.test(candidates) && /row\.identityResolvable/.test(candidates),
  );
  check(
    "and no bulk identity resolution was added anywhere",
    !/resolveParticipantIdentity/.test(reviews) && !/resolveParticipantIdentity/.test(overview),
  );

  // The brief names the candidate only when it was opened from an application.
  const results = stripComments(read(RESULTS));
  check(
    "the candidate brief names the person only when an application id came with the link",
    /enabled: Boolean\(applicationId\)/.test(results) &&
      /applicationId\s*\?[\s\S]{0,200}applicantDisplayName/.test(results),
  );
}

// ---------------------------------------------------------------------------
console.log("\n7. Assessment gives evidence; the recruitment decision stays in the application");
{
  const panel = stripComments(read(DECISION_PANEL));
  const verdicts = /\b(hire|hired|reject|rejected|unsuitable|suitable)\b/i;
  for (const [name, src] of [
    ["the candidate list", candidates],
    ["the review queue", reviews],
    ["the overview", overview],
    ["the report decision panel", panel],
  ] as const) {
    check(`${name} records no hiring verdict`, !verdicts.test(src));
  }
  check(
    "and no assessment surface calls the application status mutation",
    !/setApplicationStatus|set_application_status/.test(candidates + reviews + overview),
  );
  check(
    "the candidate's own page is where the assessment surface sends you for the decision",
    candidates.includes("/employer/$employerSlug/applications/$applicationId"),
  );
}

// ---------------------------------------------------------------------------
console.log("\n8. Every number on Översikt is a door, and the door matches the number");
{
  const tiles: [string, string, string][] = [
    ["academy.overview.active", "/employer/$employerSlug/assessments/participants", "active"],
    [
      "academy.overview.awaitingReviewUnified",
      "/employer/$employerSlug/assessments/reviews",
      "all",
    ],
    [
      "academy.overview.readyToRelease",
      "/employer/$employerSlug/assessments/participants",
      "ready_to_release",
    ],
    [
      "academy.overview.released",
      "/employer/$employerSlug/assessments/participants",
      "result_available",
    ],
  ];
  for (const [label, to, value] of tiles) {
    const at = overview.indexOf(`label="${label}"`);
    check(`the ${label} tile exists`, at !== -1);
    if (at === -1) continue;
    const el = overview.slice(overview.lastIndexOf("<", at), at + 900);
    check(`and it links to ${to}`, el.includes(`to="${to}"`), el);
    check(`and it carries ${value}`, el.includes(`"${value}"`), el);
  }
  check(
    "the tiles are anchors, not buttons that print a number",
    (overview.match(/<StatLink/g) ?? []).length === 4 && /<Link/.test(overview),
  );
  check(
    "a tile that has no answer yet shows a dash rather than a wrong zero",
    /loading \? <span[^>]*>&mdash;<\/span> : value/.test(overview),
  );

  check("Att göra nu is on the page", overview.includes('t("academy.overview.todoTitle")'));
  check(
    "with the review queue as its primary action",
    overview.includes('t("academy.overview.openReviewQueue")'),
  );
  check(
    "and the candidate list as its secondary",
    overview.includes('t("academy.overview.openParticipants")'),
  );
  check(
    "an employer with nothing outstanding is told so",
    overview.includes('t("academy.overview.todoNothing")'),
  );
  check(
    "methodology is behind a disclosure rather than above the numbers",
    /<details/.test(overview) && overview.includes('t("academy.overview.howItWorksBody")'),
  );
  check(
    "and the overview route carries nothing but the overview",
    !/useCase\.development|catalogueHeading|roleCategory/.test(overviewRoute),
  );
}

// ---------------------------------------------------------------------------
console.log("\n9. The review queue is a queue: whose, how much, how far, and one way in");
{
  check(
    "each row leads to the review workspace for its attempt",
    /to="\/employer\/\$employerSlug\/assessments\/reviews\/\$attemptId"/.test(reviews),
  );
  check(
    "a part-finished review says so, and invites you to continue rather than to start",
    /reviewed > 0 \? "academy\.reviews\.reviewContinue" : "academy\.reviews\.review"/.test(reviews),
  );
  check(
    "the outstanding count is a sentence, not a bare integer",
    /tp\("academy\.reviews\.responsesLeft"/.test(reviews),
  );
  check(
    "the review workspace still exists and still reaches the queue it came from",
    read(REVIEW_ATTEMPT).includes('to="/employer/$employerSlug/assessments/reviews"'),
  );
  check(
    "a row nobody may act on explains itself instead of showing a dead button",
    /academy\.reviews\.whyNotAuthorised/.test(reviews) && !/disabled/.test(reviews),
  );
}

// ---------------------------------------------------------------------------
console.log("\n10. One brief. The finished state opens the one that already exists");
{
  const results = read(RESULTS);
  check(
    "the candidate brief route is the existing decision-support report",
    results.includes("DecisionSupportSummary") && results.includes("CandidateBrief"),
  );
  check(
    "and the candidate list opens it rather than a second one",
    (candidates.match(/assessments\/results\/\$attemptId/g) ?? []).length === 1,
  );
}

// ---------------------------------------------------------------------------
console.log("\n11. Employer language, not implementation language");
{
  // The exact phrases the rebuild retired. A dictionary that still holds them
  // is a dictionary somebody can put back on a screen.
  const RETIRED_SV = [
    "Genomförda tester att granska",
    "Klart att delas",
    "Klara att delas",
    "Tilldelade tester",
    "Bedömningsbibliotek",
  ];
  for (const phrase of RETIRED_SV) {
    const hits = Object.keys(sv).filter((k) => sv[k] === phrase);
    check(`no key still reads "${phrase}"`, hits.length === 0, hits.join(", "));
  }

  // Implementation vocabulary must not surface as a primary label. Checked on
  // the labels this area renders, not on the whole dictionary: an audit trail
  // and an admin console are allowed to name the objects they administer.
  const LABEL_KEYS = [
    ...Object.keys(sv).filter((k) => k.startsWith("academy.nav.")),
    ...Object.keys(sv).filter((k) => k.startsWith("academy.participants.filter")),
    "academy.overview.active",
    "academy.overview.awaitingReviewUnified",
    "academy.overview.readyToRelease",
    "academy.overview.released",
    "academy.overview.todoTitle",
  ];
  const machine = /\b(attempt|attempts|försök|assignment|assignments|run|runs)\b/i;
  const leaks = LABEL_KEYS.filter((k) => machine.test(sv[k] ?? "") || machine.test(en[k] ?? ""));
  check(
    "no tab, filter or tile label names an attempt, assignment or run",
    leaks.length === 0,
    leaks.join(", "),
  );

  // The vocabulary the owner asked for, verbatim.
  const REQUIRED: [string, string, string][] = [
    ["academy.library.title", "Testbibliotek", "Test library"],
    ["academy.library.assign", "Tilldela kandidat", "Assign to candidate"],
    ["academy.participants.title", "Kandidater", "Candidates"],
    ["academy.reviews.title", "Granskning", "Review"],
    ["academy.reviews.review", "Granska svar", "Review responses"],
    ["lifecycle.recruitment.under_review", "Väntar på granskning", "Waiting for review"],
    ["lifecycle.recruitment.ready_to_release", "Underlag klart", "Brief ready"],
    ["lifecycle.recruitment.result_available", "Slutförd", "Completed"],
  ];
  for (const [key, wantSv, wantEn] of REQUIRED) {
    check(`${key} reads "${wantSv}"`, sv[key] === wantSv, sv[key]);
    check(`${key} reads "${wantEn}" in English`, en[key] === wantEn, en[key]);
  }

  // The candidate page chip and this area must not drift apart again.
  check(
    "the application-page chip uses the same recruitment words",
    sv["journey.stage.under_review"] === sv["lifecycle.recruitment.under_review"] &&
      sv["journey.stage.ready_to_release"] === sv["lifecycle.recruitment.ready_to_release"] &&
      sv["journey.stage.report_available"] === sv["lifecycle.recruitment.result_available"],
  );
  check(
    "and the employer landing card counts by the same name as the overview tile",
    sv["employer.overview.card.tests.stat.readyToRelease"] ===
      sv["academy.overview.readyToRelease"],
    `${sv["employer.overview.card.tests.stat.readyToRelease"]} / ${sv["academy.overview.readyToRelease"]}`,
  );
}

// ---------------------------------------------------------------------------
console.log("\n12. SV / EN parity for everything this area renders");
{
  const AREA = [
    "academy.nav.",
    "academy.overview.",
    "academy.participants.",
    "academy.reviews.",
    "academy.library.",
  ];
  const keys = Object.keys(sv).filter((k) => AREA.some((p) => k.startsWith(p)));
  const missing = keys.filter((k) => !en[k] || !String(en[k]).trim());
  check(
    `all ${keys.length} keys in this area have English`,
    missing.length === 0,
    missing.slice(0, 8).join(", "),
  );

  // Plural pairs are complete, or tp() renders a raw key at a real employer.
  const ones = keys.filter((k) => k.endsWith(".one"));
  const brokenPairs = ones.filter(
    (k) => !sv[k.replace(/\.one$/, ".other")] || !en[k.replace(/\.one$/, ".other")],
  );
  check(
    `all ${ones.length} plural pairs are complete in both languages`,
    brokenPairs.length === 0,
    brokenPairs.join(", "),
  );
}

// ---------------------------------------------------------------------------
console.log("\n13. Reachable by keyboard, usable on a phone");
{
  for (const [name, src] of [
    ["the candidate list", candidates],
    ["the review queue", reviews],
    ["the overview", overview],
  ] as const) {
    // A div with an onClick is not focusable and not activable by Enter. Every
    // control on these pages has to be a real anchor or a real button.
    check(
      `${name} has no click handler on a non-interactive element`,
      !/<(div|span|li|article)[^>]*onClick/.test(src),
    );
    // Every control states its own focus ring: the pages' controls are custom
    // styled, so the browser default outline is overridden and has to be
    // replaced deliberately.
    const opens: number[] = [];
    const tag = /<(Link|button)\b/g;
    for (let m = tag.exec(src); m !== null; m = tag.exec(src)) opens.push(m.index);
    const controls = opens.map((at, i) => src.slice(at, opens[i + 1] ?? at + 1200));
    const unfocusable = controls.filter((c) => !c.includes("focus-visible:ring"));
    check(
      `${name}: all ${controls.length} controls carry a visible focus ring`,
      unfocusable.length === 0,
      String(unfocusable.length),
    );
  }
  // Tap targets. 44px is the smallest reliable one on a touch screen; h-10 is
  // 40px plus padding inside a list row and h-11 is 44px.
  check(
    "the primary controls on a candidate card are full-size tap targets",
    (candidates.match(/inline-flex h-11 items-center/g) ?? []).length >= 4,
  );
  check(
    "the filter chips wrap rather than overflow on a narrow screen",
    /flex flex-wrap gap-1/.test(candidates),
  );
  check(
    "the overview tiles stack on a phone and spread on a desktop",
    /grid gap-4 sm:grid-cols-2 lg:grid-cols-4/.test(overview),
  );
}

// ---------------------------------------------------------------------------
console.log("\n14. The purpose an employer affirms is the purpose they are assigning for");
{
  // This panel stated the competence-development purpose on every assignment,
  // including one made from Testbibliotek to a recruitment candidate: the
  // wrong purpose, to the wrong person, about the wrong process, on the exact
  // screen where an employer affirms what they are collecting evidence for.
  check(
    "the affirmation chooses its copy from the library area",
    /const recruitment = area === "recruitment";/.test(library),
  );
  for (const [generic, specific] of [
    ["academy.assign.purposeDevelopment", "academy.assign.purposeRecruitment"],
    ["academy.assign.purposeNotSelection", "academy.assign.purposeNotSelectionRecruitment"],
    ["academy.assign.purposeConfirm", "academy.assign.purposeConfirmRecruitment"],
  ]) {
    check(`${specific} is rendered in place of ${generic}`, library.includes(specific));
    check(`${specific} exists in both languages`, Boolean(sv[specific] && en[specific]));
  }
  check(
    "the recruitment purpose says it supports the recruitment, not employee follow-up",
    /rekryteringsprocessen/i.test(sv["academy.assign.purposeRecruitment"] ?? "") &&
      !/kompetensutveckling|medarbetare/i.test(sv["academy.assign.purposeRecruitment"] ?? ""),
    sv["academy.assign.purposeRecruitment"],
  );
  check(
    "and that the employer makes the final decision",
    /slutliga beslutet/i.test(sv["academy.assign.purposeRecruitment"] ?? "") &&
      /final decision/i.test(en["academy.assign.purposeRecruitment"] ?? ""),
  );
  // The DECISION MODEL is unchanged: whichever variant is shown, the boundary
  // it states is the same one.
  for (const key of [
    "academy.assign.purposeNotSelection",
    "academy.assign.purposeNotSelectionRecruitment",
  ]) {
    check(
      `${key} still rules out pass/fail, suitability and ranking`,
      /godkänt eller underkänt/i.test(sv[key] ?? "") &&
        /lämplighetsbedömning/i.test(sv[key] ?? "") &&
        /rangordning/i.test(sv[key] ?? ""),
      sv[key],
    );
  }
  check(
    "the workforce copy is untouched",
    sv["academy.assign.purposeDevelopment"] ===
      "Underlaget samlas in för kompetensutveckling och uppföljning av medarbetare.",
  );
}

// ---------------------------------------------------------------------------
console.log('\n15. "Utfall" is gone from every employer-facing control');
{
  const utfall = Object.keys(sv).filter((k) => sv[k] === "Utfall" || en[k] === "Outcome");
  check("no label reads Utfall / Outcome", utfall.length === 0, utfall.join(", "));
  check(
    "the interview-notes control says what it actually records",
    sv["brief.notes.outcome"] === "Vad intervjun visade" &&
      en["brief.notes.outcome"] === "What the interview showed",
    `${sv["brief.notes.outcome"]} / ${en["brief.notes.outcome"]}`,
  );
  // Its options are confirmation states, not grades — which is why the label
  // is not "Intervjubedömning": the panel's own lede says these notes are
  // never converted into a judgement, and a label promising one would
  // contradict the sentence directly above it.
  check(
    "and its options are still confirmation states rather than a score",
    /intervju/i.test(sv["brief.notes.evidence_confirmed"] ?? "") &&
      /intervju/i.test(sv["brief.notes.evidence_not_confirmed"] ?? ""),
  );
}

// ---------------------------------------------------------------------------
if (failures.length > 0) {
  console.error(
    `\nrecruitment-assessment-ux-check: FAIL (${failures.length} of ${passed + failures.length})`,
  );
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`\nrecruitment-assessment-ux-check: PASS (${passed} assertions)`);
