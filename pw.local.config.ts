// Local-only Playwright config: the container ships Chromium 1194 while the
// pinned @playwright/test wants 1243, so the executable is pointed at the
// one that is actually installed. Not committed; the repo config is unchanged.
import { defineConfig, devices } from "@playwright/test";

const exe = "/opt/pw-browsers/chromium/chrome-linux/chrome";
const real = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3100",
    trace: "off",
    screenshot: "off",
    launchOptions: { executablePath: real },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
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
