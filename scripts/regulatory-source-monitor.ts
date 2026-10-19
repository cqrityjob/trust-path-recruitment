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
 * ── WHY THE URL LIST IS READ OUT OF THE MIGRATIONS ─────────────────────
 *
 * The obvious shape would be an array of URLs in this file. It is absent on
 * purpose. The sources live in sp_regulatory_sources, and a second list here
 * would be a second source of truth that agrees today and disagrees the first
 * time somebody registers a source without remembering this script.
 *
 * So the migrations ARE the list. Every migration is replayed in filename
 * order — the order Supabase applies them — and every statement that writes
 * sp_regulatory_sources is applied to an in-memory registry: an INSERT adds
 * rows, an UPDATE that moves a URL or supersedes a source applies it, a DELETE
 * removes the row. A new migration that registers or moves a source therefore
 * reaches the monitor with no other edit and without rewriting an applied
 * migration.
 *
 * Reading only the first seed block is how five registered sources — the Abu
 * Dhabi Ministry of Interior page behind a public pilot, and the four Indian
 * sources — went unmonitored. A write the parser cannot interpret is a hard
 * error, never a quietly shorter run.
 *
 * ── WHAT A CHANGED FINGERPRINT MEANS ───────────────────────────────────
 *
 * "This page is not byte-identical to the last time we looked." That is all.
 * The fingerprint covers extracted visible text with whitespace collapsed —
 * which removes most markup and session churn, but not a rotating banner or a
 * reworded cookie notice. A change is a prompt to read the page, never
 * evidence that the law moved.
 *
 * The relied-upon terms (supabase/regulatory-source-relied-terms.json) are the
 * one content check: the words a market pack depends on that page saying. A
 * term that disappears from a reachable page is drift even when the page looks
 * otherwise healthy, because it is the difference between a page that moved
 * its navigation and a page that stopped saying what we rely on. Their
 * presence never proves the rule is unchanged.
 *
 * Run: bun run regulatory-sources:check
 *      bun run regulatory-sources:check --update   (accept the current state
 *                                                   as the new baseline)
 */

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const TIMEOUT_MS = 20_000;
const USER_AGENT = "CQrityjob-regulatory-source-monitor/1.0 (+https://cqrityjob.com)";

export type Source = { sourceKey: string; url: string; migration: string };
export type Availability = "available" | "unreachable";
export type BaselineEntry = {
  url: string;
  fingerprint: string | null;
  availability: Availability;
  checkedOn: string;
};
export type CheckResult = BaselineEntry & {
  /** Why it was unreachable: `http_403`, `timeout`, `network:ENOTFOUND` … */
  reason?: string;
  /** Where the request landed, when a redirect took it somewhere else. */
  finalUrl?: string;
  /** For a timeout or network failure: how the site's own root answered the
   *  same request. Tells a slow or missing page from a host that does not
   *  answer this checker at all. */
  hostRoot?: string;
  /** Normalised visible text; held in memory for the term check, never written. */
  text?: string;
};
export type Baseline = {
  $comment: string;
  checkedOn: string;
  sources: Record<string, BaselineEntry>;
};
export type ReliedTerms = Record<string, string[]>;

/* ------------------------------------------------------------------ */
/* 1. The registry, replayed from the migrations                       */
/* ------------------------------------------------------------------ */

/** Splits SQL into statements, respecting quotes, comments and dollar quotes,
 *  so a semicolon inside a title or a function body does not end a statement. */
export function splitStatements(sql: string): string[] {
  const out: string[] = [];
  let start = 0;
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'") {
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") i += 2;
        else if (sql[i] === "'") break;
        else i++;
      }
      i++;
    } else if (c === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
    } else if (c === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end < 0 ? sql.length : end + 2;
    } else if (c === "$") {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i))?.[0];
      if (tag) {
        const end = sql.indexOf(tag, i + tag.length);
        i = end < 0 ? sql.length : end + tag.length;
      } else i++;
    } else if (c === ";") {
      out.push(sql.slice(start, i));
      start = ++i;
    } else i++;
  }
  if (sql.slice(start).trim()) out.push(sql.slice(start));
  return out;
}

