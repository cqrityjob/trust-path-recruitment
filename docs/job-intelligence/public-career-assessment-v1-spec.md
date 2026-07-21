# Public Career Assessment v1.0 — Question Specification

**Status: implemented, questions in `draft`/`published` status per asset (see below).** Live at `/security-career-assessment`, Assessment Catalog definition `public-career-assessment` (`supabase/migrations/20260721110000_assessment_catalog_public_career_assessment.sql`).

**Internal document.** Candidate-facing content lives in `src/lib/question-library/assets/*.ts` (new questions) and `src/lib/assessment-content.ts` (reused Public Assessment v2.1 content, unchanged). Dimension mappings live alongside each asset; the Competency Library (`docs/architecture/competency-library.md`) documents what each question is evidence of.

## Assembly model

Every candidate answers exactly 16 questions: **8 Universal Core** (asked to everyone, regardless of profile) + **8 Profile questions** (selected by the "Current Situation" step). `src/lib/question-library/query.ts`'s `assembleQuestionSet('public-career-assessment', profileId)` performs this assembly by querying the flat Question Asset registry for `tags` matching `universal-core` and `profile:<id>` — never by importing a hand-maintained per-profile array.

**Current Situation → Profile mapping** (`src/lib/question-library/current-situation.ts`):

| Current Situation option | Profile |
|---|---|
| Student | `student_or_new` |
| New to the security industry | `student_or_new` |
| Working in the security industry | `security_professional` |
| Changing role within the security industry | `security_professional` |
| Career change from another industry | `career_changer` |

This selection **never affects scoring weights** — it only determines which 8 profile questions are assembled. The Universal Core's 8 questions, the scoring engine (`computeUserVector`), and the Career Intelligence Service are identical across all three profiles.

**Versioning:** `assessment_versions` row `assessment_id='public-career-assessment'`, `model_version='2026-pca-v1.0'`, `disclaimer_version='v1'`. Every Question Asset also carries its own `version`/`status` field (`src/lib/question-library/types.ts`) — the 24 reused questions (8 Core + 8 `security_professional` + 2 cross-reused) are `status: "published"` (verbatim, already-live Public Assessment v2.1 content); the 13 brand-new questions are `status: "draft"` pending the native-speaker translation and assessment-science review noted below.

**Known limitation, reported not silent:** all 13 new questions' Swedish text is an AI-authored first draft, matching the existing bank's tone and scenario-based, single-select, 4-option, `maxAbsPerDimension: 3` convention, but not yet reviewed by a native speaker or an assessment-science reviewer — the same review gate the original v2.1 content went through before it was locked.

---

## Universal Core (Q1–Q8) — asked to every candidate, 100% reused verbatim

| Asset | Source | Category | Competency | Dimension(s) | Evidence type |
|---|---|---|---|---|---|
| core-01 | q2 | integrity | comp-integrity | structure_documentation, conflict_management | Scenario-based |
| core-02 | q8 | judgement | comp-judgement | independent_decision_making, analytical_orientation | Scenario-based |
| core-03 | q1 | responsibility | comp-reliability | structure_documentation, risk_awareness | Behavioural |
| core-04 | q6 | communication | comp-clear-communication | communication | Scenario-based |
| core-05 | q13 | collaboration | comp-collaboration | teamwork, independent_decision_making | Scenario-based |
| core-06 | q4 | risk-awareness | comp-risk-recognition | risk_awareness | Scenario-based |
| core-07 | q12 | prioritisation | comp-prioritisation | operational_orientation, conflict_management | Scenario-based |
| core-08 | q11 | learning-orientation | comp-learning-agility | learning_development | Behavioural |

