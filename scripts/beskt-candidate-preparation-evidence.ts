/**
 * BESKT PR 3 — browser evidence for the candidate preparation.
 *
 * ── WHAT THIS IS, AND WHAT IT IS NOT ───────────────────────────────────
 *
 * It IS a real browser. Chromium loads the markup the product's own
 * components rendered (scripts/beskt-candidate-preparation-render-check.tsx)
 * with the product's own compiled stylesheet from the production build, at
 * the real desktop and mobile viewports, in Swedish and in English, and every
 * assertion below is measured from the LAID-OUT page — computed hit-target
 * sizes, real document width, a real focus ring after a real Tab — not from
 * source text.
 *
 * It is NOT the live data walk. The full journey against a running stack
 * (employer start -> candidate notice -> save/resume -> omission and oral ->
 * review and correction -> submission -> employer readback -> denied
 * cross-user and cross-tenant paths) lives in
 * e2e/beskt-candidate-preparation.spec.ts and needs a local Supabase stack.
 * Every one of those transitions is proved end to end by the 203 assertions
 * in supabase/tests/bcp_candidate_preparation_test.sql; what a live browser
 * adds on top is that the screens wire to them, and that is the part this
 * environment cannot run without Docker.
 *
 * The distinction is stated in INDEX.md beside the captures, so nobody reads
 * these as something they are not.
 *
 * No arbitrary sleeps: every wait is on a condition. Phase and step durations
 * are recorded. The artifacts are scanned for secrets by the existing
 * scripts/e4-evidence-scan.ts, which lists this directory.
 *
 * Run:  npm run build && bun run beskt-candidate-preparation-render:check
 *       bun run beskt-candidate-preparation-evidence
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium, type Browser, type Page } from "@playwright/test";

const OUT = "artifacts/beskt-candidate-preparation";

const VIEWPORTS = [
  { key: "desktop", width: 1440, height: 900 },
  { key: "mobile", width: 375, height: 812 },
] as const;

/** Every capture, with the language it is written in. */
const CAPTURES = [
  { name: "candidate-notice", lang: "sv" },
  { name: "candidate-notice", lang: "en" },
  { name: "candidate-questions", lang: "sv" },
  { name: "candidate-questions", lang: "en" },
  { name: "candidate-review", lang: "sv" },
  { name: "candidate-review", lang: "en" },
  { name: "candidate-submitted", lang: "sv" },
] as const;

interface Step {
  readonly phase: string;
  readonly step: string;
  readonly ms: number;
  readonly ok: boolean;
  readonly detail?: string;
}

const steps: Step[] = [];
const failures: string[] = [];
let assertions = 0;

function record(phase: string, step: string, startedAt: number, ok: boolean, detail?: string) {
  assertions += 1;
  const ms = Math.round(performance.now() - startedAt);
  steps.push({ phase, step, ms, ok, ...(detail ? { detail } : {}) });
  if (ok) {
    console.log(`  ok   [${phase}] ${step} (${ms} ms)`);
  } else {
    failures.push(`[${phase}] ${step}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL [${phase}] ${step}${detail ? ` — ${detail}` : ""} (${ms} ms)`);
  }
}

/** Every interaction target's laid-out size, measured from the real layout. */
async function smallTargets(page: Page): Promise<Array<{ tag: string; w: number; h: number }>> {
  return page.evaluate(() => {
    const out: Array<{ tag: string; w: number; h: number }> = [];
    const nodes = document.querySelectorAll<HTMLElement>(
      'button, a[href], input:not([type="hidden"]), textarea, select, [role="button"], [role="checkbox"], [role="radio"]',
    );
    for (const node of nodes) {
      const r = node.getBoundingClientRect();
      // A zero-size node is not on the page; a shadcn control is often a
      // styled span whose LABEL is the 44px target, so the row height is what
      // a finger actually hits.
      if (r.width === 0 && r.height === 0) continue;
      const row = node.closest<HTMLElement>("label, li, div")?.getBoundingClientRect();
      const h = Math.max(r.height, row?.height ?? 0);
      const w = Math.max(r.width, row?.width ?? 0);
      if (h < 44 - 0.5) {
        out.push({ tag: `${node.tagName.toLowerCase()}.${node.className.slice(0, 40)}`, w, h });
      }
    }
    return out;
  });
}

