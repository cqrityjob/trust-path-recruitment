-- The approved credential catalogue admits an internal-pilot MARKET to that
-- market's pilot members — and to nobody else. Definition approval is untouched.
--
-- ── THE MISSING CONNECTION ─────────────────────────────────────────────
--
-- Pilot access to a market is decided in one place: sp_market_access() reads
-- sp_market_packs.pilot_state = 'internal_pilot' together with a per-holder
-- row in sp_pilot_members (sp_is_pilot_member). The application honours it —
-- getRegulatedCredentialAvailability offers a pilot member that market's
-- definitions (sp_credential_types.pilot_state = 'internal_pilot') — and the
-- claim-rules trigger (sp_claims_credential_rules) honours it too.
--
-- The closed catalogue (20261121090000) did not. sp_approved_credential_catalogue
-- required `t.is_active` and an ACTIVE market pack, and both the governed
-- write RPC (sp_save_international_credential) and the two catalogue guard
-- triggers read that view. So a holder with a valid GB or Dubai pilot
-- entitlement was OFFERED the credential and then refused on save with
-- SP_APPROVED_DEFINITION_REQUIRED. Traced on the isolated local stack,
-- 2026-09-18, in scripts/passport-live-local-journey-check.mjs.
--
-- ── WHAT CHANGES, AND WHAT DOES NOT ────────────────────────────────────
--
-- The view's MARKET clause gains one alternative: an internal-pilot pack
-- counts as open FOR A CALLER WHO IS A PILOT MEMBER OF THAT MARKET, as
-- sp_is_pilot_member(auth.uid(), pack) decides — the same two states
-- sp_market_access() reports as 'production' and 'pilot'. The DEFINITION
-- clause is unchanged: a definition must be approved (is_active) for a pilot
-- member exactly as for everyone else. Four suites pin that contract
-- (market_pilot 5.1, pilot_catalogue_visibility 3.6, pilot_write_path 1.1,
-- global_certification 14.5): pilot entitlement never approves a definition.
-- Approving a GB or Dubai definition for the pilot is therefore a separate,
-- per-definition administrator decision, and this migration takes none. The view is security_invoker,
-- so auth.uid() is the caller's own identity in the RPC and in the triggers
-- alike; a session with no JWT (service role, harness) sees no pilot rows,
-- exactly as sp_market_access answers 'closed' for it.
--
-- No market is activated. No definition is approved. No RLS, grant, table,
-- column or row changes. Every other clause of the view — definition approval,
-- authority, issuer, jurisdiction, deprecation, scope requirement — is
-- unchanged, so a pilot member can add only an approved definition of their
-- own pilot market, and a SIRA card that requires a scope stays unavailable
-- through this RPC for everyone. The column list is unchanged, so the %ROWTYPE guards keep
-- their shape.
BEGIN;

CREATE OR REPLACE VIEW public.sp_approved_credential_catalogue WITH (security_invoker=true,security_barrier=true) AS
SELECT t.code, t.claim_type, t.name_sv, t.name_en,
 coalesce(m.credential_class,CASE t.claim_type WHEN 'licence' THEN 'regulated_authorisation' WHEN 'training' THEN 'mandatory_training' ELSE 'certification' END) AS credential_class,
 t.scope_code, t.jurisdiction_code AS country, t.sub_jurisdiction_code AS region,
 coalesce(i.id,a.id) AS issuer_id, coalesce(i.display_name,a.name_local) AS issuer_name,
 coalesce(d.programme_url,a.official_url) AS official_url,
 coalesce(d.public_verification_url,i.public_verification_url) AS verification_url,
 i.verification_mode, t.requires_valid_until, t.allows_no_expiry,
 t.reference_pattern, m.original_language,
 d.maintenance_summary_en, t.typical_validity_months
FROM public.sp_credential_types t
LEFT JOIN public.sp_certification_definitions d ON d.credential_code=t.code
LEFT JOIN public.sp_certification_issuers i ON i.id=d.issuer_id AND i.is_active
 AND i.effective_from<=current_date AND (i.effective_to IS NULL OR i.effective_to>current_date)
LEFT JOIN public.sp_authorities a ON a.id=t.authority_id AND a.is_active
LEFT JOIN public.sp_credential_definition_metadata m ON m.credential_code=t.code
WHERE
 -- The DEFINITION must be approved (is_active) for everyone alike: pilot
 -- membership opens a market, it never approves a definition.
 t.is_active AND NOT t.requires_scope AND m.deprecated_at IS NULL
 AND (d.effective_from IS NULL OR d.effective_from<=current_date)
 AND (d.retired_on IS NULL OR d.retired_on>current_date)
 AND public.sp_is_passport_credential(t.claim_type,t.code)
 AND ((t.scope_code='global_professional' AND i.id IS NOT NULL)
 OR (t.scope_code='national_regulated' AND a.id IS NOT NULL
 AND EXISTS (SELECT 1 FROM public.sp_jurisdictions j WHERE j.code=t.jurisdiction_code AND j.is_active)
 AND (t.sub_jurisdiction_code IS NULL OR EXISTS (SELECT 1 FROM public.sp_sub_jurisdictions j WHERE j.code=t.sub_jurisdiction_code AND j.is_active))
 AND EXISTS (
   SELECT 1 FROM public.sp_market_packs p WHERE p.code=t.market_pack_code
   -- An active market, or an internal-pilot market for its own pilot member:
   -- the same two states sp_market_access() reports as 'production' / 'pilot'.
   AND (p.is_active
        OR (p.pilot_state='internal_pilot' AND public.sp_is_pilot_member(auth.uid(), p.code)))
   AND p.superseded_on IS NULL
   AND p.jurisdiction_code=t.jurisdiction_code
   AND p.sub_jurisdiction_code IS NOT DISTINCT FROM t.sub_jurisdiction_code)));

-- Re-stated, not assumed: a replaced view keeps its grants, and this says so.
REVOKE ALL ON public.sp_approved_credential_catalogue FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.sp_approved_credential_catalogue TO authenticated,service_role;

-- The view must still carry the reloptions the closed catalogue declared.
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relnamespace='public'::regnamespace
   AND relname='sp_approved_credential_catalogue'
   AND 'security_invoker=true'=ANY(reloptions) AND 'security_barrier=true'=ANY(reloptions))
 THEN RAISE EXCEPTION 'SP_CATALOGUE_VIEW_OPTIONS_LOST'; END IF;
END $$;
COMMIT;
