# Security Passport — regulatory source register

Every regulatory rule this product encodes is a reading of an official page
that somebody can change without telling us. This document describes where
those readings are recorded and what happens when a page moves.

_(Status markers as defined in [three-market-architecture.md](./three-market-architecture.md).)_

---

## The register

`sp_regulatory_sources` holds one row per official page, with:

`source_key` · `jurisdiction_code` · `market_pack_code` · `authority_id` ·
`title` · `url` · `source_type` · `checked_on` · `content_fingerprint` ·
`availability` · `review_state` · `effective_from` · `superseded_on`

### A source cannot claim to be current until somebody has read it

```sql
CONSTRAINT sp_source_current_has_been_checked
  CHECK (review_state <> 'current'
         OR (checked_on IS NOT NULL
             AND content_fingerprint IS NOT NULL
             AND availability = 'available'))
```

Without this, seeding a URL would have been enough to make a rule _look_
sourced. Every row ships `review_needed` with a null fingerprint, which is the
honest state before the monitor's first run.

_Status: Implemented, Tested._

## Legislation is never executable

`scripts/regulatory-source-monitor.ts` fetches each registered URL, extracts
visible text, collapses whitespace and takes a SHA-256.

**A changed page changes nothing.** It writes a report and exits non-zero. A
human reads the page and decides. `sp_source_review_items` is the append-only
record of those detections; nothing in it can alter a rule.

The URL list is **read out of the migrations**, not duplicated in the script.
Every migration is replayed in filename order, and every plain `INSERT`,
`UPDATE … SET url` / `superseded_on` and `DELETE` on `sp_regulatory_sources`
is applied to the list. Registering or moving a source is therefore a new
migration — never an edit to an applied one — and reaches the monitor with no
other change. A write the parser cannot follow is a hard error, and so is a
list shorter than 20 rows. That covers writes inside a `DO` block or a
function, a `TRUNCATE`, and any URL or `superseded_on` `UPDATE` other than
`… WHERE source_key = '…'` with nothing else. A missing `WHERE`, `OR`, `IN`,
an extra condition, `FROM` and `RETURNING` are all rejected, and so is a URL
that is not a single literal.

Until 2026-10-19 the script read only the seed block of
`20260907090000_sp_three_market_foundation.sql`. Five registered sources were
never checked: `ae_moi_private_security` (the AE-AZ public pilot) and the four
Indian sources (`in_nqr_register`, `in_ncvet_home`,
`in_mepsc_security_standards`, `in_mha_psara`). Production holds the same 30
rows the replay produces (read-only check, 2026-10-19).

_Status: Implemented, Tested (`scripts/regulatory-source-monitor.test.ts`, in CI)._

### What a run records about each source

- **Unreachable, and why:** `http_<status>`, `timeout`, or `network:<code>`.
  On a timeout or network failure one request to the site root, with the same
  user agent, records whether the host answers this checker at all.
- **Redirected:** where the registered URL landed. A permanent move is fixed
  with a migration that updates the URL, after somebody has read the new page.
- **Fingerprint:** the full current hash is in the job log, so two runs can
  tell per-request churn from a single change.
- **Relied-upon terms** (`supabase/regulatory-source-relied-terms.json`): the
  words a market pack depends on a page saying. A reachable page missing one
  is drift. Presence proves nothing about the rule; absence is a reason to
  read the page first. Terms are matched against the text with HTML entities
  decoded (`r&auml;ttslig` reads as "rättslig"). The fingerprint keeps its
  original normalisation, so accepted baselines stay comparable.

The checker always identifies itself as
`CQrityjob-regulatory-source-monitor/1.0`. It never presents itself as a
browser to get past a refusal: a page that refuses it is reported as refusing
it.

### What a changed fingerprint means

"This page is not byte-identical to the last time we looked." That is all.

The fingerprint covers visible text with whitespace collapsed, which removes
most markup and session churn but not a rotating banner or a reworded cookie
notice. **A change is a prompt to read the page, never evidence that the law
moved.**

Verified stable: two consecutive runs on 2026-08-22 reported 0 of 24 reachable
sources changed.

### Known unreachable is not re-alerted

A source recorded as unreachable that is _still_ unreachable is not drift. It
stays permanently visible in the report as a standing limitation, but does not
open a weekly issue — that is how a real signal becomes something nobody opens.

A source that was reachable and has **become** unreachable is drift, and does
alert.

A source recorded as unreachable that **answers again** is reported as drift
too, and the baseline keeps it unreachable until a human accepts the new state.
One answer is not verified access; the SIRA portal's limitation cannot lift
itself.

## The weekly job

