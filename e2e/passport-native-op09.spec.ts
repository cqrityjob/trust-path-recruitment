/** Actual native sessions/bytes and routed UI. No mock Auth, session injection,
 * Storage metadata DML, route interception, worker, mail or hosted runtime. */
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  API,
  APP,
  APP_SHA,
  PDF_BYTES,
  readContext,
  readPrivateJson,
  validateStatus,
  validUuid,
  digest,
} from "../scripts/passport-native-op09-contract.mjs";

const context = readContext();
const temp = path.join(context.stackRoot, "supabase/.temp");
const status = validateStatus(readPrivateJson(path.join(temp, "status.json")));
const actors = readPrivateJson(path.join(temp, "actors.json"));
const owner = actors.C1;
if (process.env.E2E_BASE_URL !== APP || !validUuid(owner.id) || !owner.email.endsWith(".invalid"))
  throw Error("OP09_NATIVE_BROWSER_TARGET_REFUSED");
test.use({ actionTimeout: 30_000 });
test.describe.configure({ mode: "serial" });
const scenarios = [
  { lang: "sv", viewport: "desktop1440", width: 1440 },
  { lang: "en", viewport: "desktop1440", width: 1440 },
  { lang: "sv", viewport: "emulated375", width: 375 },
  { lang: "en", viewport: "emulated375", width: 375 },
] as const;
function client() {
  return createClient(API, status.ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        );
        if (url.origin !== API) throw Error("OP09_NATIVE_EXTERNAL_FETCH_REFUSED");
        return fetch(input, { ...init, redirect: "error", signal: AbortSignal.timeout(10_000) });
      },
    },
  });
}
function good<T>(result: { data: T; error: unknown }, label: string): T {
  if (result.error) throw Error(`OP09_NATIVE_BROWSER_${label}_FAILED`);
  return result.data;
}
function write(name: string, value: unknown) {
  fs.writeFileSync(path.join(temp, name), JSON.stringify(value), { mode: 0o600 });
}
function record(value: unknown) {
  const file = path.join(temp, "browser-journeys.json");
  const rows = fs.existsSync(file) ? readPrivateJson(file) : [];
  rows.push(value);
  write("browser-journeys.json", rows);
}
for (const scenario of scenarios)
  test(`own reload, explicit resume and cleanup retry ${scenario.lang} ${scenario.viewport}`, async ({
    browser,
  }) => {
    const checks: string[] = [];
    const checkpoint = (step: string) =>
      write("browser-checkpoint.json", {
        locale: scenario.lang,
        viewport: scenario.viewport,
        step,
      });
    const c = client();
    let page;
    const ctx = await browser.newContext({
      viewport: { width: scenario.width, height: scenario.width === 375 ? 812 : 900 },
      ...(scenario.width === 375 ? { isMobile: true, hasTouch: true } : {}),
    });
    try {
      checkpoint("real_password_login");
      const session = good(
        await c.auth.signInWithPassword({ email: owner.email, password: owner.password }),
        "PASSWORD_LOGIN",
      );
      expect(session.user?.id).toBe(owner.id);
      expect(session.session?.access_token).toBeTruthy();
      const claims = JSON.parse(
        Buffer.from(session.session!.access_token.split(".")[1], "base64url").toString(),
      );
      expect(claims.sub).toBe(owner.id);
      expect(claims.session_id).toBeTruthy();
      expect(new URL(claims.iss).origin).toBe(API);
      good(await c.rpc("sp_passport_ensure", { _question_version: "sp-q-v1" }), "ENSURE_PASSPORT");
      const claimId = good(
        await c.rpc("sp_save_international_credential", {
          _input: {
            definition_code: "INTL_ASIS_CPP",
            market_country: "",
            market_region: "",
            identifier: `OP09-BROWSER-${crypto.randomUUID()}`,
            issued_on: "2026-01-01",
            valid_until: "2028-01-01",
            no_expiry: false,
          },
        }),
        "CREATE_CLAIM",
      ) as string;
      expect(validUuid(claimId)).toBe(true);
      const resumedId = crypto.randomUUID(),
        cleanedId = crypto.randomUUID();
      const ownPath = (id: string) => `${owner.id}/${id}.pdf`;
      for (const [attemptId, label] of [
        [resumedId, "resume"],
        [cleanedId, "cleanup"],
      ]) {
        good(
          await c.rpc("sp_begin_evidence_upload", {
            _attempt_id: attemptId,
            _claim_id: claimId,
            _period_id: null,
            _file_name: `op09-${label}.pdf`,
            _mime_type: "application/pdf",
            _size_bytes: PDF_BYTES.length,
            _sha256: digest(PDF_BYTES),
          }),
          "BEGIN_JOURNAL",
        );
        good(
          await c.storage.from("passport-evidence").upload(ownPath(attemptId), PDF_BYTES, {
            contentType: "application/pdf",
            upsert: false,
          }),
          "UPLOAD_OWN_BYTES",
        );
      }
      const journal = (id: string) => c.rpc("sp_reconcile_evidence_upload", { _attempt_id: id });
      const bytes = async (id: string) => {
        const value = good(
          await c.storage.from("passport-evidence").download(ownPath(id)),
          "DOWNLOAD_OWN_BYTES",
        );
        return Buffer.from(await value.arrayBuffer());
      };
      const metadata = () =>
        c
          .from("sp_evidence")
          .select("id", { count: "exact" })
          .eq("storage_path", ownPath(resumedId));
      page = await ctx.newPage();
      await page.goto(`${APP}/login`);
      await page.locator('input[type="email"]').first().fill(owner.email);
      await page.locator('input[type="password"]').first().fill(owner.password);
      await page.locator('form button[type="submit"]').first().click();
      await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 45_000 });
      await page.evaluate((lang) => localStorage.setItem("cqrityjob.lang", lang), scenario.lang);
      await page.goto(`${APP}/passport/entry/claim/${claimId}`);
      const resumeName = scenario.lang === "sv" ? "Kontrollera och återuppta" : "Check and resume";
      const cleanupName =
        scenario.lang === "sv" ? "Ta bort oregistrerad fil" : "Remove unregistered file";
      const retryName = scenario.lang === "sv" ? "Försök borttagning igen" : "Retry cleanup";
      const row = (id: string) => page!.locator(`[data-upload-attempt="${id}"]`);
      checkpoint("reload_list_before_explicit_resume");
      await expect(
        row(resumedId).getByRole("button", { name: resumeName, exact: true }),
      ).toBeEnabled();
      await expect(page.locator("#sp-evidence-file")).toBeDisabled();
      await page.reload();
      await expect(
        row(resumedId).getByRole("button", { name: resumeName, exact: true }),
      ).toBeEnabled();
      expect(good(await journal(resumedId), "RELOADED_INTENT").status).toBe("prepared");
      expect((await metadata()).count).toBe(0);
      checks.push("reload_reads_own_intent_without_implicit_attachment");
      checkpoint("explicit_resume_once");
      await row(resumedId).getByRole("button", { name: resumeName, exact: true }).click();
      await expect(row(resumedId)).toHaveCount(0);
      expect(good(await journal(resumedId), "RESUMED_INTENT").status).toBe("registered");
      const registered = await metadata();
      expect(registered.error).toBeNull();
      expect(registered.count).toBe(1);
      expect(await bytes(resumedId)).toEqual(PDF_BYTES);
      checks.push("explicit_resume_once_registers_one_original");
      await page.reload();
      await expect(
        row(cleanedId).getByRole("button", { name: cleanupName, exact: true }),
      ).toBeEnabled();
      await expect(row(resumedId)).toHaveCount(0);
      expect((await metadata()).count).toBe(1);
      expect(await bytes(resumedId)).toEqual(PDF_BYTES);
      const curated = path.join(temp, "browser/curated");
      fs.mkdirSync(curated, { recursive: true });
      await page.screenshot({
        path: path.join(curated, `${scenario.lang}-${scenario.viewport}-resumed.png`),
        fullPage: true,
      });
      checkpoint("explicit_cleanup_503_retains_fence");
      write("cleanup-fault.json", {
        ownerId: owner.id,
        attemptId: cleanedId,
        armed: true,
        injected: 0,
      });
      await row(cleanedId).getByRole("button", { name: cleanupName, exact: true }).click();
      await expect(
        row(cleanedId).getByRole("button", { name: retryName, exact: true }),
      ).toBeEnabled();
      expect(good(await journal(cleanedId), "FENCED_INTENT").status).toBe("cleanup_pending");
      expect(await bytes(cleanedId)).toEqual(PDF_BYTES);
      const fault = readPrivateJson(path.join(temp, "cleanup-fault.json"));
      expect(fault.injected).toBe(1);
      expect(fault.armed).toBe(false);
      checks.push("one_exact_own_delete503_leaves_durable_fence_and_bytes");
      checkpoint("reload_no_implicit_cleanup_retry");
      await page.reload();
      await expect(
        row(cleanedId).getByRole("button", { name: retryName, exact: true }),
      ).toBeEnabled();
      await expect(
        row(cleanedId).getByRole("button", { name: resumeName, exact: true }),
      ).toHaveCount(0);
      await expect(page.locator("#sp-evidence-file")).toBeDisabled();
      expect(good(await journal(cleanedId), "RELOADED_FENCE").status).toBe("cleanup_pending");
      expect(await bytes(cleanedId)).toEqual(PDF_BYTES);
      expect(readPrivateJson(path.join(temp, "cleanup-fault.json")).injected).toBe(1);
      checks.push("reload_keeps_fence_without_rearming_or_implicit_delete");
      await page.screenshot({
        path: path.join(curated, `${scenario.lang}-${scenario.viewport}-fenced.png`),
        fullPage: true,
      });
      checkpoint("explicit_cleanup_retry_actual_absence");
      await row(cleanedId).getByRole("button", { name: retryName, exact: true }).click();
      await expect(row(cleanedId)).toHaveCount(0);
      await expect(page.locator("#sp-evidence-file")).toBeEnabled();
      expect(good(await journal(cleanedId), "CLEANED_INTENT").status).toBe("cleaned");
      const list = good(
        await c.storage
          .from("passport-evidence")
          .list(owner.id, { search: `${cleanedId}.pdf`, limit: 100 }),
        "LIST_ABSENCE",
      );
      expect(list.some((item) => item.name === `${cleanedId}.pdf`)).toBe(false);
      expect(
        (await c.storage.from("passport-evidence").download(ownPath(cleanedId))).error,
      ).not.toBeNull();
      expect(await bytes(resumedId)).toEqual(PDF_BYTES);
      expect((await metadata()).count).toBe(1);
      const protectedRecord = good(
        await c.rpc("sp_authorize_evidence_upload_cleanup", { _attempt_id: resumedId }),
        "PROTECT_REGISTERED",
      );
      expect(protectedRecord.status).toBe("registered");
      expect(await bytes(resumedId)).toEqual(PDF_BYTES);
      checks.push("explicit_retry_proves_absence_and_preserves_registered_bytes");
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
      ).toBeLessThanOrEqual(1);
      await page.screenshot({
        path: path.join(curated, `${scenario.lang}-${scenario.viewport}-cleaned.png`),
        fullPage: true,
      });
      record({
        result: "PASS",
        locale: scenario.lang,
        viewport: scenario.viewport,
        appSha: APP_SHA,
        injections: 1,
        metadataCount: 1,
        registeredBytesPreserved: true,
        cleanedAbsent: true,
        noImplicitResume: true,
        noImplicitCleanupRetry: true,
        checks,
      });
      checkpoint("completed");
    } finally {
      await ctx.close();
    }
  });
