# Re-audit P1 fixes: hosted verification

**Status: APPLIED and verified on production** (`wrygicdfxwjnrugduxnt`, 2026-10-02).

The five P1 areas from the 2026-10-02 full hostile-user re-audit (B, C, D, E,
F) were fixed in nine isolated PRs. Each PR was merged with CI fully green,
applied by the official integration in version order, and then verified
read-only through the Supabase management connector.

| Finding | Migration | PR | Merge |
|---|---|---|---|
| P1-B 1/5 employer reports and reads | `20270108090000_employer_active_reads` | #365 | `3fff45f` |
| P1-B 2/5 candidate identity, notifications, notes | `20270109090000_candidate_identity_active_employer` | #368 | `23e8bf4` |
| P1-B 3/5 assessment actions | `20270110090000_assessment_actions_active_employer` | #370 | `a7288db` |
| P1-B 4/5 Interview Intelligence and BESKT | `20270111090000_interview_beskt_active_employer` | #371 | `cbddf5e` |
| P1-B 5/5 Passport employer attestation | `20270112090000_passport_attestation_active_employer` | #373 | `3c09455` |
| P1-D pending organisation acts on people | `20270113090000_pending_employer_actions` | #374 | `bdb985c` |
| P1-E Passport cross-holder targets | `20270114090000_sp_passport_target_holder` | #369 | `e062e4b` |
| P1-F holder-forged verification stamp | `20270115090000_sp_claim_verification_stamp` | #366 | `2d0d6e5` |
| P1-C interview findings rewritten by any member | `20270116090000_scp_iv_findings_review_writes` | #367 | `e81e4de` |

## Ledger

`supabase_migrations.schema_migrations` has 350 rows (read 2026-10-02 18:40 UTC).
The md5 of `version:name`, joined by newline, is
`29249f9a262f9f33b0139403caa3293d`, equal to `supabase/hosted-ledger.json`.
The first 341 rows still have their previous digest,
`1adae30d18655a674a605ea1cf8b500d`. Exactly nine rows are new, one per fix.
Nothing is pending, so `deploy-plan:check` has nothing to apply.

## Method

Every function body was compared as `md5(prosrc)` with the body in the merged
migration file on `main`. Every behavioural probe ran inside a `DO` block that
ended in `RAISE EXCEPTION`, so all of it rolled back. Each probe impersonated
real principals through `request.jwt.claims` and `SET LOCAL ROLE
authenticated`, set the organisation's status through the moderation marker
inside the same rolled-back transaction, and reported only counts and error
codes. No personal data was read out, and nothing was written.

Production holds no suspended organisation, no employer-attestation request and
no interview finding, so those paths were exercised on real rows by changing
status inside the rolled-back probe (P1-B, P1-D) or are proven by grants and
constraints together with the isolated suites (P1-C).

## Per migration

### 20270108090000 employer_active_reads (#365, merge 3fff45f) — verified 2026-10-02 ~12:05 UTC
- schema_migrations: 20270108090000 / employer_active_reads present.
- md5(string_agg(proname:md5(prosrc))) over the 14 objects (primitive + 13 gates) = 23eb29a77ca4d943adfa2e3de6c0ac75 = local replay of the merged file.
- md5 over the 4 policies' qual = ded25507def368a6450043d48d7a459f = local replay.
- anon EXECUTE on has_active_employer_role: false. 11 employers, all active.
- Rolled-back probe as the non-admin active member of the employer with most released attempts: active pipeline=7 participants=7 training=0 | suspended (moderation marker) pipeline=0 participants=0 training=0 | reactivated pipeline=7. PROBE_ROLLED_BACK; no hosted write.

### 20270109090000 candidate_identity_active_employer (#368) — verified 2026-10-02 ~12:40 UTC
- schema_migrations: 20270109090000 present.
- md5(prosrc): scp_resolve_participant_identity bfe1bb7e…, jase_notification_payload 8e936d6f…, jase_record_notification f50444f8…, scp_interview_notes 36456649…, scp_record_interview_note 65c6e285… — all = merged file on main. All five gated on has_active_employer_role; anon EXECUTE false on all five.
- Policy scp_interview_notes_employer_read md5(qual|with_check) = 178c93e69d5fd2b84c7d1892e52e7ff9 = local replay.
- Rolled-back probe, first member of each of the 11 employers, active -> suspended (moderation marker) -> reactivated: notification payload 14/0/14; resolved participant identity 5/0/5; interview notes RPC 1/0/1; notes table read while suspended 0. PROBE_ROLLED_BACK; no hosted write.

