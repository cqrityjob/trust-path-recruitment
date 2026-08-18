// Visual acceptance evidence for the Phase 8 reports.
//
// ── WHY THIS EXISTS AS A SCRIPT ────────────────────────────────────────
//
// The earlier browser run drove the UI through dispatched DOM events because
// the interactive pane's screenshot capture kept returning blank images. That
// proved the code paths ran; it proved nothing about what the pages LOOK like,
// and a report is a document whose whole job is to be read.
//
// This drives a real Chromium through Playwright against the local stack and
// writes actual PNGs and PDFs, so visual acceptance rests on artefacts a person
// can open rather than on a description of them.
//
// It is a proof generator, not a test: it asserts a handful of things that would
// invalidate the artefacts (overflow, missing sections, employer-only content on
// the participant page) and otherwise just captures.
//
// LOCAL ONLY. Refuses to run against anything but a localhost base URL, because
// it signs in with fixture passwords and screenshots whatever it finds.
//
//   npx tsx scripts/phase8-report-proof.ts
//
// Env:
//   PROOF_BASE_URL     default http://localhost:8083
//   PROOF_OUT          default docs/employer/phase8-report-proof
//   PROOF_PASSWORD     fixture password for the synthetic accounts
//   PROOF_EMPLOYER     employer login (default owner@pilot.test)
//   PROOF_PARTICIPANT  participant login
//   PROOF_ATTEMPT      attempt id whose report is captured

import { chromium, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const BASE = process.env.PROOF_BASE_URL ?? "http://localhost:8083";
const OUT = resolve(process.env.PROOF_OUT ?? "docs/employer/phase8-report-proof");
const PASSWORD = process.env.PROOF_PASSWORD ?? "";
const EMPLOYER = process.env.PROOF_EMPLOYER ?? "owner@pilot.test";
const PARTICIPANT = process.env.PROOF_PARTICIPANT ?? "";
const ATTEMPT = process.env.PROOF_ATTEMPT ?? "";
const SLUG = process.env.PROOF_SLUG ?? "sakerhet-ab-pilot";

if (!/^http:\/\/localhost:|^http:\/\/127\.0\.0\.1:/.test(BASE)) {
  console.error(`REFUSING: PROOF_BASE_URL is not local: ${BASE}`);
  process.exit(2);
}
if (!PASSWORD || !PARTICIPANT || !ATTEMPT) {
  console.error("Set PROOF_PASSWORD, PROOF_PARTICIPANT and PROOF_ATTEMPT.");
  process.exit(2);
}

const problems: string[] = [];
function check(cond: boolean, label: string) {
  if (cond) console.log(`  ok   ${label}`);
  else {
    console.log(`  FAIL ${label}`);
    problems.push(label);
  }
}

/** Sign in through the real form. */
async function signIn(page: Page, path: string, email: string) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(PASSWORD);
  await page
    .getByRole("button", { name: /Logga in|Sign in/ })
    .first()
    .click();
  // Wait for the session to actually exist rather than for the network to go
  // quiet. Supabase writes the session to localStorage after the response, and
  // navigating in that gap lands on the auth guard instead of the report --
  // which is exactly what the first run of this script captured.
  await page.waitForURL((u) => !/\/login|\/auth/.test(u.pathname), { timeout: 20000 });
  await page.waitForLoadState("networkidle");
}

/** No element may scroll horizontally inside a visible-overflow box, and the
 *  document itself must not. This is the check that catches a report card that
 *  looks fine on a laptop and runs off the edge of a phone. */
async function noOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const de = document.documentElement;
    if (de.scrollWidth > de.clientWidth + 1) return false;
    return ![...document.querySelectorAll("main *")].some(
      (el) => el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflowX === "visible",
    );
  });
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`  saved ${name}.png`);
}

/** Print is a different medium, not a narrower screen. Emulating it is the only
 *  way to see what actually leaves the building. */
