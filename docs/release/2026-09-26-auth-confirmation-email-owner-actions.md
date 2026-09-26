# Employer registration: the confirmation email, and what the owner has to do

**Date:** 2026-09-26. **Status:** owner action required on the hosted project
`wrygicdfxwjnrugduxnt` before any real employer can receive a confirmation
email. Nothing in this document was applied to the hosted project from this
repository; the code half is in the same pull request.

## The report

"Registreringen för arbetsgivare behöver aktiveras. Det kommer idag ingen
länk på mail när man registrerar sig."

## The root cause, from the hosted project's own logs

The signup at 12:42 UTC on 2026-09-26 (`emma@cqrityjob.com`, Windows Edge)
produced this Auth log entry:

```
event: mail.send   mail_type: confirmation
mail_from: noreply@mail.app.supabase.io
```

`noreply@mail.app.supabase.io` is Supabase's **default** mailer. Custom SMTP
has never been configured on this project. Supabase's current documentation
for that service (Send emails with custom SMTP, read 2026-09-26) states:

> **Send messages only to pre-authorized addresses.** Unless you configure a
> custom SMTP server for your project, Supabase Auth will refuse to deliver
> messages to addresses that are not part of the project's team.

and that the default service is rate-limited and "not meant for production
use". So an address that belongs to a member of the Supabase organisation
receives the mail (the 12:42 signup was confirmed 21 seconds later, on an
iPhone); any other employer's address is refused by the provider, while the
application sees `signUp` succeed and says "Kontrollera din e-post".

`supabase/config.toml` holds only the project id: there is no `[auth]`
block, no SMTP setting and no template in this repository, and none can
reach the hosted project from here. `docs/release/auth-email-branding.md`
recorded the same owner actions for the previous (deleted) project; they
were never carried over to `wryg…`.

## Owner actions (hosted project, Authentication settings)

Do these in the Supabase dashboard for project `wrygicdfxwjnrugduxnt`. They
take effect immediately and change nothing in the database schema.

1. **Custom SMTP.** Authentication → Emails → SMTP settings → enable.
   The product already sends its own mail through Resend, so the least new
   surface is Resend's SMTP relay with the same verified sending domain:
   host `smtp.resend.com`, port `465` (or `587`), user `resend`, password =
   a Resend API key with sending permission, sender = the address
   `RESEND_FROM_EMAIL` already names (a CQrityjob address on a domain whose
   SPF, DKIM and DMARC pass). Sender name: `CQrityjob`.
2. **Rate limits.** Authentication → Rate limits → "Rate limit for sending
   emails": raise from the default-mailer cap to what the sending domain
   allows (Resend's free tier is 100/day; start at 30/hour). Keep
   "Minimum interval between emails" at 60 s — the application counts that
   interval down on its resend button.
3. **URL configuration.** Authentication → URL configuration:
   - Site URL: `https://trust-path-recruitment.lovable.app` (the origin the
     12:42 signup came from; use the custom domain instead once it is the
     public origin).
   - Redirect URLs (allow-list), one per line:
     `https://trust-path-recruitment.lovable.app/**`,
     `https://preview--trust-path-recruitment.lovable.app/**`, and the custom
     domain with `/**` when it exists. The confirmation link carries
     `/login?redirect=<destination>`; an origin missing here makes the link
     land on the Site URL instead, which loses the destination.
4. **Templates.** Authentication → Emails → Templates → *Confirm signup*:
   subject `Bekräfta din e-postadress – CQrityjob`; body in Swedish first
   with an English line, containing `{{ .ConfirmationURL }}` only, no
   marketing. Leave *Reset password* and *Magic link* with the same sender
   and the CQrityjob name.

Nothing above is done from this repository, and none of it was attempted
here.

## Verification after the owner action (the owner, with a controlled inbox)

1. Register an organisation at `/signup?redirect=%2Femployer` from a desktop
   browser with an address on a mailbox you control that is **not** a member
   of the Supabase organisation (a plus-address on your own domain, or a
   throwaway inbox). The page must show "Kontrollera din e-post" with that
   address.
2. In the Auth logs, the `mail.send` entry must now carry your own
   `mail_from`, not `noreply@mail.app.supabase.io`.
3. Open the link on a phone. It must land on `/employer` signed in, then on
   "Företagskonto granskas".
4. Back on the desktop, press "Jag har bekräftat – fortsätt": the desktop
   signs in with its own credentials and lands on the same page. No session
   is moved between devices; a desktop tab that was reloaded is offered
   "Logga in för att fortsätta" instead.
5. Delete the throwaway account afterwards (Authentication → Users), so no
   test organisation waits in the admin queue.

## Rollback

Disable custom SMTP in the same settings page; the project falls back to the
default mailer with its team-only restriction. No data changes.

## What the repository half does (this pull request)

- `src/components/auth/UnifiedAuthPanel.tsx`: an address that already has an
  account is told so (Supabase answers a confirmation-required `signUp` for a
  taken address with no error, no identities and no email); the pending
  registration is remembered in the browser so a reload keeps the inbox
  panel; "Jag har bekräftat – fortsätt" signs in on this device with the
  person's own credentials, automatically every 30 seconds while the tab is
  visible and at once when it becomes visible again; a reloaded tab is
  offered the sign-in form with the address kept; a resend counts down the
  provider's interval; every provider refusal (rate limit, unconfirmed,
  wrong password) is said in the product's language with a next step; an
  expired or reused link is reported from the URL fragment.
- `scripts/local-stack/auth-gateway.mjs`: the loopback stack can now require
  confirmation (`LOCAL_MAILER_AUTOCONFIRM=0`) and keeps every message it
  would have sent in a controlled inbox, so the two-device walk in
  `e2e/employer-registration-confirmation.spec.ts` runs against real
  `auth.users` rows without any real mail provider. Delivery by a real
  provider is **not** proven by that walk and is not claimed.
