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
// ── WHAT CHANGED (2026-09-12, employer entry clarity) ─────────────────
//
// The 2026-08-30 collapse into one door removed the ungated
// "Arbetsgivarportal" from the utility bar, correctly: it offered an
// organisation context to people holding none. What it also removed,
// without meaning to, was the only place a signed-out visitor could learn
// that the employer portal is reached through the same login. "Logga in"
// reads as the personal one, so an existing customer's site manager had no
// visible route in at all, and /employers offered them a contact form that
// sends nothing.
//
// The settled shape adds a THIRD label, which is a door and says so:
//
//   "Arbetsgivare"        -> /employers  (information, primary nav only)
//   "Logga in"            -> /login      (the one door, personal reading)
//   "Företagsinloggning"  -> /login?redirect=/employer   (the same door)
//   "Skapa ditt Security Passport" -> /signup?redirect=/passport
//
// It is the SAME route, the SAME form and the SAME account. Only the
// return destination differs, carried by the same validated `?redirect=`
// the Passport CTA already uses. Section 9 below asserts all of it,
// including that it is offered to signed-out visitors only -- a second
// ungated entry beside the account menu's truthful, membership-scoped list
// would be the 2026-08-30 defect wearing new words.
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
// 9. THE EMPLOYER DOOR — visible, named, and still the same one door.
//
//    Section 8 above defends the thing this section must not undo: an
//    ungated "Arbetsgivarportal" that offered an organisation context to
//    people who hold none, and told somebody who holds two nothing about
//    which one it would open. That entry is gone and stays gone.
//
//    What was lost with it was DISCOVERABILITY for a signed-out visitor.
//    An employer arriving on the public site could see "Logga in", which
//    reads as the personal one, and had no way to tell that it is also the
//    way into their company's workspace. The correction is an entry that
//    says so in words -- and nothing else:
//
//      * ONE authentication system. It points at /login, the same route
//        the personal action points at, carrying "/employer" as a
//        validated `?redirect=`. Not a second form, not a second client,
//        not a second identity.
//      * NO ROLE FROM INTENT. `?redirect=` selects a destination.
//        /employer then resolves real organisation membership server-side
//        on every load; RLS decides, and a URL never has.
//      * SIGNED-OUT ONLY. A signed-in person reaches their organisations
//        from the account menu, by name, and only the ones the database
//        returned. A second, ungated entry beside that truthful one would
//        be section 8's defect wearing new words.
//      * NOT "Arbetsgivare". That word is the information page in the
//        primary nav (section 3) and nothing else. This entry has its own.
// -----------------------------------------------------------------------
const EMPLOYER_INTENT = '{ redirect: "/employer" } as never';
const EMPLOYER_GATE = "signedIn !== true && employerPortalEnabled() && (";

// ── 9a. Both languages name it, and name it something of its own ──────
const employerCopy = {
  "nav.employerLogin": { sv: "Företagsinloggning", en: "Employer login" },
  "employers.cta.login": { sv: "Logga in för företag", en: "Employer login" },
  "employers.cta.createAccount": {
    sv: "Skapa företagskonto",
    en: "Create employer account",
  },
} as const;

for (const [key, expected] of Object.entries(employerCopy)) {
  for (const lang of ["sv", "en"] as const) {
    const actual = (dictionaries[lang] as Record<string, string>)[key];
    expect(
      actual === expected[lang],
      `${lang} "${key}" must read "${expected[lang]}" (found ${actual === undefined ? "no entry" : `"${actual}"`}) -- the employer entrance is distinguished from personal sign-in by exactly these words`,
    );
  }
}

// Both languages, and DIFFERENT text in each: an English interface showing
// "Företagsinloggning" is the regression this line exists to catch.
for (const key of Object.keys(employerCopy)) {
  const sv = (dictionaries.sv as Record<string, string>)[key];
  const en = (dictionaries.en as Record<string, string>)[key];
  expect(
    typeof sv === "string" && typeof en === "string" && sv !== en,
    `"${key}" must be translated in both languages -- an untouched English string is an untranslated one`,
  );
}

