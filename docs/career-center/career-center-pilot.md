# Career Center — pilot rebuild

`/career-center` rebuilt from a catalogue with a filter into a guided service:
where am I, which professions could suit me, how do I get from here to there,
what is actually required, and what do I do next.

Built on `origin/main` at `42e2ba1`.

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

| | Count | |
| --- | ---: | --- |
| Published guides | 10 | Väktare, Ordningsvakt, Skyddsvakt, Säkerhetschef, Säkerhetstekniker, Risk Manager, AML-specialist, Datacentersäkerhet, Kris- och kontinuitetsansvarig, Personskyddsväktare |
| Named but not linked | 10 | including **Säkerhetssamordnare** |

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

Two problems, both about what was *shown* rather than what was recorded:

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
recommended — landed on *"Den här yrkesguiden är inte publicerad ännu."*

The same namespace confusion existed at `/jobs/profession/$professionSlug`,
which resolved its route param (a CIG slug, because `jobs.profession_slug` is a
foreign key onto `cig_professions.slug`) through the Career Center's own
`getProfession`, and printed the raw slug as the page's `<h1>` whenever it
missed.

There was **no reverse direction at all**: `/career-center` was entirely
impersonal for a signed-in reader with a completed analysis.

### A4 — How requirements, experience, education and certification were modelled

| Concept | Where it lives | State |
| --- | --- | --- |
| Formal requirements | `Profession.formalRequirements: Bi[]` | Reviewed prose, present on all regulated roles |
| Regulatory framing | `Profession.regulated` + `regulatoryNotes` | Notes rendered **only when `regulated === true`** |
| Experience | `CareerPath.experienceRequired` | **Unused** — no edge carried one |
| Education | `Education[]`, referenced by id | 3 of 8 records sourced and reviewed; 5 are structural placeholders |
| Certification | `Certification[]`, `mandatory?: boolean` | 7 of 10 sourced; `mandatory` never `true` anywhere |

The guide rendered education and certifications as **two lists of names**. A
reader could not tell whether "Väktarutbildning (VU1/VU2/VU3)" was a legal
requirement or a suggestion, which country it applied in, where the claim came
from, or when anybody last checked. Placeholder education records rendered
identically to sourced ones.

### A5 — What was verified against a source, and what was editorial

| | Verified | Editorial / derived |
| --- | --- | --- |
| Professions | 10 guides, each with named sources, publisher, URL and a review date | "Passar dig som…" / "Passar mindre bra om…", derived by inverting the role's own stated competency demands (`profession-fit.ts`) |
| Transitions | 4 edges with reviewed notes | Level shift, orientation change, raised competencies — all derived from the profession records |
| Education | 3 records with an `officialSource` | 5 placeholders with a `notes` disclaimer |
| Certifications | 7 with an `officialSource` | 3 placeholders |

The separation was already sound. What it lacked was a way for the **reader** to
see which was which.

### A6 — Buttons, links and sections with no distinct purpose

| | Finding |
| --- | --- |
| Hero | **Two competing primary buttons**: "Starta karriärtestet — ca 5 min, inget konto" and "Utforska yrken". The first also states five minutes for an instrument whose own `DURATION_CLAIM` says 12–15. |
| §2 "Var står du i dag?" | Asked the reader's own question and answered it with three generic cards. Two of the three led to the explorer with a pre-filter; the third to `/employers`. |
| §3 career test | A full-width dark band repeating the hero's CTA — the **third** offer of the same action above the fold. |
| Guide | No related jobs section at all, despite `/jobs/profession/$slug` existing. No connection to the Passport. |
| Guide | `cc.hero.title` ("Säkerhetskarriärcenter") doubled as the breadcrumb label. |

### A7 — Were the recommendations actually based on the reader's result?

**No.** There were no recommendations of any kind on `/career-center`. The page
was identical for every visitor. The "Var står du i dag?" section was the
closest thing, and its three cards were fixed copy.

---

## B. What changed

### B1 — Information architecture

Five sections, in the reader's own question order:

| | Section | Answers |
| --- | --- | --- |
| 1 | Hero | What is this, and where do I start |
| 2 | **Din riktning** | Where am I now — from the reader's own analysis, or honestly not at all |
| 3 | Utforska yrken | Which professions could suit me |
| 4 | Karriärvägar | How do I get from here to there |
| 5 | Så bygger vi innehållet | Why should I believe any of this |

