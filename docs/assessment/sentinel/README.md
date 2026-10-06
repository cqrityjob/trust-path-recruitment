# Sentinel – abstrakt problemlösning · original pilot v1

Complete fixed-form assessment integrated into CQrityjob's existing Testbank, shared `SendTestDialog`/assignment/invitation pipeline, Academy and employer report routes. Stable slug: `abstract_reasoning_v1`. Swedish/English; three untimed practice tasks; twenty scored tasks; configured 25 minutes. No runtime AI, proctoring, new billing, ranking or Security Passport evidence.

## Content and approval

Ten original constrained families: rotation, quantity, position, shape, fill, reflection, distribution, superposition (union of occupied positions), alternation and compound (rotation + fill; quantity + position). Forty candidates, four per family; proposed twenty choose two per family and progress by **designDifficulty**. This is an engineering estimate. Observed difficulty, norms, reliability and validity are unmeasured.

Every item stores template/version, generator version, seed, variant, rules, key, per-option mistake strategy and engineering review. Structural hashes normalize atom ordering. Visual hashes also normalize circle orientation/reflection, square quarter turns and vertical reflection of triangles; these are limited encoded SVG equivalences, not perceptual or ambiguity proofs. Independent validation derives observed row relationships and checks the missing-cell constraint, distribution columns, unique options and positions. Bounded retries reject duplicate content.

The repository is public. **The proposed private pilot bank and keys are not committed.** `bun run sentinel:content --output /private/path/content.sql` creates a mode-0600 private import, using a 256-bit random seed and a separate opaque version identifier. `bun scripts/sentinel-review.tsx /private/path/content.sql /private/path/review.html` produces the exact offline gallery of forty candidates and three exercises. The author-only in-app gallery is `/admin/assessments/sentinel`. Neither gallery creates approvals. Synthetic preview seed 1000 is deliberately reproducible and is never a production form.

Checklist before activating any real assignment:

- [ ] Mostafa reviews the actual private bank, selected twenty, solutions and alternative plausible interpretations; records item decisions.
- [ ] Review SVG readability, distractor clues, keyboard, zoom, mobile and Swedish/English copy.
- [ ] Approve the fixed form and instruction/report wording. Record who approved which exact version and when in the release record; do not substitute an engineering test for approval.
- [ ] Resolve purpose, candidate information, retention, deletion and pilot data access with the existing privacy policy owner.
- [ ] Obtain the existing closed-test grant for the intended organisation; approve deployment/backup using the established release process.
- [ ] Import the private content in the authorised environment, record approval timestamps and enable assignments only after the above decisions. Never commit the private import or gallery.

New assignments are disabled by default. `preview_only` permits a complete rehearsal only for organisations already in `scp_fixture_access` and still requires the existing grant. No approvals or grants for real organisations are created by this migration. The public migration creates catalog metadata but requires the separate private import before questions can be assigned.

## Session, access and reporting

The database owns start/deadline, questions, revision, responses, finalisation and scoring. Sessions snapshot the entire private item specifications/version at allocation, so generator changes do not alter historical attempts. Candidate responses expose question/option SVG data and allowed state only; opaque IDs have no family/seed information. Practice solutions are intentionally separate and visible.

Start and repeated finish are idempotent; retries of already accepted identical saves do not increment the revision. A conflicting stale tab reloads and requires explicit retry. No answer arriving after the deadline is accepted. Server reads finalise an overdue session; a continuously open runner polls and requests finalisation at expiry. If every client is offline, finalisation is lazy at the next authorised read, using the original deadline and accepted answers. There is no added background scheduler.

Unsaved responses remain visibly pending with retry and blocked navigation/submission. Refresh restores accepted responses. The server deadline persists across reconnects and tabs. Unacknowledged pending responses are not described as received. Timing excludes information/practice. Extended time is authorised by a permitted employer owner/admin before start and appears in the receipt/report context.

Score: one per correct, zero otherwise; no speed bonus/negative marking. Separate counts for correct, incorrect and unanswered; percentage means percentage correct. Version, date, allocated/elapsed time and completion/timeout are shown. Candidate reports remain withheld until employer release. Employer reads reuse `scp_attempt_reports_readable`, including active organisation and existing permitted report-reader roles. Release/accommodation require owner/admin plus readable report access. No privileged client flags or submitted score/deadline are accepted.

Private form/session tables have RLS enabled, no client policies and revoked client table access. Explicit authenticated RPCs enforce ownership/tenant permissions. The internal scorer and triggers are not client callable. Session account/assignment foreign keys cascade into the existing account-erasure discovery workflow. No new demographic data, tracking, standalone export or retention policy is introduced; the policy decision remains a release prerequisite.

The assessment requires visual perception. Keyboard access does not provide equivalence for blind participants. Information directs the participant to their existing employer conversation for an alternative process or pre-start accommodation.

## Shared integration

The existing single and batch send paths continue to handle application/job scoping, entitlements, receipt retries and invitations. `scp_employer_assign` receives one minimal protected-content existence exception; its remaining checks stay intact. All applicable shared selectors (Testbank, overview, candidate list and application detail) use the same content library and send setup. No interview case is required. Learning/development programme assignment is outside this recruitment pilot; it does not introduce a career assessment or alter the two existing profession assessments.

Existing list/timeline read models are enriched with safe Sentinel status/counts/title/report availability. Generic competency submission is refused for Sentinel to prevent mixed scoring/evidence. Before migration installation, missing Sentinel metadata/report RPCs fall back to the existing library/report behavior.

## Pilot protocol

After explicit release approval, assign the reviewed fixed version only to authorised pilot participants using the existing Send assessment flow. Explain the pilot, purpose, timing, result visibility and visual limitations beforehand. Use the existing employer conversation to collect instruction clarity, ambiguous items, readability and technical interruption feedback. Do not add demographics or a new tracking system.

Existing authorised session records provide accepted item responses, completion/timeout/unanswered counts, duration and accommodation. Technical usability analysis is separate from later psychometric study; this implementation supplies no norms or job-performance prediction. Restrict any future aggregate analysis to authorised data and separate it from identifiable response records. Stop new assignments when a problematic item is identified; review an explicitly new fixed-form version and preserve the old sessions. Do not imply forms are equivalent.

## Disable/rollback

Disable **new** assignments while preserving historical sessions and reports:

```sql
UPDATE public.sentinel_forms SET assignments_enabled=false;
```

Do not replace the bank/version for existing assignments. The full rollback file `supabase/rollback/20270301090000_sentinel_abstract_reasoning_rollback.sql` refuses if any sessions exist. Before any data exists it removes the additive objects and restores the shared assignment condition; afterward use the disable flag and retain history. No production operation has been performed.

See [evidence.md](evidence.md) and [sources.md](sources.md). Screenshots use synthetic local accounts and synthetic questions only; private proposed keys/seed must never enter public CI artifacts.
