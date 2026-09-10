-- =============================================================================
-- E4 — the candidate-safe interview summary.
--
-- ── WHAT IS MISSING, AND WHY NOTHING EXISTING CAN BE STRETCHED TO FIT ────
--
-- One interview produces two outputs for two audiences, and only one of them
-- exists. `scp_iv_finalise_report` writes the employer's report: confirmed
-- evidence, human assessments with their levels and rationales, unresolved
-- findings, panel material, AI-run disclosure. It is private decision support
-- and every line of it is written for a recruiter.
--
-- The interviewed person gets `scp_iv_candidate_interview_detail`, which tells
-- them WHICH of their material is in use and nothing about what came of the
-- conversation. There is no route by which an employer can give them a summary
-- of the interview, and no row that would hold one.
--
-- Three ways of closing that are worse than this one:
--
--   * Give the candidate a filtered view of the employer report. The brief
--     rules it out, and rightly: a projection that starts as "the same
--     document minus four sections" is one careless join away from being the
--     same document. The two payloads here are built by different SELECTs from
--     different tables and share no code path.
--   * Render it in TypeScript at read time. Then "what was shared" is whatever
--     today's build renders, and last March's summary changes when the code
--     does. A shared summary has to be a frozen row.
--   * Reuse scp_interview_reports with an audience column. That table's
--     payload shape, its blockers, its content hash and its supersede rule all
--     belong to the employer document; adding an audience to it would mean
--     every future change to one document had to be reasoned about for two.
--
-- ── WHAT THE CANDIDATE DOCUMENT CONTAINS, AND THE RULE BEHIND IT ────────
--
-- Everything in it is either GOVERNED CONTENT (the pack's own competency
-- names and definitions, reviewed once and authored by a person) or THE
-- CANDIDATE'S OWN WORDS (a confirmed evidence excerpt, which is what they said
-- and which a named human accepted). Nothing else.
--
-- What is therefore absent is absent structurally rather than by omission:
--
--   NO LEVEL, ANYWHERE.  scp_interview_assessments is not read by the builder
--   below -- not the level, not the anchor, not the rationale, not the
--   uncertainty note. A requirement rating is the employer's private judgement
--   and the brief forbids it reaching the candidate. This is the single most
--   important property of this file, and the one a later "it would be helpful
--   to show them how they did" would break first.
--
--   NO ORIGINAL AI WORDING.  `original_excerpt` and `correction_note` are the
--   record of a human correcting a machine. They are audit material.
--
--   NO REVIEWER IDENTITY.  `confirmed_by` never crosses.
--
--   NO FINDINGS.  gap / unclear / contradiction / verification are the
--   employer's open questions, and several are `claim_class = 'ai_inference'`.
--   "Development areas" here is derived instead from EVIDENCE COVERAGE: an
--   area with no confirmed example is reported as an area the conversation did
--   not reach a concrete example on. That is a statement about how much
--   evidence exists, not about the person -- the same distinction
--   20260830093000 already draws for `explore_limited_evidence`.
--
--   NO PANEL MATERIAL, NO AI RUNS, NO PROPOSALS, NO NOTES, NO TRANSCRIPT.
--
-- ── AND THE FOUR THINGS THE RELEASE ITSELF GUARANTEES ───────────────────
--
--   SEPARATE FROM FINALISATION.  Finalising the employer report does NOT
--   release anything to the candidate. Two acts, two functions, two clicks.
--   The release refuses until a final report exists, because a summary of an
--   interview whose report is still being written is a summary of a decision
--   nobody has made.
--
--   PREVIEW AND RELEASE CANNOT DRIFT.  Both call
--   scp_iv_build_candidate_summary. There is one builder and it is the only
--   producer of this payload in the system.
--
--   IMMUTABLE AND VERSIONED.  The payload is frozen with its own content hash.
--   A second release whose content is identical returns the version that
--   already exists; a second release whose content differs writes version N+1
--   and marks the previous one superseded. Later employer edits cannot change
--   what was already shared.
--
--   OWNER OR ADMIN.  The same authority scp_iv_finalise_report requires.
--
-- ── WHAT IT DELIBERATELY DOES NOT DO ────────────────────────────────────
--
-- There is no revocation. Nothing else in this product revokes a released
-- document, and simulating one locally -- hiding a row the candidate has
-- already read -- would be a worse promise than not offering it. A superseding
-- release is the supported correction, and the candidate sees which version
-- they are reading. See the PR report.
--
-- It changes no existing table, function, policy or grant. It adds one table,
-- five functions and one event name.
--
-- Rollback: supabase/rollback/20261106090000_scp_iv_candidate_summary_rollback.sql
-- =============================================================================

