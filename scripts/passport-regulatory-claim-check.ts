/**
 * Security Passport — the regulatory-claim guard.
 *
 * Owner decision 3 forbids the product from claiming direct verification with
 * an authority, government endorsement, cross-border regulatory equivalence,
 * or completed Arabic legal review. Until now nothing enforced that; this
 * repository's culture is that a rule without a guard is a hope.
 *
 * ── IT LOOKS FOR CLAIMS, NOT FOR WORDS ─────────────────────────────────
 *
 * A blacklist of authority names would be worse than nothing. "SIA" has to
 * appear — in credential names, in migration comments, in these very tests —
 * and a guard that banned the word would train people to write around it, or
 * to delete the honest disclaimers that matter most:
 *
 *     Not verified directly with SIA
 *     Document reviewed by CQrityjob
 *     No direct authority check has been performed
 *     Ingen direktkontroll mot myndighet har gjorts
 *
 * Those must all PASS. What must fail is the positive assertion:
 *
 *     Verified with SIA · Godkänd av Polismyndigheten
 *     Equivalent to a UK licence · Government approved
 *     Arabic legal review completed
 *
 * So the patterns below are shaped as claim + object, and each is checked
 * against a negation window immediately before it.
 *
 * Run: bun run passport-regulatory-claim:check
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();

/** Where product copy actually lives. Deliberately narrow: this guards what a
 *  reader can see, not the whole repository. */
const SURFACES = [
  "src/lib/security-passport/i18n.ts",
  "src/components/security-passport",
  "src/routes",
  "docs/passport",
];

/** Words that turn a mention into a denial. If one appears within this many
 *  characters BEFORE the match, the claim is a disclaimer and is allowed. */
const NEGATION_WINDOW = 90;
const NEGATIONS =
  /\b(not|never|no|without|cannot|can't|does not|do not|doesn't|don't|inte|ingen|inget|aldrig|utan|ej)\b/i;

interface Rule {
  readonly id: string;
  readonly why: string;
  readonly pattern: RegExp;
}

const AUTHORITIES = "SIA|SIRA|Polismyndigheten|Polisen|Länsstyrelsen|the authority|myndigheten";

const RULES: readonly Rule[] = [
  {
    id: "authority-verification",
    why: "CQrityjob verifies a document or a public register entry. It does not verify with the authority.",
    pattern: new RegExp(
      String.raw`\b(verified|confirmed|checked|validated|verifierad|bekräftad|kontrollerad)\b[^.\n]{0,40}\b(with|against|by|direct(?:ly)?|mot|hos|av)\b[^.\n]{0,30}\b(${AUTHORITIES})\b`,
      "i",
    ),
  },
  {
    id: "authority-database-match",
    why: "No authority register is queried, copied or matched against.",
    pattern: new RegExp(
      String.raw`\b(${AUTHORITIES})\b[^.\n]{0,40}\b(database|register|records?)\b[^.\n]{0,30}\b(match(?:ed|ing)?|queried|synced|integration)\b`,
      "i",
    ),
  },
  {
    id: "government-endorsement",
    why: "No government endorses, approves or certifies this product.",
    // Swedish compounds have no separator — "myndighetsgodkänd" is one word —
    // so the compound forms are their own branch rather than a two-word rule.
    pattern:
      /\b(?:myndighets|statligt?)(?:godkänd|godkänt|sanktionerad)\w*\b|\b(government|state|official(?:ly)?|myndighets?|statlig[t]?)\b[\s-]{0,3}\b(approved|endorsed|certified|backed|authoris(?:ed|ing)|godkänd|godkänt|sanktionerad)\b/i,
  },
  {
    id: "cross-border-equivalence",
    why: "A credential from one market means nothing in another. There is deliberately no table relating them.",
    pattern:
      /\b(equivalent to|same as|equal to|recognis(?:ed|able) as|counts as|motsvarar|likvärdig med)\b[^.\n]{0,40}\b(uk|british|swedish|emirati|dubai|uae|sia|sira|svensk\w*|brittisk\w*|emiratisk\w*)\b[^.\n]{0,20}\b(licen[cs]e|credential|approval|förordnande|card|kort)\b/i,
  },
  {
    id: "arabic-legal-review",
    why: "Arabic terminology has NOT been reviewed. name_ar is null throughout the Dubai pack for exactly this reason.",
    pattern:
      /\b(arabic|arabiska)\b[^.\n]{0,40}\b(legal(?:ly)? review(?:ed)?|reviewed by (?:a )?lawyer|legal sign[- ]off|granskad\w*)\b/i,
  },
  {
    id: "source-verified-overclaim",
    why: "The source monitor records that a page was READ. It does not verify the content of a claim against it.",
    pattern:
      /\b(source|sources|källa|källor)\b[^.\n]{0,25}\b(verified|verifierade)\b(?![^.\n]{0,25}\bavailab)/i,
  },
];

/* ------------------------------------------------------------------ */

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|md)$/.test(full)) out.push(full);
  }
  return out;
}

function targets(): string[] {
  const out: string[] = [];
  for (const s of SURFACES) {
    const full = join(ROOT, s);
    try {
      if (statSync(full).isDirectory()) walk(full, out);
      else out.push(full);
    } catch {
      /* a surface that does not exist yet is not a failure */
    }
  }
  return out;
}

