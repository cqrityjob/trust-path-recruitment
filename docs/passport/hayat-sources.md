# HAYAT — verification sources: what is documented, what is unknown, what to ask for

Re-investigated 2026-09-20 from primary sources, after the first review was found to have
reasoned badly. Everything below is tagged:

- **ALLOWED** — a primary source explicitly permits it, quoted.
- **FORBIDDEN** — a primary source explicitly forbids or restricts it, quoted.
- **UNKNOWN** — no primary source either way. This is *not* a prohibition, and is never
  written up as one.

## 0. Corrections to the first review

The first review (same day, superseded) drew two conclusions it had not earned. Both are
withdrawn:

| First review said | Actually |
| --- | --- |
| "The OBI documentation page hard-404s while everything else redirects — deliberate removal." | **Wrong inference.** The docs moved to `docs.credly.com`. An archived snapshot of the old page (2025-05-22, HTTP 200) documents `GET /v1/obi/v2/badge_assertions/<id>` exactly as we implemented it. A 404 on a moved page says nothing about intent. |
| "Automated retrieval is not permitted." | **Overstated.** No clause in any of Credly's three documents addresses a single, earner-initiated fetch of one public assertion URL the candidate gave us. It is **UNKNOWN** — unresolved, not forbidden. |

And the capability the first review implied was unavailable is in fact **live**: real ASIS
CPP assertions were fetched today, unauthenticated, including a revoked badge answering
`410 {"revoked":true}`.

## 1. Credly — what is actually true

**The endpoint works, today, without authentication** (verified live):

```
GET https://api.credly.com/v1/obi/v2/badge_assertions/<badge-uuid>   200
GET https://api.credly.com/api/v1/obi/v2/issuers/<id>/badge_classes/<id>   200
GET https://api.credly.com/api/v1/obi/v2/issuers/<id>   200
```

It returns an Open Badges **2.0 hosted** assertion: `issuedOn`, `expires`,
`verification: {"type":"hosted"}`, `recipient: {type:"email", hashed:true,
identity:"sha256$…"}`, `badge` → BadgeClass → issuer Profile. Revocation is real
(`410 {"revoked":true}`). Expiry is a **field, not a status** — an expired badge still
returns 200, so the verifier must compare the date itself, which ours does.

Three facts that matter and that the first review got wrong or missed:

- **There is no salt** on the recipient hash. Our adapter treats salt as optional, so this
  works, but the exact email normalisation Credly hashes is **UNKNOWN** and must be
  settled against one real badge before this is enabled.
- **ASIS populates `evidence[]`** with what appear to be "Candidate ID" / "Certificate ID"
  entries. So a certificate number may well be checkable. Our adapter does not read it,
  and the scope limit it reports has been reworded to say what *this check* did rather
  than what the source publishes.
- **Badge uuids can redirect.** At least one uuid 302'd to a different uuid. Our
  `safeFetchJson` refuses to follow redirects by design, so such a badge would report
  *temporarily unavailable* rather than verify. Whether the assertion endpoint (as opposed
  to the badge page) redirects is **UNKNOWN** and is a named test for the pilot.

**`verification.type: "hosted"` is not a signature.** Trust rests on TLS plus Credly's
control of `api.credly.com`. It must never be presented as equivalent to the signed
profile — the model already separates them, and the honest label is "source confirmed",
not "cryptographically proven".

### Terms — precisely what they cover

| Document | Version / date | Binds |
| --- | --- | --- |
| Website ToS | 1.1, 3 Jan 2024 | anyone using the Website |
| User ToS | 2.1, Jul 2023 | anyone "accessing … the Services" |
| API ToS | 2.1, Jul 2023 | "Client" under the Pearson Workforce Skills Agreement |

- **FORBIDDEN** — bulk/automated *data mining or scraping* of the Website or Services
  "without the prior written permission of Pearson"; obtaining API Content "outside the
  Pearson APIs".
- **UNKNOWN** — a single fetch of one public assertion URL supplied by the candidate it
  belongs to. No document addresses it.
