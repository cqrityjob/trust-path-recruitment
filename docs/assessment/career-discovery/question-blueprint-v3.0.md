# Question Blueprint v3.0

**Status:** design — authored content, **NOT approved for production**.

> ## ⚠ Nothing in this document may be administered to a real candidate.
>
> Every item below is **authored draft**. All Swedish text is an **AI-authored first draft**. **No item has been reviewed by anyone.** The architecture that produced these items is approved; the items themselves are not.
>
> **All six gates must be cleared, per item, before any live use. None may be skipped, including under delivery pressure.**
>
> | # | Gate | What it requires | Status |
> |---|---|---|---|
> | 1 | **SME review** | ≥3 independent security professionals from ≥2 environments confirm realism, and that no option is transparently correct | ☐ not started |
> | 2 | **Language review** | Native-speaker review of all Swedish. English approved as an *adaptation*, not a translation, with its own status | ☐ not started |
> | 3 | **Accessibility review** | Reading level, plain language, no colour-only or sensory dependence, screen-reader viability | ☐ not started |
> | 4 | **Bias review** | Cultural neutrality, no protected-characteristic proxies, balanced option desirability | ☐ not started |
> | 5 | **Privacy / legal review** | GDPR, DPIA, lawful basis, consent wording. See [Blueprint ch 10](./master-product-blueprint-v3.0.md) | ☐ not started |
> | 6 | **Psychometric review** | Construct validity, the ipsative trade-off design, item statistics after pilot | ☐ not started |
>
> **Validation status: `design`.** Advances to `pilot` only after gates 1–5 and a cognitive pilot; further only on documented evidence.

**Validation status:** `design`.

> **How this document relates to the others**
> This is the instrument. [DNA Model](./security-career-dna-model-v3.0.md) defines the axes each item feeds; [Evidence Architecture](./evidence-architecture-v3.0.md) defines what happens to the answers; [Information Architecture](./information-architecture-v3.0.md) defines how each is presented.

---

## 1. Composition

| Block | Items | Scored | Time |
|---|---|---|---|
| **Context** (C1–C3) | 3 | No — routing and report framing only | ~45 s |
| **Single-axis** (S1–S8) | 8 | 1 axis each | ~3.7 min |
| **Trade-off** (T1–T8) | 8 | 2 axes each | ~5.1 min |
| **Behavioural** (B1–B4) | 4 | Behavioural signals only | ~2.9 min |
| **Core total** | **20 scored + 3 context** | | **~12.4 min** |
| **Adaptive pool** (A1–A10) | 0–8 administered | 1–2 axes each | 0–4.7 min |
| **Session total** | 23–31 screens | | **12.4–17.1 min** |

### Why 20, and why not 16

Eight axes need **three independent items each** — Assessment DNA Doc 06 §1 sets ≥2 from ≥2 evidence classes as a floor, and three gives redundancy plus the ability to retire a bad item after pilot without losing the axis.

That is 24 loadings. Twenty items carry them because the eight trade-off items load two axes each:

```
8 single-axis items  × 1 loading  =  8
8 trade-off items    × 2 loadings = 16
                                    ──
                                    24  =  3 per axis, exactly
```

Sixteen items cannot do this. At best it yields 2 loadings per axis, which is the floor with no margin — and 16 items is precisely what produced the four single-item dimensions in the current build (audit F-1). Twenty-four scored items would allow four loadings per axis but pushes past 15 minutes before adaptive, with the fourth item adding least.

**Twenty is the smallest number that clears the evidence floor with margin.**

### Loading allocation

Each axis: one dedicated single-axis item, plus two trade-off items pairing it with different partners.

| Axis | Single | Trade-offs | Total |
|---|---|---|---|
| CDA-01 Field Presence | S1 | T1, T5 | 3 |
| CDA-02 People Interface | S2 | T2, T6 | 3 |
| CDA-03 Procedural Structure | S3 | T3, T6 | 3 |
| CDA-04 Acute Tempo | S4 | T3, T7 | 3 |
| CDA-05 Systems & Technology | S5 | T1, T8 | 3 |
| CDA-06 Investigative Depth | S6 | T2, T7 | 3 |
| CDA-07 Responsibility for Others | S7 | T4, T8 | 3 |
| CDA-08 Organisational Scope | S8 | T4, T5 | 3 |