// It may not reuse the information page's word, in either language. Same
// rule as section 3, checked on the copy rather than on the usage count.
for (const lang of ["sv", "en"] as const) {
  const d = dictionaries[lang] as Record<string, string>;
  expect(
    d["nav.employerLogin"] !== d["nav.employers"],
    `${lang} "nav.employerLogin" must not be the same word as "nav.employers" -- one label for two destinations is the original defect`,
  );
  expect(
    d["nav.employerLogin"] !== d["nav.signin"],
    `${lang} "nav.employerLogin" must be distinguishable from "nav.signin" -- the two entrances are the whole point`,
  );
}

// ── 9b. Desktop AND the compact menu, same destination ────────────────
const employerIntentUses = header.split(EMPLOYER_INTENT).length - 1;
expect(
  employerIntentUses === 2,
  `the employer entrance must carry search=${EMPLOYER_INTENT} on BOTH the desktop utility bar and the compact menu (found ${employerIntentUses}) -- an entrance that exists only on a laptop is not an entrance`,
);

const desktopBar = header.slice(0, header.indexOf(menuMarker));
expect(
  desktopBar.includes(EMPLOYER_INTENT) && desktopBar.includes('{t("nav.employerLogin")}'),
  "the desktop header must offer the employer entrance, labelled nav.employerLogin",
);
expect(
  mobileMenu.includes(EMPLOYER_INTENT) && mobileMenu.includes('{t("nav.employerLogin")}'),
  "the compact menu must offer the same employer entrance, labelled nav.employerLogin",
);

// Visible TEXT, not an icon. An icon-only door is a door nobody can name,
// and on the viewport where it is hardest to hit it must also be a 44px
// target carrying the shared focus ring -- the standard every other row in
// this sheet already meets.
const mobileEmployerRow = mobileMenu.slice(
  mobileMenu.indexOf(EMPLOYER_INTENT),
  mobileMenu.indexOf(EMPLOYER_INTENT) + 900,
);
expect(
  mobileEmployerRow.includes("min-h-[44px]"),
  "the compact menu's employer entrance must meet the 44px touch target every other row in the sheet meets",
);
expect(
  mobileEmployerRow.includes("focusRing"),
  "the compact menu's employer entrance must carry the shared keyboard-focus treatment",
);
expect(
  mobileEmployerRow.includes('{t("nav.employerLogin")}'),
  "the compact menu's employer entrance must carry visible text -- an icon-only control is not a named entrance",
);
// aria-hidden on the decorative icon, so a screen reader reads the words
// once rather than announcing a building.
expect(
  /<Building2[^>]*aria-hidden="true"/.test(mobileEmployerRow),
  "the employer entrance's icon must be decorative (aria-hidden) -- the label carries the meaning",
);

// ── 9c. It is offered to a signed-out visitor and to nobody else ──────
{
  const gates = header.split(EMPLOYER_GATE).length - 1;
  expect(
    gates === 2,
    `both employer entrances must be gated on "${EMPLOYER_GATE}" (found ${gates}) -- a signed-in person reaches their organisations from the account menu, by name`,
  );
  let cursor = 0;
  let guarded = 0;
  for (;;) {
    const at = header.indexOf(EMPLOYER_INTENT, cursor);
    if (at === -1) break;
    cursor = at + EMPLOYER_INTENT.length;
    if (header.slice(Math.max(0, at - 400), at).includes(EMPLOYER_GATE)) guarded += 1;
  }
  expect(
    guarded === employerIntentUses,
    `every employer entrance must sit inside the signed-out gate (${guarded} of ${employerIntentUses} do) -- a duplicate door for somebody already signed in is section 8's defect in new words`,
  );
}

// The organisation entries a SIGNED-IN person sees are still the ones the
// database returned, and nothing here derives one from anywhere else.
expect(
  header.includes("const hasEmployerWorkspace = myWorkspaces.length > 0;"),
  "an organisation context must still be offered only when listMyEmployerWorkspaces returned one",
);
expect(
  !/employerLogin[\s\S]{0,200}user_metadata/.test(header),
  "the employer entrance must not read user_metadata -- metadata is user-writable and has never been a permission",
);

// ── 9d. The destination is real, internal, and not a loop ─────────────
expect(
  existsSync(path.join(root, "src/routes/_authenticated.employer.index.tsx")),
  "the employer entrance's landing (/employer) must be backed by the existing membership-resolving route",
);
expect(
  !AUTH_SURFACES.includes("/employer"),
  "/employer must not be an auth surface -- safeReturnPath would discard the intent and land everybody on the default destination",
);

