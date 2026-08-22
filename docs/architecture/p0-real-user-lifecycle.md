# P0 — one continuous lifecycle

**What this records:** an audit of whether one real person survives every
transition through CQrityjob, and the two bridges built to close the places
where they did not.

**Branch:** `feat/p0-real-user-lifecycle` · **Date:** 3 September 2026
**Rebased onto canonical `main` @ `4a3de50`.**
**Not merged, not deployed, not applied to hosted.**

The technical baseline this builds on is
[CQrityjob State of Truth v1.0](CQrityjob-State-of-Truth-v1.md). Nothing in
that document is superseded here.

---

## 1. The lifecycle map

| Block | State before | State after |
|---|---|---|
| **Identity** | ALREADY BUILT | unchanged — proven, not extended |
| **Security Passport** | ALREADY BUILT (holder-controlled, token-addressed) | **application-scoped disclosure IMPLEMENTED** |
| **Application** | ALREADY BUILT AND CONNECTED | unchanged |
| **Assessment** | ALREADY BUILT AND CONNECTED | unchanged |
| **Employer evidence / report** | ALREADY BUILT AND CONNECTED | unchanged |
| **Recruitment outcome** | ALREADY BUILT — and terminal | **now continues into the workforce** |
| **Hired → Employee** | **MISSING P0** | **IMPLEMENTED** |
| **Continued workforce** | BUILT BUT UNREACHABLE from recruitment | **CONNECTED** |
| **AI foundation** | ALREADY BUILT (two governed seams, no provider) | unchanged — documented, deliberately not extended |
| **Career Intelligence continuity** | ALREADY SHARED for jobs / Passport / Career Discovery; absent on `employees` | **CONNECTED at hire** |

### What the audit actually found

