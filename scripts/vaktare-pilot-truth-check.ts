// Väktare pilot truth guard — what the candidate is told is what is true.
//
// Run via `bun run vaktare-pilot-truth:check`.
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────
//
// The baseline audit of the Väktare Recruitment Assessment (2026-09-02) found
// three sentences shown to every candidate that were not true of the product:
//
//   "Vissa svar granskas av en person hos CQrityjob."
//       The reviewer is an authorised person at the EMPLOYER (#51 moved
//       review authorisation onto scp_employer_reviewers). CQrityjob staff
//       with no membership review nothing.
//
//   "… aldrig dina enskilda svar."
//       That employer's authorised reviewer reads free-text answers verbatim
//       in the review queue.
//
//   "Bedöm en kandidats lämplighet … inför ett anställningsbeslut."
//       The instrument carries no suitability judgement and makes no hiring
//       decision; six other strings say so.
//
// And one terminology collision: "områden"/"areas" was the word for both the
// 5 form sections and the 8 evidenced competencies, so the two numbers read
// as a contradiction.
//
// None of that fails a type check or a build. Copy regresses silently, so
// this reads the dictionary and the surfaces and asserts:
//
//   D  no stale claim that CQrityjob is the human reviewer, SV and EN;
//   E  the truthful authorised-employer-reviewer disclosure exists where the
//      candidate reads it: the academy home, the run intro, the closing
//      screen;
//   F  5 parts and 8 competencies are named with different words and under
//      different headings;
//   G  task count and duration are derived from the form, never typed into
//      copy, and the candidate is told both before starting;
//   J  no affirmative hire / reject / rank / pass / fail / suitability claim
//      in any candidate-facing sentence (negations -- "no pass or fail" --
//      are what the product is SUPPOSED to say, and are allowed);
//   K  AI stays off: the reviewer proposal is inert and the copy that says
//      "not by a model" is bound to it.
//
// It reads source and the dictionary. It cannot prove a screen is shown; it
// proves the sentence the screen would show is the true one.

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
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const sv = dictionaries.sv as Record<string, string>;
const en = dictionaries.en as Record<string, string>;

const RUNNER = "src/routes/_authenticated.academy.$attemptId.tsx";
const HOME = "src/routes/_authenticated.academy.index.tsx";
const LIBRARY = "src/components/academy/ContentLibrary.tsx";
const REVIEW_QUEUE = "src/components/academy/ReviewQueue.tsx";
const PANELS = "src/components/academy/AttemptPanels.tsx";

/** Every dictionary key a CANDIDATE can read on the assessment journey:
 *  the academy home, the run (intro, sections, items, saving, submitting,
 *  closing), the participant report's own explanations, and the retired
 *  invite page. Employer-only surfaces are not in here on purpose -- they
 *  legitimately discuss suitability in the negative at length. */
const CANDIDATE_PREFIXES = [
  "academy.home.",
  "academy.intro.",
  "academy.section.",
  "academy.asks.",
  "academy.language.",
  "academy.save.",
  "academy.incomplete.",
  "academy.submitFailed.",
  "academy.done.",
  "academy.error.",
  "invite.retired.",
];
const CANDIDATE_KEYS = [
  "academy.eyebrow",
  "academy.eyebrowRecruitment",
  "academy.start",
  "academy.resume",
  "academy.loading",
  "academy.stage",
  "academy.next",
  "academy.submit",
  "academy.submitting",
  "academy.safetyCritical",
  "academy.bestLegend",
  "academy.worstLegend",
  "academy.writtenAnswer",
  "academy.writtenPlaceholder",
  "academy.writtenNote",
  "academy.selfReportBadge",
  "academy.report.whatThisIs",
  "academy.report.humanDecides",
  "academy.report.notInability",
  "academy.report.humanReviewOccurred",
  "academy.report.safetyConcernNoted",
  "academy.report.employerDecides",
];
const candidateKeys = Object.keys(sv).filter(
  (k) => CANDIDATE_KEYS.includes(k) || CANDIDATE_PREFIXES.some((p) => k.startsWith(p)),
);

