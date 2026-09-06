// Public header entry-point guard.
//
// ── WHAT THIS ORIGINALLY DEFENDED, AND STILL DOES ──────────────────────
//
// A visitor could not tell what the header was offering, because the word
// "Arbetsgivare" was doing three jobs at once: the marketing page in the
// primary nav, the dark primary action button (which went to that same
// marketing page, not a login), and a utility-bar link (which did go to a
// login). Same word, two destinations, and the most prominent control in
// the header was not an action at all.
//
// That half of the guard is unchanged. "Arbetsgivare" is information, it
// appears exactly once, in the primary nav, and no action button may wear
// it.
//
// ── WHAT CHANGED (2026-08-30) ──────────────────────────────────────────
//
// The settled shape used to be THREE things, two of which were doors:
//
//   "Arbetsgivare"      -> /employers        (information)
//   "Logga in"          -> /candidate/login  (candidate door)
//   "Arbetsgivarportal" -> /employer/login   (employer door)
//
// Two doors named after audiences asked a visitor to classify themselves
// before the product had told them that one account covers both — and for
// the ordinary case, somebody who is both a Passport holder and a
// recruiter, there was no correct answer. The settled shape is now:
//
//   "Arbetsgivare"   -> /employers  (information, primary nav only)
//   "Logga in"       -> /login      (the one door)
//   "Skapa konto"    -> /signup     (the one way to create an account;
//                                    relabelled 2026-09-06, see below)
//
// and an organisation context is reached from the ACCOUNT MENU, by name,
// only for organisations row-level security actually returned. See
// docs/architecture/adr-unified-account-and-professional-identity.md.
//
// This file therefore asserts the new shape with the same rigour, plus one
// property the old shape could not have: that no second public auth
// surface has grown back.
//
// ── WHAT CHANGED (2026-09-06, the Passport-led homepage) ───────────────
//
// The header's one solid button still points at /signup. What changed is
// what it SAYS and what it carries:
//
//   "Skapa ditt Security Passport" -> /signup?redirect=/passport
//
// "Skapa konto" described a form. The account exists to hold a Security
// Passport, which is the product, so the button says so -- and it carries
// the intent through registration with `?redirect=`, the same validated
// mechanism that already makes an organisation invitation and an anonymous
// Career Discovery claim survive the round trip.
//
// Every invariant this guard defends is UNCHANGED: one door in at /login,
// one way to create an account at /signup, no audience-named doors, no
// second auth implementation. Three things are now asserted that were not:
// that the redirect target is a real route, that it is not itself an auth
// surface (which would be a loop), and that desktop and the compact menu
// carry the SAME destination -- a phone that dropped the `?redirect=` would
// land somebody on a dashboard with no explanation of what just happened.
//
// Plain TS script matching this repository's scripts/*-check.ts convention.
// The header is a React component with router/query/supabase imports and
// cannot be rendered outside the app runtime, so its half is a structural
// source-text check; the copy half imports the dictionaries directly, which
// are pure data. Run via `bun run header-entry:check`.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const errors: string[] = [];
function expect(condition: boolean, message: string): void {
  if (!condition) errors.push(message);
}

const root = path.resolve(import.meta.dir, "..");
const read = (p: string) => readFileSync(path.join(root, p), "utf8");
const header = read("src/components/site/SiteHeader.tsx");

const { dictionaries } = await import("../src/i18n/dictionaries");

// -----------------------------------------------------------------------
// 1. The three labels exist in both languages, with the agreed copy.
// -----------------------------------------------------------------------
const copy = {
  "nav.employers": { sv: "Arbetsgivare", en: "Employers" },
  "nav.signin": { sv: "Logga in", en: "Sign in" },
  "nav.createAccount": { sv: "Skapa konto", en: "Create account" },
} as const;

for (const [key, expected] of Object.entries(copy)) {
  for (const lang of ["sv", "en"] as const) {
    const actual = (dictionaries[lang] as Record<string, string>)[key];
    expect(
      actual === expected[lang],
      `${lang} "${key}" must read "${expected[lang]}" (found ${actual === undefined ? "no entry" : `"${actual}"`}) -- the header's entry points are distinguished by exactly these words`,
    );
  }
}

// -----------------------------------------------------------------------
// 2. The retired ambiguous key stays retired.
//    "nav.employerSignin" was Swedish "Arbetsgivare" -- a second, identical
//    label for a *different* destination than nav.employers. Reintroducing
//    it reintroduces the original bug.
// -----------------------------------------------------------------------
for (const lang of ["sv", "en"] as const) {
  expect(
    !("nav.employerSignin" in dictionaries[lang]),
    `${lang} must not define "nav.employerSignin" -- it duplicated the "Arbetsgivare" label for an action`,
  );
}
expect(!header.includes("nav.employerSignin"), 'SiteHeader must not use "nav.employerSignin"');

