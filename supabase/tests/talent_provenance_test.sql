-- Provenance in the talent reads and the decision notices (Astra's recheck,
-- 2026-10-15). The database must say what the application's existing
-- provenance model says (effectiveTrust, src/lib/security-passport/
-- provenance.ts) about the SAME decision:
--
--   * only an employer confirming an EMPLOYMENT PERIOD, decided by a named
--     organisation that is not CQrityjob, is employer-confirmed;
--   * an issuer confirmation is documented (no structural issuer exists);
--   * a legacy source method CQrityjob recorded about itself is documented;
--   * an employer confirmation of a credential is documented;
--   * the decision row keeps the method as recorded (history), and nothing
--     presents it as a stronger current verification.
--   * the organisation is read as the application reads it: trimmed of what
--     JavaScript's trim removes (tabs, newlines, no-break and other Unicode
--     spaces), letter case folded for ASCII only (PV13-PV16, Astra's P2).
--
-- The cases are supabase/tests/provenance_cases.json, shared with the
-- application check (scripts/provenance-parity-check.ts compares the two
-- answers directly). Synthetic principals; everything rolls back.

\set ON_ERROR_STOP on
\set cases `cat supabase/tests/provenance_cases.json`
SET client_min_messages TO NOTICE;
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN
    -- psql -v report_only=1: record and continue, to show every failing case
    -- at once against an unfixed schema. Never set in db-test.sh.
    IF current_setting('pv.report_only', true) = 'on' THEN RAISE NOTICE 'not ok  %', label; RETURN; END IF;
    RAISE EXCEPTION 'ASSERTION FAILED: %', label;
  END IF;
  RAISE NOTICE 'ok  %', label;
END $$;
\if :{?report_only}
SELECT set_config('pv.report_only', 'on', true);
\endif
-- An RPC as a signed-in user would call it (role authenticated, auth.uid()).
CREATE OR REPLACE FUNCTION pg_temp.j_as(_uid uuid, _sql text) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE _r jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _uid::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', _uid)::text, true);
  SET LOCAL ROLE authenticated;
  EXECUTE _sql INTO _r;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '', true);
  RETURN _r;
END $$;

CREATE TEMP TABLE pv_case AS
SELECT row_number() OVER () AS n, c->>'id' AS id, c->>'subject' AS subject, c->>'requestKind' AS request_kind,
       c->>'method' AS method, c->>'organisation' AS organisation, c->>'expected' AS expected, c->>'why' AS why
  FROM jsonb_array_elements(:'cases'::jsonb) c;
SELECT pg_temp.ok((SELECT count(*) FROM pv_case) = 21, 'PV0 twenty-one shared cases loaded');

-- One holder per case, a decider, and the employer the attestations name.
ALTER TABLE pv_case ADD COLUMN holder uuid, ADD COLUMN claim_id uuid, ADD COLUMN period_id uuid, ADD COLUMN request_id uuid;
UPDATE pv_case SET holder = ('a7190000-0000-4000-8000-0000000c' || lpad(n::text, 4, '0'))::uuid,
                   request_id = ('a7190000-7777-4000-8000-0000000' || lpad(n::text, 5, '0'))::uuid;
INSERT INTO auth.users (id, email)
SELECT holder, 'pv-holder-' || n || '@synthetic.invalid' FROM pv_case
UNION ALL SELECT 'a7190000-0000-4000-8000-0000000000d1', 'pv-decider@synthetic.invalid';
INSERT INTO public.employers (id, name, slug, status)
VALUES ('a7190000-1111-4000-8000-000000000001', 'TS Bevakning AB', 'pv-ts-bevakning', 'active');

-- The subjects, self-declared.
WITH d AS (SELECT * FROM public.sp_approved_credential_catalogue WHERE code = 'OV'),
ins AS (
  INSERT INTO public.sp_claims (holder_user_id, claim_type, title, credential_code, claimed_issuer_name,
                                jurisdiction_code, sub_jurisdiction_code, valid_until, lifecycle_state, assertion_level)
  SELECT p.holder, d.claim_type, d.name_en, d.code, coalesce(d.issuer_name, 'Synthetic issuer'), d.country, d.region,
         current_date + 400, 'active', 'self_declared'
    FROM pv_case p, d WHERE p.subject = 'claim'
  RETURNING id, holder_user_id)
