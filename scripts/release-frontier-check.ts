import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "supabase/migrations");
const parkedDir = path.join(root, "supabase/archive/parked-migrations");
const state = JSON.parse(readFileSync(path.join(root, "supabase/release-state.json"), "utf8")) as {
  frontier: { file: string; hostedState: string; evidenceSource?: string }[];
};

// Empty is the steady state. A name here is a migration that is SUPPOSED to be
// waiting, and each one has to earn its place: leaving a name behind after it
// is applied hides a genuinely stuck migration behind an expectation, which is
// what this list exists to prevent.
//
// 20261102090000_cv_documents_controlled_writes and
// 20261103090000_cv_documents_lockdown are APPLIED. The owner project
// received both through the official Supabase GitHub integration after their
// reviewed PRs merged. release-state.json and hosted-ledger.json record the
// production evidence, so main correctly has no expected pending migration.
//
// 20261105090000_scp_participant_report_issuer_preview and
// 20261107090000_scp_iv_report_basis_integrity are APPLIED. Both reached the
// owner project through the official Supabase GitHub integration after #213
// merged to main as 9d36f6a6, are recorded in supabase_migrations under their
// canonical versions, and were verified read-only afterwards.
// release-state.json and hosted-ledger.json carry that production evidence,
// so this branch correctly expects no pending migration: the schema is ahead
// of the code, which is the order the schema-first policy exists to keep.
//
// Their names come OFF this list rather than being left behind, because a
// resolved name here hides the next genuinely stuck migration behind an
// expectation -- the failure this list exists to prevent.
//
// 20261108090000_beskt_governed_method_content,
// 20261109090000_sp_pilot_catalogue_visibility and
// 20261110090000_bcp_candidate_preparation are APPLIED. All three reached the
// owner project through the official Supabase GitHub integration after #221
// merged to main as 8ba7635c, and each is recorded in supabase_migrations under
// its canonical version and slug rather than a generated uuid. They were then
// verified read-only against production: the hosted function bodies are
// byte-identical to the merged migration sources, every declared column, index,
// trigger and constraint exists, the BCP tables carry ENABLE and FORCE RLS with
// no table write for any role, the two oracle helpers are executable by
// service_role only, and all nineteen new tables hold zero rows.
// release-state.json and hosted-ledger.json carry that production evidence.
//
// They came off this list in the same change that recorded the evidence, so the
// list is empty again except for what is genuinely still waiting. Note for
// anyone reading the versions: 20261110 rather than 20261109 for the
// candidate-preparation runtime is deliberate, because Supabase keys
// schema_migrations by the numeric prefix alone and the Passport correction
// already holds 20261109090000 -- two files sharing one version means the
// second is silently treated as already applied.
//
// 20261111090000_sp_global_professional_certifications is APPLIED. It reached
// the owner project through the official Supabase GitHub integration after #224
// merged to main as 218c3c436be70f4c32d49e9d7e2bf12b5f090b5e, and is recorded in
// supabase_migrations under its canonical version and slug rather than a
// generated uuid, directly above 20261110090000. It was then verified read-only
// against production: all five function bodies are byte-identical to the merged
// source by md5(prosrc), the fourteen reviewed definitions and five issuers are
// seeded exactly, Sweden is still the only active market pack, no INTL_ holder
// claim and no lifecycle row exists, and the lifecycle trust boundary holds --
// authenticated has SELECT and no INSERT, UPDATE or DELETE, anon and PUBLIC have
// nothing, the single policy is SELECT-only, and only authenticated may execute
// sp_certification_lifecycle_declare, which is SECURITY DEFINER with a pinned
// search_path. release-state.json and hosted-ledger.json carry that evidence.
//
// It took 20261111 rather than 20261110 because bcp_candidate_preparation
// reached main first and holds that version -- the same one-version-one-file
// rule the paragraph above is about, met as a real collision rather than a
// hypothetical.
//
// Its name comes OFF this list in the same change that records the evidence, for
// the reason stated above: a resolved name here hides the next genuinely stuck
// migration behind an expectation. The list was empty again.
//
// Empty again after BESKT PR 4 and again after PR 5A: the interview-case
// bridge and the interview conduct layer were both applied to production by
// the Supabase GitHub integration when #229 and #233 merged, and
// release-state.json records each with evidence. A name left here after its
// migration is applied would hide the next genuinely stuck migration behind an
// expectation.
//
// 20261114090000_sp_global_certification_governed_issuer was applied by the
// official integration after #230 merged and now has hosted evidence in
// release-state.json. No active migration remains pending.
//
// Pilot blocker 2: the interview-method library employer read boundary
// (20261115090000) was applied to production by the official integration when
// #241 merged, and release-state.json now records it as applied with read-only
// evidence. Its name comes off this list in that same change, as planned, so
// an applied migration cannot sit here masking the next genuinely stuck one.
// 20261116090000_cd_outstanding_reviews_operator_only was applied by the
// official integration when PR #252 merged, and PR #253 recorded its hosted
// evidence.
//
// BESKT PR 6 (20261117090000, merged as #254) and BESKT PR 7 (20261118090000,
// merged as #255) were applied by that same integration on merge, and this
// change records their hosted evidence in release-state.json and
// hosted-ledger.json -- so both come off this list HERE, in the same change
// that records it, exactly as planned. A merge alone would never have been
// enough, and an applied migration left on this list would mask the next
// genuinely stuck one.
//
// PR #258 applied and verified through the connector; canonical history alias verified.
//
// PR #264 (Security Passport pilot finish) carries two EXPAND migrations that
// are pending BY DESIGN until it merges and the official Supabase GitHub
// integration applies them: 20261124090000_sp_pilot_member_catalogue (the
// approved catalogue's market clause honours an internal-pilot entitlement;
// the definition clause is unchanged) and
// 20261125090000_sp_disclosure_definition_scope (sp_credential_payload_v2
// emits the governed definition's scope_code). Both replace a body and
// introduce no object; release-state.json records each as pending with its
// verify SQL and rollback. Both names come OFF this list in the change that
// records their hosted evidence, for the reason stated throughout: a resolved
// name left here hides the next genuinely stuck migration.
//
// 20261126090000_sp_catalogue_scope_and_document_issuer rides the same PR and
// is pending for the same reason: it replaces the catalogue view, the governed
// save RPC, the table guard and the payload body, and seeds the Dubai
// organisation roles. It introduces no object and approves no definition.
//
// 20261124090000 and 20261125090000 were applied by the official integration when
// #264 merged as 2a76c81, verified read-only in the hosted ledger on 2026-09-18
// and recorded with that evidence in release-state.json and hosted-ledger.json.
// Both names come OFF this list here, in the same change, as planned. One name
// remains, pending by design until PR #265 merges.
//
// 2026-09-18, after PR #266 merged as 50bf5de: 20261126090000 (applied when
// #265 merged), 20261127090000 and 20261128090000 were verified read-only in
// the hosted ledger -- the two security fixes by their function bodies as well
// -- and recorded with that evidence in release-state.json and
// hosted-ledger.json. All three come OFF this list here. Nothing is pending.
//
// 20261127090000_bcp_conduct_report_independence_boundary WAS GENUINELY PENDING,
// and this is the list saying so out loud rather than a migration quietly
// waiting. It is a security fix to two functions 20261117090000 already put
// live: bcp_conduct_preview_report never applied the independence rule, and
// bcp_conduct_report_blockers applied no authorisation at all.
//
// Its name comes OFF this list in the same change that records its hosted
// evidence in release-state.json and hosted-ledger.json -- never before, and
// never in the pull request that merely merges it. An applied migration left
// here would mask the next genuinely stuck one, and a pending migration
// missing from here is exactly the silence this check exists to break.
//
// 20261128090000_scp_iv_case_candidate_binding rides the same security PR
// (#266) and is pending for the same reason: scp_iv_create_case never checked
// the candidate account it was given. Its name comes OFF this list in the
// change that records its hosted evidence, never before.
//
// 20261129090000_bcp_internal_test_activation (the owner's internal test
// activation for BESKT, PR #268) was applied by the integration and its hosted
// evidence recorded on 2026-09-19, so it is off this list.
// 20261130090000_bcp_beskt_complete is GENUINELY PENDING: BESKT as a complete
// product (owner decision of 2026-09-19). Its name comes OFF this list in the
// change that records its hosted evidence, never before.
// 20261130090000_bcp_beskt_complete (BESKT as a complete product, PR #270) was
// applied by the integration and its hosted evidence recorded on 2026-09-19, so
// it is off this list.
// 20261201090000_scp_library_direct_access (the library's direct access and
// recruitment setup, PR #272) was applied by the integration and its hosted
// evidence recorded on 2026-09-19, so it is off this list.
// PR #274 merged as 1631d5d3; both 20261202090000 and 20261203090000
// were verified read-only in owner production on 2026-09-19. Function bodies,
// RLS, policy, grants, content link and unique index match the merged source.
// release-state.json and hosted-ledger.json record the evidence and limits.
// 20261204090000 (HAYAT assessments) is a schema-only release: pending until the
// integration applies it on merge and its hosted evidence is recorded, at which
// point it comes off this list in the same change that marks it applied.
// It was applied and recorded on 2026-09-21, so it is off this list.
// 20261205090000 (workforce records require an approved organisation) and
// 20261206090000 (a development assignment carries the employment record) are
// the schema half of the employer lifecycle phases 1-3. PR #280 merged as
// 1c987a3 and the integration applied both; each was verified read-only on
// 2026-09-23 -- the hosted ledger carries the canonical version and slug, both
// function bodies are byte-identical to the merged source by md5, and neither
// apply changed a row. They come off this list in the same change that marks
// them applied, which is this one.
// 20261207090000 (the recruitment workspace, EXPAND) merged alone as PR #282
// (c96acf2) and the integration applied it; verified read-only on 2026-09-23
// -- canonical version and slug in the hosted ledger, all 21 rec_* function
// bodies byte-identical to the merged source by md5, the two CONTRACT
// triggers absent as intended, and no row changed. It came off this list in
// the change that marked it applied.
// 20261208090000 (its CONTRACT half, the job_applications backstops) merged as
// PR #284 (20f49eb) after the application was published; the integration
// applied it and it was verified read-only on 2026-09-23 -- canonical version
// and slug, both trigger bodies byte-identical by md5, no row changed. It
// comes off this list in the same change that marks it applied.
// PR #286 (20261209090000) was verified applied read-only after merge;
// docs/security-intelligence/hosted-baseline.md records ledger and body digests.
// PR #287 (20261210090000) merged as 14e2567. Read-only verification on
// 2026-09-24 matched all 16 tables and 11 functions, their grants, policies,
// constraints and triggers to isolated replay. Data API rejects sw_private.
// Evidence: docs/security-intelligence/hosted-application.md.
// PR #289 merged as 91c788c. Read-only verification on 2026-09-24 matched
// all 32 Security Work tables, 42 functions, methods/templates and private
// Storage contracts to isolated replay. The fresh 313-entry hosted ledger
// and release-state record the proof, not just the merge.
// Evidence: docs/security-intelligence/analysis-hosted-verification.md.
// PR #295 (20261213090000, automatic application receipts) merged as 1f4e620
// and the integration applied it; verified read-only on 2026-09-25 --
// canonical version and slug as the 315th ledger row, all 13 function bodies
// byte-identical to the merged source by md5, claim/settle/recovery executable
// by service_role only, no row changed. It comes off this list in the same
// change that marks it applied.
// The India entry schema (PR #297: 20261214090000 national qualifications,
// 20261215090000 candidate location and destinations) merged as cb12fcb and
// the integration applied it; verified read-only on 2026-09-26 -- canonical
// versions and slugs as the 316th and 317th ledger rows, all eight function
// bodies and the catalogue view byte-identical to the merged source by md5,
// every declared verify statement as expected, no personal row changed. Both
// come off this list in the same change that marks them applied. Nothing is
// pending.
// 2026-09-27: all three verified applied; security canonical alias reconciled.
// Evidence: docs/security/2026-09-27/reconciliation/README.md.
// Assessment authoring (#309) is now verified applied on the owner project:
// canonical ledger row, four matching function bodies, column and both triggers.
// Evidence: docs/release/2026-09-27-assessment-authoring-hosted-verification.md.
// PR 2 of the Passport completion work order: public-pilot availability and
// the operation policy. PR 4: the UK and Dubai opened as a public pilot (data
// only; needs PR 2). Each is pending BY DESIGN until it merges and the official
// integration applies it; its name comes off this list in the change that
// records its hosted evidence.
// 20261223090000_application_notes_employer_only (JB-02 of the 2026-09-28 UAT:
// the employer's note on an application is no longer readable by the
// applicant through the API) is pending BY DESIGN until its PR merges and the
// official integration applies it. Its name comes off this list in the change
// that records its hosted evidence.
// 2026-09-28: all three verified applied read-only on the owner project after
// #323 merged as 10efc1b -- 20261220090000 and 20261221090000 (the Passport
// PR 2 and PR 4 rows the integration applied when #315 and #317 merged; the
// refreshed 325-row hosted ledger already held them, and a resolved name left
// here would have hidden the next real one) and 20261223090000 (JB-02
// EXPAND: both employer read functions and rec_submit_application byte-
// identical to the merged file by md5(prosrc), grants right, no privilege
// moved). release-state.json and hosted-ledger.json carry the evidence.
// Evidence: docs/release/2026-09-28-jb02-expand-hosted-verification.md.
// 2026-09-29: the three UAT fix migrations verified applied read-only on the
// owner project, each right after its PR merged and the official integration
// applied it -- 20261222090000 (cd_access_policy, #322 as 76bd20b; ships in
// internal_test, nobody's access changed), 20261224090000
// (candidate_application_context, #324 as c195732; one definer read, no
// policy changed) and 20261225090000 (assessment_assign_requires_open_
// application, #325 as 5a9a3ec; scp_employer_assign replaced, body byte-
// identical to the merged file). release-state.json and hosted-ledger.json
// carry the evidence.
// Evidence: docs/release/2026-09-29-cd-jb01-as01-hosted-verification.md.
// 2026-09-29 13:30 UTC: the JB-02 CONTRACT half (20261226090000, #330 as
// a2061fe, owner-merged after the site was published with #329) verified
// applied read-only: the two note columns are out of the authenticated
// grant, the applicant is refused on the column and by both reads, the
// owning employer's member and a platform admin read through the functions,
// another employer's member and anon are refused. release-state.json and
// hosted-ledger.json carry the evidence.
// Evidence: docs/release/2026-09-29-jb02-contract-hosted-verification.md.
// 2026-10-01 13:06 UTC: 20261227090000 (sp_network_statistics, #345 as 1c0fd8e;
// ships HIDDEN -- sp_network_stats() returns no number until the owner
// publishes) verified applied read-only: both tables have RLS and no policy and
// no client privilege, the function bodies equal the merged file, anon holds
// EXECUTE on sp_network_stats() only, and the Passport tables are unchanged.
// release-state.json and hosted-ledger.json carry the evidence.
// Evidence: docs/release/2026-10-01-passport-network-statistics-hosted-verification.md.
// 2026-10-01 17:13 UTC: 20261228090000 (scp_response_option_ownership, the P0
// of the pre-release security audit, #348 as 2bbc64a) verified applied
// read-only: the three item-option keys exist and are validated, the
// scp_save_response body equals the merged file, 0 of 682 stored responses
// name another item's option, and a rolled-back probe as a real participant
// is refused a foreign and a fabricated option and accepted its own.
// release-state.json and hosted-ledger.json carry the evidence.
// Evidence: docs/release/2026-10-01-p0-response-option-ownership-hosted-verification.md.
// 2026-10-01 19:34 UTC: 20261229090000 (scp_delivery_answer_key_leak, the
// release-blocking answer-key fix, #351 as 6748588) verified applied
// read-only: both function bodies equal the merged file, the delivery payload
// builds no key-like field, the seeding helper is owner-only, the seed guard
// is enabled, no unanswered seedless attempt on a randomised form remains,
// 682 responses are unchanged, and a rolled-back probe as a real participant
// is served options carrying exactly option_id and label.
// release-state.json and hosted-ledger.json carry the evidence.
// Evidence: docs/release/2026-10-01-delivery-answer-key-leak-hosted-verification.md.
// 2026-10-01 20:34 UTC: 20261230090000 (job_application_insert_boundary,
// P1-1 and P1-2 of the pre-release security audit, #353 as e81a1dc) verified
// applied read-only: the insert policy and the 13-column INSERT grant equal
// the merged file, anon holds no INSERT, 14 applications are unchanged with
// 0 off the path rule, and a rolled-back probe as a real candidate is refused
// a CV path in another applicant's folder and accepted in its own.
// release-state.json and hosted-ledger.json carry the evidence.
// Evidence: docs/release/2026-10-01-job-application-insert-boundary-hosted-verification.md.
// 2026-10-01 20:49 UTC: 20261231090000 (scp_resolve_employment_owner_only,
// P1-3 of the pre-release security audit, #354) verified applied read-only:
// the binding helper's ACL is its owner alone, its body is unchanged, both
// callers are SECURITY DEFINER under the same owner, bindings are unchanged
// (2 of 5), and a rolled-back probe as a signed-in non-member is refused
// (42501) with nothing bound.
// release-state.json and hosted-ledger.json carry the evidence.
// Evidence: docs/release/2026-10-01-employment-binding-owner-only-hosted-verification.md.
// 2026-10-02 05:52 UTC: 20270101090000 (catalogue_read_hardening, #355)
// verified applied read-only: the four read predicates equal the merged file,
// 41 USING (true) catalogue reads remain (was 45), the three catalogues carry
// no client write privilege, anon reads none of the four, row counts are
// unchanged, and a rolled-back probe shows a candidate and a non-author
// employer 0 drafts, 0 unapproved professions and 0 guide prompts while an
// admin reads every row.
// release-state.json and hosted-ledger.json carry the evidence.
// Evidence: docs/release/2026-10-02-catalogue-read-hardening-hosted-verification.md.
// 2026-10-02 ~10:45 UTC: the six security-gate fixes (P0-1 #358, P1-1 #359,
// P1-2 #360, P1-3 #361, P1-4 #363, P1-5 #362) verified applied read-only:
// 20270102090000 .. 20270107090000 are in the ledger (341 rows, digest
// 1adae30d18655a674a605ea1cf8b500d), every deployed function body equals its
// merged source, the reshaped grants and policies are exactly as merged, and a
// rolled-back probe of each fix as real principals found no cross-employer,
// cross-holder or learning-run leak.
// release-state.json and hosted-ledger.json carry the evidence.
// Evidence: docs/release/2026-10-02-security-gate-blockers-hosted-verification.md.
// 2026-10-02 ~18:40 UTC: the nine re-audit fixes (P1-B 1/5-5/5 #365 #368
// #370 #371 #373, P1-D #374, P1-E #369, P1-F #366, P1-C #367) verified
// applied read-only: 20270108090000 .. 20270116090000 are in the ledger (350
// rows, digest 29249f9a262f9f33b0139403caa3293d; the first 341 unchanged), every deployed
// function body equals its merged source, policies, grants and constraints
// are exactly as merged, and a rolled-back probe of each fix as real
// principals found no suspended- or pending-organisation access, no
// cross-holder Passport write and no forged verification stamp.
// release-state.json and hosted-ledger.json carry the evidence.
// Evidence: docs/release/2026-10-02-reaudit-p1-fixes-hosted-verification.md.
// 2026-10-02 19:41 UTC: 20270117090000_security_work_programme (#376, merge
// 1611135) verified applied read-only: ledger 351 rows, digest
// d51e277eb053ef50833765ebb9f751b0 (the first 350 unchanged), the three
// sw_private guards equal to the merged file, ten RLS tables with the merged
// policies, anon and service_role without privilege, and a rolled-back probe
// as a non-member reading nothing and writing nothing.
// Evidence: docs/release/2026-10-02-security-work-programme-hosted-verification.md.
// 2026-10-02 ~22:38 UTC: the six final-audit P1 fixes (P1-L #377, P1-H #378,
// P1-G #379, P1-K #380, P1-J #381, P1-I #382) verified applied read-only:
// 20270118090000 .. 20270123090000 are in the ledger (357 rows, digest
// f4f87e56322142f2ac03b5eda5c1cfae; the first 351 unchanged), every deployed function
// body equals its merged source, grants are exactly as merged, and a
// rolled-back probe of each fix as real principals found no forged
// assignment result, no edit under review, no role escalation through the
// access queue, no vetting erasure outside the security function, no
// reopen after exposure and no identity change that stays approved.
// release-state.json and hosted-ledger.json carry the evidence.
// Evidence: docs/release/2026-10-02-final-audit-p1-fixes-hosted-verification.md.
// 2026-10-03 ~06:54 UTC: #384 (merge 7ff0cbe) verified applied read-only:
// 20270124090000_bcp_conduct_exposure_is_durable and
// 20270125090000_sp_decision_bound_to_reviewed_content are in the ledger
// (359 rows, digest 52e21ce44d6964ae72605bdf2b67817a; the first 357
// unchanged), every deployed function body equals a local replay of main,
// triggers, the answered_at column and grants are exactly as merged. No
// production write probe was run; behaviour is proven by the suites, negative
// controls and races on the identical bodies.
// Evidence: docs/release/2026-10-03-beskt-exposure-and-passport-review-hosted-verification.md.
// 2026-10-03 ~10:00 UTC: #388 (merge d26e656) verified applied read-only:
// 20270126090000_sp_evidence_change_under_review is in the ledger (360 rows,
// digest dcb7e4bcb694e2afece115a18a595383; the first 359 unchanged) and
// sp_attach_evidence equals a local replay of main, grants unchanged. No
// production write probe was run.
// Evidence: docs/release/2026-10-03-passport-evidence-change-under-review.md.
// 2026-10-03 ~15:45 UTC: #387 (merge b18e5e5, every mandatory CI job green on
// 082752c) verified applied read-only: 20270130090000_jobs_not_editable_in_place,
// 20270131090000_jobs_publish_window_and_url_scheme and
// 20270201090000_job_cvs_no_client_writes are in the ledger (363 rows, digest
// fbfc766e1fd85a3d19fc82b8f4fbc8c7; the first 360 unchanged),
// jobs_validate_before_write is md5 bc292d28d31dd973c81f1cffc145b5bf with no
// EXECUTE for anon or authenticated, and the job-application-cvs bucket has
// exactly one policy, job_cvs_employer_select. No production write probe was
// run.
// Evidence: docs/release/2026-10-03-job-board-hosted-verification.md.
// 2026-10-03 ~16:50 UTC: #396 (merge 2b5015d, every mandatory CI job green on
// e7b5a3d) verified applied read-only: 20270202090000_employer_membership_
// standing_not_bypassable, 20270203090000_employer_report_access_model and
// 20270204090000_interview_case_access_model are in the ledger (366 rows,
// digest ae6f49cb25fa072932ae6aaf8d2b4ddc; the first 363 unchanged); all 25
// function bodies equal a strict local replay, no function is executable by
// anon, the two triggers are enabled, the seven policies name the new gate and
// the interview-case policy names scp_iv_can_read_case. No production write
// probe was run.
// Evidence: docs/release/2026-10-03-report-access-hosted-verification.md.
// 2026-10-03 ~19:55 UTC: #392 (merge d2c02b8, every mandatory CI job green on
// aa8e7a5) verified applied read-only: 20270205090000_employer_new_application_
// notices is the last ledger row (367 rows, digest 77e07c074bb73aac9ac11a569b5ca214;
// the first 366 unchanged, digest ae6f49cb25fa072932ae6aaf8d2b4ddc); all six
// function bodies equal a strict local replay, none is executable by anon or
// authenticated, the outbox has RLS enabled and forced, no policy, no trigger,
// no client privilege (service_role SELECT only) and 0 rows. No production write
// probe was run. Nothing is pending by design any more: the application half
// (#393) is published AFTER this, and the transactional-email function
// (employer_new_application) is verified in production before that publication.
// Evidence: docs/release/2026-10-03-employer-notice-hosted-verification.md.
// #404 / 20270206090000 verified applied read-only at 2026-10-03T21:11:18.678365+00:00.
// Evidence: docs/security/interview-access/expand-hosted-verification.md.
// 2026-10-04 ~06:20 UTC: #406 (merge e022ec52, every mandatory CI job green on b4dc4e0e)
// verified applied read-only, after the scoped application (#405) was published and
// (according to the production session) verified in the running app: 20270207090000_interview_ai_config_contract is the last ledger row (369 rows,
// digest 01357df572629d745e667d2fedb20ba1; the first 368 unchanged, digest
// c086806d9fb5f0c92609678f037b73ba); scp_interview_ai_config_read is limited to
// is_platform_admin(auth.uid()), the grants are unchanged (authenticated SELECT only, no
// client write), the functions that read the table are unchanged. Nothing is pending by
// design now. Evidence: docs/release/2026-10-04-interview-config-contract-hosted-verification.md.
// 2026-10-04 07:56 UTC: #416 (merge abbc036e, every mandatory CI job green on fbc6e4c3)
// verified applied read-only: 20270208090000_account_erasure_credential_details is the
// last ledger row (370 rows, digest 538769fe5724a0d4561a645d3faf79d6; the first 369
// unchanged, 01357df572629d745e667d2fedb20ba1); admin_delete_user_if_safe and the new
// extraction trigger function equal the strict local replay; the shared append-only
// function is unchanged. Nothing is pending by design now.
// Evidence: docs/release/2026-10-04-account-erasure-hosted-verification.md.
// 2026-10-04 08:46 UTC: #410 (merge 277cb842, every mandatory CI job green on 3f824835)
// verified applied read-only: 20270212090000_sp_catalogue_research_foundation and
// 20270213090000_sp_catalogue_research_import are the last two ledger rows (372 rows,
// digest 868e9c610f78ced1c5f529596ca273c2; the first 370 unchanged, 538769fe5724a0d4561a645d3faf79d6);
// the five catalogue functions and the provenance trigger function equal the strict local
// replay, the three new tables carry RLS with authenticated SELECT only, 170 research records
// (14 matched, 140 added, 16 retained), 140 new definitions all inactive, 217 credential types
// of which 26 active. Nothing is pending by design now: the publication that makes exactly
// those 140 selectable (20270214090000) is staged outside the migration path until the
// application that renders them is published.
// Evidence: docs/release/2026-10-04-catalogue-schema-hosted-verification.md.
// 2026-10-04 09:47 UTC: #412 (merge 3e3a66c6, every mandatory CI job green on 1d06c8a8)
// verified applied read-only: 20270214090000_sp_catalogue_research_publish is the last
// ledger row (373 rows, digest 339b270ff57e60c0e7e024081e3102bd; the first 372 unchanged,
// 868e9c610f78ced1c5f529596ca273c2). Exactly the 140 researched definitions are active (166
// credential types active, 154 international), and every other credential-type column, market
// pack, pilot member, definition table and claim equals its fingerprint from before the apply.
// That catalogue publication left nothing pending.
// Evidence: docs/release/2026-10-04-catalogue-publication-hosted-verification.md.
// F09 applied once as hosted 20261004164027; see 2026-10-04 guard verification.
// Owner-authorized canonical alias verified; deploy-plan independently proves an empty plan.
// 2026-10-05 07:27 UTC: 20270216090000 (participant_report_api_boundary, #429)
// and 20270217090000 (sp_passport_number_and_social_share, #430 as f1faa5e) were
// applied by the official integration and verified read-only: ledger 377 rows,
// the first 375 unchanged; every function body equals the strict local replay;
// grants, RLS and the closed boundary are as reviewed; nothing was written and
// the statistics stay hidden. Nothing is pending.
// Evidence: docs/release/2026-10-05-passport-number-and-public-share-hosted-verification.md.
// USA 20270219090000 is applied and verified read-only (379 hosted identities).
// Evidence: docs/release/2026-10-06-united-states-hosted-verification.json.
// Official integration applied Abu Dhabi and Sentinel; read-only verification
// 2026-10-06: 381 identities. See sentinel-hosted-verification.json.
// Application retention (#444) was installed by the official integration and
// verified read-only on 2026-10-06. #445 records the hosted evidence and removes
// the pending expectation; worker, cron and erasure activation remain off.
// RI v0.3 P0 schema is reviewed locally; no hosted write is authorised.
const expectedPending: string[] = [
  "20270306090000_recruiter_intelligence_interview_foundation.sql",
];

