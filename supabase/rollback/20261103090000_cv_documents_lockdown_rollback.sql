-- Rollback for 20261103090000_cv_documents_lockdown.sql
--
-- ── WHAT ROLLING THIS BACK MEANS ───────────────────────────────────────
--
-- It REOPENS the defect the lockdown closed: `authenticated` regains direct
-- INSERT, UPDATE and DELETE on cv_documents, and a signed-in holder can once
-- again POST an invented employment history straight to the Data API.
--
-- That is stated first, and plainly, because a rollback file is read by
-- somebody under pressure at the point where they are least likely to reason
-- it out for themselves.
--
-- ── WHEN IT IS THE RIGHT THING TO RUN ──────────────────────────────────
--
-- One situation: the lockdown was applied before the corrected application
-- was actually published, and people cannot save a CV. Reopening the door is
-- then strictly better than leaving the live site broken, because the
-- submission boundary still stands — a fabricated CV can be written and
-- cannot be sent to an employer. That is exactly the phase-1 state, and it is
-- a state this release was designed to be safe in.
--
-- If instead the controlled write path is missing, the lockdown could not
-- have applied at all: it refuses to run without cv_create / cv_save /
-- cv_refresh_from_profile / cv_delete present.
--
-- ── WHAT IT DOES NOT TOUCH ─────────────────────────────────────────────
--
-- Every CV. Every policy. The controlled write functions, which keep working
-- either way. TRUNCATE, which was never granted and is not granted here: the
-- lockdown revoked it defensively and restoring it would be restoring
-- something that was never there.
--
-- Idempotent: safe to replay, and safe to run where the lockdown never
-- applied.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cv_documents TO authenticated;

COMMENT ON TABLE public.cv_documents IS
  'PRIVATE, owner-only CV documents. Presentation over facts that live in '
  'security_career_profiles, sp_experience_periods, sp_claims and profiles '
  '-- never a second home for any of them. Since 20261102090000 there is a '
  'CONTROLLED WRITE PATH (cv_create / cv_save / cv_refresh_from_profile / '
  'cv_delete) that takes the owner from auth.uid() and derives every factual '
  'value from the caller''s own active Passport and profile rows. Direct '
  'INSERT/UPDATE/DELETE by `authenticated` is GRANTED (the lockdown, '
  '20261103090000, has been rolled back). The guarantee that an employer '
  'never reads a fabricated CV is held by sp_submit_application_with_cv_source, '
  'which verifies every carried fact against the holder''s live records before '
  'it copies anything.';
