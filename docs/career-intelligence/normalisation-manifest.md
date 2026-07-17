# CIG Normalisation Manifest — Sprint 09C Phase B

Status: **Docs only.** No DB inserts. Feeds Phase C seed migration.
Graph version: `cig-2026.07-09C.1`. Locale: SV + EN mandatory for every canonical entry.

Conventions:

- `canonical_key`: stable string, lowercase, dot-separated (`se.security.vaktare`).
- `slug`: URL-friendly, hyphenated (`vaktare`).
- `quality_level`: **A** = fully researched, **B** = published with core fields, **C** = discovery-only (excluded from primary matcher).
- `family`: primary profession family.
- `country`: ISO-3166 alpha-2 (`SE`, `NO`, `DK`, `FI`, `EU`, or `INT`).
- Police (Polismyndigheten) and Armed Forces (Försvarsmakten) canonicals carry a mandatory disclaimer: *"Formal eligibility, admission and selection are determined by the responsible authority."* / *"Formell behörighet, antagning och urval beslutas av ansvarig myndighet."*
- Internal police/military functions are represented as `profession_specialisations` or `career_transitions` destinations, **never** as direct-entry canonical professions.

---

## 1. Profession families (13)

| slug | title_sv | title_en |
| --- | --- | --- |
| operational-security | Operativ säkerhet | Operational security |
| physical-protective-security | Fysisk skyddssäkerhet | Physical protective security |
| public-order | Ordning och trygghet | Public order & safety |
| security-technology | Säkerhetsteknik | Security technology |
| cyber-information-security | Cyber- och informationssäkerhet | Cyber & information security |
| risk-crisis-management | Risk- och krishantering | Risk & crisis management |
| corporate-security-leadership | Företagssäkerhet och ledarskap | Corporate security & leadership |
| investigation-intelligence | Utredning och underrättelse | Investigation & intelligence |
| emergency-rescue | Räddning och akutinsats | Emergency & rescue |
| defence | Försvar | Defence |
| law-enforcement | Rättsvårdande | Law enforcement |
| private-protection-close-security | Personskydd | Private protection & close security |
| customs-border | Tull och gräns | Customs & border |

---

## 2. Level A — canonical, primary-matcher pool (≥ 20)

Each Level A entry requires: bilingual title/summary/overview, family, formal-requirement rows (with ≥ 1 source of type `official` or `primary`), entry pathway, minimum 2 career transitions, and reliable sources.

| canonical_key | slug | title_sv | title_en | family | country | regulated | notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| se.security.vaktare | vaktare | Väktare | Security Officer (Väktare) | operational-security | SE | yes | Väktarutbildning + Länsstyrelsens godkännande |
| se.security.ordningsvakt | ordningsvakt | Ordningsvakt | Public Order Guard | public-order | SE | yes | Polismyndighetens förordnande |
| se.security.skyddsvakt | skyddsvakt | Skyddsvakt | Protective Security Guard | physical-protective-security | SE | yes | Länsstyrelsens godkännande (ord.); Försvarsmakten där tillämpligt |
| se.security.sakerhetstekniker | sakerhetstekniker | Säkerhetstekniker | Security Technician | security-technology | SE | no |  |
| se.security.sakerhetssamordnare | sakerhetssamordnare | Säkerhetssamordnare | Security Coordinator | corporate-security-leadership | SE | no |  |
| se.security.sakerhetschef | sakerhetschef | Säkerhetschef | Head of Security | corporate-security-leadership | SE | no |  |
| se.security.riskmanager | risk-manager | Riskchef | Risk Manager | risk-crisis-management | SE | no |  |
| se.security.krisberedskapssamordnare | krisberedskapssamordnare | Krisberedskapssamordnare | Crisis Preparedness Coordinator | risk-crisis-management | SE | no |  |
| se.security.informationssakerhetsspecialist | informationssakerhetsspecialist | Informationssäkerhetsspecialist | Information Security Specialist | cyber-information-security | SE | no |  |
| se.security.cybersakerhetsanalytiker | cybersakerhetsanalytiker | Cybersäkerhetsanalytiker | Cybersecurity Analyst | cyber-information-security | SE | no |  |
| se.security.sakerhetsutredare | sakerhetsutredare | Säkerhetsutredare | Security Investigator | investigation-intelligence | SE | no |  |
| se.security.larmoperator | larmoperator | Larmoperatör | Alarm Centre Operator | operational-security | SE | no |  |
| se.security.personskydd | personskyddsvakt | Personskyddsvakt | Close Protection Officer | private-protection-close-security | SE | no |  |
| se.security.flygplatssakerhet | flygplatssakerhet | Säkerhetskontrollant flygplats | Airport Security Officer | operational-security | SE | yes | TSA/EASA-motsv., certifiering |
| se.police.polis | polis | Polis | Police Officer | law-enforcement | SE | yes | Antagning via Polismyndigheten. **Disclaimer required.** |
| se.police.civil-utredare | civil-utredare | Civil utredare | Civilian Investigator (Police) | investigation-intelligence | SE | yes | **Disclaimer required.** |
| se.armed-forces.soldat | soldat | Soldat | Soldier | defence | SE | yes | Antagning via Försvarsmakten. **Disclaimer required.** |
| se.armed-forces.officer | officer | Officer | Officer | defence | SE | yes | **Disclaimer required.** |
| se.customs.tulltjansteman | tulltjansteman | Tulltjänsteman | Customs Officer | customs-border | SE | yes |  |
| se.rescue.brandman | brandman | Brandman | Firefighter | emergency-rescue | SE | yes | MSB-utbildning |

