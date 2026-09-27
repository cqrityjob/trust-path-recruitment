# Security Passport — completion work order

## Four markets: Sweden, India, United Kingdom, Dubai (UAE)

**For** the implementing model
**Repository** `cqrityjob/trust-path-recruitment`
**Date** 2026-09-27 · revision 3 (corrected baseline)
**Author** Claude, Senior Software Architect; baseline corrected at the owner's instruction
**Supersedes** revision 2 (commit `07cc744`, kept in git history). Where the two differ, this revision governs.

---

## How to read this

This document is the whole instruction. Where a number, an order or a wording is given, use it exactly. Where something here is impossible, **stop and report it**. Do not substitute your own judgement about how a regulated credential is presented.

§0 was measured on 2026-09-27, read-only, against `main` at `ed2bcff` and against production. Re-measure before relying on it. A document that names a project, a status or a PR is a claim, not evidence. That includes this one.

Naming is fixed: the product is **Security Passport**; the holder's card is **the Passport card**. The "Trust Card" wording from an old mockup must not appear in code, copy, routes, file names or commit messages.

**Objective.** Ordinary registered users can register supported credentials from Sweden, India, the United Kingdom and Dubai without individual pilot grants. Review, sharing and admin operations work, and trust and privacy protections are unchanged.

### What revision 3 corrects

| Topic | Revision 2 | Revision 3 |
|---|---|---|
| Production | `mlvzmiutmyyqeuvjglco`; market-pack stack never applied | `wrygicdfxwjnrugduxnt`; its migration ledger is identical to `main` (§0.2) |
| A1–A5, guard defects, replay gate | Open or unverified | Fixed on `main`, with remainders named; three new defects, G3–G5 (§0.3) |
| Occupation line | Engine-derived title only | The Profile occupation, marked self-described, as shipped today (§1) |
| Card, badges, trust display | A locked 2:3 redesign | Proposals only. The current compact navy card, shields and flags stay (§1, §6) |
| Recipient card | No self-declared content; no source-confirmed state | Current selective sharing stays, including labelled self-reported credentials and existing source-confirmed states (§1) |
| PR 1 | "No schema", yet it held a database-function fix and a rollback fix | PR 1 has no migration; database work has its own PRs, with dependencies named (§3) |
| Release | A separate hosted catch-up plan | None needed; merging a migration to `main` releases it to production (§0.2) |

---

## §0 — Baseline

### 0.1 Owner decisions and actions

| # | Item | Status | Blocks |
|---|---|---|---|
| D1 | A1 gate query | **Closed.** A1 is fixed on `main`; production has no active unscoped skyddsvakt claim | — |
| D2 | Named owner of the legal-review gate for UK, India and Dubai, and the list of UK and Dubai definitions that open. India's four definitions are already open to every signed-in user; D2 names who owns that statement and does not reopen it | **Open** | PR 4 |
| D3 | Production release gate. Merging to `main` applies migrations to production (§0.2), so approving the merge of PR 2 or PR 4 approves its release. The 2026-09-27 reconciliation note asked for the integration's "Deploy to production" to stay off pending review. It was on at 17:14Z. Confirm the intended setting and the gate | **Open** | Merging PR 2 and PR 4 |
| D4 | Withdrawal and catalogue approval stay reviewed migrations, as `docs/passport/closed-catalogue-governance.md` defines. In-app withdrawal with an audit trail would add a PR 5 | **Open**; this plan assumes the current governance | PR 5, only if changed |
| O1 | Custom SMTP for Auth on `wrygicdfxwjnrugduxnt`. The default mailer refuses addresses outside the project team (`docs/release/2026-09-26-auth-confirmation-email-owner-actions.md`) | **Open**; not visible to read-only tools | Announcing the public pilot |

### 0.2 Production — identified and measured 2026-09-27, read-only

**Deployment and project, identified together**

