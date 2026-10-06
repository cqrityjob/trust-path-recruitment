// Real component and styling; injected synthetic server-function seam. No live
// login/backend. SQL tests separately execute actual permissions and deletion.
import { createServer } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import { chromium, expect } from "@playwright/test";
import { resolve } from "node:path";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";
const root = process.cwd();
const server = await createServer({
  configFile: false,
  root: resolve(root, "scripts/fixtures/retention-ui"),
  plugins: [react(), tailwind()],
  resolve: {
    alias: [
      {
        find: "@/lib/recruitment/lifecycle.functions",
        replacement: resolve(root, "scripts/fixtures/retention-ui/lifecycle.mock.ts"),
      },
      {
        find: "@tanstack/react-start",
        replacement: resolve(root, "node_modules/@tanstack/react-start/src/useServerFn.ts"),
      },
      { find: "@", replacement: resolve(root, "src") },
    ],
  },
  server: { host: "127.0.0.1", port: 3198, strictPort: true, fs: { allow: [root] } },
});
await server.listen();
const browser = await chromium.launch({ headless: true });
const dir = resolve(root, "artifacts/application-retention");
await mkdir(dir, { recursive: true });
try {
  for (const width of [375, 1440])
    for (const lang of ["sv", "en"])
      for (const scope of ["job", "app"]) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        const errors = [];
        page.on("pageerror", (e) => errors.push(e.message));
        await page.goto(`http://127.0.0.1:3198/?lang=${lang}&scope=${scope}`);
        const expected =
          lang === "sv" ? "Beräknat gallringsdatum" : "Expected retention deletion date";
        await page.getByText(expected, { exact: false }).waitFor();
        const before = await page.locator("time").getAttribute("datetime");
        await page.locator("summary").click();
        await page
          .getByRole("button", { name: lang === "sv" ? "Arkivera" : "Archive", exact: true })
          .click();
        await page
          .getByRole("button", {
            name: lang === "sv" ? "Återställ arkivering" : "Restore from archive",
            exact: true,
          })
          .click();
        assert.equal(await page.locator("time").getAttribute("datetime"), before);
        await page
          .getByRole("button", {
            name:
              lang === "sv"
                ? "Radera ansökningsmaterial permanent"
                : "Permanently delete application material",
            exact: true,
          })
          .click();
        const dialog = page.getByRole("alertdialog");
        await dialog.waitFor();
        assert.match(
          await dialog.innerText(),
          lang === "sv" ? /Ansökningar som berörs: 2/ : /Applications affected: 2/,
        );
        assert.match(
          await dialog.innerText(),
          lang === "sv" ? /Delade filer som behålls: 1/ : /Shared files kept: 1/,
        );
        assert.match(await dialog.innerText(), /Security Passport/);
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
          "page must fit viewport",
        );
        assert.equal(
          await dialog.evaluate(
            (e) =>
              e.getBoundingClientRect().right > innerWidth || e.getBoundingClientRect().left < 0,
          ),
          false,
          "dialog must fit viewport",
        );
        await expect(dialog).toHaveCSS("opacity", "1");
        assert.notEqual(
          await dialog.evaluate((e) => getComputedStyle(e).backgroundColor),
          "rgba(0, 0, 0, 0)",
          "dialog must have opaque surface",
        );
        await page.screenshot({
          animations: "disabled",
          path: resolve(dir, `${scope}-${lang}-${width}.png`),
          fullPage: true,
        });
        await dialog
          .getByRole("button", { name: lang === "sv" ? "Avbryt" : "Cancel", exact: true })
          .click();
        if (scope === "job") {
          await page.getByRole("combobox").selectOption("24");
          await page
            .getByRole("button", {
              name: lang === "sv" ? "Spara lagringstid" : "Save retention period",
            })
            .click();
          await page
            .getByRole("alertdialog")
            .getByRole("button", {
              name: lang === "sv" ? "Spara lagringstid" : "Save retention period",
            })
            .click();
          assert.equal(await page.getByRole("combobox").inputValue(), "24");
        }
        await page
          .getByRole("button", {
            name:
              lang === "sv"
                ? "Radera ansökningsmaterial permanent"
                : "Permanently delete application material",
            exact: true,
          })
          .click();
        await page
          .getByRole("alertdialog")
          .getByRole("button", {
            name:
              lang === "sv"
                ? "Radera ansökningsmaterial permanent"
                : "Permanently delete application material",
          })
          .click();
        await page
          .getByText(lang === "sv" ? "Raderingen behöver hanteras." : "Deletion needs attention.", {
            exact: false,
          })
          .waitFor();
        assert.deepEqual(errors, []);
        await page.close();
        console.log(
          `PASS ${scope} ${lang} ${width}: archive, restore, scope confirmation, files, failure state, viewport`,
        );
      }
} finally {
  await browser.close();
  await server.close();
}
