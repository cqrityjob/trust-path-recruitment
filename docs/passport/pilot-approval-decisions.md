# Security Passport — the 44 pilot definitions: Route A, decided and implemented

**Owner decision, 2026-09-18: Route A is approved.** The per-definition internal-pilot
authorisation already on record is honoured for explicitly granted pilot members. This authorises
implementation and testing. It is **not** public market activation, and nothing here activates a
market or approves a definition for the public.

## The rule, exactly

A pilot definition is offered — in the catalogue, by the save RPC and by the table guards alike —
only when ALL of these hold:

1. the definition is `internal_pilot`;
2. ITS OWN market pack is `internal_pilot`, not active and not superseded;
3. the authenticated holder has a valid (not revoked) membership of THAT exact pack;
4. every other requirement passes: source review, governed or document-stated issuer under a
   governed regulator, active jurisdiction, not deprecated, and the scope where one is required.

`is_active` stays **false** on all 44. Consequences, each pinned by
`security_passport_pilot_scope_test.sql` in CI:

- a non-member, a member of another market, a revoked member and a session without a subject
  are offered nothing and cannot save;
- a definition held back individually (`pilot_state = 'closed'`) is withheld from its own members;
- **activating a market publicly publishes none of them**: the day a pack becomes active, its
  pilot-only definitions are offered to nobody — public or former member — until each is
  approved on its own (`is_active`). The legal-review gate (named reviewer and date before a
  pack can be activated) is untouched.

The administrator's page `/admin/passport-catalogue` applies the same rule: 44 definitions read
_Selectable by this market's pilot members_, with the reason _authorised for the internal pilot,
not approved for the public_.

## Five states, kept apart

| state | the 44 |
|---|---|
| Implemented and tested | **yes** — all 44, pinned by code, with no approval of any kind in the proofs |
| Definition approved for the public (`is_active`) | **no, by design** — 0 of 44 |
| Hosted migration applied | 20261124090000 and 20261125090000 **applied** (ledger verified read-only 2026-09-18); **20261126090000 pending** until PR #265 merges |
| Pilot membership granted | per named tester, per market; none assumed |
| Selectable and saveable by the actual tester | after the release steps below |

## Release steps, in order

The release is safe in either order (see *Guarded release*), so there is no "sync promptly" step
and no window in which a form is offered something it cannot save.

1. **Merge PR #265.** The official Supabase GitHub integration applies
   `20261126090000_sp_catalogue_scope_and_document_issuer` to the owner project.
2. **Verify the migration, read-only** (Supabase SQL editor or the management connector):
   ```sql
   -- a. the ledger row
   SELECT version, name FROM supabase_migrations.schema_migrations WHERE version = '20261126090000';
   -- b. Route A and the document-issuer clause are in the view
   SELECT pg_get_viewdef('public.sp_approved_credential_catalogue'::regclass, true) LIKE '%pilot_state%'
      AND pg_get_viewdef('public.sp_approved_credential_catalogue'::regclass, true) LIKE '%document_specific%';   -- t
   -- c. the Dubai role rows
   SELECT count(*) FROM public.sp_credential_organisation_roles r
     JOIN public.sp_credential_types t ON t.code = r.credential_code WHERE t.market_pack_code = 'AE-DU';          -- 104
   -- d. NOTHING was approved or activated
   SELECT count(*) FROM public.sp_credential_types
    WHERE market_pack_code IN ('GB','GB-NI','AE-DU','AE-AZ') AND is_active;                                        -- 0
   SELECT count(*) FROM public.sp_market_packs WHERE code IN ('GB','GB-NI','AE-DU','AE-AZ') AND is_active;        -- 0
   ```
3. **Record the evidence**: set the 20261126090000 entry in `supabase/release-state.json` to
   `applied` with the ledger evidence, add the row to `supabase/hosted-ledger.json`, and take the
   name off `expectedPending` in `scripts/release-frontier-check.ts` — one small follow-up commit.
