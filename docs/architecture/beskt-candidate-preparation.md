# BESKT PR 3 — candidate preparation: runtime and release decisions

**Status:** Runtime and pilot UI for candidate preparation. No hosted apply, no Lovable publish, no real data, no published method.

**Depends on:** PR #217 (`docs/architecture/beskt-recruitment-method-discovery.md`, the normative contract) and PR #218 (`docs/architecture/beskt-governed-content-schema.md`, the governed content spine). This note records the additive decisions PR 3 makes inside those contracts; it changes nothing in either.

**Migration:** `supabase/migrations/20261110090000_bcp_candidate_preparation.sql`
**Rollback:** `supabase/rollback/20261110090000_bcp_candidate_preparation_rollback.sql`
**Suite:** `supabase/tests/bcp_candidate_preparation_test.sql`
**Guard / controls:** `scripts/beskt-candidate-preparation-check.ts`, `scripts/negative-controls/beskt-candidate-preparation-controls.ts`
**Render proof:** `scripts/beskt-candidate-preparation-render-check.tsx`, `scripts/beskt-candidate-preparation-evidence.ts`
**Routed evidence:** `e2e/beskt-candidate-preparation.spec.ts`, `scripts/local-stack/`, `scripts/fixtures/beskt-candidate-preparation-fixture.sql` (see section 9)

## 1. Why the runtime is `bcp_` and not `beskt_`

PR #218's postflight asserts, over **every** `beskt_%` table, that no column names a candidate, applicant, application, job, case, session, assignment, response, answer value or report, and that no table outside the governance ledger carries a `jsonb` column. Both are correct invariants for the governed **content** domain: a method version is a template and must never reference a person.

Candidate preparation is the **runtime**, and every one of its tables has to name exactly those things. Rather than weaken PR #218's proof so the runtime could live under its prefix, PR 3 keeps it literally true and gives the runtime its own prefix — the same reasoning, and the same precedent, by which PR #218 chose `beskt_` over `scp_` when the Security Competency suite asserted that no `scp_` table carries FORCE RLS.

```text
beskt_*   governed method CONTENT   -- templates, no person
bcp_*     BESKT Candidate Preparation RUNTIME -- employer, application, candidate, answers
```

The runtime holds no content. It **pins** a published method version, its exposure profile and its content hash, and reads everything else through PR #218's own contracts.

## 2. The release boundary — an explicit decision, not a silent widening

PR #218 published under `release_scope = synthetic_internal_only` and gave **no** employer principal and **no** candidate any read path at all. PR 3 needs a candidate to read the items they are being asked. That is a real widening, so it is made once, explicitly, and nowhere else:

1. **`release_scope` is not touched.** `synthetic_internal_only` remains the only representable value; this migration does not alter that CHECK, and the postflight re-proves it.

2. **Assignability is a separate, per-employer, time-boxed, revocable pilot grant** (`bcp_pilot_grants`), minted only by a platform admin through a governed RPC — the shape the role-interview flow already uses (`scp_interview_pack_pilot_grants`). With no grant, **nothing is assignable, anywhere, production included**. Fail closed is the default state, not a configuration. Authority is the privilege, not a marker: no client role — `service_role` included — holds INSERT, UPDATE or DELETE on that table.

