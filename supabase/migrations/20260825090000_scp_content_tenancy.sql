-- #47 — Content ownership and tenant isolation for the durable content library.
--
-- ── WHAT THIS CLOSES ────────────────────────────────────────────────────
--
-- The governed content spine has no concept of an owner. Every programme,
-- module and assessment definition is implicitly CQrityjob-global, and the
-- SELECT policies created by 20260803090000 and 20260727120000 are literally
--
--     USING (true)
--
-- for every authenticated user. That is correct for global content and it is
-- exactly right today, because every existing row IS global.
--
-- It stops being correct the moment an employer owns a module. Site-specific
-- security instructions, a named client's datacenter onboarding, a customer's
-- internal reporting routine -- all of these are employer property, and under
-- `USING (true)` the first such row is readable by every logged-in user on the
-- platform, including competitors.
--
-- Adding ownership later is not the same change. It would mean revisiting every
-- row, every policy and every read model under load. Adding it now costs one
-- nullable column against a handful of rows, and no row's visibility changes,
-- because every existing row gets `owner_employer_id IS NULL` and NULL means
-- global -- the behaviour that exists today.
--
-- ── SCOPE, AND WHAT IS DELIBERATELY NOT IN IT ───────────────────────────
--
-- Eight tables carry or reveal ownable content and are corrected here:
--
--   scp_programs                  owner column + policy
--   scp_program_versions          policy (ownership via parent)
--   scp_modules                   owner column + policy
--   scp_module_versions           policy (ownership via parent)
--   scp_module_behaviour_map      policy (ownership via module version)
--   scp_assessment_definitions    owner column + policy
--   scp_assessment_versions       policy (ownership via definition)
--
-- scp_module_behaviour_map is NOT optional. It states which behaviours a module
-- targets. For an employer-owned module that is a description of the employer's
-- own risk assessment, so leaving it open would leak the shape of private
-- content even while the content itself is protected.
--
-- Deliberately NOT changed, so that this is a decision on the record rather
-- than an oversight:
--
--   scp_assessment_families   a product grouping, not content. Carries a name
--                             and a description of a CQrityjob product line.
--                             Revisit if a family ever becomes employer-owned.
--   scp_scenarios             shared global scenario text, deliberately
--   scp_scenario_versions     readable -- a learning scenario is meant to be
--                             read, and 20260803090000 says so explicitly.
--                             Revisit the moment an employer authors one.
--
-- ── WRITE ACCESS IS UNCHANGED ───────────────────────────────────────────
--
-- The `*_author_write` policies are left exactly as they are. Employer-owned
-- content is seeded by CQrityjob on the employer's behalf for now; the tenancy
-- column and read isolation are what must exist before such a row can be
-- created at all. An employer authoring surface is a later, separate decision,
-- and giving employers write access here would widen the blast radius of this
-- migration for no MVP benefit.
--
-- ── ADDITIVE-ONLY ───────────────────────────────────────────────────────
--
-- Additive. Three nullable columns, three partial indexes, seven SELECT policy
-- replacements. No table, column, constraint or row is dropped or rewritten.
--
-- Replacing an existing policy in a later migration is established practice in
-- this repository -- 20260821090000_scp_pilot_security_gate.sql does exactly
-- this for six policies, and 20260820090000 drops a function signature. Note
-- that scripts/migration-safety-check.ts does NOT detect destructive SQL; it
-- checks version shape, parked files, sha-pinned never-replay files and Lovable
-- duplicates. Additive-only is therefore a review obligation, and this header
-- is where that obligation is discharged.
--
-- Dependencies, all verified present on 3d825f3:
--   public.employers, public.has_employer_role(uuid, uuid, text[]),
--   public.scp_can_author(uuid)

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Ownership
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.scp_programs
  ADD COLUMN IF NOT EXISTS owner_employer_id uuid NULL
    REFERENCES public.employers(id) ON DELETE RESTRICT;

ALTER TABLE public.scp_modules
  ADD COLUMN IF NOT EXISTS owner_employer_id uuid NULL
    REFERENCES public.employers(id) ON DELETE RESTRICT;

ALTER TABLE public.scp_assessment_definitions
  ADD COLUMN IF NOT EXISTS owner_employer_id uuid NULL
    REFERENCES public.employers(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.scp_programs.owner_employer_id IS
  'NULL = CQrityjob-global content, authored under scp_can_author(). Non-null = '
  'private content belonging to one employer, readable only by that employer''s '
  'members and by platform content staff. The tenancy boundary for the library.';
COMMENT ON COLUMN public.scp_modules.owner_employer_id IS
  'NULL = CQrityjob-global content. Non-null = employer-private module.';
COMMENT ON COLUMN public.scp_assessment_definitions.owner_employer_id IS
  'NULL = CQrityjob-global assessment. Non-null = employer-private assessment.';

-- Partial: the overwhelming majority of rows are and will remain global, and a
-- partial index keeps the tenancy lookup small.
CREATE INDEX IF NOT EXISTS scp_programs_owner_idx
  ON public.scp_programs (owner_employer_id) WHERE owner_employer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS scp_modules_owner_idx
  ON public.scp_modules (owner_employer_id) WHERE owner_employer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS scp_assessment_definitions_owner_idx
  ON public.scp_assessment_definitions (owner_employer_id) WHERE owner_employer_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. Read policies become ownership-aware
--
-- The predicate is the same shape everywhere:
--
--   global content            -> anyone authenticated, exactly as today
--   employer-owned content    -> members of that employer (any role: reading
--                                the catalogue is a normal member activity,
--                                consistent with how the security gate left
--                                SELECT alone while narrowing writes)
--   platform content staff    -> everything, so authoring and review still work
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS scp_programs_read ON public.scp_programs;
CREATE POLICY scp_programs_read ON public.scp_programs
  FOR SELECT TO authenticated
  USING (
    owner_employer_id IS NULL
    OR public.has_employer_role(auth.uid(), owner_employer_id, NULL)
    OR public.scp_can_author(auth.uid())
  );

DROP POLICY IF EXISTS scp_program_versions_read ON public.scp_program_versions;
CREATE POLICY scp_program_versions_read ON public.scp_program_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.scp_programs p
       WHERE p.id = scp_program_versions.program_id
         AND (p.owner_employer_id IS NULL
              OR public.has_employer_role(auth.uid(), p.owner_employer_id, NULL)
              OR public.scp_can_author(auth.uid()))
    )
  );

