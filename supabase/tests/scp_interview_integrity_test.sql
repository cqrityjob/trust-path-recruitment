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
      format('UPDATE public.scp_intel_edges SET assurance = %L WHERE id = %L', 'verified', _edge),
      'SCP_INTEL_EDGE_ASSURANCE',
      'I2.2 an edge into an unread research claim cannot be marked verified');
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

DO $$ BEGIN RAISE NOTICE 'INTEGRITY SUITE COMPLETE'; END $$;
ROLLBACK;
