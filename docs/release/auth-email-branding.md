# Auth email branding — what the repository controls, and what it does not

## What was observed

Black-box UAT received account-verification email branded as
**Security-Talent-Hub**, from **no-reply@auth.lovable.cloud**. Neither is the
product. A person creating a CQrityjob candidate account gets an email from a
name they have never heard of, at a domain that is not ours — which reads as
phishing, and is the single worst place in the product to look untrustworthy.

## The audit

There are two entirely separate email paths, and only one of them is in this
repository.

### 1 · Product email — REPOSITORY-CONTROLLED, already correct

Invitations and application-status notifications are sent by the application
itself, through Resend:

- `src/lib/email/send-invitation-email.server.ts`
- `src/lib/email/send-application-status-email.server.ts`

The sender is **not hard-coded**: it comes from `RESEND_FROM_EMAIL`, with
`RESEND_API_KEY` for the transport. Nothing in the repository names
Security-Talent-Hub or `auth.lovable.cloud`, and `invitation-email-guard:check`
already holds this path.

**Action:** none in code. Confirm `RESEND_FROM_EMAIL` points at a CQrityjob
address on a verified sending domain — that is an environment value, and this
document does not record it.

### 2 · Auth email — EXTERNALLY CONTROLLED, owner action required

Verification, password-reset and magic-link emails are **not sent by this
application**. They are sent by Supabase Auth on the Lovable Cloud project,
using that project's own sender identity and templates. The branding UAT saw
comes from there.

The repository cannot change it, and this is verifiable rather than assumed:

- `supabase/config.toml` contains one line, `project_id`. There is no `[auth]`
  block, no SMTP block and no template.
- Even if one were added, `config.toml` configures the **local** Supabase stack
  (`supabase start`). It reaches a hosted project only through an explicit
  `supabase config push`, and the hosted project here is Lovable's.
- There is no edge function and no server route in this repository that sends
  an auth email.

**A code-only fix would therefore be a fake.** It would look like a change,
pass review, and alter nothing about the email a real candidate receives. It
has not been made.

What the application *does* control on this path, and what is now correct:

- the return destination of the confirmation link (`emailRedirectTo`) is a
  CQrityjob URL, and it carries the candidate back to what they were doing —
  including the claim token for a finished Career Discovery result;
- every auth page is titled "… — CQrityjob".

## Owner action required after merge

In the **Lovable Cloud / Supabase project's Auth settings** (project `zrah…`,
the backend the live site uses — *not* the `mlvz…` project):

1. **Site name / branding** — change `Security-Talent-Hub` to `CQrityjob`.
   This is the name that appears in the default templates' subject and body.
2. **Sender identity** — configure custom SMTP with a CQrityjob address on a
   verified sending domain, replacing `no-reply@auth.lovable.cloud`. SPF, DKIM
   and DMARC have to pass on that domain, or the mail lands in spam and the
   trust problem changes shape rather than going away.
3. **Templates** — apply CQrityjob wording to Confirm signup, Reset password
   and Magic link. Keep them plain and short; a verification email that looks
   like marketing is also a trust problem.
4. **Redirect allow-list** — confirm the production origin is allow-listed, so
   the confirmation link returns to the app rather than to a default page. The
   link now carries a `redirect`, and it only works if the origin is allowed.

None of the above is done from this repository, and none of it was attempted
here.

## Verification after the owner action

Create a throwaway candidate account against production and check the received
email for: sender domain, display name, subject, and that the confirmation
link returns to the CQrityjob origin with its query string intact.
