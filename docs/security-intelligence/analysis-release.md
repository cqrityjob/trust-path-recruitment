# Security Work: analysis contract and dependent application

Baseline: `e54bfe9abade78cbb148940a9b6951e7aba0a399` (fresh main after PR #288).
The next migration is `20261211090000_security_work_analysis_contract.sql`.
It was created with the Supabase CLI and renamed to the next canonical ledger
slot because the existing ledger runs ahead of the wall clock.

## Release order

1. Review and merge the **schema-only** PR. It contains no dependent runtime.
2. Have the official integration apply the migration to owner project
   `wrygicdfxwjnrugduxnt`. Verify its ledger entry, exact definitions, grants,
   RLS, constraints, triggers and the private `sw-documents` bucket read-only.
3. Record that evidence in `supabase/release-state.json`. Until then the state
   is **pending**, and the application merge gate must fail.
4. Review the prepared dependent application and its browser evidence. Only
   after schema parity is proven may that PR become merge-eligible.
5. Configure the owner-operated document processor and, separately, approved
   AI processing. Neither is activated by a migration, API key or this PR.

No production migration, deployment, provider call or publication was performed.
The rollback refuses adopted records and unrelated dependencies. It is for an
unused contract; it is not a way to discard customer analyses or originals.

## Contract

- Immutable method and report-template versions, separately from customer data.
- Existing assessments, risks, controls, actions and reports are reused. Legacy
  eight-section approval rules remain; RSA and monitoring use separate templates.
- An assessment pins its purpose, scope, horizon and corrected context snapshot.
  Reviewed source references and follow-up answers are versioned separately.
- Unknown proposed RSA/monitoring ratings remain NULL. Rated RSA proposals require
  all five likelihood and consequence definitions, horizon and risk acceptance.
- Private PDF/DOCX reservations, immutable extraction segments and page/section
  provenance. Clients cannot create server-labelled extraction results.
- Exact report preview hash plus approval transaction freezes the report,
  assessment, inputs, questions, risks, controls, actions, citations, sources,
  method and template. Subsequent action follow-up cannot rewrite that bundle.
- Revisions create new draft records with explicit predecessor/version lineage.
  Export rechecks current membership and records an immutable receipt for the
  exact approved bundle.
- Workspace-scoped, independently approved AI activation is absent by default.
  Signed completion is separate from human review, application and approval.
  Requests reserve budget before a single dispatch. Identical input cannot be
  redispatched by inventing another request UUID. Applying a result is atomic
  and idempotent, creates drafts only, and requires unchanged reviewed inputs.
  Dispatch and application compare the complete accepted source set, including
  each review version, under the same assessment lock as source-review writes.

Stale-input and version conflicts raise `PT409`, returning HTTP 409 without a
transaction retry. `40001` is reserved for actual database serialization failures:
explicitly raising it for a business conflict can cause indefinite PostgREST 14
retries. See the [official Supabase troubleshooting note](https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b).

The worker signing key is kept in the private database schema and server
environment, provisioned out of band. No general service-role bypass is added.
An uncertain provider outcome retains its reservation and requires operator
reconciliation; the product never claims exactly-once external billing.

## Method decision, 24 September 2026

The owner approved the following exact 25 cells after visual inspection of
method 4b and comparison with 4d. Rows are likelihood; columns consequence.

| S / K | 1 | 2 | 3 | 4 | 5 |
| --- | --- | --- | --- | --- | --- |
| 5 | green | yellow | red | red | red |
| 4 | green | yellow | orange | red | red |
| 3 | green | yellow | yellow | orange | orange |
| 2 | green | green | yellow | yellow | yellow |
| 1 | green | green | green | green | green |

S4/K3 and S3/K4 are both orange. S5/K3 is red while S3/K5 is orange: a product
of the two numbers is insufficient. Approval covers the colours only. Scale
definitions, horizon and the organisation's risk acceptance are not invented.
Private reference reports and their contents are not repository fixtures.

## Local database verification

Full-history replay and the existing database harness passed. Focused final
verification: **69 new contract assertions, 322 foundation assertions**, plus
five two-session analysis races covering both approval/child-edit orders,
competing dispatches and both source-review/AI-dispatch orders. Rollback/reapply,
adoption refusal, planted dependency refusal and SQL privilege checks passed.
The full harness passed before the final locator hardening. The final source-set
and conflict-code changes were checked with all 69 + 322 domain assertions,
the five analysis races and rollback/reapply. Restoring each old source-set
function independently made its new regression fail by unexpected success.

The direct role tests cover foreign/inactive workspaces, viewers/editors,
approval authority, immutable records, forged signatures/extraction locators,
same-input retry deduplication, AI activation/revocation, unknown ratings,
stale approval bundles and repeated AI application. Generated types came from
official PostgREST type introspection of the isolated database; unrelated type
blocks were preserved byte-for-byte.

At the read-only hosted baseline, 312 migrations were present through
`20261210090000`; all 16 existing Security Work tables had RLS. The security
advisor returned no Security Work finding. Unrelated existing findings include
one security-definer view, public extension placement and disabled leaked-password
protection; this delivery does not claim to remediate them.

## Runtime and visibility

The baseline main menu had six destinations, with Security Work available only
in the account switcher. This is a verified navigation gap. The new owner decision
adds it directly after Security Passport on desktop and mobile.

An exact published frontend commit could not be established: a bounded direct
request to the public Lovable URL timed out during DNS resolution, and the web
reader could not access it. Therefore deployment is **unverified**, not assumed
current. A local preview is evidence of the prepared application only.

The existing application targets Cloudflare. CPU-isolated document parsing runs
in a separately configured owner-operated Node service, through a pinned HTTPS
endpoint with bounded authenticated requests. The runtime target was not changed.
See [processing activation](processing-activation.md) for precise configuration,
provider approval, artifact build and deployment prerequisites. No external
source fetching or scheduled monitoring is activated.
