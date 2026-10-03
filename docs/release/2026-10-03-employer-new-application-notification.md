# Employer e-mail on a new application

**Status: PENDING.** Nothing is merged, nothing was written to the hosted
database, and no e-mail was sent (the sandbox holds no provider key and cannot
reach one).

| Part                   | File                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| Migration              | `supabase/migrations/20270205090000_employer_new_application_notices.sql`                            |
| Rollback               | `supabase/rollback/20270205090000_employer_new_application_notices_rollback.sql`                     |
| SQL suite              | `supabase/tests/employer_new_application_notices_test.sql` (108 assertions, EN1-EN9)                  |
| SQL controls and races | `scripts/db-test.sh`, "employer new-application notice"                                              |
| Edge function kind     | `supabase/functions/transactional-email/index.ts` (one `KINDS` line)                                 |
| Sender                 | `src/lib/email/send-employer-application-notice-email.server.ts`                                     |
| Server module          | `src/lib/recruitment/employer-notice.server.ts`                                                      |
| Wiring                 | `submitJobApplication`, `src/routes/api.recruitment.receipts-sweep.ts`, `scripts/receipts-sweep.ts`  |
| Guard                  | `bun run employer-application-notice:check`, `bun run negative-controls:employer-application-notice` |

Migration versions `20270206090000` and `20270207090000`, reserved for this
work, are **not used**: one migration is one release unit.

## 1. What and why

Owner requirement ("alternative A"): the **employer must be e-mailed when a
candidate submits a new application** to one of its jobs. Until now it saw only
in-app counts, and nobody looked at the page until they happened to.

Requirements, and where each is met:

| Requirement                                      | How                                                                                                                                                                                                                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Safe recipient control                           | Recipients are chosen **only in SQL** (section 2). The request, the client and every candidate field have no say; the address is read from `auth.users` inside a `SECURITY DEFINER`, `service_role`-only function.                                                              |
| Retry without duplicate sends                    | An outbox with an atomic, leased claim (section 3), and the provider's own `Idempotency-Key` on **every** attempt: `employer-new-application:<outbox row id>`.                                                                                                                  |
| No candidate personal data in the mail           | The mail renderer has **no candidate parameter** (type-level), the claim hands over none, and the guard renders with hostile and candidate-bearing input. The mail says a new application arrived, for which vacancy, at which organisation, why _you_ get it, and links to it. |
| The apply request must not become slower or fail | No trigger. After the commit and the candidate's receipt the server queues the notice (cheap SQL) and makes **one** attempt inside a hard **3-second** budget; the rest is left for the sweep. A missing migration is a logged no-op.                                           |
| Honest outcomes                                  | `sent` only when the provider accepted (2xx). Every other answer is recorded with its HTTP status. Nothing about it is ever shown to the candidate.                                                                                                                             |

## 2. Who is written to

`rec_employer_notice_recipients(application)` (`SECURITY DEFINER`,
`service_role` only):

1. **The responsible recruiter** (`recruitment_settings.responsible_user_id`),
   when they are an **active member of an active organisation** and their
   account can be written to. Then they are the only recipient, whatever their
   role (a plain member who is responsible is written to).
2. **Otherwise all active owners and admins** of the active organisation:
   owners first, then admins by seniority, **at most 10**.

Never a recipient:

- a plain member who is not the responsible recruiter;
- an invited, suspended or removed member (`employer_memberships.status`);
- anybody in an organisation that is not `active` (`pending`, `suspended`,
  `draft`, `archived` ...);
- a platform admin who is not a member of the organisation;
- an account with **no address**, an **unconfirmed** address, or a **disabled**
  account (`auth.users.banned_until` in the future). These are skipped, and the
  fall-through to owners and admins applies the same filter;
- a "responsible" person who is not a member of the application's organisation.

If the responsible recruiter is set but is no longer an active member (or cannot
be written to), the notice falls through to the owners and admins rather than
going nowhere.

**The cap is 10 recipients per application.** An organisation with more than
ten owners and admins writes to the first ten (both owners first, then the
longest-serving admins); the rest are simply not written to.

Eligibility is decided **twice**: when the notice is queued, and again, per row,
when it is claimed. A person who was suspended or removed in between is
`skipped` / `RECIPIENT_NOT_ELIGIBLE` and their address is not handed over. A
person who _became_ eligible in between is not added: the recipient set is
fixed when the notice is queued (a later change of responsible recruiter does
not generate notices for old applications).

