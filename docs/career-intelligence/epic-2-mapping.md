# Epic 2 — Full 67-profession Career Family Mapping

Owner-approved (Option A + clarifications). Each row lists the profession's
DB slug, its current legacy DB family (kebab-case), the assigned canonical
family (snake_case), and a short rationale. Confidence is High unless flagged.

## Legacy → default canonical guidance

| Legacy DB family | Default canonical | Split? |
| --- | --- | --- |
| operational-security | protective_operations | yes (critical_infra, corrections_secure_transport) |
| public-order | protective_operations | no |
| private-protection-close-security | protective_operations | no |
| physical-protective-security | protective_operations | no |
| law-enforcement | public_safety_justice | no |
| customs-border | public_safety_justice | exception: defence_national_security |
| emergency-rescue | **public_safety_justice** (per owner clarification) | no |
| defence | defence_national_security | no |
| corporate-security-leadership | split | corporate_security / security_leadership_governance / financial_crime_compliance |
| risk-crisis-management | split | risk_management / crisis_management / business_continuity_resilience |
| cyber-information-security | cyber_information_security | no |
| security-technology | security_technology | no |
| investigation-intelligence | split | investigations_intelligence / financial_crime_compliance |

## Full mapping (67 professions)

| # | slug | legacy family | canonical family | rationale |
|---|---|---|---|---|
| 1 | vaktare | operational-security | protective_operations | Guard, core protective ops |
| 2 | butikskontrollant | operational-security | protective_operations | Retail loss prevention |
| 3 | flygplatssakerhet | operational-security | critical_infrastructure_security | Airport security |
| 4 | hamnsakerhetssamordnare | operational-security | critical_infrastructure_security | Port security coord |
| 5 | hundforare | operational-security | protective_operations | Dog handler, guarding |
| 6 | larmoperator | operational-security | protective_operations | Alarm centre operator |
| 7 | maritim-sakerhet | operational-security | critical_infrastructure_security | Maritime facility security |
| 8 | sakerhetsreceptionist | operational-security | protective_operations | Security reception |
| 9 | vardetransportor | operational-security | corrections_secure_transport | Cash-in-transit |
| 10 | evenemangsvakt | public-order | protective_operations | Event steward |
| 11 | ordningsvakt | public-order | protective_operations | Public order guard |
| 12 | ordningsvaktsledare | public-order | protective_operations | Public order team lead |
| 13 | parkeringsvakt | public-order | protective_operations | Parking enforcement |
| 14 | trygghetsvard | public-order | protective_operations | Community safety |
| 15 | livvakt | private-protection-close-security | protective_operations | Close protection |
| 16 | personskyddsvakt | private-protection-close-security | protective_operations | Personal protection |
| 17 | skyddsvakt | physical-protective-security | protective_operations | Skyddsvakt / physical prot ops |
| 18 | polis | law-enforcement | public_safety_justice | Police officer |
| 19 | tull-granskontrollant | customs-border | public_safety_justice | Border-control officer |
| 20 | tulltjansteman | customs-border | public_safety_justice | Customs officer |
| 21 | ambulanssjukvardare | emergency-rescue | public_safety_justice | EMS (per owner clarification) |
| 22 | brandman | emergency-rescue | public_safety_justice | Firefighter (per owner clarification) |
| 23 | raddningsledare | emergency-rescue | public_safety_justice | Rescue-service commander |
| 24 | cybersoldat | defence | defence_national_security | Cyber soldier, defence-oriented |
| 25 | fm-civil-sakerhetsspecialist | defence | defence_national_security | FM civilian security |
| 26 | militarpolis | defence | defence_national_security | Military police |
| 27 | officer | defence | defence_national_security | Officer |
| 28 | reservofficer | defence | defence_national_security | Reserve officer |
| 29 | sakerhetssoldat | defence | defence_national_security | Security soldier |
| 30 | sjoman | defence | defence_national_security | Naval seaman |
| 31 | soldat | defence | defence_national_security | Soldier |
| 32 | specialistofficer | defence | defence_national_security | Specialist officer |
| 33 | underrattelsesoldat | defence | defence_national_security | Intel soldier — defence-oriented |
| 34 | aml-specialist | corporate-security-leadership | financial_crime_compliance | AML core FCC discipline |
| 35 | auditor-sakerhet | corporate-security-leadership | security_leadership_governance | Security auditor / governance |
| 36 | compliance-officer | corporate-security-leadership | financial_crime_compliance | Compliance / FCC |
| 37 | sakerhetschef | corporate-security-leadership | security_leadership_governance | CSO / head of security |
| 38 | sakerhetssamordnare | corporate-security-leadership | corporate_security | In-house security coord |
| 39 | utbildare-sakerhet | corporate-security-leadership | security_leadership_governance | Security trainer / L&D |
| 40 | arbetsmiljosamordnare | risk-crisis-management | risk_management | H&S risk coordinator |
| 41 | bcm-specialist | risk-crisis-management | business_continuity_resilience | BCM specialist |
| 42 | krisberedskapssamordnare | risk-crisis-management | crisis_management | Crisis preparedness coord |
| 43 | krisstod | risk-crisis-management | crisis_management | Crisis support responder |
| 44 | risk-manager | risk-crisis-management | risk_management | Risk manager |
| 45 | cybersakerhetsanalytiker | cyber-information-security | cyber_information_security | Cyber analyst |
| 46 | dataskyddsombud | cyber-information-security | cyber_information_security | DPO |
| 47 | iam-specialist | cyber-information-security | cyber_information_security | IAM |
| 48 | incident-responder | cyber-information-security | cyber_information_security | IR |
| 49 | informationssakerhetsspecialist | cyber-information-security | cyber_information_security | InfoSec |
| 50 | penetrationstestare | cyber-information-security | cyber_information_security | Pen-testing |
| 51 | soc-analytiker | cyber-information-security | cyber_information_security | SOC analyst |
| 52 | accesscontrol-tekniker | security-technology | security_technology | Access control tech |
| 53 | cctv-tekniker | security-technology | security_technology | CCTV tech |
| 54 | fastighetsskotare-sakerhet | security-technology | security_technology | Facility security tech |
| 55 | installator-larm | security-technology | security_technology | Alarm installer |
| 56 | sakerhetstekniker | security-technology | security_technology | Security technician |
| 57 | civil-utredare | investigation-intelligence | investigations_intelligence | Civilian investigator |
| 58 | forensic-analyst | investigation-intelligence | investigations_intelligence | Forensic analyst |
| 59 | forensiker | investigation-intelligence | investigations_intelligence | Forensic examiner |
| 60 | forsakringsutredare | investigation-intelligence | financial_crime_compliance | Insurance-fraud investigator |
| 61 | fraud-analyst | investigation-intelligence | financial_crime_compliance | Fraud analyst |
| 62 | osint-analytiker | investigation-intelligence | investigations_intelligence | OSINT analyst |
| 63 | polis-intel-analytiker | investigation-intelligence | investigations_intelligence | Police intel analyst |
| 64 | polisutredare | investigation-intelligence | investigations_intelligence | Police investigator |
| 65 | privatdetektiv | investigation-intelligence | investigations_intelligence | Private investigator |
| 66 | sakerhetsutredare | investigation-intelligence | investigations_intelligence | Security investigator |
| 67 | threat-intel-analytiker | investigation-intelligence | investigations_intelligence | Threat intel analyst |

All mappings are High confidence. No profession was blocked.

## Job rows (Phase A demo seed)

| job slug | legacy family_id | canonical family_id |
| --- | --- | --- |
| aurora-corporate-security-demo-sakerhetschef-goteborg-demo0002 | corporate | security_leadership_governance |
| fjord-cyber-sentinel-demo-soc-analytiker-malmo-demo0003 | cyber_infosec | cyber_information_security |
| nordic-guarding-demo-skyddsvakt-stockholm-demo0006 | defence_protective | protective_operations |
| aurora-corporate-security-demo-livvakt-stockholm-demo0008 | defence_protective | protective_operations |
| nordic-guarding-demo-vaktare-stockholm-demo0001 | guarding | protective_operations |
| karnkraft-skyddscentrum-demo-sakerhetstekniker-linkoping-demo0005 | physical_technical | security_technology |
| sentinel-public-safety-demo-polis-uppsala-demo0004 | public_safety_justice | public_safety_justice |
| sentinel-public-safety-demo-ordningsvakt-stockholm-demo0007 | police_public | public_safety_justice |

(The `polis` job already used `police_public`; both remap to `public_safety_justice`.)