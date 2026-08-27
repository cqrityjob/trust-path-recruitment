-- CQrity Interview Intelligence — integrity hardening.
--
-- Three claims the product makes about itself, tested as negatives:
--
--   1. RESEARCH. A claim cannot assert more than its source supports, and an
--      unread source cannot end up behind an approved product implication.
--   2. GRAPH. Every edge carries an assurance level, an edge cannot be
--      "verified" from an unread source, and a provisional competency mapping
--      cannot be dressed up as a confirmed scientific equivalence.
--   3. PILOT. A pilot grant is a time-boxed, environment-scoped, optionally
--      cohort-limited authorisation — not a back door around publication
--      review.
--
-- Everything rolls back.

\set ON_ERROR_STOP on
BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT cond THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.must_fail(stmt text, needle text, label text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE _msg text;
BEGIN
  BEGIN EXECUTE stmt;
  EXCEPTION WHEN OTHERS THEN
    _msg := SQLERRM;
    IF position(needle in _msg) = 0 THEN
      RAISE EXCEPTION 'ASSERTION FAILED: % — expected "%", got "%"', label, needle, _msg;
    END IF;
    RAISE NOTICE 'ok  %', label; RETURN;
  END;
  RAISE EXCEPTION 'ASSERTION FAILED: % — statement unexpectedly SUCCEEDED', label;
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP I1 — research cannot outrun its sources'; END $$;
-- ===========================================================================

DO $$
DECLARE _unread uuid; _read uuid; _claim uuid; _n integer;
BEGIN
  SELECT id INTO _unread FROM public.scp_research_sources
   WHERE access_status <> 'verified_read' ORDER BY slug LIMIT 1;
  SELECT id INTO _read FROM public.scp_research_sources
   WHERE access_status = 'verified_read' ORDER BY slug LIMIT 1;

  PERFORM pg_temp.ok(_unread IS NOT NULL AND _read IS NOT NULL,
    'I1.0 the registry distinguishes read from unread sources');

  -- The whole point of the review finding: a source nobody has actually opened
  -- cannot back a strong claim.
  PERFORM pg_temp.must_fail(format($q$
    INSERT INTO public.scp_research_claims
      (source_id, slug, claim_summary, supported_use, unsupported_use, limitations,
       evidence_strength, status)
    VALUES (%L, 'i1-overstated',
            'Strukturerade intervjuer förutsäger arbetsprestation.',
            'Underlag för metodval.', 'Ingen rangordning av kandidater.',
            'Källan är inte läst.', 'strong', 'draft')$q$, _unread),
    'SCP_RESEARCH_CLAIM_AHEAD_OF_SOURCE',
    'I1.1 an unread source cannot back a "strong" claim');

  -- It CAN carry an honest placeholder.
  INSERT INTO public.scp_research_claims
    (source_id, slug, claim_summary, supported_use, unsupported_use, limitations,
     evidence_strength, status)
  VALUES (_unread, 'i1-honest', 'Påstående som väntar på källkontroll.',
          'Inget ännu.', 'Inget alls.', 'Källan är inte läst.',
          'pending_source_verification', 'draft')
  RETURNING id INTO _claim;
  PERFORM pg_temp.ok(_claim IS NOT NULL,
    'I1.2 the same source CAN carry a pending_source_verification placeholder');

  -- And that placeholder cannot be approved.
  PERFORM pg_temp.must_fail(
    format('UPDATE public.scp_research_claims SET status = %L WHERE id = %L',
           'approved', _claim),
    'SCP_RESEARCH_CLAIM_APPROVAL_BLOCKED',
    'I1.3 a claim from an unread source cannot be approved');

  -- Nor can a product implication built on it.
  PERFORM pg_temp.must_fail(format($q$
    INSERT INTO public.scp_research_implications
      (claim_id, permits, does_not_justify, required_human_safeguard,
       statement_kind, approval_status, approved_at)
    VALUES (%L, 'Fasta kärnfrågor.', 'Ingen poängsättning.',
            'Rekryteraren bekräftar varje evidens.',
            'product_design_decision', 'approved', now())$q$, _claim),
    'SCP_RESEARCH_IMPLICATION_AHEAD_OF_CLAIM',
    'I1.4 an approved implication cannot rest on an unapproved claim');

  -- The corrected state of the registry itself, not just the rules.
  PERFORM pg_temp.ok(
    (SELECT evidence_strength FROM public.scp_research_claims
      WHERE slug = 'claim-structured-same-questions') = 'pending_source_verification',
    'I1.5 the claim flagged in review is downgraded, not quietly left strong');

  SELECT count(*) INTO _n
    FROM public.scp_research_claims c JOIN public.scp_research_sources s ON s.id = c.source_id
   WHERE s.access_status <> 'verified_read'
     AND c.evidence_strength NOT IN ('pending_source_verification', 'insufficient');
  PERFORM pg_temp.ok(_n = 0, 'I1.6 no claim anywhere outruns its source');
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP I2 — the graph states its own assurance'; END $$;
-- ===========================================================================

DO $$
DECLARE _edge uuid; _n integer; _total integer;
BEGIN
  -- PLATFORM knowledge only. Running a real interview adds case-scoped edges
  -- carrying an employer_id, so counting the whole table would make this
  -- assertion drift with test data rather than with the knowledge base.
  SELECT count(*) INTO _total FROM public.scp_intel_edges WHERE employer_id IS NULL;
  PERFORM pg_temp.ok(_total = 271,
    format('I2.0 the knowledge graph holds its 271 declared edges (found %s)', _total));

  -- Every prohibition binds every AI task. An unwired prohibition is not a
  -- neutral gap: read from the engine's side it is permission.
  SELECT count(*) INTO _n FROM public.scp_intel_edges WHERE relation = 'restricts';
  PERFORM pg_temp.ok(
    _n = (SELECT count(*) FROM public.scp_interview_prohibited_areas)
       * (SELECT count(*) FROM public.scp_ai_tasks),
    format('I2.0b prohibition coverage is complete (%s restricts edges)', _n));

  PERFORM pg_temp.must_fail(
    'DELETE FROM public.scp_intel_edges WHERE relation = ''restricts''',
    'SCP_INTEL_PROHIBITION_COVERAGE',
    'I2.0c a prohibition cannot be silently removed — narrowing must be superseded, not deleted');

  SELECT count(*) INTO _n FROM public.scp_intel_edges WHERE assurance IS NULL;
  PERFORM pg_temp.ok(_n = 0, 'I2.1 every edge carries an explicit assurance level');

  -- An edge that touches an unread claim cannot present itself as verified.
  SELECT e.id INTO _edge
    FROM public.scp_intel_edges e
    JOIN public.scp_research_claims c ON e.to_kind = 'research_claim' AND e.to_id = c.id
    JOIN public.scp_research_sources s ON s.id = c.source_id
   WHERE s.access_status <> 'verified_read' LIMIT 1;

  IF _edge IS NOT NULL THEN
    PERFORM pg_temp.must_fail(
      format('UPDATE public.scp_intel_edges SET assurance = %L WHERE id = %L', 'source_read', _edge),
      'SCP_INTEL_EDGE_ASSURANCE',
      'I2.2 an edge into an unread research claim cannot claim its source was read');
  ELSE
    RAISE NOTICE 'ok  I2.2 (vacuous: no edge currently points at an unread claim)';
  END IF;

  -- The "invented equivalence" guard: a provisional competency mapping cannot
  -- be promoted by editing the edge instead of the mapping.
  SELECT id INTO _edge FROM public.scp_intel_edges
   WHERE relation = 'maps_to' AND from_kind = 'interview_competency' LIMIT 1;
  PERFORM pg_temp.ok(_edge IS NOT NULL, 'I2.3 competency mappings are represented as edges');
  PERFORM pg_temp.must_fail(
    format('UPDATE public.scp_intel_edges SET assurance = %L WHERE id = %L', 'expert_reviewed', _edge),
    'SCP_INTEL_MAPPING_ASSURANCE',
    'I2.4 a provisional mapping cannot be upgraded from the edge side');

  -- "verified" meant two different things -- a foreign key restated, and a
  -- research finding confirmed -- and an admin screen reading "verified: 228"
  -- invited exactly the conclusion the research registry exists to prevent.
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM public.scp_intel_edges WHERE assurance = 'verified'),
    'I2.4a no edge uses the ambiguous "verified" any more');

  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM public.scp_intel_edges
                 WHERE assurance IN ('source_verified', 'expert_reviewed')),
    'I2.4b nothing claims independent verification, because none has taken place');

  SELECT count(*) INTO _n FROM public.scp_intel_edges
   WHERE assurance = 'structurally_derived' AND relation NOT IN ('addresses', 'implements', 'restricts');
  PERFORM pg_temp.ok(_n = 0,
    format('I2.4c only structural relations are labelled structurally_derived (%s strays)', _n));

  -- No numeric edge property has appeared. A weight is how a graph starts
  -- computing verdicts.
  SELECT count(*) INTO _n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'scp_intel_edges'
     AND (column_name LIKE '%weight%' OR column_name LIKE '%score%' OR column_name LIKE '%strength%');
  PERFORM pg_temp.ok(_n = 0, 'I2.5 the graph still has no weight, score or strength column');

  -- Nor a candidate node kind: the graph is about roles and knowledge, never
  -- about people.
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM public.scp_intel_edges
                 WHERE from_kind LIKE '%candidate%' OR to_kind LIKE '%candidate%'),
    'I2.6 no edge has a candidate at either end');
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP I3 — a pilot grant is a boundary, not a bypass'; END $$;
-- ===========================================================================