// ═══════════════════════════════════════════════════════════════════════
console.log("\nD. No stale claim that CQrityjob is the human reviewer");
{
  const STALE_SV = /(person|någon|granskare|människa)\s+(hos|på|från)\s+CQrityjob/i;
  const STALE_EN = /(person|someone|reviewer|human)\s+(at|from)\s+CQrityjob/i;
  const CQ_REVIEWS = /CQrityjob\s+(granskar|läser|bedömer|reviews|reads|assesses)/i;
  const badSv = candidateKeys.filter(
    (k) => STALE_SV.test(sv[k] ?? "") || CQ_REVIEWS.test(sv[k] ?? ""),
  );
  const badEn = candidateKeys.filter(
    (k) => STALE_EN.test(en[k] ?? "") || CQ_REVIEWS.test(en[k] ?? ""),
  );
  check(
    "D1 no candidate-facing SV sentence says a person at CQrityjob reviews",
    badSv.length === 0,
    badSv.join(", "),
  );
  check(
    "D2 no candidate-facing EN sentence says a person at CQrityjob reviews",
    badEn.length === 0,
    badEn.join(", "),
  );
  // The whole dictionary, not only the candidate keys: the same false claim
  // must not be moved to an employer surface either.
  const anySv = Object.keys(sv).filter((k) => STALE_SV.test(sv[k] ?? ""));
  const anyEn = Object.keys(en).filter((k) => STALE_EN.test(en[k] ?? ""));
  check("D3 nowhere in the dictionary (SV)", anySv.length === 0, anySv.join(", "));
  check("D4 nowhere in the dictionary (EN)", anyEn.length === 0, anyEn.join(", "));
  // The specific key the audit found, by name.
  check(
    "D5 academy.home.nextReview names the employer's authorised reviewer",
    /behörig granskare hos arbetsgivaren/i.test(sv["academy.home.nextReview"]) &&
      /authorised reviewer at the employer/i.test(en["academy.home.nextReview"]),
  );
  // "never your individual answers" is false: the employer's reviewer reads
  // free-text answers verbatim in the review queue.
  const NEVER_SV = /aldrig dina enskilda svar/i;
  const NEVER_EN = /never your individual answers/i;
  const neverSv = Object.keys(sv).filter((k) => NEVER_SV.test(sv[k] ?? ""));
  const neverEn = Object.keys(en).filter((k) => NEVER_EN.test(en[k] ?? ""));
  check(
    "D6 no copy claims the employer never sees an individual answer (SV)",
    neverSv.length === 0,
    neverSv.join(", "),
  );
  check(
    "D7 no copy claims the employer never sees an individual answer (EN)",
    neverEn.length === 0,
    neverEn.join(", "),
  );
  const queue = stripComments(read(REVIEW_QUEUE));
  check(
    "D8 the fact behind D6/D7: the employer's reviewer is shown the response text",
    /responseText/.test(queue),
  );
}

// ═══════════════════════════════════════════════════════════════════════
console.log("\nE. The truthful disclosure exists where the candidate reads it");
{
  const REVIEWER_SV = /behörig granskare hos (din )?arbetsgivare(n)?/i;
  const REVIEWER_EN = /authorised reviewer at (your|the) employer/i;
  const NO_DECISION_SV = /CQrityjob fattar inte beslut om anställning/i;
  const NO_DECISION_EN = /CQrityjob does not make employment decisions/i;
  const NOT_MODEL_SV = /inte av en modell|ingen modell/i;
  const NOT_MODEL_EN = /not by a model|no model/i;
  const HUMAN_PROCESS_SV = /mänsklig rekryteringsprocess/i;
  const HUMAN_PROCESS_EN = /human recruitment process/i;

  for (const k of [
    "academy.intro.reviewRecruitment",
    "academy.home.privacyRecruitment",
    "academy.home.nextReview",
    "academy.done.reviewPending",
    "academy.intro.review",
    "academy.home.privacy",
  ]) {
    check(
      `E1 ${k} names an authorised reviewer at the employer (SV)`,
      REVIEWER_SV.test(sv[k] ?? ""),
      sv[k],
    );
    check(
      `E2 ${k} names an authorised reviewer at the employer (EN)`,
      REVIEWER_EN.test(en[k] ?? ""),
      en[k],
    );
  }
  for (const k of ["academy.intro.reviewRecruitment", "academy.home.privacyRecruitment"]) {
    check(
      `E3 ${k} says CQrityjob makes no employment decision (SV)`,
      NO_DECISION_SV.test(sv[k] ?? ""),
    );
    check(
      `E4 ${k} says CQrityjob makes no employment decision (EN)`,
      NO_DECISION_EN.test(en[k] ?? ""),
    );
  }
  check(
    "E5 the recruitment intro says the assessment feeds a HUMAN recruitment process",
    HUMAN_PROCESS_SV.test(sv["academy.intro.reviewRecruitment"]) &&
      HUMAN_PROCESS_EN.test(en["academy.intro.reviewRecruitment"]),
  );
  for (const k of [
    "academy.intro.review",
    "academy.intro.reviewRecruitment",
    "academy.home.privacy",
    "academy.home.privacyRecruitment",
    "academy.writtenNote",
  ]) {
    check(
      `E6 ${k} says no model assesses the answer`,
      NOT_MODEL_SV.test(sv[k] ?? "") && NOT_MODEL_EN.test(en[k] ?? ""),
    );
  }
  check(
    "E7 free-text answers are named as what the reviewer may read (recruitment)",
    /fritextsvar/i.test(sv["academy.intro.reviewRecruitment"]) &&
      /written answers/i.test(en["academy.intro.reviewRecruitment"]) &&
      /fritextsvar/i.test(sv["academy.home.privacyRecruitment"]) &&
      /written answers/i.test(en["academy.home.privacyRecruitment"]),
  );
  // The recruitment variants must not address the applicant as an employee.
  for (const k of [
    "academy.intro.reviewRecruitment",
    "academy.home.privacyRecruitment",
    "academy.home.nextReview",
  ]) {
    check(
      `E8 ${k} does not call the hiring organisation "your employer"`,
      !/din arbetsgivare/i.test(sv[k] ?? "") && !/your employer/i.test(en[k] ?? ""),
    );
  }
  const runner = stripComments(read(RUNNER));
  check(
    "E9 the run intro renders the disclosure before the first task",
    /t\(recruitment \? "academy\.intro\.reviewRecruitment" : "academy\.intro\.review"\)/.test(
      runner,
    ) &&
      runner.indexOf("academy.intro.reviewRecruitment") <
        runner.indexOf('t("academy.intro.structureHeading")'),
  );
  const home = stripComments(read(HOME));
  check(
    "E10 the academy home still renders the privacy line and the review step",
    /academy\.home\.privacyRecruitment/.test(home) && /academy\.home\.nextReview/.test(home),
  );
  const panels = stripComments(read(PANELS));
  check(
    "E11 the closing screen still renders the review-pending note",
    /academy\.done\.reviewPending/.test(panels),
  );
}