/** Removes line and block comments outside string literals. A URL such as
 *  …/tillaten-behandling--vilka-krav-galler/ is not a comment. */
export function stripComments(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") break;
        else j++;
      }
      out += sql.slice(i, j + 1);
      i = j + 1;
    } else if (c === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i++;
      out += " ";
    } else if (c === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      i = end < 0 ? sql.length : end + 2;
      out += " ";
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const TABLE = String.raw`(?:public\.)?sp_regulatory_sources\b`;
const INSERT_RE = new RegExp(String.raw`^\s*INSERT\s+INTO\s+${TABLE}`, "i");
const UPDATE_RE = new RegExp(String.raw`^\s*UPDATE\s+${TABLE}`, "i");
const DELETE_RE = new RegExp(String.raw`^\s*DELETE\s+FROM\s+${TABLE}`, "i");
const ANY_WRITE_RE = new RegExp(
  String.raw`(INSERT\s+INTO|UPDATE|DELETE\s+FROM|TRUNCATE(?:\s+TABLE)?)\s+${TABLE}`,
  "i",
);

/** Applies one migration's writes to the registry. Exported for the tests. */
export function applyMigration(
  registry: Map<string, Source>,
  migration: string,
  sql: string,
): void {
  for (const raw of splitStatements(sql)) {
    const stmt = stripComments(raw);
    if (INSERT_RE.test(stmt)) {
      // Each row is ('key', …, 'https://…', …) in a VALUES list, or
      // SELECT 'key', …, 'https://…' for a single row. Anchored on the key
      // and the URL rather than on tuple position, so adding a column does
      // not silently empty the list.
      const rows = [
        ...stmt.matchAll(/(?:\(|\bSELECT)\s*'([a-z0-9_]{3,64})'\s*,[\s\S]*?'(https?:\/\/[^']+)'/gi),
      ];
      if (rows.length === 0)
        throw new Error(
          `${migration}: an INSERT into sp_regulatory_sources has no row this parser can read.\n` +
            `Failing rather than monitoring fewer sources than are registered.`,
        );
      const ignoresConflict = /ON\s+CONFLICT\s*\(\s*source_key\s*\)\s*DO\s+NOTHING/i.test(stmt);
      for (const [, sourceKey, url] of rows) {
        if (registry.has(sourceKey)) {
          if (ignoresConflict) continue; // the database keeps the first row too
          throw new Error(`${migration}: source key ${sourceKey} is registered twice.`);
        }
        registry.set(sourceKey, { sourceKey, url, migration });
      }
    } else if (UPDATE_RE.test(stmt)) {
      const set = /\bSET\b([\s\S]*?)\bWHERE\b/i.exec(stmt)?.[1] ?? "";
      const movesUrl = /\burl\s*=/i.test(set);
      const supersedes = /\bsuperseded_on\s*=/i.test(set);
      // Any other column (a market pack link, a fingerprint) does not change
      // which page is checked.
      if (!movesUrl && !supersedes) continue;
      const key = /\bWHERE\s+source_key\s*=\s*'([a-z0-9_]{3,64})'/i.exec(stmt)?.[1];
      if (!key)
        throw new Error(
          `${migration}: an UPDATE moves or supersedes sp_regulatory_sources rows without ` +
            `naming one source_key. Write it as WHERE source_key = '…' so the monitor can follow it.`,
        );
      const current = registry.get(key);
      if (!current) throw new Error(`${migration}: UPDATE of unregistered source ${key}.`);
      if (supersedes) {
        const value = /\bsuperseded_on\s*=\s*([^,]+?)\s*(?:,|$)/i.exec(set)?.[1] ?? "";
        if (!/^NULL$/i.test(value.trim())) {
          registry.delete(key);
          continue;
        }
      }
      if (movesUrl) {
        const url = /\burl\s*=\s*'(https?:\/\/[^']+)'/i.exec(set)?.[1];
        if (!url)
          throw new Error(
            `${migration}: UPDATE of ${key} sets a url that is not an https literal.`,
          );
        registry.set(key, { sourceKey: key, url, migration });
      }
    } else if (DELETE_RE.test(stmt)) {
      const key = /\bWHERE\s+source_key\s*=\s*'([a-z0-9_]{3,64})'\s*$/i.exec(stmt.trim())?.[1];
      if (!key)
        throw new Error(
          `${migration}: a DELETE from sp_regulatory_sources must name one source_key.`,
        );
      registry.delete(key);
    } else if (ANY_WRITE_RE.test(stmt)) {
      // A write inside a DO block or a function, or a TRUNCATE. The registry
      // after it is unknowable from here.
      throw new Error(
        `${migration}: writes sp_regulatory_sources in a form this monitor cannot follow ` +
          `(inside a DO block, a function, or a TRUNCATE). Use a plain INSERT/UPDATE/DELETE.`,
      );
    }
  }
}

