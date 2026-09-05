-- =============================================================================
-- Security Passport — legacy unsupported-provenance report. READ-ONLY.
-- =============================================================================
--
-- Lists every approved verification decision whose recorded method claims a
-- SOURCE confirmation (employer_confirmation, issuer_confirmation) while the
-- recorded decider is CQrityjob -- rows written before migration
-- 20261030090000 bound the method to the request kind. No structurally
-- identified employer or issuer acted as the source for these decisions, so
-- the application renders them as a CQrityjob review ("Review recorded by
-- CQrityjob. Direct source confirmation is not available for this legacy
-- record.") and never as a source confirmation.
--
-- This script CHANGES NOTHING. It selects identifiers and structural columns
-- only: no holder name, no email, no evidence, no claim title, no note. What
-- to do with each row -- re-review as document_review, revoke, or leave -- is
-- an owner decision that is not made here.
--
-- Run against the local stack:
--   psql -h 127.0.0.1 -p 54322 -U postgres -d postgres \
--        -f scripts/passport-legacy-provenance-report.sql
--
-- Run against hosted: through a read-only path only (the Supabase MCP
-- execute_sql with this SELECT, or a read-only psql session). Never through
-- a migration, and never with DDL alongside it.
--
-- `in_live_disclosure` is true when the decided entry is currently verified
-- and active AND at least one of the holder's disclosures that would carry
-- it is neither revoked nor expired -- i.e. a recipient opening that share
-- today receives the entry. It mirrors the package/focus filters in
-- sp_disclosure_payload (20260908094000) read-only; it does not open a share.

SELECT
  d.id                                   AS decision_id,
  d.request_id,
  d.decision,
  d.verification_method,
  d.decider_organisation,
  r.request_kind,
  d.decided_at::date                     AS decided_on,
  CASE WHEN r.claim_id IS NOT NULL THEN 'claim' ELSE 'period' END AS subject_type,
  coalesce(c.assertion_level, e.assertion_level) AS assertion_level,
  coalesce(c.lifecycle_state, e.lifecycle_state) AS lifecycle_state,
  EXISTS (
    SELECT 1
      FROM public.sp_disclosures s
     WHERE s.holder_user_id = d.holder_user_id
       AND s.revoked_at IS NULL
       AND (s.expires_at IS NULL OR s.expires_at > now())
       AND (
         (r.claim_id IS NOT NULL
            AND c.assertion_level = 'verified' AND c.lifecycle_state = 'active'
            AND s.package_code IN ('verified_qualifications','employer_review',
                                   'full_verification','public_card')
            AND (s.focus_claim_id IS NULL OR s.focus_claim_id = r.claim_id))
         OR
         (r.period_id IS NOT NULL
            AND e.assertion_level = 'verified' AND e.lifecycle_state = 'active'
            AND s.focus_claim_id IS NULL
            AND s.package_code IN ('verified_experience','employer_review',
                                   'full_verification','public_card'))
       )
  )                                      AS in_live_disclosure
FROM public.sp_verification_decisions d
JOIN public.sp_verification_requests r ON r.id = d.request_id
LEFT JOIN public.sp_claims c            ON c.id = r.claim_id
LEFT JOIN public.sp_experience_periods e ON e.id = r.period_id
WHERE d.decision = 'approved'
  AND d.verification_method IN ('employer_confirmation', 'issuer_confirmation')
  AND d.decider_organisation = 'CQrityjob'
ORDER BY d.decided_at;
