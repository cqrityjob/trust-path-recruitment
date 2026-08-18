import { defineConfig, devices } from "@playwright/test";

// H3.4A — Playwright configuration for the beta-critical candidate-to-
// employer smoke test (e2e/candidate-to-employer-application.spec.ts).
//
// This project has no local Supabase stack (no Docker/CLI available in
// this environment) -- every browser session runs against whatever
// backend SUPABASE_URL / VITE_SUPABASE_URL in .env point to. See the spec
// file's own header comment for why this test is NOT auto-run against a
// live/shared backend by default.
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
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
