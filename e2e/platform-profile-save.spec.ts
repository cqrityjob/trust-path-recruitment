import { test, expect, type Route } from "@playwright/test";
import { fixtureById } from "../src/lib/professional-identity/fixtures/career-home-fixtures";
import { mount, passportSnapshot, takeMountBookkeeping } from "./support/career-home-harness";

const ok = (body: unknown) => (route: Route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ result: body, error: null, context: {} }),
  });

for (const kind of ["basics", "residence", "work-country"] as const) {
  test(`${kind}: failed write stays dirty; accepted write with failed refresh is clean; later edits can stay or leave`, async ({
    page,
  }) => {
    let writes = 0;
    let rejectWrite = true;
    const fail = (route: Route) => route.fulfill({ status: 500, body: "Injected failure" });
    const save = (route: Route) => {
      if (rejectWrite) return fail(route);
      writes++;
      return ok({ savedAt: "2026-10-15T08:00:00Z", declaredAt: null })(route);
    };
    const snap = passportSnapshot(fixtureById("hub_active")!);
    await mount(page, "hub_active", {
      lang: "en",
      path: "/my-career/profile",
      ready: "[data-profile-basics]",
      overrides: {
        getMyPassport: (route: Route) => (writes ? fail(route) : ok(snap)(route)),
        readCurrentLocation: (route: Route) =>
          writes ? fail(route) : ok({ countryCode: "SE", locality: "Stockholm" })(route),
        savePassportBasics: save,
        saveCurrentLocation: save,
        setWorkCountry: save,
      },
    });
    const field = page.locator(
      kind === "basics"
        ? "#sp-basics-identity-headline"
        : kind === "residence"
          ? "#profile-residence-locality"
          : "#sp-work-country",
    );
    const change = async (later = false) =>
      kind === "work-country"
        ? field.selectOption(later ? "AE-DU" : "GB")
        : field.fill(later ? "Later unsaved edit" : "Accepted synthetic edit");
    const button =
      kind === "basics"
        ? page.locator("[data-basics-save]")
        : page.getByRole("button", {
            name: kind === "residence" ? "Save country of residence" : "Save work country",
            exact: true,
          });
    const leave = page.locator("[data-back-to-career]");
    async function confirm(accept: boolean) {
      const dialog = page.waitForEvent("dialog");
      const clicking = leave.click();
      const prompt = await dialog;
      expect(prompt.type()).toBe("confirm");
      expect(prompt.message()).toMatch(/unsaved/i);
      await (accept ? prompt.accept() : prompt.dismiss());
      await clicking;
    }
    await change();
    await button.click();
    await expect(page.locator("[data-profile-basics]").getByRole("alert")).toBeVisible();
    await confirm(false);
    await expect(page).toHaveURL(/\/my-career\/profile/);
    await expect(button).toBeEnabled();
    rejectWrite = false;
    await button.click();
    await expect.poll(() => writes).toBe(1);
    await expect(button).toBeDisabled();
    await expect(page.locator("[data-profile-basics]").getByRole("alert")).toContainText("reload");
    // A new edit must restore protection; dismiss and accept are both exercised.
    await change(true);
    await expect(button).toBeEnabled();
    await confirm(false);
    await expect(field).toHaveValue(kind === "work-country" ? "AE-DU" : "Later unsaved edit");
    await confirm(true);
    await expect(page).toHaveURL(/\/my-career\/?$/);
    expect(takeMountBookkeeping()?.unmatched ?? []).toEqual([]);
  });

  test(`${kind}: navigation after accepted write and failed refresh asks no discard confirmation`, async ({
    page,
  }) => {
    let wrote = false;
    const fail = (route: Route) => route.fulfill({ status: 500, body: "Injected reload failure" });
    const save = (route: Route) => {
      wrote = true;
      return ok({ savedAt: "2026-10-15T08:00:00Z", declaredAt: null })(route);
    };
    await mount(page, "hub_active", {
      lang: "en",
      path: "/my-career/profile",
      ready: "[data-profile-basics]",
      overrides: {
        getMyPassport: (route: Route) =>
          wrote ? fail(route) : ok(passportSnapshot(fixtureById("hub_active")!))(route),
        readCurrentLocation: (route: Route) =>
          wrote ? fail(route) : ok({ countryCode: "SE", locality: "Stockholm" })(route),
        savePassportBasics: save,
        saveCurrentLocation: save,
        setWorkCountry: save,
      },
    });
    if (kind === "basics") await page.locator("#sp-basics-identity-headline").fill("Accepted edit");
    else if (kind === "residence")
      await page.locator("#profile-residence-locality").fill("Accepted edit");
    else await page.locator("#sp-work-country").selectOption("GB");
    const button =
      kind === "basics"
        ? page.locator("[data-basics-save]")
        : page.getByRole("button", {
            name: kind === "residence" ? "Save country of residence" : "Save work country",
            exact: true,
          });
    await button.click();
    await expect(button).toBeDisabled();
    await expect(page.locator("[data-profile-basics]").getByRole("alert")).toContainText("reload");
    let prompts = 0;
    page.on("dialog", async (d) => {
      prompts++;
      await d.dismiss();
    });
    await page.locator("[data-back-to-career]").click();
    await expect(page).toHaveURL(/\/my-career\/?$/);
    expect(prompts).toBe(0);
    expect(takeMountBookkeeping()?.unmatched ?? []).toEqual([]);
  });
}
