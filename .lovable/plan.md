
# Sprint 07 — Production Backend, Authentication & Platform Architecture

Planning only. No files modified. No backend enabled until this plan is approved.

---

## 1. Executive recommendation

**Adopt Lovable Cloud as the primary backend.** Lovable Cloud runs on Supabase under the hood (Postgres + Auth + Storage + Edge/Server functions + RLS) with EU-region projects available, so it satisfies every hard requirement (GDPR, EU residency, RLS, RBAC, storage, audit) while giving this small team the fastest path to launch and the lowest operational overhead. The existing TanStack Start app already uses the Lovable Cloud client patterns (`requireSupabaseAuth`, server functions, RLS-first data model), so adoption is additive rather than a rewrite.

Portability is preserved: schema lives in versioned SQL migrations, code lives in GitHub, and the underlying Supabase project can be exported or self-hosted later if needed. Direct Supabase and hybrid setups add operational cost (separate dashboards, key management, billing) with no meaningful capability gain at this stage. Reject option B and C.

**Next Build sprint (Sprint 08):** enable Lovable Cloud, ship the MVP schema in §4, wire authentication (email/password + Google) and the `_authenticated` gate, add candidate profile stub + saved-assessment persistence. Nothing else.

---

## 2. Recommended architecture

- **Frontend:** existing TanStack Start app (SSR on public routes, `_authenticated` layout for gated routes).
- **Backend:** Lovable Cloud (Postgres 15, Supabase Auth, Storage, RLS, server functions via `createServerFn`).
- **Server logic:** `createServerFn` for app-internal reads/writes; `src/routes/api/public/*` for webhooks and cron only.
- **AI (future):** Lovable AI Gateway; all AI actions logged to `ai_actions` with grounding sources and human-review status.
- **Email (future):** Lovable Email for transactional + invitations.
- **Environments:** dev (Lovable preview) → staging (published preview) → production (`cqrityjob.com`).
- **Region:** EU (Frankfurt or Stockholm) for GDPR residency.

---

## 3. Architecture diagram (text)

```text
                       ┌────────────────────────────┐
                       │  Public web (cqrityjob.com)│
                       │  TanStack Start SSR        │
                       └──────────────┬─────────────┘
                                      │
                 ┌────────────────────┼─────────────────────┐
                 │                    │                     │
        Public routes         _authenticated/*        /api/public/*
        (career center,        (candidate,             (webhooks,
         assessment,            employer,               cron, MCP)
         jobs list,             admin)
         SEO)                          │
                 │                    │                     │
                 └─────── createServerFn (RPC) ──────────────┘
                                      │
                        Lovable Cloud (Supabase, EU)
        ┌─────────────┬───────────────┬────────────┬──────────────┐
        │   Auth      │   Postgres    │  Storage   │  Server fns  │
        │  (email,    │   + RLS       │  (CVs,     │  (edge)      │
        │   Google,   │               │  logos)    │              │
        │   MFA)      │               │            │              │
        └─────────────┴───────┬───────┴────────────┴──────────────┘
                              │
                    Audit log · Backups · PITR
                              │
                        Lovable AI Gateway (later)
```

---

## 4. MVP database schema

Legend: **[MVP]** ship Sprint 08–11 · **[P2]** ship with jobs/employer · **[Later]** professional assessment, AI, reporting.

Identity & tenancy
- `profiles` **[MVP]** — 1:1 with `auth.users`. Fields: `id`, `display_name`, `locale`, `country`, `created_at`. PII: low.
- `user_roles` **[MVP]** — platform-level roles (`superadmin`, `admin`, `content_editor`, `assessment_editor`, `support`). Separate table (never on profiles) with `has_role()` SECURITY DEFINER.
- `organizations` **[P2]** — `id`, `slug`, `name`, `country`, `status` (`pending|approved|suspended`), `type` (`employer|customer`), `created_at`.
- `organization_members` **[P2]** — `(org_id, user_id, role)` where role ∈ `owner|admin|recruiter|hiring_manager|reviewer|workforce_manager|viewer`. Enables multi-org membership.
- `organization_invitations` **[P2]** — `org_id`, `email`, `role`, `token_hash`, `expires_at`, `accepted_at`.