/** The registered sources after every migration, in source-key order. */
export function registeredSources(migrationsDir: string): Source[] {
  const registry = new Map<string, Source>();
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const f of files) applyMigration(registry, f, readFileSync(join(migrationsDir, f), "utf8"));

  const sources = [...registry.values()].sort((a, b) => a.sourceKey.localeCompare(b.sourceKey));
  // A parser that returns three rows because the SQL was reformatted looks
  // exactly like a clean run. The floor makes that impossible.
  if (sources.length < 20) {
    throw new Error(
      `Read only ${sources.length} sources from the migrations; expected at least 20.\n` +
        `The seed's shape has changed and this parser needs updating — ` +
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
export function normalise(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;|&#\d+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function failureReason(err: unknown): string {
  if (err instanceof Error && err.name === "AbortError") return "timeout";
  const code =
    (err as { code?: string })?.code ?? (err as { cause?: { code?: string } })?.cause?.code;
  return `network:${code ?? (err instanceof Error ? err.name : "unknown")}`;
}

export async function check(
  source: Pick<Source, "url">,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = TIMEOUT_MS,
): Promise<CheckResult> {
  const checkedOn = new Date().toISOString().slice(0, 10);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const unreachable = (reason: string, finalUrl?: string): CheckResult => ({
    url: source.url,
    fingerprint: null,
    availability: "unreachable",
    checkedOn,
    reason,
    ...(finalUrl ? { finalUrl } : {}),
  });

  try {
    const res = await fetchImpl(source.url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        // Identifying the checker is basic courtesy to a public authority's
        // server, and makes the traffic explicable in their logs. It is never
        // swapped for a browser's to get past a refusal: a page that refuses
        // us is reported as refusing us.
        "user-agent": USER_AGENT,
        accept: "text/html,application/xhtml+xml",
      },
    });
    const finalUrl = res.url && res.url !== source.url ? res.url : undefined;

    if (!res.ok) return unreachable(`http_${res.status}`, finalUrl);

    const text = normalise(await res.text());
    const fingerprint = createHash("sha256").update(text).digest("hex");
    return {
      url: source.url,
      fingerprint,
      availability: "available",
      checkedOn,
      text,
      ...(finalUrl ? { finalUrl } : {}),
    };
  } catch (err) {
    return unreachable(failureReason(err));
  } finally {
    clearTimeout(timer);
  }
}

/** Relied-upon terms absent from the page's visible text, case-insensitive. */
export function missingTerms(text: string, terms: readonly string[]): string[] {
  const hay = text.toLocaleLowerCase("sv");
  return terms.filter((t) => !hay.includes(t.toLocaleLowerCase("sv")));
}

