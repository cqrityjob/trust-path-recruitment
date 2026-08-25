-- =============================================================================
-- ROLLBACK — Security Passport Dubai (SIRA) Security Cadre catalogue
--
-- Reverses 20260908095000_sp_uae_dubai_cadre_catalogue.sql, and ONLY that.
--
-- ── WHY THIS FILE IS NOT "DELETE WHERE market_pack_code = 'AE-DU'" ─────
--
-- That statement already exists, in
-- 20260907093000_sp_uae_dubai_market_pack_rollback.sql, and it removes the
-- whole Dubai pack. If this file did the same thing, rolling back one
-- migration would silently roll back two — and the twelve cadre categories
-- added here would take the three seeded by 20260907093000 with them.
--
-- A rollback that removes more than its migration added is not reversible; it
-- is destructive with a reassuring name. So every row is named explicitly.
-- The lists below are the migration's own INSERT lists, and nothing else can
-- be caught by them.
--
-- Runs after the Abu Dhabi rollback and before the UK vehicle immobilisation
-- rollback.
--
-- ── WHAT IS LOST ───────────────────────────────────────────────────────
--
-- Claims on the twelve added cadre cards and the nine added courses. The three
-- original categories, their claims and their history are untouched. Export
-- first if any exist — the guard below will tell you, and refuse.
-- =============================================================================

BEGIN;