// ═══════════════════════════════════════════════════════════════════════
console.log("\nF. 5 parts and 8 competencies are two words under two headings");
{
  check(
    "F1 parts and competencies are labelled with different words (SV)",
    sv["academy.library.areas"].toLowerCase() !==
      sv["academy.library.competencies"].toLowerCase() &&
      !/områden/i.test(sv["academy.library.areas"]) &&
      !/områden/i.test(sv["academy.library.competencies"]),
    `${sv["academy.library.areas"]} / ${sv["academy.library.competencies"]}`,
  );
  check(
    "F2 parts and competencies are labelled with different words (EN)",
    en["academy.library.areas"].toLowerCase() !==
      en["academy.library.competencies"].toLowerCase() &&
      !/\bareas?\b/i.test(en["academy.library.areas"]) &&
      !/\bareas?\b/i.test(en["academy.library.competencies"]),
    `${en["academy.library.areas"]} / ${en["academy.library.competencies"]}`,
  );
  check(
    "F3 the established product words: testdelar/parts and kompetenser/competencies",
    /testdelar/i.test(sv["academy.library.areas"]) &&
      /^parts$/i.test(en["academy.library.areas"]) &&
      /^kompetenser$/i.test(sv["academy.library.competencies"]) &&
      /^competencies$/i.test(en["academy.library.competencies"]),
  );
  check(
    "F4 the two headings exist: Testets upplägg / Det här bedöms",
    /testets upplägg/i.test(sv["academy.library.structure"]) &&
      /det här bedöms/i.test(sv["academy.library.assessed"]) &&
      Boolean(en["academy.library.structure"]) &&
      /what is assessed/i.test(en["academy.library.assessed"]),
  );
  const library = stripComments(read(LIBRARY));
  check(
    "F5 the library detail puts the part/task count under the structure heading",
    /label=\{t\("academy\.library\.structure"\)\}/.test(library) &&
      /academy\.library\.areas/.test(library) &&
      /academy\.library\.items/.test(library),
  );
  check(
    "F6 and the competency list under the assessed heading, with its own count",
    /t\("academy\.library\.assessed"\)/.test(library) &&
      /\{competencies\.length\}/.test(library) &&
      /t\("academy\.library\.competencies"\)\.toLowerCase\(\)/.test(library),
  );
  check(
    "F7 the run intro uses 'delar/parts' for sections, never 'områden/areas'",
    /tp\("academy\.intro\.parts", blocks\.length\)/.test(stripComments(read(RUNNER))) &&
      sv["academy.intro.parts.other"] === "delar" &&
      en["academy.intro.parts.other"] === "parts" &&
      sv["academy.intro.structureHeading"] === "Testets upplägg",
  );
  check(
    "F8 the candidate's items are 'uppgifter/tasks' on the run and in the library",
    sv["academy.section.questions"] === "uppgifter" &&
      en["academy.section.questions"] === "tasks" &&
      sv["academy.library.items"] === "Uppgifter" &&
      en["academy.library.items"] === "Tasks" &&
      sv["academy.intro.tasks.other"] === "uppgifter" &&
      en["academy.intro.tasks.other"] === "tasks",
  );
}

