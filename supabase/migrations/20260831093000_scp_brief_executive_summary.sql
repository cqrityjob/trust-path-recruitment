-- The brief opens with a paragraph about THIS person.
--
-- ── WHY ─────────────────────────────────────────────────────────────────
--
-- The brief currently opens with modules and coverage, and a recruiter has to
-- assemble the picture from four sections underneath. The product brief asks
-- for a short participant-specific summary at the top — the thing somebody
-- reads in fifteen seconds before deciding how to spend the next forty
-- minutes.
--
-- It is a paragraph, deliberately: a list of chips is scannable but does not
-- say how the pieces relate, and "strong here, mixed there, and this is what
-- they say about themselves" is a relationship, not three facts.
--
-- ── WHY IT IS GENERATED, AND WHY DETERMINISTICALLY ──────────────────────
--
-- No model runs. The summary is assembled from the arrays the release function
-- already froze, by rules written out below, so two people reading the same
-- evidence get the same paragraph and any sentence in it can be traced to the
-- rows that produced it. That also keeps it inside the vocabulary the product
-- allows: the sentences are built from a fixed set of clauses, none of which
-- can express a recommendation, a total or a comparison with anybody else.
--
-- ── WHY A TRIGGER AND NOT A CHANGE TO THE RELEASE FUNCTION ──────────────
--
-- The summary is a pure function of the brief being written. Adding it inside
-- scp_release_attempt_report would mean re-pasting two hundred lines of a
-- function whose every other line must stay byte-identical — a large diff
-- whose risk is entirely in the parts that were supposed to be unchanged.
--
-- A BEFORE INSERT trigger derives it from the row on its way in, so it is
-- frozen with the snapshot exactly like everything else (the row is immutable
-- the moment it lands) and the release function is untouched. The column
-- comment points here, so the derivation is findable from the data.
--
-- Participant snapshots are deliberately left alone. The executive summary is
-- written for somebody preparing to interview this person; handing it to the
-- person themselves would be handing them a recruiter's working note.
--
-- ── SCOPE ───────────────────────────────────────────────────────────────
--
-- One function, one trigger, one comment. No table, column, policy or existing
-- function is altered. Snapshots already released carry no summary and are
-- never recomputed.
--
-- Remediation: drop the trigger and the function.

