# CQrityjob: säkerhetsgranskning 2026-09-27

**För granskning, inte produktionssatt.** Ingen merge, deployment, produktionsskrivning,
kontoändring eller abonnemangsändring har utförts. Produktionskontrollerna läste
enbart systemkataloger och Supabases projekt-/advisor-metadata. Inga personrader,
lösenord, tokenvärden eller produktionsloggar hämtades.

## Identitet och omfattning

- Repository: `cqrityjob/trust-path-recruitment`.
- Bas: `origin/main` vid `353f634`, inklusive #301 (`861e9d8`), #302 (`ee5bd66`),
  #303 (`7502f43`) och Lovables senare designcommits. Alla tre mergecommits är
  verifierade förfäder. Ingen befintlig migration eller applikationsfil ändras.
- Branch: `codex/security-rls-audit`.
- Supabase Management API verifierade `wrygicdfxwjnrugduxnt`,
  **CQrityjob Production**, `eu-central-1`, PostgreSQL `17.6.1.166`.
  Repositoryts `supabase/config.toml` och backend-target-lock anger samma projekt.
- Lovable-kopplingen identifierade projekt `9ec625ef-34a1-4b4b-8cbb-712cae168579`
  (Security Talent Hub). Dess verktyg exponerar inte säkerhetsfynd/skanningsstatus;
  webbläsaren visade att projektåtkomst kräver inloggning. Ingen Lovable-agent
  instruerades att ändra eller skanna koden.
- Snapshoten omfattar **349 public-relationer**, storage-relationernas metadata,
  **573 policyer**, **41 kolumn-ACL:er**, standardbehörigheter, vyer och
  fingeravtryck/klientåtkomst för **510 SECURITY DEFINER-funktioner**.
  Produktionsdefinitionerna för 371 triggers lästes också, bland annat skyddet
  som hindrar att `cd_shared_reports.snapshot_id` byts till en annan ägares rapport.

Se [maskinläsbar metadata](production-metadata.json) och
[upprepningsbara, skrivskyddade SQL-frågor](production-readonly.sql).
Snapshotens `anon_write`/`auth_write` betyder **någon** av INSERT/UPDATE/DELETE/TRUNCATE;
det är inte ett påstående att RLS tillåter någon specifik radändring.

## Konstaterade brister och rättning

### Överflödiga administrativa tabellbehörigheter

**146 public-tabeller** ger `TRUNCATE` till `anon` och/eller `authenticated`.
RLS begränsar inte TRUNCATE. Klientroller har även överflödiga REFERENCES/TRIGGER
och på PG17 MAINTAIN. Dessa är separata från de 45 öppna läspolicyerna.

Faktisk SQL-åtkomst reproducerades med produktions-ACL:erna och syntetiska data:
båda rollerna kunde köra `TRUNCATE public.assessment_responses` före rättningen.
Efter rättningen får båda `insufficient_privilege`.

**Exploaterbarhetens gräns:** rollerna är NOLOGIN och saknar BYPASSRLS/CREATE.
PostgREST exponerar inte TRUNCATE direkt. Ingen publikt nåbar godtycklig SQL- eller
TRUNCATE-RPC identifierades i de hämtade public-funktionerna. Därför är detta en
styrkt SQL-behörighetsbrist, inte bevis för att en utloggad HTTP-klient har kunnat
radera produktionsdata eller att personuppgifter har läckt. Fyndet rapporterades
under arbetet; rekommenderad begränsning är den granskade REVOKE-migrationen.

[`20261218090000_client_table_privilege_hardening.sql`](../../../supabase/migrations/20261218090000_client_table_privilege_hardening.sql)
återkallar TRUNCATE/REFERENCES/TRIGGER och PG17 MAINTAIN från PUBLIC/anon/authenticated
på public-relationer samt postgres-ägarens framtida tabeller. Ett avslutande
effektivt behörighetstest fångar även kvarvarande ärvda rättigheter.
Alla SELECT/INSERT/UPDATE/DELETE-grants, RLS-policyer, kolumngrants och serverflöden
bevaras. Inga data ändras. Filen skapades med `supabase migration new` och placerades
efter repositoryts befintliga migrationsfront `20261217`, så senare gamla migrationer
inte kan återinföra behörigheterna vid ren replay.

