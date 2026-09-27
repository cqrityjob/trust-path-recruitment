# Security Passport — completion work order

## Four markets: Sweden, India, United Kingdom, Dubai (UAE)

**For** the implementing model
**Repository** `cqrityjob/trust-path-recruitment`
**Date** 2026-09-27 · revision 2 (delivery order, hosted state)
**Author** Claude, Senior Software Architect
**Supersedes** the four-market completion instruction of the same subject

---

## How to read this

This document is the whole instruction. Where a number, an order or a wording is given, use it exactly. Where something here is impossible, **stop and report it** — do not substitute your own judgement about how a regulated credential should be presented.

Naming is fixed: the product is **Security Passport**. The artifact in §6 is **the Passport card** — a component descriptor, not a product name. A mockup in circulation labels it "The Trust Card"; that wording is superseded and must not appear in code, copy, routes, file names or commit messages.

**Five PRs, in the order given.** Each merges before the next begins. Do not combine them. A single PR containing more than one phase is a failed delivery regardless of what works in it.

| PR | Phase | Section | Touches schema / RLS |
|---|---|---|---|
| **1** | Foundation correctness | §3 | No |
| **2** | Passport presentation system | §6 | No |
| **3** | Public-pilot availability | §4 | **Yes** |
| **4** | Catalogue and save journey | §5 | Additive only |
| **5** | Review, sharing, admin, release | §7 | Additive only |

Presentation comes before the availability model deliberately. PR 1 and PR 2 change no schema, no RLS and no grants, so they cannot make the availability work harder — and they let the owner see and judge the result before the highest-risk change is made. Section numbers below are document sections; follow the PR order in this table, not the order the sections happen to appear in.

---

## §0 — Preconditions. Do not start until these are true.

### 0.1 Owner decisions required first

These three are outstanding and block work. Ask for them; do not decide them yourself and do not proceed on an assumption.

| # | Decision | Blocks |
|---|---|---|
| **D1** | ~~Result of the A1 gate query.~~ **Answered — see §0.2.** A1 must be fixed in PR 1. | ~~blocking~~ |
| **D2** | Named owner of the legal-review gate for UK, India and Dubai. Public-pilot availability makes a credential registrable by ordinary users; someone must own the statement that its definition is substantiated. | PR 3 |
| **D3** | Human approval gate for the hosted release. Given §0.2, this is larger than a single additive migration — see §7.5. | PR 5 |

### 0.2 Hosted production state — measured 2026-09-27, read-only

Project `mlvzmiutmyyqeuvjglco`. These are facts from the live database, not assumptions.

**The market-pack stack has never been applied to hosted production.** The gate query failed outright:

```
ERROR: 42703: column "authorisation_scope" does not exist
```

The hosted Passport schema contains `sp_claims`, `sp_credential_types`, `sp_jurisdictions`, `sp_evidence`, `sp_disclosures`, `sp_disclosure_accesses`, `sp_experience_periods`, `sp_passport_events`, `sp_passport_profiles`, `sp_public_access_throttle`, `sp_recognition_policies`, `sp_skill_types`, `sp_verification_requests` and `sp_verification_decisions`.

It does **not** contain `sp_professional_titles`, `sp_market_packs` or `sp_pilot_members`. Hosted production runs the pre-market-pack schema.

Measured data:

| | |
|---|---|
| Claims total | 16 |
| Distinct holders | 3 |
| SV claims, active | **1** |
| Claims with `supersedes_id` set (corrections) | **0** |

Three consequences, all of which this work order now assumes:

1. **A1 becomes real the moment the migration lands.** One active SV claim exists and is by definition unscoped, because the column does not yet exist. It will evaluate as `requires_scope` and be uncorrectable. One row is trivial to handle, but the fix belongs in PR 1 regardless — the next holder reproduces it.
2. **The B4 rollback risk is currently zero.** Zero corrections means `ON DELETE RESTRICT` has nothing to catch on. Fix it anyway (§0.4); it blocks nothing today.
3. **Production is effectively pre-launch.** Three holders, sixteen claims. There is room to do this correctly rather than quickly, and no user-facing pressure to rush a hosted release.

