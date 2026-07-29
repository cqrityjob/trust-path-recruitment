-- Record 20260724130000_admin_portal_operational_scope as applied (its objects already exist in DB from a prior out-of-band run; no re-execution).
INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
VALUES ('20260724130000','admin_portal_operational_scope', ARRAY[]::text[])
ON CONFLICT (version) DO NOTHING;

-- ============= 20260725090000_assignment_email_delivery_tracking.sql =============
ALTER TABLE public.assessment_assignments
  ADD COLUMN IF NOT EXISTS email_delivery_status TEXT NOT NULL DEFAULT 'not_attempted'
    CHECK (email_delivery_status IN ('not_attempted', 'sent', 'failed')),
  ADD COLUMN IF NOT EXISTS email_delivery_error TEXT,
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.assessment_assignments.email_delivery_status IS
  'not_attempted (no email provider configured, or send not yet tried), sent (provider accepted the message), failed (provider call was made and failed). Never silently ambiguous.';
COMMENT ON COLUMN public.assessment_assignments.email_delivery_error IS
  'Provider error message when email_delivery_status = failed. Never contains the API key or other secrets.';
COMMENT ON COLUMN public.assessment_assignments.email_sent_at IS
  'Set only when email_delivery_status = sent.';

-- ============= 20260725100000_assignment_duplicate_send_guard.sql =============
CREATE UNIQUE INDEX IF NOT EXISTS assessment_assignments_active_unique_idx
  ON public.assessment_assignments (employer_id, assessment_id, recipient_email)
  WHERE status IN ('invited', 'opened', 'started');

COMMENT ON INDEX public.assessment_assignments_active_unique_idx IS
  'Partial unique index: blocks a second ACTIVE (invited/opened/started) assignment for the same employer+assessment+recipient combination.';