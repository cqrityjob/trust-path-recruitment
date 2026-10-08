# RI v0.3 — granskbar Auth-fixture-wrapper

Status: verktyget är förberett för granskning. Ingen hosted-körning ingår i denna leverans. Bas: `22ee86fed66f4f94ae51e39e8ed6a1fa8819130c` från release-docs. Releaseansvarig genomför befintliga releasekontroller innan en eventuell separat, godkänd hosted-körning.

## Avgränsat kontrakt

`scripts/auth-fixtures/hosted.mjs` accepterar enbart projektet `wrygicdfxwjnrugduxnt` och exakt `https://wrygicdfxwjnrugduxnt.supabase.co`. Alternativt protokoll, värdnamn, port, credentials i URL, sökväg, query, fragment och avslutande `/` avslås. Hosted-verktyget har inget lokalt läge.

Verktyget anropar officiella `auth.admin.getUserById` och `auth.admin.createUser({id, email, password, email_confirm:true, ...})`. Det tilldelar inga plattformsroller, medlemskap, uppdrag, kandidatdelningar eller kravbeslut. Det gör inga explicita app-/schemaändringar, SQL-anrop, RPC-anrop, Storage-anrop, inbjudningar, signup eller e-postanrop. Befintliga databastriggers på nya Auth-användare kan skapa plattformens ordinarie profilrad; den bieffekten är inte en egen fixture för rekryteringsdata. Supabase anger att dessa adminmetoder ska köras på servern och att servernyckeln ska hållas privat. `email_confirm:true` bekräftar adressen administrativt. [createUser](https://supabase.com/docs/reference/javascript/auth-admin-createuser), [getUserById](https://supabase.com/docs/reference/javascript/auth-admin-getuserbyid).

Varje körning genererar ett nytt slumpat namespace `ri-auth-YYYYMMDD-<24 hextecken>`. Adresserna har formen `<alias>@<namespace>.invalid`. Åtta aktörer skapas normalt. `plan --with-100-candidates` planerar åtta aktörer plus exakt hundra kandidater `P001`–`P100` för ett separat P1-fixturebeslut. Kandidatkontona blir inte ansökningar; releaseansvarig kopplar dem senare till samma isolerade syntetiska rekrytering genom separat beslutad fixture. Ingen anonym aktör behöver ett Auth-konto.

| Alias | Avsedd senare testroll — tilldelas inte av wrappern    |
| ----- | ------------------------------------------------------ |
| O1    | Ägare i syntetisk arbetsgivare E1                      |
| A1    | Administratör i E1                                     |
| R1    | Tilldelad granskare med uttryckliga ärendebehörigheter |
| M1    | Vanlig medlem i E1 utan granskarbehörighet             |
| C1    | Syntetisk kandidat 1                                   |
| C2    | Annan syntetisk kandidat                               |
| X2    | Aktör i separat syntetisk arbetsgivare E2              |
| V1    | Passport-verifierare enligt separat fixture            |

De avsedda rollerna kommer från [driftprovets aktörsmatris](2026-10-07-p0-operational-test-plan.md). Alias i `app_metadata.ri_auth_fixture` är spårningsetiketter, inte behörighetsanspråk. Wrappern skickar inget eget JWT-`role` och ändrar inget befintligt konto. En UUID-kollision stoppas före den första skrivningen; en e-postkollision eller annat oklart skapa-resultat stoppar körningen. UUID-läsningar är begränsade till de 8 eller 108 förplanerade identiteterna. Ingen global användarlista eller namnmatchning används.

## Privata filer och förberedelse

Använd Node med projektets redan installerade `@supabase/supabase-js` från låsfilen. Lagra aldrig servernyckel, lösenord, privata tillståndsfiler eller sessions-JWT i Git, chatt, skärmbilder eller kommandoradsargument. Skapa en ny körningskatalog utanför varje Git-repository; wrappern skapar den med `0700`. Alla filer i den är `0600`, ägs av den körande användaren och får inte vara symboliska länkar eller hårdlänkar.

Credentialfilen skapas av ägaren i en privat katalog, med mode `0600`. Dess JSON-format är:

```json
{
  "projectRef": "wrygicdfxwjnrugduxnt",
  "url": "https://wrygicdfxwjnrugduxnt.supabase.co",
  "serviceRoleKey": "<server credential stored privately, never pasted in chat>"
}
```

En aktuell `sb_secret_`-nyckel eller en legacy `service_role`-JWT godtas. Legacy-JWT:s roll och projektref kontrolleras lokalt som en extra spärr; servern verifierar signaturen och privilegierna. En `anon`-nyckel godtas inte. Servernycklar kan kringgå RLS och måste hållas utanför webbläsaren. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys).

