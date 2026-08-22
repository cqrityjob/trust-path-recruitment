// Public header entry-point guard.
//
// The presentation-readiness fix this guards: a visitor could not tell where
// a candidate logs in versus where an employer logs in, because the word
// "Arbetsgivare" was doing three jobs at once in one header -- the marketing
// page in the primary nav, the dark primary action button (which went to that
// same marketing page, not a login), and the utility-bar link (which did go to
// /employer/login). Same word, two destinations, and the most prominent
// control in the header was not an action at all.
//
// The settled shape is three distinct things:
//   "Arbetsgivare"      -> /employers        (information, primary nav only)
//   "Logga in"          -> /candidate/login  (candidate/general door)
//   "Arbetsgivarportal" -> /employer/login   (employer door; /employer signed in)
//
// Plain TS script matching this repository's scripts/*-check.ts convention
// (no JS/TS unit-test runner is configured here). The header is a React
// component with router/query/supabase imports and cannot be rendered outside
// the app runtime, so its half is a structural source-text check; the copy
// half imports the dictionaries directly, which are pure data.
// Run via `bun run header-entry:check`.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const errors: string[] = [];
function expect(condition: boolean, message: string): void {
  if (!condition) errors.push(message);
}

const root = path.resolve(import.meta.dir, "..");
const header = readFileSync(path.join(root, "src/components/site/SiteHeader.tsx"), "utf8");

const { dictionaries } = await import("../src/i18n/dictionaries");

// -----------------------------------------------------------------------
// 1. The three labels exist in both languages, with the agreed copy.
// -----------------------------------------------------------------------
const copy = {
  "nav.employers": { sv: "Arbetsgivare", en: "Employers" },
  "nav.signin": { sv: "Logga in", en: "Sign in" },
  "nav.employerPortal": { sv: "Arbetsgivarportal", en: "Employer portal" },
} as const;

for (const [key, expected] of Object.entries(copy)) {
  for (const lang of ["sv", "en"] as const) {
    const actual = (dictionaries[lang] as Record<string, string>)[key];
    expect(
      actual === expected[lang],
      `${lang} "${key}" must read "${expected[lang]}" (found ${actual === undefined ? "no entry" : `"${actual}"`}) -- the header's three entry points are distinguished by exactly these words`,
    );
  }
}

// -----------------------------------------------------------------------
// 2. The retired ambiguous key stays retired.
//    "nav.employerSignin" was Swedish "Arbetsgivare" -- a second, identical
//    label for a *different* destination than nav.employers. Reintroducing it
//    reintroduces the bug.
// -----------------------------------------------------------------------
for (const lang of ["sv", "en"] as const) {
  expect(
    !("nav.employerSignin" in dictionaries[lang]),
    `${lang} must not define "nav.employerSignin" -- it duplicated the "Arbetsgivare" label for the employer *action*; the employer action is "nav.employerPortal"`,
  );
}
expect(
  !header.includes("nav.employerSignin"),
  'SiteHeader must not use "nav.employerSignin" -- the employer action is labelled "nav.employerPortal"',
);

// -----------------------------------------------------------------------
// 3. "Arbetsgivare" (nav.employers) stays information-only.
//    It may appear exactly once in the header: the primary-nav entry pointing
//    at the marketing page. Any second use is an action wearing the
//    information page's name, which is the regression being guarded.
// -----------------------------------------------------------------------
const employersLabelUses = header.split('t("nav.employers")').length - 1;
expect(
  employersLabelUses === 1,
  `"nav.employers" must be used exactly once in SiteHeader -- the primary-nav information entry (found ${employersLabelUses}). A second use means an action button is labelled with the marketing page's name again`,
);
expect(
  header.includes('{ to: "/employers", label: t("nav.employers") }'),
  '"nav.employers" must be the primary-nav entry pointing at /employers (the employer information page)',
);

// -----------------------------------------------------------------------
// 4. The candidate/general door and the employer door are separate controls
//    pointing at separate, existing routes -- desktop and mobile alike.
// -----------------------------------------------------------------------
expect(
  header.includes('to="/candidate/login"') && header.includes('{t("nav.signin")}'),
  'SiteHeader must offer "nav.signin" pointing at /candidate/login (the candidate/general door)',
);
expect(
  header.includes('to="/employer/login"'),
  "SiteHeader must offer a signed-out employer door pointing at /employer/login",
);
expect(
  header.includes('to={signedIn ? "/employer" : "/employer/login"}'),
  "The mobile employer entry must send a signed-in user to /employer and a signed-out user to /employer/login",
);

// No action button may point at /employers: that route is the information
// page, reachable from the primary nav.
const employersActionButton =
  header.includes('to="/employers"') &&
  !header.includes('{ to: "/employers", label: t("nav.employers") }');
expect(
  !employersActionButton,
  "No header action button may point at /employers -- that route is the information page and belongs to the primary nav only",
);

// -----------------------------------------------------------------------
// 5. Every route the header points at is a real route file. This is the
//    check that would have caught an invented /login.
// -----------------------------------------------------------------------
const routeFiles: Record<string, string> = {
  "/employers": "src/routes/employers.tsx",
  "/candidate/login": "src/routes/candidate.login.tsx",
  "/employer/login": "src/routes/employer.login.tsx",
  "/employer": "src/routes/_authenticated.employer.index.tsx",
};
for (const [route, file] of Object.entries(routeFiles)) {
  expect(
    existsSync(path.join(root, file)),
    `the header points at "${route}", which must be backed by the existing route ${file} -- do not invent a parallel auth route`,
  );
}

// Both login routes must be the existing shared PortalAuthForm entries, not a
// second authentication system grown alongside them.
for (const file of ["src/routes/candidate.login.tsx", "src/routes/employer.login.tsx"]) {
  const source = readFileSync(path.join(root, file), "utf8");
  expect(
    source.includes("PortalAuthForm"),
    `${file} must keep rendering the shared PortalAuthForm -- the two doors differ by portal/destination, not by having separate auth implementations`,
  );
}

// -----------------------------------------------------------------------
// 6. The mobile menu carries the same distinction, not just the desktop bar.
//    Both doors must appear below the md: breakpoint.
// -----------------------------------------------------------------------
const mobileMenu = header.slice(header.indexOf('md:hidden", open ? "block" : "hidden"'));
expect(mobileMenu.length > 0, "the mobile menu block must be present in SiteHeader");
expect(
  mobileMenu.includes('{t("nav.employerPortal")}'),
  'the mobile menu must offer "Arbetsgivarportal" -- the candidate/employer distinction cannot be desktop-only',
);
expect(
  mobileMenu.includes('to="/candidate/login"'),
  "the mobile menu must offer the candidate/general door at /candidate/login",
);

// -----------------------------------------------------------------------
// Report
// -----------------------------------------------------------------------
if (errors.length > 0) {
  console.error(`header-entry:check FAILED (${errors.length} issue(s)):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log("header-entry:check OK");
