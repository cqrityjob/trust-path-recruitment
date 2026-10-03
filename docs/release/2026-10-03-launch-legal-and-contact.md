# Launch: contact addresses, mail senders, terms and privacy policy

**Status: PR for owner review.** It is not merged, and nothing in production
was changed. The edge function change takes effect only when the owner
deploys it after merge (§5).

## 1. Addresses (owner, 2026-10-03)

| Address | Use | Where |
|---|---|---|
| `info@cqrityjob.com` | Contact, support, privacy | Footer, `/contact`, both legal documents, the signup privacy note; the inbox for contact enquiries and employer registrations |
| `job@cqrityjob.com` | Recruitment and candidate communication | `/contact`; Reply-To on every candidate mail |
| `no-reply@cqrityjob.com` | Automated mail only | The From address of every product mail; never shown as a contact |

The addresses are named once for the app (`src/lib/site-contact.ts`) and
once for the mail function. `transactional-email:check` pins that the two
copies agree.

The Resend path is unchanged. `RESEND_API_KEY` is still held only by the
`transactional-email` edge function. Supabase Auth is unchanged too: there
is no auth configuration in the repository, and none is added.

## 2. Sender and Reply-To per mail type

| Mail | To | From | Reply-To |
|---|---|---|---|
| Contact enquiry | info@ | CQrityjob &lt;no-reply@&gt; | the enquirer |
| Contact receipt | the enquirer | CQrityjob &lt;no-reply@&gt; | info@ |
| Employer registration, to the registrant | the registrant | CQrityjob &lt;no-reply@&gt; | info@ |
| Employer registration, to the admin | info@ | CQrityjob &lt;no-reply@&gt; | none |
| Application receipt | the candidate | **&lt;Employer&gt; via CQrityjob** &lt;no-reply@&gt; | job@ |
| Recruitment message | the candidate | **&lt;Employer&gt; via CQrityjob** &lt;no-reply@&gt; | job@ |
| Assessment invitation | the candidate | **&lt;Employer&gt; via CQrityjob** &lt;no-reply@&gt; | job@ |
| Academy invitation | the employee | **&lt;Employer&gt; via CQrityjob** &lt;no-reply@&gt; | info@ |

**New in this PR: the organisation's name as the sender.** An
organisation's own message now shows its name as the sender's display name.
- **Name only.** The request can supply a name, never an address. The
  function decides the address and the Reply-To.
- **Cleaned.** The name keeps only letters, digits, spaces and `. & ' -`,
  and is capped at 60 characters. A name with nothing readable left falls
  back to "CQrityjob".
- **Only these kinds.** CQrityjob's own mail ignores a supplied name.

**Owner decision: replies directly to the company.** The product stores no
e-mail address for an employer. "Correct company Reply-To" is therefore
read as the owner's mapping: candidate communication replies to `job@`.
Replies straight to the company would need a verified address for each
company.

**Auth mail.** Confirmation and password-reset mail are sent by Supabase
Auth, configured in the Supabase dashboard. See §5.

## 3. Terms of use and privacy policy

- **Pages.** `/villkor` (Användarvillkor) and `/integritetspolicy`
  (Integritetspolicy). They are linked from the footer on every public page
  and from registration. Each enters the sitemap once it is final.
- **Wording.** The owner's text is used verbatim, with the two substitutions
  the owner asked for:
  - "Cqrityjob AB" becomes **Cqrityjob LLC**;
  - "[kontaktadress]" becomes **info@cqrityjob.com**.

  A script compared every line of the source texts with the published
  content: nothing is missing.
- **Language.** Both documents are in Swedish. An English reader sees "This
  document is currently published in Swedish only." No translation was
  made, so the legal meaning cannot drift.
- **Gaps left open.** Every gap the owner has not decided is shown as a
  marked placeholder (dashed amber, `data-legal-placeholder`). None is
  filled in.

## 4. Registration

- **Terms checkbox.** Signup has a required box: "Jag har läst och godkänner
  användarvillkoren." It is not pre-ticked. The link opens `/villkor` in a
  new tab, so the form keeps what was typed.
- **Separate from everything else.** The box is about the terms only. No
  marketing or newsletter consent exists in the product, and none is added
  or bundled.
- **Without the box.** Neither "Skapa konto" nor "Fortsätt med Google" in
  signup mode sends anything; both show "Godkänn användarvillkoren för att
  skapa ett konto."
- **What is stored.** On email signup, the account's metadata records
  `terms_version` (2026-10-01) and `terms_accepted_at`.
- **Privacy note.** The old line, "Genom att skapa ett konto godkänner du vår
  integritetspolicy", presented a privacy policy as something accepted. It
  now reads "Läs hur vi behandlar dina personuppgifter i vår
  integritetspolicy" and links the policy. It is information, not consent.
- **Organisation toggle.** It is still the form's first checkbox.

**Google sign-in and drafts (added 2026-10-03).**
- **Google from the sign-in page.** An account created through a provider
  with no recorded acceptance is stopped by `TermsAcceptanceGate`, on every
  page, until it accepts or signs out.
- **Google from the signup page.** The ticked box is carried across the
  round trip and written to the account on return.
- **Version changes.** An account whose recorded version is not the current
  one is asked again.
- **Drafts.** While either document has open points it is a draft: a banner,
  `noindex`, no sitemap entry, and acceptance recorded as `2026-10-01-utkast`.
- **Where acceptance is stored.** It is in the account's auth metadata,
  written by the client. A server-side record would need a migration.

## 5. What the owner must do

Every open point, with verified facts and a recommended text, is in
`docs/release/2026-10-03-launch-legal-decisions.md`. In short:

1. **Terms (A).** The age limit (18) and account closure (via info@) are
   filled in, as decided. The terms stay a draft until the owner sets
   `OWNER_APPROVED.terms`. Every existing account then accepts them once.
2. **Retention ("7 dagar").** Verified as not true, for both support
   enquiries and logs. Both rows are open points in the draft again, to be
   filled with the periods of the plan (C) once the owner approves it.
   Privacy §5 (no AI provider) and §11 (functional cookies only) are filled
   with verified facts; six open points remain, so the policy stays a draft.
3. **Deploy the mail function** after merge. The deployed function refuses
   the app's key, so no product mail has been sent through it; #386 fixes
   that in the function.
4. **Resend, SMTP and mailboxes.** Already in place. Auth mail via custom SMTP
   is verified working since 2026-09-30 14:27 UTC. No change proposed.
5. **Candidate replies (D).** The owner's employee watches info@ and job@.
   Open: the response time, and whether to build the in-app reply.
6. **Production domain.** Canonical and og:url still point at
   `trust-path-recruitment.lovable.app`. The launch session (#387) moves them
   to `www.cqrityjob.com`.
7. **English versions** of the documents, if wanted.
