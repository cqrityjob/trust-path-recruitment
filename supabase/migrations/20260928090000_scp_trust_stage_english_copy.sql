-- ============================================================================
-- CQrity TRUST — the governed stage copy, in English too
-- ============================================================================
--
-- The TRUST stage banner is the safety boundary a recruiter reads while the
-- interview is in front of them: what the stage is for, what the HUMAN owes it,
-- and what may not be concluded there. Stage names and purposes already had
-- English columns. The two that matter most did not:
--
--   scp_trust_stages.human_responsibility_sv  -- Swedish only
--   scp_trust_stage_prohibitions.statement_sv -- Swedish only
--
-- So an English-speaking pilot user saw an English chrome, an English stage
-- name, and then the responsibility and the prohibitions in Swedish. A
-- boundary nobody can read is not a boundary, and this is exactly the copy
-- where that matters.
--
-- This migration adds the English columns and fills them for TRUST v1. It is
-- TRANSLATION ONLY: no stage, prohibition, permission, ordinal or claim
-- changes, nothing is added or removed, and the method version is untouched.
-- The Swedish remains authoritative — English is a faithful rendering of it,
-- not a second definition.
-- ============================================================================

ALTER TABLE public.scp_trust_stages
  ADD COLUMN human_responsibility_en text;

COMMENT ON COLUMN public.scp_trust_stages.human_responsibility_en IS
  'English rendering of human_responsibility_sv. The Swedish column remains '
  'authoritative; this exists so the boundary is legible to an English-'
  'speaking interviewer, not so it can be stated differently.';

ALTER TABLE public.scp_trust_stage_prohibitions
  ADD COLUMN statement_en text;

COMMENT ON COLUMN public.scp_trust_stage_prohibitions.statement_en IS
  'English rendering of statement_sv. A prohibition that cannot be read is '
  'not a prohibition. The Swedish column remains authoritative.';


-- ────────────────────────────────────────────────────────────────────────────
-- The five stage responsibilities.
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.scp_trust_stages SET human_responsibility_en =
  'A qualified content owner approves the role, questions, probes, evidence dimensions, behavioural examples and prohibited areas.'
 WHERE stage_key = 'target' AND human_responsibility_en IS NULL;

UPDATE public.scp_trust_stages SET human_responsibility_en =
  'The recruiter checks the facts, approves the plan, and sees which passages were withheld from AI assistance.'
 WHERE stage_key = 'ready' AND human_responsibility_en IS NULL;

UPDATE public.scp_trust_stages SET human_responsibility_en =
  'The interviewer uses autonomy support, acceptance, empathy, adaptation and evocation, without pressure.'
 WHERE stage_key = 'understand' AND human_responsibility_en IS NULL;

UPDATE public.scp_trust_stages SET human_responsibility_en =
  'The interviewer documents the situation, the candidate''s own actions, the outcome, the reflection and what needs verifying.'
 WHERE stage_key = 'structure' AND human_responsibility_en IS NULL;

UPDATE public.scp_trust_stages SET human_responsibility_en =
  'People confirm, edit or reject evidence, assess against the behavioural examples, document their reasons, and make the decision.'
 WHERE stage_key = 'trace' AND human_responsibility_en IS NULL;


-- ────────────────────────────────────────────────────────────────────────────
-- The fourteen prohibitions. Matched on the Swedish statement so a reworded
-- prohibition is left untranslated and visible rather than silently mismatched.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  _pair record;
  _n integer := 0;
BEGIN
  FOR _pair IN
    SELECT * FROM (VALUES
      ('En provisorisk kompetensmappning får inte presenteras som en fastställd ekvivalens.',
       'A provisional competency mapping must not be presented as an established equivalence.'),
      ('AI får inte definiera nya urvalskriterier.',
       'AI must not define new selection criteria.'),
      ('Ett AI-förslag utan källhänvisning får inte bli en del av planen.',
       'An AI suggestion without a source citation must not become part of the plan.'),
      ('Underlag som inte är tillåtet för ändamålet får inte användas.',
       'Material that is not permitted for the purpose must not be used.'),
      ('Ett kort eller ofullständigt svar får inte behandlas som låg kompetens eller oärlighet.',
       'A short or incomplete answer must not be treated as low competence or dishonesty.'),
      ('Rapport innebär inte att ett svar är sant, fullständigt eller kompetensbevisande.',
       'Rapport does not mean an answer is true, complete, or proof of competence.'),
      ('Ingen kandidatpoäng, emotions-, röst-, kroppsspråks- eller trovärdighetsanalys.',
       'No candidate score, and no emotion, voice, body-language or credibility analysis.'),
      ('Hypotetiska tvångs- eller våldsscenarier får inte användas.',
       'Hypothetical coercion or violence scenarios must not be used.'),
      ('Ledande, anklagande, hotfulla eller manipulerande följdfrågor är inte tillåtna.',
       'Leading, accusatory, threatening or manipulative follow-up questions are not permitted.'),
      ('Q1-Q8 får aldrig skrivas om.',
       'Q1–Q8 must never be rewritten.'),
      ('Panelens slutsats får inte beräknas.',
       'The panel''s conclusion must not be calculated.'),
      ('Avvisat AI-material får inte följa med till rapporten.',
       'Rejected AI material must not carry through to the report.'),
      ('Ingen automatisk anställningsrekommendation.',
       'No automatic hiring recommendation.'),
      ('Ingen totalpoäng, viktning, tröskel, rangordning eller pass/fail.',
       'No total score, weighting, threshold, ranking or pass/fail.')
    ) AS v(sv, en)
  LOOP
    UPDATE public.scp_trust_stage_prohibitions
       SET statement_en = _pair.en
     WHERE statement_sv = _pair.sv AND statement_en IS NULL;
    _n := _n + 1;
  END LOOP;
  RAISE NOTICE 'SCP_TRUST_EN: % prohibition translations offered.', _n;