| | |
|---|---|
| Deployment | Lovable project "Security Talent Hub" (`9ec625ef-34a1-4b4b-8cbb-712cae168579`), published publicly at `https://trust-path-recruitment.lovable.app`. Lovable reports it synced to `ed2bcff` |
| Project | Supabase `wrygicdfxwjnrugduxnt`, "CQrityjob Production", eu-central-1, Postgres 17, healthy |
| Link between them | The project's edge logs (the 24 h to 18:40Z) show browser requests with referer `trust-path-recruitment.lovable.app` to `/auth/v1/token`, `/auth/v1/user`, `/auth/v1/logout` and `/rest/v1/*`; the latest was at 18:27Z |
| Schema deploys | The Supabase GitHub integration clones `main` and applies new migrations. Its run log shows `Applying migration… 20261219090000_assessment_draft_authoring.sql` at 17:14:55Z, after that PR merged |
| `mlvzmiutmyyqeuvjglco` | The Supabase connection used for this check lists only `wrygicdfxwjnrugduxnt`, and no request evidence links the deployment to `mlvz…`. Revision 2's §0.2 figures describe that project, not production. The repository's own lock (`supabase/deployment-targets.json`) agrees, but was not relied on |

Not verified: the deployed JavaScript bundle and the `cqrityjob.com` domain, because the verification session's network policy blocks both hosts. No request in the log window carried a `cqrityjob.com` referer.

**Production state (aggregates only)**

| | |
|---|---|
| Migration ledger | 322 rows, latest `20261219090000`: exactly the 322 versions in `supabase/migrations/` on `main` |
| Market-pack schema | Applied: `sp_market_packs`, `sp_pilot_members`, `sp_professional_titles`, `sp_claims.authorisation_scope` |
| Claims | 49 (31 active, 18 withdrawn) from 3 holders: SE 29, IN 1, GB 1, international 18 |
| Corrections (`supersedes_id` set) | 0 |
| Skyddsvakt claims (scope required) | 1, withdrawn and unscoped. **0 active** |
| Market packs | `SE` active, legal review `grandfathered`. `GB`, `GB-NI`, `AE-DU` inactive, `internal_pilot`, legal review `pending`. `AE-AZ` inactive, `closed` |
| Pilot grants | 3 active on each of `GB`, `GB-NI`, `AE-DU` |
| Definitions | Active: SE 8, IN 4 (no pack), international 14. Inactive: GB 13, GB-NI 1, AE-DU 30, AE-AZ 7 |
| E-mail sign-up | 4 sign-ups in 21 days, each confirmed after a confirmation was sent. This does not show that an address outside the team can be confirmed (O1) |

Consequences:

1. Nothing is waiting to be released. Revision 2 §7.5 (the parity list and a dry run against a hosted copy) is withdrawn.
2. PR 2 and PR 4 change a running system, and each is live the moment it merges.
3. Production is pre-launch (3 holders): there is room to do this correctly rather than quickly.

### 0.3 Defect status on `main` (`ed2bcff`)

| ID | Status | Evidence | Remaining |
|---|---|---|---|
| A1 legacy skyddsvakt correction | **Fixed** | A superseding INSERT inherits a scopeless predecessor's standing (`20260908090000:181-209`). `sp_correct_claim` carries every field (`20260907091000:451-583`). SV is corrected through `sp_save_international_credential`, which requires a scope (`20261214090000:768-773`) | No test corrects a *verified*, scopeless SV claim with a new scope through that RPC: PR 1. A scopeless correction stays refused by design |
| A2 code length | **Fixed** | CHECK `^[A-Z0-9_]{2,48}$` (`20260907091000:49-54`). `CREDENTIAL_CODE_MAX_LENGTH = 48` in `src/lib/security-passport/credentials.ts`; `passport-credential-form:check` keeps the two equal | None |
| A3 scope discarded | **Fixed** per the owner decision | Exact scope only for application-scoped, `employer_review` and `full_verification` disclosures (`20261101090000:573-604`). Never in a public title or the social card | Two latent points (§6) |
| A4 country rendered twice | **Fixed** | Suffixes removed from titles (`20260908091000:65-117`). `titleWithJurisdictionOnce` on every surface that joins a title to a place, enforced by `passport-page-composition:check` | 12 inactive `AE_DU_TITLE_*` rows still end `· Dubai, UAE` (`20260914091000:210-229`); see §4 |
| A5 training shown as "Väktare" | **Fixed** | `Väktarutbildning (VU1 + VU2)` / `Security Guard Training (VU1 + VU2)` (`20260908091000:60-63`), with the `identity/market-rules.ts` mirror; both guarded in CI | None |
| G1 `scripts/` outside typecheck | **Fixed** for `.ts` | `tsconfig.scripts.json` and the CI step "Type-check the Passport guard scripts". `passport-fixture-check.ts` reads fields that exist | 16 `.tsx` guards (`scripts/passport-*.tsx`, `trust-surface-check.tsx`) are not type-checked. 5 Passport checks run in no workflow. PR 1 |
| G2 Sweden rollback | **Fixed** | The separate artifact `supabase/rollback/20260907091000_sp_sweden_truth_model_rollback.sql` refuses by default; `docs/passport/release-and-rollback.md` documents it | Optional hardening (§6) |
| Replay gate | **Obsolete** | `scripts/db-test.sh` replays every migration with `ON_ERROR_STOP=1`. The allowlist was removed on 2026-08-28, and `scripts/migration-safety-check.ts` forbids its return | Gate: strict replay from empty passes. Never add an allowlist, a tolerated error or a skip |
| Presentation (revision 2 §3.1–§3.5) | **Done** | One card on `/passport` and none in the side column. No controls in the card beyond the `+N` link to Credentials. Name rules exactly as specified. Four tabs. All enforced by `passport-page-composition:check` | None |