Career Center (mostly static, seeded from code today)
- `professions`, `competencies`, `education`, `certifications`, `career_paths` **[MVP-seed]** — migrated from `src/lib/career-center/*` in a later phase. In MVP the code remains the source of truth; DB mirror is created when admin editing is needed. PII: none.

Assessment engine
- `assessments` **[MVP]** — enum: `security_career_guidance`, later `professional_*`.
- `assessment_versions` **[MVP]** — `MODEL_VERSION`, `DISCLAIMER_VERSION`, published_at.
- `questions`, `question_options`, `question_dimension_mappings`, `profession_target_profiles` **[P2 — DB mirror]** — code remains source until admin editing.
- `assessment_runs` **[MVP]** — `id`, `user_id` (nullable for anon), `assessment_id`, `version_id`, `started_at`, `completed_at`, `locale`.
- `assessment_answers` **[MVP]** — `run_id`, `question_id`, `value_json`. PII: sensitive.
- `assessment_results` **[MVP]** — `run_id`, `top_matches_json`, `confidence`, `model_version`, `disclaimer_version`. PII: sensitive.
- `result_explanations` **[Later]** — persisted human/AI explanations tied to a result.

Candidate
- `candidate_profiles` **[MVP-lite → P2]** — `user_id`, `headline`, `summary`, `location`, `visibility`. MVP fields minimal.
- `candidate_competencies`, `candidate_education`, `candidate_certifications` **[P2]**.
- `cv_files` **[P2]** — Storage object refs + metadata.
- `saved_jobs`, `job_alerts` **[P2]**.

Jobs
- `jobs` **[P2]** — `org_id`, `title_bi`, `description_bi`, `profession_id`, `location`, `employment_type`, `workplace_type`, `experience_level`, `sector`, `status` (`draft|pending|published|expired|rejected`), `apply_mode` (`external_url|internal`), `apply_target`, `expires_at`, SEO fields.
- `job_categories` **[P2]** — join to professions/competencies.
- `job_applications` **[P2 / later]** — only if internal apply used.

Professional assessment (kept structurally separate)
- `professional_assessment_invites` **[Later]** — org-issued invite to candidate/employee.
- `professional_assessment_runs` **[Later]** — separate table from `assessment_runs` to enforce data separation.
- `professional_assessment_reports` **[Later]** — org-visible artefacts, consent-gated.

Governance
- `audit_logs` **[MVP-lite]** — `actor_id`, `actor_role`, `action`, `subject_type`, `subject_id`, `org_id`, `ip_hash`, `ua_hash`, `at`, `metadata_json`. Append-only.
- `consent_records` **[MVP]** — `user_id`, `purpose`, `granted_at`, `revoked_at`, `policy_version`.
- `data_export_requests`, `deletion_requests` **[MVP]** — GDPR SAR/erasure queue.
- `ai_actions` **[Later]** — every AI call: prompt hash, model, inputs ref, outputs, sources, reviewer, status.
- `human_approvals` **[Later]** — links `ai_actions` → approver → decision.

Every `public.*` table ships with explicit `GRANT`s per the platform rule.

---

## 5. User & role model

Individuals
- **Visitor** — unauthenticated. Read public content only.
- **Candidate** — authenticated user with a `profiles` row. Default role for signups.
- **Security professional** — same auth as candidate; a flag/badge on candidate profile, no separate account model.
- **Consultant (future)** — candidate + `consultant` marker; no separate table in MVP.

Organizations (membership-based; a user may belong to multiple orgs)
- `owner` — full org control incl. billing, deletes.
- `admin` — manage members, jobs, settings; cannot delete org.
- `recruiter` — create/edit jobs, view applicants.
- `hiring_manager` — view assigned jobs and applicants.
- `assessment_reviewer` — view professional assessment reports the org owns.
- `workforce_manager` — invite existing personnel to professional assessments.
- `viewer` — read-only org dashboards.

Platform (in `user_roles`)
- `superadmin`, `admin`, `content_editor`, `assessment_editor`, `support`.

Isolation
- Every org-scoped row carries `org_id`; RLS uses `is_member_of(org_id)` / `has_org_role(org_id, role)` SECURITY DEFINER helpers.
- Candidate results are user-owned and never joined to an org unless the user explicitly shares (via a professional invite acceptance).
- Personal career-guidance data and professional-assessment data live in different tables with different policies; no view unifies them.