These 8 existing questions map onto the 8 named Universal Core constructs with no gaps and no overlap — each is already framed as a generic workplace scenario (a colleague's shortcut, a decision under new information, a disagreement with a peer) rather than a security-specific fact, satisfying "must not require previous security experience." Full SV/EN text is unchanged — see `src/lib/assessment-content.ts` for the verbatim source (`q1`, `q2`, `q4`, `q6`, `q8`, `q11`, `q12`, `q13`).

One caveat carried over from the design review: core-03 (q1) and core-07 (q12) use "shift"/"routine check" framing that leans slightly operational; kept as reused for v1.0 since it doesn't assume prior security experience, flagged for a future wording pass if pilot feedback raises it.

## Q9–Q16, `security_professional` profile — 100% reused verbatim, zero new authoring

| Asset | Source | Category | Competency | Dimension(s) | Evidence type |
|---|---|---|---|---|---|
| sgf-01 | q3 | incident-handling | comp-situational-awareness | risk_awareness | Scenario-based |
| sgf-02 | q5 | documentation | comp-procedural-discipline | structure_documentation | Scenario-based |
| sgf-03 | q7 | escalation-conflict-handling | comp-escalation-judgement | conflict_management, communication | Scenario-based |
| sgf-04 | q9 | operational-judgement | comp-judgement-under-uncertainty | independent_decision_making, analytical_orientation | Scenario-based |
| sgf-05 | q10 | adaptability | comp-adaptability | learning_development, operational_orientation | Scenario-based |
| sgf-06 | q14 | reporting | comp-reporting-quality | structure_documentation | Behavioural |
| sgf-07 | q15 | preferred-future-work-environment | comp-work-environment-preference | service_orientation, communication | Preference |
| sgf-08 | q16 | future-career-interests | comp-work-environment-preference, comp-career-direction-preference | analytical/strategic/operational/technical/structure/service/investigation/leadership orientation, teamwork (option-level) | Preference |

These 8 assets are shared members of **two** Assessment Catalog definitions at once: unchanged inside the frozen `security-guard-foundation` 16-question run (as `q3`, `q5`, `q7`, `q9`, `q10`, `q14`, `q15`, `q16`), and again, unchanged, as the `security_professional` profile pool here. One asset, two definitions — the reuse mechanism the Question Library exists for.

Deliberate deviation from the vision's suggested 8 constructs (flagged, not silent): q7 ("Escalation judgement") is used for both Escalation and Conflict handling (its dimension mapping already includes `conflict_management`), and sgf-05 (Adaptability, q10) fills the freed slot as a bonus construct — the existing bank has no separate, dedicated de-escalation-only item distinct from escalation itself.

## Q9–Q16, `student_or_new` profile — 7 new, 1 reused

**stu-01 — motivation** · Competency: `comp-work-motivation` · Dimension: `operational_orientation` (primary), `structure_documentation` (secondary) · Evidence: Preference/Scenario-based

> SV: "Du blir tilldelad en enkel, upprepande arbetsuppgift under din första vecka – inget spännande, men det behöver göras noggrant varje gång. Vad ligger närmast hur du skulle känna och agera?"
> EN: "You're given a simple, repetitive task during your first week — nothing exciting, but it needs to be done carefully every time. What's closest to how you'd actually feel and act?"

| Option | SV | EN | Weight |
|---|---|---|---|
| committed | Jag gör den lika noggrant varje gång, oavsett hur enkel eller tråkig den känns | I do it just as carefully every time, no matter how simple or dull it feels | operational_orientation +3, structure_documentation +1 |
| willing_but_impatient | Jag gör den ordentligt, men hoppas snart få mer varierande uppgifter | I do it properly, but hope to get more varied tasks soon | operational_orientation +1 |
| coasting | Jag gör det som krävs, men lägger inte extra energi på något som känns oviktigt | I do what's required, but don't put extra energy into something that feels unimportant | operational_orientation −1 |
| resistant | Uppgifter som den här får mig snabbt att tappa intresset för jobbet | Tasks like this quickly make me lose interest in the job | operational_orientation −2 |

Reasoning: measures intrinsic commitment/grit at entry level, independent of prior experience.

**stu-02 — learning-onboarding** · Competency: `comp-learning-agility` (shared with core-08) · Dimension: `learning_development` · Evidence: Behavioural

> SV: "Du får en kort introduktionsguide att sätta dig in i innan ditt första riktiga pass, med ont om tid. Vad gör du faktiskt?"
> EN: "You're given a short onboarding guide to get through before your first real shift, with limited time. What do you actually do?"

| Option | SV | EN | Weight |
|---|---|---|---|
| thorough | Går igenom den noga och antecknar frågor jag vill ha svar på | Go through it carefully and note questions I want answered | learning_development +3 |
| skim | Skummar igenom det viktigaste och frågar om resten när det behövs | Skim the key parts and ask about the rest when it comes up | learning_development +1 |
| quick_no_retain | Läser den snabbt utan att det riktigt fastnar | Read through it quickly without much of it sticking | learning_development −1 |
| defer | Skjuter upp det och tänker lära mig på plats istället | Put it off and plan to learn on the job instead | learning_development −2 |

**stu-03 — responsibility** · Competency: `comp-reliability` (shared with core-03, chg-01) · Dimension: `structure_documentation` (primary), `independent_decision_making` (secondary) · Evidence: Scenario-based

> SV: "Du får en liten uppgift att sköta själv, och ingen kommer kontrollera den förrän nästa dag. Vad gör du faktiskt?"
> EN: "You're given a small task to handle on your own, and no one will check it until the next day. What do you actually do?"

| Option | SV | EN | Weight |
|---|---|---|---|
| full_check | Slutför den fullt ut och dubbelkollar att den är rätt | Complete it fully and double-check it's right | structure_documentation +3 |
| full_no_check | Slutför den, men skulle inte lägga extra tid på att dubbelkolla | Complete it, but wouldn't spend extra time double-checking | structure_documentation +1 |
| partial | Gör det mesta av den, men lämnar mindre delar ofärdiga | Do most of it, but leave smaller parts unfinished | structure_documentation −1 |
| defer | Skjuter upp den eftersom ingen kollar upp den ändå | Put it off since no one's checking it anyway | structure_documentation −2, independent_decision_making −1 |

**stu-04 — service** · Competency: `comp-service-disposition` (shared with chg-04) · Dimension: `service_orientation` (primary), `communication` (secondary) · Evidence: Scenario-based

> SV: "En person du inte känner ber dig om hjälp med något som egentligen inte är din uppgift, mitt i något annat du håller på med. Vad gör du faktiskt?"
> EN: "Someone you don't know asks for help with something that isn't really your job, right in the middle of something else you're doing. What do you actually do?"

| Option | SV | EN | Weight |
|---|---|---|---|
| full_help | Stannar upp, hjälper till ordentligt och återgår sedan till det jag gjorde | Stop, help properly, then return to what I was doing | service_orientation +3, communication +1 |
| quick_help | Hjälper snabbt till, men håller det kort | Help quickly, but keep it brief | service_orientation +1 |
| redirect | Pekar dem mot någon annan om jag kan | Point them toward someone else if I can | service_orientation −1 |
| decline | Säger att jag inte har tid just nu | Say I don't have time right now | service_orientation −2 |

**stu-05 — handling-pressure** · Competency: `comp-composure-under-pressure` (shared with chg-05) · Dimension: `operational_orientation` (primary), `conflict_management` (secondary) · Evidence: Scenario-based

> SV: "Något oväntat och lite kaotiskt händer runt omkring dig – något du aldrig varit med om förut. Vad ligger närmast det du faktiskt skulle göra?"
> EN: "Something unexpected and a little chaotic happens around you — something you've never experienced before. What's closest to what you'd actually do?"

| Option | SV | EN | Weight |
|---|---|---|---|
| calm_read | Tar ett andetag, försöker förstå läget och agerar lugnt utifrån det jag vet | Take a breath, try to read the situation, and act calmly based on what I know | operational_orientation +3, conflict_management +1 |
| unsettled_ok | Blir lite orolig men gör mitt bästa för att hantera det | Get a bit unsettled but do my best to handle it | operational_orientation +1 |
| stressed | Blir tydligt stressad och tvekar innan jag agerar | Get visibly stressed and hesitate before acting | operational_orientation −1 |
| freeze | Fryser till och väntar på att någon annan tar över | Freeze up and wait for someone else to take over | operational_orientation −2, conflict_management −1 |

**stu-06 — teamwork-peer-learning** · Competency: `comp-collaboration` (shared with core-05) · Dimension: `teamwork` (primary), `learning_development` (secondary) · Evidence: Scenario-based

> SV: "Du blir parad med en mer erfaren kollega som gör saker på ett annat sätt än det du blivit tillsagd. Vad gör du faktiskt?"
> EN: "You're paired with a more experienced colleague who does things differently from what you were taught. What do you actually do?"

| Option | SV | EN | Weight |
|---|---|---|---|
| curious | Frågar nyfiket varför de gör det så, och lär mig av det | Curiously ask why they do it that way, and learn from it | teamwork +3, learning_development +1 |
| go_along | Följer med deras sätt för tillfället utan att fråga för mycket | Go along with their way for now without asking too much | teamwork +1 |
| stick_to_training | Håller mig till det jag lärt mig, även om det skapar lite friktion | Stick to what I was taught, even if it creates some friction | teamwork −1 |
| unsure | Blir osäker och vet inte riktigt vems sätt jag ska följa | Get unsure and don't really know whose way to follow | teamwork −2 |

**stu-07 — preferred-work-environment** — reused verbatim = q16 (see sgf-08).

**stu-08 — career-interests** · Competency: `comp-career-direction-preference` (shared with sgf-08, chg-08) · Dimension: single-select → distinct dimensions · Evidence: Preference

> SV: "Om du får välja riktning längre fram, vilket av dessa lockar dig mest just nu?"
> EN: "If you could choose a direction further down the line, which of these appeals to you most right now?"

| Option | SV | EN | Weight |
|---|---|---|---|
| hands_on | Praktiskt, händerna-på arbete ute i verkligheten | Hands-on, practical work out in the real world | operational_orientation +3 |
| investigate | Att gräva djupare i saker och ta reda på vad som faktiskt hände | Digging deeper into things and finding out what actually happened | investigation_orientation +2, analytical_orientation +2 |
| tech | Att arbeta med teknik och säkerhetssystem | Working with technology and security systems | technical_orientation +3 |
| lead | Att så småningom leda och ansvara för ett team | Eventually leading and being responsible for a team | leadership_orientation +2, strategic_orientation +1 |

## Q9–Q16, `career_changer` profile — 6 new, 2 reused

**chg-01 — responsibility-transferable** · Competency: `comp-reliability` (shared with core-03, stu-03) · Dimension: `structure_documentation` (primary), `independent_decision_making` (secondary) · Evidence: Scenario-based

> SV: "I ett tidigare jobb, i en helt annan bransch, fick du ett ansvar som ingen följde upp regelbundet. Vad ligger närmast hur du faktiskt hanterade eller skulle hantera det?"
> EN: "In a previous job, in a completely different industry, you were given a responsibility that no one regularly followed up on. What's closest to how you actually handled it — or would?"

| Option | SV | EN | Weight |
|---|---|---|---|
| consistent | Höll samma standard hela tiden, oavsett om någon kollade upp det | Kept the same standard throughout, whether or not anyone checked | structure_documentation +3 |
| mostly | Höll god standard, men blev något mindre noggrann över tid | Kept a good standard, but became somewhat less careful over time | structure_documentation +1 |
| inconsistent | Var inkonsekvent beroende på hur mycket annat jag hade att göra | Was inconsistent depending on how much else I had going on | structure_documentation −1 |
| deprioritized | Prioriterade ofta ner det eftersom ingen efterfrågade det | Often deprioritised it since no one was asking for it | structure_documentation −2, independent_decision_making −1 |

**chg-02 — ethics** · Competency: `comp-integrity` (shared with core-01) · Dimension: `structure_documentation` (primary), `conflict_management` (secondary) · Evidence: Scenario-based

> SV: "En ny arbetsledare ber dig fortsätta ett arbetssätt som en tidigare kollega använde, men som du misstänker formellt bryter mot en mindre regel. Vad gör du faktiskt?"
> EN: "A new manager asks you to continue a working method a previous colleague used, which you suspect technically breaks a minor rule. What do you actually do?"

| Option | SV | EN | Weight |
|---|---|---|---|
| raise_first | Tar upp min tveksamhet direkt med arbetsledaren innan jag fortsätter | Raise my concern directly with the manager before continuing | structure_documentation +3, conflict_management +1 |
| continue_and_raise_later | Fortsätter för tillfället, men nämner det vid nästa lämpliga tillfälle | Continue for now, but mention it at the next suitable opportunity | structure_documentation +1 |
| continue_no_question | Fortsätter utan att ifrågasätta det, eftersom det redan var praxis | Continue without questioning it, since it was already practice | structure_documentation −1 |
| assume_fine | Fortsätter och antar att det är okej eftersom en arbetsledare bad om det | Continue and assume it's fine since a manager asked for it | structure_documentation −2, conflict_management −1 |

Deliberately distinct from core-01 (q2) — inheriting a *new manager's* instruction rather than a peer's shortcut, so a career_changer candidate never sees the same scenario twice within their 16 questions.

**chg-03 — communication** · Competency: `comp-clear-communication` (shared with core-04) · Dimension: `communication` · Evidence: Scenario-based

> SV: "Något gick fel på ett sätt som är ovanligt för dig i den nya rollen. Din arbetsledare vill ha en snabb förklaring, utan att du hunnit tänka igenom allt. Vad börjar du med?"
> EN: "Something went wrong in a way that's unfamiliar to you in the new role. Your manager wants a quick explanation, before you've had time to think it all through. What do you lead with?"

| Option | SV | EN | Weight |
|---|---|---|---|
| facts_ordered | De konkreta fakta om vad som hände, i rätt ordning | The concrete facts of what happened, in the right order | communication +3 |
| facts_and_guess | Fakta, plus min bästa gissning om varför | The facts, plus my best guess at why | communication +2 |
| apology_only | Mest en ursäkt och ett löfte att det inte händer igen | Mostly an apology and a promise it won't happen again | communication 0 |
| whatever_urgent | Det som känns viktigast just då, även om det blir rörigt | Whatever feels most important in the moment, even if it comes out messy | communication −1 |

**chg-04 — customer-interaction** · Competency: `comp-service-disposition` (shared with stu-04) · Dimension: `service_orientation` (primary), `conflict_management` (secondary) · Evidence: Scenario-based

> SV: "En person du interagerar med i jobbet blir tydligt irriterad, även om du inte gjort något fel. Vad ligger närmast det du faktiskt gör?"
> EN: "Someone you're interacting with at work becomes visibly irritated, even though you haven't done anything wrong. What's closest to what you actually do?"

| Option | SV | EN | Weight |
|---|---|---|---|
| resolve | Håller mig lugn, lyssnar och försöker faktiskt lösa det som stör dem | Stay calm, listen, and actually try to resolve what's bothering them | service_orientation +3, conflict_management +2 |
| calm_minimal | Håller mig lugn och professionell, utan att engagera mig extra | Stay calm and professional, without engaging much further | service_orientation +1, conflict_management +1 |
| defensive | Blir lite defensiv, även om jag försöker dölja det | Get a little defensive, even if I try to hide it | conflict_management −1 |
| handoff | Föredrar att någon annan tar över situationen | Prefer that someone else takes over the situation | service_orientation −1, conflict_management −1 |

**chg-05 — stress-handling** · Competency: `comp-composure-under-pressure` (shared with stu-05) · Dimension: `conflict_management` (primary), `communication` (secondary) · Evidence: Scenario-based

> SV: "Du får ett upprört telefonsamtal precis innan ett viktigt möte du inte kan skjuta upp. Vad gör du faktiskt?"
> EN: "You get an upset phone call right before an important meeting you can't postpone. What do you actually do?"

| Option | SV | EN | Weight |
|---|---|---|---|
| compartmentalize | Hanterar samtalet lugnt och kortfattat, går sedan rakt in i mötet fokuserad | Handle the call calmly and briefly, then go straight into the meeting focused | conflict_management +3 |
| carry_some | Hanterar samtalet, men bär med mig lite av det in i mötet | Handle the call, but carry a bit of it into the meeting | conflict_management +1 |
| affected | Känner mig påverkad under en stor del av mötet | Feel affected for a good part of the meeting | conflict_management −1 |
| unfocused | Har svårt att fokusera på mötet överhuvudtaget | Struggle to focus on the meeting at all | conflict_management −2, communication −1 |

**chg-06 — adaptability** — reused verbatim = q10 (shared with sgf-05). Illustrative, not experiential, scenario ("a procedure you know well changes... e.g. a new access-control step") — answerable without ever having worked security.

**chg-07 — preferred-work-environment** — reused verbatim = q16 (see sgf-08).

**chg-08 — career-interests** · Competency: `comp-career-direction-preference` (shared with sgf-08, stu-08) · Dimension: single-select → distinct dimensions · Evidence: Preference

> SV: "Tänk på det du var bäst på i din tidigare bransch. Vilken typ av roll skulle bäst låta dig använda det vidare?"
> EN: "Think about what you were best at in your previous field. Which kind of role would best let you keep using that?"

| Option | SV | EN | Weight |
|---|---|---|---|
| structured | En roll som belönar struktur och noggrannhet, som jag redan är bra på | A role that rewards structure and precision, which I'm already good at | structure_documentation +2, operational_orientation +1 |
| people | En roll där jag fortsätter arbeta nära människor och kunder | A role where I keep working closely with people and customers | service_orientation +3 |
| analytical | En roll där jag kan specialisera mig tekniskt eller analytiskt | A role where I can specialise technically or analytically | technical_orientation +2, analytical_orientation +2 |
| leadership | En roll där jag kan växa in i att leda andra | A role where I can grow into leading others | leadership_orientation +3 |

---

All new-question weights follow the existing bank's convention: single-select, 4 options, `maxAbsPerDimension: 3`, weights capped in [−3, +3].

## Verification

- `bun run question-library:check` (`scripts/question-library-check.ts`) — Competency Library consistency (every asset's competencies resolve, every asset's dimensions ⊆ union of its competencies' dimensions), assembly correctness (16 unique questions per profile), `security-guard-foundation` shared-asset identity checks, and 4 regression personas (2 per new profile — confident and hesitant-newcomer patterns) confirming the "Potential > Current Fit for low-evidence answers" invariant holds for genuinely new answer patterns, not just the original 16-question bank's personas.
- `bun cie:check` (`scripts/cie-check.ts`) — unchanged, confirms zero scoring drift on the legacy/`security-guard-foundation` path after the `matching-engine.ts` generalization.
