# The people model — candidates, employees, and one professional identity

Employer Assessment Center, Phase 3.

## The one-sentence version

**One human is one professional identity. The employment relationship is a
property of the assignment, not of the person.**

## Why this needs stating

A security employer assesses two kinds of people:

- a **candidate** — someone being considered for a role
- an **employee** — existing workforce being assessed or developed

The naive model gives each its own person record. That is wrong here, and
expensively so: the whole point of the product is that a company assesses
someone during hiring, hires them, and then develops them. If hiring forks the
person into two records, their assessment history breaks exactly at the moment
it becomes most valuable.

So the person is stable and the *relationship* changes.

## The spine

```
auth.users                        one login, one human
  └─ scp_subject_identities       UNIQUE(user_id), PK(subject_id)   1:1
       └─ scp_subjects            the pseudonymous assessment identity
            └─ scp_attempts       every attempt this human ever makes
```

`scp_subjects` holds **only** `id` and `created_at`. No name, no email, no
employment fact. That is the data-minimisation boundary established in Phase 0
and it is asserted (`PM3.4`).

Personal and employment data lives where it belongs:

| Fact | Table |
| --- | --- |
| Name, contact | `profiles`, `employees`, `job_applications` |
| Employment | `employees` (employer-scoped) |
| Application to a job | `job_applications`, `jobs` |
| Assessment history | `scp_attempts` → `scp_subjects` |

The two halves are joined **only** through `scp_subject_identities`.

## Where the relationship lives

`assessment_assignments.use_case`:

| Value | Meaning | May reference | May **not** reference |
| --- | --- | --- | --- |
| `recruitment` | the person is a **candidate** | `job_id`, `application_id` | `employee_id` |
| `workforce` | the person is an **employee** | `employee_id` | `job_id`, `application_id` |

Enforced by `assessment_assignments_person_context_agrees`
(`20260819090000_employer_people_model.sql`).

### What the rule deliberately does *not* do

It forbids the **contradiction**, not the sparse case. Assigning to a bare
email is legitimate in both directions — a candidate who has not formally
applied yet, and a staff member not yet in the employee register, are both real
situations. Requiring the link would push users into picking the wrong context
to get their work done, which is how bad data starts.

### NOT VALID

The constraint binds every insert and update from now on, but does not
retroactively reject rows written before the rule existed. Those rows are real
history. A back-fill is a separate, reviewed decision: `VALIDATE CONSTRAINT`
can be run then and will report exactly which rows disagree.

## How the confusion used to happen

On the assign form, `use_case` and the recipient were two independent controls.
An employer could pick "recruitment" and then select an employee — filing a
staff member into the hiring pipeline — or the reverse.

Now the recipient determines the relationship:

- choose an **applicant** → purpose is recruitment, locked
- choose an **employee** → purpose is development, locked
- choose a **bare email** → the employer says which, because the email carries
  no relationship of its own

The server validator mirrors the database rule so the caller gets a named,
translatable `PERSON_CONTEXT_MISMATCH` rather than a raw `23514`.

## Reading participants

`public.scp_rm_employer_participants` — one row per (person, relationship) for
one employer.

A person who is both a past candidate and a current employee yields **two
rows**. That is correct and intended: the Assessment Center must show the
distinction rather than collapse it.

### It carries no `subject_id`, deliberately

The obvious convenience is to join `scp_subject_identities` and expose
`subject_id` so a caller can see the two rows are one human. Phase 2 forbids
this structurally: **no `scp_rm_` read model may depend on
`scp_subject_identities`** (asserted at `P2A.1`, and again for this view at
`PM4.2`/`PM4.2b`). The pseudonymous subject is the privacy boundary — a read
model carrying it turns every employer-facing list into a re-identification
surface.

Identity resolution stays in the scoped, authorisation-checking RPC
`public.scp_resolve_participant_identity(uuid, uuid)`.

The view is `security_invoker`, so the caller's own RLS decides what they see.
Every `scp_rm_` view is now checked for this, not a hardcoded pair (`P2A.3`).

## What is proven

`supabase/tests/employer_people_model_test.sql`, 18 assertions in the DB suite:

| Group | Proves |
| --- | --- |
| PM1 | a candidate and an employee are distinguishable |
| PM2 | neither is silently converted into the other — on insert **and** update — while bare-email assignment still works |
| PM3 | one human resolves to exactly one subject; a second cannot be linked; both relationships share it; the subject holds no personal data |
| PM4 | the read model reports the relationship, reaches no identity, and is not readable across tenants or by `anon` |

## Passport boundary

Security Passport is a separate engineering stream. If a future Passport
integration needs a participant identity, the integration point is
`scp_resolve_participant_identity` — **not** a join into `sp_*` tables and not a
new person record. Nothing in this phase implements it.
