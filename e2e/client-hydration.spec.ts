import { test, expect } from "@playwright/test";
import { BASE, installBoundary } from "./support/public-entry-harness";

for (const entry of ["/login", "/candidate/login"]) {
  for (const lang of ["sv", "en"] as const) {
    test(`${entry} hydrates its client-only form in ${lang} without React errors`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (message.type() === "error") errors.push(message.text());
      });
      const boundary = await installBoundary(page);
      await page.addInitScript((locale) => localStorage.setItem("cqrityjob.lang", locale), lang);
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });

      await page.goto(`${BASE}${entry}`, { waitUntil: "domcontentloaded" });
      await expect(page).toHaveURL(/\/login$/);
      const email = page.getByRole("textbox", {
        name: lang === "sv" ? "E-post" : "Email",
        exact: true,
      });
      await email.fill("hydration@fixture.invalid");
      await expect(email).toHaveValue("hydration@fixture.invalid");
      await page
        .getByRole("button", { name: lang === "sv" ? "en" : "sv", exact: true })
        .first()
        .click();
      await expect(
        page.getByRole("textbox", { name: lang === "sv" ? "Email" : "E-post", exact: true }),
      ).toHaveValue("hydration@fixture.invalid");
      expect(boundary.production).toEqual([]);
      expect(boundary.unstubbed).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

test("legacy auth URLs redirect before hydration and preserve only safe return paths", async ({
  request,
}) => {
  for (const [entry, target] of [
    ["/candidate/login", "/login"],
    ["/employer/login", "/login"],
    ["/candidate/register", "/signup"],
    ["/employer/register", "/signup"],
    ["/auth", "/login"],
  ]) {
    for (const returnPath of ["/passport", "https://attacker.invalid"]) {
      const response = await request.get(
        `${BASE}${entry}?redirect=${encodeURIComponent(returnPath)}`,
        {
          maxRedirects: 0,
        },
      );
      expect([301, 302, 303, 307, 308]).toContain(response.status());
      const destination = new URL(response.headers().location, BASE);
      expect(destination.origin).toBe(new URL(BASE).origin);
      expect(destination.pathname).toBe(target);
      if (returnPath === "/passport")
        expect(destination.searchParams.get("redirect")).toBe(returnPath);
      else expect(destination.href).not.toContain("attacker.invalid");
    }
  }
});
