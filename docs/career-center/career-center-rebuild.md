# Security Career Center — product completion

Rebuild of `/career-center` from a catalogue of unfinished content into a
guided product. Eleven sections became six; twenty clickable profession guides
became ten, with the other ten named but not linked.

---

## A. Audit of current state versus the specification

Audited against `origin/main` at `3db6508` before any change.

### The catalogue

`src/lib/career-center/professions/` held twenty professions in two files:

| File | Count | State |
| --- | ---: | --- |
| `researched.ts` | 10 | Real sources, review date, 2–4 responsibilities, 5–7 competencies, career-path links |
| `placeholders.ts` | 10 | **0 sources**, no review date, exactly one responsibility reading "Content varies between countries. This guide is under development." |

All twenty rendered as identical clickable cards. The only distinction was an
`UNDER UTVECKLING` badge — which appeared on the card, on the guide, and
nowhere in between. A direct URL to `/career-center/police-officer` served the
placeholder content in full.

### Findings against each section of the specification

| Spec | Finding on `main` |
| --- | --- |
| §1C verified claims | Hero claimed **"60+"** professions over a catalogue of 20 (10 of them stubs), and printed **"Modell v1.0"** — an internal version string — as a fact. Both were dictionary literals. |
| §2 six sections | Hub had **eleven**: hero, three entry paths, Utvalda yrken, Bläddra efter kategori, Hitta rätt roll, Yrkesfamiljer, Karriärvägar, Utbildning+Certifikat, Karriärtest CTA, Senaste artiklar, Utvalda jobb. |
| §2 §4 one explorer | Four sections presented the same twenty professions in four arrangements. "Bläddra efter kategori" was a 12-tile grid that silently drove a filter three sections further down the page. |
| §2 §3 career test | Career test was the **ninth** section, below the whole catalogue. |
| §3 empty sections | Four sections whose entire content was a dashed box: `"Utbildningsinformation byggs upp löpande"`, `"Certifikatsdatabasen är under uppbyggnad"`, three identical `"Redaktionellt innehåll är under uppbyggnad"` cards, and `"Utvalda jobb visas här när jobbportalen är i drift"`. |
| §4 publishability | No gate of any kind. |
| §4 taxonomy | Both **Kategori** (12 values) and **Yrkesfamilj** (14 values) were exposed as separate filters over the same 20 records. |
| §4 filter state | Held in `useState`. No URL representation — a filtered view could not be shared, bookmarked or reached by a link, which is why the three entry paths could only scroll to `#browse`. |
| §4 zero result | Dead-ended at `"Inga yrken matchar din sökning ännu."` |
| §4 accessibility | Search input had no associated `<label>`; no result count at all, announced or otherwise; filter chips signalled selection by colour only. |
| §5 guide template | Career-Center-wide statistics panel rendered beside every job title. Three dashed placeholder panels. `CRITICAL` badge hard-coded in English. Competency levels shown with no scale. No "En dag i rollen", no fit / counter-signal sections, no "Så kommer du in". |
| §5 career path | `getRoadmap()` produced a flat list of **titles as strings** — not links. |
| §6 `/career-center/start` | Six audience buttons. The selection revealed three profession cards under a heading a second, unconditional section on the same page used verbatim. Everything else was identical for all six audiences, and four of the five "next step" cards linked to the same `#browse` anchor. |
| §7 copy | Entry-path CTAs were `t("cta.learn_more")` — "Läs mer". Secondary hero CTA was "Bläddra bland yrken". |
| §11 measurement | `trackV31FunnelEvent` exists and is used by the assessment flow. Career Center emitted **nothing**. |

### Two findings that constrain the result

1. **`/security-career-assessment` is gated by a tester allowlist.** Enforced
   server-side in `v31-public.functions.ts`; the route is `noindex, nofollow`.
   A general visitor clicking the hub's primary CTA reaches a "not open yet"
   state. This is a deliberate governance gate and opening it is an owner
   decision, so this branch does not touch it — see §I.

2. **Career Discovery already produces concrete professions.** §3 of the
   directive asked to report if it could not: `ProfessionMatchResult.ranked`
   returns a top-3 occupational recommendation that is never empty. The gap is
   different and is recorded in §I.

---

## B. What was reused

- The whole `src/lib/career-center` data model — `Profession`, `Competency`,
  `Education`, `Certification`, `CareerPath`, the fourteen profession families,
  the 1–5 proficiency scale. No type changed shape.
- All twenty profession records, both files, unedited.
- The ten researched guides' sources, review dates and regulatory notes.
- `CareerHero`'s visual identity (radial + grid background, editorial type).
- `Section`, `Container`, `PrimaryLink`, `CertificationCard`, `FAQAccordion`,
  the icon registry, `dev`-time `runIntegrityCheck`.