No two trade-offs pair the same axes, so no axis position depends on a single anti-correlation.

### Authoring rules applied

Every item was written against the ten construction principles in Question Library Doc 03, and against three rules specific to this instrument:

1. **No item may have an obviously virtuous answer.** If one option is transparently the "good" one, the item measures social-desirability detection, not orientation.
2. **No item may require prior security experience** — except where the context block has established it. A student and a ten-year väktare must both be able to answer honestly.
3. **Both ends of every axis are legitimate.** Option wording must not make one end sound more professional, ambitious or capable.

### Expected information gain

Stated per item on a 1–5 scale. **`[MVP]` these are authored estimates**, not measurements — an author's judgement of how much an item is likely to move confidence on its axis. They drive adaptive item selection and nothing else. **`[V1]`** replaces them with empirical discrimination values after pilot. They are never shown to candidates and never affect scoring.

---

## 2. Context block — C1–C3

Not scored. Establishes routing, tailors report language, and makes the session feel personal from the first screen.

---

### C1 · Where are you right now?

**Type:** single-select · **Time:** 15 s · **Scored:** no

**SV:** Var befinner du dig just nu?
**EN:** Where are you right now?

| Option | SV | EN |
|---|---|---|
| `student` | Studerar, eller precis klar med studier | Studying, or just finished studying |
| `outside_security` | Arbetar i en annan bransch | Working in another industry |
| `new_in_security` | Ny inom säkerhetsbranschen | New to the security industry |
| `working_in_security` | Arbetar inom säkerhetsbranschen | Working in the security industry |
| `returning` | På väg tillbaka till arbetslivet | Returning to work |

**Purpose:** Routing and framing. **Never affects scoring or which axes are measured** — every candidate answers the same 20 core items. It changes only the language the report uses and which examples it reaches for.

**Why included:** The previous build used this to select which 8 of 16 questions a person received, meaning two people got structurally different instruments and incomparable results. That is removed. Context tailors *voice*, never *measurement*.

---

### C2 · How long have you worked in security?

**Type:** single-select · **Time:** 12 s · **Scored:** no · **Shown when:** C1 ∈ {`new_in_security`, `working_in_security`}

**SV:** Hur länge har du arbetat inom säkerhet?
**EN:** How long have you worked in security?

| Option | SV | EN |
|---|---|---|
| `lt1` | Mindre än ett år | Less than a year |
| `1_3` | 1–3 år | 1–3 years |
| `3_10` | 3–10 år | 3–10 years |
| `gt10` | Mer än 10 år | More than 10 years |

**Purpose:** Calibrates the action plan's time horizons and whether the report frames a direction as "entering" or "moving toward".

---

### C3 · What brought you here today?

**Type:** single-select · **Time:** 18 s · **Scored:** no

**SV:** Vad fick dig att göra det här idag?
**EN:** What brought you here today?

| Option | SV | EN |
|---|---|---|
| `exploring` | Jag är nyfiken på vad som finns inom säkerhet | I'm curious what exists in security |
| `deciding` | Jag står inför ett val och vill ha underlag | I'm facing a choice and want something to go on |
| `stuck` | Jag trivs inte där jag är och vill se alternativ | I'm not thriving where I am and want to see options |
| `advancing` | Jag vill komma vidare i min nuvarande riktning | I want to progress in my current direction |
| `curious_only` | Jag ville bara testa | I was just curious |

**Purpose:** The single highest-leverage question in the instrument for perceived relevance. Determines the report's opening frame, whether the action plan leads with exploration or with concrete next steps, and how directive the language should be.

**Why included:** Someone facing a decision this month and someone idly curious need the same evidence and a completely different report. Asking is cheaper and more honest than inferring.

---

## 3. Single-axis items — S1–S8

Four options each, spanning the axis. Positions map to `0.00 · 0.33 · 0.67 · 1.00`.

---

### S1 · CDA-01 Field Presence

**Type:** behaviour preference · **Time:** 28 s · **Axis:** CDA-01 · **Info gain:** 4

**SV:** Tänk dig en arbetsdag som skulle kännas riktigt bra. Vilken ligger närmast?
**EN:** Picture a working day that would genuinely suit you. Which is closest?

