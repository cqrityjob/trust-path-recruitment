/** Security controls for the schema-only share gateway foundation. */
import { runControls, type Mutation } from "./runner";

const migration = "supabase/migrations/20261104090000_passport_share_gateway.sql";
const guard = "passport-share-gateway-schema:check";
const mutations: readonly Mutation[] = [
  { id: "SHARE-GATEWAY-RLS", defect: "handoff storage stops forcing RLS", file: migration, find: "ALTER TABLE public.sp_share_handoffs FORCE ROW LEVEL SECURITY;", replace: "-- FORCE RLS removed", guard, expect: "sp_share_handoffs forces RLS" },
  { id: "SHARE-GATEWAY-GRANT", defect: "token issue becomes browser executable", file: migration, find: "GRANT EXECUTE ON FUNCTION public.sp_share_gateway_issue(text, text) TO service_role;", replace: "GRANT EXECUTE ON FUNCTION public.sp_share_gateway_issue(text, text) TO authenticated;", guard, expect: "sp_share_gateway_issue is granted to service_role" },
  { id: "SHARE-GATEWAY-REPLAY", defect: "a consumed handoff can be replayed", file: migration, find: "     AND consumed_at IS NULL\n     AND expires_at >= now()", replace: "     AND expires_at >= now()", guard, expect: "handoff consumption is single-use" },
  { id: "SHARE-GATEWAY-REVOCATION", defect: "an existing session survives revocation", file: migration, find: "     AND d.revoked_at IS NULL\n     AND (d.expires_at IS NULL OR d.expires_at >= now())", replace: "     AND (d.expires_at IS NULL OR d.expires_at >= now())", guard, expect: "session reads recheck revocation" },
];
runControls("share-gateway-schema", mutations);