END $$;


-- ────────────────────────────────────────────────────────────────────────────
-- The projection carries both languages. Same shape as before plus two
-- columns; methodological_basis stays absent, as the disclosure correction
-- required.
-- ────────────────────────────────────────────────────────────────────────────
-- Widening a RETURNS TABLE is a signature change, so the old shape is dropped
-- first. Recreated immediately below, in the same transaction.
DROP FUNCTION IF EXISTS public.scp_trust_stage_for_case(uuid);

CREATE OR REPLACE FUNCTION public.scp_trust_stage_for_case(_case_id uuid)
RETURNS TABLE (
  stage_key text,
  letter text,
  ordinal integer,
  name_sv text,
  name_en text,
  purpose_sv text,
  purpose_en text,
  human_responsibility_sv text,
  human_responsibility_en text,
  method_version integer,
  permits_ai boolean,
  prohibitions text[],
  prohibitions_en text[])
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE _stage text; _method uuid; _version integer;
BEGIN
  -- Readable case only. A candidate cannot read an interview case, so a
  -- candidate gets NOTHING here rather than an error -- deliberately the same
  -- answer they get from the table itself, so the projection does not become
  -- an oracle for which case ids exist.
  IF NOT public.scp_iv_can_read_case(_case_id) THEN
    RETURN;
  END IF;

  SELECT c.trust_method_id INTO _method
    FROM public.scp_interview_cases c WHERE c.id = _case_id;
  IF _method IS NULL THEN RETURN; END IF;

  SELECT m.version_number INTO _version
    FROM public.scp_interview_methods m WHERE m.id = _method;

  _stage := public.scp_trust_case_stage(_case_id);
  IF _stage IS NULL THEN RETURN; END IF;

  RETURN QUERY
    SELECT s.stage_key, s.letter, s.ordinal,
           s.name_sv, s.name_en, s.purpose_sv, s.purpose_en,
           s.human_responsibility_sv, s.human_responsibility_en,
           _version,
           EXISTS (SELECT 1 FROM public.scp_trust_stage_ai_tasks t WHERE t.stage_id = s.id),
           coalesce(ARRAY(SELECT p.statement_sv FROM public.scp_trust_stage_prohibitions p
                           WHERE p.stage_id = s.id ORDER BY p.display_order), '{}'::text[]),
           coalesce(ARRAY(SELECT coalesce(p.statement_en, p.statement_sv)
                            FROM public.scp_trust_stage_prohibitions p
                           WHERE p.stage_id = s.id ORDER BY p.display_order), '{}'::text[])
      FROM public.scp_trust_stages s
     WHERE s.method_id = _method AND s.stage_key = _stage;
END; $$;

REVOKE ALL ON FUNCTION public.scp_trust_stage_for_case(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.scp_trust_stage_for_case(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.scp_trust_stage_for_case(uuid) IS
  'The TRUST stage a case is in, in both languages, for the employer surface. '
  'methodological_basis is deliberately ABSENT from the return type: the '
  'argument about whether ORBIT transfers from its origin domain belongs in '
  'the admin surface, not on a recruiter''s screen mid-interview. English '
  'prohibitions fall back to the Swedish statement when untranslated, so a '
  'new prohibition is visible and untranslated rather than missing.';


-- ────────────────────────────────────────────────────────────────────────────
-- Self-check: the boundary must be legible in both languages.
-- ────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE _missing integer;
BEGIN
  SELECT count(*) INTO _missing FROM public.scp_trust_stages
   WHERE human_responsibility_en IS NULL OR btrim(human_responsibility_en) = '';
  IF _missing > 0 THEN
    RAISE EXCEPTION 'SCP_TRUST_EN: % TRUST stage(s) have no English responsibility.', _missing;
  END IF;

  SELECT count(*) INTO _missing FROM public.scp_trust_stage_prohibitions
   WHERE statement_en IS NULL OR btrim(statement_en) = '';
  IF _missing > 0 THEN
    RAISE EXCEPTION 'SCP_TRUST_EN: % prohibition(s) have no English statement.', _missing;
  END IF;

  RAISE NOTICE 'SCP_TRUST_EN: every TRUST responsibility and prohibition reads in both languages.';
END $$;
