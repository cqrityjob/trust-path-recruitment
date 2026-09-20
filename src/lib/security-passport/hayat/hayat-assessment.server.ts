// HAYAT — recording an assessment. The SECOND place the service role is allowed.
//
// ── WHY THE SERVICE ROLE, WHEN PASSPORT BANS IT ────────────────────────
//
// Passport's rule is that RLS is the boundary and the service-role client is
// banned, with one named exception (the anonymous recipient boundary). This is
// the second, and it exists for the mirror-image reason:
//
//   the recipient boundary has NO identity for RLS to key on;
//   this boundary has an identity that MUST NOT be able to write.
//
// A HAYAT assessment says "a server checked this". A holder's session can call
// any function granted to `authenticated` directly through PostgREST, with any
// arguments -- so if the writer were callable by a holder, a holder could record
// their own "verified". The only way to make the writer unreachable from a
// holder's session is to grant it to no role a session can assume. So
// sp_hayat_record_assessment is granted to service_role alone, and this file is
// the only caller.
//
// It stays minimal, and scripts/passport-separation-check.ts pins that: exactly
// ONE rpc, no table access, and the holder id it passes comes from the verified
// session -- never from request data. The function itself re-checks that the
// claim is that holder's, that the evidence is on the claim and active, and that
// the assessed fields are still the claim's fields.
//
// It does not touch assertion_level and cannot: see 20261204090000.

import type { HayatDecision } from "./verification/model";

export interface AssessmentBinding {
  /** From the verified session. Never from the request body. */
  readonly holderUserId: string;
  readonly claimId: string;
  /** sp_hayat_claim_fingerprint, read with the holder's own session BEFORE the check. */
  readonly assessedFingerprint: string;
  readonly evidenceId: string | null;
  readonly sourceKind: "signed_credential" | "hosted_open_badge";
  /** The holder's own link. Nothing fetched from a source is ever passed here. */
  readonly sourceReference: string | null;
  /** How long a positive result stays current, from the source's policy. */
  readonly currentForDays: number | null;
}

export type RecordOutcome =
  | { readonly recorded: true; readonly id: string }
  | { readonly recorded: false; readonly why: "outage" | "stale" | "unavailable" };

export async function recordHayatAssessment(
  decision: HayatDecision,
  binding: AssessmentBinding,
): Promise<RecordOutcome> {
  // An outage is not a result. It is shown once and never kept.
  if (decision.status === "temporarily_unavailable") return { recorded: false, why: "outage" };
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const checks = Object.fromEntries(
    Object.values(decision.checks).map((c) => [c.key, { result: c.result, reason: c.reason }]),
  );
  const { data, error } = await supabaseAdmin.rpc(
    "sp_hayat_record_assessment" as never,
    {
      _holder_user_id: binding.holderUserId,
      _claim_id: binding.claimId,
      _assessed_fingerprint: binding.assessedFingerprint,
      _evidence_id: binding.evidenceId,
      _adapter: decision.adapter ?? "none",
      _source_kind: binding.sourceKind,
      _source_reference: binding.sourceReference,
      _rule_version: decision.ruleVersion,
      _status: decision.status,
      _reasons: [...decision.reasons],
      _checks: checks,
      _binding_level: decision.bindingLevel,
      _scope_limits: [...decision.scopeLimits],
      _checked_at: decision.checkedAt,
      _current_for_days: decision.status === "verified" ? binding.currentForDays : null,
    } as never,
  );
  if (error) {
    // The holder edited the credential while it was being checked: the check is
    // of fields that no longer exist, and the database refused it. Correct.
    if (error.message.includes("SP_HAYAT_STALE_ASSESSMENT"))
      return { recorded: false, why: "stale" };
    return { recorded: false, why: "unavailable" };
  }
  return { recorded: true, id: String(data) };
}
