-- Operational rollback ONLY. Does not drop debt, restore erased material or
-- revive the obsolete 12-month sweep. First disable the Edge worker environment
-- and unschedule the named cron job (see the activation plan).
UPDATE recruitment_erasure.activation SET enabled=false WHERE singleton;
-- Keep expand schema/capabilities/pending guards intact so manual jobs and
-- Storage debt remain accountable. Roll back application separately. No DOWN
-- migration may DROP the queue or its links while any files remain owed.
