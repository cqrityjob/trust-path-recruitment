/** Synthetic same-document auth transitions; no real accounts or backend writes. */
import { test, expect, type Page } from "@playwright/test";
import { installJobsFixture, JOBS_FIXTURE } from "./support/jobs-fixture";
import {
  observeSupabaseStorageKey,
  plantSession,
  stubServerFn,
} from "./support/public-entry-harness";

const ACCOUNT_A = "10000000-0000-4000-8000-00000000000a";
const ACCOUNT_B = "10000000-0000-4000-8000-00000000000b";

async function switchAccount(page: Page, userId: string) {
  // Exercise the app's actual Supabase client and auth subscriptions, without
  // reloading the document (a reload would hide stale React form state).
  await page.evaluate(async (id) => {
    const clientPath = "/src/integrations/supabase/client.ts";
    const { supabase } = await import(/* @vite-ignore */ clientPath);
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const encode = (value: unknown) =>
      btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: id, exp, aud: "authenticated" })}.c3ludGhldGlj`;
    const { error } = await supabase.auth.setSession({
      access_token: token,
      refresh_token: "synthetic-refresh",
    });
    if (error) throw error;
  }, userId);
}

test("application drafts and live fields belong to their signed-in account", async ({ page }) => {
  await installJobsFixture(page, "en");
  const key = await observeSupabaseStorageKey(page);
  await plantSession(page, key);
  const fixture = await installJobsFixture(page, "en");
  await page.route("**/auth/v1/user**", async (route) => {
    const token =
      route
        .request()
        .headers()
        .authorization?.replace(/^Bearer /, "") ?? "";
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString());
    await route.fulfill({
      json: {
        id: payload.sub,
        aud: "authenticated",
        role: "authenticated",
        email: `${payload.sub}@example.test`,
      },
    });
  });
  for (const name of [
    "listMyApplications",
    "listMyEmployerWorkspaces",
    "listMyApplicationCvOptions",
  ])
    await stubServerFn(page, name, []);
  for (const name of ["countMyAcademyWork", "countMyReviewQueue"])
    await stubServerFn(page, name, 0);
  await stubServerFn(page, "getApplicationPassportOffer", {
    hasPassport: true,
    hasShareableContent: false,
    verifiedCredentials: [],
    verifiedCredentialCount: 0,
    verifiedExperienceCount: 0,
  });
  await stubServerFn(page, "getMyAccessContext", {
    isAuthenticated: true,
    isCandidate: true,
    memberships: [],
  });
  const job = JOBS_FIXTURE[0];
  await page.goto("/jobs");
  await switchAccount(page, ACCOUNT_A);
  await page.getByRole("link", { name: job.title_en, exact: true }).first().click();
  const ownPage = page.getByRole("link", { name: "Open job on its own page" });
  if (await ownPage.isVisible()) await ownPage.click();
  await expect(page.locator("article[data-job-detail]")).toBeVisible();
  await page.evaluate(
    (jobId) =>
      sessionStorage.setItem(
        `cqj.apply-draft.${jobId}`,
        JSON.stringify({ phone: "LEGACY-UNKNOWN-OWNER" }),
      ),
    job.id,
  );
  const open = () =>
    page
      .locator("article[data-job-detail]")
      .getByRole("button", { name: "Apply for this job", exact: true })
      .click();
  await open();
  const dialog = page.getByRole("dialog");
  await expect(dialog.locator("#apply-phone")).toHaveValue("");
  await dialog.locator("#apply-phone").fill("0701111111");
  await dialog.locator("#apply-cover-note").fill("Private draft belonging to account A");
  await expect
    .poll(() =>
      page.evaluate(
        ([id, jobId]) =>
          JSON.parse(sessionStorage.getItem(`cqj.apply-draft.${id}.${jobId}`) ?? "{}").coverNote,
        [ACCOUNT_A, job.id],
      ),
    )
    .toBe("Private draft belonging to account A");
  await switchAccount(page, ACCOUNT_B);
  await expect(dialog).not.toBeVisible();
  await open();
  await expect(dialog.locator("#apply-phone")).toHaveValue("");
  await expect(dialog.locator("#apply-cover-note")).toHaveValue("");
  await dialog.locator("#apply-cover-note").fill("Private draft belonging to account B");
  await expect
    .poll(() =>
      page.evaluate(
        ([id, jobId]) =>
          JSON.parse(sessionStorage.getItem(`cqj.apply-draft.${id}.${jobId}`) ?? "{}").coverNote,
        [ACCOUNT_B, job.id],
      ),
    )
    .toBe("Private draft belonging to account B");
  await switchAccount(page, ACCOUNT_A);
  await expect(dialog).not.toBeVisible();
  await open();
  await expect(dialog.locator("#apply-phone")).toHaveValue("0701111111");
  await expect(dialog.locator("#apply-cover-note")).toHaveValue(
    "Private draft belonging to account A",
  );
  fixture.assertClean();
});
