# Product e-mail through a Supabase Edge Function (2026-09-30)

## Why

Product e-mail (contact form, employer registration, application receipts,
employer messages, assessment and academy invitations) used to call Resend
directly from the app server with `RESEND_API_KEY` from the Lovable host.
Lovable only stores secrets on a paid plan. The key therefore lives in
Supabase instead, and nothing else changes for the user.

Supabase Auth mail (sign-up confirmation and password reset) is **not**
affected. It stays on Hostinger SMTP.

## Architecture

```
server function (auth, validation, rate limits, idempotency claim, template)
  → src/lib/email/transport.server.ts   (service-role key the app already has)
  → Supabase Edge Function `transactional-email`   (holds RESEND_API_KEY)
  → Resend HTTP API
```

- **Callers.** Only the app server can call the function; the service-role
  key is required. Everything else gets a bare 401.
- **Kinds.** Only eight named kinds are accepted. The function decides:
  - the sender, `CQrityjob <no-reply@cqrityjob.com>`;
  - the admin inbox, `info@cqrityjob.com`;
  - every Reply-To.

  | Kind                           | To             | Reply-To     |
  | ------------------------------ | -------------- | ------------ |
  | contact_enquiry                | info@          | the enquirer |
  | contact_acknowledgement        | the enquirer   | info@        |
  | employer_registration_received | the registrant | info@        |
  | employer_registration_admin    | info@          | none         |
  | application_receipt            | the candidate  | job@         |
  | recruitment_message            | the candidate  | job@         |
  | assessment_invitation          | the candidate  | job@         |
  | academy_invitation             | the employee   | info@        |

- **Unchanged in the senders:** templates, idempotency keys and duplicate
  claims, timeouts, 409/429/5xx classification, recipient validation, and
  the contact form's database rate limits (5 per visitor per hour, 3 per
  recipient per day).
- **Provider handling.** The provider status is passed back unchanged and
  the provider body is never read.
- **Logs** hold the kind and the status only.
- **Not configured.** With no `RESEND_API_KEY` the function answers
  `not_configured`. It does the same when not deployed, and when it rejects
  the key the app sends. In that state the app behaves exactly as before:
  nothing is sent, the contact page says the form is not open, and the
  admin page names the missing secret.
- **Guards.** `transactional-email:check` executes the function against a
  stub provider. `negative-controls:transactional-email` proves that check
  catches six planted defects.

## Owner steps (after merge)

1. **Store the key.** Supabase Dashboard → project `wrygicdfxwjnrugduxnt` →
   Edge Functions → Secrets (Project Settings → Edge Functions) → Add new
   secret:
   - Name: `RESEND_API_KEY`
   - Value: the Resend API key, pasted directly in the dashboard (never in chat).

   No other setting is required. The sender, the inboxes and the site URL
   (`https://trust-path-recruitment.lovable.app`) are built in.

2. **Deploy the function** `transactional-email` from `main`. It must be
   deployed with JWT verification off, because it checks the service-role
   key itself. `supabase/config.toml` already says `verify_jwt = false`. You
   can ask Claude to deploy it, or run
   `supabase functions deploy transactional-email --project-ref wrygicdfxwjnrugduxnt`.
3. **Publish the site** in Lovable so the app uses the new transport.
4. **Verify:**
   - `/contact` shows the form;
   - one enquiry reaches info@, and the acknowledgement arrives with
     Reply-To info@;
   - the function's logs (Edge Functions → transactional-email → Logs)
     show `contact_enquiry 200` and `contact_acknowledgement 200`.

## Rollback

Undeploy or delete the function, or remove the secret. The app then
reports `not_configured` everywhere and sends nothing; it does not break.
