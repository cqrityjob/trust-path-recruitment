-- Security Work Release A (20270327090000): operating profile, missions with
-- need-to-know, collaboration. Real roles, synthetic data, rolled back at the
-- end unless sw_context_keep_fixture is set by the rollback proof.
\set ON_ERROR_STOP on
BEGIN;
CREATE OR REPLACE FUNCTION pg_temp.ok(c boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF c IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',label; END IF; RAISE NOTICE 'ok  SW-CTX %',label; END $$;
CREATE OR REPLACE FUNCTION pg_temp.fail(s text,code text,label text) RETURNS void LANGUAGE plpgsql AS $$ DECLARE state text; BEGIN BEGIN EXECUTE s; EXCEPTION WHEN OTHERS THEN GET STACKED DIAGNOSTICS state=RETURNED_SQLSTATE; IF state<>code THEN RAISE EXCEPTION '% expected %, got % (%)',label,code,state,SQLERRM; END IF; RAISE NOTICE 'ok  SW-CTX %',label; RETURN; END; RAISE EXCEPTION '% unexpectedly succeeded',label; END $$;
CREATE OR REPLACE FUNCTION pg_temp.login(u text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN PERFORM set_config('request.jwt.claim.sub',coalesce(u,''),true);PERFORM set_config('request.jwt.claims',CASE WHEN u IS NULL THEN '{}' ELSE jsonb_build_object('sub',u,'role','authenticated','is_anonymous',false)::text END,true); END $$;

INSERT INTO auth.users(id,email,email_confirmed_at) VALUES
 ('57000000-0000-4000-8000-000000000001','ctx-owner-a@example.test',now()),
 ('57000000-0000-4000-8000-000000000002','ctx-editor-a@example.test',now()),
 ('57000000-0000-4000-8000-000000000003','ctx-viewer-a@example.test',now()),
 ('57000000-0000-4000-8000-000000000004','ctx-owner-b@example.test',now()),
 ('57000000-0000-4000-8000-000000000005','ctx-outsider@example.test',now()),
 ('57000000-0000-4000-8000-000000000006','ctx-invitee@example.test',now());
INSERT INTO auth.sessions(id,user_id,not_after) SELECT id,id,now()+interval '1 day' FROM auth.users WHERE id::text LIKE '57000000-%';

SET LOCAL ROLE authenticated;
SELECT pg_temp.login('57000000-0000-4000-8000-000000000001');
SELECT sw_create_personal_workspace('Context workspace A') AS wa \gset
SELECT pg_temp.login('57000000-0000-4000-8000-000000000004');
SELECT sw_create_personal_workspace('Context workspace B') AS wb \gset
INSERT INTO sw_protected_assets(workspace_id,name,category) VALUES(:'wb','B asset','systems') RETURNING id AS basset \gset
RESET ROLE;
SELECT pg_temp.login('57000000-0000-4000-8000-000000000001');
INSERT INTO public.sw_workspace_memberships(workspace_id,user_id,role,can_approve) VALUES
 (:'wa','57000000-0000-4000-8000-000000000002','editor',false),
 (:'wa','57000000-0000-4000-8000-000000000003','viewer',false);

-- ---------------------------------------------------------------------------
-- Surface
-- ---------------------------------------------------------------------------
SELECT pg_temp.ok((SELECT bool_and(relrowsecurity) AND count(*)=7 FROM pg_class WHERE relnamespace='public'::regnamespace AND relname IN ('sw_operating_profiles','sw_member_preferences','sw_missions','sw_mission_members','sw_mission_links','sw_mission_events','sw_invitations')),'seven new tables, all with RLS');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_class c, unnest(ARRAY['anon','service_role']) r WHERE c.relnamespace='public'::regnamespace AND c.relname IN ('sw_operating_profiles','sw_member_preferences','sw_missions','sw_mission_members','sw_mission_links','sw_mission_events','sw_invitations') AND has_table_privilege(r,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')),'anon and service_role hold no privilege on them');
SELECT pg_temp.ok(NOT EXISTS (SELECT 1 FROM pg_proc p WHERE p.proname IN ('sw_set_mission_member','sw_create_invitation','sw_accept_invitation','sw_revoke_invitation','sw_set_member_role','sw_list_members','set_mission_member','create_invitation','accept_invitation','revoke_invitation','set_member_role','list_members','can_manage','can_see_mission') AND (has_function_privilege('anon',p.oid,'EXECUTE') OR has_function_privilege('service_role',p.oid,'EXECUTE'))),'no new function is executable by anon or service_role');
SELECT pg_temp.ok(NOT has_column_privilege('authenticated','public.sw_invitations','token_hash','SELECT') AND NOT has_table_privilege('authenticated','public.sw_invitations','INSERT,UPDATE,DELETE'),'nobody reads the code hash or writes invitations directly');

-- ---------------------------------------------------------------------------
-- Operating profile: append-only, next version only, schema fails closed
-- ---------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('57000000-0000-4000-8000-000000000002');
INSERT INTO sw_operating_profiles(workspace_id,profile_version,schema_version,profile,provenance) VALUES(:'wa',1,'sw-operating-profile-1','{"sectors":["energy"],"countries":["SE"]}','{"sectors":{"origin":"user"}}');
SELECT pg_temp.ok((SELECT created_by='57000000-0000-4000-8000-000000000002' FROM sw_operating_profiles WHERE workspace_id=:'wa' AND profile_version=1),'an editor records profile version 1 as themself');
SELECT pg_temp.fail(format('INSERT INTO sw_operating_profiles(workspace_id,profile_version,schema_version,profile) VALUES(%L,1,''sw-operating-profile-1'',''{}'')',:'wa'),'PT409','a second version 1 is a conflict, not a fork');
SELECT pg_temp.fail(format('INSERT INTO sw_operating_profiles(workspace_id,profile_version,schema_version,profile) VALUES(%L,3,''sw-operating-profile-1'',''{}'')',:'wa'),'PT409','a version cannot be skipped');
SELECT pg_temp.fail(format('INSERT INTO sw_operating_profiles(workspace_id,profile_version,schema_version,profile) VALUES(%L,2,''sw-operating-profile-99'',''{}'')',:'wa'),'23514','an unknown profile schema version fails closed');
INSERT INTO sw_operating_profiles(workspace_id,profile_version,schema_version,profile) VALUES(:'wa',2,'sw-operating-profile-1','{"sectors":["energy","water"]}');
SELECT pg_temp.fail(format('UPDATE sw_operating_profiles SET profile=''{}'' WHERE workspace_id=%L',:'wa'),'42501','a recorded profile version cannot be rewritten');
SELECT pg_temp.fail(format('DELETE FROM sw_operating_profiles WHERE workspace_id=%L',:'wa'),'42501','a recorded profile version cannot be deleted');
SELECT pg_temp.login('57000000-0000-4000-8000-000000000003');
SELECT pg_temp.fail(format('INSERT INTO sw_operating_profiles(workspace_id,profile_version,schema_version,profile) VALUES(%L,3,''sw-operating-profile-1'',''{}'')',:'wa'),'42501','a viewer cannot change the operating profile');
SELECT pg_temp.ok((SELECT count(*)=2 FROM sw_operating_profiles WHERE workspace_id=:'wa'),'a viewer reads the profile history');
SELECT pg_temp.login('57000000-0000-4000-8000-000000000004');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_operating_profiles WHERE workspace_id=:'wa'),'another workspace reads none of it');

-- Presentation preference: one's own, granting nothing.
SELECT pg_temp.login('57000000-0000-4000-8000-000000000003');
INSERT INTO sw_member_preferences(workspace_id,role_focus) VALUES(:'wa','ciso');
SELECT pg_temp.fail(format('INSERT INTO sw_missions(workspace_id,kind,title) VALUES(%L,''risk_assessment'',''CISO view'')',:'wa'),'42501','a CISO focus gives a viewer no edit right');
SELECT pg_temp.login('57000000-0000-4000-8000-000000000002');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_member_preferences WHERE workspace_id=:'wa'),'nobody reads another person''s presentation choice');
SELECT pg_temp.fail(format('INSERT INTO sw_member_preferences(workspace_id,user_id,role_focus) VALUES(%L,%L,''ciso'')',:'wa','57000000-0000-4000-8000-000000000001'),'42501','nobody sets another person''s presentation choice');

