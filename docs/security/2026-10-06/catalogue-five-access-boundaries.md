# Fem kataloggränser efter Lovable-granskningen

Status: förslag, lokalt verifierat, inte applicerat. Ingen merge, publicering eller avfärdning är godkänd.

Ägarens beslut 2026-10-06: publicerat innehåll får läsas av avsedda användare; utkast,
interna aktörs-ID och interna anteckningar begränsas till behöriga författare/administratörer.
De 34 tidigare accepterade fynden lämnas oförändrade. Ingen data eller migrationshistorik skrivs om.

## Grund och bevis

Bas: main `a35131496bc0acfeeb70872a18717265982ef40d` (#435). Den tidigare granskningen
verifierade samma synkade SHA via Lovables projekt-API. UI sade Published / Your website is up to date,
men exakt publicerad commit är inte verifierad. Grundscannen sade Last scan 18 minutes ago och
From a basic scan of an earlier project version. Exakt scan-tid och scanens egen databasreferens
exponerades inte; den djupa scannen misslyckades. Projektets kod pekade på produktion
`wrygicdfxwjnrugduxnt` och de 39 fyndnamnen matchade den inventeringen.

Produktionsledgern: 377 poster, senaste `20270217090000`, MD5 av version:name/newline
`8dcb3bba55a422ab257ecc722b016f95`. Detta är en bevarad tidigare read-only kontroll, inte
bevis för att den nya migrationen har applicerats. `hosted-ledger.json` ändras inte.

- [Samtliga 39 beslut och nivåer](39-findings.md).
- [Tidigare produktionsmetadata och aggregerade antal](evidence/production-baseline.json).
- [Lokalt testresultat](evidence/local-gate.txt).
- Befintliga [författartester](evidence/assessment_draft_authoring.txt) och
  [leverans-/svarsskydd](evidence/scp_delivery_answer_key.txt), körda med den nya migrationen.
- Tidigare grund: `docs/security/2026-09-27/catalogue-review.md`, #355:s verifiering,
  intervju-expand #404 och konfiguration-contract #406. 45 → 41 → 40 → 39 avser
  ovillkorliga SELECT-policyer. Scannerfynd behöver inte generellt motsvara policyantal.
- #396/#429:s rapportgränser och #410–#412:s katalogrelease godkänner inte dessa fem fält.

## Rättning och läsare

| Tabell                   | Vanlig läsning efter rättning                                                                         | Full intern läsning                                           |
| ------------------------ | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| graph_versions           | graph_versions_published: publicerade versioner utan notes/created_by; även anon                      | Plattformsadministratörer; befintlig graph-adminregel bevarad |
| scp_bundle_versions      | scp_bundle_versions_published: published, utan approved_by/published_by/retired_reason; authenticated | SCP-författare och plattformsadministratörer                  |
| scp_role_weight_profiles | scp_role_weight_profiles_published: published, utan notes; authenticated                              | SCP-författare och plattformsadministratörer                  |
| scp_forms                | Samma tabell; endast publicerad föräldraversion                                                       | SCP-författare och plattformsadministratörer                  |
| scp_form_blocks          | Samma tabell; endast publicerad föräldraversion                                                       | SCP-författare och plattformsadministratörer                  |

Grafens historiskt publicerade versioner behålls i projektionen även när is_active=false.
Is_active anger aktuell version, inte sekretess. För SCP betyder publicerad content_status=published.

Ingen aktuell src/- eller Edge Function-läsare läser de första tre bastabellerna.
De nya projektionerna är därför schema-first och används inte av kod innan godkänd applicering.
`previewRecruitmentContent` har redan assertAuthor och behåller sin bastabellsläsning.
`getLearningFormForModule` läser en publicerad testfixtur. Den publiceras av den befintliga
20260809100000-migrationen; inget verkligt utkast aktiveras av denna rättning.

Vyerna kör avsiktligt med tabellägarens rättigheter och security_barrier: invoker-vyer skulle
inte kunna läsa de numera interna bastabellerna. Varje vy har uttrycklig publiceringskontroll,
fast kolumnlista och enbart SELECT-grants för avsedda klientroller. Detta kan ge nya generella
security_definer_view-varningar; de ska bedömas mot just dessa projektioner, inte slentrianmässigt ignoreras.
Den tidigare accepterade scoring-lineage-vyn ändras inte.

## Uttryckligt begränsat biblioteksundantag, beslutat 2026-10-06

Ägaren har beslutat att behålla tidigare beteende i `scp_employer_content_library`:
behöriga arbetsgivare får se generiska blockantal och tidsramar för kommande opublicerade
tester. Detta är ett uttryckligt, begränsat undantag från regeln om utkastmetadata.
RPC:n lämnas oförändrad. Aktivt organisationsmedlemskap, organisationsavgränsning och
separat fixturbehörighet bevaras. Undantaget ger ingen ny rätt att starta eller tilldela utkast.

Undantaget omfattar aldrig frågor, blockinstruktioner, svar/facit, interna anteckningar
eller personliga aktörs-ID. RPC:ns fasta returkontrakt innehåller inga sådana fält.
`item_id`/`parent_id` är katalogobjekt-ID och `owner_employer_id` är organisations-ID,
inte användar-ID. Returnerade sammanfattningar är befintliga katalogändamål, inte blockinstruktioner.

Ytterligare befintlig generisk metadata redovisades före någon utökning: frågeantal,
kompetensnamn och krav på mänsklig granskning. Dessa finns redan i katalogens returkontrakt;
ingen utökning eller ny behörighet införs i denna PR. Separata historiska closed-test-grants
är en egen befintlig styrningsväg, inte en rättighet som biblioteksundantaget tillför.

Riktad verifiering återanvänder författarfixturen: AD15 jämför utkastets blockantal/tidsramar
med administratörens faktiska modell; AD16 låser hela tillåtna katalogfältlistan; AD17/AD18
nekar kandidat/anon. AD9/AD11 nekar författat utkast i både bibliotekets tilldelningsbesked
 och faktisk tilldelnings-RPC; AD10 bevarar tidigare tillåten version och AD12 nekar annan
organisation. Befintliga försök är fortsatt pinnade (AD8). Alla passerar under den nya slutpolicyn.

`scp_get_attempt_blocks` lämnar block för användarens eget försök, inte en öppen katalog;
leverans/assignability har separata publiceringskontroller. `scp_bundle_version_assignability`
returnerar enbart tilldelningsbesked och inga interna metadata. Dessa läsare är dokumenterade,
inte härmed ett generellt nytt godkännande av utkaståtkomst.

## Lokal verifiering och releaseordning

378 migrationer återspelade strikt i en disponibel PostgreSQL 16 på localhost.
139 åtkomst-/skrivkontroller med återanvända syntetiska kandidater, två organisationer,
legacy assessment_editor, innehållseditor, reviewer och plattformsadmin. Published/draft/in_review/
approved/retired-rader är faktiskt sådda; inga tomma tabeller används som negativt bevis.
11 negativa kontroller återöppnar var och en av de fem läsreglerna, tar bort vyernas publiceringsfilter
eller lägger tillbaka interna fält. Alla faller på sitt namngivna åtkomstpåstående.
Rollback återöppnar läckan och gör samma suite röd; reapply gör den grön.
Bevarandeprovet jämför policyer, RLS, tabell-/kolumngrants för exakt de 34 andra tabellerna och
radfingeravtryck för samtliga 39 före/efter. Alla är oförändrade.

CI kör denna fokuserade slutpolicykontroll direkt efter strikt replay. Äldre regressionstester
kör sedan uttryckligen med föregående katalogpolicy, liksom repoets befintliga historiska
participant-report-fas. Deras 39-policyinventering ändras inte eller försvagas.

1. Ägarens biblioteksbeslut ovan är dokumenterat; RPC:n bevaras oförändrad.
2. PR med grön CI på slut-SHA granskas; ingen automatisk merge.
3. Endast efter ägarens klartecken får migrationen appliceras via godkänd releaseväg.
4. Kör den [riktade read-only efterkontrollen](postflight.sql), kontrollera relevant vanlig läsare,
   författar-preview, publicerad leverans och uppdatera releasebevis/ledger separat.
5. Först efter godkänd produktionsverifiering kan dessa exakta fem fynd avfärdas:
   graph_versions, scp_bundle_versions, scp_role_weight_profiles, scp_forms, scp_form_blocks.

De 34 tidigare besluten gäller fortsatt. Fram till punkt 4 är de fem fortfarande inte verifierade
som rättade i produktion. Ingen full lanseringsbedömning görs här. Rollback öppnar gränserna igen
utan att ändra data och kräver uttryckligt ägarbeslut.
