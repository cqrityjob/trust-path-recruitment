/** Opt-in real local Auth/PostgREST + application HTTP integration. Creates only
 * fresh synthetic owners/claims/disclosures. No catalogue/schema/global writes.
 * CQJ_LOCAL_ENV_FILE: protected env file with API_URL, ANON_KEY, SERVICE_ROLE_KEY.
 * App must use the same local backend and VITE_PASSPORT_LOCAL_INTEGRATION=1.
 * Never prints bearer URLs, credentials or sessions. No traces/screenshots.
 */
import fs from "node:fs";
import crypto from "node:crypto";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import QRCode from "qrcode";

const base = process.env.E2E_BASE_URL;
if (process.env.CQJ_LOCAL_PASSPORT !== "1" || !/^https:\/\/127\.0\.0\.1:\d+$/.test(base ?? ""))
  throw Error("Explicit loopback-only integration required");
const config = Object.fromEntries(
  fs
    .readFileSync(process.env.CQJ_LOCAL_ENV_FILE, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((row) => {
      const i = row.indexOf("=");
      return [row.slice(0, i), JSON.parse(row.slice(i + 1))];
    }),
);
assert.equal(config.API_URL, "http://127.0.0.1:55421");
const admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
function good(result) {
  if (result.error) throw Error(`Local RPC failed: ${result.error.code ?? "unknown"}`);
  return result.data;
}
const browser = await chromium.launch({ headless: true });
try {
  for (const [lang, width] of [
    ["sv", 1280],
    ["en", 375],
  ]) {
    const email = `cqrity-flow-${crypto.randomUUID()}@example.test`;
    const password = crypto.randomBytes(24).toString("base64url");
    const owner = good(
      await admin.auth.admin.createUser({ email, password, email_confirm: true }),
    ).user;
    const db = createClient(config.API_URL, config.ANON_KEY, { auth: { persistSession: false } });
    const login = good(await db.auth.signInWithPassword({ email, password }));
    good(await db.from("sp_passport_profiles").insert({ holder_user_id: owner.id }));
    const claim = good(
      await db.rpc("sp_save_international_credential", {
        _input: {
          definition_code: "INTL_ASIS_CPP",
          identifier: "SYNTHETIC-SELECTED",
          issued_on: "2026-01-01",
          valid_until: "2028-01-01",
        },
      }),
    );
    good(
      await db.rpc("sp_save_international_credential", {
        _input: {
          definition_code: "INTL_ASIS_PSP",
          identifier: "SYNTHETIC-EXCLUDED",
          issued_on: "2026-01-01",
          valid_until: "2028-01-01",
        },
      }),
    );
    const context = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width, height: 900 },
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const external = [];
    const blockExternal = async (route) => {
      const host = new URL(route.request().url()).hostname;
      if (!["127.0.0.1", "localhost"].includes(host)) {
        external.push(host);
        return route.abort();
      }
      return route.continue();
    };
    await context.route("**/*", blockExternal);
    await context.addInitScript(
      ({ session, lang }) => {
        localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
        localStorage.setItem("cqrityjob.lang", lang);
      },
      { session: login.session, lang },
    );
    const page = await context.newPage();
    const { expect } = await import("@playwright/test");
    await page.goto(`${base}/passport/share`);
    const selection = page.locator(`[data-merit-option="claim:${claim}"] input`);
    await selection.check({ timeout: 60000 });
    const preview = page.locator('button[aria-controls="sel-preview-panel"]');
    await preview.click();

    await expect(page.locator("#sel-preview-panel")).toContainText(
      "Certified Protection Professional",
    );
    await preview.click();
    await expect(selection).toBeChecked();
    await page
      .getByLabel(lang === "sv" ? "Certifikats- eller licensnummer" : "Credential identifiers", {
        exact: true,
      })
      .check();
    await page.locator('input[name="sel-expiry"][value="7"]').check();
    await page.locator("[data-share-cta]").click();
    await page.locator("[data-share-created]").waitFor({ timeout: 30000 });
    const link = await page.locator("[data-share-link]").inputValue();
    const url = new URL(link);
    assert.ok(
      url.origin === base && url.pathname === "/p" && /^#[0-9a-f]{32,}$/.test(url.hash),
      "local fragment link",
    );
    await page.locator("[data-share-created] button").first().click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    assert.ok(copied === link, "clipboard equals generated link");
    const qr = page.locator("[data-share-created] img");
    await qr.waitFor();
    const modules = QRCode.create(link, { errorCorrectionLevel: "M" }).modules;
    const pixels = await qr.evaluate(async (img, size) => {
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const cell = img.naturalWidth / size;
      const result = [];
      for (let y = 0; y < size; y++)
        for (let x = 0; x < size; x++) {
          const p = ctx.getImageData(
            Math.floor((x + 0.5) * cell),
            Math.floor((y + 0.5) * cell),
            1,
            1,
          ).data;
          result.push(p[0] + p[1] + p[2] < 384 ? 1 : 0);
        }
      return result;
    }, modules.size);
    assert.deepEqual(
      pixels,
      Array.from(modules.data, (v) => (v ? 1 : 0)),
      "QR modules encode exact link",
    );
    const recipientContext = await browser.newContext({
      ignoreHTTPSErrors: true,
      viewport: { width, height: 900 },
    });
    await recipientContext.route("**/*", blockExternal);
    await recipientContext.addInitScript(
      (lang) => localStorage.setItem("cqrityjob.lang", lang),
      lang,
    );
    const recipient = await recipientContext.newPage();
    await recipient.goto(copied);
    await expect(recipient.locator("main")).toContainText("SYNTHETIC-SELECTED", { timeout: 30000 });
    await expect(recipient.locator("main")).not.toContainText("SYNTHETIC-EXCLUDED");
    assert.ok(!new URL(recipient.url()).hash, "fragment removed");
    await recipient.reload();
    await expect(recipient.locator("main")).toContainText("SYNTHETIC-SELECTED");
    const disclosure = good(
      await db
        .from("sp_disclosures")
        .select("id")
        .eq("holder_user_id", owner.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single(),
    );
    await page.goto(`${base}/passport/share`);
    await page.locator(`[data-share-revoke="${disclosure.id}"]`).click();
    await expect(page.locator(`[data-share-row="${disclosure.id}"]`)).toHaveAttribute(
      "data-share-state",
      "revoked",
    );
    await recipient.reload();
    await expect(recipient.locator("main")).not.toContainText("SYNTHETIC-SELECTED");
    await expect(recipient.locator("main")).toContainText(
      lang === "sv" ? "Länken kan ha gått ut" : "The link may have expired",
    );
    await recipient.goto(`${base}/p#${crypto.randomBytes(32).toString("hex")}`);
    await expect(recipient.locator("main")).toContainText(
      lang === "sv" ? "Länken kan ha gått ut" : "The link may have expired",
    );
    assert.equal(external.length, 0, "no external browser transport");
    await recipientContext.close();
    await context.close();
    await db.auth.signOut();
    console.log(
      `PASS ${lang}/${width}: real login, preview selection, copy, QR, anonymous open/reload, selected-only data, revoke and invalid link`,
    );
  }
} finally {
  await browser.close();
}