| Option | SV | EN | CDA-01 |
|---|---|---|---|
| `remote_analysis` | Jag arbetar med underlag och information om händelser — jag behöver inte vara på plats | I work with information and material about events — I don't need to be there | 0.00 |
| `mixed_planning` | Jag planerar och följer upp, och är ute ibland när det behövs | I plan and follow up, and go out when it's needed | 0.33 |
| `mixed_presence` | Jag är ofta på plats, men har också tid vid ett skrivbord | I'm often on site, but also have desk time | 0.67 |
| `full_presence` | Jag är där det händer, hela arbetspasset | I'm where things happen, for the whole shift | 1.00 |

**Evidence:** Stated preference for physical presence versus informational distance.
**Career relevance:** The single sharpest separator in the profession. Splits `protective_operations` and `public_safety_justice` from `risk_management`, `cyber_information_security` and `financial_crime_compliance`.
**Reason for inclusion:** Without it, nearly every downstream recommendation is guesswork. Highest-information single item in the instrument.

---

### S2 · CDA-02 People Interface

**Type:** behaviour preference · **Time:** 28 s · **Axis:** CDA-02 · **Info gain:** 4

**SV:** Hur mycket vill du att direkt kontakt med människor ska vara en del av jobbet?
**EN:** How much do you want direct contact with people to be part of the job?

| Option | SV | EN | CDA-02 |
|---|---|---|---|
| `minimal` | Helst lite — jag vill kunna arbeta ostört | Preferably little — I want to work undisturbed | 0.00 |
| `colleagues` | Med kollegor, ja. Med allmänheten helst inte | With colleagues, yes. With the public, preferably not | 0.33 |
| `regular` | Regelbundet, men det behöver inte vara kärnan | Regularly, but it doesn't need to be the core of it | 0.67 |
| `central` | Det är det jobbet handlar om, även när det är jobbigt | It's what the job is about, including when it's hard | 1.00 |

**Evidence:** Stated appetite for human interaction as substance rather than side-effect.
**Career relevance:** Separates `public_safety_justice` and `protective_operations` from `cyber_information_security` and `security_technology`.
**Reason for inclusion:** Roles that appear similar on paper differ most here. Deliberately mentions *"även när det är jobbigt"* — appetite for easy interaction predicts nothing.

---

### S3 · CDA-03 Procedural Structure

**Type:** behaviour preference · **Time:** 28 s · **Axis:** CDA-03 · **Info gain:** 4

**SV:** Vilken typ av uppgift känns mest tillfredsställande att bli klar med?
**EN:** Which kind of task feels most satisfying to finish?

| Option | SV | EN | CDA-03 |
|---|---|---|---|
| `undefined` | En där jag själv fick avgöra vad som ens skulle göras | One where I decided what should even be done | 0.00 |
| `broad_goal` | En där målet var givet men vägen var min | One where the goal was set but the route was mine | 0.33 |
| `framework` | En med tydliga ramar och utrymme för egna bedömningar | One with clear boundaries and room for judgement | 0.67 |
| `defined` | En där rutinen var tydlig och jag följde den exakt | One where the procedure was clear and I followed it exactly | 1.00 |

**Evidence:** Preference for defined method versus self-constructed method.
**Career relevance:** Separates `corrections_secure_transport` and `critical_infrastructure_security` from `risk_management` and `security_leadership_governance`.
**Reason for inclusion:** Misplacement here produces reliable, specific unhappiness — a person who needs defined procedure struggles in consulting, and vice versa, regardless of capability. Option wording is carefully balanced so neither end reads as rigid or as flaky.

---

### S4 · CDA-04 Acute Tempo

**Type:** behaviour preference · **Time:** 28 s · **Axis:** CDA-04 · **Info gain:** 4

**SV:** Vilket arbetstempo passar dig bäst över tid?
**EN:** Which working rhythm suits you best over time?

| Option | SV | EN | CDA-04 |
|---|---|---|---|
| `long_horizon` | Långa projekt där jag ser resultatet efter månader | Long projects where I see the result after months | 0.00 |
| `steady` | Jämnt tempo med förutsägbara dagar | Steady pace with predictable days | 0.33 |
| `variable` | Mestadels lugnt, men med skarpa lägen ibland | Mostly calm, with sharp moments now and then | 0.67 |
| `acute` | Snabbt och oförutsägbart — jag vill inte veta hur dagen ser ut | Fast and unpredictable — I don't want to know how the day will go | 1.00 |

