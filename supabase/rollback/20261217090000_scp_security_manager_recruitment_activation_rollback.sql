-- Rollback of 20261217090000: the strategic level's activation reversed.
-- Content untouched (that is 20261216090000's rollback). The pilot is
-- withdrawn through the governed event, so the ledger shows why; cases
-- already pinned to the version keep continuity read access, as the model
-- provides for a withdrawn pilot.
BEGIN;

UPDATE public.scp_assessment_definitions
   SET standard_for_recruitment = false
 WHERE slug = 'security-manager-recruitment';

DO $$
DECLARE _v public.scp_interview_pack_versions%ROWTYPE;
BEGIN
  SELECT ver.* INTO _v
    FROM public.scp_interview_pack_versions ver
    JOIN public.scp_interview_packs p ON p.id = ver.pack_id
   WHERE p.slug = 'security-manager-se' AND ver.version_number = 1;
  IF _v.id IS NULL THEN
    RAISE NOTICE 'SCP_SM_ACTIVATION_ROLLBACK: no security-manager-se v1; nothing to withdraw.';
    RETURN;
  END IF;
  IF _v.pilot_availability = 'open' THEN
    UPDATE public.scp_interview_pack_versions
       SET pilot_availability = 'restricted', updated_at = now()
     WHERE id = _v.id;
    PERFORM public.scp_interview_record_event(
      _v.pack_id, _v.id, 'pilot_withdrawn', _v.content_status, _v.content_status,
      'Återställning av 20261217090000: piloten stängd igen; paketet åter begränsat.',
      _v.content_hash, '{}'::jsonb);
  END IF;
END $$;

DO $verify$
BEGIN
  IF EXISTS (SELECT 1 FROM public.scp_assessment_definitions
              WHERE slug = 'security-manager-recruitment' AND standard_for_recruitment) THEN
    RAISE EXCEPTION 'ROLLBACK_INCOMPLETE: the strategic test is still designated';
  END IF;
  IF EXISTS (SELECT 1 FROM public.scp_interview_pack_versions v JOIN public.scp_interview_packs p ON p.id = v.pack_id
              WHERE p.slug = 'security-manager-se' AND v.pilot_availability = 'open') THEN
    RAISE EXCEPTION 'ROLLBACK_INCOMPLETE: the strategic guide is still open for pilot';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.scp_assessment_definitions
                  WHERE slug = 'security-officer-recruitment' AND standard_for_recruitment)
     AND EXISTS (SELECT 1 FROM public.scp_assessment_definitions WHERE slug = 'security-officer-recruitment') THEN
    RAISE EXCEPTION 'ROLLBACK_OVERREACH: the operational designation was touched';
  END IF;
END
$verify$;

COMMIT;