**Count: 20.** Additional Level A candidates may be promoted from Level B in Phase C if research completeness reaches the A bar; the seed target is ≥ 20.

---

## 3. Level B — published with core fields (35–45)

Each Level B entry requires: bilingual definition, family, assessment profile, core capabilities, formal requirements (where applicable), entry pathway, transitions, and at least one reliable source.

| canonical_key | slug | title_sv | title_en | family | country | regulated |
| --- | --- | --- | --- | --- | --- | --- |
| se.security.receptionist-med-sakerhet | sakerhetsreceptionist | Säkerhetsreceptionist | Security Receptionist | operational-security | SE | no |
| se.security.butiksvakt | butikskontrollant | Butikskontrollant | Loss Prevention Officer | operational-security | SE | no |
| se.security.evenemangsvakt | evenemangsvakt | Evenemangsvakt | Event Security Officer | public-order | SE | yes |
| se.security.hundforare | hundforare | Hundförare (bevakning) | Security Dog Handler | operational-security | SE | yes |
| se.security.vardetransport | vardetransportor | Värdetransportör | Cash-in-Transit Officer | operational-security | SE | yes |
| se.security.installatorlarm | installator-larm | Larminstallatör | Alarm Installer | security-technology | SE | no |
| se.security.cctv-tekniker | cctv-tekniker | CCTV-tekniker | CCTV Technician | security-technology | SE | no |
| se.security.accesscontrol-tekniker | accesscontrol-tekniker | Accesskontrolltekniker | Access Control Technician | security-technology | SE | no |
| se.security.trygghetsvard | trygghetsvard | Trygghetsvärd | Community Safety Host | public-order | SE | no |
| se.security.parkeringsvakt | parkeringsvakt | Parkeringsvakt | Parking Enforcement Officer | public-order | SE | yes |
| se.security.ordningsvaktsledare | ordningsvaktsledare | Ordningsvaktsledare | Public Order Guard Team Lead | public-order | SE | yes |
| se.security.arbetsmiljosamordnare | arbetsmiljosamordnare | Arbetsmiljösamordnare | HSE Coordinator | risk-crisis-management | SE | no |
| se.security.bcm-specialist | bcm-specialist | Kontinuitetsspecialist | Business Continuity Specialist | risk-crisis-management | SE | no |
| se.security.gdpr-samordnare | dataskyddsombud | Dataskyddsombud | Data Protection Officer | cyber-information-security | SE | yes |
| se.security.penetrationstestare | penetrationstestare | Penetrationstestare | Penetration Tester | cyber-information-security | SE | no |
| se.security.soc-analytiker | soc-analytiker | SOC-analytiker | SOC Analyst | cyber-information-security | SE | no |
| se.security.incident-responder | incident-responder | Incident Responder | Incident Responder | cyber-information-security | SE | no |
| se.security.forensic-analyst | forensic-analyst | Digital forensiker | Digital Forensics Analyst | investigation-intelligence | SE | no |
| se.security.oppen-kalla-analytiker | osint-analytiker | OSINT-analytiker | OSINT Analyst | investigation-intelligence | SE | no |
| se.security.forsakringsutredare | forsakringsutredare | Försäkringsutredare | Insurance Investigator | investigation-intelligence | SE | no |
| se.security.privatdetektiv | privatdetektiv | Privatdetektiv | Private Investigator | investigation-intelligence | SE | no |
| se.security.livvakt | livvakt | Livvakt | Bodyguard | private-protection-close-security | SE | yes |
| se.security.maritim-sakerhet | maritim-sakerhet | Sjöfartsskyddsansvarig | Maritime Security Officer | operational-security | SE | yes |
| se.security.hamnsakerhet | hamnsakerhetssamordnare | Hamnskyddssamordnare | Port Facility Security Officer | operational-security | SE | yes |
| se.security.fastighetsskotare-sakerhet | fastighetsskotare-sakerhet | Fastighetstekniker (säkerhet) | Facility Security Technician | security-technology | SE | no |
| se.security.compliance-officer | compliance-officer | Compliance Officer | Compliance Officer | corporate-security-leadership | SE | no |
| se.security.aml-specialist | aml-specialist | AML-specialist | AML Specialist | corporate-security-leadership | SE | no |
| se.security.fraud-analyst | fraud-analyst | Bedrägerianalytiker | Fraud Analyst | investigation-intelligence | SE | no |
| se.rescue.ambulanssjukvardare | ambulanssjukvardare | Ambulanssjukvårdare | Emergency Medical Technician | emergency-rescue | SE | yes |
| se.rescue.raddningsledare | raddningsledare | Räddningsledare | Rescue Operations Commander | emergency-rescue | SE | yes |
| se.security.krisstod | krisstod | Krisstödsspecialist | Crisis Support Specialist | risk-crisis-management | SE | no |
| se.security.utbildare-sakerhet | utbildare-sakerhet | Säkerhetsutbildare | Security Trainer | corporate-security-leadership | SE | no |
| se.security.auditor-sakerhet | auditor-sakerhet | Säkerhetsrevisor | Security Auditor | corporate-security-leadership | SE | no |
| se.security.iam-specialist | iam-specialist | IAM-specialist | Identity & Access Management Specialist | cyber-information-security | SE | no |
| se.security.threat-intelligence | threat-intel-analytiker | Hotunderrättelseanalytiker | Threat Intelligence Analyst | investigation-intelligence | SE | no |
| se.police.polisutredare | polisutredare | Polisutredare | Police Investigator | investigation-intelligence | SE | yes |
| se.police.forensiker | forensiker | Kriminaltekniker | Forensic Technician | investigation-intelligence | SE | yes |
| se.police.intel-analyst | polis-intel-analytiker | Underrättelseanalytiker (polis) | Police Intelligence Analyst | investigation-intelligence | SE | yes |
| se.armed-forces.sjoman | sjoman | Sjöman (marin) | Sailor (Navy) | defence | SE | yes |
| se.armed-forces.specialistofficer | specialistofficer | Specialistofficer | Specialist Officer | defence | SE | yes |
| se.armed-forces.reservofficer | reservofficer | Reservofficer | Reserve Officer | defence | SE | yes |
| se.armed-forces.militarpolis | militarpolis | Militärpolis | Military Police | defence | SE | yes |
| se.armed-forces.underrattelsesoldat | underrattelsesoldat | Underrättelsesoldat | Intelligence Soldier | defence | SE | yes |
| se.armed-forces.sakerhetssoldat | sakerhetssoldat | Säkerhetssoldat | Security Soldier | defence | SE | yes |
| se.armed-forces.cybersoldat | cybersoldat | Cybersoldat | Cyber Soldier | defence | SE | yes |
| se.armed-forces.civil-sakerhet | fm-civil-sakerhetsspecialist | Civil säkerhetsspecialist (FM) | Civilian Security Specialist (Armed Forces) | defence | SE | yes |
| se.customs.granspolis-civil | tull-granskontrollant | Gränskontrollant (tull) | Border Control Officer | customs-border | SE | yes |

