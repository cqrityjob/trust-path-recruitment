// The changed candidate surfaces, asserted against the RENDERED markup.
//
// ── WHY THIS RENDERS RATHER THAN READS ─────────────────────────────────
//
// The domain guards prove the rules: the recommendation always exists, the
// date validator refuses 2026-13-45, the practice gate is closed for a
// recruitment-only candidate. None of them says what a candidate actually
// SEES — and every defect in this closure was reported by somebody looking at
// a screen. A rule that holds while the component renders nothing, or renders
// it off the side of a 375px phone, passes every other check in this
// repository and fixes nothing.
//
// So this renders the real components with renderToStaticMarkup and asserts
// on the markup, and it doubles as the mobile smoke test: the layout classes
// that decide whether these surfaces work on a phone are in that markup, and
// asserting them here runs in CI on every commit, which a manual pass on one
// device does not.
//
// ── SWEDISH IS WHAT IS RENDERED ────────────────────────────────────────
//
// I18nProvider starts at "sv" on the server to avoid a hydration mismatch and
// exposes no way to seed a locale (see passport-pilot-bugfix-check for the
// same constraint). The English half of every string is asserted from the
// dictionaries directly, and the sv/en parity of the whole key set is held by
// passport-fixture-check.

import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/context";
import { RecommendedProfessions } from "../src/components/career-discovery/v31/RecommendedProfessions";
import { dictionaries } from "../src/i18n/dictionaries";
import { matchProfessions } from "../src/lib/career-discovery/v31/professions";
import type { Confidence, DimensionResult } from "../src/lib/career-discovery/v31/scoring";
import { DIMENSION_IDS, type DimensionId } from "../src/lib/career-discovery/v31/dimensions";
import { GOLDEN_PERSONAS } from "../src/lib/career-discovery/v31/golden-persona-fixtures";
import { FIRST_WAVE_CATALOG } from "./fixtures/first-wave-profession-catalog";

