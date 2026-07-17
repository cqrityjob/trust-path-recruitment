# Epic 2 — P6 Hotfix: Raw canonical family IDs in explanations

## Root cause
`explainFamily()` in `src/lib/career-intelligence-engine/explanations.ts`
inlined `entry.familyKey` (a canonical internal ID) directly into the
Swedish and English `family_rationale` explanation. The rendering path
in `engine-view.tsx` already resolves family labels via
`getFamily(id).name`, but the engine's structured explanation surfaced
the raw ID, so any UI that renders `match.reason[*].text` printed
strings like `Yrkesfamiljen "crisis_management" ligger närmast …`.

## Fix
Resolve the family label inside `explainFamily()` via the shared
`getFamily()` resolver from `src/lib/career-center/profession-families.ts`
(the single canonical bilingual family registry — 14 canonical + 1
`exploring` entry path). Both language variants now use the resolved
`name.sv` / `name.en`, with the raw key retained only in the
non-user-facing `data.familyKey` payload.

Copy now matches the owner-approved text:
- SV: `Yrkesfamiljen "Krishantering" ligger närmast baserat på dina svar inom detta område.`
- EN: `The Career Family "Crisis Management & Emergency Response" is the closest match based on your answers in this area.`

## Files changed
- `src/lib/career-intelligence-engine/explanations.ts` — import
  `getFamily`, resolve `entry.familyKey` to bilingual labels, rewrite
  the SV/EN template.

## Consistency review — are the four family surfaces intentionally different?
Yes, all four originate from distinct, valid concepts and were not
broken by the Epic 2 migration:

| Surface | Source field | Concept |
| --- | --- | --- |
| Strongest profession | `Match.professionKey` / `enrichment.title{Sv,En}` | Highest-scoring profession target (Layer 2). |
| Profession family label under that role | `Match.family.key` → resolved via `getFamily()` | The profession's own canonical family (from `profession-profiles.ts`). |
| Top Career Family block ("Karriärfamilj") | `familyRanking[0].familyKey` → `familyLabel()` in `engine-view.tsx` | Layer 3 aggregate: family with highest weighted score across all targets. |
| Explanation context (`family_rationale.data.familyKey`) | Same `familyRanking[0].familyKey` (now rendered via label) | Bilingual rationale for the top family, not the strongest profession. |

The owner's observed case (Säkerhetssamordnare in
`security_leadership_governance`, top family `crisis_management`,
career-environment card labelled "Krishantering och räddning") is
therefore correct: the coordinator role is in the leadership family,
but the user's answer pattern aggregated most strongly to
crisis-management. The Epic 2 migration mapped both families to
canonical IDs correctly (verified in `epic-2-mapping.md`); no
mis-association exists. Only the rendering leaked the raw ID.

No copy change was required beyond fixing the leaked ID, because the
Career Family block already renders the resolved bilingual label and
its supporting copy explains "the profession family where your answers
align most strongly", distinct from a role's own family shown on each
match card.

## Audit — raw canonical IDs in user-facing surfaces
- `rg` across `src/` for the 14 canonical IDs, excluding data
  catalogues, admin routes, generated Supabase types and legacy
  alias/slug maps: **0 matches**.
- All 14 canonical IDs resolve to a SV label, an EN label and a
  kebab-case public slug (`getFamily()` + `getCareerAreaLabel()` +
  `professionFamilies` icon/slug registry). Verified via a scripted
  membership check for all 14 IDs — `ALL RESOLVE`.
- Rendered `family_rationale` text for all 11 CIE personas contains
  only resolved bilingual labels; regex scan for raw IDs returns 0
  hits.

## Regression
- `bun run scripts/cie-check.ts` → **PASS** on all 11 personas.
- Determinism, `inputsHash`, top-3 family expectations, regulated
  disclaimers, student potential > current fit, evidence monotonicity
  — all pass.
- Numeric scores and profession ordering unchanged versus the baseline
  captured at end of Epic 2 P6 (spot-checked persona G, H, I).

## P7 status
Deferred. This hotfix does not touch legacy family rows, mappings or
DB state; only the presentation-layer template inside the engine.

## No raw canonical ID in user-facing output
Confirmed by (a) source-tree regex audit, (b) rendered-text audit
across all 11 personas in SV and EN, (c) label-resolution audit for
all 14 canonical IDs.
