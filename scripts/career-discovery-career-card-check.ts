// The Career Card — regression.
//
// ── WHAT THIS EXISTS TO PREVENT ────────────────────────────────────────
//
// Two separate defects, one file, because they have the same root:
//
//  A. The card used to open on a profession PICKER ("Välj riktning"). A
//     candidate could build a card announcing the direction the engine had
//     ranked third, so the card and the report could make different claims
//     about the same assessment. A shareable artefact that disagrees with
//     the report it came from is worse than no artefact.
//
//  B. Layout was hand-placed at absolute coordinates and collisions were
//     found by eye, one at a time, after the fact — the stage badge over the
//     first indicator bar on square; the hero title off the right edge on
//     story; "#1" printed straight through "SECURITY COORDINATOR"; the
//     footer's discover line running into the URL. Every one of those
//     shipped, and every one was invisible to a test that only checked the
//     data.
//
// So: the card's CONTENT is asserted to come from the canonical ranking and
// nothing else, and its GEOMETRY is asserted numerically, in both locales,
// against the longest real profession titles in the catalogue.
//
// ── NO PERCENTAGES, EVER ────────────────────────────────────────────────
//
// PMR006, and professions.ts's own header: `fitScore` is internal, and the
// candidate-facing claim is the qualitative RecommendationConfidence label.
// Section 4 asserts the card never prints a number that could be read as
// fit, suitability, competence or employability — including the "match %"
// that a well-meaning redesign would naturally reach for.

import { readFileSync } from "node:fs";

import { cardAltText, measureCard, renderCareerCardSvg } from "../src/components/career-discovery/v31/CareerCard";
import {
  careerCardTrustLine,
  buildCareerCardData,
  CARD_DIMENSIONS,
  CARD_RANK_COUNT,
  CARD_STRENGTH_COUNT,
  strongestIndicators,
  type CardDimensionScore,
  type CareerCardFormat,
} from "../src/lib/career-discovery/v31/career-card";
import {
  linkedInShareUrl,
  shareCapabilitiesFrom,
  type ShareEnvironmentProbe,
} from "../src/lib/career-discovery/v31/career-card-export";
import { DIMENSION_IDS, DIMENSIONS } from "../src/lib/career-discovery/v31/dimensions";
import { RECOMMENDATION_CONFIDENCE_LABEL } from "../src/lib/career-discovery/v31/profession-explanations";
import type { RankedProfession } from "../src/lib/career-discovery/v31/professions";
import { FIRST_WAVE_CATALOG } from "./fixtures/first-wave-profession-catalog";

let failures = 0;
let checks = 0;

function ok(cond: boolean, label: string): void {
  checks += 1;
  if (!cond) {
    failures += 1;
    console.error(`  FAIL  ${label}`);
  } else {
    console.log(`  ok  ${label}`);
  }
}

function eq<T>(actual: T, expected: T, label: string): void {
  const same = JSON.stringify(actual) === JSON.stringify(expected);
  ok(same, `${label}${same ? "" : ` (got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)})`}`);
}

function group(name: string): void {
  console.log(`\n${name}`);
}

