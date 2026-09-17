// The Security Passport page: exactly ONE Passport.
//
// ── WHAT THE OWNER ASKED FOR (2026-09-17) ──────────────────────────────
//
//   Main column   the ONE premium Passport identity surface, the two
//                 actions near the top (add a credential, preview and
//                 share), and the credential wallet with each record's
//                 truthful trust and lifecycle state.
//   Side column   the next step, and the privacy/sharing status. NOT a
//                 second Passport.
//
// The earlier sketch put a complete compact Passport card in the side
// column, directly beside the large identity surface that already states
// the holder's name and title. Two Passports on the page that IS the
// Passport -- and the second was an empty selection. The recipient-style
// rendering belongs to Preview and share, where a selection exists for it
// to show, so this guard now asserts its ABSENCE here as firmly as it used
// to assert its presence.
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
  /max-w-\[1280px\]/.test(index) && /lg:grid-cols-\[minmax\(0,1fr\)_360px\]/.test(index),
  "the wallet uses the desktop width and supporting card/settings form a two-column region",
);
check(
  !/lg:order-[12]/.test(index) &&
    /data-premium-credential-record/.test(
      read("src/components/security-passport/CredentialRecord.tsx"),
    ),
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
console.log("\n2 · ONE Passport: the side column is a next step and a sharing status");

const PREVIEW = "src/components/security-passport/SecurityPassportPreview.tsx";
const SHARE = "src/routes/_authenticated.passport.share.tsx";
const CARD_ROUTE = "src/routes/_authenticated.passport.card.tsx";
check(
  !/SecurityPassportPreview/.test(side) && !/SecurityPassportPreview/.test(index),
  "no second Passport card beside the identity surface — not in the side column, not in the route",
);
check(
  !/RecipientPassportView|PassportCard\b/.test(side + index),
  "and no recipient-style rendering on the overview either",
);
check(
  (workspace.match(/<h1\b/g) ?? []).length === 1 && !/<h1\b/.test(side),
  "the identity surface owns the page's only h1",
);
check(
  /data-passport-next-step=\{next\.kind\}/.test(side),
  "the side column opens with the next step",
);
check(
  /credentialProductStatus\(/.test(side) &&
    /credentialPassportHolder\(snapshot\.holder\)/.test(side),
  "derived from the SAME status function and the same claims as the wallet rows",
);
check(/data-passport-privacy-summary/.test(side), "and an integrity/privacy region");
check(
  side.indexOf("data-passport-next-step") < side.indexOf("data-passport-privacy-summary"),
  "with the sharing status BELOW the next step",
);
check(
  /RecipientPassportView/.test(code(read(SHARE))),
  "the recipient-style Passport lives under Preview and share",
);
check(
  /redirect\(\{ to: "\/passport\/share", replace: true \}\)/.test(code(read(CARD_ROUTE))) &&
    !/SecurityPassportPreview/.test(code(read(CARD_ROUTE))),
  "and the retired /passport/card sends its visitors there rather than being a second preview",
);
check(
  /variant = "preview"/.test(code(read(PREVIEW))) &&
    /variant === "summary"/.test(code(read(PREVIEW))),
  "the compact card distinguishes a selection preview from the My Career summary",
);
check(
  /share\.privacy\.\$\{profile\.privacyMode\}/.test(side) || /share\.privacy\.\$\{/.test(side),
  "the privacy region states the mode actually in force, not a generic sentence",
);

/* ------------------------------------------------------------------ */
console.log("\n3 · one writer — the summary reports, it does not duplicate");

check(
  !/setPrivacyMode/.test(side),
  "the side column does NOT write the privacy mode — the page that owns it does",
);
check(/to="\/passport\/privacy"/.test(side), "it links to the canonical privacy editor instead");
check(
  /to="\/passport\/share"/.test(side) && !/to="\/passport\/card"/.test(side + workspace),
  "and to Preview and share — never to the retired second preview",
);
check(
  /\{ to: "\/passport\/share", sv: "Förhandsvisa och dela", en: "Preview and share" \}/.test(
    code(read(SHELL)),
  ),
  "the Passport navigation's Preview and share opens the sharing flow",
);
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
// Displayed here, edited there. The Passport has no editor for the name or
// the title, and says where the editor is.
check(
  /to="\/my-career\/profile"\s+hash="profile-basics"\s+data-cta="edit-in-profile"/.test(workspace),
  "and sends the holder to the Profile to change the name or the title",
);
check(
  !/<(input|textarea|select)\b/.test(workspace) &&
    !/savePassportBasics/.test(workspace + side + index),
  "the Passport overview holds no editor for a Profile fact",
);

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
// EVERY control class, not "min-h-11 appears somewhere": the column has two
// (a text link and the next step's button), and a file-wide search stayed
// true with either one shrunk.
const controlClasses = [...side.matchAll(/const (LINK|PRIMARY) =\s*"([^"]+)"/g)];
check(
  controlClasses.length === 2 && controlClasses.every((m) => /\bmin-h-11\b/.test(m[2]!)),
  "its controls carry a 44px minimum target",
);
check(/focus-visible:outline/.test(side), "and a visible keyboard focus state");
check(
  /aria-labelledby="sp-side-next-heading"/.test(side) &&
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
