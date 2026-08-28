-- =============================================================================
-- Phase H3.1 — Candidate / Employer Portal Foundation
-- Applying committed migration file 20260719190845_h3_1_candidate_employer_portal.sql
-- =============================================================================

ALTER TABLE public.employers
  ADD COLUMN registration_number text;

COMMENT ON COLUMN public.employers.registration_number IS
  'Free text at MVP (product-owner decision, H3.1) -- no jurisdiction-specific validation. country already exists and serves as the jurisdiction field; no separate jurisdiction column is added.';

ALTER TABLE public.employers
  DROP CONSTRAINT employers_status_check,
  ADD CONSTRAINT employers_status_check
    CHECK (status IN ('draft', 'pending', 'active', 'rejected', 'suspended', 'archived'));

COMMENT ON COLUMN public.employers.status IS
  'Organisation lifecycle, independent of individual job status. ''pending'' is the self-service creation default (H3.1) -- distinct from ''draft'' (reserved for its original admin-created meaning) and never reused for that purpose. ''rejected'' is a moderation outcome. suspended/archived/pending/rejected employers are excluded from public visibility (see employers_public_active_select) even if they still own individually-published jobs.';

ALTER TABLE public.employer_memberships
  ADD COLUMN job_title text;

COMMENT ON COLUMN public.employer_memberships.job_title IS
  'Free text, optional. The member''s stated role/title at this specific employer -- describes the person''s relationship to this company, not the company itself, so it lives here rather than on employers.';

CREATE TABLE public.employer_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  requester_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  message text CHECK (message IS NULL OR char_length(message) <= 500),
  granted_role text CHECK (granted_role IS NULL OR granted_role IN ('owner', 'admin', 'member')),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.employer_access_requests IS
  'H3.1. A candidate/employer user requesting to join an existing employer. Never creates an employer_memberships row directly -- only approve_access_request() does that, atomically, after an authorised approver''s explicit decision. granted_role is set only on approval and records what was actually granted, for audit -- it is never supplied by the requester.';

CREATE INDEX employer_access_requests_employer_idx ON public.employer_access_requests (employer_id, status);
CREATE INDEX employer_access_requests_requester_idx ON public.employer_access_requests (requester_user_id);

CREATE UNIQUE INDEX employer_access_requests_one_pending_idx
  ON public.employer_access_requests (employer_id, requester_user_id)
  WHERE status = 'pending';

CREATE TRIGGER set_employer_access_requests_updated_at
  BEFORE UPDATE ON public.employer_access_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT ON public.employer_access_requests TO authenticated;
GRANT ALL ON public.employer_access_requests TO service_role;

ALTER TABLE public.employer_access_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employer_access_requests_requester_select" ON public.employer_access_requests
  FOR SELECT
  TO authenticated
  USING (requester_user_id = auth.uid());

CREATE POLICY "employer_access_requests_requester_insert" ON public.employer_access_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (
    requester_user_id = auth.uid()
    AND status = 'pending'
    AND decided_by IS NULL
    AND decided_at IS NULL
    AND granted_role IS NULL
  );

CREATE POLICY "employer_access_requests_owner_select" ON public.employer_access_requests
  FOR SELECT
  TO authenticated
  USING (public.has_employer_role(auth.uid(), employer_id, ARRAY['owner', 'admin']));

CREATE POLICY "employer_access_requests_admin_all" ON public.employer_access_requests
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

REVOKE ALL ON public.employer_access_requests FROM anon;

