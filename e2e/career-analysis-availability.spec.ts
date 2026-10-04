// Karriäranalysen, in each state of the release control, as a SIGNED-IN ACCOUNT
// THAT IS NOT AN INTERNAL TESTER, clicked through in a real browser.
//
//   internal_test (production today)   the analysis is closed to this account
//   public        (the launch)         the analysis is open to this account
//   paused        (the hard stop)      closed to everyone
//
// The owner opens it with one call, cd_set_access_state('public', ...), a path
// never exercised in production. This walks what a plain candidate then SEES:
// every link into the analysis, the route itself, the saved report (readable in
// every state, with its download control), the history, and the claim of a run
// finished anonymously, including a run refused because the control moved
// mid-run. Swedish and English, desktop and 375 px (run it under both
// projects).
//
// Backend handling follows e2e/career-center-journey.spec.ts: every
// `/_serverFn/*` call is intercepted and an unstubbed one fails loudly, so the
// real client, real routes and real components run against a scripted server.
// The database half of the same matrix is supabase/tests/
// cd_availability_matrix_test.sql; the rule is scripts/career-analysis-
// availability-check.ts; the render matrix is scripts/career-analysis-
// surfaces-check.tsx.
//
// Run: E2E_BASE_URL=http://127.0.0.1:3100 bunx playwright test \
//        e2e/career-analysis-availability.spec.ts \
//        --project=chromium --project=mobile-375

import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import {
  CLAIM_STORAGE_KEY,
  COMPLETED_AT,
  finishedBuffer,
  realSnapshot,
  stagedClaimRecord,
} from "./support/career-analysis-fixtures";

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const USER_ID = "00000000-0000-4000-8000-00000000a0a0";
const SNAPSHOT_ID = "33333333-3333-4333-8333-333333333333";
const BUFFER_KEY = "cqj:discovery:v31:public-buffer:v1";
const ENTRANCE = 'a[href="/security-career-assessment"]';

type State = "internal_test" | "public" | "paused";
type Lang = "sv" | "en";
const STATES: readonly State[] = ["internal_test", "public", "paused"];
const LANGS: readonly Lang[] = ["sv", "en"];

type Reply = { body: unknown } | { error: string };
const ok = (body: unknown): Reply => ({ body });

function exportOf(url: string): string | null {
  const m = /\/_serverFn\/([A-Za-z0-9_-]+)/.exec(url);
  if (!m) return null;
  try {
    const json = JSON.parse(
      Buffer.from(m[1]!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"),
    );
    return String(json.export ?? "").replace(/_createServerFn_handler$/, "");
  } catch {
    return null;
  }
}

/** The scripted server: what the release control says RIGHT NOW (mutable, so a
 *  test can move it mid-run), plus every other read the pages make. */
class Server {
  state: State;
  calls: Record<string, number> = {};
  unmatched: string[] = [];
  extra: Record<string, Reply | ((s: Server) => Reply)> = {};
  constructor(state: State) {
    this.state = state;
  }
  count(name: string): number {
    return this.calls[name] ?? 0;
  }
  reply(name: string): Reply | null {
    if (name in this.extra) {
      const r = this.extra[name]!;
      return typeof r === "function" ? r(this) : r;
    }
    switch (name) {
      // The control, as the account under test sees it: a PLAIN account, not on
      // the allowlist. cd_v31_may_start: admitted only under `public`.
      case "getV31Availability":
        return ok({
          available: this.state !== "paused",
          lifecycleStatus: "active",
          outstandingGates: 7,
          accessState: this.state,
        });
      case "getV31TesterStatus":
        return ok({ allowed: this.state === "public", answered: true });
      case "trackV31FunnelEvent":
        return ok({ recorded: true });
      case "countMyAcademyWork":
        return ok({ total: 0, actionable: 0 });
      case "countMyReviewQueue":
        return ok(0);
      case "listMyEmployerWorkspaces":
        return ok([]);
      case "getMySecurityCareerProfile":
        return ok(null);
      case "getActiveCareerReport":
        return ok({ kind: "none" });
      default:
        return null;
    }
  }
}

async function stub(page: Page, server: Server): Promise<void> {
  await page.route("**/_serverFn/**", async (route) => {
    const name = exportOf(route.request().url()) ?? "?";
    server.calls[name] = (server.calls[name] ?? 0) + 1;
    const reply = server.reply(name);
    if (!reply) {
      server.unmatched.push(name);
      return route.fulfill({ status: 500, contentType: "text/plain", body: `UNSTUBBED:${name}` });
    }
    if ("error" in reply) {
      return route.fulfill({ status: 500, contentType: "text/plain", body: reply.error });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ result: reply.body, error: null, context: {} }),
    });
  });
}