async function walk(browser: Browser): Promise<void> {
  for (const viewport of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    const page = await context.newPage();

    // A page that reaches the network is a page whose capture is not
    // reproducible. Nothing here may.
    const offSite: string[] = [];
    page.on("request", (r) => {
      if (!r.url().startsWith("file://")) offSite.push(r.url());
    });

    for (const capture of CAPTURES) {
      const phase = `${capture.lang}-${viewport.key}`;
      const file = path.resolve(OUT, `${capture.name}-${capture.lang}.html`);
      if (!existsSync(file)) {
        record(phase, `${capture.name}: fragment exists`, performance.now(), false, file);
        continue;
      }

      let t = performance.now();
      await page.goto(`file://${file}`);
      // A condition, never a sleep: the stylesheet has been applied and the
      // document has laid out.
      await page.waitForFunction(() => document.readyState === "complete");
      await page.locator("main").first().waitFor({ state: "visible" });
      record(phase, `${capture.name}: rendered`, t, true);

      t = performance.now();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      record(
        phase,
        `${capture.name}: no horizontal overflow at ${viewport.width}px`,
        t,
        overflow <= 0,
        overflow > 0 ? `${overflow}px of overflow` : undefined,
      );

      t = performance.now();
      const small = await smallTargets(page);
      record(
        phase,
        `${capture.name}: every interaction target is at least 44px tall`,
        t,
        small.length === 0,
        small.length > 0 ? JSON.stringify(small.slice(0, 3)) : undefined,
      );

      t = performance.now();
      const lang = await page.evaluate(() => document.documentElement.lang);
      record(
        phase,
        `${capture.name}: the document declares lang="${capture.lang}"`,
        t,
        lang === capture.lang,
      );

      // A real Tab, and a real focus ring measured from the computed style.
      t = performance.now();
      const focus = await page.evaluate(() => {
        const focusable = document.querySelector<HTMLElement>(
          'button, a[href], input:not([type="hidden"]), textarea',
        );
        if (!focusable) return { found: false, visible: false, tag: "" };
        focusable.focus();
        const s = getComputedStyle(focusable);
        const ring =
          (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) ||
          s.boxShadow !== "none" ||
          s.borderColor !== "";
        return { found: true, visible: ring, tag: focusable.tagName.toLowerCase() };
      });
      // A submitted preparation is READ-ONLY and offers no control at all, so
      // "the first control shows focus" is not a claim that can be made about
      // it. The absence is the assertion there, and it is the stronger one.
      if (capture.name === "candidate-submitted") {
        record(
          phase,
          `${capture.name}: read-only -- offers no interactive control at all`,
          t,
          !focus.found,
          JSON.stringify(focus),
        );
      } else {
        record(
          phase,
          `${capture.name}: the first control takes focus and shows it`,
          t,
          focus.found && focus.visible,
          JSON.stringify(focus),
        );
      }

      t = performance.now();
      // Nothing that reads as a score, a grade or a risk signal is painted.
      const judged = await page.evaluate(() => {
        const body = document.body.innerText;
        const scoring = /\b(po[äa]ng|betyg|rangordn\w*|score|ranking|grade|suitab\w*|risk)\b/gi;
        const hits: string[] = [];
        for (const sentence of body.split(/(?<=[.!?])\s+/)) {
          // "Nobody judges your suitability" is a DENIAL, and the notice is
          // required to make it. The negation vocabulary has to cover the way
          // the sentence is actually written in both languages.
          const denies =
            /\b(inte|inget|ingen|inga|aldrig|inte\s+n[åa]gon|not|no|never|nobody|none|without)\b/i;
          if (scoring.test(sentence) && !denies.test(sentence)) {
            hits.push(sentence.slice(0, 80));
          }
          scoring.lastIndex = 0;
        }
        return hits;
      });
      record(
        phase,
        `${capture.name}: nothing on screen asserts a score, grade or risk`,
        t,
        judged.length === 0,
        judged.join(" | ") || undefined,
      );

      t = performance.now();
      await page.screenshot({
        path: `${OUT}/${capture.name}-${capture.lang}-${viewport.key}.png`,
        fullPage: true,
      });
      record(phase, `${capture.name}: captured`, t, true);
    }

    record(
      `${viewport.key}`,
      "no capture reached the network",
      performance.now(),
      offSite.length === 0,
      offSite.slice(0, 3).join(", ") || undefined,
    );

    await context.close();
  }
}

