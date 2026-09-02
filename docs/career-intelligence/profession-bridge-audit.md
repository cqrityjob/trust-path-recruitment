# Canonical profession bridge audit (PR-A)

Scope: the bridges between the legacy TS profession slugs (Career Center /
Career Intelligence Engine v1) and the CIG canonical catalogue
(`cig_professions.slug`). Identity-integrity work only: no scoring, ranking,
taxonomy, market, Passport, Interview or Assessment Platform change.

Principle: **one profession maps to one semantically correct canonical CIG
profession, or to no enrichment at all.** No enrichment is better than wrong
enrichment.

## Bridge layers found

| Layer | Where | Direction | Consumers |
| --- | --- | --- | --- |
| Enrichment bridge | `src/lib/career-intelligence-engine/slug-map.ts` | legacy → CIG (`toCigSlug`), CIG → legacy (`toLegacySlug`) | `compute.functions.ts::loadEnrichmentForSlugs` (My Career report save, employer assessment assignment completion, `computeCareerIntelligenceMatches`); `target-vector.ts` (Match.cigSlug on the envelope); `job-intelligence/personal-relevance.ts` (job `profession_slug` → scoring slug → relevance band, competencies, next roles, Career Center link) |
| Ranking identity (new, frozen) | `src/lib/career-intelligence-engine/ranking-identity.ts` | legacy → dedup key | `index.ts` ranked-list dedup only. Not a CIG bridge; see below |
| Career Discovery bridge | `cd_professions.cig_profession_slug` (migrations `20260814180000`, `20261006090000`) | CD profession → CIG | v3.1 snapshot, profession detail, Career Journey (`.eq("cig_profession_slug", slug)` reverse lookup), canonical result, Career Card |
| Canonical professional profile | `security_career_profiles.current_profession_slug` → mirror `sp_passport_profiles.cig_profession_slug` | identity | Passport, CV, Career Journey — CIG slugs directly, no legacy slug involved |
| Family aliases | `src/lib/legacy/family-aliases.ts` | legacy/DB family → canonical family | frozen; family level only, no profession mapping |
| Career Center catalogue | `src/lib/career-center/professions/*` | none | independent of CIG; supplies titles, competencies, next roles |

The Career Center itself has no CIG bridge. The only profession-level
legacy↔CIG bridge is `slug-map.ts`, and it is used in both directions.

## Inventory

Source titles are the Career Center catalogue titles; CD = Career Discovery
`cd_professions` row bridged to the same CIG node, with its
`approved_for_ranking` state.

| Source id | Source title (sv / en) | Before PR-A | After PR-A | Canonical key | CD row | Forward use | Reverse use | Confidence | Classification |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| security-officer | Väktare / Security Officer | vaktare | vaktare | se.security.vaktare | SP001 (approved) | enrichment | jobs `vaktare` | high | EXACT |
| ordningsvakt | Ordningsvakt / Public Order Officer | ordningsvakt | ordningsvakt | se.security.ordningsvakt | SP002 (approved) | enrichment | jobs | high | EXACT |
| skyddsvakt | Skyddsvakt / Protective Security Guard | skyddsvakt | skyddsvakt | se.security.skyddsvakt | SP003 (approved) | enrichment | jobs | high | EXACT |
| security-manager | Säkerhetschef / Security Manager | sakerhetschef | sakerhetschef | se.security.sakerhetschef | SP007 (approved) | enrichment | jobs | high | EXACT |
| security-technician | Säkerhetstekniker / Security Systems Technician | sakerhetstekniker | sakerhetstekniker | se.security.sakerhetstekniker | SP014 (approved) | enrichment | jobs | high | EXACT |
| risk-manager | Risk Manager | risk-manager | risk-manager | se.security.riskmanager | SP011 (approved) | enrichment | jobs | high | EXACT |
| aml-specialist | AML-specialist / AML Specialist | aml-specialist | aml-specialist | se.security.aml-specialist | SP013 (approved) | enrichment | jobs | high | EXACT |
| soc-analyst | SOC-analytiker / SOC Analyst | soc-analytiker | soc-analytiker | se.security.soc-analytiker | SP008 (approved) | enrichment | jobs | high | EXACT |
| security-investigator | Säkerhetsutredare / Security or Corporate Investigator | sakerhetsutredare (shared) | sakerhetsutredare (sole) | se.security.sakerhetsutredare | SP010 (approved) | enrichment | jobs (was shadowed by intelligence-analyst) | high | EXACT |
| security-coordinator | Säkerhetssamordnare / Security Coordinator | sakerhetssamordnare (shared) | sakerhetssamordnare (sole) | se.security.sakerhetssamordnare | SP006 (approved) | enrichment | jobs (was shadowed by security-consultant) | high | EXACT |
| crisis-continuity-manager | Kris- och kontinuitetsansvarig / Crisis and Business Continuity Manager | krisberedskapssamordnare | krisberedskapssamordnare | se.security.krisberedskapssamordnare | SP012 (approved) | enrichment | jobs | medium | ACCEPTABLE_ALIAS |
| close-protection | Personskyddsväktare (livvakt) / Close Protection Officer | livvakt | livvakt | se.security.livvakt | SP004 → **personskyddsvakt** (approved) | enrichment | jobs `livvakt` | medium | ACCEPTABLE_ALIAS (disagreement reported) |
| data-center-security | Datacenter­säkerhetsspecialist / Data Center Security Specialist | **flygplatssakerhet** | — | (none) | — | enrichment | jobs `flygplatssakerhet` borrowed this profile | — | WRONG_PROXY → MISSING_CANONICAL_NODE |
| fraud-investigator | Bedrägeriutredare / Fraud Investigator | **civil-utredare** | — | (none) | — | enrichment | jobs `civil-utredare` borrowed this profile | — | WRONG_PROXY → MISSING_CANONICAL_NODE |
| intelligence-analyst | Underrättelseanalytiker / Intelligence Analyst | **sakerhetsutredare** | — | (none) | — | enrichment | jobs `sakerhetsutredare` resolved HERE (first entry wins) | — | COLLISION → MISSING_CANONICAL_NODE |
| security-consultant | Säkerhetskonsult / Security Consultant | **sakerhetssamordnare** | — | (none) | — | enrichment | jobs `sakerhetssamordnare` resolved HERE (first entry wins) | — | COLLISION → MISSING_CANONICAL_NODE |