-- ═══════════════════════════════════════════════════════════════════════════
-- §1  The frozen row
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.scp_iv_candidate_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.scp_interview_cases(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number >= 1),

  -- `released` is the version the candidate reads. `superseded` is a version
  -- they read before a corrected one was issued; it is kept because the
  -- history of what somebody was told is part of the record.
  status text NOT NULL DEFAULT 'released' CHECK (status IN ('released', 'superseded')),

  -- The frozen document. jsonb because it is a point-in-time RENDERING of
  -- rows that remain individually queryable in their own typed tables; no
  -- rule, permission or lifecycle state lives only in here.
  payload jsonb NOT NULL,
  content_hash text NOT NULL,

  -- The employer report this summary was released alongside. Provenance, and
  -- the reason the release can refuse before one exists.
  report_id uuid NOT NULL
    REFERENCES public.scp_interview_reports(id) ON DELETE RESTRICT,

  -- What it was built against, copied rather than joined, for the same reason
  -- the employer report copies them: a snapshot has to survive the content
  -- changing underneath it.
  pack_version_id uuid NOT NULL
    REFERENCES public.scp_interview_pack_versions(id) ON DELETE RESTRICT,
  pack_content_hash text,

  released_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  released_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (case_id, version_number)
);

COMMENT ON TABLE public.scp_iv_candidate_summaries IS
  'The candidate-safe summary of an interview, frozen at release. Built only '
  'from governed pack content and the candidate''s own confirmed statements: '
  'it carries no requirement level, no reviewer identity, no AI wording, no '
  'finding and no panel material. Separate from scp_interview_reports on '
  'purpose -- one interview, two audiences, two documents, and neither is a '
  'filtered view of the other.';

-- Append-only in practice: the only writer is the release function, and the
-- only UPDATE it performs is the supersede below.
ALTER TABLE public.scp_iv_candidate_summaries ENABLE ROW LEVEL SECURITY;

-- NO POLICY, and that is the design.
--
-- The three entry points below are SECURITY DEFINER and are the only doors.
-- A table with no policy and no grant answers every direct read with a
-- permission error rather than with an empty set, which is the same shape
-- 20261025090000 chose for scp_report_snapshots -- and for the same reason:
-- a row policy that has to be reasoned about twice is a row policy that will
-- one day be reasoned about wrongly.
REVOKE ALL ON TABLE public.scp_iv_candidate_summaries FROM PUBLIC, anon, authenticated;

-- The ledger learns the two acts.
ALTER TABLE public.scp_interview_case_events
  DROP CONSTRAINT IF EXISTS scp_interview_case_events_event_check;
ALTER TABLE public.scp_interview_case_events
  ADD CONSTRAINT scp_interview_case_events_event_check CHECK (event IN (
    'case_created','source_added','sources_marked_ready','source_erased',
    'transcript_authorised','ai_run_started','ai_run_succeeded','ai_run_failed',
    'source_passage_withheld','prep_generated','prep_edited','prep_approved',
    'interview_started','interview_paused','interview_resumed','interview_completed',
    'probe_used','evidence_review_opened','evidence_proposed','evidence_confirmed',
    'evidence_edited','evidence_rejected','evidence_authored','finding_recorded',
    'finding_resolved','assessment_recorded','assessment_superseded',
    'panel_opened','panel_individual_submitted','panel_revealed','panel_concluded',
    'report_drafted','report_finalised','case_cancelled','retention_applied',
    'candidate_summary_released'));

