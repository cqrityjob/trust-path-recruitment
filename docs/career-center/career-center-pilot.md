# Career Center — pilot rebuild

`/career-center` rebuilt from a catalogue with a filter into a guided service:
where am I, which professions could suit me, how do I get from here to there,
what is actually required, and what do I do next.

Built on `origin/main` at `42e2ba1`; merged with `c48e2ba` during the
corrective pass. §A is the audit of `main` before any change and is unchanged.
Everything from §B is the state after the first independent review returned
BLOCKED — see §B0 for what that review found and what changed because of it.

---

## A. What the existing implementation actually did

Audited before any change was made. Nothing below is a design opinion; each
line is a behaviour that was live.

### A1 — Which professions were published, and on what basis

Publishability is **computed from the content** (`publishability.ts`), not from
a hand-set flag: a guide is public only when it carries a substantive
description in both languages, at least two responsibilities, at least three
competencies, formal requirements wherever the role is regulated, at least one
career-path edge, a citable source, a review date and a jurisdiction.

That mechanism was already correct and is unchanged. What it produced was:

|                      | Count |                                                                                                                                                                            |
| -------------------- | ----: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Published guides     |    10 | Väktare, Ordningsvakt, Skyddsvakt, Säkerhetschef, Säkerhetstekniker, Risk Manager, AML-specialist, Datacentersäkerhet, Kris- och kontinuitetsansvarig, Personskyddsväktare |
| Named but not linked |    10 | including **Säkerhetssamordnare**                                                                                                                                          |

**Säkerhetssamordnare being a stub is the single most consequential finding.**
It is the role the pilot's headline journey runs through, it is a recommendable
occupation in Career Discovery (`cd_professions` SP006), and it is a canonical
CIG node — but the Career Center could not link to it, so nothing could route
through it.

### A2 — Which transitions were explicitly registered

Transitions exist in two forms, and both were already honoured: reviewed edges
in `career-paths.ts`, and `nextRoles` / `previousRoles` links on the profession
records. `validateRoutes()` already refused any route stage pair the data did
not carry.

Two problems, both about what was _shown_ rather than what was recorded:

1. **The operational career route was `Väktare → Ordningsvakt|Skyddsvakt →
Säkerhetschef`.** Three stages, and the last one is a senior leadership
   function presented as the step after a first-year appointment. The route
   validated, because `ordningsvakt.nextRoles` does contain `security-manager`
   — the data records that the move exists, and the UI rendered "exists" as
   "next".

2. **A profession guide's "Karriärväg" section was two columns of role names.**
   Väktare → Ordningsvakt (a separate statutory training plus a police
   appointment) and Väktare → Säkerhetschef rendered as two identical rows. The
   guide could not say why a move was possible, what it required, or whether
   anything stood between the two.

Only 4 of 18 `careerPaths` edges carried any reviewed prose at all; the rest
were `status: "placeholder"` with no notes.

### A3 — How Career Discovery reached the Career Center

Forward only, and **broken in the direction that mattered most**.

The result view (`assessment/result/engine-view.tsx`) builds guide links from
`match.legacySlug` — a Career Center slug — and is correct. But My Career's
"Din karriärbild" built them from `role.cigSlug`:

```tsx
<Link to="/career-center/$profession" params={{ profession: role.cigSlug }}>
```

`cigSlug` is a **CIG catalogue slug** (`vaktare`, `sakerhetschef`,
`sakerhetstekniker`); the Career Center's URL space uses its own English ids
(`security-officer`, `security-manager`, `security-technician`). Four of the
twelve bridged professions happen to be spelled identically in both namespaces
(`ordningsvakt`, `skyddsvakt`, `risk-manager`, `aml-specialist`) — exactly
enough coincidence for the defect to look like it worked.

The consequence: for **eight of twelve** professions, the single most important
link on the candidate's own home page — the occupation their report
recommended — landed on _"Den här yrkesguiden är inte publicerad ännu."_

The same namespace confusion existed at `/jobs/profession/$professionSlug`,
which resolved its route param (a CIG slug, because `jobs.profession_slug` is a
foreign key onto `cig_professions.slug`) through the Career Center's own
`getProfession`, and printed the raw slug as the page's `<h1>` whenever it
missed.

There was **no reverse direction at all**: `/career-center` was entirely
impersonal for a signed-in reader with a completed analysis.

### A4 — How requirements, experience, education and certification were modelled

| Concept             | Where it lives                             | State                                                              |
| ------------------- | ------------------------------------------ | ------------------------------------------------------------------ |
| Formal requirements | `Profession.formalRequirements: Bi[]`      | Reviewed prose, present on all regulated roles                     |
| Regulatory framing  | `Profession.regulated` + `regulatoryNotes` | Notes rendered **only when `regulated === true`**                  |
| Experience          | `CareerPath.experienceRequired`            | **Unused** — no edge carried one                                   |
| Education           | `Education[]`, referenced by id            | 3 of 8 records sourced and reviewed; 5 are structural placeholders |
| Certification       | `Certification[]`, `mandatory?: boolean`   | 7 of 10 sourced; `mandatory` never `true` anywhere                 |