## 3. The outbox and its state machine

`recruitment_employer_notices`: one row per **(application, recipient, kind)**
(`UNIQUE`). **Kind-aware**: `kind` (default `'new_application'`) is part of the
unique key and of an allow-list `CHECK`, so a later notification about an
application (for example a reply) can reuse the table, claim, settle and sweep.
Only `new_application` exists; nothing else is implemented.

- **No client access:** RLS enabled **and forced**, no policy, `REVOKE ALL` from
  `PUBLIC`, `anon` and `authenticated`. `service_role` may only `SELECT`; it
  writes through the functions.
- It holds the recipient's **user id, never an address**, and never a provider
  response: `last_status` is the HTTP status (0 = no answer) and nothing else;
  `skip_reason` is one of our own three codes.

```
pending ──claim──▶ claimed ──settle sent────────────────▶ sent        (final)
   │                  │ └─settle failed / not_configured─▶ failed / not_configured
   │                  │                                      │ retryable, after the backoff
   │                  └─ lease (3 min) expired ──claim──▶ claimed   (next attempt)
   └─ too old / no longer eligible / withdrawn ───────▶ skipped      (final)
```

| Function                                                    | Who            | What                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------------------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `rec_enqueue_employer_new_application_notices(application)` | `service_role` | Returns the number of rows **created**. **Set-once** per application and kind (advisory lock): if any row exists it creates nothing, so a replay can never produce a second set, whoever the recipients are by then. Only for a `submitted` application under an hour old.                                                                                                                            |
| `rec_claim_employer_notices(application?, limit, kinds?)`   | `service_role` | With an application: its due notices (the dispatch after the submission). With `NULL`: whatever is due anywhere (the sweep). `FOR UPDATE OF n SKIP LOCKED` plus a **3-minute lease**: two workers never take the same row, and a worker that died is recovered when its lease expires. Re-checks eligibility per row. Bounded to **50**. Returns what the mail needs and nothing about the candidate. |
| `rec_settle_employer_notice(attempt, result, http_status)`  | `service_role` | Records `sent` / `failed` / `not_configured` **only for a `claimed` row and only for the attempt it names**. A late answer for an earlier attempt returns `stale` and changes nothing; a row that is not claimed answers with its state.                                                                                                                                                              |
| `rec_employer_notice_recipients(application)`               | `service_role` | Section 2.                                                                                                                                                                                                                                                                                                                                                                                            |
| `rec_employer_notice_backoff(attempts)`                     | nobody         | Internal.                                                                                                                                                                                                                                                                                                                                                                                             |
| `rec_purge_employer_notices(older_than := 90 days)` | `service_role` | **Retention** (below). Returns the number of rows deleted. |

**Retry rules.** At most **6 attempts**, spaced **5 min, 15 min, 45 min, 2 h,
4 h**, and **nothing after 23 hours** (the provider's idempotency key lives 24
hours, so every retry stays inside the window in which a repeat under the same
key is deduplicated, and a "new application" mail a day late is stale anyway).
Retryable: no answer (`0`), 408, 409, 425, 429, any 5xx, and `not_configured` (the
transport may be configured later). Every other 4xx is final. A row that is
never tried within 23 hours becomes `skipped` / `EXPIRED`; a claim that never
reported on its last attempt becomes `failed` / 0.
A sent row is **never** claimed again.

**Retention: 90 days.** `rec_purge_employer_notices(_older_than interval DEFAULT
'90 days')` (`SECURITY DEFINER`, `service_role` only, `anon` / `authenticated` /
`PUBLIC` revoked) deletes **settled** rows whose `settled_at` (the moment the
last outcome was recorded, or the database ended the row) is older than the
window: `sent` and `skipped` rows, and `failed` / `not_configured` rows that will
not be tried again (six attempts made, the 23-hour window closed, or a definite
refusal). It **never** deletes a `pending`, a `claimed` or a still-retryable row,
whatever its timestamps say; it refuses a window under one day
(`NOTICE_RETENTION_TOO_SHORT`); it takes at most 1000 rows per call. The
receipts sweep calls it once, after its claim loop, and reports the count as
`purged`; the apply request never calls it. A `pending` row that no sweep ever
claimed is not terminal and is not purged (the sweep that would purge it expires
it first).

