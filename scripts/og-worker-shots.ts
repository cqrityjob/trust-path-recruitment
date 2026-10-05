// Pictures of what a person sees behind the link, from the BUILT Worker.
//
// Run: bun run scripts/og-worker-shots.ts <app base url> <out dir>
//
// The public page of a share (`/s/<id>`) at about 1440 and 390, in Swedish and
// English, for a short list, a forty-credential list and the founder card. All
// data is the synthetic fixture served by the stand-in database.

import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";
import { ACTIVE_ID, FOUNDER_ID, LONG_ID, REVOKED_ID } from "./og-worker-fixture";

const [base, out] = process.argv.slice(2);
if (!base || !out) throw new Error("usage: og-worker-shots.ts <app url> <out dir>");
mkdirSync(out, { recursive: true });

const pages = [
  ["sv-three-credentials", ACTIVE_ID, "active"],
  ["sv-forty-credentials", LONG_ID, "active"],
  ["en-founder", FOUNDER_ID, "active"],
  ["sv-revoked", REVOKED_ID, "unavailable"],
] as const;

// ── EVERY REQUEST THE BROWSER MAKES IS WATCHED ─────────────────────────
//
// A test build must be cut off from the real project in the CLIENT too: the
// browser's Supabase address and key are inlined at build time, so a page that
// hydrates and calls the real project would prove the opposite of isolation.
// Every request is recorded; one that leaves the test origin (the app itself,
// or the loopback stand-in the client was built against) fails the run, and a
// Supabase or production host is named in the failure.
const appHost = new URL(base).host;
const allowedHosts = new Set([
  appHost,
  ...(process.env.OG_ALLOWED_HOSTS ?? "").split(",").filter(Boolean),
]);
const leftTheTestOrigin: string[] = [];
const sizes = [
  ["desktop-1440", { width: 1440, height: 900 }],
  ["mobile-390", { width: 390, height: 844 }],
] as const;

const browser = await chromium.launch();
let failed = 0;
for (const [sizeName, viewport] of sizes) {
  const context = await browser.newContext({ viewport, ignoreHTTPSErrors: true });
  for (const [name, id, state] of pages) {
    const page = await context.newPage();
    page.on("request", (request) => {
      const host = new URL(request.url()).host;
      if (!allowedHosts.has(host))
        leftTheTestOrigin.push(`${name} @ ${sizeName}: ${request.method()} ${request.url()}`);
    });
    await page.goto(`${base}/s/${id}`, { waitUntil: "networkidle" });
    try {
      await page.waitForSelector(`[data-public-share="${state}"]`, { timeout: 30_000 });
    } catch {
      failed += 1;
      console.error(`${name} @ ${sizeName}: the page did not reach its ${state} state`);
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
if (leftTheTestOrigin.length > 0) {
  failed += leftTheTestOrigin.length;
  console.error("requests that left the test origin (a client still wired to a real project?):");
  for (const r of leftTheTestOrigin) console.error(`  - ${r}`);
}
if (failed > 0) process.exit(1);
console.log(
  `og-worker-shots: ${pages.length * sizes.length} pictures, no horizontal scroll, every browser request stayed on ${[...allowedHosts].join(" / ")}`,
);
