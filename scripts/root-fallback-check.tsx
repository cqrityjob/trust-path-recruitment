// The root's 404 and error screens — rendered, in both languages, with and
// without the providers a hard crash takes away.
//
// ── WHAT THIS DEFENDS ───────────────────────────────────────────────────
//
// src/routes/__root.tsx carried two hand-written ENGLISH screens ("Page not
// found", "This page didn't load") on a site whose default language is
// Swedish. They now live in src/components/site/RootFallbacks.tsx and read the
// dictionary through `useTolerantT()`.
//
// The second half matters more than the first. A hard crash unwinds the root
// component and the I18nProvider / QueryClientProvider inside it, so the error
// screen can render with NO provider above it, and `useT()` throws there --
// inside the very boundary that was meant to catch the first failure. So the
// guard renders both screens in every provider combination and requires that
// none of them throws, that the language falls back to the site default
// (Swedish), and that the public chrome (SiteLayout, which needs both
// providers) is worn only when both are present.
//
//   R1  the screens are translated: no English literal left in the route or
//       the component, and every key exists in both languages, different in
//       each
//   R2  inside the providers, the 404 wears the public chrome and speaks the
//       reader's language
//   R3  outside them (none, or either one missing) the 404 and the error
//       screen render, in Swedish, without the chrome and without throwing
//   R4  the error screen keeps retry and go-home; the 404 keeps go-home
//   R5  the route wires the components in, and the providers still wrap the
//       Outlet that renders an unmatched URL's 404
//
// Run: bun run root-fallback:check

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// What is mocked: the router (a RouterProvider renders empty under
// renderToStaticMarkup, and these screens ask it for exactly two things), the
// error reporter (a browser global), and SiteLayout, which is replaced by a
// marker so the guard can tell WHETHER the chrome was worn without standing up
// the header's server-function machinery. The chrome itself is asserted by
// scripts/header-entry-check.ts and e2e/public-homepage.spec.ts.
await mock.module("@tanstack/react-router", () => ({
  Link: ({ to, children, ...rest }: Record<string, unknown> & { children?: React.ReactNode }) =>
    React.createElement("a", { href: String(to ?? ""), ...rest }, children),
  useRouter: () => ({ invalidate: () => {} }),
}));
await mock.module("@/lib/lovable-error-reporting", () => ({ reportLovableError: () => {} }));
await mock.module("@/components/site/SiteLayout", () => ({
  SiteLayout: ({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", { "data-site-layout": "" }, children),
}));

const { I18nProvider } = await import("../src/i18n/context");
const { dictionaries } = await import("../src/i18n/dictionaries");
const { RootNotFound, RootError } = await import("../src/components/site/RootFallbacks");

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

const root = path.resolve(import.meta.dir, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const d = (lang: "sv" | "en") => dictionaries[lang] as Record<string, string>;

const KEYS = [
  "root.notFound.title",
  "root.notFound.body",
  "root.goHome",
  "root.error.title",
  "root.error.body",
  "root.error.retry",
] as const;

/** The five entities React writes into markup, undone, so a sentence with an
 *  apostrophe ("doesn't") is found by its dictionary text. */
const unescape = (html: string) =>
  html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

/** Render, tolerating a throw: the guard reports it as a failed check rather
 *  than dying, and silences the expected console.error of the error screen. */
function render(element: React.ReactElement): { html: string; threw: string | null } {
  const quiet = console.error;
  console.error = () => {};
  try {
    return { html: unescape(renderToStaticMarkup(element)), threw: null };
  } catch (e) {
    return { html: "", threw: e instanceof Error ? e.message : String(e) };
  } finally {
    console.error = quiet;
  }
}

const queryClient = new QueryClient();
const withQuery = (child: React.ReactElement) =>
  React.createElement(QueryClientProvider, { client: queryClient }, child);
const withI18n = (lang: "sv" | "en", child: React.ReactElement) =>
  React.createElement(I18nProvider, { initialLang: lang }, child);

const error = new Error("boom");
const reset = () => {};
const notFound = () => React.createElement(RootNotFound);
const errorScreen = () => React.createElement(RootError, { error, reset } as never);

/* R1 ---------------------------------------------------------------- */
group("R1 · the screens are translated");
{
  const route = read("src/routes/__root.tsx");
  const component = read("src/components/site/RootFallbacks.tsx");
  const code = (src: string) =>
    src
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
  for (const english of [
    "Page not found",
    "Go home",
    "Try again",
    "This page didn't load",
    "Something went wrong",
    "doesn't exist or has been moved",
  ]) {
    ck(
      `no hard-coded "${english}" in the route or the component`,
      !code(route).includes(english) && !code(component).includes(english),
    );
  }
  for (const key of KEYS) {
    ck(
      `"${key}" is read through the dictionary`,
      component.includes(`t("${key}")`),
      "RootFallbacks.tsx does not ask for it",
    );
    for (const lang of ["sv", "en"] as const) {
      ck(`${lang} defines "${key}"`, typeof d(lang)[key] === "string" && d(lang)[key].length > 0);
    }
    ck(`"${key}" is actually translated`, d("sv")[key] !== d("en")[key]);
  }
  // The words the e2e specs already look for, beside their English forms.
  ck(
    "sv keeps the strings the e2e specs name",
    d("sv")["root.error.title"] === "Sidan kunde inte laddas" &&
      d("sv")["root.error.retry"] === "Försök igen",
  );
  ck(
    "en keeps the strings the e2e specs name",
    d("en")["root.error.title"] === "This page didn't load" &&
      d("en")["root.error.retry"] === "Try again",
  );
  ck(
    "the tolerant translator reads storage after mount, never during render",
    /useEffect\(\(\) => \{\s*if \(ctx\) return;\s*const choice = readStoredLang\(\);/.test(
      read("src/i18n/context.tsx"),
    ),
    "a render-time read would make the first client render differ from the server's",
  );
}

/* R2 ---------------------------------------------------------------- */
group("R2 · inside the providers the 404 wears the chrome and speaks the reader's language");
for (const lang of ["sv", "en"] as const) {
  const { html, threw } = render(withQuery(withI18n(lang, notFound())));
  ck(`${lang}: renders`, threw === null, threw);
  ck(`${lang}: wears the public chrome`, html.includes("data-site-layout"));
  ck(`${lang}: says what happened`, html.includes(d(lang)["root.notFound.title"]));
  ck(`${lang}: explains it`, html.includes(d(lang)["root.notFound.body"]));
  ck(`${lang}: offers the way home`, html.includes(`>${d(lang)["root.goHome"]}</a>`));
  ck(`${lang}: marks its language`, html.includes(`lang="${lang}"`));
  ck(`${lang}: still says 404`, html.includes(">404<"));
}

/* R3 ---------------------------------------------------------------- */
group("R3 · outside the providers both screens render, in Swedish, and never throw");
{
  const cases: ReadonlyArray<readonly [string, () => React.ReactElement]> = [
    ["no provider at all", () => notFound()],
    ["an I18nProvider but no QueryClientProvider", () => withI18n("en", notFound())],
    ["a QueryClientProvider but no I18nProvider", () => withQuery(notFound())],
  ];
  for (const [what, make] of cases) {
    const { html, threw } = render(make());
    ck(`404 with ${what}: renders`, threw === null, threw);
    ck(`404 with ${what}: does not wear the chrome`, !html.includes("data-site-layout"));
    ck(`404 with ${what}: still says what happened`, html.includes("404") && html.includes("<h1"));
    ck(`404 with ${what}: still offers the way home`, html.includes('href="/"'));
  }
  {
    const { html, threw } = render(notFound());
    ck(
      "404 with no provider: Swedish, the site default",
      html.includes(d("sv")["root.notFound.title"]),
    );
    ck("404 with no provider: not English", !html.includes(d("en")["root.notFound.title"]), threw);
  }
  {
    const { html, threw } = render(errorScreen());
    ck("error screen with no provider: renders", threw === null, threw);
    ck("error screen with no provider: Swedish", html.includes(d("sv")["root.error.title"]));
    ck("error screen with no provider: says what to do", html.includes(d("sv")["root.error.body"]));
    ck(
      "error screen with no provider: does not wear the chrome",
      !html.includes("data-site-layout"),
    );
  }
  for (const lang of ["sv", "en"] as const) {
    const { html, threw } = render(withQuery(withI18n(lang, errorScreen())));
    ck(`error screen inside the providers (${lang}): renders`, threw === null, threw);
    ck(
      `error screen inside the providers (${lang}): in the reader's language`,
      html.includes(d(lang)["root.error.title"]),
    );
    ck(
      `error screen inside the providers (${lang}): no chrome either`,
      !html.includes("data-site-layout"),
    );
  }
}

/* R4 ---------------------------------------------------------------- */
group("R4 · behaviour is unchanged: retry and go home");
for (const lang of ["sv", "en"] as const) {
  const { html } = render(withI18n(lang, errorScreen()));
  ck(
    `${lang}: a retry button`,
    new RegExp(`<button[^>]*>${d(lang)["root.error.retry"]}</button>`).test(html),
  );
  ck(
    `${lang}: a plain anchor home (a full reload is the way out of a broken router)`,
    html.includes(`<a href="/"`) && html.includes(`>${d(lang)["root.goHome"]}</a>`),
  );
}
{
  const src = read("src/components/site/RootFallbacks.tsx");
  ck(
    "retry still invalidates the router and resets the boundary",
    /router\.invalidate\(\);\s*reset\(\);/.test(src),
  );
  ck(
    "the error is still reported",
    /reportLovableError\(error, \{ boundary: "tanstack_root_error_component" \}\)/.test(src),
  );
}

/* R5 ---------------------------------------------------------------- */
group("R5 · the route wires them in");
{
  const route = read("src/routes/__root.tsx");
  ck("notFoundComponent is RootNotFound", /notFoundComponent: RootNotFound,/.test(route));
  ck("errorComponent is RootError", /errorComponent: RootError,/.test(route));
  ck(
    "the providers still wrap the Outlet that renders an unmatched URL's 404",
    /<QueryClientProvider client=\{queryClient\}>\s*<I18nProvider>[\s\S]*<Outlet \/>[\s\S]*<\/I18nProvider>\s*<\/QueryClientProvider>/.test(
      route,
    ),
  );
  ck(
    "the component file exists",
    existsSync(path.join(root, "src/components/site/RootFallbacks.tsx")),
  );
}

console.log("");
if (fails.length > 0) {
  console.error(`root-fallback:check FAILED (${fails.length}):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("root-fallback:check OK");
