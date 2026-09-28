// Settles a cold dev server's dependency bundle before a browser walk.
//
//   node scripts/local-dev-server-warmup.mjs https://127.0.0.1:3121
//
// Run it from the application's root, where node_modules/.vite is.
//
// ── WHY A WALK NEEDS THIS ──────────────────────────────────────────────
//
// On an empty dependency cache (every CI run), Vite pre-bundles what its
// startup scan finds. The first page a browser loads then brings in the
// router's runtime, which the scan does not see: @tanstack/router-core and
// @tanstack/history, seroval and h3-v2. Vite bundles those while the page runs
// and then reloads every open page.
//
// On a busy runner that reload lands wherever the walk has got to by then. The
// reloaded page's module requests are reset, it never hydrates, and the walk
// waits out its timeout on a page that will not come. That is case A at
// /my-career/profile in runs 36423283328 and 36361720007, with every later
// case of that project skipped.
//
// A warm cache holds exactly those seven more dependencies and nothing else,
// so one settled page load is all a walk ever triggers. Before the walk, this
// loads a page in a browser, lets Vite finish that bundle and its reload, and
// then requires a fresh page to hydrate with neither. It changes nothing the
// application does; it moves the reload ahead of the walk.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const base = (process.argv[2] ?? "").replace(/\/+$/, "");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base)) {
  console.error("usage: node scripts/local-dev-server-warmup.mjs https://127.0.0.1:<port>");
  process.exit(2);
}

const CACHE = path.join(process.cwd(), "node_modules", ".vite");
const BUDGET_MS = 8 * 60_000;
const QUIET_MS = 10_000;
const MAX_ROUNDS = 6;
const started = Date.now();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const elapsed = () => `${((Date.now() - started) / 1000).toFixed(0)}s`;

/** The optimizer's current result: which dependencies, under which hash. */
function bundleState() {
  try {
    const meta = JSON.parse(readFileSync(path.join(CACHE, "deps", "_metadata.json"), "utf8"));
    return `${meta.browserHash}:${Object.keys(meta.optimized ?? {})
      .sort()
      .join(",")}`;
  } catch {
    return null; // not written yet, or being swapped in
  }
}
const dependencyCount = (state) => (state ? state.split(":")[1].split(",").length : 0);
const bundleHash = (state) => (state ? state.split(":")[0] : "none");

/** A re-bundle writes deps_temp_* beside deps and swaps it in when done. */
function bundling() {
  return existsSync(CACHE) && readdirSync(CACHE).some((name) => name.startsWith("deps_temp"));
}

const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
);
const context = await browser.newContext({ ignoreHTTPSErrors: true });

/**
 * One fresh page: loaded, hydrated, then watched for QUIET_MS. Returns
 * whether Vite reloaded it or re-bundled meanwhile.
 */
async function round() {
  const page = await context.newPage();
  // Documents loaded, not navigations: the router also updates history on
  // hydration, in the same document. A reload by the dev server is a new one.
  let navigations = 0;
  page.on("load", () => {
    navigations += 1;
  });
  const before = bundleState();
  const t0 = Date.now();
  await page.goto(`${base}/`, { waitUntil: "load", timeout: 120_000 }).catch(() => {});
  // TanStack Start removes $_TSR once the page has hydrated. A page whose
  // modules were reset under a reload never gets there; it is reloaded here,
  // where nothing is being walked.
  const hydrated = await page
    .waitForFunction(() => document.readyState === "complete" && !("$_TSR" in window), null, {
      timeout: 120_000,
    })
    .then(() => true)
    .catch(() => false);
  const hydratedIn = ((Date.now() - t0) / 1000).toFixed(1);
  // A reload replaces the document, and this mark with it.
  await page.evaluate(() => (window.__warmupMark = true)).catch(() => {});
  // Quiet: no reload, no bundle in progress, the same bundle, for QUIET_MS.
  let last = bundleState();
  let since = Date.now();
  let seen = navigations;
  while (Date.now() - since < QUIET_MS && Date.now() - started < BUDGET_MS) {
    await sleep(500);
    const now = bundleState();
    if (bundling() || now !== last || navigations !== seen) {
      last = now;
      seen = navigations;
      since = Date.now();
    }
  }
  const kept = await page.evaluate(() => window.__warmupMark === true).catch(() => false);
  await page.close();
  const after = bundleState();
  return {
    hydrated: hydrated && kept,
    hydratedIn,
    reloads: Math.max(0, navigations - 1),
    changed: before !== after,
    state: after,
  };
}

let settled = null;
for (let n = 1; n <= MAX_ROUNDS && Date.now() - started < BUDGET_MS; n += 1) {
  const r = await round();
  console.log(
    `local-dev-server-warmup: round ${n}: ${r.hydrated ? `hydrated in ${r.hydratedIn}s` : "did not hydrate"}, ${r.reloads} reload(s) by the dev server, ${dependencyCount(r.state)} dependencies bundled as ${bundleHash(r.state)}${r.changed ? " (re-bundled)" : ""}, ${elapsed()}`,
  );
  if (r.hydrated && r.reloads === 0 && !r.changed) {
    settled = r;
    break;
  }
}
await browser.close();

if (!settled) {
  console.error(
    "local-dev-server-warmup: the dev server did not settle. A walk on it would be reloaded under it.",
  );
  process.exit(1);
}
console.log(
  `local-dev-server-warmup: settled after ${elapsed()} -- a fresh page hydrated with no reload and no re-bundle (${dependencyCount(settled.state)} dependencies, bundle ${bundleHash(settled.state)}).`,
);