**One primary action per section**, and the hero's is chosen by state: a reader
whose own analysis is in hand gets "Utgå från mitt resultat"; everybody else
gets "Utforska alla yrken". The second path is a quiet link, never a second
button.

The retired "Var står du i dag?" band's two working destinations survive as
quick choices inside the explorer, where a reader is already deciding how to
narrow the list. The retired career-test band's content survives inside
section 2 — the only place on the page where "you have no result yet" is a true
statement, and therefore the only place the invitation belongs.

### B2 — Personal direction (§3B)

`personal-direction.ts` maps the reader's **frozen** report onto the catalogue.
It ranks nothing: the occupations, their order and their confidence are read
from the snapshot by `deriveCareerDirection`, which My Career already uses, so
the two surfaces cannot disagree about what the report said.

Seven states, six of which show no recommendation at all:

| State | What the reader sees |
| --- | --- |
| `loading` (session unknown) | The section heading and the general invitation — this is the **server-rendered** state, so a crawler never receives "Hämtar din karriäranalys…" |
| `loading` (report) | A status line, announced |
| `anonymous` | The invitation, plus "har du gjort analysen tidigare? Logga in" |
| `no_result` | The invitation |
| `unreadable` | "Vi kan inte läsa din senaste analys just nu" + retry + history — never "you have not taken one" |
| `no_roles_named` | A v2.1 / v3.0 result names areas, not occupations. It is a result and is linked as one |
| `ready` | At most three occupations, each with its rank and its reason |

Two sentences are structural rather than editorial:

* `formalRequirementsAssessed` is typed **`false`**, permanently. The line
  "Analysen har inte prövat formella krav…" is rendered from it, so removing
  the sentence requires changing a type.
* When the snapshot was frozen in the other language, the surface says so
  rather than presenting frozen Swedish strings as translated.

### B3 — Career steps, classified (§3D)

`transitions.ts` classifies every recorded move into one of three kinds,
**derived from the guides' own fields**:

| Kind | Rule | Example |
| --- | --- | --- |
| `formal_gate` | The destination is regulated **and** states formal requirements | Väktare → Ordningsvakt |
| `long_term` | Two or more levels away, **or** a senior role demanding more leadership than the origin | Väktare → Säkerhetschef |
| `adjacent` | Everything else | Väktare → Säkerhetssamordnare |

`formal_gate` takes precedence over distance: a gate is a gate however near the
role otherwise looks.

Each card carries what transfers (competencies both roles demand), what is
demanded more of, the destination's formal requirements **verbatim**, reviewed
prose where an edge has it, and a concrete next action. Nothing synthesises a
duration; a guard fails the build if any transition prose contains one.

For a `long_term` move the card names the **intermediate role the graph
records** — read from the graph, not authored — which turns
`Ordningsvakt → Säkerhetschef` into `Ordningsvakt → Säkerhetssamordnare →
Säkerhetschef`. Adjacent and gated moves deliberately show no intermediate:
offering a detour around something the reader can already do is noise.

The hub's career routes use the same classifier, so "kräver utbildning eller
myndighetsbeslut" means the same thing on both surfaces.

### B4 — Säkerhetssamordnare published

Promoted from `placeholders.ts` to `researched.ts` with sourced content, a
jurisdiction and a review date, because without it the operational route could
not be honest.

The careful part is that **the title is not regulated**. Nobody appoints a
säkerhetssamordnare, no authority approves one and no training is mandated. The
guide therefore carries `regulated: false` **and** a `regulatoryNotes` boundary
saying so explicitly, and stating that the role must not be confused with a
*säkerhetskyddschef* — a distinct statutory function an operator must appoint
under säkerhetsskyddslagen (2018:585). An organisation can have both.

`ProfessionTemplate` was changed to render `regulatoryNotes` for an
**unregulated** role too, under the heading "Avgränsning" rather than
"Reglering". Suppressing it because `regulated` was false hid the one sentence
that stops a reader inventing a legal requirement.

Sources: SFS 2006:544 (the municipal risk-and-vulnerability and preparedness
duty the public-sector version of this role coordinates) and SFS 2018:585 (the
boundary). Both riksdagen.se, both resolve.