The guide rendered education and certifications as **two lists of names**. A
reader could not tell whether "Väktarutbildning (VU1/VU2/VU3)" was a legal
requirement or a suggestion, which country it applied in, where the claim came
from, or when anybody last checked. Placeholder education records rendered
identically to sourced ones.

### A5 — What was verified against a source, and what was editorial

|                | Verified                                                             | Editorial / derived                                                                                                              |
| -------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Professions    | 10 guides, each with named sources, publisher, URL and a review date | "Passar dig som…" / "Passar mindre bra om…", derived by inverting the role's own stated competency demands (`profession-fit.ts`) |
| Transitions    | 4 edges with reviewed notes                                          | Level shift, orientation change, raised competencies — all derived from the profession records                                   |
| Education      | 3 records with an `officialSource`                                   | 5 placeholders with a `notes` disclaimer                                                                                         |
| Certifications | 7 with an `officialSource`                                           | 3 placeholders                                                                                                                   |

The separation was already sound. What it lacked was a way for the **reader** to
see which was which.

### A6 — Buttons, links and sections with no distinct purpose

|                         | Finding                                                                                                                                                                                             |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hero                    | **Two competing primary buttons**: "Starta karriärtestet — ca 5 min, inget konto" and "Utforska yrken". The first also states five minutes for an instrument whose own `DURATION_CLAIM` says 12–15. |
| §2 "Var står du i dag?" | Asked the reader's own question and answered it with three generic cards. Two of the three led to the explorer with a pre-filter; the third to `/employers`.                                        |
| §3 career test          | A full-width dark band repeating the hero's CTA — the **third** offer of the same action above the fold.                                                                                            |
| Guide                   | No related jobs section at all, despite `/jobs/profession/$slug` existing. No connection to the Passport.                                                                                           |
| Guide                   | `cc.hero.title` ("Säkerhetskarriärcenter") doubled as the breadcrumb label.                                                                                                                         |

### A7 — Were the recommendations actually based on the reader's result?

**No.** There were no recommendations of any kind on `/career-center`. The page
was identical for every visitor. The "Var står du i dag?" section was the
closest thing, and its three cards were fixed copy.

---

## B0. What the first independent review found

The first version of this PR was reviewed and returned **BLOCKED**. Eleven
points. What follows is the state after all of them were addressed; each
subsection below names the finding it answers.

| #   | Finding                                                                      | Where it is answered |
| --- | ---------------------------------------------------------------------------- | -------------------- |
| 1   | Out of date with `main`; conflict in `release-frontier-check.ts`             | §B1                  |
| 2   | An unused hosted migration shipped in a product PR                           | §B2                  |
| 3   | Personalisation answered `fit` only, never "where can I go from here"        | §B3                  |
| 4   | The routes rendered a false linear ladder                                    | §B4                  |
| 5   | Placeholder transitions were published as reviewed evidence                  | §B5                  |
| 6   | Four Swedish regulatory facts were wrong, one citing a repealed Act          | §B6                  |
| 7   | Education relevance was inferred; ISO was modelled as a personal certificate | §B7                  |
| 8   | The commercial boundary over-claimed what telemetry proves                   | §B8                  |
| 9   | The page was still ~11,700px on a phone                                      | §B9                  |
| 10  | Read failures fell open into "you have no result"                            | §B10                 |
| 11  | Guards were unproven                                                         | §B11                 |

---

## B1. Synchronised with main

`origin/main` at **`c48e2ba`** merged with an ordinary merge commit — no
rebase, no squash, no force-push.

One conflict, in `scripts/release-frontier-check.ts`. Main had emptied
`expectedPending` (PR #197's schema half was applied to production on
2026-09-08 and recorded `applied` with evidence); this branch had added its own
migration to that list. **Resolved to main's empty set**, which is not a
compromise but the correct end state: the migration this branch was holding
open is gone (§B2), so an empty expected-pending set is once again the honest
one, and nothing about main's hosted-ledger, deploy-plan, release-frontier,
migration-safety or schema-first protections is weakened.

Main also brought a new guard, `deploy-plan:check` / `deploy-plan:gate`, which
reproduces `supabase db push`'s selection rule against a committed read-only
ledger snapshot. It is the executable proof requested in §B2.

## B2. The premature Supabase change is gone

Removed:

- `supabase/migrations/20261102090000_cd_v31_funnel_events_career_education.sql`
- its `supabase/release-state.json` entry
- `career_education_opened` from `FUNNEL_EVENT_NAMES`
- the event, the `placement` detail and the `profession_education` surface from
  `career-center/analytics.ts`
- the call site in `ProfessionTemplate` and the `onOfferOpen` prop
- the `expectedPending` exception in `release-frontier-check.ts`

The reasoning is the review's and it is right: `EDUCATION_PROVIDER_PLACEMENTS`
is empty and the event was only ever emitted from a placement link, so it could
not fire. A hosted schema change with no reachable caller is release risk with
no product value.

