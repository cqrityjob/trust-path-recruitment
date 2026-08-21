-- The Candidate Assessment Brief and the Structured Interview Guide.
--
-- ── THE PROBLEM WITH THE REPORT AS IT STANDS ────────────────────────────
--
-- The released employer report is a list of competencies with an evidence
-- state. Every state from a single run is a follow-up of one kind or another,
-- and that is CORRECT and deliberate: consistent_evidence requires two evidence
-- contexts, one assessment is one context, and 20260820100000 locked that in
-- with an assertion (RA5.3) that nothing from a single run may read as "shown".
--
-- That axis answers "how much evidence is there, across how many occasions".
-- It is the right answer to that question and this migration does not touch it.
--
-- But it is not the question a recruiter has before an interview. Theirs is:
-- "in THIS assessment, on THESE tasks, how did this person actually answer, and
-- what should I ask about?" Answering the first question when asked the second
-- produces a report that says "follow up" fourteen times, which is not caution,
-- it is uselessness wearing caution's clothes.
--
-- ── SO: A THIRD AXIS, NAMED AS WHAT IT IS ───────────────────────────────
--
-- maturity          -- how strong is the evidence, across occasions   (unchanged)
-- evidence state    -- what may be claimed about a way of working     (unchanged)
-- assessment signal -- how did they answer THIS assessment            (new, ras-v1)
--
-- The assessment signal is computed ONLY over the frozen attempt, is labelled
-- in every surface as "within this assessment", and is always rendered next to
-- the breadth statement that one occasion cannot establish a durable claim. It
-- has five values -- strong, consistent, mixed, developing, limited -- and it is
-- deliberately per COMPETENCY. There is no total, no average across
-- competencies, no percentage, no band, no ranking against anyone else, and no
-- statement about suitability. Those are absent from the derivation, not
-- filtered out of it.
--
-- ── SELF-REPORT IS A PARALLEL TRACK, NEVER A MERGED ONE ─────────────────
--
-- 20260830090000 made self-reported answers a separate evidence source type
-- that never reaches maturity. This migration keeps that separation all the way
-- to the page: observed lines are built from counting source types ONLY, the
-- self-reported section is built from self_report evidence ONLY, and a
-- competency whose only evidence is self-report does not appear as an observed
-- line at all. "I say I do this" and "I demonstrated this" occupy different
-- keys in the payload, so a surface cannot accidentally render one as the
-- other.
--
-- ── THE INTERVIEW GUIDE IS AUTHORED, NOT GENERATED ──────────────────────
--
-- The questions come from a governed content table, seeded here, keyed by
-- competency (or facet) and by the FOCUS the evidence produced. What the
-- assessment supplies is the selection and the reason -- "this area, because
-- the answers on these tasks varied" -- which is deterministic and reproducible
-- from the frozen attempt.
--
-- No model runs at release. That is not caution about AI, it is the property
-- that makes the guide defensible: two people reading the same evidence get the
-- same guide, and the reason for every question is inspectable.
--
-- "What to listen for" is guidance for the interviewer. It is not a key, it
-- carries no score, and nothing in the platform reads a recorded interview note
-- back into the evidence ledger -- see the interview-notes section below.
--
-- ── SCOPE ───────────────────────────────────────────────────────────────
--
-- Additive. Two tables, one column on scp_report_snapshots, three read
-- functions, one CREATE OR REPLACE of scp_release_attempt_report. Snapshots
-- released before this carry brief = NULL and are never recomputed; surfaces
-- degrade to what they showed before.
--
-- Remediation: restore scp_release_attempt_report from 20260823090000, drop the
-- column, the two tables and the three functions.
--
-- Dependencies, verified present: scp_competency_evidence (+ source_type),
-- scp_evidence_source_types.counts_toward_maturity, scp_form_blocks,
-- scp_report_snapshots, scp_release_attempt_report(uuid), scp_followup_prompts.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The assessment signal
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_attempt_assessment_signal(
  _attempt_id uuid,
  _competency_version_id uuid,
  _signal_version text DEFAULT 'ras-v1')
