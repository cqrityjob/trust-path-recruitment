/** Real GoTrue + PostgREST + Storage + Edge gateway, with no response fixtures.
 * Run scripts/passport-live-local-check.mjs first against the disposable stack.
 * The local Edge PUBLIC_SITE_URL must be https://127.0.0.1:3120.
 */
import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { createClient, type Session } from "@supabase/supabase-js";
import QRCode from "qrcode";

test.skip(
  process.env.PASSPORT_LIVE_LOCAL !== "1",
  "Explicit disposable local-stack opt-in required",
);
test.use({ ignoreHTTPSErrors: true, actionTimeout: 15_000 });

test("real owner adds and selectively shares a credential, recipient loses access on revocation", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const base = process.env.E2E_BASE_URL;
  expect(base).toBe("https://127.0.0.1:3120");
  const owner = (
    JSON.parse(readFileSync("/private/tmp/passport-phase2-users.json", "utf8")) as Record<
      string,
      { id: string; session: Session }
    >
  ).owner;
  const values = Object.fromEntries(
    readFileSync("/private/tmp/passport-phase2-status.env", "utf8")
      .split("\n")
      .filter((v) => v.includes("="))
      .map((v) => {
        const i = v.indexOf("=");
        return [v.slice(0, i), JSON.parse(v.slice(i + 1)) as string];
      }),
  );
  expect(values.API_URL).toBe("http://127.0.0.1:55421");
  const db = createClient(values.API_URL, values.ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${owner.session.access_token}` } },
    auth: { persistSession: false },
  });
  const excluded = await db.rpc("sp_save_international_credential", {
    _input: { definition_code: "INTL_ASIS_APP", identifier: "UNCHECKED-BROWSER-SECRET" },
  });
  expect(excluded.error).toBeNull();
  await page.addInitScript((session) => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
    localStorage.setItem("cqrityjob.lang", "en");
  }, owner.session);
  const external: string[] = [];
  // Reject unexpected external transport; never substitute responses.
  await page.route("**/*", async (route) => {
    const hostname = new URL(route.request().url()).hostname;
    if (hostname !== "127.0.0.1" && hostname !== "localhost") {
      external.push(hostname);
      return route.abort();
    }
    return route.continue();
  });
  await page.goto(`${base}/passport`);
  await expect(page.locator("[data-credential-wallet]")).toContainText("Local Profile Title", {
    timeout: 30_000,
  });
  await expect(page.locator("main")).not.toContainText("PRIVATE CV ONLY");
  const definitionCodes = {
    chromium: "INTL_ASIS_PCI",
    "mobile-375": "INTL_ISC2_CISSP",
    "mobile-390": "INTL_ISACA_CISM",
  };
  const code = definitionCodes[testInfo.project.name as keyof typeof definitionCodes];
  await page
    .locator("[data-credential-wallet]")
    .getByRole("link", { name: "Add credential", exact: true })
    .click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const selector = page.getByLabel("Approved credential");
  await selector.selectOption(code);
  const title = (await selector.locator(`option[value="${code}"]`).textContent())!.split(" — ")[0];
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByLabel("Original credential name", { exact: true })).toHaveCount(0);
  await page.getByLabel("Credential identifier (optional)").fill("BROWSER-OPTIONAL");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Save credential", exact: true }).click();
  await expect(page).toHaveURL(/\/passport\/entry\/claim\//, { timeout: 30_000 });
  await expect(page.locator("main")).toContainText(title);
  const claimId = new URL(page.url()).pathname.split("/").pop()!;
  await page.goto(`${base}/passport/share`);
  const selection = page.locator(`[data-merit-option="claim:${claimId}"]`);
  await selection.locator('input[type="checkbox"]').check();
  const unchecked = page.locator(`[data-merit-option="claim:${excluded.data}"]`);
  await expect(unchecked.locator('input[type="checkbox"]')).not.toBeChecked();
  await expect(
    page.getByLabel("My professional title from Profile (self-reported)"),
  ).not.toBeChecked();
  await expect(page.getByLabel("My name (subject to privacy settings)")).not.toBeChecked();
  await expect(page.getByLabel("Credential identifiers", { exact: true })).not.toBeChecked();
  await page.getByLabel("Credential identifiers", { exact: true }).check();
  await page.locator('input[name="sel-expiry"][value="7"]').check();
  await page.locator("[data-share-cta]").click();
  await expect(page.locator("[data-share-created]")).toBeVisible({ timeout: 30_000 });
  const link = await page.locator("[data-share-link]").inputValue();
  const gateway = new URL(link);
  expect(gateway.origin).toBe(values.API_URL);
  expect(gateway.pathname).toBe("/functions/v1/passport-share");

  // ── THE QR CODE IS THIS LINK, AND NOTHING ELSE ──────────────────────
  // Scanning it must open the same recipient view the link opens. QR encoding
  // is deterministic, so the proof is exact: encode the created link with the
  // options `use-qr.ts` uses and the image on the page must be byte-identical.
  // A QR carrying anything more — a name, an identifier, a second parameter —
  // or anything less would differ.
  const qr = page.getByRole("img", { name: "QR code for your selected disclosure" });
  await expect(qr).toBeVisible();
  // Compared MODULE BY MODULE, not as PNG bytes: Node and the browser compress
  // a PNG differently, so identical codes produce different files.
  const expected = QRCode.create(link, { errorCorrectionLevel: "M" }).modules;
  const drawn = await qr.evaluate(async (el, size) => {
    const img = el as HTMLImageElement;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const cell = img.naturalWidth / size;
    const out: number[] = [];
    for (let y = 0; y < size; y += 1)
      for (let x = 0; x < size; x += 1) {
        const px = ctx.getImageData(
          Math.floor(x * cell + cell / 2),
          Math.floor(y * cell + cell / 2),
          1,
          1,
        ).data;
        out.push(px[0]! + px[1]! + px[2]! < 384 ? 1 : 0);
      }
    return { out, width: img.naturalWidth, height: img.naturalHeight };
  }, expected.size);
  expect(drawn.width).toBe(drawn.height);
  expect(drawn.width % expected.size).toBe(0); // no margin baked in: whole cells only
  expect(drawn.out).toEqual(Array.from(expected.data, (v) => (v ? 1 : 0)));
  // Scannable: dark modules on a pure white ground, inside a white quiet zone.
  const quiet = await qr.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { border: cs.borderTopColor, width: parseFloat(cs.borderTopWidth) };
  });
  expect(quiet.border).toMatch(/rgb\(255, 255, 255\)/);
  expect(quiet.width).toBeGreaterThanOrEqual(8);
  // …and the link it encodes carries the opaque token only.
  // No query string at all: the opaque token rides in the FRAGMENT, which a
  // browser never sends to a server or writes to an access log.
  expect([...gateway.searchParams.keys()]).toEqual([]);
  expect(gateway.hash).toMatch(/^#[0-9a-f]{32,}$/);
  expect(link).not.toContain("BROWSER-OPTIONAL");
  expect(link).not.toContain(owner.id);
  const recipientContext = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: testInfo.project.use.viewport,
  });
  try {
    const recipient = await recipientContext.newPage();
    await recipient.addInitScript(() => localStorage.setItem("cqrityjob.lang", "en"));
    await recipient.route("**/*", async (route) => {
      const host = new URL(route.request().url()).hostname;
      if (!["127.0.0.1", "localhost"].includes(host)) {
        external.push(host);
        return route.abort();
      }
      return route.continue();
    });
    // Capture the real server-function response, not a mocked recipient fixture.
    const responses: string[] = [];
    recipient.on("response", async (response) => {
      if (response.request().resourceType() === "fetch") {
        try {
          responses.push(await response.text());
        } catch {
          /* Navigation may cancel unrelated requests. */
        }
      }
    });
    await recipient.goto(link);
    await expect(recipient).toHaveURL(/\/p\/[0-9a-f]{32}$/, { timeout: 30_000 });
    await expect(recipient.locator("main")).toContainText(title, { timeout: 30_000 });
    await expect(recipient.locator("main")).toContainText("BROWSER-OPTIONAL");
    await expect.poll(() => responses.some((body) => body.includes("BROWSER-OPTIONAL"))).toBe(true);
    const payload = responses.find((body) => body.includes("BROWSER-OPTIONAL"))!;
    expect(payload).not.toContain("UNCHECKED-BROWSER-SECRET");
    expect(payload).not.toContain("INTL_ASIS_APP");
    expect(payload).not.toContain("INTL_ASIS_PSP");
    expect(payload).not.toContain("Local Profile Title");
    await expect(recipient.locator("main")).not.toContainText("Associate Protection Professional");
    await expect(recipient.locator("main")).not.toContainText("UNCHECKED-BROWSER-SECRET");
    await expect(recipient.locator("main")).not.toContainText("Local Profile Title");
    await expect(recipient.locator("main")).not.toContainText("PRIVATE CV ONLY");
    await expect(recipient.locator("main")).not.toContainText("Local Permit Beta");
    await expect(recipient.locator("main")).not.toContainText("Local Passport Owner");
    expect(new URL(recipient.url()).hash).toBe("");
    const shares = await db
      .from("sp_disclosures")
      .select("id")
      .eq("holder_user_id", owner.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    expect(shares.error).toBeNull();
    await page.goto(`${base}/passport/share`);
    await page.locator(`[data-share-revoke="${shares.data!.id}"]`).click();
    await expect(page.locator(`[data-share-row="${shares.data!.id}"]`)).toHaveAttribute(
      "data-share-state",
      "revoked",
    );
    await recipient.reload();
    await expect(recipient.locator("main")).not.toContainText(title);
    await expect(recipient.locator("main")).toContainText("The link may have expired", {
      timeout: 30_000,
    });
    expect(
      await recipient.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ),
    ).toBeLessThanOrEqual(1);
  } finally {
    await recipientContext.close();
  }
  const changed = await db
    .from("security_career_profiles")
    .update({ current_profession_other: "Updated local Profile title" })
    .eq("user_id", owner.id);
  expect(changed.error).toBeNull();
  await page.goto(`${base}/passport`);
  await expect(page.locator("[data-credential-wallet]")).toContainText(
    "Updated local Profile title",
    { timeout: 30_000 },
  );
  await db
    .from("security_career_profiles")
    .update({ current_profession_other: "Local Profile Title" })
    .eq("user_id", owner.id);
  expect(external).toEqual([]);
});

test("real owner changes current profession in Profile; after a reload the Passport shows it", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  test.skip(testInfo.project.name !== "chromium", "one shared fixture owner — walked once");
  const base = process.env.E2E_BASE_URL;
  expect(base).toBe("https://127.0.0.1:3120");
  const owner = (
    JSON.parse(readFileSync("/private/tmp/passport-phase2-users.json", "utf8")) as Record<
      string,
      { id: string; session: Session }
    >
  ).owner;
  await page.addInitScript((session) => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify(session));
    localStorage.setItem("cqrityjob.lang", "en");
  }, owner.session);
  const external: string[] = [];
  await page.route("**/*", async (route) => {
    const hostname = new URL(route.request().url()).hostname;
    if (hostname !== "127.0.0.1" && hostname !== "localhost") {
      external.push(hostname);
      return route.abort();
    }
    return route.continue();
  });

  // The Passport shows the role the fixture wrote, and offers no editor for it.
  await page.goto(`${base}/passport`);
  const role = page.locator("[data-passport-current-role]");
  await expect(role).toHaveText("Local Profile Title", { timeout: 30_000 });
  await expect(
    page.locator("[data-credential-wallet]").locator("input, textarea, select"),
  ).toHaveCount(0);

  // The Passport's own action opens the REAL editor, in edit mode, loaded.
  await page.getByRole("link", { name: "Edit current professional role" }).click();
  await expect(page).toHaveURL(
    /\/my-career\/profile\?edit=profession&from=passport#career-profile$/,
  );
  const editor = page.getByRole("dialog");
  await expect(editor).toBeVisible({ timeout: 30_000 });
  // OBSERVED PRODUCT BEHAVIOUR, recorded rather than worked around: the
  // profession picker exists only once a working situation is chosen. A holder
  // who arrives with no situation stated meets "Where are you today?" first.
  const picker = editor.locator("select");
  if ((await picker.count()) === 0) {
    await editor.getByText("Working in the security industry", { exact: true }).click();
  }
  await expect(picker).toHaveCount(1);
  // A real published catalogue, read from the local database — not a stub.
  const options = await picker
    .locator("option")
    .evaluateAll((els) =>
      els.map((e) => ({ value: (e as HTMLOptionElement).value, text: e.textContent ?? "" })),
    );
  const chosen = options.find((o) => o.value && !/other/i.test(o.value) && o.value !== "__other__");
  expect(chosen, "no published profession in the local catalogue").toBeTruthy();
  await picker.selectOption(chosen!.value);
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).toBeHidden({ timeout: 30_000 });
  // The return origin survived the trip.
  await expect(page.locator("#scp-return-passport")).toBeVisible();

  // A FULL reload of the Passport — a fresh read from the database.
  await page.goto(`${base}/passport`);
  await page.reload();
  await expect(role).toHaveText(chosen!.text.trim(), { timeout: 30_000 });
  await expect(role).not.toHaveText("Local Profile Title");
  await expect(page.locator("[data-passport-role-source]")).toHaveText(
    "Current professional role · Self-declared",
  );
  expect(external).toEqual([]);
});