- `trackV31FunnelEvent` — the existing funnel tracker, unchanged in shape.
- The existing `scripts/*-check.ts` guard convention.

## C. What was removed

| Removed | Reason |
| --- | --- |
| Hub sections: Utvalda yrken, Bläddra efter kategori, Hitta rätt roll, Yrkesfamiljer | Four presentations of one catalogue → one explorer |
| Hub sections: Utbildning, Certifikat, Senaste artiklar, Utvalda jobb | Their entire content was a promise that content would exist |
| `cc.hero.stats.*` (`"60+"`, `"v1.0"`, the four-stat rail) | Untrue and internal |
| `cc.status.developing`, `cc.status.under_development` | A stub is not shown at all, so it needs no badge |
| `cc.profession.{education,certifications,related_jobs}.placeholder` | Sections are omitted rather than filled |
| `CareerSearch.tsx`, `CategoryCard.tsx`, `SkillCard.tsx`, `CareerRoadmap.tsx` | Superseded |
| `/career-center/start` page body | Duplicated the hub; now a redirect |
| `ProfessionCard`'s `tag` prop | Existed for one value: "Under utveckling" |
| ~30 `start.*` dictionary keys | Belonged to the retired page |
| Category as a user-facing filter | One visible taxonomy; category stays an internal field |

## D. What was rebuilt

### New data modules (pure, no schema change)

| Module | What it does |
| --- | --- |
| `publishability.ts` | Computes publishability **from the content**, not from a flag. One predicate feeds the hero count, the explorer, the routes, related lists and the route guard, so none can drift from another. |
| `explorer-state.ts` | The URL **is** the filter state. Parse/round-trip, active chips, clear-all, zero-result relaxation, and the availability lists that stop the UI offering a filter that cannot change anything. |
| `meta-groups.ts` | Four presentational groupings over the fourteen families. Not a second taxonomy — nothing is stored against a meta-group. |
| `career-routes.ts` | Three routes assembled from real `careerPaths` edges and `nextRoles`/`previousRoles` links. `validateRoutes()` refuses any stage pair the data does not record. |
| `profession-fit.ts` | "Passar dig som…" / "Passar mindre bra om…" derived by inverting the role's own stated competency demands, and "Så kommer du in" from its formal requirements and education pathways. |
| `analytics.ts` | Career Center events mapped onto the existing funnel allowlist. |

### Rebuilt surfaces

- **Hub** — six sections in the specified order. Every number derived
  (`PUBLISHED_PROFESSION_COUNT`, `MVP_QUESTION_COUNT`).
- **`ProfessionExplorer`** — search with a real label, two primary filters,
  collapsed "Fler filter", `aria-live` result count, removable chips,
  "Rensa alla", shareable URL, and a zero-result recovery that names the
  constraint it is offering to lift and states how many results that yields.
- **`ProfessionTemplate`** — the 15-section order, every section conditional
  on its own data.
- **`CompetencyCard`** — five-step indicator, scale explained, `KRITISK
  KOMPETENS` from the dictionary.
- **`CareerRoutes`** — three routes, every step a link, transitions described
  from the profession records.
- **Profession route** — resolves through `getPublishedProfession`; an
  unfinished guide gets an explicit `noindex` unavailable state.

---

## E. Files changed

**Added — data (7)**
`src/lib/career-center/{publishability,explorer-state,meta-groups,career-routes,profession-fit,analytics}.ts`,
`scripts/career-center-check.ts`

**Added — components (3)**
`src/components/career-center/{ProfessionExplorer,CareerRoutes,CompetencyCard}.tsx`

**Rewritten (6)**
`src/routes/career-center.{index,$profession,start}.tsx`,
`src/components/career-center/{CareerHero,ProfessionCard,ProfessionTemplate}.tsx`

**Edited (6)**
`src/i18n/dictionaries.ts` (Career Center block, SV + EN),
`src/lib/career-center/index.ts`,
`src/lib/career-discovery/v31-feedback.functions.ts` (two funnel names),
`src/components/site/Section.tsx` (`id` prop),
`src/components/site/PrimaryButton.tsx` (`onClick`),
`.github/workflows/ci.yml`, `package.json`, `supabase/release-state.json`

**Deleted (4)**
`src/components/career-center/{CareerSearch,CategoryCard,SkillCard,CareerRoadmap}.tsx`

---

## F. Schema changes

**One migration**, additive, not required for rendering:

`supabase/migrations/20261004090000_cd_v31_funnel_events_career_center.sql`

It drops and recreates `cd_v31_funnel_events_event_name_check` with two more
allowed values — `career_center_test_started` and `career_filter_used` —
exactly as `20260816162000` did for `result_downloaded`. It introduces no
object and touches no policy.

