# BESKT PR 2 — governed method content: schema decisions

**Status:** Schema only; ready for review. No candidate runtime, no UI, no hosted apply, no pilot.

**Depends on:** PR #217 (`docs/architecture/beskt-recruitment-method-discovery.md`, the normative contract). This note records the additive decisions PR 2 makes inside that contract; it changes nothing in it.

**Migration:** `supabase/migrations/20261108090000_beskt_governed_method_content.sql`
**Rollback:** `supabase/rollback/20261108090000_beskt_governed_method_content_rollback.sql`
**Suite:** `supabase/tests/beskt_governed_content_test.sql`
**Guard / controls:** `scripts/beskt-governed-content-check.ts`, `scripts/negative-controls/beskt-governed-content-controls.ts`

## 1. One identity, two spines

`scp_interview_packs` stays the stable identity of every governed interview package. It gains an additive `pack_kind` (`role_interview` | `beskt_method`, constrained text, default and backfill `role_interview`). `role_id` becomes conditionally nullable under a database invariant:

```text
role_interview  =>  role_id IS NOT NULL
beskt_method    =>  role_id IS NULL
```

A BESKT method is justified by versioned role-exposure profiles, not by one canonical `scp_roles` row, so no fake generic role is inserted.

The role-interview version spine (`scp_interview_pack_versions`, competency mappings, 0–4 anchors) is closed to any other kind by trigger, and the five old-flow functions (`scp_iv_case_start_basis`, `scp_iv_startable_pack_versions`, `scp_iv_create_case`, `scp_interview_pack_validate`, `scp_interview_create_version`) are re-created with their exact signatures plus an explicit `pack_kind = 'role_interview'` scope. No RPC name is overloaded. The role-interview content hash is not touched, so every recorded review hash stays checkable.

## 2. Why the tables are `beskt_*` and not `scp_*`

PR 1 requires `ENABLE` **and** `FORCE ROW LEVEL SECURITY` on every new exposed BESKT table. The Security Competency domain suite asserts that no `scp_*` table carries FORCE RLS (a documented trust-boundary decision for that domain). Both are right for their own domain, so BESKT carries its own prefix, as the Passport domain (`sp_*`) does with its own FORCE-RLS tables.

## 3. The twelve tables

| Table | Holds |
|---|---|
| `beskt_method_versions` | the versioned aggregate: status, mode, locales, provenance, `validation_label` (default `pilot_hypothesis`), `release_scope` (only `synthetic_internal_only` is representable), `revision`, SHA-256 `content_hash` |
| `beskt_exposure_profiles` | role-exposure templates: closed `exposure_area` vocabulary (no protected-trait proxy is representable), duties, relevance rationale, permitted mode, owning review role, lawful-basis / retention / access references |
| `beskt_activation_requirements` | the three PR 1 security-vetting activation requirements as governed *requirements*, never satisfactions |
| `beskt_sections`, `beskt_items`, `beskt_item_options` | questionnaire structure; every item states purpose, exposure link, mode, phase, typed answer contract, required/voluntary, `discuss_orally_allowed`, sensitivity and access class, provenance, prohibited inferences; options are key + order + bilingual label only |
| `beskt_prompts` | governed prompts in a closed PEACE/ORBIT-compatible vocabulary with a fixed stage binding, a positive `question_form` allowlist, permitted probe bases, and a wording CHECK (`beskt_wording_is_neutral`) that makes leading, double-barrelled, guilt-presuming, coercive, deceptive or cue-to-deception wording unrepresentable |
| `beskt_routing_rules` | deterministic routing: typed condition (`always` / `option_selected` / `boolean_equals`), explicit target, evaluation order; no expression, no jsonb, no condition on an omission |
| `beskt_evidence_anchors` | exactly the seven categorical evidence states, each with the seven governed components; no level |
| `beskt_observation_fields` | the ten observation-field concepts of PR 1 as governed definitions; no observation |
| `beskt_method_reviews`, `beskt_method_events` | append-only reviews (five gates, hash- and revision-bound) and the ledger that also carries idempotency receipts |

Sensitive categories and criminal-offence data are not representable (`sensitivity_class` admits `ordinary`, `integrity_sensitive`, `security_vetting_only`); enabling them requires a separately accepted, jurisdiction-specific configuration delivered as its own reviewed migration.

## 4. Governance

- **Hash:** core `sha256` over a canonical representation ordered on stable keys with sorted arrays; lifecycle columns excluded.
- **Validator:** `beskt_method_validate(version, require_reviews)`; content completeness at submission, completeness plus all five gates at the current hash inside the publishing transaction.
- **Gates:** `personnel_security`, `senior_hr`, `recruitment`, `employment_privacy_legal`, `data_protection`; reviewer ≠ author, one gate per reviewer per hash, publisher ≠ author, reviews and events append-only for every caller.
- **Mutations:** narrow RPCs only; actor from `auth.uid()`, operation id, SHA-256 request hash, replay answered before compare-and-swap, expected revision required where content can race, event and receipt in the same transaction. No client writer exists for any child table.
- **Read contract:** `beskt_published_method` / `beskt_readable_published_versions`: published content only; security-vetting content unreadable to employer principals (no authorised-security-owner relationship exists yet); nothing is startable.

## 5. What PR 2 does not do

No candidate assignment, notice, response, answer, case link, session, observation, correction, assessor, panel, report, AI generation, application-status change, hosted apply, Lovable publish or real data. No method content is seeded; the suite plants clearly synthetic content inside its own transaction. Candidate preparation begins in PR 3.
