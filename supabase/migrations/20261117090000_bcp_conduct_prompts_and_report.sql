-- ============================================================================
-- BESKT PR 6 -- the two things the conduct layer could not do
-- ============================================================================
--
-- PR 5A built the governed conduct runtime and PR 5B built the surface on it.
-- Two gaps were documented rather than improvised, and this migration closes
-- exactly those two. Nothing else changes.
--
-- ── GAP A · THE GOVERNED PROMPTS WERE UNREACHABLE ───────────────────────────
--
-- `beskt_prompts` carries the method's own interviewer wordings -- the PEACE
-- stage, the question form, the probe bases a follow-up may rest on. Its only
-- policy is `beskt_prompts_governance_read`: platform content roles and
-- platform admins. An employer interviewer conducting the interview the
-- prompts exist for could not read a single one, so PR 5B rendered the item's
-- own question text and purpose and said plainly that the prompt library was
-- not yet on that surface.
--
-- This adds ONE narrow reader. It is the same shape PR 3 used when it widened
-- `beskt_can_read_version` for a preparation party: not a policy loosening,
-- not a grant to a table, but a SECURITY DEFINER function that answers for
-- ONE session and nothing else.
--
-- What it will not return, ever:
--
--   * a prompt from any version other than the one the session FROZE;
--   * a prompt from a version that is not `published`;
--   * a prompt from a version whose mode is not `recruitment_support`;
--   * a prompt belonging to an exposure profile the assignment did not pin;
--   * a prompt for an item outside the interviewer's access classes;
--   * anything at all to a caller who may not read the case.
--
-- ── GAP B · THERE WAS NO REPORT ─────────────────────────────────────────────
--
-- The conduct layer had thirteen client functions and not one of them ended
-- anything. Positions locked, panels revealed, resolutions were recorded --
-- and then the work sat in six tables with no document a human could be held
-- to.
--
-- This adds the report chain, and it is deliberately the SAME chain PR #216
-- built for the Interview Intelligence report rather than a second design:
--
--   preview → blockers → basis hash → immutable finalisation → readback
--
-- The basis hash is what makes finalisation honest. `bcp_conduct_preview_report`
-- returns the payload AND its hash; `bcp_conduct_finalise_report` recomputes
-- the payload from the same builder and refuses unless the hash still matches.
-- So what is finalised is what was read, and a basis that moved between the
-- reading and the signing is a refusal rather than a silent substitution.
--
-- ── WHAT THE REPORT MAY NOT CONTAIN ─────────────────────────────────────────
--
-- No score. No ranking. No pass/fail. No truthfulness or credibility figure.
-- No automated recommendation. The table has nowhere to put one -- its columns
-- are asserted by the postflight below -- and the builder assembles only what
-- a human recorded: observations, the candidate's own explanations, counter-
-- explanations, protective factors, verification needs and their history,
-- corrections and their reasons, each assessor's independent position, the
-- panel's resolution including any preserved divergence, and the exact bound
-- method version, content hash and answers hash the whole thing rests on.
--
-- An information GAP is reported as a gap. That is the opposite of a score:
-- it says what is not known rather than compressing what is.
--
-- ── WHAT THIS DELIBERATELY DOES NOT DO ──────────────────────────────────────
--
--   * No change to any PR 5A table, policy, grant, trigger or RPC signature.
--   * No change to `beskt_prompts` -- no policy, no grant, no column. The
--     reader is a function; the table's own access is untouched.
--   * No seed. This migration creates no method, version, item, prompt,
--     assignment, session or report.
--   * No approval and no publication. Nothing here makes a method startable.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1 · The event vocabulary gains exactly one member.
--
-- Restated in full rather than appended to, because the CHECK is rebuilt: a
-- narrower constraint than the rows already present would refuse itself, and
-- every earlier member has to survive the rebuild.
-- ---------------------------------------------------------------------------
ALTER TABLE public.bcp_events DROP CONSTRAINT IF EXISTS bcp_events_event_check;
ALTER TABLE public.bcp_events
  ADD CONSTRAINT bcp_events_event_check
  CHECK (event IN (
    -- PR 3
    'assignment_created', 'notice_acknowledged', 'response_saved',
    'response_submitted', 'assignment_cancelled', 'assignment_opened',
    'pilot_granted', 'pilot_revoked',
    -- PR 4
    'case_linked', 'case_unlinked',
    -- PR 5A
    'conduct_session_started', 'conduct_entry_saved', 'conduct_entry_corrected',
    'conduct_verification_requested', 'conduct_verification_updated',
    'conduct_position_locked', 'conduct_position_reopened',
    'conduct_panel_opened', 'conduct_panel_revealed',
    'conduct_panel_resolution_recorded',
    -- PR 6
    'conduct_report_finalised'));

