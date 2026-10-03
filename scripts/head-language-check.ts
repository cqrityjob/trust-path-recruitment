// Page titles and descriptions follow the reader's language.
//
// ── WHAT THIS DEFENDS ───────────────────────────────────────────────────
//
// Every public route renders the Swedish head on the server (the site's
// default) and swaps in the reader's language on the client with
// `useLocalizedHead(titleKey, descriptionKey)`. A handful of routes had not
// joined in: /login carried a Swedish title above an ENGLISH description,
// /signup the same, /reset-password an English title on the Swedish site, the
// profession guide a Swedish-only tab, and an ad with no title of its own fell
// back to the English words "Security job". A reader on the other language
// sees the wrong one in the tab, in history and in a bookmark.
//
// So for each of them the guard asserts, from the route's source and the
// dictionaries:
//
//   H1  the head is read from the Swedish dictionary entry, never a literal
//   H2  the component swaps in the reader's language (useLocalizedHead, or the
//       guide's own effect, because its strings depend on the profession)
//   H3  every key exists in both languages and is actually translated
//   H4  no English literal fallback is left in the ad's tab title
//
// What it deliberately does not claim: the profession guide's og: tags and the
// server-rendered description stay Swedish on purpose (the indexed language is
// the one the content describes a market for -- see the route's comment).
//
// Run: bun run head-language:check

import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dir, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
/** Source with comments removed, so a rule is never satisfied by a sentence in
 *  a comment that describes it. */
const code = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

const fails: string[] = [];
function ck(name: string, ok: boolean, detail?: unknown): void {
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${name}${ok || detail === undefined ? "" : ` — ${String(detail)}`}`,
  );
  if (!ok) fails.push(name);
}
function group(name: string): void {
  console.log(`\n${name}`);
}

const { dictionaries } = await import("../src/i18n/dictionaries");
const d = (lang: "sv" | "en") => dictionaries[lang] as Record<string, string>;

function translated(key: string): void {
  for (const lang of ["sv", "en"] as const) {
    ck(`${lang} defines "${key}"`, typeof d(lang)[key] === "string" && d(lang)[key].length > 0);
  }
  ck(`"${key}" is actually translated`, d("sv")[key] !== d("en")[key]);
}

/* H1-H3: the three routes that use useLocalizedHead ---------------------- */
const ROUTES: ReadonlyArray<{
  file: string;
  title: string;
  description?: string;
  headTitleRead: string;
}> = [
  {
    file: "src/routes/login.tsx",
    title: "meta.login.title",
    description: "meta.login.description",
    headTitleRead: 'SV["meta.login.title"]',
  },
  {
    file: "src/routes/signup.tsx",
    title: "meta.signup.title",
    description: "meta.signup.description",
    headTitleRead: 'SV["meta.signup.title"]',
  },
  {
    file: "src/routes/reset-password.tsx",
    title: "meta.resetPassword.title",
    headTitleRead: 'dictionaries.sv["meta.resetPassword.title"]',
  },
];

for (const route of ROUTES) {
  group(`${route.file}`);
  const source = code(read(route.file));
  ck(
    "the head's title is the Swedish dictionary entry",
    source.includes(`{ title: ${route.headTitleRead} }`) ||
      source.includes(`title: ${route.headTitleRead}`),
    "the title is a literal, or not read from the dictionary",
  );
  ck(
    "the head carries no hand-written English or Swedish title",
    !/\{\s*title:\s*["'`]/.test(source),
  );
  if (route.description) {
    ck(
      "the head's description is the Swedish dictionary entry (it was English on the Swedish head)",
      new RegExp(
        `name: "description",\\s*content: SV\\["${route.description.replace(/\./g, "\\.")}"\\]`,
      ).test(source),
    );
    ck(
      "the head carries no hand-written description",
      !/name:\s*"description",\s*content:\s*["'`]/.test(source),
    );
  }
  const hook = route.description
    ? `useLocalizedHead("${route.title}", "${route.description}")`
    : `useLocalizedHead("${route.title}")`;
  ck("the component swaps in the reader's language", source.includes(hook), `expected ${hook}`);
  translated(route.title);
  if (route.description) translated(route.description);
}

/* /auth: never rendered, but it must not keep a copy --------------------- */
group("src/routes/auth.tsx");
{
  const source = code(read("src/routes/auth.tsx"));
  ck(
    "its head takes /login's words instead of a copy of them",
    source.includes('{ title: dictionaries.sv["meta.login.title"] }'),
  );
  ck("it carries no hand-written title", !/\{\s*title:\s*["'`]/.test(source));
}

/* The profession guide ---------------------------------------------------- */
group("src/routes/career-center.$profession.tsx");
{
  const source = code(read("src/routes/career-center.$profession.tsx"));
  ck(
    "the unavailable head reads its Swedish title from the dictionary",
    source.includes('{ title: dictionaries.sv["meta.profession.unavailable.title"] }'),
  );
  ck(
    "the guide's head reads its Swedish title from the dictionary",
    source.includes('dictionaries.sv["meta.profession.title"].replace("{profession}", p.titleSv)'),
  );
  ck(
    "no hand-written 'yrkesguide' title is left in the head",
    !/title\s*=\s*`[^`]*yrkesguide/.test(source) && !/\{\s*title:\s*["'`]/.test(source),
  );
  ck(
    "the page swaps the tab's title and description to the reader's language",
    /useEffect\(\(\) => \{\s*document\.title = data\s*\?\s*t\("meta\.profession\.title"\)/.test(
      source,
    ) &&
      source.includes('t("meta.profession.unavailable.title")') &&
      source.includes('.setAttribute("content", data.description[lang])'),
  );
  for (const key of ["meta.profession.title", "meta.profession.unavailable.title"]) translated(key);
  for (const lang of ["sv", "en"] as const) {
    ck(
      `${lang} "meta.profession.title" keeps the {profession} placeholder`,
      d(lang)["meta.profession.title"].includes("{profession}"),
    );
  }
}

/* H4: the ad's fallback tab title ---------------------------------------- */
group("src/routes/jobs.$slug.tsx");
{
  const source = code(read("src/routes/jobs.$slug.tsx"));
  ck(
    "an ad with no title of its own falls back through the dictionary",
    source.includes('t("jobs.detail.titleFallback")'),
  );
  ck("no English fallback literal is left in the tab title", !source.includes('"Security job"'));
  translated("jobs.detail.titleFallback");
}

console.log("");
if (fails.length > 0) {
  console.error(`head-language:check FAILED (${fails.length}):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("head-language:check OK");