function read(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

const FORMATS: readonly CareerCardFormat[] = ["story", "square", "linkedin"];

function ranked(titles: readonly (readonly [string, string])[]): RankedProfession[] {
  const confidences = ["strong", "moderate", "indicative"] as const;
  return titles.map((t, i) => ({
    rank: i + 1,
    confidence: confidences[i] ?? "indicative",
    match: {
      professionId: `p${i + 1}`,
      cigProfessionSlug: `p${i + 1}`,
      careerAreaId: "CA01",
      titleSv: t[0],
      titleEn: t[1],
      fitTier: "strong",
      stage: "explore_now",
      regulated: false,
      inclusionRationaleSv: "",
      inclusionRationaleEn: "",
      limitationNoteSv: null,
      limitationNoteEn: null,
      alignedDimensions: ["CID05", "CID06", "CID12"],
      coverage: 0.9,
      contextCorroborated: false,
    },
  })) as RankedProfession[];
}

const DIMS: CardDimensionScore[] = DIMENSION_IDS.map((id, i) => ({
  id,
  // A deliberately uneven, unsorted spread, so "strongest three" is a real
  // computation rather than "the first three in id order".
  score: [0.41, 0.93, 0.67, 0.12, 0.98, 0.88, 0.55, 0.74][i % 8],
  usedForMatching: DIMENSIONS[id].matchingWeight === 1,
}));

const TRIO = ranked([
  ["Säkerhetssamordnare", "Security Coordinator"],
  ["Skyddsvakt", "Protective Security Officer"],
  ["Säkerhetschef", "Head of Security"],
]);

// =========================================================================
group("1 · There is no profession picker, anywhere");
// =========================================================================

const creator = read("src/components/career-discovery/v31/CareerCardCreator.tsx");
const tiers = read("src/components/career-discovery/v31/ProfessionRecommendations.tsx");
const reportView = read("src/components/career-discovery/v31/V31ReportView.tsx");
const dictionaries = read("src/i18n/dictionaries.ts");

ok(
  !creator.includes("chooseDirection"),
  "1.1 the creator has no 'choose a direction' control",
);
ok(
  !dictionaries.includes("card.chooseDirection"),
  "1.2 and the string it used is gone from both dictionaries",
);
ok(
  !creator.includes("setProfessionId") && !creator.includes("initialProfessionId"),
  "1.3 the creator holds no selected-profession state at all",
);
ok(
  !tiers.includes("onOpenCareerCard"),
  "1.4 a tier card can no longer open a card for its own profession",
);
ok(
  !dictionaries.includes("createCareerCardFor"),
  "1.5 and its label is gone too",
);
ok(
  creator.includes("ranked: readonly RankedProfession[]") && !/\bmatches\b:/.test(creator),
  "1.6 the creator takes the canonical `ranked`, not a `matches` list to pick from",
);
ok(
  /ranked=\{rankedTop3\}/.test(reportView) &&
    /const rankedTop3 = snapshot\.professions\?\.ranked \?\? \[\]/.test(reportView),
  "1.7 the report passes the snapshot's own ranked array straight through",
);
// The card used to be gated on `available === true`, which is a claim about
// the FIT GATES, not about whether a career was named. A balanced profile
// gets a real ranking and clears no tier — and got no card.
ok(
  /\{rankedTop3\.length > 0 && \(\s*<CareerCardCreator/.test(reportView),
  "1.8 the card is offered whenever the report names a career, not only when tiers cleared",
);
ok(
  !creator.includes("showIndicators"),
  "1.9 the Career DNA toggle is gone — strengths are part of the result, not a setting",
);

// =========================================================================
group("2 · The card IS the canonical top 3, in the canonical order");
// =========================================================================

const card = buildCareerCardData({
  ranked: TRIO,
  dimensions: DIMS,
  locale: "sv",
  definitionVersion: "cd-v3.1.0",
  generatedAt: "2026-08-29T10:00:00.000Z",
  firstName: "Emma",
});

eq(card.entries.map((e) => e.rank), [1, 2, 3], "2.1 ranks are 1, 2, 3 as stated by the engine");
eq(
  card.entries.map((e) => e.professionId),
  ["p1", "p2", "p3"],
  "2.2 profession ids and their order come straight from `ranked`",
);
eq(
  card.entries.map((e) => e.title),
  ["Säkerhetssamordnare", "Skyddsvakt", "Säkerhetschef"],
  "2.3 titles are the frozen snapshot's, in the report locale",
);
eq(
  card.entries.map((e) => e.confidenceLabel),
  [
    RECOMMENDATION_CONFIDENCE_LABEL.strong.sv,
    RECOMMENDATION_CONFIDENCE_LABEL.moderate.sv,
    RECOMMENDATION_CONFIDENCE_LABEL.indicative.sv,
  ],
  "2.4 each entry carries the SAME approved confidence wording the report prints",
);
eq(CARD_RANK_COUNT, 3, "2.5 the card names exactly three, mirroring the report's own ranking");
eq(
  buildCareerCardData({
    ranked: [...TRIO, ...ranked([["Fjärde", "Fourth"]])],
    dimensions: DIMS,
    locale: "sv",
    definitionVersion: "v",
    generatedAt: "g",
  }).entries.length,
  3,
  "2.6 a longer ranked array is truncated, never re-sorted",
);
eq(
  buildCareerCardData({
    ranked: TRIO.slice(0, 1),
    dimensions: DIMS,
    locale: "sv",
    definitionVersion: "v",
    generatedAt: "g",
  }).entries.length,
  1,
  "2.7 a shorter one is shown as-is, never padded with inventions",
);

// =========================================================================
group("3 · Strengths are the candidate's own, and are never fabricated");
// =========================================================================

const strengths = strongestIndicators(DIMS, "sv");
eq(strengths.length, CARD_STRENGTH_COUNT, "3.1 exactly three indicators");
{
  const matchable = DIMS.filter((d) => d.usedForMatching && d.score !== null).sort(
    (a, b) => (b.score as number) - (a.score as number) || a.id.localeCompare(b.id),
  );
  ok(
    strongestIndicators(matchable.slice(0, 3), "sv").length === 3,
    "3.2 they are drawn from the highest-scoring matchable dimensions",
  );
}
ok(
  strongestIndicators(DIMS, "sv").join("|") === strongestIndicators(DIMS, "sv").join("|"),
  "3.3 the selection is deterministic — a card regenerated tomorrow is the card shared today",
);
// CID15 is excluded from matching by owner decision A-4 and must never be
// presented as a strength, whatever it scored.
ok(
  strongestIndicators(
    [{ id: "CID15", score: 1, usedForMatching: false }, ...DIMS],
    "sv",
  ).length === 3 &&
    !strongestIndicators([{ id: "CID15", score: 1, usedForMatching: false }, ...DIMS], "sv").includes(
      DIMENSIONS.CID15.name.sv,
    ),
  "3.4 CID15 never appears, even scoring 1.0 (owner decision A-4)",
);
eq(
  strongestIndicators([{ id: "CID05", score: 0.9, usedForMatching: true }], "sv").length,
  1,
  "3.5 fewer than three scored dimensions yields fewer than three labels, never a padded list",
);
eq(
  strongestIndicators([{ id: "CID05", score: null, usedForMatching: true }], "sv").length,
  0,
  "3.6 an unscored dimension is not a strength",
);
ok(
  strongestIndicators(DIMS, "sv").join() !== strongestIndicators(DIMS, "en").join(),
  "3.7 labels are localised",
);

// =========================================================================
group("4 · No percentages, ever (PMR006)");
// =========================================================================

// Comments stripped: the file's own header explains at length why fitScore
// stays inside professions.ts, and that prose is not a read of it.
const cardCode = read("src/lib/career-discovery/v31/career-card.ts")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");
ok(!/fitScore/.test(cardCode), "4.1 the card module never reads fitScore");
ok(
  !/priorityScore|centralZ|coverage/.test(cardCode),
  "4.1b nor any other internal ranking number",
);
for (const locale of ["sv", "en"] as const) {
  const d = buildCareerCardData({
    ranked: TRIO,
    dimensions: DIMS,
    locale,
    definitionVersion: "cd-v3.1.0",
    generatedAt: "2026-08-29T10:00:00.000Z",
    firstName: "Emma",
  });
  for (const format of FORMATS) {
    const svg = renderCareerCardSvg(d, format, null);
    // Text nodes only — the SVG is full of coordinates, and those are not a
    // claim about anybody.
    const rendered = [...svg.matchAll(/>([^<]*)</g)].map((m) => m[1]).join(" ");
    ok(
      !/\d+\s*%/.test(rendered),
      `4.2 ${locale}/${format}: no percentage is printed anywhere on the card`,
    );
    ok(
      !/\b(0\.\d+|\d+\s*\/\s*100|\d+\s*p(?:oints|oäng))\b/i.test(rendered),
      `4.3 ${locale}/${format}: no raw score, ratio or point total either`,
    );
  }
}

// =========================================================================
group("5 · Every format fits, in both locales, with the real catalogue's longest titles");
// =========================================================================

// The longest real titles in the approved catalogue, not invented ones —
// the layout has to survive the data the product actually ships.
const longestSv = [...FIRST_WAVE_CATALOG].sort((a, b) => b.titleSv.length - a.titleSv.length);
const longestEn = [...FIRST_WAVE_CATALOG].sort((a, b) => b.titleEn.length - a.titleEn.length);
const worstCase = ranked([
  [longestSv[0].titleSv, longestEn[0].titleEn],
  [longestSv[1].titleSv, longestEn[1].titleEn],
  [longestSv[2].titleSv, longestEn[2].titleEn],
]);

console.log(
  `      longest titles under test: sv "${longestSv[0].titleSv}" / en "${longestEn[0].titleEn}"`,
);

for (const locale of ["sv", "en"] as const) {
  for (const firstName of [null, "Emmanuelle-Christina"]) {
    for (const format of FORMATS) {
      const d = buildCareerCardData({
        ranked: worstCase,
        dimensions: DIMS,
        locale,
        definitionVersion: "cd-v3.1.0",
        generatedAt: "2026-08-29T10:00:00.000Z",
        firstName,
      });
      const m = measureCard(d, format);
      const who = `${locale}/${format}/${firstName ? "named" : "anon"}`;
      // The collision this replaces was found by a human looking at a
      // rendered card. This is the same check, run every time.
      ok(m.overflow === 0, `5.1 ${who}: content clears the footer (overflow ${m.overflow}px)`);
      // The opposite failure: a card that fits because it is mostly empty.
      // Story had ~850px of dead space before this was measured.
      const air = m.footerTop - m.contentBottom;
      ok(
        air < CARD_DIMENSIONS[format].height * 0.45,
        `5.2 ${who}: no vacuum below the content (${air}px of air)`,
      );
    }
  }
}

// ── THE SAME WORST CASE, CARRYING A TRUST LINE ────────────────────────
//
// PR 9 added a verification line under the strengths. It is the block most
// likely to be missed by a fit test, because it is absent from most cards:
// a candidate with nothing verified never sees it, so a guard built only on
// the fixture above measures a card that no longer exists for the people the
// feature was built for.
//
// A separate loop rather than a fourth level of nesting in the one above --
// the assertions are the same, and re-indenting thirty lines to add a
// variant would bury this change in whitespace.
//
// The line under test is the longest the composer can actually produce: a
// two-digit credential count plus the confirmed-employment clause, from
// `careerCardTrustLine` itself, so a copy change that lengthens the sentence
// fails here rather than on somebody's phone.
for (const locale of ["sv", "en"] as const) {
  const trustLine = careerCardTrustLine(
    { verifiedClaims: 99, employerConfirmedEmployment: 9, known: true },
    locale,
  );
  for (const firstName of [null, "Emmanuelle-Christina"]) {
    for (const format of FORMATS) {
      const common = {
        ranked: worstCase,
        dimensions: DIMS,
        locale,
        definitionVersion: "cd-v3.1.0",
        generatedAt: "2026-08-29T10:00:00.000Z",
        firstName,
      };
      const who = `${locale}/${format}/${firstName ? "named" : "anon"}`;
      const m = measureCard(buildCareerCardData({ ...common, trustLine }), format);
      ok(
        m.overflow === 0,
        `5.3 ${who}/verified: content still clears the footer (${m.overflow}px)`,
      );

      // And a card WITHOUT a trust line must measure exactly as it did
      // before the block existed -- otherwise every card in the product
      // silently grew, including every card that renders nothing here.
      const off = measureCard(buildCareerCardData({ ...common, trustLine: null }), format);
      const before = measureCard(buildCareerCardData(common), format);
      ok(
        off.contentBottom === before.contentBottom,
        `5.4 ${who}/plain: no trust line costs no height`,
      );
    }
  }
}

// =========================================================================
group("6 · The SVG is well-formed, escaped, and self-contained");
// =========================================================================

for (const format of FORMATS) {
  const { width, height } = CARD_DIMENSIONS[format];
  const svg = renderCareerCardSvg(card, format, null);
  ok(svg.startsWith("<svg") && svg.trimEnd().endsWith("</svg>"), `6.1 ${format}: one root element`);
  ok(
    svg.includes(`viewBox="0 0 ${width} ${height}"`),
    `6.2 ${format}: the viewBox matches the declared canvas`,
  );
  ok(svg.includes("CQrityjob"), `6.3 ${format}: carries the wordmark, so a repost still means something`);
  // No external references: the exported PNG has to render standalone.
  ok(!/href="http/.test(svg), `6.4 ${format}: no external asset reference`);
  ok((svg.match(/<svg/g) ?? []).length === 1, `6.5 ${format}: no nested svg root`);
}
{
  const hostile = buildCareerCardData({
    ranked: ranked([['</text><script>x</script>', '</text><script>x</script>'], ["B", "B"], ["C", "C"]]),
    dimensions: DIMS,
    locale: "sv",
    definitionVersion: "v",
    generatedAt: "g",
    firstName: '"><script>alert(1)</script>',
  });
  const svg = renderCareerCardSvg(hostile, "story", null);
  ok(!svg.includes("<script>"), "6.6 catalogue and name text are escaped into the SVG, never injected");
}

// =========================================================================
group("7 · The exported image is the preview, and the alt text is the card");
// =========================================================================

ok(
  /const svg = renderCareerCardSvg\(cardData, format, qrDataUrl\);/.test(creator) &&
    /<CareerCardPreview data=\{cardData\} format=\{format\} qrDataUrl=\{qrDataUrl\} \/>/.test(creator),
  "7.1 export and preview call the same renderer with the same data — what you saw is what you share",
);
ok(
  creator.includes("shareCardImage("),
  "7.2 Web Share sends the generated IMAGE, not a bare page URL",
);
ok(
  creator.includes("downloadBlob(") && creator.includes("share_unsupported"),
  "7.3 with a plain image download as the fallback where Web Share is unavailable",
);
// Until 2026-08-29 this read `!/linkedInShareUrl|instagram|tiktok/i` — no
// mention of a network, anywhere. That kept the file honest by keeping it
// silent, and silence is what shipped the defect: on desktop the only
// control was "Dela", which opened the OS sheet and offered AirDrop. The
// rule was never "never name a network"; it is "never claim something the
// browser cannot do". So the guard now checks the claim itself.
ok(
  !/instagram\.com|tiktok\.com|api\.linkedin\.com|platform\.linkedin\.com|\bin\.js\b/i.test(
    creator,
  ),
  "7.4 no social deep links, APIs or SDK script tags — the panel adds no third-party surface",
);
ok(
  (creator.match(/window\.open\(/g) ?? []).length === 1 &&
    /window\.open\(linkedInShareUrl\(shareUrl\)/.test(creator),
  "7.5 exactly one outbound hand-off, and it is LinkedIn's own share flow with our public URL",
);
ok(
  linkedInShareUrl("https://cqrityjob.test/security-career-assessment") ===
    "https://www.linkedin.com/sharing/share-offsite/?url=https%3A%2F%2Fcqrityjob.test%2Fsecurity-career-assessment",
  "7.6 that flow is the documented key-less share-offsite endpoint, URL-encoded",
);
ok(
  !/[?&](title|summary|source|image|media|thumbnail)=/.test(
    linkedInShareUrl("https://cqrityjob.test/x"),
  ),
  "7.7 and carries a url and nothing else — share-offsite has no image parameter to fill",
);
ok(
  /\$\{K\}\.linkedInHint/.test(creator) && /\$\{K\}\.appGuidance/.test(creator),
  "7.8 the modal renders the 'image is not attached' and 'save it and share from the app' lines",
);
for (const [label, needle] of [
  ["sv", "bifogas inte automatiskt"],
  ["en", "not attached automatically"],
] as const) {
  ok(
    dictionaries.includes(needle),
    `7.9 ${label} says plainly that LinkedIn does not receive the image`,
  );
}
ok(
  !/\bupload(ing|ed|s)?\b|\bpost(ing|s) (to|on) (LinkedIn|Instagram|TikTok)\b/i.test(creator),
  "7.10 and nothing in the creator describes an upload it cannot perform",
);
{
  const pkg = read("package.json");
  ok(
    !/"[^"]*(linkedin|instagram|tiktok|facebook|react-share|social-sdk)[^"]*"\s*:/i.test(pkg),
    "7.11 no social-network SDK was added as a dependency to make any of this work",
  );
}
{
  const alt = cardAltText(card);
  ok(alt.includes("Emma"), "7.5 alt text names the candidate when they chose to be named");
  for (const e of card.entries) {
    ok(alt.includes(e.title), `7.6 alt text states ${e.title}`);
    ok(alt.includes(e.confidenceLabel), `7.7 alt text states its confidence, not a number`);
  }
  ok(alt.includes("CQrityjob"), "7.8 alt text carries the brand");
  const anon = cardAltText({ ...card, firstName: null });
  ok(!anon.includes("Emma"), "7.9 an unnamed card names nobody");
}

// =========================================================================
group("8 · Nothing but the first name ever leaves the profile");
// =========================================================================

ok(
  creator.includes("suggestedFirstName"),
  "8.1 a known first name may be prefilled",
);
ok(
  /maxLength=\{40\}/.test(creator),
  "8.2 and is bounded",
);
eq(
  buildCareerCardData({
    ranked: TRIO,
    dimensions: DIMS,
    locale: "sv",
    definitionVersion: "v",
    generatedAt: "g",
    firstName: "   ",
  }).firstName,
  null,
  "8.3 a blank name is no name — the field is genuinely removable",
);
eq(
  buildCareerCardData({
    ranked: TRIO,
    dimensions: DIMS,
    locale: "sv",
    definitionVersion: "v",
    generatedAt: "g",
    firstName: "x".repeat(200),
  }).firstName?.length,
  40,
  "8.4 an over-long name is truncated, not rendered off the canvas",
);
{
  const keys = Object.keys(card);
  ok(
    !keys.some((k) => /email|surname|lastName|phone|userId|sessionId|birth/i.test(k)),
    "8.5 the card's data model has no field that could carry anything else about the person",
  );
}

// =========================================================================
group("9 · Localisation is complete — no raw keys reach a card or its modal");
// =========================================================================

for (const key of [
  "careerDiscovery.report.v31.card.title",
  "careerDiscovery.report.v31.card.lede",
  "careerDiscovery.report.v31.card.firstNameLabel",
  "careerDiscovery.report.v31.card.firstNameHint",
  "careerDiscovery.report.v31.card.format",
  "careerDiscovery.report.v31.card.format.story",
  "careerDiscovery.report.v31.card.format.square",
  "careerDiscovery.report.v31.card.format.linkedin",
  "careerDiscovery.report.v31.card.share.panel",
  "careerDiscovery.report.v31.card.share.panelHint",
  "careerDiscovery.report.v31.card.saveImage",
  "careerDiscovery.report.v31.card.copyImage",
  "careerDiscovery.report.v31.card.copyLink",
  "careerDiscovery.report.v31.card.shareOnLinkedIn",
  "careerDiscovery.report.v31.card.linkHint",
  "careerDiscovery.report.v31.card.linkedInHint",
  "careerDiscovery.report.v31.card.appGuidance",
  "careerDiscovery.report.v31.card.imageCopied",
  "careerDiscovery.report.v31.card.imageCopyFailed",
  "careerDiscovery.report.v31.card.linkCopied",
  "careerDiscovery.report.v31.card.linkCopyFailed",
  "careerDiscovery.report.v31.card.linkedInOpened",
  "careerDiscovery.report.v31.card.linkedInBlocked",
  "cd.public.buildingResult",
  "cd.public.resultUnavailable",
  "cd.public.retryResult",
]) {
  eq(
    (dictionaries.match(new RegExp(`"${key.replace(/\./g, "\\.")}":`, "g")) ?? []).length,
    2,
    `9.1 ${key} is defined in BOTH dictionaries`,
  );
}
for (const locale of ["sv", "en"] as const) {
  const d = buildCareerCardData({
    ranked: TRIO,
    dimensions: DIMS,
    locale,
    definitionVersion: "cd-v3.1.0",
    generatedAt: "g",
    firstName: "Emma",
  });
  for (const format of FORMATS) {
    const svg = renderCareerCardSvg(d, format, null);
    ok(
      !/careerDiscovery\.|cd\.public\./.test(svg),
      `9.2 ${locale}/${format}: no untranslated key is rendered onto the card`,
    );
  }
}

// =========================================================================
group("10 · Capability detection decides the share experience, and never lies");
// =========================================================================

// The decision table, driven through the platforms this actually ships on.
// `hasShare` + `canShareFiles` are TRUE on desktop Chrome/macOS as well as
// on a phone — that is the whole reason the hosted UAT defect existed — so
// the matrix below is the assertion that capability alone is not what picks
// the experience.
const PROBE_BASE: ShareEnvironmentProbe = {
  hasShare: false,
  canShareFiles: false,
  hasClipboardWrite: false,
  hasClipboardItem: false,
  hasClipboardWriteText: false,
  isSecureContext: true,
  isMobileLike: false,
};

const PLATFORMS: readonly { label: string; probe: ShareEnvironmentProbe }[] = [
  {
    label: "iPhone Safari",
    probe: {
      ...PROBE_BASE,
      hasShare: true,
      canShareFiles: true,
      hasClipboardWrite: true,
      hasClipboardItem: true,
      hasClipboardWriteText: true,
      isMobileLike: true,
    },
  },
  {
    label: "Android Chrome",
    probe: {
      ...PROBE_BASE,
      hasShare: true,
      canShareFiles: true,
      hasClipboardWrite: true,
      hasClipboardItem: true,
      hasClipboardWriteText: true,
      isMobileLike: true,
    },
  },
  {
    label: "desktop Chrome/macOS",
    probe: {
      ...PROBE_BASE,
      // Present, and willing to take the file. This is the defect's shape.
      hasShare: true,
      canShareFiles: true,
      hasClipboardWrite: true,
      hasClipboardItem: true,
      hasClipboardWriteText: true,
    },
  },
  {
    label: "desktop Firefox (no Web Share)",
    probe: {
      ...PROBE_BASE,
      hasClipboardWrite: true,
      hasClipboardItem: true,
      hasClipboardWriteText: true,
    },
  },
  {
    label: "older Firefox (no image clipboard)",
    probe: { ...PROBE_BASE, hasClipboardWriteText: true },
  },
  {
    label: "insecure context (plain http)",
    probe: {
      ...PROBE_BASE,
      hasClipboardWrite: true,
      hasClipboardItem: true,
      hasClipboardWriteText: true,
      isSecureContext: false,
    },
  },
  { label: "server render / no navigator", probe: PROBE_BASE },
];

for (const { label, probe } of PLATFORMS) {
  const caps = shareCapabilitiesFrom(probe);
  const mobile = probe.isMobileLike;
  eq(
    caps.canShareFiles,
    mobile && probe.hasShare && probe.canShareFiles,
    `10.1 ${label}: the OS share sheet is offered only on a phone that can take the file`,
  );
  ok(
    !caps.canCopyImage || probe.isSecureContext,
    `10.2 ${label}: no clipboard action is offered off a secure context`,
  );
  ok(!caps.canCopyLink || probe.isSecureContext, `10.3 ${label}: same for the link copy`);
}

eq(
  shareCapabilitiesFrom(PLATFORMS[2].probe).canShareFiles,
  false,
  "10.4 desktop Chrome/macOS gets the CQrityjob panel, NOT the AirDrop sheet — the reported defect",
);
ok(
  shareCapabilitiesFrom(PLATFORMS[0].probe).canShareFiles &&
    shareCapabilitiesFrom(PLATFORMS[1].probe).canShareFiles,
  "10.5 while iPhone and Android keep native file sharing",
);
{
  const caps = shareCapabilitiesFrom(PLATFORMS[4].probe);
  ok(
    !caps.canCopyImage && caps.canCopyLink,
    "10.6 a browser without an image clipboard is offered the link copy and not the image copy",
  );
}
{
  // The floor. Whatever the platform says, saving the PNG is always there:
  // it is a plain object-URL download and needs no capability at all, which
  // is why the creator renders it unconditionally.
  ok(
    /onClick=\{\(\) => void handleSave\(\)\}/.test(creator) &&
      !/canShareFiles &&[\s\S]{0,200}handleSave/.test(creator),
    "10.7 'Save image' is rendered unconditionally — every platform has one action that works",
  );
}
ok(
  /capabilities\?\.canCopyImage &&/.test(creator) &&
    /capabilities\?\.canCopyLink &&/.test(creator) &&
    /capabilities\?\.canShareFiles &&/.test(creator),
  "10.8 every other action is gated on the detected capability, not assumed",
);
ok(
  /setNotice\(\(copied \? `\$\{K\}\.imageCopied` : `\$\{K\}\.imageCopyFailed`\)/.test(creator) &&
    /setNotice\(\(copied \? `\$\{K\}\.linkCopied` : `\$\{K\}\.linkCopyFailed`\)/.test(creator) &&
    /setNotice\(\(opened \? `\$\{K\}\.linkedInOpened` : `\$\{K\}\.linkedInBlocked`\)/.test(creator),
  "10.9 every action reports BOTH outcomes — a refused clipboard or a blocked pop-up is never silence",
);
ok(/role="status" aria-live="polite"/.test(creator), "10.10 and it is announced, not just drawn");

// =========================================================================
group("11 · The preview scales the whole card; the export keeps its pixels");
// =========================================================================

const cardComponent = read("src/components/career-discovery/v31/CareerCard.tsx");

// The defect: renderCareerCardSvg emits width="1080" height="1920", which
// is the SVG's intrinsic size once it is in the DOM. Inside a ~448px modal
// with overflow-hidden, the browser laid it out at 1080px and cropped the
// rest — so a long Swedish title ran off the right of the PREVIEW while
// sitting well inside the exported PNG.
ok(
  /\[&>svg\]:h-full/.test(cardComponent) && /\[&>svg\]:w-full/.test(cardComponent),
  "11.1 the preview overrides the SVG's intrinsic width/height in CSS, so it cannot lay out at 1080px",
);
ok(
  /aspectRatio: `\$\{width\} \/ \$\{height\}`/.test(cardComponent),
  "11.2 the preview box keeps the card's exact aspect ratio",
);
ok(
  /min\(100%, \$\{PREVIEW_MAX_WIDTH\}, \$\{ratio\} \* \$\{PREVIEW_MAX_VIEWPORT_HEIGHT\}\)/.test(
    cardComponent,
  ),
  "11.3 and is capped on BOTH axes — width for landscape, ratio-derived height for story",
);
ok(
  /const ratio = \(width \/ height\)/.test(cardComponent),
  "11.4 that height cap is derived from the format's own ratio, not a per-format magic number",
);

// The other half: none of the above may have touched what gets rasterised.
for (const format of FORMATS) {
  const { width, height } = CARD_DIMENSIONS[format];
  const svg = renderCareerCardSvg(card, format, null);
  ok(
    svg.includes(`width="${width}" height="${height}"`) &&
      svg.includes(`viewBox="0 0 ${width} ${height}"`),
    `11.5 ${format}: the exported canvas is still ${width}x${height} — the preview fix changed no export pixel`,
  );
}
eq(CARD_DIMENSIONS.story.width, 1080, "11.6 story is still 1080 wide");
eq(CARD_DIMENSIONS.story.height, 1920, "11.7 story is still 1920 tall");
eq(CARD_DIMENSIONS.square.width, 1080, "11.8 square is still 1080 wide");
eq(CARD_DIMENSIONS.square.height, 1080, "11.9 square is still 1080 tall");
eq(CARD_DIMENSIONS.linkedin.width, 1200, "11.10 linkedin is still 1200 wide");
eq(CARD_DIMENSIONS.linkedin.height, 627, "11.11 linkedin is still 627 tall");

// =========================================================================
console.log("");
if (failures > 0) {
  console.error(`FAILED: ${failures} of ${checks} checks failed.`);
  process.exit(1);
}
console.log(`career-discovery-career-card-check: all ${checks} checks passed.`);
