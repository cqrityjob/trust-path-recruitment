-- Bench-only: the GoTrue columns the recruitment fixture writes, absent from
-- the repo's minimal auth.users stub. Not part of the repository.
ALTER TABLE auth.users ADD COLUMN IF NOT EXISTS instance_id uuid, ADD COLUMN IF NOT EXISTS aud text, ADD COLUMN IF NOT EXISTS role text,
 ADD COLUMN IF NOT EXISTS encrypted_password text, ADD COLUMN IF NOT EXISTS raw_app_meta_data jsonb, ADD COLUMN IF NOT EXISTS updated_at timestamptz,
 ADD COLUMN IF NOT EXISTS confirmation_token text, ADD COLUMN IF NOT EXISTS recovery_token text, ADD COLUMN IF NOT EXISTS email_change_token_new text,
 ADD COLUMN IF NOT EXISTS email_change text, ADD COLUMN IF NOT EXISTS email_change_token_current text, ADD COLUMN IF NOT EXISTS phone_change text,
 ADD COLUMN IF NOT EXISTS phone_change_token text, ADD COLUMN IF NOT EXISTS reauthentication_token text;