INSERT INTO auth.users (id, email) VALUES
  ('44440000-0000-0000-0000-0000000000a1', 'pilot-owner@test.local'),
  ('44440000-0000-0000-0000-0000000000a2', 'pilot-cohort@test.local'),
  ('44440000-0000-0000-0000-0000000000a3', 'pilot-outside@test.local')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employers (id, name, slug, status) VALUES
  ('55550000-0000-0000-0000-00000000000a', 'Pilot AB', 'pilot-ab-iv', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.employer_memberships (user_id, employer_id, role, status) VALUES
  ('44440000-0000-0000-0000-0000000000a1','55550000-0000-0000-0000-00000000000a','owner','active'),
  ('44440000-0000-0000-0000-0000000000a2','55550000-0000-0000-0000-00000000000a','member','active'),
  ('44440000-0000-0000-0000-0000000000a3','55550000-0000-0000-0000-00000000000a','member','active')
ON CONFLICT DO NOTHING;

DO $$
DECLARE
  _packv uuid; _grant uuid; _emp uuid := '55550000-0000-0000-0000-00000000000a';
  _owner uuid := '44440000-0000-0000-0000-0000000000a1';
  _inside uuid := '44440000-0000-0000-0000-0000000000a2';
  _outside uuid := '44440000-0000-0000-0000-0000000000a3';
  _status text; _label text; _n integer;
BEGIN
  SELECT ver.id INTO _packv FROM public.scp_interview_pack_versions ver
    JOIN public.scp_interview_packs p ON p.id = ver.pack_id WHERE p.slug = 'vaktare-se';

  -- ---- no grant at all --------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_create_case(%L, %L, %L, %L, NULL, %L)', _emp, 'x', _packv, 'K', 'EXT-NEG'),
    'SCP_IV_PACK_NOT_USABLE',
    'I3.1 an ordinary employer cannot reach unpublished content');
  RESET ROLE;

  -- ---- a grant that has expired ------------------------------------------
  INSERT INTO public.scp_interview_pack_pilot_grants
    (employer_id, pack_version_id, rationale, usage_mode, environment, starts_on, expires_on)
  VALUES (_emp, _packv, 'Utgången pilot.', 'employer_pilot', 'development',
          current_date - 60, current_date - 1)
  RETURNING id INTO _grant;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_create_case(%L, %L, %L, %L, NULL, %L)', _emp, 'x', _packv, 'K', 'EXT-NEG'),
    'SCP_IV_PACK_NOT_USABLE',
    'I3.2 an EXPIRED grant authorises nothing — it lapses without anyone revoking it');
  RESET ROLE;

  -- ---- a grant that has not started yet -----------------------------------
  UPDATE public.scp_interview_pack_pilot_grants
     SET starts_on = current_date + 5, expires_on = current_date + 40 WHERE id = _grant;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_create_case(%L, %L, %L, %L, NULL, %L)', _emp, 'x', _packv, 'K', 'EXT-NEG'),
    'SCP_IV_PACK_NOT_USABLE',
    'I3.3 a grant that has not started yet authorises nothing either');
  RESET ROLE;

  -- ---- in window, cohort-limited -----------------------------------------
  UPDATE public.scp_interview_pack_pilot_grants
     SET starts_on = current_date - 1, expires_on = current_date + 30,
         cohort_user_ids = ARRAY[_inside]
   WHERE id = _grant;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _outside::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_create_case(%L, %L, %L, %L, NULL, %L)', _emp, 'x', _packv, 'K', 'EXT-NEG'),
    'SCP_IV_PACK_NOT_USABLE',
    'I3.4 a colleague OUTSIDE the cohort allowlist is refused, same employer or not');
  RESET ROLE;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _inside::text, true);
  PERFORM pg_temp.ok(
    public.scp_iv_create_case(_emp, 'Pilotfall', _packv, 'K.', NULL, 'EXT-PILOT-1') IS NOT NULL,
    'I3.5 the named cohort member CAN run the pilot');
  RESET ROLE;

  -- ---- and the grant changed nothing about the pack ----------------------
  SELECT content_status, validation_label INTO _status, _label
    FROM public.scp_interview_pack_versions WHERE id = _packv;
  PERFORM pg_temp.ok(_status = 'draft',
    'I3.6 the pack is STILL a draft — a pilot grant does not publish anything');
  PERFORM pg_temp.ok(_label = 'pilot_hypothesis',
    'I3.7 and still labelled a pilot hypothesis — no validation claim was created');

  SELECT count(*) INTO _n FROM public.scp_interview_pack_reviews
   WHERE pack_version_id = _packv AND decision = 'approved';
  PERFORM pg_temp.ok(_n = 0,
    'I3.8 no review gate was satisfied by granting the pilot');

  -- ---- revocation must name a person and a reason -------------------------
  PERFORM pg_temp.must_fail(
    format('UPDATE public.scp_interview_pack_pilot_grants SET revoked_at = now() WHERE id = %L', _grant),
    'scp_interview_pilot_revocation_check',
    'I3.9 revoking without a stated reason is refused');

  UPDATE public.scp_interview_pack_pilot_grants
     SET revoked_at = now(), revoked_by = _owner, revocation_reason = 'Piloten avslutad.'
   WHERE id = _grant;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _inside::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_create_case(%L, %L, %L, %L, NULL, %L)', _emp, 'x', _packv, 'K', 'EXT-NEG'),
    'SCP_IV_PACK_NOT_USABLE',
    'I3.10 after revocation the same cohort member is refused');
  RESET ROLE;

  -- ---- a production pilot needs the expert and legal gates ---------------
  PERFORM pg_temp.must_fail(format($q$
    INSERT INTO public.scp_interview_pack_pilot_grants
      (employer_id, pack_version_id, rationale, environment, expires_on)
    VALUES (%L, %L, 'Skarp pilot.', 'production', current_date + 30)$q$, _emp, _packv),
    'SCP_INTERVIEW_PILOT_PRODUCTION_BLOCKED',
    'I3.11 a PRODUCTION pilot on unpublished content requires expert + legal approval first');

  -- ---- and every grant is audited ----------------------------------------
  SELECT count(*) INTO _n FROM public.scp_interview_pack_events
   WHERE pack_version_id = _packv AND metadata ? 'pilot_grant';
  PERFORM pg_temp.ok(_n >= 2,
    format('I3.12 grant and revocation both emitted audit events (%s)', _n));

  -- ---- a grant can never be open-ended -----------------------------------
  PERFORM pg_temp.must_fail(format($q$
    INSERT INTO public.scp_interview_pack_pilot_grants
      (employer_id, pack_version_id, rationale, expires_on, starts_on)
    VALUES (%L, %L, 'Evig pilot.', current_date, current_date)$q$, _emp, _packv),
    'scp_interview_pilot_window_check',
    'I3.13 a zero-length or backwards pilot window is refused');
