-- =============================================================================
-- Catalogue read hardening -- the four owner-approved items of the 2026-10-01
-- pre-release security pass (the "45 tables" review)
-- =============================================================================
--
-- Lovable's scanner reported 45 tables whose SELECT policy is USING (true).
-- The read-only audit of 2026-10-01 found NO cross-user or cross-tenant
-- defect among them: none carries a user, holder or employer column, anon
-- reaches only three public catalogues, and no principal below a content
-- role can write any of them. That audit, and the owner's decision on it,
-- is docs/release/2026-10-01-catalogue-read-hardening.md. It is NOT a bulk
-- fix: 41 of the 45 policies stay exactly as they are, because they are the
-- intended public / signed-in catalogue.
--
-- Four items were approved as hardening, each the smallest boundary that
-- matches a contract the repository already states:
--
--   1. scp_behaviour_versions, scp_role_versions -- an ordinary signed-in
--      user reads PUBLISHED content only. 20260802090000 made "definitions
--      and registries" readable so a manager sees what a competency means;
--      it never intended unreviewed drafts (production: 24 draft behaviour
--      versions, 3 draft role versions) to be part of that. Authors keep every
--      row through scp_can_author() -- admin, editor, reviewer, publisher --
--      which is exactly who uses the role-pack authoring screens
--      (src/routes/_authenticated.admin.interview-role-packs.*). The FOR ALL
--      *_author_write policies on both tables already admit authors to SELECT;
--      the author branch is restated here so the read contract stands on its
--      own if that write policy is ever narrowed.
--
--   2. cd_professions -- an ordinary signed-in user reads professions that
--      are approved_for_ranking only. Every candidate path already filters
--      on it (v31-public.functions.ts reads through the service role WITH
--      .eq('approved_for_ranking', true)); the career journey reads by the
--      ids of a frozen, already-ranked report. The owner preview
--      (v31-owner-preview.functions.ts) lists every row and is admin-only by
--      assertAdmin() -> is_platform_admin(), which the policy keeps.
--
--   3. scp_interview_guide_prompts -- the interviewer's question bank and its
--      listen_for guidance stop being readable by every signed-in account.
--      20260905054603 already states the contract: the participant brief
--      carries "no interview guide -- those are written for a recruiter
--      preparing a conversation, and handing them to the person being
--      assessed would be handing them somebody else's working notes." The
--      employer receives the guide INSIDE the released employer brief, built
--      by the SECURITY DEFINER scp_release_attempt_report() and read through
--      the audience snapshot contract -- untouched here. No application code
--      reads the table directly (src/lib/interview-intelligence/context.ts
--      consumes the brief). So the smallest correct boundary is the table
--      itself: readable by content authors only.
--
--   4. scp_followup_prompts, scp_form_blocks, scp_interview_guide_prompts --
--      `authenticated` loses INSERT, UPDATE and DELETE. No client, script or
--      invoker-rights function writes these tables; every write in the
--      repository is a migration, the service role or a SECURITY DEFINER
--      function. RLS already refused the writes (form_blocks and guide_prompts
--      carry no write policy at all; followup_prompts' write policy requires
--      scp_can_author). The grants on the latter two were Supabase
--      default-privilege residue; on followup_prompts they were restated by
--      20260822090000 for replay parity with a Lovable re-issue, not because
--      anything used them. Its author-write policy is left in place, dormant:
--      re-granting the privilege re-opens authoring with the predicate intact.
--
-- WHAT THIS DOES NOT DO: create, drop or rename any table, column, policy or
-- function; touch anon (it already holds nothing on items 1-4); touch any
-- SECURITY DEFINER read path (they run as the owner and are unaffected); touch
-- the 41 remaining catalogue policies. ALTER POLICY keeps every policy name,
-- so no policy is ever absent.
--
-- Rollback: supabase/rollback/20270101090000_catalogue_read_hardening_rollback.sql
-- Suite:    supabase/tests/catalogue_read_hardening_test.sql
-- =============================================================================

-- ── PRECONDITION ────────────────────────────────────────────────────────
DO $$
DECLARE _missing text;
BEGIN
  IF to_regprocedure('public.scp_can_author(uuid)') IS NULL
     OR to_regprocedure('public.is_platform_admin(uuid)') IS NULL THEN
    RAISE EXCEPTION 'CATALOGUE_HARDENING_PRECONDITION: scp_can_author(uuid) or is_platform_admin(uuid) is missing';
  END IF;
  SELECT string_agg(x.t || '.' || x.p, ', ') INTO _missing
    FROM (VALUES ('scp_behaviour_versions', 'scp_behaviour_versions_read'),
                 ('scp_role_versions',      'scp_role_versions_read'),
                 ('cd_professions',         'cd_professions_read'),
                 ('scp_interview_guide_prompts', 'scp_interview_guide_prompts_read')) x(t, p)
   WHERE NOT EXISTS (SELECT 1 FROM pg_policies
                      WHERE schemaname = 'public' AND tablename = x.t AND policyname = x.p
                        AND cmd = 'SELECT');
  IF _missing IS NOT NULL THEN
    RAISE EXCEPTION 'CATALOGUE_HARDENING_PRECONDITION: expected read policy missing: %', _missing;
  END IF;
END $$;

-- ── 1. Published graph content for everyone; drafts for authors ─────────
ALTER POLICY scp_behaviour_versions_read ON public.scp_behaviour_versions
  TO authenticated
  USING (content_status = 'published' OR public.scp_can_author(auth.uid()));

ALTER POLICY scp_role_versions_read ON public.scp_role_versions
  TO authenticated
  USING (content_status = 'published' OR public.scp_can_author(auth.uid()));

