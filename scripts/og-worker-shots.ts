// Pictures of what a person sees behind the link, from the BUILT Worker.
//
// Run: bun run scripts/og-worker-shots.ts <app base url> <out dir>
//
// The public page of a share (`/s/<id>`) at about 1440 and 390, in Swedish and
// English, for a short list, a forty-credential list and the founder card. All
// data is the synthetic fixture served by the stand-in database.

import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import { ACTIVE_ID, FOUNDER_ID, LONG_ID } from "./og-worker-fixture";

const [base, out] = process.argv.slice(2);
if (!base || !out) throw new Error("usage: og-worker-shots.ts <app url> <out dir>");
mkdirSync(out, { recursive: true });

const pages = [
  ["sv-three-credentials", ACTIVE_ID],
  ["sv-forty-credentials", LONG_ID],
  ["en-founder", FOUNDER_ID],
] as const;
const sizes = [
  ["desktop-1440", { width: 1440, height: 900 }],
  ["mobile-390", { width: 390, height: 844 }],
] as const;

const browser = await chromium.launch();
let failed = 0;
for (const [sizeName, viewport] of sizes) {
  const context = await browser.newContext({ viewport, ignoreHTTPSErrors: true });
  for (const [name, id] of pages) {
    const page = await context.newPage();
    await page.goto(`${base}/s/${id}`, { waitUntil: "networkidle" });
    try {
      await page.waitForSelector('[data-public-share="active"]', { timeout: 30_000 });
    } catch {
      failed += 1;
      console.error(`${name} @ ${sizeName}: the page did not reach its active state`);
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 1) {
      failed += 1;
      console.error(`${name} @ ${sizeName}: horizontal scroll of ${overflow}px`);
    }
    await page.screenshot({ path: `${out}/page-${name}-${sizeName}.png`, fullPage: true });
    await page.close();
  }
  await context.close();
}
await browser.close();
if (failed > 0) process.exit(1);
console.log(`og-worker-shots: ${pages.length * sizes.length} pictures, no horizontal scroll`);
