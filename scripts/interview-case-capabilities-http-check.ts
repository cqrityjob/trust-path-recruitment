// Executes the application's actual reader against local PostgREST as each actor.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHmac } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/database";
import { readInterviewCaseCapabilities } from "../src/lib/interview-intelligence/case-capabilities";
const origin = process.env.INTERVIEW_ACCESS_API_URL || "http://127.0.0.1:59133";
if (!["127.0.0.1", "localhost"].includes(new URL(origin).hostname)) throw Error("Local API only");
const { actors: a, cases: c } = JSON.parse(
  readFileSync(
    process.env.INTERVIEW_ACCESS_FIXTURE || "/tmp/interview-access-evidence/api-fixture.json",
    "utf8",
  ),
);
let count = 0;
for (const [name, uid] of Object.entries(a).filter(([k]) =>
  ["ow", "gr", "pn", "pm", "rv", "xo", "c1", "pa"].includes(k),
)) {
  const h = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const b = Buffer.from(
    JSON.stringify({ role: "authenticated", sub: uid, exp: Math.floor(Date.now() / 1000) + 600 }),
  ).toString("base64url");
  const jwt =
    h +
    "." +
    b +
    "." +
    createHmac("sha256", "synthetic-interview-access-jwt-secret-at-least-32-chars")
      .update(h + "." + b)
      .digest("base64url");
  const db = createClient<Database>(origin, "local-test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: "Bearer " + jwt },
      fetch: async (input, init) => fetch(String(input).replace(origin + "/rest/v1", origin), init),
    },
  });
  if (["ow", "gr", "pn"].includes(name))
    assert.deepEqual(await readInterviewCaseCapabilities(db, c.case_a), {
      ai_enabled: true,
      transcript_enabled: true,
    });
  else
    await assert.rejects(readInterviewCaseCapabilities(db, c.case_a), {
      message: "INTERVIEW_CAPABILITIES_UNAVAILABLE",
    });
  count++;
}
console.log(`actual app reader: ${count} live PostgREST actor checks passed`);
