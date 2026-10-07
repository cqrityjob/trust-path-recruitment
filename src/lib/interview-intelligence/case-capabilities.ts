import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../integrations/supabase/database";

/** Availability for a case the caller may read, never administrative metadata.
 * The database rechecks case authority on every call. Errors must not be
 * misrepresented as a deliberate feature-off decision. No legacy-table fallback.
 */
export async function readInterviewCaseCapabilities(db: SupabaseClient<Database>, caseId: string) {
  const { data, error } = await db.rpc("scp_iv_case_capabilities", { _case_id: caseId }).single();
  if (
    error ||
    typeof data?.ai_enabled !== "boolean" ||
    typeof data?.transcript_enabled !== "boolean"
  ) {
    throw new Error("INTERVIEW_CAPABILITIES_UNAVAILABLE");
  }
  return { ai_enabled: data.ai_enabled, transcript_enabled: data.transcript_enabled };
}
