import { test, expect, type APIRequestContext } from "@playwright/test";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
const enabled = process.env.PLATFORM_UX_LIVE === "1";
test.skip(!enabled, "Requires the task-owned local Auth and mail catcher.");
if (enabled && process.env.E2E_BASE_URL !== "http://127.0.0.1:3170")
  throw Error("LOCAL_APP_REQUIRED");
test.use({ actionTimeout: 15000 });
async function emailLink(request: APIRequestContext, email: string, type: string) {
  let link = "";
  await expect
    .poll(
      async () => {
        const listing = await (await request.get("http://127.0.0.1:57724/api/v1/messages")).json();
        for (const message of listing.messages ?? []) {
          if (!message.To?.some((to: { Address: string }) => to.Address === email)) continue;
          const content = await (
            await request.get("http://127.0.0.1:57724/api/v1/message/" + message.ID)
          ).json();
          const urls = (content.HTML ?? content.Text ?? "").match(/https?:[^\s"<>]+/g) ?? [];
          link =
            urls
              .map((url: string) => url.replaceAll("&amp;", "&"))
              .find((url: string) => url.includes("type=" + type)) ?? "";
          if (link) return true;
        }
        return false;
      },
      { timeout: 30000 },
    )
    .toBe(true);
  expect(new URL(link).origin).toBe("http://127.0.0.1:57721");
  return link;
}
test("real signup, local email confirmation and password recovery", async ({ page, request }) => {
  test.setTimeout(120000);
  const email = "signup-" + crypto.randomUUID() + "@example.test";
  const password = "LocalUx!" + crypto.randomUUID();
  await page.route("**/*", (route) =>
    ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  );
  await page.addInitScript(() => localStorage.setItem("cqrityjob.lang", "en"));
  await page.goto("/signup");
  await page.locator('input[name="name"]').fill("Synthetic Signup Candidate");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByTestId("signup-terms").check();
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByTestId("auth-awaiting-confirmation")).toBeVisible({ timeout: 30000 });
  await page.goto(await emailLink(request, email, "signup"));
  await expect(page).toHaveURL(/\/my-career/, { timeout: 30000 });
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByRole("button", { name: "Forgot password?", exact: true }).click();
  await expect(
    page.getByText("If that address is in our system, we've sent a reset link.", { exact: true }),
  ).toBeVisible();
  await page.goto(await emailLink(request, email, "recovery"));
  await page.getByLabel("New password", { exact: true }).fill(password + "New");
  await page.getByLabel("Confirm new password", { exact: true }).fill(password + "New");
  await page.getByRole("button", { name: "Update password", exact: true }).click();
  await expect(page).toHaveURL(/\/my-career/, { timeout: 30000 });
  const status = JSON.parse(
    fs.readFileSync("/private/tmp/cqrity-platform-ux-20261015/status.json", "utf8"),
  );
  if (status.API_URL !== "http://127.0.0.1:57721") throw Error("LOCAL_API_REQUIRED");
  const client = createClient(status.API_URL, status.ANON_KEY, { auth: { persistSession: false } });
  expect((await client.auth.signInWithPassword({ email, password })).error).not.toBeNull();
  expect(
    (await client.auth.signInWithPassword({ email, password: password + "New" })).error,
  ).toBeNull();
});