// -----------------------------------------------------------------------
// 3. "Arbetsgivare" (nav.employers) stays information-only.
//    It may appear exactly once in the header: the primary-nav entry
//    pointing at the marketing page. Any second use is an action wearing
//    the information page's name, which is the original regression.
// -----------------------------------------------------------------------
const employersLabelUses = header.split('t("nav.employers")').length - 1;
expect(
  employersLabelUses === 1,
  `"nav.employers" must be used exactly once in SiteHeader -- the primary-nav information entry (found ${employersLabelUses})`,
);
// The nav entries carry an optional `hash` (the "Security Passport" item
// points at the homepage's own section), so the match is on the pair that
// matters rather than on the whole literal.
const employersNavEntry = /\{ to: "\/employers",[^}]*label: t\("nav\.employers"\) \}/;
expect(
  employersNavEntry.test(header),
  '"nav.employers" must be the primary-nav entry pointing at /employers (the employer information page)',
);

const employersActionButton = header.includes('to="/employers"') && !employersNavEntry.test(header);
expect(
  !employersActionButton,
  "No header action button may point at /employers -- that route is the information page and belongs to the primary nav only",
);

// -----------------------------------------------------------------------
// 4. ONE door in, ONE primary action, and account creation still reachable.
// -----------------------------------------------------------------------
expect(
  header.includes('to="/login"') && header.includes('{t("nav.signin")}'),
  'SiteHeader must offer "nav.signin" pointing at /login (the one public sign-in entrance)',
);

// The single solid action in the header row: create a Security Passport.
// It is the same destination and the same label the homepage's one primary
// CTA uses, so the chrome and the page cannot ask for two different things.
expect(
  header.includes('to="/signup"') && header.includes('{t("cta.passport")}'),
  'SiteHeader must offer "cta.passport" pointing at /signup -- the one primary action',
);
expect(
  existsSync(path.join(root, "src/routes/signup.tsx")),
  "/signup must remain the one account-creation route",
);
for (const [lang, expected] of [
  ["sv", "Skapa ditt Security Passport"],
  ["en", "Create your Security Passport"],
] as const) {
  const actual = (dictionaries[lang] as Record<string, string>)["cta.passport"];
  expect(
    actual === expected,
    `${lang} "cta.passport" must read "${expected}" (found ${actual === undefined ? "no entry" : `"${actual}"`})`,
  );
}

// ── THE INTENT SURVIVES REGISTRATION ─────────────────────────────────
//
// A button that says "create your Security Passport" and lands somebody on
// a generic dashboard has lied to them. The intent rides through signup as
// `?redirect=/passport`, and BOTH the desktop bar and the compact menu must
// carry it -- a sheet that dropped it would make the promise depend on the
// width of the reader's screen.
const PASSPORT_INTENT = '{ redirect: "/passport" } as never';
const intentUses = header.split(PASSPORT_INTENT).length - 1;
expect(
  intentUses === 2,
  `the header's primary action must carry search=${PASSPORT_INTENT} on BOTH the desktop bar and the compact menu (found ${intentUses})`,
);
expect(
  existsSync(path.join(root, "src/routes/_authenticated.passport.index.tsx")),
  "the primary action's landing (/passport) must be backed by the existing Passport route",
);
// And it must be a landing the redirect allow-list actually permits: an
// auth surface here would be a loop, and safeReturnPath would silently
// discard it, sending everybody to the default destination instead.
const { AUTH_SURFACES } = await import("../src/lib/auth/safe-redirect");
expect(
  !AUTH_SURFACES.includes("/passport"),
  "/passport must not be an auth surface -- safeReturnPath would discard the intent",
);

// Account creation still has ONE label of its own, and one route. The
// sign-in surface's swap link is asserted because it is the other way in,
// and a guard that only checked the header button would pass a product
// where somebody already on /login could not find registration.
const authForm = read("src/components/auth/UnifiedAuthForm.tsx");
expect(
  authForm.includes('to={isSignup ? "/login" : "/signup"}'),
  "the sign-in surface must carry the swap link to /signup",
);
expect(
  authForm.includes("auth.swap.to_signup"),
  'the swap link must be labelled "auth.swap.to_signup"',
);
for (const lang of ["sv", "en"] as const) {
  expect(
    typeof (dictionaries[lang] as Record<string, string>)["auth.swap.to_signup"] === "string",
    `${lang} must define "auth.swap.to_signup"`,
  );
}

// The Career Analysis is NOT the header's action. It is a supporting tool,
// offered once, from the homepage's third section.
expect(
  !header.includes('to="/security-career-assessment"'),
  "the Career Analysis must not be a header action -- Security Passport is the product, and the analysis is offered from the homepage's third section",
);