Invitations: org admin creates `organization_invitations` (email + role + token) → email link → invitee signs in → server fn validates token and creates `organization_members`.

---

## 6. RLS & authorization model

Helpers (SECURITY DEFINER, `search_path = public`):
- `has_role(uid, role)` — platform role.
- `is_member_of(uid, org_id)` / `has_org_role(uid, org_id, role)` — org membership.
- `owns_row(uid, user_id_col)` — trivial equality, expressed inline usually.

Example policies (illustrative only):

```sql
-- Candidate profile: owner read/write; support read (audited)
create policy candidate_self_rw on public.candidate_profiles
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy candidate_support_read on public.candidate_profiles
  for select to authenticated
  using (public.has_role(auth.uid(), 'support'));

-- Saved career results: strictly owner
create policy runs_self on public.assessment_runs
  for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Jobs: public read only when published; org members manage
create policy jobs_public_read on public.jobs
  for select to anon, authenticated
  using (status = 'published' and (expires_at is null or expires_at > now()));

create policy jobs_org_manage on public.jobs
  for all to authenticated
  using (public.is_member_of(auth.uid(), org_id))
  with check (public.is_member_of(auth.uid(), org_id));

-- Professional assessment reports: org access only, and only for the specific org that commissioned it
create policy pa_reports_org_read on public.professional_assessment_reports
  for select to authenticated
  using (public.has_org_role(auth.uid(), org_id, 'assessment_reviewer')
      or public.has_org_role(auth.uid(), org_id, 'admin')
      or public.has_org_role(auth.uid(), org_id, 'owner'));

-- Audit logs: no direct client access; superadmin via server fn only
alter table public.audit_logs enable row level security;
-- (no policies for authenticated → effectively deny; server uses service role)
```

Rules
- One org **never** sees another org's data — every org-scoped policy uses `org_id` in the predicate.
- Candidate can never read another candidate's row — user-scoped tables use `user_id = auth.uid()`.
- Support access is read-only and always logged to `audit_logs` via a server fn wrapper.
- Superadmin actions bypass RLS only through `supabaseAdmin` in vetted server fns, each of which writes an audit row.

---

## 7. Assessment data-separation model

| Aspect | Career-guidance | Professional |
|---|---|---|
| Owner | Individual (`user_id`) | Organization (`org_id`) + subject user |
| Purpose | Self-exploration | Recruitment / competence development |
| Consent | Terms + implicit for self-use | Explicit consent per invite, versioned |
| Visibility | Only the user | Reviewers within the commissioning org |
| Sharing | User may export/share manually | Never cross-org; report generated per commission |
| Withdrawal | Delete run at any time | Subject may withdraw before finalization; report frozen after |
| Human review | Not required | Required before report is released |
| Retention | User-controlled | Org retention window (default 12 months) |
| Storage | `assessment_*` tables | `professional_assessment_*` tables (separate) |
| Audit | Minimal | Full audit trail |

No SQL view or server fn joins the two domains. Cross-domain analytics, if ever needed, go through an aggregated, de-identified pipeline (Later).

---

## 8. Candidate MVP

**Must have**
- Sign up / sign in (email + Google), email verification, password reset.
- Persist career-guidance result (`assessment_runs` + `assessment_answers` + `assessment_results`).
- View own past results with model/disclaimer version.
- Retake assessment.
- Delete account + export data (GDPR).

**Should have**
- Minimal profile (display name, locale, country).
- Saved jobs (once jobs ship).
- Career action plan (already deterministic; persist selected plan).

**Later**
- CV upload, competencies/education/certifications, job alerts, public profile visibility, consultant flag.

---

## 9. Employer MVP

**Must have**
- Organization creation (via admin approval) + owner role.
- Invite team members with role.
- Create job draft → submit for moderation → published/rejected.
- View own jobs and status.
- Choose application destination (external URL vs internal — see §10 recommendation).

**Should have**
- Organization profile page (logo, description, website).
- Basic org dashboard (job counts).

**Later**
- Invite candidate to professional assessment, invoices, analytics, workforce management.

---

## 10. Jobs MVP

Scope: public list, detail, search, employer draft/publish, admin moderation, expiration, bilingual content, profession/competency links, location, employment type, workplace type, experience level, sector, org profile, SEO metadata.

