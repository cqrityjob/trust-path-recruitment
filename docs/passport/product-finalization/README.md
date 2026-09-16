# Security Passport product finalization

Branch: `codex/passport-product-finalization`, based on main `351dea8` (PR #257 included).

## Product changes

The Passport overview uses a responsive credential grid, Profile identity, factual counts and explicit review states. The long ownership explanation is a contextual disclosure. Six navigation destinations lead to overview, credentials, addition, verification, Trust Card and privacy.

The five-step add flow uses the existing approved catalogue and strict instance-only writer. It filters scope, country/region, professional domain, class and organisation; reviews the holder's fields before saving; and attaches optional evidence through the existing private upload service. An attachment failure preserves the saved credential and retries only the attachment.

Trust Card is a private navy preview with an empty initial selection. Its identity comes from Profile and is labelled accordingly. Selection in this private preview is not consent to a public disclosure: the existing sharing flow explicitly confirms the credentials, permitted fields and expiry. A QR is generated only from the newly created selective-disclosure URL, with the same expiry/revocation controls. Neither evidence nor a credential number is automatically disclosed. No photo or professional title is added to the public payload without an existing disclosure permission.

The recipient card retains the canonical trust model and now displays a subsequent credential revocation for an already pinned v2 selection. It never picks up replacement or unselected credentials. The earlier v1 disclosure contract is unchanged. Missing profile fields are omitted from the card instead of printing repeated “Not stated” text. A revoked holder-reported record never acquires a historical verified label.

## Catalogue audit

The read-only production audit found 73 definitions, 22 active and 19 currently selectable. `catalogue-audit.json` records every active definition and all 14 SIA entries, their names, classes, declared territories, roles, validity notes, sources and the source-check date (2026-09-16). The remaining inactive AE inventory is listed without claiming an audit of its legal requirements.

Organisation roles reference the existing authority or certification-body records. No credential, issuer, authority, country, scope or jurisdiction identity is created or duplicated.

- ASIS APP/CPP/PCI/PSP retain their existing ASIS issuer and programme identities. Certification and continuing maintenance are not a local licence. [Official programmes](https://www.asisonline.org/certification/), [recertification](https://www.asisonline.org/certification/recertification/).
- ISC2 CC/CCSP/CGRC/CISSP/SSCP retain ISC2 and the official programme names. Certification-cycle dates are not evidence of current standing. [Official certifications](https://www.isc2.org/certifications).
- ISACA CISA/CISM/CRISC retain ISACA. CPE-cycle dates are distinguished from the result of a current verification. [Official credentials](https://www.isaca.org/credentialing), [verification](https://www.isaca.org/credentialing/verify-a-certification).
- ACFE CFE retains ACFE. Its continuing education and membership requirements are distinct from initial award; the public directory is voluntary. [CFE](https://www.acfe.com/cfe-credential), [maintenance](https://www.acfe.com/cfe-credential/continuing-professional-education-cpe-requirements/faq-cpe-compliance).
- ACAMS CAMS retains ACAMS. No public verification lookup is invented. [CAMS](https://www.acams.org/en/certifications/cams-certification), [recertification](https://www.acams.org/en/certifications/recertification).
- Swedish OV appointment and OV training/refresher/transport records distinguish the appointment from training. Police are the recorded authority and provider for these prescribed courses. Transport training is not a standing authorisation for every transport. [Police training and appointment](https://polisen.se/lagar-och-regler/ordningsvakter/utbildning-till-ordningsvakt/).
- VU1/VU2 issuer/provider is the actual authorised training provider on the document. Police prescribe training; they are not automatically the issuer. BYA is evidence of a provider and course structure, not a universal attribution for every holder. [BYA training structure](https://www.bya.se/yrken/vaktare-stationar-ronderande/), [courses and refresher requirements](https://www.bya.se/kurser/).
- Personnel approval and civilian SV approval reference Länsstyrelsen. SV remains scope-restricted and not selectable through a scope-free candidate flow. [Guarding companies and personnel](https://www.lansstyrelsen.se/ostergotland/samhalle/tillstand-for-att-utova-verksamhet/bevakningsforetag.html), [SV approval application](https://www.lansstyrelsen.se/download/18.4dec946918b853a3b1e4901/1698847159075/Ans%C3%B6kan%20om%20godk%C3%A4nnande%20av%20skyddsvakt%202023.pdf).
- SIA licences reference SIA as issuer/regulator. Qualifications distinguish awarding body from training provider; SIA does not deliver training. Licences normally last three years, with the one-year Northern Ireland vehicle-immobilisation exception. [Licensing](https://www.gov.uk/guidance/apply-for-an-sia-licence), [training](https://www.gov.uk/guidance/check-what-training-you-need-to-get-an-sia-licence).

Legacy holder-entered organisation strings are retained as personal history, labelled as such on detail pages, and no longer promoted to official catalogue facts in the wallet or v2 public payload.

## Local schema change; hosted approval required

`20261123090000_sp_credential_organisation_roles.sql` adds two catalogue extensions keyed to the existing credential types:

- `sp_credential_organisation_roles`: separate issuer, regulator, training provider and verification authority, using foreign keys to existing organisations or an explicit document-specific role.
- `sp_credential_definition_reviews`: domain, source URL, review date and bilingual validity guidance.

Both tables have ENABLE/FORCE RLS and authenticated SELECT only. No candidate, anonymous or service-role table writes are granted. The existing private v2 payload function resolves official issuer identity from these roles and preserves subsequent revoked/expired state for previously selected claims. Its execute grants remain revoked.

The rollback restores the previous private payload and drops only these two new tables. It is for disposable local verification, not production. No PR #257 migration contents were changed or reapplied to production. The committed hosted ledger is untouched. Release-state truthfully records the new migration as **pending**; the schema-first and empty-deploy-plan gates must block application release until separately approved hosted application and verification.

VU1/VU2 and SV availability is unchanged; this release does not approve new training providers, remove required scope, activate UK/AE markets or broaden the catalogue gate. The application deliberately fails closed if the new metadata tables cannot be read.

## Evidence and approval

The screenshots use fictional Alex Morgan credentials, never production personal data. `screenshots/` includes both languages, desktop, 375px and 390px captures of the overview/wallet, all five addition steps, detail, Trust Card, recipient and sharing/privacy. Browser assertions check overflow, selected-only previews, no legacy Police issuer assertion, private fields and visible revocation.

Explicit owner visual/product approval is still required. Do not merge or publish this branch solely because local checks pass. See `verification.json` for executed results and release blockers.