-- ── 2. Approved professions for everyone; the full list for admins ───────
ALTER POLICY cd_professions_read ON public.cd_professions
  TO authenticated
  USING (approved_for_ranking OR public.is_platform_admin(auth.uid()));

-- ── 3. The interviewer guide is not a candidate-readable catalogue ───────
ALTER POLICY scp_interview_guide_prompts_read ON public.scp_interview_guide_prompts
  TO authenticated
  USING (public.scp_can_author(auth.uid()));

COMMENT ON TABLE public.scp_interview_guide_prompts IS
  'Interviewer guidance (questions, follow-ups, listen_for). Recruiter working '
  'notes: never a candidate read. Content authors read the table; an employer '
  'receives the guide only inside the released employer brief built by '
  'scp_release_attempt_report() (SECURITY DEFINER). See 20270101090000.';

-- ── 4. No client write privilege on three governed catalogues ────────────
REVOKE INSERT, UPDATE, DELETE ON public.scp_followup_prompts        FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.scp_form_blocks             FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.scp_interview_guide_prompts FROM PUBLIC, anon, authenticated;

-- ── 5. Postflight: the catalogue states the contract, or nothing commits ─
DO $$
DECLARE _t text;
BEGIN
  -- Exact predicates, so a later ALTER cannot drift silently.
  IF (SELECT qual FROM pg_policies WHERE schemaname = 'public'
        AND tablename = 'scp_behaviour_versions' AND policyname = 'scp_behaviour_versions_read')
     IS DISTINCT FROM '((content_status = ''published''::text) OR scp_can_author(auth.uid()))' THEN
    RAISE EXCEPTION 'CATALOGUE_HARDENING_PROOF: scp_behaviour_versions_read predicate is not the published-or-author contract';
  END IF;
  IF (SELECT qual FROM pg_policies WHERE schemaname = 'public'
        AND tablename = 'scp_role_versions' AND policyname = 'scp_role_versions_read')
     IS DISTINCT FROM '((content_status = ''published''::text) OR scp_can_author(auth.uid()))' THEN
    RAISE EXCEPTION 'CATALOGUE_HARDENING_PROOF: scp_role_versions_read predicate is not the published-or-author contract';
  END IF;
  IF (SELECT qual FROM pg_policies WHERE schemaname = 'public'
        AND tablename = 'cd_professions' AND policyname = 'cd_professions_read')
     IS DISTINCT FROM '(approved_for_ranking OR is_platform_admin(auth.uid()))' THEN
    RAISE EXCEPTION 'CATALOGUE_HARDENING_PROOF: cd_professions_read predicate is not the approved-or-admin contract';
  END IF;
  IF (SELECT qual FROM pg_policies WHERE schemaname = 'public'
        AND tablename = 'scp_interview_guide_prompts' AND policyname = 'scp_interview_guide_prompts_read')
     IS DISTINCT FROM 'scp_can_author(auth.uid())' THEN
    RAISE EXCEPTION 'CATALOGUE_HARDENING_PROOF: scp_interview_guide_prompts_read is not author-only';
  END IF;

  -- No other permissive SELECT policy may re-open these four tables.
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public'
               AND tablename IN ('scp_behaviour_versions', 'scp_role_versions',
                                 'cd_professions', 'scp_interview_guide_prompts')
               AND permissive = 'PERMISSIVE' AND cmd IN ('SELECT', 'ALL')
               AND (qual IS NULL OR btrim(qual) IN ('true', '(true)'))) THEN
    RAISE EXCEPTION 'CATALOGUE_HARDENING_PROOF: an unconditional read policy remains on a hardened table';
  END IF;

  -- Item 4: reads stay, writes are gone, for every client role.
  FOREACH _t IN ARRAY ARRAY['scp_followup_prompts', 'scp_form_blocks', 'scp_interview_guide_prompts'] LOOP
    IF has_table_privilege('authenticated', 'public.' || _t, 'INSERT')
       OR has_table_privilege('authenticated', 'public.' || _t, 'UPDATE')
       OR has_table_privilege('authenticated', 'public.' || _t, 'DELETE')
       OR has_table_privilege('anon', 'public.' || _t, 'INSERT')
       OR has_table_privilege('anon', 'public.' || _t, 'UPDATE')
       OR has_table_privilege('anon', 'public.' || _t, 'DELETE') THEN
      RAISE EXCEPTION 'CATALOGUE_HARDENING_PROOF: a client role still holds a write privilege on %', _t;
    END IF;
    IF NOT has_table_privilege('authenticated', 'public.' || _t, 'SELECT') THEN
      RAISE EXCEPTION 'CATALOGUE_HARDENING_PROOF: authenticated lost SELECT on % (the policy decides rows, not the grant)', _t;
    END IF;
  END LOOP;

  -- anon still reaches none of the four hardened read tables.
  IF has_table_privilege('anon', 'public.scp_behaviour_versions', 'SELECT')
     OR has_table_privilege('anon', 'public.scp_role_versions', 'SELECT')
     OR has_table_privilege('anon', 'public.cd_professions', 'SELECT')
     OR has_table_privilege('anon', 'public.scp_interview_guide_prompts', 'SELECT') THEN
    RAISE EXCEPTION 'CATALOGUE_HARDENING_PROOF: anon can read a hardened table';
  END IF;

  RAISE NOTICE 'CATALOGUE_HARDENING_PROOF ok: drafts and unapproved professions are author/admin-only, the interviewer guide is author-only, and three catalogues carry no client write privilege';
END $$;