**Count: 47.** Regulated defence and police canonicals **all** carry the mandatory disclaimer.

---

## 4. Level C — discovery-only (excluded from primary matcher)

Represented in the graph for search, transitions, and family navigation. **Excluded** from the primary matcher pool and from top-N result cards. Minimum fields: `slug`, `canonical_key`, bilingual title, family, `quality_level='C'`, `content_status='published'`.

Indicative list (final set finalised in Phase C):

`se.security.trainee-vaktare`, `se.security.larmcentraloperator-junior`, `se.security.field-service-tech`, `se.security.ronderande-vakt`, `se.security.stationar-vakt`, `se.security.trafikledare-tunnelbana`, `se.security.crowd-marshal`, `se.security.museumsvakt`, `se.security.klubbvakt`, `se.security.hotellsakerhetsansvarig`, `se.security.grc-analytiker`, `se.security.security-architect`, `se.security.appsec-engineer`, `se.security.cloud-security-engineer`, `se.security.ot-sakerhet`, `se.security.ics-scada-analyst`, `se.rescue.sjoraddare`, `se.rescue.raddningsdykare`, `se.security.k9-sok`, `se.security.narkotikahundforare`.

---

## 5. Aliases, specialisations, and destinations

`profession_aliases.alias_kind`:

- `alias` — synonyms, historic titles, common misspellings (e.g. "väktare" ↔ "security guard", "bevakare").
- `seniority` — junior/senior variants that do not merit a canonical entry.
- `context` — sector-flavoured variants (e.g. "sjukhusvakt" as context of `vaktare`).
- `specialisation` — narrower role treated as an attribute of a canonical.
- `destination` — role reached from a canonical through career progression; also represented as `cig_career_transitions`.

