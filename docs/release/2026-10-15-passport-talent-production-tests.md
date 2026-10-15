# 2026-10-15 — Produktionsprov efter driftsättning av #473 (förberett, inte utfört)

**Status: förberett.** Inget av detta är utfört. Schemat (0316–0318) är installerat och skrivskyddat verifierat på `wrygicdfxwjnrugduxnt`: [hosted-verification](2026-10-15-passport-talent-discovery-hosted-verification.json). Appen (#473) är **inte** driftsatt.

- **Mergeklar kod** betyder: granskad, grön CI på exakt slutcommit och registrerad schemaapplicering.
- **Produktionsverifierad funktion** kräver dessutom proven nedan, utförda efter publicering.

Webbläsarsviten mot riktig GoTrue, Storage och PostgREST har ingen Edge-runtime och bevisar därför inte extern mejlleverans.

## Förutsättningar

1. #473 är mergad och appen är publicerad enligt den beslutade ansvarsfördelningen. Notera main-commit och publiceringstid.
2. Provrundan körs i allowlist-läge:
   - `PRODUCT_EMAIL_RECIPIENT_ALLOWLIST` innehåller **bara** de godkända testadresserna;
   - `PRODUCT_EMAIL_MODE=production` sätts först efter rundan, enligt ägarens beslut.

   Utan lista och utan uttryckligt produktionsläge skickas inga produktmejl. En mottagare utanför listan får inget mejl, och raden markeras `skipped / not_allowlisted`.

3. Testkonton enligt [2026-10-03-production-test-request.md](2026-10-03-production-test-request.md): K1 och K2 (kandidater), A-OWN (ägare av testföretaget), en granskare med Passport-granskarroll. Alla adresser är godkända testadresser. Rekryteringsansvarig på testjobbet är A-OWN eller en godkänd testadress.
4. **Före första svepet:** läs `user_notices` skrivskyddat, med antal per `kind`, `email_status` och ålder. Notiser som är yngre än 7 dagar skickas när appens svep körs. Äldre plockas aldrig (`created_at > now() - 7 days` i `user_notices_claim_emails`). Ägaren beslutar om eventuell kö innan svepet slås på. Vid verifieringen 18:39 UTC var antalet 0.
5. En utförare och en körning. Utföraren anger UTC-fönstret. Claude-sessionen verifierar efteråt skrivskyddat, med antal och status men inga adresser eller innehåll.

## P1–P9: de nya notiserna, en per typ

Utskicket går genom `user_notices`:

1. Databasen skriver notisen.
2. Appen gör claim under ett 3-minuters lease och kontrollerar mottagaren igen vid claim.
3. Appen skickar med leverantörsnyckeln `user-notice:<rad-id>`.
4. Appen gör settle.

Detta sker direkt efter handlingen och i svepet `/api/recruitment/receipts-sweep`.

| Prov                                  | Handling i appen                                                                               | Mottagare                          | Länken i mejlet ska öppna                                                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| P1 `passport_review_requested`        | K1 begär granskning av en egen merit med underlag                                              | granskare (godkänd testadress)     | `/passport-review`                                                                                                        |
| P2 `passport_clarification_requested` | Granskaren begär komplettering                                                                 | K1                                 | meriten, `#sp-entry-verification`                                                                                         |
| P3 `passport_clarification_answered`  | K1 svarar med text                                                                             | granskaren                         | `/passport-review`                                                                                                        |
| P4 `passport_decision_approved`       | Granskaren godkänner                                                                           | K1                                 | meriten, `#sp-entry-verification`. Underlaget i mejlet följer provenansregeln (dokumentgranskning ≠ utfärdarbekräftelse). |
| P5 `passport_decision_rejected`       | Granskaren avslår, med meddelande                                                              | K1                                 | meriten. Meddelandet syns, den interna anteckningen aldrig.                                                               |
| P6 `passport_verification_revoked`    | Granskaren återkallar                                                                          | K1                                 | meriten                                                                                                                   |
| P7 `talent_contact_received`          | A-OWN gör K1 sökbar via Jobbmöjligheter, söker från ett publicerat testjobb och ber om kontakt | K1                                 | `/passport/discoverability#contacts`                                                                                      |
| P8 `talent_contact_accepted`          | K1 läser annonsen och accepterar                                                               | rekryteringsansvarig på testjobbet | `…/jobs/<id>/talent?tab=contacts`                                                                                         |
| P9 `talent_contact_declined`          | K2 (sökbar) avböjer en förfrågan                                                               | rekryteringsansvarig               | `…/jobs/<id>/talent?tab=contacts`                                                                                         |

För varje prov gäller:

- exakt ett mejl till rätt testadress;
- samma notis i appens inkorg ("Händelser");
- länken öppnar rätt sida efter inloggning;
- ingen annan persons uppgifter och ingen intern anteckning i mejlet;
- svenska och engelska enligt mottagarens språk.

## R1–R3: återförsök utan dubbla utskick

| Prov | Gör                                                                                           | Förväntat                                                                                                                                                      |
| ---- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1   | Kör svepet två gånger inom en minut, med samma token, direkt efter P7                         | P7 ger fortfarande exakt ett mejl. Leaset hindrar dubbel claim, och leverantörsnyckeln `user-notice:<id>` hindrar ett andra utskick om ett svar har förlorats. |
| R2   | Dubbelklicka "Acceptera och dela mitt namn" och "Skicka förfrågan"                            | En kontakt, ett svar och en notis (dedupnycklarna `contact:<id>` och `contact-answer:<id>`)                                                                    |
| R3   | Flytta ansvaret för testjobbet till en annan godkänd testadress innan svepet hinner skicka P8 | Raden markeras `skipped`. Den tidigare ansvariga får inget mejl.                                                                                               |

## T4–T6 (från 2026-10-03), igen med den nya appversionen

| Prov | Gör                                                                                                    | Förväntat                                                                                                                                 |
| ---- | ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| T4   | K1 söker en gång på ett testjobb med intern ansökan, med det separata Passport-valet                   | ett ansökningskvitto; länken till "Mina ansökningar" fungerar; dubbelklick ger ingen dubblett                                             |
| T5   | A-OWN skickar ett rekryteringsmeddelande till K1                                                       | ett mejl med avsändaren "<Arbetsgivare> via CQrityjob"; "Läs i CQrityjob" öppnar meddelandet                                              |
| T6   | K1 söker på ett testjobb där den notifierade ägaren eller administratören är den godkända testadressen | exakt ett `employer_new_application`; länken öppnar ansökan; ett andra försök och svepet ger ingen dubblett; en avstängd person får inget |

## Skrivskyddad verifiering efteråt (Claude)

```sql
-- Endast antal, inga adresser eller innehåll. <start> = utförarens UTC-start.
select kind, email_status, count(*) as n, max(email_attempts) as max_attempts
  from public.user_notices where created_at >= '<start>' group by 1, 2 order by 1, 2;
select kind, count(*) from public.user_notices
 where created_at >= '<start>' and email_status = 'sent' group by 1 having count(*) > 1; -- se P1–P9
```

Därtill kommer funktionsloggarna för `transactional-email`: antal per kind och status, och leverantörsnyckeln en gång per notis.

## Utanför proven

Riktiga kandidater och arbetsgivare, massutskick, AI-funktioner och prestanda.
