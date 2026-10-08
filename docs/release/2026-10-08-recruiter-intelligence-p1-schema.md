# Recruiter Intelligence v0.3: versionsbundna krav och uttrycklig granskning

Schemaförslag 0.3-P1-schema-r1, 2026-10-08. Denna leverans är separat från appkonsumtionen och följer #450:s permanenta innehållssnapshot. Ingen produktionsinstallation redovisas som genomförd i detta dokument innan ett särskilt hostedbevis finns.

Arbetsgivaren bekräftar en oföränderlig kravprofil med samma annonskrav-ID, beslutade skallkrav/meriter, instruktioner, frågekoppling, accepterade källslag och eventuell giltighet vid startdatum. Nytt beslut ger en ny profilversion. Tom profil eller profil utan skallkrav ger aldrig grönt. Profiler är ett arbetsgivarbeslut; innehållsgodkännande av PEACE-guider är ett annat beslut.

Kravstatus räknas på originalunderlag som profilen uttryckligen accepterar. Grönt kräver uppfyllda samtliga skallkrav. Gult innebär minst ett uttryckligen ej uppfyllt skallkrav. Övriga informationsluckor är gråa. Meriter kompenserar inte. AI-förslag är inget accepterat källslag och deltar inte i motorn. Rekryteringssteg, teknisk analysstatus och uttrycklig mänsklig granskning hålls separat. En öppnad ansökan blir inte granskad.

Källversioner binder ansökningssvar, inskickat strukturerat CV eller det verkliga Storageobjektet, respektive behörigt aktivt intervjuunderlag. Ändrad profil, ersatt/återkallat underlag eller ändrat svar uppdaterar aktuella statusar och gör tidigare granskning inaktuell. Fastställda intervjurapporter skrivs inte om. Passportdelning går genom sitt tidigare behörighetskontrakt och importeras inte som fritt intervjuunderlag.

Lista, räknare, globala filter, sortering och pagination räknas över samma serverpopulation i en SQL-statement. Totalt mottagna innefattar även arkiverade ansökningar; andra räknare och respektive länk följer sin uttryckliga population. Test-/intervjuaktiviteter är överlappande indikatorer och summeras inte till unika ansökningar. Nästa handling och ansvarig krävs vid bekräftad granskning med kvarstående informationslucka. Separata CAS-token skyddar källbindning, kravgranskningsrevision och ansvarig tilldelning; idempotensnycklar är aktörs-/scope-/requestbundna.

Endast uttryckligen valt material överförs till samma ansöknings PEACE-ärende genom den befintliga källregistreringen. Åtta kärnfrågor och sex kompetensområden bevaras. Ett sådant underlag blir aldrig automatiskt bekräftad evidens. Nyckelbundna återförsök och samma källinnehåll återanvänds utan dubbelregistrering.

Release: obligatorisk CI på exakt slutcommit, normal merge efter #450, officiell Supabase GitHub-integration på canonical `wrygicdfxwjnrugduxnt`, läsande verifiering av ledger/body/ACL/constraints, registrering av applied-bevis, därefter app-PR och separat verifierad publicering. Genererade typer ändras inte; appen använder den handskrivna nullable RPC-overlayn. Ingen AI-kostnadsaktivering, verkligt utskick eller retention-worker/cron.

Återställ i första hand till senaste kompatibla app och behåll additivt schema, profiler, revisionslogg och rapporthistorik. Schema-rollback vägrar när profiler eller granskningar används; korrigera framåt med en ny granskad migration. Testsetup/teardown får endast beröra ägargodkänt syntetiskt namespace och får inte radera verkliga rekryteringar.

Versionsbundna källor: `supabase/migrations/20270308090000_recruiter_intelligence_requirements.sql`, motsvarande rollback, `supabase/tests/recruiter_intelligence_p1_test.sql`, `scripts/recruiter-intelligence-p1-api-check.mjs` och det tidigare100-ansökningsfacit i #449. Lokala PostgREST-prov är riktiga databas-/HTTP-prov men ersätter inte riktig GoTrue, Storage, publicerad runtime, innehållsgodkännande eller en fysisk telefon.
