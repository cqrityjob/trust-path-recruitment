# Company registration — what happens, and what has to be configured

Step one of the employer flow, end to end: from the button a customer presses
to the row an administrator approves. Written after a real test in which a
company registered and nothing happened — no confirmation to the company, no
notification to anybody at CQrityjob.

## What was actually wrong

Three defects, one silence. Only the third is the one people were looking for.

### 1 · The registration never became an application

"Registrera företag" on `/` and on `/employers` both navigate to
`/signup?redirect=/employer`. The organisation section of that form was a
collapsed, unticked checkbox regardless of where the person arrived from. So
somebody who pressed a button saying *register your company* was shown a
personal account form, typed a name, an address and a password, and created a
**candidate** account.

Nothing downstream could recover from that:

| step | what happened |
| --- | --- |
| `signUp` | no `company_name` written to user metadata |
| `ensureMyEmployerCompanyFromSignup` | `no_company_in_signup` — nothing to create |
| `employers` | no row |
| `/admin/employers?status=pending` | empty, correctly — there was nothing in it |

Evidence on the hosted project (`wrygicdfxwjnrugduxnt`), read 2026-09-21: the
most recent account created carries no `company_name` and holds no
`employer_memberships` row, and the newest `employers` row dates from the
August UAT.

### 2 · No registration email existed

Not a failed send — no send. The repository had exactly three email call
sites, all of them about assessments and application status, and none of them
on the registration path. There was no code anywhere that wrote to a company
about its own registration.

### 3 · No administrator notification existed either

`create_my_employer_company` writes a `company_created` row to `audit_logs`,
and the admin overview showed a pending **count**. A number does not say which
company, who registered it, or how to reach them, and no message was sent to
anybody.

## What the chain does now

1. **The entrance collects a company.** `registrationTargetsOrganisation`
   (`src/lib/auth/organisation-entrance.ts`) reads the *already validated*
   `redirect` and pre-selects the organisation section. `/employer/join` is
   excluded — that is an invitation to a company that already exists. It is a
   form default and grants nothing.
2. **The registration is saved by the existing path.**
   `create_my_employer_company` creates the `employers` row as `pending` and
   the owner `employer_memberships` row in one transaction. Unchanged.
3. **The company is told.** A confirmation that says the registration was
   **received**, lists the next steps, and states in as many words that it is
   **not approved yet**. It links to `/employer` (the status page), never into
   a workspace the database would refuse.
4. **The administrator is told, twice over.** A mail to
   `ADMIN_NOTIFICATION_EMAIL` carrying the company, the contact person, the
   contact address and a link to `/admin/employers/<id>`; and a queue on the
   admin overview carrying the same four facts. The queue does not depend on
   mail working at all.
5. **The outcome is recorded.** Both channels write an
   `employer_registration_notified` row to `audit_logs`, shown on
   `/admin/employers/<id>` with a deliberate **Send again** button.

### Three words that are kept apart

| | what it means | who decides |
| --- | --- | --- |
| **verified address** | the person can read that inbox | Supabase Auth |
| **received** | we hold a registration awaiting review | this chain |
| **approved** | the organisation is active | a platform administrator, via `moderate_employer` only |

No screen and no message may run these together. A verification email is never
described as an approval.

### And "sent" never means "received"

`sent` means a provider **accepted** the message. Every surface says so in
those words. An absent provider is reported as `not_configured`, naming the
missing settings — never as a send. A provider refusal is reported as `failed`
with the provider's status code and never its response body, which can carry
the recipient's address.

A failed send can never fail or delete a saved registration: the announcement
returns a value and never throws.

## Reliability: what happens if the person closes the page

### The one thing that never depends on email

**A saved registration is always visible in the admin queue.** `/admin` lists
every `pending` employer with the company, the contact person, the contact
address and a link, read straight from `employers` and `employer_memberships`.
It does not read the delivery trail, it does not care whether a provider is
configured, and it is unchanged by any send failing. If the person never comes
back and both messages fail, the application is still there and still
decidable.

Everything below is about the *notification*, which is a convenience on top of
that queue — never the record itself.

### Where the send happens

The write and both sends are in **one server request**. There is no follow-up
call from a browser to depend on.

Measured on the local Node server: the page was closed the instant the
provisioning request left the browser, and the handler still completed —
`employers` row `pending`, owner membership, both attempts recorded.

**That result does not transfer to production unchanged.** The deployment is
Nitro on Cloudflare (`@lovable.dev/vite-tanstack-config` builds with the
cloudflare target; the live site answers with `server: cloudflare`), and a
Workers invocation may be cancelled when the client disconnects. So on
production the honest claim is narrower: the send is *attempted inside the
same request*, which is the best a request-bound send can do, and it has not
been proven to survive a disconnect there.

