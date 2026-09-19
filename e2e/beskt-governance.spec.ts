/**
 * BESKT governance and pilot access — the ROUTED walk.
 *
 * The real application, signed in as the synthetic governance people the
 * fixture created, against a real PostgREST enforcing real RLS:
 *
 *   1. the platform admin sees the published method with its five gates
 *      COUNTING — a published method must not say its own approvals lapsed;
 *   2. a pilot grant is what opens the method to an employer: the rival
 *      employer's library says "under development", the admin admits it, the
 *      library shows the method, the admin revokes, and it is gone again;
 *   3. an editor who is NOT a platform admin reaches /beskt-governance,
 *      creates a method and lands on its draft, and the validator — not the
 *      screen — says what is still missing;
 *   4. a reviewer reaches the same surface without a create action or the
 *      admin's access tab, and the database refuses them publication;
 *   5. a candidate is refused the surface, and the database refuses them a
 *      gate decision when they call it directly.
 *
 * Every person here is synthetic (`@local.test`). The fixture's governance
 * decisions are test fixtures, not anybody's review of a real method.
 *
 * Reproduce:
 *   scripts/local-stack/up.sh
 *   E2E_LOCAL_STACK=1 E2E_BASE_URL=http://127.0.0.1:3119 \
 *   E2E_SUPABASE_URL=http://127.0.0.1:54321 E2E_SUPABASE_ANON_KEY=<local anon key> \
 *   BCP_DATABASE_URL=postgresql://postgres:localbeskt@127.0.0.1:5432/beskt_e2e \
 *     bunx playwright test e2e/beskt-governance.spec.ts --project=chromium --workers=1
 */

import { expect, test, type Browser, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const LOCAL = process.env.E2E_LOCAL_STACK === "1";
const BASE = process.env.E2E_BASE_URL ?? "";

test.skip(!LOCAL, "Set E2E_LOCAL_STACK=1 to run the routed walk against a local stack.");
test.skip(
  LOCAL && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE),
  "The routed walk runs only against loopback — never a shared or hosted backend.",
);

test.describe.configure({ mode: "serial", timeout: 240_000 });

const OUT = process.env.BCP_GOV_EVIDENCE_DIR ?? "artifacts/beskt-governance/live";
mkdirSync(OUT, { recursive: true });

const PASSWORD = "LocalJourney!2026";
const ADMIN = "beskt-journey-admin@local.test";
const EDITOR = "beskt-journey-editor@local.test";
const REVIEWER = "beskt-journey-reviewer1@local.test";
const CANDIDATE = "beskt-candidate@local.test";
const OUTSIDER = "beskt-outsider@local.test";
const RIVAL_SLUG = "beskt-rival-ab";

const SUPABASE_URL = process.env.E2E_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.E2E_SUPABASE_ANON_KEY ?? "";
const DATABASE_URL = process.env.BCP_DATABASE_URL ?? "";
const LOOPBACK = /^[a-z]+:\/\/([^@/]*@)?(localhost|127\.0\.0\.1)(:|\/|$)/;

function sql(query: string): string {
  if (!LOOPBACK.test(DATABASE_URL)) throw new Error("BCP_DATABASE_URL must be a loopback database");
  return execFileSync("psql", [DATABASE_URL, "-Atc", query], { encoding: "utf8" }).trim();
}

/** The synthetic method the fixture published first, and the rival employer. */
function ids(): { versionId: string; rivalId: string } {
  return {
    versionId: sql(
      "SELECT v.id FROM public.beskt_method_versions v JOIN public.scp_interview_packs p ON p.id = v.pack_id WHERE p.slug = 'beskt-journey-synthetic' AND v.content_status = 'published' LIMIT 1",
    ),
    rivalId: sql(`SELECT id FROM public.employers WHERE slug = '${RIVAL_SLUG}'`),
  };
}

