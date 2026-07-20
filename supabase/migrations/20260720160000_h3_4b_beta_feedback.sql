-- =============================================================================
-- H3.4B — Minimal closed-beta feedback mechanism.
--
-- One new table: beta_feedback. Any authenticated user (candidate,
-- employer member, or admin) can submit a short feedback note; only
-- platform admins can read submissions. No update/delete path exists for
-- `authenticated` at all -- feedback, once submitted, is immutable from
-- the submitter's side (matches the "minimal" instruction: no edit/
-- moderation workflow, just a durable inbox for the beta operator).
--
-- Additive only.
-- =============================================================================

CREATE TABLE public.beta_feedback (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  category    text NOT NULL CHECK (category IN ('bug', 'idea', 'other')),
  message     text NOT NULL CHECK (char_length(btrim(message)) > 0 AND char_length(message) <= 4000),
  page_path   text CHECK (page_path IS NULL OR char_length(page_path) <= 300),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX beta_feedback_created_idx ON public.beta_feedback (created_at DESC);

COMMENT ON TABLE public.beta_feedback IS
  'H3.4B. Minimal closed-beta feedback inbox. Any authenticated user may '
  'INSERT their own row (user_id forced to auth.uid() via RLS WITH CHECK); '
  'only platform admins may SELECT. No UPDATE/DELETE path exists for '
  'authenticated at all.';

-- Both INSERT and SELECT are granted to `authenticated`: INSERT so any
-- user can submit their own feedback; SELECT so the admin-only RLS
-- policy below has something to filter -- a GRANT is required before RLS
-- is even evaluated, exactly like employer_moderation_events (H3.3).
-- Ordinary (non-admin) callers still see zero rows: their WITH CHECK on
-- INSERT restricts them to their own user_id, and no SELECT policy
-- applies to them at all, only to platform admins.
REVOKE ALL ON public.beta_feedback FROM anon, authenticated;
GRANT INSERT, SELECT ON public.beta_feedback TO authenticated;
GRANT ALL ON public.beta_feedback TO service_role;

ALTER TABLE public.beta_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "beta_feedback_owner_insert"
  ON public.beta_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "beta_feedback_admin_select"
  ON public.beta_feedback
  FOR SELECT
  TO authenticated
  USING (public.is_platform_admin(auth.uid()));
