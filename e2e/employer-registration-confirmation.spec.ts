/**
 * Employer registration, with the confirmation email opened on ANOTHER
 * DEVICE -- walked in two separate browser contexts against the loopback
 * stack, with the gateway requiring confirmation (LOCAL_MAILER_AUTOCONFIRM=0)
 * the way the hosted project does.
 *
 * Owner bug report (2026-09-26): "Registreringen för arbetsgivare behöver
 * aktiveras. Det kommer idag ingen länk på mail när man registrerar sig." and
 * "Om jag verifierar min mail på min mobil måste den synka med datorn, det
 * gör den inte nu."
 *
 * What is REAL here: the application on its routes, a real auth.users row
 * with a real bcrypt password, a confirmation token that is consumed once,
 * a sign-in that is refused with `email_not_confirmed` until the link is
 * opened, and the organisation created through the real SECURITY DEFINER
 * function. What is SUBSTITUTED: the mailer. The gateway keeps every message
 * it would have sent in a controlled inbox (/__local/inbox), which is the
 * only place this walk reads the link from. Delivery by a real mail provider
 * is NOT proven by this test and is not claimed.
 *
 *   1. the desktop registers an organisation and is told to read the inbox:
 *      the address, the cross-device explanation, a continue button, a
 *      resend that counts down -- and NO session on this device;
 *   2. a second desktop tab (a reload) finds the same state, without the
 *      password, and is offered the sign-in form with the address kept;
 *   3. a resend inside the provider's interval is refused with the seconds,
 *      in the product's language;
 *   4. signing in before the link is opened is refused with the reason and
 *      the resend right there;
 *   5. the phone opens the link and lands signed in at the employer
 *      destination -- the organisation is created there, once;
 *   6. the phone opening the same link again is told it has been used;
 *   7. the desktop continues with its OWN sign-in (the button), reaches the
 *      same organisation, and the database holds exactly one membership;
 *   8. a second registration with the same address is told the account
 *      exists -- and no email is sent.
 *
 *   E2E_LOCAL_STACK=1 E2E_BASE_URL=http://127.0.0.1:3119 \
 *   E2E_SUPABASE_URL=http://127.0.0.1:54331 \
 *   bunx playwright test e2e/employer-registration-confirmation.spec.ts --project=chromium
 */

import {
  expect,
  test,
  devices,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

const LOCAL = process.env.E2E_LOCAL_STACK === "1";
const BASE = process.env.E2E_BASE_URL ?? "";
const API = process.env.E2E_SUPABASE_URL ?? "";
test.skip(!LOCAL, "Set E2E_LOCAL_STACK=1 to run the confirmation walk against a local stack.");
test.skip(
  LOCAL && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE),
  "The confirmation walk runs only against loopback — never a shared or hosted backend.",
);
test.skip(
  LOCAL && !/^https?:\/\/(127\.0\.0\.1|localhost):\d+$/.test(API),
  "E2E_SUPABASE_URL (loopback) is needed to read the controlled inbox.",
);
test.describe.configure({ mode: "serial", timeout: 240_000 });

const STAMP = Date.now();
const PASSWORD = "LocalRegistration!2026";
const EMAIL = `employer-confirm.${STAMP}@local.test`;
const COMPANY = `Bekräfta Säkerhet AB ${STAMP}`;

type Mail = { to: string; type: string; link: string; at: string };
async function inbox(): Promise<Mail[]> {
  const res = await fetch(`${API}/__local/inbox?to=${encodeURIComponent(EMAIL)}`);
  return (await res.json()) as Mail[];
}

async function sessionToken(page: Page): Promise<string> {
  return page.evaluate(() => {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key || !/^sb-.*-auth-token$/.test(key)) continue;
      try {
        const parsed = JSON.parse(window.localStorage.getItem(key) ?? "{}");
        if (typeof parsed?.access_token === "string") return parsed.access_token as string;
      } catch {
        /* not this one */
      }
    }
    return "";
  });
}

let browserRef: Browser;
let desktop: BrowserContext;
let phone: BrowserContext;
let desktopPage: Page;
let anonKey = "";

