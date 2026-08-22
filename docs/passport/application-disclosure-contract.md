# Security Passport — application disclosure contract

What an employer receives when a candidate attaches their Passport to a job
application, and what they never receive.

_(Status markers as defined in [three-market-architecture.md](./three-market-architecture.md).)_

---

## Applying is not consent

Nothing reads a Passport because an application exists.

A disclosure row must be created **by the holder**, naming **one** application,
before an employer can read anything. When there is none, the employer read
returns `{"status":"none"}` — and that response is **identical** whether the
candidate has no Passport, has one and shared nothing, or shared something and
revoked it.

Passport existence is not observable from the employer side. Only an explicit
act of disclosure is.

_Status: Implemented (`20260903091000`, `20260904090000`), Tested._

## One mechanism, not two

An application disclosure **is** an `sp_disclosures` row. Same `package_code`,
same optional `focus_claim_id`, same expiry, same revocation, same access log,
and literally the same payload builder as the public token path:

```
              sp_disclosure_payload(disclosure_id)   ← the contract, in one place
                   ↑                        ↑
      sp_get_disclosure(token)      sp_application_disclosure(application_id)
        public  /p/$token              employer, membership-checked
```

A parallel "employer view of a Passport" would have meant a second payload
builder, a second package contract, a second revocation path and a second set
of exclusions — four more places to get the privacy contract subtly wrong, and
two answers to _"what did this person actually share"_.

## Exactly one way in

`token_hash` is nullable and a `CHECK` enforces **exactly one addressing mode
per row**. The token path additionally refuses application-scoped rows
explicitly, so the boundary does not depend on NULL semantics in an equality
test.

Turning a candidate's scoped share into a public URL would silently widen it.

_Status: Implemented, Tested._

## What the employer sees

Words, never numbers:

**Verified requirement met** · **Missing** · **Self-declared only** ·
**Expiring soon** · **Could not be determined**

Plus, for a cross-market application, an explicit statement that credentials
from different jurisdictions are not equivalent.

_Status: the per-requirement vocabulary and the cross-jurisdiction notice are
**Future**. The underlying disclosure mechanism and its exclusions are
Implemented and Tested._

**Explicitly prohibited** in this view: a percentage · a match score · a
candidate ranking · an automated recommendation · a suitability verdict · an
automatic rejection.

## Never included

Documents · private notes · credential or licence numbers · unrelated history ·
self-declared facts presented as verified · any claim the selected package did
not name.

Self-declared **titles** cannot reach here at all: `buildDisclosurePayload`
applies `withoutSelfDeclared`, and `deriveVerifiedIdentity` has no argument
that could admit them in the first place.

_Status: Implemented, Tested._

## The snapshot

An application disclosure is tied to candidate · application · employer ·
selected package · disclosed claims and their versions · purpose · created
time · retention · revocation state.

_Future_: the snapshot should additionally record `identity_engine_version` and
the derived titles it was built from, so a share can always be explained by the
rules that were in force when it was made. `IDENTITY_ENGINE_VERSION` exists and
is exported for exactly this; it is not yet written into the snapshot.

## Withdrawal, stated honestly

Revoking live sharing stops future reads. It does **not** necessarily erase a
lawful recruitment record the employer already retained for that application.

The product must say this plainly rather than implying a right to erasure it
cannot deliver.

_Status: mechanism Implemented. The **wording** in the holder-facing UI is
**Future** and **requires legal review** per market._

## Future

Jurisdiction-aware requirement matching · the per-requirement status vocabulary
in the employer view · `identity_engine_version` in the snapshot · the
withdrawal wording.