UPDATE pv_case p SET claim_id = ins.id FROM ins WHERE ins.holder_user_id = p.holder;
UPDATE pv_case SET period_id = ('a7190000-3333-4000-8000-0000000' || lpad(n::text, 5, '0'))::uuid WHERE subject = 'period';
INSERT INTO public.sp_experience_periods (id, holder_user_id, employer_name, role_title, started_on, ended_on, security_relevance)
SELECT period_id, holder, 'TS Bevakning AB', 'Väktare', current_date - 800, NULL, 'primary' FROM pv_case WHERE subject = 'period';

-- The decisions as they stand in history: an approved request and its
-- decision row, written as the workflow of their time wrote them.
INSERT INTO public.sp_verification_requests (id, holder_user_id, claim_id, period_id, request_kind, target_employer_id,
                                             status, submitted_at, decided_at, decided_by, verification_method)
SELECT request_id, holder, claim_id, period_id, request_kind,
       CASE WHEN request_kind = 'employer_attestation' THEN 'a7190000-1111-4000-8000-000000000001'::uuid END,
       'approved', now() - interval '1 hour', now(), 'a7190000-0000-4000-8000-0000000000d1', method
  FROM pv_case;
INSERT INTO public.sp_verification_decisions (request_id, holder_user_id, decided_by, decider_organisation, decision, verification_method)
SELECT request_id, holder, 'a7190000-0000-4000-8000-0000000000d1', organisation, 'approved', method FROM pv_case;
SELECT set_config('sp.verification_context', 'on', true);
UPDATE public.sp_claims c SET assertion_level = 'verified', verified_by_user_id = 'a7190000-0000-4000-8000-0000000000d1', verified_at = now()
  FROM pv_case p WHERE c.id = p.claim_id;
UPDATE public.sp_experience_periods e SET assertion_level = 'verified' FROM pv_case p WHERE e.id = p.period_id;
SELECT set_config('sp.verification_context', '', true);

-- What each read says.
CREATE TEMP TABLE pv_out AS
SELECT p.n, p.id, p.expected, p.why, p.method AS recorded_method,
       public.sp_talent_entry_level('verified', p.claim_id, p.period_id) AS level,
       (SELECT n.verification_method FROM public.user_notices n
         WHERE n.recipient_user_id = p.holder AND n.kind = 'passport_decision_approved') AS notice_method,
       (SELECT d.verification_method FROM public.sp_verification_decisions d WHERE d.request_id = p.request_id) AS decision_method,
       (SELECT d.decider_organisation FROM public.sp_verification_decisions d WHERE d.request_id = p.request_id) AS decision_organisation,
       p.organisation AS recorded_organisation
  FROM pv_case p;

-- One line per case for scripts/provenance-parity-check.ts, which compares
-- these database answers with the application's for the same case.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM pv_out ORDER BY n LOOP
    RAISE NOTICE 'PVOUT %|%|%', r.id, r.level, r.notice_method;
  END LOOP;
END $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM pv_out ORDER BY n LOOP
    PERFORM pg_temp.ok(r.level = r.expected,
      format('%s.1 %s: the talent level is %s (got %s)', r.id, r.why, r.expected, r.level));
    PERFORM pg_temp.ok(r.notice_method = CASE r.expected WHEN 'employer_confirmed' THEN 'employer_confirmation' ELSE 'document_review' END,
      format('%s.2 the decision notice names what the decision supports (got %s)', r.id, r.notice_method));
    PERFORM pg_temp.ok(r.decision_method = r.recorded_method AND r.decision_organisation IS NOT DISTINCT FROM r.recorded_organisation,
      format('%s.3 the decision row keeps the recorded method %s and organisation as history', r.id, r.recorded_method));
  END LOOP;
END $$;

-- The employer-visible read path: the selected entries, through the card.
INSERT INTO public.sp_talent_profiles (holder_user_id, visibility, consent_text_version, consented_at)
SELECT holder, 'open', 'talent-v1', now() FROM pv_case;
INSERT INTO public.sp_talent_items (holder_user_id, claim_id, experience_id) SELECT holder, claim_id, period_id FROM pv_case;

