-- Rollback for 20260913092000_cig_security_leadership_professions.sql.
--
-- Removes the two rows this migration added.
--
-- REFUSES rather than cascades if anything has come to depend on them. A
-- candidate may have self-reported one of these as their current profession
-- (cd_sessions.current_profession_slug), and a stored report may name it.
-- Deleting the row underneath a report would leave a snapshot pointing at a
-- profession that no longer exists -- so the rollback stops and says so, and
-- the operator decides.

DO $$
DECLARE _refs int;
BEGIN
  SELECT count(*) INTO _refs FROM public.cd_sessions
   WHERE current_profession_slug IN ('sakerhetsskyddschef','bevakningschef');
  IF _refs > 0 THEN
    RAISE EXCEPTION
      'CIG_LEADERSHIP_ROLLBACK_IN_USE: % session(s) self-report one of these professions; '
      'removing the row would orphan a stored report. Resolve those first.', _refs;
  END IF;
END $$;

DELETE FROM public.cig_professions
 WHERE slug IN ('sakerhetsskyddschef','bevakningschef');

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.cig_professions
              WHERE slug IN ('sakerhetsskyddschef','bevakningschef')) THEN
    RAISE EXCEPTION 'CIG_LEADERSHIP_ROLLBACK_INCOMPLETE: a row is still present';
  END IF;
END $$;
