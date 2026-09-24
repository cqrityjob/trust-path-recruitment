/** Real routed journeys: GoTrue sessions, server functions, PostgREST and RLS.
 * The fixture administers membership only in the explicitly owned local stack.
 * Every product record is otherwise written by an authenticated user's UI/API.
 */
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
  type Request,
} from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import type { AddressInfo } from "node:net";

const local = process.env.E2E_LOCAL_STACK === "1";
test.skip(!local, "Requires the dedicated disposable Security Work stack");
test.describe.configure({ mode: "serial", timeout: 240_000 });
const out = process.env.SW_BROWSER_EVIDENCE_DIR ?? "/private/tmp/security-work-unpublished";
const password = "LocalJourney!2026";
const api = process.env.SW_API_URL ?? "";
const anon = process.env.SW_ANON_KEY ?? "";
const db = process.env.SW_DATABASE_URL ?? "";
function guardLocal() {
  for (const value of [process.env.E2E_BASE_URL, api, db]) {
    const parsed = new URL(value ?? "");
    if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !parsed.port)
      throw new Error("Refused a nonlocal Security Work test endpoint");
  }
  if (!existsSync(`${process.env.SW_BROWSER_STATE_DIR}/owned-stack`))
    throw new Error("Missing owned-stack marker");
}
function email(project: string, language: string, actor: string) {
  const suffix = process.env.SW_BROWSER_RUN_ID ? `-${process.env.SW_BROWSER_RUN_ID}` : "";
  return `sw-${project}-${language}-${actor}${suffix}@example.test`;
}
async function login(page: Page, address: string, destination: string) {
  await page.goto(`/login?redirect=${encodeURIComponent(destination)}`);
  await page.getByLabel(/^e-?post$|^email$/i).fill(address);
  await page.getByLabel(/^lösenord$|^password$/i).fill(password);
  await page.getByRole("button", { name: /^logga in$|^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
  // Local containers can briefly disagree on the JWT iat second. This probe
  // retries only that exact read-only error, never a failed product write.
  await caller(page);
  await page.reload();
}
async function language(page: Page, locale: string) {
  await page.getByRole("button", { name: locale, exact: true }).first().click();
  await expect(page.locator("html")).toHaveAttribute("lang", new RegExp(`^${locale}`));
}
async function fit(page: Page) {
  const size = await page.evaluate(() => ({
    actual: document.documentElement.scrollWidth,
    viewport: innerWidth,
  }));
  expect(size.actual, "No horizontal scrolling on this viewport").toBeLessThanOrEqual(
    size.viewport + 1,
  );
}
async function shot(page: Page, locale: string, screen: string) {
  await page.evaluate(async () => {
    window.scrollTo(0, 0);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
  await fit(page);
  await page.screenshot({
    path: `${out}/${test.info().project.name}-${locale}-${screen}.png`,
    fullPage: true,
    scale: "css",
  });
}
async function caller(page: Page) {
  const session = await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (!/^sb-.*-auth-token$/.test(key)) continue;
      const value = JSON.parse(localStorage.getItem(key) ?? "null");
      if (value?.access_token && value?.user?.id)
        return { token: value.access_token as string, id: value.user.id as string };
    }
    return null;
  });
  if (!session) throw new Error("The actual browser has no GoTrue session");
  const client = createClient(api, anon, {
    global: { headers: { Authorization: `Bearer ${session.token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const deadline = Date.now() + 1500;
  for (;;) {
    const result = await client.from("sw_workspaces").select("id").limit(0);
    if (!result.error) break;
    if (
      result.error.code !== "PGRST303" ||
      result.error.message !== "JWT issued at future" ||
      Date.now() >= deadline
    ) {
      throw new Error(`Local authenticated readiness failed: ${result.error.code}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return { client, id: session.id, token: session.token };
}
function uuid(value: string) {
  if (!/^[a-f0-9-]{36}$/.test(value)) throw new Error("Invalid fixture identifier");
  return `'${value}'::uuid`;
}
function membership(
  owner: string,
  workspace: string,
  user: string,
  role: "viewer" | "editor",
  active = true,
) {
  // No membership endpoint is shipped in PR B. Fixture-only postgres writes
  // retain the real audit trigger and a real human owner attribution.
  const sql = `BEGIN; SELECT set_config('request.jwt.claims',jsonb_build_object('sub',${uuid(owner)},'role','authenticated','is_anonymous',false)::text,true);
    INSERT INTO public.sw_workspace_memberships(workspace_id,user_id,role,active,can_approve)
    VALUES(${uuid(workspace)},${uuid(user)},'${role}',${active},false)
    ON CONFLICT(workspace_id,user_id) DO UPDATE SET active=excluded.active;
    COMMIT;`;
  execFileSync(process.env.SW_PSQL_BIN ?? "psql", [db, "-X", "-q", "-v", "ON_ERROR_STOP=1"], {
    input: sql,
    stdio: ["pipe", "pipe", "pipe"],
  });
}
async function contextPage(browser: Browser, source: BrowserContext) {
  const page = source.pages()[0];
  const device = test.info().project.use;
  const context = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL,
    viewport: page.viewportSize() ?? undefined,
    userAgent: device.userAgent,
    deviceScaleFactor: device.deviceScaleFactor,
    isMobile: device.isMobile,
    hasTouch: device.hasTouch,
  });
  return { context, page: await context.newPage() };
}
async function noRows(client: SupabaseClient, table: string, workspace: string) {
  const result = await client.from(table).select("*").eq("workspace_id", workspace);
  expect(result.error).toBeNull();
  expect(result.data).toEqual([]);
}
function writeRequest(page: Page, marker: string) {
  return page.waitForRequest(
    (request) =>
      request.method() === "POST" &&
      new URL(request.url()).origin === new URL(process.env.E2E_BASE_URL!).origin &&
      Boolean(request.postData()?.includes(marker)),
  );
}
function replayHeaders(request: Request) {
  const headers = { ...request.headers() };
  delete headers["content-length"];
  delete headers.host;
  return headers;
}

for (const locale of ["sv", "en"] as const) {
  test(`[${locale}] manual monitoring, persistence and live authorization`, async ({
    page,
    browser,
    context,
  }) => {
    guardLocal();
    mkdirSync(out, { recursive: true });
    const project = test.info().project.name;
    const ownerEmail = email(project, locale, "owner-a");
    const marker = `Synthetic evidence ${project} ${locale}`;
    const contexts: BrowserContext[] = [];
    const hosted: string[] = [];
    await context.route(
      /https:\/\/[^/]+\.(?:supabase\.co|lovable(?:project)?\.(?:app|dev))\//,
      async (route) => {
        hosted.push(new URL(route.request().url()).hostname);
        await route.abort("blockedbyclient");
      },
    );
    let connections = 0;
    const canary = createServer((socket) => {
      connections += 1;
      socket.destroy();
    });
    await new Promise<void>((resolve) => canary.listen(0, "127.0.0.1", resolve));
    const reference = `https://127.0.0.1:${(canary.address() as AddressInfo).port}/reference`;
    try {
      await test.step("Create a personal workspace through the real sign-in and onboarding", async () => {
        await login(page, ownerEmail, "/security-work");
        await language(page, locale);
        await page
          .getByTestId("sw-workspace-name")
          .fill(`Synthetic workspace ${project} ${locale}`);
        await page.getByTestId("sw-create-workspace").click();
        await page.waitForURL(/\/security-work\/[a-f0-9-]+\/settings/);
      });
      const workspace = /\/security-work\/([a-f0-9-]+)\//.exec(page.url())![1];
      const owner = await caller(page);
      let profileRequest: Request;
      await test.step("Profile and requirements persist across reload", async () => {
        await page.getByTestId("sw-profile-sector").fill("Synthetic public safety");
        await page.getByTestId("sw-profile-decisions").fill("Choose the next manual review");
        await page.getByTestId("sw-save-profile").click();
        await expect
          .poll(
            async () =>
              (
                await owner.client
                  .from("sw_monitoring_profiles")
                  .select("sector")
                  .eq("workspace_id", workspace)
                  .single()
              ).data?.sector,
          )
          .toBe("Synthetic public safety");
        await page.reload();
        await expect(page.getByTestId("sw-profile-sector")).toHaveValue("Synthetic public safety");
        await page.getByTestId("sw-profile-decisions").fill("Updated human review decision");
        const observedWrite = writeRequest(page, "Updated human review decision");
        await page.getByTestId("sw-save-profile").click();
        profileRequest = await observedWrite;
        await expect
          .poll(
            async () =>
              (
                await owner.client
                  .from("sw_monitoring_profiles")
                  .select("decisions_supported")
                  .eq("workspace_id", workspace)
                  .single()
              ).data?.decisions_supported,
          )
          .toBe("Updated human review decision");
        const stale = await page.request.post(profileRequest.url(), {
          headers: replayHeaders(profileRequest),
          data: profileRequest.postData()!,
        });
        expect(await stale.text()).toContain("CONFLICT");
        const oversized = profileRequest
          .postData()!
          .replace("Synthetic public safety", "x".repeat(501));
        expect(oversized).not.toBe(profileRequest.postData());
        const invalid = await page.request.post(profileRequest.url(), {
          headers: replayHeaders(profileRequest),
          data: oversized,
        });
        // TanStack serializes validator exceptions inside an HTTP 200 envelope.
        const invalidBody = await invalid.text();
        expect(invalidBody).toContain("$TSR/Error");
        expect(invalidBody).toContain("too_big");
        expect(
          (
            await owner.client
              .from("sw_monitoring_profiles")
              .select("sector")
              .eq("workspace_id", workspace)
              .single()
          ).data?.sector,
        ).toBe("Synthetic public safety");
        await shot(page, locale, "settings");
        await page.goto(`/security-work/${workspace}/monitoring`);
        await page.getByTestId("sw-add-requirement").click();
        await page
          .getByTestId("sw-requirement-question")
          .fill("Which synthetic event needs a human review?");
        await page.getByTestId("sw-save-requirement").click();
        await expect(page.getByTestId("sw-save-requirement")).toHaveCount(0);
        await expect
          .poll(
            async () =>
              (
                await owner.client
                  .from("sw_intelligence_requirements")
                  .select("id")
                  .eq("workspace_id", workspace)
              ).data?.length,
          )
          .toBe(1);
      });
      await test.step("A URL is saved only as a reference; manual facts require review", async () => {
        await page.goto(`/security-work/${workspace}/sources`);
        await page.getByTestId("sw-add-source").click();
        await page.getByTestId("sw-source-name").fill("Synthetic reference register");
        await page.getByTestId("sw-source-url").fill(reference);
        await page.getByTestId("sw-save-source").click();
        await expect(page.getByTestId("sw-save-source")).toHaveCount(0);
        await expect
          .poll(
            async () =>
              (await owner.client.from("sw_sources").select("id").eq("workspace_id", workspace))
                .data?.length,
          )
          .toBe(1);
      });
      const source = await owner.client
        .from("sw_sources")
        .select("id")
        .eq("workspace_id", workspace)
        .single();
      expect(source.error).toBeNull();
      const sourceId = source.data!.id as string;
      const literal = `<img src="${reference}" onerror="window.__swUnsafe=true"> ${marker}`;
      await test.step("Save reviewed immutable facts without rendering HTML", async () => {
        await page.goto(`/security-work/${workspace}/sources/${sourceId}`);
        await page.getByTestId("sw-add-item").click();
        await page.getByTestId("sw-item-title").fill(marker);
        const itemForm = page.locator("form").filter({ has: page.getByTestId("sw-item-title") });
        await page.getByTestId("sw-item-extract").fill("   ");
        await page.getByTestId("sw-preview-item").click();
        await expect(itemForm.getByRole("alert")).toBeVisible();
        await expect(page.getByTestId("sw-item-extract")).toBeEditable();
        await expect(page.getByTestId("sw-confirm-item")).toHaveCount(0);
        await page.getByTestId("sw-item-extract").fill(literal);
        await itemForm
          .locator('input[type="url"]')
          .fill("https://synthetic:credential@example.test/reference");
        await page.getByTestId("sw-preview-item").click();
        await expect(itemForm.getByRole("alert")).toBeVisible();
        await expect(itemForm.locator('input[type="url"]')).toBeEditable();
        await expect(page.getByTestId("sw-confirm-item")).toHaveCount(0);
        expect(
          (await owner.client.from("sw_source_items").select("id").eq("workspace_id", workspace))
            .data,
        ).toEqual([]);
        await itemForm.locator('input[type="url"]').fill(reference);
        await page.getByTestId("sw-preview-item").click();
        await expect(page.getByText(literal, { exact: true })).toBeVisible();
        expect(
          (await owner.client.from("sw_source_items").select("id").eq("workspace_id", workspace))
            .data,
        ).toEqual([]);
        await page.getByTestId("sw-confirm-item").click();
        await expect(page.getByTestId("sw-confirm-item")).toHaveCount(0);
        await expect
          .poll(
            async () =>
              (
                await owner.client
                  .from("sw_source_items")
                  .select("id")
                  .eq("workspace_id", workspace)
              ).data?.length,
          )
          .toBe(1);
        await page.reload();
        await expect(page.getByTestId("sw-item-row").filter({ hasText: marker })).toBeVisible();
        await shot(page, locale, "sources");
        expect(await page.locator(`img[src="${reference}"]`).count()).toBe(0);
        expect(await page.evaluate(() => "__swUnsafe" in window)).toBe(false);
      });
      await test.step("A human records triage and reads the stored attribution", async () => {
        await page.goto(`/security-work/${workspace}/monitoring`);
        await page.getByTestId("sw-item-row").filter({ hasText: marker }).click();
        await expect(page.getByTestId("sw-item-detail")).toBeVisible();
        await page
          .getByTestId("sw-triage-rationale")
          .fill("This draft survives a competing decision.");
        const beforeDecision = await owner.client
          .from("sw_intelligence_items")
          .select("id,version")
          .eq("workspace_id", workspace)
          .single();
        expect(beforeDecision.error).toBeNull();
        const concurrentDecision = await owner.client
          .from("sw_intelligence_items")
          .update({ status: "dismissed", human_rationale: "A concurrent human decision." })
          .eq("id", beforeDecision.data!.id)
          .eq("version", beforeDecision.data!.version)
          .select("status")
          .single();
        expect(concurrentDecision.error).toBeNull();
        await page.getByTestId("sw-triage-relevant").click();
        await expect(page.getByTestId("sw-item-detail").getByRole("alert")).toContainText(
          /ändrats sedan|changed since/,
        );
        await expect(page.getByTestId("sw-triage-rationale")).toHaveValue(
          "This draft survives a competing decision.",
        );
        expect(
          (
            await owner.client
              .from("sw_intelligence_items")
              .select("status,human_rationale")
              .eq("id", beforeDecision.data!.id)
              .single()
          ).data,
        ).toEqual({ status: "dismissed", human_rationale: "A concurrent human decision." });
        // The user explicitly discards the stale draft to load the current version.
        page.once("dialog", (dialog) => dialog.accept());
        await page.reload();
        await page.getByTestId("sw-item-row").filter({ hasText: marker }).click();
        await page
          .getByTestId("sw-triage-rationale")
          .fill("A person checked the synthetic original.");
        await page.getByTestId("sw-triage-relevant").click();
        await expect(page.getByTestId("sw-triage-rationale")).toHaveValue("");
        await expect
          .poll(
            async () =>
              (
                await owner.client
                  .from("sw_intelligence_items")
                  .select("status")
                  .eq("workspace_id", workspace)
                  .single()
              ).data?.status,
          )
          .toBe("relevant");
        await page.reload();
        await page.getByTestId("sw-item-row").filter({ hasText: marker }).click();
        await expect(page.getByTestId("sw-item-detail")).toContainText(
          "A person checked the synthetic original.",
        );
        await shot(page, locale, "monitoring");
        const result = await owner.client
          .from("sw_intelligence_items")
          .select("decided_by,decided_at,human_rationale")
          .eq("workspace_id", workspace)
          .single();
        expect(result.data?.decided_by).toBe(owner.id);
        expect(result.data?.decided_at).toBeTruthy();
        expect(result.data?.human_rationale).toBe("A person checked the synthetic original.");
      });
      await test.step("Reload and a new authenticated session retain state; duplicate bootstrap is idempotent", async () => {
        const relogin = await contextPage(browser, context);
        contexts.push(relogin.context);
        await login(relogin.page, ownerEmail, `/security-work/${workspace}/settings`);
        await language(relogin.page, locale);
        await expect(relogin.page.getByTestId("sw-profile-sector")).toHaveValue(
          "Synthetic public safety",
        );
        const duplicate = await Promise.all(
          [1, 2].map(() =>
            owner.client.rpc("sw_create_personal_workspace", { _name: "Synthetic retry" }),
          ),
        );
        expect(duplicate.every((result) => !result.error && result.data === workspace)).toBe(true);
        expect((await owner.client.from("sw_workspaces").select("id")).data).toEqual([
          { id: workspace },
        ]);
      });
      await test.step("An immutable original left without inbox state can be recovered after reload", async () => {
        const factId = randomUUID();
        const inserted = await owner.client.from("sw_source_items").insert({
          id: factId,
          workspace_id: workspace,
          source_id: sourceId,
          deduplication_key: `manual:${factId}`,
          original_title: "Synthetic interrupted save",
          publisher: "Synthetic publisher",
          factual_extract: "Synthetic original retained after an interrupted second write.",
          language: locale,
          geography: [],
          created_by: owner.id,
          retrieval_status: "manual",
        });
        expect(inserted.error).toBeNull();
        await page.reload();
        const row = page
          .getByTestId("sw-item-row")
          .filter({ hasText: "Synthetic interrupted save" });
        await expect(row).toBeVisible();
        await row.click();
        await page.getByTestId("sw-retry-inbox").click();
        await expect
          .poll(
            async () =>
              (
                await owner.client
                  .from("sw_intelligence_items")
                  .select("id")
                  .eq("source_item_id", factId)
              ).data?.length,
          )
          .toBe(1);
        expect(
          (
            await owner.client
              .from("sw_source_items")
              .select("factual_extract")
              .eq("id", factId)
              .single()
          ).data?.factual_extract,
        ).toBe("Synthetic original retained after an interrupted second write.");
      });
      await test.step("Workspace B cannot read or write A through direct URLs and API IDs", async () => {
        const outsider = await contextPage(browser, context);
        contexts.push(outsider.context);
        await login(outsider.page, email(project, locale, "owner-b"), "/security-work");
        await language(outsider.page, locale);
        await outsider.page.getByTestId("sw-workspace-name").fill("Synthetic workspace B");
        await outsider.page.getByTestId("sw-create-workspace").click();
        await outsider.page.waitForURL(/\/settings$/);
        const other = await caller(outsider.page);
        const deniedEndpoint = await outsider.page.request.post(profileRequest!.url(), {
          headers: { ...replayHeaders(profileRequest!), authorization: `Bearer ${other.token}` },
          data: profileRequest!.postData()!,
        });
        expect(await deniedEndpoint.text()).toContain("ACCESS_DENIED");
        for (const table of [
          "sw_sources",
          "sw_source_items",
          "sw_intelligence_items",
          "sw_monitoring_profiles",
        ])
          await noRows(other.client, table, workspace);
        const insert = await other.client
          .from("sw_sources")
          .insert({ workspace_id: workspace, name: "Unauthorized write", created_by: other.id });
        expect(insert.error?.code).toBe("42501");
        const bodies: Promise<string>[] = [];
        outsider.page.on("response", (response) => {
          if (
            new URL(response.url()).origin === new URL(process.env.E2E_BASE_URL!).origin &&
            ["document", "fetch", "xhr"].includes(response.request().resourceType())
          )
            bodies.push(response.text().catch(() => ""));
        });
        await outsider.page.goto(`/security-work/${workspace}/sources/${sourceId}`);
        await expect(outsider.page.getByTestId("sw-access-denied")).toBeVisible();
        await expect(outsider.page.locator("body")).not.toContainText(marker);
        expect((await Promise.all(bodies)).join("\n")).not.toContain(marker);
        await shot(outsider.page, locale, "access-denied");
      });
      await test.step("A viewer reads but cannot change records; membership revocation defeats a still-valid token", async () => {
        for (const actor of ["viewer", "revoked"] as const) {
          const member = await contextPage(browser, context);
          contexts.push(member.context);
          await login(member.page, email(project, locale, actor), "/security-work");
          const signed = await caller(member.page);
          membership(owner.id, workspace, signed.id, actor === "viewer" ? "viewer" : "editor");
          await member.page.goto(`/security-work/${workspace}/sources/${sourceId}`);
          await expect(
            member.page.getByTestId("sw-item-row").filter({ hasText: marker }),
          ).toBeVisible();
          if (actor === "viewer") {
            await expect(member.page.getByTestId("sw-add-item")).toHaveCount(0);
            const denied = await signed.client.from("sw_source_items").insert({
              workspace_id: workspace,
              source_id: sourceId,
              deduplication_key: randomUUID(),
              original_title: "Viewer forbidden",
              factual_extract: "No viewer write",
              created_by: signed.id,
            });
            expect(denied.error?.code).toBe("42501");
          } else {
            membership(owner.id, workspace, signed.id, "editor", false);
            const stillValid = await signed.client.auth.getUser(signed.token);
            expect(stillValid.error).toBeNull();
            expect(stillValid.data.user?.id).toBe(signed.id);
            await noRows(signed.client, "sw_source_items", workspace);
            await member.page.reload();
            await expect(member.page.getByTestId("sw-access-denied")).toBeVisible();
            await expect(member.page.locator("body")).not.toContainText(marker);
          }
        }
      });
      expect(connections, "Saving and rendering reference URLs never connects to the URL").toBe(0);
      expect(hosted, "No hosted backend is contacted by the browser").toEqual([]);
    } finally {
      await Promise.all(contexts.map((item) => item.close()));
      await new Promise<void>((resolve) => canary.close(() => resolve()));
    }
  });
}