*A purged row can no longer suppress a re-enqueue for the same application.*
That cannot send a second mail: enqueue is called only when an application is
**created** (`submitJobApplication`, once the application has committed) and when
a **replay of that same request** arrives, and the database refuses to queue any
application that is older than an hour or no longer `submitted`, while a purged
row is at least a day old (the database refuses a shorter window). The guard
checks that nothing else in `src/` reaches the enqueue (only the server module,
only from `notifyEmployerOfNewApplication`, whose only two callers are the two
places in the submission). The unique key (application, recipient, kind) holds
for every row that exists, and for a new application there are no rows to
purge.

**A second kind is cheap.** `kind` is in the unique key and in an allow-list
`CHECK` whose name is stable (`recruitment_employer_notices_kind_check`). No
function but the enqueue of a *new application* names a kind: the claim filters
by the `_kinds` it is given, builds the provider key from the row's own kind
(`employer-<kind>:<row id>`), and the settle and the retention are kind-blind. A
later migration (a `candidate_replied` notice, say) widens the `CHECK` and adds an
enqueue; nothing here is rewritten (EN9 does exactly that inside the suite, and
asserts that no function body changed). In the application there is **one**
table from the outbox's kind to the e-mail kind
(`EMPLOYER_NOTICE_EMAIL_KINDS` in the sender); the worker asks the claim for
exactly its keys, so an older worker is never handed a kind a newer migration
added, and the guard checks every entry against the `CHECK` and the edge
function's `KINDS`. A new kind needs one line there, its template, and one
`KINDS` line in the function. **Not built:** `candidate_replied`, or any other
kind.

**Provider-level dedupe (second line).** `Idempotency-Key:
employer-new-application:<outbox row id>` on every attempt; the transport
already forwards the header.

## 4. The mail

Edge function kind **`employer_new_application`** (one `KINDS` line, nothing
else in the function): `to` is the caller's named address, shape-validated like
the other caller kinds; **`replyTo: none`**; From stays
`CQrityjob <no-reply@cqrityjob.com>` (it is not an organisation sender kind: it
is CQrityjob writing to the employer, and nobody replies). The function now has
**nine** kinds (`docs/release/2026-09-30-product-email-transport.md` says eight;
that document is not edited here).

Content (Swedish or English by the recipient's `profiles.locale`, Swedish when
there is none; plain text and HTML, everything escaped): the vacancy's title,
the organisation's name, that a new application arrived, why this person is
written to (responsible / owner / administrator), and a link to
`<origin>/employer/<slug>/applications/<application id>`, with the origin from
`serverSiteOrigin(process.env.PUBLIC_SITE_URL)`, the production domain unless the
deployment names a clean https host of its own, **never** a Lovable host and never
a browser location. A slug or id of an unexpected shape gives the workspace's
front door instead of a built link. **No candidate name, address, CV, message or
answer.**

## 5. Failure modes

| What happens                                                               | Result                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The migration is not applied (before step 1, or after a rollback)          | `PGRST202` / `PGRST205` / `42883` / `42P01` is a **logged no-op**: nothing queued, nothing sent, the application is accepted, the sweep says `available: false`.                                                          |
| The edge function is not deployed, rejects the key, or holds no Resend key | The transport says not configured: the row is `not_configured` and is retried (backoff, 23 h window).                                                                                                                     |
| **The app is published before the function is redeployed**                 | The old function answers `400` for the unknown kind, which is a definite refusal: the row is `failed` / 400 and is **not** retried. Hence the order in section 7. A recovery for the rows of that window is in section 7. |
| The provider is slow or down (timeout, network, 5xx, 409, 408)             | `failed` with the status (0 for no answer); retried inside the window under the same key.                                                                                                                                 |
| The provider rate-limits (429)                                             | `failed` / 429, retried after the backoff.                                                                                                                                                                                |
| The provider refuses (other 4xx)                                           | `failed`, final.                                                                                                                                                                                                          |
| The 3-second budget runs out before the claim or the send finished         | The row stays `pending` or `claimed`; its lease expires; the sweep takes it, under the same key.                                                                                                                          |
| The server dies between the commit and the enqueue                         | No notice (see section 8). If the candidate's client retries, the replay path queues it (set-once).                                                                                                                       |
| The provider accepted the mail and the answer could not be recorded        | The row stays `claimed`, the lease expires, the sweep retries **under the same key**, and the provider returns the first response without sending again.                                                                  |
| A recipient was suspended or removed after the application arrived         | `skipped` / `RECIPIENT_NOT_ELIGIBLE`.                                                                                                                                                                                     |
| The candidate withdrew first                                               | `skipped` / `APPLICATION_WITHDRAWN`.                                                                                                                                                                                      |

