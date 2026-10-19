# Regulatory source review, 2026-10-19 (#93)

Review of the open alert in
[#93](https://github.com/cqrityjob/trust-path-recruitment/issues/93). The
latest weekly report (2026-10-12) listed 16 changed sources, two newly
unreachable and one known unreachable.

**Nothing in the product changed as a result of this review.** No market pack
was switched on or off, no `legal_review_state` was changed, and the accepted
baseline (`supabase/regulatory-source-baseline.json`, last accepted 2026-08-23)
is untouched. Everything below is either a monitoring fix or a proposal that
needs a human decision.

## How the sources were checked

| Run                                                                                                 | Where          | Code       | Result                                                                                                                                                                                                                                                     |
| --------------------------------------------------------------------------------------------------- | -------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Local, 2026-10-19 05:10Z                                                                            | review session | `main`     | **Not usable:** the session's network policy refuses every authority host (proxy `403` on CONNECT). All 24 reachable sources showed as unreachable, which is the environment, not the sources. Kept as evidence that a run must say _why_ a source failed. |
| [39204599693](https://github.com/cqrityjob/trust-path-recruitment/actions/runs/39204599693), 05:27Z | GitHub Actions | `6f913610` | 30 sources (25 before the fix). Report posted to #93.                                                                                                                                                                                                      |
| [39204943436](https://github.com/cqrityjob/trust-path-recruitment/actions/runs/39204943436), 05:31Z | GitHub Actions | `44a0d669` | Same, plus a site-root check on timeouts. Report posted to #93.                                                                                                                                                                                            |

Both runs were without `--update`.

**What this review could not do.** The page text was not readable from the
review session. Network policy blocks polisen.se, lansstyrelsen.se and imy.se,
and the fetch tool cannot resolve them. The CI runs record status, redirects,
fingerprints and whether relied-upon terms are present, but never page text.
The assessment of content below therefore rests on two things: those signals,
and the authorities' pages as surfaced by web search. Search shows summaries,
not the pages themselves. Every content statement marked _(search)_ must be
re-read on the page before anyone acts on it.

The baseline stores hashes, not text. **No previous wording has been
reconstructed**, and no claim below says what a page used to say.

## The monitor did not check every registered source

`scripts/regulatory-source-monitor.ts` read only the seed block of
`20260907090000`. Production `sp_regulatory_sources` holds 30 rows. That was
checked read-only on 2026-10-19, and all 30 have `superseded_on IS NULL`. The
monitor read 25 of them. These five were never fetched:

| Source                        | Pack  | Pack state (production)                          | 2026-10-19         |
| ----------------------------- | ----- | ------------------------------------------------ | ------------------ |
| `ae_moi_private_security`     | AE-AZ | `public_pilot`, legal review `pending`, inactive | timeout; see below |
| `in_nqr_register`             | –     | –                                                | available          |
| `in_mepsc_security_standards` | –     | –                                                | available          |
| `in_ncvet_home`               | –     | –                                                | `http_403`         |
| `in_mha_psara`                | –     | –                                                | `http_403`         |

The fix replays every migration, so a future URL move is a new migration. See
[regulatory-source-register.md](./regulatory-source-register.md). The two
`403`s are refusals of an identified checker. They are recorded as such and
are not worked around.

## Per source

**Availability** is from the CI runs above. **Dependency** is what the product
relies on the page for, from the market-pack docs and
`sp_credential_organisation_roles`.

### Sweden (pack `SE`: active, `grandfathered`)

| Source                               | Availability                                                            | What happened                                                                                                                                                                                                    | Dependency                                                                                                                                                                | Proposed action                                                                                                                                                                                                                                                       |
| ------------------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `se_polisen_ordningsvakter`          | available via **301** to `https://polisen.se/samverkan/ordningsvakter/` | **URL moved.** Polisen moved the ordningsvakt pages from `/lagar-och-regler/` to `/samverkan/`. The landing page does not contain the word "förordna".                                                           | `OV` is an appointment by Polismyndigheten with an end date. Product copy says the appointment "gäller högst fem år". _(search)_ Polisen states the same five-year limit. | Read the new page. If it is the right source, register the new URL in a migration (proposal below). Re-anchor the relied-upon term on the page that states the appointment rules.                                                                                     |
| `se_polisen_ov_utbildningar`         | available via 301 to **the same** `/samverkan/ordningsvakter/`          | **Dedicated page gone.** It now lands on the general page, with an identical fingerprint.                                                                                                                        | `OV_TRAINING` (grundutbildning).                                                                                                                                          | A human picks the page that now describes the course. No URL is proposed without reading it.                                                                                                                                                                          |
| `se_polisen_ov_fortbildning`         | available via 301 to `/samverkan/ordningsvakter/fortbildning/`          | **URL moved.** Relied-upon terms present.                                                                                                                                                                        | `OV_REFRESHER`. _(search)_ The 2023 regulation sets a minimum of 50 hours. The product does not encode hours.                                                             | Register the new URL (proposal below).                                                                                                                                                                                                                                |
| `se_lansstyrelsen_bevakningsforetag` | **timeout** (20 s) in both runs; see the site-root note below           | Not a content finding. Reports since 2026-08-24 alternate between "changed" and "newly unreachable": the page answers this checker some weeks and not others.                                                    | `SE_PERSONNEL_APPROVAL` (narrow result only).                                                                                                                             | Keep the URL. It works for readers, and nothing shows it moved. Read the page by hand. _(search)_ Approval still covers all personnel and involves a register check and a referral to Säpo. That is consistent with "only that an approval was checked" being stored. |
| `se_lansstyrelsen_skyddsvakt`        | **timeout** in both runs                                                | Same pattern. It was never reported "changed", so whenever it answered, its text matched the baseline.                                                                                                           | `SV` (requires scope; at most five years).                                                                                                                                | Keep the URL. Record the intermittent reachability as a standing limitation.                                                                                                                                                                                          |
| `se_imy_rekryteringssystem`          | available                                                               | Fingerprint changed since 2026-08-23. Stable within the day (compare the two runs). Relied-upon term present.                                                                                                    | DPIA input, retention.                                                                                                                                                    | Read and accept, or escalate. No evidence of a rule change.                                                                                                                                                                                                           |
| `se_imy_brottsuppgifter`             | available                                                               | Changed; "lagöverträdelser" present. _(search)_ The main rule is still that only authorities process offence data unless law or IMY allows it. A **proposal for a general ban on register checks** is mentioned. | `narrow_result_only`, the prohibition on register contents.                                                                                                               | **Legal review:** Swedish data-protection reviewer to read the page and confirm whether the register-check proposal has advanced. This affects `SE_PERSONNEL_APPROVAL` only if the narrow "approval checked" record would fall within it. Nothing switched off.       |
| `se_imy_rattslig_grund`              | available                                                               | Changed; term present.                                                                                                                                                                                           | DPIA input.                                                                                                                                                               | Read and accept.                                                                                                                                                                                                                                                      |
| `se_imy_konsekvensbedomning`         | available                                                               | Changed; term present.                                                                                                                                                                                           | DPIA input.                                                                                                                                                               | Read and accept.                                                                                                                                                                                                                                                      |

**Länsstyrelsen.** Both runs got no answer within 20 s. The site-root check in
the second run separates a slow or missing page from a host that does not
answer this checker at all; its result is in the table of runs below. The
checker identifies itself and is not changed to look like a browser. A reader
with a browser may well get the page. That difference is the reason to keep
the URL rather than "fix" it.

### United Kingdom (pack `GB`: `public_pilot`, legal review `pending`, inactive)

| Source                                                                                               | Availability                      | Assessment                                                                                                                                                                                                                                                                        | Proposed action                                                                                              |
| ---------------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `gb_sia_need_a_licence`, `gb_sia_apply`, `gb_sia_training`                                           | available, changed, terms present | _(search)_ Licences still last three years (vehicle immobilisation one year). The fee is £204 from April 2026. The product encodes the three-year and one-year validity (`sp_credential_organisation_roles`) and no fee.                                                          | Read and accept. No product rule affected on present evidence.                                               |
| `gb_sia_check_a_licence`, `gb_sia_public_register`                                                   | available, unchanged              | –                                                                                                                                                                                                                                                                                 | –                                                                                                            |
| `gb_ico_recruitment`, `gb_ico_vetting`, `gb_ico_criminal_offence_data`, `gb_ico_automated_decisions` | available, changed, terms present | _(search)_ The ICO's automated-decision guidance is under review after the Data (Use and Access) Act 2025. Consultation closed 29 May 2026; final version due winter 2026. Recruitment guidance is still listed as draft. The register already flagged these four for re-reading. | **Legal review** for the UK pack, which is already `pending` and inactive. No change to switch anything off. |

### UAE (packs `AE-DU`, `AE-AZ`: `public_pilot`, legal review `pending`, inactive)

| Source                                                                                     | Availability                                    | Assessment                                                                                                                       | Proposed action                                                                                                      |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `ae_du_sira_services`, `ae_business_regulations`, `ae_data_protection_laws`                | available, changed                              | No relied-upon terms registered. _(search)_ The cadre licence is still valid two years, matching `typical_validity_months = 24`. | Read and accept.                                                                                                     |
| `ae_du_sira_cadre_card`, `ae_du_sira_cadre_card_individual`, `ae_du_sira_training_centres` | available, unchanged, terms present             | –                                                                                                                                | –                                                                                                                    |
| `ae_du_sira_portal`                                                                        | **timeout**; known unreachable since 2026-08-22 | Standing limitation, unchanged.                                                                                                  | Keep visible. The monitor no longer lets it lift itself: a first answer is reported and must be accepted by a human. |
| `ae_moi_private_security`                                                                  | **timeout**                                     | Never monitored before. The AE-AZ pack's own header says pinning the authoritative page is the first item of its legal review.   | Part of the AE-AZ legal review.                                                                                      |

## Proposed changes that need a decision

These are **not** in the pull request. Each needs somebody to read the page
first.

1. **Polisen URL moves**, as a new migration (the monitor follows it):

   ```sql
   UPDATE public.sp_regulatory_sources
      SET url = 'https://polisen.se/samverkan/ordningsvakter/', checked_on = NULL,
          content_fingerprint = NULL, availability = 'unchecked', review_state = 'review_needed'
    WHERE source_key = 'se_polisen_ordningsvakter';
   UPDATE public.sp_regulatory_sources
      SET url = 'https://polisen.se/samverkan/ordningsvakter/fortbildning/', checked_on = NULL,
          content_fingerprint = NULL, availability = 'unchecked', review_state = 'review_needed'
    WHERE source_key = 'se_polisen_ov_fortbildning';
   ```

   `se_polisen_ov_utbildningar` needs a chosen page.
   `sp_credential_organisation_roles` cites
   `…/lagar-och-regler/ordningsvakter/utbildning-till-ordningsvakt/` for
   `OV*`. That table is not monitored, and the citation should be checked in
   the same pass.

2. **Baseline for reviewed sources only.** After a human has read them, accept
   the fingerprints from run 39204943436 for the sources marked "Read and
   accept" above, by editing only those entries. The full current fingerprints
   are in that run's log. Do not run `--update`: it would also accept
   Länsstyrelsen as unreachable, accept the Polisen redirects, and give the
   five newly monitored sources a baseline nobody has read.

3. **Legal review** (not automated):
   - IMY offence data and the proposed register-check ban, for `SE`;
   - ICO guidance after DUAA 2025, for `GB`, which is already pending;
   - pinning the AE-AZ authoritative page.

## What stays open in #93

- **Reading the pages.** The changed pages need reading by someone who can
  open them.
- **Accepting the baseline.** The baseline changes in point 2 are a human
  acceptance.
- **The Polisen migration.** Point 1, once the pages are read.
- **Länsstyrelsen.** The pages stay intermittently unreachable to the checker;
  the next scheduled runs will say whether the site root answers.
- **The SIRA portal.** Its limitation remains.
