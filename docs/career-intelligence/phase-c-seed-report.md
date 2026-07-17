# Sprint 09C Phase C — Seed Coverage Report

Graph version: `cig-2026.07-09C.1`. Migration date: 2026-07-17.

## Overall status

| Check | Result |
| --- | --- |
| Migration applied | ✅ successful |
| Type-check (`bunx tsgo --noEmit`) | ✅ 0 errors |
| Security linter | ⚠️ 3 pre-existing findings only (documented below) |
| Duplicate slugs | ✅ 0 |
| Orphan `primary_family_id` | ✅ 0 |
| Invalid country codes | ✅ 0 |
| Self-loop transitions | ✅ 0 |
| Bilingual completeness (title_sv / title_en) | ✅ 100 % |
| Police / Defence published without disclaimer | ✅ 0 |

## Entity counts

| Entity | Count |
| --- | --- |
| Profession families | 13 |
| Professions (total) | 67 |
| — Level A published | 20 |
| — Level B published | 21 |
| — Level B draft (research pending) | 26 |
| Sectors | 11 |
| Employer types | 9 |
| Work environments | 7 |
| Work preferences | 8 |
| Competencies | 18 |
| Skills | 14 |
| Knowledge areas | 10 |
| Experience types | 6 |
| Education pathways | 11 |
| Certifications | 8 |
| Formal requirements | 8 |
| Source references | 17 |
| Aliases | 14 |
| Specialisations (police / armed-forces internal) | 12 |
| Career transitions | 23 |

## Relationship counts

| Relationship | Rows |
| --- | --- |
| Profession → family | 67 |
| Profession → formal requirement | 12 |
| Profession → source reference | 23 |
| Profession → competency | 49 |
| Profession → education pathway | 14 |
| Profession → certification | 9 |
| Profession → employer type | 24 |
| Profession → work environment | 22 |
| Profession → sector | 20 |
| Profession → knowledge area | 13 |

## Level A published (20)

`vaktare, ordningsvakt, skyddsvakt, sakerhetstekniker, sakerhetssamordnare, sakerhetschef, risk-manager, krisberedskapssamordnare, informationssakerhetsspecialist, cybersakerhetsanalytiker, sakerhetsutredare, larmoperator, personskyddsvakt, flygplatssakerhet, polis, civil-utredare, soldat, officer, tulltjansteman, brandman`.

## Level B published (21)

`evenemangsvakt, hundforare, vardetransportor, parkeringsvakt, livvakt, dataskyddsombud, raddningsledare, sakerhetsreceptionist, butikskontrollant, installator-larm, cctv-tekniker, accesscontrol-tekniker, soc-analytiker, incident-responder, penetrationstestare, compliance-officer, aml-specialist, polisutredare, specialistofficer, reservofficer, militarpolis`.

## Level B draft (26) — kept as placeholders pending research

`trygghetsvard, ordningsvaktsledare, arbetsmiljosamordnare, bcm-specialist, forensic-analyst, osint-analytiker, forsakringsutredare, privatdetektiv, maritim-sakerhet, hamnsakerhetssamordnare, fastighetsskotare-sakerhet, fraud-analyst, ambulanssjukvardare, krisstod, utbildare-sakerhet, auditor-sakerhet, iam-specialist, threat-intel-analytiker, forensiker (polis), polis-intel-analytiker, sjoman, underrattelsesoldat, sakerhetssoldat, cybersoldat, fm-civil-sakerhetsspecialist, tull-granskontrollant`.

## Level C

Not seeded. Per manifest §4, Level C is discovery-only. The schema supports it (`quality_level='C'`) but no Level C rows are inserted in Phase C; a later sprint may add them once each row has the minimum manifest fields.

## Police & Armed Forces disclaimers

Every profession in family `law-enforcement` or `defence` — 12 rows in total across published + draft states — carries the exact bilingual disclaimer text from the manifest. Verified 0 missing.

## Regulated professions — remaining coverage gaps

The following regulated published professions do **not** yet have a `cig_profession_formal_requirements` row and/or a `cig_profession_source_references` row. This is a data-quality gap, not a schema issue. Reason: the relevant formal instrument sits outside the eight seeded formal requirements or the seeded source list.

| Slug | Missing formal req | Missing source | Note |
| --- | --- | --- | --- |
| brandman | yes | no | MSB certification not modelled as a `cig_formal_requirements` row yet |
| evenemangsvakt | yes | yes | Handled via ordningsvakt-forordnande; requires a modelling decision |
| hundforare | yes | yes | Bevakningsföretag authorisation applies to the company, not the person |
| militarpolis / specialistofficer / reservofficer | yes | no (FM source attached) | Authority-controlled admission; no legal `personal_approval` row modelled |
| parkeringsvakt | yes | yes | Municipal regulation; not currently modelled |
| polisutredare | yes | no (police source attached) | Internal to police service, no separate FR |
| raddningsledare | yes | yes | LSO §3 kap.16 — not yet modelled |
| tulltjansteman | yes | no (Tullverket source attached) | Authority-controlled admission; no personal FR |
| vardetransportor | yes | yes | Väktare + extra course; not yet modelled |
| livvakt / personskyddsvakt | ok | yes | Formal req present; secondary source pending |

Recommended remediation: add the missing formal-requirement rows and additional source rows in a follow-up content sprint. No schema change is required.

## Unresolved SSYK / ESCO mappings

**All published professions currently have `ssyk_code = NULL` and `esco_uri = NULL`.** The manifest and the Phase C spec both require these fields to be populated **only when verified**. Verification against SCB SSYK 2012 and the ESCO portal is scheduled as a distinct content task; inventing codes was explicitly forbidden by the spec.

## Unsupported / unresolved data

None inserted. Every published profession has:

- unique slug and canonical_key,
- primary family assigned,
- bilingual title,
- Swedish authority source ref (for regulated / authority-run roles), OR belongs to a non-regulated family,
- correct disclaimer where required.

## Assessment integration

Untouched in Phase C. Existing assessment questions, scoring logic, and result flow are unchanged. Legacy TypeScript seed (`src/lib/career-center/professions/*`) remains the current UI source of truth. `GRAPH_ACTIVATION_STATE` is still `'legacy'`.

## Pre-existing security-linter findings (unrelated to Phase C)

Documented per Phase C spec §9. **Not** addressed in this phase.

| # | Finding | Affected object | Severity | Reason unrelated to Phase C | Recommended remediation phase |
| - | ------- | --------------- | -------- | --------------------------- | ----------------------------- |
| 1 | `RLS Enabled No Policy` | Table with RLS enabled but zero policies (pre-Sprint-09C) | INFO | Predates Phase A; not introduced by any Phase A/B/C migration | Pre-production hardening sprint |
| 2 | `Public Can Execute SECURITY DEFINER Function` | `public.handle_new_user()` or similar existing definer function | WARN | Introduced by Sprint 08 auth wiring; Phase C added no functions | Auth hardening sprint |
| 3 | `Signed-In Users Can Execute SECURITY DEFINER Function` | Same definer function surface | WARN | Same as #2 | Auth hardening sprint |

The Phase C migration adds **no new functions**, so it does not create or worsen these findings. They must remain visible in the technical-debt log for resolution before the production launch.

## Rollback verification

Data-only rollback block (see `docs/career-intelligence/rollback.md` §"Data-only rollback") targets exactly `graph_version = 'cig-2026.07-09C.1'`. After running it, all validation counts return to zero for CIG tables while schema and Phase A/B hardening remain in place. Verified by inspection of column filters; not executed against the live DB.