## 6. What an owner or admin sees

The e-mail, and nothing else. **No employer-side UI was added** (the brief
allowed an "e-post skickad / ej skickad" hint only if it needed no more than a
few lines of new UI; it would need a read function with its own privilege story
and a new panel, so it is left out). The outbox is readable only by the service
role (a person with database access can `SELECT status, last_status, attempts
FROM recruitment_employer_notices`); the sweep run's summary prints counts. The
candidate sees nothing: the apply result never mentions the employer mail.

## 7. Release order, rollback, verification

### Order: migration, then edge function, then application

1. **Apply `20270205090000_employer_new_application_notices.sql` hosted**
   (tracked mechanism, never re-sent on a timeout: check the ledger first). It is
   safe before everything else: nothing calls it. Verify with the read-only
   `verify` in `supabase/release-state.json` (RLS enabled and forced, no client
   privilege, the function privileges, and the pinned bodies below).
2. **Redeploy the `transactional-email` edge function** from this branch (it
   gains the kind). `supabase/config.toml` already has `verify_jwt = false`.
   Deploying it before the application is harmless: nothing sends the kind yet.
3. **Publish the application.** It works against any combination before this:
   without step 1 every notice step is a logged no-op; without step 2 the notices
   are refused with 400 (see below).

`RECRUITMENT_SWEEP_URL` and `RECRUITMENT_SWEEP_TOKEN` (repository secrets) and
`RECRUITMENT_SWEEP_TOKEN` (app server) must already be set for the receipts
sweep. They are what retries the employer notices too; without them only the
attempt made inside the apply request happens.

**If step 3 happened before step 2:** applications that arrived in that window
have notices `failed` / 400. Once the function is redeployed, re-open the ones
still inside their 23 hours (service role, deliberate, read first):

```sql
SELECT count(*) FROM public.recruitment_employer_notices
 WHERE status = 'failed' AND last_status = 400 AND created_at > now() - interval '23 hours';
-- then, only if that is the window you mean:
UPDATE public.recruitment_employer_notices
   SET status = 'pending', attempts = 0, attempt_id = NULL, claimed_at = NULL,
       last_status = NULL, next_attempt_at = now()
 WHERE status = 'failed' AND last_status = 400 AND created_at > now() - interval '23 hours';
```

### Pinned function bodies (`md5(prosrc)` of a local replay)

| Function                                             | md5                                |
| ---------------------------------------------------- | ---------------------------------- |
| `rec_claim_employer_notices(uuid,integer,text[])`    | `0fa89f23d04d5ba24e9af6742fc62eac` |
| `rec_employer_notice_backoff(integer)`               | `592882928f58355fb8bb465bd8035a70` |
| `rec_employer_notice_recipients(uuid)`               | `17528f0b956dedb7459e0a8099607a74` |
| `rec_enqueue_employer_new_application_notices(uuid)` | `72f34824a4ac10db4b7e5e3c50494c59` |
| `rec_settle_employer_notice(uuid,text,integer)`      | `7a3d025492ad3273f60a9f8ebc532136` |
| `rec_purge_employer_notices(interval)` | `537e33913d1539c276c75d6a444eb687` |

Compare the hosted bodies after step 1. Grants (`release-sequence.md`, step 7):
new `public` functions are granted `EXECUTE` to `anon` by default on the hosted
project, which a local replay cannot show; every function here has an explicit
`REVOKE` from `PUBLIC`, `anon` and `authenticated` and a `GRANT` to
`service_role` only (the postflight fails the migration otherwise), but **check
that it landed**.

### Rollback

`supabase/rollback/20270205090000_employer_new_application_notices_rollback.sql`
drops the six functions and the outbox (a queued, unsent notice is lost; a sent
one has already left). The application tolerates the absence, so it can be rolled
back at any time and in either order. To stop the mail without touching the
database, undeploy the function or remove the Resend secret: the rows become
`not_configured` and are retried until their window closes.

### Verification after publication (owner, with a controlled mailbox)

