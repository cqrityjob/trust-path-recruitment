-- P1-K (20270120090000): only the security function erases material on a
-- security vetting.
--
--   VE-F the fixture: employer E (active) with owner O, admin S appointed as
--        security officer; case V linked to a security-vetting BESKT
--        assignment (so it is vetting-restricted) and an ordinary case N, each
--        with one source.
--   VE0  REPRODUCTION. With the hosted body restored by the real rollback, O
--        -- who cannot even read V -- erases V's source. Rolled back.
--   VE1  O's erasure of V's source is refused (SCP_IV_NOT_CASE_MEMBER); the
--        source is intact.
--   VE2  S, the security officer, still erases V's source.
--   VE3  on the ordinary case N, O still erases.
--
-- The security officer and the vetting link are seeded with session_replication_role = replica (no
-- triggers or foreign keys), exactly what bcp_case_vetting_restricted reads.
-- Synthetic principals; everything rolls back.

\set ON_ERROR_STOP on
SET client_min_messages TO NOTICE;

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean, label text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %', label; END IF;
  RAISE NOTICE 'ok  %', label;
END $$;

CREATE TEMP TABLE ve(label text PRIMARY KEY, id uuid);
INSERT INTO ve VALUES
  ('e', '0f200000-1111-4000-8000-000000000001'),
  ('o', '0f200000-0000-4000-8000-000000000001'),
  ('s', '0f200000-0000-4000-8000-000000000002'),
  ('c', '0f200000-0000-4000-8000-000000000003');