-- ---------------------------------------------------------------------------
-- Missions: lifecycle
-- ---------------------------------------------------------------------------
SELECT pg_temp.fail(format('INSERT INTO sw_missions(workspace_id,kind,title,execution_state) VALUES(%L,''risk_assessment'',''Born running'',''running'')',:'wa'),'23514','a mission starts as created');
SELECT pg_temp.fail(format('INSERT INTO sw_missions(workspace_id,kind,title) VALUES(%L,''cyber_compliance'',''Not shipped'')',:'wa'),'23514','a family that does not work yet cannot be created');
INSERT INTO sw_missions(workspace_id,kind,title,brief,owner_id,next_action,operating_profile_version) VALUES(:'wa','risk_assessment','Synthetic RSA','{"decision":"Approve site budget"}','57000000-0000-4000-8000-000000000002','Collect evidence',2) RETURNING id AS m \gset
SELECT pg_temp.ok((SELECT execution_state='created' AND review_state='not_started' AND version=1 FROM sw_missions WHERE id=:'m')
  AND (SELECT count(*)=1 FROM sw_mission_members WHERE mission_id=:'m' AND user_id='57000000-0000-4000-8000-000000000002')
  AND (SELECT count(*)=1 FROM sw_mission_events WHERE mission_id=:'m' AND event='created'),'creation records the creator as member and a history event');