END $$;

-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP I4 — the product does not offer what it will refuse'; END $$;
-- ===========================================================================
--
-- Found by walking the journey in a browser rather than by reading the schema:
-- the report screen showed a green "nothing blocks the report" panel and a
-- Finalise button while the case was still in evidence_review, and the click
-- came back as a raw SCP_IV_ILLEGAL_TRANSITION in a Swedish interface. The
-- blocker list checked the content preconditions and left the state
-- precondition to the transition guard, so neither knew the whole answer.

DO $$
DECLARE
  _packv uuid; _case uuid; _emp uuid := '55550000-0000-0000-0000-00000000000a';
  _inside uuid := '44440000-0000-0000-0000-0000000000a2';
  _codes text[];
BEGIN
  SELECT ver.id INTO _packv FROM public.scp_interview_pack_versions ver
    JOIN public.scp_interview_packs p ON p.id = ver.pack_id WHERE p.slug = 'vaktare-se';

  -- Re-open the grant I3 revoked. One grant per employer per pack version, so
  -- this is an update rather than a second row -- which is itself the model
  -- working: an employer cannot accumulate overlapping entitlements.
  UPDATE public.scp_interview_pack_pilot_grants
     SET revoked_at = NULL, revoked_by = NULL, revocation_reason = NULL,
         usage_mode = 'synthetic_test', starts_on = current_date - 1,
         expires_on = current_date + 7, cohort_user_ids = '{}'
   WHERE employer_id = _emp AND pack_version_id = _packv;

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _inside::text, true);
  _case := public.scp_iv_create_case(_emp, 'Rapportsparr', _packv, 'K.', NULL, 'EXT-BLOCK');

  SELECT array_agg(code) INTO _codes FROM public.scp_iv_report_blockers(_case);
  RESET ROLE;

  PERFORM pg_temp.ok('ASSESSMENT_NOT_COMPLETE' = ANY (_codes),
    'I4.1 a case that has not been assessed is BLOCKED from reporting, in the blocker list');

  PERFORM pg_temp.ok(
    (SELECT count(*) FROM public.scp_iv_report_blockers(_case)
      WHERE code = 'ASSESSMENT_NOT_COMPLETE'
        AND message NOT LIKE 'SCP_%' AND message LIKE '%Klar med bedömningen%') = 1,
    'I4.2 and told in the user''s language, naming the step to take — not as an internal error code');

  PERFORM pg_temp.ok('QUESTION_NOT_ASSESSED' = ANY (_codes),
    'I4.3 the content preconditions are still checked alongside it');
