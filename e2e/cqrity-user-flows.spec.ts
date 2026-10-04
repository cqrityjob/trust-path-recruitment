/** F06–F08: synthetic, network-isolated UI evidence; not database evidence. */
import { test, expect } from "@playwright/test";
import { installJobsFixture, JOBS_FIXTURE } from "./support/jobs-fixture";
import {
  observeSupabaseStorageKey,
  plantSession,
  stubServerFn,
} from "./support/public-entry-harness";
import fs from "node:fs";

for (const lang of ["sv", "en"] as const) {
  test(`job context, questions and return preserve intent (${lang})`, async ({ page }) => {
    await installJobsFixture(page, lang);
    const key = await observeSupabaseStorageKey(page);
    await plantSession(page, key);
    const fixture = await installJobsFixture(page, lang);
    const job = {
      ...JOBS_FIXTURE[0],
      profession_slug: "sakerhetschef",
      family_id: "financial_crime_compliance",
    };
    await page.route("**/rest/v1/jobs?**", async (route) => {
      const url = new URL(route.request().url());
      if (url.searchParams.get("slug") === `eq.${job.slug}`) return route.fulfill({ json: job });
      return route.fallback();
    });
    const req = [
      { id: "r1", kind: "mandatory", label_sv: "Ledarskap", label_en: "Leadership" },
      { id: "r2", kind: "mandatory", label_sv: "Riskbedömning", label_en: "Risk assessment" },
      {
        id: "r3",
        kind: "mandatory",
        label_sv: "Strategisk säkerhet",
        label_en: "Strategic security",
      },
    ];
    await page.route("**/rest/v1/recruitment_requirements?**", (route) =>
      route.fulfill({ json: req }),
    );
    await page.route("**/rest/v1/recruitment_questions?**", (route) =>
      route.fulfill({
        json: req.map((r, i) => ({
          id: `q${i}`,
          requirement_id: r.id,
          prompt_sv: `Uppfyller du kravet: ${r.label_sv}?`,
          prompt_en: `Do you meet the requirement: ${r.label_en}?`,
          answer_kind: "yes_no",
          is_required: true,
        })),
      }),
    );
    await page.route("**/rest/v1/cig_competencies?**", (route) =>
      route.fulfill({
        json: [
          {
            title_sv: "Ledarskap",
            title_en: "Leadership",
            description_sv: "Katalogdefinition: leda och samordna människor.",
            description_en: "Catalogue definition: leading and coordinating people.",
          },
        ],
      }),
    );
    await stubServerFn(page, "listMyApplications", []);
    await stubServerFn(page, "listMyEmployerWorkspaces", []);
    await stubServerFn(page, "countMyAcademyWork", 0);
    await stubServerFn(page, "countMyReviewQueue", 0);
    await stubServerFn(page, "getApplicationPassportOffer", {
      hasPassport: true,
      hasShareableContent: false,
      verifiedCredentials: [],
      verifiedCredentialCount: 0,
      verifiedExperienceCount: 0,
    });
    await stubServerFn(page, "listMyApplicationCvOptions", []);
    await stubServerFn(page, "getMyAccessContext", {
      isAuthenticated: true,
      isCandidate: true,
      memberships: [],
    });
    await page.goto("/jobs?q=S%C3%A4kerhetschef");
    const title = lang === "sv" ? job.title_sv : job.title_en;
    await page.getByRole("link", { name: title, exact: true }).first().click();
    // Desktop opens a reader; its explicit page link preserves list context.
    const ownPage = page.getByRole("link", {
      name: lang === "sv" ? "Öppna annonsen på egen sida" : "Open job on its own page",
    });
    if (await ownPage.isVisible()) await ownPage.click();
    const article = page.locator("article[data-job-detail]");
    await expect(article.getByRole("heading", { name: title, exact: true })).toBeVisible();
    await expect(
      article.getByText(
        lang === "sv" ? "Säkerhetsledning och styrning" : "Security Leadership & Governance",
        { exact: true },
      ),
    ).toBeVisible();
    await expect(article.getByText(/Finansiell brottslighet|Financial Crime/)).toHaveCount(0);
    await expect(
      article.getByRole("link", {
        name: lang === "sv" ? "Säkerhetschef" : "Security Manager",
        exact: true,
      }),
    ).toHaveAttribute("href", "/jobs/profession/sakerhetschef");
    await expect(
      article.getByRole("link", { name: /Läs.*yrket|Learn more about this role/ }),
    ).toHaveAttribute("href", "/career-center/security-manager");
    const related = page.getByRole("region", {
      name: lang === "sv" ? "Liknande jobb" : "Similar jobs",
    });
    await expect(related).toBeVisible();
    expect(await related.evaluate((el) => el.closest("article") === null)).toBe(true);
    await article
      .getByRole("button", {
        name: lang === "sv" ? "Sök jobbet" : "Apply for this job",
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading")).toContainText(title!);
    await expect(dialog).toContainText("Nordisk Säkerhet");
    const groups = dialog.getByRole("radiogroup");
    await expect(groups).toHaveCount(3);
    for (const group of await groups.all()) {
      expect(await group.getAttribute("aria-describedby")).toBeTruthy();
      await group.getByRole("radio").first().focus();
      await expect(group.getByRole("radio").first()).toBeFocused();
    }
    await expect(dialog).toContainText(
      lang === "sv" ? "Katalogdefinition: leda" : "Catalogue definition: leading",
    );
    await expect(
      dialog.getByRole("button", {
        name: lang === "sv" ? "Skicka ansökan" : "Submit application",
        exact: true,
      }),
    ).toBeVisible();
    fs.mkdirSync("artifacts/user-flows", { recursive: true });
    await page.screenshot({
      path: `artifacts/user-flows/after-application-${lang}-${test.info().project.name}.png`,
    });
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await page.screenshot({
      path: `artifacts/user-flows/after-job-${lang}-${test.info().project.name}.png`,
      fullPage: true,
    });
    await page
      .getByRole("link", { name: /Tillbaka till jobben|Back to jobs/ })
      .first()
      .click();
    await expect(page).toHaveURL(/q=S%C3%A4kerhetschef/);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth - innerWidth),
    ).toBeLessThanOrEqual(1);
    fixture.assertClean();
  });
}
