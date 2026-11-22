-- admin_delete_user_if_safe: the security-scanner warning (SECURITY DEFINER,
-- EXECUTE granted to authenticated, dynamic SQL) checked against what the
-- function actually does. The authenticated grant is required: the function
-- authorises on the caller's own identity (auth.uid() + is_superadmin), which
-- a service-role or invoker design would lose. These assertions add what
-- admin_lifecycle_test.sql did not already prove: signup metadata grants no
-- role, and hostile text - in the reason, the confirmation and even in table
-- and column names found through the catalogue - stays data.
-- Synthetic data, real roles, always rolled back.
\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.ok(c boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF c IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',label; END IF; RAISE NOTICE 'ok  ADS %',label; END $$;
CREATE OR REPLACE FUNCTION pg_temp.fail(s text,needle text,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN BEGIN EXECUTE s; EXCEPTION WHEN OTHERS THEN IF position(needle IN SQLERRM)=0 THEN RAISE EXCEPTION '% expected "%", got %',label,needle,SQLERRM; END IF; RAISE NOTICE 'ok  ADS %',label; RETURN; END; RAISE EXCEPTION '% unexpectedly succeeded',label; END $$;
CREATE OR REPLACE FUNCTION pg_temp.login(u text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM set_config('request.jwt.claim.sub',u,true);PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',u,'role','authenticated','is_anonymous',false)::text,true); END $$;

-- 1 superadmin, 2 platform admin, 3 ordinary user, 4 signup claiming superadmin,
-- 5 the target, whose address contains quotes.
INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data) VALUES
 ('ad5e0000-0000-4000-8000-000000000001','ads-super@example.test',now(),'{}'),
 ('ad5e0000-0000-4000-8000-000000000002','ads-admin@example.test',now(),'{}'),
 ('ad5e0000-0000-4000-8000-000000000003','ads-user@example.test',now(),'{}'),
 ('ad5e0000-0000-4000-8000-000000000004','ads-claims-super@example.test',now(),
  '{"role":"superadmin","app_role":"superadmin","roles":["superadmin","admin"],"is_superadmin":true}'),
 ('ad5e0000-0000-4000-8000-000000000005','o''brien+"target"@example.test',now(),'{}');
INSERT INTO public.user_roles(user_id,role) VALUES
 ('ad5e0000-0000-4000-8000-000000000001','superadmin'),
 ('ad5e0000-0000-4000-8000-000000000002','admin');
-- A column whose name is SQL, holding a row for the target. (A table name
-- that needs quoting is not used: the function reads it as regclass::text,
-- already quoted, and %I quotes it again, so it fails closed with "relation
-- does not exist" -- no such table exists in this schema; see
-- docs/security-intelligence/admin-delete-user-if-safe-review.md.)
CREATE TABLE public.ads_probe ("owner""); DELETE FROM auth.users; --" uuid REFERENCES auth.users(id) ON DELETE CASCADE);
INSERT INTO public.ads_probe VALUES ('ad5e0000-0000-4000-8000-000000000005');
-- History the function must keep, so it takes the erasure form, whose
-- catalogue-driven passes run dynamic DELETE and count statements.
CREATE TABLE public.ads_history (owner uuid REFERENCES auth.users(id));
INSERT INTO public.ads_history VALUES ('ad5e0000-0000-4000-8000-000000000005');

SELECT pg_temp.ok(NOT public.is_superadmin('ad5e0000-0000-4000-8000-000000000004') AND NOT public.has_role('ad5e0000-0000-4000-8000-000000000004','admin')
  AND (SELECT count(*)=0 FROM public.user_roles WHERE user_id='ad5e0000-0000-4000-8000-000000000004'),'signup metadata claiming superadmin grants no role');
SELECT pg_temp.ok(NOT has_table_privilege('authenticated','public.user_roles','INSERT') AND NOT has_table_privilege('authenticated','public.user_roles','UPDATE')
  AND NOT has_table_privilege('anon','public.user_roles','INSERT'),'no client can write a role');

SET LOCAL ROLE authenticated;
SELECT pg_temp.login('ad5e0000-0000-4000-8000-000000000004');
SELECT pg_temp.fail($$SELECT public.admin_delete_user_if_safe('ad5e0000-0000-4000-8000-000000000005','x','o''brien+"target"@example.test')$$,'FORBIDDEN_SUPERADMIN_REQUIRED','an account whose signup claimed superadmin cannot delete');
SELECT pg_temp.fail($$INSERT INTO public.user_roles(user_id,role) VALUES ('ad5e0000-0000-4000-8000-000000000004','superadmin')$$,'permission denied','nor grant itself the role');
SELECT pg_temp.login('ad5e0000-0000-4000-8000-000000000003');
SELECT pg_temp.fail($$SELECT public.admin_delete_user_if_safe('ad5e0000-0000-4000-8000-000000000005','x','o''brien+"target"@example.test')$$,'FORBIDDEN_SUPERADMIN_REQUIRED','an ordinary user cannot delete an account');
SELECT pg_temp.login('ad5e0000-0000-4000-8000-000000000002');
SELECT pg_temp.fail($$SELECT public.admin_delete_user_if_safe('ad5e0000-0000-4000-8000-000000000005','x','o''brien+"target"@example.test')$$,'FORBIDDEN_SUPERADMIN_REQUIRED','a platform admin who is not superadmin cannot delete an account');
SELECT pg_temp.login('ad5e0000-0000-4000-8000-000000000001');
SELECT pg_temp.fail($$SELECT public.admin_delete_user_if_safe('ad5e0000-0000-4000-8000-000000000005','x',''' OR ''1''=''1')$$,'CONFIRMATION_MISMATCH','an injection-shaped confirmation is compared as text and refused');
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=5 FROM auth.users WHERE id::text LIKE 'ad5e0000-%'),'every refusal changed nothing');
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('ad5e0000-0000-4000-8000-000000000001');
SELECT public.admin_delete_user_if_safe('ad5e0000-0000-4000-8000-000000000005',
  $r$Requested'); DROP TABLE public.profiles; DELETE FROM auth.users; --$r$,
  'o''brien+"target"@example.test') AS outcome \gset
RESET ROLE;
SELECT pg_temp.ok(to_regclass('public.profiles') IS NOT NULL
  AND (SELECT count(*)=4 FROM auth.users WHERE id::text LIKE 'ad5e0000-%' AND email NOT LIKE 'raderad+%')
  AND (SELECT email='raderad+ad5e0000-0000-4000-8000-000000000005@removed.invalid' FROM auth.users WHERE id='ad5e0000-0000-4000-8000-000000000005')
  AND (:'outcome')::jsonb->>'form'='erasure',
  'an authorised superadmin erases exactly the target; the hostile reason executed nothing');
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.audit_logs WHERE action='user_deleted' AND subject_id::text='ad5e0000-0000-4000-8000-000000000005'
  AND actor_id='ad5e0000-0000-4000-8000-000000000001'
  AND metadata->>'reason'=$r$Requested'); DROP TABLE public.profiles; DELETE FROM auth.users; --$r$),'the reason is recorded verbatim in the audit log, as data');
SELECT pg_temp.ok((SELECT count(*)=0 FROM public.ads_probe) AND (SELECT count(*)=1 FROM public.ads_history),
  'the dynamic passes erased the target''s row through a column whose name is SQL, quoted as an identifier; kept history stays');
ROLLBACK;