SELECT pg_temp.fail(format('UPDATE sw_missions SET execution_state=''needs_review'' WHERE id=%L',:'m'),'23514','created cannot jump to needs review');
UPDATE sw_missions SET execution_state='ready' WHERE id=:'m';
UPDATE sw_missions SET execution_state='needs_review', review_state='in_review' WHERE id=:'m';
SELECT pg_temp.fail(format('UPDATE sw_missions SET execution_state=''completed'' WHERE id=%L',:'m'),'23514','a mission under review cannot be completed before acceptance');
SELECT pg_temp.fail(format('UPDATE sw_missions SET review_state=''not_started'' WHERE id=%L',:'m'),'23514','review cannot go back to not started');
-- Accepting a review is an approval (enforced from 20270329090000; its suite
-- proves an editor without approval rights is refused). The approver accepts;
-- the editor then completes.
SELECT pg_temp.login('57000000-0000-4000-8000-000000000001');
UPDATE sw_missions SET review_state='accepted' WHERE id=:'m';
SELECT pg_temp.login('57000000-0000-4000-8000-000000000002');
UPDATE sw_missions SET execution_state='completed' WHERE id=:'m';
SELECT pg_temp.ok((SELECT count(*)=2 FROM sw_mission_events WHERE mission_id=:'m' AND event='review_changed') AND (SELECT count(*)=3 FROM sw_mission_events WHERE mission_id=:'m' AND event='state_changed'),'every state and review change is in the mission history');
SELECT pg_temp.fail(format('UPDATE sw_missions SET title=''Rewritten'' WHERE id=%L',:'m'),'23514','a completed mission is final');
SELECT pg_temp.fail(format('INSERT INTO sw_missions(workspace_id,kind,title,owner_id) VALUES(%L,''event_security'',''Festival'',%L)',:'wa','57000000-0000-4000-8000-000000000005'),'23514','an owner must be an active workspace member');

