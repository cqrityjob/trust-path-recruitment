# Voluntary self-declarations — processing record and activation

Status: **built, closed.** Schema `20270324090000_vsd_voluntary_self_declarations.sql`
(collection) and `20270325090000_vsd_passport_disclosure.sql` (the Security
Passport bridge: presentation and optional disclosure). Nothing is collected in
any environment until a processing authorization is recorded, and nothing can
be disclosed to anyone until, separately, a disclosure authorization is
recorded (see [Activation](#activation-prerequisites)). Neither migration
records one. This document records no legal conclusion; the legal fields below
are for the controller to fill.

## What it is

On `/my-career/profile` a signed-in person may, if they choose, record their
own dated statement. There are three kinds and they are never merged:

| Kind (`declaration_kind`) | Statement | Optional supporting document |
|---|---|---|
| `enforcement_debt_none` | No current debts registered with Kronofogden | `enforcement_authority_statement` |
| `payment_remarks_none` | No current payment remarks | `credit_report` (e.g. the person's own UC extract) |
| `criminal_history` | Only within a reviewed jurisdiction, period and purpose | `police_extract` |

It is **self-declaration**. It is not verification, identity verification,
security clearance or approval for employment.

What the model cannot hold, by construction (suite assertion V9.4):

- no "negative" answer — the only storable fact is the holder's affirmation of
  a fixed, versioned statement, or nothing;
- no free text, explanation, offence description, creditor, amount or
  personal identity number;
- no score, rank, risk level, badge or decision.

Ordinary loans and mortgages are not debts registered with Kronofogden and are
not payment remarks; the statement wording says so. A police extract covers
what its issuing register covers on its issue date; the wording and the
provenance labels never present it as a lifelong absence of convictions.

## Provenance

Derived on every read, never stored:

| Level | Meaning |
|---|---|
| Self-declared | The holder affirmed the statement. |
| Document provided | The holder attached a document to this exact revision. Nobody has looked at it. |
| Document reviewed | An appointed reviewer recorded that the document matches the declared type and issue date. |

A document and a review each name the declaration **revision** they belong to.
Changing or renewing the statement, or replacing the document, sends the old
file to erasure and removes its review. There is no "verified clean record" or
"verified debt-free" state anywhere in the schema or the copy.

## Where it lives, and where it does not

- Tables `vsd_*`, bucket `self-declaration-documents`. Nothing is written to
  `sp_claims` or any `sp_*` object, and no existing function was changed.
- Private to the holder, with ONE exception the holder controls: the
  [Security Passport bridge](#the-security-passport-bridge). It is absent from
  public profiles, social/OG cards and images, CV sources and exports, card
  downloads, talent search, catalogues, applications and every Passport
  sharing payload (the anonymous recipient payload included). The suites
  prove from the catalogue that no function, view or table outside the
  `vsd_` family names a `vsd_` object (V9.1–V9.3, D7.1–D7.3);
  `scripts/self-declarations-check.ts` proves the same for the application,
  naming the bridge's files one by one.
- It does not count toward profile completeness, Passport completion,
  numbering, titles or CV content. Skipping it changes nothing anywhere.
- The Security Passport's own refusal to process criminal-record data
  (`docs/passport/privacy-processing-matrix.md`) is unchanged.

## Access

| Who | What |
|---|---|
| Holder (live session) | Everything about their own rows, through the `vsd_` functions. No table access, and no direct Storage read. |
| Appointed reviewer | One document, only while its holder has asked for a review, only under the authorization they were appointed for. |
| Passport verifier, platform admin, superadmin, employer | Nothing. |
| `service_role` (application server only) | `storage_erasure_queue` (existing), `vsd_purge_due()`, `vsd_stamp_document_content()`, and reading or removing an object at a path the database has just authorized. No table privilege on `vsd_*`. |

A reviewer is a row in `vsd_document_reviewers`, written only by a reviewed
migration. There is no reviewer workspace in the application yet, so "Document
reviewed" is unreachable in practice until one is built.

## How a document's bytes are reached

Storage never serves a document to a client. The bucket has no client
SELECT, UPDATE or DELETE policy, so nobody — not the holder, a reviewer or an
administrator — can download an object or have Storage sign a link to one.

A document is delivered by the application server, one request at a time:

1. the server calls `vsd_authorize_document_read()` **with the caller's own
   session**. As of that moment it checks the live session, ownership (or a
   reviewer's appointment under the document's own authorization, while the
   holder's request stands), that the document is attached, and that its
   statement is active, inside its retention, at the document's revision,
   under an authorization that is still current;
2. only then does the server read that exact object, check its hash against
   the row, and return the bytes with `Cache-Control: no-store`.

There is no link to keep. Withdrawing or deleting, revoking the
authorization, passing the retention date, ending the session, ending a
reviewer's appointment or taking back a review request all refuse the very
next request, whether or not the file has been physically erased yet and
whether or not anything has reconciled the rows. Bytes a person has already
downloaded cannot be recalled.

## How a document is accepted

1. The server bounds the encoded size, strictly decodes the base64, and
   checks the real content is a PDF, JPEG or PNG matching the declared type.
2. `vsd_begin_document()` records the intention (size, SHA-256, type).
3. The bytes are written to exactly the recorded path.
4. The server reads the object back, recomputes size, hash and type, and
   records the match with `vsd_stamp_document_content()` — a `service_role`
   function no client can call. `vsd_attach_document()` refuses without it,
   so a direct RPC or Storage call cannot attach bytes under a hash of the
   caller's choosing.

Every step is safe to repeat. A retry of a completed upload finds it attached
and changes nothing; a lost acknowledgement is resolved by reading what was
persisted (`vsd_upload_state()`), never by assuming failure. The only
compensation, `vsd_abandon_upload()`, acts on an unfinished upload and cannot
touch an attached document.

## Erasure

Withdraw, delete, change, renew, replace and discard all:

1. move the document row to `erasure_pending` and write
   `storage_erasure_queue` in the same transaction — from then on no client
   policy reads the object;
2. are followed by a drain of that holder's own queued objects
   (`src/lib/self-declarations/erasure.server.ts`); the administrator's
   existing sweep drains the same queue;
3. keep the row, shown to the holder as an owed cleanup with a retry, until
   the object is really absent from `storage.objects`.

A deletion is reported complete only at step 3. Account erasure reaches the
tables through the existing cascade; a `BEFORE DELETE` manifest queues the
files first.

Retention is `retention_days` from the authorization, counted from the last
declaration. An expired statement, or one whose authorization was revoked, is
deleted the same way the next time its holder reads, and by `vsd_purge_due()`
for holders who never return — **which nothing schedules yet**.

## The processing gate

`vsd_processing_authorizations` holds, per kind and jurisdiction: operator and
registration number, purpose, legal basis and its detail, the assessment it
was approved in, retention, permitted operations (`collect_declaration`,
`store_document`, `human_document_review`), permitted document types, the
statement version, and who approved it when.

- Every write function and both Storage policies require a current row.
  Without one, the screen, the Data API and a direct Storage upload are all
  refused (V1.2–V1.5). Document operations ask again every time they run
  (V7.3–V7.16), so access ends with the authorization, not with a cleanup.
- No client role and no function can write the table. A row is immutable; it
  can only be revoked, which stops collection at once and deletes what was
  collected under it.
- There is deliberately **no disclosure operation** on this table. A
  processing authorization never authorizes showing a statement to anyone;
  that takes a separate row in `vsd_disclosure_authorizations` (below).
- A `criminal_history` row is refused by the table unless its legal basis is
  not consent and it names the national-law authority for offence data
  (GDPR Art. 10) and the period reviewed. The application additionally holds
  no criminal-history statement wording, so that panel stays closed even if a
  row exists.

## The Security Passport bridge

Built in `20270325090000`, closed until a disclosure authorization exists.

### What the holder sees in their own Passport

`/passport` has a compact section, separate from the credential wallet, with
one shield per **current** statement: "Kronofogden · Självdeklarerat",
"Betalningsanmärkningar · Självdeklarerat" (English: "Swedish Enforcement
Authority · Self-declared", "Payment remarks · Self-declared"). A
"Brottshistorik · Självdeklarerat" shield can only appear once reviewed
criminal-history wording exists in the application; today none does.

- The shield reuses the Passport's own primitive in its self-declared
  (dashed outline) treatment, and that treatment is fixed in the component.
  No tick, verified rim, approval wording or score exists for it.
- Opening it shows the exact versioned statement, its date, jurisdiction,
  scope and reviewed period, and always: "Uppgiften är lämnad av personen
  själv och har inte verifierats av CQrityjob."
- A supporting document, or an appointed reviewer's note about it, never
  changes the shield or its label. The holder alone is shown the existing
  provenance description ("Document provided … nobody has reviewed it").
- With processing closed, a refused or failed read, or wording the application
  does not hold, there is **no shield**: one neutral line ("not activated")
  and a link to the Profile, where the existing editor lives.
- The section has its own read. The wallet, its counts, the card, the
  next-step prompts, completeness, the Passport number, rankings and
  applications are given nothing of it, so skipping it changes none of them.

### Optional disclosure

When creating a Passport **link** (`/passport/share`), a holder may tick
statements to accompany that link.

- Nothing is pre-selected, and nothing is offered at all unless the database
  reports a statement as shareable (a current disclosure authorization).
- The holder is shown exactly what a recipient will receive, built by the same
  database function the recipient's read uses (`vsd_disclosed_statement`) and
  drawn by the same component. Only what was previewed can be attached.
- The selection belongs to that one new link. It is made once, within an hour
  of the link's creation, and can afterwards only shrink. Existing links never
  gain a statement; a reissued link carries none.
- It never reaches the social image, link previews, the page's head, card
  downloads or the CV.

### Who can read a disclosed statement

Only a recipient who is **signed in** to CQrityjob with a live session **and**
whose browser holds that link's live share session. An ordinary Passport link
is readable by anyone who holds it; a statement is not. The anonymous
recipient call is unchanged and carries no trace of a statement, and a visitor
who is not signed in is shown no placeholder or hint.

`signed_in_recipient` is the only audience that exists. A table constraint
refuses any other, so opening an anonymous or public audience is a reviewed
schema change, not a row. Application (employer) disclosures cannot carry a
statement.

What a recipient is given is exactly: kind, jurisdiction, statement version,
the date the statement is about, the day it was made, and the reviewed period
where one exists. Never a document, its name, type, hash or path, a review, a
provenance level, an identity number, the holder's user id or another
statement.

### Lifecycle

A selection names the exact revision, wording and disclosure authorization it
was made under. On **every** recipient read the database decides again
(`vsd_selection_disclosable`): the selection not withdrawn; the statement
active, inside its retention, under a current processing authorization; the
same revision and wording; the same disclosure authorization still current
and permitting the audience; the link the holder's, live and not revoked or
expired. Withdrawal, deletion, change or renewal, a passed retention date and
revocation of either authorization each end disclosure of the old statement at
once, before any reconciliation, and nothing later revives it. The holder can
also stop sharing one statement without revoking the link.

Each read that actually gave a recipient a statement is recorded
(`vsd_disclosure_accesses`). The holder is shown how often, never by whom;
erasing a recipient's account keeps the event and removes the identity.

### Not built

- Disclosure through an employer application.
- Any audience other than a signed-in recipient.
- A way for a signed-out recipient to learn that a link carries a statement
  (deliberate; the holder tells them to sign in).
- Retention scheduling for `vsd_disclosure_accesses` beyond the cascade from
  its selection, statement and holder.

## Activation prerequisites

None of these is decided or assumed by the code. Each kind is assessed and
activated separately.

1. **Controller identity.** The legal entity and registration number that
   operates the processing.
2. **Financial self-declarations** (`enforcement_debt_none`,
   `payment_remarks_none`): purpose, legal basis, retention, and approval of
   the two statement wordings (`se-enforcement-v1`, `se-remarks-v1` in
   `src/lib/self-declarations/copy.ts`).
3. **Storing a UC extract or a Kronofogden statement**: a separate assessment
   (the documents carry far more than the statement — identity number,
   address, income, credit engagements). Only then add `store_document`.
4. **Disclosure** (per kind, separately from collection): the mechanism is
   built and closed. Showing a statement to a signed-in recipient needs its
   own assessment: purpose, legal basis, the recipient's position (a recipient
   becomes a controller of what they read), whether "signed in to CQrityjob"
   is a sufficient audience limit or recipients must be further qualified, the
   retention of the read record, and the privacy-notice wording. Only then is
   a `vsd_disclosure_authorizations` row recorded for that kind. For
   `criminal_history` the row additionally cannot rest on consent and must
   name its Art. 10 authority. Disclosure cannot be activated for a kind
   whose collection is not active.
5. **Criminal history**: an Art. 10 assessment naming the national-law
   authority, the jurisdiction, the period and the purpose; then approved
   statement wording added to the application. Consent is not sufficient.
6. **Human review**, if wanted: appointed reviewers, their instructions, and a
   reviewer workspace (not built).
7. **Retention scheduler**: schedule `vsd_purge_due()` and the storage
   erasure sweep, or accept deletion-on-next-read only.
8. **Privacy notice / record of processing** updated for whichever kinds are
   activated; DPIA where required.
9. **Schema release**: merge the schema PR, let the Supabase integration
   install it, verify hosted, then merge the application PR.

Recording a processing authorization is then one reviewed migration, for example:

```sql
INSERT INTO public.vsd_processing_authorizations
  (declaration_kind, jurisdiction, statement_version, operator_name, operator_registration,
   purpose, legal_basis, legal_basis_detail, assessment_reference, retention_days,
   permitted_operations, permitted_document_types, approved_by_name, approved_on)
VALUES
  ('payment_remarks_none', 'SE', 'se-remarks-v1', '<controller>', '<org.nr>',
   '<purpose>', '<basis>', '<basis detail>', '<assessment reference>', <days>,
   ARRAY['collect_declaration'], '{}', '<approver>', DATE '<yyyy-mm-dd>');
```

A disclosure authorization is a second, separate reviewed migration, recorded
only after its own assessment:

```sql
INSERT INTO public.vsd_disclosure_authorizations
  (authorization_id, purpose, legal_basis, legal_basis_detail, assessment_reference,
   permitted_audiences, approved_by_name, approved_on)
SELECT a.id, '<disclosure purpose>', '<basis>', '<basis detail>', '<assessment reference>',
       ARRAY['signed_in_recipient'], '<approver>', DATE '<yyyy-mm-dd>'
  FROM public.vsd_processing_authorizations a
 WHERE a.declaration_kind = 'payment_remarks_none' AND a.jurisdiction = 'SE'
   AND a.revoked_at IS NULL;
```

Implementation completeness and activation are separate things: the whole
flow above is implemented and tested with synthetic authorizations, and
production holds none.

## Tests

- `supabase/tests/vsd_voluntary_self_declarations_test.sql` — 111 assertions,
  thirteen negative controls in `scripts/db-test.sh`.
- `scripts/self-declarations-check.ts`, `scripts/self-declarations.test.tsx`,
  `scripts/negative-controls/self-declarations-controls.ts`.
- `e2e/self-declarations.spec.ts` — Swedish and English, desktop and mobile.
- The bridge: `supabase/tests/vsd_passport_disclosure_test.sql` — 66
  assertions, eleven negative controls in `scripts/db-test.sh`; section 8 of
  `scripts/self-declarations-check.ts` with fifteen negative controls;
  `e2e/self-declarations-passport.spec.ts` — the holder's Passport, the share
  step and the recipient, Swedish and English, desktop and 375 px, keyboard
  and accessible names.

All fixtures are synthetic. No real document has been or may be used.
