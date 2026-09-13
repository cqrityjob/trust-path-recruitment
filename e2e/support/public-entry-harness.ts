// Shared harness for the two routed public-entry suites.
//
// ── WHAT IT GUARANTEES ─────────────────────────────────────────────────
//
//   * NOTHING REACHES PRODUCTION. `.env` is committed and points at a real
//     Supabase project, so a browser suite that merely "does not log in" is
//     one forgotten `page.goto` away from talking to it. `blockProduction`
//     intercepts every request to a Supabase host and to `/_serverFn/`, and
//     any call that is not explicitly stubbed is recorded and fails the test
//     rather than being answered. No test in these suites writes anything,
//     anywhere.
//   * THE SESSION IS PLANTED, NEVER OBTAINED. supabase-js derives its
//     storage key from the project URL, so the key is OBSERVED rather than
//     hardcoded — hardcoding one means the day the URL changes the suite
//     quietly stops testing the signed-in path.
//   * EVIDENCE IS A BY-PRODUCT OF THE ASSERTIONS. `shot()` writes into the
//     evidence directory from the SAME page the assertions just ran against,
//     so a screenshot cannot show a state no test verified.
//
// Run through `bun run e2e:public-entry`, which CI's `public-entry-browser`
// job executes against a real dev server.

import { expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3100";

/** Where the routed evidence lands. CI uploads this directory whatever the
 *  outcome, so a reviewer can look at the run rather than read about it. */
export const EVIDENCE_DIR = path.resolve(
  process.env.PUBLIC_ENTRY_EVIDENCE_DIR ?? "artifacts/public-entry-browser",
);

/** The widths the specification names in §12. Every responsive assertion in
 *  both suites iterates exactly this list. */
export const REQUIRED_WIDTHS = [320, 375, 390, 768, 1024, 1440] as const;

/** The specification's minimum hit area (§4.2 and §12). Both dimensions.
 *  There is deliberately no exception list here: the previous suite carried
 *  one for the desktop header's 36px controls and for footer links measured
 *  on height alone, and it is gone. */
export const MIN_TARGET = 44;

const USER_ID = "00000000-0000-4000-8000-0000publicentry".slice(0, 36);

/* ── Server-function plumbing ────────────────────────────────────────── */

/** The export name behind a `/_serverFn/<base64url>` URL. Same decoder as
 *  e2e/support/cv-fixture.ts; duplicated rather than imported so these
 *  suites do not depend on the CV fixture's model. */
export function exportOf(url: string): string | null {
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

export type ServerFnTable = Record<string, unknown>;

/** Everything a scenario refused to answer. Asserted empty at the end of
 *  each test that installs the harness, so a route that grew a new server
 *  call fails loudly instead of silently rendering an error state the
 *  assertions then misread as the state under test. */
export type Refusals = { unstubbed: string[]; production: string[] };

/**
 * Install the network boundary.
 *
 * Every `/_serverFn/` call is answered from `table` in the TanStack Start
 * envelope (`{ result, error, context }`) — a bare value reads as `undefined`
 * on the client and sends the page down its own error branch, which is a real
 * state but never the one under test. An export missing from the table is
 * recorded and answered 500, so the test fails on the refusal rather than on
 * whatever the page rendered afterwards.
 *
 * Every request to a Supabase host is refused outright unless it is one of
 * the two auth endpoints a planted session legitimately needs, which are
 * answered locally. Production is unreachable by construction.
 */
export async function installBoundary(page: Page, table: ServerFnTable = {}): Promise<Refusals> {
  const refusals: Refusals = { unstubbed: [], production: [] };

  await page.route("**/_serverFn/**", async (route) => {
    const name = exportOf(route.request().url()) ?? "(unparseable)";
    if (!(name in table)) {
      refusals.unstubbed.push(name);
      return route.fulfill({ status: 500, contentType: "text/plain", body: `unstubbed ${name}` });
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ result: table[name] ?? null, error: null, context: {} }),
    });
  });

  // The two auth endpoints a planted session actually calls. Answered here,
  // never upstream.
  await page.route("**/auth/v1/user**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ id: USER_ID, aud: "authenticated", email: "e2e@example.test" }),
    }),
  );
  await page.route("**/auth/v1/token**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        access_token: "e2e-access-token",
        refresh_token: "e2e-refresh-token",
        token_type: "bearer",
        expires_in: 3600,
        user: { id: USER_ID, aud: "authenticated", email: "e2e@example.test" },
      }),
    }),
  );

  // Anything else aimed at a Supabase host is a leak. Record and abort.
  for (const pattern of ["**://*.supabase.co/**", "**://*.supabase.in/**"]) {
    await page.route(pattern, async (route) => {
      refusals.production.push(route.request().url());
      return route.abort();
    });
  }

  return refusals;
}

export function assertNoRefusals(refusals: Refusals): void {
  expect(
    refusals.production,
    `the page tried to reach a Supabase host: ${refusals.production.join(", ")}`,
  ).toEqual([]);
  expect(
    [...new Set(refusals.unstubbed)],
    `unstubbed server functions: ${[...new Set(refusals.unstubbed)].join(", ")}`,
  ).toEqual([]);
}

