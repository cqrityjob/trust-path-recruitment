/** Local-only proof using ordinary seeded users, real Auth/RLS and transport.
 * Failure injection removes one synthetic recipient's email, then restores it.
 * No production calls, mocked permissions, assigned-version rewrites or email provider.
 */
import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
const BASE = process.env.E2E_BASE_URL ?? "",
  DB = process.env.JOURNEY_DATABASE_URL ?? "";
test.skip(
  process.env.E2E_LOCAL_STACK !== "1" ||
    !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(BASE) ||
    !/^postgresql:\/\/[^@]+@(127\.0\.0\.1|localhost):\d+\/beskt_e2e$/.test(DB),
  "Isolated loopback stack only",
);
test.describe.configure({ mode: "serial", timeout: 120000 });
const ORG = "nordvakt-sakerhet",
  PREFIX = `/employer/${ORG}`;
const APP = "a6000000-0000-4000-8000-000000000001",
  APP2 = "a6000000-0000-4000-8000-000000000002";
const JOB = "44444444-dddd-4000-8000-000000000004";
function sql(q: string) {
  return execFileSync("psql", [DB, "-tAq", "-v", "ON_ERROR_STOP=1", "-c", q], {
    encoding: "utf8",
  }).trim();
}
async function login(page: Page, email: string, destination: string, lang = "sv") {
  await page.addInitScript((v) => localStorage.setItem("cqrityjob.lang", v), lang);
  await page.goto(`${BASE}/login?redirect=${encodeURIComponent(destination)}`);
  await page.getByLabel(/^e-?post$|^email$/i).fill(email);
  await page.getByLabel(/^lösenord$|^password$/i).fill("LocalJourney!2026");
  await page.getByRole("button", { name: /^logga in$|^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}
async function shot(page: Page, name: string) {
  await page.screenshot({
    path: `artifacts/assessment-dispatch/${name}.png`,
    fullPage: !name.startsWith("confirmation"),
  });
}
for (const lang of ["sv", "en"]) {
  test(`bank, overview, application and mobile entry points (${lang})`, async ({ page }, info) => {
    await login(page, "anna.agare@nordvakt.test", `${PREFIX}/assessments/library`, lang);
    await expect(page.getByTestId("test-bank")).toBeVisible();
    await expect(page.getByTestId("test-bank")).toContainText(/Pilot/);
    await shot(page, `bank-${lang}-${info.project.name}`);
    await page.getByTestId("send-test-entry").first().click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("combobox").selectOption(JOB);
    await dialog.getByRole("checkbox").nth(4).check();
    await dialog.getByRole("button", { name: /Välj test|Choose test/ }).click();
    await expect(page.getByTestId("send-test-dialog")).toBeVisible();
    await expect(page.getByTestId("send-test-recipient")).not.toHaveText("");
    await page.locator('input[type="date"]').fill("2030-01-31");
    await page.getByTestId("send-test-submit").click();
    await expect(page.getByTestId("send-test-confirmation")).toContainText(/Uppsala/);
    await expect(page.getByTestId("send-test-confirmation")).toContainText("2030-01-31");
    await shot(page, `confirmation-${lang}-${info.project.name}`);
    await page.getByRole("button", { name: /^Avbryt$|^Cancel$/ }).click();
    await page.goto(`${BASE}${PREFIX}/assessments`);
    await page.getByTestId("send-test-entry").click();
    await expect(page.getByRole("dialog").getByRole("combobox")).toBeVisible();
    await page.keyboard.press("Escape");
    await page.goto(`${BASE}${PREFIX}/applications/${APP}`);
    await page.getByTestId("send-test-top").click();
    await expect(page.getByTestId("send-test-recipient")).toContainText("Alva");
    await page.keyboard.press("Escape");
    await page.goto(`${BASE}${PREFIX}/jobs/${JOB}`);
    await expect(page.getByTestId("send-test-bulk")).toBeDisabled();
    await expect(
      page.getByText(
        lang === "sv" ? "Markera minst en kandidat först" : "Select at least one candidate first",
      ),
    ).toBeVisible();
    const row = page
      .getByTestId(info.project.name === "chromium" ? "send-test" : "send-test-mobile")
      .first();
    await row.click();
    await expect(page.getByTestId("send-test-dialog")).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
}
test("member sees action and access explanation; direct assignment still denied", async ({
  page,
}, info) => {
  await login(page, "mats.medlem@nordvakt.test", `${PREFIX}/assessments/library`);
  await page.getByTestId("send-test-entry").first().click();
  await expect(page.getByRole("dialog")).toContainText(/ägar- eller administratörsbehörighet/);
  await expect(page.getByTestId("send-test-submit")).toHaveCount(0);
  await shot(page, `member-${info.project.name}`);
  const api = process.env.E2E_SUPABASE_URL!;
  expect(api).toMatch(/^http:\/\/(127\.0\.0\.1|localhost):\d+$/);
  const apikey = process.env.E2E_SUPABASE_ANON_KEY!;
  const auth = await fetch(`${api}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey, "content-type": "application/json" },
    body: JSON.stringify({ email: "mats.medlem@nordvakt.test", password: "LocalJourney!2026" }),
  });
  expect(auth.ok).toBe(true);
  const token = (await auth.json()).access_token;
  const version = sql(
    "SELECT v.id FROM scp_assessment_versions v JOIN scp_assessment_definitions d ON d.id=v.definition_id WHERE d.slug='security-officer-recruitment' AND version_number=1",
  );
  const denied = await fetch(`${api}/rest/v1/rpc/scp_assign_from_application`, {
    method: "POST",
    headers: { apikey, Authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      _employer_id: "11111111-aaaa-4000-8000-000000000001",
      _application_id: APP,
      _assessment_version_id: version,
    }),
  });
  expect(denied.status).toBe(403);
  expect(await denied.text()).toContain("SCP_NOT_AUTHORISED_TO_ASSIGN");
});
test("batch partial failure, retry, no interview, selection retained", async ({ page }, info) => {
  test.skip(info.project.name !== "chromium", "one mutation run; responsive views covered above");
  const before = sql("SELECT count(*) FROM scp_interview_cases");
  await login(page, "anna.agare@nordvakt.test", `${PREFIX}/jobs/${JOB}`);
  for (const app of [APP, APP2])
    await page
      .locator("tr")
      .filter({ has: page.locator(`[data-application-id="${app}"]`) })
      .getByRole("checkbox")
      .check();
  await page.getByTestId("send-test-bulk").click();
  await expect(page.getByTestId("send-test-recipient")).toContainText("Alva");
  await page.getByTestId("send-test-submit").click();
  await expect(page.getByTestId("send-test-confirmation")).toContainText(/Alva/);
  const email = sql("SELECT email FROM auth.users WHERE id='a5000000-0000-4000-8000-000000000002'");
  sql("UPDATE auth.users SET email=NULL WHERE id='a5000000-0000-4000-8000-000000000002'");
  try {
    await page.getByTestId("send-test-submit").click();
    const retry = page.getByRole("button", { name: /Försök igen för misslyckade/ });
    await expect(retry).toBeEnabled({ timeout: 60000 });
    expect(
      sql(
        `SELECT count(*) FROM assessment_assignments WHERE application_id IN ('${APP}','${APP2}')`,
      ),
    ).toBe("1");
    await shot(page, "batch-partial-failure");
  } finally {
    sql(
      `UPDATE auth.users SET email='${email.replaceAll("'", "''")}' WHERE id='a5000000-0000-4000-8000-000000000002'`,
    );
  }
  await page.getByRole("button", { name: /Försök igen för misslyckade/ }).click();
  await expect
    .poll(() =>
      sql(
        `SELECT count(*) FROM assessment_assignments WHERE application_id IN ('${APP}','${APP2}')`,
      ),
    )
    .toBe("2");
  await expect(page.getByRole("button", { name: /Försök igen för misslyckade/ })).toHaveCount(0);
  await expect(page.getByTestId("send-test-dialog")).toContainText(
    /inte konfigurerad|inte aktiverad|inte konfigurerat/,
  );
  await shot(page, "batch-complete");
  await page.getByRole("button", { name: /^Stäng$/ }).click();
  expect(await page.locator('tr input[type="checkbox"]:checked').count()).toBe(2);
  expect(sql("SELECT count(*) FROM scp_interview_cases")).toBe(before);
  await page.reload();
  await expect(page.locator("main")).toContainText(/Test pågår|Test tilldelat/);
});