Supabase-förvaltade schemaägare, exempelvis `supabase_admin`/storage, ändras inte.
Deras plattformsstandarder finns i snapshoten. Migrationen säkrar de befintliga
public-relationerna och framtida applikationstabeller som skapas av `postgres`.
En ny tabell skapad av en annan ägare kräver uttrycklig grant-granskning.

### Läckta lösenord

Supabases advisor rapporterar `auth_leaked_password_protection` disabled.
Organisationen `iknwgwyfxodanyefjmch` har `free`/`tier_free`. Exakt förberedd ändring:

```http
PATCH https://api.supabase.com/v1/projects/wrygicdfxwjnrugduxnt/config/auth
Content-Type: application/json

{"password_hibp_enabled":true}
```

Payloaden finns i [auth-config.patch.json](auth-config.patch.json). Den har **inte**
skickats. Alternativt aktiveras Leaked password protection i projektets Auth settings.
Ändra inte andra auth-fält genom att skriva tillbaka ett komplett konfigurationsobjekt.

[Skyddet kräver Pro eller högre](https://supabase.com/docs/guides/auth/password-security).
[Aktuell Pro-basavgift är 25 USD/månad](https://supabase.com/pricing), inklusive
10 USD compute-kredit som täcker en Micro-instans. Ett projekt syns i denna
organisation. **Förväntad minsta ökning är 25 USD/månad**, före eventuell skatt,
större compute och förbrukning utöver kvoter; faktisk faktura måste godkännas i
dashboarden. Lovables Pro-plan innebär inte att Supabase-organisationen har Pro.
Ingen ny betald testbranch skapades.

Efter godkännande: uppgradera planen, applicera enbart payloaden och verifiera
`password_hibp_enabled=true` med GET på samma endpoint samt advisor. Testa ett
känt läckt respektive nytt starkt lösenord för registrering/lösenordsbyte i en
isolerad miljö med motsvarande Auth-konfiguration. Denna externa HIBP-kontroll
har inte kunnat bevisas i vår lokala PostgreSQL/PostgREST-miljö. Befintliga
användare spärras inte automatiskt av inställningen enligt Supabases dokumentation.
[API-fältets dokumentation](https://supabase.com/docs/reference/api/v1-update-auth-service-config).

## De 45 öppna läspolicyerna

Metadata identifierar **exakt 45 tabeller** med `USING (true)` för klientläsning:
3 tillåter anon och authenticated; 42 endast authenticated. Därutöver finns
`assessment_run_reports` med `ALL ... true` enbart för service_role. Den senare
policyn ger inte klientroller generell tillgång.

Detta reproducerar panelens antal, men utan Lovables fynd-ID:n går det inte att
intyga att dess tabellista är identisk. **Samtliga 45 i databasen granskades**:
kolumner, fullständiga policyer, effektiva grants och faktiska SQL-försök.
Det finns ingen sådan klientpolicy på kandidatprofiler, ansökningar, personliga
rapporter, CV-dokument eller organisationsärenden. Alla public-bastabeller har RLS.

Den avsedda breda läsningen är katalog-/metod-/versionsinformation enligt de
versionshanterade definitionerna. Rapporten nedan dokumenterar därför falsklarm
**för påståendet att just dessa SELECT-policyer ger fri åtkomst till privata
ärenderader eller fri skrivning**. Den frikänner inte de administrativa grantsen.
Vissa metadatafält innehåller författar-/publicerar-UUID:n eller fria metodnoteringar;
dessa namnges i inventeringen och är inte kandidatärenden. Produktionsinnehållet i
fria textfält har avsiktligt inte lästs. Katalogfält får inte användas för privata
personuppgifter. Läspolicyerna begränsar inte alla kataloger till publicerade versioner;
det är befintligt beteende, inte en ny garanti om att utkast är hemliga.

Se [tabellvis granskning](catalogue-review.md). Regressionstestet kräver minst en
syntetisk rad i var och en av de 45 tabellerna, läser som anon, vanlig kandidat och
ägare i två olika organisationer samt försöker INSERT/UPDATE/DELETE. Avsedd läsning
lyckas och obehöriga ändringar nekas/ändrar noll rader. Ingen policy skrivs om till
ett uttryck som bara döljer varningen.

## Övriga fynd, ignorerat fynd och skanning

Supabases advisor kunde slutföras och gav sex grupper: RLS enabled/no policy (18),
security definer view (1), extension in public (1), anon-executable definer (4),
authenticated-executable definer (336), leaked-password protection (1).
Det är inte samma skanner som Lovables AI-granskning och bevisar inte att Lovables
misslyckade skanning har återställts.

- `scp_scoring_version_lineage` är en **styrkt avsedd definer-projektion**:
  nio uttryckliga metadatafält (`id`, `slug`, `version_number`, `content_status`,
  `validation_status`, `published_at`, `retired_at`, `core_summary_is_indicative`,
  `norm_comparison_permitted`), security_barrier, ingen anon-SELECT och inga
  vikter/nycklar/hashar. Base-tabellen är fortsatt begränsad. Domäntestens LOW-4
  bevisar läsbar lineage och nekade beräkningsvikter för kandidat/arbetsgivare.
  Att blint sätta security_invoker=true skulle bryta rapporternas lineage.
  [Remediation och bakgrund](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view).
- RLS utan policy ger ingen klientradåtkomst; flera tabeller är avsiktligt RPC-only.
  De fyra anon-funktionerna är public share med token, två begränsade feedback/funnel-
  skrivare och en kontroll av arbetsgivarstatus. Serverfunktioner behöver egna
  åtkomstkontroller; metadata, befintliga negativa tester och granskade hjälpfunktioner
  användes, inte ett antagande att SECURITY DEFINER alltid är säkert.
- **Det ignorerade Lovable-fyndet är fortfarande oidentifierat.** Det kan inte
  likställas med definer-vyn utan dess ID/text/motivering. Dessa detaljer efterfrågades.
  Ingen ignore ändrades och inget oidentifierat fynd avskrevs.
- **Lovables skanningsfel är öppet.** Exakt feltext, senaste skanningstid och
  ignorerat fynd behöver hämtas av en inloggad projektägare och skanningen köras om.
- Exponerade Data API-scheman kunde inte avläsas ur `pgrst.db_schemas` (ingen lagrad
  inställning där). Granskningen omfattar public samt storage-policyer och de privata
  hjälpschemans behörigheter. Bekräfta även Data API-listan i dashboarden före release.

## Separata kvarstående kontroller

### OPEN-API: exponerade Data API-scheman

Den effektiva listan kunde inte hämtas. Avsaknad av `pgrst.db_schemas` är inte
bevis för att bara public exponeras. Läs projektets Data API-inställningar i
dashboarden, dokumentera den exakta listan, och inventera grants/RLS/vyer/RPC:er
för varje ytterligare schema. Reproducera åtkomst i isolerad miljö. Denna punkt
kan inte stängas av att public-testsviten passerar.

### OPEN-IGNORED: det ignorerade Lovable-fyndet

Fynd-ID, full text, berörda objekt och ignoreringens motivering saknas fortfarande.
En inloggad projektägare behöver exportera dessa detaljer. Bedöm fyndet mot
metadata och lägg till isolerat reproduktionstest vid behov. Det är inte
identifierat som scoring-lineage-vyn och är inte avskrivet.

### OPEN-SCAN: Lovables ofullständiga skanning

Exakt fel och senaste skanningstid behöver hämtas och skanningen köras om.
Supabases slutförda advisor ersätter inte denna kontroll.

Katalogernas aktörs-ID, fria noteringar och opublicerade versioner behöver också
ett uttryckligt åtkomstbeslut; se [fältinventeringen](catalogue-review.md#aktörs-id-fria-noteringar-och-opublicerat-innehåll).
[Kontrollen före branchpush](integration-review.md) dokumenterar integrationernas
observerade kopplingar och kontrollens begränsningar.

## Testbevis

[Sammanfattad råutdata](test-results.txt). [Kommandon för upprepning](reproduce.md).

1. **320 migrationer**, full regression med exit 0 på lokal PostgreSQL 17.11.
   Den nya katalog-/behörighetssviten är inkopplad i ordinarie `scripts/db-test.sh`/CI.
   Slutversionen av den nya sviten passerar även PostgreSQL 16.14.
2. **573/573 policyer** identiska mellan produktion och replay; **510/510 definer-
   kroppar** identiska efter borttagning av tomrader/hela kommentarsrader (502 är
   byte-identiska). **41/41 kolumn-ACL:er** matchar. Inga produktionsrader kopierades.
3. Produktions-ACL:erna återställdes i en lokal kopia. Före/efter-TRUNCATE, oförändrade
   DML-grants, alla 45 kataloger samt negativa kontroller passerar. Därefter passerar
   privat rapport-/feedbackskydd, intervju-isolation mellan organisationer,
   metodkatalogers organisationstillgång, internationell certifiering, privat
   verifieringsnotering och kandidatens plats/preferenser med denna baslinje.
4. **209 HTTP-assertioner** genom verklig PostgREST 16.2 + PostgreSQL 17.11:
   45 kataloger × fyra identiteter; utloggad/annan kandidat/annan organisation får
   inte läsa eller ändra privat plats eller personal; ägaren kan läsa/skriva;
   spoofad ägare och insättning i annan organisation nekas; katalogskrivning nekas.
   JWT-signering och auth-helper är lokala testdelar; detta är inte GoTrue-,
   e-post-, HIBP- eller webbläsarflödestestning.
5. `migrations:check`, `migrations-duplicate:check`, `sql-security:check`,
   `backend-target-lock:check` och `schema-first-release:check` passerar.

## Före publicering

1. Granska och godkänn PR/migration. Ingen applikationsrelease behövs för SQL-rättningen.
2. Hämta Lovables ignorerade fynd och skanningsfel; avsluta utredningen och kör om
   Lovables skanning. Godkänn endast de dokumenterade, avsiktliga läsundantagen.
3. Bekräfta Data API:s exponerade scheman. Kör metadatafrågorna på nytt, jämför med
   snapshoten och kontrollera att ingen ny drift gör migrationsunderlaget inaktuellt.
4. Efter uttryckligt produktionsgodkännande: kör den enda nya migrationen atomiskt
   på rätt projekt och verifiera noll effektiva administrativa client-grants på public,
   oförändrade DML-/kolumngrants och RLS. Kör advisor igen. Det räcker inte att en
   policyvarning försvinner. Produktionskontrollen ska fortsätta vara metadata-only.
5. Separat kostnads-/konfigurationsgodkännande för Pro och lösenordsskyddet enligt ovan.
   Genomför isolerat Auth-test och kontrollera därefter den sparade produktionsinställningen.

Rollback ska normalt inte återinföra administrativa klienträttigheter. Vid ett
belagt regressionsbehov: använd före-snapshotens specifika grants för den berörda
relationen efter nytt godkännande; använd aldrig generell `GRANT ALL`.


Uppföljning 2026-09-27: historiska statusuppgifter ovan ersätts av [verifierad migrationsavstämning](reconciliation/README.md). Säkerhetsfixen är applicerad och historikalias korrigerad.
