# International Passport foundation

## Architecture decision (before implementation)

Owner expanded scope on 2026-09-15. Baseline remains 6fbf4f61edc006bfc33749d65f7348cc7a47fd0e. Existing tested primitives are retained.

| Capability | Classification | Target |
|---|---|---|
| Credential definitions | Reusable with extension | sp_credential_types + sp_certification_definitions; new sp_credential_definition_metadata and versioned sp_credential_adapter_mappings |
| Statutory authorities / professional issuers | Already correctly separated | sp_authorities vs sp_certification_issuers, existing aliases and official source records; common read interface never equates issuer domicile with validity |
| Territorial and nonterritorial scope | Reusable with extension | sp_jurisdictions, sp_sub_jurisdictions, sp_credential_scopes, plus explicit claim issuance/validity metadata |
| Individual credentials | Reusable with extension | sp_claims remains the fact/version spine; sp_credential_details is a 1:1 extension for the international fields |
| Evidence | Already separate | sp_evidence and private Storage; extension sp_evidence_extractions for machine provenance only |
| Verification | Already event based | sp_verification_requests / sp_verification_decisions and sp_passport_events; preserve immutable decisions and controlled transitions |
| Sharing | Reusable with extension | sp_disclosures / sp_disclosure_items plus sp_credential_disclosure_policy; narrow v2 functions enforce credential-only selection and optional field policy |
| Sharing audit | Reusable with extension | existing access/history records plus v2 events for creation, claim changes and observed expiry/revocation |
| Profile / CV facts in Passport presentation | Must migrate presentation | canonical writers retained; credential-only wallet and links to Profile/CV |
| Old v1 sharing | Retained compatibility | v1 tokens, application disclosures and their tests remain; no mass revocation |
| Fable temporary work | Unavailable, owner waived | analysis only; nothing to recover or execute |
| Issuer APIs, extraction execution, digital issuance, clearance | Intentionally deferred | versioned interfaces only; no clearance data, no automated status promotion or compliance claim |

## Relationships and authority

A professional owns claims. A claim optionally resolves to a governed definition, which resolves to an issuer or authority. An evidence row references a claim; extraction attempts reference evidence, never overwrite the claim. Review requests reference the claim and decisions reference requests. A sharing package references explicitly selected claims and a permitted-field policy. Audit events reference the package. Profile identity is read from profiles/security_career_profiles, not copied into an editable Passport field.

Claim class vocabulary: certification, professional_licence, regulated_authorisation, permit, mandatory_training, occupational_card, other_professional_credential. Generic CV records cannot acquire credential status through an adapter payload.

Verification: self-declared → evidence provided → review pending → documented or source-confirmed through the existing authorised reviewer path. Rejection/clarification and revocation remain recorded decisions. Expiry is evaluated at read time; correction creates a successor claim so prior approval cannot silently transfer. Machine extraction has its own confidence, process/model version, provenance and human-review state; it has no permission to promote verification.

All new tables enable RLS. Catalogue writes are administrative. Holder metadata writes require matching ownership and self-declared/unreviewed state; evidence extraction and adapter governance are internal. Public recipients receive only the narrow builder result, never table rows, document URLs, storage paths or tokens from audit logs.

## Cleanup decision

No cleanup is proposed. Expected deleted rows: **0 in every table**. Existing sp_claims/sp_evidence/sp_experience_periods also serve CV/application flows, so treating all sp_* tables as Passport-only would be incorrect. No existing personal-data row is backfilled or rewritten. Rollback must refuse removal after new metadata or v2 sharing is adopted; forward repair is the supported path after adoption.

## Release boundary

Hosted state stays pending until separately approved and verified. Schema-dependent application code must not be released to hosted production before its migration. This branch does not merge or deploy.
