/**
 * Regulatory source monitor.
 *
 * Every rule the Passport encodes about Väktare, SIA licences or SIRA cadre
 * cards is a reading of an official page that somebody can change without
 * telling us. This script notices.
 *
 * ── WHAT IT DELIBERATELY DOES NOT DO ───────────────────────────────────
 *
 * It does not change a rule. Not one. Remote content is never executable
 * here: a changed page produces a REPORT and a non-zero exit, and a human
 * decides what — if anything — it means. Legislation that reconfigures the
 * product by being edited upstream is the failure mode this whole design
 * exists to avoid.
 *
 * ── WHY THE URL LIST IS PARSED OUT OF THE MIGRATION ────────────────────
 *
 * The obvious shape would be an array of URLs in this file. It is absent on
 * purpose. The sources live in sp_regulatory_sources, seeded by
 * 20260907090000_sp_three_market_foundation.sql, and a second list here would
 * be a second source of truth that agrees today and disagrees the first time
 * somebody registers a source without remembering this script.
 *
 * So the seed block IS the list. Adding a source to the migration adds it to
 * the monitor with no other edit, and a parse failure is a hard error rather
 * than a quietly shorter run.
 *
 * ── WHAT A CHANGED FINGERPRINT MEANS ───────────────────────────────────
 *
 * "This page is not byte-identical to the last time we looked." That is all.
 * The fingerprint covers extracted visible text with whitespace collapsed —
 * which removes most markup and session churn, but not a rotating banner or a
 * reworded cookie notice. A change is a prompt to read the page, never
 * evidence that the law moved.
 *
 * Run: bun run regulatory-sources:check
 *      bun run regulatory-sources:check --update   (accept the current state
 *                                                   as the new baseline)
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.cwd();
const MIGRATION = join(ROOT, "supabase/migrations/20260907090000_sp_three_market_foundation.sql");
const BASELINE = join(ROOT, "supabase/regulatory-source-baseline.json");
const REPORT = join(ROOT, "regulatory-source-report.md");

const UPDATE = process.argv.includes("--update");
const TIMEOUT_MS = 20_000;

type Source = { sourceKey: string; url: string };
type BaselineEntry = {
  url: string;
  fingerprint: string | null;
  availability: "available" | "unreachable";
  checkedOn: string;
};
type Baseline = { $comment: string; checkedOn: string; sources: Record<string, BaselineEntry> };

/* ------------------------------------------------------------------ */
/* 1. The list, read from the migration that seeds it                  */
/* ------------------------------------------------------------------ */

function parseSources(): Source[] {
  const sql = readFileSync(MIGRATION, "utf8");

  const insertAt = sql.indexOf("INSERT INTO public.sp_regulatory_sources");
  if (insertAt < 0) {
    throw new Error(
      `Could not find the sp_regulatory_sources seed in ${MIGRATION}.\n` +
        `The monitor reads its URL list from that block; a rename means this ` +
        `script would silently check nothing.`,
    );
  }
  const end = sql.indexOf("ON CONFLICT (source_key)", insertAt);
  if (end < 0) throw new Error("sp_regulatory_sources seed block is not terminated as expected.");

  const body = sql.slice(insertAt, end);

  // Each row is ('key', 'JJ', 'PACK', authority, 'Title', 'https://…', 'type').
  // Anchored on the key and the URL rather than on tuple position, so adding a
  // column to the seed does not silently empty this list.
  const rows = [...body.matchAll(/\(\s*'([a-z0-9_]+)'\s*,[\s\S]*?'(https:\/\/[^']+)'/g)];

  const sources: Source[] = rows.map((m) => ({ sourceKey: m[1], url: m[2] }));

  const seen = new Set<string>();
  for (const s of sources) {
    if (seen.has(s.sourceKey)) throw new Error(`Duplicate source key in the seed: ${s.sourceKey}`);
    seen.add(s.sourceKey);
  }

  // A parser that returns three rows because the SQL was reformatted looks
  // exactly like a clean run. The floor makes that impossible.
  if (sources.length < 20) {
    throw new Error(
      `Parsed only ${sources.length} sources from the migration; expected at least 20.\n` +
        `The seed block's shape has changed and this parser needs updating — ` +
        `failing rather than checking a fraction of the registry.`,
    );
  }
  return sources;
}

/* ------------------------------------------------------------------ */
/* 2. Fetching and fingerprinting                                      */
/* ------------------------------------------------------------------ */

/** Visible text, whitespace collapsed. Hashing raw HTML would report a change
 *  on every run for any page carrying a nonce or a build id. */
function normalise(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function check(source: Source): Promise<BaselineEntry> {
  const checkedOn = new Date().toISOString().slice(0, 10);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(source.url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // Identifying the checker is basic courtesy to a public authority's
        // server, and makes the traffic explicable in their logs.
        "user-agent": "CQrityjob-regulatory-source-monitor/1.0 (+https://cqrityjob.com)",
        accept: "text/html,application/xhtml+xml",
      },
    });

    if (!res.ok)
      return { url: source.url, fingerprint: null, availability: "unreachable", checkedOn };

    const text = normalise(await res.text());
    const fingerprint = createHash("sha256").update(text).digest("hex");
    return { url: source.url, fingerprint, availability: "available", checkedOn };
  } catch {
    return { url: source.url, fingerprint: null, availability: "unreachable", checkedOn };
  } finally {
    clearTimeout(timer);
  }
}

