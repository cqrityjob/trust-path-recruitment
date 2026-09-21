/**
 * The company registration, walked the way a customer walks it.
 *
 * Not a rendered component and not a mocked server: the real application, on
 * its real public routes, writing a real `employers` row through the real
 * SECURITY DEFINER function against a real PostgREST enforcing real RLS.
 *
 * The order is the contract:
 *
 *   1. the public employer page, and the button that says "register your
 *      company" — which must produce a form that COLLECTS a company. This is
 *      the defect the whole walk exists to hold: the button led to a personal
 *      account form, so a registration produced a candidate account and the
 *      administrator's queue stayed empty because nothing was ever created;
 *   2. registering, and landing on a page that says where the registration
 *      stands — received, under review, NOT approved — and says only what it
 *      actually knows about the confirmation email;
 *   3. reloading, and racing a second tab, without producing a second
 *      application;
 *   4. the organisation is `pending`, and the person who registered it cannot
 *      approve it, cannot write its status directly, and cannot publish
 *      anything from it. Asserted through the browser's OWN session token
 *      against PostgREST, because a control that is merely absent from a
 *      screen is not a boundary;
 *   5. with an administrator account supplied, that the registration is
 *      visible in the admin queue with the company, the contact person, the
 *      contact address and a link — and that the delivery trail says what was
 *      and was not sent.
 *
 * ── WHY IT SKIPS BY DEFAULT ────────────────────────────────────────────
 *
 * It creates an account and an organisation, so it runs only against a
 * disposable local stack, never a shared or hosted backend. It additionally
 * refuses any base URL that is not loopback.
 *
 * Reproduce:
 *   E2E_LOCAL_STACK=1 E2E_BASE_URL=http://127.0.0.1:3119 \
 *     bunx playwright test e2e/employer-registration.spec.ts --project=chromium
 *
 * Step 5 also needs a platform administrator on that stack:
 *   E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=... (otherwise it is skipped, and
 *   says so, rather than being quietly dropped).
 */

import { expect, test, type Page } from "@playwright/test";

const LOCAL = process.env.E2E_LOCAL_STACK === "1";
const BASE = process.env.E2E_BASE_URL ?? "";

test.skip(!LOCAL, "Set E2E_LOCAL_STACK=1 to run the registration walk against a local stack.");
test.skip(
  LOCAL && !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(BASE),
  "The registration walk runs only against loopback — never a shared or hosted backend.",
);

test.describe.configure({ mode: "serial", timeout: 240_000 });

const STAMP = Date.now();
const PASSWORD = "LocalRegistration!2026";
const CONTACT = "Test Testsson";
const EMAIL = `employer-registration.${STAMP}@local.test`;
const COMPANY = `Provvakt Sakerhet AB ${STAMP}`;

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";

let employerId = "";

/** The Supabase origin and publishable key the RUNNING APP is actually using,
 *  observed from its own traffic rather than read from this file's
 *  environment — so the spec cannot drift onto a different backend than the
 *  one under test. `import.meta.env` is not reachable from page.evaluate:
 *  Playwright serialises the function, and the bundler's replacement never
 *  happens. */
function watchSupabase(page: Page): { seen: () => { origin: string; key: string } | null } {
  let found: { origin: string; key: string } | null = null;
  page.on("request", (req) => {
    if (found) return;
    const url = req.url();
    if (!/\/(rest|auth)\/v1\//.test(url)) return;
    const key = req.headers()["apikey"];
    if (!key) return;
    found = { origin: new URL(url).origin, key };
  });
  return { seen: () => found };
}

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto(`${BASE}/login`);
  await page.waitForSelector('input[name="email"]', { timeout: 30_000 });
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: /^(logga in|sign in)$/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 45_000 });
}

/** The signed-in browser's OWN access token, read from where supabase-js
 *  keeps it. Used to ask PostgREST directly what this person may do — the
 *  only way to tell a real refusal from a hidden button. */