const hostedIdentities = [
  "20260904134520_scp_trust_evidence_report_r2a_audience_reads.sql",
  "20260904171840_scp_trust_evidence_report_r2a_report_version_continuity.sql",
  "20260904174903_scp_trust_evidence_report_r2a_contract.sql",
  "20260905053344_scp_option_order_per_attempt.sql",
  "20260905053809_scp_release_facet_resolution.sql",
  "20260905054603_scp_trust_evidence_report_r1_provenance.sql",
  "20260906125945_scp_trust_evidence_report_r3a_contract.sql",
  "20260907071826_6c070461-aa51-4d78-8ed0-a82294f12489.sql",
  "20261028090000_admin_cancel_assignment_error_contract.sql",
  "20261030090000_sp_trust_source_containment.sql",
  "20261031090000_sp_passport_first_merit.sql",
  // Applied 2026-09-08 as hosted 20260908043205 / b315714c-…; the canonical
  // file stays in the active path because it is the reviewed record of what
  // production ran.
  "20261101090000_sp_selected_merit_sharing.sql",
];
const retiredCanonicalIdentities = [
  "20261021090000_scp_option_order_per_attempt.sql",
  "20261024090000_scp_trust_evidence_report_r2a_audience_reads.sql",
  "20261025090000_scp_trust_evidence_report_r2a_report_version_continuity.sql",
  "20261026090000_scp_trust_evidence_report_r2a_contract.sql",
  "20261026093000_scp_release_facet_resolution.sql",
  "20261027090000_scp_trust_evidence_report_r1_provenance.sql",
  "20261029090000_scp_trust_evidence_report_r3a_contract.sql",
];
const hostedLedgerMarkers = [
  "20261004164027_application_passport_verified_content_guard.sql",
  "20260927124146_client_table_privilege_hardening.sql",
  "20260904190901_scp_trust_evidence_report_r1_provenance.sql",
  "20260907064303_f8efc1c3-def4-4147-9db1-45a68b1f6a69.sql",
  "20260907064513_19c76abb-f1fd-40e5-aa50-b008b7de38bf.sql",
  "20260907064849_0bb96516-c1eb-4178-8e9e-60bde13071dd.sql",
  "20260908043205_b315714c-89df-4610-9dd0-7b55207229a7.sql",
  "20260916155430_sp_international_passport_foundation.sql",
  "20260916155456_sp_international_credential_wallet.sql",
  "20260916155521_sp_credential_selective_sharing_v2.sql",
  "20260916155551_sp_closed_credential_catalogue.sql",
  "20260916155620_cv_owned_application_snapshot.sql",
  "20260916190510_sp_credential_organisation_roles.sql",
];
const parked = [
  "20261022090000_scp_vaktare_v1_content_review.sql",
  "20261023090000_scp_vaktare_v1_self_report_quality.sql",
];