CREATE OR REPLACE FUNCTION public.create_my_employer_company(
  _name text,
  _slug_base text,
  _country text,
  _registration_number text DEFAULT NULL,
  _website text DEFAULT NULL,
  _job_title text DEFAULT NULL
)
RETURNS TABLE (
  employer_id uuid,
  employer_slug text,
  membership_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _clean_name text;
  _clean_country text;
  _clean_registration text;
  _clean_website text;
  _clean_job_title text;
  _slug text;
  _existing_id uuid;
  _new_employer_id uuid;
  _new_membership_id uuid;
  _now timestamptz := now();
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  _clean_name := btrim(_name);
  IF _clean_name IS NULL OR _clean_name = '' THEN
    RAISE EXCEPTION 'Company name is required';
  END IF;
  IF char_length(_clean_name) > 200 THEN
    RAISE EXCEPTION 'Company name is too long';
  END IF;

  _clean_country := btrim(_country);
  IF _clean_country IS NULL OR _clean_country = '' THEN
    RAISE EXCEPTION 'Country is required';
  END IF;
  IF char_length(_clean_country) > 100 THEN
    RAISE EXCEPTION 'Country is too long';
  END IF;

  _clean_registration := NULLIF(btrim(_registration_number), '');
  IF _clean_registration IS NOT NULL AND char_length(_clean_registration) > 100 THEN
    RAISE EXCEPTION 'Registration number is too long';
  END IF;

  _clean_website := NULLIF(btrim(_website), '');
  IF _clean_website IS NOT NULL AND char_length(_clean_website) > 300 THEN
    RAISE EXCEPTION 'Website is too long';
  END IF;

  _clean_job_title := NULLIF(btrim(_job_title), '');
  IF _clean_job_title IS NOT NULL AND char_length(_clean_job_title) > 150 THEN
    RAISE EXCEPTION 'Job title is too long';
  END IF;

  IF _slug_base IS NULL OR btrim(_slug_base) = '' THEN
    RAISE EXCEPTION 'Invalid company slug';
  END IF;

  SELECT e.id INTO _existing_id
  FROM public.employers e
  WHERE lower(btrim(e.name)) = lower(_clean_name)
     OR (
       _clean_registration IS NOT NULL
       AND e.registration_number IS NOT NULL
       AND lower(btrim(e.registration_number)) = lower(_clean_registration)
     )
     OR (
       _clean_website IS NOT NULL
       AND e.website IS NOT NULL
       AND lower(regexp_replace(btrim(e.website), '^https?://(www\.)?', '')) =
           lower(regexp_replace(_clean_website, '^https?://(www\.)?', ''))
     )
  LIMIT 1;

  IF _existing_id IS NOT NULL THEN
    RAISE EXCEPTION 'DUPLICATE_EMPLOYER:%', _existing_id::text
      USING ERRCODE = 'unique_violation';
  END IF;

  _slug := left(_slug_base, 80);
  IF EXISTS (SELECT 1 FROM public.employers WHERE slug = _slug) THEN
    _slug := left(_slug_base, 72) || '-' || substr(md5(random()::text || clock_timestamp()::text), 1, 6);
  END IF;

  INSERT INTO public.employers (name, slug, country, website, registration_number, status)
  VALUES (_clean_name, _slug, _clean_country, _clean_website, _clean_registration, 'pending')
  RETURNING id INTO _new_employer_id;

  INSERT INTO public.employer_memberships (
    employer_id, user_id, role, status, created_by, job_title, accepted_at
  )
  VALUES (
    _new_employer_id, _caller, 'owner', 'active', _caller, _clean_job_title, _now
  )
  RETURNING id INTO _new_membership_id;

  INSERT INTO public.audit_logs (actor_id, actor_role, action, subject_type, subject_id, org_id, metadata)
  VALUES (
    _caller, 'employer_owner', 'company_created', 'employer', _new_employer_id::text, _new_employer_id,
    jsonb_build_object('name', _clean_name, 'country', _clean_country, 'slug', _slug)
  );

  RETURN QUERY SELECT _new_employer_id, _slug, _new_membership_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_my_employer_company(text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_my_employer_company(text, text, text, text, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.create_my_employer_company(text, text, text, text, text, text) IS
  'Self-service company creation (H3.1). Atomic: creates the employers row (status=pending) and the caller''s owner employer_memberships row together. auth.uid() only -- never a client-supplied user id. Raises DUPLICATE_EMPLOYER:<id> (ERRCODE unique_violation) on a plausible existing-company match instead of creating a duplicate.';

CREATE OR REPLACE FUNCTION public.approve_access_request(
  _request_id uuid,
  _decision text,
  _granted_role text DEFAULT 'member'
)
RETURNS TABLE (
  request_id uuid,
  employer_id uuid,
  status text,
  membership_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _request public.employer_access_requests;
  _new_membership_id uuid;
  _now timestamptz := now();
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _decision NOT IN ('approved', 'denied') THEN
    RAISE EXCEPTION 'Invalid decision';
  END IF;
  IF _decision = 'approved' AND _granted_role NOT IN ('owner', 'admin', 'member') THEN
    RAISE EXCEPTION 'Invalid role';
  END IF;

  SELECT * INTO _request
  FROM public.employer_access_requests
  WHERE id = _request_id
  FOR UPDATE;

  IF _request.id IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  IF _request.status <> 'pending' THEN
    RAISE EXCEPTION 'Request has already been decided';
  END IF;

  IF NOT (
    public.has_employer_role(_caller, _request.employer_id, ARRAY['owner', 'admin'])
    OR public.is_platform_admin(_caller)
  ) THEN
    RAISE EXCEPTION 'Forbidden: owner, admin, or platform admin required';
  END IF;

  UPDATE public.employer_access_requests
  SET status = _decision,
      granted_role = CASE WHEN _decision = 'approved' THEN _granted_role ELSE NULL END,
      decided_by = _caller,
      decided_at = _now
  WHERE id = _request_id;

  IF _decision = 'approved' THEN
    INSERT INTO public.employer_memberships (
      employer_id, user_id, role, status, created_by, invited_by, invited_at, accepted_at
    )
    VALUES (
      _request.employer_id, _request.requester_user_id, _granted_role, 'active',
      _caller, _caller, _now, _now
    )
    ON CONFLICT ON CONSTRAINT employer_memberships_employer_id_user_id_key DO UPDATE
      SET role = EXCLUDED.role,
          status = 'active',
          accepted_at = _now,
          removed_at = NULL,
          updated_at = _now
    RETURNING id INTO _new_membership_id;

    INSERT INTO public.audit_logs (actor_id, actor_role, action, subject_type, subject_id, org_id, metadata)
    VALUES (
      _caller, 'employer_approver', 'access_request_approved', 'employer_access_request',
      _request_id::text, _request.employer_id,
      jsonb_build_object('requester_user_id', _request.requester_user_id, 'granted_role', _granted_role)
    );
  ELSE
    _new_membership_id := NULL;
    INSERT INTO public.audit_logs (actor_id, actor_role, action, subject_type, subject_id, org_id, metadata)
    VALUES (
      _caller, 'employer_approver', 'access_request_denied', 'employer_access_request',
      _request_id::text, _request.employer_id,
      jsonb_build_object('requester_user_id', _request.requester_user_id)
    );
  END IF;

  RETURN QUERY SELECT _request_id, _request.employer_id, _decision, _new_membership_id;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_access_request(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_access_request(uuid, text, text) TO authenticated, service_role;

COMMENT ON FUNCTION public.approve_access_request(uuid, text, text) IS
  'Approve or deny an employer_access_requests row (H3.1). Caller must be an owner/admin of the request''s own employer, or a platform admin -- checked inside the function against the request''s real employer_id, never a client-supplied one. On approval, atomically creates (or reactivates) the employer_memberships row; the requester never becomes a member through any other path.';