The operational route is now four stages:

```
Väktare → Ordningsvakt | Skyddsvakt → Säkerhetssamordnare → Säkerhetschef
       (formal_gate)                 (adjacent)          (long_term)
```

Two `careerPaths` edges were upgraded from `placeholder` to `researched` with
reviewed notes and `experienceRequired` prose that names the work and **no
duration**.

### B5 — Education and authorisation (§4.7, §6)

`education-offers.ts` is three layers, and the separation is the point:

```
Layer 1  WHAT the reader needs        derived from the profession guide
Layer 2  WHICH ORDER it is shown in   derived from Layer 1 alone
Layer 3  WHO delivers it              a placement, attached afterwards
```

Every presented row states four things, and a row that cannot state all four is
not presented — it is named as under review:

1. **Formellt krav** or **Rekommenderad utveckling**
2. the country that statement holds in
3. the source
4. the review date

"Formellt krav" is a claim about law, so it is only ever produced for a role
that is **personally** regulated (regulated *and* stating personal
requirements — AML is regulated as an activity and correctly does not qualify)
and only in a jurisdiction that guide claims.

### B6 — Cross-surface links (§5)

`profession-links.ts` is the one resolver. It **owns no data**: it composes the
existing reviewed CIG bridge (`career-intelligence-engine/slug-map.ts`, which
already has a guard forbidding proxy mappings) with the existing publishability
predicate.

* `resolveProfessionRef(slug)` — accepts either namespace, Career Center first.
* `careerCenterProfessionSlug(slug)` — returns `null` when no **published**
  guide exists, forcing every caller to decide what to render instead of
  discovering at click time that a URL does not resolve.
* `jobsProfessionSlug(p)` — the CIG slug a jobs query needs, or `null`.

Fixed with it: My Career's "Din karriärbild", and the jobs-by-profession route.

Related jobs are now on every guide. Four published guides have no canonical
CIG node (`ENRICHMENT_UNAVAILABLE`), so a jobs query for them would always
return zero for the wrong reason; those say so and offer two live routes onward
instead of rendering an empty list.

### B7 — The Passport boundary (§5)

**The Career Center does not read the visitor's Passport, and a guard enforces
that.** This is a deliberate decision, not an omission — see §E.

What it does carry, for every reader, signed in or not:

> Ditt Security Passport samlar dina meriter. Om en merit inte visas där
> betyder det att den **inte är registrerad** — **inte att du saknar den**.
> CQrityjob kontrollerar inte om du uppfyller kraven för ett yrke.

Both halves are load-bearing and both are asserted by the guard: "not
registered" alone still leaves the reader to supply the other half, and the
half they supply is "so you must not have it".

---

## C. The commercial model, prepared and not built

### C1 — What ships

* `EducationProviderPlacement` — a named provider, a URL, the jurisdictions it
  delivers in, and `placement: "organic" | "sponsored"`.
* `EDUCATION_PROVIDER_PLACEMENTS` — **empty**. The pilot ships the mechanism
  and no placement.
* A disclosure label with no off switch: it is driven by the `placement` value
  itself, not by a separate flag somebody could forget to set.
* One funnel event, `career_education_opened`, carrying `placement` so organic
  and sponsored are separable populations.
* A visible neutrality statement on the page, in both languages.

### C2 — Why ranking cannot notice money

`educationOrderKey`'s parameter type, `OrderableOffer`, contains `id`, `kind`
and `relevance` — and no placement field. Not "does not read it": **cannot**. A
future edit that wanted ranking to notice money would have to change a type
signature, which is a review event rather than a one-line diff.

The guard proves it empirically as well: it marks every offer sponsored,
re-orders, and requires a byte-identical sequence — for every published guide.

### C3 — Which revenue model to test first

| Model | Assessment |
| --- | --- |
| **1. Fixed fee per sponsored listing** | **Test this first.** It is the only one of the three that needs no attribution infrastructure, no provider account, no invoicing cycle and no shared definition of a "qualified contact". It is priceable from traffic we already measure, it is cancellable in one commit, and — the reason that matters — a flat fee creates no incentive to move a listing, because moving it does not change the invoice. |
| 2. Price per qualified contact | Needs a definition of "qualified" that both sides trust, and a click-to-contact trail. It also creates the first real incentive to raise a placement's visibility, so it should not be the model that establishes the norms. |
| 3. Commission on a booked place | Needs booking confirmation from the provider's own system, a refund path, and revenue recognition. Highest value per unit and the furthest from anything this pilot has. |