**Application flow recommendation: external-link only in MVP.** Reasons: eliminates PII handling for applications, no CV storage requirement, no applicant-tracking obligations, faster launch, matches how WordPress currently operates. Internal application is a Phase 2 add-on once volume justifies the compliance surface (CV storage, malware scanning, notifications, ATS export).

---

## 11. Admin MVP

Custom-built (minimal UI)
- Org approval queue.
- Job moderation queue (approve/reject with reason).
- User lookup + suspend.
- GDPR request queue (export/deletion).

Handled via Lovable Cloud dashboard initially (defer custom UI)
- Direct table edits for professions/competencies/etc.
- Audit-log inspection.
- Backup/restore.

Publish content status (`researched → reviewed → published`) stays code-driven until the DB mirror lands.

---

## 12. GDPR & privacy

**Before MVP launch (P0)**
- EU region, DPA with Lovable/Supabase on file.
- Privacy notice + cookie/consent notice (public site).
- Lawful basis map: contract (accounts, jobs), consent (marketing, professional assessment), legitimate interest (security).
- Data minimization on signup.
- Export & delete flows (`data_export_requests`, `deletion_requests` + server fns).
- Consent records versioned.
- Sub-processor list published.

**Before professional assessments**
- Controller/processor clarification per commission.
- Purpose-limited access, explicit subject consent, retention policy, right to withdraw before finalization.
- DPIA (assessment data is behavioural profiling — specialist review required).

**Before AI**
- Model + prompt disclosure to users.
- No training on user data by default.
- Human-review workflow for consequential outputs.
- DPIA update.

Specialist legal review required for: DPIA, cross-border transfers, professional-assessment consent wording, AI transparency notices.

---

## 13. Security architecture

| Item | Priority |
|---|---|
| EU region, env separation (dev/staging/prod) | P0 |
| Secrets in Lovable secrets store; never in repo | P0 |
| RLS on every user/org table; explicit GRANTs | P0 |
| Password policy + HIBP leak check | P0 |
| Security headers (CSP, HSTS, X-Frame-Options, Referrer-Policy) | P0 |
| CORS locked to app origins | P0 |
| Rate limiting on auth + public server fns | P0 |
| Audit log for admin/support actions | P0 |
| Automated backups + PITR | P0 |
| Dependency updates cadence | P0 |
| MFA for admin roles | P1 |
| File-upload malware scan + type/size limits | P1 (with CV upload) |
| CAPTCHA on signup + job posting | P1 |
| Access reviews (quarterly) | P1 |
| Support impersonation with audit + time-boxed token | P1 |
| Production monitoring + alerting | P1 |
| Incident runbook + tabletop | P1 |
| SSO for staff, SIEM integration, pentest | P2 |

---

## 14. AI-native foundation (no AI built yet)

Ship structurally now, populate later:
- Enum & config for `ai_actions.status`: `draft | ai_generated | human_reviewed | approved | rejected`.
- Every AI feature must write to `ai_actions` with: model id, prompt version, input refs, output, sources, org_id (nullable), user_id (nullable), reviewer, decision.
- Prompts versioned in code (`prompts/*.md`) with a version constant; `ai_actions.prompt_version` records it.
- Model-agnostic wrapper via Lovable AI Gateway; no direct provider SDKs in components.
- Grounding: retrieval sources referenced by stable IDs (profession id, competency id, source URL) and stored on the action.
- Consent gate: no personal data enters a prompt without a matching `consent_records` row.
- Deletion cascade: user erasure removes/anonymizes `ai_actions` inputs.
- Restricted tools: AI cannot write to jobs, profiles, or assessment results directly — only propose drafts that require human approval.

Tables now: none. Add `ai_actions` + `human_approvals` only when the first AI feature ships.

---

## 15. Deployment & environments

- **Dev:** Lovable preview per branch.
- **Staging:** dedicated Lovable Cloud project (`*-staging`), seeded with synthetic data.
- **Production:** separate Lovable Cloud project, EU region, backups + PITR on.
- **GitHub:** trunk-based; feature branches → PR → preview → merge → staging → production publish.
- **Migrations:** SQL migrations checked into repo; applied via Lovable Cloud migration flow; never hand-edit prod schema.
- **Rollback:** DB PITR; frontend rollback via previous published build.
- **Approvals:** production publish is an explicit action; requires a green staging run.

