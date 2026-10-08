import { defineConfig } from "@playwright/test";
import path from "node:path";
import { APP, readContext } from "./passport-native-op09-contract.mjs";
const context = readContext();
export default defineConfig({
  testDir: "../e2e",
  testMatch: "passport-native-op09.spec.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  captureGitInfo: { commit: false, diff: false },
  reporter: [["json"]],
  timeout: 180_000,
  outputDir: path.join(context.stackRoot, "supabase/.temp/browser/test-results"),
  use: { baseURL: APP, trace: "off", screenshot: "off", video: "off", browserName: "chromium" },
});
