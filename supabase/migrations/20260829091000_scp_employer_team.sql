-- #51 — An employer can see and staff its own team.
--
-- Managing employer membership was reachable only through admin-prefixed server
-- functions (adminListEmployerMemberships and friends), so an employer could not
-- answer "who belongs to this account, and who may review responses?" without
-- CQrityjob. Authorising a reviewer -- the capability added in
-- 20260829090000 -- had no surface at all, which made the whole self-service
-- reviewer model unreachable by the customer it was built for.
--
-- One read model. No new people table, no parallel organisation model: this
-- reads employer_memberships, profiles and scp_employer_reviewers, which all
-- already exist.
--
-- Identity note: display_name comes from profiles, which an ordinary member
-- cannot read for other users under RLS. That is why this is SECURITY DEFINER
-- and why it starts by proving the caller is an active member of the employer
-- it is being asked about. It deliberately does NOT return email addresses --
-- a team list needs to identify colleagues, not to hand out contact details.

CREATE OR REPLACE FUNCTION public.scp_employer_team(_employer_id uuid)
RETURNS TABLE(
  user_id            uuid,
  display_name       text,
  employer_role      text,
  membership_status  text,
  is_reviewer        boolean,
  reviewer_use_cases text[],
  reviewer_granted_at timestamptz,
  is_self            boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.user_id = auth.uid() AND m.employer_id = _employer_id
                    AND m.status = 'active') THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT m.user_id,
         coalesce(p.display_name, 'Medarbetare'),
         m.role,
         m.status,
         (r.id IS NOT NULL),
         coalesce(r.allowed_use_cases, ARRAY[]::text[]),
         r.granted_at,
         (m.user_id = auth.uid())
    FROM public.employer_memberships m
    LEFT JOIN public.profiles p ON p.id = m.user_id
    LEFT JOIN public.scp_employer_reviewers r
           ON r.employer_id = m.employer_id AND r.user_id = m.user_id
          AND r.revoked_at IS NULL
   WHERE m.employer_id = _employer_id
   ORDER BY (m.role = 'owner') DESC, (m.role = 'admin') DESC,
            coalesce(p.display_name, ''), m.user_id;
END; $function$;

COMMENT ON FUNCTION public.scp_employer_team(uuid) IS
  'The employer''s own team, with each member''s response-review authorisation. '
  'Readable by any active member; returns no email addresses.';

REVOKE ALL     ON FUNCTION public.scp_employer_team(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_employer_team(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Granting and revoking, as owner/admin acts
--
-- The RLS policy on scp_employer_reviewers is the real boundary; these exist so
-- the product has one place that expresses the whole act (grant, re-grant after
-- revocation, change of use-case scope) instead of three client-side branches.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_grant_employer_reviewer(
  _employer_id uuid,
  _user_id     uuid,
  _use_cases   text[] DEFAULT ARRAY['workforce']::text[]
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.user_id = auth.uid() AND m.employer_id = _employer_id
                    AND m.status = 'active' AND m.role IN ('owner','admin')) THEN
    RAISE EXCEPTION
      'SCP_NOT_AUTHORISED_TO_STAFF: authorising a reviewer requires owner or '
      'admin in this organisation.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF _use_cases IS NULL OR array_length(_use_cases, 1) IS NULL THEN
    RAISE EXCEPTION 'SCP_REVIEWER_NO_SCOPE: a reviewer authorisation must name '
      'at least one use case.' USING ERRCODE = 'check_violation';
  END IF;

  -- Re-granting after a revocation reuses the row and clears the revocation,
  -- so the history stays one row per person per employer rather than growing a
  -- new one every time somebody toggles the switch.
  INSERT INTO public.scp_employer_reviewers
    (employer_id, user_id, allowed_use_cases, granted_by)
  VALUES (_employer_id, _user_id, _use_cases, auth.uid())
  ON CONFLICT (employer_id, user_id) WHERE revoked_at IS NULL
  DO UPDATE SET allowed_use_cases = EXCLUDED.allowed_use_cases,
                granted_by = EXCLUDED.granted_by,
                granted_at = now()
  RETURNING id INTO _id;

  IF _id IS NULL THEN
    UPDATE public.scp_employer_reviewers
       SET allowed_use_cases = _use_cases, granted_by = auth.uid(),
           granted_at = now(), revoked_at = NULL, revoked_by = NULL
     WHERE employer_id = _employer_id AND user_id = _user_id
     RETURNING id INTO _id;
  END IF;

  RETURN _id;
END; $function$;

REVOKE ALL     ON FUNCTION public.scp_grant_employer_reviewer(uuid, uuid, text[]) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_grant_employer_reviewer(uuid, uuid, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_revoke_employer_reviewer(
  _employer_id uuid,
  _user_id     uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _n int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.employer_memberships m
                  WHERE m.user_id = auth.uid() AND m.employer_id = _employer_id
                    AND m.status = 'active' AND m.role IN ('owner','admin')) THEN
    RAISE EXCEPTION
      'SCP_NOT_AUTHORISED_TO_STAFF: revoking a reviewer requires owner or admin '
      'in this organisation.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.scp_employer_reviewers
     SET revoked_at = now(), revoked_by = auth.uid()
   WHERE employer_id = _employer_id AND user_id = _user_id AND revoked_at IS NULL;
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n > 0;
END; $function$;

REVOKE ALL     ON FUNCTION public.scp_revoke_employer_reviewer(uuid, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_revoke_employer_reviewer(uuid, uuid) TO authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.scp_employer_team(uuid)') IS NULL
     OR to_regprocedure('public.scp_grant_employer_reviewer(uuid,uuid,text[])') IS NULL
     OR to_regprocedure('public.scp_revoke_employer_reviewer(uuid,uuid)') IS NULL THEN
    RAISE EXCEPTION 'SCP_TEAM_SURFACE_MISSING: the employer team surface did not install';
  END IF;
  IF has_function_privilege('anon', 'public.scp_employer_team(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_TEAM_ANON_EXPOSED: the team read model is callable by anon';
  END IF;
END $$;
