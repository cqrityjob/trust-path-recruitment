import { test, expect, type BrowserContext, type Page } from "@playwright/test";

// PR 10 — anonymous result → account → saved result.
//
// The exact journey the pilot audit walked and found broken: a signed-out
// visitor answers all twenty-eight Career Discovery questions, reads the
// result, presses "create an account and save it", registers, comes back
// through the confirmation link — and used to arrive at "the assessment
// isn't open yet" with the finished run discarded and twenty-eight questions
// to answer again.
//
// -----------------------------------------------------------------------
// LOCAL STACK ONLY. Never auto-run.
// -----------------------------------------------------------------------
// This spec CREATES ACCOUNTS and saves reports. It is gated on an explicit
// opt-in and skips itself otherwise, so a bare `bunx playwright test` can
// never point it at a shared or live backend:
//
//   E2E_CD_LOCAL=1     -- explicit opt-in
//   E2E_BASE_URL       -- a dev server bound to the LOCAL Supabase stack
//
// Run via:
//   E2E_CD_LOCAL=1 E2E_BASE_URL=http://127.0.0.1:5199 \
//     bunx playwright test e2e/career-discovery-conversion.spec.ts
const READY = process.env.E2E_CD_LOCAL === "1" && Boolean(process.env.E2E_BASE_URL);