Career Center professions that are not scored (police-officer,
military-security-specialist, correctional-officer, customs-officer) have
no bridge and are out of scope; CIG rows exist for two of them (`polis`,
`tulltjansteman`) and could be bridged in a later, separate change.

## Rationale for the four removals

- **data-center-security → flygplatssakerhet.** Airport security screening
  under EU 2015/1998 with its own certification. Different profession; its
  formal requirement, sources and title were shown on the data-centre
  profession. No CIG row for data-centre / critical-facility security.
- **fraud-investigator → civil-utredare.** A civilian investigator inside
  the Police Authority (regulated, disclaimer-bearing). `fraud-analyst` is
  an unpublished draft and an analyst, not an investigator;
  `forsakringsutredare` is insurance. No honest node.
- **intelligence-analyst → sakerhetsutredare.** That node is the Security
  Investigator, already the exact node of `security-investigator`.
  `osint-analytiker` / `threat-intel-analytiker` are unpublished drafts and
  narrower; `polis-intel-analytiker` is a police role.
- **security-consultant → sakerhetssamordnare.** That node is the in-house
  Security Coordinator, already the exact node of `security-coordinator`.
  External advisory consulting has no CIG row.

## Rationale for the two aliases kept

- **crisis-continuity-manager → krisberedskapssamordnare.** The CIG summary
  is "samordnar planering och övning för kris och kontinuitet": the same
  crisis-and-continuity function at coordinator rather than manager level.
  Unregulated; the facts it carries are level-agnostic. Career Discovery
  bridges its Crisis Preparedness Coordinator row to the same node.
- **close-protection → livvakt.** The CIG catalogue's own alias table
  declares `livvakt (auktoriserad)` an alias of `personskyddsvakt`, and both
  CIG rows carry the same `livvakt-godkannande` formal requirement, so no
  foreign fact is displayed. **Disagreement:** Career Discovery bridges its
  Close Protection Officer row (SP004) to `personskyddsvakt`, and the Career
  Center's own text describes the authorised-guarding-company role that
  `personskyddsvakt` names. Per the PR rule (do not consolidate disagreeing
  mechanisms inside the repair), the mapping is preserved and the
  consolidation to `personskyddsvakt` is proposed for Product Owner review.

## The ranking coupling, and why identity was frozen

The engine deduplicated its ranked list on `cigSlug || legacySlug`. That
made the two collisions above ranking-visible: the lower-scoring profession
of each pair was dropped, and the family aggregates were computed without
it. Repairing the bridge alone would have un-collapsed the pairs and changed
the family ranking for every test persona (for example the strategic-leader
persona's top family moved from security_leadership_governance to
public_safety_justice). That is a ranking change PR-A may not make.

So the dedup key was moved to `ranking-identity.ts`, frozen at exactly the
pre-repair equivalence classes, and the guard replays the pre-repair engine
(old map, old rule) against the current one for 121 answer sets × topN 1..5:
605 ranked outputs, byte-identical. The consequence is stated plainly: the
Career Intelligence Engine's ranked list still merges intelligence-analyst
with security-investigator and security-consultant with
security-coordinator. Un-merging them is a ranking change for a separate,
Product-Owner-approved PR (delete the two groups, re-baseline `cie:check`).

## What changes for a candidate

- A profession without a canonical node keeps its title (from the Career
  Center guide, never the raw id), its scores, its place in the ranking, its
  Career Center link and its Career Discovery / Career Card / CV identity.
  Only the CIG facts are absent, and the result view says
  "Yrkesinformationen kompletteras." / "Profession information is being
  completed." on the hero and on each comparison card.
- A job posted as `flygplatssakerhet` or `civil-utredare` now gets
  family-level guidance instead of the data-centre / fraud profile's scores,
  competencies and guide link. A job posted as `sakerhetsutredare` is framed
  by the Security Investigator's scores (it used to be the Intelligence
  Analyst's); `sakerhetssamordnare` by the Security Coordinator's (it used
  to be the Security Consultant's).
- The employer assessment report names the profession by its guide title
  instead of the raw slug when enrichment is absent.

## Guard

`bun run career-profession-bridge:check` (CI: "Career profession bridge
check"). Sections A–G cover the bridge literal, published-CIG targets,
one-to-one, forbidden proxies in both directions and in every source file,
the forward enrichment contract, ranking immutability, the job relevance
contract, rendered UX in both languages, and Career Discovery's bridge and
`approved_for_ranking` set. Mutation proof: restoring
`data-center-security → flygplatssakerhet` fails 30+ assertions.

## Proposed future canonical nodes (not implemented)

- A data-centre / critical-facility security row (e.g.
  `datacentersakerhet`) for `data-center-security`.
- A corporate fraud investigator row (or publishing and widening
  `fraud-analyst`) for `fraud-investigator`.
- A generic intelligence analyst row (or publishing `osint-analytiker` /
  `threat-intel-analytiker` with a decision on which is meant) for
  `intelligence-analyst`.
- A security consultant row for `security-consultant`.
- Consolidation: `close-protection` to `personskyddsvakt` to agree with
  Career Discovery.