---

## 16. WordPress replacement plan

1. Freeze WordPress content changes window.
2. Full WordPress backup (DB + uploads).
3. URL inventory + traffic export from analytics.
4. Content export (pages, posts, jobs, legal pages).
5. Map every WP URL → new route; produce redirect map (301) stored as a route or edge rule.
6. Migrate legal pages first (privacy, terms, cookie).
7. Migrate jobs (script export → import into `jobs`).
8. Rebuild sitemap + robots; submit to Search Console.
9. Parallel-run new platform on subdomain (e.g. `app.cqrityjob.com`) for UAT.
10. Production acceptance test: auth, assessment persistence, job publishing, GDPR export/delete, redirects, SEO parity.
11. DNS cutover: switch `www.cqrityjob.com` A/ALIAS to Lovable; keep WP reachable at `legacy.cqrityjob.com` for N days.
12. Monitor 404s and search rankings for 30 days.
13. Shutdown criteria: <0.1% 404 rate on top URLs, no critical GDPR/support issues, rankings stable → decommission WP.

---

## 17. Phased roadmap

1. **Sprint 08 — Backend foundation**
   - Enable Lovable Cloud (EU), baseline schema (profiles, user_roles, consent_records, audit_logs, data_export_requests, deletion_requests, assessment_runs/answers/results).
   - Objective: persistent identity + saved career results.
   - Acceptance: signed-in user can complete assessment and see prior runs; GDPR export/delete stubs work; RLS enforced.

2. **Sprint 09 — Auth polish & candidate MVP**
   - Email/password + Google, verification, reset, `_authenticated` gate, minimal profile, delete account UI, export data UI.

3. **Sprint 10 — Organizations & employer accounts**
   - `organizations`, `organization_members`, invitations, org profile.

4. **Sprint 11 — Jobs MVP (external-apply)**
   - `jobs`, moderation queue, public list/detail with SEO, employer draft/publish.

5. **Sprint 12 — Admin moderation UI**
   - Org approval, job moderation, GDPR queue, user lookup, audit view.

6. **Sprint 13 — WordPress migration**
   - Content + jobs import, redirect map, DNS cutover to `www.cqrityjob.com`.

7. **Sprint 14 — Career action plan persistence + saved jobs**
   - Small candidate value-adds.

8. **Sprint 15 — Professional assessment pilot**
   - Separate schema, invite flow, consent, human-review report.

9. **Sprint 16 — AI foundation**
   - `ai_actions`, prompt versioning, human approval, first AI feature (career explanation).

10. **Sprint 17+ — Workforce intelligence, AI Security Strategist, analytics, MFA, internal applications.**

Dependencies flow top-down. Risks: legal review for professional assessment and AI (schedule specialist review early). Out-of-scope items are held to their sprint.

---

## 18. P0 / P1 / P2 decisions

**P0 (before public launch on cqrityjob.com):** Lovable Cloud EU, auth, RLS, GDPR export/delete, consent, audit log, security headers, backups, rate limiting, WordPress redirects.

**P1 (weeks after launch):** Admin MFA, malware scan (with CV upload), CAPTCHA, monitoring/alerting, internal applications (if demanded), support impersonation with audit.

**P2 (later):** SSO for staff, SIEM, pentest, BankID/Freja, professional assessment at scale, AI workforce intelligence, advanced org analytics, invoicing.

---

## Next Build sprint (proposed)

**Sprint 08 — Backend foundation & saved career results**
- Enable Lovable Cloud (EU region).
- Migrations: `profiles`, `user_roles` + `has_role`, `consent_records`, `audit_logs`, `assessments`, `assessment_versions`, `assessment_runs`, `assessment_answers`, `assessment_results`, `data_export_requests`, `deletion_requests` — with GRANTs and RLS per the platform rule.
- Wire email/password + Google auth; `_authenticated` gate (integration-managed).
- Persist a completed career-guidance run for signed-in users; anonymous flow unchanged.
- "My results" page listing prior runs with model/disclaimer version.
- GDPR request stubs (server fns writing to the queues + admin viewable in Lovable Cloud dashboard).

No jobs, no employer, no admin UI, no AI in Sprint 08.

Awaiting approval to switch to build mode and start Sprint 08.
