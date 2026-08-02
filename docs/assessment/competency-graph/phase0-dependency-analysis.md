# Phase 0 — dependency analysis: `scp_bundles` and `scp_role_weight_profiles`

**Read-only. Nothing was retired, altered or dropped.** This report is the prerequisite
the plan requires before any retirement decision is taken in a later phase.

## Question

The Academy plan lists four tables as candidates for retirement because they do not fit
the Security Competence Academy: `scp_bundles`, `scp_bundle_versions`,
`scp_role_weight_profiles`, `scp_role_weight_profile_weights`. Can they be retired, and
can they be retired independently?

## Findings

### They form one closed cluster

```
scp_bundles ──(RESTRICT)── scp_bundle_versions ──(RESTRICT)── scp_role_weight_profiles
                                                                      │
                                                                 (CASCADE)
                                                                      │
                                                    scp_role_weight_profile_weights
```

| Table | Inbound FKs | From |
|---|---|---|
| `scp_bundles` | 2 | `scp_bundle_versions.bundle_id` (RESTRICT) — both the original and the Cloud re-issue |
| `scp_bundle_versions` | 0 | — |
| `scp_role_weight_profiles` | 4 | `scp_role_weight_profile_weights` (CASCADE), `scp_bundle_versions.role_weight_profile_id` (RESTRICT) |
| `scp_role_weight_profile_weights` | 0 | — |

**Nothing outside the cluster references it.** `scp_assessment_versions`,
`scp_scoring_versions`, `scp_items`, `scp_forms` and the Career Discovery `cd_*` tables
carry no FK into these four.

### One function reads the cluster

`scp_guard_published_immutable()` has a branch for
`TG_TABLE_NAME = 'scp_role_weight_profile_weights'` which reads
`scp_role_weight_profiles` to resolve the parent's published state
(`20260727120000_…:829`). That branch is dead if the cluster is retired, but it is a
`TG_TABLE_NAME` dispatch, so it costs nothing to leave in place.

### No product code depends on them

The only `src/` references are in `src/integrations/supabase/types.ts`, which is
generated. There is no server function, route, component or query touching any of the
four.

### Test coverage exists and must be preserved

`supabase/tests/scp_a1_domain_model_test.sql` exercises the cluster in **GROUP 4 —
bundle composition** (`scp_guard_bundle_composition()`). Retiring the tables would
require retiring or rewriting that group, which is a deliberate test change, not a
side effect.

## Conclusion

1. **The cluster is retirable — but only as a unit.** Retiring `scp_role_weight_profiles`
   alone would break `scp_bundle_versions`' RESTRICT FK. The order must be weights →
   role_weight_profiles → bundle_versions → bundles, or all four in one transaction.
2. **No data-loss risk today**: the four tables hold no seeded rows and no product code
   path reaches them.
3. **Retirement is not required for the Academy.** They are inert. They cost nothing to
   leave in place, and leaving them avoids a test rewrite and a change to a shared
   immutability guard.

## Recommendation

**Do not retire in Phase 0 or Phase 1.** Revisit only when a concrete need appears —
for example when `scp_bundle_versions` would otherwise be confused with
`scp_program_versions` during authoring. If retired later, do it by status
(`content_status = 'retired'`) across all four in one migration, never by `DROP`, and
update GROUP 4 of the domain-model suite in the same change.

This is the more conservative reading of the plan's own rule — *retire by status, never
by `DROP`, and only after dependency analysis* — and the analysis says the dependency is
real but self-contained, so there is no urgency.
