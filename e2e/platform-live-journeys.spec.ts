import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { chooseCredential } from "./support/credential-picker";
import { test, expect, type Page } from "@playwright/test";
import { horizontalOverflow } from "./support/public-entry-harness";
const root = "/private/tmp/cqrity-platform-ux-20261015";
const enabled = process.env.PLATFORM_UX_LIVE === "1";
test.skip(!enabled, "Requires the task-owned real local stack.");
if (enabled && process.env.E2E_BASE_URL !== "http://127.0.0.1:3170")
  throw Error("LOCAL_APP_REQUIRED");
const accounts = enabled ? JSON.parse(fs.readFileSync(`${root}/accounts.json`, "utf8")) : {};
test.use({ actionTimeout: 15_000 });
const evidence = "artifacts/platform-ux/live";
async function signIn(
  page: Page,
  role: string,
  lang: string,
  destination: string,
  requireTerms = false,
) {
  const external: string[] = [];
  await page.route("**/*", (route) => {
    const u = new URL(route.request().url());
    if (["127.0.0.1", "localhost"].includes(u.hostname) || u.protocol === "data:")
      return route.continue();
    external.push(u.origin);
    return route.abort();
  });
  await page.addInitScript((l) => localStorage.setItem("cqrityjob.lang", l), lang);
  await page.goto(`/login?redirect=${encodeURIComponent(destination)}`);
  await page
    .getByLabel(lang === "sv" ? "E-post" : "Email", { exact: true })
    .fill(accounts[role].email);
  await page
    .getByLabel(lang === "sv" ? "Lösenord" : "Password", { exact: true })
    .fill(accounts[role].password);
  await page
    .getByRole("button", { name: lang === "sv" ? "Logga in" : "Sign in", exact: true })
    .click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 });
  const gate = page.getByTestId("terms-acceptance-gate");
  if (requireTerms) await expect(gate).toBeVisible();
  if (await gate.isVisible()) {
    await expect(gate).toHaveAccessibleName(/.+/);
    await page.keyboard.press("Escape");
    await expect(gate).toBeVisible();
    for (let index = 0; index < 6; index++) {
      await page.keyboard.press("Tab");
      expect(await gate.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    await page.getByTestId("terms-gate-box").check();
    await page.getByTestId("terms-gate-continue").click();
    await expect(gate).toBeHidden();
  }
  return external;
}
for (const lang of ["sv", "en"]) {
  for (const [role, paths] of [
    [
      "candidate",
      [
        "/my-career",
        "/my-career/profile",
        "/my-career/cv",
        "/passport",
        "/my-career/applications",
        "/academy",
      ],
    ],
    [
      "employer",
      [
        "/employer/journey-ab",
        "/employer/journey-ab/jobs",
        "/employer/journey-ab/applications",
        "/employer/journey-ab/assessments",
        "/employer/journey-ab/interview-intelligence",
        "/employer/journey-ab/reports",
        "/employer/journey-ab/organisation",
        "/employer/journey-ab/settings",
      ],
    ],
    [
      "admin",
      [
        "/admin",
        "/admin/employers",
        "/admin/jobs",
        "/admin/applications",
        "/admin/passport-verification",
      ],
    ],
  ] as const) {
    test(`real ${role} workspace in ${lang}`, async ({ page }, info) => {
      test.setTimeout(150_000);
      const external = await signIn(page, role, lang, paths[0]);
      fs.mkdirSync(evidence, { recursive: true });
      for (const path of paths) {
        await page.goto(path, { waitUntil: "networkidle" });
        await expect(page.locator("h1").first()).toBeVisible({ timeout: 30_000 });
        await expect(page.locator("main")).not.toContainText(
          /permission denied for|relation .* does not exist|column .* does not exist|Sidan kunde inte laddas|Could not load this page/,
        );
        expect(await horizontalOverflow(page), path).toBeLessThanOrEqual(1);
        await page.screenshot({
          path: `${evidence}/${info.project.name}-${lang}-${path.slice(1).replaceAll("/", "-")}.png`,
        });
      }
      expect([...new Set(external)]).toEqual([]);
    });
  }
}

test("real profile edit, credential evidence and application persist", async ({ page }, info) => {
  test.setTimeout(180_000);
  // Each run uses a fresh synthetic owner, so real duplicate protections stay enabled.
  const status = JSON.parse(fs.readFileSync(root + "/status.json", "utf8"));
  if (status.API_URL !== "http://127.0.0.1:57721") throw Error("LOCAL_API_REQUIRED");
  const service = createClient(status.API_URL, status.SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const role = "journey-" + crypto.randomUUID();
  const email = role + "@example.test";
  const password = "LocalUx!" + crypto.randomUUID();
  const created = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { terms_version: "synthetic-older-version" },
  });
  expect(created.error).toBeNull();
  accounts[role] = { email, password, id: created.data.user!.id };
  await signIn(page, role, "en", "/my-career/profile", true);
  const name = page.locator("#sp-basics-identity-displayName");
  const displayName = "Synthetic UX Candidate " + Date.now();
  await name.fill(displayName);
  await page.locator("#sp-basics-identity-headline").fill("Synthetic security specialist");
  await name
    .locator("xpath=ancestor::section")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(
    name.locator("xpath=ancestor::section").getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await page.reload();
  await expect(name).toHaveValue(displayName);
  await page.locator("#sp-work-country").selectOption("GB");
  await page.getByRole("button", { name: "Save work country", exact: true }).click();
  await expect(page.getByRole("button", { name: "Save work country", exact: true })).toBeDisabled();
  await page.locator("#profile-residence-country").selectOption("SE");
  await page.getByRole("button", { name: "Save country of residence", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Save country of residence", exact: true }),
  ).toBeDisabled();
  await page.goto("/my-career/cv");
  await page.locator("[data-add-employment]").click();
  await page.locator("#exp-employer").fill("Synthetic Training AB");
  await page.locator("#exp-role").fill("Security specialist");
  await page.locator("#exp-country").selectOption("SE");
  await page.locator("#exp-start").fill("2024-01-01");
  await page.locator("#exp-ongoing").check();
  await page
    .locator("[data-cv-employment]")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(page.locator("[data-employment-row]")).toContainText("Synthetic Training AB");
  await page.goto("/my-career/cv/new");
  await page.getByRole("button", { name: "Preview CV", exact: true }).click();
  await page.getByRole("button", { name: "Save CV", exact: true }).click();
  await expect(page).toHaveURL(/\/my-career\/cv\/[a-f0-9-]+$/, { timeout: 30000 });
  await expect(page.locator("main")).toContainText("Synthetic Training AB");
  await page.screenshot({ path: evidence + "/" + info.project.name + "-real-saved-cv.png" });
  await page.goto("/passport");
  await page
    .locator("[data-credential-wallet]")
    .getByRole("link", { name: "Add a credential", exact: true })
    .click();
  await chooseCredential(
    page,
    info.project.name === "chromium" ? "INTL_ASIS_PCI" : "INTL_ISC2_CISSP",
    { search: info.project.name === "chromium" ? "PCI" : "CISSP" },
  );
  await page.getByLabel("Credential identifier (optional)").fill("SYNTHETIC-UX");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Save credential", exact: true }).click();
  await expect(page).toHaveURL(/\/passport\/entry\/claim\//, { timeout: 30000 });
  const pdf = Buffer.from(
    "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF",
  );
  await expect(page.locator("#sp-evidence-file")).toBeEnabled();
  await page
    .getByLabel("Add supporting evidence", { exact: true })
    .setInputFiles({ name: "synthetic-evidence.pdf", mimeType: "application/pdf", buffer: pdf });
  await expect(page.getByText("Document uploaded and saved.", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole("button", { name: "Request verification", exact: true }).click();
  await expect(page.getByRole("button", { name: "Withdraw request", exact: true })).toBeVisible({
    timeout: 30000,
  });
  const claimPath = new URL(page.url()).pathname;
  await page.screenshot({ path: evidence + "/" + info.project.name + "-real-evidence-review.png" });
  await page.goto("/jobs/jobbnav-sakerhetschef-stockholm");
  await page.getByRole("button", { name: "Apply for this job", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await page.setInputFiles("#apply-cv", {
    name: "synthetic-cv.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await page.getByLabel("Cover note", { exact: false }).fill("Synthetic isolated UX application.");
  await page.getByText("I consent to my application and CV being shared").click();
  await dialog.getByRole("button", { name: "Submit application", exact: true }).click();
  await expect(dialog.getByText("Application submitted", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  const historyHref = await dialog.getByRole("link", { name: /application/i }).getAttribute("href");
  const applicationId = new URL(historyHref!, page.url()).searchParams.get("application");
  expect(applicationId).toBeTruthy();
  await dialog.getByRole("link", { name: /application/i }).click();
  await expect(page.getByText("Head of security, Stockholm", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await page.goto("/jobs/jobbnav-sakerhetschef-stockholm");
  await expect(
    page.getByText("You already have an active application for this role.", { exact: true }),
  ).toBeVisible({ timeout: 30000 });
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await signIn(page, "employer", "en", "/employer/jobbnav-test/applications/" + applicationId);
  await page.getByRole("button", { name: "Mark as reviewing", exact: true }).last().click();
  await expect(page.getByRole("button", { name: "Mark as reviewing", exact: true })).toHaveCount(0);
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await signIn(page, role, "en", "/my-career/applications");
  await expect(page.getByText("Reviewing", { exact: true })).toBeVisible();
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await signIn(page, "reviewer", "en", "/passport-review");
  await page.locator("[data-vq-search]").fill(displayName);
  await page.getByRole("button", { name: "Open request", exact: true }).click();
  await page.locator('input[name="sp-decision"][value="clarification_requested"]').check();
  await page
    .locator("#sp-holder-message")
    .fill("Synthetic review: please attach the reverse side.");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Yes, record the decision", exact: true }).click();
  await expect(page.getByText("The decision has been recorded.", { exact: true })).toBeVisible();
  await page.context().clearCookies();
  await page.evaluate(() => localStorage.clear());
  await signIn(page, role, "en", claimPath);
  await expect(page.locator("main")).toContainText(
    "Synthetic review: please attach the reverse side.",
    { timeout: 30000 },
  );
});

for (const role of ["colleague", "outsider", "removed", "otherEmployer"]) {
  test("real tenant access: " + role, async ({ page }) => {
    await signIn(page, role, "en", "/employer/journey-ab");
    if (role === "colleague")
      await expect(page.locator("[data-employer-welcome]")).toContainText("Welcome");
    else
      await expect(
        page.getByRole("heading", { name: "Access not available", exact: true }),
      ).toBeVisible();
  });
}
test("dedicated reviewer cannot enter platform admin", async ({ page }) => {
  await signIn(page, "reviewer", "en", "/admin");
  await expect(page.getByRole("heading", { name: "Access denied", exact: true })).toBeVisible();
});

test("real employer saves and reopens a job draft", async ({ page }) => {
  await signIn(page, "employer", "en", "/employer/journey-ab/jobs/new");
  const title = "Synthetic UX draft " + Date.now();
  await page.locator("#job-title").fill(title);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/\/jobs\/[a-f0-9-]+\/edit/, { timeout: 30000 });
  await page.reload();
  await expect(page.locator("#job-title")).toHaveValue(title);
});

test("real profile preserves an unsaved edit when navigation is cancelled", async ({ page }) => {
  await signIn(page, "candidate", "en", "/my-career/profile");
  const field = page.locator("#sp-basics-identity-headline");
  const title = "Unsaved synthetic title " + Date.now();
  await field.fill(title);
  let warned = false;
  page.once("dialog", async (dialog) => {
    warned = true;
    await dialog.dismiss();
  });
  // Use the header's normal in-app navigation.
  const menu = page.getByRole("button", { name: "Open menu", exact: true });
  if (await menu.isVisible()) await menu.click();
  await page.locator('header a[href="/passport"]').filter({ visible: true }).first().click();
  await expect.poll(() => warned).toBe(true);
  await expect(field).toHaveValue(title);
  let left = false;
  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    left = true;
    await dialog.accept();
  });
  if (await menu.isVisible()) await menu.click();
  await page.locator('header a[href="/passport"]').filter({ visible: true }).first().click();
  await expect(page).toHaveURL(/\/passport$/);
  expect(left).toBe(true);
});

test("real admin member table keeps compact actions inside rows on desktop and mobile", async ({
  page,
}, info) => {
  await signIn(page, "admin", "en", "/admin/employers/9e000000-0000-4000-8000-00000000000a");
  const rows = page.getByTestId("admin-membership-row");
  await expect(rows).not.toHaveCount(0);
  const controls = rows.locator("button");
  expect(await controls.count()).toBeGreaterThan(0);
  const geometry = await controls.evaluateAll((buttons) =>
    buttons.map((b) => {
      const r = b.getBoundingClientRect(),
        c = b.closest("td")!.getBoundingClientRect();
      return { height: r.height, contained: r.top >= c.top - 1 && r.bottom <= c.bottom + 1 };
    }),
  );
  for (const control of geometry) {
    expect(control.contained).toBe(true);
    expect(control.height).toBeGreaterThanOrEqual(info.project.name === "chromium" ? 36 : 44);
  }
  const colleague = rows.filter({
    has: page.getByRole("cell", { name: "UX colleague", exact: true }),
  });
  await colleague.locator('button[data-action="role"]').click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog
    .locator('[data-slot="dialog-footer"]')
    .getByRole("button", { name: "Cancel", exact: true })
    .click();
  await expect(dialog).toBeHidden();
  const danger = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Account management", exact: true }) });
  const action = danger.getByRole("button", {
    name: "Delete this employer permanently",
    exact: true,
  });
  const actionBox = await action.boundingBox();
  const sectionBox = await danger.boundingBox();
  expect(actionBox!.width).toBeLessThanOrEqual(sectionBox!.width);
  const textWidth = await danger
    .locator("li > div")
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(textWidth).toBeGreaterThan(150);
  await danger.screenshot({ path: `${evidence}/admin-account-actions-${info.project.name}.png` });
  expect(await horizontalOverflow(page)).toBe(0);
  await page.screenshot({
    path: `${evidence}/admin-member-actions-${info.project.name}.png`,
    fullPage: true,
  });
});
