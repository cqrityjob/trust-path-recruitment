## UI/UX Polish Sprint — Scope & Approach

A pure presentation pass. No new features, no routing, no DB, no API, no auth changes. All work happens in components, styles, and static copy for empty/loading/badge states.

### Strategy

Rather than touch every route (100+ files), invest in the **shared primitives** that render everywhere. Improving these lifts the entire product at once and keeps the diff reviewable and safe.

### Workstreams

**1. Design tokens & base styles** (`src/styles.css`)
- Refine shadow scale (softer, layered — LinkedIn/Stripe feel).
- Tighten border radii and surface tokens.
- Add subtle motion tokens (transition durations, easings).
- Verify contrast on `muted-foreground`, `border`, `accent` in light + dark.

**2. Core primitives** (`src/components/ui/*` — shadcn wrappers)
- `button.tsx`: hover elevation, focus ring, active/disabled/loading states.
- `card.tsx`: softer shadow, subtle border, consistent padding scale.
- `input.tsx`, `textarea.tsx`, `select.tsx`, `label.tsx`: heights, focus ring, helper/error text spacing.
- `badge.tsx`: semantic variants (pending / approved / rejected / draft / published / archived / pilot / completed / in-progress) — tone-based (soft bg + strong text), not saturated.
- `table.tsx`: header weight, row hover, zebra option, responsive wrapper.
- `skeleton.tsx`: consistent shimmer for use in loading states.

**3. Site chrome**
- `SiteHeader`, `SiteFooter`, `Container`, `Section`: spacing rhythm, alignment, mobile touch targets.
- `AdminShellChrome`, `EmployerAppShell` sidebars: spacing, active state, hover, icon alignment, section grouping.

**4. Dashboards (visual only)**
- `_authenticated.my-career.tsx` (Candidate) — hierarchy, card polish, timestamps where data already exists.
- `_authenticated.employer.$employerSlug.index.tsx` (Employer) — already recently redesigned; align to new tokens, polish stat cards + quick actions.
- `_authenticated.admin.index.tsx` (Admin) — same treatment.

**5. Reusable state components**
- `EmptyState` component (create in `src/components/ui/empty-state.tsx`): icon + title + description + optional CTA. Adopt in the top empty screens (admin lists, employer lists, my-career).
- Skeleton patterns for the main list/detail pages (reuse existing `Skeleton`).

**6. Status badges**
- Small `StatusBadge` helper mapping our existing enum labels (from `enum-labels.ts`) to badge tones. Adopt in admin + employer tables — no data changes.

**7. Timestamps**
- Small `RelativeTime` component that renders "Updated 2 min ago" from existing `updated_at`/`completed_at`/`created_at` fields already fetched. No new queries.

**8. Mobile & a11y sweep**
- Header rows: grid + `min-w-0` + `shrink-0` pattern where clipping exists.
- `aria-label` on icon-only buttons.
- Focus-visible rings via tokens.

### Out of scope

- New pages, new data, new endpoints.
- Route restructuring.
- Copy rewrites beyond empty-state guidance and badge labels.
- Full per-route audit of every page (would be weeks). Improvements flow through shared primitives; a few high-traffic pages get direct polish.

### Verification

- `tsgo --noEmit` clean.
- Manual visual pass on `/`, `/jobs`, `/my-career`, `/employer/$slug`, `/admin`.
- Existing regression scripts (`cie:check`, `kg:check`, `question-library`) — unchanged, should still PASS since no logic touched.

### Deliverable

Final report at `docs/ui-polish-sprint-report.md` covering: what changed, why each change improves trust, screens affected.

---

**Estimated diff:** ~15–25 files, mostly `src/components/ui/*`, `src/styles.css`, shells, and 3 dashboards. No migrations, no server functions, no routes.

Approve and I'll execute in a single pass.