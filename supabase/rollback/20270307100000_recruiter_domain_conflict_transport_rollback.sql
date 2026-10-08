-- Capability rollback only: restores exact previous function definitions.
-- Never changes candidate data, reports, content locks/snapshots, grants or
-- lifecycle. Prior versions have unsafe custom40001 on PostgREST14; stop
-- concurrent recruitment/interview writes and prefer a forward repair.
BEGIN;
DO $$ DECLARE _row record;
BEGIN
 IF to_regclass('scp_private.interview_conflict_prior_functions') IS NULL THEN
   RAISE EXCEPTION 'RI_CONFLICT_ROLLBACK_NOT_INSTALLED';
 END IF;
 IF (SELECT count(*) FROM scp_private.interview_conflict_prior_functions)<>12 THEN
   RAISE EXCEPTION 'RI_CONFLICT_ROLLBACK_DEFINITIONS_MISSING';
 END IF;
 FOR _row IN SELECT definition FROM scp_private.interview_conflict_prior_functions ORDER BY signature LOOP
   EXECUTE _row.definition;
 END LOOP;
END $$;
DROP TABLE scp_private.interview_conflict_prior_functions;
COMMIT;
