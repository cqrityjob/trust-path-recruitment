-- Local fixture prerequisite missing from the checked-in journey fixture.
-- One synthetic user required by employer-process-continuity-fixture.sql.
BEGIN;
INSERT INTO auth.users(id,instance_id,aud,role,email,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
VALUES ('9e000000-0000-4000-8000-0000000000c1','00000000-0000-0000-0000-000000000000','authenticated','authenticated','phase2-continuity@local.test',now(),'{"provider":"email","providers":["email"]}','{"full_name":"Local continuity fixture"}',now(),now()) ON CONFLICT(id) DO NOTHING;
COMMIT;
