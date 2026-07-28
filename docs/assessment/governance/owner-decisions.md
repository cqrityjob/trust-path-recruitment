# Owner decisions — Security Competency Platform

Product decisions recorded so engineering does not need to stop for them. Implemented in `20260727130000_scp_a2_scoring_versions_and_publication_gates.sql`, hardened by `20260727140000_scp_a3_close_high_findings.sql` after independent review.

**Decided:** 2026-07-27 · **Owner:** Mostafa Alshawi

---

## A. Twelve constructs and the 70/30 weighting

**Approved as the provisional design baseline.** The twelve SCC constructs and the 70% SJT / 30% behaviour-frequency split may be implemented now for staging and pilot preparation.

Conditions: not psychometrically validated · must be versioned · must be configurable through an approved scoring version · **must not be hard-coded across unrelated layers** · reports must show the true validation status · may change after pilot evidence and specialist review.

**Implemented as.** `scp_scoring_versions` holds the weights as versioned data with its own `validation_status` (seeded `design`), a CHECK that the components sum to 1, and the immutability trigger — so the model changes by publishing a new version, never by editing a row, and no historical score moves when it does. `scp_bundle_versions.scoring_version_id` is a foreign key; the previous free-text `scoring_version` label was dropped (the table was created in this same unmerged PR and has never held a row, and the migration aborts rather than proceed if that is ever untrue).

There is deliberately **no** `SCORING_START_WEIGHTS` constant in the TypeScript layer. `security-competency-separation:check` fails CI if a `0.7`/`0.3` pair appears anywhere under `src/lib/security-competency/` — two layers holding their own copy of the model is exactly the failure this condition exists to prevent.

Also stored as data rather than convention: `core_summary_is_indicative` (spec 8.1 — the summary index may never be shown without the competency profile) and `norm_comparison_permitted` (spec 8.3 — false until approved norm data exists).

## B. DPIA before real recruitment use

**Required** before the product is used for real recruitment decisions or operational candidate selection. **Not** a blocker for architecture, development, synthetic testing, staging, internal demonstrations or controlled content review.

Condition: the system must support a non-operational status that prevents unapproved assessments from being assigned to real candidates.

**Implemented as.** `scp_bundle_version_assignability(uuid)` returns `blocked` / `pilot_only` / `assignable` plus a stable machine-readable reason. PR-C's assignment path must call it and refuse on anything but `assignable` (or `pilot_only` for a consenting pilot participant).

It **fails closed**, and since A3 it does so by *proving the positive conditions* rather than only looking for known-bad rows. It refuses on: unpublished or retired bundle · unpublished core or module version · missing or unpublished scoring version · **an empty core form** · **an empty module form** · any draft item anywhere in either form · any legally dependent item without approved review · **no language completely adapted across every item of both forms** · `validation_status = design` · unknown IDs. `pilot` returns `pilot_only` — assignable to consenting pilot participants, never a selection decision.

The two bolded emphases correct review finding HIGH-2: the original formulation used `count(...) > 0` tests, which pass vacuously at zero, so a bundle with no items at all — or items with no candidate-readable text — was reported `assignable` at `operational-selection`.

Requiring *one complete language* also fixes the opposite error: the previous "no unapproved adaptation anywhere" rule would have blocked a fully-ready Swedish bundle merely because an English adaptation had been started.

Returning a reason rather than a boolean is deliberate: PR-B's admin UI can show exactly what is still missing, and PR-C can give the employer an accurate refusal.

## C. Swedish legal review

Ordningsvakt and Skyddsvakt content **may be drafted and technically implemented**. Any item relying on Swedish legislation, official authority, legal power, legal obligation or regulated terminology must remain pending review and **must not be published or assigned** until legal and professional review is recorded. Behavioural judgement items making no legal claim proceed through normal content review.

**Implemented as.** A trigger on `scp_item_versions` blocks the transition into `approved` or `published` when `legal_basis_required = true` unless `legal_review_status = 'approved'` **and** `legal_source`, `legal_reviewed_by` and `legal_reviewed_at` are all recorded — a status flag alone is not evidence of a review. Drafting and reviewing such content is untouched, exactly as the decision permits.

Enforced twice, on purpose: at publication, and again at assignment (`LEGAL_REVIEW_PENDING` in the assignability gate). A second, independent check on the path that actually reaches a candidate is worth the redundancy.

A related gap closed at the same time: an item version can no longer be *created* directly in a published state.

**Corrected in A3 (review finding HIGH-1).** That guard was originally attached to `scp_item_versions` only, so assessment versions, bundle versions, scoring versions and role weight profiles could still be INSERTed straight into `published` — and, because the immutability trigger only fires on UPDATE from a non-draft status, such a row was then permanently frozen. The guard is now shared by all six versioned tables. Publication is a reviewed transition on every one of them, never an initial value.

## D. Separate profession item banks

Väktare, Ordningsvakt and Skyddsvakt keep **separate profession-module identities and separate item-bank lineage**. They may share the Core, item formats, competency definitions, authoring components, report components and approved reusable behavioural primitives. They must not be treated as the same role under different display names.

Identical questions must **not** be duplicated merely to satisfy a structural rule. Genuine reuse must be modelled explicitly and versioned safely, with each profession bundle retaining independent lineage.

**Implemented as.** `scp_item_version_professions` declares that an item version is approved as evidence for a given profession, each declaration carrying its own `job_analysis_reference` and SME review status. Zero rows means a Core item (role- and country-neutral). More than one row means deliberate, reviewed reuse.

Form membership already made reuse physically possible; it did not make it a *decision* — an item could end up serving two roles because someone added it to two forms. This turns that into a reviewed, auditable declaration. The declarations freeze with the item version, so a published item's profession scope cannot be widened silently; widening requires a new version.

Each bundle still pins its own forms and versions, so the three roles evolve independently.

---

## Standing constraints (unchanged)

Explicit owner approval is still required to: delete or mutate historical assessment data · change frozen Career Guidance content or scoring · weaken RLS or privacy boundaries · expose raw candidate responses to employers · introduce automatic ranking, approval or rejection · introduce pass/fail or suitability classification · add a paid third-party service · deploy to production · run destructive migrations · materially change the twelve Core constructs or the product hierarchy · publish legally dependent content without review · process real candidate data outside the approved environment.
