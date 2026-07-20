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
  ],
});
