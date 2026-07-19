-- H3.1 correction — allow members of a `pending` employer to reach their own
-- drafts. Public visibility rules are untouched: they still require the
-- employer to be `active` (see employers_public_active_select and
-- jobs_public_active_select).
CREATE OR REPLACE FUNCTION public.employer_members_can_edit(_employer_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT status IN ('active', 'draft', 'pending') FROM public.employers WHERE id = _employer_id;
$$;

COMMENT ON FUNCTION public.employer_members_can_edit(uuid) IS
  'Returns true when a verified member may edit their own employer''s jobs (drafts + published-close). Includes pending (self-service onboarding) so a new owner can build drafts before platform approval. Does NOT gate public visibility -- that is enforced by employer_is_active_status via jobs_public_active_select and employers_public_active_select.';
