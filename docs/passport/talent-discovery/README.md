# Security Passport → rekrytering: leveransrapport

Tråden: **registrera → styrk → välj synlighet → bli hittad → kontakt → ansökan och rekrytering**.

| Del                                            | Var                                                                                                                         |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Nuläge och beroenden                           | [00-nulage-och-beroenden.md](00-nulage-och-beroenden.md)                                                                    |
| Kontrakt för sökning, förklaringar och kontakt | [talent-search-contract.md](talent-search-contract.md)                                                                      |
| Schema (tre slots, rollback, SQL-tester)       | PR cqrityjob/trust-path-recruitment#472 · [releaseanteckning](../../release/2026-10-15-passport-talent-discovery-schema.md) |
| Applikation (den här grenen)                   | `src/lib/talent`, `src/components/talent`, `src/lib/notices`, passport- och arbetsgivarvyerna                               |
| Webbläsartest mot riktig databas               | `e2e/talent-discovery-local.spec.ts` + `scripts/fixtures/talent-discovery-fixture.sql`                                      |
| Bilder och mätvärden                           | [evidence/](evidence/)                                                                                                      |

## Ordning för release

1. **Schema-PR (#472)** mergas och appliceras av Supabase-integrationen. Den ändrar ingen applikationskod;
   inget anropar de nya funktionerna förrän steg 3.
2. Releaseansvarig verifierar det hostade schemat och skriver `applied` i `supabase/release-state.json`.
3. **App-PR** (denna gren) blir merge-bar. `schema-first-release:check` blockerar den till dess, avsiktligt.
4. Mejl: i varje test- eller förhandsmiljö ska `PRODUCT_EMAIL_RECIPIENT_ALLOWLIST` sättas till de
   godkända testadresserna (kommaseparerat, `@domän` tillåts). Andra mottagare får då inget mejl och
   markeras `not_allowlisted`. Utan listan, alltså i produktion, får varje mottagare sitt produktmejl. I
   appen syns notisen alltid.

Merge, driftsättning och publicering samordnas med releaseansvarig. Astra granskar oberoende.

## Vad som är verifierat, och var

| Miljö                                                          | Verifierat                                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQL (riktig Postgres 16, strikt replay)                        | Alla migrationer i ordning; sviterna RH1–RH11 (53), TD (33), TS1–TS15 (75); fem planterade negativa kontroller; rollback av alla tre slots inklusive vägran när data finns; `db-test.sh` grönt.                                                                                                                                                                 |
| Lokal stack: Postgres 16 + PostgREST 12.2.3 + appen i Chromium | 11 seriella scenarier, alla gröna (se nedan).                                                                                                                                                                                                                                                                                                                   |
| **Substitut** i den lokala stacken                             | Auth (GoTrue) och Storage ersätts av repots `scripts/local-stack/auth-gateway.mjs`: riktiga JWT, riktig RLS och riktiga `storage.objects`-rader, men inte GoTrue- eller Storage-binärerna. Docker-registren var blockerade i arbetsmiljön. Mejl går till en mejlfångare i gatewayen; inget lämnar processen. CI-jobben med riktig GoTrue/Storage körs i GitHub. |
| Produktion (`wrygicdfxwjnrugduxnt`)                            | **Inte rörd.** Ingen migration, ingen data, inget mejl.                                                                                                                                                                                                                                                                                                         |

### Webbläsarscenarier (`e2e/talent-discovery-local.spec.ts`)

Syntetiska personer: kandidaterna Cecilia (A), Bo (B) och Petra (C, privat), granskare, ägare,
rekryteringsansvarig, kollega utan behörighet och ägare på ett annat företag (två företag).

1. A registrerar CPP via guiden (osparade ändringar varnar), laddar upp underlag. Nästa steg är **Begär
   granskning**, inte Dela. Dubbelklick ger en begäran. Mätvärden registreras.
2. Granskaren begär komplettering. A får en notis i appen och ett mejl (fångat).
3. A svarar i text, bundet till versionen.
4. En granskningsvy som öppnats före svaret nekas (`SP_REVIEW_STALE`). Efter omladdning läser granskaren
   svaret och godkänner.
5. A ser en aktuell status och historiken, och blir sökbar med valda meriter. Standardläget är privat, och
   mobilbredd fungerar utan sidledsrullning.
6. Ägaren kopplar kraven till katalogen: en internationell certifiering kan inte stå för en reglerad
   behörighet. En kollega utan behörighet och ett annat företag nekas, både i UI och via direkt API-anrop.
7. Rekryteraren ser två personer med förklaring per krav ("inte bland delade uppgifter – betyder inte att
   personen saknar det"). Ingen poäng visas, filtren är faktabaserade och ordningen redovisas. Den privata
   personen syns inte, räknas inte och går inte att nå via API.
8. A läser vem, vilken tjänst och vad ett ja innebär, och accepterar (dubbelklick ger ett svar). Ingen
   ansökan skapas förrän A själv söker; Passport-valet är hennes.
9. Rekryteraren fortsätter i den befintliga ansökningsvyn.
10. Återkallelse och paus slår igenom vid nästa läsning; den gamla referensen slutar fungera. Den daterade
    ögonblicksbilden visas separat som historik.
11. Avslag: innehavaren läser granskarens meddelande men aldrig den interna anteckningen, varken i UI eller
    API. En borttagen behörighet stoppar sökning och kontaktlistan direkt. Sidan fungerar på engelska vid
    1440 och 390 px, och synlighetsvalet kan nås och ändras med tangentbordet. 200 % zoom kontrolleras som
    halv bredd utan sidledsrullning.

Kör lokalt: `scripts/local-stack/up.sh --reseed`, därefter fixturen och sedan
`E2E_LOCAL_STACK=1 … bunx playwright test e2e/talent-discovery-local.spec.ts`.

### Fel som testet hittade och som är rättade

- Katalogsökningen i kravprofilen visade de första åtta träffarna i katalogordning, så "OV" gav inte
  Ordningsvaktsförordnande. Nu rangordnas exakt förkortning först, följt av prefix och sedan övriga träffar.
- Lokala gatewayen skickade CORS-huvudet två gånger och nekade `x-retry-count`, vilket gjorde att
  annonssidan inte gick att läsa i webbläsaren. Den nekade också serverns uppladdning av CV med servicerollen,
  som riktig Storage tillåter. Båda gäller bara testmiljön.

## Före och efter

Bilderna är tagna mot samma databas: "före" från `main`-appen, "efter" från den här grenen.

| Vy                        | Före                                                 | Efter                                               |
| ------------------------- | ---------------------------------------------------- | --------------------------------------------------- |
| Merit, egen uppgift       | ![](evidence/before-entry-self-declared-sv-1440.jpg) | ![](evidence/after-entry-self-declared-sv-1440.jpg) |
| Passport-översikt         | ![](evidence/before-passport-overview-sv-1440.jpg)   | ![](evidence/after-passport-overview-sv-1440.jpg)   |
| Granskarens ärende        | ![](evidence/before-review-case-sv-1440.jpg)         | ![](evidence/after-review-case-sv-1440.jpg)         |
| Kravprofil (arbetsgivare) | ![](evidence/before-job-requirements-sv-1440.jpg)    | ![](evidence/after-job-requirements-sv-1440.jpg)    |
| Mina ansökningar          | ![](evidence/before-my-applications-sv-1440.jpg)     | ![](evidence/after-my-applications-sv-1440.jpg)     |

Fler bilder från scenarierna (sv/en, 1440/390/720) finns i [evidence/](evidence/).

## Mätvärden

Endast händelsenamn och tid sparas (`product_metric_events`), med räkningar som bara administratörer kan
läsa. Inget dokumentinnehåll och inga personuppgifter. Från körningen:
[evidence/metrics.json](evidence/metrics.json). Händelserna är `passport_first_merit_saved`,
`passport_review_requested`, `talent_visibility_enabled`, `talent_contact_requested` och
`talent_contact_accepted`.

## Kvar och kända begränsningar

- Katalogen och HAYAT är orörda: inga nya certifieringar, inga utfärdarkällor aktiverade.
- Krav som inte finns i katalogen (t.ex. körkort) klarläggs i dialog och räknas aldrig som uppfyllda eller
  saknade.
- Riktig GoTrue/Storage i webbläsartestet körs i CI, inte i den lokala körningen (se substitut ovan).