New defects:

| ID | Defect | Evidence | Needs |
|---|---|---|---|
| G3 | The market gate runs on every UPDATE and tests the acting user's pilot membership. A reviewer without a grant cannot record a decision on a GB, GB-NI or AE-DU claim. After a withdrawal or revocation, the holder cannot archive an existing claim or add evidence to it. Inferred from code; no suite decides a UK or Dubai claim | `sp_claims_credential_rules`, `20261214090000:489-498`, with no `TG_OP` condition | Database function change: PR 2 |
| G4 | Pack availability is tied to legal approval. `sp_market_pack_active_needs_review` allows `is_active` only with legal review `approved` or `grandfathered`, and `SP_MARKET_PACK_NOT_ACTIVE` names legal review as the reason. Per-member grants are the only way around it | `20260907090000:158-159`, `20261214090000:493-496` | A separate availability state: PR 2. The constraint stays |
| G5 | `/passport/information` reports India as unsupported because India has no market pack. The credential picker offers India's definitions correctly | `getRegulatedCredentialAvailability` in `src/lib/security-passport/credentials.functions.ts` | Application change: PR 3 |

Stale records:

- `docs/passport/release-and-rollback.md` names the retired `zrahptwsnjcdyzfywbeh` as the live backend.
- `india-market-entry.md` says #298 is unmerged.
- `pilot-approval-decisions.md` says `20261126090000` is pending.
- `closed-catalogue-governance.md` counts 22 selectable definitions; there are now 26.

All four are corrected in PR 1.

### 0.4 Coverage on `main`

| Market | Definitions | Who may register | Save, edit, evidence, review | Share | Admin view |
|---|---|---|---|---|---|
| Sweden | 8 | Any signed-in user with a Passport | Works | Works | Diagnosed |
| India | 4 national qualifications, no pack | Any signed-in user with a Passport | Works | Works | Diagnosed; G5 |
| United Kingdom | GB 13, GB-NI 1 | Named pilot members only | Members only; G3 | Works | Diagnosed |
| Dubai, UAE | AE-DU 30 (AE-AZ 7 stay closed) | Named pilot members only | Members only; G3 | Works | Diagnosed |
| International | 14 | Any signed-in user with a Passport | Works | Works | Diagnosed |

The gate lives in the layers below (latest definitions), and every layer must agree:

- **Access helpers:** `sp_market_access` and `sp_is_pilot_member` (`20261109090000:130-187`).
- **RLS:** `sp_credential_types_read` (`20261109090000:81-96`).
- **Catalogue view:** `sp_approved_credential_catalogue` (`20261214090000:321-409`).
- **Save RPC:** `sp_save_international_credential` (`20261214090000:751-818`).
- **Triggers:** `sp_00_closed_catalogue` (`20261126090000:213-258`) and `sp_claims_credential_rules` (`20261214090000:419-708`).
- **Server functions:** `credentials.functions.ts`, `international.functions.ts`, `market-access.ts`, `market-catalogue.ts`.
- **Copy:** `i18n.ts`.
- **Admin:** `catalogue-diagnostics.ts` and `/admin/passport-catalogue`.

