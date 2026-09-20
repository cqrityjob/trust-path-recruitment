# HAYAT — verification sources: what exists, what we may use, what to ask for

Investigated 2026-09-20 from primary sources. Where something could not be confirmed from
a primary source it says **not confirmed** — nothing here is a guess. No badge belonging
to any person was fetched; the only live reads were ASIS's own public issuer and
badge-class metadata.

## 1. The answer in one table

| | Credly public hosted assertion | Credly authenticated API | ASIS | ISC2 (the alternative evaluated) |
| --- | --- | --- | --- | --- |
| Exists | Yes — Open Badges 2.0 **hosted** assertion | Yes — `api.credly.com/v1/organizations/<id>/…` | Web directory only, behind a bot challenge | Web form; badges are on Credly too |
| Covers other organisations' credentials | Any **public** badge whose id you have | **No** — scoped to the calling organisation | ASIS only | ISC2 only |
| Authentication | None | Organisation token or OAuth `client_credentials`; tied to a signed Pearson agreement | — | — |
| Supplies | badge class → issuer + template, `issuedOn`, `expires`, hashed recipient email; **HTTP 410 when revoked**, 404 unknown | state, dates, recipient email — to the issuer only | not confirmed (page not readable) | last name + member number → certifications, expiry (secondary source) |
| **Certificate number** | **No** | not applicable | not confirmed | member number |
| Holder binding | SHA-256 of the earner's email (lower-case; salt not confirmed) | none for a relying party | name only | name + number |
| **Automated retrieval / storage / re-check permitted** | **Not confirmed.** Website + user terms prohibit bots/scraping without written permission; API terms cover signed clients only, forbid storing API content (hashes included), allow a 30-day cache; the page documenting these endpoints was removed from the live docs | Only under agreement | No API; handbook requires signed certificant permission for release | Website terms prohibit robots; bulk verification is for official partners, by email, 5 business days |

**It is not the format of HAYAT's first verifier.** Credly does not hand a verifier a signed
credential: the assertion is *hosted*, verified by where it is served, with no signature.
HAYAT therefore has a second adapter written for what Credly actually serves.

## 2. What is built, and its state

`src/lib/security-passport/hayat/verification/hosted-open-badge.ts` — a complete
server-side adapter:

- The holder pastes their public badge link. **It is only parsed for a badge id.** The URL
  that is fetched is built by HAYAT on the single allow-listed host (`api.credly.com`),
  https, no redirects, 5 s, 256 kB, two attempts.
- Issuer and credential type come from the assertion's badge class and must equal ASIS's
  Credly issuer id and the template id recorded for the selected definition (CPP, PSP, PCI,
  APP — each id confirmed by reading the public badge class and matching its name).
- Expiry is compared with what the holder entered; `expires` in the past → *expired*;
  HTTP 410 → *revoked*; 404 → "check the link / make the badge public"; no answer →
  *temporarily unavailable*, never a verdict.
- Holder binding = the account's **confirmed** email against the hashed recipient, labelled
  **email control — not identity proofing**. Somebody else's public link verifies nothing.
- A positive result states what it did **not** cover: the certificate number (the source
  publishes none) and the issue date (the source dates the badge, not the certification).
- **Nothing fetched is stored** — no assertion body, no recipient hash — which is what
  Credly's API terms would require. Re-check window: 30 days, matching their cache limit.

**State: `enabled: false`** in `verification/source-registry.ts`, with the reason recorded.
While it is disabled the adapter makes **no** request, and the form does not offer the link
field — the UI never offers an action that cannot work. Enabling is a one-line reviewed
change that must cite the written permission in `permission`. It is deliberately not an
environment variable.

Tested with synthetic assertions through the real adapter (`passport-hayat:check` 7b.1–22).
**Not demonstrated against a live badge:** we have no permitted test badge and no
permission to fetch anyone's.

## 3. What is genuinely blocking, precisely

> **Written permission from Credly / Pearson** for CQrityjob, as a relying party that is
> not a Credly client, to (a) fetch a badge's public Open Badges hosted assertion from
> `api.credly.com/v1/obi/v2/badge_assertions/<id>` when the badge's earner supplies the
> link, (b) record our own verification result, and (c) re-check it periodically.

Permission is an external prerequisite, not proof that the live integration works.
Before activation, obtain an authorized test badge and validate the actual endpoint,
recipient hash/salt handling, issuer and template identifiers, expiry and revocation
semantics, and the scope of permitted result storage and re-checks. Confirm deployment
of the assessment persistence prerequisites if saved results are part of the release.
Only after those checks pass should `enabled: true` and a real permission reference be
committed. Until then, end-to-end live CPP/PSP/PCI/APP verification remains unproven.

## 4. Ready-to-send requests (owner sends; nothing has been sent)

### To Credly / Pearson — https://info.credly.com/schedule-a-demo · legal index https://info.credly.com/legal

> Subject: Relying-party verification of public Credly badges — permission request
>
> Hello,
>
> CQrityjob is a recruitment platform for the security industry. Our candidates hold
> certifications issued through Credly (ASIS International CPP, PSP, PCI and APP, among
> others) and ask us to confirm them to employers.
>
> We would like to verify a badge **only when its earner gives us their own public badge
> link**, by fetching that badge's Open Badges 2.0 hosted assertion
> (`https://api.credly.com/v1/obi/v2/badge_assertions/<id>`) — one request per check, no
> crawling, no profile pages, no search. We compare the assertion's issuer, badge template,
> expiry and hashed recipient with what the earner told us, and we do not store the
> assertion or any part of it — only our own result and the earner's link.
>
> Could you confirm in writing:
> 1. that a relying party that is not a Credly client may do this programmatically;
> 2. that we may keep our own verification result, and re-check a badge periodically
>    (we propose at most every 30 days, and on the earner's request);
> 3. whether these OBI endpoints are being retired — their documentation page was recently
>    removed — and, if so, what verifiers should use instead;
> 4. whether an earner-consent (OAuth) flow for relying parties exists or is planned;
> 5. how a verifier obtains and verifies an Open Badges 3.0 credential issued by Credly;
> 6. whether a verifier or partner agreement is required, and its terms and cost.
>
> Thank you,
> Mostafa Alshawi, CQrityjob

### To ASIS International — certification@asisonline.org

> Subject: Verifying CPP / PSP / PCI / APP status with the certificant's consent
>
> Hello,
>
> CQrityjob is a recruitment platform for the security industry. Candidates ask us to
> confirm their ASIS certifications to prospective employers, always with their consent.
>
> 1. Do you offer employers or platforms any automated or bulk status verification, under
>    signed certificant permission as your handbook requires?
> 2. Would ASIS authorise read access to badges issued through its Credly organisation, or
>    confirm that verifying a certificant's public Credly badge is an accepted method?
> 3. Could the certification number be included in the badge's evidence, so a verifier can
>    match it to the certificate the candidate holds?
>
> Thank you,
> Mostafa Alshawi, CQrityjob

## 5. The other issuers in the catalogue

ISC2 (evaluated as the alternative), ISACA and ACFE offer no public verification API. ISC2
and ACFE issue through Credly, so the **same adapter and the same permission** would cover
them: adding an issuer is a registry entry — its Credly issuer id and template ids,
confirmed from its public badge classes — not new code. ISC2's own bulk verification is
for official training partners, by email. ACAMS's platform: not confirmed.

No issuer was added to the trusted registry with guessed keys or synthetic data.
`PRODUCTION_ISSUER_POLICIES` (signed credentials) remains empty; `CREDLY_OB2` holds only
identifiers read from ASIS's public metadata, and is disabled.