/* ------------------------------------------------------------------ */
/* 3. Compare, report, and refuse to decide                            */
/* ------------------------------------------------------------------ */

export type Comparison = {
  changed: string[];
  unreachable: string[];
  stillUnreachable: string[];
  /** Unreachable at the accepted baseline, answering now. Somebody has to
   *  read it before the standing limitation can be lifted. */
  recovered: string[];
  added: string[];
  redirected: string[];
  termsMissing: Record<string, string[]>;
  /** In the baseline but no longer registered: superseded or deleted. */
  retired: string[];
};

export function compare(
  sources: Source[],
  baseline: Baseline | null,
  results: Record<string, CheckResult>,
  relied: ReliedTerms,
): Comparison {
  const c: Comparison = {
    changed: [],
    unreachable: [],
    stillUnreachable: [],
    recovered: [],
    added: [],
    redirected: [],
    termsMissing: {},
    retired: [],
  };
  for (const source of sources) {
    const result = results[source.sourceKey];
    const prior = baseline?.sources[source.sourceKey];
    // A registered URL that differs from the accepted one is a new source as
    // far as the fingerprint is concerned: comparing two pages' hashes would
    // say "changed" about something that was never the same page.
    if (!prior || prior.url !== source.url) c.added.push(source.sourceKey);
    else if (result.availability === "unreachable") {
      if (prior.availability === "unreachable") c.stillUnreachable.push(source.sourceKey);
      else c.unreachable.push(source.sourceKey);
    } else if (prior.availability === "unreachable") {
      c.recovered.push(source.sourceKey);
    } else if (prior.fingerprint && prior.fingerprint !== result.fingerprint) {
      c.changed.push(source.sourceKey);
    }
    if (result.availability === "available") {
      if (result.finalUrl) c.redirected.push(source.sourceKey);
      const missing = missingTerms(result.text ?? "", relied[source.sourceKey] ?? []);
      if (missing.length) c.termsMissing[source.sourceKey] = missing;
    }
  }
  const registered = new Set(sources.map((s) => s.sourceKey));
  c.retired = Object.keys(baseline?.sources ?? {}).filter((k) => !registered.has(k));
  return c;
}

/** Drift is what needs a human: changed, newly unreachable, or a relied-upon
 *  term gone. A known, unchanged failure is a standing limitation instead. */
export function driftCount(c: Comparison): number {
  return (
    c.changed.length +
    c.unreachable.length +
    c.recovered.length +
    Object.keys(c.termsMissing).length
  );
}

const short = (fp: string | null | undefined) => (fp ? fp.slice(0, 12) : "–");