**Evidence:** Preferred rhythm and tolerance for unpredictability as a standing condition.
**Career relevance:** Separates `crisis_management` and `public_safety_justice` from `business_continuity_resilience` and `risk_management`.
**Reason for inclusion:** Frequently confused with stress tolerance. Deliberately phrased as *preference over time*, not as capability under pressure — the report must never read this as resilience.

---

### S5 · CDA-05 Systems & Technology

**Type:** behaviour preference · **Time:** 28 s · **Axis:** CDA-05 · **Info gain:** 4

**SV:** När teknik är inblandad i en uppgift — hur förhåller du dig till den?
**EN:** When technology is involved in a task — how do you relate to it?

| Option | SV | EN | CDA-05 |
|---|---|---|---|
| `tool_only` | Den ska fungera. Jag vill inte behöva tänka på den | It should work. I don't want to think about it | 0.00 |
| `competent_user` | Jag lär mig det jag behöver för att göra jobbet | I learn what I need to do the job | 0.33 |
| `interested` | Jag blir nyfiken på hur den fungerar och hittar ofta bättre sätt | I get curious about how it works and often find better ways | 0.67 |
| `object_of_work` | Tekniken och systemen är det jag helst arbetar med | The technology and the systems are what I most want to work on | 1.00 |

**Evidence:** Orientation toward technology as object versus instrument.
**Career relevance:** Separates `security_technology` and `cyber_information_security` from `protective_operations` and `public_safety_justice`.
**Reason for inclusion:** The fastest-growing part of the profession, and the direction candidates least often realise is open to them. **Deliberately requires no prior technical exposure** — it asks about pull, not skill, so a väktare with no IT background can answer it truthfully.

---

### S6 · CDA-06 Investigative Depth

**Type:** behaviour preference · **Time:** 28 s · **Axis:** CDA-06 · **Info gain:** 4

**SV:** Något har hänt och är åtgärdat. Vad vill du göra sedan?
**EN:** Something has happened and it's been dealt with. What do you want to do next?

| Option | SV | EN | CDA-06 |
|---|---|---|---|
| `move_on` | Gå vidare. Det är löst | Move on. It's resolved | 0.00 |
| `note_it` | Notera det kort ifall det återkommer | Note it briefly in case it comes back | 0.33 |
| `understand` | Förstå varför det hände innan jag släpper det | Understand why it happened before I let it go | 0.67 |
| `reconstruct` | Gräva tills jag vet hela förloppet — även det som ingen frågat om | Dig until I know the whole sequence — including what nobody asked about | 1.00 |

**Evidence:** Pull toward reconstruction and pattern-finding beyond what the task requires.
**Career relevance:** Separates `investigations_intelligence` and `financial_crime_compliance` from `protective_operations` and `security_technology`.
**Reason for inclusion:** Investigative work is a genuine vocation the current product cannot detect at all — `investigation_orientation` has exactly one item and it is a checkbox (audit F-1). The final option deliberately names the diagnostic behaviour: continuing past the point of obligation.

---

### S7 · CDA-07 Responsibility for Others

**Type:** behaviour preference · **Time:** 30 s · **Axis:** CDA-07 · **Info gain:** 4

**SV:** Hur ser du på att ha ansvar för andras arbete?
**EN:** How do you feel about being responsible for other people's work?

| Option | SV | EN | CDA-07 |
|---|---|---|---|
| `own_work` | Jag vill svara för mitt eget arbete, inte för andras | I want to answer for my own work, not other people's | 0.00 |
| `support_no_account` | Jag hjälper gärna andra, men vill inte vara den som svarar för resultatet | I'm glad to help others, but don't want to be the one accountable for the outcome | 0.33 |
| `small_team` | Jag skulle vilja ha ansvar för ett litet team | I'd like responsibility for a small team | 0.67 |
| `accountable` | Jag vill vara den som svarar för att gruppen levererar | I want to be the one who answers for the group delivering | 1.00 |

**Evidence:** Appetite for accountability over others, distinguished from willingness to help.
**Career relevance:** Separates `security_leadership_governance` from every individual-contributor area.
**Reason for inclusion:** Option 2 exists specifically to catch the most common confusion in career guidance — wanting *influence* or wanting to *help* is not wanting *accountability*, and conflating them sends people into supervision they did not want. Wording is deliberately non-judgemental at the low end: declining this is a legitimate permanent choice, not a lack of ambition.