### The catch-up is an attempt, not a delivery guarantee

If that request does not finish — a cancelled invocation, a redeploy between
the commit and the send, a provider outage, a setting configured only
afterwards — then **the next time the registrant opens the product, one more
attempt is made**, for the channels that have never succeeded.

Stated plainly, because the distinction matters:

- it is **not** a scheduler, a queue or a background worker;
- nothing runs while nobody is present;
- **if the person never returns, no further automatic attempt is made at all.**

What covers that case is not automation. It is the admin queue above, and an
administrator who can see exactly what failed and press **Skicka igen**.

The catch-up is bounded so it cannot become a nuisance: only a channel with no
`sent` row, only while the organisation is `pending`, at most five recorded
attempts, and an unreadable trail means send nothing rather than "probably not
sent".

### A successful notification is never sent twice

Not by the catch-up, and not by the administrator's **Skicka igen**, which
computes what is outstanding from the same trail the page renders, sends only
that, and is disabled when both channels have already succeeded.

Proven: with the company channel marked `sent`, the registrant's next visit
produced exactly one new row — for the admin channel.

### Which branch the live project actually takes

`/auth/v1/settings` on `wrygicdfxwjnrugduxnt` reports `mailer_autoconfirm:
false`, so **production requires email confirmation**. A company registering
live therefore takes the longer branch:

1. the form submits, no session is returned, and the inbox panel replaces it;
2. they open the verification link, which returns to
   `/login?redirect=/employer`;
3. the first authenticated render creates the organisation and sends both
   messages.

The company name and country survive step 2 because they live in auth user
metadata, written at sign-up. Verified locally: an unconfirmed account keeps
`company_name`, holds no membership, and the first sign-in after confirmation
produces the `pending` organisation and the owner membership by itself.

The submit-time provisioning below therefore only fires where a session is
returned immediately (a project without confirmation, and the local stack). It
is the belt to the verification branch's braces, not a replacement for it.

Two things are still bound to the browser, and both are handled:

- **The call has to be issued at all.** It used to be issued only by the
  authenticated shell, one navigation after the form was submitted. It is now
  also issued from the submit itself, while the person is still on the page
  and the button is still spinning. The shell's call remains as the path for a
  registration completed later, after an email verification link.
- **The request may not finish** — a redeploy between the commit and the send,
  a provider outage, a setting configured only afterwards. A bounded catch-up
  re-attempts on the registrant's next visit, and only ever a channel that has
  **never succeeded**, only while the organisation is still `pending`, and at
  most five times.

A successful notification is never sent twice — not by the catch-up, and not by
the administrator's **Send again**, which sends only what is outstanding and
sends nothing at all when both channels have already succeeded.

There is deliberately **no scheduler**. A sweep that runs when nobody is
present would need pg_cron or a new edge function, which is a new moving part
for a case the catch-up already covers. Worth revisiting only if the trail
shows it is needed.

## Configuration required (owner action)

### What the deployment actually is, verified

| question | how it was answered |
| --- | --- |
| Is there a server runtime at all? | `/_serverFn/<nonsense>` on the live site returns **HTTP 500 from the app's own error page**, not a 404, and `/employers` arrives **server-rendered**. A static host does neither |
| Which server? | `vite.config.ts` uses `@lovable.dev/vite-tanstack-config`, whose own comment states it includes *"nitro (build-only using cloudflare as a default target), VITE_\* env injection"*. The live site answers `server: cloudflare` with an `x-deployment-id` |
| Does that server already hold non-`VITE_` variables? | `/sitemap.xml` returns **HTTP 200 with 56 URLs, 28 of them job rows**. That route calls `serverPublicClient()`, which throws unless `process.env.SUPABASE_URL` **and** `process.env.SUPABASE_PUBLISHABLE_KEY` are set. Neither is a `VITE_` name |
| Can a secret leak to the browser? | A production build was made and scanned: **0 occurrences** of `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ADMIN_NOTIFICATION_EMAIL`, `SUPABASE_SERVICE_ROLE_KEY` or `api.resend.com` across **492 client files**; all present in the server bundle. The same scan over the **live** client bundle (52 files) finds none of them either, and does find the publishable key, which belongs there |

So the settings go in the **server-side environment of the Lovable-hosted
deployment** — the same store that already supplies `SUPABASE_URL` and
`SUPABASE_PUBLISHABLE_KEY` to that sitemap route today. They are set in the
Lovable project (`9ec625ef-34a1-4b4b-8cbb-712cae168579`) alongside the
Supabase ones. Supabase **Edge Function** secrets are a different store and do
not reach this code: the only edge function on the project is
`passport-share`.

