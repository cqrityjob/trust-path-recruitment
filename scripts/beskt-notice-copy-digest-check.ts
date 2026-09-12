/**
 * The governed candidate-notice TEMPLATE digest, and the obligation it puts on
 * the application half.
 *
 * PR 3A governs the digest the notice copy must hash to. It cannot govern the
 * copy itself -- the wording lives in the application dictionary, and a second
 * copy of it in the database would be a second source of truth for one
 * sentence. So the contract has two halves, and this script is what holds them
 * together:
 *
 *   SCHEMA HALF (here, always)   bcp_notice_copy_keys() lists the fields the
 *                                template covers, in render order, and
 *                                bcp_notice_copy_digest(version, locale) is
 *                                the SHA-256 the copy for that pair must hash
 *                                to. Both are read out of the migration and
 *                                checked for shape.
 *
 *   APPLICATION HALF (PR 3B)     once src/i18n/dictionaries.ts carries the
 *                                notice keys, this script COMPUTES the
 *                                canonical string from the real dictionary and
 *                                REFUSES a mismatch.
 *
 * In the schema half the dictionary keys are absent, and the script says so
 * rather than passing silently -- the obligation is reported as outstanding,
 * which is the truthful state of a release that ships the contract and not yet
 * the copy.
 *
 * WHAT THE DIGEST IS, AND IS NOT. It is a digest of a TEMPLATE: the static
 * copy the notice screen shows before the candidate confirms. It is NOT a hash
 * of the DOM, of a screenshot, or of the assembled page, and it deliberately
 * excludes the dynamic governed values -- the retention class and the
 * lawful-basis reference -- which travel in the descriptor as data.
 *
 * Run: bun run beskt-notice-copy:check
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const MIGRATION = join(ROOT, "supabase/migrations/20261110090000_bcp_candidate_preparation.sql");
const DICTIONARIES = join(ROOT, "src/i18n/dictionaries.ts");

let assertions = 0;
const failures: string[] = [];
function check(ok: boolean, label: string): void {
  assertions += 1;
  if (ok) console.log(`  ok   ${label}`);
  else {
    failures.push(label);
    console.error(`  FAIL ${label}`);
  }
}

const sql = readFileSync(MIGRATION, "utf8");

/* ------------------------------------------------------------------ */
/* 1 · The governed template, read out of the migration                */
/* ------------------------------------------------------------------ */

const keyBlock =
  /CREATE OR REPLACE FUNCTION public\.bcp_notice_copy_keys\(\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/.exec(
    sql,
  );
const KEYS = keyBlock
  ? Array.from(keyBlock[1].matchAll(/'([a-z][a-zA-Z0-9_.]*)'/g), (m) => m[1])
  : [];

check(KEYS.length === 25, `the governed template lists 25 copy keys (found ${KEYS.length})`);
check(new Set(KEYS).size === KEYS.length, "and repeats none of them");

// The strings the whole correction is about: each was ungoverned when the
// template covered the nine title/body pairs alone.
for (const key of [
  "beskt.notice.title",
  "beskt.notice.lede",
  "beskt.notice.retentionClass",
  "beskt.notice.lawfulBasis",
  "beskt.notice.acknowledge",
  "beskt.notice.acknowledgeHint",
  "beskt.prep.open",
]) {
  check(KEYS.includes(key), `the template covers ${key}`);
}
check(
  KEYS.indexOf("beskt.notice.title") === 0 && KEYS.indexOf("beskt.notice.lede") === 1,
  "the heading and the lede come first, in render order",
);
check(
  KEYS[KEYS.length - 1] === "beskt.prep.open",
  "and the label on the control that records the acknowledgement comes last",
);

const digestBlock =
  /CREATE OR REPLACE FUNCTION public\.bcp_notice_copy_digest\(_notice_version text, _locale text\)[\s\S]*?AS \$\$([\s\S]*?)\$\$;/.exec(
    sql,
  );
const body = digestBlock?.[1] ?? "";
function governedDigest(locale: string): string | null {
  const m = new RegExp(`AND _locale = '${locale}'\\s*\\n\\s*THEN '([0-9a-f]{64})'`).exec(body);
  return m ? m[1] : null;
}
const GOVERNED: Record<string, string | null> = {
  "sv-SE": governedDigest("sv-SE"),
  "en-GB": governedDigest("en-GB"),
};

check(GOVERNED["sv-SE"] !== null, "a governed digest exists for sv-SE");
check(GOVERNED["en-GB"] !== null, "a governed digest exists for en-GB");
check(
  GOVERNED["sv-SE"] !== GOVERNED["en-GB"],
  "the two locales are governed by DIFFERENT digests, so they cannot hash alike",
);

/* ------------------------------------------------------------------ */
/* 2 · The canonical form, applied to the real dictionary when present */
/* ------------------------------------------------------------------ */

/** key || '\n' || text || '\n', in bcp_notice_copy_keys() order, SHA-256, hex. */
function canonicalDigest(block: string, keys: readonly string[]): string {
  const parts: string[] = [];
  for (const key of keys) {
    const re = new RegExp(`"${key.replace(/\./g, "\\.")}":\\s*("(?:[^"\\\\]|\\\\.)*")`);
    const m = re.exec(block);
    if (!m) throw new Error(`the dictionary has no ${key}`);
    const value = JSON.parse(m[1]) as string;
    if (value.includes("\n")) throw new Error(`${key} contains a newline`);
    parts.push(`${key}\n${value}\n`);
  }
  return createHash("sha256").update(parts.join(""), "utf8").digest("hex");
}

const dict = existsSync(DICTIONARIES) ? readFileSync(DICTIONARIES, "utf8") : "";
const dictionaryCarriesTheNotice = dict.includes('"beskt.notice.acknowledgeHint"');

if (!dictionaryCarriesTheNotice) {
  console.log(
    "\n  OUTSTANDING — this release ships the notice CONTRACT and not the copy.\n" +
      "  src/i18n/dictionaries.ts carries no BESKT notice keys, so there is\n" +
      "  nothing to hash yet. The digests above are the obligation PR 3B must\n" +
      "  satisfy: its dictionary must hash to them under the canonical form,\n" +
      "  over every one of the 25 governed keys, in both locales -- and this\n" +
      "  same check will refuse it if it does not.",
  );
} else {
  const svStart = dict.indexOf("  sv: {");
  const enStart = dict.indexOf("  en: {");
  check(svStart >= 0 && enStart > svStart, "the dictionary has both language blocks");
  const blocks: Record<string, string> = {
    "sv-SE": dict.slice(svStart, enStart),
    "en-GB": dict.slice(enStart),
  };
  for (const locale of ["sv-SE", "en-GB"] as const) {
    let computed: string | null = null;
    let error = "";
    try {
      computed = canonicalDigest(blocks[locale], KEYS);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    check(
      computed !== null && computed === GOVERNED[locale],
      `the ${locale} dictionary hashes to its governed digest` +
        (error ? ` (${error})` : computed === null ? "" : ` (got ${computed})`),
    );
  }
}

if (failures.length > 0) {
  console.error(`\nBESKT notice-copy digest FAILED (${failures.length} of ${assertions}).`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`\nBESKT notice-copy digest: ${assertions} of ${assertions} assertions passed.`);
