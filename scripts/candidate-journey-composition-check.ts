// Screens 0, 1 and 2 compose to the owner's images.
//
// ── WHAT THIS DEFENDS ──────────────────────────────────────────────────
//
// Three compositions, each with one way to get it wrong that looks right:
//
//   0. The public landing page stays product-led and routes returning users
//      to the canonical login page. The failure mode is a SECOND authentication
//      implementation copied into the homepage.
//
//   1. Överskt shows the real Passport card. The failure mode is a second
//      Passport model, or a card that repeats the figures PassportSummary
//      already owns directly above it.
//
//   2. The Passport gets a section row. The failure mode is tabs: they
//      hide sections that other surfaces link to and that #246's retired-
//      anchor redirects land on, so a redirect would silently fail.
//
// Run: bun run candidate-journey-composition:check

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");
const code = (s: string): string => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const HOME = "src/routes/index.tsx";
const LOGIN = "src/routes/login.tsx";
const AUTH_FORM = "src/components/auth/UnifiedAuthForm.tsx";
const AUTH_PANEL = "src/components/auth/UnifiedAuthPanel.tsx";
const OVERVIEW = "src/routes/_authenticated.my-career.index.tsx";
const OVERVIEW_CARD = "src/components/professional-identity/OverviewPassportCard.tsx";
const INFO = "src/routes/_authenticated.passport.information.tsx";
const SECTION_NAV = "src/components/security-passport/PassportSectionNav.tsx";

const failures: string[] = [];
let assertions = 0;
function check(ok: boolean, diagnostic: string): void {
  assertions += 1;
  if (!ok) failures.push(diagnostic);
  else console.log(`  ok ${diagnostic}`);
}

const home = code(read(HOME));
const form = code(read(AUTH_FORM));
const panel = code(read(AUTH_PANEL));

/* ------------------------------------------------------------------ */
console.log("\n0 · the landing page stays product-led, with only one auth flow");

check(!/UnifiedAuthPanel/.test(home), "/ does not embed the full authentication form");
check(/to="\/login"/.test(home), "/ routes returning users to the canonical login page");
check(/<UnifiedAuthPanel mode=\{mode\} \/>/.test(form), "and /login mounts the same component");
check(
  /export function UnifiedAuthForm/.test(form),
  "/login keeps UnifiedAuthForm as its canonical page",
);
check(
  /UnifiedAuthForm/.test(code(read(LOGIN))),
  "and the /login route still renders it — the direct route and fallback survive",
);

// ONE implementation. The sign-in call is the thing that must not be
// copied: two of them is two flows, however similar they look today.
for (const call of ["signInWithPassword", "signInWithOAuth", "signUp("]) {
  const inPanel = panel.includes(call);
  const inForm = form.includes(call);
  const inHome = home.includes(call);
  check(
    inPanel && !inForm && !inHome,
    `${call} lives in the panel and nowhere else — one implementation`,
  );
}

/* ------------------------------------------------------------------ */
console.log("\n1 · Överskt shows the real card, and says each thing once");

const overview = code(read(OVERVIEW));
const card = code(read(OVERVIEW_CARD));

check(/<OverviewPassportCard/.test(overview), "Överskt mounts the Passport card");
check(/<PassportSummary/.test(overview), "and keeps the Passport summary");
check(
  /<SecurityPassportPreview/.test(card) && /snapshot=\{state.snapshot\}/.test(card),
  "the card is the same builder and the same presentation the Passport page renders",
);
check(/getMyPassport/.test(card), "read through the canonical getMyPassport");
check(
  !/createServerFn/.test(card),
  "and it defines no server function of its own — a reader, never a writer",
);
// PassportSummary owns the figures. Two components stating the same
// number differently on one page is the contradiction this refuses.
for (const figures of ["meritFigures", "countMerits", "MeritCounts"]) {
  check(
    !new RegExp(`\\b${figures}\\b`).test(card),
    `the card does not restate ${figures} — PassportSummary above it owns the counts`,
  );
}
check(!/\b\d{1,3}\s*%/.test(card), "and it invents no completion percentage");

/* ------------------------------------------------------------------ */
console.log("\n2 · the Passport section row is links, never tabs");

const info = code(read(INFO));
const nav = code(read(SECTION_NAV));

check(/<PassportSectionNav/.test(info), "the information page carries the section row");
check(/<nav /.test(nav) && /<Link/.test(nav), "it is a nav of links");
// Tabs would hide sections that other surfaces link to and that #246's
// redirects land on.
for (const tabbish of ['role="tab"', "TabsTrigger", "TabsContent", "<Tabs"]) {
  check(
    !nav.includes(tabbish) && !info.includes(tabbish),
    `no ${tabbish} — a hidden section is a deep link that silently fails`,
  );
}
check(
  /aria-current=\{active \? "location" : undefined\}/.test(nav),
  'the current section is marked aria-current="location", not "page"',
);
check(
  /useLocation\(\)/.test(nav),
  "the hash comes from the router, so back and forward move the marker",
);

// The anchors that existed before this row must still exist.
check(/id="sp-credentials"/.test(info), "#sp-credentials survives — the add-merit chooser uses it");
check(/id="sp-employment"/.test(info), "#sp-employment survives");
// And every destination the row offers is a real id.
check(
  /id=\{`sp-\$\{section\.kind\}`\}/.test(info),
  "each credential section has its own anchor for the row to reach",
);
check(
  /anchor: `sp-\$\{s\.kind\}`/.test(info),
  "and the row's destinations are DERIVED from the section table, so the two cannot drift",
);
// Every section stays in the document.
check(
  /\{PASSPORT_CLAIM_SECTIONS\.map\(claimSection\)\}/.test(info),
  "every credential section still renders — nothing is unmounted to make a row work",
);

/* ------------------------------------------------------------------ */
console.log("");
if (failures.length > 0) {
  console.error(`candidate-journey-composition FAILED (${failures.length} of ${assertions}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`Candidate journey composition: ${assertions} of ${assertions} assertions passed.`);
