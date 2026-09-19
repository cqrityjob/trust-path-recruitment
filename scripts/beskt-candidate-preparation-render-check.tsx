// The candidate's BESKT preparation, asserted against the RENDERED markup.
//
// ── WHY THIS RENDERS RATHER THAN READS ─────────────────────────────────
//
// The source guard next door (beskt-candidate-preparation-check.ts) reads the
// migration, the rollback and the component source; the SQL suite proves the
// runtime. Neither proves that a CANDIDATE ever sees the nine notices, the
// skip control, the oral control or the read-only confirmation — and every one
// of those is a state a reviewer would otherwise have to take on trust.
//
// Rendered with renderToStaticMarkup — no browser and no database. The
// I18nProvider starts at "sv" on the server, so Swedish is asserted from the
// markup and English from a second render with lang="en"; the same shape
// assessment-panels-render-check uses.
//
// It also produces the two HTML fragments the browser-evidence walk
// (scripts/beskt-candidate-preparation-evidence.tsx) captures in real
// Chromium at 1440 and 375, so the screenshots and these assertions are of
// exactly the same markup.
//
// Run: bun run beskt-candidate-preparation-render:check

import { copyFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nProvider } from "../src/i18n/context";
import { dictionaries } from "../src/i18n/dictionaries";
import {
  NoticePanel,
  QuestionCard,
  ReviewList,
} from "../src/components/beskt/CandidatePreparation";
import { draftFrom, type Draft } from "../src/components/beskt/preparation-draft";
import type {
  BesktCandidatePreparation,
  BesktNoticeForLocale,
  BesktPreparationItem,
} from "../src/lib/beskt/candidate-preparation.functions";