RETURNS TABLE(signal text, observations integer, mean numeric, spread numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _n int; _mean numeric; _spread numeric;
BEGIN
  IF _signal_version <> 'ras-v1' THEN
    RAISE EXCEPTION 'SCP_UNKNOWN_SIGNAL_VERSION: % is not a derivation this '
      'product knows.', _signal_version USING ERRCODE = 'check_violation';
  END IF;

  -- Observed evidence only. The counts_toward_maturity join is what keeps
  -- self-report and training completion out of a statement about performance,
  -- and it is the same predicate scp_compute_maturity uses, so the two axes can
  -- never disagree about which rows are observations.
  SELECT count(*),
         coalesce(sum(e.contribution * e.confidence) / nullif(sum(e.confidence), 0), 0),
         coalesce(max(e.contribution) - min(e.contribution), 0)
    INTO _n, _mean, _spread
    FROM public.scp_competency_evidence e
    JOIN public.scp_evidence_source_types st ON st.code = e.source_type
    JOIN public.scp_behaviour_competency_map m
      ON m.behaviour_version_id = e.behaviour_version_id
   WHERE m.competency_version_id = _competency_version_id
     AND st.counts_toward_maturity
     AND e.superseded_by IS NULL
     AND e.source_ref IN (SELECT r.id FROM public.scp_candidate_responses r
                           WHERE r.attempt_id = _attempt_id);

  RETURN QUERY SELECT
    CASE
      -- Fewer than three tasks is not a pattern. Said first, so no amount of
      -- good answering on one task can read as consistency.
      WHEN _n < 3            THEN 'limited'
      -- Checked before the good bands: answers that differ sharply across
      -- comparable tasks are MIXED even when the average is high, and averaging
      -- them into a single flattering word is the exact failure this ordering
      -- prevents.
      WHEN _spread >= 0.600  THEN 'mixed'
      WHEN _mean   >= 0.800  THEN 'strong'
      WHEN _mean   >= 0.620  THEN 'consistent'
      ELSE                        'developing'
    END,
    _n, round(_mean, 3), round(_spread, 3);
END;
$function$;

COMMENT ON FUNCTION public.scp_attempt_assessment_signal(uuid, uuid, text) IS
  'How a person answered ONE assessment on ONE competency: strong, consistent, '
  'mixed, developing or limited. Computed over the frozen attempt''s observed '
  'evidence only. Deliberately per competency and deliberately not summable: '
  'there is no overall figure, no percentile, no band and no comparison with '
  'any other person anywhere in this derivation. Distinct from maturity, which '
  'answers how much evidence exists across occasions, and which one assessment '
  'can never satisfy on its own.';

REVOKE ALL ON FUNCTION public.scp_attempt_assessment_signal(uuid, uuid, text) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.scp_attempt_self_report_pattern(
  _attempt_id uuid,
  _facet_id uuid,
  _signal_version text DEFAULT 'ras-v1')
RETURNS TABLE(pattern text, consistency text, items integer, mean numeric, spread numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _n int; _mean numeric; _spread numeric;
BEGIN
  SELECT count(*),
         coalesce(sum(e.contribution * e.confidence) / nullif(sum(e.confidence), 0), 0),
         coalesce(max(e.contribution) - min(e.contribution), 0)
    INTO _n, _mean, _spread
    FROM public.scp_competency_evidence e
    JOIN public.scp_candidate_responses r ON r.id = e.source_ref
    JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
   WHERE r.attempt_id = _attempt_id
     AND e.source_type = 'self_report'
     AND e.superseded_by IS NULL
     AND iv.facet_id = _facet_id;

  RETURN QUERY SELECT
    CASE
      WHEN _n = 0          THEN 'not_described'
      WHEN _mean >= 0.750  THEN 'consistently_described'
      WHEN _mean >= 0.550  THEN 'mostly_described'
      ELSE                      'rarely_described'
    END,
    -- The §12 consistency signal, and the only thing it is ever allowed to
    -- mean: these related answers did not point the same way, so ask about it.
    -- Never deception, never dishonesty, never a claim about the person.
    CASE WHEN _n >= 2 AND _spread >= 0.500 THEN 'varied' ELSE 'consistent' END,
    _n, round(_mean, 3), round(_spread, 3);
END;
$function$;

COMMENT ON FUNCTION public.scp_attempt_self_report_pattern(uuid, uuid, text) IS
  'What a person SAID about how they usually work, for one facet, in one '
  'assessment. Never an observation and never presented as one. `consistency` '
  'is "varied" when related answers point different ways -- a prompt to ask '
  'about it in interview, and never a statement that anybody was untruthful.';

REVOKE ALL ON FUNCTION public.scp_attempt_self_report_pattern(uuid, uuid, text) FROM PUBLIC, anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The interview guide content library
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.scp_interview_guide_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competency_id uuid NOT NULL REFERENCES public.scp_competencies(id) ON DELETE RESTRICT,
  -- NULL = the whole competency. Set = a facet, which is how a self-report
  -- follow-up names the actual habit rather than the construct above it.
  facet_id uuid REFERENCES public.scp_competency_facets(id) ON DELETE RESTRICT,
  focus text NOT NULL CHECK (focus IN (
    'confirm_strength',          -- answers were consistent and strong; test depth
    'explore_development',       -- answers were weaker or uneven; explore why
    'explore_limited_evidence',  -- too few tasks to say anything; go and ask
    'explore_self_report')),     -- what they SAID needs an example behind it
  version_number integer NOT NULL DEFAULT 1,
  content_status text NOT NULL DEFAULT 'published'
    CHECK (content_status IN ('draft','published','retired')),
  question_sv text NOT NULL,
  question_en text NOT NULL,
  followup_sv text NOT NULL,
  followup_en text NOT NULL,
  listen_for_sv text[] NOT NULL,
  listen_for_en text[] NOT NULL,
  authored_by_ai boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS scp_interview_guide_prompts_competency_key
  ON public.scp_interview_guide_prompts (competency_id, focus, version_number)
  WHERE facet_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS scp_interview_guide_prompts_facet_key
  ON public.scp_interview_guide_prompts (facet_id, focus, version_number)
  WHERE facet_id IS NOT NULL;

COMMENT ON TABLE public.scp_interview_guide_prompts IS
  'Authored interview questions, selected by evidence rather than generated '
  'from it. listen_for is GUIDANCE FOR THE INTERVIEWER and is deliberately not '
  'a key: it carries no score, no preferred answer and no rubric, and nothing '
  'in the platform reads an interview back into the evidence ledger. A guide '
  'that scored the interview would turn a conversation into a second test, '
  'which is the opposite of what it is for.';

ALTER TABLE public.scp_interview_guide_prompts ENABLE ROW LEVEL SECURITY;

-- Catalogue content: names no item, no option, no participant. Readable by any
-- authenticated principal like the rest of the catalogue; no write policy
-- exists, so only definer functions and the service role can author.
DROP POLICY IF EXISTS scp_interview_guide_prompts_read ON public.scp_interview_guide_prompts;
CREATE POLICY scp_interview_guide_prompts_read ON public.scp_interview_guide_prompts
  FOR SELECT TO authenticated USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. Interview evidence, recorded by a person, kept OUT of the ledger
--
-- After the interview the recruiter has something the assessment never had: a
-- conversation. §35 of the product brief wants that captured so the record
-- reads ASSESSMENT -> INTERVIEW -> HUMAN DECISION.
--
-- Three properties make this safe:
--
--   * append-only, like every other judgement record in this platform;
--   * it never writes public.scp_competency_evidence, so a recruiter's opinion
--     can never become platform-visible "competence" for the next employer;
--   * `outcome` has no positive/negative arithmetic attached and is never
--     aggregated. Nothing sums these rows into anything.
--
-- The employment decision stays where it already is: scp_employer_decisions.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.scp_interview_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.scp_attempts(id) ON DELETE RESTRICT,
  -- Denormalised from the attempt, exactly as scp_employer_report_decisions
  -- does it. The tenant boundary has to be answerable from THIS row: an
  -- employer member cannot select scp_attempts (scp_attempts_own_select is for
  -- the participant), so a policy that joined through it would deny every
  -- legitimate read while looking correct.
  employer_id uuid NOT NULL REFERENCES public.employers(id) ON DELETE RESTRICT,
  -- Which brief area the note answers. Free of any foreign key on purpose: the
  -- brief is a frozen rendering and an area code in it must stay resolvable
  -- even if the competency catalogue is later reorganised.
  area_code text NOT NULL,
  outcome text NOT NULL CHECK (outcome IN (
    'evidence_confirmed', 'evidence_not_confirmed', 'additional_context')),
  note text CHECK (note IS NULL OR length(note) <= 1000),
  recorded_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scp_interview_notes_attempt_idx
  ON public.scp_interview_notes (attempt_id, recorded_at DESC);

COMMENT ON TABLE public.scp_interview_notes IS
  'What a person found out in the interview, against one area of the brief. '
  'Append-only and deliberately inert: no row here is written to '
  'scp_competency_evidence, none is aggregated, and no outcome carries a '
  'weight. It is a record of a conversation, not a second scoring pass, and it '
  'is not the employment decision -- that stays in scp_employer_decisions.';

ALTER TABLE public.scp_interview_notes ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.scp_guard_interview_notes_append_only()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    'SCP_INTERVIEW_NOTE_APPEND_ONLY: an interview note is a record of what was '
    'said at the time and cannot be %. Record a further note instead.',
    lower(TG_OP) USING ERRCODE = 'check_violation';
END; $$;

DROP TRIGGER IF EXISTS scp_interview_notes_append_only ON public.scp_interview_notes;
CREATE TRIGGER scp_interview_notes_append_only
  BEFORE UPDATE OR DELETE ON public.scp_interview_notes
  FOR EACH ROW EXECUTE FUNCTION public.scp_guard_interview_notes_append_only();

-- Only an active member of the organisation that commissioned the attempt.
-- A participant never sees these, and neither does any other organisation.
DROP POLICY IF EXISTS scp_interview_notes_employer_read ON public.scp_interview_notes;
CREATE POLICY scp_interview_notes_employer_read ON public.scp_interview_notes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.employer_memberships m
     WHERE m.employer_id = scp_interview_notes.employer_id
       AND m.user_id = auth.uid() AND m.status = 'active'));

CREATE OR REPLACE FUNCTION public.scp_record_interview_note(
  _attempt_id uuid,
  _area_code text,
  _outcome text,
  _note text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _role text; _id uuid; _employer uuid;
BEGIN
  SELECT m.role, a.issuer_organization_id INTO _role, _employer
    FROM public.scp_attempts a
    JOIN public.employer_memberships m
      ON m.employer_id = a.issuer_organization_id
   WHERE a.id = _attempt_id AND m.user_id = auth.uid() AND m.status = 'active';

  IF _role IS NULL OR _role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'SCP_NOT_AUTHORISED_TO_RECORD_INTERVIEW: recording '
      'interview evidence requires owner or admin in the commissioning '
      'organisation.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.scp_report_snapshots s
                  WHERE s.attempt_id = _attempt_id AND s.audience = 'employer') THEN
    RAISE EXCEPTION 'SCP_INTERVIEW_BEFORE_REPORT: interview evidence is '
      'recorded against a released brief, and this attempt has none.'
      USING ERRCODE = 'check_violation';
  END IF;

  INSERT INTO public.scp_interview_notes
    (attempt_id, employer_id, area_code, outcome, note, recorded_by)
  VALUES (_attempt_id, _employer, _area_code, _outcome,
          nullif(btrim(coalesce(_note,'')), ''), auth.uid())
  RETURNING id INTO _id;

  RETURN _id;
END;
$function$;