**Why it is necessary.** §11 requires four events. Two of them already have an
allowlisted name that means precisely the right thing and are reused:
`career_profession_opened` → `profession_explored`, and
`career_test_completed` → `assessment_completed`, which the assessment flow
already emits at exactly that moment (firing a second event would double-count
it). The other two do not:

- `career_center_test_started` is the **hub CTA click**. It is deliberately
  not `assessment_started`, which fires when the first question is answered.
  The gap between the two *is* the hub's conversion drop-off — the number that
  shows whether this rebuild worked. Collapsing them into one name deletes it.
- `career_filter_used` has no analogue at all.

**AC15 holds.** The tracker is fire-and-forget and never throws to its caller.
Until this runs, those two events are rejected by the CHECK and logged; every
page renders identically and no other event is affected. Classified `pending`
in `supabase/release-state.json`.

---

## G. Screenshots

`docs/career-center/screenshots/`

| File | |
| --- | --- |
| `01-hub-desktop.png` | Full hub, 1440px |
| `02-hub-mobile.png` | Full hub, 375px |
| `03-explorer-filters-active.png` | Filters active, chips, count |
| `04-explorer-zero-result.png` | Zero-result recovery |
| `05-profession-guide-vaktare.png` | Complete guide (Väktare) |
| `06-upcoming-kommer.png` | "Kommer" treatment |
| `07-career-test-section.png` | Career test section |
| `08-career-routes.png` | Career routes |
| `09-profession-unavailable.png` | Unfinished guide by direct URL |
| `10-hub-desktop-en.png` | English hub (SV/EN parity) |

---

## H. Tests and results

`bun run career-center:check` — new, registered in CI before the production
build. 15 groups: hub section order, retired keys staying retired, no
empty-content copy, SV/EN parity, career-test placement and boundary wording,
publishability, the direct-URL gate, derived counts, explorer URL round-trip /
clear-all / zero-result recovery / offered-filter availability, the
meta-group partition, career-route transitions, the competency scale and
translated label, guide section order and counter-signal symmetry, the
accessibility contract, banned CTA copy, and the code↔migration event
allowlist agreement.

```
career-center:check OK — 10 published guide(s), 10 upcoming, 3 career route(s)
```

Also run green: `career-discovery`, `career-discovery-v32-content`,
`career-discovery-v32-equivalence`, `career-discovery-v31-professions`,
`career-discovery-claim`, `security-competency-separation`,
`passport-separation`, `kg`, `cie`, `migrations-duplicate`,
`backend-target-lock`, `sql-security`, `release-parity`, `header-entry`,
`mcp-exposure`, `bunx tsc --noEmit`, `scripts:typecheck`, `bun run build`.

Browser-verified on the dev server: URL round-trip, entry-path pre-filters,
zero-result recovery, the unavailable state, the `/start` redirect, SV↔EN
parity, and mobile at 375px (no horizontal overflow).

---

## I. Known remaining gaps

1. **The career test is closed to the public.** `/security-career-assessment`
   is gated by `cd_internal_testers`. The hub's primary CTA reads "Starta
   karriärtestet — ca 5 min, inget konto" and a general visitor reaches a
   "not open yet" state. Opening the gate is an owner decision and was
   deliberately not made here. **Nothing else in this PR is blocked by it**,
   but the hub's headline promise is not true for a public visitor until it
   is lifted.

2. **Career Discovery results do not link to Career Center guides.** The
   engine ranks professions from the CIG catalogue (`cig_professions` slugs);
   the Career Center has its own slugs. Bridging them is a mapping table plus
   a change to the result view — Career Discovery output, explicitly out of
   scope for this PR.

3. **The analytical/strategic route has two stages, not three.** No published
   guide has a sourced transition *into* Risk Manager or Kris- och
   kontinuitetsansvarig. AML-specialist is the obvious predecessor and is
   linked to Risk Manager as `related`, but `related` is not a progression and
   the route generator refuses to treat it as one. Adding one sourced edge
   would make it three stages.

4. **`<head>` metadata is Swedish-only.** SSR cannot read the client-side
   language toggle, so the indexed title/description are the Swedish ones.
   The page body is fully bilingual. Fixing this properly needs
   language-prefixed routes (`/sv/…`, `/en/…`) and `hreflang`, which is an
   application-wide routing change — deliberately deferred per §10.

5. **Ten guides are still unfinished.** Named under "Kommer". Publishing any
   of them needs sourced content, a jurisdiction and a review date; the
   predicate will then pick them up with no code change.

6. **`workEnvironments` exists on only one published guide.** "En dag i
   rollen" therefore shows 2–4 task bullets on most guides rather than the
   4–6 the spec sketches. That is a content gap, not a template one.