Apply to a **test vacancy of a test organisation** whose owner's address is a
mailbox you control (see `2026-10-03-production-test-request.md`); the
application and the mailbox are the only things touched. Expected: the mail
arrives within seconds, in the owner's language, from `CQrityjob`, with no Reply-To
and no candidate detail, and its button opens the application; the function's
log shows `employer_new_application 200`; the outbox row is `sent` / 200. Repeat
the same apply (same application id): no second mail and no second row.

## 8. Known limits

- **At most 10 recipients** per application (section 2).
- **Never retroactive.** Applications that arrived before the application change
  is live, or while the migration or the function was missing, are not announced
  later (the enqueue refuses an application older than an hour; a notice older
  than 23 hours is never sent).
- **A lost enqueue is lost.** If the server dies between the commit and the
  enqueue and the candidate's client never retries, there is no notice. The
  replay path closes the retry case; a catch-up sweep for applications with no
  outbox row was deliberately not added (it would be the first mechanism that
  mails about applications nobody queued). The employer still sees the
  application in the workspace.
- **Retries need the scheduler.** The GitHub workflow runs every 15 minutes at
  best effort; without its secrets only the one attempt inside the apply request
  happens.
- **Accepted is not delivered.** `sent` means the provider accepted it. Bounces
  and spam filtering are not tracked.
- **One mail per recipient per application.** No digest and no batching: a busy
  vacancy sends one mail per application per recipient.
- **A person added or promoted after an application arrived** is not told about
  it, and a **responsible recruiter changed after** the notice was queued does
  not re-address it.

## 9. Opt-out: not implemented

There is no per-person or per-organisation opt-out. It was not asked for in the
requirement, and the recipients are the people responsible for acting on an
application (the responsible recruiter, or the owners and admins who must), so a
silent default off would defeat the feature. It would be added in one place,
because **every** recipient decision goes through
`rec_employer_notice_recipients`: a `notify_new_applications boolean NOT NULL
DEFAULT true` on `employer_memberships` (or a small preferences table keyed by
user, organisation and kind), applied as one more condition there and re-checked
at the claim; a switch for the person on their own settings page; and a
`List-Unsubscribe` header, which the edge function does not send today and would
need a new optional field for.

## 10. Tests

SQL (`employer_new_application_notices_test.sql`, 108 assertions, one transaction
that ends in `ROLLBACK`, all fixtures synthetic):

| Group | Proves                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| EN1   | The responsible person beats owners and admins; otherwise active owners and admins; a plain member only when responsible; invited, suspended and removed members, non-active organisations, accounts without an address, with an unconfirmed address or disabled, and a "responsible" stranger get nothing; fall-through when the responsible person is suspended or removed; the cap of ten (owners first); the address is `auth.users.email` as of the call                                         |
| EN2   | No `EXECUTE` for `anon`, `authenticated` or `PUBLIC` on any of the six functions; no table privilege for them; the server's own table privilege is read-only; RLS enabled, forced, no policy; every client role, **as itself**, is refused the table, the recipient list, the enqueue, the claim and the settle; no client-callable function reads the outbox or the recipient list                                                                                                                  |
| EN3   | Enqueue is idempotent and set-once (a replay after the recipients changed adds nobody); the unique key is (application, recipient, kind); only the allow-listed kind exists; an application that is old, withdrawn or already moved is not announced; the outbox has no column for an address, a name, a text or a response                                                                                                                                                                           |
| EN4   | A claim hands over one attempt per due notice with the address, provider key and organisation; the recipient's language; nothing that can name the candidate; the lease holds; a worker that renders another kind gets nothing; the limit bounds a claim; lease expiry gives a new attempt id and the same provider key; a sent row is never claimed again; eligibility is decided again (suspended person, withdrawn application, suspended organisation); never-tried and too old becomes `EXPIRED` |
| EN5   | Settle only for a claimed row and the attempt it names; a late answer is `stale`; a bad result or a missing attempt is refused; the backoff and the status are recorded; an out-of-range status is not stored                                                                                                                                                                                                                                                                                         |
| EN6   | Retryable and final statuses; the backoff; the 23-hour window; six attempts and no seventh; an unreported last claim becomes `failed`; the sweep across applications; the cap of 50 per claim (60 due rows are taken 50 then 10, none twice)                                                                                                                                                                                                                                                          |
| EN7   | The shape constraints; deleting an application or an account deletes its notices                                                                                                                                                                                                                                                                                                                                                                                                                      |
| EN8   | Retention: a sent, a skipped and three final failed rows older than 90 days are deleted and the call returns five; a row settled 89 days ago stays; a pending, a claimed and a still-retryable failed or not_configured row stay whatever their timestamps say; a second purge returns zero; a window under a day (nothing, 12 hours, NULL) is refused; the window is a parameter; a purge is bounded (1000); anon and authenticated cannot call it; the purged row of an old application is gone and a re-enqueue for that application still queues nothing |
| EN9   | A second kind needs no new functions: no function but the enqueue names a kind; after the allow-list is widened (what a later migration would do) the same claim hands over only the kind asked for with its own provider key, the same settle and the same retention serve it, the same person can hold both kinds for one application, and no function body changed |

