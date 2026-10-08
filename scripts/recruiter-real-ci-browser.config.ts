import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { APP, readCIContext } from "./recruiter-real-ci-contract.mjs";
import { requireNativeMobilePreset } from "./recruiter-real-ci-mobile-preset";
const mobile375 = requireNativeMobilePreset(devices, "iPhone 13 Mini", 375);
const mobile390 = requireNativeMobilePreset(devices, "iPhone 14", 390);
const { stackRoot } = readCIContext();
export default defineConfig({
  testDir: "../e2e",
  testMatch: "recruiter-real-ci-browser.spec.ts",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  forbidOnly: true,
  captureGitInfo: { commit: false, diff: false },
  reporter: [["json"]],
  outputDir: join(stackRoot, "supabase/.temp/ri-real-browser/test-results"),
  use: { baseURL: APP, trace: "off", screenshot: "off", video: "off" },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "mobile-375",
      use: {
        ...mobile375,
        browserName: "chromium",
        viewport: { width: 375, height: 812 },
      },
    },
    {
      name: "mobile-390",
      use: {
        ...mobile390,
        browserName: "chromium",
        viewport: { width: 390, height: 844 },
      },
    },
  ],
});
