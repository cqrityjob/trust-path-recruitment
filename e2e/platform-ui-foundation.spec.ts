import { test, expect } from "@playwright/test";
import fs from "node:fs";
test.use({ reducedMotion: "reduce" });
const before = process.env.UX_EVIDENCE_MODE === "before";
const dir = `artifacts/platform-ux/${before ? "before" : "after"}`;
for (const lang of ["sv", "en"] as const) {
  test(`shared overlays remain reachable with keyboard (${lang})`, async ({ page }, info) => {
    await page.route("**/__ux-fixture?*", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: '<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;</script><script type="module" src="/e2e/support/platform-ui-fixture.tsx"></script></body></html>',
      }),
    );
    await page.goto(`/__ux-fixture?lang=${lang}`);
    fs.mkdirSync(dir, { recursive: true });
    for (const [index, name] of (lang === "sv"
      ? ["Öppna dialog", "Öppna bekräftelse", "Öppna meny"]
      : ["Open dialog", "Open confirmation", "Open menu"]
    ).entries()) {
      const trigger = page.getByRole("button", { name, exact: true });
      await trigger.click();
      const overlay = page.getByRole(index === 1 ? "alertdialog" : "dialog");
      await expect(overlay).toBeVisible();
      await overlay.evaluate(async (el) => {
        await Promise.all(el.getAnimations().map((a) => a.finished));
      });
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `${dir}/${info.project.name}-${lang}-overlay-${index}.png` });
      if (!before) {
        const box = await overlay.boundingBox();
        expect(box!.y).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
        if (index !== 1) {
          const close = overlay.getByRole("button", {
            name: lang === "sv" ? "Stäng" : "Close",
            exact: true,
          });
          const target = await close.boundingBox();
          expect(target!.width).toBeGreaterThanOrEqual(44);
          expect(target!.height).toBeGreaterThanOrEqual(44);
        }
      }
      if (index === 1) {
        await overlay
          .getByRole("button", { name: lang === "sv" ? "Avbryt" : "Cancel", exact: true })
          .press("Enter");
      } else {
        await page.keyboard.press("Escape");
      }
      await expect(overlay).toBeHidden();
      await expect(trigger).toBeFocused();
    }
  });
}
