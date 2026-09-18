# BESKT — what the owner must supply before an internal pilot can be published

**Updated:** 2026-09-18, against production `wrygicdfxwjnrugduxnt` (read-only).

The product is complete end to end and walked in a browser against a real
database: library → preparation from an application → candidate → Interviews →
prompts → independent positions → panel → signed report, plus the governance
surface. What production lacks is **people with the roles the contract
requires**, and a governed method **written and reviewed by them**. Code cannot
supply either without weakening the gates.

## What production holds today

| Fact                                                        | Value                                          |
| ----------------------------------------------------------- | ---------------------------------------------- |
| Migration ledger frontier                                   | `20261126090000` (Passport, #265)              |
| Security fixes `20261127090000`, `20261128090000` (PR #266) | **not applied**                                |
| BESKT methods / versions / mandates / pilot grants          | 0 / 0 / 0 / 0                                  |
| Preparations / conduct sessions / reports                   | 0 / 0 / 0                                      |
| Content role `editor` / `reviewer` / `publisher`            | **0** / 1 / **0**                              |
| Platform admins                                             | 1                                              |
| Employer `cqrityjob`                                        | `b901bdaf-6931-4b55-92b5-11053cf8ab6b`, active |

## What the contract decides, and what it leaves to people

Decided and enforced in the database: the evidence states, the observation
fields, the roles, the prohibitions (no score, ranking, pass/fail,
recommendation, credibility or suitability inference), the five review gates,
and `release_scope = 'synthetic_internal_only'` — the only representable value.

**Not decided anywhere in the repository:** the method's actual questions,
exposure profiles, prompts, routing and evidence anchors. They must be written
by the editor and reviewed by the five gates. Nothing in this repository may be
presented as that content or as its review. The synthetic method in the local
test environment is test content, labelled so, and must never be copied to
production.

Because of `synthetic_internal_only`, even a published method is for internal
use with test candidates — not for real applicants.

## The people, and where each of them works

| Role           | How many                                                                                                         | What the database requires                                                             | Where they work                                                            |
| -------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Editor         | 1                                                                                                                | content role `editor`                                                                  | `/beskt-governance` → _Skapa en metod_, then the _Innehåll_ tab            |
| Gate reviewers | 5, one per gate: `personnel_security`, `senior_hr`, `recruitment`, `employment_privacy_legal`, `data_protection` | content role `reviewer` **and** a live mandate for exactly that gate; never the author | `/beskt-governance/<version>?tab=lifecycle` → their own gate               |
| Publisher      | 1, not the editor                                                                                                | content role `publisher`                                                               | `/beskt-governance/<version>?tab=lifecycle` → _Publicera_                  |
| Platform admin | the existing one                                                                                                 | `admin`                                                                                | `/admin/beskt-methods/<version>?tab=access` — mandates and the pilot grant |

The existing generic `reviewer` can be one of the five if they did not author
the content and receive the mandate for their own gate.

None of the seven needs to be a platform admin: `/beskt-governance` admits
exactly who the governance tables admit (`scp_interview_can_read`).

## The steps

1. **Nominate** the seven people and give each an ordinary account (they sign
   up themselves; nobody creates accounts on their behalf).
2. **Admin:** grant the content roles `editor`, `reviewer` (×5), `publisher`
   through the existing user and role administration.
3. **Admin:** record the documented decision appointing each reviewer to their
   gate, then grant the five mandates at
   `/admin/beskt-methods/<version>?tab=access` → _Uppdrag att granska_, naming
   that decision in _Dokumenterat beslut_. (A mandate is platform-wide, so this
   can be done on the first draft's page.)
4. **Editor:** `/beskt-governance` → _Skapa en metod_, then author all eight
   families on _Innehåll_. _Granskning och publicering_ lists what the
   validator still wants, in its own words.
5. **Editor:** _Lämna till granskning_ once the validator is silent.
6. **Each reviewer:** decide their own gate with a written rationale. Any
   content change afterwards voids all five approvals, so review last.
7. **Publisher:** _Publicera_.
8. **Admin:** _Pilotmedgivanden_ → _Anta en arbetsgivare_: employer id
   `b901bdaf-6931-4b55-92b5-11053cf8ab6b` (`cqrityjob`), the documented pilot
   decision, and an expiry date. Only that grant makes the method visible in
   that employer's _Tester & bedömningar_; it lapses by itself.

## Before any of that reaches production

1. PR #266 merged and applied by the Supabase GitHub integration, with hosted
   evidence recorded.
2. The application PR (`claude/beskt-final-product-pilot`) merged after it.
3. Lovable publishing main (the owner's action).

## What must not be done

- No placeholder reviewers, and no person holding several gates under
  different logins.
- No real candidate data: the release scope is synthetic-internal only.
- No pilot grant beyond the one designated internal employer.
