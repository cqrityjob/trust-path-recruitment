-- Prefer reverting the application while retaining approved versions and audit.
BEGIN;
-- Serialize the emptiness decision with an in-flight confirmation. Without
-- this lock a committed audit row could arrive after the check and be dropped.
LOCK TABLE recruiter_intelligence.profile_change_reviews IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM recruiter_intelligence.profile_change_reviews) THEN RAISE EXCEPTION 'RI_ROLLBACK_REQUIRES_PRESERVED_DATA'; END IF;
END $$;
DROP FUNCTION public.rec_ri_compare_applications(uuid,uuid,uuid[]);
DROP FUNCTION public.rec_ri_next_unreviewed(uuid,uuid);
DROP FUNCTION public.rec_ri_page_evidence(uuid,uuid,uuid[],uuid[]);
DROP FUNCTION public.rec_ri_profile_change_history(uuid);
DROP FUNCTION public.rec_ri_confirm_reviewed_profile(uuid,integer,uuid,date,jsonb,text);
DROP FUNCTION public.rec_ri_profile_change_impact(uuid,integer);
DROP TABLE recruiter_intelligence.profile_change_reviews;
DROP FUNCTION recruiter_intelligence.protect_profile_change_review();
COMMIT;
