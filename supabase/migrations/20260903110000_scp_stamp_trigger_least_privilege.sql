-- #63 follow-up — the one function 20260903100000 forgot to close.
--
-- Hosted Supabase grants EXECUTE on every newly created public function to
-- PUBLIC, and therefore to `anon`, unless the migration revokes it. Every other
-- function in 20260903100000 carries an explicit REVOKE. The trigger function
-- does not, and the hosted grant audit found it exactly where that predicts:
--
--   scp_stamp_review_conflict_disclosure()   anon EXECUTE = true
--
-- ── WHAT THE ACTUAL EXPOSURE IS ─────────────────────────────────────────
--
-- None, and it is worth being precise rather than alarming. A function
-- declared RETURNS trigger cannot be invoked directly: PostgreSQL refuses with
-- 0A000 "trigger functions can only be called as triggers", which was confirmed
-- against the hosted database as `anon` before this migration was written. For
-- the same reason PostgREST does not expose it as an RPC at all.
--
-- ── WHY FIX IT ANYWAY ───────────────────────────────────────────────────
--
-- Because the rule this platform actually relies on is "every public function
-- states its own grants", and a rule with one silent exception is a rule people
-- stop checking. The exception here is harmless; the habit of tolerating one is
-- not. It is also SECURITY DEFINER, so the day someone changes its return type
-- to make it callable for a test, the grant is already open and nobody is
-- looking at this line.
--
-- Separate file rather than an edit to 20260903100000, because that migration
-- is already applied to the hosted database under its canonical version. Fixing
-- it in place would put the repository and production out of step, which is a
-- worse defect than the one being fixed.

REVOKE ALL ON FUNCTION public.scp_stamp_review_conflict_disclosure()
  FROM PUBLIC, anon;

-- No GRANT. The trigger runs as its owner, so nothing needs EXECUTE by name.

DO $$
BEGIN
  IF has_function_privilege('anon',
       'public.scp_stamp_review_conflict_disclosure()'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_STAMP_TRIGGER_STILL_PUBLIC: anon retains EXECUTE on the disclosure trigger';
  END IF;
END $$;
