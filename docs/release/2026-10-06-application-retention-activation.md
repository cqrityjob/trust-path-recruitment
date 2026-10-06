# Ansökningslivscykel: separat schema, applikation och aktivering

Status: utveckling på separat branch från `origin/main` (`0aeca50`). Ingen befintlig
produktionsuppgift har raderats och ingen produktionsmigration eller serverarbetare har aktiverats.
Lovables befintliga rekryterings- och ansökningslayout behålls; en gemensam livscykelsektion läggs till.

## Kartläggning och återanvändning

| Befintligt | Hantering |
|---|---|
| `rec_complete_recruitment` | Återanvänds för verkligt avslut och `completed_at`. Alla kandidater måste vara avgjorda; annonsen får inte ta emot ansökningar. |
| `rec_reopen_recruitment` | Fortsatt separat åtgärd för ägare/admin. Återställning av arkivering anropar aldrig den. |
| Annonsarkivering (`jobs.status`, `jobs.archived_at`) | Behålls. Stänger/arkiverar annonsen; raderar inget ansökningsmaterial och startar ingen gallringsklocka. |
| `sweep_application_retention` | Oschemalagd äldre funktion med 12 månader från `updated_at`; spärras i den nya migrationen. Ska aldrig aktiveras. |
| `storage_erasure_queue` | Återanvänds med jobbkoppling. Rekryteringsarbetaren verifierar faktisk borttagning; kontoraderingssvepet hanterar endast sina egna köposter. |
| RLS, `rec_is_member`, `rec_can_manage`, `ConfirmAction`, språkfiler | Återanvänds. Organisation och ansvarig hämtas från berört ärende på servern. |

Ansökningsarkivering kräver `hired`, `rejected` eller `withdrawn`. Rekryteringsarkivering kräver
`completed` eller `cancelled`. Återställning tar bara bort arkivfältet. Permanent radering kräver en
verkligt avslutad rekrytering med känt avslutsdatum och utan aktiva kandidater, även vid radering av en
enskild ansökan. Ägare/admin eller rekryteringsansvarig får arkivera/radera; lagringstid kräver ägare/admin.

## Material och gränser

| Material | Vad som raderas / bevaras |
|---|---|
| Ansökan | Raden med kontaktuppgifter, följebrev, arbetsgivarens anteckningar, CV-snapshot samt svar, läsmetadata, status-/internhistorik och kommentarer. |
| Uppladdat CV | Exakt objekt i `job-application-cvs`, endast om ingen annan ansökan refererar samma sökväg. Delade filer behålls. Lås och skrivskydd hindrar en ny ansökan från att ta över en redan köad filsökväg. Inga prefix- eller bucket-tömningar. |
| Bilagor | Nuvarande ansökningsmodell har bara CV-upload och CV-snapshot, ingen separat bilage-, meddelandefils- eller rapportfilmodell. Nya okartlagda databasberoenden stoppar jobbet; en ny filmodell måste anslutas till manifest och Storage-kö innan den kan gallras. |
| Meddelanden | Ansökningsbundna meddelanden, kvittenser och arbetsgivarnotiser i databasen. Redan skickad e-post hos mottagaren kan inte återkallas och följer brevlådans rutin. |
| Intervju | Bokningar samt ansökningsbundna Interview Intelligence-fall, källor, passager, AI-underlag, sessioner, anteckningar, evidens, rättelser, paneler och rapporter. |
| Testtilldelningar | Rekryteringens `assessment_assignments`, ansökningsinbjudningar, `scp_attempts`, svar, bedömningar, granskningspoäng, rapportbeslut, snapshots, beräkningsmanifest och SENTINEL-sessioner. |
| BESKT | Ansökningsbundna uppdrag, svar, informationskvittenser, kopplingar, genomföranden, panelunderlag och rapporter. Självständiga inbjudningar som inte är knutna till ansökan berörs inte. |
| Skyddat | `auth.users`, kandidatprofil, Security Passport-identitet/meriter/bevis, `cv_documents`, egna `assessment_runs`/rapporter, Career Discovery-sessioner, ämnesidentiteter, anställda, andra ansökningar/organisationer och innehållsversioner. Ansökningsspecifik Passport-delning och dess åtkomstmaterial går bort, aldrig själva Passport-meriten. |

