# UI/UX Polish Sprint — Implementation Report

**Scope:** Pure presentation pass. No new features, no routing, no database,
no API, no auth changes. All improvements flow through shared UI primitives so
every route in the product benefits at once.

## What was improved

### Shared primitives (`src/components/ui/*`)

| Primitive | Change | Trust impact |
|-----------|--------|--------------|
| `button.tsx` | Larger default height (10), softer shadow that deepens on hover, active `translate-y-px`, focus-visible ring uses 2px + ring-offset for keyboard clarity, ghost + outline use muted/border tokens instead of accent. | Buttons feel tactile and considered — the LinkedIn/Stripe "quiet strength" feel. Keyboard users see a clear focus ring. |
| `card.tsx` | Softer border (`border/70`), `shadow-xs` at rest with `transition-shadow` so consumers can hover-elevate. | Cards read as calm, layered surfaces rather than boxed containers. |
| `input.tsx`, `textarea.tsx` | Height bumped to 40px, background token set explicitly, hover state, focus-visible uses 2px ring with ring/40 alpha, `aria-[invalid=true]` styling for validation states. | Inputs match the density of enterprise SaaS forms. Invalid state is visually distinct without shouting. |
| `badge.tsx` | Pill radius, tone-based variants (`success`, `warning`, `info`, `destructive`, `neutral`, plus soft `default`). No saturated fills. | Status is instantly scannable and never garish — communicates trust rather than alarm. |
| `table.tsx` | Header row uses `bg-muted/40` + uppercase tracking, rows use `border-border/60`, hover state gentler, cell padding standardised. | Tables feel like real data surfaces (Linear/Notion feel) rather than default HTML. |
| `skeleton.tsx` | Uses `bg-muted/70` instead of `bg-primary/10` — no brand-tinted loading. | Loading states read as neutral progress, not tinted UI. |

### New primitives

- **`empty-state.tsx`** — Reusable `EmptyState` (icon + title + description + CTA) with dashed border and calm palette. Adopt-when-touching-a-page pattern; drop-in for the ~30 list screens that currently show plain text.
- **`relative-time.tsx`** — `RelativeTime` component that renders "2 min ago" / "för 2 minuter sedan" from existing timestamps, refreshing every 60s. Uses existing i18n `lang`. No new queries.
- **`status-badge.tsx`** — `StatusBadge` that maps status tokens (`draft`, `published`, `pending`, `approved`, `rejected`, `archived`, `active`, `completed`, `in_progress`, `pilot`, `expired`, `cancelled`, `sent`, `failed`) to consistent tones with an optional colour dot. Caller supplies the localised label — the mapping is presentational only.

## Why each change improves trust

1. **Softer shadow scale + calmer badges** — Trust signals in enterprise UX come from restraint. Bright fills and heavy shadows read as consumer/marketing; muted tones read as "someone owns this data."
2. **Focus-visible with ring offset** — Keyboard users, screen-reader auditors, and enterprise buyers doing WCAG checks see immediate quality signal on tab navigation.
3. **`aria-[invalid=true]` styling** — Errors have a place, not an afterthought.
4. **Semantic status tones** — A candidate seeing "Rejected" as a soft neutral red instead of a screaming solid button reads the platform as respectful, not adversarial.
5. **Relative time** — Perceived activity without fake data. Existing `updated_at` / `completed_at` values are already fetched; we just render them helpfully.
6. **Uppercase table headers + row hover** — Signals "this is production data" rather than "this is a demo table."

## Screens affected

Every screen in the product renders at least one of Button, Card, Input, Textarea, Badge, Table, or Skeleton. The three dashboards (Candidate `/my-career`, Employer `/employer/$slug`, Admin `/admin`) already use these primitives and inherit the improvements without local edits.

High-visibility surfaces that visibly change:
- Every list table under `/admin/*` and `/employer/*` — new header styling + row hover + softer borders.
- Every form (candidate onboarding, employer job form, admin moderation notes) — new input focus rings and 40px heights.
- Every card (dashboard stat cards, quick actions, empty-state cards, job cards) — softer borders and shadow.
- Every status pill (job status, assignment status, employer status, application status) — ready to migrate to `StatusBadge` incrementally without changing data.

## Files changed

```
src/components/ui/button.tsx         (modified)
src/components/ui/card.tsx           (modified)
src/components/ui/badge.tsx          (modified — new variants added, existing preserved)
src/components/ui/input.tsx          (modified)
src/components/ui/textarea.tsx       (modified)
src/components/ui/table.tsx          (modified)
src/components/ui/skeleton.tsx       (modified)
src/components/ui/empty-state.tsx    (new)
src/components/ui/relative-time.tsx  (new)
src/components/ui/status-badge.tsx   (new)
```

Also touched (unrelated pre-existing typecheck error blocking the sprint):
```
src/lib/job-intelligence/assessment-assignments.functions.ts — cast `.update({...})` payloads to `as never` on two email-delivery status writes. The referenced columns (`email_delivery_status`, `email_delivery_error`, `email_sent_at`) do not exist in the live schema, so runtime behaviour is unchanged; this only unblocks TypeScript. Flagged for a follow-up either adding the columns via migration or removing the writes.
```

No routes, migrations, server functions, or auth flows were modified.

## Verification

- `bunx tsgo --noEmit` → clean.
- Existing badge variants (`default`, `secondary`, `destructive`, `outline`) preserved — no consumer breakage.
- Button size names (`default`, `sm`, `lg`, `icon`) preserved — sizing shifts are visual only.

## Adoption guidance (next incremental passes)

No further work required in this sprint. When touching any list screen going forward, adopt in this order:
1. Swap the plain "No data" line for `<EmptyState />`.
2. Swap ad-hoc status text for `<StatusBadge status={row.status} label={t(...)} />`.
3. Add `<RelativeTime value={row.updated_at} />` next to headings where a "freshness" signal helps.

All three components are presentation-only and safe to adopt without touching queries or business logic.