/* ------------------------------------------------------------------ */
/* 3. Compare, report, and refuse to decide                            */
/* ------------------------------------------------------------------ */

function loadBaseline(): Baseline | null {
  if (!existsSync(BASELINE)) return null;
  return JSON.parse(readFileSync(BASELINE, "utf8")) as Baseline;
}

async function main() {
  const sources = parseSources();
  const baseline = loadBaseline();
  const today = new Date().toISOString().slice(0, 10);

  console.log(`regulatory-source-monitor: ${sources.length} registered sources`);
  if (!baseline) console.log("  no baseline yet — this run establishes one");

  const results: Record<string, BaselineEntry> = {};
  const changed: string[] = [];
  const unreachable: string[] = [];
  // Recorded as unreachable last time and still unreachable now. NOT drift:
  // re-reporting an unchanged known failure every Monday is how a real signal
  // becomes an issue nobody opens. It stays in the report, permanently
  // visible, because a source we cannot check is a standing limitation of the
  // market pack that depends on it.
  const stillUnreachable: string[] = [];
  const added: string[] = [];

  // Sequential on purpose: a burst of parallel requests at a government site
  // is indistinguishable from something it should rate-limit.
  for (const source of sources) {
    const result = await check(source);
    results[source.sourceKey] = result;

    const prior = baseline?.sources[source.sourceKey];
    if (!prior) {
      added.push(source.sourceKey);
      console.log(`  new        ${source.sourceKey}`);
    } else if (result.availability === "unreachable") {
      if (prior.availability === "unreachable") {
        stillUnreachable.push(source.sourceKey);
        console.log(`  still unreachable (known)  ${source.sourceKey}`);
      } else {
        unreachable.push(source.sourceKey);
        console.log(`  NEWLY UNREACHABLE ${source.sourceKey}`);
      }
    } else if (prior.fingerprint && prior.fingerprint !== result.fingerprint) {
      changed.push(source.sourceKey);
      console.log(`  CHANGED    ${source.sourceKey}`);
    } else {
      console.log(`  unchanged  ${source.sourceKey}`);
    }
  }

  const drift = changed.length + unreachable.length;

  const report = [
    "# Regulatory source report",
    "",
    `Checked ${today} against ${sources.length} registered sources.`,
    "",
    "**A changed source does not change any rule.** This report exists so a",
    "human reads the page and decides. Nothing in the product moved.",
    "",
    `- changed: ${changed.length}`,
    `- newly unreachable: ${unreachable.length}`,
    `- known unreachable (unchanged): ${stillUnreachable.length}`,
    `- newly registered: ${added.length}`,
    "",
    ...(changed.length
      ? [
          "## Changed since the last baseline",
          "",
          ...changed.map((k) => `- \`${k}\` — ${results[k].url}`),
          "",
        ]
      : []),
    ...(unreachable.length
      ? [
          "## Newly unreachable",
          "",
          ...unreachable.map((k) => `- \`${k}\` — ${results[k].url}`),
          "",
        ]
      : []),
    ...(stillUnreachable.length
      ? [
          "## Known unreachable (standing limitation, not new)",
          "",
          "These have never answered this checker. A market pack that depends on",
          "one of them cannot claim its sources are monitored, and that belongs",
          "in the pack's legal review rather than in a weekly alert.",
          "",
          ...stillUnreachable.map((k) => `- \`${k}\` — ${results[k].url}`),
          "",
        ]
      : []),
    ...(added.length
      ? [
          "## Newly registered (no prior fingerprint)",
          "",
          ...added.map((k) => `- \`${k}\` — ${results[k].url}`),
          "",
        ]
      : []),
    "## What to do",
    "",
    "1. Open each page above and read what actually changed.",
    "2. If the regulatory content moved, open a change to the market pack and",
    "   set its `legal_review_state` back to `pending` — which, by the",
    "   `sp_market_pack_active_needs_review` constraint, switches the market off",
    "   until somebody reviews it.",
    "3. If nothing material changed, accept the new baseline:",
    "   `bun run regulatory-sources:check --update`",
    "",
  ].join("\n");

  writeFileSync(REPORT, report, "utf8");

  if (UPDATE || !baseline) {
    const next: Baseline = {
      $comment:
        "Fingerprints of the official regulatory sources, as last accepted by a human. " +
        "Never edited by CI: a changed source opens a review, and somebody runs " +
        "`bun run regulatory-sources:check --update` once they have read the page.",
      checkedOn: today,
      sources: results,
    };
    writeFileSync(BASELINE, JSON.stringify(next, null, 2) + "\n", "utf8");
    console.log(`\nBaseline written to ${BASELINE}`);
    // A first run has nothing to compare against, so it cannot have found drift.
    process.exit(0);
  }

  console.log(`\nreport written to ${REPORT}`);
  if (stillUnreachable.length > 0) {
    console.log(
      `note: ${stillUnreachable.length} source(s) remain unreachable, as already recorded.`,
    );
  }
  if (drift > 0) {
    console.error(
      `\nDRIFT: ${changed.length} source(s) changed, ${unreachable.length} newly unreachable.` +
        `\nNo rule has been changed. Read ${REPORT} and decide.`,
    );
    process.exit(1);
  }
  console.log("OK: every registered source matches its accepted baseline.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(2);
});
