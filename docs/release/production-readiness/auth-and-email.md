# Production readiness — Authentication and e-mail

**Status: EXTERNAL ACTIVATION REQUIRED.** Nothing in this document is done from the repository. Hosted project: `wrygicdfxwjnrugduxnt` (CQrityjob Production). Verified 2026-09-28 against `main` at `b7ed12f`.

## 1. The division of labour (verified in code)

The repository already follows one model and has no duplicate mail system:

| Mail | Sent by | Configured where | Templates |
|---|---|---|---|
| Account confirmation, password reset, magic link, e-mail change | **Supabase Auth** (GoTrue), triggered by `signUp` / `resend` / `resetPasswordForEmail` in `src/components/auth/UnifiedAuthPanel.tsx` and `src/routes/admin.login.tsx` | Supabase dashboard → Authentication (SMTP, Site URL, Redirect URLs, templates, rate limits) | Supabase Auth templates |
| Employer registration receipt + admin notice | Application, **Resend HTTP API** (`src/lib/email/send-employer-registration-email.server.ts`) | Application host secrets `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `ADMIN_NOTIFICATION_EMAIL`, `PUBLIC_SITE_URL` | In code |
| Recruitment messages (general, interview invitation with booking, rejection, offer, information) and application receipts | Application, Resend (`send-recruitment-message-email.server.ts`, `receipt.server.ts`) | same | In code, editable per recruitment |
| Assessment / training invitations (Academy, "Skicka test") | Application, Resend (`send-invitation-email.server.ts`) | same | In code |
| Interview bookings | No mail of its own; carried by the interview-invitation message above | — | — |
| Company approval / rejection | **No mail exists**; the employer sees the status on `/employer/pending` | — | — |
| Candidate status e-mails (interview / rejected / hired) | **Dead module** (`send-application-status-email.server.ts` has no caller); status is shown in-app; nothing in the UI promises a mail | — | — |
| Passport verification, attestation, share notifications | No mail; share-by-e-mail is a client `mailto:` link | — | — |

Every Resend path returns `not_configured` and the UI says so honestly when the two Resend variables are missing; nothing fails silently. There is no SMTP/nodemailer/SendGrid code anywhere. **Do not add a second transport.**

## 2. Current hosted state (evidence)

- Auth log of the last real signup (2026-09-26): `mail_from: noreply@mail.app.supabase.io` — Supabase's default mailer, which delivers only to members of the Supabase organisation and is rate-limited. Custom SMTP has never been set.
- E-mail confirmation is **ON** (2 of 20 `auth.users` are unconfirmed; the app shows the inbox panel). The application supports both modes.
- Leaked-password (HIBP) protection: **disabled** (security advisor WARN).
- `docs/release/auth-email-branding.md` still names the old project `zrah…`; the current project is `wryg…`. Follow the 2026-09-26 document and this one.

## 3. Owner actions — Supabase Auth (dashboard, project `wrygicdfxwjnrugduxnt`)

Do these before any real candidate or employer registers. None touches the schema.

1. **Custom SMTP** — Authentication → Emails → SMTP settings → enable. Use the same sending domain the application uses with Resend (Resend's SMTP relay: host `smtp.resend.com`, port `465` or `587`, user `resend`, password = a Resend API key with sending permission). Sender name `CQrityjob`; sender address = the address `RESEND_FROM_EMAIL` names, on a domain whose SPF, DKIM and DMARC pass.
2. **Site URL** — Authentication → URL configuration → Site URL: the public origin that will be live at launch. Today `https://trust-path-recruitment.lovable.app`; after the Hostinger move, the production domain (see the Hostinger checklist). Change it in the same window as the DNS switch.
3. **Redirect URLs (allow-list)** — one per line, each with `/**`: the published Lovable origin, the Lovable preview origin, the Hostinger **staging** origin, and the production domain. Missing origins make confirmation and reset links land on the Site URL, which the app then sends to `/my-career`, losing the reset form or the `?redirect=` destination (AU-02 in the UAT).
4. **Templates and branding** — *Confirm signup*, *Reset password*, *Magic link*, *Change email*: subject in Swedish with an English line, `{{ .ConfirmationURL }}` only, sender name `CQrityjob`. Text proposals are in `docs/release/auth-email-branding.md` §"Templates" (project reference there is stale; the wording is not).
5. **Confirm-email setting** — leave ON (recommended: the product's registration UX is built for it, and it keeps invented addresses out of the employer queue). If it is switched OFF, the app signs the user in immediately; nothing else changes.
6. **Rate limits** — Authentication → Rate limits: "Rate limit for sending emails" from the default-mailer cap to what the domain allows (start 30/hour); keep "Minimum interval between emails" at 60 s, which the app's resend countdown mirrors.
7. **Leaked-password protection** — Authentication → Email → Password security → enable "Check for leaked passwords" (HaveIBeenPwned). The app maps the resulting `weak_password` error to product copy.
8. **Google OAuth** — the Google buttons on `/login` and `/signup` are visible. Either configure the provider (Google Cloud OAuth client; Supabase callback URL registered there; client id/secret in Authentication → Providers → Google) **or** hide the buttons before launch. Owner decision; today the buttons show sanitised failure copy if the provider is off.
9. **Production vs preview domains** — Lovable's `id-preview--…` origin is where the "brokered" auth storage applies; on every other origin the app uses `localStorage`. After the move, remove the Lovable origins from the allow-list only once the Lovable site is retired.

## 4. Owner actions — application mail (Resend)

Set on the application host (Lovable secrets today; Hostinger environment after the move). Never with a `VITE_` prefix.

| Variable | Value |
|---|---|
| `RESEND_API_KEY` | a Resend key with sending permission for the verified domain |
| `RESEND_FROM_EMAIL` | the approved sender on that domain, e.g. `noreply@<domain>` |
| `ADMIN_NOTIFICATION_EMAIL` | the mailbox that receives employer-registration notices |
| `PUBLIC_SITE_URL` | the public https origin (links in mail); also set on the `passport-share` edge function |

Then run the one-message real-delivery probe (`scripts/email/real-delivery-probe.ts`, see `docs/release/2026-09-26-auth-confirmation-email-owner-actions.md`) to an approved test mailbox, and one real "Skicka test" to a synthetic candidate on the same mailbox; confirm `recruitment_messages.email_status = 'sent'` and arrival.

## 5. Verification (owner, with a controlled non-team mailbox)

1. Register at `/signup` (candidate) and at `/signup?redirect=%2Femployer` (organisation). "Kontrollera din e-post" appears; the Auth log `mail.send` carries your own `mail_from`; the mail arrives.
2. Open the link on a phone: lands signed in at the destination (`/my-career`, or `/employer` → "Företagskonto granskas"). On the desktop, "Jag har bekräftat – fortsätt" signs in with its own credentials.
3. Request a password reset from `/login`; the link lands on `/reset-password` (not `/`), the new password works, the old one is refused.
4. Wrong password shows "Fel e-postadress eller lösenord"; an existing address on signup shows "Det finns redan ett konto".
5. Sign out; a protected route redirects to `/login?redirect=…` and returns after sign-in.
6. Delete the test accounts afterwards (Authentication → Users), so no test organisation waits in the admin queue.

## 6. Code items that remain (not blockers)

- AU-01 (P3): `/reset-password` shows the new-password form to an already signed-in browser even on an expired link. Safe after launch.
- AU-03 (P3): pending-registration address persists 24 h in `localStorage` across sign-out on a shared browser. Safe after launch.
- AU-04 (P3): `/admin/login` prints raw provider text. Safe after launch.
- EM-MAIL-03 (P3): dead status-mail module; delete or wire deliberately after launch.