- **The nearest real exposure**, and the clause to put to a lawyer rather than wave away:
  the User ToS bars "copy, use, disclose or distribute any information obtained from the
  Services" without **Pearson's** consent — the earner's consent is not what that clause
  asks for.
- `robots.txt` disallows only `/talent-match`. That is a crawl directive, not permission.

**No partner, verifier or relying-party programme is published (UNKNOWN).** Employers are
a named Credly audience, but what is offered is sourcing and matching, not verification of
a named candidate. The only published route to ask is
<https://info.credly.com/schedule-a-demo>.

## 2. ASIS International

- **ALLOWED** — a public credential-holder lookup exists:
  `external.asisonline.org/eweb/DynamicPage.aspx?webcode=ASISCredSearch`, "SEARCH FOR
  CREDENTIAL HOLDERS", no login, first name / last name / certification number, exact
  match. It is an ASP.NET form, **not** an API. No terms are displayed on it. (The 403 a
  script gets is a Cloudflare bot filter, not a policy statement.)
- **FORBIDDEN, with a consent carve-out** — the Certification Handbook (updated 4 Aug
  2026): release of certificant information "is prohibited unless ASIS obtains signed
  permission", and consent "must include to whom the … information can be released".
- **UNKNOWN** — any ASIS employer/third-party verification API or bulk route. None found.
- ASIS issues through Credly. Organisation `credly.com/org/asis-international`; OBI issuer
  `780a5807-d294-4ded-be0a-f8ae225f997b`; the four badge classes (CPP `71fbf093…`, PSP
  `931c53b1…`, PCI `7c038c8c…`, APP `c59ac211…`) all resolve. These are the ids already in
  `source-registry.ts`.
- Contact: `certification@asisonline.org`.

## 3. The easiest proven first connection

**It is the one already built.** Credly's OB2 hosted assertion is unauthenticated,
standards-shaped, live, carries expiry and real revocation — and the *same* endpoint
pattern also resolves for ISC2, ISACA, CompTIA, AWS and Google Cloud badges. One adapter
covers most of the security-certification market. Its weakness is holder binding: a hashed
email and nothing else.

Two things make this stronger than a bespoke integration:

- **1EdTech operates a validator for exactly this format** — `vc.1ed.tech` exposes an
  `OB20Inspector` ("Verifies Open Badges 2.0 files"), unauthenticated, and the code is
  **Apache-2.0** (`1EdTech/digital-credentials-public-validator`). We can self-host it and
  cross-check our own verdicts against the standards body's, without depending on anyone's
  instance or terms. Their hosted instance's `termsOfService` is literally
  `"TODO URL to terms of service"` — another reason to self-host.
- Nothing needs inventing. We already parse, fetch and decide; what is missing is
  permission and one real badge.

### What was ruled out, and why (so it is not re-investigated)

| Path | Verdict |
| --- | --- |
| OB3 / W3C VC with a resolvable key (our signed profile) | **Not found in the security sector.** `did:web` probes 404 at Accredible, Certifier, Sertifier, Badgr, Open Badge Factory; `credential.net` serves an SPA shell. CertDirectory does publish a real `did:web` + Ed25519 — but it signs with **Data Integrity** (`eddsa-rdfc-2022`), which our verifier deliberately does not support, and it is a very small platform. |
| `id.1ed.tech` did:web entries | Resolve (200, JsonWebKey2020, incl. Credly) but whether those keys **sign credentials** or are only trust-registry identities is **UNKNOWN**. That one question decides the path. |
| UK SIA | **FORBIDDEN** — GOV.UK, 24 Aug 2026: the SIA "does not provide any special APIs, dedicated data feeds, or other tools" for volume checks. |
| Europass / EBSI / EUDI | Different crypto stacks (JAdES over eIDAS X.509; `did:ebsi`; SD-JWT VC). Each is a second verifier, not a reuse of ours. |
| Sweden (Polisen, Transportstyrelsen) | Scraping explicitly forbidden; register access is permit-gated; the DIGG wallet lands Dec 2026. |
| ISC2 | **ALLOWED with partnership** — a published partner batch route, written approval, signed consent per person, five business days. Not real-time. |
| ISACA | **ALLOWED with consent** — third-party verification against a candidate-supplied certificate number plus signed written consent. No API (**UNKNOWN**). |