CREATE OR REPLACE FUNCTION pg_temp.v(_l text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM ve WHERE label = _l $$;
GRANT SELECT ON ve TO authenticated, anon;

INSERT INTO auth.users (id, email) VALUES
  ('0f200000-0000-4000-8000-000000000001', 've-owner@test.invalid'),
  ('0f200000-0000-4000-8000-000000000002', 've-officer@test.invalid'),
  ('0f200000-0000-4000-8000-000000000003', 've-candidate@test.invalid');
INSERT INTO public.employers (id, name, slug, status) VALUES (pg_temp.v('e'), 'VE Employer', 've-employer', 'active');
INSERT INTO public.employer_memberships (employer_id, user_id, role, status) VALUES
  (pg_temp.v('e'), pg_temp.v('o'), 'owner', 'active'),
  (pg_temp.v('e'), pg_temp.v('s'), 'admin', 'active');

DO $$
DECLARE _packv uuid; _cv uuid; _cn uuid;
BEGIN
  SELECT ver.id INTO _packv FROM public.scp_interview_pack_versions ver
    JOIN public.scp_interview_packs p ON p.id = ver.pack_id
   WHERE p.slug = 'vaktare-se' AND ver.pilot_availability = 'open' LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub', pg_temp.v('o')::text, true);
  SET LOCAL ROLE authenticated;
  _cv := public.scp_iv_create_case(pg_temp.v('e'), 'VE-prövning', _packv, 'Kandidat V.', NULL, 'EXT-VE-V');
  _cn := public.scp_iv_create_case(pg_temp.v('e'), 'VE-intervju', _packv, 'Kandidat N.', NULL, 'EXT-VE-N');
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  INSERT INTO ve VALUES ('cv', _cv), ('cn', _cn);
END $$;

INSERT INTO public.scp_interview_case_sources (id, case_id, source_kind, label, content_text, purpose_code, lawful_basis_note)
VALUES ('0f200000-6666-4000-8000-0000000000a1', pg_temp.v('cv'), 'interviewer_notes', 'Anteckningar', 'SYNTETISK prövningsanteckning.', 'recruitment_interview', 'VE fixtur'),
       ('0f200000-6666-4000-8000-0000000000a2', pg_temp.v('cv'), 'interviewer_notes', 'Anteckningar 2', 'SYNTETISK prövningsanteckning 2.', 'recruitment_interview', 'VE fixtur'),
       ('0f200000-6666-4000-8000-0000000000b1', pg_temp.v('cn'), 'interviewer_notes', 'Anteckningar', 'SYNTETISK intervjuanteckning.', 'recruitment_interview', 'VE fixtur');

SET LOCAL session_replication_role = replica;
INSERT INTO public.bcp_security_officers (employer_id, user_id, appointed_by, appointment_reason, appoint_operation_id)
VALUES (pg_temp.v('e'), pg_temp.v('s'), pg_temp.v('o'), 'VE: utsedd säkerhetsfunktion', gen_random_uuid());
INSERT INTO public.bcp_assignments (id, employer_id, candidate_user_id, method_version_id, exposure_profile_id, mode,
  pinned_content_hash, pinned_release_scope, notice_version, assigned_by, invitation_id, role_title,
  security_owner_id, role_security_attestation, lawful_basis_statement)
VALUES ('0f200000-7777-4000-8000-000000000001', pg_temp.v('e'), pg_temp.v('c'), gen_random_uuid(), gen_random_uuid(),
  'security_vetting_support', repeat('a', 64), 'synthetic_internal_only', 'v1', pg_temp.v('o'), gen_random_uuid(),
  'Väktare', pg_temp.v('s'), 'SYNTETISK säkerhetsskyddsklassad befattning', 'SYNTETISK rättslig grund för prövning');
INSERT INTO public.bcp_case_links (assignment_id, case_id, employer_id, candidate_user_id, bound_response_id,
  bound_response_version, bound_assignment_revision, bound_method_version_id, bound_content_hash,
  bound_answers_content_hash, bound_notice_version, bound_notice_content_hash, bound_notice_locale,
  source_id, linked_by, link_operation_id)
VALUES ('0f200000-7777-4000-8000-000000000001', pg_temp.v('cv'), pg_temp.v('e'), pg_temp.v('c'), gen_random_uuid(),
  1, 1, gen_random_uuid(), repeat('b', 64), repeat('c', 64), 'v1', repeat('d', 64), 'sv',
  '0f200000-6666-4000-8000-0000000000a1', pg_temp.v('o'), gen_random_uuid());
SET LOCAL session_replication_role = origin;

-- _as erases _source. 'ok' or the error code.
CREATE OR REPLACE FUNCTION pg_temp.erase(_as uuid, _source uuid) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE _r text := 'ok';
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _as::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    PERFORM public.scp_iv_erase_source(_source, 'VE: radering');
  EXCEPTION WHEN OTHERS THEN _r := split_part(SQLERRM, ':', 1);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _r;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.state(_source uuid) RETURNS text LANGUAGE sql AS $$
  SELECT retention_state FROM public.scp_interview_case_sources WHERE id = _source;
$$;
CREATE OR REPLACE FUNCTION pg_temp.can_read(_as uuid, _case uuid) RETURNS boolean
LANGUAGE plpgsql AS $$
DECLARE _b boolean;
BEGIN
  PERFORM set_config('request.jwt.claim.sub', _as::text, true);
  SET LOCAL ROLE authenticated;
  _b := public.scp_iv_can_read_case(_case);
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  RETURN _b;
END $$;

SELECT pg_temp.ok(public.bcp_case_vetting_restricted(pg_temp.v('cv')) AND NOT public.bcp_case_vetting_restricted(pg_temp.v('cn'))
  AND NOT pg_temp.can_read(pg_temp.v('o'), pg_temp.v('cv')) AND pg_temp.can_read(pg_temp.v('s'), pg_temp.v('cv')),
  'VE-F V is a security vetting the owner cannot read and the security officer can; N is ordinary');

-- ── VE0 reproduction on the hosted body ──────────────────────────────────
SAVEPOINT pre_fix;
\ir ../rollback/20270120090000_scp_iv_erase_vetting_boundary_rollback.sql
SELECT pg_temp.ok(pg_temp.erase(pg_temp.v('o'), '0f200000-6666-4000-8000-0000000000a1') = 'ok'
  AND pg_temp.state('0f200000-6666-4000-8000-0000000000a1') = 'erased',
  'VE0.1 REPRODUCTION: pre-fix, the owner erases material on a vetting case they cannot read');
ROLLBACK TO SAVEPOINT pre_fix;

-- ── VE1 the owner is refused ─────────────────────────────────────────────
SELECT pg_temp.ok(pg_temp.erase(pg_temp.v('o'), '0f200000-6666-4000-8000-0000000000a1') = 'SCP_IV_NOT_CASE_MEMBER',
  'VE1.1 the owner''s erasure of vetting material is refused (SCP_IV_NOT_CASE_MEMBER)');
SELECT pg_temp.ok(pg_temp.state('0f200000-6666-4000-8000-0000000000a1') = 'active',
  'VE1.2 and the source is intact');

-- ── VE2 the security officer still erases ────────────────────────────────
SELECT pg_temp.ok(pg_temp.erase(pg_temp.v('s'), '0f200000-6666-4000-8000-0000000000a2') = 'ok'
  AND pg_temp.state('0f200000-6666-4000-8000-0000000000a2') = 'erased',
  'VE2.1 the security officer erases vetting material');

-- ── VE3 ordinary cases are unchanged ─────────────────────────────────────
SELECT pg_temp.ok(pg_temp.erase(pg_temp.v('o'), '0f200000-6666-4000-8000-0000000000b1') = 'ok'
  AND pg_temp.state('0f200000-6666-4000-8000-0000000000b1') = 'erased',
  'VE3.1 on an ordinary case the owner still erases');

ROLLBACK;
