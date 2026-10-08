-- READ ONLY: release parity observation. Compare these twelve function bodies,
-- arguments/defaults, owner, ACL and config with an exact-head disposable replay.
-- The prior snapshot20-function selector still applies, with acknowledge's
-- expected current definition regenerated from the new full canonical replay.
SELECT p.oid::regprocedure::text AS signature,
 encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex') AS definition_sha256,
 pg_get_userbyid(p.proowner) AS owner,
 p.proacl::text AS acl,
 p.proconfig,
 p.proargnames,
 pg_get_function_arguments(p.oid) AS arguments_with_defaults,
 p.prosecdef
FROM pg_proc p
WHERE p.oid IN (
 'public.scp_iv_save_session_process(uuid,text,text,timestamp with time zone)'::regprocedure,
 'public.scp_iv_review_manual_finding(uuid,bigint,text,text,text,text,date)'::regprocedure,
 'public.scp_iv_acknowledge_observed_content(uuid,text,text)'::regprocedure,
 'public.scp_iv_set_session_state(uuid,text,text,text,text)'::regprocedure,
 'public.scp_iv_guard_finding_revision()'::regprocedure,
 'public.rec_set_recruitment_responsible(uuid,uuid,integer)'::regprocedure,
 'public.rec_complete_recruitment(uuid,text,text,integer)'::regprocedure,
 'public.rec_set_application_responsible(uuid,uuid,integer)'::regprocedure,
 'public.rec_set_application_stage(uuid,text,text,text)'::regprocedure,
 'public.rec_save_booking(uuid,uuid,timestamp with time zone,integer,text,text,text,text,text,integer)'::regprocedure,
 'public.rec_set_booking_status(uuid,text,text,integer)'::regprocedure,
 'public.rec_set_receipt_settings(uuid,boolean,text,text,text,text,integer)'::regprocedure
) ORDER BY signature;

SELECT c.oid::regclass::text AS relation, c.relrowsecurity,
 has_table_privilege('anon',c.oid,'SELECT') AS anon_select,
 has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select,
 has_table_privilege('service_role',c.oid,'SELECT') AS service_select,
 (SELECT count(*) FROM scp_private.interview_conflict_prior_functions) AS stored_definitions
FROM pg_class c WHERE c.oid='scp_private.interview_conflict_prior_functions'::regclass;
