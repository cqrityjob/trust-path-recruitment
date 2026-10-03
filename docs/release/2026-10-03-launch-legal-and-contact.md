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
  and from registration, and both are in the sitemap.
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

**Known limits.**
- **Google from the sign-in page.** It can create an account for a new
  person without the checkbox. The panel cannot tell a new Google account
  from an existing one beforehand, so acceptance for such accounts would
  have to be asked after sign-in.
- **Where acceptance is stored.** It sits in the account's auth metadata,
  written by the client at signup. A server-side record would need a
  migration. It is not added here.

## 5. What the owner must do

1. **Fill in the policy gaps.** Before relying on the pages, replace each
   placeholder:
   - **Terms §2:** the age limit and any rules for minors.
   - **Terms §13:** how a person closes their account. Today the product
     has no self-service deletion. Only a platform superadmin can delete an
     account, and the Passport privacy page sends the person to `/contact`.
     A true statement is something like "by writing to
     info@cqrityjob.com". This is for you to decide.
   - **Privacy policy:**
     - *Senast uppdaterad:* the publication date.
     - *§5:* the active AI providers, the data they receive, retention,
       model training and processing outside the EU/EEA.
     - *§6:* a link to the vendor list.
     - *§8:* the receiving countries and transfer mechanisms.
     - *§9:* retention for accounts, profiles and Passports.
     - *§11:* a link to the cookie policy and a link to cookie settings.
       The product has no cookie banner and no cookie policy today.
2. **Confirm retention.** Check "7 dagar" for support tickets and for
   security and access logs (privacy policy §9).
3. **Deploy the mail function.** After merge, deploy the
   `transactional-email` edge function. Until then, live mail keeps the
   plain "CQrityjob" sender.
4. **Check the domain in Resend.** `cqrityjob.com` must be verified (SPF,
   DKIM and DMARC) for `no-reply@`. `info@` and `job@` must be real
   mailboxes that someone reads.
5. **Supabase Auth.** In the dashboard:
   - Set custom SMTP to send from `no-reply@cqrityjob.com`, with sender name
     "CQrityjob". The 2026-10-01 checklist still listed this as unproven:
     the last auth mail came from Supabase's default address.
   - Review the confirmation and reset templates.
   - Check that Site URL and the Redirect URLs include the production
     domain.
6. **Production domain.** Canonical and og:url point at
   `trust-path-recruitment.lovable.app`, as on every other page. Moving to
   `www.cqrityjob.com`, the domain the documents name, is a separate change.
7. **English versions.** If wanted, supply approved English texts.