Beroendemanifestet går bara **nedåt** genom en explicit lista av granskade tabeller. Ett delat
intervjufall eller ett test som används av en annan ansökan/organisation/utvecklingstilldelning stoppar
raderingen för hantering och redovisas som ett misslyckat jobb, utan partiell databasradering. Det ska
utredas vilka relationer som legitimt kan frigöras; skyddade eller okända beroenden får aldrig tas bort
runt sina skydd. Delade CV-filer kan däremot hanteras direkt: ansökan raderas och filen behålls med den
andra ansökan. Slutförd status får inte sättas för ett blockerat jobb.

## Datum och faktisk slutföring

Standard är 24 kalendermånader; arbetsgivaren kan välja sex. Valet gäller också redan avslutade
rekryteringar. Datum beräknas i UTC från `recruitment_settings.completed_at`, aldrig `updated_at`,
annonsens arkivdatum eller kandidatens senaste aktivitet. `>=`-gränsen är inkluderande. Stängd annons
utan verkligt avslut har inget gallringsdatum; portalen flaggar det. Ingen historisk backfill ingår.
Integritetspolicyns tabell genereras från `src/lib/legal/retention-plan.ts`; mekanismen förblir `pending`
tills separat aktiverad och genomförd rutin verifierats och loggats.

Raderingsbekräftelsen visar serverberäknat antal ansökningar, materialposter, filer som går bort och
delade filer som behålls. Servern kontrollerar omfattningens fingeravtryck igen. Upprepade bekräftelser
återanvänder samma väntande jobb. Arbetaren använder tidsbegränsad claim, återförsök och transaktionell
kö för filer. Databasfel återställer databasraderingen. Filfel lämnar en synlig skuld; `completed_at`
sätts först när raderna är borttagna och alla berörda filer är verifierat borta. Svar från en tom
Storage-remove räcker inte: bucket och Storage-katalog kontrolleras. Förlorad kvittens kan försöka igen.

## Leveransordning – separerad från Lovable-publicering

1. **Schema-PR**: granska/tillämpa `20270305090000_application_retention_lifecycle.sql` först i en
   separat testmiljö. Den innehåller ingen körning av gallring, inga gissade datum och ingen cron.
   Den förbereder arkivfält, lagringstid, jobb, privata exakta radbehörigheter och RPC:er. Cirkulära
   rapport-/inbjudningsnycklar använder `NO ACTION DEFERRABLE` så båda ändarna kan raderas atomiskt;
   normala integritetsregler och oföränderliga rapporter gäller fortfarande.
2. Kör hela migrationsreplayen, livscykelsviten och befintliga regressioner. Använd endast syntetiska data.
   CI tar därefter ned funktionen med en strikt testdatabas- och tomköspärr, för att bevara de äldre återställningstesterna i deras ursprungliga schematillstånd. Detta är inte driftrollback.
   Produktionsschema är ett separat ägarbeslut, inte en effekt av vanlig Lovable-publicering.
3. Efter separat godkänt schema: verifiera installerade kolumner, funktionernas hash och ACL/RLS på
   rätt backend enligt `supabase/deployment-targets.json`. Bekräfta att
   `recruitment_erasure.activation.enabled=false`. Dokumentera bevis och ändra först då
   `supabase/release-state.json` från `pending` till `applied`.
4. **Applikations-PR**: slå ihop först när schema-first-spärren är grön. Den tillför portalen, språk,
   integritetstext, isolerade filarbetare och browsertester. Den återanvänder Lovables testlayout.
5. Driftsätt Edge Function `recruitment-retention` separat i godkänd testmiljö, med `verify_jwt=false`
   och ett unikt serverhemligt `RECRUITMENT_RETENTION_TOKEN` på minst 32 tecken. Arbetaren använder
   Supabase-miljöns service key; den skickas aldrig till klienten. Lämna
   `RECRUITMENT_RETENTION_WORKER_ENABLED=false` tills syntetisk end-to-end-körning godkänts.
6. Testa med **riktiga syntetiska Storage-objekt** i testprojektet: fil finns, redan frånvarande fil,
   delad fil, tvingat API-fel, återförsök efter borttagen fil men förlorad kvittens. Lokal worker-suite
   använder injicerad Storage; den ersätter inte detta test av Supabases verkliga Storage API.
7. Kör `supabase/retention/application-material.dry-run.sql` skrivskyddat mot avsedd miljö. Granska
   omfattning, arbetsgivarnas instruktioner, saknade avslutsdatum, blockerade delade beroenden och
   potentiellt förfallna sexmånadersärenden. Ingen produktionstorrkörning/aktivering utförs i utvecklingen.
