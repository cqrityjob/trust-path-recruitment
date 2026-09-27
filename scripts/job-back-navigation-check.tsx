// "Tillbaka till sökresultatet" on a job ad -- executed, not read.
//
// ── WHAT THIS DEFENDS ──────────────────────────────────────────────────
//
// The job ad's back control called history.back(). That is wherever the
// previous history entry happens to be: another site, a related ad, the login
// page after signing in, and on a direct entry nothing at all. It is replaced
// by a link rebuilt from `from` -- the validated /jobs search the ad was
// opened under (src/lib/job-intelligence/job-search.ts).
//
//   J1  the /jobs validator, now shared, behaves as the one it replaced
//   J2  a search survives card -> ad -> back, through TanStack's REAL search
//       serialisation, and a direct entry or refresh falls back to /jobs
//   J3  it survives signing in to apply: ad -> /login -> safeReturnPath ->
//       splitReturnPath -> navigate -> ad -> back, byte for byte
//   J4  a related-ad hop keeps it
//   J5  a hostile or oversized `from` can choose filters and nothing else,
//       and never costs the reader the ad itself
//   J6  the wiring: no history.back(), the card, the related cards, the apply
//       sign-in link and both labels, in sv and en
//
// A real-browser run needs the application built against a non-production
// backend; this guard needs neither and runs in CI.
//
// Run: bun run job-back-navigation:check

import { readFileSync } from "node:fs";
import path from "node:path";
import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The real serialisers, taken BEFORE the router is mocked for rendering.
const { defaultParseSearch, defaultStringifySearch } = await import("@tanstack/react-router");

// A Link that builds its href the way the router does -- params interpolated,
// search through the real defaultStringifySearch -- so the rendered card is
// read, not its source.
await mock.module("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    search,
    children,
    ...rest
  }: Record<string, unknown> & { children?: React.ReactNode }) => {
    let href = String(to ?? "");
    for (const [k, v] of Object.entries((params ?? {}) as Record<string, string>)) {
      href = href.replace(`$${k}`, encodeURIComponent(v));
    }
    href += defaultStringifySearch((search ?? {}) as Record<string, unknown>);
    return React.createElement("a", { href, ...rest }, children);
  },
}));

const {
  JOB_SEARCH_KEYS,
  jobAdReturnPath,
  jobApplyReturnPath,
  jobSearchFromFrom,
  jobSearchToFrom,
  validateJobAdSearch,
  validateJobSearch,
} = await import("../src/lib/job-intelligence/job-search");
const { safeReturnPath, splitReturnPath } = await import("../src/lib/auth/safe-redirect");
const { I18nProvider } = await import("../src/i18n/context");
const { dictionaries } = await import("../src/i18n/dictionaries");
const { JobCard } = await import("../src/components/jobs/JobCard");

