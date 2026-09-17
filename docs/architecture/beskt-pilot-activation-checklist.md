# BESKT — what the owner must supply before an internal pilot can be published

**Written:** 2026-09-18, against production `wrygicdfxwjnrugduxnt`.

The product code is complete: a governance user can author a method, collect
the five review decisions, publish, and admit one employer to a time-boxed
pilot, all through `/admin/beskt-methods`. What is missing is **people**, and
that is not something code can supply without weakening the gates.

## What production actually holds today

Read-only, via the Supabase connector on `wrygicdfxwjnrugduxnt`:

| Fact | Value |
| --- | --- |
| Migration ledger frontier | `20261123090000` |
| BESKT method identities (`pack_kind = 'beskt_method'`) | 0 |
| BESKT method versions | 0 |
| Governance mandates (`beskt_governance_grants`) | 0 |
| Pilot grants (`bcp_pilot_grants`) | 0 |
| Candidate preparations / conduct sessions / reports | 0 / 0 / 0 |
| Platform content role `editor` | **0** |
| Platform content role `reviewer` | 1 |
| Platform content role `publisher` | **0** |
| Platform admins | 1 |
| Employers with status `active` | 11 |

## Why the pilot cannot be published yet

The governed contract requires all of the following, and the database
re-checks every one of them:

1. **An editor.** `beskt_content_gate` calls `scp_interview_can_edit`, which
   is the platform content role `editor` and nothing else — a platform admin
   is deliberately *not* an author. With zero editors, no governed content
   can be written at all.

2. **Five distinct reviewers, each holding a mandate for one exact gate.**
   `beskt_record_review` and the row trigger both require an active row in
   `beskt_governance_grants` for exactly that gate (`BESKT_GATE_NOT_GRANTED`).
   The generic `reviewer` content role is explicitly never enough. One
   reviewer per gate, one gate per reviewer per content hash, and a reviewer
   may never be the author.

3. **A publisher who is not the author.** `beskt_publish_version` requires
   the platform content role `publisher` and refuses
   `BESKT_PUBLISHER_IS_AUTHOR`.

Production has one platform admin and one generic reviewer. That is not
enough for any part of it, and the gates must not be relaxed to make it fit.

## The checklist

The platform admin can do steps 2 and 4 today through the UI. Steps 1 and 3
need real people the owner nominates.

1. **Nominate and create the accounts.** Seven distinct real people, or as
   few as seven roles held by distinct accounts:
   - one **editor** — authors the method content;
   - five **reviewers**, one per gate:
     - `personnel_security`
     - `senior_hr`
     - `recruitment`
     - `employment_privacy_legal`
     - `data_protection`
   - one **publisher** — must not be the editor.

   The existing single `reviewer` content-role holder can be one of the five,
   provided they did not author the content and hold the mandate for their
   own gate.

2. **Grant the platform content roles** (`editor`, `reviewer`, `publisher`)
   via the existing `scp_content_roles` administration. The five reviewers
   need the `reviewer` content role *in addition to* their gate mandate.

3. **Record the documented decision** that appoints each reviewer to their
   gate. Each mandate stores a `source_reference` immutably, and it should
   name the real decision — a board minute, an appointment letter — not a
   placeholder.

4. **Grant the five mandates** at `/admin/beskt-methods/<version>?tab=access`
   → *Mandates to review*. One per reviewer, naming the exact gate and the
   decision from step 3. A validity end date is optional and recommended.

5. **Author the method** at `?tab=content` as the editor: exposure profiles
   first (they justify every question), then sections, items, prompts,
   routing, evidence anchors, observation fields and activation
   requirements. The *Review and publication* tab lists exactly what the
   validator still wants.

6. **Send it to review**, and have each of the five reviewers decide their
   own gate with a written rationale. Note that every submission opens a new
   review cycle, and any content touch — including one that restores
   byte-identical text — invalidates all five approvals. Collect them after
   the content has settled.

7. **Publish** as the publisher.

8. **Admit exactly one internal pilot employer** at `?tab=access` → *Pilot
   grants*, with an expiry date. This is the only thing that makes the method
   assignable to a candidate anywhere, production included, and it lapses on
   its own so a pilot cannot drift into general availability.

## What must not be done

- Do not create placeholder reviewer accounts, or have one person hold
  several gates under different logins. The five gates are five independent
  judgements; simulating them produces a published method that nobody
  actually reviewed, and the audit trail would record it as though they had.
- Do not use real candidate data for technical verification. The version's
  `release_scope` is `synthetic_internal_only` and there is no other
  representable value.
- Do not grant the pilot to more than the one designated internal employer.

## One open defect to weigh before the pilot carries real interviews

`docs/architecture/beskt-report-preview-independence.md` — the report
preview's missing independence check. It is mitigated in the application and
does not block authoring, review or publication, but it should be fixed
before two assessors use the method on a live case.