---

### S8 · CDA-08 Organisational Scope

**Type:** behaviour preference · **Time:** 30 s · **Axis:** CDA-08 · **Info gain:** 4

**SV:** Vilken fråga skulle du helst få i uppdrag att lösa?
**EN:** Which question would you most want to be given to solve?

| Option | SV | EN | CDA-08 |
|---|---|---|---|
| `incident` | "Det här händer just nu — ta hand om det" | "This is happening right now — handle it" | 0.00 |
| `site` | "Den här platsen fungerar inte bra — få ordning på den" | "This site isn't working well — sort it out" | 0.33 |
| `function` | "Vår rutin för det här håller inte — gör om den" | "Our procedure for this doesn't hold — redo it" | 0.67 |
| `organisation` | "Vi vet inte om vi är rätt skyddade — ta reda på det" | "We don't know if we're protected in the right way — find out" | 1.00 |

**Evidence:** Preferred altitude of problem — incident, site, function, organisation.
**Career relevance:** Separates `security_leadership_governance` and `risk_management` from `protective_operations` and `corrections_secure_transport`.
**Reason for inclusion:** Distinct from CDA-07 in a way most career instruments miss. A person can want organisation-wide scope without wanting to manage anyone (specialist risk), or want a team without wanting strategy (frontline supervisor). Measuring them together produces a single misleading "seniority" score.

---

## 4. Trade-off items — T1–T8

Each presents two genuinely attractive options and asks which pulls harder. Four positions across the pair; loads both axes inversely **within the item**. Because no two trade-offs pair the same axes and each axis also has an independent single-axis item, no axis position is determined by one anti-correlation.

**Known limitation:** trade-off items are partly ipsative — they measure relative pull, not absolute level. Assessment DNA Doc 05 flags ipsative scoring methodology as an open question. Mitigated here by every axis also carrying one non-ipsative single-axis item, so absolute level is anchored. Flagged for psychometric review.

---

### T1 · CDA-01 Field Presence × CDA-05 Systems & Technology

**Type:** forced choice, 4-point · **Time:** 38 s · **Info gain:** 5

**SV:** Två tjänster, samma lön, samma arbetsgivare. Vilken lockar mest?
**EN:** Two roles, same pay, same employer. Which appeals more?

> **A** — Du rör dig i verksamheten, ser vad som händer och agerar på plats.
> **B** — Du arbetar med systemen som skyddar verksamheten — larm, behörigheter, teknik.
>
> **A** — You move through the operation, see what's happening, and act on the spot.
> **B** — You work on the systems that protect the operation — alarms, access, technology.

| Option | SV | EN | CDA-01 | CDA-05 |
|---|---|---|---|---|
| `strong_a` | Tydligt A | Clearly A | 1.00 | 0.00 |
| `mild_a` | Mest A | Mostly A | 0.67 | 0.33 |
| `mild_b` | Mest B | Mostly B | 0.33 | 0.67 |
| `strong_b` | Tydligt B | Clearly B | 0.00 | 1.00 |

**Career relevance:** The most common real fork for someone already in operational security. `[Adaptive trigger]` A `mild_a`/`mild_b` answer with disagreement against S1 or S5 fires A1.

---

### T2 · CDA-02 People Interface × CDA-06 Investigative Depth

**Type:** forced choice · **Time:** 38 s · **Info gain:** 5

**SV:** Ett ärende ska följas upp. Vilken del skulle du helst ta?
**EN:** A case needs following up. Which part would you rather take?

> **A** — Prata med de inblandade, förstå vad som hänt genom dem.
> **B** — Gå igenom loggar, kameror och dokumentation och lägga pusslet själv.
>
> **A** — Talk to the people involved, understand what happened through them.
> **B** — Go through logs, cameras and documentation and piece it together yourself.

Options as T1, loading CDA-02 and CDA-06 respectively.

**Career relevance:** Separates interview-led from evidence-led investigative work — both real, and they lead to different roles within `investigations_intelligence`.

---

### T3 · CDA-03 Procedural Structure × CDA-04 Acute Tempo

**Type:** forced choice · **Time:** 38 s · **Info gain:** 5

**SV:** Vilket arbetslag skulle du helst tillhöra?
**EN:** Which team would you rather be part of?

