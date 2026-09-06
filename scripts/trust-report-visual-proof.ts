// TRUST Evidence Report (PR-R3B) — visual proof. DEVELOPMENT ONLY, not a CI gate.
//
// Run:  bun run dev            (in another terminal; note the real port)
//       BASE=http://localhost:8080 OUT=./trust-report-shots bun run scripts/trust-report-visual-proof.ts
//
// Drives /dev/trust-evidence-report (fixtures, no auth, no database) through
// Playwright at 1440 / 1280 / 768 / 390, in sv and en, with and without an
// application, with a safety finding, with addenda and on a legacy chain,
// plus the print media as A4 PDF. Records horizontal overflow, h1 count, raw
// i18n keys, undefined/NaN and console errors while it goes.

import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = process.env.BASE ?? "http://localhost:8080";
const OUT = process.env.OUT ?? "./shots";
mkdirSync(OUT, { recursive: true });
const url = (q: string) => `${BASE}/dev/trust-evidence-report?${q}`;
const browser = await chromium.launch();
const issues: string[] = [];
async function shot(
  name: string,
  q: string,
  width: number,
  height: number,
  opts: { full?: boolean; expand?: string; print?: boolean; open?: boolean } = {},
) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(url(q), { waitUntil: "networkidle" });
  await page.waitForSelector(".trust-report", { timeout: 30000 });
  await page.waitForTimeout(600);
  if (opts.expand) {
    await page.locator(`[data-competency="${opts.expand}"] button[aria-expanded]`).click();
    await page.waitForTimeout(200);
  }
  if (opts.open) {
    // Click the first closed fold until none is left: the list goes stale as
    // each click flips aria-expanded.
    const closed = page.locator('button[aria-expanded="false"]');
    while ((await closed.count()) > 0) await closed.first().click();
    await page.waitForTimeout(200);
  }
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  const h1 = await page.locator("h1").count();
  const text = await page.evaluate(() => document.body.innerText);
  if (sw > width) issues.push(`${name}: horizontal overflow ${sw} > ${width}`);
  if (h1 !== 1) issues.push(`${name}: ${h1} h1`);
  if (/report\.trust\./.test(text)) issues.push(`${name}: raw i18n key`);
  if (/undefined|NaN|\[object/.test(text)) issues.push(`${name}: undefined/NaN`);
  if (errors.length) issues.push(`${name}: console ${errors.slice(0, 2).join(" | ")}`);
  if (opts.print) {
    await page.emulateMedia({ media: "print" });
    await page.pdf({
      path: `${OUT}/${name}.pdf`,
      format: "A4",
      printBackground: true,
      margin: { top: "15mm", bottom: "15mm", left: "15mm", right: "15mm" },
    });
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  } else {
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: Boolean(opts.full) });
  }
  console.log(`shot ${name} (${width}x${height}) scrollWidth=${sw} h1=${h1}`);
  await ctx.close();
}
await shot("01-standard-1440-fold", "fixture=standard&app=1", 1440, 900);
await shot("02-standard-1440-full", "fixture=standard&app=1", 1440, 900, { full: true });
await shot("03-standard-1440-scc08-expanded", "fixture=standard&app=1", 1440, 900, {
  full: true,
  expand: "SCC-08",
});
await shot("04-standard-1280-fold", "fixture=standard&app=1", 1280, 800);
await shot("05-standard-768-full", "fixture=standard&app=1", 768, 1024, { full: true });
await shot("06-standard-390-full", "fixture=standard&app=1", 390, 844, { full: true });
await shot("07-safety-1440-full", "fixture=safety&app=1", 1440, 900, { full: true });
await shot("08-mixed-addenda-1440-full", "fixture=mixed-addenda&app=1&record=1", 1440, 900, {
  full: true,
});
await shot("09-legacy-1440-scc08-expanded", "fixture=legacy&app=1", 1440, 900, {
  full: true,
  expand: "SCC-08",
});
await shot("10-standard-en-1440-fold", "fixture=standard&app=1&lang=en", 1440, 900);
await shot("11-no-application-1440-fold", "fixture=standard", 1440, 900);
await shot("12-print-standard", "fixture=standard&app=1", 1100, 900, { print: true });
await shot("13-print-safety", "fixture=safety&app=1", 1100, 900, { print: true });
await shot("14-standard-390-all-open", "fixture=mixed-addenda&app=1", 390, 844, {
  full: true,
  open: true,
});
await browser.close();
console.log(issues.length ? `ISSUES:\n${issues.join("\n")}` : "no sweep issues");
