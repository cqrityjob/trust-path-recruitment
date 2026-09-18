# Security Passport — the 44 pending pilot definitions: what is decided, what is not

**Status: 44 definitions in Great Britain (13), Northern Ireland (1) and Dubai (30) are
implemented and proven, and are available to NO pilot tester.** This document states exactly
what is already decided, what is missing, who decides it, and the precise release action.
Nothing here is activated by PR work. The full catalogue is in
[catalogue-coverage-matrix.md](catalogue-coverage-matrix.md).

## Five states, kept apart

| state | meaning | the 44 today |
|---|---|---|
| Implemented and tested | definition, roles, sources, form contract, save path, reviewer and share display | **yes** — all 44, pinned by code in CI (`security_passport_catalogue_completeness_test.sql`) |
| Definition approved | the closed catalogue's own flag, `sp_credential_types.is_active` | **no** — 0 of 44 |
| Hosted migration applied | 20261124090000, 20261125090000, 20261126090000 on the owner project | **no** — pending by design until merge |
| Pilot membership granted | a named tester's `sp_pilot_members` row, given on the admin user page | per tester; none assumed |
| Selectable and saveable by the actual tester | all of the above true at once | **no** |

## What is ALREADY recorded — checked before asking again

1. **The owner's authorisation for internal-pilot TESTING exists, per definition.** Migration
   `20260915090000_sp_market_pilot_entitlement` set `pilot_state = 'internal_pilot'` on the GB,
   GB-NI and AE-DU packs and on every one of these 44 definitions, and defines it in its own
   words as: _"internal_pilot means 'the owner has authorised testing', not 'a regulator or
   lawyer has approved this content'."_ It is applied hosted.
2. **Legal review is NOT recorded, for any pilot pack.** `legal_review_state = 'pending'` on GB,
   GB-NI and AE-DU and on all 44 definitions; `legal_reviewed_by` and `legal_reviewed_on` are
   NULL. `three-market-architecture.md` requires a **named reviewer and a date** before a pack
   can be activated publicly, and a database CHECK enforces it. Nobody has invented one here.
3. **The closed catalogue's approval flag is NOT set**: `is_active = false` on all 44. The
   application code records WHY it was left false
   (`credentials.functions.ts`, the pilot branch): _"is_active stays false so they do not become
   public the day the pack is approved without somebody deciding that separately."_

So the gap is not 44 missing approvals. It is **one unresolved question**, created when the
closed catalogue (20261121090000) began reading `is_active` and four test suites were migrated to
the contract "pilot entitlement cannot approve an inactive definition":

> **Does the owner's recorded internal-pilot authorisation (`pilot_state`) count as definition
> approval FOR A NAMED PILOT MEMBER — or must each definition also be switched on (`is_active`)?**

## The decision, who takes it, and the release action

**Who:** the product owner, acting as the authorised catalogue administrator
(`closed-catalogue-governance.md`: catalogue administration is a reviewed, versioned migration).
**Not** a legal reviewer: both routes below keep every pack in `internal_pilot`, open to named
members only. A legal reviewer is required only for PUBLIC activation of a market, which neither
route does and this document does not request.

### Route A — honour the authorisation that is already recorded (recommended)

One reviewed migration replaces the catalogue view's definition clause so that, for a caller who
is a pilot member of the definition's own pack, an `internal_pilot` definition counts as approved:

```sql
-- in sp_approved_credential_catalogue, replacing:  t.is_active AND …
(t.is_active
 OR (t.pilot_state = 'internal_pilot' AND t.market_pack_code IS NOT NULL
     AND public.sp_is_pilot_member(auth.uid(), t.market_pack_code)))
```

- Needs **no per-definition re-approval**: it uses the 44 authorisations already on record.
- `is_active` stays false, so **nothing becomes public** on the day a pack is activated.
- It reverses one recorded test contract. Four assertions must be rewritten with the owner's
  explicit confirmation: `security_passport_market_pilot_test` 5.1,
  `security_passport_pilot_catalogue_visibility_test` 3.6,
  `security_passport_pilot_write_path_test` 1.1 and
  `security_passport_global_certification_test` 14.5. This is the shape 20261124090000 first
  had; it was narrowed precisely because that confirmation had not been given.
- A definition can still be held back individually by setting its `pilot_state` to `closed`.

### Route B — approve definitions one by one

A reviewed data migration, listing exactly the codes the owner approves:

```sql
UPDATE public.sp_credential_types SET is_active = true
 WHERE market_pack_code IN ('GB','GB-NI','AE-DU')
   AND code IN ( /* the approved codes, copied from the tables below */ );
```

- No code or test changes; fully reversible per definition.
- **Trap, recorded in the code:** each approved definition becomes PUBLIC automatically the day
  its pack is activated. Route B therefore needs a second decision at activation time.
- The migration's own guard in 20261126090000 (which refuses to finish if a pilot definition is
  active) applies to that migration only; a later migration is free to approve.

Either route is followed, per tester, by the existing pilot grant on the admin user page. After
that — and only then — the definition is selectable and saveable by that tester, which
`/admin/passport-catalogue` will show as _Selectable by pilot members_.

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