It also did not prove what it was described as proving. Ranking neutrality is a
property of the **code** — `educationOrderKey`'s parameter type has no
placement field — and is established by that signature plus a guard that
re-orders with every offer sponsored. Telemetry measures engagement. The claim
was removed along with the event, and a guard now fails if either returns.

**Proof that this PR needs no hosted database change:**

```
$ bun run deploy-plan:gate
deploy plan — what `supabase db push` would do next
  ledger snapshot : wrygicdfxwjnrugduxnt, read 2026-09-08T06:59:53Z (0d old)
  local files     : 267
  ledger rows     : 267
  WOULD APPLY — nothing.
  Plan is empty. A deploy would apply nothing and refuses nothing.
```

`release-parity:check`, `release-frontier:check`, `migrations:check`,
`migrations-duplicate:check` and `schema-first-release:check` are all green,
and the branch adds no file under `supabase/`.

The first real provider placement will be delivered schema-first, in its own
reviewed commercial release, with its own measurement.

## B3. Three concepts, kept apart

`fit`, `pathFrom` and `eligibility` are now separate by construction.

### `fit` — `personal-direction.ts`

Unchanged in substance: the occupations the frozen Career Discovery report
ranked, read through `deriveCareerDirection`, never recomputed. Seven states,
six of which show no recommendation.

### `pathFrom` — `career-origin.ts` (new)

Directions out of a role the reader has **explicitly named**. Two sources, and
the surface always says which one it used:

| Source     | What it is                                                                                                                                                                                                                                                                                                                                            |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profile`  | `security_career_profiles.current_profession_slug` — the canonical, single-writer, user-authored answer to "what do you do", written through the same profession picker the profile page offers and printed by My Career as the person's professional identity. Read with `getMySecurityCareerProfile`, the narrowest read that answers the question. |
| `selected` | The `<select>` on this page, carried in the URL as `?from=`. Available to anonymous readers, deep-linkable, shareable, and it **overrides** the profile value — an explicit click is the most recent thing the reader has said about themselves.                                                                                                      |

The selector writes to the **URL, not the profile**: choosing a role to explore
from is a question, not a change to who you are. A guard asserts that the
component calls neither `upsertMySecurityCareerProfile` nor
`setMyCurrentProfession`.

Passport merits are **not** a source. A Passport records what somebody has
registered; an absent merit is an absent record and nothing else. Deriving "you
are a väktare" from a credential would turn a registration gap into a statement
about a person's working life, and deriving "you are not" from its absence
would be worse. The Career Center reads no Passport data at all — asserted by
`career-center:check` over four files, and by an e2e test that intercepts every
server-function call and requires the Passport set to be empty.

### `eligibility` — never computed

`ELIGIBILITY_IS_NEVER_ASSESSED` is a typed constant `false`. Both `pathFrom`
and `fit` carry it, and both surfaces render their disclaimer **from the
model**, so removing the sentence means changing a type rather than editing a
string.

### They are never combined

Two sections, two headings, two eyebrows, each stating its own basis in its own
words. `pathFrom` comes first because it is the question most readers arrive
with, it works signed-out, and it needs no assessment. A guard asserts that no
Career Center heading contains "Rekommenderat för dig" / "Recommended for you".

## B4. The ladder is gone

The stage model is deleted. `career-routes.ts` now holds an **origin** and a
set of **independent branches**:

| Route                    | Origin              | Directions                                      |
| ------------------------ | ------------------- | ----------------------------------------------- |
| Från väktare             | Väktare             | Ordningsvakt · Skyddsvakt · Säkerhetssamordnare |
| Från säkerhetssamordnare | Säkerhetssamordnare | Säkerhetschef                                   |
| Från säkerhetstekniker   | Säkerhetstekniker   | Datacentersäkerhetsspecialist                   |
| Från risk manager        | Risk Manager        | Säkerhetschef                                   |

Säkerhetschef is **not** a direction out of Väktare. It is reached from
Säkerhetssamordnare, which is its own route with its own origin — not a fourth
rung on the first one. A guard asserts both halves.

The invariant that replaced the stage rule is the one that actually matters:
**every branch must be a DIRECT recorded transition from the origin.** That is
precisely what makes the list unordered — no entry depends on any other, so no
reading order is implied and none can be inferred.

An earlier draft of the validator went further and refused any route where one
branch also led on to another. That rejected the arrangement the review asked
for: both Ordningsvakt and Skyddsvakt record a further direction towards
Säkerhetssamordnare, and Säkerhetssamordnare is also directly reachable from
Väktare. All three facts are true, and listing the three as parallel directions
misrepresents none of them. What made the old rendering false was the
**ordinal**, not the graph — so the guard asserts the absence of numbering and
the presence of the independence statement against the component source, rather
than trying to encode "reads as a sequence" as a graph property, which it is
not.

The section also renders **summaries** rather than full detail cards. Six
detail cards stacked put ~3,000px on a 375px screen for a section whose job is
orientation; the detail is one click away on the guide, from the same
`ProfessionTransition` with the same evidence rules.

## B5. Transitions have to earn their wording

`transitionEvidenceLevel` gates every claim:

| Level          | Requires                                                                                                                   | May render                                                                                                                    |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `reviewed`     | an explicit edge, status not `placeholder`, **its own** credible source, a jurisdiction, and a review date inside 730 days | reviewed prose, experience statements, its own sources and jurisdiction                                                       |
| `under_review` | everything else, including every implicit `nextRoles`/`previousRoles` link                                                 | the two role names and the derived competency overlap. **No** likelihood, **no** experience claim, **no** progression wording |

"Its own" is the load-bearing phrase. A guide's statutory sources are evidence
about the **role**; they are not evidence about the **move**, and an edge may
not borrow them.

Frequency is a separate, higher bar. `frequencyEvidence` is the only thing that
can produce a "Vanlig övergång" label — `likelihood` alone never can. Nothing in
this dataset has frequency evidence, because no source in it is about
transition frequency, so **no frequency label renders anywhere**. That is the
correct output, not a missing feature.

Consequences in the shipped data:

| Transition                          | Kind                               | Evidence                                |
| ----------------------------------- | ---------------------------------- | --------------------------------------- |
| Väktare → Ordningsvakt              | formal gate                        | reviewed (SFS 2023:421, SE, 2026-09-08) |
| Väktare → Skyddsvakt                | formal gate                        | reviewed (SFS 2010:523, SE, 2026-09-08) |
| Väktare → Säkerhetssamordnare       | adjacent                           | **under review**                        |
| Säkerhetssamordnare → Säkerhetschef | long-term                          | **under review**                        |
| Väktare → Säkerhetschef             | long-term, via Säkerhetssamordnare | **under review**                        |

The `experienceRequired` prose the first version invented for the two
Säkerhetssamordnare edges was **removed from the data**, not merely suppressed:
an unsourced statement about what a move needs is not improved by being hidden.
The same rule found and removed reviewed prose sitting on the
`police-officer → security-investigator` placeholder.

`ordningsvakt.nextRoles` no longer contains `security-manager`. A first-year
statutory appointment recording a direct relationship to a senior leadership
function is the false claim in data form.

The freshness window is not decorative: this repository shipped a guide citing
an Act repealed in 2023, and a review date that never expires is how that
survives. A lapsed date degrades a transition to `under_review` — it stops
making claims rather than disappearing.

## B6. The Swedish regulatory facts

Every source below was fetched and read during this pass, and every URL is
recorded in `docs/career-center/source-snapshot.json` with its status.

### Ordningsvakt — lagen (2023:421), not the repealed (1980:578)

The guide cited **repealed law as the current requirement**. All references now
point at lagen (2023:421) om ordningsvakter, and 9 §'s three conditions are
stated **separately** rather than compressed — the old wording ("godkänd
lämplighetsprövning och grundutbildning") had lost the age entirely:

- ha fyllt **20 år** — not 18, which is the väktare condition under a different Act
- ha genomgått föreskriven utbildning
- bedömas lämplig för uppdraget
- förordnande beslutat av Polismyndigheten — _"Genomförd utbildning ger i sig inget förordnande."_

The guide states explicitly that working as a väktare is **not** a legal
prerequisite, and the `security-officer → ordningsvakt` edge says the same
rather than implying a ladder.

Sources: [SFS 2023:421](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2023421-om-ordningsvakter_sfs-2023-421/) ·
[Polismyndigheten — Ordningsvakter](https://polisen.se/lagar-och-regler/ordningsvakter/) ·
[Utbildning och förordnande](https://polisen.se/lagar-och-regler/ordningsvakter/utbildning-till-ordningsvakt/)

### Skyddsvakt — three decisions, three deciders

The old copy said training was set by _"skyddsobjektets krav"_, which makes the
site operator sound like the body that prescribes it. Three separate things are
now stated separately:

|                                | Who decides                                                                        | Where                          |
| ------------------------------ | ---------------------------------------------------------------------------------- | ------------------------------ |
| Föreskriven utbildning         | Polismyndigheten, or Försvarsmakten for its own personnel                          | 15 § / 14 § skyddsförordningen |
| Godkännande                    | **Länsstyrelsen** in the county of residence; Försvarsmakten for its own personnel | 6 § skyddsförordningen         |
| Uppdraget vid ett skyddsobjekt | the operator — _in addition to_, never instead of, the two above                   | skyddslagen                    |

Sources: [SFS 2010:305](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/skyddslag-2010305_sfs-2010-305/) ·
[SFS 2010:523](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/skyddsforordning-2010523_sfs-2010-523/)

### Säkerhetssamordnare — narrowed to what the source supports

Lagen (2006:544) does not establish the occupation. It establishes an
**obligation on municipalities and regions** to analyse risks and plan for
extraordinary events. The review offered two options; this takes the second.

The guide now describes only the public-sector role that duty documents:
`sector` is `public`, the responsibilities are the coordinating side of duties
the Act names, and `regulatoryNotes` says **on the page** that the same title
exists in private organisations but that its content varies and _"är inte
källbelagt här"_. No claim is made about how people arrive in the role.

The säkerhetsskyddschef boundary carries both halves the review required: the
Act applies to **säkerhetskänslig verksamhet** (1 kap. 1 §), and such an
operator must have a säkerhetsskyddschef _"om det inte är uppenbart
obehövligt"_ (2 kap. 7 §). Dropping either invents a duty.

Sources: [SFS 2006:544](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/lag-2006544-om-kommuners-och-regioners-atgarder_sfs-2006-544/) ·
[SFS 2018:585](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/sakerhetsskyddslag-2018585_sfs-2018-585/)

### Five dead sources

`career-center:sources` found that five URLs the catalogue shipped were 404s —
three beyond the two already known:

| Dead URL                                                           | Where                                          | Replaced with                                                  |
| ------------------------------------------------------------------ | ---------------------------------------------- | -------------------------------------------------------------- |
| `polisen.se/tjanster-tillstand/tillstand/bevakningsforetag/`       | Väktare, Personskyddsväktare, väktarutbildning | Polismyndighetens föreskrifter FAP 573-1                       |
| `polisen.se/tjanster-tillstand/tillstand/ordningsvakt/`            | Ordningsvakt                                   | `polisen.se/lagar-och-regler/ordningsvakter/`                  |
| `acams.org/.../certified-anti-money-laundering-specialist-cams`    | CAMS                                           | `acams.org/en/about-certifications`                            |
| `asisonline.org/certification/physical-security-professional-psp/` | PSP                                            | `asisonline.org/certification/physical-security-professional/` |
| `riksdagen.se/sv/dokument-lagar/...` (old path form)               | several                                        | current `dokument-och-lagar` paths                             |

## B7. Education relevance is authored; ISO is not a certificate

### The inference is gone

`formal_requirement` used to be derived from three pieces of metadata — the
profession is `regulated`, it states some formal requirement, the education's
scope overlaps its jurisdiction — none of which is about the relationship
between the two records. That produces a **legal claim** out of metadata. It
happened to be right twice and would be wrong the first time a regulated role
gained an optional pathway.

`education-links.ts` is now an authored table. Every row states:

- **relevance** — formal requirement or recommended development
- **supports** — exactly which part of which requirement it satisfies, _and
  what it does not_. Mandatory for a formal requirement: "this is required"
  without saying required _for what_ is not a claim anybody can check
- **countries** — the jurisdiction the statement is made in
- **authority** — the instrument that establishes it
- **lastVerified** — when that was read

The Ordningsvakt row reads, in full: _"Uppfyller kravet på föreskriven
utbildning i 9 § lagen (2023:421) om ordningsvakter. Det är ett av tre villkor:
du måste dessutom ha fyllt 20 år och bedömas lämplig, och det är
Polismyndigheten som beslutar om förordnande. Genomförd utbildning ger i sig
inget förordnande."_

A standing line above the list says that completing a course **never**
guarantees suitability, approval, appointment or eligibility.

### ISO reclassified

ISO 31000, ISO 22301 and ISO/IEC 27001 were carried as personal certifications
with `issuer: "ISO"` and rendered beside CPP and CAMS under "Certifikat". Every
part of that was false. They now carry `credentialType: "standard"`, render as
**Kunskapsområde – publicerad standard**, and their `issuer` field states what
is actually true:

- ISO 31000 — _"vägledning och är inte avsedd för certifiering — det finns
  ingen ISO 31000-certifiering, varken för en person eller för en
  organisation"_
- ISO 22301 / 27001 — _"certifiering … görs av oberoende certifieringsorgan och
  avser organisationen, inte en person"_

A guard asserts that a `standard` can never be a `formal_requirement`.

Sources: [ISO 31000](https://www.iso.org/standard/65694.html) ·
[ISO on certification](https://www.iso.org/certification.html)

## B8. The commercial boundary

No paid placement ships. `EDUCATION_PROVIDER_PLACEMENTS` is empty.

**Kept:** payment cannot affect profession recommendations, career routes or
education ordering. `educationOrderKey`'s parameter type carries no placement
field — not "does not read it", _cannot_ — and the guard re-orders every
offer with a sponsored placement attached and requires a byte-identical
sequence, for every published guide.

**Removed:** the claim that telemetry proved any of that. It does not; static
code structure and tests do, and analytics measures engagement.

**Corrected in the placement model, as required:**

| Requirement                                               | How                                                                                                               |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `rel="sponsored"` only when sponsored                     | `rel={sponsored ? "noreferrer sponsored" : "noreferrer"}`, asserted by the guard                                  |
| deterministic, price-blind provider order                 | `orderPlacements` sorts by provider name then placement id; sponsored is not hoisted; no price exists in the type |
| a maximum number of placements                            | `MAX_PLACEMENTS_PER_OFFER = 3`, enforced in `orderPlacements`                                                     |
| disclosure precedes / is part of the accessible link name | the label is rendered **inside** the `<a>`, before the provider name                                              |
| wording                                                   | _"Annons – betald placering från {provider}"_ / _"Advertisement – paid placement from {provider}"_                |
| fixed payment does not eliminate incentives               | the §C3 recommendation no longer claims it does                                                                   |

**Documented, not built.** The first commercial release will require: a stable
placement id (present in the type already), a verified legal provider entity,
an approval status, reviewed and expiry dates, a jurisdiction, HTTPS and domain
validation (`placementIsWellFormed` covers HTTPS today), a kill switch, and
aggregated PII-free impression/click reporting. None of it is implemented here.

## B9. Progressive disclosure

| Surface                    | Before (375px) | After (375px) |
| -------------------------- | -------------: | ------------: |
| Hub                        |      ~11,727px |   **6,079px** |
| Väktare guide              |      ~13,642px |   **8,821px** |
| Career-steps section alone |       ~4,241px |   **2,012px** |

What moved behind a click, and what deliberately did not:

| Folded                        | Why it is safe to fold                                                                                                                                                                                                                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The 11-guide catalogue        | Behind "Visa alla yrken (11)". The open state is `?all=1` in the URL, so a filtered catalogue view is still shareable and deep-linkable — and any narrowing filter forces it open, because a link that filters the catalogue has to show it. |
| Transition detail             | The kind, the two roles and the sentence that says why that kind matters stay visible. What folds is what a reader asks for after deciding to care.                                                                                          |
| Competency demands (11 cards) | A reference grid, counted in the summary.                                                                                                                                                                                                    |
| The source list               | The **review date and jurisdiction stay visible** — they are what a reader uses to decide whether to trust the page at all.                                                                                                                  |
| Routes 2–4                    | The first route is open; the rest are one keystroke away.                                                                                                                                                                                    |
| "Vanliga vägar hit"           | A reader on a guide is asking where they can _go_.                                                                                                                                                                                           |
| Related professions           | A reference list at the foot of the page.                                                                                                                                                                                                    |
| The four trust cards          | The claim above them stays unfolded.                                                                                                                                                                                                         |

Nothing legal is folded. Formal requirements, the regulatory notice, the
boundary note, the "not eligibility" line and the "a course guarantees nothing"
line are all unconditional.

Every disclosure is a native `<details>` or a real `<button>` with
`aria-expanded` and `aria-controls`: keyboard operable, findable by in-page
search, no script. Asserted by e2e, which opens one with the keyboard.

## B10. Read failures fail closed

Both career-report reads were written `const { data } = await …`, discarding
the `error` half of Supabase's `{ data, error }`. A failed read therefore
produced `data === null`, which is byte-identical to "this candidate has no
report" — and the surface told somebody with a completed analysis that they had
never taken one.

| Read                                      | Was                                         | Now                                 |
| ----------------------------------------- | ------------------------------------------- | ----------------------------------- |
| `getActiveCareerReport` — snapshot select | error discarded → `{ kind: "none" }`        | `{ kind: "read_failed", reason }`   |
| `getActiveCareerReport` — legacy select   | error discarded → `{ kind: "none" }`        | `{ kind: "read_failed", reason }`   |
| `getStoredDiscoveryReport`                | error discarded → `{ status: "not_found" }` | `{ status: "read_failed", reason }` |

`{ kind: "none" }` is now reached only when **both** reads answered
successfully and neither found a row.

Mapped through `deriveCareerDirection` → `unavailable`,
`home-presentation.ts` (an explicit branch _before_ the fall-through, which
would otherwise have rendered a failed read as "no analysis"), the report route,
and `useMyCareerDirection`.

Separately, the **settled-but-empty** trap: `if (storedQ.isLoading ||
!storedQ.data)` was true for a completed read carrying nothing, so the section
rendered its loading state forever with no retry. Both queries now separate
`isPending` from `data == null` — `== null` deliberately, because the response
can carry `null` as well as be absent, and the original bug was a truthiness
test that treated both as "still loading".

Tested with **Supabase-shaped payloads**, not HTTP 500s: the server function
resolves, carrying the failure its handler produced.

## B11. The guards are proven

`career-center:negative-controls` reintroduces eleven real defects one at a
time, runs `career-center:check`, requires it to fail **with a message naming
the right thing**, then restores the file byte for byte and requires the guard
to be green again. Reversibility is asserted, not assumed.

Writing it found **two guards that could never have failed**, both the same
shape: they asserted the RENDERED value, which the model already suppresses, so
they passed whether or not the defect was in the data. Both now assert the
data, and the second immediately found reviewed prose sitting on a placeholder
edge.

```
$ bun run career-center:negative-controls
baseline: career-center:check is green

  detected      a transition labelled "common" with no frequency evidence
  detected      a placeholder edge promoted to reviewed without a source
  detected      the repealed Act 1980:578 back in active content
  detected      the ordningsvakt minimum age back at 18
  detected      skyddsvakt training set by "the protected object's requirements"
  detected      ISO 31000 modelled as a personal certificate
  detected      Säkerhetschef listed as a direct direction out of Väktare
  detected      the routes section numbering its entries again
  detected      pathFrom no longer stating where the current role came from
  detected      a formal requirement attached to an unregulated profession
  detected      the education event and its unreachable schema coming back