export function renderReport(
  today: string,
  sources: Source[],
  baseline: Baseline | null,
  results: Record<string, CheckResult>,
  c: Comparison,
): string {
  const line = (k: string) => {
    const r = results[k];
    const parts = [`- \`${k}\` — ${r.url}`];
    if (r.availability === "unreachable")
      parts.push(`(${r.reason ?? "unreachable"}${r.hostRoot ? `; site root: ${r.hostRoot}` : ""})`);
    if (r.finalUrl) parts.push(`→ ${r.finalUrl}`);
    return parts.join(" ");
  };
  const changedLine = (k: string) =>
    `${line(k)} · accepted \`${short(baseline?.sources[k]?.fingerprint)}\` → now \`${short(results[k].fingerprint)}\``;
  const section = (title: string, keys: string[], render = line, preface: string[] = []) =>
    keys.length ? [`## ${title}`, "", ...preface, ...keys.map(render), ""] : [];

  return [
    "# Regulatory source report",
    "",
    `Checked ${today} against ${sources.length} registered sources.`,
    "",
    "**A changed source does not change any rule.** This report exists so a",
    "human reads the page and decides. Nothing in the product moved.",
    "",
    `- changed: ${c.changed.length}`,
    `- newly unreachable: ${c.unreachable.length}`,
    `- relied-upon terms missing: ${Object.keys(c.termsMissing).length}`,
    `- known unreachable (unchanged): ${c.stillUnreachable.length}`,
    `- reachable again (limitation still recorded): ${c.recovered.length}`,
    `- newly registered or moved: ${c.added.length}`,
    `- redirected: ${c.redirected.length}`,
    "",
    ...section("Changed since the last baseline", c.changed, changedLine),
    ...section("Newly unreachable", c.unreachable),
    ...section(
      "Relied-upon terms missing",
      Object.keys(c.termsMissing),
      (k) => `${line(k)} · missing: ${c.termsMissing[k].map((t) => `“${t}”`).join(", ")}`,
      [
        "The page answered, but no longer says a word the market pack relies on",
        "it saying (supabase/regulatory-source-relied-terms.json). Read it first.",
        "",
      ],
    ),
    ...section("Known unreachable (standing limitation, not new)", c.stillUnreachable, line, [
      "These were already unreachable at the last accepted baseline. A market",
      "pack that depends on one of them cannot claim its sources are monitored,",
      "and that belongs in the pack's legal review rather than in a weekly alert.",
      "They stay listed here until a run reaches them and a human accepts it.",
      "",
    ]),
    ...section(
      "Reachable again (the recorded limitation stands until accepted)",
      c.recovered,
      (k) => `${line(k)} · now \`${short(results[k].fingerprint)}\``,
      [
        "Recorded as unreachable in the accepted baseline. One answer is not",
        "verified access: read the page, then accept it in a reviewed change.",
        "",
      ],
    ),
    ...section(
      "Newly registered or moved (no comparable fingerprint)",
      c.added,
      (k) => `${line(k)} · now \`${short(results[k].fingerprint)}\``,
    ),
    ...section("Redirected", c.redirected, line, [
      "The registered URL answered from somewhere else. A permanent move is a",
      "migration that updates the URL, after somebody has read the new page.",
      "",
    ]),
    ...section("No longer registered (still in the baseline)", c.retired, (k) => `- \`${k}\``),
    "## What to do",
    "",
    "1. Open each page above and read what actually changed.",
    "2. If the regulatory content moved, open a change to the market pack and",
    "   set its `legal_review_state` back to `pending` — which, by the",
    "   `sp_market_pack_active_needs_review` constraint, switches the market off",
    "   until somebody reviews it.",
    "3. If nothing material changed, accept the new baseline for the sources",
    "   you read, in a reviewed change to `supabase/regulatory-source-baseline.json`",
    "   (`bun run regulatory-sources:check --update` accepts every source at once).",
    "",
  ].join("\n");
}

export function nextBaseline(today: string, results: Record<string, CheckResult>): Baseline {
  const sources: Record<string, BaselineEntry> = {};
  for (const [k, r] of Object.entries(results)) {
    sources[k] = {
      url: r.url,
      fingerprint: r.fingerprint,
      availability: r.availability,
      checkedOn: r.checkedOn,
    };
  }
  return {
    $comment:
      "Fingerprints of the official regulatory sources, as last accepted by a human. " +
      "Never edited by CI: a changed source opens a review, and somebody runs " +
      "`bun run regulatory-sources:check --update` once they have read the page.",
    checkedOn: today,
    sources,
  };
}

/* ------------------------------------------------------------------ */
/* 4. The run                                                          */
/* ------------------------------------------------------------------ */