async function accessToken(page: Page): Promise<string> {
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

/** The local stack's PostgREST, addressed with the browser's OWN identity —
 *  the only way to tell a real refusal from a hidden button. */
async function rest(
  page: Page,
  watcher: { seen: () => { origin: string; key: string } | null },
): Promise<{ url: string; headers: Record<string, string> }> {
  const token = await accessToken(page);
  expect(token).not.toBe("");
  const backend = watcher.seen();
  expect(backend, "no Supabase request was observed; cannot address the backend").not.toBeNull();
  return {
    url: (backend as { origin: string; key: string }).origin,
    headers: {
      apikey: (backend as { origin: string; key: string }).key,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  };
}

test("1 · the employer entrance collects a company", async ({ page }) => {
  await page.goto(`${BASE}/employers`);
  await page
    .getByRole("link", { name: /registrera företag|register (your )?company/i })
    .first()
    .click();
  await page.waitForURL(/\/signup/, { timeout: 30_000 });
  await page.waitForSelector('input[type="checkbox"]', { timeout: 30_000 });

  // THE defect, held: pressing "register your company" must not produce a
  // personal account form with the organisation section collapsed.
  await expect(page.locator('input[type="checkbox"]').first()).toBeChecked();
  await expect(page.locator('input[name="organization"]')).toBeVisible();
  await expect(page.locator('input[name="country"]')).toBeVisible();

  // And the three steps are stated before any of them happens, so a
  // verification email cannot be read as an approval.
  const note = page.getByTestId("signup-organisation-note");
  await expect(note).toBeVisible();
  await expect(note).toContainText(/verifierar|verify/i);
  await expect(note).toContainText(/godkän|approv/i);

  await page.locator('input[name="name"]').fill(CONTACT);
  await page.locator('input[name="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.locator('input[name="organization"]').fill(COMPANY);
  await page.locator('input[name="country"]').fill("Sverige");
  await page.getByRole("button", { name: /^(skapa konto|create account)$/i }).click();

  // Whether the project confirms addresses or returns a session immediately,
  // the registration form's job ends here: it must leave the form behind and
  // say what is happening. A local stack autoconfirms, so this lands on the
  // review page; a project that requires confirmation shows the inbox panel,
  // and the same walk resumes at step 2 after the link is opened.
  const confirmation = page.getByTestId("auth-awaiting-confirmation");
  const review = page.getByRole("heading", {
    name: /företagskonto granskas|company account under review/i,
  });
  await expect(confirmation.or(review)).toBeVisible({ timeout: 60_000 });
  test.skip(
    await confirmation.isVisible(),
    "This stack requires email confirmation; the rest of the walk resumes after the link is opened.",
  );

  // The confirmation email, reported in the session that sent it, and
  // reported HONESTLY. With no provider configured the page must say nothing
  // was sent; with one configured it may say only that the provider accepted
  // the message. What it may never say is that anybody received it.
  const outcome = page.getByTestId("employer-pending-email-outcome");
  await expect(outcome).toBeVisible();
  const said = await outcome.innerText();
  expect(said).toMatch(
    /(kunde inte skickas|could not be sent|betyder inte att det har kommit fram|is not the same as it arriving)/i,
  );
  expect(said).not.toMatch(/(har mottagit|har fått mejlet|has received the email)/i);
});

test("2 · the review page says received, under review, and not approved", async ({ page }) => {
  await signIn(page, EMAIL, PASSWORD);
  await page.goto(`${BASE}/employer`);
  await expect(
    page.getByRole("heading", { name: /företagskonto granskas|company account under review/i }),
  ).toBeVisible({ timeout: 60_000 });
  expect(page.url()).toContain("/employer/pending");

  const steps = page.getByTestId("employer-pending-next-steps");
  await expect(steps).toBeVisible();
  await expect(steps).toContainText(/mottagen|received/i);
  await expect(steps).toContainText(/(ännu inte godkänt|not approved yet)/i);

  // The company it actually holds, so the page is a receipt.
  await expect(page.locator("body")).toContainText(COMPANY);

  // A LATER session knows nothing about an email sent during registration,
  // and must therefore say nothing about one. Repeating a claim it can no
  // longer stand behind is the failure mode this element exists to avoid, so
  // its ABSENCE here is the assertion.
  await expect(page.getByTestId("employer-pending-email-outcome")).toHaveCount(0);
});

test("3 · reloading and a second tab create no second application", async ({ page, context }) => {
  const watcher = watchSupabase(page);
  await signIn(page, EMAIL, PASSWORD);
  await page.goto(`${BASE}/employer`);
  await page.waitForLoadState("networkidle");

  const { url, headers } = await rest(page, watcher);
  const countMine = async () => {
    const res = await page.request.get(`${url}/rest/v1/employer_memberships?select=employer_id`, {
      headers,
    });
    return ((await res.json()) as unknown[]).length;
  };
  expect(await countMine()).toBe(1);

  // Reloads, and then two tabs racing the authenticated shell at once. Both
  // run the provisioning call; the second must find a membership and stop.
  for (let i = 0; i < 3; i += 1) {
    await page.goto(`${BASE}/employer`);
    await page.waitForLoadState("networkidle");
  }
  const second = await context.newPage();
  await Promise.all([page.goto(`${BASE}/employer`), second.goto(`${BASE}/my-career`)]);
  await page.waitForLoadState("networkidle");
  await second.waitForLoadState("networkidle");

  expect(await countMine()).toBe(1);
  await second.close();
});

test("4 · the company cannot approve itself or act while pending", async ({ page }) => {
  const watcher = watchSupabase(page);
  await signIn(page, EMAIL, PASSWORD);
  await page.goto(`${BASE}/employer`);
  await expect(
    page.getByRole("heading", { name: /företagskonto granskas|company account under review/i }),
  ).toBeVisible({ timeout: 60_000 });

  const { url, headers } = await rest(page, watcher);

  const mine = await page.request.get(
    `${url}/rest/v1/employer_memberships?select=employer_id&limit=5`,
    { headers },
  );
  const rows = (await mine.json()) as { employer_id: string }[];
  expect(rows.length).toBe(1);
  employerId = rows[0].employer_id;

  // The organisation is pending, and stays pending.
  const status = await page.request.get(
    `${url}/rest/v1/employers?id=eq.${employerId}&select=status`,
    { headers },
  );
  expect((await status.json())[0].status).toBe("pending");

  // Self-approval through the moderation RPC: refused by the database,
  // not by a hidden button.
  const approve = await page.request.post(`${url}/rest/v1/rpc/moderate_employer`, {
    headers,
    data: { _employer_id: employerId, _action: "approved" },
  });
  expect(approve.ok()).toBe(false);
  expect(await approve.text()).toMatch(/platform admin/i);

  // And not by writing the column either.
  const patch = await page.request.fetch(`${url}/rest/v1/employers?id=eq.${employerId}`, {
    method: "PATCH",
    headers,
    data: { status: "active" },
  });
  expect(patch.ok()).toBe(false);

  const after = await page.request.get(
    `${url}/rest/v1/employers?id=eq.${employerId}&select=status`,
    { headers },
  );
  expect((await after.json())[0].status).toBe("pending");
});

test("5 · the administrator finds the registration and its delivery trail", async ({ page }) => {
  test.skip(
    !ADMIN_EMAIL || !ADMIN_PASSWORD,
    "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD to a platform administrator on this stack.",
  );

  await signIn(page, ADMIN_EMAIL, ADMIN_PASSWORD);

  // The in-product notification: not a count, the actual registrations, with
  // what a decision needs. This is the half that works with no mail at all.
  await page.goto(`${BASE}/admin`);
  const queue = page.getByTestId("admin-pending-employer-applications");
  await queue.waitFor({ timeout: 60_000 });
  await expect(queue).toContainText(COMPANY);
  await expect(queue).toContainText(CONTACT);
  await expect(queue).toContainText(EMAIL);

  // The link goes to the registration, and requires this sign-in.
  await queue.locator("li", { hasText: COMPANY }).getByRole("link").first().click();
  await page.waitForURL(/\/admin\/employers\//, { timeout: 30_000 });

  const notices = page.getByTestId("admin-employer-registration-notices");
  await notices.waitFor({ timeout: 45_000 });
  // Whatever happened, it is named. What must never appear is silence.
  await expect(notices).toContainText(
    /(skickat|sent|misslyckades|failed|inställning saknas|setting is missing)/i,
  );
});
