# CQrityjob — Self-Service Gap Analysis (P0)

Audited against the live hosted database, not against intent.

---

## 1. Current employer role model

`employer_memberships.role` is constrained to exactly three values:

    CHECK (role = ANY (ARRAY['owner', 'admin', 'member']))

In use today: `owner`, `admin`. There is no recruiter, manager or reviewer capability.
Assignment requires `owner|admin`; release requires `owner|admin` of the **issuing**
organisation. Those two are correctly tenant-scoped.

## 2. Current reviewer capability — the P0 defect

Both response-review entry points gate on one function:

    scp_review_queue(text)                  -> IF NOT scp_can_author(auth.uid()) THEN RETURN
    scp_complete_human_review(...)          -> IF NOT scp_can_author(auth.uid()) THEN RAISE

and that function is:

    scp_can_author(_user_id) =
        is_platform_admin(_user_id)
     OR scp_has_content_role(_user_id, 'editor')
     OR scp_has_content_role(_user_id, 'reviewer')
     OR scp_has_content_role(_user_id, 'publisher')

`scp_content_roles` has columns `(id, user_id, role, granted_by, granted_at)` — **no
employer_id**. The capability is global by construction.

### Who can review participant responses today

| Account | Platform admin | Content role | Can review responses |
|---|---|---|---|
| mostafa@salvusgroup.se | **yes** | no | yes |
| sandleradam191@gmail.com | **yes** | no | yes |
| reviewer@closed-test.invalid | no | reviewer | yes |
| emma@cqrityjob.com | no | no | no |
| employer.owner@closed-test.invalid | no | no | no |
| participant@closed-test.invalid | no | no | no |

**Three accounts in the entire platform can review, and two are CQrityjob platform
administrators.** Zero employer-scoped reviewers exist and none can be created — there is no
table to hold one.

## 3. Conflation of two different SaaS roles

The system treats these as one capability:

| Role | Should govern | Actually governs today |
|---|---|---|
| **Content author / SME** | assessment definitions, items, versions, publication | *also* every customer's participant responses |
| **Response reviewer** | one employer's participant responses, purpose-limited | — does not exist independently |

A content editor hired to write items today receives read access to every employer's
participants' free-text answers. That is a capability grant nobody would knowingly issue.

## 4. Current cross-organisation behaviour (measured)

`scp_review_queue` applies **no employer predicate**. Signed in as
`sandleradam191@gmail.com` (owner of *Säkerhet AB*, platform admin), the queue returned:

- **66 review items** belonging to a different tenant, `cqrityjob`
- including `response_text` for constructed responses
- including `organisation_name` = the other tenant's name

The participant is pseudonymised (`F8E17E`), which is good, but the tenant is not, and the
raw prose is fully visible. Cross-tenant reviewing is currently unbounded, not delegated.

Meanwhile `scp_employer_review_pressure` **is** employer-scoped and returned `0 / 0` for
Säkerhet AB — producing the "0 väntar" banner above 66 pending cards. The two functions
disagree because they answer different questions.

## 5. Exact P0 gaps

1. **No employer-scoped response-reviewer capability exists.** Routine review is impossible
   without a CQrityjob platform admin or a global content-role holder. This is the SaaS
   violation: ordinary customer operation depends on the platform operator.
2. **Content-authoring and response-review are the same capability.** They must be separated.
3. **Review queue is not tenant-scoped**, so any holder sees every tenant's responses.
4. **Counters and queue use different scopes**, so the UI contradicts itself.
5. **No separation of duties**: nothing prevents the person who assigned an assessment from
   reviewing that same attempt, if they hold the capability.
6. **No employer person route** (`workforce.index` exists; nothing opens a person).
7. **No participant assessment history surface**; results are only visible while in the
   active work list.
8. **`scored` is a dead state** — nothing tells the issuing employer a result awaits release.
9. **No employer team/user administration** for granting any of this.
10. **Recruitment results have no application-context surface** (`use_case='recruitment'`
    is supported by schema; no attempts use it yet).

## 6. Minimal proposed model

Additive. No engine change, no new evidence store, no Passport change.

### Schema (one table, one function, two rewires)

    scp_employer_reviewers
      id, employer_id -> employers(id), user_id -> auth.users(id),
      granted_by, granted_at, revoked_at
      unique (employer_id, user_id) where revoked_at is null

    scp_can_review_for(_user_id uuid, _employer_id uuid) returns boolean
      -- active employer membership AND active reviewer authorisation

Rewire, preserving the working state machine:

- `scp_review_queue` — return only attempts whose `issuer_organization_id` is an employer the
  caller is authorised to review for; drop reliance on `scp_can_author`.
- `scp_complete_human_review` — authorise via `scp_can_review_for(auth.uid(), issuer org)`.
- `scp_employer_review_pressure` — same scope as the queue, so counters and cards agree.

Platform admin retains an explicit, audited break-glass path for support investigation; it
stops being the routine path. `scp_can_author` keeps its real job: content governance.

### Separation of duties

- the member who assigned an attempt may not review that attempt
- reviewer sees pseudonymous participant reference, item, response and rubric — not the
  person, not unrelated organisations
- authorisation is granted and revoked by employer owner/admin, and every review already
  writes `reviewer_actor_id`, outcome and rationale to `scp_human_reviews`

### UI

Employer: Team/Users admin (grant reviewer) · assessment pipeline with derived states ·
release affordance on `scored` · dashboard attention card · person profile with accumulating
assessment history.
Participant: *Tester & bedömningar* history with lifecycle states and released reports.
Reviewer: queue scoped to authorised employers, with explicit "reviewing on behalf of X".

## 7. Lifecycle state ownership matrix

`CQ admin required` is the column that matters. Every routine state must read **NO**.

| State | Visible to | Next-action owner | Action | Next state | UI location | CQ admin required |
|---|---|---|---|---|---|---|
| `invited` | participant, employer | participant | start | `in_progress` | Academy / employer pipeline | NO |
| `in_progress` | participant, employer | participant | answer & submit | `submitted` | Academy runner | NO |
| `submitted` + reviews open | participant *Under granskning*, employer *Väntar på granskning*, reviewer *in queue* | **employer-authorised reviewer** | complete reviews | `scored` (automatic) | Reviewer queue | **NO** (today: YES — the defect) |
| `scored` | participant *Resultat förbereds*, employer *Klar att frisläppa* | employer owner/admin | release | `released` | Employer pipeline | NO |
| `released` | participant, employer | — | open report | terminal | Participant history; person profile | NO |
| `abandoned` / `expired` | participant, employer | employer | reassign | new assignment | Employer pipeline | NO |

Platform admin remains required only for content governance, closed-test grants, validation
status, audit and exceptional escalation — never for a customer transaction.

## 8. Multi-tenant proof required

Two isolated employer fixtures, A and B. Assert A cannot read B's people, assignments,
attempts, reports, raw responses, review queue or organisation users; that A's authorised
reviewer sees no B work; and that revoking authorisation immediately removes access.