What else is already on `main`:

- **Review:** a queue, clarification with a required message, and one final decision. The holder answers a clarification with evidence.
- **Sharing:** selected credentials, 7/30/90-day links, preview, revocation, and a QR code of the generated link.
- **Share link:** it deliberately goes through the backend gateway (`…/functions/v1/passport-share#token`) and hands off to `/p/handoff`, which keeps the bearer token out of hosting logs (`20261104090000`).

---

## §1 — Owner decisions (binding)

1. **Occupation line.** The Passport card shows the Profile occupation under the holder's name, marked self-described: "Nuvarande yrke · Egen uppgift" / "Current professional role · Self-declared".
   - A derived title never replaces it. The derived standing stays in the side panel, marked self-declared.
   - Profile is the only place the occupation is edited.
2. **The Passport card.** The current compact navy card, its shields and its flags stay, with their current labels: "Global" with a globe for international credentials, "Dubai", and "Northern Ireland" with the UK flag.
   - A flag always comes from the credential's own jurisdiction, never from the holder's country.
   - Fixes in this delivery work inside that card.
3. **Selective sharing.** The current authorised behaviour stays:
   - The holder chooses what is shared.
   - Self-reported credentials, and the Profile title if the holder includes it, stay on the recipient card with their honest labels.
   - Existing source-confirmed states and their treatment stay.
   - Nothing is silently removed from the recipient card or downgraded on it.
   - The share link keeps its gateway design.
4. **A3 scope.** The exact scope appears in application-scoped disclosures and private employer packages. It never appears in `public_card`, a public title, a social card or an exported image. The public view may say that an authorisation is limited, not what it is limited to.
5. **A5 label.** `Väktarutbildning (VU1 + VU2)` / `Security Guard Training (VU1 + VU2)`, with no tier change.

## §2 — The six concepts that must never collapse into each other

Keep these distinct in the schema, the access rules, the admin view and the copy:

1. **Credential definition** and its source evidence
2. **Catalogue availability** — may a user select it today
3. **Permission to register** a holder's own claim about it
4. **Claim trust and verification** state
5. **Legal / expert review** state of the definition
6. **The holder's actual permission to work**

Opening a market changes (2) and (3). It changes nothing about (4), (5) or (6).

**Never** mark a pending legal or expert review complete to make a credential available. G4 is resolved with a separate availability state, not by editing the review state or the constraint.

**Never** state or imply that registering a credential grants permission to work.

---

## §3 — PR sequence: minimum, dependency-ordered

One phase per PR. Each PR merges before any PR that depends on it begins. A PR that carries a migration is released to production by its merge (D3).

| PR | Phase | Layer | Depends on | Blocked on |
|---|---|---|---|---|
| **1** | Foundation remainder | Tests, guard config, CI wiring, records. No migration | — | — |
| **2** | Availability model | Database: one additive migration and its rollback artifact. No market opens | PR 1 | D3 (merge) |
| **3** | Public pilot in the application | Application. No migration | PR 2 merged and applied | — |
| **4** | Open UK and Dubai | Database data: one additive migration and its rollback artifact | PR 2, PR 3 | D2, D3 |

Announce the public pilot only after PR 4 is verified on production and O1 is done.

### PR 1 — foundation remainder (no migration)

Each item is here because a later PR relies on it.

- **A1 test.** A verified, scopeless legacy SV claim is corrected with a new scope through `sp_save_international_credential`, and a correction without a scope is refused. PR 2 edits both triggers on this path.
- **G1 remainder.** PR 3 and PR 4 edit guards that are not yet type-checked, so:
  - Add `scripts/passport-*.tsx` and `scripts/trust-surface-check.tsx` to `tsconfig.scripts.json`, and repair what that surfaces.
  - Run `passport-date-validation`, `passport-persona-journey`, `passport-recipient-card`, `passport-skill-contract` and `passport-workspace` in CI, or report why one cannot run.
- **Records.** The releases of PR 2 and PR 4 follow `docs/passport/release-and-rollback.md`, so it must name production correctly:
  - In `release-and-rollback.md`, production is `wrygicdfxwjnrugduxnt` and `mlvzmiutmyyqeuvjglco` is excluded.
  - Correct the stale lines in `india-market-entry.md`, `pilot-approval-decisions.md` and `closed-catalogue-governance.md`.

