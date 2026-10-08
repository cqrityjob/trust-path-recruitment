# Recruiter Intelligence v0.3 P0: schema först

Status: granskningsförslag, inte produktionsinstallerat. Main-bas vid start: `7fb66dcdaf22b7e0aec31b95c0cd4f220b0b873d`. Lovables synkade commit var samma. Schema och app levereras separat; ingen merge, publicering, AI-aktivering eller produktionsskrivning ingår.

## Ordning

1. Granska schema-PR: `20270306090000_recruiter_intelligence_interview_foundation.sql`, rollback och SQL-prov. Migrationen skapades med Supabase CLI och flyttades till nästa lediga kanoniska version efter `20270305090000`.
2. En separat auktoriserad release får installera schema via ordinarie integration. Kontrollera sedan hosted schema läsande: ledger, funktionskroppar, grants, constraints, trigger, nullable argument och rapportbyggare. Lagra verifieringsbevis och ändra `pending` till `applied` i separat granskad ändring. Ta samtidigt bort just denna migration ur `expectedPending`.
3. Granska och släpp app-PR först därefter. `schema-first-release:check` ska blockera den tills punkt 2 är uppfylld. Det är ett avsiktligt releasehinder, inte en anledning att ändra guarden.
4. Innehållsbeslut och kommersiell pilot är separata. En SHA-256-identitet godkänner inte befintligt draftinnehåll och validerar inte metoden.

## Vad schema tillför

- Manuella kontrollpunkter med ursprung, neutral fråga, explicit källa eller källreferens, ansvarig text, nästa handling, datum, idempotent skapande och versionskontrollerad granskning.
- Sparning av reflektion och protokollavvikelse med serverns `updated_at`, låsning i samma ordning som rapportfinalisering och tydligt konfliktfel. Tom text raderar den tidigare texten.
- Ärendespecifika behörigheter som bygger på befintliga write-/read-regler. Granskning förblir owner/admin. Ingen utökad tabellskrivrätt, medlemsrätt eller service-role-klient.
- Komplett innehållsmanifest för det kopplade rollpaketet och TRUST-metoden, inklusive svenska och engelska texter. Läsning är en aktuell observation. Framtida rapporter fryser manifest och kontrollmetadata i sin vanliga payload. Befintliga rapporter skrivs inte om.

## Återställning

Återställ appen till föregående fungerande commit först. Den additiva migrationen kan normalt lämnas installerad med föregående app. Vid särskilt beslutad schemaåterställning: ta en backup, kör rollbackens kontrollfrågor och bevara nya kontrollpunkter/processanteckningar/rapporter. Rollback återställer den äldre rapportbyggaren och tar bort de nya RPC:erna, men behåller kontrollpunkter, tillagda kolumner, revisionstrigger, audit-events, sparade processanteckningar och rapportmanifest. Radera inte användarunderlag. Senare återaktivering kräver en ny granskad forward-migration. Kör schema- och rapportprov igen efter återställning. Rollback aktiverar inga workers, meddelanden eller AI-funktioner.

## Bevis före produktionsrelease

Den slutliga verifieringsrapporten ligger under `docs/assessment/recruiter-intelligence/`. Lokala prov är inte bevis för installerat hosted schema. Varken `hosted-ledger.json`, genererade `types.ts`, innehållsgodkännanden, gamla hashvärden eller befintliga rapportpayloads ska uppdateras som genväg.