-- ---------------------------------------------------------------------------
-- Missions: need-to-know
-- ---------------------------------------------------------------------------
INSERT INTO sw_missions(workspace_id,kind,title,restricted) VALUES(:'wa','monitoring_impact','Restricted investigation lead',true) RETURNING id AS r \gset
INSERT INTO sw_protected_assets(workspace_id,name,category) VALUES(:'wa','A asset','facilities') RETURNING id AS aasset \gset
INSERT INTO sw_mission_links(workspace_id,mission_id,target_kind,target_id) VALUES(:'wa',:'r','asset',:'aasset');
SELECT pg_temp.fail(format('INSERT INTO sw_mission_links(workspace_id,mission_id,target_kind,target_id) VALUES(%L,%L,''asset'',%L)',:'wa',:'r',:'basset'),'23514','a link cannot point into another workspace');
SELECT pg_temp.fail(format('INSERT INTO sw_mission_links(workspace_id,mission_id,target_kind,target_id) VALUES(%L,%L,''risk'',gen_random_uuid())',:'wa',:'r'),'23514','a link must point at an existing record');
SELECT pg_temp.login('57000000-0000-4000-8000-000000000003');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_missions WHERE id=:'r') AND (SELECT count(*)=0 FROM sw_mission_links WHERE mission_id=:'r') AND (SELECT count(*)=0 FROM sw_mission_events WHERE mission_id=:'r') AND (SELECT count(*)=0 FROM sw_mission_members WHERE mission_id=:'r'),'a restricted mission and everything under it is absent for a non-member viewer');
SELECT pg_temp.ok((SELECT count(*)=1 FROM sw_missions WHERE id=:'m'),'an open mission is visible to every member');
SELECT pg_temp.login('57000000-0000-4000-8000-000000000001');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_missions WHERE id=:'r'),'need-to-know holds even for the workspace owner');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_audit_events WHERE workspace_id=:'wa' AND entity_id=:'r'),'the restricted mission does not leak through the workspace audit feed');
WITH changed AS (UPDATE sw_missions SET title='Owner rewrite' WHERE id=:'r' RETURNING 1)
SELECT pg_temp.ok((SELECT count(*)=0 FROM changed),'a non-member cannot change a restricted mission');
SELECT pg_temp.fail(format('INSERT INTO sw_mission_links(workspace_id,mission_id,target_kind,target_id) VALUES(%L,%L,''asset'',%L)',:'wa',:'r',:'aasset'),'42501','a non-member cannot attach records to a restricted mission');
SELECT pg_temp.login('57000000-0000-4000-8000-000000000003');
SELECT pg_temp.fail(format('SELECT sw_set_mission_member(%L,%L,%L,true)',:'wa',:'r','57000000-0000-4000-8000-000000000003'),'42501','a viewer cannot let themself in');
SELECT pg_temp.login('57000000-0000-4000-8000-000000000002');
SELECT pg_temp.fail(format('SELECT sw_set_mission_member(%L,%L,%L,true)',:'wa',:'r','57000000-0000-4000-8000-000000000005'),'23514','only an active workspace member can join a mission');
SELECT sw_set_mission_member(:'wa',:'r','57000000-0000-4000-8000-000000000003',true);
SELECT pg_temp.login('57000000-0000-4000-8000-000000000003');
SELECT pg_temp.ok((SELECT count(*)=1 FROM sw_missions WHERE id=:'r') AND (SELECT count(*)=1 FROM sw_mission_links WHERE mission_id=:'r'),'an added member sees the mission and its links');
SELECT pg_temp.login('57000000-0000-4000-8000-000000000002');
SELECT sw_set_mission_member(:'wa',:'r','57000000-0000-4000-8000-000000000003',false);
SELECT pg_temp.fail(format('SELECT sw_set_mission_member(%L,%L,%L,false)',:'wa',:'r','57000000-0000-4000-8000-000000000002'),'23514','the creator stays in the circle');
SELECT pg_temp.login('57000000-0000-4000-8000-000000000003');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_missions WHERE id=:'r'),'removal from the circle takes effect at once');
SELECT pg_temp.login('57000000-0000-4000-8000-000000000001');
SELECT pg_temp.fail(format('UPDATE sw_missions SET restricted=true WHERE id=%L',:'m'),'23514','a final mission cannot be changed, not even its circle');
SELECT pg_temp.login('57000000-0000-4000-8000-000000000002');
SELECT pg_temp.ok((SELECT count(*)=2 FROM sw_mission_events WHERE mission_id=:'r' AND event IN ('member_added','member_removed')),'circle changes are in the mission history');

