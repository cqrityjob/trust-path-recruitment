# Security Passport — India entry journey

Status (2026-09-26): **schema merged (#297) and applied hosted, verified read-only; the app (#298) is not merged or published.**
Schema: `20261214090000_sp_india_national_qualifications`, `20261215090000_candidate_location_and_destinations`
(release note: [../release/2026-09-26-india-entry-schema.md](../release/2026-09-26-india-entry-schema.md)).

India is the entry market; Dubai is the first destination focus. Nothing here activates the Dubai or
UK pilot definitions, creates an Indian market pack, or claims a legal review.

## 1. What a candidate gets

| Surface | Route | What it does |
|---|---|---|
| Landing page | `/security-passport/india` | English first (Swedish kept, all copy in `src/lib/india-entry/copy.ts`). Collect → add Indian and international credentials → HAYAT helps read → choose what to share. Truthful Dubai section linking SIRA. Fictional, labelled example. Generic "share this page" (native share / copy link). No OCR loaded. |
| Sign-up | `/signup?redirect=/passport/start?market=IN%26lang=en&lang=en` | The existing auth flow and providers; the intent survives an immediate session, the e-mailed confirmation link and Google (safeReturnPath). The page language rides the URL, so a tap before hydration still signs up in English; it is adopted only when no language was chosen on the device (an explicit Swedish choice wins), and a confirmation link opened elsewhere returns to an English setup. |
| Setup | `/passport/start` | Creates an empty Passport on arrival. Four resumable steps derived from saved rows: name + current occupation → where you live (India preselected, editable) → optional desired destinations + relocation interest → first credential or later. |
| Catalogue | `/passport/credentials/new?country=IN` | The four Indian definitions, version select with awarding body, HAYAT reading, private upload. |
| Next steps | setup step 4 and `/my-career` | Dubai (and UK when chosen): recorded / usually still needed / to confirm externally. SIRA and GOV.UK sources. No score. |

Never asked or inferred: nationality, immigration or right-to-work status. Where somebody lives,
where they work and where they would like to work are three separate answers, none of which
changes a credential's jurisdiction or grants market access.

## 2. The Indian definitions

| Code | Official title | QP | Current version (catalogue) | Superseded versions recorded |
|---|---|---|---|---|
| `IN_MEPSC_Q7101` | Security Guard | MEP/Q7101 | QP 6.0 · NSQF 3 · QG-03-OA-04021-2025-V2-MEPSC | 2022/OAFM/MEPSC/05425 (NSQF 3) |
| `IN_MEPSC_Q7201` | Security Supervisor | MEP/Q7201 | QP 5.0 · NSQF 4.5 · QG-4.5-OA-04023-2025-V2-MEPSC | 2022/OAFM/MEPSC/05429 (NSQF 3); QP 1.0 (NSQF 5) |
| `IN_MEPSC_Q7104` | CCTV Supervisor | MEP/Q7104 | QP 5.0 · NSQF 4.5 · QG-4.5-OA-04024-2025-V2-MEPSC | 2022/OAFM/MEPSC/05427 (NSQF 4); QP 1.0 (NSQF 5) |
| `IN_MEPSC_Q7204` | CCTV Video Footage Auditor | MEP/Q7204 | QP 4.0 · NSQF 4 (MEPSC listing; no NQR record found) | 2022/SEC/MEPSC/06149 v3.0 (NSQF 4) |

Scope `national_qualification`: India-wide, no region, no market pack, no licence, never
local eligibility or a title. Regulator: NCVET. Awarding body: MEPSC (NCVET-recognised; "MEPSC will
certify the learners"). Issuer: **stated by the holder as printed** — MEPSC, NSDC/Skill India and the
training centre are never assumed to be one organisation. Expiry: none required, none derived; the
standard's review date is not a holder's expiry, and a superseded version is not an expired
certificate.

**Deliberately excluded:** any personal "PSARA licence" (the Act licenses agencies; a guard's
credential under the Central Model Rules 2020 is a Form VIII training certificate from a licensed
institute — state-specific and not modelled); armed-security permissions; General Duty Guard,
Personal Security Officer, Security Officer, Cash Logistics and Armed Security Guard (not in this
release); a 2018 "Unarmed Security Guard" NSQF-4 version and an NQR code for MEP/Q7204 v4.0 (not
substantiated).

Sources (checked 2026-09-26): mepsc.in security standards; nqr.gov.in/qualifications/13642, 13650,
13652, 2613, 2650, 2651, 3222 and their qualification files; MEPSC Qualifications Handbook 2026;
PMKVY 4.0 guidelines (MSDE); DigiLocker issuer list; API Setu NSDC collection; MHA PSARA Act and SOP
(May 2023).

## 3. HAYAT — what it checks and what stays manual

| HAYAT does | HAYAT does not |
|---|---|
| Read a supported PDF/image **in the browser** (English and Swedish text) | Read Hindi or any other script — such documents are added and completed by hand |
| Suggest certificate number and dates; "Date of Issuance" and "03-Apr-2023" understood | Resolve an ambiguous date: 04-03-2023 is offered as two readings for the holder to choose |
| Compare the document with the selected qualification (title, QP code, historical titles) and flag a different catalogue qualification | Change the selection, or compare the issuer (the holder states it) |
| Compare the printed name with the account name, titles (Mr/Ms/Shri/Smt…) set aside and initials tolerated | Treat a name difference as fraud, or compare a script it cannot read |
| Keep saving available when reading fails | Send any text read from the document to the server |
| Show a recorded check's **HAYAT check reference**, method, date and limitations to the holder | Create a check where none ran, or expose a reference to anyone else |

**No Indian certificate can be verified automatically today.** The production issuer registry is
empty and the one documented route — NSDC's Skill Certificate API on API Setu — needs API Setu and
NSDC approval plus the holder's consent artefact. None exists, nothing was scraped, nothing enabled.
So every Indian credential is either registered by the holder, document-provided, or approved by an
authorised `passport_verifier` through the existing review (clarification loop included). OCR,
a certificate number, a matching name or e-mail control never move the recipient-facing level.

## 4. Admin

`/admin/passport-catalogue` shows, per definition: selectability and why, the national-qualification
note, territory requirement, regulator / issuer rule / awarding body, versions with sources, and
automatic verification read from the production registries in code (an administrator cannot enable
a source or inject a key by editing the database). `/passport-review` shows the reviewer the stated
version, what it is, the regulator and the source.

## 5. Owner test script (after both schema migrations are applied and the app is published)

1. Open `/security-passport/india` signed out. English page; "Example" card; Dubai section links SIRA.
2. **Create my Security Passport** → create an account with a real inbox → click the e-mailed link.
   You land on **Set up your Security Passport, step 1 of 4**.
3. Name + occupation → Continue. Country shows **India** ("Preselected…"); change it and back →
   Continue. Tick **Dubai** → Continue.
4. **Add a credential** → Continue, Continue → choose **Security Guard (MEP/Q7101)** → Continue.
   Awarding body MEPSC and the "not a licence" note are shown.
5. Choose a synthetic certificate PDF → number and dates suggested and marked "Read by HAYAT";
   Verification box: cannot be verified automatically. Type the issuer as printed, choose version
   6.0 → Continue → **Save credential**.
6. The credential page shows India, the version, "Expiry date not provided", "No automatic check has been made". Reload.
7. `/passport/start` → **Next steps for Dubai**: your credential under "Recorded", SIRA link, no score.
8. **Request verification** → as a `passport_verifier`, `/passport-review` → Open request → the
   catalogue definition panel shows version, NCVET, issuer rule → **Request clarification** with a
   message → as the holder add a document → reviewer **Approve** → holder sees Documented.
9. **Share** → select the credential → create → scan the QR on a phone → recipient sees the
   credential, India, Documented, no number, no document → revoke → the link stops working.

## 6. Proof (local, isolated — not hosted)

- `bash scripts/db-test.sh` on a fresh postgres:16: green (India 75 + location 21 assertions, each
  before/after rollback-reapply with a negative control).
- `e2e/india-entry-journey.spec.ts` (opt-in `INDIA_LIVE_LOCAL=1`) on a disposable Supabase stack with
  e-mail confirmation ON, Mailpit, Storage and the Edge share gateway behind a local https front:
  desktop journey (sections 5.1–5.9 above, plus another candidate and anon reading nothing) and
  375/390 px phone checks (no horizontal scroll, keyboard focus, a failed save keeps input, a failed
  HAYAT read keeps the form). Screenshots are attached to the PR, not committed.
- `india-entry:check` (+9 planted controls), `passport-hayat:check` group 11 (+3 controls), all CI
  checks.

## 7. Known limits

- The root document is `<html lang="sv">`; the India page sets `lang="en"` on its own subtree.
- Expiry wording (product-wide, `formatExpiry`): a missing date reads "Expiry date not provided" /
  "Slutdatum inte angivet"; only a credential recorded as non-expiring (`no_expiry`) reads "No expiry".
  Presentation only — stored validity and trust are unchanged.
- HAYAT has no Hindi language data; QR codes on Skill India certificates are not read.
