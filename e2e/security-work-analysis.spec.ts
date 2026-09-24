/** Real local auth/storage/parser/database journey. No private references or live AI calls. */
import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { reportSections } from "../src/lib/security-work/analysis-model";

test.skip(process.env.E2E_LOCAL_STACK !== "1", "Owned disposable Supabase stack required");
test.describe.configure({ mode: "serial", timeout: 240_000 });
test.use({ actionTimeout: 20_000 });
const out = process.env.SW_ANALYSIS_EVIDENCE_DIR ?? "/private/tmp/sw-analysis-unpublished";
const evidence =
  "Synthetic access route is blocked during maintenance. Existing backup arrangements are unknown.";
function pdf() {
  const stream = `BT /F1 12 Tf 40 700 Td (${evidence}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 900 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
  ];
  let value = "%PDF-1.7\n";
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(value));
    value += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(value);
  value += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((o) => `${String(o).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(value);
}
async function login(page: Page, email: string, path: string) {
  await page.goto(`/login?redirect=${encodeURIComponent(path)}`);
  await page.getByLabel(/^e-?post$|^email$/i).fill(email);
  await page.getByLabel(/^lösenord$|^password$/i).fill("LocalJourney!2026");
  await page.getByRole("button", { name: /^logga in$|^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60000 });
}
async function client(page: Page) {
  const token = await page.evaluate(
    () =>
      Object.entries(localStorage)
        .filter(([key]) => /^sb-.*-auth-token$/.test(key))
        .map(([, value]) => JSON.parse(value).access_token)[0],
  );
  return createClient(process.env.SW_API_URL!, process.env.SW_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
async function shot(page: Page, locale: string, stage: string) {
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  mkdirSync(out, { recursive: true });
  if (stage === "navigation") {
    await page
      .locator("[data-candidate-app-nav]")
      .filter({ visible: true })
      .screenshot({
        path: `${out}/${test.info().project.name}-${locale}-${stage}.png`,
        scale: "css",
      });
    return;
  }
  await page.screenshot({
    path: `${out}/${test.info().project.name}-${locale}-${stage}.png`,
    fullPage: true,
    scale: "css",
  });
}
for (const locale of ["sv", "en"] as const) {
  test(`[${locale}] RSA document to immutable report and action follow-up`, async ({ page }) => {
    for (const value of [
      process.env.E2E_BASE_URL,
      process.env.SW_API_URL,
      process.env.SW_DATABASE_URL,
    ])
      expect(["127.0.0.1", "localhost"]).toContain(new URL(value!).hostname);
    expect(existsSync(`${process.env.SW_BROWSER_STATE_DIR}/owned-stack`)).toBe(true);
    const l = (sv: string, en: string) => (locale === "sv" ? sv : en);
    const address = `sw-${test.info().project.name}-${locale}-ordinary${process.env.SW_BROWSER_RUN_ID ? `-${process.env.SW_BROWSER_RUN_ID}` : ""}@example.test`;
    await login(page, address, "/my-career");
    await page.getByRole("button", { name: locale, exact: true }).first().click();
    const desktopNav = page.locator('[data-candidate-app-nav="desktop"]');
    await expect(desktopNav).toBeAttached();
    if (page.viewportSize()!.width < 1280)
      await page.getByRole("button", { name: /Öppna meny|Open menu/i }).click();
    const navigation = page.locator("[data-candidate-app-nav]").filter({ visible: true });
    await expect(navigation.locator("a")).toHaveCount(7);
    expect(
      await navigation
        .locator("a")
        .evaluateAll((links) => links.map((link) => link.getAttribute("href"))),
    ).toEqual([
      "/my-career",
      "/passport",
      "/security-work",
      "/my-career/cv",
      "/jobs",
      "/career-center",
      "/academy",
    ]);
    await shot(page, locale, "navigation");
    await navigation.locator('a[href="/security-work"]').click();
    await page.getByTestId("sw-workspace-name").fill(`Synthetic RSA ${locale}`);
    await page.getByTestId("sw-create-workspace").click();
    await page.waitForURL(/\/security-work\/[a-f0-9-]+\/settings/);
    const workspace = /\/security-work\/([a-f0-9-]+)/.exec(page.url())![1];
    await page.goto(`/security-work/${workspace}/analyses?new=true`);
    await page.getByLabel(l("Namn", "Title"), { exact: true }).fill("Synthetic maintenance RSA");
    await page
      .getByLabel(
        l(
          "Syfte och beslut som analysen ska stödja",
          "Purpose and decisions this analysis should support",
        ),
      )
      .fill("Decide whether an alternative access route needs verification.");
    await page
      .getByLabel(l("Omfattning och avgränsningar", "Scope and boundaries"))
      .fill("Synthetic reception access only.");
    await page
      .getByLabel(l("Tidshorisont", "Time horizon"), { exact: true })
      .fill("Synthetic maintenance period, 1–5 October.");
    await page
      .getByRole("button", { name: l("Skapa och fortsätt", "Create and continue") })
      .click();
    await page.waitForURL(/\/analyses\/[a-f0-9-]+$/);
    const analysisUrl = page.url();
    const analysisId = analysisUrl.split("/").pop()!;
    await page
      .getByRole("button", { name: `2. ${l("Underlag", "Evidence")}`, exact: true })
      .click();
    await page.locator('input[type="file"]').setInputFiles({
      name: "synthetic-evidence.pdf",
      mimeType: "application/pdf",
      buffer: pdf(),
    });
    await page
      .getByRole("button", { name: l("Ladda upp och extrahera", "Upload and extract") })
      .click();
    await expect(
      page.getByText(l("Texten är extraherad.", "Text extracted."), { exact: false }),
    ).toBeVisible({ timeout: 45000 });
    await page.getByText(l("Läs källtext", "Read source text"), { exact: true }).click();
    await expect(page.getByText(evidence, { exact: true })).toBeVisible();
    await expect(page.getByText(/page 1/)).toBeVisible();
    await page
      .getByRole("button", {
        name: l("Granskat — använd i analysen", "Reviewed — use in analysis"),
      })
      .click();
    await expect(page.getByText(l("Accepterad", "Accepted"), { exact: true })).toBeVisible();
    await shot(page, locale, "evidence");
    await page
      .getByRole("button", { name: `3. ${l("Komplettera", "Follow-ups")}`, exact: true })
      .click();
    await page
      .getByLabel(
        l(
          "Svar — skriv okänt när uppgiften saknas",
          "Answer — write unknown when information is missing",
        ),
      )
      .fill("Unknown: no backup-route verification has been supplied.");
    await page.getByRole("button", { name: l("Spara svar", "Save answer") }).click();
    await expect(
      page.getByLabel(
        l(
          "Svar — skriv okänt när uppgiften saknas",
          "Answer — write unknown when information is missing",
        ),
      ),
    ).toHaveValue("Unknown: no backup-route verification has been supplied.");
    await page
      .getByRole("button", { name: `4. ${l("Bedömning", "Assessment")}`, exact: true })
      .click();
    await expect(
      page.getByText(
        l("AI är inte aktiverat för arbetsytan.", "AI is not activated for this workspace."),
        { exact: false },
      ),
    ).toBeVisible();
    await page
      .getByLabel(l("Professionell slutsats", "Professional conclusion"))
      .fill("Verify the alternative route before making an operational decision.");
    await page
      .getByLabel(l("Osäkerhet, luckor och motsägelser", "Uncertainty, gaps and contradictions"))
      .fill("Backup arrangements remain unknown.");
    await page.getByRole("button", { name: l("Spara ändringar", "Save changes") }).click();
    await expect(
      page.getByText(l("Sparat", "Saved"), { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: l("Lägg till risk", "Add risk") }).click();
    await page
      .getByLabel(l("Riskhändelse", "Risk event"), { exact: true })
      .fill("Synthetic access disruption");
    await expect(page.getByLabel(l("Sannolikhet", "Likelihood"), { exact: true })).toBeDisabled();
    await page.getByRole("button", { name: l("Spara riskförslag", "Save risk proposal") }).click();
    await expect(page.getByText("Synthetic access disruption", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: l("Lägg till åtgärd", "Add action") }).click();
    await page
      .getByLabel(l("Åtgärd", "Action"), { exact: true })
      .fill("Verify synthetic alternative route");
    await page
      .getByLabel(l("Ansvarig", "Owner"), { exact: true })
      .selectOption({ label: l("Jag", "Me") });
    await page.getByRole("button", { name: l("Spara åtgärd", "Save action") }).click();
    const cite = async () => {
      await page
        .getByLabel(l("Granskat underlag", "Reviewed evidence"), { exact: true })
        .selectOption({ label: "synthetic-evidence.pdf" });
      await page
        .getByLabel(
          l("Påstående i analysen eller rapporten", "Statement in the analysis or report"),
        )
        .fill("The synthetic route is blocked during maintenance.");
      await page
        .getByLabel(
          l("Exakt utdrag som stöder påståendet", "Exact extract supporting the statement"),
        )
        .fill(evidence);
      await page.getByRole("button", { name: l("Spara källhänvisning", "Save citation") }).click();
      await expect(
        page.getByLabel(
          l("Exakt utdrag som stöder påståendet", "Exact extract supporting the statement"),
        ),
      ).toHaveValue("");
    };
    await cite();
    await shot(page, locale, "analysis");
    await page.reload();
    await page
      .getByRole("button", { name: `4. ${l("Bedömning", "Assessment")}`, exact: true })
      .click();
    await expect(
      page.getByLabel(l("Professionell slutsats", "Professional conclusion")),
    ).toHaveValue("Verify the alternative route before making an operational decision.");
    await page.getByRole("button", { name: `5. ${l("Rapport", "Report")}`, exact: true }).click();
    await page
      .getByRole("button", { name: l("Skapa rapportutkast", "Create report draft") })
      .click();
    await page.waitForURL(/\/reports\/[a-f0-9-]+$/);
    const reportUrl = page.url();
    const reportId = reportUrl.split("/").pop()!;
    for (const [key, sv, en] of reportSections.rsa)
      await page
        .getByLabel(l(sv, en), { exact: true })
        .fill(`Synthetic ${key}: evidence reviewed; uncertainty remains explicit.`);
    await page.getByRole("button", { name: l("Spara rapportutkast", "Save report draft") }).click();
    await expect(
      page.getByText(l("Sparat", "Saved"), { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await cite();
    await page
      .getByRole("button", {
        name: l("Granska version inför godkännande", "Review version for approval"),
      })
      .click();
    await expect(page.getByTestId("sw-report-content")).toBeVisible();
    await shot(page, locale, "report-review");
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: l("Godkänn rapportversion", "Approve report version") })
      .click();
    await expect(
      page.getByText(
        l("Denna godkända version är oföränderlig.", "This approved version is immutable."),
        { exact: false },
      ),
    ).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: /Exportera rapport|Export report/ }).click();
    const file = await download;
    const path = await file.path();
    expect(path).not.toBeNull();
    const html = readFileSync(path!, "utf8");
    expect(html).toContain(evidence);
    expect(html).toContain("SHA-256");
    expect(html).not.toContain("<script");
    const db = await client(page);
    const frozen = await db.from("sw_reports").update({ title: "tamper" }).eq("id", reportId);
    expect(frozen.error).not.toBeNull();
    const risk = await db
      .from("sw_risks")
      .select("likelihood,consequence")
      .eq("assessment_id", analysisId)
      .single();
    expect(risk.data).toEqual({ likelihood: null, consequence: null });
    await shot(page, locale, "report-approved");
    await page.goto(`/security-work/${workspace}/risks`);
    await page.getByRole("button", { name: l("Följ upp", "Follow up"), exact: true }).click();
    await page.getByLabel("Status", { exact: true }).selectOption("completed");
    await page
      .getByLabel(l("Beslutsmotivering", "Decision rationale"))
      .fill("Synthetic route inspected.");
    await page
      .getByLabel(l("Underlag som visar att åtgärden är slutförd", "Evidence of completion"))
      .fill("Synthetic local inspection record.");
    await page.getByRole("button", { name: l("Spara åtgärd", "Save action") }).click();
    await expect(
      page.getByText(l("Slutförd", "Completed"), { exact: true }).filter({ visible: true }),
    ).toBeVisible();
    await page.goto(reportUrl);
    await expect(
      page.getByTestId("sw-report-content").getByText(l("Öppen", "Open"), { exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: /Konto och inställningar|Account and settings/i })
      .click();
    await page.getByRole("menuitem", { name: /^logga ut$|^sign out$/i }).click();
    await login(page, address, new URL(reportUrl).pathname);
    await expect(page.getByTestId("sw-report-content")).toBeVisible();
    await page.goto(`/security-work/${workspace}/sources`);
    await expect(page.getByText("synthetic-evidence.pdf", { exact: true })).toBeVisible();
    await shot(page, locale, "sources");
    await page.goto(`/security-work/${workspace}`);
    await expect(
      page.getByRole("link", { name: /^Synthetic maintenance RSA/ }).first(),
    ).toBeVisible();
    await shot(page, locale, "overview");
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement !== document.body)).toBe(true);
  });
}