REVOKE ALL     ON FUNCTION public.scp_record_interview_note(uuid, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_record_interview_note(uuid, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.scp_interview_notes(_attempt_id uuid)
RETURNS TABLE(id uuid, area_code text, outcome text, note text,
              recorded_by_email text, recorded_at timestamptz)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.scp_attempts a
      JOIN public.employer_memberships m
        ON m.employer_id = a.issuer_organization_id
     WHERE a.id = _attempt_id AND m.user_id = auth.uid() AND m.status = 'active')
  THEN RETURN; END IF;

  RETURN QUERY
  SELECT n.id, n.area_code, n.outcome, n.note,
         u.email::text, n.recorded_at
    FROM public.scp_interview_notes n
    LEFT JOIN auth.users u ON u.id = n.recorded_by
   WHERE n.attempt_id = _attempt_id
   ORDER BY n.recorded_at DESC;
END;
$function$;

REVOKE ALL     ON FUNCTION public.scp_interview_notes(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_interview_notes(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. The brief lives on the snapshot, frozen like everything else
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.scp_report_snapshots
  ADD COLUMN IF NOT EXISTS brief jsonb;

COMMENT ON COLUMN public.scp_report_snapshots.brief IS
  'The audience-appropriate brief, frozen at release. The employer brief '
  'carries observed signals, self-reported patterns, strengths, development '
  'areas and the structured interview guide; the participant brief carries the '
  'modules they completed and what they said about their own way of working, '
  'and NEITHER carries a recommendation, a total or a ranking. NULL on rows '
  'released before this existed; those are never recomputed.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. The authored questions
--
-- Written against real guarding work rather than generic competency-interview
-- phrasing, because a recruiter at a guarding company can tell the difference
-- in one reading. Every question is open, asks for a specific past situation,
-- and can be answered by somebody who has never worked for this employer.
--
-- authored_by_ai = true on all of them. This content was drafted by an AI
-- assistant against the product's own construct rules. It has not been reviewed
-- by a subject-matter expert and nothing here claims it has.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO public.scp_interview_guide_prompts
  (competency_id, facet_id, focus, question_sv, question_en,
   followup_sv, followup_en, listen_for_sv, listen_for_en, authored_by_ai)
SELECT c.id, NULL, v.focus, v.q_sv, v.q_en, v.f_sv, v.f_en, v.l_sv, v.l_en, true
FROM (VALUES
  -- ── SCC-01 Integritet och etik ─────────────────────────────────────────
  ('SCC-01','explore_development',
   'Berätta om en gång då någon bad dig göra ett undantag från en rutin, och personen hade en rimlig anledning.',
   'Tell me about a time somebody asked you to make an exception to a procedure, and they had a reasonable-sounding reason.',
   'Vad gjorde du, och vad sa du till personen?',
   'What did you do, and what did you say to them?',
   ARRAY['Skiljer på vem som frågar och vad som frågas','Erbjuder en väg som faktiskt löser personens problem','För avvikelsen vidare i stället för att bära den själv','Kan beskriva vad som hade hänt om undantaget blivit praxis'],
   ARRAY['Separates who is asking from what is being asked','Offers a route that actually solves the person''s problem','Passes the deviation on rather than carrying it alone','Can describe what would happen if the exception became practice']),
  ('SCC-01','confirm_strength',
   'Beskriv en situation där du fick information i tjänsten som det hade varit lätt att använda i ett annat sammanhang.',
   'Describe a situation where you came across information at work that would have been easy to use in another context.',
   'Hur avgjorde du var gränsen gick?',
   'How did you decide where the line was?',
   ARRAY['Har ett eget resonemang, inte bara "det är förbjudet"','Förstår varför informationen är skyddad','Beskriver vad hen faktiskt gjorde, inte vad hen borde göra'],
   ARRAY['Has their own reasoning, not just "it is forbidden"','Understands why the information is protected','Describes what they actually did, not what one should do']),
  ('SCC-01','explore_limited_evidence',
   'Vad räknar du som ett integritetsproblem i väktararbete? Ge gärna ett exempel du sett eller hört talas om.',
   'What counts as an integrity problem in guarding work, in your view? Give an example you have seen or heard about.',
   'Vad hände, och vad hade du gjort annorlunda?',
   'What happened, and what would you have done differently?',
   ARRAY['Ser vardagliga situationer, inte bara grova fall','Kan skilja på misstag och medvetet val','Talar om andra utan att döma personen'],
   ARRAY['Sees everyday situations, not only serious cases','Can distinguish a mistake from a deliberate choice','Talks about others without judging the person']),

  -- ── SCC-03 Situationsmedvetenhet ───────────────────────────────────────
  ('SCC-03','explore_development',
   'Berätta om en gång då du märkte att något inte stämde på en plats du kände väl.',
   'Tell me about a time you noticed that something was off in a place you knew well.',
   'Vad var det konkret som fick dig att reagera, och vad gjorde du sedan?',
   'What specifically made you react, and what did you do next?',
   ARRAY['Namnger observerbara detaljer, inte en känsla','Beskriver normalbilden hen jämförde mot','Följde upp i stället för att låta det passera','Skiljer på vad hen såg och vad hen antog'],
   ARRAY['Names observable details rather than a feeling','Describes the normal picture they compared against','Followed it up rather than letting it pass','Separates what they saw from what they assumed']),
  ('SCC-03','confirm_strength',
   'Hur går du till väga när du är ny på ett objekt och ska lära dig vad som är normalt där?',
   'How do you go about learning what is normal at a site you are new to?',
   'Vad var det första du la märke till senast du började på ett nytt objekt?',
   'What was the first thing you noticed the last time you started at a new site?',
   ARRAY['Har ett medvetet arbetssätt, inte bara vana','Frågar personal och läser instruktionen','Uppdaterar bilden när något ändras'],
   ARRAY['Has a deliberate method, not just habit','Asks staff and reads the site instruction','Updates the picture when something changes']),
  ('SCC-03','explore_limited_evidence',
   'Beskriv den sista ronden eller det sista passet du gick. Vad la du märke till?',
   'Describe the last round or shift you worked. What did you notice?',
   'Vad hade fått dig att stanna upp och titta närmare?',
   'What would have made you stop and look more closely?',
   ARRAY['Konkreta iakttagelser med tid och plats','Skiljer rutinmässig kontroll från riktad uppmärksamhet','Kan säga vad som hade varit en avvikelse'],
   ARRAY['Concrete observations with time and place','Separates routine checking from directed attention','Can say what would have counted as a deviation']),

  -- ── SCC-04 Beslutsfattande under press ─────────────────────────────────
  ('SCC-04','explore_development',
   'Berätta om en situation där du behövde agera snabbt utan att ha all information du ville ha.',
   'Tell me about a situation where you had to act quickly without having all the information you wanted.',
   'Hur avgjorde du vilken information som var nödvändig innan du agerade?',
   'How did you decide which information was essential before acting?',
   ARRAY['Prioriterar mellan flera saker som pågår samtidigt','Skiljer det tidskritiska från det viktiga','Kallar på hjälp i tid','Väger risken av att vänta mot risken av att agera'],
   ARRAY['Prioritises between several things happening at once','Separates the time-critical from the important','Calls for help in time','Weighs the risk of waiting against the risk of acting']),
  ('SCC-04','confirm_strength',
   'Beskriv ett tillfälle då två saker hände samtidigt och du var ensam.',
   'Describe an occasion when two things happened at once and you were on your own.',
   'Vad valde du bort, och hur hanterade du det efteråt?',
   'What did you set aside, and how did you handle that afterwards?',
   ARRAY['Kan motivera valet i efterhand','Släppte inte det bortvalda helt','Meddelade rätt person om det hen inte hann med'],
   ARRAY['Can justify the choice afterwards','Did not drop the deprioritised thing entirely','Told the right person about what they could not get to']),
  ('SCC-04','explore_limited_evidence',
   'Vad gör du först när ett larm går och informationen är ofullständig?',
   'What do you do first when an alarm goes off and the information is incomplete?',
   'Ge gärna ett exempel på ett larm du varit med om.',
   'Give an example of an alarm you have dealt with, if you can.',
   ARRAY['Skaffar egen lägesbild innan hen binder upp sig','Vet vem som ska larmas och när','Beskriver ett arbetssätt, inte en enstaka reflex'],
   ARRAY['Builds their own picture before committing','Knows who to alert and when','Describes a method rather than a single reflex']),

  -- ── SCC-06 Kommunikation och informationskvalitet ──────────────────────
  ('SCC-06','explore_development',
   'Berätta om en rapport eller en överlämning du skrivit som fick konsekvenser för någon annan.',
   'Tell me about a report or handover you wrote that had consequences for somebody else.',
   'Hur avgjorde du vad som skulle med och vad som kunde utelämnas?',
   'How did you decide what to include and what could be left out?',
   ARRAY['Skiljer iakttagelse från slutsats i sitt eget språk','Tidsanger och namnger konkret','Tänker på vem som ska läsa och vad de behöver kunna göra','Tar med det som talar emot den egna tolkningen'],
   ARRAY['Separates observation from conclusion in their own language','Gives times and names concretely','Thinks about who will read it and what they need to do','Includes what argues against their own reading']),
  ('SCC-06','confirm_strength',
   'Vad skiljer en rapport som håller från en som inte gör det?',
   'What is the difference between a report that holds up and one that does not?',
   'Har du någon gång fått gå tillbaka och komplettera en egen rapport?',
   'Have you ever had to go back and complete a report of your own?',
   ARRAY['Har ett eget kvalitetsbegrepp, inte en mall','Nämner spårbarhet och tid','Ser rapporten som något andra ska kunna arbeta vidare med'],
   ARRAY['Has their own idea of quality, not a template','Mentions traceability and timing','Sees the report as something others must be able to work from']),
  ('SCC-06','explore_limited_evidence',
   'Beskriv en händelse du varit med om, som om du rapporterade den till en kollega som tar över efter dig.',
   'Describe an incident you have been involved in, as if you were reporting it to the colleague taking over from you.',
   'Vad av det du just sa är sådant du såg, och vad är sådant du drar slutsatsen av?',
   'Which parts of what you just said did you see, and which are conclusions you drew?',
   ARRAY['Kan själv peka ut var slutsatserna börjar','Ger tid, plats och signalement utan uppmaning','Utelämnar inte det obekväma'],
   ARRAY['Can point out where the conclusions start','Gives time, place and description unprompted','Does not leave out the uncomfortable parts']),

  -- ── SCC-07 Respektfullt bemötande och gränshållning ────────────────────
  ('SCC-07','explore_development',
   'Berätta om en gång då du behövde säga nej till någon som blev upprörd.',
   'Tell me about a time you had to say no to somebody who became upset.',
   'Vad sa du, och vad gjorde du när personen inte accepterade svaret?',
   'What did you say, and what did you do when they did not accept the answer?',
   ARRAY['Håller gränsen utan att höja tonläget','Förklarar varför, inte bara att','Erbjuder något som faktiskt hjälper personen vidare','Behandlar personen lika oavsett vem det är'],
   ARRAY['Holds the line without raising the temperature','Explains why, not only that','Offers something that actually helps the person move on','Treats the person the same regardless of who they are']),
  ('SCC-07','confirm_strength',
   'Hur gör du när någon är arg på dig för något du inte rår över?',
   'What do you do when somebody is angry at you for something outside your control?',
   'Har du något exempel där det gick bra, och något där det inte gjorde det?',
   'Do you have an example where it went well, and one where it did not?',
   ARRAY['Tar inte kritiken personligt men lyssnar','Kan beskriva ett tillfälle det gick fel utan att skylla ifrån sig','Vet när samtalet ska avslutas'],
   ARRAY['Does not take it personally but still listens','Can describe an occasion it went wrong without deflecting','Knows when to end the conversation']),
  ('SCC-07','explore_limited_evidence',
   'Vilken typ av bemötande fungerar bäst i entré och reception, enligt din erfarenhet?',
   'What kind of approach works best at an entrance or reception desk, in your experience?',
   'Vad gör du annorlunda när det är kö och någon inte har behörighet?',
   'What do you do differently when there is a queue and somebody has no authorisation?',
   ARRAY['Tänker på både säkerhet och den som står framför','Har ett arbetssätt för stress i kön','Skiljer service från eftergift'],
   ARRAY['Thinks about both security and the person in front of them','Has a method for pressure in a queue','Separates service from giving way']),

  -- ── SCC-08 Samarbete och samordning ────────────────────────────────────
  ('SCC-08','explore_development',
   'Berätta om en överlämning mellan pass som inte fungerade.',
   'Tell me about a shift handover that did not work.',
   'Vad saknades, och vad gjorde du åt det?',
   'What was missing, and what did you do about it?',
   ARRAY['Ser överlämningen som sitt eget ansvar','Vet vad nästa pass behöver veta','Åtgärdade i stället för att konstatera'],
   ARRAY['Sees the handover as their own responsibility','Knows what the next shift needs to know','Fixed it rather than just noting it']),
  ('SCC-08','confirm_strength',
   'Hur samordnar du dig med en kollega när ni är två på ett objekt?',
   'How do you coordinate with a colleague when there are two of you on a site?',
   'Vad gör ni för att inte båda gå på samma sak?',
   'What do you do to avoid both going to the same thing?',
   ARRAY['Meddelar position och avsikt','Har tänkt på vad som händer om radion tystnar','Delar lägesbild aktivt'],
   ARRAY['Communicates position and intent','Has thought about what happens if the radio goes quiet','Actively shares the situational picture']),
  ('SCC-08','explore_limited_evidence',
   'Vad behöver nästa pass alltid få veta av dig?',
   'What does the next shift always need to hear from you?',
   'Vad brukar falla bort i praktiken?',
   'What tends to get lost in practice?',
   ARRAY['Har en egen checklista i huvudet','Nämner pågående ärenden och avvikelser','Vet skillnaden mellan trevligt att veta och nödvändigt'],
   ARRAY['Has their own mental checklist','Mentions open matters and deviations','Knows the difference between nice to know and necessary']),

  -- ── SCC-09 Ansvarstagande och tillförlitlighet ─────────────────────────
  ('SCC-09','explore_development',
   'Berätta om ett misstag du gjort i tjänsten som ingen annan hade märkt.',
   'Tell me about a mistake you made at work that nobody else had noticed.',
   'Vad gjorde du efteråt, och vem fick veta?',
   'What did you do afterwards, and who was told?',
   ARRAY['Berättar om ett verkligt misstag, inte en styrka i förklädnad','Rapporterade utan att bli ombedd','Kan beskriva vad hen ändrade i sitt arbetssätt','Skyller inte på förutsättningarna'],
   ARRAY['Describes a real mistake, not a strength in disguise','Reported it without being asked','Can describe what they changed in how they work','Does not blame the circumstances']),
  ('SCC-09','confirm_strength',
   'Hur ser du till att det du lovat faktiskt blir gjort under ett pass?',
   'How do you make sure what you have promised actually gets done during a shift?',
   'Vad händer med det du inte hinner?',
   'What happens to the things you do not get to?',
   ARRAY['Har ett konkret system, inte bara minne','Lämnar spår efter sig','Överlämnar det oavslutade i stället för att låta det försvinna'],
   ARRAY['Has a concrete system, not just memory','Leaves a trace behind','Hands over the unfinished rather than letting it disappear']),
  ('SCC-09','explore_limited_evidence',
   'Vad brukar du dokumentera under ett pass, och vad låter du bli?',
   'What do you usually document during a shift, and what do you leave out?',
   'Var går gränsen, och vem har bestämt den?',
   'Where is the line, and who set it?',
   ARRAY['Kan motivera var gränsen går','Vet vad instruktionen kräver','Dokumenterar även när inget hände'],
   ARRAY['Can justify where the line is','Knows what the site instruction requires','Documents even when nothing happened']),

  -- ── SCC-11 Professionellt omdöme och proportionalitet ──────────────────
  ('SCC-11','explore_development',
   'Berätta om en situation där du hade kunnat ingripa hårdare än du gjorde.',
   'Tell me about a situation where you could have intervened more forcefully than you did.',
   'Vad fick dig att välja den åtgärd du valde?',
   'What made you choose the action you chose?',
   ARRAY['Väger åtgärd mot vad som faktiskt var känt','Väljer minst ingripande åtgärd som löser problemet','Håller sig inom sitt mandat','Kan beskriva konsekvenserna av det andra alternativet'],
   ARRAY['Weighs the action against what was actually known','Chooses the least intrusive action that solves the problem','Stays within their mandate','Can describe the consequences of the other option']),
  ('SCC-11','confirm_strength',
   'Beskriv en gång då du fick information som senare visade sig vara felaktig.',
   'Describe a time you were given information that later turned out to be wrong.',
   'När märkte du det, och vad gjorde du då?',
   'When did you notice, and what did you do then?',
   ARRAY['Kontrollerade i stället för att anta','Ändrade sig utan prestige','Berättade för dem som agerat på den felaktiga uppgiften'],
   ARRAY['Checked rather than assumed','Changed position without ego','Told the people who had acted on the wrong information']),
  ('SCC-11','explore_limited_evidence',
   'Var går gränsen för vad en väktare får göra, som du förstår den?',
   'Where is the limit of what a security officer may do, as you understand it?',
   'Ge ett exempel där du behövt hålla dig på rätt sida om den gränsen.',
   'Give an example where you had to stay on the right side of that limit.',
   ARRAY['Talar om mandat snarare än om vad hen skulle vilja','Vet när någon annan ska ta över','Skiljer instruktion från lag'],
   ARRAY['Talks about mandate rather than what they would like to do','Knows when somebody else should take over','Separates a site instruction from the law'])
) AS v(code, focus, q_sv, q_en, f_sv, f_en, l_sv, l_en)
JOIN public.scp_competencies c ON c.code = v.code
ON CONFLICT DO NOTHING;

-- ── Self-report follow-ups, at facet level ──────────────────────────────
--
-- These exist for exactly one situation: the person DESCRIBED a way of working
-- and the assessment has nothing observed to put beside it, or their related
-- answers pointed different ways. In both cases the honest move is to ask for
-- a concrete example, which is what every one of these does.

INSERT INTO public.scp_interview_guide_prompts
  (competency_id, facet_id, focus, question_sv, question_en,
   followup_sv, followup_en, listen_for_sv, listen_for_en, authored_by_ai)
SELECT f.competency_id, f.id, 'explore_self_report',
       v.q_sv, v.q_en, v.f_sv, v.f_en, v.l_sv, v.l_en, true
FROM (VALUES
  ('genomforandedisciplin',
   'Du beskriver hur du brukar följa rutiner. Berätta om ett tillfälle då rutinen kändes onödigt lång och situationen såg enkel ut.',
   'You describe how you usually follow procedure. Tell me about a time the procedure felt unnecessarily long and the situation looked straightforward.',
   'Vad gjorde du då, och vad hade hänt om du kortat av?',
   'What did you do then, and what would have happened if you had cut it short?',
   ARRAY['Ett konkret tillfälle, inte en princip','Erkänner frestelsen i stället för att förneka den','Förstår vad rutinen skyddar mot'],
   ARRAY['A concrete occasion, not a principle','Acknowledges the temptation rather than denying it','Understands what the procedure protects against']),
  ('aktiv-scanning',
   'Du beskriver att du är noggrann med detaljer. Ge ett exempel på en detalj du lagt märke till som andra missat.',
   'You describe yourself as careful with detail. Give an example of a detail you noticed that others missed.',
   'Vad gjorde du med iakttagelsen?',
   'What did you do with the observation?',
   ARRAY['Ett verkligt exempel med tid och plats','Fördes vidare, inte bara noterat i huvudet','Skiljer detalj från betydelselös detalj'],
   ARRAY['A real example with time and place','It was passed on, not just noted mentally','Distinguishes a detail from an irrelevant detail']),
  ('avvikelseigenkanning',
   'Du beskriver hur du håller uppmärksamheten uppe under repetitivt arbete. Hur märker du själv att du börjar gå på autopilot?',
   'You describe how you keep your attention up during repetitive work. How do you notice yourself starting to go on autopilot?',
   'Vad gör du konkret när du märker det?',
   'What do you actually do when you notice it?',
   ARRAY['Har en självobservation som låter trovärdig','Har ett konkret motmedel, inte bara vilja','Beskriver ett tillfälle det inte fungerade'],
   ARRAY['Has self-observation that sounds credible','Has a concrete countermeasure, not just willpower','Describes an occasion it did not work']),
  ('regel-och-syfteslojalitet',
   'Du beskriver hur du hanterar information i tjänsten. Berätta om en gång då någon frågade dig om något du visste men inte fick berätta.',
   'You describe how you handle information at work. Tell me about a time somebody asked you about something you knew but were not allowed to share.',
   'Hur formulerade du dig, och hur togs det emot?',
   'How did you put it, and how was it received?',
   ARRAY['Kan säga nej utan att göra frågeställaren till motståndare','Vet var informationen hör hemma i stället','Ett konkret tillfälle'],
   ARRAY['Can say no without making the asker an adversary','Knows where the information belongs instead','A concrete occasion']),
  ('fel-och-avvikelseansvar',
   'Du beskriver hur du hanterar egna misstag. Berätta om det senaste du rapporterade om dig själv.',
   'You describe how you handle your own mistakes. Tell me about the most recent thing you reported about yourself.',
   'Vad hände efteråt?',
   'What happened afterwards?',
   ARRAY['Har ett faktiskt exempel att ta till','Rapporterade innan någon frågade','Beskriver konsekvensen utan att förminska den'],
   ARRAY['Has an actual example to reach for','Reported before anybody asked','Describes the consequence without minimising it']),
  ('granshallning',
   'Du beskriver hur du håller en gräns under socialt tryck. Berätta om en gång då det var en kollega eller en chef som tryckte på.',
   'You describe how you hold a line under social pressure. Tell me about a time it was a colleague or a manager applying the pressure.',
   'Vad blev följden för dig, och skulle du göra likadant igen?',
   'What were the consequences for you, and would you do the same again?',
   ARRAY['Skiljer press från legitim instruktion','Beskriver kostnaden ärligt','Eskalerade i stället för att stå ensam kvar'],
   ARRAY['Separates pressure from a legitimate instruction','Describes the cost honestly','Escalated rather than being left standing alone']),
  ('eskalering-och-overlamning',
   'Du beskriver när du brukar eskalera. Berätta om en gång du eskalerade och det visade sig vara i onödan.',
   'You describe when you usually escalate. Tell me about a time you escalated and it turned out to be unnecessary.',
   'Vad gjorde det med hur du eskalerar i dag?',
   'What did that do to how you escalate today?',
   ARRAY['Är inte rädd för att eskalera fel','Kan resonera om tröskeln','Skiljer eskalering från att lämna över ansvaret'],
   ARRAY['Is not afraid of escalating wrongly','Can reason about the threshold','Separates escalating from handing off responsibility']),
  ('aterhamtning',
   'Du beskriver hur du behåller lugnet under press. Berätta om en gång då du blev provocerad i tjänsten.',
   'You describe how you stay calm under pressure. Tell me about a time you were provoked at work.',
   'Vad märkte du på dig själv, och hur kom du tillbaka?',
   'What did you notice in yourself, and how did you come back from it?',
   ARRAY['Kan beskriva den egna reaktionen konkret','Har något som faktiskt fungerar för att återgå','Talar om situationen utan att göra motparten till fiende'],
   ARRAY['Can describe their own reaction concretely','Has something that actually works to reset','Talks about the situation without making the other party an enemy'])
) AS v(facet_slug, q_sv, q_en, f_sv, f_en, l_sv, l_en)
JOIN public.scp_competency_facets f ON f.slug = v.facet_slug
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. Release builds the brief
--
-- Body from 20260823090000 with three substantive changes and nothing else:
--
--   1. The observed `lines` are now built from COUNTING source types only, so a
--      self-description can never be counted as an observation on a competency
--      line. Before this the two were indistinguishable in the payload.
--   2. A `brief` is composed and frozen alongside the payload, per audience.
--   3. The context gains self_report_observations and pace fields.
--
-- Every refusal, every authorisation check, every template lookup and the
-- safety-flag handling are unchanged.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_release_attempt_report(_attempt_id uuid)
RETURNS TABLE(participant_snapshot uuid, employer_snapshot uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _a public.scp_attempts%ROWTYPE;
  _role text; _flags jsonb; _emp_payload jsonb; _par_payload jsonb;
  _pv uuid; _ev uuid; _p_id uuid; _e_id uuid; _derivation jsonb;
  _emp_ctx jsonb; _par_ctx jsonb; _emp_brief jsonb; _par_brief jsonb;
  _org text; _purpose text; _slug text; _name_sv text; _name_en text;
  _version int; _lang text; _person text; _ref text;
  _rev_total int; _rev_done int; _obs int; _ctx int; _concerns int;
  _self int; _quick int; _answered int;
  _pv_key text; _ev_key text; _pv_num int; _ev_num int;
  _modules jsonb; _observed jsonb; _selfrep jsonb; _guide jsonb;
  _state_version constant text := 'des-v2';
  _scope_version constant text := 'attempt-v1';
  _brief_version constant text := 'rab-v1';
  _signal_version constant text := 'ras-v1';
BEGIN
  SELECT a.* INTO _a FROM public.scp_attempts a WHERE a.id = _attempt_id;
  IF _a.id IS NULL THEN RETURN; END IF;

  SELECT m.role INTO _role FROM public.employer_memberships m
   WHERE m.user_id = auth.uid() AND m.employer_id = _a.issuer_organization_id
     AND m.status = 'active';
  IF _role IS NULL OR _role NOT IN ('owner','admin') THEN
    RAISE EXCEPTION 'SCP_NOT_AUTHORISED_TO_RELEASE: releasing a development '
      'report requires owner or admin in the commissioning organisation.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF _a.scored_at IS NULL THEN
    RAISE EXCEPTION 'SCP_RELEASE_BEFORE_SCORED: this attempt still has work '
      'outstanding -- a report cannot be released over an unreviewed response.'
      USING ERRCODE = 'check_violation';
  END IF;
  IF _a.released_at IS NOT NULL THEN
    RAISE EXCEPTION 'SCP_ALREADY_RELEASED: this attempt''s report is already '
      'released; snapshots are immutable.' USING ERRCODE = 'unique_violation';
  END IF;

  CREATE TEMP TABLE _scope ON COMMIT DROP AS
  SELECT e.id
    FROM public.scp_competency_evidence e
   WHERE e.superseded_by IS NULL
     AND e.source_ref IN (SELECT r.id FROM public.scp_candidate_responses r
                           WHERE r.attempt_id = _attempt_id);

  -- The evidence-kind boundary, established once and used everywhere below.
  CREATE TEMP TABLE _observed_scope ON COMMIT DROP AS
  SELECT e.id
    FROM public.scp_competency_evidence e
    JOIN public.scp_evidence_source_types t
      ON t.code = e.source_type AND t.counts_toward_maturity
   WHERE e.id IN (SELECT id FROM _scope);

  SELECT e.name INTO _org FROM public.employers e WHERE e.id = _a.issuer_organization_id;
  SELECT pv2.purpose_code INTO _purpose
    FROM public.scp_purpose_versions pv2 WHERE pv2.id = _a.purpose_version_id;
  SELECT d.slug, d.name_sv, d.name_en, av.version_number
    INTO _slug, _name_sv, _name_en, _version
    FROM public.scp_assessment_versions av
    JOIN public.scp_assessment_definitions d ON d.id = av.definition_id
   WHERE av.id = _a.assessment_version_id;
  SELECT aa.language,
         CASE WHEN aa.employee_id IS NOT NULL OR aa.use_case = 'workforce'
              THEN 'employee' ELSE 'candidate' END
    INTO _lang, _person
    FROM public.assessment_assignments aa WHERE aa.id = _a.assignment_id;

  _ref := upper(substr(replace(_a.subject_id::text, '-', ''), 1, 6));

  SELECT count(*), count(DISTINCT e.context_ref)
    INTO _obs, _ctx
    FROM public.scp_competency_evidence e
   WHERE e.id IN (SELECT id FROM _observed_scope);

  SELECT count(*) INTO _self
    FROM public.scp_competency_evidence e
   WHERE e.id IN (SELECT id FROM _scope) AND e.source_type = 'self_report';

  SELECT count(*), count(*) FILTER (WHERE hr.review_status = 'completed')
    INTO _rev_total, _rev_done
    FROM public.scp_human_reviews hr
    JOIN public.scp_candidate_responses r ON r.id = hr.response_id
   WHERE r.attempt_id = _attempt_id;

  SELECT count(*) INTO _concerns
    FROM public.scp_competency_evidence e
   WHERE e.id IN (SELECT id FROM _scope)
     AND e.safety_finding IN ('low','medium','high','critical');

  -- A pace observation, and nothing more than that. Counts answers recorded
  -- within three seconds of the previous one, and is reported as a fact about
  -- the RUN rather than a finding about the person: fast answering has many
  -- innocent explanations -- a re-read pass, a resumed session, a confident
  -- reader -- and the product must not turn a timestamp into a character claim.
  --
  -- Reported PROPORTIONALLY, and only above a quarter of the run. A raw count
  -- is unreadable ("11 rapid answers" out of what?) and a signal that fires on
  -- two quick clicks is noise that trains the reader to skip the section. Both
  -- numbers are carried so the surface can state the denominator.
  SELECT count(*) FILTER (WHERE g.gap IS NOT NULL AND g.gap < interval '3 seconds'),
         count(*)
    INTO _quick, _answered
    FROM (SELECT r.responded_at
                 - lag(r.responded_at) OVER (ORDER BY fi.display_order) AS gap
            FROM public.scp_candidate_responses r
            JOIN public.scp_form_items fi
              ON fi.item_version_id = r.item_version_id AND fi.form_id = _a.form_id
           WHERE r.attempt_id = _attempt_id) g;

  WITH scope_comp AS (
    -- Competencies this attempt produced OBSERVED evidence for. Self-report is
    -- deliberately excluded here: a competency the person only DESCRIBED must
    -- not appear on an observed line, at any state, with any count.
    SELECT DISTINCT bcm.competency_version_id
      FROM public.scp_competency_evidence e
      JOIN public.scp_behaviour_competency_map bcm
        ON bcm.behaviour_version_id = e.behaviour_version_id
     WHERE e.id IN (SELECT id FROM _observed_scope)
    UNION
    -- Plus the ones a disputed review reached but deliberately left no evidence
    -- for. Without this the line disappears rather than reading "needs a
    -- follow-up", which is the opposite of what a disputed reading should say.
    SELECT DISTINCT bcm.competency_version_id
      FROM public.scp_human_reviews hr
      JOIN public.scp_candidate_responses r ON r.id = hr.response_id
      JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
      JOIN public.scp_behaviour_competency_map bcm
        ON bcm.behaviour_version_id = iv.primary_behaviour_id
     WHERE r.attempt_id = _attempt_id
       AND hr.review_status = 'completed'
       AND hr.outcome IN ('adjusted','overturned')
  ), lines AS (
    SELECT c.code AS competency_code, cv.id AS competency_version_id,
           cv.name_sv, cv.name_en,
           public.scp_attempt_maturity(_attempt_id, cv.id, 'v1', now()) AS maturity,
           count(e.id) AS observations,
           coalesce(array_agg(DISTINCT e.source_type)
                      FILTER (WHERE e.source_type IS NOT NULL), ARRAY[]::text[]) AS source_types,
           string_agg(DISTINCT bv.statement_sv, ' ') AS behaviour_sv,
           string_agg(DISTINCT bv.statement_en, ' ') AS behaviour_en,
           coalesce(bool_or(e.provenance_type = 'human_review'), false) AS human_reviewed
      FROM scope_comp sc
      JOIN public.scp_competency_versions cv ON cv.id = sc.competency_version_id
      JOIN public.scp_competencies c ON c.id = cv.competency_id
      LEFT JOIN public.scp_behaviour_competency_map bcm
             ON bcm.competency_version_id = cv.id
      LEFT JOIN public.scp_competency_evidence e
             ON e.behaviour_version_id = bcm.behaviour_version_id
            AND e.id IN (SELECT id FROM _observed_scope)
      LEFT JOIN public.scp_behaviour_versions bv ON bv.id = bcm.behaviour_version_id
     GROUP BY c.code, cv.id, cv.name_sv, cv.name_en
  ), stated AS (
    SELECT l.*,
           public.scp_attempt_evidence_state(_attempt_id, l.competency_version_id, l.maturity) AS state
      FROM lines l
  )
  SELECT
    jsonb_agg(jsonb_build_object(
      'competency_code',    s.competency_code,
      'competency_name_sv', s.name_sv,
      'competency_name_en', s.name_en,
      'evidence_state',     s.state,
      'observations',       s.observations,
      'source_types',       to_jsonb(coalesce(s.source_types, ARRAY[]::text[])),
      'behaviour_sv',       s.behaviour_sv,
      'behaviour_en',       s.behaviour_en,
      'followup_sv',        fpe.prompt_sv,
      'followup_en',        fpe.prompt_en
    ) ORDER BY s.competency_code),
    jsonb_agg(jsonb_build_object(
      'competency_code',    s.competency_code,
      'competency_name_sv', s.name_sv,
      'competency_name_en', s.name_en,
      'evidence_state',     s.state,
      'observations',       s.observations,
      'behaviour_sv',       s.behaviour_sv,
      'behaviour_en',       s.behaviour_en,
      'human_reviewed',     s.human_reviewed,
      'reflection_sv',      fpp.prompt_sv,
      'reflection_en',      fpp.prompt_en
    ) ORDER BY s.competency_code),
    jsonb_agg(jsonb_build_object(
      'competency_code', s.competency_code,
      'maturity_level',  s.maturity,
      'threshold_version', 'v1'
    ) ORDER BY s.competency_code)
    INTO _emp_payload, _par_payload, _derivation
    FROM stated s
    LEFT JOIN public.scp_competency_versions cv2 ON cv2.id = s.competency_version_id
    LEFT JOIN public.scp_followup_prompts fpe
           ON fpe.competency_id = cv2.competency_id AND fpe.audience = 'employer'
          AND fpe.content_status = 'published'
    LEFT JOIN public.scp_followup_prompts fpp
           ON fpp.competency_id = cv2.competency_id AND fpp.audience = 'participant'
          AND fpp.content_status = 'published';

  -- ── The brief ─────────────────────────────────────────────────────────

  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'block_key', b.block_key, 'name_sv', b.name_sv, 'name_en', b.name_en,
           'asks', b.asks,
           'items', (SELECT count(*) FROM public.scp_form_items fi
                      WHERE fi.form_id = _a.form_id AND fi.block_key = b.block_key),
           'answered', (SELECT count(*) FROM public.scp_form_items fi
                          JOIN public.scp_candidate_responses r
                            ON r.item_version_id = fi.item_version_id
                           AND r.attempt_id = _attempt_id
                         WHERE fi.form_id = _a.form_id AND fi.block_key = b.block_key)
         ) ORDER BY b.display_order), '[]'::jsonb)
    INTO _modules
    FROM public.scp_form_blocks b WHERE b.form_id = _a.form_id;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'competency_code'), '[]'::jsonb)
    INTO _observed
    FROM (
      SELECT jsonb_build_object(
               'area_code',    c.code,
               'area_sv',      cv.name_sv,
               'area_en',      cv.name_en,
               'evidence_type','observed',
               'signal',       sig.signal,
               'items',        sig.observations,
               'mean',         sig.mean,
               'spread',       sig.spread,
               'evidence_state', public.scp_attempt_evidence_state(
                                   _attempt_id, cv.id,
                                   public.scp_attempt_maturity(_attempt_id, cv.id, 'v1', now())),
               'behaviour_sv', bstat.sv,
               'behaviour_en', bstat.en,
               'why_sv', CASE sig.signal
                 WHEN 'strong'     THEN format('Svaren höll en jämn och hög nivå över %s uppgifter i den här bedömningen.', sig.observations)
                 WHEN 'consistent' THEN format('Svaren pekade åt samma håll över %s uppgifter i den här bedömningen.', sig.observations)
                 WHEN 'mixed'      THEN format('Svaren skilde sig åt mellan jämförbara uppgifter (%s uppgifter, spännvidd %s).', sig.observations, to_char(sig.spread,'FM0.00'))
                 WHEN 'developing' THEN format('Svaren valde genomgående handlingsalternativ som uppgifterna beskriver som mindre välavvägda (%s uppgifter).', sig.observations)
                 ELSE format('Endast %s uppgift(er) i den här bedömningen berörde området — för lite för att säga något om det.', sig.observations)
               END,
               'why_en', CASE sig.signal
                 WHEN 'strong'     THEN format('Answers were consistently strong across %s tasks in this assessment.', sig.observations)
                 WHEN 'consistent' THEN format('Answers pointed the same way across %s tasks in this assessment.', sig.observations)
                 WHEN 'mixed'      THEN format('Answers differed between comparable tasks (%s tasks, spread %s).', sig.observations, to_char(sig.spread,'FM0.00'))
                 WHEN 'developing' THEN format('Answers consistently chose options the tasks describe as less well-judged (%s tasks).', sig.observations)
                 ELSE format('Only %s task(s) in this assessment touched this area — too few to say anything about it.', sig.observations)
               END
             ) AS x
        FROM (SELECT DISTINCT bcm.competency_version_id AS cvid
                FROM public.scp_competency_evidence e
                JOIN public.scp_behaviour_competency_map bcm
                  ON bcm.behaviour_version_id = e.behaviour_version_id
               WHERE e.id IN (SELECT id FROM _observed_scope)) src
        JOIN public.scp_competency_versions cv ON cv.id = src.cvid
        JOIN public.scp_competencies c ON c.id = cv.competency_id
        CROSS JOIN LATERAL public.scp_attempt_assessment_signal(
                     _attempt_id, cv.id, _signal_version) sig
        LEFT JOIN LATERAL (
          SELECT string_agg(DISTINCT bv.statement_sv, ' ') AS sv,
                 string_agg(DISTINCT bv.statement_en, ' ') AS en
            FROM public.scp_behaviour_competency_map bcm2
            JOIN public.scp_behaviour_versions bv ON bv.id = bcm2.behaviour_version_id
           WHERE bcm2.competency_version_id = cv.id) bstat ON true
    ) q;

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'domain_key'), '[]'::jsonb)
    INTO _selfrep
    FROM (
      SELECT jsonb_build_object(
               'domain_key',    f.slug,
               'domain_sv',     f.name_sv,
               'domain_en',     f.name_en,
               'area_code',     c.code,
               'evidence_type', 'self_reported',
               'pattern',       p.pattern,
               'consistency',   p.consistency,
               'items',         p.items,
               'mean',          p.mean,
               'spread',        p.spread,
               'why_sv', CASE
                 WHEN p.consistency = 'varied'
                   THEN format('Svaren varierade mellan närliggande frågor om %s. Utforska området i intervju.', lower(f.name_sv))
                 WHEN p.pattern = 'consistently_described'
                   THEN format('Deltagaren beskriver genomgående att hen arbetar så (%s frågor). Detta är självrapporterat och inte observerat.', p.items)
                 WHEN p.pattern = 'mostly_described'
                   THEN format('Deltagaren beskriver för det mesta att hen arbetar så (%s frågor). Detta är självrapporterat och inte observerat.', p.items)
                 ELSE format('Deltagaren beskriver att hen sällan arbetar så (%s frågor). Detta är självrapporterat och inte observerat.', p.items)
               END,
               'why_en', CASE
                 WHEN p.consistency = 'varied'
                   THEN format('Answers varied across related questions about %s. Explore this area in interview.', lower(f.name_en))
                 WHEN p.pattern = 'consistently_described'
                   THEN format('The participant consistently describes working this way (%s questions). This is self-reported, not observed.', p.items)
                 WHEN p.pattern = 'mostly_described'
                   THEN format('The participant mostly describes working this way (%s questions). This is self-reported, not observed.', p.items)
                 ELSE format('The participant describes rarely working this way (%s questions). This is self-reported, not observed.', p.items)
               END
             ) AS x
        FROM (SELECT DISTINCT iv.facet_id
                FROM public.scp_competency_evidence e
                JOIN public.scp_candidate_responses r ON r.id = e.source_ref
                JOIN public.scp_item_versions iv ON iv.id = r.item_version_id
               WHERE r.attempt_id = _attempt_id
                 AND e.source_type = 'self_report'
                 AND e.superseded_by IS NULL
                 AND iv.facet_id IS NOT NULL) src
        JOIN public.scp_competency_facets f ON f.id = src.facet_id
        JOIN public.scp_competencies c ON c.id = f.competency_id
        CROSS JOIN LATERAL public.scp_attempt_self_report_pattern(
                     _attempt_id, f.id, _signal_version) p
    ) q;

  -- The guide. Selection is deterministic: what the evidence produced decides
  -- the FOCUS, and the focus selects an authored question. Development first,
  -- then self-report answers that need an example behind them, then thin
  -- areas, then a strength worth testing the depth of -- which is the order a
  -- recruiter with forty minutes should spend them in.
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'guide_order')::int, x->>'area_code'), '[]'::jsonb)
    INTO _guide
    FROM (
      SELECT jsonb_build_object(
               'guide_order', CASE g.focus
                         WHEN 'explore_development'      THEN 1
                         WHEN 'explore_self_report'      THEN 2
                         WHEN 'explore_limited_evidence' THEN 3
                         ELSE 4 END,
               'area_code',     g.area_code,
               'area_sv',       g.area_sv,
               'area_en',       g.area_en,
               'focus',         g.focus,
               'evidence_type', g.evidence_type,
               'why_sv',        g.why_sv,
               'why_en',        g.why_en,
               'question_sv',   p.question_sv,
               'question_en',   p.question_en,
               'followup_sv',   p.followup_sv,
               'followup_en',   p.followup_en,
               'listen_for_sv', to_jsonb(p.listen_for_sv),
               'listen_for_en', to_jsonb(p.listen_for_en)
             ) AS x
        FROM (
          -- Observed areas that need exploring, or are worth confirming.
          SELECT (o->>'area_code') AS area_code,
                 (o->>'area_sv')   AS area_sv,
                 (o->>'area_en')   AS area_en,
                 'observed'        AS evidence_type,
                 CASE WHEN o->>'signal' IN ('developing','mixed') THEN 'explore_development'
                      WHEN o->>'signal' = 'limited'               THEN 'explore_limited_evidence'
                      ELSE 'confirm_strength' END AS focus,
                 (o->>'why_sv') AS why_sv,
                 (o->>'why_en') AS why_en,
                 NULL::text     AS facet_slug
            FROM jsonb_array_elements(_observed) o
          UNION ALL
          -- Self-descriptions whose related answers disagreed, and
          -- self-descriptions with no observed counterpart at all: both need a
          -- concrete example before anybody relies on them.
          SELECT (s->>'area_code'), (s->>'domain_sv'), (s->>'domain_en'),
                 'self_reported',
                 'explore_self_report',
                 (s->>'why_sv'), (s->>'why_en'),
                 (s->>'domain_key')
            FROM jsonb_array_elements(_selfrep) s
           WHERE s->>'consistency' = 'varied'
              OR NOT EXISTS (SELECT 1 FROM jsonb_array_elements(_observed) o2
                              WHERE o2->>'area_code' = s->>'area_code'
                                AND o2->>'signal' <> 'limited')
        ) g
        JOIN public.scp_competencies c ON c.code = g.area_code
        JOIN public.scp_interview_guide_prompts p
          ON p.competency_id = c.id
         AND p.focus = g.focus
         AND p.content_status = 'published'
         AND ((g.facet_slug IS NULL AND p.facet_id IS NULL)
           OR (g.facet_slug IS NOT NULL
               AND p.facet_id = (SELECT f2.id FROM public.scp_competency_facets f2
                                  WHERE f2.slug = g.facet_slug)))
    ) q;

  _emp_brief := jsonb_build_object(
    'brief_version',   _brief_version,
    'signal_version',  _signal_version,
    'audience',        'employer',
    'modules',         _modules,
    'observed',        _observed,
    'self_reported',   _selfrep,
    'interview_guide', _guide,
    'coverage', jsonb_build_object(
      'observed_observations',    _obs,
      'self_report_observations', _self,
      'evidence_contexts',        _ctx,
      'reviews_total',            _rev_total,
      'reviews_completed',        _rev_done),
    'pace', CASE
      WHEN _answered > 0 AND _quick::numeric / _answered >= 0.25
        THEN jsonb_build_object('rapid_answers', _quick, 'answered', _answered)
      ELSE NULL END);

  -- The participant's brief. Deliberately a SUBSET, not a softened version:
  -- the modules they completed and what they themselves said. No strengths
  -- ordering, no development framing, no interview guide -- those are written
  -- for a recruiter preparing a conversation, and handing them to the person
  -- being assessed would be handing them somebody else's working notes.
  _par_brief := jsonb_build_object(
    'brief_version',  _brief_version,
    'signal_version', _signal_version,
    'audience',       'participant',
    'modules',        _modules,
    'self_reported',  (
      SELECT coalesce(jsonb_agg(s - 'why_sv' - 'why_en' - 'mean' - 'spread'
                                  ORDER BY s->>'domain_key'), '[]'::jsonb)
        FROM jsonb_array_elements(_selfrep) s),
    'coverage', jsonb_build_object(
      'observed_observations',    _obs,
      'self_report_observations', _self,
      'evidence_contexts',        _ctx));

  -- Real findings only. A safety-critical item that a reviewer cleared is not a
  -- flag, and an alert that fires for everybody is not an alert.
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'behaviour_version_id', e.behaviour_version_id,
           'severity', e.safety_severity,
           'finding', e.safety_finding,
           'observed_at', e.observed_at)), '[]'::jsonb)
    INTO _flags
    FROM public.scp_competency_evidence e
   WHERE e.id IN (SELECT id FROM _scope)
     AND e.safety_finding IN ('low','medium','high','critical');

  SELECT id, report_key, version_number INTO _pv, _pv_key, _pv_num
    FROM public.scp_report_versions
   WHERE audience = 'participant' AND content_status = 'published'
     AND (governance_mode = _a.governance_mode OR governance_mode IS NULL)
   ORDER BY (governance_mode IS NOT NULL) DESC, version_number DESC LIMIT 1;
  SELECT id, report_key, version_number INTO _ev, _ev_key, _ev_num
    FROM public.scp_report_versions
   WHERE audience = 'employer' AND content_status = 'published'
     AND (governance_mode = _a.governance_mode OR governance_mode IS NULL)
   ORDER BY (governance_mode IS NOT NULL) DESC, version_number DESC LIMIT 1;
  IF _pv IS NULL OR _ev IS NULL THEN
    RAISE EXCEPTION 'SCP_NO_PUBLISHED_REPORT_TEMPLATE: a report cannot be '
      'rendered without a published template for each audience.'
      USING ERRCODE = 'check_violation';
  END IF;

  _emp_ctx := jsonb_build_object(
    'participant_ref', _ref, 'person_context', _person,
    'organisation_name', _org, 'purpose_code', _purpose,
    'assessment_slug', _slug, 'assessment_name_sv', _name_sv,
    'assessment_name_en', _name_en, 'assessment_version', _version,
    'language', _lang, 'started_at', _a.started_at,
    'submitted_at', _a.submitted_at, 'scored_at', _a.scored_at,
    'governance_mode', _a.governance_mode,
    'validation_status', _a.validation_status_at_assignment,
    'content_status', _a.content_status_at_assignment,
    'attempt_status', 'released',
    'reviews_total', _rev_total, 'reviews_completed', _rev_done,
    'safety_concerns', _concerns,
    'evidence_observations', _obs, 'evidence_contexts', _ctx,
    'self_report_observations', _self,
    'report_key', _ev_key, 'report_version', _ev_num,
    'evidence_state_version', _state_version,
    'evidence_scope_version', _scope_version,
    'brief_version', _brief_version,
    'signal_version', _signal_version,
    'threshold_version', 'v1',
    'scoring_model_version', _a.scoring_model_version);

  -- Unchanged from 20260823090000 except for two additions, and the omissions
  -- are the point: no attempt_status, no review counts, no scoring model
  -- version and no participant_ref. RA8.4 and RA8.5 in the report-audience
  -- suite assert those absences, and they are absences by intent -- the person
  -- is told what concerns them, not how the machine ran.
  _par_ctx := jsonb_build_object(
    'person_context', _person, 'organisation_name', _org,
    'purpose_code', _purpose, 'assessment_name_sv', _name_sv,
    'assessment_name_en', _name_en, 'assessment_version', _version,
    'language', _lang, 'submitted_at', _a.submitted_at,
    'governance_mode', _a.governance_mode,
    'validation_status', _a.validation_status_at_assignment,
    'human_review_occurred', (_rev_total > 0),
    'safety_concern_present', (_concerns > 0),
    'evidence_observations', _obs, 'evidence_contexts', _ctx,
    'self_report_observations', _self,
    'report_key', _pv_key, 'report_version', _pv_num,
    'evidence_scope_version', _scope_version,
    'brief_version', _brief_version);

  INSERT INTO public.scp_report_snapshots
    (attempt_id, subject_id, issuer_organization_id, report_version_id,
     audience, payload, brief, safety_flags, threshold_version,
     scoring_model_version, evidence_state_version, evidence_scope_version,
     derivation_input, context)
  VALUES
    (_attempt_id, _a.subject_id, _a.issuer_organization_id, _pv,
     'participant', coalesce(_par_payload,'[]'::jsonb), _par_brief,
     '[]'::jsonb, 'v1', _a.scoring_model_version, _state_version,
     _scope_version, _derivation, _par_ctx)
  RETURNING id INTO _p_id;

  INSERT INTO public.scp_report_snapshots
    (attempt_id, subject_id, issuer_organization_id, report_version_id,
     audience, payload, brief, safety_flags, threshold_version,
     scoring_model_version, evidence_state_version, evidence_scope_version,
     derivation_input, context)
  VALUES
    (_attempt_id, _a.subject_id, _a.issuer_organization_id, _ev,
     'employer', coalesce(_emp_payload,'[]'::jsonb), _emp_brief,
     _flags, 'v1', _a.scoring_model_version, _state_version,
     _scope_version, _derivation, _emp_ctx)
  RETURNING id INTO _e_id;

  UPDATE public.scp_attempts
     SET released_at = now(), status = 'released'
   WHERE id = _attempt_id;

  DROP TABLE IF EXISTS _scope;
  DROP TABLE IF EXISTS _observed_scope;
  RETURN QUERY SELECT _p_id, _e_id;
