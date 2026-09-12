# The pilot write-path defect — reproduction and correction

Text only. Every id below is synthetic; no hosted project was read or written.

## What the holder met

The pilot catalogues worked: the United Kingdom catalogue appeared, Dubai
showed its thirty choices, and the right credential was preselected when a
holder followed a catalogue link. Saving any of them failed with

```
Något gick fel. Försök igen.
```

## The cause, in four steps

1. `emptyCredentialDraft()` starts a draft at `jurisdictionCode: "SE"`.
2. The credential's real market was applied in exactly one place: the radio
   button's `onChange` in `CredentialForm`. A holder arriving from the
   catalogue with `?code=` never ran it, so the draft kept "SE".
3. The screen read the market from the definition, so it displayed "Great
   Britain" or "Dubai" above a draft that still said Sweden. Nothing on
   screen disagreed with anything else.
4. `saveCredential` wrote `jurisdiction_code` from that draft, and never
   wrote `sub_jurisdiction_code` at all.

## Reproduced on a full migration replay

As an entitled member of GB and AE-DU, filing the rows the old write path
built, as `SET LOCAL ROLE authenticated`:

```
-- A. ?code=UK_SIA_LICENCE_DS, draft jurisdiction still SE
ERROR:  SP_CREDENTIAL_NOT_AVAILABLE: UK_SIA_LICENCE_DS is not available yet
CONTEXT:  PL/pgSQL function sp_claims_credential_rules() line 97 at RAISE

-- B. ?code=AE_DU_SIRA_CARD_GUARD, same SE draft
ERROR:  SP_CREDENTIAL_NOT_AVAILABLE: AE_DU_SIRA_CARD_GUARD is not available yet

-- C. the same card after a MANUAL country change to AE, no emirate written
ERROR:  SP_SUB_JURISDICTION_REQUIRED: AE regulates security locally; name the
        emirate or region
```

A British credential is not available *inside the Swedish market*, which is
why (A) and (B) are refused before the jurisdiction rule is reached. The
same three rows are refused as drafts too: the market rules run above the
trigger's draft early-return, so "save draft" was broken as well.

What the taxonomy says those rows should carry:

| code | jurisdiction | sub-jurisdiction |
| --- | --- | --- |
| `UK_SIA_LICENCE_DS` | GB | (none) |
| `AE_DU_SIRA_CARD_GUARD` | AE | AE-DU |

Filing exactly those, as the same member, is accepted:

```
 credential_code       | jurisdiction_code | sub    | lifecycle_state
 UK_SIA_LICENCE_DS     | GB                | (null) | active
 AE_DU_SIRA_CARD_GUARD | AE                | AE-DU  | active
```

## The correction

- `applyCredentialType(draft, type, lang)` in
  `src/lib/security-passport/credentials.ts` is the one place a chosen
  definition is applied to a draft. Every entry path uses it: the `?code=`
  preselect, the manual radio change, and a resumed draft. A reconciliation
  effect re-applies it if a draft ever arrives carrying a market its
  credential does not belong to.
- `credentialClaimFields(draft, type, mode)` is the one place the stored row
  is built. `jurisdiction_code` and `sub_jurisdiction_code` come from the
  definition, on every write, insert and update alike — so a correction from
  a Dubai card to a British licence clears the emirate rather than leaving it
  behind. A definition that carries no jurisdiction of its own (a legacy or
  unregulated row) still takes the holder's country.
- The save-error mapping names the market refusals
  (`SP_CREDENTIAL_JURISDICTION_MISMATCH`, `SP_SUB_JURISDICTION_REQUIRED`,
  `SP_SUB_JURISDICTION_NOT_SUPPORTED`, `SP_CREDENTIAL_NOT_AVAILABLE`,
  `SP_MARKET_PACK_NOT_ACTIVE`) instead of "Something went wrong". That is the
  second half of the fix and never the whole of it: the cause was that the
  wrong market was sent at all.

**No migration was added, edited or rerun.** The database was already right;
the application was filing in the wrong market.

## What proves it from now on

- `supabase/tests/security_passport_pilot_write_path_test.sql`, 29
  assertions, every statement as `SET LOCAL ROLE authenticated`. Group 1
  asserts the three defective rows are refused, with their codes. Group 2
  files every GB and Dubai credential the way `credentialClaimFields` builds
  it and asserts each is stored in its own market. Group 3 keeps the market
  rules intact (a Swedish course filed in GB is still a mismatch; a
  non-member is still refused). Group 4 proves a correction clears the
  previous emirate. Group 5 proves the Swedish record is byte-for-byte
  unchanged. Group 6 proves no market was opened. Run by `scripts/db-test.sh`
  with a floor of 25.
- `scripts/passport-credential-form-check.ts`, write-path group: the mapping
  is asserted for all 52 credentials in the four catalogues, each from a
  draft deliberately carrying "SE" and a stale emirate; the source is
  asserted to have one helper on every path and no market assignment of its
  own. Reinstating the defect fails five of its assertions.
- `e2e/passport-three-market.spec.ts`, "the write path": six scenarios that
  drive the real routes. The `saveCredential` stub does not say "saved" — it
  runs the application's own `credentialClaimFields` over the payload the
  browser sent and then refuses it with the same codes
  `sp_claims_credential_rules` raises. Reinstating the defect fails A, B and
  C with `Expected "GB", Received "SE"` and a mismatched row.

## What did not change

No migration. No market opened: Sweden is still the only active pack, and
GB, GB-NI and AE-DU remain `is_active = false`,
`legal_review_state = 'pending'`, `pilot_state = 'internal_pilot'`. No
Swedish entry moved market or was removed. Nothing hosted was written.
