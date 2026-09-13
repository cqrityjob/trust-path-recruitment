import { defineConfig, devices } from "@playwright/test";

// H3.4A — Playwright configuration for the beta-critical candidate-to-
// employer smoke test (e2e/candidate-to-employer-application.spec.ts).
//
// Most specs here run against whatever backend SUPABASE_URL /
// VITE_SUPABASE_URL in .env point to, and are NOT auto-run against a live or
// shared backend -- see each spec's own header for why.
//
// The exception is a spec that WRITES: e2e/beskt-candidate-preparation.spec.ts
// refuses to run unless E2E_LOCAL_STACK=1 and the base URL is loopback.
// scripts/local-stack/up.sh builds the stack it needs.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],

  // ── NO GIT METADATA IN A PUBLISHED REPORT ────────────────────────────
  //
  // Playwright embeds the HEAD commit -- subject, FULL BODY, author name and
  // email -- into `config.metadata.gitCommit` of every report when CI is set.
  // Those reports are uploaded as artifacts anyone who can read the pull
  // request may download, so a commit body becomes published text and a
  // contributor's email address becomes a published email address.
  //
  // The E4 evidence pipeline found this the hard way: its leak scan refused
  // an artifact whose Playwright JSON carried strings that only ever appeared
  // in a commit message. Nothing about a test result needs the commit body.
  captureGitInfo: { commit: false, diff: false },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",

    // ── AN ALREADY-INSTALLED CHROMIUM, WHEN ONE IS ALL THERE IS ────────
    //
    // Opt-in and absent by default, so CI -- which installs the browser
    // Playwright asks for -- is unaffected. It exists because an image can
    // ship a pinned Chromium while blocking Playwright's download host, and
    // in that environment the only runnable browser is the one already on
    // disk. Pointing at it is a statement about the environment, not about
    // the tests; a version skew between the two is real and belongs in the
    // evidence report rather than hidden behind a default.
    ...(process.env.PW_CHROMIUM_PATH
      ? { launchOptions: { executablePath: process.env.PW_CHROMIUM_PATH } }
      : {}),
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    // Real viewports, not a resized desktop window. The two sizes are the
    // ones the brief names: iPhone 13 mini / SE-class at 375x812 and the
    // iPhone 14-class at 390x844. Anything that overflows horizontally at
    // 375 is broken for a large share of the people this product is for.
    // Chromium rather than the presets' WebKit: the device metrics that
    // matter here — viewport, DPR, touch and the mobile user agent — are
    // emulated identically, and pinning to the one engine the repository
    // already installs keeps this runnable in CI without a second download.
    {
      name: "mobile-375",
      use: {
        ...devices["iPhone 13 mini"],
        browserName: "chromium",
        viewport: { width: 375, height: 812 },
      },
    },
    {
      name: "mobile-390",
      use: {
        ...devices["iPhone 14"],
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