END;
$function$;

COMMENT ON FUNCTION public.scp_release_attempt_report(uuid) IS
  'Freezes one attempt into two immutable snapshots and their briefs. The '
  'observed lines are built from counting evidence source types only, so a '
  'self-description can never be rendered as an observation; self-reported '
  'patterns occupy their own key. Neither brief contains a total, a percentage, '
  'a ranking, a suitability statement or an employment recommendation -- those '
  'are absent from the derivation rather than filtered from it.';

REVOKE ALL     ON FUNCTION public.scp_release_attempt_report(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.scp_release_attempt_report(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. Proof: the vocabulary this product refuses to produce
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _def text; _bad text;
BEGIN
  _def := lower(pg_get_functiondef('public.scp_release_attempt_report(uuid)'::regprocedure));
  FOREACH _bad IN ARRAY ARRAY[
    'hire', 'reject', 'suitab', 'unsuitab', 'recommend', 'rank',
    'percentile', 'overall_score', 'total_score', 'pass_fail', 'risk_score',
    'trust_score', 'integrity_score', 'personality'
  ] LOOP
    IF position(_bad IN _def) > 0 THEN
      RAISE EXCEPTION
        'SCP_FORBIDDEN_REPORT_VOCABULARY: the release function contains "%". '
        'CQrityjob produces decision support, never an employment decision.',
        _bad;
    END IF;
  END LOOP;

  IF position('counts_toward_maturity' IN _def) = 0 THEN
    RAISE EXCEPTION
      'SCP_OBSERVED_BOUNDARY_MISSING: the release function no longer separates '
      'observed evidence from self-report. That separation is the product.';
  END IF;

  RAISE NOTICE 'release vocabulary proven: no decision, no ranking, no score; observed/self-report boundary present';
END $$;