If a later session finds a different hosted project is the real production target, re-measure before relying on any of the above.

### 0.3 Confirm the A1–A5 defects are resolved on current main

These were found in the three-market review and may or may not have landed since. Verify each on current `main` and report status before writing code. Any still open moves into PR 1.

| ID | Defect |
|---|---|
| A1 | Legacy skyddsvakt claims cannot be corrected — `sp_correct_claim` drops fields, grandfather clause exempts `UPDATE` only |
| A2 | Credential-code validators cap at 16 chars; `SE_PERSONNEL_APPROVAL` is 21 |
| A3 | `authorisation_scope` collected then discarded — recipient path hardcodes `null` |
| A4 | `name_en` carries a country suffix the surface appends again → "Sweden · Sweden" |
| A5 | VU1+VU2 renders as the protected title "Väktare" |

Owner decision already taken on A5: the label becomes **`Väktarutbildning (VU1 + VU2)`** / **`Security Guard Training (VU1 + VU2)`**. Do not change the tier architecture to achieve this — it is a label change plus the `market-rules.ts` mirror.

Owner decision already taken on A3: exact scope is included in application-scoped disclosures and private employer packages; excluded from `public_card`; never in a public title, social card or exported image. The public view may state **that** an authorisation is limited without stating what it is limited to.

### 0.4 Two guard defects that must not be forgotten again

Both were dropped from a previous instruction set. They belong in PR 1.

- `scripts/` is outside `tsconfig.json`. `passport-fixture-check.ts` reads fields that no longer exist, so the social-card privacy guard's exclusion list is **silently inert**. Bring `scripts/` into typecheck and repair the guard.
- Rollback of the Sweden migration issues an unqualified `DELETE FROM sp_claims` against `supersedes_id ON DELETE RESTRICT`. It **aborts** if any holder has ever corrected one of those credentials. CI never sees it because suites clean up first. Fix the rollback and document the data consequence in `release-and-rollback.md`, not only in the migration header.

### 0.5 Known-unachievable gate

A clean migration replay from empty is not currently possible — roughly 24 pre-existing allowlisted failures exist from objects created twice across repo history. They are unrelated to this work.

The gate for this delivery is: **replay passes with the existing allowlist, and the allowlist does not grow.** Do not attempt a historical migration cleanup inside this work. Do not report a replay as clean when it used the allowlist.

---

## §1 — Baseline before implementation

Read the repository instructions. Inspect current `main`, all open Passport PRs, the deployed build and the hosted schema read-only.

Earlier PR numbers in any document, including this one, are historical context and not current truth. Verify heads, merge bases and CI state yourself.

Preserve merged work: the India work, HAYAT, the Passport crash fix, date handling, sharing protections, and improvements from all prior sessions. Work in an isolated branch or worktree. Never overwrite another session's changes.

**India is new relative to the last independent verification.** No India market pack was present then. Establish what exists before assuming it is complete.

Produce this coverage matrix as a working checklist, and keep it updated in the PR description:

| Market | Definitions supported | Availability | Save | Overview | Review | Share | Admin | Release |
|---|---|---|---|---|---|---|---|---|
| Sweden | | | | | | | | |
| India | | | | | | | | |
| United Kingdom | | | | | | | | |
| Dubai, UAE | | | | | | | | |

Then close the gaps. This is not a research phase.

---

## §2 — The six concepts that must never collapse into each other

This is the core of the whole delivery. Keep these distinct in the schema, in the access rules, in the admin view and in the user-facing copy:

1. **Credential definition** and its source evidence
2. **Catalogue availability** — may a user select it today
3. **Permission to register** a holder's own claim about it
4. **Claim trust and verification** state
5. **Legal / expert review** state of the definition
6. **The holder's actual permission to work**

Opening a market changes (2) and (3). It changes nothing about (4), (5) or (6).

**Never** mark a pending legal or expert review as complete to make a credential available. If an existing rule conflates availability with approval, implement the explicit separation — do not falsify the approval and do not bypass the rule.

**Never** state or imply that registering a credential grants permission to work.

---

## §3 — PR 1: foundation correctness

No new features. No market opens in this PR.

