# Security-gate blockers: hosted verification

**Status: APPLIED and verified on production** (`wrygicdfxwjnrugduxnt`, 2026-10-02).

The six blockers from the 2026-10-02 pre-launch hostile-user audit were each
fixed in an isolated PR. Each PR was merged with CI fully green, applied by the
official integration, and then verified read-only through the Supabase
management connector.

| Blocker | Migration | PR | Merge |
|---|---|---|---|
| P0-1 progress series crosses employers | `20270102090000_scp_subject_progress_employer_scope` | #358 | `37c16ba` |
| P1-1 learning run scored as an assessment | `20270103090000_scp_submit_assessment_only` | #359 | `73797c7` |
| P1-2 recommendations from another employer's evidence | `20270104090000_scp_development_recommendations_employer_scope` | #360 | `4145aa8` |
| P1-3 suspended employer reads applicants | `20270105090000_suspended_employer_applicant_reads` | #361 | `3af0eba` |
| P1-4 Passport evidence written onto another holder | `20270106090000_sp_evidence_and_request_writes_rpc_only` | #363 | `1a65d77` |
| P1-5 panel reviewers see ratings before the reveal | `20270107090000_scp_iv_panel_reveal_boundary` | #362 | `337490c` |

#363 was merged before #362 so that production applied the two migrations in
version order.

## Ledger

`supabase_migrations.schema_migrations` has 341 rows. The md5 of `version:name`,
joined by newline, is `1adae30d18655a674a605ea1cf8b500d`, equal to
`supabase/hosted-ledger.json`. The first 335 rows still have their previous
digest, `1ae98c1c7b2b17300e5bade67516ad30`. Exactly six rows are new, one per
fix.

## Method

Every behavioural probe ran inside a `DO` block that ended in `RAISE EXCEPTION`,
so all of it rolled back. Each probe impersonated real principals through
`request.jwt.claims` and `SET LOCAL ROLE authenticated`, and reported only
counts and hashes. No personal data was read out.

No direct-write probe was sent, because the connector does not accept write
statements. Where a fix closes a write path (P1-4), the refusal is proven by
the privileges shown here and by the isolated suite. Two paths cannot be
exercised live because production holds no suspended employer (P1-3) and no
interview panel (P1-5); the isolated suites prove those.

## Evidence per migration

### 20270102090000 scp_subject_progress_employer_scope (P0-1, #358 merged 37c16ba)
- Observed applied 2026-10-02 ~09:15 UTC; ledger row 20270102090000 / scp_subject_progress_employer_scope.
- md5(prosrc) scp_subject_progress = 380142cb1dea197c3a8210597f7754e6 = merged source (local replay).
- anon EXECUTE: false.
- Rolled-back probe as every active employer member x each subject their org released (13 pairs): 117 rows, 0 from another employer (pre-fix: 4 of 13 for one pair).
### 20270103090000 scp_submit_assessment_only (P1-1, #359 merged 73797c7)
- Observed applied 2026-10-02 ~09:35 UTC; ledger row 20270103090000 / scp_submit_assessment_only.
- md5(prosrc) scp_submit_attempt = 329cf15aa1efb87299a23291e9ca0994 = merged source (local replay).
- anon EXECUTE: false.
- Rolled-back probe: both real in-progress learning runs submitted as their own holder -> both refused SCP_NOT_AN_ASSESSMENT; evidence delta 0; evidence written by scp_submit_attempt from any learning run: 0.
### 20270104090000 scp_development_recommendations_employer_scope (P1-2, #360 merged 4145aa8)
- Observed applied 2026-10-02 ~09:55 UTC; ledger row 20270104090000 / scp_development_recommendations_employer_scope.
- md5(prosrc) scp_development_recommendations = d4bb9cdf16af940c07f3ea9533e47d5e; scp_compute_maturity_for_issuers = 7763825c4b9b2d0a59412270d2c608fa; both = merged source (local replay).
- authenticated EXECUTE on the helper: false; anon EXECUTE on scp_development_recommendations: false.
- Rolled-back probe as every active employer member x each subject their org released (13 pairs): 3 recommendation rows; 0 not backed by the caller's own organisations' evidence; 0 whose level differs from the own-organisation level.
### 20270105090000 suspended_employer_applicant_reads (P1-3, #361 merged 3af0eba)
- Observed applied 2026-10-02 ~09:55 UTC; ledger row 20270105090000 / suspended_employer_applicant_reads.
- md5(prosrc): scp_application_assessments = b750286805de886076bcac7624d02fcc, scp_application_candidate = 81737affd2bab003b893704d766dfa87, sp_application_disclosure = 40f347e7b874914788ec47d98e0ac178; all = merged source; all three gated on employer_is_active_status(_employer); anon EXECUTE on none.
- Hosted has 0 non-active employers (suspended path proven by the isolated suite, not live). Positive control, rolled back: for all 14 applications an active member of the receiving employer still reads the applicant through scp_application_candidate (14/14).
### 20270106090000 sp_evidence_and_request_writes_rpc_only (P1-4, #363 merged 1a65d77)
- Observed applied 2026-10-02 ~10:40 UTC; ledger row 20270106090000 / sp_evidence_and_request_writes_rpc_only.
- authenticated: INSERT/UPDATE on sp_evidence false, INSERT on sp_verification_requests false; 0 client INSERT/UPDATE column grants on either table; SELECT kept.
- Policies: sp_evidence_self SELECT-only; sp_vr_self_insert gone; 0 permissive write policies on either table; the restrictive session policies unchanged. All five writers are SECURITY DEFINER.
- Data: 12 evidence rows, 11 requests, 0 cross-holder evidence.
- Rolled-back read probe as each evidence holder: the holder with a live session reads all own evidence and 0 foreign rows; holders without a live session read none (pre-existing session rule). No direct-write probe was sent through the connector; the refusal is proven by privileges here and by the isolated suite.
### 20270107090000 scp_iv_panel_reveal_boundary (P1-5, #362 merged 337490c)
- Observed applied 2026-10-02 ~10:45 UTC; ledger row 20270107090000 / scp_iv_panel_reveal_boundary.
- md5(prosrc): scp_iv_panel_hides_others = ab7be7649d06005d1d09185da5fb465c, scp_iv_preview_report = ea19d44c10d0d8b57e021c9a00fe33a1, scp_iv_report_blockers = e013f023eae3490ac6d3c0fc1959780c; all = merged source (local replay). anon EXECUTE on neither the helper nor the preview.
- Policies: scp_interview_assessments_read and scp_interview_case_events_read carry the reveal rule exactly as merged.
- Hosted has 0 panels (pre-reveal path proven by the isolated suite). Rolled-back probe: on all 3 cases with assessments an active member of the employer still reads every assessment (3/3 unchanged).


## Local proof of the combined tree

The final `main` tree, with all six fixes, passed the full `scripts/db-test.sh`
run: strict replay of every migration, all suites, all negative controls, exit
0. The six new suites have 122 assertions. Their 14 negative controls each made
their suite fail as designed.