-- ---------------------------------------------------------------------------
-- Collaboration
-- ---------------------------------------------------------------------------
SELECT pg_temp.fail(format('SELECT sw_create_invitation(%L,gen_random_uuid(),''x@example.test'',''viewer'',false)',:'wa'),'42501','an editor cannot invite');
SELECT pg_temp.login('57000000-0000-4000-8000-000000000001');
SELECT pg_temp.fail(format('SELECT sw_create_invitation(%L,gen_random_uuid(),''CTX-EDITOR-A@example.test'',''viewer'',false)',:'wa'),'23514','an active member is not invited again');
SELECT pg_temp.fail(format('SELECT sw_create_invitation(%L,gen_random_uuid(),''v@example.test'',''viewer'',true)',:'wa'),'23514','a viewer invitation cannot carry approval rights');
SELECT sw_create_invitation(:'wa','57000000-0000-4000-8000-000000000060',' Ctx-Invitee@Example.test ','editor',false)->>'code' AS code \gset
SELECT pg_temp.ok(char_length(:'code')=64 AND (SELECT email='ctx-invitee@example.test' AND role='editor' AND expires_at<=now()+interval '14 days' FROM sw_invitations WHERE id='57000000-0000-4000-8000-000000000060'),'an owner invites by normalised e-mail with a one-time code');
SELECT pg_temp.ok((sw_create_invitation(:'wa','57000000-0000-4000-8000-000000000060','ctx-invitee@example.test','editor',false)->>'code') IS NULL,'a retry returns the invitation but never the code again');
SELECT pg_temp.fail(format('SELECT token_hash FROM sw_invitations WHERE id=%L','57000000-0000-4000-8000-000000000060'),'42501','even the owner cannot read the code hash');
SELECT pg_temp.login('57000000-0000-4000-8000-000000000005');
SELECT pg_temp.fail(format('SELECT sw_accept_invitation(%L)',:'code'),'42501','the right code from the wrong account is refused');
SELECT pg_temp.login('57000000-0000-4000-8000-000000000006');
SELECT pg_temp.fail('SELECT sw_accept_invitation(repeat(''0'',64))','42501','a guessed code is refused');
SELECT pg_temp.ok(sw_accept_invitation(:'code')=:'wa','the invited account accepts with its own e-mail');
SELECT pg_temp.ok(sw_accept_invitation(:'code')=:'wa','accepting again is harmless');
SELECT pg_temp.ok((SELECT role='editor' AND active AND NOT can_approve FROM sw_workspace_memberships WHERE workspace_id=:'wa' AND user_id='57000000-0000-4000-8000-000000000006'),'the invitee becomes exactly what was offered');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_missions WHERE id=:'r'),'a new member does not see restricted missions');