**Contents:** any unresolved A1–A5 from §0.3, both guard defects from §0.4, and the presentation defects below.

### 3.1 One Passport surface on `/passport`

Remove the duplicate right-hand card under "What your passport looks like". The right column keeps only non-duplicative content: share and privacy status, credentials expiring within 30 days, next useful action.

The full recipient-style preview lives in the Share tab and nowhere else.

### 3.2 No controls inside the card, ever

"Add credential" and "Select and share" currently sit inside the identity surface. Move them to an action row below it. The card contains no buttons, tabs, inputs or menus in any variant at any time.

### 3.3 The headline title comes from the derivation engine only

The card currently shows **"Head of Security — from Profile"** where the derived professional standing belongs. A self-described job title is rendering in the position reserved for a credential-derived one. That is the same class of overclaim the derivation engine exists to remove.

- The primary line under the holder's name shows **only** the engine's output.
- With no qualifying credential, show the existing neutral fallback. **Never fall back to the Profile occupation.**
- The Profile occupation may appear as a distinct secondary line, at lower weight, plainly marked as self-described, never above or larger than the derived line.

Profile remains the only place the occupation is edited. This changes what Security Passport **displays**, not what it owns.

### 3.4 Holder name rendering

Current output is `Most / afa / Alsha / wi`. That is not a breakpoint bug — it is a large type size in a container with no fixed width. §6.1 fixes the cause; these rules are permanent:

```css
overflow-wrap: normal;
word-break: keep-all;
hyphens: none;
/* max 2 lines, then ellipsis */
font-size: clamp(20px, 5.2cqw, 30px);  /* container query on the card */
```

A holder's name never breaks inside a word. Test `Mostafa Alshawi`, `Jean-Baptiste de la Rochefoucauld`, a single-word mononym, and a Devanagari name before calling this done.

### 3.5 Tabs: seven become four

| Keep | Absorbs |
|---|---|
| Overview | — |
| Credentials | Add credential (becomes a button) |
| Verification | — |
| Share | Preview and share · Sharing & privacy |

Nothing is removed. Nothing is renamed beyond these merges.

### PR 1 acceptance

One passport surface. No control inside it. Name renders correctly at 390 / 768 / 1440px. Headline from the engine; neutral fallback when empty. No country name rendered twice. Four tabs. `scripts/` typechecked and the privacy guard live again. Rollback no longer aborts. Screenshots at 390px and 1440px, Swedish and English.

---

## §4 — PR 3: public-pilot availability

The highest-risk change in this delivery, because it opens data-layer gates. It gets its own PR and its own review.

**Blocked on D2.**

### 4.1 What "public pilot" means

"Pilot" describes the product's maturity. It must not require the owner to approve each user before that user can register a supported credential.

Registration must work **without** `sp_pilot_members` entries. Preserve private historical membership and audit data, and all unrelated access rules.

### 4.2 Update every layer consistently

Catalogue views, RLS, access helpers, save RPCs, triggers, server validation, frontend filters, admin diagnostics, error messages. A gate that exists in one layer and not another is a defect even when the journey works.

### 4.3 Explicitly forbidden shortcuts

- Granting broad table access
- Marking all definitions active indiscriminately
- Disabling or weakening a guard
- Assigning pilot membership to every new user
- Any path that lets a holder raise their own trust level

### 4.4 Withdrawal must remain possible

An individually withdrawn or unsupported definition stays unavailable for new registration. Existing holder records remain readable under their original ownership and sharing rules, with their trust unchanged. Withdrawal never destroys or downgrades an existing claim.

### 4.5 Market boundaries

| Market | Rule |
|---|---|
| Sweden | All currently supported and substantiated Swedish definitions. |
| India | All supported national qualifications and their sourced versions. **National qualifications remain distinct from occupational licences** — this distinction is structural, not cosmetic (see §6.3). |
| United Kingdom | Supported definitions with correct territorial applicability, including Northern Ireland distinctions. |
| Dubai, UAE | Supported Dubai definitions with correct `AE` / `AE-DU` scope. **Never relabel a Dubai credential as valid throughout the UAE.** Unsupported emirates stay explicitly outside this release. |

