# Candidate Decision Support Report V2

Audit, terminology map and architecture for the recruitment assessment surfaces.
Branch: `feat/recruitment-decision-support-report-v2`.

## 1. The recruitment lifecycle as implemented

```
Job → Application → (employer reviews) → assessment assigned from the application
   → candidate completes → submits (responses immutable from here)
   → structured evidence written → human review of flagged responses
   → all reviews complete: scp_attempts.scored_at set automatically
   → employer shares the material (scp_release_attempt_report)
   → two immutable snapshots: one for the employer, one for the participant
   → employer reads the brief, records interview evidence and a follow-up decision
   → employer moves the APPLICATION on (reviewing / interview / rejected / hired)
```

Every status a surface shows comes from one SQL derivation,
`scp_attempt_lifecycle_state`, which maps engine words
(`in_progress/submitted/scored/released`) onto the product's:
`invited · in_progress · under_review · processing · ready_to_release ·
result_available · abandoned`.

`scored_at` is set by `scp_complete_human_review` the moment the last pending
review on an attempt closes. It is not an employer action. So
`ready_to_release` means exactly one thing: **all mandatory human review is
finished and the employer has not yet shared the material.**

## 2. Terminology problems found

| Where | Problem |
|---|---|
| `Frisläpp rapport`, `Klara att frisläppa`, `Frisläppt` | Internal vocabulary. Nothing on screen said what releasing does, and it does four separate things. |
| `Kompetensprofil` as the candidate report's title | Promises a durable profile that one assessment occasion cannot support. |
| `Under granskning` vs `Väntar på granskning` | Two labels for one state on two surfaces. |
| `Resultat tillgängligt` on a candidate | Workforce language on a recruitment row. |
| Report opened with provenance, then usage limits, then methodology | Several hundred words of governance before anything about the person. |
| "one assessment occasion", "not an employment decision", "self-reported is not observed" | Each said three to eight times on one page. |
| `Utvecklings- och uppföljningsområden` as a section heading | Labels the person; the per-area signal already says it more precisely. |
| Report was a dead end | No way back to the application it belongs to. |

## 3. Terminology map (recruitment context)

| Current | New | Reason |
|---|---|---|
| `Frisläpp rapport` | `Dela kandidatunderlaget` + a sentence saying what the click does | Says the act, and warns it is irreversible before it is taken |
| `Klar att frisläppa` (chip) | `Bedömning klar` | The state is "assessment finished", not "an internal step is pending" |
| `Klara att frisläppa` (KPI, shared) | `Klara att delas` | True in both contexts |
| `Frisläppta rapporter` (KPI, shared) | `Slutförda bedömningar` | True in both contexts |
| `Frisläppt` (column / date) | `Delat` | Same |
| `Under granskning` | `Väntar på granskning` | Matches the next-action label already used beside it |
| `Inbjuden` (recruitment) | `Tilldelad` | A candidate is assigned an assessment, not invited to a course |
| `Resultat tillgängligt` (recruitment) | `Kandidatunderlag klart` | Workforce keeps `Resultat tillgängligt` |
| `Kompetensprofil` (recruitment title) | `Kandidatunderlag` | Workforce keeps `Kompetensprofil` |
| `Visa resultat` (recruitment) | `Öppna kandidatunderlaget` | Names the document |
| — (new) | `Kandidatöversikt`, `Rekommenderat nästa steg`, `Starkast stöd i underlaget`, `Viktigast att följa upp`, `Säkerhetskritisk uppföljning`, `Kompetensöversikt`, `Om bedömningsunderlaget` | Report V2 section vocabulary |

`Deltagare` is **kept**. Recruitment candidates and employees run the same
assessments and sit in one governed list; the page already separates them with a
context filter and a per-row `Kandidat`/`Medarbetare` chip. Renaming the page to
`Genomföranden` would have named the object instead of the person, and would have
been wrong for the workforce half of the same list.

## 4–5. Can `frisläpp` be removed from recruitment UX?

**The click must stay. The word does not, and has gone.**

Releasing is not a formality after review. `scp_release_attempt_report` does four
things in one transaction, and three of them are disclosures:

1. freezes the employer snapshot — the report becomes readable at all;
2. freezes the **participant** snapshot — the candidate gets their own copy;
3. flips `identity_resolvable`, which is the only thing that lets an employer ask
   who the pseudonymous subject is;
4. unblocks `scp_record_employer_decision`, which refuses before release
   (`SCP_DECISION_BEFORE_RELEASE`).

Auto-releasing would publish a report to a candidate, and de-pseudonymise a
person to an employer, with no human act and no actor to attribute it to. The
function is `SECURITY DEFINER` and authorises on `auth.uid()` being an owner or
admin; a trigger has no `auth.uid()`, so removing the click also means removing
the authorisation model that stands behind the disclosure.