async function signIn(page: Page): Promise<void> {
  await page.route("**/auth/v1/user**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: USER_ID, aud: "authenticated", email: "plain@example.test" }),
    }),
  );
  await page.addInitScript((uid) => {
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (key: string) {
      if (/^sb-.*-auth-token$/.test(key)) {
        return JSON.stringify({
          access_token: "e2e-access-token",
          refresh_token: "e2e-refresh-token",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: uid, aud: "authenticated", role: "authenticated", email: "p@example.test" },
        });
      }
      return getItem.call(this, key);
    };
  }, USER_ID);
}

async function setLang(page: Page, lang: Lang): Promise<void> {
  await page.addInitScript((l) => {
    try {
      window.localStorage.setItem("cqrityjob.lang", l);
    } catch {
      /* private mode */
    }
  }, lang);
}

async function noHorizontalScroll(page: Page): Promise<void> {
  const o = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  expect(o.scrollW).toBeLessThanOrEqual(o.clientW + 1);
}

/** What the two languages say. Matched loosely: the point is WHICH sentence,
 *  not the punctuation. */
const CLOSED_SENTENCE: Record<Lang, RegExp> = {
  sv: /inte öppen för nya deltagare just nu/,
  en: /not open to new participants right now/,
};
const ACCOUNT_TITLE: Record<Lang, RegExp> = {
  sv: /inte öppen för ditt konto/,
  en: /not open to your account/,
};
const PAUSED_TITLE: Record<Lang, RegExp> = {
  sv: /pausad just nu/,
  en: /paused right now/,
};

const REPORT = (lang: Lang) => ({
  status: "v3.1",
  snapshotId: SNAPSHOT_ID,
  sessionId: null,
  generatedAt: COMPLETED_AT,
  versions: {
    definition: "2026-scd-v3.1.0",
    content: "v3.1-draft-5",
    scoring: "v3.1-draft-4",
    taxonomy: "cig-areas-v1",
  },
  snapshot: realSnapshot(lang),
});

/* ================================================================== */

