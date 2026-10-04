# PR #428 – releaseförberedelser

Slutcommit och CI-länkar finns i PR-beskrivningen. Ingen merge eller appdriftsättning ingår.

## F09: genomförd produktionsmigration

Ägaren godkände endast `20270215090000_application_passport_verified_content_guard.sql` från
`d09da624359e9fddf181e86594b81da88e323549`. Aktuell PR-head var samma commit och filen var byteidentisk
före applicering. Produktionsprojektet kontrollerades: **CQrityjob Production**, `wrygicdfxwjnrugduxnt`,
eu-central-1, ACTIVE_HEALTHY. Ingen generell `db push` kördes.

Supabase-anslutningen applicerade exakt filens SQL en gång som **20261004164027 / application_passport_verified_content_guard**.
Read-only efterkontroll 2026-10-04 16:40:53 UTC:

- Sparad SQL SHA256 `0b492098ae86ff8ee19c97efe88de76058deb53ce67bda4dfffc337889d93f82` är identisk med granskningsfilen.
- Funktionskropp MD5 `7bf734a466cd0e99bcf657939b8822db`; triggerretur, SECURITY DEFINER,
  ägare postgres, låst `public, pg_temp`. Endast postgres har EXECUTE; PUBLIC, anon, authenticated och service_role saknar det.
- Exakt en aktiverad `sp_application_verified_content` på `sp_disclosures`, rätt BEFORE INSERT/UPDATE-kolumner och funktion.
- De två tidigare triggerdefinitionerna är bevarade. Historiken har 374 rader, digest
  `3bfd11b0037b10a31029b89cd8bc5179`; föregående 373 identiteter är oförändrade.
- Fingeravtrycken för samtliga **42 delningar, 47 meriter och 4 erfarenhetsperioder** är oförändrade.
  Inga kandidatdata, testansökningar eller testmeriter skrevs i produktion.

[Maskinläsbar före-/efterevidens](evidence/2026-10-04-application-passport-guard/verification.json),
[granskad filidentitet](evidence/2026-10-04-application-passport-guard/reviewed-file.json) och
[read-only återverifiering](evidence/2026-10-04-application-passport-guard/verify.sql).

### Återställning

Den granskade rollbacken är `supabase/rollback/20270215090000_application_passport_verified_content_guard_rollback.sql`.
Den tar bort endast de två nya objekten, som verifierades saknas före appliceringen. Samma faktiska rollbackfil
körs nu av ordinarie databasjobb via `sp_application_passport_guard_rollback_test.sql`: kontrollera korrekt aktiv
bindning → ta bort rätt trigger/funktion → ROLLBACK → verifiera återställd bindning. Båda lokala körvägar passerar;
en avstängd trigger får förkontrollen att falla och testtransaktionen återställs. Ingen rollback kördes i produktion.

CLI:s read-only backup-listning nekades med **HTTP 403**. Tillgänglig full backup/PITR är därför inte verifierad.
Återställningsmöjligheten för just denna additiva, datafria migration är den lokalt verifierade schemarollbacken.

### Historik och releasekontroller

`release-parity:check --release` passerar: inga unapplied/unverified schemaändringar återstår.
Den faktiska hosted-versionen är bokförd i `hostedLedgerOverrides`, inte som Lovable-applicering.
Den kanoniska identiteten `20270215090000` saknas i hosted-ledger. **Deploy-plan spärrar därför release**:
filnamnsjämförelsen skulle välja redan applicerad SQL igen. Kontrollen får inte stängas av eller klassificera SQL som pending.
Separat, uttryckligt godkännande krävs för den förberedda historikjusteringen; den ingick inte i den enda godkända SQL-filen.
Kör aldrig F09-filen en andra gång.

## Övrig hosted-kontroll – endast läsning

