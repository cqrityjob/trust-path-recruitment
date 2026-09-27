# Produktionsverifiering: säkerhetsmigrationen

Genomförd 2026-09-27 efter uttryckligt godkännande i denna uppgift. Endast
`20261218090000_client_table_privilege_hardening.sql` applicerades på
`wrygicdfxwjnrugduxnt` / **CQrityjob Production**, eu-central-1, PostgreSQL 17.6.1.166.
Ingen generell deploy, publicering, planändring eller annan migration kördes.

## Version och körning

- PR #304 verifierades mergad som `0b937ed4cde7a9c16cdb70365c3764139050e586`.
- Filen från denna commit är byte-identisk med den lokala testade filen.
- SHA-256: `480dcaf8b536efde69ce879de52f9c7a7ddb8161eadbd3390992a8c130b0fd4e`.
- Säkerhetsmigrationen saknades i hosted ledger och dess effekt saknades före körning.
- Supabases apply_migration applicerade exakt filinnehållet och returnerade success.
- Verktygets genererade ledger-version är **20260927124146**, namn
  **client_table_privilege_hardening**. Detta är samma SQL som repositoryts
  kanoniska fil med version **20261218090000**.
- Lästa ledger-statements har MD5 `4c989d7bbe67b351f1b80a986816fb72`, exakt samma
  som den mergade filens bytes. Ledger gick från 319 till 320 rader, en enda ny rad.
- `20261216090000_scp_security_manager_recruitment_content` och
  `20261217090000_scp_security_manager_recruitment_activation` **fanns redan i
  produktionsledgern före denna körning**. De kördes inte av mig här; deras rader
  och statement-hashar är oförändrade. Tidigare pending-underlag var därför inaktuellt.

## Backup och återställning före körning

Dashboardens Backups-sida för rätt projekt visade: **Free Plan does not include
project backups.** Någon full projektbackup eller PITR har alltså inte verifierats
eller skapats. Ingen uppgradering beställdes. Detta är en kvarstående generell
återställningsbegränsning, inte något som säkerhetsmigrationen åtgärdar.

Ändringen innehåller enbart REVOKE/ALTER DEFAULT PRIVILEGES och metadataassertioner,
med BEGIN/COMMIT; den ändrar inga verksamhetsrader. För det berörda tillståndet
sparades [before.json](before.json), inklusive exakta relation-/kolumngrants,
default ACL, RLS-policyer och funktionsfingeravtryck, innan applicering.
En omedelbar förkontroll vid 2026-09-27T12:41:32.46154+00:00 bekräftade samma tillstånd.

[restore-admin-acl.sql](restore-admin-acl.sql) genererades från denna snapshot:
1001 precisa GRANT/ALTER DEFAULT PRIVILEGES-satser, endast för de administrativa
rättigheter migrationen tar bort. Inget generellt GRANT ALL och ingen återställning
av användardata ingår. Filen är **beredskap, inte automatiskt godkänd återställning**:
använd endast vid belagd regression och nytt beslut, eftersom den återinför bristen.
Vid fel före COMMIT ska transaktionen rullas tillbaka; efter COMMIT föredras att
behålla fixen och rätta ett eventuellt fel med minsta specifika ändring.

[recovery-test.sql](recovery-test.sql) kördes med syntetisk migrationsreplay i
`cqrity_security_recovery_20260927`, PostgreSQL 17 på 127.0.0.1:57633. Testet:
installerar den sparade ACL-baslinjen, applicerar fixen, återställer ACL och jämför
exakta relations-/defaultgrants, samt applicerar fixen igen. **PASS**, se
[recovery-test.log](recovery-test.log). Testcontainern är därefter stoppad.
Detta verifierar ACL-återställning; det är inte ett fullständigt disaster-recovery-test.

## Läsande efterkontroller

[verify.sql](verify.sql) läser endast systemkataloger och migrationsmetadata.
Före: 2026-09-27T12:37:45.188053+00:00. Efter: 2026-09-27T12:42:03.14251+00:00.
[after.json](after.json) är sparad i samma format som före-snapshoten.

| Kontroll | Resultat |
| --- | --- |
| Effektiva TRUNCATE/REFERENCES/TRIGGER/MAINTAIN för anon/authenticated på public | 993 till 0 beviljade kombinationer |
| Public-relationer med klient-TRUNCATE | 155 till 0: 146 tabeller och 9 vyer. Tabellantalet är samma som tidigare granskning. |
| RLS-policyer public/storage | 573/573 oförändrade |
| Relationsidentitet, ägare, RLS/FORCE RLS och reloptions | 357/357 oförändrade |
| Kolumn-ACL | 41/41 oförändrade |
| SELECT/INSERT/UPDATE/DELETE för anon/authenticated/service_role | 4284/4284 oförändrade effektiva kontroller |
| Funktionsdefinitioner, ACL, SECURITY DEFINER och proconfig public/storage | 671/671 oförändrade |
| Direkta relations-ACL | Exakt avsedda administrativa klienträttigheter borttagna; inga andra ändringar |
| Default ACL | Exakt avsedda administrativa klienträttigheter borttagna för postgres/public/tabeller; alla övriga oförändrade |
| Befintlig migrationshistorik | Samtliga 319 tidigare rader och statement-hashar oförändrade |

Inga produktionsrader hämtades och inga åtkomst-/skrivprober kördes i produktion.
Bevis för användarflöden/tenant-isolation är de tidigare isolerade regressionerna
på samma SQL; produktionsbeviset här är metadatajämförelsen.

## Inställningar och kvarstående fynd

GitHub Integration-sidan på rätt projekt visade före och efter körning:
**Deploy to production = 0 (av)**, **Automatic branching = 0**, Save changes
inaktiverad. En omladdning efter migrationen bekräftade det sparade avstängda läget.
Inget reglage eller formulärvärde ändrades och ingen Save/Deploy/Upgrade klickades.

Supabases nya security-advisor slutfördes, se [advisors.json](advisors.json):
18 RLS-enabled/no-policy, 1 security-definer-vy, 1 extension-in-public,
4 anon-exekverbara och 336 authenticated-exekverbara definerfunktioner,
samt avstängt skydd mot läckta lösenord. De tidigare dokumenterade avsikterna
förklarar flera varningar; denna ACL-migration påstår inte att samtliga är lösta.
[Supabases lösenordsskydd](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
är fortfarande avstängt. Förberedd Auth-payload och eventuell Pro-kostnad kräver
separat beslut och har inte applicerats.

Fortfarande öppet: faktisk lista över exponerade Data API-scheman och eventuell
utökad granskning; Lovables ignorerade fynd (ID/text/motivering saknas); Lovables
ofullständiga skanning; innehålls-/åtkomstbeslut för katalogernas aktörs-ID, fria
noteringar och opublicerade versioner. Den nya backupkontrollen ovan behöver också
ingå i projektets fortsatta driftsplan.

**Migrationsbokföring före framtida generell deploy:** repositoryts release-state,
expectedPending och ledger/alias-underlag måste stämmas av med den nya
verktygsgenererade versionen och de två äldre, redan registrerade migrationerna.
Denna rapport dokumenterar kopplingen men ändrar inte historiska ledger-rader,
main eller produktionsintegration. Kör inte en generell deploy för att korrigera
bokföringen. Rapportfilerna är lokalt granskningsunderlag; ingen ny Git-push ingår.



Uppföljning 2026-09-27: historiska statusuppgifter ovan ersätts av [verifierad migrationsavstämning](../reconciliation/README.md). Säkerhetsfixen är applicerad och historikalias korrigerad.