## 4. Ready to send — nothing has been sent

### To Credly / Pearson — <https://info.credly.com/schedule-a-demo>

> Subject: Permission for candidate-initiated verification of a public Credly badge
>
> Hello,
>
> CQrityjob is a recruitment platform for the security industry. Our candidates hold
> certifications issued through Credly — ASIS International CPP, PSP, PCI and APP, and
> also ISC2, ISACA and CompTIA — and they ask us to confirm those credentials to
> prospective employers.
>
> We would like written confirmation that we may do the following, and nothing beyond it:
>
> 1. **Only when the earner gives us their own badge link**, fetch that one badge's
>    public Open Badges 2.0 hosted assertion from
>    `https://api.credly.com/v1/obi/v2/badge_assertions/<id>` — one request per check. No
>    crawling, no profile pages, no search, no bulk access.
> 2. From that assertion, check and record only our own conclusion about: the **issuer**
>    and that it is the one we expect; the **badge template**, so we know which credential
>    it is; **`issuedOn` and `expires`**, to judge validity; the **revocation** status you
>    signal with HTTP 410; and **holder binding**, by hashing the email the candidate has
>    already confirmed with us and comparing it to `recipient.identity`.
> 3. **Re-check** that badge periodically — we propose at most once every 30 days, and on
>    the candidate's request — so an employer is never shown a stale result.
> 4. Store **only our own verification result and the candidate's own link**. We do not
>    store the assertion, the recipient hash, or any other API content.
>
> Four questions where your documentation does not give us an answer:
>
> - Which normalisation do you apply to the email before hashing `recipient.identity`
>   (lower-casing, trimming)? We want to avoid false "not the holder" results.
> - Is there a rate limit we should respect for this pattern?
> - Do badge ids remain stable, or can an assertion URL redirect to a different id?
> - Is an Open Badges 3.0 / W3C Verifiable Credential representation available to
>   verifiers for badges issued through Credly, and if so how is the issuer key resolved?
>
> If this needs a verifier or partner agreement, we would like to know its terms and cost.
>
> Mostafa Alshawi, CQrityjob

### To ASIS International — `certification@asisonline.org`

> Subject: Verifying CPP / PSP / PCI / APP with the certificant's consent
>
> Hello,
>
> CQrityjob is a recruitment platform for the security industry. Certificants ask us to
> confirm their ASIS certifications to prospective employers, always with their consent.
>
> 1. Your handbook allows release of certificant information with signed permission naming
>    the recipient. Do you have a route for an employer-facing platform to use that, and
>    what does the signed permission have to say?
> 2. Would ASIS confirm that verifying a certificant's own public Credly badge is an
>    accepted method of confirming CPP/PSP/PCI/APP status?
> 3. Your Credly badges appear to carry a Candidate ID / Certificate ID in the assertion's
>    evidence. Can we rely on that field to match the certificate number a candidate gives
>    us, and is it present for all four credentials?
> 4. May the public credential-holder search be used programmatically, one lookup per
>    consenting candidate? If not, we will not do so.
>
> Mostafa Alshawi, CQrityjob

## 5. The order to do things in, once permission arrives

1. Get **one real badge** from a consenting holder (or an ASIS-issued test badge).
2. Settle the four unknowns: email normalisation, rate limit, id stability/redirects, and
   whether `evidence[]` carries a usable certificate number.
3. Stand up the **self-hosted 1EdTech OB20 validator** and cross-check our verdict against
   it on that badge.
4. Only then set `enabled: true` in `source-registry.ts` with the written permission cited
   in `permission`, and only with the scope limits the badge actually supports.
