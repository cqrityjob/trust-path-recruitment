# Voluntary self-declarations — processing record and activation

Status: **built, closed.** Schema `20270324090000_vsd_voluntary_self_declarations.sql`.
Nothing is collected in any environment until a processing authorization is
recorded (see [Activation](#activation-prerequisites)). This document records
no legal conclusion; the legal fields below are for the controller to fill.

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
- Private to the holder. It is absent from public profiles, social/OG cards,
  CV sources and exports, talent search, applications and every Passport
  sharing payload. The suite proves from the catalogue that no other
  function, view or table names a `vsd_` object (V9.1–V9.3);
  `scripts/self-declarations-check.ts` proves the same for the application.
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
- There is deliberately **no disclosure operation**. Showing a declaration to
  an employer is not something this schema can authorize.
- A `criminal_history` row is refused by the table unless its legal basis is
  not consent and it names the national-law authority for offence data
  (GDPR Art. 10) and the period reviewed. The application additionally holds
  no criminal-history statement wording, so that panel stays closed even if a
  row exists.

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
4. **Financial-data disclosure**: not built. A separate assessment and a new
   schema change before any declaration is shown to anyone else.
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

Recording an authorization is then one reviewed migration, for example:

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

## Tests

- `supabase/tests/vsd_voluntary_self_declarations_test.sql` — 111 assertions,
  thirteen negative controls in `scripts/db-test.sh`.
- `scripts/self-declarations-check.ts`, `scripts/self-declarations.test.tsx`,
  `scripts/negative-controls/self-declarations-controls.ts`.
- `e2e/self-declarations.spec.ts` — Swedish and English, desktop and mobile.

All fixtures are synthetic. No real document has been or may be used.