async function signIn(page: Page, email: string, destination: string): Promise<void> {
  await page.goto(`/login?redirect=${encodeURIComponent(destination)}`);
  const emailField = page.getByLabel(/^e-?post$|^email$/i);
  await emailField.waitFor({ state: "visible", timeout: 120_000 });
  await emailField.fill(email);
  await page.getByLabel(/^lösenord$|^password$/i).fill(PASSWORD);
  await page.getByRole("button", { name: /^logga in$|^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
}

async function useEnglish(page: Page): Promise<void> {
  await page.getByRole("button", { name: "en", exact: true }).first().click();
  await expect(page.locator("html")).toHaveAttribute("lang", /^en/, { timeout: 15_000 });
}

async function useSwedish(page: Page): Promise<void> {
  await page.getByRole("button", { name: "sv", exact: true }).first().click();
  await expect(page.locator("html")).toHaveAttribute("lang", /^sv/, { timeout: 15_000 });
}

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({
    path: `${OUT}/${test.info().project.name}-${name}.png`,
    fullPage: true,
    scale: "css",
  });
}

async function expectFitsViewport(page: Page): Promise<void> {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth, `the page scrolls sideways at ${innerWidth}px`).toBeLessThanOrEqual(
    innerWidth + 1,
  );
}

const GATES = [
  "personnel_security",
  "senior_hr",
  "recruitment",
  "employment_privacy_legal",
  "data_protection",
] as const;

/** Each of the five gates, by its own row, reads approved -- none reads lapsed. */
async function expectFiveGatesApproved(page: Page): Promise<void> {
  for (const gate of GATES) {
    const row = page.getByTestId(`beskt-gate-${gate}`);
    await expect(row).toContainText(/Godkänd|Approved/, { timeout: 60_000 });
    await expect(row).not.toContainText(/Räknas inte längre|No longer counts/);
  }
}

/** Call an RPC straight at PostgREST as whoever is signed in on `page`. */
async function rpcAs(
  page: Page,
  fn: string,
  args: Record<string, unknown>,
): Promise<{ status: number; body: string }> {
  if (!LOOPBACK.test(SUPABASE_URL)) throw new Error("E2E_SUPABASE_URL must be loopback");
  const stored = await page.evaluate(() => {
    for (let i = 0; i < localStorage.length; i += 1) {
      const name = localStorage.key(i) ?? "";
      if (/^sb-.*-auth-token$/.test(name)) return localStorage.getItem(name);
    }
    return null;
  });
  const parsed = stored ? JSON.parse(stored) : {};
  const token: string = parsed.access_token ?? parsed.currentSession?.access_token ?? "";
  if (!token) throw new Error("no signed-in session on this page");
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(args),
  });
  return { status: response.status, body: await response.text() };
}