async function printPdf(page: Page, name: string) {
  await page.emulateMedia({ media: "print" });
  await page.pdf({ path: `${OUT}/${name}.pdf`, format: "A4", printBackground: true });
  // Inline rather than a named helper: the TS transform injects a __name
  // shim around named functions, and that shim does not exist inside the
  // page context.
  const chromeVisible = await page.evaluate(() => ({
    nav:
      !document.querySelector("aside") ||
      getComputedStyle(document.querySelector("aside")!).display === "none",
    tabs:
      !document.querySelector("nav.no-print") ||
      getComputedStyle(document.querySelector("nav.no-print")!).display === "none",
  }));
  await page.emulateMedia({ media: "screen" });
  console.log(`  saved ${name}.pdf`);
  return chromeVisible;
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();

  // ── EMPLOYER ────────────────────────────────────────────────────────────
  const emp = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ep = await emp.newPage();
  console.log("employer report");
  await signIn(ep, "/employer/login", EMPLOYER);
  await ep.goto(`${BASE}/employer/${SLUG}/assessments/results/${ATTEMPT}`, {
    waitUntil: "networkidle",
  });
  await ep.waitForTimeout(600);

  const empText = await ep.locator("main").innerText();
  check(empText.includes("Om den här bedömningen"), "Part A context present");
  check(empText.includes("Vad rapporten kan användas till"), "Part B decision summary present");
  check(empText.includes("Säkerhetskritisk uppföljning"), "Part D safety section present");
  check(empText.includes("Arbetsgivarens beslut"), "Part F decision panel present");
  check(
    !/\b(limited_evidence|developing_evidence|consistent_evidence)\b/.test(empText),
    "no internal maturity vocabulary on the employer page",
  );
  check(!/\d+\s*%/.test(empText), "no percentage anywhere on the employer page");
  check(await noOverflow(ep), "employer desktop: no horizontal overflow");
  await shot(ep, "employer-01-desktop-full");

  // Expand lineage so the artefact shows what the auditor would see.
  await ep
    .getByRole("button", { name: /Visa spårbarhet/ })
    .first()
    .click();
  await ep.waitForTimeout(250);
  await shot(ep, "employer-02-lineage-expanded");

  // SafetyFlagNotice renders a role="note" block, not a <section>: it is a
  // standing notice rather than a document section, and it is deliberately not
  // nested inside the competency card so a template cannot drop it.
  await ep
    .locator('[role="note"]')
    .first()
    .screenshot({ path: `${OUT}/employer-03-safety-section.png` });
  console.log("  saved employer-03-safety-section.png");

  // Decision history as it stands (recorded earlier through the UI).
  await ep
    .locator("section", { hasText: "Arbetsgivarens beslut" })
    .first()
    .screenshot({ path: `${OUT}/employer-04-decision-history.png` });
  console.log("  saved employer-04-decision-history.png");

  // Open the correction form so the artefact shows the controls.
  const correct = ep.getByRole("button", { name: /Registrera (rättelse|beslut)/ }).first();
  await correct.click();
  await ep.waitForTimeout(250);
  await ep
    .locator("section", { hasText: "Arbetsgivarens beslut" })
    .first()
    .screenshot({ path: `${OUT}/employer-05-decision-form.png` });
  console.log("  saved employer-05-decision-form.png");

  const chrome = await printPdf(ep, "employer-06-print");
  check(chrome.nav, "print: employer sidebar hidden");
  check(chrome.tabs, "print: assessment-center tabs hidden");

  const empMobile = await emp.newPage();
  await empMobile.setViewportSize({ width: 375, height: 812 });
  await empMobile.goto(`${BASE}/employer/${SLUG}/assessments/results/${ATTEMPT}`, {
    waitUntil: "networkidle",
  });
  await empMobile.waitForTimeout(600);
  check(await noOverflow(empMobile), "employer 375px: no horizontal overflow");
  const smallEmp = await empMobile.evaluate(() =>
    [...document.querySelectorAll("main button, main a")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.height > 0 && r.height < 40;
      })
      .map((el) => (el as HTMLElement).innerText.trim().slice(0, 30)),
  );
  check(smallEmp.length === 0, `employer 375px: no target under 40px (${smallEmp.join(", ")})`);
  await shot(empMobile, "employer-07-mobile-375");

  // ── PARTICIPANT ─────────────────────────────────────────────────────────
  const par = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pp = await par.newPage();
  console.log("participant report");
  await signIn(pp, "/auth", PARTICIPANT);
  await pp.goto(`${BASE}/academy/report/${ATTEMPT}`, { waitUntil: "networkidle" });
  await pp.waitForTimeout(600);

  const parText = await pp.locator("main").innerText();
  check(parText.includes("Varför gjordes bedömningen"), "participant: why-section present");
  check(parText.includes("En människa fattar"), "participant: human-decides statement present");
  check(parText.includes("Dina uppgifter och dina rättigheter"), "participant: rights present");
  check(parText.includes("läst av en granskare"), "participant: human-review disclosure present");
  // The three things a participant must never receive.
  check(
    !/Allvarlighetsgrad|\b(low|medium|high|critical)\b/.test(parText),
    "participant: no severity vocabulary",
  );
  check(!parText.includes("Arbetsgivarens beslut"), "participant: no employer decision");
  check(!/Be personen/.test(parText), "participant: no employer-facing interview prompts");
  check(await noOverflow(pp), "participant desktop: no horizontal overflow");
  await shot(pp, "participant-01-desktop-full");

  await pp
    .locator("section", { hasText: "Varför gjordes bedömningen" })
    .first()
    .screenshot({ path: `${OUT}/participant-02-why-and-review.png` });
  console.log("  saved participant-02-why-and-review.png");

  await pp
    .locator("section", { hasText: "Dina uppgifter och dina rättigheter" })
    .first()
    .screenshot({ path: `${OUT}/participant-03-rights.png` });
  console.log("  saved participant-03-rights.png");

  await printPdf(pp, "participant-04-print");

  const parMobile = await par.newPage();
  await parMobile.setViewportSize({ width: 375, height: 812 });
  await parMobile.goto(`${BASE}/academy/report/${ATTEMPT}`, { waitUntil: "networkidle" });
  await parMobile.waitForTimeout(600);
  check(await noOverflow(parMobile), "participant 375px: no horizontal overflow");
  await shot(parMobile, "participant-05-mobile-375");

  await browser.close();

  console.log("");
  if (problems.length > 0) {
    console.error(`phase8-report-proof: ${problems.length} problem(s)`);
    problems.forEach((p) => console.error(`  - ${p}`));
    process.exit(1);
  }
  console.log(`phase8-report-proof: OK — artefacts in ${OUT}`);
}

void main();