-- ---------------------------------------------------------------------------
-- 2 · GAP A. The governed prompts, for one session, to someone who may read
--     the case it belongs to.
--
-- SECURITY DEFINER is genuinely necessary and not convenience: `beskt_prompts`
-- and `beskt_items` are invisible to `authenticated` by policy, and that is
-- correct -- the method catalogue is governance content. What an interviewer
-- is entitled to is not the catalogue but the wordings of the ONE version
-- their own case froze, which is what this answers and all it answers.
--
-- Every narrowing is applied inside, where a caller cannot reach past it:
--
--   the session          decides the method version, and it is the FROZEN one
--   the assignment       decides the exposure profile
--   the frozen topics    decide which items are in scope
--   content_status       must be 'published'
--   mode                 must be 'recruitment_support'
--   access_class         must be one an interviewer holds
--
-- Item-less prompts (the stage wordings: planning, engage/explain, closure)
-- are returned under a null item key, because they are the method's own
-- structure for the conversation rather than a follow-up to one answer.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bcp_conduct_topic_prompts(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _s public.bcp_conduct_sessions%ROWTYPE;
  _a public.bcp_assignments%ROWTYPE;
  _v public.beskt_method_versions%ROWTYPE;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_SESSION_NOT_FOUND: no such conduct session.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- The EXISTING case authority. A caller who cannot read the case cannot
  -- learn anything here, including whether the session exists in a readable
  -- state -- the refusal above is reached only for a session id that is not
  -- a session at all.
  IF NOT public.scp_iv_can_read_case(_s.case_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not read this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _s.assignment_id;
  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _s.bound_method_version_id;

  -- A version that is no longer published stops answering. Not an error: the
  -- interview's own record is unaffected and the screen says the wordings are
  -- unavailable, which is true and is different from inventing them.
  IF _v.id IS NULL
     OR _v.content_status <> 'published'
     OR _v.mode <> 'recruitment_support' THEN
    RETURN jsonb_build_object(
      'session_id', _session_id,
      'method_version_id', _s.bound_method_version_id,
      'available', false,
      'reason', CASE WHEN _v.id IS NULL THEN 'version_not_found'
                     WHEN _v.mode <> 'recruitment_support' THEN 'mode_not_permitted'
                     ELSE 'version_not_published' END,
      'topics', '[]'::jsonb,
      'stage_prompts', '[]'::jsonb,
      'produces_score', false,
      'interpretation', 'none');
  END IF;

  RETURN jsonb_build_object(
    'session_id', _session_id,
    'method_version_id', _v.id,
    'content_hash', _s.bound_content_hash,
    'available', true,
    'reason', NULL,

    -- Per frozen topic: the item's own governed wording and purpose, and the
    -- prompts that name that item. Ordered by the method's own display order.
    'topics', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'topic_id', t.id,
          'item_key', t.item_key,
          'reason', t.topic_reason,
          'prompts', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'prompt_key', pr.prompt_key,
                'display_order', pr.display_order,
                'prompt_kind', pr.prompt_kind,
                'peace_stage', pr.peace_stage,
                'addressee', pr.addressee,
                'question_form', pr.question_form,
                'permitted_probe_bases', public.beskt_sorted_array(pr.permitted_probe_bases),
                'wording_sv', pr.wording_sv,
                'wording_en', pr.wording_en)
              ORDER BY pr.display_order, pr.prompt_key)
              FROM public.beskt_prompts pr
              JOIN public.beskt_items pi ON pi.id = pr.item_id
             WHERE pr.method_version_id = _v.id
               AND pr.item_id = t.item_id
               AND pr.exposure_profile_id = _a.exposure_profile_id
               AND pr.permitted_mode = 'recruitment_support'
               AND pi.permitted_mode = 'recruitment_support'
               AND pi.access_class <> 'authorised_security_function'), '[]'::jsonb))
        ORDER BY t.display_order)
        FROM public.bcp_case_topics t
        JOIN public.beskt_items i ON i.id = t.item_id
       WHERE t.link_id = _s.link_id
         AND i.permitted_mode = 'recruitment_support'
         AND i.access_class <> 'authorised_security_function'), '[]'::jsonb),

    -- The method's own structure for the conversation, which belongs to no
    -- single item.
    'stage_prompts', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'prompt_key', pr.prompt_key,
          'display_order', pr.display_order,
          'prompt_kind', pr.prompt_kind,
          'peace_stage', pr.peace_stage,
          'addressee', pr.addressee,
          'question_form', pr.question_form,
          'wording_sv', pr.wording_sv,
          'wording_en', pr.wording_en)
        ORDER BY pr.display_order, pr.prompt_key)
        FROM public.beskt_prompts pr
       WHERE pr.method_version_id = _v.id
         AND pr.item_id IS NULL
         AND pr.exposure_profile_id = _a.exposure_profile_id
         AND pr.permitted_mode = 'recruitment_support'), '[]'::jsonb),

    -- Said in the payload itself, as every BESKT read says it.
    'produces_score', false,
    'interpretation', 'none');
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_conduct_topic_prompts(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_conduct_topic_prompts(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.bcp_conduct_topic_prompts(uuid) IS
  'The governed interviewer wordings for ONE conduct session. Bound to the '
  'method version the session froze, the exposure profile the assignment '
  'pinned and the topics PR 4 derived; published recruitment-support content '
  'only; never a security-vetting access class. Gated by scp_iv_can_read_case. '
  'Adds no policy and no grant to beskt_prompts.';

-- ---------------------------------------------------------------------------
-- 3 · GAP B. The report table.
--
-- Append-only and immutable once written, by trigger rather than by
-- convention: a finalised BESKT report is the document a human is answerable
-- for, and a document that can be edited afterwards is not one.
--
-- `payload` is jsonb and that is deliberate here, where it is forbidden in the
-- conduct tables: the conduct tables are the RECORD, with a column per kind of
-- claim so none can be collapsed; this is a FROZEN RENDERING of that record at
-- one instant, and its whole purpose is to be one immutable value with one
-- hash. Every field inside it was written into a typed conduct column first.
--
-- There is no score column, no rank, no verdict and no recommendation. The
-- postflight at the bottom of this migration asserts that by name, so adding
-- one later fails the migration rather than passing review.
-- ---------------------------------------------------------------------------
CREATE TABLE public.bcp_conduct_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  session_id uuid NOT NULL REFERENCES public.bcp_conduct_sessions(id) ON DELETE RESTRICT,
  case_id uuid NOT NULL REFERENCES public.scp_interview_cases(id) ON DELETE RESTRICT,
  employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE RESTRICT,
  assignment_id uuid NOT NULL REFERENCES public.bcp_assignments(id) ON DELETE RESTRICT,

  version_number integer NOT NULL CHECK (version_number >= 1),
  status text NOT NULL CHECK (status IN ('final', 'superseded')),

  -- The frozen rendering, and the two hashes that make it checkable.
  payload jsonb NOT NULL,
  content_hash text NOT NULL CHECK (content_hash ~ '^[0-9a-f]{64}$'),
  content_hash_algorithm text NOT NULL DEFAULT 'sha256' CHECK (content_hash_algorithm = 'sha256'),
  basis_hash text NOT NULL CHECK (basis_hash ~ '^[0-9a-f]{64}$'),

  -- What the whole document rests on, carried as columns as well as inside the
  -- payload, so provenance is answerable without parsing json.
  bound_method_version_id uuid NOT NULL
    REFERENCES public.beskt_method_versions(id) ON DELETE RESTRICT,
  bound_content_hash text NOT NULL CHECK (bound_content_hash ~ '^[0-9a-f]{64}$'),
  bound_answers_content_hash text NOT NULL CHECK (bound_answers_content_hash ~ '^[0-9a-f]{64}$'),
  bound_response_id uuid NOT NULL REFERENCES public.bcp_responses(id) ON DELETE RESTRICT,

  finalised_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  finalised_at timestamptz NOT NULL DEFAULT now(),
  operation_id uuid NOT NULL UNIQUE,

  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (session_id, version_number)
);

CREATE INDEX bcp_conduct_reports_session_idx ON public.bcp_conduct_reports (session_id);
CREATE INDEX bcp_conduct_reports_case_idx ON public.bcp_conduct_reports (case_id);
CREATE INDEX bcp_conduct_reports_employer_idx ON public.bcp_conduct_reports (employer_id);
CREATE INDEX bcp_conduct_reports_assignment_idx ON public.bcp_conduct_reports (assignment_id);
CREATE INDEX bcp_conduct_reports_finalised_by_idx ON public.bcp_conduct_reports (finalised_by);

-- At most one `final` report per session. A second finalisation supersedes the
-- first in the same transaction, so this holds under concurrency rather than
-- by ordering luck.
CREATE UNIQUE INDEX bcp_conduct_reports_one_final_per_session_idx
  ON public.bcp_conduct_reports (session_id)
  WHERE status = 'final';

COMMENT ON TABLE public.bcp_conduct_reports IS
  'The immutable BESKT interview report. A frozen rendering of what humans '
  'recorded in the conduct tables, with the basis hash it was previewed at '
  'and the method version, content hash and answers hash it rests on. No '
  'score, rank, verdict or recommendation is representable here.';

-- ---------------------------------------------------------------------------
-- 4 · Immutable, against every caller including the table owner.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bcp_guard_conduct_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'BCP_CONDUCT_REPORT_IMMUTABLE: a finalised report is never deleted.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- EXACTLY ONE permitted update shape: 'final' stepping down to
    -- 'superseded' when a newer report takes its place. Everything else --
    -- the payload, both hashes, the binding, the signer, the time -- is
    -- frozen, and is compared field by field rather than trusted.
    IF NEW.id <> OLD.id
       OR NEW.session_id <> OLD.session_id
       OR NEW.case_id <> OLD.case_id
       OR NEW.employer_id <> OLD.employer_id
       OR NEW.assignment_id <> OLD.assignment_id
       OR NEW.version_number <> OLD.version_number
       OR NEW.payload::text <> OLD.payload::text
       OR NEW.content_hash <> OLD.content_hash
       OR NEW.content_hash_algorithm <> OLD.content_hash_algorithm
       OR NEW.basis_hash <> OLD.basis_hash
       OR NEW.bound_method_version_id <> OLD.bound_method_version_id
       OR NEW.bound_content_hash <> OLD.bound_content_hash
       OR NEW.bound_answers_content_hash <> OLD.bound_answers_content_hash
       OR NEW.bound_response_id <> OLD.bound_response_id
       OR NEW.finalised_by <> OLD.finalised_by
       OR NEW.finalised_at <> OLD.finalised_at
       OR NEW.operation_id <> OLD.operation_id
       OR NEW.created_at <> OLD.created_at THEN
      RAISE EXCEPTION
        'BCP_CONDUCT_REPORT_IMMUTABLE: a finalised report cannot be changed; only its status may step down to superseded.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NOT (OLD.status = 'final' AND NEW.status = 'superseded') THEN
      RAISE EXCEPTION
        'BCP_CONDUCT_REPORT_IMMUTABLE: status may only move from final to superseded.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER bcp_conduct_reports_immutable
  BEFORE UPDATE OR DELETE ON public.bcp_conduct_reports
  FOR EACH ROW EXECUTE FUNCTION public.bcp_guard_conduct_report();

-- PostgREST publishes anything `authenticated` may execute, and an
-- invariant-checker is not an API.
REVOKE ALL ON FUNCTION public.bcp_guard_conduct_report()
  FROM PUBLIC, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5 · Row security. One SELECT policy, zero write policies: every write goes
--     through the governed function below.
-- ---------------------------------------------------------------------------
ALTER TABLE public.bcp_conduct_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bcp_conduct_reports FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.bcp_conduct_reports FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.bcp_conduct_reports TO authenticated, service_role;

CREATE POLICY bcp_conduct_reports_member_read ON public.bcp_conduct_reports
  FOR SELECT TO authenticated
  USING (public.scp_iv_can_read_case(case_id));

-- ---------------------------------------------------------------------------
-- 6 · The builder. ONE function assembles the payload, and both the preview
--     and the finalisation call it, so the two cannot drift.
--
-- Everything here was written into a typed conduct column by a human. Nothing
-- is derived, weighted, counted into a judgement or inferred.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bcp_conduct_build_report_basis(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _s public.bcp_conduct_sessions%ROWTYPE;
  _l public.bcp_case_links%ROWTYPE;
  _c public.scp_interview_cases%ROWTYPE;
  _a public.bcp_assignments%ROWTYPE;
  _v public.beskt_method_versions%ROWTYPE;
  _p public.scp_interview_packs%ROWTYPE;
BEGIN
  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_SESSION_NOT_FOUND: no such conduct session.'
      USING ERRCODE = 'check_violation';
  END IF;
  SELECT * INTO _l FROM public.bcp_case_links WHERE id = _s.link_id;
  SELECT * INTO _c FROM public.scp_interview_cases WHERE id = _s.case_id;
  SELECT * INTO _a FROM public.bcp_assignments WHERE id = _s.assignment_id;
  SELECT * INTO _v FROM public.beskt_method_versions WHERE id = _s.bound_method_version_id;
  SELECT * INTO _p FROM public.scp_interview_packs WHERE id = _v.pack_id;

  RETURN jsonb_build_object(
    -- ---- what this document is about ------------------------------------
    'case', jsonb_build_object(
      'case_id', _c.id,
      'employer_id', _c.employer_id,
      'application_id', _c.application_id,
      'candidate_user_id', _c.candidate_user_id,
      'candidate_display_name', _c.candidate_display_name,
      'job_id', _c.job_id,
      'title', _c.title),

    'session', jsonb_build_object(
      'session_id', _s.id,
      'link_id', _s.link_id,
      'assignment_id', _s.assignment_id,
      'opened_at', _s.opened_at,
      'state', _s.state),

    -- ---- what it rests on, exactly --------------------------------------
    'bound', jsonb_build_object(
      'method_version_id', _v.id,
      'pack_slug', _p.slug,
      'method_name_sv', _p.name_sv,
      'method_name_en', _p.name_en,
      'version_number', _v.version_number,
      'mode', _v.mode,
      'validation_label', _v.validation_label,
      'release_scope', _v.release_scope,
      'content_hash', _s.bound_content_hash,
      'answers_content_hash', _s.bound_answers_content_hash,
      'response_id', _s.bound_response_id,
      'response_version', _s.bound_response_version,
      'notice_version', _l.bound_notice_version,
      'notice_content_hash', _l.bound_notice_content_hash,
      'linked_at', _l.linked_at),

    -- ---- the candidate's own frozen words --------------------------------
    'candidate_preparation', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'item_key', an.item_key,
          'response_state', an.response_state,
          'value_boolean', an.value_boolean,
          'value_text', an.value_text,
          'value_date', an.value_date,
          'selected_option_keys', to_jsonb(coalesce(an.selected_option_keys, ARRAY[]::text[])),
          'wording_sv', i.wording_sv, 'wording_en', i.wording_en,
          'purpose_sv', i.purpose_sv, 'purpose_en', i.purpose_en)
        ORDER BY an.item_key)
        FROM public.bcp_answers an
        JOIN public.beskt_items i ON i.id = an.item_id
       WHERE an.response_id = _s.bound_response_id), '[]'::jsonb),

    -- ---- the themes the interview had to cover ---------------------------
    'themes', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'item_key', t.item_key,
          'reason', t.topic_reason,
          'wording_sv', i.wording_sv, 'wording_en', i.wording_en,
          'purpose_sv', i.purpose_sv, 'purpose_en', i.purpose_en)
        ORDER BY t.display_order)
        FROM public.bcp_case_topics t
        JOIN public.beskt_items i ON i.id = t.item_id
       WHERE t.link_id = _s.link_id), '[]'::jsonb),

    -- ---- every independent position, whole, and never averaged -----------
    'positions', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'position_id', pos.id,
          'assessor_id', pos.assessor_id,
          'position_role', pos.position_role,
          'state', pos.state,
          'locked_at', pos.locked_at,
          'reopen_count', pos.reopen_count,

          'entries', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'entry_id', e.id,
                'item_key', e.item_key,
                'entry_version', e.entry_version,
                'observable_fact', e.observable_fact,
                'candidate_explanation', e.candidate_explanation,
                'interviewer_interpretation', e.interviewer_interpretation,
                'alternative_explanation', e.alternative_explanation,
                'protective_factor', e.protective_factor,
                'verification_need', e.verification_need,
                'verification_state', e.verification_state,
                'verification_source', e.verification_source,
                'sensitivity_class', e.sensitivity_class,
                'recorded_by', e.recorded_by,
                'recorded_at', e.recorded_at,

                -- The whole chain, not only the live version: a record whose
                -- corrections were dropped would read as if it had always
                -- said what it says now.
                'corrections', coalesce((
                  SELECT jsonb_agg(jsonb_build_object(
                      'entry_id', h.id,
                      'entry_version', h.entry_version,
                      'correction_reason', h.correction_reason,
                      'superseded_by_entry_id', h.superseded_by_entry_id,
                      'observable_fact', h.observable_fact,
                      'candidate_explanation', h.candidate_explanation,
                      'interviewer_interpretation', h.interviewer_interpretation,
                      'alternative_explanation', h.alternative_explanation,
                      'protective_factor', h.protective_factor,
                      'recorded_by', h.recorded_by,
                      'recorded_at', h.recorded_at)
                    ORDER BY h.entry_version)
                    FROM public.bcp_conduct_entries h
                   WHERE h.position_id = pos.id
                     AND h.item_key = e.item_key
                     AND h.id <> e.id), '[]'::jsonb),

                'verifications', coalesce((
                  SELECT jsonb_agg(jsonb_build_object(
                      'seq', vr.seq,
                      'previous_state', vr.previous_state,
                      'new_state', vr.new_state,
                      'source', vr.source,
                      'note', vr.note,
                      'recorded_by', vr.recorded_by,
                      'recorded_at', vr.recorded_at)
                    ORDER BY vr.seq)
                    FROM public.bcp_conduct_verifications vr
                   WHERE vr.entry_id = e.id), '[]'::jsonb))
              ORDER BY e.item_key)
              FROM public.bcp_conduct_entries e
             WHERE e.position_id = pos.id
               AND e.superseded_by_entry_id IS NULL), '[]'::jsonb),

          -- What this assessor did NOT document, said as a gap rather than
          -- left to be noticed. A gap is the opposite of a score: it reports
          -- what is not known instead of compressing what is.
          'information_gaps', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'item_key', t.item_key,
                'gap', 'not_documented')
              ORDER BY t.display_order)
              FROM public.bcp_case_topics t
             WHERE t.link_id = _s.link_id
               AND NOT EXISTS (
                 SELECT 1 FROM public.bcp_conduct_entries e2
                  WHERE e2.position_id = pos.id
                    AND e2.item_key = t.item_key
                    AND e2.superseded_by_entry_id IS NULL)), '[]'::jsonb))
        ORDER BY pos.created_at)
        FROM public.bcp_conduct_positions pos
       WHERE pos.session_id = _session_id), '[]'::jsonb),

    -- ---- the panel, including what it did not resolve --------------------
    'panel', (
      SELECT jsonb_build_object(
          'panel_id', pn.id,
          'state', pn.state,
          'revealed_at', pn.revealed_at,
          'resolutions', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                'item_key', r.item_key,
                'resolution_kind', r.resolution_kind,
                'agreed_statement', r.agreed_statement,
                'divergent_statement', r.divergent_statement,
                'rationale', r.rationale,
                'recorded_by', r.recorded_by,
                'recorded_at', r.recorded_at)
              ORDER BY r.item_key, r.recorded_at)
              FROM public.bcp_conduct_panel_resolutions r
             WHERE r.panel_id = pn.id), '[]'::jsonb))
        FROM public.bcp_conduct_panels pn WHERE pn.session_id = _session_id),

    -- ---- the governed ledger for this assignment -------------------------
    'audit_events', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'event', ev.event,
          'recorded_at', ev.recorded_at,
          'actor_id', ev.actor_id,
          'reason', ev.reason)
        ORDER BY ev.recorded_at, ev.id)
        FROM public.bcp_events ev
       WHERE ev.assignment_id = _s.assignment_id), '[]'::jsonb),

    -- ---- said by the document itself -------------------------------------
    'produces_score', false,
    'produces_ranking', false,
    'produces_recommendation', false,
    'interpretation', 'none');
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_conduct_build_report_basis(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bcp_conduct_build_report_basis(uuid) TO service_role;

COMMENT ON FUNCTION public.bcp_conduct_build_report_basis(uuid) IS
  'INTERNAL. Assembles the BESKT report payload from the typed conduct '
  'columns. Called by the preview and by the finalisation so the two cannot '
  'drift. Not client-callable: it applies no case authority of its own.';

-- ---------------------------------------------------------------------------
-- 6b · The basis hash, and why it is not simply a hash of the payload.
--
-- Finalising WRITES an event, and the payload carries the assignment's event
-- ledger. A basis hash taken over the whole payload would therefore differ
-- the instant the report it describes was written -- so the very next preview
-- would report a changed basis, and the "unchanged since the last report"
-- branch below could never match. The document would be correct and the
-- machinery around it would be permanently wrong about it.
--
-- So the BASIS -- the identity of the material a human read and signed -- is
-- taken over everything except the ledger, exactly as the Interview
-- Intelligence basis hash excludes the case status it is about to set. The
-- CONTENT hash still covers the whole payload, ledger included, because that
-- is the integrity of the stored document rather than the identity of what
-- was read.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bcp_conduct_basis_hash(_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public
AS $$
  SELECT encode(sha256(convert_to((_payload #- '{audit_events}')::text, 'UTF8')), 'hex');
$$;

REVOKE ALL ON FUNCTION public.bcp_conduct_basis_hash(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_conduct_basis_hash(jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION public.bcp_conduct_basis_hash(jsonb) IS
  'The identity of the material a human previewed and signed: the report '
  'payload excluding the event ledger, which the act of finalising appends '
  'to. The content hash covers the whole payload.';

-- ---------------------------------------------------------------------------
-- 7 · Blockers. What is not ready, named so a person can act on it.
--
-- Every one of these is a HUMAN step that has not happened. None is a quality
-- bar and none is a threshold: the report does not refuse because the work is
-- judged insufficient, it refuses because a step the method requires is
-- missing and a document that pretended otherwise would be false.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bcp_conduct_report_blockers(_session_id uuid)
RETURNS TABLE(code text, message text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _s public.bcp_conduct_sessions%ROWTYPE;
  _positions integer;
  _unlocked integer;
  _entries integer;
  _panel public.bcp_conduct_panels%ROWTYPE;
  _undocumented integer;
BEGIN
  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _session_id;
  IF NOT FOUND THEN
    code := 'BCP_CONDUCT_SESSION_NOT_FOUND';
    message := 'No such conduct session.';
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE state <> 'locked')
    INTO _positions, _unlocked
    FROM public.bcp_conduct_positions WHERE session_id = _session_id;

  IF _positions = 0 THEN
    code := 'BCP_CONDUCT_NO_POSITION';
    message := 'Nobody holds a position in this conversation yet.';
    RETURN NEXT;
  END IF;

  IF _unlocked > 0 THEN
    code := 'BCP_CONDUCT_POSITION_OPEN';
    message := format('%s position(s) are still open. Every participant locks their own before the report is written.', _unlocked);
    RETURN NEXT;
  END IF;

  SELECT count(*) INTO _entries
    FROM public.bcp_conduct_entries e
    JOIN public.bcp_conduct_positions p ON p.id = e.position_id
   WHERE p.session_id = _session_id AND e.superseded_by_entry_id IS NULL;

  IF _entries = 0 THEN
    code := 'BCP_CONDUCT_NOTHING_DOCUMENTED';
    message := 'No documentation has been recorded, so there is nothing to report.';
    RETURN NEXT;
  END IF;

  -- A panel is required only where there is more than one position: a single
  -- assessor has nobody to disagree with, and demanding a panel would be
  -- demanding a ceremony rather than a safeguard.
  IF _positions > 1 THEN
    SELECT * INTO _panel FROM public.bcp_conduct_panels WHERE session_id = _session_id;
    IF _panel.id IS NULL THEN
      code := 'BCP_CONDUCT_PANEL_REQUIRED';
      message := 'More than one position was taken, so the panel has to meet before the report is written.';
      RETURN NEXT;
    ELSIF _panel.state = 'open' THEN
      code := 'BCP_CONDUCT_PANEL_NOT_REVEALED';
      message := 'The panel has not revealed the locked positions yet.';
      RETURN NEXT;
    ELSE
      -- Every theme both assessors documented differently needs the panel to
      -- have said SOMETHING about it -- agreement or a recorded difference.
      SELECT count(*) INTO _undocumented
        FROM (SELECT DISTINCT e.item_key
                FROM public.bcp_conduct_entries e
                JOIN public.bcp_conduct_positions p ON p.id = e.position_id
               WHERE p.session_id = _session_id AND e.superseded_by_entry_id IS NULL
               GROUP BY e.item_key
              HAVING count(DISTINCT e.position_id) > 1) shared
       WHERE NOT EXISTS (
         SELECT 1 FROM public.bcp_conduct_panel_resolutions r
          WHERE r.session_id = _session_id AND r.item_key = shared.item_key);
      IF _undocumented > 0 THEN
        code := 'BCP_CONDUCT_RESOLUTION_MISSING';
        message := format('%s theme(s) documented by more than one assessor have no recorded panel outcome.', _undocumented);
        RETURN NEXT;
      END IF;
    END IF;
  END IF;

  RETURN;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_conduct_report_blockers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_conduct_report_blockers(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8 · Preview. The payload, its hashes, and what still stands in the way.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bcp_conduct_preview_report(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _s public.bcp_conduct_sessions%ROWTYPE;
  _payload jsonb;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_SESSION_NOT_FOUND: no such conduct session.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.scp_iv_can_read_case(_s.case_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not read this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  _payload := public.bcp_conduct_build_report_basis(_session_id);

  RETURN jsonb_build_object(
    'session_id', _session_id,
    'payload', _payload,
    'basis_hash', public.bcp_conduct_basis_hash(_payload),
    'content_hash', public.scp_iv_content_hash(_payload),
    'blockers', coalesce((
      SELECT jsonb_agg(jsonb_build_object('code', b.code, 'message', b.message)
                       ORDER BY b.code, b.message)
        FROM public.bcp_conduct_report_blockers(_session_id) b), '[]'::jsonb),
    'blocker_count', (SELECT count(*)::integer FROM public.bcp_conduct_report_blockers(_session_id)),
    'produces_score', false,
    'interpretation', 'none');
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_conduct_preview_report(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_conduct_preview_report(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9 · Finalisation. What is signed must be what was read.
--
-- The guards travel in a deliberate order -- authentication, the session, the
-- WRITE authority on the case, the blocker sweep, and only then the preview
-- check -- so a member who may read but not finalise learns nothing about a
-- case's readiness or its basis by probing this call.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bcp_conduct_finalise_report(
  _operation_id uuid,
  _session_id uuid,
  _expected_basis_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _s public.bcp_conduct_sessions%ROWTYPE;
  _request jsonb; _hash text; _replay jsonb;
  _n integer; _blockers text;
  _payload jsonb; _basis text; _content text;
  _next integer; _report_id uuid; _existing public.bcp_conduct_reports%ROWTYPE;
  _result jsonb;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _operation_id IS NULL THEN
    RAISE EXCEPTION 'BCP_OPERATION_ID_REQUIRED: every governed mutation names its operation.'
      USING ERRCODE = 'check_violation';
  END IF;

  _request := jsonb_build_object('op', 'bcp_conduct_finalise_report',
    'session_id', _session_id, 'expected_basis_hash', _expected_basis_hash);
  _hash := public.beskt_request_hash(_request);
  _replay := public.bcp_operation_begin(_operation_id, _hash);
  IF _replay IS NOT NULL THEN RETURN _replay; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_session_id::text, 0));

  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _session_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_SESSION_NOT_FOUND: no such conduct session.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Finalising is a WRITE on the case, and the existing case authority decides
  -- it. A reader may preview; only a writer may sign.
  IF NOT public.scp_iv_can_write_case(_s.case_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not work on this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT count(*), string_agg(format('%s: %s', b.code, b.message), E'\n')
    INTO _n, _blockers FROM public.bcp_conduct_report_blockers(_session_id) b;
  IF _n > 0 THEN
    RAISE EXCEPTION E'BCP_CONDUCT_REPORT_BLOCKED: this conversation is not ready for a report.\n%', _blockers
      USING ERRCODE = 'check_violation';
  END IF;

  _payload := public.bcp_conduct_build_report_basis(_session_id);
  _basis := public.bcp_conduct_basis_hash(_payload);
  _content := public.scp_iv_content_hash(_payload);

  IF _expected_basis_hash IS NULL OR btrim(_expected_basis_hash) = '' THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_PREVIEW_REQUIRED: finalising requires the basis hash of a preview. Preview the report, then finalise exactly that.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _expected_basis_hash <> _basis THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_STALE_PREVIEW: the record changed since it was previewed. Preview the report again and finalise what you read.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Unchanged since the last final report: return that report. Two clicks on
  -- "finalise" are one report, and a retry after a lost response finds the
  -- report it already made.
  SELECT * INTO _existing FROM public.bcp_conduct_reports
   WHERE session_id = _session_id AND status = 'final'
   ORDER BY version_number DESC LIMIT 1;
  IF _existing.id IS NOT NULL AND _existing.basis_hash = _basis THEN
    RETURN jsonb_build_object(
      'report_id', _existing.id, 'session_id', _session_id,
      'version_number', _existing.version_number,
      'basis_hash', _existing.basis_hash, 'content_hash', _existing.content_hash,
      'finalised_at', _existing.finalised_at, 'unchanged', true,
      'produces_score', false);
  END IF;

  SELECT coalesce(max(version_number), 0) + 1 INTO _next
    FROM public.bcp_conduct_reports WHERE session_id = _session_id;

  -- The predecessor steps down FIRST, so the one-final-per-session index is
  -- never violated inside the transaction.
  UPDATE public.bcp_conduct_reports
     SET status = 'superseded'
   WHERE session_id = _session_id AND status = 'final';

  INSERT INTO public.bcp_conduct_reports
    (session_id, case_id, employer_id, assignment_id, version_number, status,
     payload, content_hash, content_hash_algorithm, basis_hash,
     bound_method_version_id, bound_content_hash, bound_answers_content_hash,
     bound_response_id, finalised_by, operation_id)
  VALUES
    (_session_id, _s.case_id, _s.employer_id, _s.assignment_id, _next, 'final',
     _payload, _content, 'sha256', _basis,
     _s.bound_method_version_id, _s.bound_content_hash, _s.bound_answers_content_hash,
     _s.bound_response_id, _caller, _operation_id)
  RETURNING id INTO _report_id;

  _result := jsonb_build_object(
    'report_id', _report_id, 'session_id', _session_id,
    'version_number', _next, 'basis_hash', _basis, 'content_hash', _content,
    'unchanged', false, 'produces_score', false);

  PERFORM public.bcp_record_event(
    _s.assignment_id, _s.bound_response_id, _s.employer_id, _s.bound_method_version_id,
    'conduct_report_finalised', NULL, NULL, NULL,
    _s.bound_content_hash, NULL, _operation_id, _hash, _result,
    jsonb_build_object('session_id', _session_id, 'report_id', _report_id,
                       'version_number', _next, 'basis_hash', _basis,
                       'content_hash', _content, 'content_hash_algorithm', 'sha256'));

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_conduct_finalise_report(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_conduct_finalise_report(uuid, uuid, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10 · Readback. The finalised document, and the list of versions.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bcp_conduct_final_report(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _s public.bcp_conduct_sessions%ROWTYPE;
  _r public.bcp_conduct_reports%ROWTYPE;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_SESSION_NOT_FOUND: no such conduct session.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.scp_iv_can_read_case(_s.case_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not read this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT * INTO _r FROM public.bcp_conduct_reports
   WHERE session_id = _session_id AND status = 'final'
   ORDER BY version_number DESC LIMIT 1;

  -- Absent, not empty: no report has been finalised is a different answer
  -- from a report with nothing in it.
  IF _r.id IS NULL THEN
    RETURN jsonb_build_object('session_id', _session_id, 'finalised', false);
  END IF;

  RETURN jsonb_build_object(
    'session_id', _session_id,
    'finalised', true,
    'report_id', _r.id,
    'version_number', _r.version_number,
    'status', _r.status,
    'payload', _r.payload,
    'content_hash', _r.content_hash,
    'content_hash_algorithm', _r.content_hash_algorithm,
    'basis_hash', _r.basis_hash,
    'bound_method_version_id', _r.bound_method_version_id,
    'bound_content_hash', _r.bound_content_hash,
    'bound_answers_content_hash', _r.bound_answers_content_hash,
    'finalised_by', _r.finalised_by,
    'finalised_at', _r.finalised_at,
    'produces_score', false,
    'interpretation', 'none');
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_conduct_final_report(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_conduct_final_report(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bcp_conduct_report_versions(_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _s public.bcp_conduct_sessions%ROWTYPE;
BEGIN
  IF _caller IS NULL THEN
    RAISE EXCEPTION 'BCP_NOT_AUTHENTICATED: sign in first.' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT * INTO _s FROM public.bcp_conduct_sessions WHERE id = _session_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'BCP_CONDUCT_SESSION_NOT_FOUND: no such conduct session.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT public.scp_iv_can_read_case(_s.case_id) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_NOT_PERMITTED: you may not read this interview case.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
        'report_id', r.id,
        'version_number', r.version_number,
        'status', r.status,
        'content_hash', r.content_hash,
        'basis_hash', r.basis_hash,
        'finalised_by', r.finalised_by,
        'finalised_at', r.finalised_at)
      ORDER BY r.version_number DESC)
      FROM public.bcp_conduct_reports r
     WHERE r.session_id = _session_id), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.bcp_conduct_report_versions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bcp_conduct_report_versions(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 11 · Postflight. The migration proves its own claims, against the catalogue
--      rather than against its own source text.
-- ---------------------------------------------------------------------------
DO $proof$
DECLARE
  _fn text;
  _n integer;
  _client_fns text[] := ARRAY[
    'bcp_conduct_topic_prompts', 'bcp_conduct_report_blockers',
    'bcp_conduct_preview_report', 'bcp_conduct_finalise_report',
    'bcp_conduct_final_report', 'bcp_conduct_report_versions'];
  _forbidden text[] := ARRAY[
    'score', 'points', 'weight', 'threshold', 'total', 'rank', 'suitability',
    'credibility', 'truthfulness', 'recommendation', 'risk', 'verdict',
    'deception', 'hire', 'confidence', 'rating', 'grade', 'level'];
  _word text;
BEGIN
  -- ---- the report table is what it says it is ------------------------------
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = 'bcp_conduct_reports'
                  AND relrowsecurity AND relforcerowsecurity) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_REPORT_PROOF: bcp_conduct_reports does not FORCE row level security.';
  END IF;

  SELECT count(*) INTO _n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'bcp_conduct_reports' AND cmd <> 'SELECT';
  IF _n <> 0 THEN
    RAISE EXCEPTION 'BCP_CONDUCT_REPORT_PROOF: the report table has % write policy/policies; every write goes through the governed function.', _n;
  END IF;

  SELECT count(*) INTO _n
    FROM information_schema.role_table_grants
   WHERE table_schema = 'public' AND table_name = 'bcp_conduct_reports'
     AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
     AND grantee IN ('anon', 'authenticated', 'service_role');
  IF _n <> 0 THEN
    RAISE EXCEPTION 'BCP_CONDUCT_REPORT_PROOF: a client role holds % table DML privilege(s) on the report table.', _n;
  END IF;

  IF has_table_privilege('anon', 'public.bcp_conduct_reports', 'SELECT') THEN
    RAISE EXCEPTION 'BCP_CONDUCT_REPORT_PROOF: anon can read the report table.';
  END IF;

  -- ---- there is nowhere to put a judgement ---------------------------------
  FOREACH _word IN ARRAY _forbidden LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'bcp_conduct_reports'
                  AND column_name LIKE '%' || _word || '%') THEN
      RAISE EXCEPTION
        'BCP_CONDUCT_REPORT_PROOF: the report table has a column named for "%"; this method produces no such thing.', _word;
    END IF;
  END LOOP;

  -- ---- one final report per session, by index rather than by hope ----------
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
                  AND indexname = 'bcp_conduct_reports_one_final_per_session_idx') THEN
    RAISE EXCEPTION 'BCP_CONDUCT_REPORT_PROOF: the one-final-report index is missing.';
  END IF;

  -- ---- the immutability trigger exists and is reachable by no client -------
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgrelid = 'public.bcp_conduct_reports'::regclass
                    AND tgname = 'bcp_conduct_reports_immutable' AND NOT tgisinternal) THEN
    RAISE EXCEPTION 'BCP_CONDUCT_REPORT_PROOF: the immutability trigger is missing.';
  END IF;
  IF has_function_privilege('authenticated', 'public.bcp_guard_conduct_report()', 'EXECUTE')
     OR has_function_privilege('service_role', 'public.bcp_guard_conduct_report()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.bcp_guard_conduct_report()', 'EXECUTE') THEN
    RAISE EXCEPTION 'BCP_CONDUCT_REPORT_PROOF: the report guard is executable by a client role.';
  END IF;

  -- ---- every new function pins search_path and is closed to anon -----------
  FOREACH _fn IN ARRAY _client_fns LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = _fn) THEN
      RAISE EXCEPTION 'BCP_CONDUCT_REPORT_PROOF: % does not exist.', _fn;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                    WHERE n.nspname = 'public' AND p.proname = _fn
                      AND p.prosecdef
                      AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')) THEN
      RAISE EXCEPTION 'BCP_CONDUCT_REPORT_PROOF: % is not SECURITY DEFINER with a pinned search_path.', _fn;
    END IF;
  END LOOP;

  FOR _fn IN SELECT p.oid::regprocedure::text
               FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
              WHERE n.nspname = 'public'
                AND p.proname IN ('bcp_conduct_topic_prompts', 'bcp_conduct_report_blockers',
                                  'bcp_conduct_preview_report', 'bcp_conduct_finalise_report',
                                  'bcp_conduct_final_report', 'bcp_conduct_report_versions',
                                  'bcp_conduct_basis_hash',
                                  'bcp_conduct_build_report_basis') LOOP
    IF has_function_privilege('anon', _fn::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'BCP_CONDUCT_REPORT_PROOF: anon can execute %.', _fn;
    END IF;
  END LOOP;

  -- The builder applies no case authority of its own, so it must not be
  -- callable by a client: everything that calls it checks first.
  IF has_function_privilege('authenticated', 'public.bcp_conduct_build_report_basis(uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'BCP_CONDUCT_REPORT_PROOF: the unguarded basis builder is callable by authenticated.';
  END IF;

  -- ---- the basis hash is pure, and deliberately NOT definer ----------------
  --
  -- It reads nothing and decides nothing: it maps a value to its digest. A
  -- SECURITY DEFINER marking here would hand it privileges it has no use for,
  -- so the assertion is that it does NOT carry them -- and that its
  -- search_path is pinned anyway, because an unpinned one would let a caller's
  -- path decide which `sha256` is reached.
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'bcp_conduct_basis_hash'
                    AND NOT p.prosecdef
                    AND p.provolatile = 'i'
                    AND EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')) THEN
    RAISE EXCEPTION
      'BCP_CONDUCT_REPORT_PROOF: bcp_conduct_basis_hash must be IMMUTABLE, search_path-pinned and NOT SECURITY DEFINER.';
  END IF;

  -- ---- the prompt reader adds no access to the catalogue -------------------
  SELECT count(*) INTO _n FROM pg_policies
   WHERE schemaname = 'public' AND tablename = 'beskt_prompts';
  IF _n <> 1 THEN
    RAISE EXCEPTION 'BCP_CONDUCT_REPORT_PROOF: beskt_prompts has % policies; this migration must leave it at its one governance policy.', _n;
  END IF;
  IF has_table_privilege('anon', 'public.beskt_prompts', 'SELECT') THEN
    RAISE EXCEPTION 'BCP_CONDUCT_REPORT_PROOF: anon can read beskt_prompts.';
  END IF;

  -- ---- the event vocabulary kept every earlier member ----------------------
  FOREACH _word IN ARRAY ARRAY['assignment_created', 'response_submitted', 'pilot_granted',
                               'case_linked', 'case_unlinked', 'conduct_session_started',
                               'conduct_position_locked', 'conduct_panel_revealed',
                               'conduct_panel_resolution_recorded', 'conduct_report_finalised'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = 'public.bcp_events'::regclass
                      AND pg_get_constraintdef(oid) LIKE '%' || _word || '%') THEN
      RAISE EXCEPTION 'BCP_CONDUCT_REPORT_PROOF: the event vocabulary lost %.', _word;
    END IF;
  END LOOP;

  -- ---- this migration seeds nothing ----------------------------------------
  SELECT count(*) INTO _n FROM public.bcp_conduct_reports;
  IF _n <> 0 THEN
    RAISE EXCEPTION 'BCP_CONDUCT_REPORT_PROOF: the migration created % report(s); it must seed none.', _n;
  END IF;
  RAISE NOTICE 'BESKT_CONDUCT_PROMPTS_AND_REPORT_PROOF ok';
END $proof$;

COMMIT;
