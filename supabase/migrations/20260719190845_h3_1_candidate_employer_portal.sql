-- =============================================================================
-- Phase H3.1 — Candidate / Employer Portal Foundation
-- Source: docs/auth/candidate-employer-portal-spec-v1.md,
--         docs/architecture/adr-candidate-employer-portal-separation.md
-- Additive only. Every existing table/policy/function not listed below is
-- unchanged. Naming note: employers.status gets 'pending'/'rejected', NOT
-- 'pending_review' -- that string is reserved for jobs.status in the
-- separate, not-yet-implemented Jobs MVP v1 spec; reusing it here would be
-- a cross-document naming collision the spec explicitly calls out to avoid.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. employers — additive columns + status extension
-- -----------------------------------------------------------------------------

ALTER TABLE public.employers
  ADD COLUMN registration_number text;

COMMENT ON COLUMN public.employers.registration_number IS
  'Free text at MVP (product-owner decision, H3.1) -- no jurisdiction-specific '
  'validation. country already exists and serves as the jurisdiction field; '
  'no separate jurisdiction column is added.';

ALTER TABLE public.employers
  DROP CONSTRAINT employers_status_check,
  ADD CONSTRAINT employers_status_check
    CHECK (status IN ('draft', 'pending', 'active', 'rejected', 'suspended', 'archived'));

COMMENT ON COLUMN public.employers.status IS
  'Organisation lifecycle, independent of individual job status. '
  '''pending'' is the self-service creation default (H3.1) -- distinct from '
  '''draft'' (reserved for its original admin-created meaning) and never '
  'reused for that purpose. ''rejected'' is a moderation outcome. '
  'suspended/archived/pending/rejected employers are excluded from public '
  'visibility (see employers_public_active_select) even if they still own '
  'individually-published jobs.';


-- -----------------------------------------------------------------------------
-- 2. employer_memberships — additive column
-- -----------------------------------------------------------------------------

ALTER TABLE public.employer_memberships
  ADD COLUMN job_title text;

COMMENT ON COLUMN public.employer_memberships.job_title IS
  'Free text, optional. The member''s stated role/title at this specific '
  'employer -- describes the person''s relationship to this company, not '
  'the company itself, so it lives here rather than on employers.';


-- -----------------------------------------------------------------------------
-- 3. employer_access_requests — new table
-- -----------------------------------------------------------------------------

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
  'H3.1. A candidate/employer user requesting to join an existing employer.
   Never creates an employer_memberships row directly -- only
   approve_access_request() does that, atomically, after an authorised
   approver''s explicit decision. granted_role is set only on approval and
   records what was actually granted, for audit -- it is never supplied by
   the requester.';

CREATE INDEX employer_access_requests_employer_idx ON public.employer_access_requests (employer_id, status);
CREATE INDEX employer_access_requests_requester_idx ON public.employer_access_requests (requester_user_id);

-- Prevents a second pending request from the same user to the same employer
-- while one is already outstanding, at the database level (not just an
-- application-layer check-then-insert, which would have a TOCTOU race --
-- the same class of issue the Phase G1 final-owner fix addressed).
CREATE UNIQUE INDEX employer_access_requests_one_pending_idx
  ON public.employer_access_requests (employer_id, requester_user_id)
  WHERE status = 'pending';

CREATE TRIGGER set_employer_access_requests_updated_at
  BEFORE UPDATE ON public.employer_access_requests
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

GRANT SELECT, INSERT ON public.employer_access_requests TO authenticated;
GRANT ALL ON public.employer_access_requests TO service_role;

ALTER TABLE public.employer_access_requests ENABLE ROW LEVEL SECURITY;

-- Requester reads/creates only their own requests.
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

-- An existing owner/admin of the target employer can see requests filed
-- against their own company (to review them in the UI) -- but cannot
-- approve/deny via a direct UPDATE; that path is intentionally absent here,
-- matching the C2 lesson from the Jobs MVP v1 spec (no open UPDATE grant on
-- a table that gates who gets access to what). Decisions go exclusively
-- through approve_access_request() below.
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


