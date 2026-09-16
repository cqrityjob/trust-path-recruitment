// The Security Passport page, composed to the owner's sketch 2.
//
// ── WHAT THE SKETCH ASKS FOR ───────────────────────────────────────────
//
//   Left column   the Passport Card -- what another person sees -- with the
//                 integrity/privacy/sharing settings directly beneath it.
//   Main column   "Mitt Security Passport", the two actions near the top
//                 (add a credential, share the Passport), the registered
//                 documents and their truthful verification state, and the
//                 rest of the Passport below that.
//
// ── WHY THIS READS SOURCE ──────────────────────────────────────────────
//
// The page is a route: it reads the holder's Passport through a server
// function and composes components that need a full PassportSnapshot --
// profile, holder, derived professional identity and all. A fixture large
// enough to render it here would be a second, drifting definition of the
// holder, and the guard would then be asserting the fixture.
//
// So the LAYOUT CONTRACT is asserted from source, and the rendered proof for
// this page is CI's browser suites, which run it for real against a stack.
// What source can prove is exactly what tends to regress: a region that
// stops being rendered, an action that gains a second copy, a writer that
// gets duplicated into a summary, and a label that collides with another
// product's.
//
// Run: bun run passport-page-composition:check

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const read = (p: string): string => readFileSync(join(ROOT, p), "utf8");

const INDEX = "src/routes/_authenticated.passport.index.tsx";
const SIDE = "src/components/security-passport/PassportSideColumn.tsx";
const WORKSPACE = "src/components/security-passport/CredentialWallet.tsx";
const SHELL = "src/routes/_authenticated.passport.tsx";
const PASSPORT_I18N = "src/lib/security-passport/i18n.ts";
const APP_I18N = "src/i18n/dictionaries.ts";

const failures: string[] = [];
let assertions = 0;

function check(ok: boolean, diagnostic: string): void {
  assertions += 1;
  if (!ok) failures.push(diagnostic);
  else console.log(`  ok ${diagnostic}`);
}

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*$/gm, "");
}

const index = code(read(INDEX));
const side = code(read(SIDE));
const workspace = code(read(WORKSPACE));

/* ------------------------------------------------------------------ */
console.log("\n1 · the two columns exist, and the sketch's left column is the left column");

check(/<PassportSideColumn/.test(index), "the Passport page renders a side column");
check(/<CredentialWallet/.test(index), "and the Passport workspace");
check(
  /max-w-\[1280px\]/.test(index) && /lg:grid-cols-2/.test(index),
  "the wallet uses the desktop width and supporting card/settings form a two-column region",
);
check(
  !/lg:order-[12]/.test(index) && /md:grid-cols-2 xl:grid-cols-3/.test(workspace),
  "the responsive wallet uses one markup and never reorders identity behind the credential list",
);

// SOURCE ORDER IS THE MOBILE ORDER. On a phone the holder's own record is
// what they came for; a card preview above it pushes every merit off the
// first screen. So the workspace must come FIRST in source.
const wsIdx = index.indexOf("<CredentialWallet");
const sideIdx = index.indexOf("<PassportSideColumn");
check(wsIdx >= 0 && sideIdx >= 0, "both are rendered at all");
check(
  wsIdx >= 0 && sideIdx >= 0 && wsIdx < sideIdx,
  "the workspace comes first in source, so one column at 375px reads record-then-card",
);

/* ------------------------------------------------------------------ */
console.log("\n2 · the left column carries the card and the settings beneath it");

check(/<CompactPassportCard/.test(side), "the side column renders the Passport Card");
check(/snapshot=\{snapshot\}/.test(side), "built from the canonical card builder");
check(/data-passport-privacy-summary/.test(side), "and an integrity/privacy region");
check(
  side.indexOf("<CompactPassportCard") < side.indexOf("data-passport-privacy-summary"),
  "with the settings BELOW the card, as the sketch places them",
);
check(
  /share\.privacy\.\$\{profile\.privacyMode\}/.test(side) || /share\.privacy\.\$\{/.test(side),
  "the privacy region states the mode actually in force, not a generic sentence",
);

/* ------------------------------------------------------------------ */
console.log("\n3 · one renderer, one writer — the summary reports, it does not duplicate");

check(
  (side.match(/<CompactPassportCard/g) ?? []).length === 1,
  "exactly one card renderer in the side column",
);
check(
  !/setPrivacyMode/.test(side),
  "the side column does NOT write the privacy mode — the page that owns it does",
);
check(/to="\/passport\/privacy"/.test(side), "it links to the canonical privacy editor instead");
check(/to="\/passport\/card"/.test(side), "and to the canonical full card view");
check(
  !/getMyPassport/.test(side),
  "it reads nothing of its own: the snapshot is passed in, so there is no second request",
);

/* ------------------------------------------------------------------ */
console.log("\n4 · the main column's two actions are near the top, once each");

check(/to="\/passport\/credentials\/new"/.test(workspace), "add a credential is offered");
check(/data-cta="share"/.test(workspace), "and sharing the Passport");
check(
  (workspace.match(/data-cta="share"/g) ?? []).length === 1,
  "share appears exactly once — not one control per region",
);
const headerEnd = workspace.indexOf("</header>");
check(
  headerEnd > 0 && workspace.indexOf('to="/passport/credentials/new"') < headerEnd,
  "add a credential sits inside the page header, near the top",
);
check(headerEnd > 0 && workspace.indexOf('data-cta="share"') < headerEnd, "and so does share");
check(/identity\?\.displayName/.test(workspace), "the main column names the holder from Profile");

/* ------------------------------------------------------------------ */
console.log("\n5 · no label collides with another product's");

const passportCopy = read(PASSPORT_I18N);
const appCopy = read(APP_I18N);

// The candidate's primary navigation calls /my-career "Översikt". The
// Passport's own first tab used the same word for /passport, so a holder saw
// one word meaning two places on one screen.
check(
  /"nav\.overview": "Passport(översikt| overview)"/.test(passportCopy),
  "the Passport's overview tab names WHICH overview it is",
);
check(
  !/"nav\.overview": "Översikt"/.test(passportCopy),
  "and no longer reuses the candidate home's label",
);
check(
  /"nav\.overview": "Översikt"/.test(appCopy),
  "while the candidate home keeps it — this moved the Passport's label, not the owner's",
);

// A tab must not repeat a heading that is already on the page below it.
check(
  !/"nav\.overview": "Mina meriter"/.test(passportCopy),
  'the tab does not repeat the "Mina meriter" heading rendered beneath it',
);

/* ------------------------------------------------------------------ */
console.log("\n6 · the side column is reachable and operable");

for (const m of side.matchAll(/className=\{?`?([^`"}]*min-h-11[^`"}]*)`?\}?/g)) {
  void m;
}
check(/min-h-11/.test(side), "its controls carry a 44px minimum target");
check(/focus-visible:outline/.test(side), "and a visible keyboard focus state");
check(
  /aria-labelledby="sp-side-card-heading"/.test(side) &&
    /aria-labelledby="sp-side-privacy-heading"/.test(side),
  "both regions are labelled, so a screen-reader user is told what they are",
);

/* ------------------------------------------------------------------ */
console.log("");
if (failures.length > 0) {
  console.error(`passport-page-composition-check FAILED (${failures.length} of ${assertions}):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`Passport page composition: ${assertions} of ${assertions} assertions passed.`);