// PR #257: all five Passport/CV migrations have verified hosted application.
// Their generated identities are pinned above as non-executable markers.
// Numeric history parity remains enforced independently by deploy-plan:check.

const active = new Set(readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")));
const pending = state.frontier
  .filter((entry) => entry.hostedState === "pending")
  .map((entry) => entry.file)
  .sort();

const failures: string[] = [];
if (JSON.stringify(pending) !== JSON.stringify([...expectedPending].sort())) {
  failures.push(`pending set is ${pending.join(", ") || "empty"}`);
}
for (const file of hostedIdentities) {
  if (!active.has(file)) failures.push(`hosted identity missing from active path: ${file}`);
}
for (const file of retiredCanonicalIdentities) {
  if (active.has(file)) failures.push(`already-applied canonical identity is active: ${file}`);
}
for (const file of hostedLedgerMarkers) {
  const markerPath = path.join(migrationsDir, file);
  if (!active.has(file)) {
    failures.push(`hosted ledger marker missing from active path: ${file}`);
    continue;
  }
  const executableBody = readFileSync(markerPath, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, "");
  if (executableBody.length > 0) {
    failures.push(`hosted ledger marker contains executable SQL: ${file}`);
  }
}
for (const file of parked) {
  if (active.has(file) && !hostedLedgerMarkers.includes(file)) {
    failures.push(`unsafe migration is active: ${file}`);
  }
  if (!existsSync(path.join(parkedDir, file))) failures.push(`parked history missing: ${file}`);
}
for (const entry of state.frontier.filter((item) => item.hostedState === "applied")) {
  if (!entry.evidenceSource?.trim()) failures.push(`applied entry lacks evidence: ${entry.file}`);
}

if (failures.length) {
  console.error(`release-frontier-check FAILED (${failures.length})`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  expectedPending.length === 0
    ? "release-frontier-check: production frontier reconciled; no active migration is pending"
    : `release-frontier-check: production frontier reconciled; ${expectedPending.length} migration(s) pending by design:`,
);
for (const file of expectedPending) console.log(`  - ${file}`);
