# Closed credential catalogue

## Owner decision and implementation

Candidates select an active, approved existing definition. They cannot create definitions or issuers, or write names, translations, classes, territories, scope, verification methods or sources. No unlisted/custom-credential submission or catalogue-request record is created.

The candidate command accepts `definition_code`, a market selection, a personal identifier, issue/expiry dates and an approved no-expiry declaration. `claim_id` and `version` identify a correction. The market selection is checked against the definition and never stored as holder-defined metadata. Evidence continues through the existing private, owner-scoped upload workflow.

The selector and every claim writer resolve the same `sp_approved_credential_catalogue` view. This is a projection of the existing catalogue, not another definition or issuer registry. ASIS CPP, PSP and PCI use `INTL_ASIS_CPP`, `INTL_ASIS_PSP`, `INTL_ASIS_PCI` and their existing ASIS issuer relationship.

No-expiry permission is an explicit administrator-controlled flag on `sp_credential_types`. Its default is false. Neither an optional expiry nor an unpublished maintenance period implies lifetime validity. Selecting a definition or uploading evidence does not verify a holder.

Availability also requires current effective dates, an active issuer or authority, an active country/region and an active matching market pack where applicable. Dates submitted through the RPC must use ISO calendar syntax. Direct writes also reject infinite dates and dates outside 1900–2200, preventing an infinite expiry from bypassing the no-expiry permission.

## Administrative operation

Catalogue administration in this release uses reviewed, versioned migrations operated by an authorised CQrityjob catalogue administrator. There is no candidate or general-purpose application endpoint for catalogue administration. No role is inferred from user-editable JWT metadata. Future issuer partnerships must extend these same tables and relationships.

A catalogue change must record:

1. The responsible catalogue administrator and the approval reference.
2. The exact existing definition/issuer keys, official sources and review dates.
3. Governed names/translations, class, issuer, territory, validity and verification rules.
4. Exact row counts before and after, the migration version and its reviewed diff.
5. Positive selection tests and negative candidate REST/RPC/RLS tests.
6. Activation/deprecation decisions and a forward-fix or guarded rollback plan.

Run the catalogue count and key queries before and after an administrative change. Candidate data is not part of catalogue maintenance. Do not infer issuers by matching holder-entered names. Do not add a duplicate ASIS record to accommodate a claim.

Hosted execution is **not authorised** in this task. This document is not production execution approval.

## Migration `20261121090000`

Created with the temporary Supabase CLI as `20260915192619_sp_closed_credential_catalogue`, then ordered after the three existing unpublished Passport migrations. It is transactional and must follow `20261120090000`.

Changes:

- `sp_credential_types`: adds `allows_no_expiry boolean NOT NULL DEFAULT false`. PostgreSQL uses a constant default; the statement still needs a short table DDL lock.
- `sp_approved_credential_catalogue`: security-invoker, security-barrier read view over the existing definitions, metadata, issuers, authorities and market packs.
- `sp_claims`: adds a trigger refusing unapproved definitions and governed metadata changes, including old RPC and direct REST paths. Existing history can still be archived/reviewed without altering holder content. Reactivation must satisfy current approval.
- `sp_credential_details`: adds a trigger binding the stored metadata snapshot and no-expiry permission to the approved definition.
- `sp_save_international_credential(jsonb)`: replaces the free-text command with catalogue selection and personal fields. Retains ownership, live-session and version checks and transactional correction history.
- Candidate DML revoked on `sp_credential_types`, `sp_authorities`, `sp_jurisdictions`, `sp_sub_jurisdictions`, `sp_market_packs`, `sp_credential_scopes`, `sp_certification_definitions`, `sp_certification_issuers`, `sp_certification_issuer_aliases`, `sp_certification_sources`, `sp_credential_classes`, `sp_credential_jurisdictions`, `sp_credential_definition_metadata`, `sp_credential_definition_jurisdictions`, and `sp_credential_adapter_mappings`.

Expected personal-data effect: **zero INSERT, UPDATE or DELETE rows**. No cleanup or backfill is executed. The constant no-expiry default applies to 73 definition rows in the clean local replay. No issuer or certification definition rows are inserted or updated. These are local replay counts, not a fresh hosted-data census.

Rollback removes only the new schema/command guard, restores the exact previous command, preserves catalogue DML restrictions and refuses if a governed credential detail has been adopted. It never deletes personal rows. Because rollback would reopen the legacy custom command, it is only exercised locally here; any hosted rollback needs separate explicit owner approval. After adoption, use a forward fix.

## Availability requiring review

The clean local catalogue has 73 definitions, 14 certification definitions and five certification issuers. The approved projection returns 19 entries: 14 international and five Swedish.

The other three active definitions are deliberately withheld:

| Definition | Missing or incompatible governed metadata |
|---|---|
| VU1 | No governed issuer relationship |
| VU2 | No governed issuer relationship |
| SV | Requires holder-written authorisation scope |

No issuer, authority or territorial scope was invented to make these selectable. An authorised catalogue review must resolve their modelling before they can be offered under the closed decision. Inactive pilot definitions are not candidate-selectable, even when a holder has a pilot entitlement.

## Verification queries

Run only against the isolated local stack for this task:

```sql
SELECT count(*) FROM public.sp_approved_credential_catalogue; -- clean replay: 19
SELECT t.code, d.issuer_id, i.issuer_code
FROM public.sp_credential_types t
JOIN public.sp_certification_definitions d ON d.credential_code=t.code
JOIN public.sp_certification_issuers i ON i.id=d.issuer_id
WHERE t.code IN ('INTL_ASIS_CPP','INTL_ASIS_PSP','INTL_ASIS_PCI');
-- Three existing definitions, one existing ASIS issuer.
SELECT reloptions FROM pg_class
WHERE oid='public.sp_approved_credential_catalogue'::regclass;
-- security_invoker=true, security_barrier=true
SELECT has_table_privilege('authenticated','public.sp_credential_types','INSERT'),
       has_table_privilege('authenticated','public.sp_certification_issuers','UPDATE');
-- false, false
```

The executable security evidence is `supabase/tests/security_passport_closed_catalogue_test.sql` and `scripts/passport-live-local-check.mjs`. Negative operations and temporary administrative flags in the SQL suite are rolled back; real API identities use reserved `@fixture.invalid` addresses in the isolated stack. No hosted test data is touched.