const fails: string[] = [];
function ck(name: string, ok: boolean): void {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${name}`);
  if (!ok) fails.push(name);
}
function group(name: string): void {
  console.log(`\n${name}`);
}

function makeDims(scores: Partial<Record<DimensionId, number>>): DimensionResult {
  const dimensions = Object.fromEntries(
    DIMENSION_IDS.map((id) => {
      const value = id in scores ? (scores[id] as number) : null;
      return [
        id,
        {
          dimension: id,
          score: value,
          evidenceWeight: value === null ? 0 : 1.5,
          dominance: value === null ? null : 0.3,
          coverage: value === null ? 0 : 1,
          confidence: (value === null ? "none" : "high") as Confidence,
          sources: value === null ? [] : ["fixture"],
          tertiaryOnly: false,
        },
      ];
    }),
  ) as DimensionResult["dimensions"];
  return { scoringVersion: "fixture", dimensions, answeredItems: [], complete: true };
}

const sv = dictionaries.sv as Record<string, string>;
const en = dictionaries.en as Record<string, string>;

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);
}

const byId = new Map(GOLDEN_PERSONAS.map((p) => [p.id, p] as const));
function rankedFor(id: string) {
  const p = byId.get(id)!;
  return matchProfessions(makeDims(p.dims), FIRST_WAVE_CATALOG, p.contextStatus).ranked;
}

// =========================================================================
group("1 · The recommendation reaches the screen");
// =========================================================================
//
// The defect was a candidate finishing twenty-eight questions and being shown
// "Bred profil" with a note saying profession matching was not included. The
// engine now always produces a top 3 — this asserts the report actually
// RENDERS it, for the balanced profile that used to get nothing.

for (const personaId of ["broad-profile", "broad-profile-senior", "sparse", "operational-guarding"]) {
  const ranked = rankedFor(personaId);
  const html = render(<RecommendedProfessions ranked={ranked} locale="sv" />);

  ck(`1.1 ${personaId}: the section renders`, html.length > 0);
  ck(
    `1.2 ${personaId}: the section is titled as a recommendation`,
    html.includes(sv["careerDiscovery.report.v31.rec.title"]),
  );
  ck(
    `1.3 ${personaId}: rank 1 names a profession`,
    html.includes(ranked[0].match.titleSv),
  );
  ck(
    `1.4 ${personaId}: rank 1 is marked as the strongest recommendation`,
    html.includes(sv["careerDiscovery.report.v31.rec.rank1"]),
  );
  ck(
    `1.5 ${personaId}: the second and third are rendered too`,
    html.includes(ranked[1].match.titleSv) && html.includes(ranked[2].match.titleSv),
  );
  ck(
    `1.6 ${personaId}: the contributing Career DNA traits are shown`,
    html.includes(sv["careerDiscovery.report.v31.rec.traitsLabel"]),
  );
  ck(
    `1.7 ${personaId}: the "not a competence measure" boundary is on the page`,
    html.includes(sv["careerDiscovery.report.v31.rec.boundary"]),
  );
  ck(
    `1.8 ${personaId}: no percentage or score reaches the candidate`,
    !/\d+\s?%/.test(html),
  );
}

// =========================================================================
group("2 · Confidence is never overclaimed on screen");
// =========================================================================

{
  const ranked = rankedFor("sparse");
  const html = render(<RecommendedProfessions ranked={ranked} locale="sv" />);
  ck(
    "2.1 an all-indicative recommendation carries the clarifier",
    html.includes(sv["careerDiscovery.report.v31.rec.indicativeNote"]),
  );
  ck(
    "2.2 and never borrows the fit vocabulary",
    !html.includes("Stark matchning"),
  );

  const strong = render(<RecommendedProfessions ranked={rankedFor("operational-guarding")} locale="sv" />);
  ck(
    "2.3 a gated recommendation does NOT carry the clarifier",
    !strong.includes(sv["careerDiscovery.report.v31.rec.indicativeNote"]),
  );
}

// =========================================================================
group("3 · Empty stays empty");
// =========================================================================
//
// No approved catalogue is a real state and a different one from "nothing
// cleared". It must render nothing rather than an invented direction.

ck("3.1 an empty ranking renders nothing", render(<RecommendedProfessions ranked={[]} locale="sv" />) === "");

// =========================================================================
group("4 · Mobile — the changed surfaces fit a 375px phone");
// =========================================================================
//
// Asserted from the layout classes rather than from a screenshot, because a
// screenshot proves one device once and this runs on every commit. The rule
// being held is the one that actually breaks a phone: a multi-column grid
// must start at one column and only widen at a breakpoint, and nothing may
// carry a fixed width.

{
  const html = render(<RecommendedProfessions ranked={rankedFor("technical")} locale="sv" />);

  ck(
    "4.1 the alternatives grid is single-column first, two only from sm:",
    html.includes("grid") && html.includes("sm:grid-cols-2") && !html.includes("grid-cols-2 "),
  );
  ck(
    "4.2 the primary card scales its type up at a breakpoint, not down from one",
    html.includes("text-2xl") && html.includes("sm:text-3xl"),
  );
  ck("4.3 nothing carries a fixed pixel width", !/\bw-\[\d+px\]/.test(html));
  ck("4.4 nothing carries a fixed pixel height that could clip text", !/\bh-\[\d+px\]/.test(html));
  ck(
    "4.5 prose is width-capped in ch, which is responsive, not in px",
    html.includes("max-w-[64ch]") || html.includes("max-w-[70ch]"),
  );
  // A viewport-overflowing element is the single most common phone defect and
  // the hardest to see in review.
  ck("4.6 nothing sets a viewport-wider min-width", !/min-w-\[\d{3,}px\]/.test(html));
}

// =========================================================================
group("5 · Both locales carry every string these surfaces render");
// =========================================================================

const REQUIRED_KEYS = [
  "careerDiscovery.report.v31.rec.title",
  "careerDiscovery.report.v31.rec.lede",
  "careerDiscovery.report.v31.rec.rank1",
  "careerDiscovery.report.v31.rec.traitsLabel",
  "careerDiscovery.report.v31.rec.alternativesTitle",
  "careerDiscovery.report.v31.rec.indicativeNote",
  "careerDiscovery.report.v31.rec.boundary",
  // The assessment surfaces changed in the same closure.
  "academy.home.titleRecruitment",
  "academy.home.ledeRecruitment",
  "academy.home.assessmentLedeRecruitment",
  "academy.home.purposeFallbackRecruitment",
  "academy.home.privacyRecruitment",
  "academy.home.recruitmentDecision",
  "academy.intro.purposeRecruitment",
  "academy.eyebrowRecruitment",
  "academy.submitFailed.title",
  "academy.submitFailed.body",
  "academy.submitFailed.incomplete",
  "academy.submitFailed.retry",
  "academy.submitFailed.review",
  "academy.participants.releaseConfirmTitle",
  "academy.participants.releaseConfirmBody",
  "academy.participants.releaseConfirmResponsibility",
  "academy.participants.releaseConfirmAction",
  "academy.participants.releaseConfirmCancel",
  "auth.invite.organisationContext",
  "cd.public.next",
  "cd.public.createAccountToSave",
  "cd.public.haveAccount",
  "cd.careerContext.roleOtherLabel",
  "cd.careerContext.roleOtherNote",
  "sca.scp.notPassport",
];

for (const key of REQUIRED_KEYS) {
  ck(`5.1 ${key} — sv`, typeof sv[key] === "string" && sv[key].length > 0);
  ck(`5.2 ${key} — en`, typeof en[key] === "string" && en[key].length > 0);
  ck(`5.3 ${key} — the two locales are genuinely different text`, sv[key] !== en[key]);
}

// =========================================================================
group("6 · Recruitment wording is not employee wording");
// =========================================================================
//
// The purpose conflict, asserted as a property rather than as a sentence: the
// recruitment strings must not call the organisation the candidate's employer
// or call a selection instrument development, and must say a person decides.

for (const [locale, dict, employerWord, developmentWord] of [
  ["sv", sv, "din arbetsgivare", "kompetensutveckling"],
  ["en", en, "your employer", "competence development"],
] as const) {
  for (const key of [
    "academy.home.assessmentLedeRecruitment",
    "academy.home.purposeFallbackRecruitment",
    "academy.home.privacyRecruitment",
    "academy.intro.purposeRecruitment",
  ]) {
    ck(
      `6.1 ${locale}/${key} never calls the organisation the candidate's employer`,
      !dict[key].toLowerCase().includes(employerWord),
    );
    ck(
      `6.2 ${locale}/${key} never calls a recruitment assessment development`,
      !dict[key].toLowerCase().includes(developmentWord),
    );
  }
  ck(
    `6.3 ${locale} says a person makes the decision`,
    /person/i.test(dict["academy.home.recruitmentDecision"]),
  );
  // And the employee wording must NOT have been rewritten into the
  // recruitment one — both have to keep existing, separately.
  ck(
    `6.4 ${locale} the employee purpose wording is still present and distinct`,
    dict["academy.intro.purpose"] !== dict["academy.intro.purposeRecruitment"] &&
      dict["academy.intro.purpose"].toLowerCase().includes(developmentWord),
  );
}

console.log(
  fails.length === 0
    ? `\nprepilot-candidate-surface-check: all assertions passed.`
    : `\nFAILED (${fails.length}):\n  - ${fails.join("\n  - ")}`,
);
process.exit(fails.length === 0 ? 0 : 1);