4. **Sync the application** (the owner's usual Lovable sync of `main`). Until then the deployed
   form keeps working and is offered only what it can save.
5. **Grant pilot access per tester**: Admin → Users → the tester → _Pilot access_ → grant
   `GB`, `GB-NI` and/or `AE-DU`. Northern Ireland is its own market with its own grant.
6. **Confirm on the admin page** `/admin/passport-catalogue`: _Selectable by everyone_ 22,
   _Selectable by this market's pilot members_ 44, _Market closed_ 7, _Blocked_ 0.
7. **The tester follows** [pilot-checklist-sv.md](pilot-checklist-sv.md).

To hold one definition back at any time: a reviewed migration setting its `pilot_state` to
`closed`. To withdraw a tester: revoke on the same admin page; what they saved is retained.

## Guarded release — why the order cannot strand a user

A definition that needs a holder-written scope or a document-stated issuer can only be saved by
an application that sends those fields. Over the REST listing of the catalogue, the database
offers such a row only to a caller that declares the contract
(`x-passport-catalogue-contract: 2`, sent by the new application's two catalogue readers). An
application deployed BEFORE the migration sends no header and is offered exactly what its form
can save (19 rows for a Swedish holder; the 7 SIA licences for a GB member). The save RPC and the
table guards read the full catalogue, so nothing a capable application selects is refused.
Proved in CI both ways: the new application against the old database
(`security_passport_catalogue_old_rpc_compat_test.sql`, rolled-back stage), and the old
application against the new database (completeness suite, by simulating PostgREST's request
path and headers), and over real PostgREST on the isolated stack.

## The 44 definitions, by market, with source evidence

### Great Britain — 13 (regulator: Security Industry Authority)

| code | name | type | regulator | issuer | holder must state | source recorded for the definition (checked) |
|---|---|---|---|---|---|---|
| `UK_SIA_LICENCE_SG` | SIA Licence — Security Guarding | licence | Security Industry Authority | Security Industry Authority |  | https://www.gov.uk/guidance/apply-for-an-sia-licence (2026-09-16) |
| `UK_SIA_LICENCE_DS` | SIA Licence — Door Supervision | licence | Security Industry Authority | Security Industry Authority |  | https://www.gov.uk/guidance/apply-for-an-sia-licence (2026-09-16) |
| `UK_SIA_LICENCE_CCTV` | SIA Licence — Public Space Surveillance (CCTV) | licence | Security Industry Authority | Security Industry Authority |  | https://www.gov.uk/guidance/apply-for-an-sia-licence (2026-09-16) |
| `UK_SIA_LICENCE_CP` | SIA Licence — Close Protection | licence | Security Industry Authority | Security Industry Authority |  | https://www.gov.uk/guidance/apply-for-an-sia-licence (2026-09-16) |
| `UK_SIA_LICENCE_CVIT` | SIA Licence — Cash and Valuables in Transit | licence | Security Industry Authority | Security Industry Authority |  | https://www.gov.uk/guidance/apply-for-an-sia-licence (2026-09-16) |
| `UK_SIA_LICENCE_KH` | SIA Licence — Key Holding | licence | Security Industry Authority | Security Industry Authority |  | https://www.gov.uk/guidance/apply-for-an-sia-licence (2026-09-16) |
| `UK_SIA_LICENCE_NFL` | SIA Licence — Non-Front-Line | licence | Security Industry Authority | Security Industry Authority |  | https://www.gov.uk/guidance/apply-for-an-sia-licence (2026-09-16) |
| `UK_SIA_QUAL_SG` | Licence-linked qualification — Security Guarding | training | Security Industry Authority | stated on the certificate |  | https://www.gov.uk/guidance/check-what-training-you-need-to-get-an-sia-licence (2026-09-16) |
| `UK_SIA_QUAL_DS` | Licence-linked qualification — Door Supervision | training | Security Industry Authority | stated on the certificate |  | https://www.gov.uk/guidance/check-what-training-you-need-to-get-an-sia-licence (2026-09-16) |
| `UK_SIA_QUAL_CCTV` | Licence-linked qualification — Public Space Surveillance | training | Security Industry Authority | stated on the certificate |  | https://www.gov.uk/guidance/check-what-training-you-need-to-get-an-sia-licence (2026-09-16) |
| `UK_SIA_QUAL_CP` | Licence-linked qualification — Close Protection | training | Security Industry Authority | stated on the certificate |  | https://www.gov.uk/guidance/check-what-training-you-need-to-get-an-sia-licence (2026-09-16) |
| `UK_SIA_QUAL_CVIT` | Licence-linked qualification — Cash and Valuables in Transit | training | Security Industry Authority | stated on the certificate |  | https://www.gov.uk/guidance/check-what-training-you-need-to-get-an-sia-licence (2026-09-16) |
| `UK_SIA_TOP_UP` | SIA top-up / refresher training | training | Security Industry Authority | stated on the certificate |  | https://www.gov.uk/guidance/check-what-training-you-need-to-get-an-sia-licence (2026-09-16) |

Licences are issued and regulated by the SIA, the authority recorded for checking them. The six qualifications and top-up
training are regulated by the SIA and awarded by an awarding organisation through an approved
training provider, **stated on the certificate**; the SIA delivers no training. Standing caveat:
the four ICO sources must be re-read on the implementation date (Data (Use and Access) Act).

### Northern Ireland — 1

| code | name | type | regulator | issuer | holder must state | source recorded for the definition (checked) |
|---|---|---|---|---|---|---|
| `UK_SIA_LICENCE_VI` | SIA Licence — Vehicle Immobilisation (Northern Ireland) | licence | Security Industry Authority | Security Industry Authority |  | https://www.gov.uk/guidance/apply-for-an-sia-licence (2026-09-16) |

A separate pack: vehicle immobilisation on private land is licensable in Northern Ireland only.
Needs its own pilot grant (`GB-NI`); a `GB` member does not receive it.

### Dubai — 30 (regulator: Security Industry Regulatory Agency)

| code | name | type | regulator | issuer | holder must state | source recorded for the definition (checked) |
|---|---|---|---|---|---|---|
| `AE_DU_SIRA_CARD_GUARD` | SIRA Security Cadre Card — Security Guard | licence | Security Industry Regulatory Agency | Security Industry Regulatory Agency | scope required | https://www.sira.gov.ae/en/services/security-cadre-card (2026-09-18) |
| `AE_DU_SIRA_CARD_MONEY_TRANSPORT` | SIRA Security Cadre Card — Money Transport Guard | licence | Security Industry Regulatory Agency | Security Industry Regulatory Agency | scope required | https://www.sira.gov.ae/en/services/security-cadre-card (2026-09-18) |
| `AE_DU_SIRA_CARD_EVENT_GUARD` | SIRA Security Cadre Card — Event Security Guard | licence | Security Industry Regulatory Agency | Security Industry Regulatory Agency | scope required | https://www.sira.gov.ae/en/services/security-cadre-card (2026-09-18) |
| `AE_DU_SIRA_CARD_BODYGUARD` | SIRA Security Cadre Card — Bodyguard | licence | Security Industry Regulatory Agency | Security Industry Regulatory Agency | scope required | https://www.sira.gov.ae/en/services/security-cadre-card (2026-09-18) |
| `AE_DU_SIRA_CARD_WATCHMAN` | SIRA Security Cadre Card — Watchman | licence | Security Industry Regulatory Agency | Security Industry Regulatory Agency | scope required | https://www.sira.gov.ae/en/services/security-cadre-card (2026-09-18) |
| `AE_DU_SIRA_CARD_SUPERVISOR` | SIRA Security Cadre Card — Security Supervisor | licence | Security Industry Regulatory Agency | Security Industry Regulatory Agency | scope required | https://www.sira.gov.ae/en/services/security-cadre-card (2026-09-18) |
| `AE_DU_SIRA_CARD_OPS_MANAGER` | SIRA Security Cadre Card — Security Operations Manager | licence | Security Industry Regulatory Agency | Security Industry Regulatory Agency | scope required | https://www.sira.gov.ae/en/services/security-cadre-card (2026-09-18) |
| `AE_DU_SIRA_CARD_SECURITY_MANAGER` | SIRA Security Cadre Card — Security Manager | licence | Security Industry Regulatory Agency | Security Industry Regulatory Agency | scope required | https://www.sira.gov.ae/en/services/security-cadre-card (2026-09-18) |
| `AE_DU_SIRA_CARD_HEAD_OF_SECURITY` | SIRA Security Cadre Card — Head of Security Department | licence | Security Industry Regulatory Agency | Security Industry Regulatory Agency | scope required | https://www.sira.gov.ae/en/services/security-cadre-card (2026-09-18) |
| `AE_DU_SIRA_CARD_SYSTEMS_OPERATOR` | SIRA Security Cadre Card — Security Systems Operator | licence | Security Industry Regulatory Agency | Security Industry Regulatory Agency | scope required | https://www.sira.gov.ae/en/services/security-cadre-card (2026-09-18) |
| `AE_DU_SIRA_CARD_SYSTEMS_TECHNICIAN` | SIRA Security Cadre Card — Security Systems Technician | licence | Security Industry Regulatory Agency | Security Industry Regulatory Agency | scope required | https://www.sira.gov.ae/en/services/security-cadre-card (2026-09-18) |
| `AE_DU_SIRA_CARD_SYSTEMS_ENGINEER` | SIRA Security Cadre Card — Security Systems Engineer | licence | Security Industry Regulatory Agency | Security Industry Regulatory Agency | scope required | https://www.sira.gov.ae/en/services/security-cadre-card (2026-09-18) |
| `AE_DU_SIRA_CARD_TRAINER` | SIRA Security Cadre Card — Security Trainer | licence | Security Industry Regulatory Agency | Security Industry Regulatory Agency | scope required | https://www.sira.gov.ae/en/services/security-cadre-card (2026-09-18) |
| `AE_DU_SIRA_CARD_EXPERT` | SIRA Security Cadre Card — Security Expert | licence | Security Industry Regulatory Agency | Security Industry Regulatory Agency | scope required | https://www.sira.gov.ae/en/services/security-cadre-card (2026-09-18) |
| `AE_DU_SIRA_CARD_CONSULTANT` | SIRA Security Cadre Card — Security Consultant | licence | Security Industry Regulatory Agency | Security Industry Regulatory Agency | scope required | https://www.sira.gov.ae/en/services/security-cadre-card (2026-09-18) |
| `AE_DU_SIRA_GUARD_COURSE` | SIRA Security Guard course | training | Security Industry Regulatory Agency | stated on the certificate |  | https://www.sira.gov.ae/en/information-center/certified-security-training-centers (2026-09-18) |
| `AE_DU_SUPERVISOR_COURSE` | SIRA Security Supervisor course | training | Security Industry Regulatory Agency | stated on the certificate |  | https://www.sira.gov.ae/en/information-center/certified-security-training-centers (2026-09-18) |
| `AE_DU_OPS_MANAGER_COURSE` | SIRA Security Operations Manager course | training | Security Industry Regulatory Agency | stated on the certificate |  | https://www.sira.gov.ae/en/information-center/certified-security-training-centers (2026-09-18) |
| `AE_DU_SECURITY_MANAGER_COURSE` | SIRA Security Manager course | training | Security Industry Regulatory Agency | stated on the certificate |  | https://www.sira.gov.ae/en/information-center/certified-security-training-centers (2026-09-18) |
| `AE_DU_SYSTEMS_OPERATOR_COURSE` | SIRA Security Systems Operator course | training | Security Industry Regulatory Agency | stated on the certificate |  | https://www.sira.gov.ae/en/information-center/certified-security-training-centers (2026-09-18) |
| `AE_DU_SYSTEMS_TECHNICIAN_COURSE` | SIRA Security Systems Technician course | training | Security Industry Regulatory Agency | stated on the certificate |  | https://www.sira.gov.ae/en/information-center/certified-security-training-centers (2026-09-18) |
| `AE_DU_SYSTEMS_ENGINEER_COURSE` | SIRA Security Systems Engineer course | training | Security Industry Regulatory Agency | stated on the certificate |  | https://www.sira.gov.ae/en/information-center/certified-security-training-centers (2026-09-18) |
| `AE_DU_TRAINER_COURSE` | SIRA Security Trainer course | training | Security Industry Regulatory Agency | stated on the certificate |  | https://www.sira.gov.ae/en/information-center/certified-security-training-centers (2026-09-18) |
| `AE_DU_EVENTS_COURSE` | SIRA Security Events course | training | Security Industry Regulatory Agency | stated on the certificate |  | https://www.sira.gov.ae/en/information-center/certified-security-training-centers (2026-09-18) |
| `AE_DU_CASH_TRANSPORT_COURSE` | SIRA Cash Transport Guard course | training | Security Industry Regulatory Agency | stated on the certificate |  | https://www.sira.gov.ae/en/information-center/certified-security-training-centers (2026-09-18) |
| `AE_DU_BASIC_FIRE_SAFETY` | Basic Fire Safety training | training | Security Industry Regulatory Agency | stated on the certificate |  | https://www.sira.gov.ae/en/information-center/certified-security-training-centers (2026-09-18) |
| `AE_DU_BASIC_LIFE_SUPPORT` | Basic Life Support training | training | Security Industry Regulatory Agency | stated on the certificate |  | https://www.sira.gov.ae/en/information-center/certified-security-training-centers (2026-09-18) |
| `AE_DU_PEOPLE_OF_DETERMINATION` | People of Determination training | training | Security Industry Regulatory Agency | stated on the certificate |  | https://www.sira.gov.ae/en/information-center/certified-security-training-centers (2026-09-18) |
| `AE_DU_SPECIALIST_COURSE` | SIRA specialist security course | training | Security Industry Regulatory Agency | stated on the certificate |  | https://www.sira.gov.ae/en/information-center/certified-security-training-centers (2026-09-18) |
| `AE_DU_FITNESS_CHECKED` | Fitness requirement checked | certification | Security Industry Regulatory Agency | stated on the certificate |  | https://www.sira.gov.ae/en/information-center/certified-security-training-centers (2026-09-18) |

Mapping checked against the source's CONTENT on 2026-09-18: the Security Cadre Card is a SIRA
service, and SIRA requires the courses "from Approved Training Centers". A **card** is issued by
SIRA and is tied to the licensed company, which the holder must state (scope required, never
removed). A **course or check** is regulated by SIRA but certified by the approved centre,
stated on the certificate; SIRA is recorded as the issuer of no course. Standing caveats:
`portal.sira.gov.ae` never answered the source checker; `name_ar` is NULL on every row and
Arabic vocabulary must be supplied and reviewed before any PUBLIC activation; who issues the
fitness, fire-safety and life-support documents is the one mapping a reviewer should confirm.

## Not in scope, and not requested

Abu Dhabi (7 definitions) is closed by owner decision and receives nothing. Public activation of
Great Britain, Northern Ireland or Dubai is not requested: it needs a named legal reviewer and a
date, which do not exist.
