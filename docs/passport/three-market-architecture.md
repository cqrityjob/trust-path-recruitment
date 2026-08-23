# Security Passport — three-market architecture

**Status key used throughout these documents**

| Marker                    | Meaning                                                               |
| ------------------------- | --------------------------------------------------------------------- |
| **Implemented**           | In `main`-bound code, with a migration or module you can read         |
| **Tested**                | Covered by an assertion that fails the build when it stops being true |
| **Requires legal review** | Authored from official sources; nobody qualified has checked it       |
| **Future**                | Designed or named, deliberately not built                             |
| **Explicitly prohibited** | Must never be built without a separate, owner-approved decision       |

Nothing below is legal advice, and nothing here constitutes legal approval.

---

## Why the shape changed

Security Passport shipped as a Swedish product with `jurisdiction_code` as a
two-letter string holding exactly one value, and a credential taxonomy with no
country, no authority and no regulator on it.

Two consequences followed, and both were live:

1. **A British SIA licence and a Swedish ordningsvaktsförordnande would have
   become peers in one flat vocabulary.** Nothing in the schema distinguished
   them, so nothing in the schema could stop a query, a form, or a future
   feature from treating one as evidence about the other.
2. **Every holder was labelled "Väktare".** `passport.functions.ts` set the
   profession title to that literal for everybody who signed in, and six
   surfaces printed it — including a public page that showed it to strangers.

The architecture below exists to make both structurally impossible rather than
merely fixed.

## Five concepts, kept apart

| Concept          | Table                  | What it is                                                 |
| ---------------- | ---------------------- | ---------------------------------------------------------- |
| Jurisdiction     | `sp_jurisdictions`     | The country. ISO 3166-1 alpha-2, unchanged.                |
| Sub-jurisdiction | `sp_sub_jurisdictions` | An emirate or region with its own regulator. `AE-DU` only. |
| Authority        | `sp_authorities`       | Who decides. Polismyndigheten, Länsstyrelsen, SIA, SIRA.   |
| Market pack      | `sp_market_packs`      | One reviewed body of rules. `SE`, `GB`, `AE-DU`.           |
| Regulated role   | `sp_regulated_roles`   | The local legal role, in exactly one market.               |

And one more that is easy to conflate and must not be:

- **Profession family** (`sp_profession_families`) is global and descriptive.
  `SECURITY_GUARD` means "this kind of work, anywhere". It carries **no legal
  authority in any country**.
- **Regulated role** is local and legal. Väktare, Ordningsvakt, SIA Door
  Supervisor, SIRA Security Guard.

A role maps **up** to a family. Nothing maps sideways. **There is deliberately
no table in which a Swedish role and a British role are related to each
other**, because no such relation is true.

_Status: Implemented, Tested._

## The legal gate is a constraint

```sql
CONSTRAINT sp_market_pack_active_needs_review
  CHECK (NOT is_active OR legal_review_state IN ('approved', 'grandfathered'))
```

A market pack cannot be switched on while its regulatory content is
`pending` or `in_review`. Not by a seed, not by a test fixture, not by a
well-meaning fix. Approval additionally requires a named reviewer and a date.

`grandfathered` is **not** a synonym for `approved`. Sweden shipped before this
registry existed and carries the same review debt; recording it as approved
would have been inventing a sign-off.

_Status: Implemented, Tested._

## Failing closed

Every one of these is refused at the write, with its own `SP_*` code so the UI
renders a **state** rather than a crash:

| Situation                                         | Error                                 |
| ------------------------------------------------- | ------------------------------------- |
| Country with no market pack                       | `SP_JURISDICTION_NOT_SUPPORTED`       |
| Pack exists but is unreviewed                     | `SP_MARKET_PACK_NOT_ACTIVE`           |
| UAE claim with no emirate                         | `SP_SUB_JURISDICTION_REQUIRED`        |
| Emirate other than Dubai                          | `SP_SUB_JURISDICTION_NOT_SUPPORTED`   |
| Credential filed against the wrong country        | `SP_CREDENTIAL_JURISDICTION_MISMATCH` |
| Credential switched off                           | `SP_CREDENTIAL_NOT_AVAILABLE`         |
| Malformed licence/card number                     | `SP_CREDENTIAL_REFERENCE_FORMAT`      |
| Register commentary on a narrow-result credential | `SP_CREDENTIAL_NARROW_RESULT_ONLY`    |
| Scoped approval with no scope                     | `SP_CREDENTIAL_REQUIRES_SCOPE`        |

