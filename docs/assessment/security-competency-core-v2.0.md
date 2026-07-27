# Security Competency Core v2.0 — the twelve constructs

Normative catalogue, transcribed from *CQrityjob Security Competency Core Specification v2.0* chapters 5 and 6. Item authors, developers, report authors and any future AI logic use these definitions and these boundaries.

Stored in `scp_competencies` (stable identity) + `scp_competency_versions` (versioned normative text) + `scp_competency_facets` (4 per construct, 48 total).

| ID | Svenskt namn | English | Operational definition |
|---|---|---|---|
| SCC-01 | Integritet och etik | Integrity & Ethics | Acting honestly, lawfully and consistently with professional ethics, policy and the legitimate purpose of the assignment — including when it is uncomfortable, when no one is watching, or under pressure to take a shortcut. |
| SCC-02 | Säkerhetsmedvetenhet | Security Awareness | Understanding protected assets, risk causes, barriers and consequences, and consistently factoring security into everyday decisions without creating unnecessary friction or excessive control. |
| SCC-03 | Situationsmedvetenhet | Situational Awareness | Noticing relevant information in a changing situation, understanding what it means, and judging what is likely to happen next. |
| SCC-04 | Beslutsfattande under press | Decision Making Under Pressure | Making sufficiently fast, proportionate and security-sound decisions when time, information or room for action is limited. |
| SCC-05 | Emotionell självreglering | Emotional Regulation | Maintaining professional behaviour, controlling impulses and returning to functional action when situations provoke frustration, fear, provocation or strong involvement. |
| SCC-06 | Kommunikation och informationskvalitet | Communication | Listening, formulating and transferring relevant information clearly, factually and appropriately for the recipient — in speech, writing and escalation. |
| SCC-07 | Respektfull service och gränshållning | Service Orientation | Providing respectful, solution-oriented and professional treatment while upholding security requirements, mandate and equal treatment. |
| SCC-08 | Samarbete och samordning | Teamwork & Collaboration | Contributing to a shared situational picture, reliable coordination and mutual support within and across roles, without responsibility becoming unclear. |
| SCC-09 | Ansvarstagande och tillförlitlighet | Accountability | Taking ownership of tasks, keeping agreements, following up deviations and creating traceability from assignment to closure. |
| SCC-10 | Anpassningsförmåga | Adaptability | Changing working methods when conditions, information or priorities change, without abandoning security principles or creating unnecessary instability. |
| SCC-11 | Professionellt omdöme och proportionalitet | Professional Judgement | Weighing facts, rules, risk, rights, operational needs and possible consequences to choose a reasonable and proportionate action within mandate. |
| SCC-12 | Lärandeorientering | Learning Orientation | Seeking feedback, reflecting on experience, updating one's knowledge and translating lessons into improved practice. |

## Facets

Four per construct, seeded in `scp_competency_facets`. **Facets exist for content coverage and item design only.** Spec 5.1 forbids reporting them as separate psychometric scales until each has enough well-functioning items and its own validity evidence — reporting them early would be false precision.

| Construct | Facets |
|---|---|
| SCC-01 | Etisk konsekvens · Transparens · Regel- och syfteslojalitet · Motstånd mot otillbörlig påverkan |
| SCC-02 | Skyddsvärdesförståelse · Barriärtänkande · Förebyggande orientering · Säkerhetsbalans |
| SCC-03 | Aktiv scanning · Avvikelseigenkänning · Situationssyntes · Framåtblick |
| SCC-04 | Prioritering · Beslutsbalans · Eskalering · Återhämtning |
| SCC-05 | Impulskontroll · Professionell distans · Återställning · Självmedvetenhet |
| SCC-06 | Aktivt lyssnande · Saklig tydlighet · Eskalering och överlämning · Dokumentation |
| SCC-07 | Respektfullt bemötande · Lösningsorientering · Gränshållning · Likvärdighet |
| SCC-08 | Informationsdelning · Rollklarhet · Ömsesidigt stöd · Samordnad problemlösning |
| SCC-09 | Ägarskap · Genomförandedisciplin · Spårbar uppföljning · Fel- och avvikelseansvar |
| SCC-10 | Kognitiv flexibilitet · Operativ omställning · Tolerans för osäkerhet · Stabil kärna |
| SCC-11 | Faktabaserad bedömning · Proportionalitet · Konsekvensanalys · Rättssäker gränsdragning |
| SCC-12 | Feedbackmottaglighet · Reflektion · Kunskapsuppdatering · Överföring |

## What the Core does not measure

Stated per construct in spec chapter 6, and binding on report language. Collectively, the Core is **not**: a lie or fraud detector, a background check or security vetting, a medical or psychiatric assessment, a measure of intelligence, a judgement of political, religious or private values, a claim about future dishonesty or future performance, or an assessment of personality traits.

Two constructs carry a particularly easy-to-breach boundary:

- **SCC-01** — no employer report may use "pålitlig", "opålitlig", "ärlig" or "oärlig" as an absolute label for a person. A low or uneven result triggers structured follow-up questions about reasoning, never suspicion of dishonesty.
- **SCC-05** — measures behavioural regulation in work situations. It must never be used to diagnose, assess mental health, or infer anything about private emotional life. No "stresstålig" label may be created from it.

## Item traceability

Every item must be traceable to: competency · facet · observable behaviour · context · response process · primary construct · at most one secondary construct · scoring rationale per option · bias review · language adaptation · SME evidence · validation status · item version · form version.

The schema makes the mandatory ones NOT NULL and the review gates CHECK-constrained, so an untraceable item cannot be stored.

## Indicative role relevance

Spec 5.2 gives an internal 1–12 relevance scale per role. **It is not a validated weighting model** and may not be used in production until job analysis, SME judgement and pilot data for that role are approved. It is stored in `scp_role_weight_profiles`, whose `validation_status` defaults to `design`.

| Role | 01 | 02 | 03 | 04 | 05 | 06 | 07 | 08 | 09 | 10 | 11 | 12 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Väktare | 12 | 11 | 10 | 9 | 8 | 9 | 9 | 8 | 10 | 8 | 10 | 7 |
| Ordningsvakt | 12 | 10 | 11 | 12 | 12 | 11 | 10 | 10 | 10 | 9 | 12 | 7 |
| Skyddsvakt | 12 | 12 | 12 | 12 | 11 | 10 | 8 | 10 | 12 | 9 | 12 | 8 |

## Form design targets

| Object | Target |
|---|---|
| Core item bank | ≥144 scored items — 12 per competency (8 SJT + 4 BIQ) |
| Core operational form v1 | 72 scored items — 6 per competency (4 SJT + 2 BIQ), 30–40 minutes |
| Profession module bank | ~48 draft items each |
| Profession module form v1 | ~24 items, 12–15 minutes |
| Combined Core + module | ~42–55 minutes before pilot evidence supports optimisation |

**No item content exists yet.** Items are authored through PR-B's review-and-publish flow. AI-generated drafts never become operational automatically.