> **A** — Ett lag som gör samma sak varje dag, mycket noggrant, och där avvikelser är sällsynta.
> **B** — Ett lag som rycker ut när något oväntat händer och löser det på plats.
>
> **A** — A team that does the same thing every day, very precisely, where deviations are rare.
> **B** — A team that turns out when something unexpected happens and solves it on the spot.

Loads CDA-03 (A) and CDA-04 (B).

**Career relevance:** Separates `critical_infrastructure_security` from `crisis_management` — both demanding, opposite rhythms.

---

### T4 · CDA-07 Responsibility for Others × CDA-08 Organisational Scope

**Type:** forced choice · **Time:** 40 s · **Info gain:** 5

**SV:** Om du fick välja en av dessa roller om tre år — vilken?
**EN:** If you could have one of these roles in three years — which?

> **A** — Chef för ett team på tolv personer, med ansvar för att de gör ett bra jobb.
> **B** — Specialist som ingen är chef över, men vars analys avgör hur hela organisationen skyddar sig.
>
> **A** — Manager of a team of twelve, accountable for them doing good work.
> **B** — A specialist nobody reports to, whose analysis decides how the whole organisation protects itself.

Loads CDA-07 (A) and CDA-08 (B).

**Career relevance:** The most valuable single item for anyone considering a step up. Separates the two genuinely different senior tracks — people leadership and specialist authority — which most career products collapse into one ladder.
**Reason for inclusion:** Directly targets the confusion S7 introduces. High information gain.

---

### T5 · CDA-01 Field Presence × CDA-08 Organisational Scope

**Type:** forced choice · **Time:** 38 s · **Info gain:** 4

**SV:** Vilken sorts påverkan vill du helst ha?
**EN:** Which kind of impact would you rather have?

> **A** — Att det du gjorde idag gjorde skillnad för någon, här och nu.
> **B** — Att det du beslutar påverkar hur hundratals människor arbetar nästa år.
>
> **A** — That what you did today made a difference for someone, here and now.
> **B** — That what you decide shapes how hundreds of people work next year.

Loads CDA-01 (A) and CDA-08 (B).

**Career relevance:** Separates frontline from governance. Deliberately frames both as impact, so neither reads as more valuable.

---

### T6 · CDA-02 People Interface × CDA-03 Procedural Structure

**Type:** forced choice · **Time:** 38 s · **Info gain:** 4

**SV:** Vad skulle irritera dig mest i ett jobb?
**EN:** What would frustrate you most in a job?

> **A** — Att behöva följa en rutin som inte passar situationen framför dig.
> **B** — Att behöva hantera människors reaktioner hela dagen.
>
> **A** — Having to follow a procedure that doesn't fit the situation in front of you.
> **B** — Having to handle people's reactions all day.

Loads CDA-02 (A high) and CDA-03 (B high) — a frustration frame, so the mapping is inverted relative to the appeal-framed items.

**Career relevance:** Separates ordningsvakt-type work from controlled-environment work.
**Reason for inclusion:** Asking what someone would *dislike* surfaces different, often more honest information than asking what they would like. One frustration-framed item is deliberate; more would tilt the instrument negative.

---

### T7 · CDA-04 Acute Tempo × CDA-06 Investigative Depth

**Type:** forced choice · **Time:** 38 s · **Info gain:** 4

**SV:** Vilken känsla vill du helst ha när du går hem?
**EN:** Which feeling would you rather have going home?

> **A** — "Det hände mycket idag och jag klarade det."
> **B** — "Jag förstod något idag som ingen annan hade sett."
>
> **A** — "A lot happened today and I handled it."
> **B** — "I understood something today that nobody else had spotted."

Loads CDA-04 (A) and CDA-06 (B).

**Career relevance:** Separates response work from analytical work at the level of what a person finds rewarding, which predicts staying better than what they find easy.

---

### T8 · CDA-05 Systems & Technology × CDA-07 Responsibility for Others

**Type:** forced choice · **Time:** 40 s · **Info gain:** 4

**SV:** Du har blivit riktigt bra på något. Vad vill du göra med det?
**EN:** You've become genuinely good at something. What do you want to do with it?