-- Ownership is not an editing right: it administers the circle (review finding on #498).
SELECT pg_temp.login('57000000-0000-4000-8000-000000000002');
INSERT INTO sw_missions(workspace_id,kind,title,restricted,owner_id) VALUES(:'wa','risk_assessment','Restricted circle ownership',true,'57000000-0000-4000-8000-000000000002') RETURNING id AS rc \gset
SELECT sw_set_mission_member(:'wa',:'rc','57000000-0000-4000-8000-000000000006',true);
SELECT pg_temp.login('57000000-0000-4000-8000-000000000006');
SELECT pg_temp.ok((SELECT count(*)=1 FROM sw_missions WHERE id=:'rc'),'an ordinary editor in the circle sees the restricted mission');
SELECT pg_temp.fail(format('UPDATE sw_missions SET owner_id=%L WHERE id=%L','57000000-0000-4000-8000-000000000006',:'rc'),'42501','an ordinary mission editor cannot make themself the owner');
SELECT pg_temp.fail(format('SELECT sw_set_mission_member(%L,%L,%L,true)',:'wa',:'rc','57000000-0000-4000-8000-000000000003'),'42501','an ordinary mission editor cannot add another member to the circle');
SELECT pg_temp.ok((SELECT owner_id='57000000-0000-4000-8000-000000000002' FROM sw_missions WHERE id=:'rc') AND (SELECT count(*)=2 FROM sw_mission_members WHERE mission_id=:'rc'),'the refused attempts changed neither the owner nor the circle');
UPDATE sw_missions SET next_action='Collect site evidence' WHERE id=:'rc';
SELECT pg_temp.ok((SELECT next_action='Collect site evidence' FROM sw_missions WHERE id=:'rc'),'a circle member can still edit the mission itself');
SELECT pg_temp.login('57000000-0000-4000-8000-000000000002');
SELECT pg_temp.fail(format('UPDATE sw_missions SET owner_id=%L WHERE id=%L','57000000-0000-4000-8000-000000000003',:'rc'),'23514','ownership of a restricted mission cannot go to someone outside its circle');
UPDATE sw_missions SET owner_id='57000000-0000-4000-8000-000000000006' WHERE id=:'rc';
SELECT pg_temp.ok((SELECT owner_id='57000000-0000-4000-8000-000000000006' FROM sw_missions WHERE id=:'rc') AND (SELECT count(*)=1 FROM sw_mission_events WHERE mission_id=:'rc' AND event='owner_changed'),'the creator transfers ownership to a member of the circle, recorded in its history');
SELECT pg_temp.login('57000000-0000-4000-8000-000000000006');
SELECT pg_temp.ok(sw_set_mission_member(:'wa',:'rc','57000000-0000-4000-8000-000000000003',true),'the new owner administers the circle');
UPDATE sw_missions SET owner_id='57000000-0000-4000-8000-000000000002' WHERE id=:'rc';
SELECT pg_temp.ok((SELECT owner_id='57000000-0000-4000-8000-000000000002' FROM sw_missions WHERE id=:'rc'),'the current owner may hand ownership on');
SELECT pg_temp.fail(format('SELECT sw_set_mission_member(%L,%L,%L,false)',:'wa',:'rc','57000000-0000-4000-8000-000000000003'),'42501','a former owner no longer administers the circle');
SELECT pg_temp.login('57000000-0000-4000-8000-000000000001');
SELECT sw_create_invitation(:'wa','57000000-0000-4000-8000-000000000061','late@example.test','viewer',false)->>'code' AS code2 \gset
SELECT pg_temp.ok(sw_revoke_invitation(:'wa','57000000-0000-4000-8000-000000000061'),'an owner revokes an open invitation');
RESET ROLE;
INSERT INTO auth.users(id,email,email_confirmed_at) VALUES('57000000-0000-4000-8000-000000000007','late@example.test',now());
INSERT INTO auth.sessions(id,user_id,not_after) VALUES('57000000-0000-4000-8000-000000000007','57000000-0000-4000-8000-000000000007',now()+interval '1 day');
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('57000000-0000-4000-8000-000000000007');
SELECT pg_temp.fail(format('SELECT sw_accept_invitation(%L)',:'code2'),'42501','a revoked invitation cannot be accepted');
RESET ROLE;
SELECT pg_temp.login('57000000-0000-4000-8000-000000000001');
INSERT INTO sw_invitations(id,workspace_id,email,role,token_hash,invited_by,created_at,expires_at) VALUES('57000000-0000-4000-8000-000000000062',:'wa','late@example.test','viewer',sw_private.hash_text('expired-synthetic-code'),'57000000-0000-4000-8000-000000000001',now()-interval '10 days',now()-interval '3 days');
SET LOCAL ROLE authenticated;
SELECT pg_temp.login('57000000-0000-4000-8000-000000000007');
SELECT pg_temp.fail('SELECT sw_accept_invitation(''expired-synthetic-code'')','42501','an expired invitation cannot be accepted');

-- Roles
SELECT pg_temp.login('57000000-0000-4000-8000-000000000002');
SELECT pg_temp.fail(format('SELECT sw_set_member_role(%L,%L,''owner'',true,true)',:'wa','57000000-0000-4000-8000-000000000002'),'42501','an editor cannot promote themself');
SELECT pg_temp.login('57000000-0000-4000-8000-000000000001');
SELECT pg_temp.fail(format('SELECT sw_set_member_role(%L,%L,''editor'',true,true)',:'wa','57000000-0000-4000-8000-000000000001'),'23514','the last active owner cannot step down');
SELECT pg_temp.fail(format('SELECT sw_set_member_role(%L,%L,''viewer'',true,true)',:'wa','57000000-0000-4000-8000-000000000003'),'23514','a viewer cannot approve');
SELECT pg_temp.ok(sw_set_member_role(:'wa','57000000-0000-4000-8000-000000000003','viewer',false,false),'an owner deactivates a member');
SELECT pg_temp.ok((SELECT count(*)>=1 FROM sw_audit_events WHERE workspace_id=:'wa' AND entity_table='sw_workspace_memberships' AND entity_id='57000000-0000-4000-8000-000000000003' AND operation='UPDATE' AND actor_user_id='57000000-0000-4000-8000-000000000001'),'the role change is audited against the owner');
SELECT pg_temp.login('57000000-0000-4000-8000-000000000003');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_missions WHERE workspace_id=:'wa') AND (SELECT count(*)=0 FROM sw_operating_profiles WHERE workspace_id=:'wa'),'a deactivated member reads nothing');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_list_members(:'wa')),'a deactivated member lists nobody');
SELECT pg_temp.login('57000000-0000-4000-8000-000000000002');
SELECT pg_temp.ok((SELECT count(*)=3 FROM sw_list_members(:'wa')) AND NOT EXISTS (SELECT 1 FROM sw_list_members(:'wa') WHERE NOT active),'a member lists active colleagues only');
SELECT pg_temp.login('57000000-0000-4000-8000-000000000004');
SELECT pg_temp.ok((SELECT count(*)=0 FROM sw_list_members(:'wa')) AND (SELECT count(*)=0 FROM sw_invitations WHERE workspace_id=:'wa'),'another workspace sees no members or invitations');
RESET ROLE;

\if :{?sw_context_keep_fixture}
\else
ROLLBACK;
\endif
