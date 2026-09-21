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

Evidence on the hosted project (`wrygicdfxwjnrugduxnt`): the most recent
account created carries no `company_name` and holds no `employer_memberships`
row, and no `employers` row has been created since the August UAT.

### 2 · No registration email existed

Not a failed send — no send. The repository had exactly three email call
sites, all of them about assessments and application status. Nothing has ever
written to a company that registered.

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

## Configuration required (owner action)

None of these are in the repository, and none of them can be. Set them in the
deployment's environment.

| setting | what it is for | without it |
| --- | --- | --- |
| `RESEND_API_KEY` | the mail transport, already used by invitation and application-status mail | no product email is sent at all |
| `RESEND_FROM_EMAIL` | the sender, on a domain with SPF/DKIM/DMARC passing | as above |
| `ADMIN_NOTIFICATION_EMAIL` | where a new registration is announced | the administrator queue still shows every registration |
| `PUBLIC_SITE_URL` | the origin used in links; falls back to `SITE_ORIGIN` | links point at the fallback origin |

**As of 2026-09-21 none of the three mail settings is configured on the live
deployment.** That is not an inference: `assessment_assignments` holds 29 rows
and every one of them is `email_delivery_status = 'not_attempted'`, and all 22
`job_application_status_events` rows have `notified_at IS NULL`. No product
email has ever been sent from this deployment.

Auth mail — verification, password reset — is a separate path this repository
does not control. See [../release/auth-email-branding.md](../release/auth-email-branding.md).

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

## Automated coverage

- `bun run employer-registration-notice:check` — the chain as a contract:
  entrance, transport, message content, both creation paths, and that nothing
  claims a send it did not make.
- `bun run negative-controls:employer-registration-notice` — eight planted
  defects, each of which must break that guard.
- `e2e/employer-registration.spec.ts` — the routed walk against a local stack,
  including the boundary checks through real PostgREST. Opt-in:

  ```
  E2E_LOCAL_STACK=1 E2E_BASE_URL=http://127.0.0.1:3119 \
    bunx playwright test e2e/employer-registration.spec.ts --project=chromium
  ```