Anonyma HTTP-anrop med projektets publika klientnyckel och utan användarsession gav **200 för samtliga nio frågor**
från yrkesdetaljvyn, inklusive de nya erfarenhets-, kompetens- och arbetsmiljörelationerna.
Väktare, Ordningsvakt och Personskyddsvakt gav tre yrken, tolv kompetensrelationer och sex arbetsmiljörelationer;
de icke-tomma relationernas underobjekt gick att läsa. Noll erfarenhets-/certifieringsrelationer för just dessa yrken
är innehållstillstånd, inte ett nekande åtkomstsvar. [Exakta frågor/resultat](evidence/2026-10-04-application-passport-guard/catalogue-anonymous.json).

Inventeringen hittade **7 ansökningsdelningar, varav 4 utan aktuellt verifierat innehåll** enligt F09:s paket-/fokusregel:
3 utgångna och 1 ännu giltig, alla `employer_review`. De lämnades orörda. Detta är en nulägesinventering;
innehållet kan ha ändrats efter ursprunglig delning, så inventeringen bevisar inte orsaken till varje tom delning.
[Aggregerad evidens utan personidentiteter](evidence/2026-10-04-application-passport-guard/empty-application-disclosures.json).

Paketgranskningen hittade inget faktiskt fel: `ApplicationPassportShare` använder redan `employer_review` och 30 dagar,
precis som ansökningsvägen. Ingen paketväljare har införts. Övriga servervägar begränsar paket och fokus;
`selected_merits` finns i en delad TypeScript-enum men nekas av ansöknings-RPC och har ingen sådan UI-anropare.

## Kvarstående manuella kontroller och senare arbete

- **Medarbetarrapporter:** appflödet och dess serverfunktioner visar inte workforce/okända rapporter;
  blandad historik får inte lämna ut dem via kandidatprogress eller rekommendationer. Kandidat- och
  arbetsgivarflöden bevaras. **Direkt RPC/RLS-åtkomst kvarstår som lanseringsblocker** och kräver en separat
  godkänd databasändring. Detta ligger utanför den enda tillåtna F09-migrationen.
  [Avgränsning och regression](../cqrityjob-user-flows/participant-report-availability.md).
- **Mejl mobil → dator:** befintlig lokal GoTrue/Mailpit kör `AUTOCONFIRM=true`, så ett riktigt obligatoriskt
  bekräftelseflöde kunde inte verifieras där. Den delade miljön ändrades inte. Dokumentet ovan innehåller ett
  kort reproducerbart recept med separat testmiljö och två browsercontext; faktisk enhets-/mejlverifiering återstår.
- **F02 delvis verifierad:** två separata Google-testkonton och isolerad OAuth-miljö finns inte förberedda.
  Ingen extern kontoregistrering eller OAuth-konfiguration ändrades. I isolerad miljö: skapa resultat anonymt;
  prova appkonto A/Googlekonto B, kontrollera aktiv identitet, välj uttryckligen **Spara resultatet på det här kontot**;
  bevisa att endast avsett konto kan läsa resultatet. Upprepa med kontobyte i annan flik före sparande.
  Kontovalsdialog ensam bevisar inte ägarskap.
- **Passport efter publicering:** välj uppgifter, öppna/stäng preview, kopiera färsk länk och läs QR i utloggad
  browser, ladda om, återkalla och kontrollera nekad läsning. Den godkända riktiga lokala integrationen bevaras.
  Rapportens historiska 404-orsak är fortfarande okänd; den påstås inte vara rättad.
- Personskyddsvaktens längre yrkesbeskrivning saknas i hosted-katalogen och är senare redaktionellt arbete.
- Befintlig lintskuld är senare arbete. Tidigare hela kontrollen gav 797 fel/114 varningar mot main 800/114.
  Grön CI med befintlig lint-tolerans är inte ett godkänt fullständigt lintresultat.

Klar för merge och fullständigt verifierad för lansering är separata bedömningar. Ingen lanseringsklarhet ska påstås
innan ovanstående manuella verifiering samt eventuella uttryckliga blockerare är avklarade.
