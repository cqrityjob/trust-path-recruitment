-- History-only ledger repair (equivalent to `supabase migration repair --status applied`)
-- for three canonical migrations whose schema effects were applied through Lovable on
-- 2026-09-07 under generated hosted ledger identities. Adds ONLY the missing canonical
-- alias rows to supabase_migrations.schema_migrations. Executes no application, schema
-- or business SQL. Idempotent. Refuses if a canonical version already exists under an
-- unexpected name, or if a hosted anchor row exists under an unexpected name.
-- On a database without the Supabase ledger table (e.g. the CI clean replay on plain
-- Postgres) it is a no-op.
DO $repair$
DECLARE
  _targets CONSTANT jsonb := '[
    {"canonical":"20261028090000","name":"admin_cancel_assignment_error_contract","hosted":"20260907064303","hosted_name":"f8efc1c3-def4-4147-9db1-45a68b1f6a69"},
    {"canonical":"20261030090000","name":"sp_trust_source_containment","hosted":"20260907064513","hosted_name":"19c76abb-f1fd-40e5-aa50-b008b7de38bf"},
    {"canonical":"20261031090000","name":"sp_passport_first_merit","hosted":"20260907064849","hosted_name":"0bb96516-c1eb-4178-8e9e-60bde13071dd"}
  ]'::jsonb;
  _t jsonb;
  _hosted_name text;
  _hosted_found boolean;
  _existing_name text;
  _existing_found boolean;
  _inserted integer := 0;
  _already integer := 0;
  _skipped integer := 0;
BEGIN
  IF to_regclass('supabase_migrations.schema_migrations') IS NULL THEN
    RAISE NOTICE 'LEDGER_REPAIR_NOOP: supabase_migrations.schema_migrations does not exist on this database; nothing to repair';
    RETURN;
  END IF;

  FOR _t IN SELECT value FROM jsonb_array_elements(_targets) LOOP
    -- 1. Canonical version already recorded?
    SELECT name INTO _existing_name
      FROM supabase_migrations.schema_migrations
     WHERE version = _t->>'canonical';
    _existing_found := FOUND;
    IF _existing_found THEN
      IF _existing_name IS DISTINCT FROM (_t->>'name') THEN
        RAISE EXCEPTION 'LEDGER_REPAIR_REFUSED: canonical version % already recorded under unexpected name % (expected %)',
          _t->>'canonical', coalesce(_existing_name, '<null>'), _t->>'name';
      END IF;
      _already := _already + 1;
      RAISE NOTICE 'LEDGER_REPAIR_ALREADY_PRESENT: % %', _t->>'canonical', _t->>'name';
      CONTINUE;
    END IF;

    -- 2. The hosted anchor row (the identity that actually carried the schema effects)
    --    must be present under its recorded name before an alias may be written.
    SELECT name INTO _hosted_name
      FROM supabase_migrations.schema_migrations
     WHERE version = _t->>'hosted';
    _hosted_found := FOUND;
    IF NOT _hosted_found THEN
      -- No hosted apply recorded on this database: the canonical file applies on its own; do not alias.
      _skipped := _skipped + 1;
      RAISE NOTICE 'LEDGER_REPAIR_SKIPPED: hosted anchor % absent; canonical % left to apply normally',
        _t->>'hosted', _t->>'canonical';
      CONTINUE;
    END IF;
    IF _hosted_name IS DISTINCT FROM (_t->>'hosted_name') THEN
      RAISE EXCEPTION 'LEDGER_REPAIR_REFUSED: hosted version % recorded under unexpected name % (expected %)',
        _t->>'hosted', coalesce(_hosted_name, '<null>'), _t->>'hosted_name';
    END IF;

    -- 3. Insert the alias row: version, name and statements only, as `supabase migration repair` does.
    INSERT INTO supabase_migrations.schema_migrations (version, name, statements)
    VALUES (
      _t->>'canonical',
      _t->>'name',
      ARRAY[format(
        '-- history repair 2026-09-07: canonical %s_%s. Schema effects were applied under hosted ledger version %s (%s) on 2026-09-07 and verified independently. No SQL was executed under this version.',
        _t->>'canonical', _t->>'name', _t->>'hosted', _t->>'hosted_name'
      )]
    );
    _inserted := _inserted + 1;
    RAISE NOTICE 'LEDGER_REPAIR_INSERTED: % % (alias of hosted %)', _t->>'canonical', _t->>'name', _t->>'hosted';
  END LOOP;

  RAISE NOTICE 'LEDGER_REPAIR_DONE: inserted=% already_present=% skipped=%', _inserted, _already, _skipped;
END
$repair$;