-- -----------------------------------------------------------------------------
-- 4. public.create_my_employer_company(...)
--
-- SECURITY DEFINER because the caller is an ordinary authenticated user who
-- does not (and must not) satisfy any existing RLS write policy on
-- `employers`/`employer_memberships` -- unlike update_employer_membership()
-- (SECURITY INVOKER, because ITS caller must already be a platform admin
-- who *does* pass employer_memberships_admin_all). Bypassing RLS here is
-- deliberate and narrow: this function is the ONLY way a non-admin can ever
-- cause a row to appear in either table, and every input is validated
-- inside the function body, not trusted from the caller.
--
-- Atomic: both inserts (employers, employer_memberships) happen in one
-- function invocation, i.e. one transaction -- there is no intermediate
-- state where a company exists without an owner or vice versa, satisfying
-- the spec's explicit "atomic company + owner membership creation"
-- requirement in a way two separate client-orchestrated calls could not.
-- -----------------------------------------------------------------------------

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

  -- Duplicate detection: case-insensitive exact name match, or an exact
  -- match on a normalised registration number, or an exact match on a
  -- normalised website host. This is a deliberately conservative (not
  -- fuzzy) check for MVP -- see the spec's "SHOULD HAVE" list for improved
  -- matching later. A match blocks creation entirely; the caller (TS layer)
  -- surfaces the "request access" path instead, never an automatic merge.
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

  -- Slug collision handling: the base slug is generated in application code
  -- (mirroring admin.functions.ts's existing slugify() helper, for
  -- consistency with every other slug in this schema). If it's already
  -- taken by an unrelated employer, append a short random suffix rather
  -- than failing the whole request over a cosmetic collision.
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
  'Self-service company creation (H3.1). Atomic: creates the employers row '
  '(status=pending) and the caller''s owner employer_memberships row '
  'together. auth.uid() only -- never a client-supplied user id. Raises '
  'DUPLICATE_EMPLOYER:<id> (ERRCODE unique_violation) on a plausible '
  'existing-company match instead of creating a duplicate.';


-- -----------------------------------------------------------------------------
-- 5. public.approve_access_request(...)
--
-- SECURITY DEFINER for the same reason as create_my_employer_company(): the
-- approver is typically an employer owner/admin, not a platform admin, and
-- there is no RLS INSERT policy on employer_memberships for that role either
-- -- this function is the sole, narrow, audited path. Atomic across the
-- request-status update and the membership creation.
-- -----------------------------------------------------------------------------

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

  -- Authorisation check happens here, inside the function, against the
  -- request's actual employer_id -- never trusted from any parameter the
  -- caller supplies about who they are or what they're allowed to do.
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
    -- ON CONFLICT handles the case where the requester previously had a
    -- removed/suspended membership at this employer (UNIQUE(employer_id,
    -- user_id) already exists on employer_memberships) -- reactivates
    -- rather than erroring. Targeted by constraint NAME rather than a bare
    -- (employer_id, user_id) column list deliberately: this function's own
    -- RETURNS TABLE declares an out-parameter also named `employer_id`,
    -- and plpgsql's identifier resolution treats a bare column list in
    -- ON CONFLICT as ambiguous between that variable and the real table
    -- column (verified locally — this exact form raised "column reference
    -- employer_id is ambiguous" against a real Postgres 16 instance).
    -- ON CONFLICT ON CONSTRAINT sidesteps the ambiguity entirely.
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
  'Approve or deny an employer_access_requests row (H3.1). Caller must be '
  'an owner/admin of the request''s own employer, or a platform admin --
   checked inside the function against the request''s real employer_id, '
  'never a client-supplied one. On approval, atomically creates (or '
  'reactivates) the employer_memberships row; the requester never becomes '
  'a member through any other path.';
