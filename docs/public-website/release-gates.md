# Public website — release gates for claim-bearing copy

The public website (2026-09-30) describes three capabilities whose final
wording depends on a production state that this change does **not** create.
Each one ships with **truthful temporary copy**; the final copy is kept here so
the switch is a dictionary edit, made only once the gate is verified.

There is no feature flag for any of this, deliberately: the copy is changed
in `src/i18n/dictionaries.ts` (Swedish and English), in a reviewed diff, when
the gate is met.

Verification was read-only against production (`wrygicdfxwjnrugduxnt`) on
2026-09-29 and re-checked before the pull request was opened.

| Gate | Condition                                                  | Status at release | Live copy         |
| ---- | ---------------------------------------------------------- | ----------------- | ----------------- |
| A    | An active, unrevoked, unexpired row in `sw_ai_activations` | **Not met**       | Temporary (below) |
| B    | A HAYAT verification source enabled for production         | **Not met**       | Temporary (below) |
| C    | A published BESKT method version available to employers    | **Not met**       | Temporary (below) |

---

## Gate A — Säkerhetsarbete AI support

**Condition.** At least one row in `public.sw_ai_activations` with
`environment = 'production'`, `valid_until > now()` and no matching row in
`public.sw_ai_activation_revocations`.

```sql
select count(*)
from public.sw_ai_activations a
left join public.sw_ai_activation_revocations r on r.activation_id = a.id
where a.environment = 'production' and a.valid_until > now() and r.activation_id is null;
```

**Evidence (2026-09-29).** 0 rows in `sw_ai_activations`. The workspace's AI
processing is disabled.

**Live (temporary) copy** — `/sakerhetsarbete`:

| Key                        | sv                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `securityWorkPage.title`   | Stöd för ditt säkerhetsarbete                                                                                                               |
| `securityWorkPage.status`  | AI-stödet är förberett men ännu inte aktiverat. Arbetsytan fungerar redan i dag utan AI.                                                    |
| `securityWorkPage.ai.body` | … AI-stödet är ännu inte aktiverat. När det aktiveras gäller samma princip som i dag. AI hjälper dig med arbetet. Du ansvarar för besluten. |

**Final copy, once gate A is met** (replace exactly these three keys):

| Key                        | sv                                                                                                                                                              | en                                                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `securityWorkPage.title`   | AI-stöd för ditt säkerhetsarbete                                                                                                                                | AI support for your security work                                                                                                                                               |
| `securityWorkPage.status`  | AI-stödet hjälper dig att strukturera underlag, hitta kunskapsluckor och ta fram utkast. Du ser i arbetsytan när det är tillgängligt för dig.                   | AI support helps you structure evidence, find information gaps and produce drafts. Your workspace shows when it is available to you.                                            |
| `securityWorkPage.ai.body` | AI-stödet kan föreslå kompletteringsfrågor, synliggöra kunskapsluckor och ta fram utkast som du granskar. AI hjälper dig med arbetet. Du ansvarar för besluten. | AI support can suggest follow-up questions, highlight information gaps and produce drafts for you to review. AI helps you with the work. You are responsible for the decisions. |

`scripts/public-homepage-check.tsx` (T16) asserts that the page says AI is
not yet activated. Update that assertion in the same diff as the copy.

---

## Gate B — HAYAT source verification

**Condition.** A verification source enabled for production:
`CREDLY_OB2.enabled === true` (or another entry of `PRODUCTION_SOURCES`) in
`src/lib/security-passport/hayat/verification/source-registry.ts`, and a
non-empty `PRODUCTION_ISSUER_POLICIES` in `issuer-registry.ts`.

**Evidence (2026-09-29).** `CREDLY_OB2.enabled = false` (written permission
for automated retrieval not obtained) and `PRODUCTION_ISSUER_POLICIES = []`.
HAYAT reads a document in the browser and proposes values; it does not
confirm anything with an issuer.

**Live (temporary) copy** — `/security-passport`:

| Key                        | sv                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `passportPage.hayat.title` | HAYAT hjälper dig att läsa dokumenten                                                                                                                                          |
| `passportPage.hayat.body`  | Ladda upp ett intyg som PDF eller bild så läser HAYAT det i din webbläsare och föreslår nummer och datum. Du bekräftar varje värde. HAYAT läser i dag svensk och engelsk text. |
| `passportPage.hayat.note`  | Att ett dokument har lästs betyder inte att uppgiften är verifierad.                                                                                                           |

**Final copy, once gate B is met** (replace `passportPage.hayat.body`; keep the
note):

| sv                                                                                                                                                                                                                                   | en                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Ladda upp ett intyg som PDF eller bild så läser HAYAT det i din webbläsare och föreslår nummer och datum. Du bekräftar varje värde. För de utfärdare som är anslutna kan HAYAT dessutom kontrollera uppgiften direkt hos utfärdaren. | Upload a certificate as a PDF or image and HAYAT reads it in your browser and suggests numbers and dates. You confirm every value. For connected issuers, HAYAT can also check the information directly with the issuer. |

Name only issuers that are actually enabled; never imply coverage beyond them.

---

## Gate C — BESKT for employers

**Condition.** A `public.beskt_method_versions` row with
`content_status = 'published'`, and an assignable path for employers beyond
the owner-issued internal test grants.

```sql
select count(*) from public.beskt_method_versions where content_status = 'published';
```

**Evidence (2026-09-29).** 0 published method versions and 0 internal test
activations.

**Live copy** — `/employers` (`employers.assessment.beskt.availability`), the
previously approved sentence, which remains true:

> BESKT är under utveckling och kan användas först efter granskning och ett
> uttryckligt godkännande för er organisation.

**Final copy, once gate C is met:**

| sv                                                                                  | en                                                                         |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| BESKT används efter granskning och ett uttryckligt godkännande för er organisation. | BESKT is used after review and an explicit approval for your organisation. |

The boundary sentence (`employers.assessment.beskt.body` — a method, no
result, no score, no ranking, not säkerhetsprövning) does **not** change with
the gate. `scripts/employer-landing-check.tsx` (E5) pins it and the
approval-gated availability; update E5 in the same diff.

---

## TRUST

TRUST content exists only as draft / pilot-hypothesis role packs. The public
copy says TRUST is research-informed and **not** scientifically validated as a
whole, and that the roles with TRUST content are shown in the employer
platform. The homepage does not name TRUST. No gate unlocks a validity,
prediction or bias-free claim.