All in **one** trigger, `sp_claims_credential_rules`, on `sp_claims`. Two
triggers would mean two places to read before anyone could say what the
database actually refuses.

**The market checks sit before the draft exemption.** A missing `valid_until`
becomes valid when the holder finishes typing; an unsupported jurisdiction
never does, and telling them at submit time means telling them after the work.

_Status: Implemented, Tested._

## The identity derivation engine

`src/lib/security-passport/identity/`. Pure domain — no database, no React —
which is what lets the same derivation run in the browser, on the server and in
the tests from one definition.

Four outputs, **never merged**:

| Output                   | Means                                           |
| ------------------------ | ----------------------------------------------- |
| `educationCompleted`     | You finished a course. Nothing more is implied. |
| `professionalCompetence` | You hold the competence a role is built on.     |
| `localEligibility`       | An authority currently permits you to work.     |
| `activeTitles`           | What you may currently be **called**.           |

They are four separate arrays rather than one list with a `kind` field, so a
consumer has to choose which it renders. A single array invites `.map()` over
everything, and the first time somebody does that a completed VU1 appears
beside an Ordningsvakt appointment as though they were the same kind of fact.

Rules live in `sp_professional_titles` as **data**. `requiresCredentialCodes` is
an **AND**: every listed credential must be held _and_ satisfy the rule's
evidence and currency bars.

**Derivation happens at read time.** There is no job that writes "expired" when
an appointment lapses, and therefore no job that can stop running and leave a
lapsed authorisation reading as a current title on the artefact people
screenshot.

_Status: Implemented, Tested_ — 55 assertions in
`scripts/passport-identity-engine-check.ts`, nearly all mutations.

### Visibility

| Function                 | Audience                                                                   |
| ------------------------ | -------------------------------------------------------------------------- |
| `deriveVerifiedIdentity` | Everyone else. **No argument can admit self-declared evidence.**           |
| `derivePreviewIdentity`  | The holder's own view only. Every such title carries `selfDeclared: true`. |
| `withoutSelfDeclared`    | Belt and braces on the way out.                                            |

`buildPassportCard`, `buildDisclosurePayload` and `buildSocialCard` each strip
self-declared titles regardless of what the caller derived.

`PublicTitle` is a **reduced type** with no `expiresOn`, no `sourceClaimIds`
and no scope text. It exists because passing a full `ProfessionalIdentity` to
the social builder put an expiry date into an exported PNG, and the existing
forbidden-key guard caught it. Filtering at the serialiser would have fixed
that instance only.

_Status: Implemented, Tested._

## Two guards keep it that way

| Guard                             | What it refuses                                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `passport-title-derivation:check` | A credential code and a professional title appearing together anywhere outside the engine; and any drift between the fixture rule mirror and the migration that seeds it |
| `passport-identity-engine:check`  | VU1 alone producing Väktare; ordningsvakt training producing Ordningsvakt; and 45 more                                                                                   |

Both were **negative-tested**: a probe file mapping `VU1` → `"Väktare"` fails
the first, and weakening the Väktare rule to require only VU1 fails the second
(4 of the engine assertions) _and_ the mirror comparison.

_Status: Implemented, Tested, in CI._

## Explicitly prohibited

- Any table relating a role or credential in one market to one in another.
- A universal trust score, readiness score, suitability score or ranking.
- Deriving an expiry date from a published typical validity.
- Storing anything about a criminal-record, suitability, conduct or medical
  investigation behind a credential.
- Activating a market pack whose `legal_review_state` is `pending`.

## Future

Application-scoped disclosure made jurisdiction-aware · Arabic and RTL · issuer
workflow · renewal engine · automated register integration · Playwright
coverage at three viewports in three languages · a constrained
employer-attestation vocabulary.

Candidate data entry is **partly done**: the Swedish credentials the truth
model added are recordable, the jurisdiction control reads the active market
packs, and both are guarded. Clearing incompatible hidden values on a
credential-type switch is not yet implemented.