The UI says **"Dubai, UAE"** wherever that is the supported territory. Never "UAE" alone for a Dubai-scoped credential.

### 4.6 Four facts that are not the same fact

Residence · current work country · desired destinations · credential jurisdiction.

Changing one never silently rewrites another and never hides an existing credential. A holder may hold credentials in several countries simultaneously. An Indian resident seeking work in Dubai or the UK is supported — and destination preference is never turned into a credential or a work authorisation.

---

## §5 — PR 4: catalogue completion and the save journey

An ordinary user must complete: create account → confirm → complete or skip optional setup → choose a credential → enter details → save → return to `/passport` → reload → edit → attach evidence → request review.

### 5.1 Credential selector

- Clear international versus national/regional grouping
- Country, region, category and issuer filters that are actually useful
- **No default filter combination that silently conceals valid choices**
- Dependent filters reset when their parent changes
- Loading, empty, failure and retry states are visually distinct
- Stale and out-of-order responses cannot restore a previous country
- Query-string preselection and resumed drafts use the same canonical mapping

### 5.2 Field collection

The definition determines jurisdiction and required scope. Collect issuer, licensed company, version and dates **only where the definition says they apply**. Preserve source-defined issuer distinctions — do not normalise two issuers into one because they look similar.

Saving works for every supported definition in all four markets through the real application write path. Optional fields may be absent without breaking the Passport. Prevent duplicate submission. Preserve user input after a recoverable error.

### 5.3 Draft tolerance — with the enforcement boundary intact

Drafts may be incomplete. Requirements are enforced when the holder submits for review or activates the claim.

**Enforcement stays in the database layer**, gated on `lifecycle_state` so drafts are exempt. `SP_CREDENTIAL_REQUIRES_SCOPE` and `SP_CREDENTIAL_REQUIRES_VALID_UNTIL` are not moved to Zod or to the form. A UI defect must never be able to create a false active claim.

---

## §6 — PR 2: the Passport presentation system

This is the visual specification. It is locked. Previous attempts produced a different result each run because the visual outcome was described in adjectives; everything below is a number, an order or a rule.

Preserve the existing dark navy identity, the credential record components and the add-credential flow. This specification refines them; it does not replace them.

### 6.1 Card geometry

| Property | Value |
|---|---|
| Aspect ratio | **2 : 3** portrait, enforced by `aspect-ratio`, never by content height |
| Width | `min(420px, 100%)`, floor 300px |
| Corner radius | 16px |
| Padding | 24px (20px below 360px viewport) |
| Type scaling context | the card itself — container queries, not viewport |

The card does not grow to fit content. **Content is capped to fit the card.** This is what makes it a card rather than a panel, and it is what permanently prevents the name-wrapping failure.

### 6.2 Zones — fixed order, never reordered

```
┌──────────────────────────────────────────┐
│ A  [photo]                    CQrityjob  │  portrait 88×88, radius 8
│                        Security Passport │  wordmark right
├──────────────────────────────────────────┤
│ B  MOSTAFA ALSHAWI                       │  holder name
│    <derived professional standing>       │  engine output only
│    <self-described occupation>           │  lower weight, marked
├──────────────────────────────────────────┤
│ C  ▣ Records from 2012–2026              │  max 5 lines
│    ▣ 4 credentials on file               │  icon 20px + one line
│    ▣ Corporate Security                  │  no line wraps
├──────────────────────────────────────────┤
│ D  <trust composition>          ▪▪▪▪     │  footer band
│    <last updated>               ▪▪▪▪     │  QR 96×96, right
│                              Live verify │
└──────────────────────────────────────────┘

       [ Authorisations ]   ← badge rows, OUTSIDE the card
       [ Certifications ]
       [ Qualifications ]
```

Three variants — `holder`, `preview`, `recipient` — render from **one component**. A variant may hide a zone. It never reorders, restyles or re-lays-out. A second card implementation anywhere is a build failure.

### 6.3 The badge system — three forms, never mixed

The single most important visual decision in the product. A state authorisation, a professional certification and a training qualification are different kinds of fact. Rendering them identically tells the recipient something false.

