// A separate app process for the isolated platform UX stack. No .env files are edited.
import fs from "node:fs";
import { spawn } from "node:child_process";
const status = JSON.parse(
  fs.readFileSync("/private/tmp/cqrity-platform-ux-20261015/status.json", "utf8"),
);
if (status.API_URL !== "http://127.0.0.1:57721") throw Error("LOCAL_TEST_STACK_REQUIRED");
const app = spawn("bun", ["run", "dev", "--host", "127.0.0.1", "--port", "3170"], {
  stdio: "inherit",
  env: {
    ...process.env,
    SUPABASE_URL: status.API_URL,
    VITE_SUPABASE_URL: status.API_URL,
    SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
    VITE_SUPABASE_PUBLISHABLE_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    VITE_SUPABASE_PROJECT_ID: "cqrity-platform-ux-20261015",
    PUBLIC_SITE_URL: "http://127.0.0.1:3170",
    VITE_PUBLIC_SITE_URL: "http://127.0.0.1:3170",
    VITE_PASSPORT_LOCAL_INTEGRATION: "1",
    RESEND_API_KEY: "",
    RESEND_FROM_EMAIL: "",
  },
});
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => app.kill(signal));
app.on("exit", (code) => process.exit(code ?? 1));
