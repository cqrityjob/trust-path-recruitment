# CQrityjob — Jobs MVP v1 Specification

**Status:** Draft specification for owner review — **v3, updated to resolve the pre-build design review**. No code, migrations, environment variables, feature flags, or published state have been changed to produce this document.
**Audience:** Lovable (implementer), CQrityjob founder/owner (approver), any future engineer reading this cold.
**Source of truth used:** direct inspection of `cqrityjob/trust-path-recruitment` (local `main`, cross-checked against `origin/main` where noted), `supabase/migrations/*.sql`, `src/lib/job-intelligence/*`, `src/lib/career-intelligence-engine/*`, `src/lib/knowledge-graph/*` (CIG), `docs/job-intelligence/*` prior phase reports, dated external research, and a Principal Architect pre-build design review of the v2 specification (see "Design review disposition," below).

---

## Executive summary (read this first)

1. **Recommendation.** Jobs MVP v1 is **not a rebuild**. It activates and completes an already-substantial, already-merged Job Intelligence marketplace (Phases A–F2) and employer-identity layer (Phases G1–G3), currently sitting behind `VITE_JOBS_ENABLED=false` / `VITE_EMPLOYER_PORTAL_ENABLED=false`, and adds exactly the pieces that don't exist yet: employer self-service job authoring (now with a database-enforced transition guard, not just UI trust), a real internal + external application system, CV upload with private storage, a saved-jobs UI, explainable job relevance, structured Career Intelligence mappings on every job, mandatory automatic job expiry, and working SEO/structured data.
2. **MVP scope.** Unchanged in shape from v2 — see Part X — with two additions promoted from optional to mandatory: automatic job expiry (H3) and the employer-write RLS/trigger guard (C1) are now both explicit MUST items inside H1, not later polish.
3. **Most important architecture decision.** Every job is a **structured Career Intelligence node**, reusing the existing CIG taxonomy rather than a parallel one (Security Career Intelligence Integration, below) — unchanged from v2. A close second, added by this revision: **no actor other than a platform admin may ever change a job's `status` field directly through an open-ended write** — every non-admin transition is enforced by a database trigger, not by application code alone (Part F, Part L).
4. **Biggest risk.** Unchanged in nature (legal/discrimination exposure, Part K/Y) but no longer the single largest architectural gap — this revision closes the two Critical findings (employer moderation-bypass, application-record tampering) that a pre-build review identified as bigger near-term risks than the discrimination-content risk, precisely because they were exploitable by construction rather than by a moderator's judgment call.
5. **Recommended first phase.** H1 — unchanged as the starting point, now with an explicit, expanded scope: the Career Intelligence/salary/application-method schema work from v2, **plus** the employer-write RLS + transition-guard trigger (C1), the `job_applications` table with no direct UPDATE grant (C2's schema half), the mandatory-expiry trigger and `sweep_expired_jobs()` (H3), and the retention/analytics sweep functions (H2/M4). Nothing employer- or candidate-facing ships before all of this exists and is verified.

### Design review disposition

A Principal Architect pre-build design review of the v2 specification found 2 Critical, 5 High, 5 Medium, and 3 Low findings — all resolved in this revision (v3). The two Critical findings (C1: no enforced boundary preventing an employer from self-publishing a job or hijacking `employer_id`; C2: `job_applications` UPDATE policies permitted column-level tampering beyond their stated intent) are fixed at the schema/RLS/trigger level in the companion data-model document, not by tightening application-code discipline alone. Every High finding is resolved with a concrete model choice (no more "or a distinct transition — see Part F"-style hedging). Every Medium finding is either resolved or explicitly scheduled to a specific phase. Every Low finding is resolved without expanding scope.

---

# PART A — Executive Decision

### A.1 What Jobs MVP v1 actually is

Unchanged from v2. CQrityjob already shipped a working jobs marketplace — public routes, admin moderation console, CIG-linked schema, and a privacy-conscious candidate personal-relevance feature — all real, merged, and currently switched off. Phases G1–G3 added employer identity and a dashboard shell whose "quick actions" are explicit placeholders. Jobs MVP v1 turns that placeholder into a real product.

### A.2 What v1 explicitly is not

Unchanged. Not an ATS, not a payments product, not an AI-scored ranking engine, not a second authentication system, not a rebuild of any working Phase A–G component, not a new job taxonomy. Full exclusion list: Part X.

### A.3 Why now

Unchanged — the employer identity foundation has no product to attach to yet.

### A.4 Connection to G1/G2/G3 and Career Intelligence

Unchanged from v2, with one addition: `jobs_validate_before_write()` (G1-era trigger, already the pattern this codebase uses for exactly this kind of guard) is now also the enforcement point for the employer transition guard (C1) — the newest addition reuses the oldest relevant precedent in this feature line, rather than inventing a new mechanism.

### A.5 Success criteria (first 90 days post-launch)

Unchanged, plus one addition: **zero instances of an employer-authored write reaching `status='published'` other than through a platform-admin approval action**, verified by the RLS/trigger test suite in Part V, not just by moderator diligence.

### A.6 GO / NO-GO

**GO**, conditioned on: (1) the reframing above being accepted as-is; (2) the exact MVP boundary in Part X; (3) **H1's expanded scope** (schema, RLS, and the C1/C2/H3 trigger and function work) shipping and being verified before any employer- or candidate-facing UI is built on top of it. The design-review fixes in this revision are additions to H1's existing scope, not a new phase — H1 was never "done" without them, per the review.

---

# PART B — Users and Jobs To Be Done

Unchanged from v2.

| User | Objective | Key tasks | Permissions | Prohibited access | MVP value |
|---|---|---|---|---|---|
| Anonymous visitor | Evaluate whether CQrityjob has relevant security-sector jobs | Browse `/jobs`, filter, view a job detail, follow an external application link | Public read of published+active jobs only | No saved jobs, no application, no employer/candidate data | SEO entry point, top-of-funnel trust |
| Signed-in candidate | Find and apply to relevant roles, track applications | Browse/search/filter, save jobs, view relevance explanation, submit internal application (with optional CV), track status, withdraw | Read own saved jobs/applications only; write own application/withdrawal only, and only through the server functions in Part G.2 | Cannot see other candidates' applications, cannot see moderation notes, cannot see employer-internal fields, cannot alter their own submitted content after the fact | Core candidate loop — the reason candidates return |
| Employer member (owner/admin) | Publish and manage jobs for their organisation | Create/edit/preview/submit/duplicate/close job drafts; view and mark-viewed/note applications for their jobs; see basic dashboard counts | Full CRUD on own employer's **draft/rejected** job rows, and a close-only write on **published** rows, enforced by RLS + a database trigger (Part F, Part L); read applications only for own employer's jobs, **only while the employer's own status is active** | Cannot see other employers' jobs/applications/drafts; **cannot set a job's status to `published` under any circumstance — this is trigger-enforced, not merely a UI restriction**; cannot edit a published job's content in place | The one missing piece that makes this a real two-sided marketplace |
| Employer member (recruiter/plain member) | Same as above, narrower | Create/edit/submit jobs; view/mark-viewed applications | Same tenant isolation and same trigger-enforced boundary as above; role-gated actions defined in Part L | Cannot manage membership/org settings (existing G1 scope) | Lets a small security firm delegate posting without owner involvement |
| Content editor / moderator | Keep listing quality and legal compliance high | Review pending jobs, approve/reject/request changes, unpublish, flag suspicious listings | Full read of all jobs/employers; write to moderation fields only | Cannot see candidate application content unless a specific support need arises (documented exception, not default) | Trust layer — see Part K |
| Platform admin | Operate the whole system | Everything moderators can do, plus employer/employer-membership management (existing G1), plus emergency unpublish, plus the one narrow application-record support-correction path (Part L) | Full read/write via `is_platform_admin()`, explicitly exempted from the employer transition guard | — | Founder/ops operability at small-team scale |
| Superadmin | Same ceiling as platform admin (existing G1 fix, not part of this spec) | — | `is_platform_admin()` already covers this | — | Already solved by G1 |
| Support (future) | Assist a candidate/employer with an account issue | Read-only, scoped, time-boxed access (not built in v1) | N/A — deferred | N/A | Deferred (Part X) |

---

# PART C — End-to-End User Flows

Each flow: entry point → steps → system response → empty state → error state → permissions → analytics event → completion condition. Analytics events reference the `job_analytics_events` table (Part E, Part R). Flows 5, 8, 15, and 19 are updated from v2 to reflect the C1/C2/H4 fixes.

1. **Anonymous job search.** Entry: `/jobs` or a search-engine result. Steps: land → filter/search → open a job. Response: server-rendered/pre-rendered list (Part N). Empty: "no jobs match" with a filter-reset action. Error: generic retry state, never a raw error. Permissions: public. Event: `jobs_list_viewed`, `job_search_performed`. Completion: a job detail view or exit.
2. **Anonymous job detail → sign-in prompt.** Entry: job detail page. Steps: read job → click "Apply" or "Save". Response: redirect to `/auth` with a return URL back to the same job. Empty: n/a. Error: invalid/expired job → 404-style not-found. Permissions: public read, action requires auth. Event: `job_viewed`. Completion: candidate reaches `/auth`.
3. **Candidate saves a job.** Entry: signed-in, job detail or list card. Steps: click save icon → optimistic UI update → server write. Response: icon state toggles, job appears in `/my-career/saved-jobs`. Empty: n/a. Error: revert optimistic state, retry affordance. Permissions: owner-only write (existing `saved_jobs` RLS, unaffected by this revision). Event: `job_saved`. Completion: row exists in `saved_jobs`.
4. **Candidate views saved jobs.** Entry: `/my-career/saved-jobs`. Steps: list loads → candidate can unsave or open a job. Response: reuses `JobCard`. Empty: "You haven't saved any jobs yet" + link to `/jobs`. Error: standard error state. Permissions: owner-only read. Event: none required. Completion: n/a (browsing).
5. **Candidate applies internally.** Entry: job detail, `application_method = 'internal'`. Steps: click Apply → application form (cover note, optional CV, consent) → submit via `submit_job_application()` (Part G.2). Response: confirmation screen + entry in application history. Empty: n/a. Error: duplicate-application block ("You already applied," database `UNIQUE(job_id, applicant_user_id)`-backed), validation errors inline, upload failure with retry. Permissions: authenticated, one application per job per candidate. Events: `application_started`, `application_submitted`. Completion: row in `job_applications` with status `submitted`.
6. **Candidate applies externally.** Entry: job detail, `application_method = 'external'`. Steps: click Apply → interstitial dialog stating the candidate is leaving CQrityjob and CQrityjob cannot see the outcome → confirm → new tab to `application_url`. Response: no internal application record created. Permissions: public. Event: `external_application_opened` (job_id only, `user_id` only if signed in — subject to the analytics de-identification sweep, Part R). Completion: outbound navigation, tracked as an event only.
7. **Candidate views application history.** Entry: `/my-career/applications`. Steps: list loads, grouped by status (`submitted`/`viewed`/`withdrawn` only — see Part G.2). Response: each row links to job + shows status + submitted date. Empty: "No applications yet." Error: standard. Permissions: owner-only. Event: none. Completion: browsing. **Note:** an application that has passed the 12-month post-closure retention window (Part M) no longer appears here — this is a deliberate, disclosed data-lifecycle outcome, not a bug.
8. **Candidate withdraws an application.** Entry: application detail. Steps: click Withdraw → confirm → `withdraw_my_application()` (Part G.2, the only write path — no direct table UPDATE exists for this action). Response: status → `withdrawn`, employer view reflects it. Empty: n/a. Error: cannot withdraw an application not currently `submitted` or `viewed` (already withdrawn). Permissions: owner-only, must be the applicant, enforced inside the function before any write. Event: none required in MVP. Completion: `status='withdrawn'`, `withdrawn_at` set.
9. **Candidate account deletion with active applications.** Entry: account deletion flow (existing, out of this spec's scope to redesign). System behaviour: `job_applications.applicant_user_id` cascades on delete at the database level; associated CV files require the same explicit cleanup step used by the retention sweep (Part G.3, Part M) — cascade delete alone never removes a Storage object.
10. **Employer creates a job draft.** Entry: `/employer/$employerSlug/jobs/new`. Steps: progressive form sections (Part O) → save draft (manual save — Part J rationale, now paired with an optimistic-concurrency check, Low finding below). Response: draft appears in the employer's job list with `status='draft'`. Empty: n/a. Error: inline validation per field; the database also rejects any attempt to INSERT with a status other than `draft` (Part L, C1). Permissions: active employer member (any role) for their own **active** employer only. Event: `employer_job_draft_created`. Completion: row in `jobs` with `status='draft'`, `employer_id` = caller's employer.
11. **Employer edits and previews a draft.** Entry: job list → edit. Steps: edit fields → preview (renders using the same `JobCard`/detail components candidates see) → save. Response: preview matches what will actually publish. **Editing is only possible while the job is `draft` or `rejected`** — a `published` job cannot be opened in this editor at all (Part M1, below); the UI routes a "change a published job" request to the close-and-duplicate flow (#17) instead. Empty: n/a. Error: same inline validation, plus a stale-draft conflict message if `updated_at` has moved since the form was loaded (Low finding, below). Permissions: same as #10. Event: none required. Completion: draft updated.
12. **Employer submits for review.** Entry: draft or rejected job, "Submit for review". Steps: final validation (all MVP-required fields present, including a non-null `expires_at` within the maximum publication period — Part O.10/M2, and a complete application method) → submit. Response: status → `pending_review`; draft becomes read-only to the employer until a moderation decision — **the database trigger enforces this read-only state regardless of what the UI allows**, so a stale client cannot force a write past it. Empty: n/a. Error: blocked submission lists exactly which required fields are missing. Permissions: same as #10. Event: `employer_job_submitted`. Completion: `status='pending_review'`.
13. **Moderator reviews and approves.** Entry: `/admin/jobs` filtered to `pending_review`. Steps: checklist review (Part K) → approve. Response: `status='published'`, `published_at` and (validated, non-null) `expires_at` set, job becomes publicly visible (subject to employer being active). Empty: "No jobs pending review." Error: n/a. Permissions: `is_platform_admin()` — the only actor the trigger permits to perform this transition. Event: `job_published`. Completion: publicly queryable via `jobs_public_active_select`.
14. **Moderator rejects or requests changes.** Unchanged from v2. Permissions: `is_platform_admin()`. Event: none required beyond the audit trail.
15. **Employer closes a published job.** Entry: employer job list, published job. Steps: click Close → confirm. Response: `status='archived'` — **this is the only write an employer may ever make to a `published` row, and the trigger rejects the write outright if any content column changed in the same statement** (Part F, C1 — no more ambiguity about whether this uses a distinct "closed" transition: it is exactly the `published → archived` row in Part F's transition table, nothing else). Existing applications remain visible to the employer. Empty: n/a. Error: n/a. Permissions: active member of the owning **active** employer. Event: `job_closed`. Completion: job removed from public listing, applications preserved, retention clock starts (Part M).
16. **Job expires automatically.** Entry: `expires_at` passes. System behaviour: **`sweep_expired_jobs()` (Part E, data-model companion) is a MUST for MVP**, run at least daily, flipping `status='expired'` and writing a `job_audit_events(action='expired')` row. Candidate-facing visibility is unchanged by this sweep (`job_is_active()` already excludes past-expiry jobs from public queries regardless of stored status) — the sweep's purpose is to reach a durable terminal state so the retention clock (Part M) always eventually starts, closing what was previously an unbounded gap.
17. **Employer duplicates a published (or any) job into a new draft.** Entry: employer job list, "Duplicate." Steps: one click → new `draft` row with the same content, new `id`/`slug`, `status='draft'`. Response: employer edits before resubmitting; the original job is completely untouched. Permissions: same as #10 (a fresh INSERT, governed by the same draft-only INSERT rule as #10). Event: `employer_job_draft_created`. Completion: new draft row. **This is now the only supported way to change a published job's content — see Part M1.**
18. **Employer views applications for a job.** Entry: `/employer/$employerSlug/applications` or per-job tab. Steps: list loads, scoped to the employer's own jobs only, **and only while the employer is active** (Part L, H5). Response: candidate name/email (from account), cover note, CV download link (signed URL, itself gated on the same active-employer check), status, employer-note field. Empty: "No applications yet for this job." Error: standard. Permissions: active member of an **active** owning employer. Event: none required. Completion: browsing/managing.
19. **Employer marks an application reviewed / adds a private note.** Entry: application detail (employer view). Steps: mark viewed and/or add a note → `update_application_as_employer()` (Part G.2 — the only write path; there is no direct table UPDATE grant for this action, C2). Response: candidate sees "Reviewed by employer" if marked viewed; the note is never shown to the candidate under any circumstance. Permissions: same as #18. Event: none required. Completion: `status`/`employer_note` updated via the function, one `audit_logs` row written per change.
20. **Employer sees dashboard counts.** Unchanged from v2.

---

# PART D — Information Architecture and Routes

Unchanged from v2 — see the table below, reused as-is. No route changes were required by the design review; the fixes are entirely at the RLS/trigger/function layer beneath these routes.

| Route | Public/Auth | Required role | Loader behaviour | Feature flag | Unavailable state | SEO | Mobile |
|---|---|---|---|---|---|---|---|
| `/jobs` | Public | — | Existing `listPublicJobs`, extend to SSR-friendly loader (Part N — see the mandatory pre-H2 audit, M3) | `VITE_JOBS_ENABLED` | Existing "coming soon" | Indexable, canonical, `ItemList`-eligible | Existing responsive grid |
| `/jobs/$slug` | Public | — | Existing `getPublicJobBySlug`, add server-rendered head + `JobPosting` JSON-LD (Part N) | `VITE_JOBS_ENABLED` | 404-style not-found for invalid/expired-and-unlisted slugs | Indexable while active; `noindex` once closed/expired | Existing |
| `/jobs/family/$familyId`, `/jobs/profession/$professionSlug` | Public | — | Existing, unchanged | `VITE_JOBS_ENABLED` | Existing | Existing, extend with sitemap inclusion | Existing |
| `/my-career/saved-jobs` | Auth | Signed-in candidate | New: `listMySavedJobs()` joined to `jobs` | `VITE_JOBS_ENABLED` | Empty state (flow 4) | `noindex` (private) | New, reuses `JobCard`/`JobResults` |
| `/my-career/applications` | Auth | Signed-in candidate | New: `listMyApplications()` | `VITE_JOBS_ENABLED` | Empty state (flow 7) | `noindex` | New |
| `/my-career/applications/$applicationId` | Auth | Signed-in candidate, must own the application | New: `getMyApplication()` | `VITE_JOBS_ENABLED` | Not-found pattern if not owner | `noindex` | New |
| `/employer/$employerSlug/jobs` | Auth | Active member of an **active** `$employerSlug` | New: `listEmployerJobs()`, reads via `jobs_employer_select_own` RLS | `VITE_JOBS_ENABLED` AND `VITE_EMPLOYER_PORTAL_ENABLED` | G2's existing access-denied/coming-soon states | `noindex` | New |
| `/employer/$employerSlug/jobs/new`, `/jobs/$jobId` (edit — draft/rejected only), `/jobs/$jobId/preview` | Auth | Active member | New: draft CRUD via `jobs_employer_insert_draft`/`jobs_employer_update_editable` RLS + the transition-guard trigger | Same two flags | Same | `noindex` | New |
| `/employer/$employerSlug/applications`, `/applications/$applicationId` | Auth | Active member of an **active** employer | New: reads via `job_applications_employer_select`, writes exclusively via `update_application_as_employer()` | Same two flags | Same | `noindex` | New |
| `/admin/jobs` | Auth | `is_platform_admin()` | Existing `adminListJobs`, default view changes to `pending_review` first | — | Existing | `noindex` | Existing |
| `/admin/jobs/$id` | Auth | `is_platform_admin()` | Existing edit form, extended with approve/reject/request-changes actions | — | Existing | `noindex` | Existing |

**Decision (unchanged):** admin job creation (`/admin/jobs/new`) is kept, not removed.

---

# PART E — Job Data Model (summary — full detail in `jobs-mvp-v1-data-model.md`)

Updated to reflect the design-review fixes; the companion document carries the exact SQL.

**Reused unchanged:** `jobs`, `employers`, `employer_admin_meta`, `job_admin_meta`, `job_audit_events`, `job_import_sources`, `saved_jobs`.

**Additive migration on `jobs`:** salary/Career-Intelligence/provenance columns (unchanged from v2); the `application_method='internal'` unblock (unchanged); **`expires_at` becomes required at publish time, bounded to a maximum publication period (M2)**; **a new employer-facing RLS surface (`jobs_employer_select_own`/`_insert_draft`/`_update_editable`) paired with a trigger extension to `jobs_validate_before_write()` that enforces exactly which status transitions and column changes a non-admin actor may make (C1)** — this is the direct fix for the review's top Critical finding.

**`job_applications` (new), corrected from v2:** status is now `submitted`/`viewed`/`withdrawn` only — `closed` is removed (H4). **No direct `authenticated` UPDATE grant exists on this table at all** — every update happens through `withdraw_my_application()` or `update_application_as_employer()`, two SECURITY DEFINER server functions with a fixed column allow-list each, both writing to `audit_logs` (C2). `employer_id` is stamped by a `BEFORE INSERT` trigger, never trusted from the client.

**`job_analytics_events` (new):** unchanged shape from v2, now with an explicit two-tier retention/de-identification sweep (M4).

**New scheduled maintenance functions:** `sweep_expired_jobs()` (H3 — now a MUST, not a SHOULD), `sweep_application_retention()` (H2 — the single hard-delete model, resolving the v2 contradiction between this document and the data model), `sweep_analytics_retention()` (M4). Their scheduling mechanism is an explicitly open technical question (data-model companion).

**Explicitly not built (unchanged rationale from v2):** `application_status_history`, `job_moderation_events`, `job_categories`/`job_skills`/`job_professions`, `job_locations`, a separate employer-public-profile table.

**Provenance model:** unchanged from v2 — see Security Career Intelligence Integration, below.

---

# PART F — Job Lifecycle and State Machine

### States
`draft → pending_review → published → archived`, with `rejected` as a re-enterable side state and `expired` as **now a mandatory, actively-written passive state** (Part E, H3) rather than an optional audit-clarity nicety.

### Transitions

| From | To | Actor | Condition | Permission (RLS + trigger) | Audit | Candidate-facing | Employer-facing | Moderator-facing |
|---|---|---|---|---|---|---|---|---|
| (new) | `draft` | Employer member or platform admin | — | `jobs_employer_insert_draft` (employer) or admin path | `action='created'` | Not visible | Editable | Not visible until submitted |
| `draft` | `pending_review` | Employer member or admin | All MVP-required fields present, incl. a valid `expires_at` and a complete application method | `jobs_employer_update_editable` + trigger allow-list | `action='submitted'` | Not visible | Read-only until decision — **trigger-enforced, not just UI-hidden** | Appears in queue |
| `pending_review` | `published` | Platform admin **only** | Passes moderation checklist (Part K) | `is_platform_admin()` — **the trigger explicitly rejects this transition from any other actor, with no exception** | `action='published'` | Publicly visible | Read-only (see Part M1 — no in-place edits) | Removed from queue |
| `pending_review` | `draft` | Platform admin (request changes) | Reason required | `is_platform_admin()` | `action='changes_requested'` | Not visible | Editable, reason shown | Removed from queue |
| `pending_review` | `rejected` | Platform admin | Reason required | `is_platform_admin()` | `action='rejected'` | Not visible | Reason shown, re-submit allowed | Removed from queue |
| `rejected` | `pending_review` | Employer member | Re-submission after edits | `jobs_employer_update_editable` + trigger allow-list | `action='resubmitted'` | Not visible | Read-only again | Re-enters queue |
| `published` | `archived` | Employer member or platform admin | Manual close, **no other column may change in the same write (trigger-enforced)** | `jobs_employer_update_editable` + trigger allow-list, or admin | `action='closed'` | Removed from public listing; existing applicants keep their history | Job list shows "Closed" | Visible in admin history |
| `published` | `expired` | System (`sweep_expired_jobs()`) | `expires_at <= now()` | `service_role` only | `action='expired'` | Not returned by public queries (unchanged — already true before the flip) | Shown as expired in employer list | Visible in admin history |

**No `published → pending_review` transition exists**, and none is needed — Part M1 (below) replaces the v2 "pending change" concept entirely with a close-and-duplicate model that requires no such transition.

### Edge cases

- **Employer suspended mid-listing:** `employer_is_active_status()` already removes all of that employer's jobs from public visibility, **and now also removes the employer's own read/write access to those jobs and their applications** (Part L, H5) — no job-level change needed beyond what C1/H5 already specify.
- **Membership removed while a draft is in progress:** unchanged from v2 — the draft is preserved, owned by the employer entity.
- **Job expires with open applications:** applications remain visible to the employer (subject to the employer being active) and in the candidate's history until retention (Part M).
- **Published job edited:** **resolved — see Part M1.** An employer never edits a published job in place; they close it and duplicate it into a new draft, which goes through fresh moderation. The original published job is never modified except by the close transition itself.
- **Job rejected:** unchanged — re-submit path above, reason always shown.
- **Job duplicated:** unchanged — produces a new independent draft, never touches the original.
- **Employer closes a job with active applications:** unchanged — allowed, applications preserved.
- **External URL becomes invalid after publish:** unchanged — not continuously link-checked in MVP, relies on candidate reports (Part K/S).
- **Job never manually closed:** **resolved — see H3.** `sweep_expired_jobs()` guarantees every published job reaches `archived` or `expired` within the maximum publication period (default 90 days from `published_at`), so the retention clock (Part M) always eventually starts.

---

# PART G — Application Model

### G.1 Two supported methods, one required choice

Unchanged from v2: internal and approved external URL only, no employer email in MVP.

| | Internal | External URL |
|---|---|---|
| **Advantages** | CQrityjob owns the data | Zero build cost per employer |
| **Risks** | CQrityjob is a data controller for application content | No visibility into outcomes |
| **RLS implications** | Tenant-isolated table, **no direct UPDATE grant for any authenticated actor (C2)** | No new application-record RLS; only an anonymous, non-PII analytics event |
| **Analytics implications** | Full funnel: `application_started` → `application_submitted` | Only `external_application_opened` — never a synthetic `application_submitted` |
| **Candidate-facing wording** | "Apply on CQrityjob" | Interstitial dialog (existing `ExternalApplyDialog`) |
| **Moderation checks** | Consent copy present, no unlawful required fields | URL must be `https://`, plausible employer domain |

### G.2 Internal application — fields, behaviour, and the three write paths

Required sign-in. Duplicate prevention via `UNIQUE(job_id, applicant_user_id)`.

| Field | Required? | Source | Notes |
|---|---|---|---|
| Name, email | Required | Candidate's existing account | Never re-asked |
| Phone | Optional | New form field | — |
| Cover note | Optional | New form field, plain text, ≤1000 characters | — |
| CV | Optional | Upload or leave blank | Full design in G.3 |
| Consent checkbox | Required | New, links to privacy notice | Timestamped |

**All writes to `job_applications` happen through exactly three server functions — there is no other write path (C2):**

1. **`submit_job_application()`** — the initial candidate submission. INSERT-only, via the RLS-scoped authenticated client (`job_applications_owner_insert`); `employer_id` is re-derived server-side by a database trigger regardless of client input, never trusted.
2. **`withdraw_my_application()`** — candidate-only. May only move `status` from `submitted`/`viewed` to `withdrawn`, and only for the caller's own application. No other column is ever touched.
3. **`update_application_as_employer()`** — employer-only. May only set `status='viewed'` (from `submitted`) and/or `employer_note`. Never touches `cover_note`, CV fields, `phone`, `consent_given_at`, `applicant_user_id`, or `withdrawn_at`. Requires the caller to hold an active role at an **active** employer, checked explicitly inside the function, not assumed from an earlier read.

**Status shown to the candidate — resolved (H4): `Submitted` → `Reviewed by employer` (only if the employer marks it) → `Withdrawn` (candidate-initiated). There is no fourth state and no candidate-facing "Rejected" or "Closed" status of any kind.** An employer's private assessment of an application is captured only in `employer_note` — free text, employer-only, never surfaced to the candidate, never presented as an automated or CQrityjob decision. This removes the v2 model's undefined `closed` status entirely rather than defining it, since no version of "expose this to the candidate" was consistent with the platform's own stated anti-liability design goal.

**Explicitly not requested:** unchanged from v2 — no national ID, criminal-record extracts, security-clearance documents, medical information, or excess licence documentation.

### G.3 CV upload — full security design

Unchanged core design from v2 (optional, PDF/DOCX, 5MB, magic-byte + extension validation, randomised storage path, private bucket, signed URLs, replacement/deletion rules, audit events, phased malware-scanning plan), with three additions from the design review:

- **Access now requires the employer to be active, not just a member (H5):** signed-URL issuance re-checks `has_employer_role() AND employer_is_active_status()` together — a suspended employer's members lose CV access immediately, matching every other employer-facing surface in this spec.
- **Filename sanitisation (Low finding):** `cv_original_filename` is untrusted, candidate-controlled text. It is HTML-escaped wherever displayed and passed through a strict sanitiser (strip control/path/quote characters, cap length) before use in any `Content-Disposition` header. It is never used to construct the storage object path, which is always the random-UUID pattern regardless of filename.
- **Rate limiting (M5):** upload/replace is capped (proposed default: 5/hour/user), checked against `audit_logs` before the write — see the data-model companion for the full mechanism and the explicit note that the concrete implementation is a required, launch-blocking H6 technical decision, not settled by this default.

**Retention — resolved (H2, replacing the v2 contradiction):** at the end of the retention window (Part M), `sweep_application_retention()` **hard-deletes both the `job_applications` row and its CV Storage object together — no partial anonymization, no residual row.** This is now the single answer in both documents; the prior v2 disagreement (main spec said "file + row," data model said "file only") is resolved in favour of the full hard delete, per owner direction that personal application data must not be retained indefinitely in any form.

**Malware scanning:** phased plan unchanged from v2 — strict validation + private bucket + signed URLs + never executing files server-side as the launch control set; live AV scanning as a required fast-follow; the residual risk requires explicit owner acceptance.

---

# PART H — Search, Filters, and Taxonomy

Unchanged from v2. Smallest high-value MVP filter set (profession, family, location, work arrangement, employment type); seniority/skills/licences/salary stored but not yet filterable; database-supported full-text search over an external search product; URL-driven filter state; no-result and pagination handling reused from existing patterns.

---

# PART I — Career Intelligence Connection

Unchanged pointer section — the full architecture is in the Security Career Intelligence Integration section, immediately below.

---

# SECURITY CAREER INTELLIGENCE INTEGRATION

Unchanged from v2 in its entirety — the design review raised no findings against this section. Every job remains a structured node mapped to the existing CIG taxonomy (`cig_professions`, `cig_profession_families`, `cig_skills`, `cig_profession_skill_req`), never a parallel one; relevance stays deterministic and explainable, extending the already-built Phase E `relevanceForJob()`; provenance metadata is added narrowly, not blanket, with a hard rule that no AI-generated or inferred value may become a live requirement or eligibility gate without human confirmation.

*(Full field-by-field mapping table, the explainable-relevance rule set, and the provenance model are unchanged from the prior revision — reproduced in full below for document completeness.)*

### Audit of the existing structures

- **CIG** — `cig_professions` (~49 seeded rows), `cig_profession_families` (14-value canonical whitelist), `cig_skills`, `cig_profession_skill_req` (importance/criticality).
- **CIE** — separate, hardcoded English-slug dataset, bridged to CIG via `LEGACY_TO_CIG_SLUG`/`toCigSlug()` (lossy in places, pre-existing, not fixed here).
- **Career Center** — independent, not bridged to CIG or CIE, and not bridged here either.
- **Existing jobs schema linkage** — `jobs.profession_slug`, `jobs.family_id`, `jobs.related_profession_slugs`.
- **Existing candidate relevance** — `relevanceForJob()`, driven by `assessment_runs.result_summary`.

### The rule this section enforces

Reuse existing identifiers and tables wherever a mapping already exists; never create a parallel job taxonomy.

| Career Intelligence dimension | Existing source of truth | Job field/relation | Required/Optional | Who enters it | Public? | Moderation need | Future matching value | Migration need | Fallback if taxonomy coverage is missing |
|---|---|---|---|---|---|---|---|---|---|
| Primary profession | `cig_professions.slug` | `jobs.profession_slug` | Required | Employer, dropdown | Yes | Low | High | None | Nearest family only, flagged for moderator follow-up |
| Related professions | `cig_professions.slug[]` | `jobs.related_profession_slugs` | Optional | Employer, 0–3 | Yes | Low | Medium | None | Empty array valid |
| Profession family | 14-value whitelist | `jobs.family_id` | Required | Derived from profession | Yes | None | High | None | Always derivable |
| Required skills | `cig_skills`/`cig_profession_skill_req` | `jobs.required_skill_ids` | Optional | Employer, profession-filtered picker | Yes | Low | High | Additive column | Empty picker if no CIG rows exist |
| Preferred skills | Same | `jobs.preferred_skill_ids` | Optional | Same | Yes | Low | Medium | Same | Same |
| Seniority | — | `jobs.seniority` | Optional | Employer | Yes | Low | Medium | Additive | Unset valid |
| Experience level | `jobs.experience_level` | Reused, form-tightened | Optional | Employer | Yes | Low | Medium | App-layer only | Existing free-text rows valid |
| Education/training | — | `jobs.education_requirements` | Optional | Employer, free text | Yes | High | Low (MVP) | Additive | Blank valid |
| Licences/authorisations | `jobs.formal_requirement_ids` (existing, newly wired) | Same | Optional | Employer, controlled list + reviewed "other" | Yes | High | High | UI wiring only | "Other" reviewed pre-publish |
| Language requirements | `jobs.language_requirements` | Reused | Optional | Employer | Yes | Low | Medium | None | — |
| Work environment | `jobs.workplace_type` + new `jobs.work_environment` | New | Optional | Employer | Yes | Low | Medium | Additive | Unset valid |
| Work arrangement | `jobs.workplace_type` | Reused | Required | Employer | Yes | Low | High | None | — |
| Shift pattern | `jobs.shift_work`/`night_work` | Reused | Optional | Employer | Yes | Low | Medium | None | — |
| Leadership responsibility | — | `jobs.leadership_responsibility` | Optional | Employer | Yes | Low | Medium | Additive | Default false |
| Travel requirement | `jobs.travel_required` | Reused | Optional | Employer | Yes | Low | Low-medium | None | — |
| Security-vetting mention | `jobs.security_vetting_mentioned` | Reused | Optional | Employer, guided copy | Yes | High | Medium | None | — |
| Career dimensions | Phase E career profile | Candidate-side only | N/A | N/A | N/A | N/A | Connective tissue | N/A | N/A |
| Assessment dimensions | Same | Never a job-authoring input | N/A | N/A | N/A | N/A | Boundary is the safeguard | N/A | N/A |

### Explainable job relevance

Deterministic rule set: exact profession match → family match → skill overlap → work-arrangement/location compatibility where expressed. Candidate-facing copy is factual and reason-based, never scored. Prohibited: employability scores, suitability percentages, hidden rankings, "is qualified" claims, automated approval/rejection. No profile/no preference → no relevance panel at all, never a guess.

### Provenance model

`source_type`, `mapping_reviewed_by`/`_at` populated where a mapping is entered/corrected; `confidence_level`/`inference_method`/`model_version` reserved, unpopulated in MVP. Hard rule: no AI-generated or inferred value becomes a live requirement or eligibility gate without human confirmation — no MVP exception.

---

# PART J — Employer Experience

Dashboard integration unchanged from v2. Job list/create/edit: manual save, now paired with an optimistic-concurrency check (Low finding — the save function rejects a write if the draft's `updated_at` has moved since the form loaded, surfacing a "this draft changed elsewhere, reload to continue" message rather than silently overwriting a co-worker's edits). Preview renders through the same components candidates see. **A published job is never opened in the editor** — Part M1 replaces in-place editing entirely with close-and-duplicate. Duplicate is a same-employer-only action, available from both draft and published jobs. Close/expire per Part F. View/manage applications exclusively through `update_application_as_employer()` (Part G.2). Permissions: owner/admin/member get the same job-management capability in MVP.

**Explicitly NOT built (unchanged):** advanced hiring pipelines, interview scheduling, offer management, onboarding, payroll, full ATS automation.

### M1 — Published job editing: close-and-duplicate, not in-place versioning

**Resolved.** The v2 specification's "pending change" language implied a versioning workflow the schema never supported. This revision replaces it with an explicit, lean model requiring no new schema:

- **Employers cannot directly overwrite a published job's content.** The database trigger (Part F, C1) rejects any write to a `published` row other than the close transition itself.
- To change a published listing, an employer **closes it** (`published → archived`, flow 15) **and duplicates it into a new draft** (flow 17, same clone mechanism already used for a fresh listing).
- The new draft goes through moderation from scratch, exactly like any other submission.
- **The originally published job remains unchanged and stays in its `archived` state** — it is not silently replaced, and its historical applications remain attached to it, not to the new draft.
- **Limitation, stated plainly:** this means a live job cannot be lightly corrected (a typo fix) without taking it offline and re-queuing it for moderation. This is an accepted MVP trade-off in exchange for zero new schema and a database-enforced integrity guarantee that a published listing's content, once approved, cannot silently drift. In-place versioning (a true `job_versions`/pending-edit model) is explicitly deferred (Part X).
- **UX requirement:** the employer job list must clearly label a closed-for-editing job as "Closed — edited copy in drafts" (or similar) when a duplicate exists, so an employer doesn't mistake the archived original for something still live.
- **Audit:** the close action writes `job_audit_events(action='closed')`; the new draft's creation writes `action='created')` as any new job would — no new audit action is needed for this flow.

---

# PART K — Moderation and Trust

Unchanged from v2. Five-minute checklist (legality/discrimination, genuineness, fraud/spam, content quality, "verified" language); claim-type distinctions (employer-claimed / CQrityjob-reviewed / CQrityjob-verified-employer, not built / CQrityjob-verified-requirement, not built); `employer_admin_meta.verified` stays hidden from candidate UI until a real process exists; `job_admin_meta.duplicate_of` wiring remains a SHOULD.

---

# PART L — Security, RLS, and Authorization

### Access matrix — corrected (resolves H1)

**The prior revision's matrix conflated three different access shapes into one column, which is exactly what produced the H1 contradiction (it said employers have no application-write access, while the data model and flow C.19 both required it).** This revision separates them explicitly.

Legend: **●** = full direct access · **○** = row-scoped direct access · **F** = server-function-mediated only (no direct table grant) · **—** = no access at all.

| Actor | Read published jobs | Read own jobs (any status) | Write `jobs` (draft/rejected only, trigger-guarded) | Close a published job (trigger-guarded, no content change) | Submit/approve/publish `jobs` | Read own applications | Write own application (withdraw only) | Read employer's applications | Write employer's applications (viewed/note only) | Read employer data | Analytics write |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Anonymous | ● | — | — | — | — | — | — | — | — | Public fields only | `external_application_opened` only, no PII |
| Candidate | ● | — | — | — | — | ○ | **F** (`withdraw_my_application`) | — | — | Public fields only | Own events |
| Employer member (active, employer active) | ● | ○ | ○ (`jobs_employer_update_editable` + trigger) | ○ (same policy, trigger-restricted to close-only) | **—, trigger-blocked with no exception** | — | — | ○ (`job_applications_employer_select`, active-employer-gated) | **F** (`update_application_as_employer`) | ○ (`employers_member_select`) | Own employer's events |
| Employer member, **employer suspended** | ● (public listing unaffected by their own status) | **—** | **—** | **—** | — | — | — | **—** | **F, but the function itself now fails the active-employer check too** | **—** | — |
| Content editor/moderator | ● | ● (all, for review) | — (moderation fields live on `job_admin_meta`, a separate admin-only table) | — | Approve/reject/request-changes | — | — | — (not a default moderator surface — Part L note below) | — | ● | — |
| Platform admin/superadmin | ● | ● | ● (exempt from the employer trigger guard) | ● | ● | ● (support/audit) | ● (one narrow admin-only UPDATE policy, audited) | ● | ● | ● | ● |

**Explicit decision (unchanged from v2):** moderators review job listings, not candidate applications by default — a moderator needing application access for a specific abuse investigation goes through the platform-admin path.

**Explicit decision (new, resolves H5):** every row above involving an employer actor is conditioned on `employer_is_active_status()`, not membership alone. A suspended employer's members retain **zero** access to jobs, applications, CVs, or employer-note content from the moment suspension takes effect — enforced at the RLS layer (`jobs_employer_*`, `job_applications_employer_select`) and re-checked again inside every server function that touches employer-scoped data (`update_application_as_employer`, the CV signed-URL issuance function), so a cached authorization result from before suspension can never be exploited.

### Security requirements

Unchanged principles from v2 (active membership required, route slug never authorization, tenant isolation via `employer_id`, no frontend service-role usage, server-side validation of every write, CV storage policies, rate limiting, enumeration prevention, CSRF/XSS, external URL validation, audit logs, least privilege, fail-closed), now with two concrete, previously-missing enforcement points: **the `jobs` transition guard (C1)** and **the removal of all direct `authenticated` UPDATE access to `job_applications` (C2)** — both specified in full in the data-model companion, not merely asserted here.

---

# PART M — GDPR and Data Governance

**Retention — resolved to a single model (H2).** Personal application data (the `job_applications` row) and CV files are **hard-deleted together**, 12 months after the parent job reaches a terminal state (`archived` or `expired` — both now guaranteed within a bounded time by mandatory automatic expiry, H3) or 12 months after the application's own withdrawal, whichever is earliest. There is no partial-anonymization/residual-row model — this replaces the v2 disagreement between the two documents with one answer, applied consistently. Aggregate, non-personal statistics (e.g. total applications received by a job) are derived independently from `job_analytics_events`, which has its own separate de-identification/purge policy (Part R) — `job_applications` is never kept around, even partially, to serve a statistics purpose.

Controller/processor assumption, lawful basis, minimisation, purpose limitation, employer access after job closure, auditability, and international-expansion caveats are otherwise unchanged from v2 — all flagged for legal confirmation, not asserted as settled.

**Retention clock — resolved (H3).** The v2 gap (a job that never manually closes never starts its retention clock) is closed by making `sweep_expired_jobs()` a MUST for MVP: every published job is now guaranteed to reach `archived` or `expired` within the maximum publication period, so the 12-month clock always eventually starts for every application.

**Analytics retention — resolved (M4).** `job_analytics_events` rows with a `user_id` are de-identified (user_id nulled) after 90 days; fully anonymous rows are purged after 24 months. `user_id` is never retained indefinitely without a stated purpose — see the data-model companion for the exact sweep.

File deletion remains an explicit application-level/scheduled-function step, never assumed automatic from a database cascade (repeated here because it is the single most likely implementation gap, per the design review's own emphasis).

---

# PART N — SEO and Discoverability

**Decision: keep SEO fully in MVP scope**, unchanged from v2.

**Approach comparison and selection:** unchanged — route-specific SSR/prerendering for `/jobs`, `/jobs/$slug`, `/jobs/family/$familyId`, `/jobs/profession/$professionSlug` only; every authenticated/employer/admin route stays `ssr:false`.

### M3 — SSR technical audit is now an explicit, required pre-H2 task

**Resolved.** The v2 specification described the `ssr` flip as though it were purely a configuration change. It is not necessarily one: the existing public job query layer was documented in its own prior-phase code comments as browser-client-based, with SSR explicitly out of that phase's original scope. Flipping `ssr:true` on a route without confirming the underlying data-fetching layer is server-safe risks a mid-phase scope surprise in H2. **A dedicated audit task — not new scope, a verification step — is now required before H2's implementation work begins**, covering:

- Whether `listPublicJobs`/`getPublicJobBySlug` (and the profession/family list equivalents) can execute in a server-loader context as written, or need porting to a server-safe Supabase client pattern (matching how `createServerFn`-based functions elsewhere in this codebase already work).
- TanStack Start route-loader behaviour under `ssr:true` for this specific route tree, including how it interacts with the existing `_authenticated` layout boundary (these routes are public, so this should be unaffected, but must be confirmed, not assumed).
- Any client-only dependency (`window`, `document`, browser-only Supabase client instantiation) currently present in the render path for these routes.
- How `JobPosting` JSON-LD and per-job `<head>` metadata will actually be rendered into the server response (a `head()` function alone, evaluated in a server loader context, vs. a separate server-rendering step).
- Sitemap generation's own data-fetching path, to confirm it doesn't share the same browser-client assumption.

**Outcome required before H2 is scoped as "S–M" complexity (Part W):** confirm whether this is a pure config flip or requires porting the query layer. If the latter, H2's complexity/timeline estimate is revised accordingly — this audit exists specifically to avoid discovering that mid-phase.

### M2 — `validThrough` is now guaranteed, not merely required in prose

**Resolved.** `expires_at` is a database-enforced, non-null field at publish time (Part E, data-model companion), bounded to a maximum publication period. Every published job therefore always has a valid `validThrough` value available for its structured data — the v2 gap (an optional column backing a "required" SEO property) is closed at the schema level, not left to form validation alone.

**Required for MVP (unchanged from v2 otherwise):** `JobPosting` JSON-LD with all Google-required properties; canonical URLs; individual job URLs in `sitemap.xml`; closed/expired jobs return `noindex`; multilingual metadata for the sv/en content that already exists.

### hreflang — resolved (Low finding), descoped rather than promised unsupported

**The v2 specification listed `hreflang` as an MVP SEO requirement without confirming the routing model supports it.** Conventional `hreflang` tagging requires distinct URLs per language variant; this application serves sv/en job content from a single URL per job with locale selected client-side/account-side, not via a URL segment. Implementing `hreflang` correctly under that structure is not meaningfully possible without a locale-routing change that is out of scope for this MVP. **Decision: `hreflang` is removed from the MVP requirement.** A lighter-weight `content-language` hint (if easily available from the existing i18n system) may be included opportunistically; proper `hreflang` support is deferred to a future phase that includes a locale-URL-routing decision (Part X — SHOULD EXIST SOON, not MVP).

---

# PART O — Content Model and Job Form

Unchanged core design from v2 (progressive sections, CIG-sourced selectors, platform-derived family). Two field-level changes from the design review:

| Field | Change |
|---|---|
| **Expiry / listing validity (`expires_at`)** | **Now required before submission for review** (was implicitly optional in v2) — the employer must select an expiry date within the platform's maximum publication period (default 90 days from intended publish date); the form blocks submission without it, and the database trigger blocks publish without it regardless (Part E, M2). |
| **CV upload (candidate-facing, Part G.3)** | Displayed filename is sanitised before render; upload is rate-limited (Part G.3, M5). |

Everything else in Part O — the representative field table, the condensed remaining-fields list, internal moderation-only fields, future-only fields, content-safety rules — is unchanged from v2.

### O.10 Salary data

Unchanged from v2 — nullable structured fields, not mandatory for the Swedish MVP given Sweden's paused EU Pay Transparency Directive transposition, flagged for country-specific legal review before international expansion.

---

# PART P — UX and Accessibility

Unchanged from v2.

---

# PART Q — Notifications

Unchanged event table from v2, with one upgrade: **an in-app "expiring soon" / "expired" indicator on the employer job list is now MVP** (was previously bundled into a deferred "Job expiring soon" row) — it's a direct, cheap read of the now-mandatory `expires_at` field, and matters more now that expiry is automatic rather than optional. Email/push notification for the same event remains a SHOULD-soon; no email infrastructure is introduced in MVP.

---

# PART R — Analytics and Success Metrics

Unchanged event list and launch metrics from v2, with one addition: **`job_analytics_events` retention is now explicitly defined (M4)** — `user_id`-linked rows are de-identified after 90 days, fully anonymous rows are purged after 24 months, applied uniformly across all event types including `external_application_opened`. `user_id` is never retained indefinitely without a stated analytical purpose.

---

# PART S — Administration

Unchanged from v2. Pending-moderation queue, employer context switcher, basic filters, suspicious-listing indicator, expired-jobs view (now backed by the mandatory `sweep_expired_jobs()`, H3, rather than a query-time-only computation). Employer quality signals (internal-only, no public score) unchanged.

---

# PART T — Edge Cases

Unchanged 1–20 from v2, with two additions and one correction:

8. Candidate withdraws an application → **corrected:** blocked only if the application is not currently `submitted` or `viewed` (already withdrawn) — no reference to a `closed` state, which no longer exists (H4).
21. **(new) Job reaches its maximum publication period without manual closure** → `sweep_expired_jobs()` flips it to `expired` automatically; candidate-facing visibility is unaffected (already excluded by `job_is_active()`); the retention clock for its applications starts from this event if it hasn't already (H3, M).
22. **(new) Scheduled sweep fails partway through a run (e.g. `sweep_application_retention()` deletes some rows before an error)** → each sweep function runs as its own transaction per the SQL shown in the data-model companion; a mid-run failure rolls back that function's own batch rather than leaving a partial state — the next scheduled run picks up any rows the failed run didn't reach. No manual reconciliation step is required for MVP beyond re-running the sweep.

---

# PART U — Acceptance Criteria (Given/When/Then, representative set)

Unchanged criteria from v2, plus new criteria covering the design-review fixes:

**C1 (employer cannot bypass moderation):** Given an authenticated employer member with an active membership, when they attempt to directly UPDATE a `jobs` row they own to `status='published'` (bypassing submission and approval), then the write is rejected by the database trigger regardless of what RLS would otherwise permit for that row.

**C1 (employer_id cannot be hijacked):** Given an employer member editing their own draft, when they attempt to change `employer_id` to a different employer's id in the same write, then the write is rejected by the database trigger.

**C1 (published jobs are immutable except for closing):** Given a published job, when its owning employer attempts to change any content column in the same statement as closing it, then the write is rejected; when they change only `status` to `archived` with no other column touched, then the write succeeds.

**C2 (no direct application tampering):** Given a candidate's own submitted application, when the candidate (or anyone) attempts a direct table UPDATE to `job_applications` rather than calling `withdraw_my_application()`, then the write is rejected (no UPDATE policy exists for `authenticated`).

**C2 (function-level column allow-lists):** Given an employer marking an application as viewed via `update_application_as_employer()`, when the function runs, then only `status` and/or `employer_note` change — `cover_note`, CV fields, and `applicant_user_id` are provably unchanged.

**H5 (suspended employer loses application/CV access immediately):** Given an employer member with a previously-valid session, when their employer's status changes to `suspended`, then their next request to read applications, read employer-scoped jobs, or obtain a CV signed URL fails, with no residual access from a prior successful check.

**H3 (mandatory expiry):** Given a published job with `expires_at` in the past, when `sweep_expired_jobs()` next runs, then the job's `status` becomes `expired` and a `job_audit_events(action='expired')` row is written; the job was already excluded from public listings before this run (unchanged behaviour, confirmed by this criterion so the two facts aren't conflated).

**M2 (`validThrough` always present):** Given an employer attempts to submit a job for review without an `expires_at` value, then the submission is blocked before it can ever reach a state where `JobPosting` structured data would be generated without `validThrough`.

**H4 (no candidate-facing rejection signal):** Given an employer sets a private `employer_note` on an application without marking it viewed, when the candidate views their own application, then the candidate sees `Submitted` — never the note, never a `Rejected`/`Closed`-style status.

*(Full Given/When/Then coverage across every flow and transition remains expected at implementation time — this section demonstrates the required pattern and depth.)*

---

# PART V — Test Plan

Unchanged test categories from v2, with explicit new coverage:

**Database/RLS/trigger (expanded):** every transition in Part F's table, attempted by every actor in Part L's matrix, both the intended path (succeeds) and every disallowed path (fails) — specifically: employer attempts `draft→published` directly (fails), employer attempts `employer_id` change (fails), employer attempts a content edit alongside `published→archived` (fails), employer attempts a content-only edit to a `published` row with no status change (fails), admin performs every transition (succeeds, unaffected by the guard). Direct `authenticated` UPDATE attempts against `job_applications` (all fail, regardless of row ownership). `withdraw_my_application()`/`update_application_as_employer()` column-allow-list verification (attempt to smuggle an out-of-list column change through each function's parameters where the function signature would even allow it — should be structurally impossible, verified by function signature review, not just a runtime test). Suspended-employer access cutoff, tested immediately after a status change with no caching window. `sweep_expired_jobs()`/`sweep_application_retention()`/`sweep_analytics_retention()` each tested for correct row selection, idempotency (running twice produces no duplicate effects), and partial-failure recovery (edge case 22).

**Everything else** (unit, integration, route, E2E, cross-tenant, accessibility, mobile, multilingual, SEO/structured-data, storage/file-upload, moderation, regression, named personas) is unchanged from v2 in structure, updated only to reflect the new function names and the corrected status set (`submitted`/`viewed`/`withdrawn`, no `closed`).

---

# PART W — Implementation Phases

| Phase | Objective | Scope | Excluded | Reuses | DB changes | Flags | Complexity | GO condition |
|---|---|---|---|---|---|---|---|---|
| **H0** | Audit + this specification | Read-only audit, this document (now v3) | Everything else | — | None | None | S | Owner approves this document |
| **H1** | **Expanded per design review:** Career Intelligence/salary/application-method schema, **employer-write RLS + transition-guard trigger on `jobs` (C1)**, `job_applications` table with **no direct UPDATE grant** (C2's schema half), **mandatory-expiry trigger + `sweep_expired_jobs()` (H3)**, `sweep_application_retention()`/`sweep_analytics_retention()` (H2/M4), `job_analytics_events` table + RLS, CV storage bucket | No UI yet; the two application server functions (`withdraw_my_application`, `update_application_as_employer`) are written but not yet wired to any route | Existing migration/trigger conventions | Yes — the largest single DB step in this plan, now larger than v2's scope by design | None flipped yet | **M→L** (complexity increased by the review's required fixes) | Migration + full RLS/trigger test suite (Part V) verified in staging before any later phase begins; **the scheduling-primitive question (data-model companion) is resolved before H1 is considered complete** |
| **H1.5 (new)** | SSR technical audit (M3) | Confirm whether `public-queries.ts` and related loaders are server-safe as-is, or need porting | Any actual SSR implementation (that's H2) | — | None | None | S | Written findings determine whether H2's complexity estimate below still holds |
| **H2** | Public jobs completion: filters, detail, SEO/structured data | `ssr` flip (scope confirmed by H1.5), `JobPosting` JSON-LD (now always-valid per M2), sitemap inclusion, canonical tags (`hreflang` removed from scope per the Low-finding resolution) | Employer/candidate-facing new features | Existing `JobCard`/`JobResults`/public-queries (or their H1.5-confirmed replacement) | None beyond H1 | `VITE_JOBS_ENABLED` can now safely flip in staging | S–M, **pending H1.5's finding** | Rich Results Test passes on a real job page with a guaranteed `validThrough` |
| **H3** | Employer job creation, editing, preview, management | New employer routes (Part D), form (Part O, now with required expiry field), close-and-duplicate UX (M1) | Applications, moderation extensions | G2/G3 shell, C1's schema/RLS/trigger from H1 | None beyond H1 | `VITE_EMPLOYER_PORTAL_ENABLED` | M | An internal test employer completes draft→submit end-to-end, **and a direct attempt to self-publish or edit a published job fails as expected**, in staging |
| **H4** | Moderation, publishing, closure, expiry, trust controls | Extend `/admin/jobs`; wire `duplicate_of` | Candidate-facing applications | Existing admin console, H1's trigger | Minor — none beyond H1 | None new | S–M | A moderator completes the full approve/reject/request-changes cycle; expiry sweep confirmed running on schedule |
| **H5** | Saved jobs, explainable relevance | `/my-career/saved-jobs`, relevance UI extension | Applications | Existing `saved_jobs` table, Phase E's `relevanceForJob()` | None | None new | S | Saved-jobs UI passes accessibility + mobile checks |
| **H6** | Internal/external application flow, secure CV storage | Wire `submit_job_application`/`withdraw_my_application`/`update_application_as_employer` to routes; CV upload per Part G.3 | Nothing beyond the application flow itself | H1's schema/RLS/functions, existing `ExternalApplyDialog` | None beyond H1 | None new | L (highest-risk phase) | Full Part V storage/file-upload + column-allow-list test suite passes; owner has explicitly accepted the CV malware-scanning residual risk; **the rate-limiting mechanism (M5) is confirmed as a concrete implementation, not left as the data-model companion's default recommendation** |
| **H7** | Candidate application history, employer application view | `/my-career/applications*`, `/employer/.../applications*` | — | H6's data | None | None new | M | Cross-tenant test suite passes; suspended-employer cutoff re-verified in this UI specifically |
| **H8** | Analytics, accessibility, security, launch hardening | `job_analytics_events` wiring, full WCAG pass, full RLS re-audit | New features | — | None | None new | M | Full Part V test plan green |
| **H9** | Controlled feature-flag activation and production verification | Staged flag flip, production RLS/pg_policies before/after capture | — | Existing flag-flip precedent | None | Both flags → `true`, staged | S | Owner sign-off after a real end-to-end cycle in production |

**Explicit rejection of a single uncontrolled release:** unchanged — each phase ships independently reviewable, testable, and reversible.

---

# PART X — MVP vs Later

### MUST EXIST FOR JOBS MVP V1
Unchanged core list from v2, with two items promoted from implicit/optional to explicit MUST: **automatic job expiry (`sweep_expired_jobs()`)** and **the employer-write RLS/trigger guard on `jobs`** — both were always logically required for the MVP to be safe, but v2 left them unspecified; this revision makes them explicit, named MUST items. Also added: `job_analytics_events` retention sweep, `job_applications` retention sweep, the SSR technical audit as a gating pre-H2 step.

### SHOULD EXIST SOON AFTER LAUNCH
Unchanged from v2, plus: **in-place published-job versioning** (a true `job_versions`/pending-edit model, superseding the MVP's close-and-duplicate approach — M1); **proper `hreflang` support**, contingent on a future locale-URL-routing decision; live malware scanning for CV uploads (unchanged); email/push notifications (unchanged); `duplicate_of` wiring (unchanged); candidate data-export button (unchanged).

### DEFER
Unchanged from v2.

---

# PART Y — Risks and Decisions

| Risk | Likelihood | Consequence | Mitigation | Owner | Launch-blocking? |
|---|---|---|---|---|---|
| **Employer moderation bypass or `employer_id` hijack via direct write** | **Was: real, unmitigated. Now: closed by design** (C1 — RLS + trigger) | Was High | `jobs_validate_before_write()` extension + employer-scoped RLS, verified by the Part V test suite | Implementation team | **No longer blocking — resolved by this revision, verification required in H1** |
| **`job_applications` column tampering via direct UPDATE** | **Was: real, unmitigated. Now: closed by design** (C2 — no UPDATE grant, function-mediated only) | Was High | RLS removes the grant entirely; two narrow SECURITY DEFINER functions with fixed column allow-lists | Implementation team | **No longer blocking — resolved by this revision, verification required in H1** |
| Discrimination/legal liability for employer-authored content | Medium | High | Part K checklist, Part O field-level flags | Moderation team | **Yes** |
| CV malware risk without live scanning | Low-medium | Medium | Part G.3 phased plan; requires explicit owner risk acceptance | Owner | **Yes, pending owner decision** |
| GDPR controller/processor ambiguity | Medium | Medium-high | Explicit legal review flagged in Part M | Owner/legal | Should resolve before H6 |
| **Retention clock previously depended on an optional manual close** | **Was: real structural gap. Now: closed** (H3 — mandatory expiry) | Was Medium-High | `sweep_expired_jobs()` bounds every published job to a maximum publication period | Implementation team | **No longer blocking — resolved by this revision** |
| **Analytics `user_id` retained indefinitely** | **Was: real gap. Now: closed** (M4) | Was Medium | Two-tier de-identify/purge sweep | Implementation team | **No longer blocking — resolved by this revision** |
| Ghost/fake job listings eroding candidate trust | Medium | Medium | Part K checklist + candidate-report affordance | Moderation team | No (mitigated, not eliminated) |
| Marketplace cold start | High (structural) | Medium | Concierge-style seeding | Founder | No |
| Moderation workload at scale | Low at launch, rising | Medium | Five-minute checklist, admin tooling | Founder/moderation | No |
| CIG taxonomy coverage gaps | Medium | Low | Explicit per-field fallback behaviour | Content team | No |
| SEO structured-data errors | Low-medium (now lower — `validThrough` is guaranteed) | Medium | Rich Results Test as a hard H2 gate | Implementation team | Should resolve before H2 completes |
| **SSR flip is more than a config change** | Medium (unconfirmed until H1.5) | Medium — could inflate H2's timeline if discovered mid-phase | **H1.5 audit task, run before H2 starts (M3)** | Implementation team | Should resolve before H2 begins |
| **No confirmed scheduling primitive for the three sweep functions** | Medium | Medium — retention/expiry mechanisms exist as functions but nothing invokes them without this | Confirm `pg_cron` availability or an external scheduler before H1 is complete | Implementation team | **Should resolve before H1 is considered complete** |
| **No existing rate-limiting pattern in this codebase** | High (confirmed absent) | Medium | Lean default given (audit-log-backed counting); **explicit H6 technical decision required, launch-blocking for H6** | Implementation team | **Yes, for H6 specifically — not H1** |
| Lack of an isolated staging database for full-scale RLS drills | Medium | Medium | Reuse the disposable-Postgres methodology from `tests/database/phase-g1/` | Implementation team | No |

### Architecture decision log

Unchanged 1–9 from v2, plus:

10. **Employer transition guard lives in the database trigger, not application code alone** (C1) — rejected alternative: trusting server-function/UI validation only, which the design review found insufficient given this codebase's own admitted "never trust the client" principle.
11. **`job_applications` has no direct UPDATE grant for any non-admin actor** (C2) — rejected alternative: RLS policies with row-level but not column-level restriction, which the review found allows exactly the tampering it was meant to prevent.
12. **`job_applications.status` drops `closed` entirely rather than defining it** (H4) — rejected alternative: defining a candidate-facing meaning for it, which the review found unavoidably reads as a rejection signal regardless of wording chosen.
13. **Published jobs are closed-and-duplicated, never edited in place** (M1) — rejected alternative: a `job_versions`/pending-edit schema, deferred as unnecessary complexity for a lean MVP once the simpler model was made explicit.
14. **Automatic job expiry is a MUST, not a SHOULD** (H3) — rejected alternative: leaving it optional, which the review found created an unbounded gap in the retention model's own trigger condition.
15. **Application/CV retention is a full hard delete, no anonymized residual row** (H2) — rejected alternative: keeping a de-identified row for statistics, which duplicates what `job_analytics_events` already does more safely and simply.

---

# PART Z — Final Build Brief for Lovable

**First implementation phase: H1 only**, now with the expanded scope this revision defines. Nothing else begins until H1 is verified.

**Files/systems affected in H1:**
- One migration (or a small, reviewable set of additive migrations — splitting the trigger/employer-RLS work from the new-tables/storage work is a reasonable option, at the implementer's discretion, so long as each is independently rollback-tested): additive columns on `jobs`; the `application_method='internal'` unblock; the `expires_at`-required-at-publish extension (M2); **the employer transition-guard extension to `jobs_validate_before_write()` (C1)**; **the three new `jobs` RLS policies for employer reads/inserts/updates (C1)**; new `job_applications` table **with no direct UPDATE grant for `authenticated`** (C2), its `employer_id`-stamping trigger, and its SELECT/INSERT policies (paired with `employer_is_active_status()`, H5); new `job_analytics_events` table + RLS; `job_audit_events.action` CHECK extension; **the three scheduled maintenance functions** (`sweep_expired_jobs`, `sweep_application_retention`, `sweep_analytics_retention`).
- A new private Storage bucket + policies for CV files, gated on the same active-employer check.
- `withdraw_my_application()` and `update_application_as_employer()` are specified in full in H1 but **wired to a route only in H6** — H1 delivers the safe, function-only write surface; H6 delivers the UI that calls it.
- No route files, no UI, in H1.

**Migration requirements:** additive only, `ALTER POLICY`/`CREATE TABLE`/`ADD COLUMN`/`CREATE OR REPLACE FUNCTION` style, never a destructive rewrite. Every new RLS policy and the trigger extension must be verified live (before/after `pg_policies` capture, plus explicit transition-by-transition testing per Part V) in a staging/dev project before merge.

**Feature flags:** neither flag changes in H1.

**Security rules:** every new table gets tenant-isolated RLS from creation; CV storage is private-bucket-plus-signed-URL from day one; **`job_applications` has no direct UPDATE grant for any non-admin actor from the moment the table is created — there is no window where a naive open policy exists even temporarily.**

**Required tests before H1 is considered done:** the full RLS/trigger verification suite (Part V); the resolvable typecheck command; `bun run cie:check`/`bun run kg:check` remaining green; a rollback drill; **explicit confirmation of the scheduling primitive for the three sweep functions** (data-model companion) — H1 is not complete without this answered, even though wiring the actual schedule may complete just after, before H2 begins.

**What Lovable must NOT build yet:** any route under `/employer/$employerSlug/jobs*` or `/my-career/saved-jobs`/`applications*`; any change to `/admin/jobs`'s UI; the CV upload UI; the concrete rate-limiting thresholds beyond the recommended default (H6 decision); any flag flip.

**When to stop and request owner approval:** immediately after H1's migration and full test suite are complete and reported — before H1.5 begins, and again after every subsequent phase's GO condition in Part W.

---

CQRITYJOB JOBS MVP V1 SPECIFICATION V3 — DESIGN REVIEW FIXES APPLIED — READY FOR OWNER REVIEW