> **A** — Fördjupa mig ännu mer och bli den som andra frågar.
> **B** — Lära upp andra och ansvara för att de blir bra.
>
> **A** — Go deeper still and become the one others come to.
> **B** — Teach others and be accountable for them becoming good.

Loads CDA-05 (A) and CDA-07 (B).

**Career relevance:** The specialist-versus-supervisor fork at the point it actually presents itself — after someone has developed competence. Complements T4 by asking about *depth* rather than *scope*.

---

## 5. Behavioural items — B1–B4

Scenario and behaviour-frequency only. **These never affect matching.** They produce development notes and narrative texture, per [DNA Model](./security-career-dna-model-v3.0.md) §4.

---

### B1 · BS-1 Procedural follow-through

**Type:** situational judgement · **Time:** 42 s · **Info gain:** n/a

**SV:** Sista timmen på passet. En kontroll återstår som ingen kommer att fråga efter, och inget har verkat avvikande. Vad gör du i praktiken?
**EN:** Last hour of the shift. One check remains that nobody will ask about, and nothing has seemed unusual. What do you actually do?

| Option | SV | EN | Signal |
|---|---|---|---|
| `full` | Genomför den som vanligt | Complete it as usual | Consistent regardless of observation |
| `quick` | Gör den, men snabbare än vanligt | Do it, but faster than usual | Completes, adapts effort to perceived risk |
| `defer` | Noterar att den inte hanns med och tar det imorgon | Note it wasn't done and pick it up tomorrow | Prioritises transparency over completion |
| `skip` | Hoppar över den — inget tyder på att det behövs | Skip it — nothing suggests it's needed | Weighs signal over procedure |

**Report use:** Frames how a highly procedural environment is likely to feel. Never described as right or wrong. `skip` and `defer` are not failures — they describe someone who may find rule-dense environments effortful, which is genuinely useful career information.

---

### B2 · BS-2 Escalation judgement

**Type:** situational judgement · **Time:** 42 s

**SV:** En situation utvecklas som ligger på gränsen till vad du kan hantera själv. Att kalla på hjälp kan visa sig ha varit onödigt. Vad gör du?
**EN:** A situation is developing at the edge of what you can handle alone. Calling for help may turn out to have been unnecessary. What do you do?

| Option | SV | EN |
|---|---|---|
| `immediate` | Kallar direkt och låter någon annan avgöra | Call immediately and let someone else judge |
| `brief_check` | Skaffar mig snabbt lite mer underlag, sedan kallar jag | Get a bit more information quickly, then call |
| `handle_inform` | Hanterar det och informerar efteråt | Handle it and inform afterwards |
| `handle_alone` | Löser det själv — det är därför jag är här | Solve it myself — that's what I'm here for |

**Report use:** Frames lone-working and autonomy discussion. Directly relevant to skyddsvakt and lone-patrol roles, where both over- and under-escalation carry real cost.

---

### B3 · BS-3 Composure under provocation

**Type:** situational judgement · **Time:** 42 s

**SV:** Någon höjer rösten mot dig, framför andra, och har delvis rätt i sin kritik. Vad ligger närmast det du faktiskt gör?
**EN:** Someone raises their voice at you, in front of others, and is partly right in their criticism. What's closest to what you actually do?

| Option | SV | EN |
|---|---|---|
| `lower_acknowledge` | Sänker tonläget och erkänner den del som stämmer | Lower my tone and acknowledge the part that's right |
| `calm_defer` | Håller mig lugn och tar det senare, inte inför andra | Stay calm and take it up later, not in front of others |
| `correct_now` | Rättar det som inte stämmer direkt | Correct what's wrong straight away |
| `hold_position` | Står fast — att ge efter inför andra fungerar sällan | Hold my position — giving way in front of others rarely works |

**Report use:** Frames public-facing role discussion. Deliberately includes *"har delvis rätt"* — composure when criticism is baseless is a much easier and less informative question.

---

### B4 · BS-4 Learning response

**Type:** behaviour frequency · **Time:** 40 s

**SV:** Tänk på senaste gången du fick veta att du gjort något fel på jobbet. Vad hände sedan?
**EN:** Think about the last time you were told you'd done something wrong at work. What happened next?

