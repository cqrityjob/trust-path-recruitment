// Two things an employer would notice before a test does, and neither throws.
//
// Run via `bun run employer-library-purpose:check`.
//
// ── 1. THE RECRUITMENT LIBRARY IS A PURPOSE, NOT A CONTENT TYPE ───────
//
// Tester & bedömningar listed every assessment definition in the system,
// because `libraryKind === "assessment"` was the whole filter. That put six
// competence-development assessments -- Konflikthantering & nedtrappning,
// Rapportering & dokumentation, and four more -- in front of a recruiter, each
// with a development programme of nearly the same name one area over.
//
// The fix is one governed field, `designed_for`, and the risk is that somebody
// later "simplifies" the filter back to kind, or reaches for a title allowlist
// because the metadata felt like too much work. Both are checked: the filter
// must read designedFor, and the source must contain no content slug or title.
//
// ── 2. A PLURAL PAIR WITH ONE HALF MISSING RENDERS THE KEY ────────────
//
// tp() resolves `<base>.one` or `<base>.other`. A base with only one half
// still typechecks at the call site -- PluralKey requires both, but a later
// edit that deletes the `.other` line changes what PluralKey admits rather
// than failing where it is used. In the interface that surfaces as the literal
// string "employer.actions.draftJobs.other" inside a sentence.
//
// So every base is checked for both halves in both languages, and the two
// forms are checked for being actually different where the language makes them
// different -- "1 nya ansökningar" was the defect this pass exists to fix, and
// it comes back the moment somebody pastes the plural into both slots.

import { readFileSync } from "node:fs";
import { dictionaries } from "../src/i18n/dictionaries";

const errors: string[] = [];
const expect = (ok: boolean, message: string) => {
  if (!ok) errors.push(message);
};