Planted controls in `scripts/db-test.sh`, each of which **must** make the suite
fail on the named assertion (the migration's own SQL with one substitution):

| Control | Planted defect                                | Fails at |
| ------- | --------------------------------------------- | -------- |
| NC1     | A client role may execute the claim           | EN2.1    |
| NC2     | A client role may read the outbox             | EN2.5    |
| NC3     | A plain member is a recipient                 | EN1.3    |
| NC4     | A suspended or removed member is a recipient  | EN1.3    |
| NC5     | No cap on recipients                          | EN1.10   |
| NC6     | Enqueue is not set-once                       | EN3.4    |
| NC7     | No lease                                      | EN4.6    |
| NC8     | A takeover keeps the previous attempt id      | EN4.9    |
| NC9     | Eligibility is not decided again at the claim | EN4.12   |
| NC10    | A sent row is claimed again                   | EN4.11   |
| NC11    | Settle takes a row that is not claimed        | EN5.2    |
| NC12    | No cap on attempts                            | EN6.4    |
| NC13    | The retention deletes a claimed row           | EN8.1    |
| NC14    | The retention ignores its window              | EN8.1    |
| NC15    | The retention deletes rows that can still be retried | EN8.1 |
| NC16    | A client role may execute the retention       | EN2.1    |
| NC17    | The retention accepts a window under a day    | EN8.6    |

After them: the real rollback (run twice), the migration applied twice, and the
suite again. Then four **two-session races** (committed synthetic fixtures,
removed afterwards): concurrent enqueues (the second waits, then creates
nothing), claims (the second takes nothing and does not wait), sweeps, and
settles (the second waits and finds the row already settled).

Application: `transactional-email:check` block 2c (the kind, recipient from the
request and validated, no Reply-To, From fixed, key forwarded, kind known to the
transport; five planted controls) and `employer-application-notice:check`
(rendering in both languages, escaping with hostile titles, no candidate data
even when handed some, the production origin and a Lovable `PUBLIC_SITE_URL`
ignored, key shape and reuse across attempts, the recipient only from the
claim, honest outcomes for 200, 202, 429, 422, 500, 502, 409, 408, network error,
404 and 401, the three-second ceiling and clamp, never throws, a logged no-op for
`PGRST202`, `PGRST205`, `42883` and `42P01`, the sweep, the wiring, and that the SQL and the
app agree on names, arguments, grants and locking), with
`negative-controls:employer-application-notice` (34 planted defects).

## 11. Noticed and not changed

- `scripts/recruitment-workspace-check.ts` asserts that the receipt dispatch
  comes after `if (insertErr) {`, a string that no longer exists in
  `submitJobApplication` (it is `if (insertErr && !committed) {` since the
  submission-failure work), so `indexOf` is -1 and the comparison is always true.
  That assertion has stopped testing the order it names.
- `bun run site-origin:check` fails on this branch **before** this work: the
  merge of #386 brings `src/routes/villkor.tsx` and
  `src/routes/integritetspolicy.tsx`, whose canonical constants write
  `trust-path-recruitment.lovable.app`, which the site-origin guard (from the
  launch-completion branch) forbids. Their area; not touched.
- The merge of #386 into the launch-completion branch left a duplicate import of
  `CONTACT_EMAIL` in `src/routes/contact.tsx` (once from `@/lib/site-contact`,
  once from `@/lib/contact/contact-address`); `tsc` failed on it. The second
  import is removed in a separate commit.
- `docs/release/2026-09-30-product-email-transport.md` says the function has
  eight kinds; it has nine now.
