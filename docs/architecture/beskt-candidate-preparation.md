# BESKT PR 3 — candidate preparation: runtime and release decisions

**Status:** PR 3A — the candidate-preparation **database contract only**. No application code, no UI, no hosted apply, no Lovable publish, no real data, no published method.

The candidate and employer surfaces that use this runtime are **PR 3B**. They are written and preserved on `claude/beskt-pr3-application-safety`, and are deliberately not in this pull request: `scripts/schema-first-release-check.ts` requires the schema half to be merged and applied on the owner project before any code that calls it becomes merge-eligible. See section 9.

**Depends on:** PR #217 (`docs/architecture/beskt-recruitment-method-discovery.md`, the normative contract) and PR #218 (`docs/architecture/beskt-governed-content-schema.md`, the governed content spine). This note records the additive decisions PR 3 makes inside those contracts; it changes nothing in either.

**Migration:** `supabase/migrations/20261110090000_bcp_candidate_preparation.sql`
**Rollback:** `supabase/rollback/20261110090000_bcp_candidate_preparation_rollback.sql`
**Suite:** `supabase/tests/bcp_candidate_preparation_test.sql`
**Guard / controls:** `scripts/beskt-candidate-preparation-check.ts`, `scripts/negative-controls/beskt-candidate-preparation-controls.ts`
**Generated types:** `src/integrations/supabase/types.ts` (describes this schema; calls nothing, which is why the schema-first guard excludes it)

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

The acknowledgement binds to the SHA-256 of the server-built descriptor, so a
client cannot record acknowledgement of a notice it invented, and a later
change to what must be disclosed changes the hash.

**The hash covers the WORDS, not only the matters — and this was not true in
the first revision.** The descriptor originally carried section identifiers and
governed metadata and nothing else, so the Swedish and English notices hashed
identically and editing a body string changed nothing the server could see. The
record's own claim, that it names the exact notice the candidate read, was
therefore false. It now carries the **locale** and a **governed copy digest**:

| Function                                    | What it governs                                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bcp_notice_locales()`                      | exactly `sv-SE` and `en-GB`                                                                                                                       |
| `bcp_notice_copy_digest(version, locale)`   | the SHA-256 the copy for that pair MUST hash to; `NULL` for any ungoverned pair, so an ungoverned locale is refused rather than hashed to nothing |
| `bcp_notice_descriptor(assignment, locale)` | carries both, so the two languages hash differently                                                                                               |
| `bcp_notice_hash(assignment, locale)`       | what the acknowledgement compares against                                                                                                         |

The wording itself stays in the application dictionary — a second copy of it in
the database would be a second source of truth for one sentence. What lives in
the database is the digest it must hash to. The canonical form, so PR 3B can
reproduce it exactly: for each section in `bcp_notice_sections()` order and for
`title` then `body`,

```
"beskt.notice.<section>.<field>" || E'\n' || <text> || E'\n'
```

concatenated in that order, hashed as UTF-8 with SHA-256, lowercase hex, no
value containing a newline. **PR 3B must prove its rendered dictionary text
hashes to the governed value**; until it does, nothing renders this notice.

Changing the copy therefore requires changing the governed digest, in a
migration, deliberately — which changes every notice hash and makes a new
acknowledgement necessary. A silently reworded notice cannot inherit an old
acknowledgement.

**The acknowledgement is single-shot.** An exact replay — the same operation id
and the same request — returns its stored receipt, as every governed mutation
here does. A _different_ operation id on an already-acknowledged preparation is
refused with `BCP_NOTICE_ALREADY_ACKNOWLEDGED`. It used to be silently ignored,
which wrote a second `notice_acknowledged` event onto the append-only ledger and
returned a receipt asserting lifecycle `notice_acknowledged` even when the row
had moved on to `in_progress`. The receipt now reads the lifecycle back rather
than asserting it, and the locale is validated against the governed list.

**It is an information receipt, not consent**, and the copy says so to the candidate in both languages. The lawful basis for the preparation is the employer's and is recorded on the governed exposure profile; nothing here creates, evidences or substitutes for it. `acknowledgement_kind` admits one value, so no later code can read the row as a lawful basis it never was.

The ordering is an invariant, not a screen: `bcp_assignments_notice_first_check` plus `BCP_NOTICE_NOT_ACKNOWLEDGED` mean nothing can be answered or submitted before the notice has been acknowledged.

## 6. Access

Every table: ENABLE **and** FORCE row level security, revoked to zero for PUBLIC, `anon`, `authenticated` **and** `service_role` (Supabase's default privileges grant the full set on every new table in `public`, so silence would be a grant), then SELECT re-granted to `authenticated` behind one narrow party policy. There is no INSERT, UPDATE or DELETE grant and no write policy for any client role: every write goes through a governed SECURITY DEFINER RPC that holds the privilege through its owner. `service_role` is therefore not, and cannot become, a user-facing authorisation mechanism here — it is SELECT-only on all six.

- **Candidate:** their own assignment, their own response at every state, their own answers. Nobody else's, through the read models or through the tables.
- **Employer:** an active member of the employer that owns **both** the assignment and the linked application and job, for a candidate who is that application's own applicant. Status always; the candidate's answers **only once submitted** — `answers` is absent, not empty and not partial, until then, in the read model and in the row policy alike.
- **Anonymous and roleless users:** nothing, anywhere.

**A `SECURITY DEFINER` function that `authenticated` may execute is an API, not
a helper.** PostgREST exposes every function that role can call, so
`bcp_pilot_grant_active(employer, version)` and
`bcp_version_is_candidate_safe(version)` — both definer-rights over tables whose
RLS refuses the caller — were answerable by any signed-in person about **any**
employer or version. That is an oracle: "is this competitor in the pilot?" is
exactly the fact `bcp_pilot_grants`' policy withholds, and pilot participation
is a commercial fact about an employer that is nobody else's to read. Both are
now revoked from `PUBLIC`, `anon` and `authenticated` and granted only to
`service_role`, alongside the other internal helpers.

Nothing lost access. A `SECURITY DEFINER` RPC calls them as its owner, not as
its caller, so `bcp_assign`, `bcp_assignable_method_versions` and
`bcp_assignable_exposure_profiles` are unchanged — and each of those answers
only about an employer the caller is actually a member of. The postflight,
the suite, the guard and the planted controls all hold the line.

Every mutation derives its actor from `auth.uid()`, authorises itself inside the function, pins `search_path`, is revoked from PUBLIC and `anon`, takes an operation id, hashes its exact request (reusing PR #218's `beskt_request_hash`), answers a replay **before** the compare-and-swap, refuses the same operation id with a different request or actor, refuses a stale expected revision **without writing**, and writes its append-only event in the same transaction.

Immutability is enforced by row triggers rather than policies, so it holds against every writer — a governed RPC, `service_role`, a superuser and BYPASSRLS alike.

## 7. What this half deliberately does not contain

No component, route, translation, server function or browser test. Every one
of them exists and is preserved on `claude/beskt-pr3-application-safety`; none
of them may merge until the migration below is applied on the owner project,
because Lovable rebuilds from `main` at merge while migrations run only when
someone applies them. That gap is the 2026-08-25 outage, and
`scripts/schema-first-release-check.ts` exists to make it unrepresentable.

The product decisions those surfaces implement — the sibling section in
Testbibliotek, the honest under-development empty state, starting only from an
existing application, the candidate journey in My Career — are unchanged and
belong in PR 3B's own note.

## 8. What PR 3 does not do

No live interview execution, interviewer observation, evidence-state assessment, independent assessor workflow, panel workflow, report generation, AI analysis or summarisation, candidate scoring or ranking, suitability, credibility or deception judgement, automated employment recommendation, automatic job-application status change, security-vetting runtime, hosted apply or Lovable publish. The postflight and the guard refuse a table, column, function or code path for any of them. Those begin in PR 4.

## 9. The release order this half exists to satisfy

1. **This PR (3A)** merges: the migration, its rollback, its behaviour suite,
   its guards and controls, its release bookkeeping and the generated types.
   Adding a table breaks no running application, which is what makes this half
   safe to merge first.
2. The official Supabase GitHub integration applies
   `20261110090000_bcp_candidate_preparation.sql` to the owner project.
3. The hosted schema is verified read-only and the migration identity recorded.
4. `supabase/release-state.json` records `hostedState: "applied"` with that
   evidence, on `main`.
5. `schema-first-release:check` is green on the updated `main`.
6. **Only then** does PR 3B open, from a branch cut at that `main`, carrying
   the preserved application half.

Nothing in this note asks anyone to remember that order:
`scripts/schema-first-release-check.ts` refuses the wrong one on the pull
request, before it can reach a live site.
