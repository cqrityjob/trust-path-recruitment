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

The write and both sends happen **inside one server request**. There is no
follow-up call from a browser to depend on, so closing the tab does not lose
the notification.

That is measured, not assumed. Against a local stack, the page was closed the
instant the provisioning request left the browser:

```
provisioning request issued -> closing the page now
closed: true
-> employers row created, status pending, owner membership 1
-> audit_logs: applicant -> not_configured, admin -> not_configured
```

The server finished the handler after the client was gone.

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

The sender runs in the **application server**, which Lovable hosts — not in a
Supabase Edge Function. So these belong in the **Lovable project's environment
variables / secrets**, the same place `SUPABASE_SERVICE_ROLE_KEY` and
`SUPABASE_URL` are already set for this project (Lovable project
`9ec625ef-34a1-4b4b-8cbb-712cae168579`). Setting them in Supabase's Edge
Function secrets would have no effect on this path.

| setting | what it is for | without it |
| --- | --- | --- |
| `RESEND_API_KEY` | the transport. **Reuses the existing service** — Resend is already the provider for invitation and application-status mail, and this adds no package, no vendor and no new secret name | no product email is sent at all |
| `RESEND_FROM_EMAIL` | the sender. Must be an address on a domain verified with the provider, with SPF, DKIM and DMARC passing, or the mail is rejected or filed as spam | as above |
| `ADMIN_NOTIFICATION_EMAIL` | the one mailbox new registrations are announced to. A monitored address, not a personal one | the administrator queue still shows every registration |
| `PUBLIC_SITE_URL` | the origin used to build both links | links point at the `SITE_ORIGIN` fallback |

The repository does not know and must not guess the sender or the
administrator address, so neither appears here or anywhere in the code.

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