Acceptance: CI is green on the pushed SHA, and the new test fails when the RPC's scope requirement is removed. No application, schema or copy change.

### PR 2 — availability model (database)

- **New state.** Add a **public-pilot** availability state for market packs and definitions, independent of `is_active` and `legal_review_state`. A new value of the existing `pilot_state` columns is one way to do it. `sp_market_pack_active_needs_review` and every review state stay unchanged.
- **Every layer.** Admit that state for any signed-in user in each layer listed in §0.4. Saving still requires a Passport, as today. A gate present in one layer and missing in another is a defect.
- **G3.** Apply the market and credential gates only to INSERT, and to UPDATEs that change the credential or its jurisdiction. Review decisions, archive and evidence on existing claims keep working after a withdrawal or revocation.
- **Error text.** `SP_MARKET_PACK_NOT_ACTIVE` stops presenting legal review as the reason a market is unavailable.
- **Grants.** Keep `sp_pilot_members`, its rows and its RPCs as history. Nothing new depends on a grant.
- **No data moves.** No pack, definition or claim changes state.
- **New tests:**
  - A fixture pack in the new state is registrable by an ordinary user with no grant.
  - A reviewer without a grant decides a GB and an AE-DU claim.
  - After withdrawal, an existing claim stays readable, archivable and reviewable, and the definition cannot be newly registered.
  - AE-AZ stays closed.
- **Existing tests.** Tests that encode G3's current behaviour are updated here. Member-only tests for current data stay green, because no data moves.

Acceptance: strict replay and every SQL suite pass, and the rollback artifact is tested. After merge, a read-only check on production confirms the new ledger row and that no pack, definition or claim changed.

### PR 3 — public pilot in the application (no migration)

- **New state.** Handle it in `getRegulatedCredentialAvailability`, `listSelectableMarkets`, `market-access.ts`, `market-catalogue.ts` and the picker's empty state. Where the state is absent, fail closed.
- **G5.** Report India as supported on `/passport/information`.
- **Copy (Swedish and English):**
  - Public pilot, legal review pending and "not permission to work" stay three separate statements.
  - Availability refusals get their own message instead of the generic save error.
  - Use the existing Dubai labels; never "UAE" alone.
- **Admin.** `catalogue-diagnostics.ts` and `/admin/passport-catalogue` show the new state, with legal review in its own column. Regenerate `catalogue-coverage-matrix.md`.
- **Browser proof** on the local stack, with a fixture pack in the new state.

Acceptance: CI is green. Screenshots of the picker and `/passport/information` at 390px and 1440px, in Swedish and English. After merge, the owner publishes the app in Lovable.

### PR 4 — open UK and Dubai (data)

- **Migration.** One migration moves `GB`, `GB-NI`, `AE-DU` and the definitions named under D2 to the public-pilot state.
  - `is_active`, `legal_review_state`, every claim and every professional-title rule stay unchanged.
  - `AE-AZ` and every other emirate stay closed.
- **Tests.** Update the tests that encode member-only access for those packs to the explicit public-pilot decision:
  - SQL suites in `supabase/tests/`: `security_passport_market_pilot_test.sql`, `security_passport_pilot_catalogue_visibility_test.sql`, `security_passport_pilot_scope_test.sql`, `security_passport_pilot_write_path_test.sql`, `security_passport_three_market_foundation_test.sql`, `security_passport_catalogue_completeness_test.sql`, `security_passport_india_national_qualifications_test.sql`, `security_passport_pilot_bugfix_1_test.sql`, `security_passport_global_certification_test.sql`.
  - Scripts: `passport-catalogue-filter-check.ts`, `passport-market-catalogue-check.tsx`, `passport-schema-drift-check.ts`, `passport-global-certification-check.ts`, `passport-catalogue-coverage-matrix.ts`.
  - Browser specs: `e2e/passport-three-market.spec.ts`, `e2e/passport-workspace.spec.ts`.
  - Preserve every ownership, privacy, jurisdiction and trust assertion. A shipped migration's postflight is never edited.
- **Proof.** Prove every case in §5 before merge.

Acceptance: §5 passes on an isolated real backend. After merge, a read-only check on production confirms the pack and definition states, and that review states and claims are unchanged.