test.beforeAll(async ({ browser }) => {
  browserRef = browser;
  desktop = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "sv-SE" });
  phone = await browser.newContext({
    ...devices["iPhone 13 mini"],
    browserName: undefined,
    locale: "sv-SE",
  } as never);
  desktopPage = await desktop.newPage();
  desktopPage.on("request", (req) => {
    const key = req.headers()["apikey"];
    if (key && !anonKey && /\/(rest|auth)\/v1\//.test(req.url())) anonKey = key;
  });
});
test.afterAll(async () => {
  await desktop.close();
  await phone.close();
});

test("1 · the desktop registers an organisation and is told to read the inbox", async () => {
  const page = desktopPage;
  await page.goto(`${BASE}/signup?redirect=%2Femployer`);
  await page.waitForSelector('input[type="checkbox"]', { timeout: 30_000 });
  await expect(page.locator('input[type="checkbox"]').first()).toBeChecked();
  await page.locator('input[name="name"]').fill("Bekräfta Testsson");
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('input[name="organization"]').fill(COMPANY);
  await page.locator('input[name="country"]').fill("Sverige");
  await page.getByRole("button", { name: /^(skapa konto|create account)$/i }).click();

  const panel = page.getByTestId("auth-awaiting-confirmation");
  await expect(panel).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("auth-confirmation-email")).toHaveText(EMAIL);
  // The form is gone: no second submission is possible.
  await expect(page.getByRole("button", { name: /^(skapa konto|create account)$/i })).toHaveCount(
    0,
  );
  // The cross-device case is said before it happens, and the way to
  // continue HERE is a real sign-in on this device.
  await expect(page.getByTestId("auth-confirmation-cross-device")).toContainText(/annan enhet/i);
  await expect(page.getByTestId("auth-confirmation-continue")).toBeVisible();
  await expect(page.getByTestId("auth-confirmation-autocheck")).toBeVisible();
  // The resend counts the provider's interval down instead of 429ing.
  await expect(page.getByTestId("auth-confirmation-resend")).toBeDisabled();
  await expect(page.getByTestId("auth-confirmation-resend")).toContainText(/Skicka igen om \d+ s/);
  // No session on this device: nothing has been signed in.
  expect(await sessionToken(page)).toBe("");
  // Exactly one confirmation was "sent", to this address.
  const mails = await inbox();
  expect(mails).toHaveLength(1);
  expect(mails[0]!.link).toContain("/auth/v1/verify?token=");
  expect(decodeURIComponent(mails[0]!.link)).toContain("/login?redirect=%2Femployer");
});

test("2 · a reloaded desktop tab finds the same state and is offered the sign-in form", async () => {
  const page = await desktop.newPage();
  await page.goto(`${BASE}/signup`);
  const panel = page.getByTestId("auth-awaiting-confirmation");
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("auth-confirmation-email")).toHaveText(EMAIL);
  // The password was never stored, so this tab cannot sign in by itself:
  // it says so and offers the sign-in form instead of a dead button.
  await expect(page.getByTestId("auth-confirmation-cross-device")).toContainText(
    /lösenordet.*sparas aldrig/i,
  );
  await expect(page.getByTestId("auth-confirmation-continue")).toHaveCount(0);
  await page.getByTestId("auth-confirmation-signin").click();
  await page.waitForURL(/\/login\?redirect=%2Femployer/);
  await expect(page.locator('input[name="email"]')).toHaveValue(EMAIL);
  await expect(page.getByTestId("auth-signin-pending")).toContainText(EMAIL);
  await page.close();
});

test("3 · a resend inside the provider's interval is refused with the seconds, in Swedish", async () => {
  const page = await desktop.newPage();
  await page.goto(`${BASE}/signup`);
  await expect(page.getByTestId("auth-awaiting-confirmation")).toBeVisible({ timeout: 30_000 });
  // Restored state: no countdown had started in THIS tab, so the button is
  // live -- and the provider answers 429 with the seconds left.
  const resend = page.getByTestId("auth-confirmation-resend");
  await expect(resend).toBeEnabled();
  await resend.click();
  await expect(page.getByRole("alert")).toContainText(/Vänta \d+ sekunder/);
  await expect(resend).toBeDisabled();
  await expect(resend).toContainText(/Skicka igen om \d+ s/);
  expect(await inbox()).toHaveLength(1);
  await page.close();
});

