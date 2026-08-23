# Security Passport — DPIA technical input

Material a data-protection impact assessment needs from the engineering side.

**This is input to a DPIA, not a DPIA, and not legal approval.** A qualified
reviewer writes the assessment; this document exists so they do not have to
reverse-engineer the system to do it.

_(Status markers as defined in [three-market-architecture.md](./three-market-architecture.md).)_

---

## What the system does

A holder records professional claims about themselves. Some are verified by a
human verifier or attested by an employer. The holder chooses, per recipient
and per application, what to disclose. Nothing is published by default.

## Data flows

| #   | Flow                                | Trigger                    | Recipient                                       |
| --- | ----------------------------------- | -------------------------- | ----------------------------------------------- |
| 1   | Holder records a claim              | Holder                     | Holder only                                     |
| 2   | Holder attaches evidence            | Holder                     | Holder + assigned verifier                      |
| 3   | Verifier decides                    | Verifier                   | Holder; recorded in `sp_verification_decisions` |
| 4   | Employer attests employment         | Employer, holder-initiated | Holder                                          |
| 5   | Holder creates a token disclosure   | Holder                     | Anyone with the link                            |
| 6   | Holder discloses to one application | Holder                     | One employer workspace                          |
| 7   | Weekly regulatory source check      | Cron                       | No personal data involved                       |

**Flow 6 carries no personal data until the holder acts.** An application does
not grant access; the absence of a disclosure is indistinguishable from the
absence of a Passport.

## Technical measures

| Measure                                                | Where                               | Status                     |
| ------------------------------------------------------ | ----------------------------------- | -------------------------- |
| RLS on every exposed `public` table                    | migrations                          | Implemented, Tested        |
| RLS and grants treated as separate gates               | every `sp_*` migration              | Implemented, Tested        |
| No `anon` grant on any reference table                 | `20260907090000`                    | Tested — asserted as a set |
| Reference data read-only to `authenticated`            | `20260907090000`                    | Tested                     |
| Source review items readable by nobody through the API | RLS with no policy **and** no grant | Tested                     |
| `SECURITY DEFINER` functions pin `search_path`         | all `sp_*`                          | Implemented                |
| Default `PUBLIC`/`anon` EXECUTE revoked explicitly     | all `sp_*`                          | Implemented                |
| Ownership checked inside the function, not by RLS      | `sp_correct_claim` etc.             | Implemented, Tested        |
| Correction creates a version; never overwrites         | `sp_correct_claim`                  | Implemented, Tested        |
| Append-only event history                              | `sp_passport_events`                | Implemented, Tested        |
| Expiry derived at read time                            | `validity.ts`                       | Implemented, Tested        |
| Titles derived at read time                            | `identity/`                         | Implemented, Tested        |
| Self-declared titles cannot reach a third party        | `visibility.ts`                     | Implemented, Tested        |
| Public surfaces carry a type with no dates             | `PublicTitle`                       | Implemented, Tested        |

## Risks and what reduces them

| Risk                                                     | Reduction                                                                          | Residual                                                                                    |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| A lapsed authorisation shown as current                  | Derivation at read time; nothing to schedule, nothing to fail                      | Clock skew across a midnight boundary; one evaluation date per read                         |
| A training certificate read as legal authority           | Four separate outputs; mutation tests; DB-level rule integrity                     | A market pack authored wrongly. Mitigated by the review gate                                |
| A credential from one market read as evidence in another | Trigger refuses cross-market writes; no table relates them; rule integrity trigger | **Requires legal review** per pack                                                          |
| A public card leaking sensitive data                     | Forbidden-key guard; reduced `PublicTitle`                                         | New field added to a public payload without a guard entry                                   |
| Register commentary entering the record                  | `narrow_result_only`, binding drafts too; migration asserts exactly two such rows  | Free text in an _unrelated_ credential's note. **Future**: note scanning is not implemented |
| An employer reading a Passport without disclosure        | Disclosure must be created by the holder; identical "none" response                | None known                                                                                  |
| Unreviewed regulatory content reaching a holder          | `CHECK` constraint on the pack + per-row `is_active`                               | A reviewer approving without reading                                                        |

## What this system deliberately cannot do

- Produce a score, rank, or automated decision about a person.
- Verify a claim on the holder's own authority.
- Read SCP assessment internals — questions, scores, reviews or reports.
- Change a rule from remote content.
- Store the investigations behind a credential.

## Open items for the reviewer

1. **Controller/processor determination** per market and per flow.
2. **Legal basis** per flow — see the warning about consent in
   [privacy-processing-matrix.md](./privacy-processing-matrix.md).
3. **Sweden**: whether recording even the narrow personnel-approval result is
   lawful in a given workflow (IMY guidance on criminal-offence data).
4. **UK**: ICO guidance has moved under the Data (Use and Access) Act. Re-read
   the four ICO sources on the implementation date.
5. **Dubai**: UAE federal and Dubai-specific data protection; the SIRA portal
   does not answer our monitor; Arabic vocabulary is unreviewed and absent.
6. **Retention schedules** per data category — not yet defined.
7. **International transfer** analysis — not yet performed.
8. **Holder export** — not yet implemented.

## Explicitly outside this work

Any processing of the prohibited categories listed in the processing matrix.
Adding one requires a separately approved basis, purpose, retention rule, DPIA
and explicit owner approval.