3. **The content read widens by exactly one branch.** `beskt_can_read_version` is re-created as

   ```text
   beskt_governance_can_read_version(v)      -- PR #218's body, verbatim
   OR bcp_party_can_read_method_version(v)
   ```

   A candidate, or an authorised member of the employer, reads a version **only** while they are party to a live (uncancelled) assignment that pins it, and only when that version is published, `recruitment_support`, and holds **no** security-vetting profile or item at all (`bcp_version_is_candidate_safe`, evaluated on the stored rows rather than inferred from the version's mode). Its only consequence is that `beskt_resolve_item_sequence` — PR #218's routing authority, reused unchanged — answers them.

4. **The full governed document does not widen.** `beskt_published_method` and `beskt_readable_published_versions` are re-created to gate on `beskt_governance_can_read_version`, so the new branch cannot reach the method's interviewer prompts, evidence anchors, routing graph or observation fields. A preparation party reads the candidate-facing projection and nothing else.

With no assignment in existence, every one of these is byte-for-byte the PR #218 behaviour — which is why PR #218's 442-assertion suite passes unchanged with PR 3 applied. The rollback restores all three re-created functions **verbatim**, and the guard proves the restore is byte-identical to PR #218's own text rather than a paraphrase of it.

## 3. The six tables

| Table                         | Holds                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bcp_pilot_grants`            | the whole of PR 3's release authority: employer → method version, grantor, documented source reference, validity window, revocation with reason. Append-only apart from a single revocation; written only by `bcp_grant_pilot` / `bcp_revoke_pilot`                                                                                                                                                                                     |
| `bcp_assignments`             | one preparation: employer, job, application and the application's **own** applicant; the pinned method version, exposure profile, content hash and release scope; a constrained forward-only lifecycle (`assigned → notice_acknowledged → in_progress → submitted`, or `cancelled`); availability, delivery, acknowledgement, submission and cancellation times; a compare-and-swap revision. `mode` admits `recruitment_support` alone |
| `bcp_notice_acknowledgements` | append-only proof that the candidate was shown, and confirmed reading, an exactly identified notice in a stated language. `acknowledgement_kind` admits `information_received` and nothing else                                                                                                                                                                                                                                         |
| `bcp_responses`               | a version of one candidate's preparation, with a generated `draft_slot` making at most one open draft per assignment a database invariant; frozen from submission with the SHA-256 of the exact answers and of the method content they were given against                                                                                                                                                                               |
| `bcp_answers`                 | typed answers against governed item keys. One value column per declared `answer_type`, enforced by CHECK; `response_state` is exactly `answered` / `omitted` / `discuss_orally`, and a neutral state is required to carry no value at all                                                                                                                                                                                               |
| `bcp_events`                  | the append-only lifecycle ledger, carrying the idempotency receipt for each operation id                                                                                                                                                                                                                                                                                                                                                |

No score, level, weight, threshold, total, rank, pass/fail, suitability, credibility, truthfulness, recommendation, risk or verdict column exists anywhere in the domain, and the postflight refuses the migration if one appears. `jsonb` exists only on the event ledger, so an ungoverned scoring object cannot be stored as an answer.

## 4. Neutrality as a structural property

`omitted` and `discuss_orally` are not annotations on an answer; they are states **instead of** one, and they carry no value by constraint. `bcp_routing_answers` — the map PR #218's resolver reads — is built only from answers whose state is `answered`, so a neutral state fires no rule, hides no item and opens no branch. PR 1 section 7's "omission is never negative evidence" is therefore a property of the data path, not a convention someone has to remember.

At submission, any stored answer the final routing no longer shows is **removed inside the transaction** and the count recorded in the ledger, so the frozen response holds exactly the questions that were on screen, and a stale answer to a hidden item can have no downstream effect at all.

## 5. The notice

PR 3 owns the notice's **identity** — its version and the exact ordered set of nine matters it must cover (PR 1 section 6: purpose, use, human decision, not-a-test, omission, oral discussion, review and correction, recipients, retention) — plus the governed references the candidate is entitled to see, taken from the exposure profile. The bilingual **wording** lives in the application dictionary, and the guard fails a build where a key is missing from either language.

The acknowledgement binds to the SHA-256 of the server-built descriptor, so a client cannot record acknowledgement of a notice it invented, and a later change to what must be disclosed changes the hash.

**It is an information receipt, not consent**, and the copy says so to the candidate in both languages. The lawful basis for the preparation is the employer's and is recorded on the governed exposure profile; nothing here creates, evidences or substitutes for it. `acknowledgement_kind` admits one value, so no later code can read the row as a lawful basis it never was.

The ordering is an invariant, not a screen: `bcp_assignments_notice_first_check` plus `BCP_NOTICE_NOT_ACKNOWLEDGED` mean nothing can be answered or submitted before the notice has been acknowledged.

## 6. Access

Every table: ENABLE **and** FORCE row level security, revoked to zero for PUBLIC, `anon`, `authenticated` **and** `service_role` (Supabase's default privileges grant the full set on every new table in `public`, so silence would be a grant), then SELECT re-granted to `authenticated` behind one narrow party policy. There is no INSERT, UPDATE or DELETE grant and no write policy for any client role: every write goes through a governed SECURITY DEFINER RPC that holds the privilege through its owner. `service_role` is therefore not, and cannot become, a user-facing authorisation mechanism here — it is SELECT-only on all six.

- **Candidate:** their own assignment, their own response at every state, their own answers. Nobody else's, through the read models or through the tables.
- **Employer:** an active member of the employer that owns **both** the assignment and the linked application and job, for a candidate who is that application's own applicant. Status always; the candidate's answers **only once submitted** — `answers` is absent, not empty and not partial, until then, in the read model and in the row policy alike.
- **Anonymous and roleless users:** nothing, anywhere.

Every mutation derives its actor from `auth.uid()`, authorises itself inside the function, pins `search_path`, is revoked from PUBLIC and `anon`, takes an operation id, hashes its exact request (reusing PR #218's `beskt_request_hash`), answers a replay **before** the compare-and-swap, refuses the same operation id with a different request or actor, refuses a stale expected revision **without writing**, and writes its append-only event in the same transaction.

Immutability is enforced by row triggers rather than policies, so it holds against every writer — a governed RPC, `service_role`, a superuser and BYPASSRLS alike.

## 7. Product placement

`Testbibliotek → Metodstöd för rekrytering`: a visually distinct sibling section with its own heading, explanation and vocabulary, never another row in the assessment library. The assessment read model above it assumes test semantics — an instrument, item counts, a result somebody "got" — and BESKT has none of those.

The section is never called a personality or suitability test, in either language, and the guard fails the build if it is. Scoring vocabulary appears only inside sentences that deny or distinguish a score, which the guard checks sentence by sentence.

A preparation is started from an existing application, on that application's own page — so the control cannot be reached without a real employer, job, application and candidate. The list and the create call share one database decision, so what is offered is what `bcp_assign` accepts.

**The honest empty state is the product state.** Until a governed method has passed its five human review gates and the owner has admitted an employer to the pilot, the section says the method is under development and why. No fixture publishes content into production to make the screen look complete.

## 8. What PR 3 does not do

No live interview execution, interviewer observation, evidence-state assessment, independent assessor workflow, panel workflow, report generation, AI analysis or summarisation, candidate scoring or ranking, suitability, credibility or deception judgement, automated employment recommendation, automatic job-application status change, security-vetting runtime, hosted apply or Lovable publish. The postflight and the guard refuse a table, column, function or code path for any of them. Those begin in PR 4.

## 9. The routed evidence

Exported components can prove layout and copy. They cannot prove that the
screens are wired to the database, and PR 3's whole claim is about what the
database decides. So the journey is walked in a real browser, signed in, on
the real routes: `e2e/beskt-candidate-preparation.spec.ts`, captured in
`artifacts/beskt-candidate-preparation/live/`.

Seven tests, in order, at 1440, 375 and 390, in Swedish and English: the
library's honest state; the employer starting a preparation from an existing
application and seeing **nothing** of a draft; the nine notices with no
question answerable before acknowledgement; answering, saving, leaving and
resuming with the exact same answers; one question taken orally and another
skipped; review and a real correction; one submission after which the screen
is read-only; the employer's readback of the submitted basis and the neutral
states; and the two refusals — a second candidate and a member of another
employer.

Two of those steps are worth naming because they are properties, not screens:

- **Routing is the database's decision.** The follow-up questions appear only
  after the answer that opens them has been _saved_, because the item sequence
  is resolved by PR #218's resolver over the answers actually stored. What the
  candidate is asked is never decided in the browser, and the walk asserts the
  order in which that becomes visible.
- **The refusals are absences.** The wrong candidate's page carries no notice,
  no question, no review list and none of the submitted text — not an empty
  panel, nothing at all.

The stack it runs against is described in `scripts/local-stack/README.md`. It
is a real PostgreSQL 16 with the full migration history and the hosted
privilege baseline, a real PostgREST enforcing the real RLS, and the real
application — with **GoTrue substituted** by a local token endpoint, because
in the environment this evidence was captured in no container image could be
fetched at all. That substitution is named in the evidence index beside the
captures rather than left for a reader to discover.

The walk's traces are captured and deliberately **not** committed: a trace
records the network and therefore carries the session's bearer token, which
`scripts/e4-evidence-scan.ts` correctly refuses. Their digests are in
`live/manifest.json`.
