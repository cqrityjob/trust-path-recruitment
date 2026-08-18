// Security Passport — guard for the default sharing view.
//
// ── THE REGRESSION THIS PREVENTS ───────────────────────────────────────
//
// Sharing began as a disclosure engine with the engine on the outside: five
// packages to choose between, a purpose field, a recipient label, an expiry
// selector, a QR code, three image formats and a three-step LinkedIn
// walkthrough — all before a holder had shared anything. The product decision
// was that the default is a card preview, one button, and afterwards exactly
// three actions; everything else moves behind "Avancerade alternativ".
//
// That is a UX invariant, and UX invariants rot. A browser test cannot defend
// it here — /passport/share needs a Supabase session and there is no local
// Supabase stack in this repository — so it is defended at the source, which
// runs everywhere and cannot skip.
//
// Plain TS run with Bun, matching this repository's scripts/*-check.ts
// convention.

import { readFileSync } from "node:fs";
import path from "node:path";

const errors: string[] = [];
function expect(condition: boolean, message: string): void {
  if (!condition) errors.push(message);
}

const root = path.resolve(import.meta.dir, "..");
const routePath = "src/routes/_authenticated.passport.share.tsx";
const code = readFileSync(path.join(root, routePath), "utf8");

// ---------------------------------------------------------------------------
// 1. The default is chosen for the holder, not asked of them
// ---------------------------------------------------------------------------
expect(
  /const DEFAULT_PACKAGE\s*:\s*DisclosurePackageCode\s*=\s*"public_card"/.test(code),
  "The default disclosure package must be public_card — the narrowest one — " +
    "so a holder who chooses nothing shares the least.",
);
expect(
  /const DEFAULT_EXPIRY_DAYS\s*=\s*30\b/.test(code),
  "The default share expiry must be 30 days, stated rather than asked.",
);

// ---------------------------------------------------------------------------
// 2. Everything advanced is behind a collapsed disclosure
// ---------------------------------------------------------------------------
// `<details>` blocks are the mechanism. Anything rendered inside one is out of
// the default view; anything outside is in it.
const detailsOpens = [...code.matchAll(/<details\b/g)].length;
expect(detailsOpens > 0, "The share route has no <details> section for advanced options.");

// A `<details open>` with a literal `open` would defeat the whole thing.
expect(
  !/<details[^>]*\sopen(?!=)/.test(code),
  "An advanced section is hard-coded open, which puts it back in the default view.",
);
expect(
  /open=\{showAdvanced\}/.test(code),
  "The advanced section must be bound to showAdvanced so it starts collapsed.",
);
// Anchored on the declaration itself. A loose `useState(false)` search passes
// on any other piece of state in the file, which is how the first version of
// this check let `useState(true)` through.
expect(
  /\[showAdvanced,\s*setShowAdvanced\]\s*=\s*useState\(false\)/.test(code),
  "showAdvanced must be declared with useState(false) so advanced options start collapsed.",
);

// The specific things the product decision moved out of the default view.
// Each must appear only after the <details> that hides it.
// Only the RENDERED tree matters: an import at the top of the file is not
// something a holder sees. Everything below is measured inside the JSX.
const jsx = code.slice(code.indexOf("  return ("));
const firstDetails = jsx.indexOf("<details");
const advancedOnly: readonly { needle: string; what: string }[] = [
  { needle: "LIVE_PACKAGES", what: "the five-package chooser" },
  { needle: "sc.purpose", what: "the purpose field" },
  { needle: "qrDataUrl ?", what: "the QR code" },
  { needle: "LinkedInShareSection", what: "the LinkedIn walkthrough" },
];
for (const { needle, what } of advancedOnly) {
  const at = jsx.indexOf(needle);
  if (at === -1) continue; // absent entirely is also fine
  expect(
    at > firstDetails,
    `${what} appears before the advanced section — it must live inside it.`,
  );
}

// ---------------------------------------------------------------------------
// 3. After sharing: three actions, and the token is not the hero
// ---------------------------------------------------------------------------
for (const key of ["share2.share", "share2.copy", "share2.view"]) {
  expect(code.includes(key), `The post-share view must offer ${key}.`);
}
expect(
  !/\{shareUrl\}\s*</.test(code) || /break-all|truncate|sr-only/.test(code),
  "The raw token must not be rendered as unstyled body text; it is not the hero.",
);

// ---------------------------------------------------------------------------
// 4. The safe default may not be widened from the browser
// ---------------------------------------------------------------------------
// The five fixed packages remain the server's contract. What the client must
// not do is assemble a payload of its own.
expect(
  !/verified_claims\s*[:=]/.test(code) && !/filter\(\s*\(c\)\s*=>\s*c\.assertionLevel/.test(code),
  "The share route must not assemble or filter a disclosure payload itself — " +
    "sp_get_disclosure is the authority.",
);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (errors.length > 0) {
  console.error(`passport-share-default:check FAILED (${errors.length} issue(s)):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  "passport-share-default:check OK " +
    "(narrowest package and 30 days chosen by default; packages, purpose, QR and the " +
    "LinkedIn walkthrough all inside a collapsed advanced section; three actions after " +
    "sharing; no client-side payload assembly)",
);