negative-controls OK — 11 reintroduced defects, all detected, all reverted
```

`career-center:sources` validates every external source two ways. Offline, in
CI: HTTPS, an allowlisted publisher host (riksdagen, Polismyndigheten, MSB, FI,
ISO, and each credential's own issuer — a training provider's marketing page
would pass every syntactic test and is exactly what this catalogue must not
cite), coverage by a committed reachability snapshot, and every review date
inside the 730-day policy. With `--online`, by hand: it fetches each URL and
rewrites the snapshot. A 403 is recorded as a bot wall rather than treated as a
dead link, because failing on it would push the catalogue away from primary
sources.

Reachability alone would never have caught the repealed Act — riksdagen serves
it with a 200. The freshness policy is the half that would.

---

## C. Files

**Added — data (6)**
`src/lib/career-center/{profession-links,transitions,career-origin,education-links,education-offers,personal-direction}.ts`,
`src/hooks/useMyCareerDirection.ts`

**Added — components (5)**
`src/components/career-center/{PathFromSection,PersonalDirection,TransitionCard,EducationPanel,NextStepPanel}.tsx`

**Added — verification (3)**
`e2e/career-center-pilot.spec.ts`,
`scripts/career-center-negative-controls.ts`,
`scripts/career-center-source-check.ts`,
`docs/career-center/source-snapshot.json`

**Changed — data**
`types.ts` (`CareerPath.countries` / `frequencyEvidence`, `Certification.credentialType`),
`career-paths.ts` (sourced gates; unsourced prose removed),
`career-routes.ts` (branches replace stages),
`professions/{researched,placeholders,index}.ts`,
`education.ts`, `certifications.ts`, `explorer-state.ts` (`from`, `all`),
`analytics.ts`, `index.ts`

**Changed — surfaces**
`routes/career-center.index.tsx`,
`components/career-center/{ProfessionTemplate,ProfessionCard,ProfessionExplorer,CareerRoutes}.tsx`,
`components/professional-identity/CareerDirectionSection.tsx`,
`routes/jobs.profession.$professionSlug.tsx`,
`components/site/PrimaryButton.tsx`, `src/i18n/dictionaries.ts`

**Changed — read paths**
`career-discovery/{active-report,stored-report}.functions.ts`,
`professional-identity/{career-direction,home-presentation}.ts`,
`routes/_authenticated.security-career-assessment.report.$snapshotId.tsx`

**Changed — guards**
`scripts/{career-center-check,my-career-premium-overview-check}.ts(x)`,
`scripts/release-frontier-check.ts` (merge resolution),
`.github/workflows/ci.yml`, `package.json`

**Removed**
`supabase/migrations/20261102090000_cd_v31_funnel_events_career_education.sql`
and its `release-state.json` entry

---

## D. The commercial model

### D1 — What ships

The placement type, an empty placement list, a disclosure with no off switch, a
deterministic price-blind provider order, a cap of three, HTTPS validation, a
stable placement id, and a visible neutrality statement in both languages.

### D2 — Which revenue model to test first

| Model                                  | Assessment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1. Fixed fee per sponsored listing** | **Test this first.** It is the only one of the three that needs no attribution infrastructure, no provider account, no invoicing cycle and no shared definition of a "qualified contact". It is priceable from traffic already measured and cancellable in one commit. It does **not** eliminate the incentive to seek better visibility — a provider paying a flat fee still wants a better slot, and the defence against that is the ordering being structurally blind and guarded, not the pricing shape. |
| 2. Price per qualified contact         | Needs a definition of "qualified" both sides trust and a click-to-contact trail. It creates a direct incentive to raise a placement's visibility, so it should not be the model that establishes the norms.                                                                                                                                                                                                                                                                                                  |
| 3. Commission on a booked place        | Needs booking confirmation from the provider's system, a refund path and revenue recognition. Highest value per unit, furthest from anything here.                                                                                                                                                                                                                                                                                                                                                           |

---

## E. Deliberate limits

1. **The Career Center does not read the Passport.** §5 of the original brief
   permits it; this declines, and a guard enforces it. A public, indexed page
   about a profession is the wrong place for trust-bearing personal data, and
   any such display invites the inference the same section forbids. What ships
   is the link, the action, and the sentence naming the rule.

2. **"Väktare → arbetsledare" is not shown.** No such profession exists in the
   catalogue and no sourced edge leads to one.

3. **Two of the four route origins carry only unreviewed directions.** They
   render as directions under review, saying nothing about frequency,
   experience or order. Reviewing them needs transition-specific evidence,
   which is content work.

4. **Säkerhetssamordnare describes the public sector only.** The private-sector
   variant of the title is named on the page as not source-verified. Widening
   it needs occupation-specific authoritative evidence.

5. **Nine guides remain unpublished**, named under "Kommer", never linked.

6. **`<head>` metadata is Swedish-only.** SSR cannot read the client-side
   language toggle; the body is fully bilingual. Fixing it properly needs
   language-prefixed routes and `hreflang`.

7. **The career analysis is still behind the tester allowlist.** Untouched;
   opening it is an owner decision.

8. **The e2e suite is not a GitHub CI job.** It needs a running dev server.
   `career-center:check`, `career-center:negative-controls` and
   `career-center:sources` all run in CI; the Playwright suite is reported
   separately and was run locally.

---

## F. Screenshots

`docs/career-center/screenshots/pilot/` — 1× device scale, every
`/_serverFn/*` call intercepted, no backend reached.

| File                                                               |                                                                                                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| `01-hub-1440-sv.png` / `02-hub-1440-en.png`                        | Hub, full page, 1440px, both languages                                                                                                |
| `03-hub-375-sv.png` / `04-hub-375-en.png`                          | Hub, full page, 375px, both languages                                                                                                 |
| `05-pathfrom-1440-sv.png` / `06-pathfrom-375-sv.png`               | `pathFrom` — the role selector, the provenance line, three independent directions, the not-eligibility statement                      |
| `07-fit-1440-sv.png` / `08-fit-1440-en.png`                        | `fit` in its `ready` state — three ranked recommendations, the indicative one flagged, the one with no guide as plain text            |
| `09-routes-1440-sv.png` / `10-routes-1440-en.png`                  | The route out of Väktare: three independent branches, the independence stated in words, one marked "möjlig riktning under granskning" |
| `11-guide-vaktare-1440-sv.png` / `12-…-en.png` / `13-…-375-sv.png` | Väktare guide, full page                                                                                                              |
| `14-guide-ordningsvakt-1440-sv.png`                                | Ordningsvakt — Act 2023:421 and all three conditions of 9 §                                                                           |
| `15-career-steps-1440-sv.png` / `16-career-steps-open-1440-sv.png` | Career steps, collapsed and with one detail open                                                                                      |
| `17-education-1440-sv.png`                                         | A formal requirement stating which part of 9 § it satisfies, with country, source and review date                                     |
| `18-education-1440-en.png`                                         | Recommended development, including ISO as a knowledge area                                                                            |
| `19-boundary-sakerhetssamordnare-1440-sv.png`                      | The säkerhetsskyddschef boundary with scope and the "uppenbart obehövligt" qualifier                                                  |
| `20-next-step-1440-sv.png`                                         | Related jobs and the Passport boundary                                                                                                |

---

## G. Verification

### Guards (CI)

|                                   |                                                                   |
| --------------------------------- | ----------------------------------------------------------------- |
| `career-center:check`             | `OK — 11 published guide(s), 9 upcoming, 4 career route(s)`       |
| `career-center:negative-controls` | `OK — 11 reintroduced defects, all detected, all reverted`        |
| `career-center:sources`           | `OK — 20 external source(s), 38 review date(s) within 730 days`   |
| `deploy-plan:gate`                | `Plan is empty. A deploy would apply nothing and refuse nothing.` |

Also green: `career-profession-bridge`, `kg`, `cie`, `career-discovery`,
`career-discovery-v31-professions`, `career-discovery-v32-content`,
`career-discovery-v32-equivalence`, `career-discovery-claim`,
`career-discovery-report`, `career-journey`,
`security-competency-separation`, `passport-separation`,
`my-career-premium-overview`, `my-career-dashboard`, `my-career-gate`,
`professional-identity`, `trust-surface`, `header-entry`, `public-homepage`,
`candidate-app-navigation`, `prepilot-candidate-surface`, `release-parity`,
`release-frontier`, `migrations`, `migrations-duplicate`,
`schema-first-release`, `backend-target-lock`, `sql-security`,
`mcp-exposure`, `bunx tsc --noEmit`, `scripts:typecheck`, `bun run build`.

### Playwright — 26 scenarios × 2 projects = 52 runs, all green

Not a GitHub CI job: it needs a running dev server. Run with
`bun run e2e:career-center`.

| Group                     | Covers                                                                                                                                                                                                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| the three concepts        | `pathFrom` from a stated role without any analysis · the selector writes the URL, is keyboard operable and deep-links · `fit` and `pathFrom` as two sections each naming its basis · an explicit selection overriding the profile · **no Passport request from any Career Center page** |
| routes and evidence       | three independent branches, Säkerhetschef absent from them and present as its own route · a sourced gate describes itself, an unsourced direction does not · no frequency label anywhere · the long jump names the intermediate role                                                    |
| regulatory facts          | Act 2023:421 and age 20, 1980:578 absent · skyddsvakt's three deciders · the säkerhetsskyddschef boundary · ISO as a knowledge area · a formal requirement naming which part of 9 § it satisfies                                                                                        |
| progressive disclosure    | the catalogue absent until asked for, one keystroke to open, `?all=` in the URL · a filtered deep link opens it already narrowed · a transition detail opens from the keyboard · the guide's competencies, sources, inbound routes and related list folded · height budgets at 375px    |
| personal-data read states | a Supabase-shaped `read_failed` never reported as "no result" · a stored-report failure · a settled-but-empty read not hanging on loading · genuine "no analysis" still saying exactly that                                                                                             |
| structure and access      | every internal link lands on a published guide · one `h1`, no skipped heading levels, landmarks · a drawn focus indicator · 44px targets · 1440 / 375 / **real 200% page zoom** with no horizontal overflow · the whole journey in English                                              |