test.describe("BESKT governance and pilot access — the routed walk", () => {
  /* ---------------------------------------------------------------- 1 */
  test("1 · the admin sees a published method whose five gates still count", async ({ page }) => {
    const { versionId } = ids();
    await signIn(page, ADMIN, "/admin/beskt-methods");

    await expect(page.getByText(/SYNTETISK BESKT-metod för genomgång/).first()).toBeVisible({
      timeout: 60_000,
    });
    await shot(page, "01-admin-list-sv");

    await page.goto(`/admin/beskt-methods/${versionId}?tab=lifecycle`);
    const body = page.locator("body");
    await expect(body).toContainText(/De fem granskningsportarna/, { timeout: 60_000 });
    await expect(body).not.toContainText(/Räknas inte längre/);
    await expectFiveGatesApproved(page);
    await expectFitsViewport(page);
    await shot(page, "01-admin-gates-sv");

    await page.goto(`/admin/beskt-methods/${versionId}?tab=access`);
    await expect(page.getByTestId("beskt-pilot-grants")).toContainText(/BESKT Journey AB/, {
      timeout: 60_000,
    });
    await shot(page, "01-admin-access-sv");

    await useEnglish(page);
    await expect(page.getByTestId("beskt-pilot-grants")).toContainText(/BESKT Journey AB/);
    await shot(page, "01-admin-access-en");
    await useSwedish(page);
  });

  /* ---------------------------------------------------------------- 2 */
  test("2 · only a pilot grant opens the method to an employer, and revoking closes it", async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    const { versionId, rivalId } = ids();
    const library = `/employer/${RIVAL_SLUG}/assessments/library`;

    const rivalContext = await browser.newContext();
    const rival = await rivalContext.newPage();
    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    try {
      await test.step("before: the rival employer's library says it is not available", async () => {
        await signIn(rival, OUTSIDER, library);
        const section = rival.getByTestId("beskt-method-support");
        await expect(section).toBeVisible({ timeout: 60_000 });
        await expect(section.getByTestId("beskt-method-support-badge")).toHaveText("BESKT");
        await expect(rival.getByTestId("beskt-method-support-empty")).toBeVisible({
          timeout: 60_000,
        });
        await shot(rival, "02-rival-before-sv");
      });

      await test.step("the platform admin admits the rival employer", async () => {
        await signIn(admin, ADMIN, `/admin/beskt-methods/${versionId}?tab=access`);
        const pilots = admin.getByTestId("beskt-pilot-grants");
        await expect(pilots).toBeVisible({ timeout: 60_000 });
        await pilots.getByRole("button", { name: /Anta en arbetsgivare/ }).click();
        await admin.locator("#beskt-pilot-employer").fill(rivalId);
        await admin.locator("#beskt-pilot-source").fill("SYNTETISKT pilotbeslut för genomgången");
        const expires = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
        await admin.locator("#beskt-pilot-expires").fill(expires);
        await pilots
          .locator("form")
          .getByRole("button", { name: /Anta en arbetsgivare/ })
          .click();
        await expect(admin.getByTestId(`beskt-pilot-${rivalId}`)).toBeVisible({ timeout: 60_000 });
        await shot(admin, "02-admin-granted-sv");
      });

      await test.step("during: the method appears, with its real next step", async () => {
        await rival.goto(library);
        await expect(rival.getByTestId("beskt-method-row").first()).toBeVisible({
          timeout: 60_000,
        });
        // The next step is the module's own: "Starta BESKT" opens the start
        // dialog, where the candidate is an application or an invitation.
        const next = rival.getByTestId("beskt-module");
        await expect(next.getByTestId("beskt-module-name")).toHaveText("BESKT");
        await expect(next.getByTestId("beskt-module-start")).toHaveText(/Starta BESKT/);
        await expectFitsViewport(rival);
        await shot(rival, "02-rival-during-sv");
        await useEnglish(rival);
        await expect(next.getByTestId("beskt-module-start")).toHaveText(/Start BESKT/);
        await shot(rival, "02-rival-during-en");
        await useSwedish(rival);
      });

      await test.step("the platform admin revokes, with a reason", async () => {
        const row = admin.getByTestId(`beskt-pilot-${rivalId}`);
        await row.getByRole("button", { name: /^Återkalla$/ }).click();
        await admin
          .getByLabel(/Anledning till återkallandet/)
          .fill("SYNTETISKT genomgången är klar");
        await row
          .getByRole("button", { name: /^Återkalla/ })
          .last()
          .click();
        await expect(row).toContainText(/Återkallad|Återkallat/, { timeout: 60_000 });
        await shot(admin, "02-admin-revoked-sv");
      });

      await test.step("after: the method is gone from the rival employer again", async () => {
        await rival.goto(library);
        await expect(rival.getByTestId("beskt-method-support-empty")).toBeVisible({
          timeout: 60_000,
        });
        await expect(rival.getByTestId("beskt-method-row")).toHaveCount(0);
        await shot(rival, "02-rival-after-sv");
      });
    } finally {
      await rivalContext.close();
      await adminContext.close();
    }
  });

  /* ---------------------------------------------------------------- 3 */
  test("3 · an editor who is not an admin creates a method on the governance surface", async ({
    page,
  }) => {
    await signIn(page, EDITOR, "/beskt-governance");
    await expect(page.getByTestId("beskt-governance-surface")).toBeVisible({ timeout: 60_000 });
    await shot(page, "03-editor-list-sv");

    await page.getByRole("link", { name: /Skapa en metod/ }).click();
    await expect(page).toHaveURL(/\/beskt-governance\/new$/);
    const slug = `syntetisk-genomgang-${Date.now()}`;
    await page.locator("#beskt-new-slug").fill(slug);
    await page.locator("#beskt-new-name-sv").fill("SYNTETISK metod skapad i genomgången");
    await page.locator("#beskt-new-purpose").fill("SYNTETISKT syfte för den lokala genomgången.");
    await page.locator("#beskt-new-source").fill("synthetic-governance-walk");
    await page.locator("#beskt-new-docver").fill("synthetic-1");
    await page.getByRole("button", { name: /Skapa metoden och dess första utkast/ }).click();

    await expect(page).toHaveURL(/\/beskt-governance\/[0-9a-f-]{36}/, { timeout: 60_000 });
    await expect(page.getByText(/SYNTETISK metod skapad i genomgången/).first()).toBeVisible();
    await shot(page, "03-editor-draft-sv");

    await page.goto(`${new URL(page.url()).pathname}?tab=lifecycle`);
    await expect(page.locator("body")).toContainText(
      /Innan innehållet kan lämnas till granskning/,
      { timeout: 60_000 },
    );
    await expect(page.locator("body")).not.toContainText(/Inget hindrar just nu/);
    // No admin-only tab on this surface.
    await expect(page.getByRole("link", { name: /^Behörigheter$/ })).toHaveCount(0);
    await expectFitsViewport(page);
    await shot(page, "03-editor-findings-sv");
  });

  /* ---------------------------------------------------------------- 4 */
  test("4 · a reviewer reads the surface, and the database refuses them publication", async ({
    page,
  }) => {
    const { versionId } = ids();
    await signIn(page, REVIEWER, "/beskt-governance");
    await expect(page.getByTestId("beskt-governance-surface")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole("link", { name: /Skapa en metod/ })).toHaveCount(0);

    await page.goto(`/beskt-governance/${versionId}?tab=lifecycle`);
    await expectFiveGatesApproved(page);
    await expect(page.getByRole("link", { name: /^Behörigheter$/ })).toHaveCount(0);
    await shot(page, "04-reviewer-gates-sv");

    const revision = Number(
      sql(`SELECT revision FROM public.beskt_method_versions WHERE id = '${versionId}'`),
    );
    const answer = await rpcAs(page, "beskt_suspend_version", {
      _operation_id: crypto.randomUUID(),
      _method_version_id: versionId,
      _expected_revision: revision,
      _reason: "SYNTETISKT försök",
    });
    expect(answer.status, answer.body.slice(0, 200)).toBeGreaterThanOrEqual(400);
    expect(answer.body).toMatch(/BESKT_[A-Z_]+|permission denied|42501/);
  });

  /* ---------------------------------------------------------------- 5 */
  test("5 · a candidate is refused the surface and a gate decision", async ({ page }) => {
    const { versionId } = ids();
    await signIn(page, CANDIDATE, "/beskt-governance");
    await expect(page.locator("body")).toContainText(/Ingen roll i BESKT-styrningen/, {
      timeout: 60_000,
    });
    await expect(page.locator("body")).not.toContainText(/SYNTETISK BESKT-metod/);
    await shot(page, "05-candidate-denied-sv");

    await page.goto("/admin/beskt-methods");
    await expect(page.locator("body")).toContainText(/Åtkomst nekad/, { timeout: 60_000 });

    const revision = Number(
      sql(`SELECT revision FROM public.beskt_method_versions WHERE id = '${versionId}'`),
    );
    const answer = await rpcAs(page, "beskt_record_review", {
      _operation_id: crypto.randomUUID(),
      _method_version_id: versionId,
      _expected_revision: revision,
      _gate: "data_protection",
      _decision: "approved",
      _rationale: "SYNTETISKT försök",
    });
    expect(answer.status, answer.body.slice(0, 200)).toBeGreaterThanOrEqual(400);
    expect(answer.body).toMatch(/BESKT_[A-Z_]+|permission denied|42501/);
    expect(
      sql(
        `SELECT count(*) FROM public.beskt_method_reviews WHERE method_version_id = '${versionId}' AND rationale = 'SYNTETISKT försök'`,
      ),
    ).toBe("0");
  });
});