What was actually wrong was that nothing said any of this. So the control is
renamed to what it does and carries the four consequences and the
irreversibility in a sentence underneath it. Workforce behaviour is untouched.

## 6. Recruitment status flow, as shipped

```
Tilldelad → Pågår → Väntar på granskning → Bedömning klar
          → [Dela kandidatunderlaget] → Kandidatunderlag klart → Nästa steg
```

## 7. Report architecture, before

`ReportContextPanel` (provenance) → `DecisionSummary` (usage limits) →
`SafetyFlagNotice` → `CandidateBrief` (narrative, modules, coverage, pace,
strengths, development, limited, self-reported, interview guide, "not a
decision") → `EvidenceCoverage` → maturity lines → interview notes → employer
decision → limitations.

## 8. Report V2 architecture

```
1  Kandidatöversikt        recommended process step + why
                           candidate-specific narrative (frozen in the snapshot)
                           4 panels: strongest · follow-up · safety-critical · uncertain
                           compact context strip
2  Nästa steg i rekryteringen   link back to the application
3  Kompetensöversikt       one ordered list of assessment cards
                           status · summary · why it matters · follow up
4  Självrapporterat arbetsbeteende
5  Strukturerad intervjuguide   unchanged in substance
6  Intervjuunderlag        (notes recorded after the conversation)
7  Arbetsgivarens uppföljning
8  Om bedömningsunderlaget  ALL methodology, once
9  Om den här bedömningen   provenance and lineage, folded
```

The fork is on `context.personContext === "candidate"`, read from the frozen
snapshot. The workforce report is byte-for-byte unchanged. A snapshot with no
brief takes the legacy path whichever audience it belongs to.

## 9–10. AI architecture and fallback

`src/lib/security-competency/decision-support.ts` — the Decision Support Summary
Builder, `rds-v1`:

```
frozen brief (observed[] · selfReported[] · interviewGuide[] · coverage)
  + safety flag count
      ↓  buildDecisionSupportInput   — no name, no ids, no raw responses
      ↓  buildDecisionSupport        — deterministic buckets + one process step
      ↓  enrichDecisionSupport(aiCall?)  — optional narrative rewrite
      ↓  validated DecisionSupport
```

The narrative is the paragraph `scp_brief_executive_summary` already freezes with
the snapshot — deterministic SQL, traceable to the rows that produced it. Nothing
was rebuilt.

**No AI provider is wired in and none was added.** The seam mirrors the one
already in `src/lib/career-discovery/v31/ai-explanation.ts`, so there is one
shape to implement when the owner chooses a provider. What an AI layer may do is
enforced in code, not in a prompt:

* it may reword the narrative;
* it may **not** choose the step — the deterministic value is written back;
* it may **not** name an area absent from the input — rejected wholesale;
* it may **not** use verdict or ranking vocabulary — rejected;
* it may **not** fail loudly — any throw returns the deterministic result.

Fallback is therefore not a degraded path; it is the only path in production
today, and the report is complete on it.

## 11. Example executive summary (test candidate 4C42C8)

> **Rekommenderat nästa steg — Begär förtydligande**
> Ett eller flera svar rör säkerhetskritisk bedömning och har lästs av en
> granskare. Förtydliga de svaren innan processen går vidare — intervjuguiden
> nedan är ett sätt att göra det.
>
> Inget område nådde sammanhållet observerat underlag i den här bedömningen.
> Underlaget var mer blandat kring Ansvarstagande och tillförlitlighet, där
> svaren skilde sig åt mellan jämförbara uppgifter. Svaren låg genomgående lägre
> inom Kommunikation och informationskvalitet och Situationsmedvetenhet.
> Beslutsfattande under press, Integritet och etik, Professionellt omdöme och
> proportionalitet, Respektfull service och gränshållning och Samarbete och
> samordning berördes för lite i bedömningen för att säga något, vilket inte ska
> läsas som en svaghet. Självrapporterade svar beskriver ett genomgående
> arbetssätt kring aktiv scanning, fel- och avvikelseansvar och
> genomförandedisciplin.

The narrative is the existing frozen paragraph. What is new above it is the
recommended step and its reason.

## 12. Example competency card

> **Situationsmedvetenhet**  ·  Utvecklingsområde  ·  `Observerat`
>
> Svaren valde genomgående handlingsalternativ som uppgifterna beskriver som
> mindre välavvägda (4 uppgifter).
>
> **Varför det är relevant:** Bedömer situationen utifrån det som faktiskt
> observeras innan hen agerar.
>
> **Följ upp:** Berätta om en gång då du märkte att något inte stämde på en plats
> du kände väl.
>
> 4 uppgifter

## 13. Governance position

Nothing in this change touches tenant isolation, reviewer authorisation, the
human-review gate, evidence provenance or the observed/self-report boundary. No
migration is required and none was written. The one new server function reads
two id columns from `assessment_assignments` under the existing employer RLS
policy, and returns `{}` rather than failing if that policy refuses.