const { safeReturnPath } = await import("../src/lib/auth/safe-redirect");
expect(
  safeReturnPath("/employer", "/my-career") === "/employer",
  "safeReturnPath must carry /employer through -- otherwise the entrance silently becomes the personal one",
);

// ── 9e. Open-redirect protection, on the parameter this entrance uses ──
//
// The entrance ships a `?redirect=` in front of visitors, which is exactly
// the parameter an attacker rewrites. These are asserted HERE, beside the
// feature that raises their profile, rather than only in the redirect
// helper's own guard.
for (const hostile of [
  "https://evil.test/employer",
  "//evil.test",
  "/\\evil.test",
  "\\\\evil.test",
  "javascript:alert(1)",
  "/employer\\@evil.test",
  "/login?redirect=/login",
  "/employer/login",
  "/employer%0d%0aSet-Cookie:%20a=b",
  `/employer${"x".repeat(600)}`,
]) {
  expect(
    safeReturnPath(hostile, "/my-career") === "/my-career",
    `safeReturnPath must refuse ${JSON.stringify(hostile)} -- the employer entrance must not become an open redirect`,
  );
}

// ── 9f. The legacy employer doors still work, and still validate ──────
//
// Section 6 asserts the FILES survive and carry no auth of their own. This
// asserts what they DO: resolve onto the unified entrance, carrying a
// validated return path and dropping a hostile one.
const { unifiedAuthHref } = await import("../src/lib/auth/legacy-entry");
expect(
  unifiedAuthHref("signin", "?redirect=/employer") === "/login?redirect=%2Femployer",
  "/employer/login must resolve to /login carrying the validated /employer return path",
);
expect(
  unifiedAuthHref("signup", "?redirect=/employer") === "/signup?redirect=%2Femployer",
  "/employer/register must resolve to /signup carrying the validated /employer return path",
);
expect(
  unifiedAuthHref("signin", "?redirect=https://evil.test") === "/login",
  "a hostile return path must be dropped by the legacy employer door, not forwarded",
);
expect(
  unifiedAuthHref("signin", "?intent=employer") === "/login",
  "intent must not survive the legacy employer door -- it selected a form, and was never a permission",
);

// ── 9g. /employers offers both actions, and contact is not the front door ──
const employersPage = read("src/routes/employers.tsx");
expect(
  employersPage.includes('<PrimaryLink to="/login" search={{ redirect: "/employer" }}>') &&
    employersPage.includes('{t("employers.cta.login")}'),
  '/employers must offer "employers.cta.login" pointing at /login with the /employer return path',
);
expect(
  employersPage.includes(
    '<PrimaryLink to="/signup" search={{ redirect: "/employer" }} variant="ghost">',
  ) && employersPage.includes('{t("employers.cta.createAccount")}'),
  '/employers must offer "employers.cta.createAccount" pointing at /signup with the /employer return path',
);
expect(
  !/to="\/employer\/(login|register)"/.test(employersPage),
  "/employers must not send anyone through a compatibility redirect -- the one door is /login",
);
// The dead contact form is not the way in. /contact calls preventDefault
// and sends nothing (it says so in its own preview notice), so it may be
// present, but it may not come first and it may not be a primary action
// while the two real entrances are on the page.
{
  const login = employersPage.indexOf('{t("employers.cta.login")}');
  const talk = employersPage.indexOf('{t("cta.talk")}');
  expect(
    login !== -1 && talk !== -1 && login < talk,
    "/employers must lead with the employer entrance, not with the contact form",
  );
  const gated = employersPage.indexOf("employerPortalEnabled() ? (");
  const fallback = employersPage.indexOf(") : (");
  expect(
    gated !== -1 &&
      fallback > gated &&
      !employersPage.slice(gated, fallback).includes('<PrimaryLink to="/contact">'),
    "/contact must not be a primary action on /employers while the employer entrances are offered",
  );
}
expect(
  existsSync(path.join(root, "src/routes/contact.tsx")),
  "/employers still links /contact, so the route must exist",
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
