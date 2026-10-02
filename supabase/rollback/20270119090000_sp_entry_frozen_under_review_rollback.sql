-- Rollback of 20270119090000_sp_entry_frozen_under_review.
--
-- !! THIS REOPENS P1-H !! A holder can again change a claim or period while a
-- reviewer is looking at it and have the changed content verified. Run it
-- ONLY in an isolated test database (scripts/db-test.sh cycles it).
DROP TRIGGER IF EXISTS sp_claims_frozen_under_review ON public.sp_claims;
DROP TRIGGER IF EXISTS sp_periods_frozen_under_review ON public.sp_experience_periods;
DROP FUNCTION IF EXISTS public.sp_guard_entry_under_review();
DROP FUNCTION IF EXISTS public.sp_entry_review_on_holder_edit(uuid, uuid);
DO $$ BEGIN RAISE NOTICE 'SP_ENTRY_REVIEW_ROLLBACK ok: the under-review guard is gone'; END $$;