/** Strip comments. An explanatory paragraph describing what the product must
 *  not claim is documentation, and failing on it would push people to stop
 *  writing the explanations. */
function strippedOf(text: string, file: string): string {
  if (file.endsWith(".md")) return text;
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export function findClaims(text: string): { rule: Rule; excerpt: string }[] {
  const found: { rule: Rule; excerpt: string }[] = [];
  for (const rule of RULES) {
    const re = new RegExp(rule.pattern.source, rule.pattern.flags.replace("g", "") + "g");
    for (const m of text.matchAll(re)) {
      const at = m.index ?? 0;
      const before = text.slice(Math.max(0, at - NEGATION_WINDOW), at);
      // A denial immediately before the claim makes it a disclaimer — and so
      // does one INSIDE it. "Sources are not verified by the authority" put the
      // negation between the two halves of the pattern, where a look-behind
      // could never see it, and the guard flagged an honest sentence.
      if (NEGATIONS.test(before) || NEGATIONS.test(m[0])) continue;
      found.push({ rule, excerpt: m[0].replace(/\s+/g, " ").slice(0, 120) });
    }
  }
  return found;
}

/* ------------------------------------------------------------------ */

const failures: string[] = [];
let scanned = 0;

for (const file of targets()) {
  const rel = relative(ROOT, file);
  // This guard's own patterns and prose are examples, not claims.
  if (rel === "scripts/passport-regulatory-claim-check.ts") continue;
  scanned += 1;

  const text = strippedOf(readFileSync(file, "utf8"), file);
  for (const hit of findClaims(text)) {
    failures.push(`${rel}\n      [${hit.rule.id}] "${hit.excerpt}"\n      ${hit.rule.why}`);
  }
}

/* ------------------------------------------------------------------ */
/* Self-test: the guard must fire on claims and stay silent on denials  */
/* ------------------------------------------------------------------ */
//
// A guard that never fires is indistinguishable from clean copy, and a guard
// that fires on honest disclaimers teaches people to delete them. Both
// directions are asserted every run, so a pattern edit that breaks either one
// fails here rather than in review.

const MUST_REJECT = [
  "Verified with SIA",
  "This licence is verified directly with the SIA register",
  "Kontrollerad mot Polismyndigheten",
  "Bekräftad hos Länsstyrelsen",
  "Government approved credential",
  "Officially endorsed by the state",
  "Myndighetsgodkänd",
  "Equivalent to a UK licence",
  "This is the same as a UK SIA licence",
  "Motsvarar ett svenskt förordnande",
  "Arabic legal review completed",
  "Arabiska termer granskade av jurist",
  "Sources verified",
  "SIRA database matched",
];

const MUST_ACCEPT = [
  "Not verified directly with SIA",
  "Document reviewed by CQrityjob",
  "No direct authority check has been performed",
  "Ingen direktkontroll mot myndighet har gjorts",
  "Inte kontrollerad mot Polismyndigheten",
  "CQrityjob verifies the licence status, not the underlying suitability investigation",
  "This licence was checked against the public register on 2026-08-22",
  "SIA Licence — Door Supervision",
  "Skyddsvaktsförordnande",
  "The product must never claim direct verification with SIA",
  "Arabic terminology has not been reviewed",
  "Sources are not verified by the authority",
  "no government endorsement is claimed",
];

const selfTest: string[] = [];
for (const example of MUST_REJECT) {
  if (findClaims(example).length === 0) {
    selfTest.push(`prohibited claim NOT detected: ${JSON.stringify(example)}`);
  }
}
for (const example of MUST_ACCEPT) {
  const hits = findClaims(example);
  if (hits.length > 0) {
    selfTest.push(
      `truthful wording wrongly rejected by [${hits[0].rule.id}]: ${JSON.stringify(example)}`,
    );
  }
}

console.log("passport-regulatory-claim-check\n");

if (selfTest.length > 0) {
  console.error(`SELF-TEST FAILED (${selfTest.length}):\n`);
  for (const f of selfTest) console.error(`  - ${f}`);
  console.error(
    "\n  The patterns must reject positive claims and accept honest denials.\n" +
      "  Widening one without checking the other is how a guard starts\n" +
      "  deleting the disclaimers it exists to protect.\n",
  );
  process.exit(1);
}
console.log(
  `  self-test: ${MUST_REJECT.length} prohibited claims rejected, ` +
    `${MUST_ACCEPT.length} truthful disclaimers accepted`,
);

console.log(`  scanned ${scanned} product-copy files across ${SURFACES.length} surfaces`);
console.log(`  ${RULES.length} prohibited-claim patterns\n`);

if (failures.length > 0) {
  console.error(`passport-regulatory-claim-check FAILED (${failures.length}):\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  console.error(
    "  These are POSITIVE claims. Truthful limiting language is allowed and\n" +
      "  is what the product should say instead — for example:\n" +
      '    "Not verified directly with SIA"\n' +
      '    "Document reviewed by CQrityjob"\n' +
      '    "No direct authority check has been performed"\n',
  );
  process.exit(1);
}

console.log("passport-regulatory-claim-check: no prohibited regulatory claims found.");