// ═══════════════════════════════════════════════════════════════════════
console.log("\nG. Counts and duration come from the form, and the candidate is told both");
{
  const runner = stripComments(read(RUNNER));
  check(
    "G1 the intro's part count is the number of sections served",
    /\{blocks\.length\}<\/span>\{" "\}\s*\{tp\("academy\.intro\.parts", blocks\.length\)\}/.test(
      runner,
    ),
  );
  check(
    "G2 the intro's task count is the number of items served",
    /\{items\.length\}<\/span>\{" "\}\s*\{tp\("academy\.intro\.tasks", items\.length\)\}/.test(
      runner,
    ),
  );
  check(
    "G3 the duration is the form's own target range, shown only when it states one",
    /initialState\?\.minutesMin != null && initialState\?\.minutesMax != null/.test(runner) &&
      /academy\.intro\.approx/.test(runner) &&
      /academy\.intro\.minutes/.test(runner),
  );
  const hardcoded = candidateKeys.filter(
    (k) => /\b(50|35|45)\b/.test(sv[k] ?? "") || /\b(50|35|45)\b/.test(en[k] ?? ""),
  );
  check(
    "G4 no candidate copy hard-codes 50 / 35 / 45",
    hardcoded.length === 0,
    hardcoded.join(", "),
  );
  check(
    "G5 the state read carries the form's target minutes",
    /scp_forms\(target_minutes_min, target_minutes_max\)/.test(
      stripComments(read("src/lib/security-competency/academy-delivery.functions.ts")),
    ),
  );
  check(
    "G6 the intro still says answers save as you go and the run can be resumed",
    /sparas medan du arbetar/i.test(sv["academy.intro.body"]) &&
      /saved as you go/i.test(en["academy.intro.body"]) &&
      /återuppta/i.test(sv["academy.intro.body"]) &&
      /pick up again/i.test(en["academy.intro.body"]) &&
      Boolean(sv["academy.resume"]) &&
      Boolean(en["academy.resume"]),
  );
  check(
    "G7 the recruitment intro still says it is decision support and a person decides",
    /beslutsstöd/i.test(sv["academy.intro.purposeRecruitment"]) &&
      /person hos arbetsgivaren fattar beslutet/i.test(sv["academy.intro.purposeRecruitment"]) &&
      /decision support/i.test(en["academy.intro.purposeRecruitment"]) &&
      /person at the organisation makes the decision/i.test(en["academy.intro.purposeRecruitment"]),
  );
}