test("4 · signing in before the link is opened is refused with the reason", async () => {
  const page = await desktop.newPage();
  await page.goto(`${BASE}/login?redirect=%2Femployer`);
  await page.waitForSelector('input[name="email"]', { timeout: 30_000 });
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole("button", { name: /^(logga in|sign in)$/i }).click();
  await expect(page.getByTestId("auth-awaiting-confirmation")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("status")).toContainText(/inte bekräftad ännu/i);
  expect(await sessionToken(page)).toBe("");
  await page.close();
});

test("5 · the phone opens the link and lands signed in at the employer destination", async () => {
  const [mail] = await inbox();
  const page = await phone.newPage();
  await page.goto(mail!.link);
  // The implicit flow: back on /login with the session in the fragment,
  // then straight on to /employer -- which provisions the organisation from
  // the signup metadata and lands on the review page.
  await page.waitForURL(/\/employer/, { timeout: 60_000 });
  await expect(
    page.getByRole("heading", { name: /företagskonto granskas|company account under review/i }),
  ).toBeVisible({ timeout: 60_000 });
  expect(page.url()).toContain("/employer/pending");
  expect(await sessionToken(page)).not.toBe("");
  await page.close();
});

test("6 · the same link opened again is told it has been used", async () => {
  const [mail] = await inbox();
  // A fresh, signed-out context: neither device's session may decide this.
  const ctx = await browserRef.newContext({
    ...devices["iPhone 13 mini"],
    browserName: undefined,
    locale: "sv-SE",
  } as never);
  const page = await ctx.newPage();
  await page.goto(mail!.link);
  await page.waitForURL(/\/login/, { timeout: 30_000 });
  await expect(page.getByRole("alert")).toContainText(/gått ut eller har redan använts/i, {
    timeout: 30_000,
  });
  await ctx.close();
});

test("7 · the desktop continues with its OWN sign-in and reaches the same organisation, once", async () => {
  const page = desktopPage;
  // Still on the inbox panel, still without a session.
  expect(await sessionToken(page)).toBe("");
  const cont = page.getByTestId("auth-confirmation-continue");
  if (await cont.isVisible()) await cont.click();
  await page.waitForURL(/\/employer/, { timeout: 60_000 });
  await expect(
    page.getByRole("heading", { name: /företagskonto granskas|company account under review/i }),
  ).toBeVisible({ timeout: 60_000 });
  const token = await sessionToken(page);
  expect(token).not.toBe("");
  expect(anonKey).not.toBe("");
  // The database, addressed with the desktop's OWN token: one membership,
  // one organisation with this name -- the phone's provisioning and the
  // desktop's did not produce two.
  const res = await fetch(
    `${API}/rest/v1/employer_memberships?select=employer_id,employers(name)`,
    {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    },
  );
  expect(res.status).toBe(200);
  const rows = (await res.json()) as Array<{ employer_id: string; employers: { name: string } }>;
  expect(rows).toHaveLength(1);
  expect(rows[0]!.employers.name).toBe(COMPANY);
});

test("8 · a second registration with the same address is told the account exists", async () => {
  const ctx = await browserRef.newContext({
    viewport: { width: 1280, height: 800 },
    locale: "sv-SE",
  });
  const page = await ctx.newPage();
  const before = (await inbox()).length;
  await page.goto(`${BASE}/signup?redirect=%2Femployer`);
  await page.waitForSelector('input[name="email"]', { timeout: 30_000 });
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill("AnotherPassword!2026");
  await page.locator('input[name="organization"]').fill("Dubblett AB");
  await page.locator('input[name="country"]').fill("Sverige");
  await page.getByRole("button", { name: /^(skapa konto|create account)$/i }).click();
  const existing = page.getByTestId("auth-existing-account");
  await expect(existing).toBeVisible({ timeout: 30_000 });
  await expect(existing).toContainText(EMAIL);
  await expect(existing).toContainText(/Inget nytt mejl har skickats/);
  await expect(page.getByTestId("auth-awaiting-confirmation")).toHaveCount(0);
  await expect(page.getByTestId("auth-existing-signin")).toHaveAttribute(
    "href",
    /\/login\?redirect=%2Femployer/,
  );
  expect((await inbox()).length).toBe(before);
  await ctx.close();
});