END $$;

-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP I5 — privacy controls that run, not ones declared'; END $$;
-- ===========================================================================
--
-- Three controls were in the schema and in nothing else: the transcript gate
-- claimed to check information obligations while reading one lawful-basis
-- field, retain_until was declared and referenced nowhere, and
-- retention_state='erased' / erased_at / the source_erased event had no
-- function that could reach them -- a source could not be erased at all.

DO $$
DECLARE
  _packv uuid; _case uuid; _src uuid; _emp uuid := '55550000-0000-0000-0000-00000000000a';
  _owner uuid := '44440000-0000-0000-0000-0000000000a1';
  _member uuid := '44440000-0000-0000-0000-0000000000a2';
  _n integer; _txt text;
BEGIN
  SELECT ver.id INTO _packv FROM public.scp_interview_pack_versions ver
    JOIN public.scp_interview_packs p ON p.id = ver.pack_id WHERE p.slug = 'vaktare-se';

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  _case := public.scp_iv_create_case(_emp, 'Integritet', _packv, 'K.', NULL, 'EXT-PRIV');
  _src := public.scp_iv_add_source(_case, 'candidate_cv', 'CV',
    E'Vaktare 2020-2025.\n\nVU1 och VU2.', 'recruitment_interview', 'Kandidatens ansokan.');
  RESET ROLE;

  -- ---- transcripts are off, and that is a deployment decision -------------
  PERFORM pg_temp.ok(
    (SELECT transcript_enabled FROM public.scp_interview_ai_config) = false,
    'I5.1 transcript ingestion ships switched off');

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_add_source(%L, %L, %L, %L, %L, %L)',
           _case, 'transcript', 'Utskrift', 'Nagon text.', 'recruitment_interview', 'Grund.'),
    'SCP_IV_TRANSCRIPT_DISABLED',
    'I5.2 a transcript cannot be added while the deployment flag is off');

  -- ---- all four confirmations are required, separately --------------------
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_confirm_transcript_basis(%L, %L)', _case, '   '),
    'SCP_IV_TRANSCRIPT_STATEMENT_REQUIRED',
    'I5.3 an empty lawful-basis statement is refused');

  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_confirm_transcript_basis(%L, %L)', _case, 'Berattigat intresse.'),
    'SCP_IV_TRANSCRIPT_CANDIDATE_NOT_INFORMED',
    'I5.4 a lawful basis alone is NOT enough — informing the candidate is a separate confirmation');

  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_confirm_transcript_basis(%L, %L, %L)',
           _case, 'Berattigat intresse.', 'Kandidaten informerades muntligt och skriftligt.'),
    'SCP_IV_TRANSCRIPT_PURPOSE_REQUIRED',
    'I5.5 the permitted purpose must be named');

  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_confirm_transcript_basis(%L, %L, %L, %L)',
           _case, 'Berattigat intresse.', 'Kandidaten informerades.', 'recruitment_interview'),
    'SCP_IV_TRANSCRIPT_RETENTION_REQUIRED',
    'I5.6 a retention date must be set — an open-ended period is keeping it forever');

  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_confirm_transcript_basis(%L, %L, %L, %L, %L)',
           _case, 'Berattigat intresse.', 'Kandidaten informerades.', 'recruitment_interview',
           (current_date - 1)::text),
    'SCP_IV_TRANSCRIPT_RETENTION_IN_PAST',
    'I5.7 a retention date already past is refused');
  RESET ROLE;

  -- ---- and only an owner or admin may confirm -----------------------------
  UPDATE public.employer_memberships SET role = 'member'
   WHERE user_id = _member AND employer_id = _emp;
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _member::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_confirm_transcript_basis(%L, %L, %L, %L, %L)',
           _case, 'Grund.', 'Informerad.', 'recruitment_interview', (current_date + 30)::text),
    'SCP_IV_TRANSCRIPT_CONFIRM_ROLE',
    'I5.8 an ordinary member cannot confirm a lawful basis');
  RESET ROLE;

  -- ---- the weak two-argument gate is GONE, not merely superseded ----------
  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.proname = 'scp_iv_confirm_transcript_basis'
                   AND p.pronargs = 2),
    'I5.9 the old two-argument confirmation is dropped, so the weaker gate is unreachable');

  -- ---- erasure exists and actually removes the text -----------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _owner::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_erase_source(%L, %L)', _src, '  '),
    'SCP_IV_ERASE_REASON_REQUIRED',
    'I5.10 erasing without a stated reason is refused');
  PERFORM public.scp_iv_erase_source(_src, 'Kandidaten begarde radering.');
  RESET ROLE;

  SELECT content_text INTO _txt FROM public.scp_interview_case_sources WHERE id = _src;
  PERFORM pg_temp.ok(_txt = '', 'I5.11 the source text is actually gone, not flagged');

  PERFORM pg_temp.ok(
    (SELECT retention_state FROM public.scp_interview_case_sources WHERE id = _src) = 'erased',
    'I5.12 the source records that it was erased, so the trail still shows it existed');

  SELECT count(*) INTO _n FROM public.scp_interview_source_passages
   WHERE source_id = _src AND content <> '';
  PERFORM pg_temp.ok(_n = 0, 'I5.13 every passage split from it is cleared too');

  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM public.scp_interview_case_events
             WHERE case_id = _case AND event = 'source_erased'),
    'I5.14 the erasure is in the ledger — previously this event was unreachable');

  -- ---- a member cannot erase ---------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', _member::text, true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_erase_source(%L, %L)', _src, 'Vill radera.'),
    'SCP_IV_ERASE_ROLE',
    'I5.15 an ordinary member cannot erase candidate material');
  RESET ROLE;
