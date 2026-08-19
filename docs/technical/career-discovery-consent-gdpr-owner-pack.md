# Career Discovery — consent / GDPR owner decision pack

**For owner and legal decision. Engineering states facts only and draws no legal
conclusion.** Nothing in this pack was implemented. No consent record was
fabricated.

---

## 1. Where personal-data processing actually starts today

| Stage | What happens | Personal data? |
|---|---|---|
| Visitor opens the assessment | Nothing is written | No |
| Visitor answers all 28 questions signed out | Answers held in `sessionStorage` (`v31-public-buffer.ts`). **The database is not touched.** | Not by CQrityjob |
| Visitor signs in | An account exists — `auth.users`, `profiles` | **Yes — account creation** |
| `persistPublicV31Run` replays the buffer | `cd_sessions` + `cd_evidence` rows created under the user's `user_id`; `cd_v31_complete_session` writes an immutable `cd_report_snapshots` row | **Yes — this is the start of Career Discovery processing** |

**The processing start point is the sign-in-and-persist step, not the answering
step.** That is an unusually clean position and it is worth preserving: a
signed-out visitor genuinely leaves no trace.

A second gate sits on the same step: persistence succeeds only for a platform
admin or a named member of `cd_internal_testers`. Career Discovery is therefore
**not in open external use today**.

## 2. The exact user-facing information text today

**There is none specific to Career Discovery.**

Searched: every `discovery` and `security-career-assessment` route,
`src/i18n/dictionaries.ts`, and `src/components/`. The product presents **no
consent control, no acknowledgement checkbox, and no assessment-specific privacy
notice** before, during or after the run.

The only consent copy in the product belongs elsewhere:

| Key | Text | Where |
|---|---|---|
| `jobs.apply.field.consent` | "Jag samtycker till att min ansökan och mitt CV delas med arbetsgivaren." | Job application |
| `employer.onboarding.create.consent` | employer onboarding confirmation | Employer signup |

Neither covers Career Discovery.

## 3. Current configured processing basis

For the **employer** Security Competency product, a purpose row exists:
`competence_development`, reasoned onto legitimate interests, notice version
`pn-2026-08-competence-development-v1`, jurisdiction `SE`.

For **Career Discovery** there is **no configured processing basis represented in
the schema at all** — no purpose row, no notice version, no lawful-basis
reference.

> **Current configured processing basis for Career Discovery: none is
> represented in the system. Any basis — legitimate interests / Art. 6(1)(f), or
> another — is subject to final GDPR/legal review before external pilot.**

Engineering does not select the basis and has not assumed one.

## 4. What `consent_records` was designed to record

The table exists and is fully formed:

```
consent_records(id uuid, user_id uuid, purpose text, policy_version text,
                granted_at timestamptz, revoked_at timestamptz, metadata jsonb)
```

Its shape says what it was for: **a per-purpose, versioned, revocable consent
record** — `purpose` scopes it, `policy_version` pins which notice was shown,
`granted_at`/`revoked_at` make it revocable and auditable, `metadata` carries
evidence of the presentation.

`cd_sessions.consent jsonb NOT NULL DEFAULT '{}'` is a second, session-scoped
slot with the same intent.

## 5. Why no rows exist

**Because nothing ever asks.** There is no code path in `src/` that writes
`consent_records` — the only occurrence anywhere in the application is the
generated type definition. `cd_sessions.consent` likewise has no writer.

This is **not** a persistence bug where a working control fails to save. The
control does not exist. The storage was built first and the interaction was never
built.

**This distinction decides the whole pack.** Writing rows now would mean
inventing a consent that no user was ever shown and no lawyer ever approved —
which would be worse than the current gap, because an empty table is honest and a
fabricated consent record is evidence of a consent that never happened.

## 6. Should this be consent, or something else?

Engineering's factual input, not a recommendation on lawful basis:

| Option | What it would mean | Observation |
|---|---|---|
| **Consent (Art. 6(1)(a))** | An explicit, freely given, revocable opt-in before persistence | Career Discovery is candidate-owned, self-directed, and not employer-driven — so the power-imbalance objection that made consent inappropriate for the *employer* product does not obviously apply here |
| **Legitimate interests (Art. 6(1)(f))** | A balancing test, plus transparency and an objection route | Mirrors `competence_development`. But the candidate initiates and owns this run, which is a materially different relationship |
| **Acknowledgement / audit event, not consent** | Record *that the notice was shown and the person proceeded*, without claiming a consent basis | Matches what the product actually does today, and is what `consent_records.metadata` could carry honestly |
| **Contract (Art. 6(1)(b))** | Processing necessary to deliver the report the user asked for | Arguable — the user asks for a report and cannot receive one without processing |

The four are not equivalent and the choice changes what must be built. **This is
a legal decision, and engineering will implement whichever is chosen.**

## 7. What must be decided before external pilot

1. **The lawful basis** for Career Discovery processing.
2. **Whether the record is a consent or an acknowledgement** — this decides whether `consent_records` is the right table or whether an audit event is.
3. **The user-facing text**: what is shown, when, and in Swedish and English.
4. **The notice version identifier**, matching the `pn-…` convention already used.
5. **The withdrawal/objection route**, and what happens to `cd_evidence` and the frozen `cd_report_snapshots` when it is exercised — snapshots are immutable by trigger, so erasure needs an explicit designed path.
6. **Retention** for sessions, evidence and snapshots.
7. **Whether the signed-out buffer changes anything** — it is a genuine data-minimisation strength and should be stated in whatever notice is written.

## 8. What engineering will build once decided, and not before

A single control at the persistence step, writing one `consent_records` row (or
one audit event) with the approved `purpose` and `policy_version`, plus the
withdrawal path for item 5. It is a small change. **It is blocked on the wording
and the basis, not on the code.**

---

**Current configured processing basis: none represented for Career Discovery —
subject to final GDPR/legal review before external pilot.**