### Release order

1. PR 1 merges. Nothing reaches the database.
2. PR 2 merges and the integration applies it. Verify read-only.
3. PR 3 merges, and the owner publishes it in Lovable. UK and Dubai stay members-only, because no pack has moved.
4. O1 is done any time before the announcement.
5. After D2, PR 4 merges and the integration applies it. Verify read-only; the owner then runs the smoke test (§8).

The application never depends on schema that production lacks: PR 3 fails closed without PR 2, and PR 4 changes data only.

---

## §4 — Rules carried forward (binding)

- **Forbidden shortcuts:**
  - Granting broad table access.
  - Marking all definitions active.
  - Disabling or weakening a guard.
  - Giving every new user pilot membership.
  - Any path that lets a holder raise their own trust level.
- **Withdrawal:**
  - A withdrawn or unsupported definition stays unavailable for new registration.
  - Existing claims stay readable under their original ownership and sharing rules, keep their trust, and can still be archived and reviewed (G3).
  - Withdrawal never destroys or downgrades a claim.
- **Market boundaries:**
  - Sweden: every currently supported and substantiated Swedish definition.
  - India: national qualifications stay distinct from occupational licences, and never carry an eligibility or a title.
  - United Kingdom: correct territorial applicability, including Northern Ireland.
  - Dubai: `AE` / `AE-DU` scope, labelled with the emirate. Never relabel a Dubai credential as valid throughout the UAE. Other emirates, including `AE-AZ`, stay outside this release.
- **Four facts:** residence, current work country, desired destinations and credential jurisdiction are separate.
  - Changing one never rewrites another and never hides a credential.
  - A destination preference never becomes a credential or a work authorisation.
  - Changing the holder's work country never changes the jurisdiction a recipient sees.
- **Professional titles:**
  - Title rules for GB, GB-NI and Dubai stay inactive.
  - An `AE_DU_TITLE_*` row is activated only by a new data migration that removes its `· Dubai, UAE` suffix, together with a guard that covers non-Swedish titles.
- **Fields and enforcement:**
  - The definition decides the jurisdiction, the scope, and which of issuer, version and dates apply.
  - Source-defined issuer distinctions are kept.
  - `SP_CREDENTIAL_REQUIRES_SCOPE`, `SP_CREDENTIAL_REQUIRES_VALID_UNTIL` and the other credential rules stay in the database, so a form defect can never create a false active claim.
- **Never on the Passport card or the social card:**
  - Personnummer or any other national identity number.
  - Credential or licence reference numbers.
  - The exact authorisation scope.
  - Document links, filenames or thumbnails.
  - Anything from an inactive market.
  - Internal HAYAT references.
  - Interactive controls beyond the `+N` link.
  - The social-card forbidden-key list is extended when a field is added, and never shortened.
- **Flags:** no Ulster Banner, and no other unofficial or contested regional flag. Territory is carried by the text label.
- **Safe rendering:**
  - An unknown display category renders safely.
  - A missing expiry reads "Expiry date not provided", never lifetime validity.
  - Every credential keeps its own trust and validity.
  - Database-to-application vocabulary checks stay.
- **No invented hierarchy:** no ranking of professional importance, no inference that one qualification proves another, and no deleting a record to simplify a display.
- **HAYAT and review:**
  - Extraction helps the holder fill the form. It never raises trust, and the holder confirms extracted values.
  - Automatic checks run only where an implemented, enabled adapter supports them. Otherwise, say plainly that automatic verification is unavailable and offer the evidence and review route.
  - Never invent a verification ID, an issuer confirmation or a successful check.
  - No "verified" label from an upload, an OCR success or a self-report.
  - A future automated confirmation becomes its own trust state.

## §5 — Proving it

Use synthetic accounts on an isolated real backend: the local stack that CI uses. **Never create test credentials in the owner's production account**, and leave no test data behind.

