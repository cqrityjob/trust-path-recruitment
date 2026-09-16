/** Real GoTrue + PostgREST + Storage + Edge gateway, with no response fixtures.
 * Run scripts/passport-live-local-check.mjs first against the disposable stack.
 * The local Edge PUBLIC_SITE_URL must be https://127.0.0.1:3120.
 */
import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { createClient, type Session } from "@supabase/supabase-js";

test.skip(
  process.env.PASSPORT_LIVE_LOCAL !== "1",
  "Explicit disposable local-stack opt-in required",
);
test.use({ ignoreHTTPSErrors: true, actionTimeout: 15_000 });

test("real owner adds and selectively shares a credential, recipient loses access on revocation", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const base = process.env.E2E_BASE_URL;
  expect(base).toBe("https://127.0.0.1:3120");
  const owner = (
    JSON.parse(readFileSync("/private/tmp/passport-phase2-users.json", "utf8")) as Record<
      string,
      { id: string; session: Session }
    >
  ).owner;
  const values = Object.fromEntries(
    readFileSync("/private/tmp/passport-phase2-status.env", "utf8")
      .split("\n")
      .filter((v) => v.includes("="))
      .map((v) => {
        const i = v.indexOf("=");
        return [v.slice(0, i), JSON.parse(v.slice(i + 1)) as string];
      }),
  );
  expect(values.API_URL).toBe("http://127.0.0.1:55421");
  const db = createClient(values.API_URL, values.ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${owner.session.access_token}` } },
    auth: { persistSession: false },
  });
  await page.addInitScript((session) => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
    localStorage.setItem("cqrityjob.lang", "en");
  }, owner.session);
  const external: string[] = [];
  // Reject unexpected external transport; never substitute responses.
  await page.route("**/*", async (route) => {
    const hostname = new URL(route.request().url()).hostname;
    if (hostname !== "127.0.0.1" && hostname !== "localhost") {
      external.push(hostname);
      return route.abort();
    }
    return route.continue();
  });
  await page.goto(`${base}/passport`);
  await expect(page.locator("[data-credential-wallet]")).toContainText("Local Profile Title", {
    timeout: 30_000,
  });
  await expect(page.locator("main")).not.toContainText("PRIVATE CV ONLY");
  const definitionCodes = {
    chromium: "INTL_ASIS_PCI",
    "mobile-375": "INTL_ISC2_CISSP",
    "mobile-390": "INTL_ISACA_CISM",
  };
  const code = definitionCodes[testInfo.project.name as keyof typeof definitionCodes];
  await page
    .locator("[data-credential-wallet]")
    .getByRole("link", { name: "Add credential", exact: true })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const selector = page.getByLabel("Approved credential");
  await selector.selectOption(code);
  const title = (await selector.locator(`option[value="${code}"]`).textContent())!.split(" — ")[0];
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Original credential name", { exact: true })).toHaveCount(0);
  await page.getByLabel("Credential identifier (optional)").fill("BROWSER-OPTIONAL");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Save credential", exact: true }).click();
  await expect(page).toHaveURL(/\/passport\/entry\/claim\//, { timeout: 30_000 });
  await expect(page.locator("main")).toContainText(title);
  const claimId = new URL(page.url()).pathname.split("/").pop()!;
  await page.goto(`${base}/passport/share`);
  const selection = page.locator(`[data-merit-option="claim:${claimId}"]`);
  await selection.locator('input[type="checkbox"]').check();
  await expect(page.getByLabel("My name (subject to privacy settings)")).not.toBeChecked();
  await expect(page.getByLabel("Credential identifiers", { exact: true })).not.toBeChecked();
  await page.getByLabel("Credential identifiers", { exact: true }).check();
  await page.locator('input[name="sel-expiry"][value="7"]').check();
  await page.locator("[data-share-cta]").click();
  await expect(page.locator("[data-share-created]")).toBeVisible({ timeout: 30_000 });
  const link = await page.locator("[data-share-link]").inputValue();
  const gateway = new URL(link);
  expect(gateway.origin).toBe(values.API_URL);
  expect(gateway.pathname).toBe("/functions/v1/passport-share");
  const recipientContext = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: testInfo.project.use.viewport,
  });
  try {
    const recipient = await recipientContext.newPage();
    await recipient.addInitScript(() => localStorage.setItem("cqrityjob.lang", "en"));
    await recipient.route("**/*", async (route) => {
      const host = new URL(route.request().url()).hostname;
      if (!["127.0.0.1", "localhost"].includes(host)) {
        external.push(host);
        return route.abort();
      }
      return route.continue();
    });
    await recipient.goto(link);
    await expect(recipient).toHaveURL(/\/p\/[0-9a-f]{32}$/, { timeout: 30_000 });
    await expect(recipient.locator("main")).toContainText(title, { timeout: 30_000 });
    await expect(recipient.locator("main")).toContainText("BROWSER-OPTIONAL");
    await expect(recipient.locator("main")).not.toContainText("Local Profile Title");
    await expect(recipient.locator("main")).not.toContainText("PRIVATE CV ONLY");
    await expect(recipient.locator("main")).not.toContainText("Local Permit Beta");
    await expect(recipient.locator("main")).not.toContainText("Local Passport Owner");
    expect(new URL(recipient.url()).hash).toBe("");
    const shares = await db
      .from("sp_disclosures")
      .select("id")
      .eq("holder_user_id", owner.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(shares.error).toBeNull();
    await page.goto(`${base}/passport/share`);
    await page.locator(`[data-share-revoke="${shares.data!.id}"]`).click();
    await expect(page.locator(`[data-share-row="${shares.data!.id}"]`)).toHaveAttribute(
      "data-share-state",
      "revoked",
    );
    await recipient.reload();
    await expect(recipient.locator("main")).not.toContainText(title);
    await expect(recipient.locator("main")).toContainText("The link may have expired", {
      timeout: 30_000,
    });
    expect(
      await recipient.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
  } finally {
    await recipientContext.close();
  }
  const changed = await db
    .from("security_career_profiles")
    .update({ current_profession_other: "Updated local Profile title" })
    .eq("user_id", owner.id);
  expect(changed.error).toBeNull();
  await page.goto(`${base}/passport`);
  await expect(page.locator("[data-credential-wallet]")).toContainText(
    "Updated local Profile title",
    { timeout: 30_000 },
  );
  await db
    .from("security_career_profiles")
    .update({ current_profession_other: "Local Profile Title" })
    .eq("user_id", owner.id);
  expect(external).toEqual([]);
});
