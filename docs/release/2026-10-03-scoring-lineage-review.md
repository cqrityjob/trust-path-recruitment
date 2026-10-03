# `scp_scoring_version_lineage`: independent re-review recorded (2026-10-03)

**Status: accepted according to the documented design decision. No new confirmed launch blocker.**

*Sammanfattning (sv):* Astras oberoende granskning av vyn `scp_scoring_version_lineage` är registrerad med status
**accepterad enligt det dokumenterade designbeslutet** (`docs/release/production-readiness/supabase-production-hardening.md`
avsnitt 3, ägarbeslut 2026-10-01). Inget nytt bekräftat lanseringshinder. Vyn är **inte ändrad** för att tysta
rådgivarens varning. Två saker gäller uttryckligen och ska inte läsas bort:

1. **Utkastmetadata är läsbara för alla inloggade.** Vyn har ingen radfilter: en inloggad person utan roll och utan
   medlemskap läser metadataraden för en scoringversion i status `draft`, även om basttabellen ger henne noll rader.
2. **Faktisk rapportanvändning har inte verifierats.** Ingen funktion, vy eller källkod i `src/` läser vyn i dag;
   vilka rapporter som avses använda den (kandidat- och arbetsgivarrapporter) har inte visats i drift.

## What is registered, and by whom

| | |
|---|---|
| Object | `public.scp_scoring_version_lineage` (view), advisor lint `security_definer_view`, level ERROR |
| Request | owner request relayed in the comment on [#406](https://github.com/cqrityjob/trust-path-recruitment/pull/406#issuecomment-5973245377): independent re-review of the live state, no view or policy change just to silence the advisor |
| Reviewer | Astra, in the independent launch-review chat "Granska CQrityjob inför lansering" |
| Result | **Accepted according to the documented design decision; no new confirmed launch blocker.** Reported to the author of this record by the owner on 2026-10-03 |
| Decision it rests on | `supabase-production-hardening.md` section 3 (owner decision 2026-10-01) and migrations `20260727150000` and `20260801100000` |
| Not in this record | Astra's own review text and raw test output. They were not available to the author, are not reproduced here, and are not claimed. They should be committed next to this record (directory below) so they are not left only in a temporary folder |

The registered status is a relay of that result. What the author of this record verified separately is listed
next, and is labelled as such. It supports the status; it does not replace Astra's review.

## What the two explicit statements rest on

**Draft metadata are readable by every signed-in user.** The view definition has no `WHERE` clause and runs with
the owner's rights (`security_invoker=false`, `security_barrier=true`), so it returns every row of
`scp_scoring_versions`, whatever its `content_status`. Production today holds one row, `draft` / `design`. Read as a
synthetic signed-in user with no role and no membership (rolled-back probe), the view returned that row and the base
table returned none. `anon` is refused (`permission denied`). What is readable is exactly nine metadata columns:
`id`, `slug`, `version_number`, `content_status`, `validation_status`, `published_at`, `retired_at`,
`core_summary_is_indicative`, `norm_comparison_permitted`. No scoring weight, no content hash, no person or tenant
column. This is the design in section 3 of the hardening document, which lists the same nine columns; it is
recorded here so nobody reads "accepted" as "drafts are hidden".

**Actual report usage has not been verified.** No function body and no dependent view in production mentions the
view, and `src/` references it only in the generated `types.ts`. The intended consumers (candidate and employer
reports stating lineage and validation status) are documented intent, not something observed in this review. The
documented reason for keeping definer rights (invoker rights made lineage unreadable for both audiences in the
outage after `20260731053218`) is likewise historical and was not re-demonstrated against a live report.

## Author's own read-only verification (separate from Astra's review)

Production `wrygicdfxwjnrugduxnt`, ~20:45-20:51 UTC, read-only, no candidate data. Full output:
[`evidence/2026-10-03-scoring-lineage/production-readonly-probes.txt`](evidence/2026-10-03-scoring-lineage/production-readonly-probes.txt).

| Check | Result |
|---|---|
| Owner, kind, options | `postgres`, view, `security_invoker=false` + `security_barrier=true` |
| Definition | nine columns from `scp_scoring_versions`, no filter; `md5(pg_get_viewdef)` `091c83623382868635a1edfbeb2197c0`, equal to a strict local replay of main `1b4a4080` |
| Grants | `anon`: none. `authenticated`: `SELECT` only. `service_role`: `SELECT`, `TRUNCATE`, `REFERENCES`, `TRIGGER`; no `INSERT`/`UPDATE`/`DELETE` |
| Reachable rows | 1 (`draft`/`design`) via the view for a signed-in user with no role; 0 via the base table |
| Base table | RLS enabled, one policy `scp_can_author(auth.uid())`; `anon` has no `SELECT` |
| Dependants | no function, no view; only the generated type in `src/` |
| Advisors | `security_definer_view` ERROR on this view, unchanged; no new finding |

Observation, not changed: `service_role` holds `TRUNCATE`, `REFERENCES` and `TRIGGER` on the view, which the
hardening document does not list (it says `SELECT` to `authenticated` and `service_role`). It holds no write
privilege, a TRUNCATE on a view has no effect, and the role is server-only. Noted so the next reader is not surprised.

Local behaviour tests on a strict replay of main `1b4a4080` (367 migrations, zero failures), synthetic principals
only. Outputs: [`local-scp_a1_domain_model_test.out`](evidence/2026-10-03-scoring-lineage/local-scp_a1_domain_model_test.out),
[`local-cd_outstanding_reviews_operator_only_test.out`](evidence/2026-10-03-scoring-lineage/local-cd_outstanding_reviews_operator_only_test.out).

- `scp_a1_domain_model_test.sql` GROUP 20 and 20b pass: a candidate and an employer read lineage rows with real
  identity and validation status and read zero scoring versions, weights and option keys; the view exposes exactly
  the nine columns and no weight or hash; anon has no grant; the object is a view that runs with definer rights.
- `cd_outstanding_reviews_operator_only_test.sql` passes (16 assertions), including CDO4: the view is still
  deliberately definer.

## Decision

The view is **not** changed. No migration, grant, policy or code follows from this record, and none may be made only
to quiet the advisor: the guards named in section 3 of the hardening document
(`20260801100000` postflight, `scp_a1_domain_model_test.sql` groups 20/20b, CDO4,
`cd-outstanding-reviews:check` with `CDO-GUARD-LINEAGE-FLIPPED`, and the planted control
`CDO-NC-LINEAGE-FLIPPED`) stay in force.

Reopen only if a review finds a concrete, exploitable issue, or if the owner decides draft scoring-version metadata
must not be visible to every signed-in user (a change to the view's filter, then with its own migration and tests).

## What this record does not claim

- That Astra's own tests or logs were seen by the author of this record.
- That any report reads the view at runtime.
- That draft metadata are hidden from signed-in users (they are not).
- That the access fixes in #404 to #406 are applied, published or verified. They are separate releases with their
  own order (expand, application published and verified, contract) and are unaffected by this record.

## Linked from

- [#406](https://github.com/cqrityjob/trust-path-recruitment/pull/406) (comment pointing here).
- `docs/release/2026-10-03-release-order.md`, section 5.
- `docs/release/production-readiness/supabase-production-hardening.md`, section 3.