### The four settings

| setting | value | notes |
| --- | --- | --- |
| `RESEND_API_KEY` | a Resend API key | **Existing service.** Resend is already the provider for invitation and application-status mail. No new package, vendor or secret name |
| `RESEND_FROM_EMAIL` | e.g. `no-reply@<verified-domain>` | Must be on a domain **verified in the Resend dashboard**, with SPF, DKIM and DMARC passing |
| `ADMIN_NOTIFICATION_EMAIL` | a monitored CQrityjob mailbox | Where new registrations are announced |
| `PUBLIC_SITE_URL` | the deployment's own origin | Used to build both links; otherwise the `SITE_ORIGIN` fallback is used |

**Never name any of these with a `VITE_` prefix** — that prefix is exactly what
publishes a value into the browser bundle. A guard fails the build if one of
them ever acquires it.

**A redeploy is required.** These are read from the server environment at run
time, and the running Worker keeps the environment it was deployed with, so
publish the project again after saving them.

### What I could not verify from here

Whether a **Resend account** exists and whether a **sending domain is already
verified** on it. That is inside the Resend dashboard, which this repository
has no credentials for and should not have. If there is no account or no
verified domain yet, that is the first step and nothing else will work: an
unverified sender is rejected by the provider, and the delivery trail will
show `failed` rather than `sent`.

### What the current delivery records do and do not show

`assessment_assignments` rows all read `email_delivery_status =
'not_attempted'` and `job_application_status_events` rows all have
`notified_at IS NULL`. That means **no provider was configured at the moment
each of those rows was written**. It is not evidence about today's
configuration, and it says nothing about any other path.

The deployed product answers the question directly and without guessing: after
this change, `/admin/employers/<id>` names any missing setting under
**Aviseringar om registreringen**.

Auth mail — verification, password reset — is a separate path this repository
does not control. See [../release/auth-email-branding.md](../release/auth-email-branding.md).

## Reading the messages before anything is configured

```bash
PUBLIC_SITE_URL=https://<the-deployment-origin> bun run employer-registration-mail:preview
```

Renders the real messages to `artifacts/employer-registration-mail/` and prints
every link in them. No key, no network, nothing sent.

## How to check it yourself

1. Open `/employers` and press **Registrera företag**.
2. The form must already show **Företagsnamn** and **Land**, with the
   organisation box ticked.
3. Register with a test address. You land on **Företagskonto granskas**, which
   names the company, numbers the three steps, and says either that a
   confirmation was sent or that one could not be sent.
4. Sign in as a platform administrator. `/admin` lists the registration under
   **Företagsansökningar att granska** with the contact person and address, and
   the link opens `/admin/employers/<id>`.
5. On that page, **Aviseringar om registreringen** says what was sent to whom,
   or which settings are missing. **Skicka aviseringarna igen** retries.
6. Approve from the same page. The company's own tab moves off the review page
   by itself.

## The real email test, once the settings exist

Three different claims, and they must not be run together:

| claim | how it is established |
| --- | --- |
| **simulated** | `employer-registration-mail:preview` — the message was rendered, nothing left the machine |
| **accepted by the email service** | `/admin/employers/<id>` shows *Skickat (accepterat av e-posttjänsten)*. This is the strongest claim the product can make on its own |
| **actually received** | somebody opens the inbox and reads it. Only a human can report this, and nothing in the product may assert it |

The test itself, with a fictitious company and addresses you control:

1. Register from **Registrera företag** with a test address you can read.
2. On **Företagskonto granskas**, note which sentence the page shows about the
   confirmation email.
3. Open `/admin/employers/<id>` as an administrator and record the status of
   both channels.
4. Open both inboxes. Record receipt separately from acceptance, and check the
   links: the company's goes to the status page, the administrator's opens the
   registration and must ask an unauthenticated browser to sign in.
5. Press **Skicka aviseringarna igen**. If both channels already succeeded it
   must send nothing and say so.

## Automated coverage

- `bun run employer-registration-notice:check` — the chain as a contract:
  entrance, transport, message content, both creation paths, and that nothing
  claims a send it did not make.
- `bun run negative-controls:employer-registration-notice` — eight planted
  defects, each of which must break that guard.
- `bun run employer-registration-mail:preview` — the exact messages and links.
- `e2e/employer-registration.spec.ts` — the routed walk against a local stack,
  including the boundary checks through real PostgREST. Opt-in:

  ```
  E2E_LOCAL_STACK=1 E2E_BASE_URL=http://127.0.0.1:3119 \
    bunx playwright test e2e/employer-registration.spec.ts --project=chromium
  ```