Förbered först planen utan credentialfil och utan nätverksanrop:

```bash
node scripts/auth-fixtures/hosted.mjs plan --directory /private/tmp/ri-auth-hosted-review-new
node scripts/auth-fixtures/hosted.mjs dry-run --directory /private/tmp/ri-auth-hosted-review-new
```

Använd en annan ny katalog om planen ska omfatta hundra kandidater:

```bash
node scripts/auth-fixtures/hosted.mjs plan --directory /private/tmp/ri-auth-hosted-p1-review-new --with-100-candidates
```

`plan.json` innehåller de valda syntetiska adresserna, alias och förplanerade UUID:er för granskning. `private-state.json` innehåller unika slumpade lösenord, samma UUID:er, operationernas intent-ID och status; den filen får inte delas. `manifest.json` innehåller enbart run-ID, namespace, target, alias, opaka UUID:er, intent-ID, status och tider. Manifestet innehåller inga adresser eller hemligheter. Standardutdata visar bara run-ID, namespace, antal och utfall.

När releaseansvarig har granskat planen, tillståndet och releasekontrollerna finns ett uttryckligt skapa-kommando. Det visas här för granskning och körs inte som del av dokumentationen:

```bash
node scripts/auth-fixtures/hosted.mjs create --directory /private/tmp/ri-auth-hosted-review-new --credentials-file /private/tmp/ri-private-server-credentials.json --execute
```

Wrappern läser credentialfilen endast i `create`. Target kontrolleras före klientkonstruktion. Adaptern tillåter bara GET av planerade Auth-UUID:er och POST till `/auth/v1/admin/users` på exakt target; redirect avslås och varje request har 30 sekunders timeout. Plan/dry-run importerar ingen nätverksklient. Enhettester ersätter global `fetch` med ett stopp och gör noll externa anrop.

## Journal, återläsning och stopp

Ett exklusivt lokalt lås förhindrar två samtidiga körningar av samma plan. Innan varje POST sparas `intent_pending`, UUID, intent-ID och lösenord i `private-state.json` med atomisk rename och fsync av fil och katalog. Den privata journalen är överordnad det härledda manifestet.

Ett lyckat svar måste innehålla samma UUID, adress, bekräftad e-post, vanlig `authenticated`-roll och spårningsetikett, utan invite- eller confirmation-sent-tid. En separat `getUserById` måste sedan bekräfta samma fakta innan status blir `created`. Körningen avslutas som `completed_auth_only` först efter alla återläsningar. Ett nytt anrop med en redan fullbordad plan återläser befintliga UUID:er och skapar inget ytterligare konto.

Ett nätverksfel, timeout, API-fel, saknat användarsvar eller misslyckad återläsning efter skapa-försök sparar `unknown_outcome` och stoppar direkt. Ett kvarvarande `intent_pending`, en kollision, ett felaktigt återläst konto eller ett kvarvarande lås stoppar också. Verktyget gör ingen automatisk retry, byter inget UUID och skapar ingen ersättare. Återstart efter `unknown_outcome` är blockerad före klientkonstruktion. Releaseansvarig måste först utreda just den förplanerade identiteten och eventuella Auth-/profiltriggerbieffekter. En sådan manuell återställning eller radering ingår inte i wrappern. Befintliga lösenord ändras aldrig.

Felutdata är fasta stoppkoder. SDK-felsvar, stack traces, adresser, lösenord, nycklar och JWT skrivs inte ut. Behåll privat journal och manifest som underlag för eventuell manuell utredning. Läs aldrig upp eller kopiera `private-state.json` till rapporten.

## Alternativ via administratörsgränssnitt

Om den godkända servercredentialfilen inte är tillgänglig kan releaseansvarig använda Supabase Dashboard → Authentication → Users → **Create user** för de åtta adresserna i `plan.json`, ett konto i taget, med **Auto Confirm User** aktiverat. Använd privat sparade slumpade lösenord; använd inte **Invite user** och klistra inte lösenorden i chatt. Registrera de faktiskt returnerade UUID:erna i ett separat opakt fixturemanifest för efterföljande rollfixture. Dashboard kan ge andra UUID:er än wrapperns förplanerade identiteter. Kör därför inte wrapperns `create` på den planen efter en Dashboard-körning; den är en separat manuellt verifierad väg. Rolltilldelning, kollisionsavgränsning och driftprov ligger fortfarande hos releaseansvarig.