**Recommendation:** ship (1) with a fixed, published rate and a disclosure that
is not negotiable. Revisit (2) only once the placement layer has been live long
enough to show that ordering never moved.

Explicitly **not** in this PR: payment, invoicing, commission accounting,
provider self-service, and any sponsored placement in the shipped data.

---

## D. Files

**Added — data (5)**
`src/lib/career-center/{profession-links,transitions,education-offers,personal-direction}.ts`,
`src/hooks/useMyCareerDirection.ts`

**Added — components (4)**
`src/components/career-center/{PersonalDirection,TransitionCard,EducationPanel,NextStepPanel}.tsx`

**Added — tests (1)**
`e2e/career-center-pilot.spec.ts`

**Added — migration (1)**
`supabase/migrations/20261102090000_cd_v31_funnel_events_career_education.sql`

**Changed — data**
`professions/{researched,placeholders,index}.ts` (Säkerhetssamordnare
published), `career-paths.ts` (two edges upgraded), `career-routes.ts` (four
stages, step kinds), `certifications.ts`, `index.ts`, `analytics.ts`

**Changed — surfaces**
`routes/career-center.index.tsx`, `components/career-center/{ProfessionTemplate,ProfessionCard,ProfessionExplorer,CareerRoutes}.tsx`,
`components/professional-identity/CareerDirectionSection.tsx` (slug defect),
`routes/jobs.profession.$professionSlug.tsx` (slug defect),
`components/site/PrimaryButton.tsx` (`hash` prop),
`src/i18n/dictionaries.ts` (SV + EN)

**Changed — guards**
`scripts/career-center-check.ts`, `scripts/my-career-premium-overview-check.tsx`,
`scripts/release-frontier-check.ts`, `supabase/release-state.json`,
`src/lib/career-discovery/v31-feedback.functions.ts`

---

## E. Deliberate limits

