-- =============================================================================
-- E2 — the employer may read the document the CANDIDATE received.
--
-- ── THE GAP THIS CLOSES ──────────────────────────────────────────────────
--
-- scp_release_attempt_report writes TWO documents from one attempt: an employer
-- document and a participant document. 20260904134520 then gave each audience
-- exactly one entry point, and scp_report_snapshot_readable gave each entry
-- point exactly one rule:
--
--   participant   the subject reads their own document
--   employer      an active member of the commissioning organisation reads
--                 that organisation's document
--
-- Which is correct, and leaves one question with no answer at all: an employer
-- about to share a result -- or one asked afterwards what the candidate was
-- told -- has no way to see the participant document. Not a narrowed version,
-- not a description of it: the thing itself.
--
-- Every workaround for that is worse than this function. Re-deriving the
-- candidate's wording in TypeScript produces a second account of what was
-- shared, kept in step with the first by nobody, and the two drift the first
-- time a template changes. Describing it in authored copy produces a promise
-- the product cannot verify. Widening scp_report_snapshot_readable would give
-- every active MEMBER the participant document, which is a far larger change
-- than the one needed.
--
-- ── WHY THIS DISCLOSES NOTHING NEW ABOUT THE CANDIDATE ───────────────────
--
-- The participant document is a strict SUBSET of what the caller can already
-- read about the same attempt, and 20260905054603 is where that is decided:
--
--   * `payload` — the same competency lines as the employer document, minus
--     the employer follow-up prompt and plus a participant REFLECTION prompt.
--     That prompt is published governed content from scp_followup_prompts; it
--     is a sentence addressed to the person, not a fact about them.
--   * `brief` — deliberately a subset: the modules completed and the person's
--     own self-report, with no observed ordering, no development framing and
--     no interview guide. scp_audience_brief then removes every mean and
--     spread, exactly as it does for the employer read.
--   * `safety_flags` — '[]' by contract, as in scp_participant_report. The
--     employer document carries severities; this one carries none, and this
--     function must not become the place they leak back.
--   * `context` — the participant context the release itself froze.
--
-- So an owner or admin calling this learns WHAT THE CANDIDATE WAS TOLD. They
-- learn nothing further about the candidate, and the direction of the
-- difference is the safety argument: it can only ever return less.
--
-- ── WHY OWNER/ADMIN AND NOT EVERY MEMBER ─────────────────────────────────
--
-- Releasing is an owner/admin act (scp_release_attempt_report raises
-- SCP_NOT_AUTHORISED_TO_RELEASE for anybody else). This read exists to serve
-- that act -- to check before, and to verify after -- so it carries the same
-- authority and no more. A member who cannot share a result has no decision
-- this document informs, and the ordinary employer read already serves every
-- legitimate purpose they do have.
--
-- ── WHAT IT IS NOT ───────────────────────────────────────────────────────
--
-- It is not a pre-release preview, and cannot be: the participant document
-- does not exist until scp_release_attempt_report writes it, and this function
-- returns rows rather than rendering any. Zero rows means "not released, or
-- not yours" -- the same deliberate indistinguishability every audience entry
-- point here has always had.
--
-- It creates no table, no column, no enum and no writer. It changes no scoring,
-- no content, no template, no release function, no existing policy and no
-- existing grant. Applying it widens exactly one thing: an owner or admin of
-- the commissioning organisation may read the participant document of an
-- attempt that organisation commissioned.
--
-- Rollback: supabase/rollback/20261105090000_scp_participant_report_issuer_preview_rollback.sql
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- §1  The rule: owner or admin of the COMMISSIONING organisation
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Written as its own predicate rather than inlined, for the same reason
-- scp_report_snapshot_readable is a function: a rule that appears twice is a
-- rule that can be changed once.

CREATE OR REPLACE FUNCTION public.scp_report_issuer_admin(_issuer_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT _issuer_organization_id IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.employer_memberships m
        WHERE m.employer_id = _issuer_organization_id
          AND m.user_id = auth.uid()
          AND m.status = 'active'
          AND m.role IN ('owner','admin'));
$$;

COMMENT ON FUNCTION public.scp_report_issuer_admin(uuid) IS
  'Whether the caller is an active owner or admin of the organisation that '
  'commissioned an attempt. The same authority scp_release_attempt_report '
  'requires to release a report, so a reader who may not share a result may '
  'not read the document sharing would produce.';