| Class | What it is | Form | Visual weight |
|---|---|---|---|
| **Authorisation** | State-issued licence, appointment or approval — Swedish ordningsvaktsförordnande, SIA licence, SIRA permit | **Shield.** Heraldic silhouette, 2px stroke, deep navy fill, brushed-metal edge gradient from top-left | Highest. Largest, strongest contrast |
| **Certification** | Professional certification from an industry body — ASIS CPP/PSP, BCI BCM | **Hexagon.** Flatter fill, 1.5px stroke, issuer wordmark below | Medium |
| **Qualification** | Training or education — VU1/VU2, Indian NSQF/SSC levels | **Notched rectangle** (certificate form), 1px stroke, lightest fill | Lowest. Deliberately least authoritative |

Groups are always rendered in that order, always separated, **never interleaved**. An empty group is not rendered — never a placeholder.

A badge carries: short code inside the form, full name on hover and focus, issuer beneath, and its trust indicator (§6.5). Never a reference number.

Indian national qualifications are qualifications, not licences. They take the notched rectangle. Rendering an NSQF level as a shield would assert a work authorisation that does not exist.

### 6.4 Flags — they follow the credential, never the user

A 20px circular flag disc sits at the **bottom-right of the badge**, overlapping the badge edge by roughly 25%, with a 2px ring in the card background colour so it reads as a separate object.

| Case | Disc contains | Label |
|---|---|---|
| National credential | That jurisdiction's flag | Country name |
| **International credential** | **Globe glyph, never a flag** | "International" |
| Dubai | UAE flag | **"Dubai, UAE"** — never "UAE" alone |
| Northern Ireland | **UK flag** | "United Kingdom (Northern Ireland)" |
| Other UK nations, if ever added | UK flag | "United Kingdom (Scotland)" etc. |

**Do not render the Ulster Banner.** It has no official status and is politically contested; using it in a security-industry credential product is an avoidable risk. Territorial distinction is carried by the text label, not by a sub-national flag. Apply the same rule to any other contested or unofficial regional flag.

The flag is derived from the **credential's own jurisdiction**. It is never derived from the holder's profile country, residence or work country. A holder in Stockholm with a SIA licence sees a UK flag on that badge.

Shields are jurisdiction-neutral navy. **Do not colour-code badges by country** — the flag disc carries nationality, and colouring the badge too produces a flag salad that reads as decoration rather than record.

### 6.5 Trust indicator — a ring, not a tick

Trust is shown as a thin ring segment around the badge. The filled fraction indicates the tier. It is **colour-neutral**: no green, no check mark, no shield tick at any tier that currently exists.

| State | Treatment |
|---|---|
| Holder-reported | Ring 25%, hairline |
| Evidence provided | Ring 50% |
| Under review | Ring 50%, animated only by `prefers-reduced-motion: no-preference`, single slow pulse |
| Document reviewed | Ring 75% |
| Verified against source | **Reserved. Not reachable. Do not implement.** |
| Expired | Desaturate to 30%, diagonal hatch, explicit label. Never silently dropped, never shown as current |

Green is reserved for a state that does not yet exist. Do not spend it now.

### 6.6 Zone D — the trust footer

Replaces the mockup's "VERIFIED RECORDS" block, which would be untrue.

> **4 credentials on file**
> 3 holder-reported · 1 with evidence
> Updated 27 Sep 2026

The footer states **what the records are**, never **what they prove**. When the composition is entirely holder-reported, say so in those words. Per-credential trust lives on the credential row; it is never aggregated into a single card-level claim. The existing "Trust state — shown per credential" copy is correct and stays.

### 6.7 Content caps

| Zone | Cap | Overflow |
|---|---|---|
| Name | 2 lines | ellipsis, never mid-word |
| Derived standing | 2 lines | ellipsis |
| Record lines | 5 | 6th not rendered — the card is not a list |
| Badges per group | 6 | then `+N`, which opens the Credentials tab rather than expanding in place |

If content does not fit, content loses. The card keeps its shape. Use the existing compact overflow interaction to reach all remaining records.

### 6.8 Never on the card, in any variant