// The superseded doors must not come back into the chrome. They still EXIST
// as compatibility redirects -- that is deliberate and asserted below -- but
// the header must not send anyone through one.
for (const retired of [
  "/candidate/login",
  "/candidate/register",
  "/employer/login",
  "/employer/register",
  "/auth",
]) {
  expect(
    !header.includes(`to="${retired}"`) && !header.includes(`"${retired}"`),
    `SiteHeader must not link to ${retired} -- it is a compatibility redirect, not an entrance. The one door is /login.`,
  );
}

// -----------------------------------------------------------------------
// 5. Every route the header points at is a real route file. This is the
//    check that would have caught an invented /login.
// -----------------------------------------------------------------------
const routeFiles: Record<string, string> = {
  "/employers": "src/routes/employers.tsx",
  "/login": "src/routes/login.tsx",
  "/signup": "src/routes/signup.tsx",
  "/my-career": "src/routes/_authenticated.my-career.index.tsx",
};
for (const [route, file] of Object.entries(routeFiles)) {
  expect(
    existsSync(path.join(root, file)),
    `the header points at "${route}", which must be backed by the existing route ${file} -- do not invent a parallel auth route`,
  );
}

// -----------------------------------------------------------------------
// 6. There is exactly ONE public authentication implementation.
//
//    The four superseded routes must still resolve (they are bookmarked,
//    indexed and printed in mail already sent) AND must render no form of
//    their own -- a redirect that quietly kept a second auth implementation
//    alive behind it would be the worst of both.
// -----------------------------------------------------------------------
for (const file of [
  "src/routes/candidate.login.tsx",
  "src/routes/candidate.register.tsx",
  "src/routes/employer.login.tsx",
  "src/routes/employer.register.tsx",
  "src/routes/auth.tsx",
]) {
  expect(existsSync(path.join(root, file)), `${file} must survive as a compatibility redirect`);
  const source = read(file);
  expect(
    source.includes("redirect(") && !source.includes("signInWithPassword"),
    `${file} must be a redirect only -- it may not carry an authentication implementation of its own`,
  );
}

// The unified form is the only thing that signs anyone in, and the retired
// shared component is gone rather than orphaned.
expect(
  !existsSync(path.join(root, "src/components/auth/PortalAuthForm.tsx")),
  "PortalAuthForm must be removed, not left orphaned -- an unused second auth form is a second auth form",
);
expect(
  read("src/components/auth/UnifiedAuthForm.tsx").includes("signInWithPassword"),
  "UnifiedAuthForm must be the component that signs people in",
);

// /admin/login is deliberately separate and stays separate: it verifies
// is_platform_admin() AFTER authenticating, which the public entrance does
// not and must not do.
expect(
  existsSync(path.join(root, "src/routes/admin.login.tsx")),
  "/admin/login must remain a distinct surface -- platform administration is conceptually separate",
);

// -----------------------------------------------------------------------
// 7. Mobile carries the same entrance, not a desktop-only fix.
// -----------------------------------------------------------------------
// The compact menu covers everything below `lg`, not below `md`: six
// Swedish nav items plus a language toggle plus two actions do not fit in
// 768px, and at the md breakpoint the desktop bar used to switch on and
// overflow the viewport by ~240px. The slice must find the real block, so
// a breakpoint change that silently orphans this check fails here.
const menuMarker = 'lg:hidden", open ? "block" : "hidden"';
expect(
  header.includes(menuMarker),
  "the compact menu must cover every width below lg -- the desktop bar does not fit at 768px",
);
const mobileMenu = header.slice(header.indexOf(menuMarker));
expect(mobileMenu.length > 0, "the mobile menu block must be present in SiteHeader");
expect(mobileMenu.includes('to="/login"'), "the mobile menu must offer the one door at /login");
// The same primary action, not a desktop-only fix.
expect(
  mobileMenu.includes('to="/signup"') && mobileMenu.includes('{t("cta.passport")}'),
  "the mobile menu must offer the same primary action as the desktop bar",
);

// -----------------------------------------------------------------------
// 8. An organisation context is offered only to somebody who holds one.
//
//    The old ungated "Arbetsgivarportal" in the utility bar was a door
//    shown to everybody, including people with no membership at all.
// -----------------------------------------------------------------------
expect(
  !/t\("nav\.employerPortal"\)/.test(header),
  "the ungated employer-portal entry must not return -- an organisation context is reached from the account menu, by name, and only for organisations the database returned",
);
expect(
  header.includes("listMyEmployerWorkspaces"),
  "the organisation entries must come from listMyEmployerWorkspaces (what RLS returned), never from a client-side role check",
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