END $$;

-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP I6 — process quality is not a candidate score in disguise'; END $$;
-- ===========================================================================
--
-- The dangerous version of this product is one that measures the INTERVIEW,
-- calls the result "quality", and lets a recruiter read it as a measure of the
-- CANDIDATE. Every guard here is about that one confusion.

DO $$
DECLARE _def text; _n integer; _cols text[];
BEGIN
  _def := pg_get_viewdef('public.scp_interview_process_quality'::regclass);

  -- The single most important one. The per-question level (0-4) is a human
  -- judgement about evidence for one competency. Averaging, summing or
  -- maximising it across questions manufactures an overall candidate score,
  -- which is the thing this product exists to not produce.
  PERFORM pg_temp.ok(
    _def !~* '(avg|sum|max|min)\s*\([^)]*level',
    'I6.1 the process-quality view never aggregates the assessment level');

  PERFORM pg_temp.ok(
    _def !~* '(avg|sum)\s*\([^)]*(confidence|extraction_confidence)',
    'I6.2 nor does it average extraction confidence into a headline number');

  -- Every column must describe the PROCESS. A column named for the candidate's
  -- fitness is a score whatever its formula.
  SELECT array_agg(column_name) INTO _cols
    FROM information_schema.columns
   WHERE table_name = 'scp_interview_process_quality'
     AND column_name ~* 'fit|suitab|rank|overall|score|grade|rating|pass|fail|recommend|candidate_quality';
  PERFORM pg_temp.ok(_cols IS NULL,
    format('I6.3 no process-quality column is named for candidate fitness (%s)',
           coalesce(array_to_string(_cols, ', '), 'none')));

  -- And no such column anywhere in the domain, view or table.
  SELECT count(*) INTO _n
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name LIKE 'scp_interview%'
     AND column_name ~* 'candidate_score|overall_score|total_score|fit_score|suitability|ranking|pass_fail|hire_recommend';
  PERFORM pg_temp.ok(_n = 0,
    format('I6.4 no table or view in the domain carries a candidate score column (%s)', _n));

  -- The count of level-0 answers is a process measure -- how much of the
  -- interview produced usable evidence -- and must not be reachable as a
  -- penalty. It is a count, not a rate, and there is nothing to divide it by.
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'scp_interview_process_quality'
               AND column_name = 'insufficient_evidence_count'),
    'I6.5 level-0 is surfaced as a COUNT of insufficient evidence, not a score');

  PERFORM pg_temp.ok(
    _def !~* 'insufficient_evidence[a-z_]*\s*(/|::numeric\s*/)',
    'I6.6 and it is never divided into a rate, which is a score with a percent sign');

  -- The report itself carries no aggregate.
  SELECT count(*) INTO _n
    FROM public.scp_interview_reports r,
         LATERAL jsonb_each(r.payload) e
   WHERE e.key ~* 'score|total|overall|rank|fit|recommend';
  PERFORM pg_temp.ok(_n = 0,
    format('I6.7 no finalised report payload has a top-level score-like key (%s)', _n));
