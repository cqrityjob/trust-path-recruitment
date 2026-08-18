-- Closed-test governance.
--
-- ── THE PROBLEM THIS SOLVES ───────────────────────────────────────────────
--
-- The Security Guard programme is 18 authored items sitting at
-- content_status='draft', validation_status='design'. `scp_employer_assign`
-- refuses anything unpublished, so the complete participant journey has never
-- been runnable against the real content -- only against a 4-item fixture.
--
-- The wrong fix is to publish it. Publishing asserts that expert, legal,
-- cognitive and accessibility review happened. They have not. A product that
-- lies about its own validation state is worse than one that cannot be
-- demonstrated.
--
-- So: an organisation-level grant that says "this specific organisation may
-- run this specific unvalidated content, as a controlled pilot, and every
-- artefact it produces will say so forever".
--
-- ── WHAT THIS MIGRATION WILL NOT DO ───────────────────────────────────────
--
-- A closed_test grant NEVER becomes recruitment permission. `recruitment`
-- exists in the purpose vocabulary so the column can express it, and
-- scp_grant_permits_assignment() refuses it outright: recruitment continues to
-- require the normal publication and validation gates, which this migration
-- does not touch. That refusal is asserted at the bottom of this file.
--
-- Nothing existing is weakened. scp_fixture_access keeps working exactly as
-- before -- its rows are read as `development` grants -- and no publication
-- approval, validation status, purpose gate, RLS policy, scoring-key
-- isolation or historical snapshot is modified.

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1 — The grant
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'scp_governance_mode') THEN
    CREATE TYPE public.scp_governance_mode AS ENUM
      ('development', 'closed_test', 'recruitment');
  END IF;
END $$;

COMMENT ON TYPE public.scp_governance_mode IS
  'The basis on which an organisation is permitted to run assessment content. '
  'development: non-operational fixtures for internal work. closed_test: '
  'specifically granted draft/design/pilot content, as a controlled pilot. '
  'recruitment: operational selection use, which requires the normal '
  'publication and validation gates and is NEVER conferred by a grant.';

CREATE TABLE IF NOT EXISTS public.scp_test_grants (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id    uuid NOT NULL REFERENCES public.employers(id) ON DELETE CASCADE,
  purpose        public.scp_governance_mode NOT NULL,

  -- Scope. NULL definition_id means "every programme this purpose allows";
  -- a value narrows the grant to one programme, which is what a real pilot
  -- looks like.
  definition_id  uuid REFERENCES public.scp_assessment_definitions(id) ON DELETE CASCADE,

  reason         text NOT NULL,
  authorised_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  granted_at     timestamptz NOT NULL DEFAULT now(),

  -- A pilot that cannot end is not a pilot. Both nullable: an open-ended
  -- development grant is legitimate, an open-ended closed test is a decision
  -- somebody should have to make deliberately.
  expires_at     timestamptz,
  revoked_at     timestamptz,
  revoked_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,

  CONSTRAINT scp_test_grants_recruitment_never_granted
    CHECK (purpose <> 'recruitment'),
  CONSTRAINT scp_test_grants_expiry_after_grant
    CHECK (expires_at IS NULL OR expires_at > granted_at),
  CONSTRAINT scp_test_grants_reason_not_blank
    CHECK (btrim(reason) <> '')
);