| # | Case |
|---|---|
| A | A fresh ordinary account **with no pilot grant** browses and saves supported credentials from Sweden, India, the UK (GB and GB-NI) and Dubai |
| B | An existing mixed-market account adds each Indian qualification, returns to `/passport` and reloads without error |
| C | Dubai's required fields are enforced; AE-AZ and the other emirates stay closed |
| D | International credentials survive a work-country change unchanged |
| E | Review: request → clarification → evidence → decision, including a reviewer without a grant deciding a GB and an AE-DU claim |
| F | Selective sharing → QR → logged-out recipient → expired link → revoked link; selected self-reported credentials appear with their label |
| G | Another user can neither read nor modify the holder's private data |
| H | A withdrawn definition cannot be newly registered; existing claims stay readable, archivable and reviewable |
| I | A verified, scopeless legacy SV claim is corrected with a scope; without a scope, the correction is refused |
| J | The current card renders an empty account, VU1+VU2 only, a current ordningsvaktsförordnande, an expired credential, all four markets together, and more credentials than shield slots (`+N`) |

Run every case in Swedish and English, on desktop and mobile, including long names, missing optional fields, expired credentials and unknown display categories.

- Exercise every definition that PR 4 opens through the real save contract.
- Browser-test one form per distinct field pattern.
- Mutation-test every guard you touch: each must fail when its protected behaviour is deliberately broken.
- Never disable an assertion, lower a floor or narrow a locator to hide a regression.

## §6 — Not in the minimum path

These are the owner's call; none of them blocks the objective.

- **Revision 2 visual system:**
  - The 2:3 portrait card and its zone layout.
  - Shield, hexagon and notched-rectangle badge forms in external groups.
  - Percentage trust rings and the rewritten trust footer.
  - Content caps, responsive scales and motion rules.
- **Trust vocabulary:** a single module with a build guard. Trust words are still hard-coded in `product-status.ts`, `CredentialWallet.tsx` and `RecipientPassportCard.tsx`.
- **Draft stage:** governed saves create active claims today.
- **Clarification replies:** a text reply; today the holder answers with evidence.
- **Admin:** in-app withdrawal with `audit_logs` entries (D4). A re-issued pilot grant also overwrites the earlier revocation, so that history is lost.
- **A3, exact scope:** on a holder's direct link to an employer. Selected shares send `authorisation_scope` as NULL by design (`20261126090000:285`).
- **A3, `scope_limited`:** taking it from `requires_scope` instead of a stored scope. Production has no active scopeless claim that it would affect.
- **Share links:** on the application domain (revision 2 §7.3). This conflicts with the gateway design that §1 keeps.
- **G2 hardening:** follow correction chains after the explicit opt-in, and test the refusal against a corrected chain.
- **Recipient card name:** apply the holder card's name rules; today it wraps without a line clamp.
- **Social-card guard:** it protects a development-only card; `/p/<token>` uses a static image.

## §7 — Authority and limits

**Authorised:**

- Inspect the repository.
- Verify production read-only: SELECT-only SQL, logs, the migration ledger.
- Create branches and worktrees.
- Implement, commit forward-only, push and open PRs.
- Monitor and fix CI.
- Prepare release steps.

**Not authorised without separate approval:**

- Merging. A merge that carries a migration is a production release.
- Publishing or deploying.
- Any hosted write.
- Enabling a paid service.
- Creating a scheduled task.

**Never:**

- Weaken RLS, grants or a `SECURITY DEFINER` check.
- Expose `service_role` in the application.
- Let a holder write trust attribution.
- Edit a shipped migration, meaning any version in the production ledger.
- Mark a pending review complete.
- Use an admin override to bypass an unexplained failure.
- Populate Police, Armed Forces or other regulated content with unverified data.

**Stop and report** if:

- A PR would span more than one phase.
- A market would be only cosmetically open.
- A migration or rollback is unsafe.
- An unexplained CI failure remains.
- The branch head changes unexpectedly.
- Production data would need a destructive transformation.
- Production no longer matches §0.2.

## §8 — Final report

1. PR links, final SHAs and CI results on each exact pushed SHA
2. §0.4's coverage table, completed
3. §0.2 re-measured read-only, with every difference called out
4. Evidence that ordinary users need no pilot grant
5. Results for every case in §5
6. Screenshots of the current card and the picker, in Swedish and English, at 390px and 1440px
7. The release order used, and every remaining owner action
8. A short smoke-test checklist for the owner to run on production
9. Anything not built, stated plainly rather than substituted

Do not call the pilot live until the deployed journey is verified. Final line per PR: **READY FOR OWNER REVIEW** or **FIX REQUIRED**.