END $$;

-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP I7 — the Career Discovery firewall'; END $$;
-- ===========================================================================
--
-- Career Discovery is candidate ORIENTATION. The candidate answered it
-- believing it was for them, it was not produced under an employer's lawful
-- basis, and a recommended profession appearing in a preparation brief would
-- turn a self-exploration tool into a screening instrument retroactively.
--
-- The boundary held by ABSENCE before this -- nobody had written the join that
-- would break it -- and absence is not a control.

DO $$
DECLARE _case uuid; _n integer;
BEGIN
  SELECT id INTO _case FROM public.scp_interview_cases
   WHERE employer_id = '55550000-0000-0000-0000-00000000000a' ORDER BY created_at LIMIT 1;

  -- Structural: nothing in the domain can reach a Career Discovery table.
  SELECT count(*) INTO _n
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_class f ON f.oid = c.confrelid
   WHERE c.contype = 'f' AND t.relname LIKE 'scp_interview%' AND f.relname LIKE 'cd\_%';
  PERFORM pg_temp.ok(_n = 0,
    format('I7.1 no interview table has a foreign key into Career Discovery (%s)', _n));

  SELECT count(*) INTO _n
    FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
   WHERE ns.nspname = 'public' AND p.proname LIKE 'scp_iv\_%'
     AND p.prosrc ~ '\ycd_(sessions|report_snapshots|shared_reports|professions|evidence)\y';
  PERFORM pg_temp.ok(_n = 0,
    format('I7.2 no runtime function reads a Career Discovery table (%s)', _n));

  -- Content: a Career Card cannot be entered as source material, whatever it
  -- is labelled. Publishing one publicly does not make it recruitment evidence.
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '44440000-0000-0000-0000-0000000000a2', true);
  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_add_source(%L, %L, %L, %L, %L, %L)',
           _case, 'application_answers', 'Career Card',
           'Career Discovery-rapport: rekommenderad yrkesroll ordningsvakt.',
           'recruitment_interview', 'Kandidaten delade sitt Career Card publikt.'),
    'SCP_IV_CAREER_DISCOVERY_EXCLUDED',
    'I7.3 a shared Career Card cannot be entered as interview source material');

  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_add_source(%L, %L, %L, %L, %L, %L)',
           _case, 'candidate_cv', 'CV',
           'Erfaren vaktare. Career Discovery result: hog matchning mot larmoperator.',
           'recruitment_interview', 'Ansokan.'),
    'SCP_IV_CAREER_DISCOVERY_EXCLUDED',
    'I7.4 nor smuggled inside an otherwise ordinary CV');
  RESET ROLE;
END $$;


-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP I8 — Passport disclosure is the only door'; END $$;
-- ===========================================================================

DO $$
DECLARE
  _case uuid; _app uuid; _holder uuid := '44440000-0000-0000-0000-0000000000a3';
  _live uuid; _expired uuid; _revoked uuid; _other uuid;