export async function run(opts: {
  root: string;
  update: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  log?: (s: string) => void;
}): Promise<number> {
  const log = opts.log ?? console.log;
  const MIGRATIONS = join(opts.root, "supabase/migrations");
  const BASELINE = join(opts.root, "supabase/regulatory-source-baseline.json");
  const RELIED = join(opts.root, "supabase/regulatory-source-relied-terms.json");
  const REPORT = join(opts.root, "regulatory-source-report.md");

  const sources = registeredSources(MIGRATIONS);
  const baseline = existsSync(BASELINE)
    ? (JSON.parse(readFileSync(BASELINE, "utf8")) as Baseline)
    : null;
  const relied: ReliedTerms = existsSync(RELIED)
    ? (JSON.parse(readFileSync(RELIED, "utf8")).terms as ReliedTerms)
    : {};
  const registered = new Set(sources.map((s) => s.sourceKey));
  for (const k of Object.keys(relied)) {
    if (!registered.has(k)) throw new Error(`Relied-upon terms name an unregistered source: ${k}`);
  }
  const today = new Date().toISOString().slice(0, 10);

  log(`regulatory-source-monitor: ${sources.length} registered sources`);
  if (!baseline) log("  no baseline yet — this run establishes one");

  // Sequential on purpose: a burst of parallel requests at a government site
  // is indistinguishable from something it should rate-limit.
  const results: Record<string, CheckResult> = {};
  for (const source of sources) {
    const r = await check(source, opts.fetchImpl, opts.timeoutMs);
    if (r.availability === "unreachable" && !r.reason?.startsWith("http_")) {
      // One request to the site root, same identity, shorter wait. Not a
      // retry of the page and not a way round anything: it only says whether
      // the host answers us at all.
      const root = await check(
        { url: new URL("/", source.url).toString() },
        opts.fetchImpl,
        Math.min(opts.timeoutMs ?? TIMEOUT_MS, 10_000),
      );
      r.hostRoot = root.availability === "available" ? "answers" : (root.reason ?? "unreachable");
    }
    results[source.sourceKey] = r;
    const where = r.finalUrl ? ` → ${r.finalUrl}` : "";
    log(
      r.availability === "available"
        ? `  ${source.sourceKey}  available  fp=${r.fingerprint}${where}`
        : `  ${source.sourceKey}  unreachable  ${r.reason}${r.hostRoot ? ` (site root: ${r.hostRoot})` : ""}${where}`,
    );
  }

  const c = compare(sources, baseline, results, relied);
  for (const k of c.changed) log(`  CHANGED    ${k}`);
  for (const k of c.unreachable) log(`  NEWLY UNREACHABLE ${k}`);
  for (const k of c.stillUnreachable) log(`  still unreachable (known)  ${k}`);
  for (const k of c.recovered) log(`  REACHABLE AGAIN ${k}`);
  for (const k of c.added) log(`  new        ${k}`);
  for (const [k, t] of Object.entries(c.termsMissing)) log(`  TERMS MISSING ${k}: ${t.join(", ")}`);

  writeFileSync(REPORT, renderReport(today, sources, baseline, results, c), "utf8");

  if (opts.update || !baseline) {
    writeFileSync(BASELINE, JSON.stringify(nextBaseline(today, results), null, 2) + "\n", "utf8");
    log(`\nBaseline written to ${BASELINE}`);
    // A first run has nothing to compare against, so it cannot have found drift.
    return 0;
  }

  log(`\nreport written to ${REPORT}`);
  if (c.stillUnreachable.length > 0) {
    log(`note: ${c.stillUnreachable.length} source(s) remain unreachable, as already recorded.`);
  }
  // A source registered (or moved) since the last baseline has nothing to be
  // compared with. It is reported, and it still counts: an unread page is not
  // a monitored one.
  const drift = driftCount(c) + c.added.length;
  if (drift > 0) {
    console.error(
      `\nDRIFT: ${c.changed.length} changed, ${c.unreachable.length} newly unreachable, ` +
        `${c.recovered.length} reachable again, ` +
        `${Object.keys(c.termsMissing).length} missing relied-upon terms, ` +
        `${c.added.length} registered without an accepted fingerprint.` +
        `\nNo rule has been changed. Read ${REPORT} and decide.`,
    );
    return 1;
  }
  log("OK: every registered source matches its accepted baseline.");
  return 0;
}

if (import.meta.main) {
  run({ root: process.cwd(), update: process.argv.includes("--update") })
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(2);
    });
}