-- One live grant per organisation per purpose per scope. Revoked rows stay for
-- the audit trail, so the uniqueness only binds the un-revoked ones.
CREATE UNIQUE INDEX IF NOT EXISTS scp_test_grants_live_uq
  ON public.scp_test_grants (employer_id, purpose, coalesce(definition_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE revoked_at IS NULL;

COMMENT ON TABLE public.scp_test_grants IS
  'Organisation-level permission to run assessment content that is not yet '
  'validated, with an explicit purpose, scope and end date. Empty by default. '
  'A CHECK constraint makes purpose=''recruitment'' unstorable: recruitment is '
  'earned through publication and validation, never granted per organisation.';

COMMENT ON COLUMN public.scp_test_grants.definition_id IS
  'NULL means every programme the purpose allows. A value narrows the grant to '
  'one programme, which is what a genuine pilot looks like.';
COMMENT ON COLUMN public.scp_test_grants.revoked_at IS
  'Set rather than deleting the row, so a historical report can still explain '
  'the basis it was produced under after the pilot ends.';

ALTER TABLE public.scp_test_grants ENABLE ROW LEVEL SECURITY;

-- No policy for authenticated, deliberately. An employer has no business
-- enumerating which organisations hold pilot grants -- including its own, which
-- it learns about from the library and from report wording, not from this list.
REVOKE ALL ON public.scp_test_grants FROM anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2 — Read the existing fixture grants as development grants
-- ═══════════════════════════════════════════════════════════════════════════
--
-- scp_fixture_access is not dropped and not changed. Its rows are mirrored in
-- as `development` grants so there is one place to ask the question, and the
-- Phase 2m behaviour and its tests continue to hold unaltered.

INSERT INTO public.scp_test_grants (employer_id, purpose, reason, authorised_by, granted_at)
SELECT fa.employer_id, 'development', fa.reason, fa.granted_by, fa.granted_at
  FROM public.scp_fixture_access fa
 WHERE NOT EXISTS (
   SELECT 1 FROM public.scp_test_grants g
    WHERE g.employer_id = fa.employer_id
      AND g.purpose = 'development'
      AND g.definition_id IS NULL
      AND g.revoked_at IS NULL);

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 3 — The single question the rest of the system asks
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_has_test_grant(
  _employer_id   uuid,
  _purpose       public.scp_governance_mode,
  _definition_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.scp_test_grants g
     WHERE g.employer_id = _employer_id
       AND g.purpose = _purpose
       AND g.revoked_at IS NULL
       AND (g.expires_at IS NULL OR g.expires_at > now())
       -- An unscoped grant covers everything; a scoped one covers only itself.
       AND (g.definition_id IS NULL OR g.definition_id = _definition_id)
  );
$$;

COMMENT ON FUNCTION public.scp_has_test_grant(uuid, public.scp_governance_mode, uuid) IS
  'Whether an organisation currently holds a live grant for this purpose and '
  'programme. Honours revocation and expiry, so a lapsed pilot stops working '
  'without anybody deleting anything. SECURITY DEFINER because scp_test_grants '
  'is readable by no ordinary role.';

REVOKE ALL     ON FUNCTION public.scp_has_test_grant(uuid, public.scp_governance_mode, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_has_test_grant(uuid, public.scp_governance_mode, uuid) TO authenticated;

-- Whether a grant may carry an assignment of content in this state. The place
-- where "closed test is not recruitment" is actually enforced.
CREATE OR REPLACE FUNCTION public.scp_grant_permits_assignment(
  _employer_id       uuid,
  _definition_id     uuid,
  _content_status    text,
  _validation_status text,
  _is_test_fixture   boolean
)
RETURNS public.scp_governance_mode
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Published, validated, non-fixture content needs no grant at all. This is
  -- the normal operational path and the only one that reaches recruitment.
  IF _content_status = 'published'
     AND NOT coalesce(_is_test_fixture, false)
     AND _validation_status IN ('operational-development', 'operational-selection') THEN
    RETURN 'recruitment';
  END IF;

  -- A fixture is internal development content, whatever its content_status.
  IF coalesce(_is_test_fixture, false) THEN
    IF public.scp_has_test_grant(_employer_id, 'development', _definition_id) THEN
      RETURN 'development';
    END IF;
    RETURN NULL;
  END IF;

  -- Real content that is not yet validated. A closed_test grant admits it, and
  -- what comes back is 'closed_test' -- never 'recruitment'. Everything
  -- downstream stamps that value, so the pilot basis travels with the data.
  IF _content_status IN ('draft', 'approved', 'published')
     AND _validation_status IN ('design', 'pilot')
     AND public.scp_has_test_grant(_employer_id, 'closed_test', _definition_id) THEN
    RETURN 'closed_test';
  END IF;

  -- Published-but-still-piloting content, with no grant, is not assignable.
  RETURN NULL;
END; $$;

COMMENT ON FUNCTION public.scp_grant_permits_assignment(uuid, uuid, text, text, boolean) IS
  'The governance mode under which this organisation may assign this content, '
  'or NULL if it may not. Returns ''recruitment'' ONLY for content that is '
  'genuinely published and operationally validated -- a grant can never produce '
  'that answer. Callers stamp the returned mode onto the attempt so the basis '
  'is preserved historically rather than inferred later.';

REVOKE ALL     ON FUNCTION public.scp_grant_permits_assignment(uuid, uuid, text, text, boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_grant_permits_assignment(uuid, uuid, text, text, boolean) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 4 — Governance lineage on the attempt
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Additive and nullable. Existing attempts keep NULL, which is honest: they
-- were taken before the concept existed, and back-filling a governance mode
-- onto them would be inventing history.
--
-- These columns are why a later publication event cannot retroactively make an
-- old closed-test report look validated. The attempt records what was true on
-- the day, not what the definition says today.

ALTER TABLE public.scp_attempts
  ADD COLUMN IF NOT EXISTS governance_mode public.scp_governance_mode,
  ADD COLUMN IF NOT EXISTS validation_status_at_assignment text,
  ADD COLUMN IF NOT EXISTS content_status_at_assignment text,
  ADD COLUMN IF NOT EXISTS test_grant_id uuid REFERENCES public.scp_test_grants(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.scp_attempts.governance_mode IS
  'The basis this attempt was assigned under, frozen at assignment. NULL for '
  'attempts predating closed-test governance.';
COMMENT ON COLUMN public.scp_attempts.validation_status_at_assignment IS
  'The assessment version''s validation_status on the day of assignment. '
  'Publishing or validating the version later does not change this, which is '
  'the entire point.';
COMMENT ON COLUMN public.scp_attempts.test_grant_id IS
  'The grant that authorised a development or closed_test attempt, so "who '
  'authorised this pilot" is answerable years later.';

-- Once written, the governance basis is not editable. An append-only guard
-- rather than a policy, because the rule is about the value's history, not
-- about who is asking.
CREATE OR REPLACE FUNCTION public.scp_guard_governance_lineage_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF OLD.governance_mode IS NOT NULL
     AND NEW.governance_mode IS DISTINCT FROM OLD.governance_mode THEN
    RAISE EXCEPTION
      'SCP_GOVERNANCE_LINEAGE_IMMUTABLE: an attempt''s governance basis cannot '
      'be rewritten (% -> %).', OLD.governance_mode, NEW.governance_mode
      USING ERRCODE = 'check_violation';
  END IF;
  IF OLD.validation_status_at_assignment IS NOT NULL
     AND NEW.validation_status_at_assignment IS DISTINCT FROM OLD.validation_status_at_assignment THEN
    RAISE EXCEPTION
      'SCP_GOVERNANCE_LINEAGE_IMMUTABLE: the validation status recorded at '
      'assignment cannot be rewritten.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS scp_guard_governance_lineage_immutable_trg ON public.scp_attempts;
CREATE TRIGGER scp_guard_governance_lineage_immutable_trg
  BEFORE UPDATE ON public.scp_attempts
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_governance_lineage_immutable();

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 5 — In-migration assertions
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _msg text; _mode public.scp_governance_mode;
BEGIN
  -- A recruitment grant must be unstorable, not merely discouraged.
  --
  -- This needs an employer to point at, and a freshly created database has
  -- none -- an earlier version of this assertion selected from an empty
  -- employers table, inserted nothing, and then reported the constraint
  -- missing. So it builds its own subject and removes it again.
  INSERT INTO public.employers (id, name, slug, status)
  VALUES ('00000000-dead-0000-0000-000000000001',
          'CTG assertion probe', 'ctg-assertion-probe', 'active')
  ON CONFLICT (id) DO NOTHING;

  BEGIN
    INSERT INTO public.scp_test_grants (employer_id, purpose, reason)
    VALUES ('00000000-dead-0000-0000-000000000001', 'recruitment', 'must fail');
    RAISE EXCEPTION 'SCP_CTG_RECRUITMENT_GRANTABLE: a recruitment grant was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;  -- expected: the CHECK refuses it
  END;

  -- A closed_test grant on the same organisation must be storable, or the
  -- constraint is refusing too much.
  INSERT INTO public.scp_test_grants (employer_id, purpose, reason)
  VALUES ('00000000-dead-0000-0000-000000000001', 'closed_test', 'probe');

  IF NOT public.scp_has_test_grant(
       '00000000-dead-0000-0000-000000000001', 'closed_test', NULL) THEN
    RAISE EXCEPTION 'SCP_CTG_GRANT_NOT_HONOURED: a live closed_test grant did not register';
  END IF;

  -- Revocation must take effect without deleting the audit row.
  UPDATE public.scp_test_grants SET revoked_at = now()
   WHERE employer_id = '00000000-dead-0000-0000-000000000001';
  IF public.scp_has_test_grant(
       '00000000-dead-0000-0000-000000000001', 'closed_test', NULL) THEN
    RAISE EXCEPTION 'SCP_CTG_REVOCATION_IGNORED: a revoked grant still authorises';
  END IF;

  DELETE FROM public.scp_test_grants
   WHERE employer_id = '00000000-dead-0000-0000-000000000001';
  DELETE FROM public.employers
   WHERE id = '00000000-dead-0000-0000-000000000001';

  -- Draft, unvalidated, no grant: not assignable.
  SELECT public.scp_grant_permits_assignment(
    '00000000-0000-0000-0000-000000000000', NULL, 'draft', 'design', false)
    INTO _mode;
  IF _mode IS NOT NULL THEN
    RAISE EXCEPTION 'SCP_CTG_UNGRANTED_DRAFT_ASSIGNABLE: got %', _mode;
  END IF;

  -- Published and operationally validated needs no grant, and is the only
  -- route to 'recruitment'.
  SELECT public.scp_grant_permits_assignment(
    '00000000-0000-0000-0000-000000000000', NULL,
    'published', 'operational-selection', false)
    INTO _mode;
  IF _mode <> 'recruitment' THEN
    RAISE EXCEPTION 'SCP_CTG_OPERATIONAL_PATH_BROKEN: got %', coalesce(_mode::text,'NULL');
  END IF;

  -- Published but still piloting, no grant: still not assignable. Publication
  -- alone is not validation.
  SELECT public.scp_grant_permits_assignment(
    '00000000-0000-0000-0000-000000000000', NULL, 'published', 'pilot', false)
    INTO _mode;
  IF _mode IS NOT NULL THEN
    RAISE EXCEPTION 'SCP_CTG_PILOT_WITHOUT_GRANT_ASSIGNABLE: got %', _mode;
  END IF;

  -- The lineage columns exist.
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='scp_attempts'
                    AND column_name='governance_mode') THEN
    RAISE EXCEPTION 'SCP_CTG_LINEAGE_MISSING';
  END IF;

  -- Existing gates untouched: the real Security Guard content is still draft,
  -- and still not published by this migration.
  IF EXISTS (SELECT 1 FROM public.scp_assessment_versions av
               JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
              WHERE av.content_status = 'published' AND NOT d.is_test_fixture) THEN
    RAISE EXCEPTION 'SCP_CTG_REAL_CONTENT_PUBLISHED: this migration must not publish anything';
  END IF;

  -- And the null provider is still the only enabled one.
  IF EXISTS (SELECT 1 FROM public.scp_ai_providers
              WHERE is_enabled AND code <> 'null_provider') THEN
    RAISE EXCEPTION 'SCP_CTG_AI_ENABLED';
  END IF;
END $$;

INSERT INTO public.scp_content_events
  (subject_type, subject_ref, action, reason, metadata)
VALUES (
  -- subject_type is a closed vocabulary; 'assessment_version' with a
  -- descriptive subject_ref is the convention the earlier governance
  -- migrations already use for platform-level events.
  'assessment_version', 'scp-closed-test-governance', 'updated',
  'Closed-test governance: an organisation-level grant with an explicit purpose, scope and end date, permitting a controlled pilot of content that is not yet validated. The 18-item Security Guard programme can now be run end to end without publishing it or claiming validation it has not earned. purpose=recruitment is unstorable by CHECK constraint, and scp_grant_permits_assignment returns recruitment only for content that is genuinely published and operationally validated, so a pilot grant can never become selection permission. Every attempt stamps the governance mode, the content and validation status on the day, and the authorising grant, so a later publication event cannot make an old pilot report look validated.',
  jsonb_build_object(
    'migration', '20260818090000_scp_closed_test_governance',
    'recruitment_grantable', false,
    'lineage_columns', jsonb_build_array(
      'governance_mode','validation_status_at_assignment',
      'content_status_at_assignment','test_grant_id'),
    'existing_gates_modified', false));