| Option | SV | EN |
|---|---|---|
| `changed` | Jag ändrade hur jag gör det, och det sitter kvar | I changed how I do it, and it stuck |
| `understood` | Jag förstod poängen, men det gamla sättet återkommer ibland | I took the point, but the old way comes back sometimes |
| `disagreed_complied` | Jag höll inte med, men gjorde som det sades | I didn't agree, but did as I was told |
| `no_recall` | Jag kommer inte ihåg någon sådan situation | I can't recall a situation like that |

**Report use:** Calibrates how realistic the development plan should be. `no_recall` is treated as **missing evidence, not as a negative** — it is a common and honest answer for people early in their working life, and reading it as avoidance would be a construct error.

---

## 6. Adaptive pool — A1–A10 `[V1]`

Administered only when a trigger in [Evidence Architecture](./evidence-architecture-v3.0.md) §6 fires. **Zero administered in `[MVP]`** — the pool is authored and the selection model is built, but no adaptive item is enabled until the bank has pilot depth.

| # | Resolves | Trigger | Time | Gain |
|---|---|---|---|---|
| A1 | CDA-01 ↔ CDA-05 ambiguity | T1 mild + disagreement with S1/S5 | 35 s | 5 |
| A2 | CDA-02 context-dependence | S2 and T2/T6 disagree | 35 s | 4 |
| A3 | CDA-03 context-dependence | S3 and T3/T6 disagree | 35 s | 4 |
| A4 | CDA-04 vs stress-tolerance confound | S4 high but B3 suggests strain | 38 s | 4 |
| A5 | CDA-06 depth confirmation | S6 high, T2/T7 not confirming | 35 s | 4 |
| A6 | CDA-07 influence vs accountability | S7 = `support_no_account` + T4 mild | 40 s | 5 |
| A7 | CDA-08 altitude confirmation | S8 and T5 disagree | 35 s | 4 |
| A8 | Area tie: operations ↔ technology | top-2 within tie threshold | 38 s | 5 |
| A9 | Area tie: investigations ↔ compliance | top-2 within tie threshold | 38 s | 5 |
| A10 | Area tie: leadership ↔ risk | top-2 within tie threshold | 38 s | 5 |

Full wording is authored alongside the core bank in the same review cycle; they are held here as specifications rather than drafts because their exact framing depends on what pilot shows about the core items they follow.

---

## 7. What is deliberately absent

| Not included | Why |
|---|---|
| **Ranking items** | No ranking UI exists, and Question Library Doc 07 caps them at 5–7 items — too slow for this budget. Reconsider at `[V2]`. |
| **Confidence-rating items** | Assessment DNA Doc 04 requires them paired with the item they rate, roughly doubling item count for calibration data no current feature consumes. `[Future]`. |
| **Free-text reflection** | Inter-rater reliability for free-text is an unresolved gap in Assessment DNA Doc 09 §3, whose own fallback is "do not score numerically at all". A *non-scored* reflection prompt appears in the journey for the user's benefit — see [User Journey](./user-journey-v3.0.md). |
| **Knowledge items** | This measures orientation, not knowledge. Knowledge belongs to the employer product. |
| **Any item reused from v2.1** | Forbidden by the [ADR](../../architecture/adr-career-discovery-construct-model.md). Zero items are reused. |

---

## 8. Review gates before any item is administered

The six gates in the banner at the top of this document, in the order they are normally cleared. Per Question Library Doc 05 and owner decision C, **none may be skipped, including under delivery pressure** — the prior documentation named lifecycle bypass as its most realistic operational risk, and it happened within a week.

0. **Content review** — against the ten construction principles and the three instrument-specific rules in §1. Precedes the six gates; catches defects before reviewer time is spent.
1. **SME review** — ≥3 independent security professionals from ≥2 environments.
2. **Language review** — native-speaker review of all Swedish; English approved as an adaptation with its own status.
3. **Accessibility review** — reading level, plain language, no colour-only or sensory dependence.
4. **Bias review** — cultural neutrality, no protected-characteristic proxies, balanced option desirability.
5. **Privacy / legal review** — GDPR, DPIA, lawful basis, consent wording.
6. **Psychometric review** — construct validity and the ipsative trade-off design before pilot; item statistics after.

**Pilot** — 20–30 cognitive interviews — sits between gates 5 and 6 and is a precondition for the statistical half of gate 6.

Legal review is **not** required for this instrument: no item makes a legal claim or depends on Swedish legislation. Any future profession-specific item that does falls under owner decision C and its `legal_review_status` gate.
