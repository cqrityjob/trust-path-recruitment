import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "../e2e",
  testMatch: "interview-real-auth-storage-local.spec.ts",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  forbidOnly: true,
  captureGitInfo: { commit: false, diff: false },
  reporter: [["list"]],
  outputDir:
    "/Users/mostafas/.codex/visualizations/2026/10/07/01a11715-e113-77e1-9f70-baee7b636c8c/ri-real-stack-20261008/supabase/.temp/ri-real-browser/test-results",
  use: { baseURL: "http://127.0.0.1:3140", trace: "off", screenshot: "off", video: "off" },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
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