## Isolerat lokalt kontraktstest

`scripts/auth-fixtures/local-contract.mjs` är en separat, snävt låst testväg: enbart `http://127.0.0.1:55690`, projekt `cqj-ri-real-20261008b`, exakt ägd stack och dess befintliga skyddade `ri-local-status.json`. Den kan inte läsa en hosted-credentialfil, ta emot en alternativ URL eller skapa hundra kandidater. Den skapar alltid åtta nya konton i ett färskt namespace. Detta är ett riktigt lokalt GoTrue-prov; det bevisar inte hosted Auth-konfiguration, hosted triggers, SMTP, Storage eller publicerad runtime.

Kör enbart efter samordning med ägaren av den lokala stackens befintliga bevis:

```bash
node scripts/auth-fixtures/local-contract.mjs --directory /private/tmp/ri-auth-local-contract-new --execute-local-eight
```

Det tidigare primära lokalprovet omfattade 8 Auth-konton, 12 lyckade resor och 12 fastställda rapporter. Åtta nya konton hör till detta separata Auth-kontraktstest; inga gamla konton, medlemskap, intervjuer, jobb eller ansökningar ska återställas eller uppdateras. Tid och namespace gör skillnaden möjlig att kontrollera. Lokalt utfall och körningstid redovisas separat efter utfört prov.

## Kontroller som ska kunna upprepas

```bash
bun test scripts/auth-fixtures.test.ts
node --check scripts/auth-fixtures/core.mjs
node --check scripts/auth-fixtures/admin-adapter.mjs
node --check scripts/auth-fixtures/hosted.mjs
node --check scripts/auth-fixtures/local-contract.mjs
node node_modules/eslint/bin/eslint.js scripts/auth-fixtures.test.ts scripts/auth-fixtures/*.mjs
```

Meningsfulla enhetstester täcker targetavvikelser, noll externa anrop, privat filåtkomst, anon-/felprojektcredential, exakt 8/108 aktörer, unik namespace/lösenord, journal före POST, samtidighetslås, UUID-kollision, tvetydigt utfall, bekräftelse/återläsning, stopp vid återstart och ett manifest utan hemligheter. Hosted-körning, verkliga rollbehörigheter, inloggning, meddelande-/SMTP-räkning och rekryteringsflödet är separata driftprov. Supabase-changelog och primärdokumentation kontrollerades 2026-10-08; ingen ändring av klientbiblioteket eller produktkonfigurationen gjordes. [Supabase changelog](https://supabase.com/changelog).

## Utfört i denna leverans

| Kontroll                        | Resultat och begränsning                                                                                                                                                                                                                                    |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Isolerade enhetstester          | 12 PASS, 146 assertions; global nätverksfunktion spärrad, 0 externa anrop.                                                                                                                                                                                  |
| Node syntax och riktad ESLint   | Fyra `.mjs`-filer syntaxkontrollerade; script och testfil passerar repositoryts riktade ESLint.                                                                                                                                                             |
| Hosted plan + dry-run           | PASS, 8 planerade aktörer, `planned_no_requests`/`dry_run_no_requests`; **0 hosted-Auth-anrop**. Privat adressplan `/private/tmp/ri-auth-hosted-review-20261008-a/plan.json`.                                                                               |
| Faktiskt lokalt GoTrue-kontrakt | PASS, 8 nya konton och 8 separata UUID-återläsningar. Körning 2026-10-08T07:44:24.184Z–07:44:26.243Z. Namespace `ri-auth-20261008-7c0552082a53f74ccc399d4d`, run-ID `a3392419-6462-428e-a5cb-4b0d57a54d82`.                                                 |
| Lokal kontostatus               | Samma förplanerade UUID/adress/marker, bekräftad e-post, vanlig `authenticated`-roll, ingen invite-/confirmation-sent-tid. Resultat `completed_auth_only`. Ingen explicit app-/schema-DML, ingen befintlig fixture uppdaterad.                              |
| Lokal bevisfil                  | Opakt manifest mode0600 i `/private/tmp/ri-auth-local-contract-20261008-a/manifest.json`; journal med lösenord mode0600 bredvid, utanför Git. Tidigare primary12/8Auth-filer lämnades orörda.                                                               |
| Ej utfört här                   | Hosted create, inloggning, roll-/appfixture, faktisk SMTP-/meddelanderäkning, Storage, publicerad runtime och fysisk mobil. Tidigare 8 Auth + de nya 8 ger förväntat totalt 16 lokala konton; totalen lästes inte genom en global användarlista i wrappern. |
