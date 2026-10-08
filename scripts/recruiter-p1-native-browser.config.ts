import { defineConfig, devices } from "@playwright/test";
import { join } from "node:path";
import { APP } from "./recruiter-p1-native-contract.mjs";

const root = process.env.GITHUB_WORKSPACE;
if (!root || process.env.RI_P1_NATIVE_DISPOSABLE !== "1" || process.env.GITHUB_ACTIONS !== "true")
  throw Error("P1_NATIVE_BROWSER_EPHEMERAL_ONLY");
export default defineConfig({
  testDir: join(root, "p1-native-stack/supabase/.temp/browser"),
  testMatch: "recruiter-intelligence-p1-native.spec.ts",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  forbidOnly: true,
  captureGitInfo: { commit: false, diff: false },
  reporter: [["json"]],
  outputDir: join(root, "p1-native-stack/supabase/.temp/browser/results"),
  use: { baseURL: APP, trace: "off", screenshot: "off", video: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