for (const lang of LANGS) {
  test.describe(`[${lang}] a signed-in account outside the test group`, () => {
    for (const state of STATES) {
      const open = state === "public";

      test(`${state}: the career centre and a guide ${open ? "offer" : "withdraw"} the analysis`, async ({
        page,
      }) => {
        const server = new Server(state);
        await stub(page, server);
        await signIn(page);
        await setLang(page, lang);

        await page.goto(`${BASE}/career-center`, { waitUntil: "networkidle" });
        // The hero's second door, and the personal section's own offer.
        await expect(page.locator('[data-cta="career-entry-assessment"]')).toHaveCount(
          open ? 1 : 0,
        );
        await expect(page.locator("#min-riktning").locator(ENTRANCE)).toHaveCount(open ? 1 : 0);
        if (!open) {
          await expect(page.locator("#min-riktning")).toContainText(CLOSED_SENTENCE[lang]);
          // Withdrawn, never replaced by something that looks like it: the way
          // on (every profession) is still there.
          await expect(page.locator("[data-explore-catalogue]").first()).toBeVisible();
        }
        await expect(page.locator(ENTRANCE)).toHaveCount(open ? 2 : 0);

        // A profession guide: its analysis card.
        await page.goto(`${BASE}/career-center/security-officer`, { waitUntil: "networkidle" });
        await expect(page.locator(ENTRANCE)).toHaveCount(open ? 1 : 0);
        await expect(page.locator("[data-career-analysis-closed]")).toHaveCount(open ? 0 : 1);
        if (!open) {
          await expect(page.locator("[data-career-analysis-closed]")).toContainText(
            CLOSED_SENTENCE[lang],
          );
        }
        await noHorizontalScroll(page);
        expect(server.unmatched, "no read was left unstubbed").toEqual([]);
      });

      test(`${state}: the route says the truth and offers a way on, never a retry`, async ({
        page,
      }) => {
        const server = new Server(state);
        await stub(page, server);
        await signIn(page);
        await setLang(page, lang);
        await page.goto(`${BASE}/security-career-assessment`, { waitUntil: "networkidle" });

        const closed = page.getByTestId("cd-closed");
        if (open) {
          // Public: the door is open for this account. A signed-in reader with
          // no profile meets the profile gate first ("Vill du ha en mer
          // personlig karriärresa?" with "Gör testet nu"), the intro otherwise:
          // a heading and a button to go on, and no refusal anywhere.
          const main = page.getByRole("main");
          await expect(main.getByRole("heading").first()).toBeVisible({ timeout: 30_000 });
          await expect(main.getByRole("button").first()).toBeVisible();
          await expect(closed).toHaveCount(0);
          await expect(main.getByRole("heading").first()).not.toHaveText(
            new RegExp(`${ACCOUNT_TITLE[lang].source}|${PAUSED_TITLE[lang].source}`),
          );
        } else {
          await expect(closed).toBeVisible({ timeout: 30_000 });
          await expect(closed).toHaveAttribute(
            "data-closed-reason",
            state === "paused" ? "paused" : "account",
          );
          await expect(closed.locator("h1")).toHaveText(
            state === "paused" ? PAUSED_TITLE[lang] : ACCOUNT_TITLE[lang],
          );
          // The ways on, for a signed-in account.
          await expect(closed.locator('a[href="/career-center"]')).toBeVisible();
          await expect(closed.locator('a[href="/passport"]')).toBeVisible();
          await expect(closed.locator('a[href="/my-career"]')).toBeVisible();
          // And no retry: a refusal that cannot succeed offers no button.
          await expect(closed.getByRole("button")).toHaveCount(0);
          await expect(closed.locator(ENTRANCE)).toHaveCount(0);
          await noHorizontalScroll(page);
          // Nothing loops: the number of reads is settled (the dev server's
          // StrictMode runs an effect twice; a retry loop would keep growing).
          const settled = server.count("getV31Availability");
          await page.waitForTimeout(1500);
          expect(server.count("getV31Availability")).toBe(settled);
          expect(settled).toBeLessThanOrEqual(2);
        }
        expect(server.unmatched, "no read was left unstubbed").toEqual([]);
      });

      test(`${state}: the saved report stays readable, with its download control`, async ({
        page,
      }) => {
        const server = new Server(state);
        server.extra.getStoredDiscoveryReport = ok(REPORT(lang));
        await stub(page, server);
        await signIn(page);
        await setLang(page, lang);
        await page.addInitScript(() => {
          (window as unknown as { __printed: number }).__printed = 0;
          window.print = () => {
            (window as unknown as { __printed: number }).__printed += 1;
          };
        });
        await page.goto(`${BASE}/security-career-assessment/report/${SNAPSHOT_ID}`, {
          waitUntil: "networkidle",
        });
        await expect(page.locator('[data-report-contract="v3.1"]')).toBeVisible({
          timeout: 30_000,
        });
        // Reading is never state-gated: paused included.
        const print = page.locator("[data-print-report]");
        await expect(print).toBeVisible();
        await expect(print).toHaveAccessibleName(/Ladda ner resultat|Download result/);
        await print.click();
        expect(
          await page.evaluate(() => (window as unknown as { __printed: number }).__printed),
        ).toBe(1);
        // The retake link follows the same door as every other offer.
        await expect(page.locator("[data-retake-analysis]")).toHaveCount(open ? 1 : 0);
        await noHorizontalScroll(page);
        expect(server.unmatched, "no read was left unstubbed").toEqual([]);
      });

      test(`${state}: an empty history ${open ? "offers" : "withdraws"} the start button`, async ({
        page,
      }) => {
        const server = new Server(state);
        server.extra.listMyDiscoveryReports = ok({ reports: [] });
        await stub(page, server);
        await signIn(page);
        await setLang(page, lang);
        await page.goto(`${BASE}/security-career-assessment/history`, { waitUntil: "networkidle" });
        await expect(page.locator(ENTRANCE)).toHaveCount(open ? 1 : 0);
        await expect(page.locator("[data-career-analysis-closed]")).toHaveCount(open ? 0 : 1);
        await noHorizontalScroll(page);
        expect(server.unmatched, "no read was left unstubbed").toEqual([]);
      });
    }
  });
}

