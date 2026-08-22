import { readFileSync } from "node:fs";

import {
  getSupabaseAdminConfig,
  getSupabasePublicConfig,
} from "../src/integrations/supabase/config";

const EXPECTED_PROJECT = "mlvzmiutmyyqeuvjglco";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const publicConfig = getSupabasePublicConfig();
assert(
  publicConfig.source === "cqrityjob-owned",
  "The CQrityjob-owned Supabase override is not active.",
);
assert(
  new URL(publicConfig.url).hostname === `${EXPECTED_PROJECT}.supabase.co`,
  "The owned public URL does not match the canonical project.",
);

const supabaseConfig = readFileSync("supabase/config.toml", "utf8");
assert(
  supabaseConfig.includes(`project_id = "${EXPECTED_PROJECT}"`),
  "supabase/config.toml does not point at the canonical project.",
);

const policy = JSON.parse(readFileSync("supabase/migrations-policy.json", "utf8")) as {
  canonicalProject?: { hostedSupabaseRef?: string };
};
assert(
  policy.canonicalProject?.hostedSupabaseRef === EXPECTED_PROJECT,
  "Migration policy and canonical project disagree.",
);

const committedEnv = readFileSync(".env", "utf8");
assert(
  !/^CQRITYJOB_SUPABASE_SERVICE_ROLE_KEY=/m.test(committedEnv),
  "The server-only service-role key must never be committed.",
);

const previousLegacyKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const previousOwnedKey = process.env.CQRITYJOB_SUPABASE_SERVICE_ROLE_KEY;
process.env.SUPABASE_SERVICE_ROLE_KEY = "legacy-backend-sentinel";
delete process.env.CQRITYJOB_SUPABASE_SERVICE_ROLE_KEY;

let failedClosed = false;
try {
  getSupabaseAdminConfig();
} catch (error) {
  failedClosed = String(error).includes("CQRITYJOB_SUPABASE_SERVICE_ROLE_KEY");
} finally {
  if (previousLegacyKey === undefined) {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  } else {
    process.env.SUPABASE_SERVICE_ROLE_KEY = previousLegacyKey;
  }
  if (previousOwnedKey === undefined) {
    delete process.env.CQRITYJOB_SUPABASE_SERVICE_ROLE_KEY;
  } else {
    process.env.CQRITYJOB_SUPABASE_SERVICE_ROLE_KEY = previousOwnedKey;
  }
}

assert(
  failedClosed,
  "Owned public config was allowed to fall back to the legacy service-role key.",
);

console.log(
  "supabase-owned-cutover:check OK (canonical target aligned; cross-backend admin fallback blocked)",
);
