# Rekryteringstest: nya innehållsversioner utan automatisk tillgänglighet

Det befintliga SCP-innehållet har versionslåsta tilldelningar och en innehållsroll, men ingen sammanhängande administrationsåtgärd för nya sammansättningar. Pilotbeteckningen ligger på definitionen: att bara kopiera en ny utkastversion skulle göra även den tillgänglig. Denna schemaändring förhindrar det.

`scp_author_assessment_draft` kräver befintlig `scp_can_author` och skapar en ny utkastversion atomärt, med utvalda befintliga frågeversioner och deras avsnitt. Den kan också skapa en ny testdefinition. Versionsnummer serialiseras genom lås på källdefinitionen. Ursprungliga frågor, poängnycklar, tilldelningar och resultat ändras inte. En ny definition ärver aldrig standardbeteckningen. Ingen publicering, validering, rättighetsändring eller innehållsrelease sker.

`authoring_release_required` är false för befintliga versioner och true för nyskapade utkast. Biblioteket visar dessa som otillåtna och en databastrigger nekar direkt tilldelning. En innehållsförfattare kan inte rensa spärren via REST. Öppnande kräver en separat, granskad innehållsrelease efter befintliga godkännanderegler. Detta skydd ändrar inte de två redan öppna pilotversionernas tillgänglighet.

Verifierat på separat lokal Postgres/Auth-stack: 14 transaktionella assertioner för rollavslag, främmande frågor, utkaststatus, avsnitt, versionslåsning, biblioteksregel, direkt RPC och tenantgräns. Migration → rollback → återapplicering → samma 14 assertioner passerade. Rollback vägrar om författade versioner finns; data får då hanteras med en framåtriktad rättning. Testet ingår i `scripts/db-test.sh`.

Produktionsstatus: **pending**. Ingen produktion har skrivits till. Granskning, merge, migration och efterföljande läsverifiering är separata beslut. Den beroende administrationskoden får enligt `scripts/schema-first-release-check.ts` inte bli mergeklar förrän tillämpat schema dokumenterats. Den fristående utskicksrättningen behöver inte denna migration.