REVOKE ALL     ON FUNCTION public.scp_report_issuer_admin(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_report_issuer_admin(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- §2  The read
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Column-for-column the shape of scp_participant_report, so one client mapper
-- serves both and a field added to one is a compile error rather than a silent
-- omission in the other. The SELECT list is copied from it deliberately,
-- including the literal '[]'::jsonb for safety_flags: the participant document
-- carries no severities and this entry point does not become the exception.
--
-- The LEFT JOIN and the two coalesces are copied for the same reason, and they
-- are not cosmetic: 20260904171840 established that a released report stays
-- readable when its template row has gone, and an employer verifying what a
-- candidate received must see the same document the candidate sees -- including
-- for the sixteen historical snapshots whose template is missing. An inner
-- join here would return nothing for exactly those, and the screen would say
-- "not released" about a report that is.

CREATE OR REPLACE FUNCTION public.scp_participant_report_for_issuer(_attempt_id uuid)
RETURNS TABLE (
  id uuid,
  attempt_id uuid,
  subject_id uuid,
  audience text,
  released_at timestamptz,
  payload jsonb,
  brief jsonb,
  safety_flags jsonb,
  context jsonb,
  limitations_sv text[],
  limitations_en text[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.id, s.attempt_id, s.subject_id, s.audience, s.released_at,
         s.payload,
         public.scp_audience_brief(s.brief),
         '[]'::jsonb,
         s.context,
         coalesce(v.limitations_sv, ARRAY[]::text[]),
         coalesce(v.limitations_en, ARRAY[]::text[])
    FROM public.scp_report_snapshots s
    LEFT JOIN public.scp_report_versions v ON v.id = s.report_version_id
   WHERE s.attempt_id = _attempt_id
     AND s.audience = 'participant'
     AND public.scp_report_issuer_admin(s.issuer_organization_id);
$$;

COMMENT ON FUNCTION public.scp_participant_report_for_issuer(uuid) IS
  'The PARTICIPANT document of an attempt, for an owner or admin of the '
  'organisation that commissioned it: exactly what the candidate received, so '
  'the employer can verify what was shared rather than describe it. A strict '
  'subset of what the same caller already reads through scp_employer_report -- '
  'no severity, no mean, no spread, no derivation input. Zero rows when the '
  'report is not released or the caller is not an issuer admin, which are '
  'deliberately the same answer.';

REVOKE ALL     ON FUNCTION public.scp_participant_report_for_issuer(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_participant_report_for_issuer(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- §3  Proof, at apply time
-- ═══════════════════════════════════════════════════════════════════════════
--
-- The properties that would be worth breaking, asserted where a replay will
-- notice: SECURITY DEFINER with a pinned search_path, unreachable by anon,
-- and -- the one that matters most -- the participant projection did NOT
-- acquire a safety-flag column on its way through this file.

DO $$
DECLARE _def text;
BEGIN
  IF has_function_privilege('anon',
       'public.scp_participant_report_for_issuer(uuid)'::regprocedure, 'EXECUTE')
     OR has_function_privilege('anon',
       'public.scp_report_issuer_admin(uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_ISSUER_PREVIEW: anon must not reach either function.';
  END IF;

  IF NOT has_function_privilege('authenticated',
       'public.scp_participant_report_for_issuer(uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_ISSUER_PREVIEW: authenticated must reach the read.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public'
                    AND p.proname = 'scp_participant_report_for_issuer'
                    AND p.prosecdef
                    AND array_to_string(p.proconfig, ',') LIKE '%search_path%') THEN
    RAISE EXCEPTION 'SCP_ISSUER_PREVIEW: the read must be SECURITY DEFINER with a set search_path.';
  END IF;

  _def := pg_get_functiondef('public.scp_participant_report_for_issuer(uuid)'::regprocedure);
  IF position('s.safety_flags' in _def) > 0 THEN
    RAISE EXCEPTION 'SCP_ISSUER_PREVIEW: the participant projection must not return stored safety flags.';
  END IF;
  IF position('''[]''::jsonb' in _def) = 0 THEN
    RAISE EXCEPTION 'SCP_ISSUER_PREVIEW: safety_flags must be the empty array literal, as scp_participant_report has it.';
  END IF;
  IF position('audience = ''participant''' in _def) = 0 THEN
    RAISE EXCEPTION 'SCP_ISSUER_PREVIEW: the read must be pinned to the participant audience.';
  END IF;
  IF position('LEFT JOIN public.scp_report_versions' in _def) = 0 THEN
    RAISE EXCEPTION 'SCP_ISSUER_PREVIEW: the read must carry the 20260904171840 template continuity, as scp_participant_report does.';
  END IF;
  IF position('scp_report_issuer_admin' in _def) = 0 THEN
    RAISE EXCEPTION 'SCP_ISSUER_PREVIEW: the read must be gated by the issuer-admin predicate.';
  END IF;

  RAISE NOTICE 'SCP_ISSUER_PREVIEW_PROOF ok';
END $$;