-- "a, b och c" / "a, b and c". Small enough to inline and repeated six times
-- above, which is exactly when it stops being worth inlining.
CREATE OR REPLACE FUNCTION public.scp_join_human(_items text[], _lang text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE _n int; _last text;
BEGIN
  IF _items IS NULL OR array_length(_items,1) IS NULL THEN RETURN ''; END IF;
  _n := array_length(_items, 1);
  IF _n = 1 THEN RETURN _items[1]; END IF;
  _last := CASE WHEN _lang = 'en' THEN ' and ' ELSE ' och ' END;
  RETURN array_to_string(_items[1:_n-1], ', ') || _last || _items[_n];
END;
$function$;

REVOKE ALL ON FUNCTION public.scp_join_human(text[], text) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.scp_brief_executive_summary(
  _observed jsonb,
  _self_reported jsonb,
  _lang text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  _sv boolean := (_lang <> 'en');
  _strong text[]; _mixed text[]; _weak text[]; _thin text[];
  _described text[]; _varied text[];
  _parts text[] := ARRAY[]::text[];
  _n int;
BEGIN
  -- The four observed buckets, named in the requested language. Ordered by how
  -- much of the assessment each rests on, so the first area a recruiter reads
  -- is the one with the most behind it rather than the alphabetically luckiest.
  SELECT array_agg(x ORDER BY items DESC, x) INTO _strong FROM (
    SELECT CASE WHEN _sv THEN o->>'area_sv' ELSE o->>'area_en' END AS x,
           (o->>'items')::int AS items
      FROM jsonb_array_elements(coalesce(_observed,'[]'::jsonb)) o
     WHERE o->>'signal' IN ('strong','consistent')) s;

  SELECT array_agg(x ORDER BY items DESC, x) INTO _mixed FROM (
    SELECT CASE WHEN _sv THEN o->>'area_sv' ELSE o->>'area_en' END AS x,
           (o->>'items')::int AS items
      FROM jsonb_array_elements(coalesce(_observed,'[]'::jsonb)) o
     WHERE o->>'signal' = 'mixed') s;

  SELECT array_agg(x ORDER BY items DESC, x) INTO _weak FROM (
    SELECT CASE WHEN _sv THEN o->>'area_sv' ELSE o->>'area_en' END AS x,
           (o->>'items')::int AS items
      FROM jsonb_array_elements(coalesce(_observed,'[]'::jsonb)) o
     WHERE o->>'signal' = 'developing') s;

  SELECT array_agg(x ORDER BY x) INTO _thin FROM (
    SELECT CASE WHEN _sv THEN o->>'area_sv' ELSE o->>'area_en' END AS x
      FROM jsonb_array_elements(coalesce(_observed,'[]'::jsonb)) o
     WHERE o->>'signal' = 'limited') s;

  SELECT array_agg(lower(x) ORDER BY x) INTO _described FROM (
    SELECT CASE WHEN _sv THEN r->>'domain_sv' ELSE r->>'domain_en' END AS x
      FROM jsonb_array_elements(coalesce(_self_reported,'[]'::jsonb)) r
     WHERE r->>'pattern' = 'consistently_described'
       AND r->>'consistency' = 'consistent') s;

  SELECT array_agg(lower(x) ORDER BY x) INTO _varied FROM (
    SELECT CASE WHEN _sv THEN r->>'domain_sv' ELSE r->>'domain_en' END AS x
      FROM jsonb_array_elements(coalesce(_self_reported,'[]'::jsonb)) r
     WHERE r->>'consistency' = 'varied') s;

  -- ── Sentence 1: what was observed, and how strongly ────────────────────
  IF _strong IS NOT NULL THEN
    _n := array_length(_strong, 1);
    _parts := _parts || CASE WHEN _sv
      THEN format('Kandidaten visade sammanhållet observerat underlag inom %s.',
                  public.scp_join_human(_strong[1:least(_n,3)], 'sv'))
      ELSE format('The candidate showed consistent observed evidence in %s.',
                  public.scp_join_human(_strong[1:least(_n,3)], 'en'))
      END;
  ELSE
    _parts := _parts || CASE WHEN _sv
      THEN 'Inget område nådde sammanhållet observerat underlag i den här bedömningen.'
      ELSE 'No area reached consistent observed evidence in this assessment.'
      END;
  END IF;

  -- ── Sentence 2: where it was uneven or weaker ──────────────────────────
  IF _mixed IS NOT NULL THEN
    _parts := _parts || CASE WHEN _sv
      THEN format('Underlaget var mer blandat kring %s, där svaren skilde sig åt mellan jämförbara uppgifter.',
                  public.scp_join_human(_mixed, 'sv'))
      ELSE format('Evidence was more mixed around %s, where answers differed between comparable tasks.',
                  public.scp_join_human(_mixed, 'en'))
      END;
  END IF;
  IF _weak IS NOT NULL THEN
    _parts := _parts || CASE WHEN _sv
      THEN format('Svaren låg genomgående lägre inom %s.', public.scp_join_human(_weak, 'sv'))
      ELSE format('Answers were consistently lower in %s.', public.scp_join_human(_weak, 'en'))
      END;
  END IF;

  -- ── Sentence 3: where there is simply not enough ───────────────────────
  IF _thin IS NOT NULL THEN
    _parts := _parts || CASE WHEN _sv
      THEN format('%s berördes för lite i bedömningen för att säga något, vilket inte ska läsas som en svaghet.',
                  public.scp_join_human(_thin, 'sv'))
      ELSE format('%s %s touched too little by the assessment to say anything, which should not be read as a weakness.',
                  public.scp_join_human(_thin, 'en'),
                  CASE WHEN array_length(_thin,1) = 1 THEN 'was' ELSE 'were' END)
      END;
  END IF;

  -- ── Sentence 4: what they said about themselves, kept apart ────────────
  IF _described IS NOT NULL THEN
    _parts := _parts || CASE WHEN _sv
      THEN format('Självrapporterade svar beskriver ett genomgående arbetssätt kring %s.',
                  public.scp_join_human(_described[1:least(array_length(_described,1),3)], 'sv'))
      ELSE format('Self-reported answers describe a consistent way of working around %s.',
                  public.scp_join_human(_described[1:least(array_length(_described,1),3)], 'en'))
      END;
  END IF;
  IF _varied IS NOT NULL THEN
    _parts := _parts || CASE WHEN _sv
      THEN format('Svaren varierade mellan närliggande frågor om %s — värt att utforska i intervju.',
                  public.scp_join_human(_varied, 'sv'))
      ELSE format('Answers varied across related questions about %s — worth exploring in interview.',
                  public.scp_join_human(_varied, 'en'))
      END;
  END IF;

  -- The boundary, every time, in the paragraph itself rather than only in a
  -- panel further down the page.
  _parts := _parts || CASE WHEN _sv
    THEN 'Underlaget kommer från ett bedömningstillfälle och är beslutsstöd inför intervju, inte ett anställningsbeslut.'
    ELSE 'This rests on one assessment occasion and is decision support ahead of an interview, not an employment decision.'
    END;

  RETURN array_to_string(_parts, ' ');
END;
$function$;

REVOKE ALL ON FUNCTION public.scp_brief_executive_summary(jsonb, jsonb, text) FROM PUBLIC, anon;

-- ═══════════════════════════════════════════════════════════════════════════
-- Derived on the way in, frozen like everything else on the row
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.scp_add_brief_executive_summary()
RETURNS trigger LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.audience <> 'employer' OR NEW.brief IS NULL THEN RETURN NEW; END IF;
  IF NEW.brief ? 'executive_summary' THEN RETURN NEW; END IF;

  NEW.brief := NEW.brief || jsonb_build_object(
    'executive_summary', jsonb_build_object(
      'sv', public.scp_brief_executive_summary(
              NEW.brief->'observed', NEW.brief->'self_reported', 'sv'),
      'en', public.scp_brief_executive_summary(
              NEW.brief->'observed', NEW.brief->'self_reported', 'en')));
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS scp_report_snapshots_executive_summary ON public.scp_report_snapshots;
-- BEFORE the immutability trigger has anything to object to: that one fires on
-- UPDATE and DELETE, and this only ever touches the row being inserted.
CREATE TRIGGER scp_report_snapshots_executive_summary
  BEFORE INSERT ON public.scp_report_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.scp_add_brief_executive_summary();

COMMENT ON COLUMN public.scp_report_snapshots.brief IS
  'The audience-appropriate brief, frozen at release. The employer brief '
  'carries an executive summary (derived on insert by '
  'scp_add_brief_executive_summary), observed signals, self-reported patterns, '
  'strengths, development areas and the structured interview guide; the '
  'participant brief carries the modules they completed and what they said '
  'about their own way of working. NEITHER carries a recommendation, a total or '
  'a ranking. NULL on rows released before this existed; never recomputed.';

-- ═══════════════════════════════════════════════════════════════════════════
-- Proof: the summary cannot say the things the product refuses to say
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE _s text; _bad text;
BEGIN
  _s := public.scp_brief_executive_summary(
    '[{"area_sv":"Kommunikation","area_en":"Communication","signal":"strong","items":6},
      {"area_sv":"Professionellt omdöme","area_en":"Professional judgement","signal":"mixed","items":3},
      {"area_sv":"Samarbete","area_en":"Teamwork","signal":"limited","items":1}]'::jsonb,
    '[{"domain_sv":"Genomförandedisciplin","domain_en":"Execution discipline","pattern":"rarely_described","consistency":"varied"},
      {"domain_sv":"Aktiv scanning","domain_en":"Active scanning","pattern":"consistently_described","consistency":"consistent"}]'::jsonb,
    'en');

  IF _s IS NULL OR length(_s) < 80 THEN
    RAISE EXCEPTION 'SCP_SUMMARY_EMPTY: the executive summary produced nothing '
      'useful from a populated brief.';
  END IF;

  FOREACH _bad IN ARRAY ARRAY[
    'suitab','unsuitab','recommend','hire','reject','rank','percentile',
    'overall score','total score','personality','pass','fail'
  ] LOOP
    IF lower(_s) LIKE '%' || _bad || '%' THEN
      RAISE EXCEPTION
        'SCP_SUMMARY_VOCABULARY: the executive summary contains "%". It is '
        'decision support, never a decision. Produced: %', _bad, _s;
    END IF;
  END LOOP;

  -- The self-report boundary has to survive into the prose, not only the
  -- sections: a summary that said "the candidate is thorough" when the person
  -- merely SAID so would undo the whole separation in one sentence.
  IF position('Self-reported' in _s) = 0 THEN
    RAISE EXCEPTION
      'SCP_SUMMARY_COLLAPSES_EVIDENCE: the summary describes self-reported '
      'behaviour without labelling it. Produced: %', _s;
  END IF;

  RAISE NOTICE 'executive summary proven (en): %', _s;

  _s := public.scp_brief_executive_summary(
    '[{"area_sv":"Kommunikation","area_en":"Communication","signal":"strong","items":6}]'::jsonb,
    '[]'::jsonb, 'sv');
  IF position('Självrapporterade' in _s) > 0 THEN
    RAISE EXCEPTION 'SCP_SUMMARY_INVENTS: a brief with no self-report produced a '
      'self-report sentence.';
  END IF;
  RAISE NOTICE 'executive summary proven (sv, no self-report): %', _s;
END $$;