test.describe(
  READY ? "Career Discovery conversion" : "Career Discovery conversion (skipped)",
  () => {
    test.skip(!READY, "Set E2E_CD_LOCAL=1 and E2E_BASE_URL to a dev server on the local stack.");
    test.describe.configure({ mode: "serial", timeout: 240_000 });

    /** A fresh, clearly synthetic account per run. Never an internal tester —
     *  which is the whole point: this is the cohort the gate used to refuse. */
    function newAccount() {
      const stamp = `${Date.now()}-${Math.floor(Math.random() * 100000)}`;
      return { email: `e2e-cd-${stamp}@example.test`, password: `Pw-${stamp}-aA1!` };
    }

    /** Answer every question by taking the first offered option.
     *
     *  The first C1 option is "exploring security", which is deliberately the
     *  one that does NOT trigger the optional career-context step, so this
     *  walks the shortest complete run rather than a variant of it. */
    async function completeAssessment(page: Page) {
      // The intro paints only after getV31Availability resolves; a cold dev
      // server takes noticeably longer than the default expect timeout.
      const start = page.getByRole("button", { name: /Börja vägledningen|Start the assessment/ });
      await expect(start).toBeVisible({ timeout: 60_000 });
      await start.click();
      for (let i = 0; i < 40; i += 1) {
        const answered = await page
          .getByRole("heading", { name: /Alla frågor är besvarade|answered every question/ })
          .count();
        const reportShown = await page
          .locator("h1,h2")
          .filter({ hasText: /Career DNA/ })
          .count();
        if (answered > 0 || reportShown > 0) return;
        const options = page.locator("label:has(input[type=radio])");
        const count = await options.count();
        if (count === 0) break;
        await options.first().click();
        await page.waitForTimeout(90);
      }
    }

    /** The claim token the flow staged, read from where it actually lives. */
    async function stagedClaim(page: Page): Promise<{ token: string; raw: string }> {
      const raw = await page.evaluate(() =>
        window.localStorage.getItem("cqj:discovery:v31:pending-claim:v1"),
      );
      expect(raw, "a finished run is staged for claiming").not.toBeNull();
      return { token: JSON.parse(raw as string).claimToken as string, raw: raw as string };
    }

    /** Fill in and submit the signup form, and wait for the ANSWER.
     *
     *  The confirmation message is the only signal that signUp actually
     *  returned. Opening the confirmation tab before it arrives finds no
     *  session on /login and simply sits on the form — which is a bug in the
     *  test, and would mask the very thing it exists to prove. */
    async function register(page: Page, account: { email: string; password: string }) {
      await page
        .getByLabel(/^E-post$|^Email$/)
        .first()
        .fill(account.email);
      await page
        .getByLabel(/^Lösenord$|^Password$/)
        .first()
        .fill(account.password);
      await page.getByRole("button", { name: /^Skapa konto$|^Create account$/ }).click();
      await expect(page.getByText(/Kolla din inkorg|Check your inbox/i)).toBeVisible({
        timeout: 60_000,
      });
    }

    /** Sign in with an existing account. */
    async function signIn(page: Page, account: { email: string; password: string }) {
      await page
        .getByLabel(/^E-post$|^Email$/)
        .first()
        .fill(account.email);
      await page
        .getByLabel(/^Lösenord$|^Password$/)
        .first()
        .fill(account.password);
      await page.getByRole("button", { name: /^Logga in$|^Sign in$/ }).click();
    }

    /** End up signed in and on My Career, whichever way this environment
     *  confirms accounts. A stack with mail auto-confirmation already has a
     *  session by the time signup returns and never shows the form again; one
     *  without it bounces to the sign-in page. Both are legitimate, and the
     *  test must not depend on which. */
    async function ensureSignedIn(page: Page, account: { email: string; password: string }) {
      await page.goto("/my-career");
      const emailField = page.getByLabel(/^E-post$|^Email$/).first();
      const needsForm = await emailField.isVisible({ timeout: 8_000 }).catch(() => false);
      if (needsForm) await signIn(page, account);
      await page.waitForURL(/\/my-career/, { timeout: 60_000 });
    }

    /** Register, then come back the way a real candidate does: through a
     *  DIFFERENT TAB. sessionStorage is per-tab, so the in-progress buffer is
     *  gone here — exactly as it is when a confirmation link opens from a mail
     *  client. Only the staged claim survives, which is the mechanism under
     *  test. */
    async function registerAndReturn(
      context: BrowserContext,
      page: Page,
      account: { email: string; password: string },
      claimUrl: string,
    ): Promise<Page> {
      await expect(page.getByTestId("auth-claim-waiting")).toBeVisible({ timeout: 30_000 });
      await register(page, account);

      const confirmationTab = await context.newPage();
      await confirmationTab.goto(
        `${process.env.E2E_BASE_URL}/login?redirect=${encodeURIComponent(claimUrl)}`,
      );
      return confirmationTab;
    }

    // =====================================================================
    test("anonymous run survives account creation and is saved", async ({ browser }) => {
      // =====================================================================
      const context = await browser.newContext({ locale: "sv-SE" });
      const page = await context.newPage();
      const account = newAccount();

      // 1-4 · signed out, twenty-eight questions, a result.
      await page.goto("/security-career-assessment");
      await expect(page.getByRole("button", { name: /Börja vägledningen/ })).toBeVisible({
        timeout: 60_000,
      });
      await expect(page.getByText(/Du behöver inget konto för att börja/)).toBeVisible();
      await completeAssessment(page);
      await expect(page.getByRole("heading", { name: /Alla frågor är besvarade/ })).toBeVisible({
        timeout: 30_000,
      });

      // The result the candidate is looking at, BEFORE any account exists.
      // Compared against the saved report below: signing in must be a save,
      // never a recomputation.
      const anonymousPattern = await page.getByTestId("cd-pattern-name").innerText();
      expect(anonymousPattern.trim().length).toBeGreaterThan(0);

      // 5 · "Create account and save my result".
      await page.getByRole("button", { name: /Skapa konto och spara resultatet/ }).click();
      await page.waitForURL(/\/signup\?/);
      const { token, raw } = await stagedClaim(page);
      const claimUrl = `/security-career-assessment?claim=${encodeURIComponent(token)}`;

      // 6-8 · register, return through a different tab, land on the report.
      const returned = await registerAndReturn(context, page, account, claimUrl);
      await returned.waitForURL(/\/security-career-assessment\/report\//, { timeout: 60_000 });

      // 9 · it says so, once, where it happened — and it is the SAME result.
      await expect(returned.getByTestId("cd-claim-saved")).toBeVisible();
      await expect(returned.getByTestId("cd-pattern-name")).toHaveText(anonymousPattern);
      const reportUrl = returned.url();
      const snapshotId = reportUrl.split("/report/")[1].split("?")[0];

      // 10-12 · My Career recognises the completion and asks for no retake.
      await returned.goto("/my-career");
      await expect(returned.getByText(/Career Discovery/).first()).toBeVisible({ timeout: 30_000 });
      await expect(returned.getByRole("link", { name: /Starta Career Discovery/ })).toHaveCount(0);
      await expect(returned.getByRole("link", { name: /Gör om Career Discovery/ })).toHaveCount(0);

      // 13 · reload.
      await returned.reload();
      await expect(returned.getByText(/Career Discovery/).first()).toBeVisible({ timeout: 30_000 });

      // Back onto the claim URL — the state that used to say "your result is
      // gone" seconds after it had been saved.
      await returned.goto(claimUrl);
      await returned.waitForURL(new RegExp(`/report/${snapshotId}`), { timeout: 30_000 });

      // ── THE SAME CLAIM, PRESENTED TWICE ──────────────────────────────
      //
      // The step above is answered by the browser, which is the common case
      // and not the interesting one. This puts the staged record BACK and
      // takes the shortcut away, so the claim reaches the server a second
      // time with the same token — a double-click, a second tab, or a retry
      // after a timeout that had in fact succeeded. One run, one report:
      // the same snapshot comes back rather than a second one being minted.
      await returned.evaluate((staged) => {
        window.localStorage.setItem("cqj:discovery:v31:pending-claim:v1", staged);
        window.localStorage.removeItem("cqj:discovery:v31:claimed-result:v1");
      }, raw);
      await returned.goto(claimUrl);
      await returned.waitForURL(new RegExp(`/report/${snapshotId}`), { timeout: 60_000 });
      await expect(returned.locator("body")).toContainText(/Career DNA/, { timeout: 30_000 });

      // 14-16 · log out, log back in, the result is still there.
      await returned.evaluate(() => window.localStorage.clear());
      await returned.goto("/login");
      await expect(returned.getByLabel(/^E-post$|^Email$/).first()).toBeVisible({
        timeout: 30_000,
      });
      await signIn(returned, account);
      await returned.waitForURL(/\/my-career/, { timeout: 60_000 });
      await returned.goto(`/security-career-assessment/report/${snapshotId}`);
      await expect(returned.locator("body")).toContainText(/Career DNA/, { timeout: 30_000 });

      await context.close();
    });

    // =====================================================================
    test("a second account cannot claim the same result", async ({ browser }) => {
      // =====================================================================
      //
      // The theft case. The staged record is transplanted into a second
      // browser, which is strictly more than an attacker can do — they would
      // have to be holding the victim's own claim link AND their browser
      // storage — and it still claims nothing.
      const victim = await browser.newContext({ locale: "sv-SE" });
      const vPage = await victim.newPage();
      const owner = newAccount();

      await vPage.goto("/security-career-assessment");
      await completeAssessment(vPage);
      await vPage.getByRole("button", { name: /Skapa konto och spara resultatet/ }).click();
      await vPage.waitForURL(/\/signup\?/);
      const staged = await stagedClaim(vPage);
      const claimUrl = `/security-career-assessment?claim=${encodeURIComponent(staged.token)}`;
      const ownerTab = await registerAndReturn(victim, vPage, owner, claimUrl);
      await ownerTab.waitForURL(/\/security-career-assessment\/report\//, { timeout: 60_000 });

      // A different person, a different browser, holding a copy of everything.
      const thief = await browser.newContext({ locale: "sv-SE" });
      const tPage = await thief.newPage();
      const thiefAccount = newAccount();
      await tPage.goto("/signup");
      await register(tPage, thiefAccount);
      await ensureSignedIn(tPage, thiefAccount);

      await tPage.evaluate(
        (raw) => window.localStorage.setItem("cqj:discovery:v31:pending-claim:v1", raw),
        staged.raw,
      );
      await tPage.goto(claimUrl);

      // Refused, as its own state, with no retry loop and nothing disclosed
      // about the account that owns it.
      await expect(tPage.getByText(/Resultatet är redan sparat/)).toBeVisible({ timeout: 60_000 });
      await expect(tPage.getByText(new RegExp(owner.email, "i"))).toHaveCount(0);

      // And My Career still has nothing of the victim's.
      await tPage.goto("/my-career");
      await expect(tPage.getByRole("link", { name: /Starta Career Discovery/ })).toHaveCount(0);

      await thief.close();
      await victim.close();
    });

    // =====================================================================
    test("English, and the small viewport", async ({ browser }) => {
      // =====================================================================
      for (const width of [375, 1440]) {
        const context = await browser.newContext({
          locale: "en-GB",
          viewport: { width, height: 900 },
        });
        const page = await context.newPage();
        const account = newAccount();

        await page.goto("/security-career-assessment");
        // The language switch is a client preference; assert on the English
        // copy the run actually renders rather than on the switcher's shape.
        await page.evaluate(() => window.localStorage.setItem("cqrityjob.lang", "en"));
        await page.reload();
        await expect(page.getByRole("button", { name: /Start the assessment/ })).toBeVisible({
          timeout: 60_000,
        });
        await expect(
          page.getByText(/No account needed|don't need an account/i).first(),
        ).toBeVisible();

        await completeAssessment(page);
        await expect(page.getByRole("heading", { name: /answered every question/i })).toBeVisible({
          timeout: 30_000,
        });

        // The primary action is reachable and not clipped at 375.
        const cta = page.getByRole("button", { name: /Create account and save my result/i });
        await expect(cta).toBeVisible();
        const box = await cta.boundingBox();
        expect(box, "the save CTA has a box").not.toBeNull();
        expect(box!.x).toBeGreaterThanOrEqual(0);
        expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, "no horizontal overflow").toBeLessThanOrEqual(1);

        await cta.click();
        await page.waitForURL(/\/signup\?/);
        const { token } = await stagedClaim(page);
        const claimUrl = `/security-career-assessment?claim=${encodeURIComponent(token)}`;
        const returned = await registerAndReturn(context, page, account, claimUrl);
        await returned.waitForURL(/\/security-career-assessment\/report\//, { timeout: 60_000 });
        await expect(returned.getByTestId("cd-claim-saved")).toBeVisible();

        await context.close();
      }
    });
  },
);