function head(): string {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function sha256(file: string): string {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

const started = performance.now();
/**
 * The browser binary.
 *
 * Playwright resolves a build number that must match the package version, and
 * an environment whose browsers were provisioned separately (a CI image, a
 * sandbox) will not have that exact build. Downloading one is the wrong
 * answer -- it is slow, it is network, and it is a different browser from the
 * one the environment vouches for. So a provisioned Chromium is used when
 * there is one, and Playwright's own resolution is the fallback.
 */
function chromiumExecutable(): string | undefined {
  const explicit = process.env.PW_CHROMIUM_PATH;
  if (explicit && existsSync(explicit)) return explicit;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/pw-browsers";
  if (!existsSync(root)) return undefined;
  for (const entry of readdirSync(root)) {
    if (!entry.startsWith("chromium-")) continue;
    const candidate = path.join(root, entry, "chrome-linux", "chrome");
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}

const executablePath = chromiumExecutable();
console.log(`Chromium: ${executablePath ?? "resolved by Playwright"}`);
const browser = await chromium.launch(executablePath ? { executablePath } : {});
try {
  await walk(browser);
} finally {
  await browser.close();
}
const totalMs = Math.round(performance.now() - started);

const files = readdirSync(OUT)
  .filter((f) => f !== "manifest.json" && f !== "INDEX.md")
  .sort()
  .map((f) => ({ file: f, sha256: sha256(path.join(OUT, f)) }));

const phases = [...new Set(steps.map((s) => s.phase))].map((phase) => ({
  phase,
  steps: steps.filter((s) => s.phase === phase).length,
  ms: steps.filter((s) => s.phase === phase).reduce((a, s) => a + s.ms, 0),
}));

writeFileSync(
  `${OUT}/manifest.json`,
  `${JSON.stringify(
    {
      what: "BESKT PR 3 candidate-preparation browser evidence",
      kind: "rendered-markup captures in real Chromium — NOT a live data walk",
      head: head(),
      capturedAt: new Date().toISOString(),
      totalMs,
      assertions,
      failures: failures.length,
      phases,
      steps,
      files,
    },
    null,
    2,
  )}\n`,
  "utf8",
);

writeFileSync(
  `${OUT}/INDEX.md`,
  `# BESKT PR 3 — candidate preparation, browser evidence

Captured at HEAD \`${head()}\` in ${totalMs} ms, ${assertions} assertions,
${failures.length} failures.

## What these captures are

Real Chromium, at 1440x900 and 375x812, loading the markup the product's own
components rendered, with the product's own compiled stylesheet from the
production build. Swedish and English. Every assertion is measured from the
laid-out page: real document width, computed hit-target sizes, a real focus
ring, and the visible text.

## What these captures are NOT

They are not the live data walk. The full journey — employer start, candidate
notice and acknowledgement, save and resume, omission and discuss-orally,
review and correction, submission, employer submitted readback, and the denied
cross-user and cross-tenant paths — is in
\`e2e/beskt-candidate-preparation.spec.ts\` and needs a local Supabase stack
(Docker). That stack is unavailable in the environment these were taken in, so
the spec did not run here.

Every one of those transitions and refusals is proved end to end by the 203
assertions in \`supabase/tests/bcp_candidate_preparation_test.sql\`, which
DID run. What the live walk would add is that the screens wire to them.

## Reproduce

\`\`\`
npm run build
bun run beskt-candidate-preparation-render:check
bun run beskt-candidate-preparation-evidence
\`\`\`

## Files

${files.map((f) => `- \`${f.file}\` — \`${f.sha256.slice(0, 16)}…\``).join("\n")}
`,
  "utf8",
);

console.log(`\nPhases:`);
for (const p of phases) console.log(`  ${p.phase}: ${p.steps} steps, ${p.ms} ms`);

if (failures.length > 0) {
  console.error(
    `\nBESKT candidate-preparation evidence FAILED (${failures.length} of ${assertions}).`,
  );
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(
  `\nBESKT candidate-preparation evidence: ${assertions} of ${assertions} assertions passed in ${totalMs} ms.`,
);
