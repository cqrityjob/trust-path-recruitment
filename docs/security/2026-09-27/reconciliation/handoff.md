# Överlämning till Claude/CTO

## Exponerade API-scheman

Rätt projekts Data API Settings visar **public, graphql_public** exponerade;
extra search_path **public, extensions**; sw_private inte valt, automatisk
exponering av nya tabeller av. Public omfattas av tidigare RLS/ACL-granskning.
Systemmetadata: graphql_public har inga tabeller/vyer, bara invoker-funktionen
graphql som returnerar att pg_graphql inte är aktiverat. pg_graphql saknas bland
installerade extensions. Ingen ytterligare aktiv GraphQL-dataväg upptäcktes.
Inga produktionsdataprober utfördes. Search_path är inte API-exponering.

## Ignorerat Lovable-fynd — identifierat, inte avfärdat

Panelen visar **Public MCP server without authentication**, Warning, som enda
ignorerade fynd. Den rekommenderar OAuth. Fynd-ID/ignoreringsorsak framgick inte.
Detta är INTE en varning om scoring-vyn.

Manifest `.lovable/mcp/manifest.json` har auth.type=none. `/mcp` är stängd som
standard via CQRITYJOB_MCP_ENABLED; token är frivillig när den aktiveras.
`src/routes/[.mcp]/list-tools.ts` och `invoke-tool/$tool.ts` monterar däremot
separata genererade handlers utan samma synliga miljö-/tokengate.
`src/lib/mcp/index.ts` saknar OAuth och deklarerar fem verktyg för frågor,
dimensioner, yrken, professionsprofiler och matchning.

**Rekommendation före publik lansering:** stäng alla MCP-ingångar som standard
eller använd gemensam autentisering, inklusive hjälprouterna. Verifiera isolerat
att anonym list-tools/invoke-tool nekas. Befintlig mcp-exposure-check testar
bara /mcp/generatorn och bevisar inte dessa hjälprouters skydd.
Ingen live verktygsinvokering har gjorts; faktisk publik exponering är inte
verifierad. Detta kräver en app-PR, inte Supabase-deploy från bokförings-PR:n.

## Ofullständig skanning

Lovable visade misslyckad deep scan, två aktiva fynd (45 katalogtabeller och
läckta lösenord), ett ignorerat fynd, samt 28 beroendeproblem i 61 paket.
Försök att starta kostnadsfri quick scan gav ingen verifierbar slutstatus eftersom
browser-sessionen avbröts. Ingen lyckad ny skanning påstås; ingen autofix eller
betald skanning beställdes. Slutför scan och triagera beroendena före lansering.

## Konkret rekommenderat katalogbeslut

| Roll | Rekommenderad åtkomst |
| --- | --- |
| Utloggad | Publicerade titlar, beskrivningar, jurisdiktion och avsedda publika begränsningar |
| Vanlig inloggad | Godkända kataloger för tillåtna flöden; inte interna audit-ID, governance-noteringar eller generella utkast |
| Aktiv arbetsgivare/deltagare | Specifik behörig sluten test-/pilotversion med pilotmärkning, inte andra utkast |
| Behörig redaktör/granskare | Utkast, intern historik, noteringar och audit-ID enligt redaktörsroll |

Fältinventering: [catalogue-review.md](../catalogue-review.md), särskilt
graph_versions.created_by/notes, scp_bundle_versions.approved_by/published_by/
retired_reason, scp_interview_ai_config.updated_by och assessment_versions.notes/
retired_reason. Behåll avsedda publika redaktionella begränsningar. Rätta med
SQL-projektion/kolumnbehörighet/RPC och isolerade tenant-tester, inte frontendfilter.
Även barnkataloger måste följa rätt åtkomst. Alla 45 får inte blanket-avfärdas.

Dessa beslut och MCP/scan är frågor inför publik lansering, inte nytillkomna
migrationer/Edge Functions som integrationen skulle driftsätta nu.
Pro, lösenordsskydd och backup tas vidare av ägaren och CTO enligt instruktion.
Ingen kostnad eller planändring aktiveras. Kvarvarande Supabase-advisors finns i
production-apply/advisors.json och är inte blanket-godkända.