**Identity was never the problem.** `scp_subject_identities` carries
`UNIQUE (user_id)`, and every one of the ten functions that resolves a subject
uses the same find-or-mint pattern against it. One account cannot have two
professional subjects, structurally. `employees.subject_id` (#51) already
pointed the employment relationship at the person rather than at an email
string. The gap was not that identity broke — it was that **nothing walked
from a recruitment outcome to the workforce at all**, so the question never
arose.

**`hired` was a dead end.** `set_application_status()` has accepted `'hired'`
since H3.4A. Grepping `'hired'` across all 214 migrations returns matches in
exactly two files — the migration that defines the status and its Lovable
duplicate. Nothing reacted to it. An employer who hired somebody then typed
them into Medarbetare by hand: a second row, no subject, and therefore no
history — including the assessment that same employer had just commissioned.

**Applying was silent, and had no alternative.** The Passport has been
holder-controlled since Phase 3, but every share was a *token*. A candidate
who wanted an employer to see a verified credential had two options, both
wrong: paste a link into a cover note (a revocable disclosure becomes a
permanent string in the employer's records), or nothing. There was no way to
disclose to *this employer, for this application*.

---

## 2. Exact changes

### Migrations (2, neither applied anywhere)

| File | What it does |
|---|---|
| `supabase/migrations/20260903091000_sp_application_scoped_disclosure.sql` | `sp_disclosures.application_id`; `token_hash` nullable + one-addressing-mode CHECK; one-live-per-application partial unique index; column-narrowed UPDATE grant; `sp_disclosure_payload`; `sp_get_disclosure` redefined to delegate; `sp_share_passport_with_application`; `sp_my_application_disclosures`; `sp_application_disclosure` |
| `supabase/migrations/20260903092000_scp_hired_becomes_employee.sql` | `employees.hired_from_application_id` / `hired_from_job_id` / `cig_profession_slug`; column-narrowed INSERT/UPDATE grants; `scp_employment_from_application`; `set_application_status` extended by one call |

Both end in a self-verifying `DO` block that raises if the change did not
install as described.

### RPCs

| Function | Caller | Authority |
|---|---|---|
| `sp_share_passport_with_application(application, package, days, focus, purpose)` | candidate | must be the applicant on that application, and hold a Passport |
| `sp_my_application_disclosures()` | candidate | own rows only |
| `sp_application_disclosure(application)` | employer | active membership in the owning organisation |
| `sp_disclosure_payload(disclosure)` | **nobody** | no role holds EXECUTE; reachable only through a definer that has already checked |
| `scp_employment_from_application(application)` | employer | active membership — the same gate as recording the outcome |

Revocation reuses `sp_revoke_disclosure` unchanged.

### Application layer

| File | Change |
|---|---|
| `src/lib/security-passport/application-disclosure.functions.ts` | new — the three candidate/employer server functions |
| `src/components/jobs/ApplicationPassportShare.tsx` | new — the candidate's per-application control |
| `src/components/employer/ApplicationPassportPanel.tsx` | new — the content of Candidate overview's existing Security Passport section |
| `src/routes/_authenticated.my-career.applications.tsx` | share control under each application |
| `src/routes/_authenticated.employer.$employerSlug.applications.$applicationId.tsx` | the section's pinned sentence becomes the panel; heading and lede untouched |
| `scripts/passport-separation-check.ts` | rules 3b/3d revisited deliberately — see §9 |
| `supabase/tests/scp_recruitment_journey_test.sql` | RJ7.23 now asserts the governed hire — see §9 |
| `src/lib/security-passport/i18n.ts` | 16 `ad.*` copy keys, sv + en |
| `src/integrations/supabase/types.ts` | spliced: new columns and RPCs |
| `supabase/tests/scp_lifecycle_bridges_test.sql` | new — 64 assertions |
| `supabase/tests/scp_a_rollback_test.sql` | the documented rollback now drops the bridge and restores `set_application_status` |
| `scripts/db-test.sh` | the new suite, floor 45 |

Both new components sit **outside** `src/components/security-passport/`
because they call server functions, which
`scripts/passport-separation-check.ts` rule 2 reserves for
`src/lib/security-passport/*.functions.ts`. They are consumers of the
Passport, on the surfaces that consume it.

The employer panel does **not** add a section. Candidate overview has carried a
Security Passport section since PR #58, whose entire content was one pinned
sentence saying nothing had been shared. The heading, the lede and the
unconditional rendering are untouched; the panel replaces only the sentence,
and renders that same sentence for every case that is not a live,
holder-created disclosure naming this application — including loading, error,
revoked and expired.

---

## 3. Security Passport — the exact path

```
candidate applies                      -> NOTHING is disclosed. No row exists.
        |
candidate opens Mina ansökningar,
picks a package, picks an expiry       -> sp_share_passport_with_application
        |                                 one sp_disclosures row:
        |                                   application_id = this application
        |                                   token_hash     = NULL
        |
employer opens Ansökningar             -> sp_application_disclosure
        |                                 membership checked, access recorded,
        |                                 payload from sp_disclosure_payload
        |
candidate re-shares                    -> previous row revoked in the same
        |                                 statement; one live row per application
        |
candidate revokes, or expiry passes    -> {"status":"none"} again
```

**Application ≠ consent.** No code path reads a Passport because an
application exists. `sp_application_disclosure` returns
`{"status":"none"}` for *every* negative case — not a member, no such
application, nothing shared, revoked, expired — and the server function
returns the same for its own errors. The employer panel renders **nothing**
in that case rather than an empty state, because on a list where some rows
carry a panel, a visible "nothing here" is itself the inference.

**A share is not a link.** `token_hash` is NULL on an application
disclosure, a CHECK enforces exactly one addressing mode per row, and
`sp_get_disclosure` additionally refuses `application_id IS NOT NULL`
explicitly rather than relying on NULL comparison semantics.

**One contract.** The payload comes from `sp_disclosure_payload`, extracted
verbatim from Phase 9's body — the public `/p/$token` path now calls it too.
The employer panel renders it through the same `buildRecipientPresentation`
and the same `RecipientPassportCard` as the recipient page. There is no
second reading of the package contract anywhere.

**Nothing was widened.** Only current, verified, active claims are disclosed;
the package filter is unchanged; private evidence, holder notes and
credential reference numbers are still absent; and a holder's own direct
UPDATE on `sp_disclosures` is now narrowed to `revoked_at` alone, so an
existing share cannot be silently re-pointed or re-packaged in place.

---

## 4. Identity — the proof

`candidate subject = applicant subject = assessment subject = Passport
subject = employee subject`, and it is structural rather than maintained:

| Link | Key | Guarantee |
|---|---|---|
| account → subject | `scp_subject_identities.user_id` | `UNIQUE (user_id)` — one account cannot hold two subjects |
| applicant → account | `job_applications.applicant_user_id` | FK to `auth.users` |
| attempt → subject | `scp_attempts.subject_id` | resolved through the identity table by every assign path |
| employee → subject | `employees.subject_id` | resolved through the identity table by the hire bridge; `UNIQUE (employer_id, subject_id)` |
| Passport → person | `sp_*.holder_user_id` | keyed on `auth.users`, with **no FK into `scp_*`** — the Phase 0 boundary, deliberately retained |

Asserted at H1.2, H2.2, H2.3, H5.2, H5.3 and H6.1: the subject the
recruitment attempt ran against is the subject on the employment record, is
the subject a post-hire development assessment resolves, and one human
employed by two organisations still has exactly one professional identity.

The Passport is joined to the person through `auth.users`, not through
`scp_subjects`. That is the existing architecture and this change does not
alter it: `sp_disclosures` gained a reference to `job_applications`, which is
a recruitment record, not an assessment one. G9 asserts the Passport still
holds no `attempt_id` or `subject_id`.

---

## 5. Hired → employee

```
employer clicks "Markera anställd"
  -> set_application_status(application, 'hired')      [unchanged authority]
       status := 'hired'
       one job_application_status_events row
       scp_employment_from_application(application)    [same transaction]
            resolve subject from applicant_user_id     (find, or mint once)
            scp_resolve_employment_for_assignment(...)  <- the resolver the
                                                           assignment path
                                                           already uses
              1. record already bound to this subject  -> reuse
              2. exactly one unbound ACTIVE record with
                 this person's confirmed address       -> bind
              3. ambiguous / no match                  -> create
            fill lineage: application, job, cig_profession_slug, role_title
```

**No duplicate person is created**, proven three ways:

- H2.1/H2.3 — one employment record, and no second `scp_subject_identities` row.
- H4.1/H4.2 — the bridge is idempotent: running it again returns the same record and creates nothing.
- H5.1/H5.2/H5.3 — a placeholder the employer had already typed in is *bound*, not duplicated, and two employers holding the same person still resolve to one subject.

**The engine still never decides.** The bridge refuses unless the application
is already `'hired'` (H4.5), and no assessment code path can reach it. Its
authority is deliberately identical to the outcome's own — an active
membership — so it neither widens who may hire nor refuses somebody the
product already permits.

**It became discoverable with no attachment step** (H3.1): the recruitment
assessment appears on the new employee's person page immediately, because
that page resolves through `subject_id`, and H6.2 shows recruitment and
post-hire development sitting on one history rather than two.

**Address is not copied** (H2.8). The name comes from the display name the
employer was already shown on the application row, so the hire discloses
nothing new.

---

## 6. AI foundation

**Two seams exist. Both are governed. Neither has a provider wired, and none
was added.**

| Seam | Where | Purpose | Guarantee |
|---|---|---|---|
| Scoring | `scp_ai_providers`, `scp_prompt_versions`, `scp_ai_scoring_runs`, `scp_ai_scoring_dimensions` | constructed-response scoring | `null_provider` is the default and produces no score; every run is append-only and recorded even when it fails; schema-invalid output routes to human review rather than being retried into acceptance; candidate text is passed in a versioned isolation envelope and never concatenated into a prompt; no credential is stored in the database |
| Explanation | `src/lib/career-discovery/v31/ai-explanation.ts` | candidate-facing narrative over Career Discovery results | the deterministic template path is the only path that exists; the AI call is an injected `AiCallFn`; the context is built solely from data the candidate can already see; nothing can feed back into fit, priority or stage |

They are complementary, not competing — one scores, one narrates — and both
already have the properties P0 asks for: governed inputs, deterministic
outputs, and no capacity to invent a score, a fact or a decision. There is no
third approach and no stray prompt anywhere in `src/`.

**How future AI features must consume this.** Candidate explanation,
employer structured summary, strengths, limited/mixed evidence,
development areas, interview guidance and career recommendations all read
**released, governed artefacts** — `scp_report_snapshots`,
`scp_competency_evidence`, the interview guide, the CIG graph — never raw
`scp_candidate_responses`, and never a Passport that was not disclosed. A
real provider is registered **once**, in `scp_ai_providers` (the single-enabled-provider
trigger already enforces that), with the credential server-side.

**Not done, deliberately:** a shared provider/credential abstraction spanning
both seams. It cannot be designed before a vendor is chosen, and choosing one
is an owner decision with a billing relationship attached. **P1.**

---

## 7. Career Intelligence continuity

| Finding | Class |
|---|---|
| `jobs.profession_slug` → FK `cig_professions(slug)` | ALREADY SHARED |
| `sp_passport_profiles.cig_profession_slug`, `sp_experience_periods.cig_profession_slug` | ALREADY SHARED |
| `cd_profession_profiles.cig_profession_slug`, `ProfessionMatch.cigProfessionSlug` | ALREADY SHARED |
| `employees` carried no profession concept at all — only free-text `role_title` | **P0 CONNECTION — done.** `employees.cig_profession_slug`, FK to `cig_professions`, inherited from the advertisement at hire (H2.6) |
| `scp_professions` is a **second profession taxonomy**: `security-officer-se` / `public-order-officer-se` / `protective-security-officer-se` against CIG's `vaktare` / `ordningsvakt` / `skyddsvakt`, with **no mapping between them** | **BUILT BUT DISCONNECTED — P1** |

The `scp_professions` divergence is real and is the one genuine duplicate
taxonomy in the system. It is **not** touched here: reconciling two
governance-bearing content vocabularies is a content decision with review
gates attached, not a bridge. It did not block tonight's work because
neither bridge needed it — the disclosure payload already emits a CIG slug
(L3.3) and the employment record now inherits one.

Nothing built tonight introduced a new profession, competency or skill
concept.

---

## 8. Migration status

**MIGRATION REQUIRED — YES.**

| File | Applied to hosted? | Applied locally? |
|---|---|---|
| `20260903091000_sp_application_scoped_disclosure.sql` | **NO** | yes — clean full-history replay |
| `20260903092000_scp_hired_becomes_employee.sql` | **NO** | yes — clean full-history replay |

Both sit **after** `20260903090000_scp_candidate_from_application.sql`, which is
main's highest version. `20260903090000` is **not** reused: the first draft of
this work claimed it before that migration existed on main, and renumbering was
the correction. `ls supabase/migrations | sed 's/_.*//' | sort | uniq -d`
returns nothing.

Both replay from an empty database in the ordinary linear sequence.
`npm run migrations:check` passes. Neither has been sent to Lovable, and
`supabase/migrations-policy.json` is untouched — no entry belongs in
`appliedThroughLovable` until the Product Owner approves an application and
Lovable stamps its own version.

No data migration, no backfill, no destructive statement. The only changes to
existing objects are additive columns, narrowed grants, and two functions
replaced with bodies carried forward verbatim plus one addition each.

---

## 9. What the rebase changed, and the two things it had to decide

This work was first written against `bb6068d` and rebased onto `4a3de50`.
Eleven commits of product work landed in between — employer onboarding
approval, Candidate overview, and recruitment reviewer configuration. One
merge conflict, and two collisions that were decisions rather than merges.

### The merge conflict

`_authenticated.employer.$employerSlug.applications.tsx` — main had gutted it
into a layout route and moved the list to `.index.tsx`, while this branch still
carried the old full-file list with a panel added to it. **Resolved by taking
main's layout wholesale.** Nothing of this branch's version survives, and the
panel moved to Candidate overview, which is where it belonged once that page
existed.

### Collision 1 — the migration version

Main added `20260903090000_scp_candidate_from_application.sql` after this
branch had already claimed `20260903090000`. Two canonical migrations may not
share a version, so both files here were renumbered to `20260903091000` and
`20260903092000`, after everything on main.

### Collision 2 — a guard that forbade exactly this

PR #58 gave Candidate overview a Security Passport section that reads nothing,
and a guard (`passport-separation-check.ts`, rule 3b) banning every route by
which Passport data could reach an employer surface. That guard is why this
branch's original employer panel could not merge.

It also named its own condition for revision:

> "If in-platform, holder-authorised, application-scoped disclosure is designed
> later, it replaces that copy and arrives as its own reviewed integration —
> and this list is what has to be revisited deliberately."

This is that integration, and rule 3b was revisited in the open rather than
loosened quietly:

- **One** recruitment surface may render a disclosure — Candidate overview. The
  applications list and every other surface stay exactly as closed as they were.
- The permission is three **named constants**, not a widened regex, mirroring
  the `SERVICE_ROLE_EXCEPTION` pattern this file already used.
- New **rule 3d** holds those three files tighter than the ban it replaces: the
  panel may reach one server function and no table; that module may call only
  the three holder-scoped RPCs; no other file in `src/` may import it; and the
  panel **must** still render `employer.candidate.passport.none`, so the case
  PR #58 protected is now protected by an assertion instead of by the absence
  of code.
- All seven new and changed rules were **mutation-tested individually** — the
  list route importing the panel, the panel dropping the pinned sentence, the
  server module reading a table, calling `sp_get_disclosure`, an unrelated
  component importing the module, a second Passport identifier appearing on
  Candidate overview, and the pinned sentence drifting into "no Passport found".
  Each was caught.

The section still renders for every candidate, so its presence still says
nothing about whether this person holds a Passport. That was always the
property worth protecting, and it is intact.

### Collision 3 — RJ7.23

Main's recruitment journey suite asserted **"hiring built no employee record as
a side effect"**, with the rationale "recruitment ends at a decision; creating
the employee is a separate, deliberate act."

That assertion was true when written, and RJ7.21's own comment beside it said
an employment relation would be created *"later against the identity that
already carries their assessment history"*. This is that later.

**RJ7.23 was rewritten rather than deleted**, and the property it protects is
unchanged: it was never "no employee may exist", it was "hiring must not fork
the person". It now asserts exactly one employment record (`RJ7.23`), carrying
the subject `RJ7.21` just proved survived (`RJ7.23b`), with the application it
came from recorded (`RJ7.23c`) — which a bridge that minted a fresh identity
would fail while passing any count.

**RJ1.5** ("assessing a candidate created no employment record") and **RJ3.4**
("no employment record was invented to hold her") are untouched and still pass:
the bridge fires only on `'hired'`.

**This is the one piece of current-main behaviour that changed**, it changed
because the approved P0 brief requires it, and it is stated here rather than
buried in a diff.

### What was verified as preserved

- `set_application_status` — diffed against main's canonical definition: **byte-identical** apart from one added `PERFORM`. The transition allow-list, the role derivation, the note handling, the raw-write ban and the audit insert are unchanged, and RJ7.18/RJ7.19/RJ7.20/RJ7.24 still pass.
- Employer onboarding approval — 26 assertions, untouched, passing.
- `scp_application_candidate` — untouched; still exposes no Passport column (RJ8.6, and CO.5 from this side).
- Recruitment-only reviewer authorisation — scripts, docs and UI only; no migration, no schema effect.
- The Passport RLS boundary (RJ8.1–RJ8.7) — untouched. The employer still reads **zero rows** of any `sp_*` table directly; the only route is the membership-checked definer function.