/* ── Session ─────────────────────────────────────────────────────────── */

/** supabase-js derives its storage key from the project URL, so the key is
 *  OBSERVED: `getItem` is wrapped before the first load and records every
 *  `sb-*-auth-token` the client asks for. */
export async function observeSupabaseStorageKey(page: Page): Promise<string> {
  await page.addInitScript(() => {
    const seen: string[] = [];
    (window as unknown as { __sbKeys: string[] }).__sbKeys = seen;
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = function patched(key: string) {
      if (/^sb-.*-auth-token$/.test(key) && !seen.includes(key)) seen.push(key);
      return original.call(this, key);
    };
  });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const key = await page.evaluate(
    () => (window as unknown as { __sbKeys: string[] }).__sbKeys[0] ?? null,
  );
  expect(key, "the homepage never read a Supabase session key").not.toBeNull();
  return key as string;
}

/**
 * Plant a session.
 *
 * `userMetadata` exists for one assertion and one only: that user-supplied
 * metadata grants nothing. A test passes an organisation claim in it and then
 * proves the product still routes from what the SERVER returned.
 */
export async function plantSession(
  page: Page,
  storageKey: string,
  userMetadata: Record<string, unknown> = {},
): Promise<void> {
  await page.evaluate(
    ([key, uid, meta]) => {
      window.localStorage.setItem(
        key as string,
        JSON.stringify({
          access_token: "e2e-access-token",
          refresh_token: "e2e-refresh-token",
          token_type: "bearer",
          expires_in: 3600,
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: {
            id: uid as string,
            aud: "authenticated",
            role: "authenticated",
            email: "e2e@example.test",
            user_metadata: meta as Record<string, unknown>,
          },
        }),
      );
    },
    [storageKey, USER_ID, userMetadata] as const,
  );
}

/* ── Language ────────────────────────────────────────────────────────── */

export async function setLang(page: Page, lang: "sv" | "en"): Promise<void> {
  await page.evaluate((l) => window.localStorage.setItem("cqrityjob.lang", l), lang);
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe(lang);
}

/* ── Measurement ─────────────────────────────────────────────────────── */

export async function horizontalOverflow(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

export type Target = { scope: string; text: string; w: number; h: number };

/**
 * Every VISIBLE interactive control in the header, main and footer that is
 * smaller than 44 x 44.
 *
 * Measured on `getBoundingClientRect()` — the element's real box. A padding
 * trick or an absolutely positioned pseudo-element would not satisfy it, and
 * that is deliberate: the specification asks for a target, not for a way of
 * describing one. Zero-height elements are the compact menu's rows while the
 * sheet is closed and are skipped rather than counted as failures.
 */
export async function undersizedTargets(page: Page, min = MIN_TARGET): Promise<Target[]> {
  return page.evaluate((m) => {
    const out: { scope: string; text: string; w: number; h: number }[] = [];
    for (const scope of ["header", "main", "footer"]) {
      const root = document.querySelector(scope);
      if (!root) continue;
      for (const el of root.querySelectorAll<HTMLElement>("a[href], button, [role='button']")) {
        const r = el.getBoundingClientRect();
        if (r.height === 0 || r.width === 0) continue;
        if (getComputedStyle(el).visibility === "hidden") continue;
        if (r.height < m || r.width < m) {
          out.push({
            scope,
            text:
              (el.textContent ?? "").trim().slice(0, 40) ||
              el.getAttribute("aria-label") ||
              "(no label)",
            w: Math.round(r.width),
            h: Math.round(r.height),
          });
        }
      }
    }
    return out;
  }, min);
}

/* ── Evidence ────────────────────────────────────────────────────────── */

const MANIFEST = path.join(EVIDENCE_DIR, "manifest.json");

type Manifest = {
  capturedFrom: string;
  startedAt: string;
  shots: { file: string; note: string }[];
};

/** The directory and an empty manifest exist from the moment this module
 *  loads, so the CI upload step's `if-no-files-found: error` fires only when
 *  the harness genuinely never ran — never merely because a suite failed
 *  before its first screenshot. */
function readManifest(): Manifest {
  try {
    return JSON.parse(fs.readFileSync(MANIFEST, "utf8")) as Manifest;
  } catch {
    return { capturedFrom: BASE, startedAt: new Date().toISOString(), shots: [] };
  }
}

fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
if (!fs.existsSync(MANIFEST)) {
  fs.writeFileSync(MANIFEST, JSON.stringify(readManifest(), null, 2));
}

/**
 * A full-page screenshot of the state the assertions just ran against, plus
 * a line in the manifest. Called AFTER the assertions in a test, never
 * instead of them.
 *
 * The manifest is read back from disk on every call rather than held in
 * module state: both suites write to the same directory, and whichever file
 * Playwright loads second would otherwise start from an empty array and
 * erase the first one's entries.
 */
export async function shot(page: Page, name: string, note: string): Promise<void> {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
  const file = `${name}.png`;
  await page.screenshot({ path: path.join(EVIDENCE_DIR, file), fullPage: true });
  const current = readManifest();
  current.shots = [...current.shots.filter((x) => x.file !== file), { file, note }];
  fs.writeFileSync(MANIFEST, JSON.stringify(current, null, 2));
}