BEGIN
  SELECT id, application_id INTO _case, _app FROM public.scp_interview_cases
   WHERE employer_id = '55550000-0000-0000-0000-00000000000a' ORDER BY created_at LIMIT 1;

  -- The cases above were created without an application, which is legitimate
  -- (an interview need not come from an advert) but leaves nothing for a
  -- disclosure to be scoped to. Build the real chain: job -> application ->
  -- case. The job is inserted as a draft and then published without naming
  -- published_at, because published_at is moderation-owned and the trigger
  -- stamps it for any caller that does not try to set it.
  INSERT INTO public.jobs (id, employer_id, slug, short_id, application_method, title_sv, status)
  VALUES ('55550000-0000-0000-0000-0000000000d1', '55550000-0000-0000-0000-00000000000a',
          'integrity-test-job', 'ITJ001', 'internal', 'Vaktare', 'draft')
  ON CONFLICT (id) DO NOTHING;
  UPDATE public.jobs SET status = 'published', expires_at = now() + interval '30 days'
   WHERE id = '55550000-0000-0000-0000-0000000000d1';

  INSERT INTO public.job_applications (id, job_id, applicant_user_id, consent_given_at, status)
  VALUES ('55550000-0000-0000-0000-0000000000e1', '55550000-0000-0000-0000-0000000000d1',
          _holder, now(), 'reviewing')
  ON CONFLICT (id) DO NOTHING;
  _app := '55550000-0000-0000-0000-0000000000e1';

  UPDATE public.scp_interview_cases
     SET application_id = _app, job_id = '55550000-0000-0000-0000-0000000000d1'
   WHERE id = _case;

  -- Passport allows ONE live disclosure per application, so this walks a single
  -- disclosure through its states rather than creating three at once. That is
  -- closer to what actually happens to a candidate's consent anyway: it is
  -- granted, it is used, and then it lapses or is withdrawn.
  --
  -- The table's own rule: an application-scoped disclosure carries no token (it
  -- is reached through the application, not a shareable link).
  INSERT INTO public.sp_disclosures (holder_user_id, package_code, purpose, application_id, expires_at)
  VALUES (_holder, 'verified_qualifications', 'recruitment', _app, now() + interval '30 days')
  RETURNING id INTO _live;

  -- A disclosure for a DIFFERENT application: link-scoped, so it needs a token
  -- and no application of its own.
  INSERT INTO public.sp_disclosures (holder_user_id, package_code, token_hash, purpose, expires_at)
  VALUES (_holder, 'public_card', 'hash-other', 'recruitment', now() + interval '30 days')
  RETURNING id INTO _other;

  -- ---- with no disclosure at all -----------------------------------------
  PERFORM pg_temp.must_fail(format($q$
    INSERT INTO public.scp_interview_case_sources
      (case_id, source_kind, label, content_text, purpose_code, lawful_basis_note)
    VALUES (%L, 'passport_disclosure', 'Passport', 'VU1 verifierad.', 'recruitment_interview', 'x')$q$,
    _case),
    'SCP_IV_PASSPORT_NO_DISCLOSURE',
    'I8.1 Passport material with NO disclosure is refused — a label is not consent');

  -- ---- a disclosure belonging to something else ---------------------------
  PERFORM pg_temp.must_fail(format($q$
    INSERT INTO public.scp_interview_case_sources
      (case_id, source_kind, label, content_text, purpose_code, lawful_basis_note, disclosure_id)
    VALUES (%L, 'passport_disclosure', 'Passport', 'VU1.', 'recruitment_interview', 'x', %L)$q$,
    _case, _other),
    'SCP_IV_PASSPORT_DISCLOSURE_WRONG_APPLICATION',
    'I8.2 a disclosure for another application does not apply — consent is per application');

  -- ---- a disclosure id on an ordinary source ------------------------------
  PERFORM pg_temp.must_fail(format($q$
    INSERT INTO public.scp_interview_case_sources
      (case_id, source_kind, label, content_text, purpose_code, lawful_basis_note, disclosure_id)
    VALUES (%L, 'candidate_cv', 'CV', 'Vaktare.', 'recruitment_interview', 'x', %L)$q$,
    _case, _live),
    'SCP_IV_DISCLOSURE_ON_NON_PASSPORT_SOURCE',
    'I8.3 a disclosure id cannot be attached to an ordinary CV');

  -- ---- the live one works -------------------------------------------------
  INSERT INTO public.scp_interview_case_sources
    (case_id, source_kind, label, content_text, purpose_code, lawful_basis_note, disclosure_id)
  VALUES (_case, 'passport_disclosure', 'Passport', 'VU1 och VU2 verifierade.',
          'recruitment_interview', 'Kandidatens delning.', _live);
  PERFORM pg_temp.ok(true, 'I8.4 a LIVE disclosure for this application is accepted');

  -- ---- then the holder lets it lapse --------------------------------------
  UPDATE public.sp_disclosures SET expires_at = now() - interval '1 day' WHERE id = _live;
  PERFORM pg_temp.must_fail(format($q$
    INSERT INTO public.scp_interview_case_sources
      (case_id, source_kind, label, content_text, purpose_code, lawful_basis_note, disclosure_id)
    VALUES (%L, 'passport_disclosure', 'Passport 2', 'Mer.', 'recruitment_interview', 'x', %L)$q$,
    _case, _live),
    'SCP_IV_PASSPORT_DISCLOSURE_EXPIRED',
    'I8.5 once it EXPIRES nothing further may be taken from it');

  -- ---- and withdraws it ---------------------------------------------------
  UPDATE public.sp_disclosures
     SET expires_at = now() + interval '30 days', revoked_at = now() WHERE id = _live;
  PERFORM pg_temp.must_fail(format($q$
    INSERT INTO public.scp_interview_case_sources
      (case_id, source_kind, label, content_text, purpose_code, lawful_basis_note, disclosure_id)
    VALUES (%L, 'passport_disclosure', 'Passport 3', 'Mer.', 'recruitment_interview', 'x', %L)$q$,
    _case, _live),
    'SCP_IV_PASSPORT_DISCLOSURE_REVOKED',
    'I8.6 a REVOKED disclosure cannot be newly retrieved from');

  -- What was already taken while the disclosure was live stays. Erasing a
  -- human-confirmed record because consent later lapsed would rewrite the
  -- account of a decision that has already been made; withdrawal stops future
  -- retrieval, which is what it is for.
  PERFORM pg_temp.ok(
    EXISTS (SELECT 1 FROM public.scp_interview_case_sources
             WHERE case_id = _case AND disclosure_id = _live AND retention_state = 'active'),
    'I8.7 material taken while it was live remains — withdrawal stops future retrieval');

  -- The interview never writes to Passport.
  PERFORM set_config('scp_iv.in_interview_write', 'on', true);
  PERFORM pg_temp.must_fail(format($q$
    INSERT INTO public.sp_claims (holder_user_id, claim_type, title, assertion_level)
    VALUES (%L, 'training', 'VU1 enligt intervju', 'self_asserted')$q$, _holder),
    'SCP_IV_NO_PASSPORT_WRITE',
    'I8.8 Interview Intelligence cannot create a Passport claim');
  PERFORM set_config('scp_iv.in_interview_write', 'off', true);
END $$;

-- ===========================================================================
DO $$ BEGIN RAISE NOTICE 'GROUP I9 — what a candidate may see about themselves'; END $$;
-- ===========================================================================
--
-- scp_interview_cases stays employer-only. The candidate's view is an explicit
-- projection, so what they can learn is a short list somebody wrote down rather
-- than whatever the table happens to contain.