const failures: string[] = [];
let passed = 0;
function check(label: string, ok: boolean, detail = ""): void {
  if (ok) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(detail ? `${label} — ${detail}` : label);
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const sv = dictionaries.sv as Record<string, string>;
const en = dictionaries.en as Record<string, string>;

const render = (node: React.ReactNode, lang: "sv" | "en" = "sv") =>
  renderToStaticMarkup(<I18nProvider initialLang={lang}>{node}</I18nProvider>);

/** The markup with tags removed, so an assertion is about what is READ. */
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const NOTICE_SECTIONS = [
  "purpose",
  "use_of_information",
  "human_decision",
  "not_a_test_with_score",
  "may_omit_questions",
  "oral_discussion",
  "review_and_correct",
  "who_can_access",
  "retention",
] as const;

/* ---- Typed synthetic fixtures. Clearly synthetic, never product copy. -- */

/** One locale's governed notice, exactly as `by_locale` shapes it.
 *
 *  `producesScore` is false here because the descriptor says so in the
 *  database; it is carried rather than assumed so that a schema which ever
 *  started answering true would surface in this render rather than silently. */
function noticeForLocale(locale: string, contentHash: string): BesktNoticeForLocale {
  return {
    locale,
    noticeContentHash: contentHash,
    sections: [...NOTICE_SECTIONS],
    noticeCopyDigest: "0".repeat(64),
    noticeCopyKeys: [],
    retentionClass: "recruitment_record",
    lawfulBasisReference: "GDPR art. 6(1)(b) synthetic",
    jurisdictionReference: "SE",
    recipients: ["employer_members_of_this_employer"],
    decisionMaker: "accountable_employer_human",
    producesScore: false,
    methodContentHash: "3".repeat(64),
    // 20261130's assignment facts; absent here, as on a v1 notice.
    employerName: null,
    roleTitle: null,
    contactStatement: null,
    lawfulBasisStatement: null,
  };
}

const ITEMS: BesktPreparationItem[] = [
  {
    sequencePosition: 1,
    itemKey: "lone_working_experience",
    sectionKey: "preparation",
    wordingSv: "SYNTETISK: Har du erfarenhet av ensamarbete?",
    wordingEn: "SYNTHETIC: Do you have experience of lone working?",
    purposeSv: "Rollen innebär ensamarbete.",
    purposeEn: "The role involves lone working.",
    answerType: "single_choice",
    requiredness: "required",
    discussOrallyAllowed: true,
    options: [
      { optionKey: "yes", labelSv: "Ja", labelEn: "Yes" },
      { optionKey: "no", labelSv: "Nej", labelEn: "No" },
    ],
    answer: {
      responseState: "answered",
      valueBoolean: null,
      valueText: null,
      valueDate: null,
      optionKeys: ["yes"],
    },
  },
  {
    sequencePosition: 2,
    itemKey: "lone_working_example",
    sectionKey: "preparation",
    wordingSv: "SYNTETISK: Beskriv en situation.",
    wordingEn: "SYNTHETIC: Describe a situation.",
    purposeSv: "Konkreta exempel ger underlag.",
    purposeEn: "Concrete examples give a basis.",
    answerType: "long_text",
    requiredness: "voluntary",
    discussOrallyAllowed: true,
    options: [],
    answer: {
      responseState: "discuss_orally",
      valueBoolean: null,
      valueText: null,
      valueDate: null,
      optionKeys: [],
    },
  },
  {
    sequencePosition: 3,
    itemKey: "reported_incident",
    sectionKey: "preparation",
    wordingSv: "SYNTETISK: Har du rapporterat en avvikelse?",
    wordingEn: "SYNTHETIC: Have you reported an incident?",
    purposeSv: "Rapportering ingår i rollen.",
    purposeEn: "Reporting is part of the role.",
    answerType: "boolean",
    requiredness: "required",
    discussOrallyAllowed: true,
    options: [],
    answer: {
      responseState: "omitted",
      valueBoolean: null,
      valueText: null,
      valueDate: null,
      optionKeys: [],
    },
  },
  {
    sequencePosition: 4,
    itemKey: "information_acknowledged",
    sectionKey: "preparation",
    wordingSv: "SYNTETISK: Jag har tagit del av informationen.",
    wordingEn: "SYNTHETIC: I have read the information.",
    purposeSv: "Kandidaten ska ha fått informationen.",
    purposeEn: "The candidate must have received the information.",
    answerType: "acknowledgement",
    requiredness: "required",
    // The governed item forbids taking this one orally; the control must be
    // ABSENT rather than disabled.
    discussOrallyAllowed: false,
    options: [],
    answer: {
      responseState: "answered",
      valueBoolean: true,
      valueText: null,
      valueDate: null,
      optionKeys: [],
    },
  },
];

const PREPARATION: BesktCandidatePreparation = {
  assignmentId: "00000000-0000-4000-8000-0000000000a1",
  applicationId: "00000000-0000-4000-8000-0000000000a2",
  lifecycleState: "assigned",
  mode: "recruitment_support",
  roleTitle: null,
  roleTitleEn: null,
  employerName: null,
  contactStatement: null,
  entrance: "application",
  availableFrom: "2026-09-12T08:00:00.000Z",
  dueAt: null,
  submittedAt: null,
  readOnly: false,
  method: {
    nameSv: "SYNTETISK BESKT-testmetod",
    nameEn: "SYNTHETIC BESKT test method",
    purposeSv: "Syntetiskt testinnehåll.",
    versionNumber: 1,
    validationLabel: "pilot_hypothesis",
    summarySv: "Syntetisk sammanfattning",
    summaryEn: "Synthetic summary",
    contentHash: "0".repeat(64),
  },
  exposureProfile: {
    exposureArea: "lone_working",
    dutiesSv: "Ensamarbete nattetid.",
    dutiesEn: "Lone working at night.",
    rationaleSv: "Rollen innebär ensamarbete.",
    rationaleEn: "The role involves lone working.",
    retentionClass: "recruitment_record",
    lawfulBasisReference: "GDPR art. 6(1)(b) synthetic",
    jurisdictionReference: "SE",
  },
  notice: {
    noticeVersion: "beskt-prep-notice-1",
    acknowledgedAt: null,
    // Both governed locales, each with its OWN content hash -- the shape the
    // merged read model answers with. Two distinct hashes here is the point:
    // acknowledging the Swedish notice must not be able to record the English
    // bytes, and a fixture that shared one hash could not show the difference.
    locales: ["sv-SE", "en-GB"],
    byLocale: {
      "sv-SE": noticeForLocale("sv-SE", "1".repeat(64)),
      "en-GB": noticeForLocale("en-GB", "2".repeat(64)),
    },
  },
  response: null,
  items: ITEMS,
};

const drafts: Record<string, Draft> = Object.fromEntries(
  ITEMS.map((i) => [i.itemKey, draftFrom(i)]),
);

/* ---- 1. The notice: nine matters, both languages, not consent --------- */

// Each language renders the notice for ITS OWN governed locale, which is what
// the route does: the panel shows the locale the candidate reads, and that is
// the one the acknowledgement is bound to.
const noticeSv = render(
  <NoticePanel
    data={PREPARATION}
    notice={PREPARATION.notice.byLocale["sv-SE"]}
    pending={false}
    error={null}
    onAcknowledge={() => {}}
  />,
  "sv",
);
const noticeEn = render(
  <NoticePanel
    data={PREPARATION}
    notice={PREPARATION.notice.byLocale["en-GB"]}
    pending={false}
    error={null}
    onAcknowledge={() => {}}
  />,
  "en",
);

for (const key of NOTICE_SECTIONS) {
  check(
    `the candidate is shown the "${key}" notice, in Swedish`,
    noticeSv.includes(`data-testid="beskt-notice-${key}"`) &&
      text(noticeSv).includes(sv[`beskt.notice.${key}.title`] ?? "\u0000"),
  );
  check(
    `and in English`,
    noticeEn.includes(`data-testid="beskt-notice-${key}"`) &&
      text(noticeEn).includes(en[`beskt.notice.${key}.title`] ?? "\u0000"),
  );
}

check(
  "the notice states that a human decides and that no score is produced",
  text(noticeSv).includes(sv["beskt.notice.human_decision.body"] ?? "\u0000") &&
    text(noticeSv).includes(sv["beskt.notice.not_a_test_with_score.body"] ?? "\u0000"),
);
check(
  "it states that questions may be omitted and that matters may be taken orally",
  text(noticeSv).includes(sv["beskt.notice.may_omit_questions.body"] ?? "\u0000") &&
    text(noticeSv).includes(sv["beskt.notice.oral_discussion.body"] ?? "\u0000"),
);
check(
  "it states who can read the submitted information, and the retention",
  text(noticeSv).includes(sv["beskt.notice.who_can_access.body"] ?? "\u0000") &&
    text(noticeSv).includes(sv["beskt.notice.retention.body"] ?? "\u0000"),
);
check(
  "the governed retention class and lawful-basis reference are shown from the method profile",
  text(noticeSv).includes("recruitment_record") &&
    text(noticeSv).includes("GDPR art. 6(1)(b) synthetic"),
);

/* ---- 1b. The acknowledgement is bound to the notice ACTUALLY rendered -- */
//
// PR 3A makes the notice per-locale: every governed locale has its own
// content hash, and bcp_acknowledge_notice records the hash it is handed. So
// the claim "the candidate confirmed the notice they read" is only true if
// the panel renders one locale and sends THAT locale's hash. An independent
// review found the earlier single-hash version of this claim to be false,
// which is why it is asserted here rather than described.
//
// The fixture gives the two locales different hashes on purpose: a panel that
// ignored its `notice` prop and reached for a fixed locale would render the
// same pair twice, and these four assertions would fail.
const SV_HASH = PREPARATION.notice.byLocale["sv-SE"].noticeContentHash;
const EN_HASH = PREPARATION.notice.byLocale["en-GB"].noticeContentHash;
check(
  "the Swedish notice declares the Swedish locale it was rendered for",
  noticeSv.includes('data-notice-locale="sv-SE"'),
);
check(
  "and carries THAT locale's content hash, which is what the confirmation records",
  noticeSv.includes(`data-notice-hash="${SV_HASH}"`),
);
check(
  "the English notice declares the English locale, and carries a DIFFERENT hash",
  noticeEn.includes('data-notice-locale="en-GB"') &&
    noticeEn.includes(`data-notice-hash="${EN_HASH}"`),
);
check(
  "so the two locales cannot be acknowledged with one another's bytes",
  SV_HASH !== EN_HASH && !noticeSv.includes(EN_HASH) && !noticeEn.includes(SV_HASH),
);
// The word "consent" is not banned from the notice -- it is REQUIRED, and
// required to be denied. A candidate who is never told "this is not consent"
// is left to assume that it is one, which is the misunderstanding the
// sentence exists to prevent. So the assertion is that every sentence naming
// it also denies it.
const consentSentences = [
  ...text(noticeSv).split(/(?<=[.!?])\s+/),
  ...text(noticeEn).split(/(?<=[.!?])\s+/),
].filter((sentence) => /\b(samtycke|consent)\b/i.test(sentence));
check(
  "the notice tells the candidate, in both languages, that this is NOT consent",
  consentSentences.length >= 2 &&
    consentSentences.every((sentence) => /\b(inte|inget|ingen|not|no|never)\b/i.test(sentence)),
  `sentences naming consent: ${consentSentences.length}`,
);
check(
  "and labels it an information receipt that creates no lawful basis",
  text(noticeSv).includes(sv["beskt.notice.acknowledgeHint"] ?? "\u0000") &&
    text(noticeEn).includes(en["beskt.notice.acknowledgeHint"] ?? "\u0000"),
);
check(
  "the acknowledgement control is a real labelled checkbox with a 44px action",
  noticeSv.includes('id="beskt-notice-ack"') &&
    noticeSv.includes('for="beskt-notice-ack"') &&
    noticeSv.includes("min-h-[44px]"),
);

/* ---- 2. A question: skip, oral, labelled group, neutral presentation -- */

const q1Sv = render(
  <QuestionCard item={ITEMS[0]!} draft={drafts.lone_working_experience!} onChange={() => {}} />,
  "sv",
);
const q1En = render(
  <QuestionCard item={ITEMS[0]!} draft={drafts.lone_working_experience!} onChange={() => {}} />,
  "en",
);
const q4Sv = render(
  <QuestionCard item={ITEMS[3]!} draft={drafts.information_acknowledged!} onChange={() => {}} />,
  "sv",
);

check(
  "each question is a labelled group a screen reader can announce",
  q1Sv.includes("<fieldset>") && q1Sv.includes("<legend"),
);
check(
  "the governed wording and the reason the question is asked are both shown",
  text(q1Sv).includes("Har du erfarenhet av ensamarbete?") &&
    text(q1Sv).includes("Rollen innebär ensamarbete."),
);
check(
  'the candidate is offered "Hoppa över"',
  text(q1Sv).includes(sv["beskt.answer.skip"] ?? "\u0000") &&
    q1Sv.includes('data-testid="beskt-item-lone_working_experience-skip"'),
);
check(
  'and "Ta muntligt under intervjun"',
  text(q1Sv).includes(sv["beskt.answer.oral"] ?? "\u0000") &&
    q1Sv.includes('data-testid="beskt-item-lone_working_experience-oral"'),
);
check(
  "both in English",
  text(q1En).includes(en["beskt.answer.skip"] ?? "\u0000") &&
    text(q1En).includes(en["beskt.answer.oral"] ?? "\u0000"),
);
check(
  "the oral control is ABSENT, not disabled, where the governed item forbids it",
  !q4Sv.includes('data-testid="beskt-item-information_acknowledged-oral"') &&
    q4Sv.includes('data-testid="beskt-item-information_acknowledged-skip"'),
);
check(
  "every option has its own label bound to its own control",
  q1Sv.includes('id="beskt-input-lone_working_experience-yes"') &&
    q1Sv.includes('for="beskt-input-lone_working_experience-yes"'),
);
check(
  "the skip and oral controls carry a pressed state for assistive technology",
  (q1Sv.match(/aria-pressed="(true|false)"/g) ?? []).length >= 2,
);
check(
  "every interaction target in a question is at least 44px",
  (q1Sv.match(/min-h-\[44px\]/g) ?? []).length >= 2,
);

const qSkipped = render(
  <QuestionCard
    item={ITEMS[2]!}
    draft={{ ...draftFrom(ITEMS[2]!), state: "omitted" }}
    onChange={() => {}}
  />,
  "sv",
);
check(
  "a skipped question says plainly that it was skipped, and offers an undo",
  text(qSkipped).includes(sv["beskt.answer.skipped"] ?? "\u0000") &&
    text(qSkipped).includes(sv["beskt.answer.undoSkip"] ?? "\u0000"),
);
check(
  "and carries NO warning, risk or error styling — an omission is not a fault",
  !/text-destructive|border-destructive|text-(red|amber|orange|yellow)-\d|bg-(red|amber|orange|yellow)-\d/.test(
    qSkipped,
  ),
);

/* ---- 3. Review and the read-only confirmation ------------------------- */

const reviewSv = render(
  <ReviewList items={ITEMS} drafts={drafts} readOnly={false} onEdit={() => {}} />,
  "sv",
);
const reviewEn = render(
  <ReviewList items={ITEMS} drafts={drafts} readOnly={false} onEdit={() => {}} />,
  "en",
);
const readOnlySv = render(<ReviewList items={ITEMS} drafts={drafts} readOnly />, "sv");

check(
  "the review lists every response the candidate gave",
  ITEMS.every((i) => text(reviewSv).includes((i.wordingSv ?? "").replace(/\s+/g, " "))),
);
// ── CORRECTION IS A CONTROL, NOT A LINK TO NOTHING ─────────────────────
//
// This used to assert `href="#beskt-item-..."`, and the assertion passed while
// the feature did not work at all: during the review phase the questions are
// not rendered, so every one of those fragments pointed at an element that did
// not exist. A candidate told they could correct an answer could not.
//
// So the assertion is now about the thing that actually has to be true: each
// answer carries a real BUTTON, one per item, which asks the parent to go back
// to that question. And no `href="#beskt-item-` survives anywhere, because
// that is the exact shape of the defect.
check(
  "the review offers a real correction CONTROL for each answer, one per item",
  ITEMS.every((i) => reviewSv.includes(`data-testid="beskt-review-edit-${i.itemKey}"`)) &&
    (reviewSv.match(/<button/g) ?? []).length === ITEMS.length &&
    text(reviewSv).includes(sv["beskt.review.edit"] ?? "\u0000"),
);
check(
  "and it is not a fragment link to a question that is not on screen",
  !reviewSv.includes('href="#beskt-item-') && !reviewEn.includes('href="#beskt-item-'),
);
check(
  "each correction control names the question it belongs to, for a screen reader",
  ITEMS.every((i) => reviewSv.includes(`<span class="sr-only">${(i.wordingSv ?? "").trim()} — `)),
);
check("and in English", text(reviewEn).includes(en["beskt.review.edit"] ?? "\u0000"));
check(
  "an omitted response is shown as a state, with no value invented for it",
  text(reviewSv).includes(sv["beskt.answer.skipped"] ?? "\u0000"),
);
check(
  "a discuss-orally response is shown as a state too",
  text(reviewSv).includes(sv["beskt.answer.oralChosen"] ?? "\u0000"),
);
check(
  "the submitted, read-only view offers NO correction control",
  !readOnlySv.includes('href="#beskt-item-'),
);
check(
  "the review shows no score, level, ranking or suitability language",
  !/(poäng|betyg|rangordn|lämplig|score|ranking|grade|suitab)/i.test(text(reviewSv)) &&
    !/(score|ranking|grade|suitab)/i.test(text(reviewEn)),
);

/* ---- 4. The captures the browser walk screenshots --------------------- */

const OUT = "artifacts/beskt-candidate-preparation";
mkdirSync(OUT, { recursive: true });

// The PRODUCT's own compiled stylesheet, taken from the production build, so
// a capture is of the real thing at the real widths rather than of a
// hand-written approximation. Absent a build the fragments are still written
// (the assertions above are about markup, not paint) and the browser walk
// says plainly that it had no stylesheet.
const BUILT_CSS = "styles.css";
function copyBuiltStylesheet(): boolean {
  const built = "\u002eoutput/public/assets";
  if (!existsSync(built)) return false;
  const css = readdirSync(built).find((f) => f.endsWith(".css"));
  if (!css) return false;
  copyFileSync(`${built}/${css}`, `${OUT}/${BUILT_CSS}`);
  return true;
}
const styled = copyBuiltStylesheet();

function page(title: string, body: string): string {
  // A minimal document so the fragment renders at a real viewport in a real
  // browser. No network, no fonts, no analytics, no CDN: the capture is of
  // THIS markup with the PRODUCT's own stylesheet, and nothing else.
  return `<!doctype html>
<html lang="${title.endsWith("-en") ? "en" : "sv"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${styled ? `<link rel="stylesheet" href="./${BUILT_CSS}">` : "<!-- no production stylesheet available -->"}
<style>body{margin:0;padding:16px;background:hsl(var(--background,0 0% 100%))}</style>
</head>
<body><main>${body}</main></body>
</html>`;
}

const CAPTURES: Array<{ name: string; html: string }> = [
  { name: "candidate-notice-sv", html: page("candidate-notice-sv", noticeSv) },
  { name: "candidate-notice-en", html: page("candidate-notice-en", noticeEn) },
  {
    name: "candidate-questions-sv",
    html: page("candidate-questions-sv", `<ol>${q1Sv}${qSkipped}${q4Sv}</ol>`),
  },
  {
    name: "candidate-questions-en",
    html: page("candidate-questions-en", `<ol>${q1En}</ol>`),
  },
  { name: "candidate-review-sv", html: page("candidate-review-sv", reviewSv) },
  { name: "candidate-review-en", html: page("candidate-review-en", reviewEn) },
  { name: "candidate-submitted-sv", html: page("candidate-submitted-sv", readOnlySv) },
];

for (const capture of CAPTURES) {
  writeFileSync(`${OUT}/${capture.name}.html`, capture.html, "utf8");
}
check(
  `the ${CAPTURES.length} capture fragments were written for the browser walk`,
  CAPTURES.length === 7,
);
check(
  "and carry the product's own compiled stylesheet, not a hand-written approximation",
  styled,
  "run `npm run build` first so .output/public/assets holds the compiled CSS",
);

if (failures.length > 0) {
  console.error(`\nBESKT candidate-preparation render check FAILED (${failures.length}).`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  `\nBESKT candidate-preparation render check: ${passed} of ${passed} assertions passed.`,
);