DROP POLICY IF EXISTS scp_modules_read ON public.scp_modules;
CREATE POLICY scp_modules_read ON public.scp_modules
  FOR SELECT TO authenticated
  USING (
    owner_employer_id IS NULL
    OR public.has_employer_role(auth.uid(), owner_employer_id, NULL)
    OR public.scp_can_author(auth.uid())
  );

DROP POLICY IF EXISTS scp_module_versions_read ON public.scp_module_versions;
CREATE POLICY scp_module_versions_read ON public.scp_module_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.scp_modules m
       WHERE m.id = scp_module_versions.module_id
         AND (m.owner_employer_id IS NULL
              OR public.has_employer_role(auth.uid(), m.owner_employer_id, NULL)
              OR public.scp_can_author(auth.uid()))
    )
  );

-- The map reveals what a private module is ABOUT. Same boundary as the module.
DROP POLICY IF EXISTS scp_module_behaviour_map_read ON public.scp_module_behaviour_map;
CREATE POLICY scp_module_behaviour_map_read ON public.scp_module_behaviour_map
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
        FROM public.scp_module_versions mv
        JOIN public.scp_modules m ON m.id = mv.module_id
       WHERE mv.id = scp_module_behaviour_map.module_version_id
         AND (m.owner_employer_id IS NULL
              OR public.has_employer_role(auth.uid(), m.owner_employer_id, NULL)
              OR public.scp_can_author(auth.uid()))
    )
  );

DROP POLICY IF EXISTS scp_assessment_definitions_read ON public.scp_assessment_definitions;
CREATE POLICY scp_assessment_definitions_read ON public.scp_assessment_definitions
  FOR SELECT TO authenticated
  USING (
    owner_employer_id IS NULL
    OR public.has_employer_role(auth.uid(), owner_employer_id, NULL)
    OR public.scp_can_author(auth.uid())
  );

DROP POLICY IF EXISTS scp_assessment_versions_read ON public.scp_assessment_versions;
CREATE POLICY scp_assessment_versions_read ON public.scp_assessment_versions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.scp_assessment_definitions d
       WHERE d.id = scp_assessment_versions.definition_id
         AND (d.owner_employer_id IS NULL
              OR public.has_employer_role(auth.uid(), d.owner_employer_id, NULL)
              OR public.scp_can_author(auth.uid()))
    )
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Grants stay least-privilege
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'scp_programs','scp_program_versions','scp_modules','scp_module_versions',
    'scp_module_behaviour_map','scp_assessment_definitions','scp_assessment_versions'
  ] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
  END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Prove it
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _missing text; _n int;
BEGIN
  -- 4a. Every ownership column exists.
  FOREACH _missing IN ARRAY ARRAY[
    'scp_programs','scp_modules','scp_assessment_definitions'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = _missing
         AND column_name = 'owner_employer_id'
    ) THEN
      RAISE EXCEPTION 'SCP_TENANCY_COLUMN_MISSING: %.owner_employer_id was not created', _missing;
    END IF;
  END LOOP;

  -- 4b. No targeted table still carries an unconditional SELECT policy.
  SELECT count(*) INTO _n
    FROM pg_policies
   WHERE schemaname = 'public' AND cmd = 'SELECT' AND qual = 'true'
     AND tablename IN (
       'scp_programs','scp_program_versions','scp_modules','scp_module_versions',
       'scp_module_behaviour_map','scp_assessment_definitions','scp_assessment_versions');
  IF _n > 0 THEN
    RAISE EXCEPTION 'SCP_TENANCY_POLICY_STILL_OPEN: % targeted table(s) still read USING (true)', _n;
  END IF;

  -- 4c. All seven replacements exist and mention the ownership helper.
  SELECT count(*) INTO _n
    FROM pg_policies
   WHERE schemaname = 'public' AND cmd = 'SELECT'
     AND qual LIKE '%has_employer_role%'
     AND tablename IN (
       'scp_programs','scp_program_versions','scp_modules','scp_module_versions',
       'scp_module_behaviour_map','scp_assessment_definitions','scp_assessment_versions');
  IF _n <> 7 THEN
    RAISE EXCEPTION 'SCP_TENANCY_POLICY_COUNT: expected 7 ownership-aware read policies, found %', _n;
  END IF;

  -- 4d. Visibility is unchanged today: every existing row is global.
  IF EXISTS (SELECT 1 FROM public.scp_programs WHERE owner_employer_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.scp_modules WHERE owner_employer_id IS NOT NULL)
     OR EXISTS (SELECT 1 FROM public.scp_assessment_definitions WHERE owner_employer_id IS NOT NULL)
  THEN
    RAISE EXCEPTION 'SCP_TENANCY_UNEXPECTED_OWNER: this migration must not assign ownership to any existing row';
  END IF;
END $$;