Interactive controls · personnummer or any national identity number · credential or licence reference numbers · the exact authorisation scope · document links, filenames or thumbnails · anything from an inactive market · anything self-declared on the `recipient` variant · internal HAYAT references.

The existing social-card privacy guard's forbidden-key list applies to the share image unchanged. Extend it if you add a field; never shorten it.

### 6.9 Responsive — one layout, three scales

| Width | Card | Badge rows |
|---|---|---|
| ≥1200px | 420px left, supporting content right | 6 across |
| 768–1199px | 420px centred, supporting content below | 6 across |
| <768px | `100% − 32px`, floor 300px | 3 across, two rows, no horizontal scroll |

Every width: no horizontal page overflow, 44px minimum touch targets, visible keyboard focus, `prefers-reduced-motion` respected.

### 6.10 Motion

The card fades in once on load. That is all. No hover lift, no shimmer, no staggered badge entrance, no animated check. A credential artifact that animates reads as marketing, and this artifact's entire value is that it does not.

### 6.11 Safe rendering

An unknown display category renders safely — it never crashes the page. Missing expiry renders **"Expiry date not provided"**, never lifetime validity. Every displayed credential retains its own trust and validity information. Database-to-application vocabulary checks stay in place.

The overview works for both a brand-new empty account and an established account holding many credentials across all four markets.

### 6.12 No invented hierarchy

Do not invent a ranking of professional importance. Do not infer that holding one qualification proves possession of another. Use only explicitly modelled and supported presentation relationships. Never delete an underlying record to simplify a display.

---

## §7 — PR 5: review, sharing, admin, release preparation

### 7.1 HAYAT and human review

Reuse the existing implementation.

Document extraction **helps the holder fill the form**. It does not verify the qualification and does not raise its trust level. The holder confirms extracted values before saving.

Use automated source verification only where an implemented, enabled adapter actually supports it. Otherwise state plainly that automatic verification is unavailable and offer the evidence/review route. **Never invent a verification ID, an issuer confirmation or a successful check.** Preserve existing visibility restrictions on HAYAT references and documents.

The reviewer can: open the request → inspect credential and evidence → see jurisdiction, issuer rule and stated version → request clarification → receive the response → record a decision.

No "verified" label based on upload, OCR success or self-report.

**When automated confirmation is eventually added, it arrives as its own trust state** — `document_checked_automated` or similar — and is never collapsed into the same state as a human or source verification. Leave the enum able to grow. Do not add the state in this delivery.

### 7.2 Trust vocabulary — one source

"Consistent wording across surfaces" is not achievable by instruction. Make it structural: a single enum-backed vocabulary module is the only source of trust labels for holder view, reviewer view, recipient view, QR destination, exports and admin. A guard fails the build if any surface hardcodes a trust string.

### 7.3 Sharing and recipient behaviour

Holder selects credentials → previews the recipient view → creates a time-limited link → can revoke it.

Use the application-domain share route as the user-facing address, never a raw backend endpoint. **The QR encodes the actual generated share link.**

The recipient sees only the authorised selection, with correct country and region, trust and validity. No unselected credentials, private evidence, internal notes, location preferences or internal HAYAT references may leak.

Verify logged-out viewing, expired links and revoked links. **Changing the holder's work country must not rewrite the jurisdiction shown to the recipient.**

### 7.4 Admin

Admin inspects and manages the public-pilot catalogue without creating per-user grants, using the same rules the application actually uses:

definition and jurisdiction · international/national/regional classification · availability for new registration and the reason if blocked · issuer requirements and version/source evidence · **legal and content review state shown separately from availability** · automatic verification support versus manual review.

Reuse governed admin operations and audit every change. Do not expose holder documents, private notes, location or preferences to any role without a defined need and permission.

Provide a withdrawal path per §4.4.

### 7.5 Release preparation

**The hosted release is larger than a single additive migration.** Per §0.2, hosted production runs the pre-market-pack schema: the entire accumulated Passport stack is unreleased. Treat this as its own release plan, not as a closing step of PR 5.

Produce, and do not execute:

1. The exact ordered list of every migration that must be applied to reach parity, from the hosted ledger's current position to the merged head.
2. For each, whether it is additive, whether it has a matching rollback, and whether that rollback is safe against the measured data in §0.2.
3. The point in the sequence at which the single active SV claim (§0.2) acquires `requires_scope`, and the exact remediation for it.
4. A dry run of the whole sequence against a copy of the hosted schema — not against an empty database.
5. The application/schema release order, and whether they can ship together.
6. Every remaining owner action, named individually.

Then stop. **No hosted write is authorised by this work order**, and D3 governs the approval gate.

Run affected checks first, then required CI **on the exact pushed SHA**. Inspect every required workflow. Never claim an old green run covers new commits.

Identify production configuration that blocks ordinary registration — **especially confirmation-email delivery**. Do not claim a public pilot works if people cannot create and confirm an account. Prepare the exact missing configuration and name only the specific secret or owner action required. Never print a secret. Never activate a paid service without authorisation.

Do not create subscriptions, scheduled tasks or background reminders.

---

## §8 — Proving it

Synthetic accounts on an isolated real backend. **Never create test credentials in the owner's production account.** Leave no test data behind.

| # | Case |
|---|---|
| A | Fresh ordinary account with **no pilot grants** browses and saves supported credentials from Sweden, India, UK and Dubai |
| B | Existing mixed-market account adds each Indian qualification, returns to `/passport`, reloads without error |
| C | Dubai-specific required fields enforced; unsupported emirates not accidentally opened |
| D | International credentials survive a work-country change unchanged |
| E | Review: request → clarification → response → decision |
| F | Selective sharing → QR → logged-out recipient → revocation |
| G | Another user can neither read nor modify the holder's private data |
| H | A withdrawn definition cannot be newly registered; existing records stay accessible under normal rules |
| I | Legacy unscoped Swedish claim can be corrected (per D1) |
| J | Card renders correctly for: empty account · VU1+VU2 only · current ordningsvaktsförordnande · expired credential · authorisation + certification + qualification together · 9 credentials (5 lines, 6 badges, `+3`) |

Swedish and English. Desktop and mobile. Long names, missing optional fields, expired credentials, unknown display categories.

For catalogue completeness, exercise **every** supported definition through the real save contract with suitable synthetic inputs. Browser-test one representative form per distinct field and validation pattern rather than duplicating hundreds of identical UI tests.

Tests encoding the old member-only restriction are updated to the explicit public-pilot decision. **Preserve every ownership, privacy, jurisdiction and trust test.** Do not disable an assertion, lower a floor or narrow a locator to conceal a regression.

Mutation-test the privacy guard and the trust-vocabulary guard: prove each fails when its protected behaviour is deliberately broken.

---

## §9 — Authority and limits

**Authorised:** inspect the repository and hosted schema read-only · create branches and worktrees · implement · commit forward-only · push · open PRs · monitor and fix CI · prepare every release step.

**Not authorised without separate approval:** merge · publish · deploy · any hosted production write · enabling a paid service · creating a scheduled task.

**Never:** weaken RLS, grants or a `SECURITY DEFINER` check · expose `service_role` in the application · let a holder write trust attribution directly · edit a shipped migration · use an admin override to bypass an unexplained failure · populate Police, Armed Forces or other regulated content with unverified data.

**Stop and report** if: a PR would span more than one phase · a credential option remains untested · a migration or rollback is unsafe · an unexplained CI failure remains · a market would be only cosmetically open · the branch head changes unexpectedly · production data would need a destructive transformation.

---

## §10 — Final report

1. PR links, final SHAs, CI results per PR
2. The completed four-market coverage matrix
3. Confirmation that the §0.2 hosted-state findings still hold, re-measured
4. Evidence that ordinary users need no pilot grants
5. Real-backend journey results for every case in §8
6. Screenshots per §6, Swedish and English, 390px and 1440px
7. Exact migration and application release order, plus every remaining owner action
8. A short deployed smoke-test checklist for the owner
9. Anything in this document you could not build, stated plainly rather than substituted

Do not call the product live until the deployed journey is verified. Do not label a functional gap "out of scope" when it prevents a journey in §8.

Final line per PR: **READY FOR OWNER REVIEW** or **FIX REQUIRED**.