-- The same decisions through what people read (Astra's P2: the candidate's
-- preview, the employer's profile, the notice payloads), one assertion each.
-- An owner of the employer with a published job, who may search.
INSERT INTO auth.users (id, email) VALUES ('a7190000-0000-4000-8000-0000000000e1', 'pv-owner@synthetic.invalid');
INSERT INTO public.employer_memberships (employer_id, user_id, role, status)
VALUES ('a7190000-1111-4000-8000-000000000001', 'a7190000-0000-4000-8000-0000000000e1', 'owner', 'active');
SELECT set_config('request.jwt.claim.sub', 'a7190000-0000-4000-8000-0000000000e1', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', 'a7190000-0000-4000-8000-0000000000e1')::text, true);
SET LOCAL ROLE authenticated;
INSERT INTO public.jobs (id, slug, short_id, employer_id, title_sv, title_en, application_method, status)
VALUES ('a7190000-2222-4000-8000-000000000001', 'pv-vaktare', 'PV0001', 'a7190000-1111-4000-8000-000000000001',
        'Väktare', 'Security guard', 'internal', 'draft');
UPDATE public.jobs SET status = 'published', expires_at = now() + interval '30 days'
 WHERE id = 'a7190000-2222-4000-8000-000000000001';
RESET ROLE;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '', true);

-- The claimed mail payloads, as the mail worker (service role) claims them.
SET LOCAL ROLE service_role;
CREATE TEMP TABLE pv_mail AS SELECT x FROM jsonb_array_elements(public.user_notices_claim_emails(50)) x;
RESET ROLE;

CREATE TEMP TABLE pv_read AS
SELECT p.n, p.id, p.subject, p.expected,
       CASE p.expected WHEN 'employer_confirmed' THEN 'employer_confirmation' ELSE 'document_review' END AS want_notice,
       pg_temp.j_as(p.holder, 'SELECT public.sp_talent_preview()') AS preview,
       pg_temp.j_as('a7190000-0000-4000-8000-0000000000e1',
                    format('SELECT public.rec_talent_profile(%L, %L)', 'a7190000-2222-4000-8000-000000000001',
                           (SELECT t.search_ref FROM public.sp_talent_profiles t WHERE t.holder_user_id = p.holder))) AS profile,
       pg_temp.j_as(p.holder, 'SELECT public.user_notices_inbox(30)') AS inbox,
       (SELECT m.x FROM pv_mail m WHERE m.x->>'requestId' = p.request_id::text
           AND m.x->>'kind' = 'passport_decision_approved') AS mail
  FROM pv_case p;

DO $$
DECLARE r record; _key text;
BEGIN
  FOR r IN SELECT * FROM pv_read ORDER BY n LOOP
    _key := CASE r.subject WHEN 'claim' THEN 'merits' ELSE 'experience' END;
    PERFORM pg_temp.ok(r.preview #>> ARRAY['card', _key, '0', 'level'] = r.expected,
      format('%s.4 the candidate''s own preview shows %s (got %s)', r.id, r.expected, r.preview #>> ARRAY['card', _key, '0', 'level']));
    PERFORM pg_temp.ok(r.profile->>'status' = 'ok' AND r.profile #>> ARRAY['card', _key, '0', 'level'] = r.expected,
      format('%s.5 the employer''s profile of the person shows %s (got %s)', r.id, r.expected,
             coalesce(r.profile #>> ARRAY['card', _key, '0', 'level'], r.profile->>'status')));
    PERFORM pg_temp.ok((SELECT i->>'verificationMethod' FROM jsonb_array_elements(r.inbox->'items') i
                         WHERE i->>'kind' = 'passport_decision_approved') = r.want_notice,
      format('%s.6 the inbox payload names %s', r.id, r.want_notice));
    PERFORM pg_temp.ok(r.mail->>'verificationMethod' = r.want_notice,
      format('%s.7 the claimed mail payload names %s (got %s)', r.id, r.want_notice, r.mail->>'verificationMethod'));
  END LOOP;
END $$;
SELECT pg_temp.ok((SELECT bool_and(m.level = p.expected) FROM pv_case p, LATERAL public.sp_talent_merits(p.holder) m
                    WHERE p.subject = 'claim'),
                  'PV10 the merits the card shows carry the same levels');
SELECT pg_temp.ok((SELECT bool_and(x.level = p.expected) FROM pv_case p, LATERAL public.sp_talent_experience(p.holder) x
                    WHERE p.subject = 'period'),
                  'PV11 and so does the experience');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM pv_case p WHERE public.sp_talent_card(p.holder)::text LIKE '%source_confirmed%'),
                  'PV12 no card says a source confirmed anything');

ROLLBACK;