const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
/** The allowlist scan below looks for content this file knows by name. The
 *  comment explaining why that is forbidden necessarily names some of it, so
 *  comments come out before the scan or the guard fails on its own rationale. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const sv = dictionaries.sv as Record<string, string>;
const en = dictionaries.en as Record<string, string>;

// ---------------------------------------------------------------------------
// A. The library filters by governed purpose.
// ---------------------------------------------------------------------------

{
  const src = stripComments(read("src/components/academy/ContentLibrary.tsx"));

  const fn = src.slice(src.indexOf("export function belongsToArea"));
  const body = fn.slice(0, fn.indexOf("\n}") + 2);

  expect(
    body.length > 0 && body.includes("designedFor"),
    `A: belongsToArea() no longer reads designedFor. The recruitment library is ` +
      `a purpose, not a content type -- filtering on libraryKind alone is what ` +
      `put competence-development assessments in front of a recruiter.`,
  );
  expect(
    body.includes('"recruitment_support"'),
    `A: belongsToArea() no longer names the recruitment_support purpose.`,
  );

  // A title or slug in this file means somebody hard-coded the catalogue.
  const HARDCODED = [
    "sg-access-control",
    "sg-conflict-deescalation",
    "sg-incident-response",
    "sg-operational-baseline",
    "sg-reporting-documentation",
    "sg-situational-awareness",
    "security-officer-recruitment",
    "Konflikthantering",
    "Rapportering & dokumentation",
    "Recruitment Assessment",
  ];
  for (const needle of HARDCODED) {
    expect(
      !src.includes(needle),
      `A: ContentLibrary.tsx mentions "${needle}". The split must come from ` +
        `designed_for, never from a list of content this file knows by name -- ` +
        `an allowlist silently hides the next assessment somebody publishes.`,
    );
  }

  // Each area asks for itself, and they cannot both ask for the same thing.
  const libraryRoute = read(
    "src/routes/_authenticated.employer.$employerSlug.assessments.library.tsx",
  );
  const programmesRoute = read(
    "src/routes/_authenticated.employer.$employerSlug.training.programmes.tsx",
  );
  expect(
    /area="recruitment"/.test(libraryRoute),
    `A: the Bedömningsbibliotek route no longer renders area="recruitment".`,
  );
  expect(
    /area="workforce"/.test(programmesRoute),
    `A: the Utvecklingsprogram route no longer renders area="workforce".`,
  );
  expect(
    !/area="recruitment"/.test(programmesRoute),
    `A: Utvecklingsprogram is rendering the recruitment area. Development ` +
      `programmes would disappear from Kompetensutveckling.`,
  );
}

// ---------------------------------------------------------------------------
// B. The person page offers development, not a candidate assessment.
// ---------------------------------------------------------------------------

{
  const person = read("src/routes/_authenticated.employer.$employerSlug.workforce.$personId.tsx");
  expect(
    !person.includes("/employer/$employerSlug/assessments/library"),
    `B: the employee page links to the recruitment library, which now holds ` +
      `only content written for recruitment. An employer standing on a ` +
      `colleague's page would be offered a candidate assessment and nothing else.`,
  );
  expect(
    person.includes("/employer/$employerSlug/training/programmes"),
    `B: the employee page no longer offers a way to assign development.`,
  );
}

// ---------------------------------------------------------------------------
// C. Every plural pair is complete, in both languages, and actually differs.
// ---------------------------------------------------------------------------

{
  // A pair is a base carrying BOTH halves -- the same rule PluralKey applies.
  //
  // Neither suffix means "plural" on its own in this dictionary, and both have
  // pre-existing inhabitants that would be false positives: feedback.category
  // and sca.scp.profession end in ".other" meaning the option "Other", while
  // academy.observation carries ".one"/".many" and composes its own number.
  const has = (k: string) => Object.hasOwn(sv, k) || Object.hasOwn(en, k);
  const bases = [...new Set(Object.keys(sv).concat(Object.keys(en)))]
    .filter((k) => k.endsWith(".one"))
    .map((k) => k.slice(0, -".one".length))
    .filter((base) => has(`${base}.other`))
    .sort();

  // Named explicitly, because an incomplete pair drops out of the scan above
  // rather than failing it: deleting "employer.actions.draftJobs.other" would
  // make the base invisible instead of broken. These eight are every
  // count-bearing row on Översikt.
  const REQUIRED = [
    "employer.actions.newApplications",
    "employer.actions.responsesToReview",
    "employer.actions.resultsReady",
    "employer.actions.awaitingNextStep",
    "employer.actions.draftJobs",
    "employer.actions.testsWithCandidates",
    "employer.attention.jobsNoApplications",
    "employer.attention.assessmentsAvailable",
  ];
  for (const base of REQUIRED) {
    expect(
      bases.includes(base),
      `C: "${base}" is not a complete plural pair. Översikt renders it with a ` +
        `count, so a missing half puts the raw key on the board.`,
    );
  }

  for (const base of bases) {
    for (const [lang, dict] of [
      ["sv", sv],
      ["en", en],
    ] as const) {
      const one = dict[`${base}.one`];
      const other = dict[`${base}.other`];
      expect(
        Boolean(one),
        `C: dictionaries.${lang} is missing "${base}.one" -- tp() would render ` +
          `the key itself inside a sentence.`,
      );
      expect(Boolean(other), `C: dictionaries.${lang} is missing "${base}.other".`);
    }

    // Swedish "svar behöver granskas" is genuinely identical in both forms.
    // English, for the same row, is not ("response needs" / "responses need").
    // So identical is allowed, but never in both languages at once: that is
    // the shape a copy-paste leaves behind.
    const svSame = sv[`${base}.one`] === sv[`${base}.other`];
    const enSame = en[`${base}.one`] === en[`${base}.other`];
    expect(
      !(svSame && enSame),
      `C: "${base}" has the same text for one and many in BOTH languages ` +
        `("${sv[`${base}.one`]}" / "${en[`${base}.one`]}"). That is what a ` +
        `pasted plural looks like, and it puts "1 nya ansökningar" back on the board.`,
    );
  }

  // The queue renders "<count> <text>", so the singular must not carry its own
  // number word -- "1 en ny ansökan".
  for (const base of bases) {
    for (const [lang, dict] of [
      ["sv", sv],
      ["en", en],
    ] as const) {
      const one = dict[`${base}.one`] ?? "";
      expect(
        !/^\s*(1|en|ett|one|a|an)\b/i.test(one),
        `C: ${lang} "${base}.one" starts with "${one.split(" ")[0]}". The count ` +
          `is rendered separately, so this reads as "1 ${one}".`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// D. Every count-bearing row on Översikt goes through tp().
// ---------------------------------------------------------------------------

{
  const overview = read("src/routes/_authenticated.employer.$employerSlug.index.tsx");

  // A row that has a `count:` must build its `text:` with tp(). Catching the
  // reverse of the bug: a NEW row added later with a flat t() string.
  const rows = overview.matchAll(/text:\s*(t|tp)\(\s*"(employer\.(?:actions|attention)\.[^"]+)"/g);
  for (const m of rows) {
    const [, fn, key] = m;
    const isCounted = Boolean(sv[`${key}.one`]) || Boolean(sv[`${key}.other`]);
    if (isCounted) {
      expect(
        fn === "tp",
        `D: "${key}" is a plural pair but is rendered with t(), which cannot ` +
          `choose a form and will render the base key.`,
      );
    }
  }

  expect(
    (overview.match(/\btp\(/g) ?? []).length >= 8,
    `D: fewer than eight tp() calls on Översikt. A count-bearing row has gone ` +
      `back to a single fixed string.`,
  );
}

if (errors.length > 0) {
  for (const e of errors) console.error("[employer-library-purpose:check][error]", e);
  console.error(`\nemployer-library-purpose:check FAILED with ${errors.length} error(s).`);
  process.exit(1);
}

console.log(
  "employer-library-purpose:check OK (recruitment library filtered by designed_for, " +
    "no hard-coded content, employee page offers development, plural pairs complete in sv and en)",
);