const fails: string[] = [];
function ck(name: string, ok: boolean, detail?: unknown): void {
  console.log(
    `  ${ok ? "ok  " : "FAIL"} ${name}${ok || detail === undefined ? "" : ` — ${JSON.stringify(detail)}`}`,
  );
  if (!ok) fails.push(name);
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const root = path.resolve(import.meta.dir, "..");
const code = (p: string) =>
  readFileSync(path.join(root, p), "utf8")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

/** A URL's search half, the way the router parses it on arrival. */
const arrive = (url: string) =>
  defaultParseSearch(url.includes("?") ? url.slice(url.indexOf("?")) : "");

const SEARCH = {
  q: "väktare & ordningsvakt",
  location: "Göteborg",
  family: "physical-security",
  employment: "full_time",
  workplace: "on_site",
  experience: "mid",
  country: "SE",
};
const SLUG = "vaktare-goteborg-2026";

console.log("job-back-navigation-check");

/* J1 ---------------------------------------------------------------- */
console.log("\nJ1 · the shared /jobs validator behaves as the one it replaced");
{
  // The inline validator this replaced: coerceString, then keep if truthy.
  const legacy = (raw: Record<string, unknown>) => {
    const out: Record<string, string> = {};
    for (const key of JOB_SEARCH_KEYS) {
      const v = typeof raw[key] === "string" ? (raw[key] as string) : "";
      if (v) out[key] = v;
    }
    return out;
  };
  const CASES: Record<string, unknown>[] = [
    {},
    SEARCH,
    { q: "", location: "Malmö" },
    { q: 123, location: true, family: null, employment: ["a"], workplace: { x: 1 } },
    { q: "x", redirect: "https://evil.example", unknown: "z" },
    // Whitespace is the person's own: the validator neither trims nor drops it.
    { q: "  vakt  ", location: " " },
  ];
  for (const [i, raw] of CASES.entries()) {
    ck(`case ${i}: same result as before`, same(validateJobSearch(raw), legacy(raw)), {
      now: validateJobSearch(raw),
      before: legacy(raw),
    });
  }
  const jobsIndex = code("src/routes/jobs.index.tsx");
  ck("/jobs uses the shared validator", /validateSearch:\s*validateJobSearch\b/.test(jobsIndex));
  ck(
    "and keeps no private copy of it",
    !/function coerceString|type JobSearch = \{/.test(jobsIndex),
  );
}

/* J2 ---------------------------------------------------------------- */
console.log("\nJ2 · card -> ad -> back, through the router's own serialisation");
{
  const from = jobSearchToFrom(SEARCH);
  ck("a search becomes a `from` value", typeof from === "string" && from.length > 0, from);
  ck(
    "which is never valid JSON, so the router leaves it a string",
    (() => {
      try {
        JSON.parse(from!);
        return false;
      } catch {
        return true;
      }
    })(),
  );
  ck("an empty search carries no `from`", jobSearchToFrom({}) === undefined);

  // The card, rendered.
  const job = {
    id: "job-1",
    slug: SLUG,
    title_sv: "Väktare",
    title_en: "Security officer",
    location_text: "Göteborg",
    country: "SE",
    city: "Göteborg",
    region: null,
    workplace_type: null,
    employment_type: null,
    experience_level: null,
    family_id: null,
    profession_slug: null,
    application_method: "internal",
    application_url: null,
    application_email: null,
    published_at: null,
    deadline_at: null,
    employer_id: "emp-1",
    employer: null,
  } as unknown as Parameters<typeof JobCard>[0]["job"];
  const hrefOf = (markup: string) => markup.match(/<a href="([^"]*)"/)?.[1]?.replace(/&amp;/g, "&");
  const cardHref = hrefOf(
    renderToStaticMarkup(
      <I18nProvider initialLang="sv">
        <JobCard job={job} lang="sv" from={from} />
      </I18nProvider>,
    ),
  );
  const plainHref = hrefOf(
    renderToStaticMarkup(
      <I18nProvider initialLang="sv">
        <JobCard job={job} lang="sv" />
      </I18nProvider>,
    ),
  );
  ck(
    "a listed card links its ad WITH the search",
    cardHref?.startsWith(`/jobs/${SLUG}?from=`) === true,
    cardHref,
  );
  ck("a card with no search links the bare ad", plainHref === `/jobs/${SLUG}`, plainHref);

  // Arrival on the ad: parsed as the router parses it, validated as the
  // route validates it.
  const ad = validateJobAdSearch(arrive(cardHref ?? ""));
  ck("the ad receives the same `from`", ad.from === from, ad);
  const back = jobSearchFromFrom(ad.from);
  ck("and the back link rebuilds the search exactly", same(back, SEARCH), back);
  const backUrl = `/jobs${defaultStringifySearch(back)}`;
  ck(
    "which /jobs, parsing its own URL, reads as the same search",
    same(validateJobSearch(arrive(backUrl)), SEARCH),
    backUrl,
  );

  // Direct entry and refresh: the URL is all there is.
  ck("a direct entry has no search, so back is plain /jobs", same(validateJobAdSearch({}), {}));
  ck(
    "a refresh re-derives the same search from the same URL",
    same(jobSearchFromFrom(validateJobAdSearch(arrive(cardHref ?? "")).from), SEARCH),
  );
}

/* J3 ---------------------------------------------------------------- */
console.log("\nJ3 · signing in to apply comes back to the ad, WITH its search");
{
  const from = jobSearchToFrom(SEARCH)!;
  const returnTo = jobApplyReturnPath(jobAdReturnPath(SLUG, from));
  ck(
    "the return path is the ad with its search",
    returnTo.startsWith(`/jobs/${SLUG}?from=`),
    returnTo,
  );
  // The apply sign-in link, as ApplyInternalDialog writes it.
  const loginHref = `/login?redirect=${encodeURIComponent(returnTo)}`;
  const redirect = new URLSearchParams(loginHref.slice(loginHref.indexOf("?") + 1)).get("redirect");
  ck("/login reads back exactly that path", redirect === returnTo, redirect);
  const accepted = safeReturnPath(redirect, "/my-career");
  ck("and safeReturnPath accepts it unchanged", accepted === returnTo, accepted);
  const { to, search } = splitReturnPath(accepted);
  ck("the one door splits it into the ad", to === `/jobs/${SLUG}`, to);
  // navigate({ to, search }) -> the router writes the URL -> the ad parses it.
  const landed = `${to}${defaultStringifySearch(search)}`;
  const ad = validateJobAdSearch(arrive(landed));
  ck("the ad after sign-in has the same `from`", ad.from === from, { landed, ad });
  ck("the requested application action survives sign-in", ad.apply === "1", ad);
  ck("so the way back is still the same search", same(jobSearchFromFrom(ad.from), SEARCH));
  ck(
    "an ad opened without a search returns to the bare ad",
    jobAdReturnPath(SLUG, undefined) === `/jobs/${SLUG}`,
  );
}

/* J4 ---------------------------------------------------------------- */
console.log("\nJ4 · a related-ad hop keeps the way back");
{
  const from = jobSearchToFrom(SEARCH)!;
  // The related card is built with the ad's own `from`.
  const hop = `/jobs/another-ad${defaultStringifySearch({ from })}`;
  const ad = validateJobAdSearch(arrive(hop));
  ck("the related ad receives the same `from`", ad.from === from, ad);
  const route = code("src/components/jobs/JobDetailContent.tsx");
  ck(
    "and the ad hands its `from` to every related card",
    /<RelatedJobs[\s\S]{0,200}from=\{from\}/.test(route) &&
      /<JobCard key=\{r\.id\} job=\{r\} lang=\{lang\} from=\{from\} \/>/.test(route),
  );
}

/* J5 ---------------------------------------------------------------- */
console.log("\nJ5 · a hostile or oversized `from` chooses filters and nothing else");
{
  const HOSTILE: [string, unknown][] = [
    ["an absolute URL", "https://evil.example/jobs"],
    ["a protocol-relative path", "//evil.example"],
    ["a script scheme", "javascript:alert(1)"],
    ["an auth surface", "/login?redirect=/login"],
    ["a non-string (JSON number)", 123],
    ["an object", { q: "x" }],
  ];
  for (const [name, raw] of HOSTILE) {
    const search = jobSearchFromFrom(raw);
    ck(`${name}: no filter survives it`, same(search, {}), search);
  }
  const mixed = jobSearchFromFrom("q=vakt&redirect=https%3A%2F%2Fevil.example&to=%2F%2Fevil");
  ck("unknown keys are dropped, known ones kept", same(mixed, { q: "vakt" }), mixed);
  ck(
    "the route normalises `from` on arrival",
    same(validateJobAdSearch({ from: "location=Lund&evil=1" }), { from: "location=Lund" }),
    validateJobAdSearch({ from: "location=Lund&evil=1" }),
  );
  // The back link's destination is the /jobs route itself, whatever `from` says.
  const route = code("src/routes/jobs.$slug.tsx");
  ck(
    "the back link's destination is always /jobs",
    /function BackToResults\(\)[\s\S]*?<Link\s+to="\/jobs"\s+search=\{search\}/.test(route),
  );
  // Never cost the reader the ad.
  const newline = jobSearchToFrom({ q: "a\nb" });
  ck(
    "a search holding a line break is dropped from the return path, the ad kept",
    jobAdReturnPath(SLUG, newline) === `/jobs/${SLUG}`,
    jobAdReturnPath(SLUG, newline),
  );
  const long = jobSearchToFrom({ q: "x".repeat(600) });
  ck(
    "a search too long for safeReturnPath is dropped, the ad kept",
    jobAdReturnPath(SLUG, long) === `/jobs/${SLUG}`,
    jobAdReturnPath(SLUG, long).length,
  );
  ck(
    "a slug cannot walk out of /jobs",
    jobAdReturnPath("../../admin", undefined) === "/jobs/..%2F..%2Fadmin",
    jobAdReturnPath("../../admin", undefined),
  );
}

/* J6 ---------------------------------------------------------------- */
console.log("\nJ6 · the wiring, and the words");
{
  const route = code("src/routes/jobs.$slug.tsx");
  ck("the ad no longer calls history.back()", !/history\.back\(/.test(route));
  ck("the ad validates its search", /validateSearch:\s*validateJobAdSearch\b/.test(route));
  ck(
    "the back link rebuilds the search from `from`",
    /jobSearchFromFrom\(/.test(route) && /<BackToResults \/>/.test(route),
  );
  ck(
    "not-found and error states offer the same way back",
    (route.match(/<BackToResults \/>/g) ?? []).length === 3,
    (route.match(/<BackToResults \/>/g) ?? []).length,
  );
  ck(
    "the apply sidebar hands the dialog the ad's return path",
    /returnTo=\{jobAdReturnPath\(job.slug, from\)\}/.test(
      code("src/components/jobs/JobDetailContent.tsx"),
    ) && /returnTo=\{returnTo\}/.test(code("src/components/jobs/JobApplicationPanel.tsx")),
  );
  const dialog = code("src/components/jobs/ApplyInternalDialog.tsx");
  ck(
    "the sign-in link carries that path, not window.location.pathname",
    dialog.includes(
      "href={`/login?redirect=${encodeURIComponent(jobApplyReturnPath(returnTo))}`}",
    ) && !/window\.location\.pathname/.test(dialog),
  );
  const index = code("src/routes/jobs.index.tsx");
  ck("/jobs hands its search to the results", /from=\{jobSearchToFrom\(search\)\}/.test(index));
  const results = code("src/components/jobs/JobResults.tsx");
  ck("and the results to every card", /from=\{from\}/.test(results));
  const card = code("src/components/jobs/JobCard.tsx");
  ck("the card links its ad with `from`", /search=\{from \? \{ from \} : \{\}\}/.test(card));

  const sv = dictionaries.sv as Record<string, string>;
  const en = dictionaries.en as Record<string, string>;
  // MVP text specification §10: the ad's way back reads "Tillbaka till
  // jobben" whether or not a search is behind it. Which list it opens is the
  // behaviour asserted above; the words say where it goes in both cases.
  ck("sv: back to the jobs", sv["jobs.detail.backToResults"] === "← Tillbaka till jobben");
  ck("en: back to the jobs", en["jobs.detail.backToResults"] === "← Back to jobs");
  ck(
    "and with no search the link says where it goes",
    sv["jobs.detail.back"] === "← Tillbaka till jobben" &&
      en["jobs.detail.back"] === "← Back to jobs",
  );
}

/* -------------------------------------------------------------------- */
console.log("");
if (fails.length > 0) {
  console.error(`job-back-navigation:check FAILED (${fails.length}):`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("job-back-navigation:check OK");