`.github/workflows/regulatory-sources.yml`, Mondays 06:17 UTC.
`contents: read`, `issues: write`. It opens or updates **one** issue and stops.
It cannot edit the baseline, cannot touch a market pack, and cannot commit.

_Status: Implemented. Not yet observed running on schedule._

## First-run results — 2026-08-22

**24 of 25 sources reachable.**

### Sweden — 9 registered, 9 reachable

`se_polisen_ordningsvakter` · `se_polisen_ov_utbildningar` ·
`se_polisen_ov_fortbildning` · `se_lansstyrelsen_bevakningsforetag` ·
`se_lansstyrelsen_skyddsvakt` · `se_imy_rekryteringssystem` ·
`se_imy_brottsuppgifter` · `se_imy_rattslig_grund` ·
`se_imy_konsekvensbedomning`

### United Kingdom — 9 registered, 9 reachable

`gb_sia_need_a_licence` · `gb_sia_apply` · `gb_sia_training` ·
`gb_sia_check_a_licence` · `gb_sia_public_register` · `gb_ico_recruitment` ·
`gb_ico_vetting` · `gb_ico_criminal_offence_data` ·
`gb_ico_automated_decisions`

> **Requires legal review.** The UK Data (Use and Access) Act has affected ICO
> guidance. The four ICO entries must be **re-read on the implementation date**
> rather than trusted from a fingerprint taken here.

### UAE / Dubai — 7 registered, 6 reachable

`ae_du_sira_services` · `ae_du_sira_cadre_card` ·
`ae_du_sira_cadre_card_individual` · `ae_du_sira_training_centres` ·
`ae_business_regulations` · `ae_data_protection_laws`

> **`ae_du_sira_portal` did not answer the checker at all.**
>
> This is a standing limitation of the Dubai pack, not a transient failure. The
> pack's document-verification route cannot be described as monitored while its
> portal does not respond to us, and that belongs in the pack's legal review.

## Accepted source change — `se_lansstyrelsen_bevakningsforetag`

**Detected 2026-08-23 · reviewed 2026-08-23 · accepted by the owner 2026-08-23.**

|                          |                                                    |
| ------------------------ | -------------------------------------------------- |
| Previous fingerprint     | `8a78b1c1…` (baseline 2026-08-22)                  |
| Accepted fingerprint     | `28887b27…` (2026-08-23)                           |
| Stable within a session? | Yes — identical across three fetches seconds apart |

The page genuinely changed; this was not per-request churn.

### What the review established, and what it could not

**It established impact, not a diff.** The baseline stores a SHA-256 of the
page's visible text, not the text itself, so **the previous exact wording cannot
be reconstructed from anything this repository holds.** The fingerprint proves
that words changed; it can never say which.

The review therefore answered the question it _could_ answer — _does this affect
us_ — by reading the current page against what the Swedish market pack actually
relies on. Every substantive term the pack depends on was still present:

`godkännande av personal` · `bevakningsföretag` · `auktorisation` · `väktare` ·
`skyddsvakt` · `länsstyrelsen`

**No product rule, eligibility rule, derivation, copy string or
authorisation-scope behaviour changed as a result of this acceptance.** The
credential this source backs is `SE_PERSONNEL_APPROVAL`, whose contract — that
only _"an approval was checked"_ is ever recorded, with an authority and a date
— is enforced by `narrow_result_only` in the database and is unaffected by the
page's wording.

### Owner acceptance

The owner accepted the new fingerprint after confirming the relied-upon
substantive terms remain present. That acceptance is recorded **here and in the
baseline diff**, both reviewable in version control.

Anyone auditing this later should read the two sentences above as the limit of
the claim: the owner accepted _that the change does not affect the product_, on
the evidence of the terms surviving — not that the change was inspected
word for word, which the stored data does not permit.

### If a future change needs a word-for-word diff

It will need the page's own history, not this baseline. Storing page text here
would make that possible and is deliberately not done: it would put a third
party's content under our retention, and the monitor's job is to notice a
change and stop, not to archive the web.

## The baseline is tracked in git on purpose

`supabase/regulatory-source-baseline.json` records what we last _accepted_ as
the state of each source. It is committed, so "the law as we understood it
changed" is reviewable in a diff. CI never writes it. A human accepts a
reviewed change to it after reading the pages concerned.
`bun run regulatory-sources:check --update` accepts **every** source at once,
so it is only right when every source in the report has been read; otherwise
change only the entries that were reviewed.

## Explicitly prohibited

- Any path by which remote content changes a rule, a taxonomy row or a market
  pack's active state.
- CI writing the baseline.
- Marking a source `current` without a `checked_on` date and a fingerprint.

## Future

Source-level provenance on individual derivation rules (today a rule points at
its market pack, and the pack points at its sources) · automatic linking of a
review item to the specific rules that cite the changed source.