// ═══════════════════════════════════════════════════════════════════════
console.log("\nJ. No affirmative hire / reject / rank / pass / fail / suitability claim");
{
  // A sentence that NEGATES a verdict is what the product is supposed to say
  // ("no pass or fail", "rangordnar dig inte"). Those sentences are dropped
  // before the verdict words are searched, so only an affirmative claim
  // fails.
  const NEGATED_SV = /\b(inte|inget|ingen|inga|aldrig|utan|varken)\b/i;
  const NEGATED_EN = /\b(no|not|never|nor|without|neither|cannot|n't)\b/i;
  const VERDICT_SV =
    /\b(godkän[dt]|underkän[dt]|lämplig(het)?|olämplig|rangordn\w*|anställningsbeslut|anställ(a|s|er)|avvis\w*|poäng|betyg|rekommender\w*)\b/i;
  const VERDICT_EN =
    /\b(pass(ed|es)?|fail(ed|s)?|suitab\w*|unsuitab\w*|rank(ing|ed|s)?|hir(e|ed|ing)|reject\w*|score[sd]?|grade[sd]?|recommend\w*)\b/i;
  const affirmative = (s: string, negated: RegExp, verdict: RegExp) =>
    s
      .split(/(?<=[.!?])\s+|\s[—–]\s|;\s/)
      .filter((sentence) => !negated.test(sentence))
      .filter((sentence) => verdict.test(sentence));

  const badSv: string[] = [];
  const badEn: string[] = [];
  for (const k of candidateKeys) {
    const a = affirmative(sv[k] ?? "", NEGATED_SV, VERDICT_SV);
    if (a.length > 0) badSv.push(`${k}: ${a.join(" | ")}`);
    const b = affirmative(en[k] ?? "", NEGATED_EN, VERDICT_EN);
    if (b.length > 0) badEn.push(`${k}: ${b.join(" | ")}`);
  }
  check(
    "J1 no affirmative verdict sentence in candidate copy (SV)",
    badSv.length === 0,
    badSv.join(" || "),
  );
  check(
    "J2 no affirmative verdict sentence in candidate copy (EN)",
    badEn.length === 0,
    badEn.join(" || "),
  );
  // The employer-side sentence the audit named, by key.
  const uc = "employer.assessments.useCase.recruitment.body";
  check(
    "J3 the recruitment use-case line no longer promises a suitability verdict or a hiring decision",
    affirmative(sv[uc], NEGATED_SV, VERDICT_SV).length === 0 &&
      affirmative(en[uc], NEGATED_EN, VERDICT_EN).length === 0 &&
      /mänsklig rekryteringsprocess/i.test(sv[uc]) &&
      /human recruitment process/i.test(en[uc]),
    `${sv[uc]} / ${en[uc]}`,
  );
}

// ═══════════════════════════════════════════════════════════════════════
console.log("\nK. AI stays off, and the copy that says so is bound to the code");
{
  const queue = stripComments(read(REVIEW_QUEUE));
  check(
    "K1 the reviewer proposal is inert (no provider is wired)",
    /const proposal = null as ReviewProposal \| null;/.test(queue),
  );
  check(
    "K2 the delivery path calls no model",
    !/anthropic|openai|generateText|ai-provider|createModel/i.test(
      stripComments(read("src/lib/security-competency/academy-delivery.functions.ts")),
    ),
  );
  check(
    "K3 the candidate is told written answers are read by a person, not a model",
    /människa/i.test(sv["academy.writtenNote"]) &&
      /modell/i.test(sv["academy.writtenNote"]) &&
      /person/i.test(en["academy.writtenNote"]) &&
      /model/i.test(en["academy.writtenNote"]),
  );
}

// ═══════════════════════════════════════════════════════════════════════
console.log("\nParity. Every key this guard reads exists in both languages");
{
  const missing = candidateKeys.filter((k) => !en[k] || !sv[k]);
  check(
    "P1 no candidate-facing key is blank in either language",
    missing.length === 0,
    missing.join(", "),
  );
  const same = candidateKeys.filter(
    (k) => sv[k] === en[k] && !/^academy\.language\.name\./.test(k),
  );
  check(
    "P2 no candidate-facing key has identical SV and EN text",
    same.length === 0,
    same.join(", "),
  );
}

// ═══════════════════════════════════════════════════════════════════════
console.log("\nR. Releasing a candidate's assessment is a real confirmation");
{
  const participants = stripComments(
    read("src/routes/_authenticated.employer.$employerSlug.assessments.participants.tsx"),
  );
  const confirm = stripComments(read("src/components/employer/ConfirmAction.tsx"));
  check(
    "R1 the confirmation is the shared alert dialog, not an inline panel",
    /<ConfirmAction\b/.test(participants) && /AlertDialog\b/.test(confirm),
  );
  check(
    "R2 the consequence is passed separately from the title, so it becomes the description",
    /consequence=\{/.test(participants) && /AlertDialogDescription>\{consequence\}/.test(confirm),
  );
  check(
    "R3 it still names what sharing does, and who is responsible",
    /releaseConfirmBodyRecruitment/.test(participants) &&
      /releaseConfirmResponsibility/.test(participants),
  );
  check(
    "R4 cancel exists and is labelled",
    /cancelLabel=\{t\("academy\.participants\.releaseConfirmCancel"\)\}/.test(participants) &&
      /AlertDialogCancel/.test(confirm),
  );
  check(
    "R5 the dialog cannot be dismissed out from under an in-flight release",
    /if \(!open && releaseM\.isPending\) return;/.test(participants),
  );
  check(
    "R6 both controls are at least 44px",
    /AlertDialogCancel disabled=\{busy\} className="h-11"/.test(confirm) && /"h-11",/.test(confirm),
  );
  check(
    "R7 the explanation is still shown before the button is pressed",
    /academy\.participants\.releaseExplain/.test(participants),
  );
}

console.log("");
if (failures.length > 0) {
  console.error(`FAIL: ${failures.length} pilot-truth assertion(s) failed, ${passed} passed`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`ok: ${passed} pilot-truth assertions passed`);