-- ═══════════════════════════════════════════════════════════════════════════
-- §2  THE BUILDER — one producer, two callers
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Preview and release are a guarantee only while it is impossible for them to
-- differ, so there is one function that produces this payload and both call
-- it. It performs NO authorisation and NO write: the two callers each do their
-- own, and this is deliberately not executable by a client.
--
-- Read the SELECT list as the specification. Two tables supply content --
-- scp_interview_pack_competencies (governed, authored, reviewed) and
-- scp_interview_evidence (the candidate's own words, confirmed by a named
-- human) -- and that is the whole of it. scp_interview_assessments,
-- scp_interview_findings, scp_interview_evidence_proposals,
-- scp_interview_session_notes, scp_interview_source_passages and
-- scp_interview_ai_runs do not appear, and the suite asserts they do not.

CREATE OR REPLACE FUNCTION public.scp_iv_build_candidate_summary(_case_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _c public.scp_interview_cases%ROWTYPE;
  _employer text; _role text; _pack text;
  _areas jsonb; _payload jsonb;
  _schema_version constant text := 'cis-v1';
BEGIN
  SELECT * INTO _c FROM public.scp_interview_cases WHERE id = _case_id;
  IF _c.id IS NULL THEN RETURN NULL; END IF;

  SELECT e.name INTO _employer FROM public.employers e WHERE e.id = _c.employer_id;
  SELECT coalesce(j.title_sv, j.title_en) INTO _role
    FROM public.jobs j WHERE j.id = _c.job_id;
  SELECT p.name_sv INTO _pack
    FROM public.scp_interview_pack_versions v
    JOIN public.scp_interview_packs p ON p.id = v.pack_id
   WHERE v.id = _c.pack_version_id;

  -- ── THE AREAS, AND WHAT THE PERSON SAID IN EACH ────────────────────
  --
  -- One row per competency the pinned pack defines, in the pack's own order,
  -- each carrying the candidate's confirmed statements for it.
  --
  -- `covered` is a COUNT OF EVIDENCE and nothing else. It is not a score, it
  -- is not compared with anything, and there is no threshold: the surface
  -- says "you gave concrete examples here" or "we did not reach a concrete
  -- example here", both of which are statements about the conversation rather
  -- than about the person.
  --
  -- The excerpt is `ev.excerpt` -- the CONFIRMED text. `original_excerpt` is
  -- the AI's wording before a human corrected it and never crosses; nor does
  -- `correction_note`, nor `confirmed_by`, nor `origin`.
  SELECT coalesce(jsonb_agg(s.a ORDER BY s.ord), '[]'::jsonb) INTO _areas
    FROM (
      SELECT
        pc.display_order AS ord,
        jsonb_build_object(
          'code', pc.code,
          'name', pc.name_sv,
          'definition', pc.definition_sv,
          'your_examples', coalesce((
            SELECT jsonb_agg(jsonb_build_object('statement', ev.excerpt)
                             ORDER BY ev.confirmed_at)
              FROM public.scp_interview_evidence ev
             WHERE ev.case_id = _case_id
               AND ev.pack_competency_id = pc.id), '[]'::jsonb),
          'covered', (
            SELECT count(*) > 0
              FROM public.scp_interview_evidence ev
             WHERE ev.case_id = _case_id
               AND ev.pack_competency_id = pc.id)
        ) AS a
        FROM public.scp_interview_pack_competencies pc
       WHERE pc.pack_version_id = _c.pack_version_id
    ) s(ord, a);

  _payload := jsonb_build_object(
    'schema_version', _schema_version,
    'interview', jsonb_build_object(
      'employer_name', _employer,
      'role_title', _role,
      'method', _pack,
      -- The scope, said plainly. Not the questions: publishing the pinned
      -- pack's Q1-Q8 turns a structured interview into a memory test and
      -- destroys the comparability the whole method rests on. The AREAS are
      -- what a person can usefully be told, and they are here.
      'scope_sv',
      'Intervjun följde en granskad struktur. Alla som söker rollen får samma kärnfrågor i samma ordning, och de områden intervjun täcker står nedan.',
      'scope_en',
      'The interview followed a reviewed structure. Everyone applying for the role is asked the same core questions in the same order, and the areas it covers are listed below.'),
    'areas', _areas,
    -- ── LIMITATIONS ────────────────────────────────────────────────
    --
    -- Governed text, not generated, and phrased as limits on the METHOD
    -- rather than as caveats about the reader.
    'limitations_sv', to_jsonb(ARRAY[
      'Det här är en sammanfattning av samtalet, inte en bedömning av dig.',
      'Den innehåller inga poäng, ingen rangordning och ingen rekommendation om anställning.',
      'Ett samtal visar det som hann komma fram under den tid det tog. Att ett område saknar exempel betyder att vi inte hann dit, inte att du saknar erfarenhet.',
      'Arbetsgivarens interna anteckningar och bedömningar ingår inte och delas inte.'
    ]),
    'limitations_en', to_jsonb(ARRAY[
      'This is a summary of the conversation, not an assessment of you.',
      'It contains no score, no ranking and no hiring recommendation.',
      'A conversation shows what there was time to cover. An area with no examples means we did not get there, not that you lack the experience.',
      'The employer''s internal notes and ratings are not included and are not shared.'
    ]),
    -- The sentence the brief requires, in the document rather than beside it.
    'decision_sv',
    'Beslutet om anställning fattas av arbetsgivaren. CQrityjob fattar inget sådant beslut, och ingen del av det här underlaget är en rekommendation.',
    'decision_en',
    'The employer makes the recruitment decision. CQrityjob makes no such decision, and no part of this material is a recommendation.');

  RETURN _payload;
END; $$;

COMMENT ON FUNCTION public.scp_iv_build_candidate_summary(uuid) IS
  'THE single producer of the candidate-safe summary payload. Called by the '
  'preview and by the release, so the two cannot drift. Reads governed pack '
  'competencies and confirmed evidence excerpts and nothing else -- no '
  'assessment level, no finding, no proposal, no note, no passage, no AI run. '
  'Performs no authorisation and no write; both callers do their own.';

-- No client grant at all. Its two callers are definer functions in this file.
REVOKE ALL ON FUNCTION public.scp_iv_build_candidate_summary(uuid)
  FROM PUBLIC, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- §3  PREVIEW — exactly what would be released, and nothing written
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_iv_preview_candidate_summary(_case_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_employer_role(
       auth.uid(), public.scp_iv_case_employer(_case_id), ARRAY['owner','admin']) THEN
    RAISE EXCEPTION
      'SCP_IV_SUMMARY_PREVIEW_ROLE: previewing what a candidate would receive requires an employer owner or admin.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN public.scp_iv_build_candidate_summary(_case_id);
END; $$;

COMMENT ON FUNCTION public.scp_iv_preview_candidate_summary(uuid) IS
  'What the candidate WOULD receive, built by the same function the release '
  'uses. Writes nothing. Owner or admin only: the preview exists to serve the '
  'release decision, so it carries the release''s authority and no more.';

REVOKE ALL     ON FUNCTION public.scp_iv_preview_candidate_summary(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_iv_preview_candidate_summary(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- §4  RELEASE — a second, explicit human act
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_iv_release_candidate_summary(_case_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  _c public.scp_interview_cases%ROWTYPE;
  _report public.scp_interview_reports%ROWTYPE;
  _payload jsonb; _hash text; _next integer;
  _latest_id uuid; _latest_hash text; _id uuid;
BEGIN
  SELECT * INTO _c FROM public.scp_interview_cases WHERE id = _case_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'SCP_IV_CASE_NOT_FOUND' USING ERRCODE = 'check_violation';
  END IF;

  -- The same seat scp_iv_finalise_report requires. Sharing something with a
  -- person is at least as consequential as writing it down.
  IF auth.uid() IS NULL OR NOT public.has_employer_role(
       auth.uid(), _c.employer_id, ARRAY['owner','admin']) THEN
    RAISE EXCEPTION
      'SCP_IV_SUMMARY_RELEASE_ROLE: sharing a summary with the interviewed person requires an employer owner or admin.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- ── FINALISATION IS A PRECONDITION, NOT A TRIGGER ──────────────────
  --
  -- Refused until a final employer report exists: a summary of an interview
  -- whose report is still being written is a summary of a decision nobody has
  -- made yet. And it is only a PRECONDITION -- scp_iv_finalise_report does not
  -- call this function, and nothing else does either. Two acts, two clicks.
  SELECT * INTO _report FROM public.scp_interview_reports
   WHERE case_id = _case_id AND status = 'final'
   ORDER BY version_number DESC LIMIT 1;
  IF _report.id IS NULL THEN
    RAISE EXCEPTION
      'SCP_IV_SUMMARY_BEFORE_REPORT: finalise the employer report before sharing a summary with the interviewed person.'
      USING ERRCODE = 'check_violation';
  END IF;

  _payload := public.scp_iv_build_candidate_summary(_case_id);
  IF _payload IS NULL THEN
    RAISE EXCEPTION 'SCP_IV_SUMMARY_EMPTY: nothing could be built for this case.'
      USING ERRCODE = 'check_violation';
  END IF;
  _hash := md5(_payload::text);

  -- ── IDEMPOTENT, THEN VERSIONED ─────────────────────────────────────
  --
  -- Unchanged since the last release: return that release. Two clicks are one
  -- share, and a retry after a lost response finds the share it already made.
  --
  -- Changed: version N+1, and the previous version is marked superseded rather
  -- than rewritten. What the person was told in March is still what they were
  -- told in March.
  SELECT id, content_hash INTO _latest_id, _latest_hash
    FROM public.scp_iv_candidate_summaries
   WHERE case_id = _case_id AND status = 'released'
   ORDER BY version_number DESC LIMIT 1;
  IF _latest_id IS NOT NULL AND _latest_hash = _hash THEN
    RETURN _latest_id;
  END IF;

  SELECT coalesce(max(version_number), 0) + 1 INTO _next
    FROM public.scp_iv_candidate_summaries WHERE case_id = _case_id;

  INSERT INTO public.scp_iv_candidate_summaries
    (case_id, version_number, status, payload, content_hash, report_id,
     pack_version_id, pack_content_hash, released_by, released_at)
  VALUES (_case_id, _next, 'released', _payload, _hash, _report.id,
          _c.pack_version_id, _c.pack_content_hash, auth.uid(), now())
  RETURNING id INTO _id;

  UPDATE public.scp_iv_candidate_summaries
     SET status = 'superseded'
   WHERE case_id = _case_id AND id <> _id AND status = 'released';

  PERFORM public.scp_iv_record_event(_case_id, 'candidate_summary_released', 'human',
    NULL, NULL, NULL, NULL,
    jsonb_build_object('summary_id', _id, 'version', _next,
                       'content_hash', _hash, 'report_id', _report.id));

  RETURN _id;
END; $$;

COMMENT ON FUNCTION public.scp_iv_release_candidate_summary(uuid) IS
  'Shares the candidate-safe summary with the interviewed person. A SECOND '
  'explicit act: finalising the employer report is a precondition and never a '
  'trigger. Idempotent on identical content; a changed summary becomes version '
  'N+1 and supersedes the previous one rather than rewriting it. There is no '
  'revocation, deliberately -- a superseding release is the supported '
  'correction.';

REVOKE ALL     ON FUNCTION public.scp_iv_release_candidate_summary(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_iv_release_candidate_summary(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- §5  THE TWO READS
-- ═══════════════════════════════════════════════════════════════════════════

-- The candidate's own. Zero rows when nothing is released, or when the case is
-- not theirs -- deliberately the same answer, exactly as every other candidate
-- read in this schema.
CREATE OR REPLACE FUNCTION public.scp_iv_my_candidate_summary(_case_id uuid)
RETURNS TABLE (
  id uuid,
  case_id uuid,
  version_number integer,
  released_at timestamptz,
  content_hash text,
  payload jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.id, s.case_id, s.version_number, s.released_at, s.content_hash, s.payload
    FROM public.scp_iv_candidate_summaries s
    JOIN public.scp_interview_cases c ON c.id = s.case_id
   WHERE s.case_id = _case_id
     AND s.status = 'released'
     AND auth.uid() IS NOT NULL
     AND c.candidate_user_id = auth.uid();
$$;

COMMENT ON FUNCTION public.scp_iv_my_candidate_summary(uuid) IS
  'The interviewed person''s own released summary. Bound to '
  'scp_interview_cases.candidate_user_id -- never to a name, an address or a '
  'role title. Zero rows for an unreleased summary and for somebody else''s '
  'case, which are deliberately the same answer.';

REVOKE ALL     ON FUNCTION public.scp_iv_my_candidate_summary(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_iv_my_candidate_summary(uuid) TO authenticated;

-- The employer's verification read: what was ACTUALLY released, so "here is
-- what we shared" is the document rather than a description of it. Same
-- authority as releasing it.
CREATE OR REPLACE FUNCTION public.scp_iv_released_candidate_summary(_case_id uuid)
RETURNS TABLE (
  id uuid,
  case_id uuid,
  version_number integer,
  released_at timestamptz,
  content_hash text,
  payload jsonb)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.id, s.case_id, s.version_number, s.released_at, s.content_hash, s.payload
    FROM public.scp_iv_candidate_summaries s
   WHERE s.case_id = _case_id
     AND s.status = 'released'
     AND auth.uid() IS NOT NULL
     AND public.has_employer_role(
           auth.uid(), public.scp_iv_case_employer(_case_id), ARRAY['owner','admin']);
$$;

COMMENT ON FUNCTION public.scp_iv_released_candidate_summary(uuid) IS
  'The released summary, for an owner or admin of the organisation that '
  'released it: the same document the candidate reads, so the employer can '
  'verify what was shared rather than describe it. Returns strictly less than '
  'the employer report the same caller already holds.';

REVOKE ALL     ON FUNCTION public.scp_iv_released_candidate_summary(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_iv_released_candidate_summary(uuid) TO authenticated;

-- The FACT of a release, for one application's cases.
--
-- ── WHY THIS IS SEPARATE FROM THE DOCUMENT READ ────────────────────────
--
-- The employer process strip has to be able to say "the report is finalised
-- and nothing has been shared with the candidate", which is a materially
-- different state from "shared on 3 March" -- and it currently cannot say
-- either, because it has no way to find out.
--
-- What it needs is the FACT, the date and the version. Not the document: that
-- is `scp_iv_released_candidate_summary`, and it stays owner/admin-only
-- because it contains the person's own statements.
--
-- So this returns three scalar columns and no payload, to any ACTIVE MEMBER of
-- the organisation -- the same audience that already sees `report_finalised`
-- on the same strip. A member learns that their organisation shared something
-- and when. They learn nothing about the candidate.
--
-- Keyed by application rather than by case because that is how the strip reads
-- everything else: one call per application, not one per case.
CREATE OR REPLACE FUNCTION public.scp_iv_application_summary_releases(_application_id uuid)
RETURNS TABLE (
  case_id uuid,
  version_number integer,
  released_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.case_id, s.version_number, s.released_at
    FROM public.scp_iv_candidate_summaries s
    JOIN public.scp_interview_cases c ON c.id = s.case_id
   WHERE c.application_id = _application_id
     AND s.status = 'released'
     AND auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.employer_memberships m
        WHERE m.employer_id = c.employer_id
          AND m.user_id = auth.uid()
          AND m.status = 'active');
$$;

COMMENT ON FUNCTION public.scp_iv_application_summary_releases(uuid) IS
  'Whether, when and at which version a candidate summary was shared, for one '
  'application''s interview cases. THE FACT ONLY -- no payload -- so the '
  'employer process strip can tell "finalised, nothing shared" from "shared on '
  'a date". Any active member, the same audience that already sees '
  'report_finalised beside it; the document itself stays owner/admin-only.';

REVOKE ALL     ON FUNCTION public.scp_iv_application_summary_releases(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_iv_application_summary_releases(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- §6  Proof, at apply time
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _def text; _fn text;
BEGIN
  FOREACH _fn IN ARRAY ARRAY[
    'public.scp_iv_build_candidate_summary(uuid)',
    'public.scp_iv_preview_candidate_summary(uuid)',
    'public.scp_iv_release_candidate_summary(uuid)',
    'public.scp_iv_my_candidate_summary(uuid)',
    'public.scp_iv_released_candidate_summary(uuid)',
    'public.scp_iv_application_summary_releases(uuid)'
  ] LOOP
    IF has_function_privilege('anon', _fn::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'SCP_IV_SUMMARY: anon must not reach %', _fn;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE p.oid = _fn::regprocedure AND p.prosecdef
                      AND array_to_string(p.proconfig, ',') LIKE '%search_path%') THEN
      RAISE EXCEPTION 'SCP_IV_SUMMARY: % must be SECURITY DEFINER with a set search_path', _fn;
    END IF;
  END LOOP;

  -- The builder is nobody's to call directly.
  IF has_function_privilege('authenticated',
       'public.scp_iv_build_candidate_summary(uuid)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'SCP_IV_SUMMARY: the builder must not be client-executable.';
  END IF;

  -- THE PROPERTY THIS WHOLE FILE RESTS ON. A level, a finding, a proposal, a
  -- note, a passage or an AI run appearing in the builder is the difference
  -- between a candidate summary and the employer's report with sections
  -- removed.
  -- STATEMENTS ONLY. `pg_get_functiondef` returns the comments too, and the
  -- builder's own comments NAME every field they exist to say is absent --
  -- so a naive search is satisfied by the sentence describing the property
  -- rather than by the property. Line comments are stripped first.
  SELECT string_agg(
           CASE WHEN position('--' in line) > 0
                THEN substr(line, 1, position('--' in line) - 1)
                ELSE line END, E'\n')
    INTO _def
    FROM regexp_split_to_table(
           pg_get_functiondef('public.scp_iv_build_candidate_summary(uuid)'::regprocedure),
           E'\n') AS line;

  IF position('scp_interview_assessments' in _def) > 0
     OR position('scp_interview_findings' in _def) > 0
     OR position('scp_interview_evidence_proposals' in _def) > 0
     OR position('scp_interview_session_notes' in _def) > 0
     OR position('scp_interview_source_passages' in _def) > 0
     OR position('scp_interview_ai_runs' in _def) > 0
     OR position('scp_interview_rating_anchors' in _def) > 0 THEN
    RAISE EXCEPTION 'SCP_IV_SUMMARY: the candidate builder reads an employer-only table.';
  END IF;
  IF position('original_excerpt' in _def) > 0
     OR position('correction_note' in _def) > 0
     OR position('confirmed_by' in _def) > 0
     OR position('.level' in _def) > 0 THEN
    RAISE EXCEPTION 'SCP_IV_SUMMARY: the candidate builder carries an employer-only field.';
  END IF;

  -- The release is not a side effect of finalisation.
  IF position('scp_iv_release_candidate_summary' in
        pg_get_functiondef('public.scp_iv_finalise_report(uuid, uuid)'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'SCP_IV_SUMMARY: finalising the report must not release the summary.';
  END IF;

  -- THE FACT-ONLY READ CARRIES NO PAYLOAD. It is granted to every active
  -- member, so a payload column here would widen the document's audience from
  -- owner/admin to the whole organisation in one word.
  IF position('payload' in
        pg_get_functiondef('public.scp_iv_application_summary_releases(uuid)'::regprocedure)) > 0
     OR position('content_hash' in
        pg_get_functiondef('public.scp_iv_application_summary_releases(uuid)'::regprocedure)) > 0 THEN
    RAISE EXCEPTION 'SCP_IV_SUMMARY: the fact-only release read must carry no document.';
  END IF;

  -- No direct table access.
  IF has_table_privilege('authenticated', 'public.scp_iv_candidate_summaries', 'SELECT')
     OR has_table_privilege('anon', 'public.scp_iv_candidate_summaries', 'SELECT') THEN
    RAISE EXCEPTION 'SCP_IV_SUMMARY: the summary table must have no client read.';
  END IF;

  RAISE NOTICE 'SCP_IV_CANDIDATE_SUMMARY_PROOF ok';
END $$;
