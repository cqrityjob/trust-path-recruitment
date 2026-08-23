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

The URL list is **parsed out of the migration that seeds it**, not duplicated
in the script. Adding a source to the migration adds it to the monitor with no
other edit, and a parse that finds fewer than 20 rows is a hard error rather
than a quietly shorter run.

_Status: Implemented._

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

## The baseline is tracked in git on purpose

`supabase/regulatory-source-baseline.json` records what we last _accepted_ as
the state of each source. It is committed, so "the law as we understood it
changed" is reviewable in a diff. CI never writes it; a human runs
`bun run regulatory-sources:check --update` after reading the page.

## Explicitly prohibited

- Any path by which remote content changes a rule, a taxonomy row or a market
  pack's active state.
- CI writing the baseline.
- Marking a source `current` without a `checked_on` date and a fingerprint.

## Future

Source-level provenance on individual derivation rules (today a rule points at
its market pack, and the pack points at its sources) · automatic linking of a
review item to the specific rules that cite the changed source.
