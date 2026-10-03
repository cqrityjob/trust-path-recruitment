// CQrityjob brand messaging — the guard.
//
// LOCKED OWNER DECISION (2026-10-01):
//
//   Primary hero     "Security careers, without limits."
//   Brand promise    "Where trust comes first."
//
// Two statements with two jobs. The hero is the commercial/product
// proposition and opens the homepage; the promise is the brand line and
// closes it, signs the footer, the auth panel, the structured data and the
// site-wide fallback title. Both are English brand statements and are the
// SAME sentence in Swedish and English.
//
//   B1  the homepage hero is the locked sentence, in both languages, and is
//       rendered as the page's h1 with lang="en"
//   B2  the homepage <title> / og:title lead with the hero, and the retired
//       primary taglines do not return to the hero or the homepage metadata
//   B3  the hero is the umbrella proposition, not every heading: it appears
//       in no dictionary value other than the hero and the homepage title
//   B4  "Where trust comes first." is still the brand promise: the
//       dictionary key, the footer, the homepage's closing line, the auth
//       panel, the Organization structured data and the fallback title
//
// Deliberately NOT asserted: any other homepage sentence. The supporting
// copy is guarded for shape and claims by public-homepage:check; this file
// only pins the two locked statements so unrelated copy can move freely.
//
// Run: bun run brand-messaging:check

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dictionaries } from "../src/i18n/dictionaries";

const HERO = "Security careers, without limits.";
const PROMISE = "Where trust comes first.";
const LANGS = ["sv", "en"] as const;

const ROOT = join(import.meta.dir, "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

let checks = 0;
const failures: string[] = [];
function ck(label: string, cond: boolean, detail?: unknown): void {
  checks += 1;
  if (!cond) {
    failures.push(detail === undefined ? label : `${label}\n      got: ${JSON.stringify(detail)}`);
  }
}

const dict = (lang: (typeof LANGS)[number]) => dictionaries[lang] as Record<string, string>;

/* B1 ---------------------------------------------------------------- */
for (const lang of LANGS) {
  ck(
    `B1 ${lang}: home.hero.slogan is the locked brand line`,
    dict(lang)["home.hero.slogan"] === HERO,
    dict(lang)["home.hero.slogan"],
  );
}
const sections = read("src/components/site/HomeSections.tsx");
const heroFn = sections.slice(
  sections.indexOf("export function HomeHero"),
  sections.indexOf("export function HomeForIndividuals"),
);
const h1 = heroFn.match(/<h1[\s\S]*?<\/h1>/)?.[0] ?? "";
ck("B1: HomeHero renders home.hero.title as its h1", /\{t\("home\.hero\.title"\)\}/.test(h1), h1);
ck('B1: the hero slogan carries lang="en"', /lang="en"[\s\S]*?\{t\("home\.hero\.slogan"\)\}/.test(heroFn));
ck(
  "B1: the hero h1 is never auto-hyphenated (overrides the shared DARK_H1)",
  /\[hyphens:none\]/.test(h1) && !/\[hyphens:auto\]/.test(h1),
  h1,
);
ck("B1: HomeHero has exactly one h1", (heroFn.match(/<h1[\s>]/g) ?? []).length === 1);
ck(
  "B1: the homepage still mounts HomeHero first",
  /<SiteLayout>\s*<HomeHero \/>/.test(read("src/routes/index.tsx")),
);

/* B2 ---------------------------------------------------------------- */
const RETIRED = [
  "plattform för människor och möjligheter",
  "platform for people and opportunities",
  "built exclusively for the security industry",
];
for (const lang of LANGS) {
  const title = dict(lang)["meta.home.title"];
  ck(`B2 ${lang}: meta.home.title leads with the hero`, title === `CQrityjob – ${HERO}`, title);
  for (const key of [
    "home.hero.title",
    "home.hero.subtitle",
    "meta.home.title",
    "meta.home.description",
  ]) {
    const v = dict(lang)[key].toLowerCase();
    ck(
      `B2 ${lang}: ${key} carries no retired primary tagline`,
      RETIRED.every((r) => !v.includes(r)),
      dict(lang)[key],
    );
  }
}
const index = read("src/routes/index.tsx");
ck(
  "B2: the homepage <title> and og:title read meta.home.title",
  /\{ title: SV\["meta\.home\.title"\] \}/.test(index) &&
    /property: "og:title", content: SV\["meta\.home\.title"\]/.test(index),
);
const rootRoute = read("src/routes/__root.tsx");
ck(
  "B2: the site-wide default description carries no retired tagline",
  RETIRED.every((r) => !rootRoute.toLowerCase().includes(r)),
);

/* B3 ---------------------------------------------------------------- */
for (const lang of LANGS) {
  const holders = Object.entries(dict(lang))
    .filter(([, v]) => typeof v === "string" && v.includes(HERO))
    .map(([k]) => k)
    .sort();
  ck(
    `B3 ${lang}: only the hero and the homepage title carry the hero sentence`,
    JSON.stringify(holders) === JSON.stringify(["home.hero.slogan", "meta.home.title"]),
    holders,
  );
}

/* B4 ---------------------------------------------------------------- */
for (const lang of LANGS) {
  ck(
    `B4 ${lang}: brand.slogan is the brand promise`,
    dict(lang)["brand.slogan"] === PROMISE,
    dict(lang)["brand.slogan"],
  );
}
ck(
  "B4: the footer signs with brand.slogan",
  /t\("brand\.slogan"\)/.test(read("src/components/site/SiteFooter.tsx")),
);
ck(
  'B4: the homepage closes on brand.slogan, lang="en"',
  /<p\s+lang="en"[\s\S]*?\{t\("brand\.slogan"\)\}/.test(
    sections.slice(sections.indexOf("export function HomeWhy")),
  ),
);
ck(
  "B4: the auth panel keeps the brand line",
  /t\("brand\.slogan"\)/.test(read("src/components/auth/UnifiedAuthForm.tsx")),
);
ck(
  "B4: the Organization structured data keeps the slogan",
  index.includes(`slogan: "${PROMISE}"`),
);
ck(
  "B4: the site-wide fallback title keeps the promise",
  rootRoute.includes(`title: "CQrityjob — ${PROMISE}"`),
);
ck(
  "B4: the hero and the promise are not the same sentence anywhere",
  LANGS.every((l) => dict(l)["home.hero.title"] !== dict(l)["brand.slogan"]),
);

if (failures.length > 0) {
  console.error(`✗ brand messaging: ${failures.length} of ${checks} checks failed`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ brand messaging: ${checks} checks passed`);