-- The migration's own lists, named once and used throughout. A row that is not
-- in one of these was not added by 20260908095000 and must survive.
CREATE TEMP TABLE _rb_du_creds (code text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _rb_du_creds (code) VALUES
  ('AE_DU_SIRA_CARD_MONEY_TRANSPORT'), ('AE_DU_SIRA_CARD_EVENT_GUARD'),
  ('AE_DU_SIRA_CARD_BODYGUARD'),       ('AE_DU_SIRA_CARD_WATCHMAN'),
  ('AE_DU_SIRA_CARD_SYSTEMS_OPERATOR'),('AE_DU_SIRA_CARD_SYSTEMS_TECHNICIAN'),
  ('AE_DU_SIRA_CARD_SYSTEMS_ENGINEER'),('AE_DU_SIRA_CARD_SECURITY_MANAGER'),
  ('AE_DU_SIRA_CARD_HEAD_OF_SECURITY'),('AE_DU_SIRA_CARD_TRAINER'),
  ('AE_DU_SIRA_CARD_EXPERT'),          ('AE_DU_SIRA_CARD_CONSULTANT'),
  ('AE_DU_SUPERVISOR_COURSE'),         ('AE_DU_OPS_MANAGER_COURSE'),
  ('AE_DU_SECURITY_MANAGER_COURSE'),   ('AE_DU_SYSTEMS_OPERATOR_COURSE'),
  ('AE_DU_SYSTEMS_TECHNICIAN_COURSE'), ('AE_DU_SYSTEMS_ENGINEER_COURSE'),
  ('AE_DU_TRAINER_COURSE'),            ('AE_DU_EVENTS_COURSE'),
  ('AE_DU_CASH_TRANSPORT_COURSE');

CREATE TEMP TABLE _rb_du_roles (code text PRIMARY KEY) ON COMMIT DROP;
INSERT INTO _rb_du_roles (code) VALUES
  ('AE_DU_SIRA_MONEY_TRANSPORT_GUARD'), ('AE_DU_SIRA_EVENT_SECURITY_GUARD'),
  ('AE_DU_SIRA_BODYGUARD'),             ('AE_DU_SIRA_WATCHMAN'),
  ('AE_DU_SIRA_SYSTEMS_OPERATOR'),      ('AE_DU_SIRA_SYSTEMS_TECHNICIAN'),
  ('AE_DU_SIRA_SYSTEMS_ENGINEER'),      ('AE_DU_SIRA_SECURITY_MANAGER'),
  ('AE_DU_SIRA_HEAD_OF_SECURITY'),      ('AE_DU_SIRA_SECURITY_TRAINER'),
  ('AE_DU_SIRA_SECURITY_EXPERT'),       ('AE_DU_SIRA_SECURITY_CONSULTANT');

-- ---------------------------------------------------------------------------
-- 1. Refuse rather than destroy a holder's record
-- ---------------------------------------------------------------------------
DO $rbdc$
DECLARE
  _claims    integer;
  _corrected integer;
  _opted_in  text := current_setting('sp.rollback_may_delete_holder_claims', true);
BEGIN
  SELECT count(*) INTO _claims FROM public.sp_claims c
   WHERE c.credential_code IN (SELECT code FROM _rb_du_creds);

  SELECT count(*) INTO _corrected FROM public.sp_claims c
   WHERE c.credential_code IN (SELECT code FROM _rb_du_creds)
     AND (c.supersedes_id IS NOT NULL
          OR EXISTS (SELECT 1 FROM public.sp_claims s WHERE s.supersedes_id = c.id));

  IF _claims > 0 AND coalesce(_opted_in, '') <> 'yes' THEN
    RAISE EXCEPTION
      'ROLLBACK REFUSED: % holder claim(s) exist on the Dubai cadre categories '
      'added by 20260908095000, % of them corrected. This rollback will not '
      'destroy a holder''s record to tidy a schema. RECOVERY: export the rows, '
      'have each holder withdraw or correct the claim so their history '
      'survives, or accept the loss deliberately with '
      'SET LOCAL sp.rollback_may_delete_holder_claims = ''yes''; then re-run.',
      _claims, _corrected;
  END IF;

  IF _claims > 0 THEN
    RAISE WARNING 'Deleting % Dubai cadre claim(s) — opted in explicitly.', _claims;
  END IF;
END $rbdc$;

-- ---------------------------------------------------------------------------
-- 2. Exactly the rows 20260908095000 added
-- ---------------------------------------------------------------------------
DELETE FROM public.sp_professional_titles
 WHERE market_pack_code = 'AE-DU'
   AND requires_credential_codes <@ (SELECT array_agg(code) FROM _rb_du_creds);

DELETE FROM public.sp_claims
 WHERE credential_code IN (SELECT code FROM _rb_du_creds);

DELETE FROM public.sp_credential_types
 WHERE code IN (SELECT code FROM _rb_du_creds);

DELETE FROM public.sp_regulated_roles
 WHERE code IN (SELECT code FROM _rb_du_roles);

-- ---------------------------------------------------------------------------
-- 3. Prove the ORIGINAL Dubai pack survived
-- ---------------------------------------------------------------------------
-- This is the assertion that distinguishes this rollback from the pack-wide
-- one. If the three categories from 20260907093000 are gone, this file removed
-- somebody else's migration.
DO $$
BEGIN
  IF (SELECT count(*) FROM public.sp_credential_types
       WHERE code IN ('AE_DU_SIRA_CARD_GUARD', 'AE_DU_SIRA_CARD_SUPERVISOR',
                      'AE_DU_SIRA_CARD_OPS_MANAGER')) <> 3 THEN
    RAISE EXCEPTION
      'ROLLBACK OVERREACHED: the three cadre cards seeded by 20260907093000 '
      'were removed by the rollback of 20260908095000';
  END IF;

  IF (SELECT count(*) FROM public.sp_credential_types
       WHERE code IN ('AE_DU_SIRA_GUARD_COURSE', 'AE_DU_BASIC_FIRE_SAFETY',
                      'AE_DU_BASIC_LIFE_SUPPORT', 'AE_DU_PEOPLE_OF_DETERMINATION',
                      'AE_DU_SPECIALIST_COURSE', 'AE_DU_FITNESS_CHECKED')) <> 6 THEN
    RAISE EXCEPTION
      'ROLLBACK OVERREACHED: the original Dubai courses or the fitness check '
      'were removed by the rollback of 20260908095000';
  END IF;

  IF EXISTS (SELECT 1 FROM public.sp_credential_types
              WHERE code IN (SELECT code FROM _rb_du_creds)) THEN
    RAISE EXCEPTION 'ROLLBACK INCOMPLETE: an added Dubai cadre credential survived';
  END IF;

  -- The narrow-result guard that 20260907093000 asserts must still hold, or
  -- its own rollback will fail for a reason that has nothing to do with it.
  IF (SELECT narrow_result_only FROM public.sp_credential_types
       WHERE code = 'AE_DU_FITNESS_CHECKED') IS NOT TRUE THEN
    RAISE EXCEPTION 'ROLLBACK DAMAGED DUBAI: the fitness check is no longer narrow-result';
  END IF;
END $$;

COMMIT;
