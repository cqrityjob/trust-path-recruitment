# Trust boundary and scoring visibility

Two deliberate security decisions taken in response to review findings LOW-2 and LOW-4, with the reasoning and the tests that hold them.

---

## LOW-2 — Table-owner RLS bypass: **Decision B**

### The question

Every `scp_` table has RLS enabled but not `FORCE ROW LEVEL SECURITY`. In PostgreSQL that means the **table owner** bypasses RLS. Separately, `service_role` carries `BYPASSRLS`, which `FORCE` would not affect either way.

### Impact assessment

| Path | Runs as | Needs owner bypass? | Why |
|---|---|---|---|
| Migrations | table owner (`postgres`) | **Yes** | A1 seeds 12 constructs, 48 facets, 3 families, 3 professions. Authoring policies require `scp_can_author(auth.uid())`, and `auth.uid()` is NULL in a migration — with FORCE RLS every seed would fail. |
| Trusted service functions | `SECURITY DEFINER`, owner rights | **Yes** | `scp_bundle_version_assignability()` must read the item bank on behalf of a caller who cannot. |
| Rollback | owner | **Yes** | `DROP`/`ALTER` are DDL; RLS is irrelevant, but the accompanying `UPDATE`s to legacy rows are not. |
| Maintenance / operational jobs | owner or `service_role` | **Yes** | Retention sweeps and future scoring runs are backend identities with no JWT. |
| Tests | owner | **Yes** | The suite constructs fixtures directly, then drops to `authenticated` to assert what an end user sees. |
| Candidate / employer / author | `authenticated` | **No** | Subject to RLS in the normal way. |

Enabling FORCE RLS would therefore break migrations, seeds and the assignability function, and would have to be worked around with owner-exempting policies — which reintroduces the same bypass through a longer route while making the policy set harder to reason about. **It would reduce clarity without reducing the attack surface.**

### Decision

**B — retain standard Supabase RLS behaviour, and make every load-bearing protection a trigger or constraint rather than RLS.**

The trust boundary is explicit:

- **`postgres` (owner) and `service_role` are trusted infrastructure identities.** They are not reachable by a candidate or an employer. Anyone holding them can already do anything RLS could stop.
- **RLS is responsible for exactly one thing: visibility scoping for `authenticated` end users** — keeping the item bank, per-option scoring keys and internal scoring configuration away from candidate and employer accounts.
- **Every integrity guarantee is a trigger or constraint**, so it holds for the owner and for `service_role` too.

### What holds against a BYPASSRLS caller

| Protection | Mechanism | Owner-proof |
|---|---|---|
| Published content immutable | `scp_guard_published_immutable` (trigger) | ✅ |
| Child rows of published content immutable | `scp_guard_child_of_published` (trigger) | ✅ |
| Publication starts as draft | `scp_guard_version_starts_as_draft` (trigger) | ✅ |
| Career Guidance separation | `scp_guard_family_product_separation` (trigger) | ✅ |
| Family / definition identity permanent | identity triggers | ✅ |
| Bundle composition valid | `scp_guard_bundle_composition` (trigger) | ✅ |
| Legal review before publication | `scp_guard_legal_review_before_publish` (trigger) | ✅ |
| Legacy retirement (insert + reactivation) | two triggers on `assessment_assignments` | ✅ |
| Scoring weights sum to 1, scores 0–3, valid statuses | CHECK constraints | ✅ |
| Item bank / scoring key visibility | RLS | ❌ — by design; owner and service_role are trusted |

**Tested, not asserted.** Group 19 sets `ROLE service_role` — a genuine `BYPASSRLS` identity — and confirms immutability, the publication workflow, Career Guidance separation and CHECK constraints all still refuse. If any load-bearing protection were ever moved from a trigger into a policy, that group fails.

### Revisit trigger

If a Security Competency table is ever written by an identity that is **not** trusted infrastructure and **not** an `authenticated` end user, this decision must be revisited before that path ships.

---

## LOW-4 — Scoring-weight visibility: **restrict, and expose lineage separately**

### The finding

`scp_scoring_versions` and `scp_role_weight_profile_weights` carried `USING (true)` read policies, so any authenticated account — candidate or employer — could read the live scoring configuration: component weights, per-competency role weights, and the norm-comparison switch.

Per-option scoring keys were **never** exposed (`scp_item_options` has been authoring-only since A1), so this was never an exploitable answer key. It was still internal scoring configuration reaching accounts with no need for it.

### Decision

Restrict. The owner's stated default is that *"ordinary authenticated access must not automatically expose internal scoring configuration unless the product explicitly requires it"* — and nothing in the candidate or employer product requires a weight.

What a report genuinely requires is **lineage**: which scoring version produced this result, and how much evidence backs it (spec 9.3 `assessment_lineage`, acceptance criterion 18). That is met by a minimal read model.

| Object | Before | After (A4) |
|---|---|---|
| `scp_scoring_versions` | any authenticated | authoring roles + platform admin |
| `scp_role_weight_profile_weights` | any authenticated | authoring roles + platform admin |
| `scp_role_weight_profiles` (header) | any authenticated | unchanged — a report may name the profile and its validation status |
| `scp_item_options` (per-option keys) | authoring only | unchanged |
| `scp_scoring_version_lineage` (new view) | — | any authenticated; **no weights, no content hash** |

The read model is a view rather than a wider grant so the safe columns are enumerated once in the schema. Adding a column to the base table does not silently widen what a report can see.

`core_summary_is_indicative` and `norm_comparison_permitted` **are** in the view. They are constraints *on* the report layer — "you may not show the summary index alone", "you may not show percentiles" — so the report must be able to read them to obey them.

### Permission matrix (all asserted in group 20)

| Principal | scoring versions | role weights | per-option keys | lineage view |
|---|---|---|---|---|
| Candidate | ✗ 0 rows | ✗ 0 rows | ✗ 0 rows | ✓ |
| Employer | ✗ 0 rows | ✗ 0 rows | ✗ 0 rows | ✓ |
| Author / reviewer / publisher | ✓ | ✓ | ✓ | ✓ |
| Platform admin | ✓ | ✓ | ✓ | ✓ |
| `anon` | ✗ no grant | ✗ no grant | ✗ no grant | ✗ no grant |

A further assertion fails the build if `sjt_weight`, `biq_weight` or `content_hash` ever appear in the view.

### Residual exposure, stated plainly

The 70/30 split is published in the specification document itself and in `docs/assessment/scoring/scoring-engine-v1.md`. This decision is not an attempt to keep it secret — it is about not shipping internal scoring configuration to every authenticated session by default. The exploitable material, per-option keys and rationales, was never reachable and still is not.