/* ================================================================== */

test.describe("the claim of a run finished anonymously", () => {
  const TOKEN = "e2e-claim-token-0123456789";

  async function stageClaim(page: Page, lang: Lang): Promise<void> {
    await page.addInitScript(
      ([key, record]) => {
        window.localStorage.setItem(key as string, JSON.stringify(record));
      },
      [CLAIM_STORAGE_KEY, stagedClaimRecord(TOKEN, lang)] as const,
    );
  }
  const stagedStill = (page: Page) =>
    page.evaluate((key) => window.localStorage.getItem(key) !== null, CLAIM_STORAGE_KEY);

  for (const state of ["internal_test", "public"] as const) {
    test(`${state}: a plain account's finished run is saved, never turned away`, async ({
      page,
    }) => {
      const server = new Server(state);
      server.extra.previewPublicV31Run = ok({
        snapshot: realSnapshot("sv"),
        completedAt: COMPLETED_AT,
      });
      server.extra.persistPublicV31Run = ok({ snapshotId: SNAPSHOT_ID, created: true });
      await stub(page, server);
      await signIn(page);
      await setLang(page, "sv");
      await stageClaim(page, "sv");
      await page.goto(`${BASE}/security-career-assessment?claim=${TOKEN}`);
      await expect(page.getByTestId("claim-active-account")).toContainText("p@example.test");
      expect(server.count("persistPublicV31Run"), "no silent claim on a reused session").toBe(0);
      if (process.env.CQRITY_FLOW_SHOTS && state === "public") {
        mkdirSync(process.env.CQRITY_FLOW_SHOTS, { recursive: true });
        await page.getByTestId("claim-active-account").scrollIntoViewIfNeeded();
        await page.screenshot({
          path: `${process.env.CQRITY_FLOW_SHOTS}/after-claim-account-${page.viewportSize()?.width}.png`,
        });
      }
      await page.getByRole("button", { name: "Spara resultatet på det här kontot" }).click();
      // Saved, and sent home to the place the result now lives.
      await expect(page).toHaveURL(new RegExp(`/my-career\\?savedReport=${SNAPSHOT_ID}`), {
        timeout: 45_000,
      });
      expect(server.count("persistPublicV31Run"), "saved exactly once").toBe(1);
      // Cleared only after the confirmed write.
      expect(await stagedStill(page)).toBe(false);
    });
  }

  test("an account changed in another tab cannot silently receive the result", async ({ page }) => {
    const server = new Server("public");
    server.extra.previewPublicV31Run = ok({
      snapshot: realSnapshot("sv"),
      completedAt: COMPLETED_AT,
    });
    await stub(page, server);
    await signIn(page);
    await setLang(page, "sv");
    await stageClaim(page, "sv");
    await page.goto(`${BASE}/security-career-assessment?claim=${TOKEN}`);
    await expect(page.getByTestId("claim-active-account")).toContainText("p@example.test");
    await page.route("**/auth/v1/user**", (route) =>
      route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          id: "00000000-0000-4000-8000-00000000b0b0",
          aud: "authenticated",
          email: "other@example.test",
        }),
      }),
    );
    await page.getByRole("button", { name: "Spara resultatet på det här kontot" }).click();
    await expect(page.getByRole("alert")).toContainText("Det aktiva kontot har ändrats");
    await expect(page.getByTestId("claim-active-account")).toContainText("other@example.test");
    expect(server.count("persistPublicV31Run")).toBe(0);
    expect(await stagedStill(page)).toBe(true);
  });

  test("paused: the run is kept and the person is told so, with no retry", async ({ page }) => {
    const server = new Server("paused");
    await stub(page, server);
    await signIn(page);
    await setLang(page, "sv");
    await stageClaim(page, "sv");
    await page.goto(`${BASE}/security-career-assessment?claim=${TOKEN}`, {
      waitUntil: "networkidle",
    });
    const closed = page.getByTestId("cd-closed");
    await expect(closed).toHaveAttribute("data-closed-reason", "paused");
    const keep = page.getByTestId("cd-closed-keep");
    await expect(keep).toHaveAttribute("data-keep", "claim");
    await expect(keep).not.toContainText("{date}");
    await expect(closed.getByRole("button")).toHaveCount(0);
    // Nothing was written and nothing was lost.
    expect(server.count("persistPublicV31Run")).toBe(0);
    expect(await stagedStill(page)).toBe(true);
    await noHorizontalScroll(page);
  });

  test("the control moves mid-run: the save is refused, told as what it is, not retried", async ({
    page,
  }) => {
    const server = new Server("public");
    server.extra.previewPublicV31Run = ok({
      snapshot: realSnapshot("en"),
      completedAt: COMPLETED_AT,
    });
    // The save finds the analysis paused.
    server.extra.persistPublicV31Run = (s) => {
      s.state = "paused";
      return { error: "not_available" };
    };
    await stub(page, server);
    await signIn(page);
    await setLang(page, "en");
    await stageClaim(page, "en");
    await page.goto(`${BASE}/security-career-assessment?claim=${TOKEN}`);
    await page.getByRole("button", { name: "Save the result to this account" }).click();
    const closed = page.getByTestId("cd-closed");
    await expect(closed).toBeVisible({ timeout: 45_000 });
    await expect(closed).toHaveAttribute("data-closed-reason", "paused");
    await expect(page.getByTestId("cd-closed-keep")).toHaveAttribute("data-keep", "claim");
    await expect(closed.getByRole("button")).toHaveCount(0);
    await expect(page.getByText(/could not be saved/i)).toHaveCount(0);
    // One attempt. A loop would show up here.
    await page.waitForTimeout(1500);
    expect(server.count("persistPublicV31Run")).toBe(1);
    expect(await stagedStill(page)).toBe(true);
  });

  test("a signed-out visitor mid-run when it is paused: told so, answers kept, no retry loop", async ({
    page,
  }) => {
    const server = new Server("public");
    // The result build finds the analysis paused.
    server.extra.previewPublicV31Run = (s) => {
      s.state = "paused";
      return { error: "not_available" };
    };
    await stub(page, server);
    await setLang(page, "sv");
    await page.addInitScript(
      ([key, buffer]) => {
        window.sessionStorage.setItem(key as string, JSON.stringify(buffer));
      },
      [BUFFER_KEY, finishedBuffer("sv")] as const,
    );
    await page.goto(`${BASE}/security-career-assessment`);
    const closed = page.getByTestId("cd-closed");
    await expect(closed).toBeVisible({ timeout: 45_000 });
    await expect(closed).toHaveAttribute("data-closed-reason", "paused");
    await expect(page.getByTestId("cd-closed-keep")).toHaveAttribute("data-keep", "tab");
    // Signed out: the Passport's public page, no My Career.
    await expect(closed.locator('a[href="/security-passport"]')).toBeVisible();
    await expect(closed.locator('a[href="/my-career"]')).toHaveCount(0);
    await expect(closed.getByRole("button")).toHaveCount(0);
    await page.waitForTimeout(1500);
    expect(server.count("previewPublicV31Run"), "refused once, not retried").toBe(1);
    await noHorizontalScroll(page);
  });
});
