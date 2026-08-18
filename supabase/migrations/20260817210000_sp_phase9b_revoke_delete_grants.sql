-- =============================================================================
-- Security Passport — Phase 9b: revoke the inherited DELETE grants
--
-- ── WHAT WAS FOUND ───────────────────────────────────────────────────────
--
-- On the hosted project, `authenticated` and `service_role` held DELETE on
-- every `sp_*` table — including `sp_passport_events`, the append-only audit
-- log, and `sp_verification_decisions`. Nothing in this repository granted
-- it. It is the same root cause as the anon EXECUTE grant closed in Phase 7b:
-- Supabase ships
--
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ...
--
-- so a table created in `public` arrives with the full set, and the Passport
-- migrations only ever added the SELECT/INSERT/UPDATE they wanted — they
-- never took DELETE away.
--
-- ── HOW BAD IT ACTUALLY WAS ──────────────────────────────────────────────
--
-- Worth stating precisely rather than either dismissing or inflating.
--
-- For eleven of the twelve tables: not exploitable. RLS is enabled on all of
-- them and NO table has a DELETE policy, so every delete matched zero rows.
-- The grant was a latent hazard, not an open door — one future `FOR ALL`
-- policy away from becoming one.
--
-- For `sp_evidence` it mattered: that table carries a `FOR ALL` policy, which
-- covers DELETE. A holder could therefore hard-delete their own evidence row
-- directly, bypassing `sp_withdraw_evidence` and removing the record that the
-- evidence had ever been attached — including while a review was open on it.
--
-- ── THE BUG IT HID ───────────────────────────────────────────────────────
--
-- The grant also concealed a broken feature. `discardCredentialDraft` issued
-- a DELETE against `sp_claims`; RLS matched zero rows and raised no error, so
-- "Ta bort utkast" returned success and left the draft in place. It survived
-- review because a clean local replay has no DELETE grant, where the call
-- failed loudly — it passed silently only on the hosted project. Fixed in the
-- same change by marking the draft withdrawn instead.
-- =============================================================================

DO $$
DECLARE _t record;
BEGIN
  FOR _t IN
    SELECT c.relname
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname LIKE 'sp\_%'
  LOOP
    -- service_role included deliberately. The Passport's one service-role
    -- path is the public disclosure read, which deletes nothing; leaving it
    -- DELETE on the audit log would defeat the append-only guarantee for the
    -- one principal that bypasses RLS.
    EXECUTE format(
      'REVOKE DELETE ON public.%I FROM PUBLIC, anon, authenticated, service_role',
      _t.relname);
  END LOOP;
END $$;

-- Reproduce the hosted default privileges locally so the assertion below is
-- answerable on a clean replay. Without this the suite asks the right
-- question of a database that cannot answer it — exactly the gap Phase 7b
-- closed for function EXECUTE.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated';
  END IF;
END $$;