1. **The Career Center does not read the Passport.** §5 permits it ("kan
   visa"); this PR declines. The page is public, indexed and cacheable, and it
   is a page about a *profession*. Putting trust-bearing personal data on it, to
   display something the reader can see in full on their own Passport, invites
   precisely the inference the same section forbids — that holding merits means
   being qualified. A guard asserts that no Career Center file reads
   `getMyPassport`, `getMyProfessionalIdentity` or `countMerits`. What ships is
   the link, the action, and the sentence that names the rule.

2. **"Väktare → arbetsledare" is not shown.** There is no `arbetsledare` /
   `gruppledare` profession in the catalogue and no sourced edge to one.
   Inventing either would be exactly the guess §2 forbids. It needs a sourced
   guide first; the graph will pick it up with no code change.

3. **Nine guides remain unpublished.** Named under "Kommer", never carded,
   never linked. Publishing any of them needs sourced content, a jurisdiction
   and a review date.

4. **`<head>` metadata is Swedish-only.** SSR cannot read the client-side
   language toggle. The page body is fully bilingual. Fixing it properly needs
   language-prefixed routes and `hreflang` — an application-wide routing change.

5. **The career analysis is still gated by the tester allowlist.** Unchanged
   and deliberately untouched: opening it is an owner decision. Section 2's
   invitation therefore reaches a "not open yet" state for a general visitor.

6. **The measurement migration is `pending`.** Additive, object-free, and it
   blocks nothing: the funnel tracker is fire-and-forget, so until it is applied
   `career_education_opened` is rejected and logged and every other event is
   unaffected. Since no placement ships, the event has nothing to record yet
   either.

---

## F. Screenshots

`docs/career-center/screenshots/pilot/` — captured against the dev server at
1× device scale, with every `/_serverFn/*` call intercepted so no backend was
reached.

| File | |
| --- | --- |
| `01-hub-1440-sv.png` | Hub, full page, 1440px, Swedish |
| `02-hub-1440-en.png` | Hub, full page, 1440px, English |
| `03-hub-375-sv.png` | Hub, full page, 375px, Swedish |
| `04-hub-375-en.png` | Hub, full page, 375px, English |
| `05-hub-personal-1440-sv.png` | "Din riktning" in its `ready` state — three recommendations, the indicative one flagged, the one with no guide rendered as text |
| `06-hub-personal-375-sv.png` | The same at 375px |
| `07-guide-vaktare-1440-sv.png` | Väktare guide, full page, 1440px, Swedish |
| `08-guide-vaktare-1440-en.png` | Väktare guide, full page, 1440px, English |
| `09-guide-vaktare-375-sv.png` | Väktare guide, full page, 375px, Swedish |
| `10-guide-sakerhetssamordnare-1440-sv.png` | The newly published Säkerhetssamordnare guide, including the "Avgränsning" boundary note |
| `11-career-steps-1440-sv.png` | "Möjliga nästa karriärsteg" — the three step kinds side by side, and the intermediate role on the long one |
| `12-career-steps-1440-en.png` | The same in English |
| `13-career-steps-375-sv.png` | The same at 375px |
| `14-education-1440-sv.png` | "Utbildning och behörighet" — formal requirement vs recommended development, with country, source and review date |
| `15-next-step-1440-sv.png` | Related open jobs and the Passport boundary |

---

## G. Tests

### `bun run career-center:check`

Extended with the pilot's own contract (group 16), on top of the fifteen groups
the previous rebuild established:

* **16a** every bridged CIG slug resolves to its Career Center guide and back;
  `vaktare` reaches `security-officer`; an unknown or unpublished slug yields
  `null` rather than a guessed guide; neither My Career nor the jobs route
  interpolates a raw CIG slug into a Career Center URL; every jobs link is
  built from a reviewed CIG slug.
* **16b** the seven classification cases the pilot depends on; a non-`long_term`
  move never offers an intermediate step; every onward destination is a
  published guide; every `formal_gate` names the requirement it gates on; no
  transition prose states a duration; the operational route has four stages
  with Säkerhetssamordnare before Säkerhetschef; every route stage carries a
  classification.
* **16c** no placement ships; every presented offer states jurisdiction, review
  date and a source in both languages; a `formal_requirement` is only ever
  produced for a personally regulated role in a jurisdiction it claims;
  `OrderableOffer` carries no placement field; marking every offer sponsored
  changes no order, for every published guide; the disclosure label is driven
  by the placement value.
* **16d** anonymous / unresolved-session / no-result / failed-read / legacy all
  reach their own state; a ready fixture produces at most three items, resolves
  its guide links through the bridge, keeps the indicative reason, renders a
  guideless role as text, and carries `formalRequirementsAssessed === false`.
* **16e** both halves of the Passport sentence, in both languages; and no
  Career Center file reads `getMyPassport`, `getMyProfessionalIdentity` or
  `countMerits`.
* **16f** no published guide is a dead end; the no-jobs branch offers two live
  routes onward.
* **16g** the education event has its own name and forwards its placement.

```
career-center:check OK — 11 published guide(s), 9 upcoming, 3 career route(s)
```

### `bun run e2e:career-center`

Twelve scenarios in a real browser, green on `chromium` and `mobile-375`:

| | |
| --- | --- |
| anonymous | understands the page, sees no personal claim, reaches a guide |
| anonymous | **every** internal Career Center link on the hub lands on a published guide |
| anonymous | 375px, 1440px and 200% zoom, no horizontal scroll |
| Väktare | route to Ordningsvakt is marked as an authority gate and names the förordnande |
| Väktare | Säkerhetssamordnare is adjacent; Säkerhetschef is long-term and names the middle role; the middle guide exists and continues the chain |
| Väktare | formal requirement is separated from recommended development, with country, source and review date; no sponsored badge anywhere |
| Väktare | an unregistered merit is "inte registrerad", never "saknas" |
| Väktare | the jobs link carries the CIG slug |
| signed in | three recommendations, each explained, correct guide slugs, the "not assessed" line, the hero's action switches |
| signed in | no report → no personal claim of any kind |
| signed in | failed read → "vi kan inte läsa" + retry, never "you have not taken one" |
| language | hub and guide both work in English end to end |