INSERT INTO auth.users (id, email) VALUES
  ('44440000-0000-0000-0000-0000000000d1', 'cand-a@test.local'),
  ('44440000-0000-0000-0000-0000000000d2', 'cand-b@test.local')
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE _case uuid; _n integer; _status text; _detail jsonb;
BEGIN
  SELECT id INTO _case FROM public.scp_interview_cases
   WHERE employer_id = '55550000-0000-0000-0000-00000000000a' ORDER BY created_at LIMIT 1;

  UPDATE public.scp_interview_cases
     SET candidate_user_id = '44440000-0000-0000-0000-0000000000d1',
         candidate_external_ref = NULL
   WHERE id = _case;

  -- ---- a case still in draft is not visible at all ------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '44440000-0000-0000-0000-0000000000d1', true);
  SELECT count(*) INTO _n FROM public.scp_iv_candidate_interview_status();
  PERFORM pg_temp.ok(_n = 0,
    'I9.1 a case whose plan is not approved is invisible — considering an interview is not offering one');
  RESET ROLE;

  -- ---- once the plan is approved, exactly one coarse status ---------------
  --      Walked through the real transitions rather than jumped: the case
  --      transition guard refuses draft -> prep_approved, correctly, and a test
  --      that worked around it would be testing a state the product cannot
  --      reach.
  PERFORM set_config('scp_iv.governed_transition', 'on', true);
  UPDATE public.scp_interview_cases SET status = 'sources_ready' WHERE id = _case;
  UPDATE public.scp_interview_cases SET status = 'prep_generated' WHERE id = _case;
  UPDATE public.scp_interview_cases SET status = 'prep_approved' WHERE id = _case;
  PERFORM set_config('scp_iv.governed_transition', 'off', true);

  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '44440000-0000-0000-0000-0000000000d1', true);
  SELECT candidate_status INTO _status FROM public.scp_iv_candidate_interview_status();
  PERFORM pg_temp.ok(_status = 'interview_offered',
    format('I9.2 an approved plan reads as "interview_offered" (%s)', _status));
  RESET ROLE;

  -- ---- the employer's deliberation collapses into ONE state ---------------
  --      A candidate who could watch evidence_review become assessed would be
  --      watching the employer think.
  PERFORM set_config('scp_iv.governed_transition', 'on', true);
  UPDATE public.scp_interview_cases SET status = 'interview_in_progress' WHERE id = _case;
  FOR _status IN SELECT unnest(ARRAY['interview_complete','evidence_review','assessed','reported'])
  LOOP
    UPDATE public.scp_interview_cases SET status = _status WHERE id = _case;
    SET LOCAL ROLE authenticated;
    PERFORM set_config('request.jwt.claim.sub', '44440000-0000-0000-0000-0000000000d1', true);
    PERFORM pg_temp.ok(
      (SELECT candidate_status FROM public.scp_iv_candidate_interview_status())
        = 'employer_process_continuing',
      format('I9.3 "%s" is reported to the candidate as employer_process_continuing', _status));
    RESET ROLE;
  END LOOP;
  PERFORM set_config('scp_iv.governed_transition', 'off', true);

  -- ---- another candidate sees nothing -------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '44440000-0000-0000-0000-0000000000d2', true);
  SELECT count(*) INTO _n FROM public.scp_iv_candidate_interview_status();
  PERFORM pg_temp.ok(_n = 0, 'I9.4 a different candidate sees none of it');

  PERFORM pg_temp.must_fail(
    format('SELECT public.scp_iv_candidate_interview_detail(%L)', _case),
    'SCP_IV_CANDIDATE_NOT_PERMITTED',
    'I9.5 and cannot open the detail either');
  RESET ROLE;

  -- ---- the detail carries no employer-internal material -------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '44440000-0000-0000-0000-0000000000d1', true);
  _detail := public.scp_iv_candidate_interview_detail(_case);
  RESET ROLE;

  PERFORM pg_temp.ok(
    NOT (_detail::text ~* '(prompt|anchor|ankare|dimension|evidence|evidens|assessment|bedömning|level|nivå)'),
    'I9.6 the candidate detail contains no question, anchor, dimension, evidence or assessment');

  PERFORM pg_temp.ok(
    _detail ? 'sources' AND _detail ? 'candidate_status' AND _detail ? 'retain_until',
    'I9.7 it does contain what the candidate is entitled to: material, status, retention');

  -- ---- the case table itself stays shut -----------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '44440000-0000-0000-0000-0000000000d1', true);
  SELECT count(*) INTO _n FROM public.scp_interview_cases;
  PERFORM pg_temp.ok(_n = 0,
    'I9.8 the candidate still cannot read scp_interview_cases directly — the projection is the only door');
  RESET ROLE;

  -- ---- a correction is possible, and is not an edit -----------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', '44440000-0000-0000-0000-0000000000d1', true);
  INSERT INTO public.scp_interview_candidate_corrections
    (case_id, candidate_user_id, what_is_wrong, what_is_correct)
  VALUES (_case, '44440000-0000-0000-0000-0000000000d1', 'Fel slutdatum.', 'Ska vara 2025.');
  PERFORM pg_temp.ok(true, 'I9.9 the candidate can report a factual error');

  PERFORM pg_temp.must_fail(
    format($q$INSERT INTO public.scp_interview_candidate_corrections
      (case_id, candidate_user_id, what_is_wrong, what_is_correct)
      VALUES (%L, %L, 'x', 'y')$q$, _case, '44440000-0000-0000-0000-0000000000d2'),
    'row-level security',
    'I9.10 and cannot file one in somebody else''s name');
  RESET ROLE;

  PERFORM pg_temp.ok(
    NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_name = 'scp_interview_candidate_corrections'
                   AND column_name IN ('level', 'assessment_id', 'evidence_id')),
    'I9.11 a correction cannot reach an assessment — it is a statement, not an edit');
END $$;

DO $$ BEGIN RAISE NOTICE 'INTEGRITY SUITE COMPLETE'; END $$;
ROLLBACK;