Internal police/military functions (patrol, close protection unit, K9 unit, technical surveillance, cyber operations, intelligence, negotiator, dive team, EOD, etc.) are represented **only** as `specialisation` or `destination` aliases attached to the four Level A police canonicals and the ten defence canonicals — **never** as their own canonical direct-entry professions. Rationale: eligibility, admission, and selection are authority-controlled and not user-navigable career entries.

---

## 6. Career transitions (canonical seed set)

Seed transitions in Phase C for every Level A + Level B pair with a reasonable career path. Non-exhaustive seed examples (`kind` ∈ `lateral | promotion | pivot | specialisation | entry`):

- `vaktare` → `ordningsvakt` (specialisation)
- `vaktare` → `skyddsvakt` (specialisation)
- `vaktare` → `personskyddsvakt` (promotion)
- `vaktare` → `larmoperator` (pivot)
- `sakerhetstekniker` → `sakerhetssamordnare` (pivot)
- `sakerhetssamordnare` → `sakerhetschef` (promotion)
- `informationssakerhetsspecialist` → `soc-analytiker` (specialisation)
- `soc-analytiker` → `incident-responder` (promotion)
- `soc-analytiker` → `threat-intel-analytiker` (pivot)
- `polis` → `polisutredare` (specialisation)
- `polis` → `polis-intel-analytiker` (specialisation)
- `soldat` → `specialistofficer` (promotion)
- `soldat` → `sakerhetssoldat` (specialisation)
- `officer` → `sakerhetschef` (pivot, civilian)
- `brandman` → `raddningsledare` (promotion)
- `ambulanssjukvardare` → `krisstod` (pivot)

Self-loops are prevented by the DB constraint `cig_transitions_no_self_loop`.

---

## 7. Country-code discipline

All `country` fields on `cig_professions`, `cig_formal_requirements`, and `cig_profession_formal_requirements` use ISO-3166 alpha-2. Current seed set uses `SE` exclusively. EU-wide regulations (e.g. GDPR-derived, EASA aviation security) attach through `cig_source_references.jurisdiction = 'EU'`, with the linked profession row still marked `SE`.

---

## 8. Disclaimers (Police + Armed Forces)

Every canonical under `family='law-enforcement'` OR `family='defence'` carries:

- `disclaimer_sv`: *"Formell behörighet, antagning och urval beslutas av ansvarig myndighet (Polismyndigheten respektive Försvarsmakten). CQrityjob ger karriärvägledning, inte antagningsbesked."*
- `disclaimer_en`: *"Formal eligibility, admission and selection are determined by the responsible authority (Swedish Police Authority or Swedish Armed Forces respectively). CQrityjob provides career guidance, not admission decisions."*

---

## 9. Sources

Every regulated profession must resolve at least one `cig_source_references` row of `source_type in ('official','primary')` through `cig_profession_formal_requirements.source_id`. Enforced by extended `kg-check.ts` in Phase E. `link_status` is monitored by `scripts/sources-check.ts` (report only — never hides a profession).

---

## 10. Out of scope for Phase C

- Adaptive assessment
- Employer ranking / employer intelligence tables (`emp_*` namespace, future sprint)
- Behavioural Traits content (schema-ready via `cig_assessment_dimensions.category`; content is a later sprint)
- Career DNA vectors (user-scoped, future sprint)
- AI Explanations content (schema-ready via `notes jsonb`; content is a later sprint)
- Learning Recommendation instances beyond catalogue rows

---

**Ready for Phase C seed migration.**