### 20270110090000 assessment_actions_active_employer (#370, merge a7288db) — verified 2026-10-02 ~13:05 UTC
- schema_migrations: 20270110090000 present (applied within minutes of the merge).
- md5(prosrc): scp_can_review_for fd1b2ca8…, scp_release_attempt_report 1de99538…, scp_record_employer_decision 90640129…, scp_cancel_assessment_invitation 91ba60c5…, scp_record_assessment_setup 59bf63ab… — all = merged file on main; all gated on has_active_employer_role; anon EXECUTE false on all five.
- Policy scp_assessment_setups_member_read md5(qual|with_check) = 2a250b44aad37e9533c4315d5cdc39df = local replay.
- Rolled-back probe, first owner/admin of each employer that has one (5), active -> suspended (moderation marker) -> reactivated: scp_can_review_for 2/0/2; setups read 1/0/1; while suspended scp_record_employer_decision refused 4/4 (SCP_NOT_AUTHORISED_TO_DECIDE) and scp_release_attempt_report refused 4/4 (SCP_NOT_AUTHORISED_TO_RELEASE). PROBE_ROLLED_BACK; no hosted write.

### 20270111090000 interview_beskt_active_employer (#371, merge cbddf5e) — verified 2026-10-02 ~13:45 UTC
- schema_migrations: present. md5(prosrc) of all 19 functions = merged file on main (19/19); all 19 call has_active_employer_role.
- Policies scp_iv_corrections_employer and bcp_ita_party_read both gated on has_active_employer_role.
- Rolled-back probe, first owner/admin of each employer with interview cases, active -> suspended -> reactivated: cases read 13/0/13; writable (scp_iv_can_write_case) 13/0/13. PROBE_ROLLED_BACK; no hosted write.

### 20270112090000 passport_attestation_active_employer (#373, merge 3c09455) — verified 2026-10-02 ~17:20 UTC
- schema_migrations present. md5(prosrc) sp_employer_attestation_queue 7abb3497…, sp_verifier_decide 7078c44c… = merged file; both gated; policy sp_vr_employer_read gated.
- Rolled-back probe, first owner/admin of each of 5 employers: queue readable active/suspended/reactivated 5/0/5; refused with SP_NOT_EMPLOYER_REPRESENTATIVE while suspended 5/5. PROBE_ROLLED_BACK.

### 20270113090000 pending_employer_actions (#374, merge bdb985c) — verified 2026-10-02 ~17:45 UTC
- schema_migrations present. md5(prosrc) of all 7 functions = merged file on main (7/7).
- Rolled-back probe, first owner/admin of each of 5 active employers set to pending: scp_employer_assign, scp_invite_participant, scp_assign_training, scp_schedule_reassessment all refused SCP_NOT_AUTHORISED_TO_ASSIGN (20/20); scp_assign_from_application with a real application of that employer refused 3/3. PROBE_ROLLED_BACK; no hosted write.

### 20270114090000 sp_passport_target_holder (#369, merge e062e4b) — verified 2026-10-02 ~17:55 UTC
- schema_migrations present. md5(prosrc) of sp_attach_evidence, sp_submit_for_verification, sp_raise_dispute, sp_verifier_revoke = merged file (4/4).
- Constraints present and VALIDATED (6/6): sp_evidence_/sp_vr_exactly_one_target, *_claim_same_holder, *_period_same_holder; UNIQUE sp_claims_id_holder_key and sp_experience_periods_id_holder_key present.
- Data: 0 evidence rows and 0 requests naming other than exactly one target.
- Rolled-back probe as a real holder: request on another holder's period refused SP_NOT_HOLDER; claim+period together refused SP_TARGET_AMBIGUOUS. PROBE_ROLLED_BACK.

### 20270115090000 sp_claim_verification_stamp (#366, merge 2d0d6e5) — verified 2026-10-02 ~18:20 UTC
- schema_migrations present. md5(prosrc) sp_guard_trust_fields_immutable ca810ec0… = merged file. sp_claims_self_update WITH CHECK carries verified_at IS NULL.
- Data: 0 claims with verified_at not backed by a verified request.
- Rolled-back probe as a real holder: UPDATE own claim SET verified_at=now() refused SP_TRUST_FIELD_IMMUTABLE; claim still unstamped. PROBE_ROLLED_BACK.

### 20270116090000 scp_iv_findings_review_writes (#367) — verified 2026-10-02 ~18:45 UTC
- schema_migrations present. authenticated: table-level UPDATE on scp_interview_findings false; UPDATE only on resolution_state, human_state, human_note. Trigger scp_interview_findings_review_stamp present. 0 findings rows in production (nothing to repair).
