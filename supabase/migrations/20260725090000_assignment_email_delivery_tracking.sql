-- =============================================================================
-- MVP Stabilization — assessment invitation email delivery tracking.
--
-- Root cause of "employer invited a candidate, candidate never received an
-- email": confirmed by direct code inspection (createAssessmentAssignment,
-- src/lib/job-intelligence/assessment-assignments.functions.ts) that no
-- email-sending call exists anywhere in this codebase -- no provider
-- integration (Resend/SendGrid/SES/SMTP), no env vars, no supabase/functions
-- directory. This is not a silent failure or misconfiguration; it is a
-- gap that was already correctly disclosed to the employer in the UI
-- ("CQrityjob does not currently send email automatically -- share the
-- link with the recipient yourself", assignment.form.success.deliveryNote).
--
-- This migration adds the columns needed to track a real delivery attempt
-- once a provider is configured (see src/lib/email/send-invitation-email.server.ts
-- and RESEND_API_KEY in the accompanying stabilization report) -- additive
-- only, no existing column/row changed. Default 'not_attempted' preserves
-- today's honest behaviour for every existing and future row until a
-- provider key is actually present at runtime.
-- =============================================================================

ALTER TABLE public.assessment_assignments
  ADD COLUMN IF NOT EXISTS email_delivery_status TEXT NOT NULL DEFAULT 'not_attempted'
    CHECK (email_delivery_status IN ('not_attempted', 'sent', 'failed')),
  ADD COLUMN IF NOT EXISTS email_delivery_error TEXT,
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.assessment_assignments.email_delivery_status IS
  'not_attempted (no email provider configured, or send not yet tried), sent (provider accepted the message), failed (provider call was made and failed -- see email_delivery_error). Never silently left ambiguous: the assign flow always sets this explicitly.';
COMMENT ON COLUMN public.assessment_assignments.email_delivery_error IS
  'Provider error message when email_delivery_status = failed. Never contains the API key or other secrets.';
COMMENT ON COLUMN public.assessment_assignments.email_sent_at IS
  'Set only when email_delivery_status = sent.';