8. **Separat produktionsaktivering efter ägarbeslut**: deploya verifierad worker, sätt serverhemlighet,
   aktivera arbetaren och lägg till den namngivna cron-körningen nedan. Först efter godkänt
   gallringsunderlag sätts `recruitment_erasure.activation.enabled=true` av databasadministratören.
   Manuellt bekräftade raderingsjobb kan köras när arbetaren är på även om automatisk gallring är av.
9. Verifiera första tillåtna körningen: fysiska rader borta, exklusiva filer borta, delade filer kvar,
   andra organisationer/konto/Passport/egna tester oförändrade, fel redovisade. Skriv datum, projekt,
   instruktion, antal, kvarvarande skuld och bevis i `docs/legal/retention-execution-log.md`.
   Markera lagringsplanens mekanism `live` först efter verifierad och loggad körning.

## Scheduler och övervakning

Supabase Cron + `pg_net` anropar Edge Function utan någon inloggad användare. Följ
[Supabases schemaläggning](https://supabase.com/docs/guides/functions/schedule-functions) och
[Storage-radering](https://supabase.com/docs/guides/storage/management/delete-objects).
Installera extensionerna separat om de saknas. Lagra projektets URL och worker-token i Vault som
`recruitment_retention_url` och `recruitment_retention_token`. Nedan är en **aktiveringsmall**, inte en
migration och inte körd av denna leverans:

```sql
select cron.schedule('recruitment-material-retention', '*/15 * * * *', $$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='recruitment_retention_url')
         || '/functions/v1/recruitment-retention',
  headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' ||
   (select decrypted_secret from vault.decrypted_secrets where name='recruitment_retention_token')),
  body := '{}'::jsonb, timeout_milliseconds := 120000
 );
$$);
-- Först efter separat aktiveringsbeslut:
update recruitment_erasure.activation set enabled=true where singleton;
```

Kontrollera `cron.job_run_details`, `net`-svaren (även `ok:false` i JSON vid filfel), Edge-loggar samt
jobb/kö från torrkörningsfilen. Ägaren hanterar växande skuld, upprepade fel och missade körningar.
Portalen visar jobbstatus och kvarvarande filantal; behörig ansvarig kan begära nytt försök. Inga
kandidatnamn, mejladresser, CV-texter eller filsökvägar finns i arbetarsvarets räknare.

## Återställning av drift

Sätt worker-miljön `RECRUITMENT_RETENTION_WORKER_ENABLED=false` och kör
`select cron.unschedule('recruitment-material-retention');`. Därefter använd
`supabase/rollback/20270305090000_application_retention_lifecycle_rollback.sql` för att stänga av
automatisk köläggning. Återställ appen separat. Behåll schema, skuld och kopplingar tills alla köade
filer hanterats. Återaktivera aldrig den gamla sweeprutinen. Permanent raderat material kan inte
återskapas genom arkivåterställning eller kodrollback. Säkerhetskopior, redan skickad e-post och
leverantörsloggar följer sina egna dokumenterade rutiner, inte portalens raderingsknapp.

## Verifieringsbevis

- Lokal PostgreSQL 16: migrationsreplay och 43 obligatoriska livscykelassertioner på syntetiska data,
  inklusive två organisationer, ägare/medlem/kandidat, aktivt ärende, delad CV-fil, verkliga
  testtilldelningar, egna testdata/Passport, intervju-/testrapporter och cirkulärt rapportmanifest.
  Två sessionsrace verifierar väntan/blockering av en anteckning under raderingsbekräftelsens commit
  samt väntan/bevarande när en annan organisations ansökan samtidigt tar över samma CV-fil.
- Worker: sex testfall med injicerad Storage och databas, filfel, saknad bucket, kvarvarande objekt,
  förlorad kvittens och återförsök. Tester ansluter aldrig till produktionsprojektet.
- Browser: verklig livscykelkomponent, klienthook, router och CSS med syntetisk serverfunktionsseam;
  åtta kombinationer (ansökan/rekrytering × sv/en × 375/1440 px), arkivering/återställning, oförändrat
  gallringsdatum, raderingsdialogens omfattning, delade filer, inställning och synligt fel.
  Bilder: `artifacts/application-retention/`. Detta är komponentbevis, inte ett hostat inloggat portaltest.
- CI kör migrationshistorik/RLS-sviten samt worker- och browserkontroller. Applikations-PR:s
  schema-first-gate ska avsiktligt blockera sammanslagning så länge schema är `pending`.
