import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src/integrations/supabase/types";
import { readInterviewCaseCapabilities } from "../src/lib/interview-intelligence/case-capabilities";

const caseId = "e5a10000-3333-4000-8000-000000000001";
let assertions = 0;
function client(result: unknown): SupabaseClient<Database> {
  return {
    rpc(name: string, args: unknown) {
      assert.equal(name, "scp_iv_case_capabilities");
      assert.deepEqual(args, { _case_id: caseId });
      assertions += 2;
      return { single: async () => result };
    },
    from() {
      throw new Error("Forbidden fallback to raw table");
    },
  } as unknown as SupabaseClient<Database>;
}
for (const ai of [false, true])
  for (const transcript of [false, true]) {
    const got = await readInterviewCaseCapabilities(
      client({
        data: { ai_enabled: ai, transcript_enabled: transcript, updated_by: "must not escape" },
        error: null,
      }),
      caseId,
    );
    assert.deepEqual(got, { ai_enabled: ai, transcript_enabled: transcript });
    assertions++;
  }
for (const result of [
  { data: null, error: { code: "42501", message: "private backend detail" } },
  { data: null, error: { code: "PGRST202" } }, // missing schema must never reopen old route
  { data: null, error: null },
  { data: { ai_enabled: "false", transcript_enabled: true }, error: null },
  { data: { ai_enabled: true }, error: null },
]) {
  await assert.rejects(readInterviewCaseCapabilities(client(result), caseId), {
    message: "INTERVIEW_CAPABILITIES_UNAVAILABLE",
  });
  assertions++;
}
const runtime = readFileSync(
  new URL("../src/lib/interview-intelligence/runtime.functions.ts", import.meta.url),
  "utf8",
);
assert(runtime.includes("readInterviewCaseCapabilities(db, caseId)"));
assert(!/\.from\(["']scp_interview_ai_config/.test(runtime));
assert(
  runtime.indexOf('throw new Error("INTERVIEW_CASE_NOT_FOUND")') <
    runtime.indexOf("readInterviewCaseCapabilities(db, caseId)"),
);
assertions += 3;
console.log(`interview-case-capabilities: ${assertions} assertions passed`);
