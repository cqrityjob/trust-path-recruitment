# Prov genom den faktiskt publicerade appen

**Status: förberett, inte genomfört.** Inga verkliga AI-anrop, publicerade uppladdningar eller kontospecifika driftkontroller har utförts här. Isolerad CI, en mergad PR eller en synlig meny ersätter inte detta prov. Kör först efter separata dokumenterade beslut för processordrift, syntetisk AI-kvalitetsutvärdering och appprovet enligt [driftunderlaget](pilot-operations-decision.md).

## Identifiera vad som provas

Kopiera detta protokoll till en privat testjournal. Operatören fyller i följande innan första uppladdningen. Sätt `okänt` där uppgift saknas och stoppa versionacceptansen tills kopplingen är utredd.

| Identitet                                                                           | Värde före start                                                           |
| ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Godkänd publik app-URL, UTC-start och UTC-slut                                      | Ej fastställt                                                              |
| Appens publicerade Git-SHA och deployment-id, styrkt av deployplattform             | Ej fastställt; en asset-hash ensam bevisar inte Git-SHA                    |
| Hämtad HTML/JS asset-identitet och SHA256, cache/hård omladdning                    | Ej avläst för detta prov                                                   |
| Serverdeployment och miljö                                                          | Ej fastställt; frontendversion ensam räcker inte                           |
| Processorimage med registry-digest, region, parser/runtime-version och healthstatus | Inte driftsatt av detta arbete                                             |
| Supabase-projekt och migreringsfrontier                                             | Kontrollera `wrygicdfxwjnrugduxnt` och aktuell frontier vid testtid        |
| Synliga merge- och CI-bevis för exakt driftsatt kod                                 | Ej fastställt; #293 och UX-uppföljningen ska hanteras genom normal release |
| SV-/EN-arbetsyte-id, eget användarkonto och roll                                    | Ej skapade för detta prov                                                  |
| AI-aktiveringarnas id/modell/versioner/giltighet/budget samt beslutsreferenser      | Inte provisionerade                                                        |
| Operatör, ersättare, Mostafa som granskare och privat felkanal                      | Operatör/ersättare/kanal behöver namnges                                   |
| Provfiler och SHA256                                                                | `pilot-fixtures/manifest.json`; verifiera på den revision som används      |

Spara inga tokens, sessionscookies, hemlighetsvärden eller autentiserade nätverksspår i protokollet. Samla endast nödvändiga syntetiska skärmbilder och säkra jobb-/rapportidentiteter privat. Även syntetiska miljöer har riktiga inloggningsuppgifter.

## Färdiga underlag och förväntad osäkerhet

Använd `pilot-fixtures/tilltrade.pdf` (dokument A) och `pilot-fixtures/reservvag.docx` (dokument B). Båda är läsbara, helt påhittade underlag; manifestet anger filhashar. PDF:en beskriver en blockerad norra tillträdesväg och ett avgränsat beslut. DOCX:en beskriver en föreslagen men overifierad reservväg. Svenska tecken och `&` ska överleva extraktionen.

Ingen kontrollansvarig, inget återöppningsdatum, ingen verifierad reservväg och inga kalibrerade risknivåer är givna. En användbar analys ska synliggöra detta. AI får föreslå verifiering med ansvarig att utse; den får inte hitta på en utförd kontroll, namnge en person eller klassificera risken som låg. Detta separata appfall är inte en ersättning för de sex fasta kvalitetsfallen.

## Genomför från webbläsaren

Kör nedanstående resa i två separata syntetiska arbetsytor: först SV på dator, sedan EN på 375 px mobilvy eller kundens avsedda mobil. Dokumenten är desamma; förväntat rapportspråk styrs av arbetsytans språk. Alla steg går genom den godkända publika URL:en med vanlig inloggning. Inga seedade AI-resultat, mockade nätverkssvar, manuella databasinsättningar av analysresultat eller lokala serviceanrop räknas.

1. Skapa RSA-analysen. Ange beslut, receptionens tillträdesvägar och den fiktiva perioden 25–30 september 2026. Lämna riskkalibreringen odefinierad för detta prov. Kontrollera att nästa steg framgår.
2. Ladda upp PDF och DOCX. Kontrollera verklig text, dokumentnamn och sid-/avsnittsreferens. Acceptera först efter mänsklig läsning. Omladdning ska bevara text och granskningsanteckningar. En konfigurationsvarning är ett stopp, inte en godkänd uppladdning.
3. Öppna **3. Komplettera**. Begär första verkliga AI-utkastet utan att först skriva en egen bedömning eller rapport. Anteckna jobb-id, start/sluttid och leverantörsutfall. Granska om frågorna gäller verkliga kvarstående kunskapsluckor och om ett källbelagt rapportförslag finns. Spara råsvaret privat för granskning.
4. Öppna minst två stödjande utdrag och jämför citat med respektive original. Kontrollera fakta, antaganden, frågor, risker, åtgärder och rapporttext. Godkänn uttryckligen införandet i redigerbart utkast. Förväntat: frågor och rapporttext finns utan att du skriver om dem; inget är slutgodkänt.
5. Besvara en relevant kompletteringsfråga med den syntetiska tilläggsuppgiften: ”Ingen verifierad kontroll finns tillgänglig. Ansvarig och datum är fortfarande okända.” Spara. Begär ett andra AI-utkast och granska om svaret används utan att frågan upprepas som obesvarad eller osäkerheten försvinner. Detta är andra och sista planerade genereringen för arbetsytan. Om AI inte ställer en användbar fråga dokumenteras kvalitetsfelet; operatören får inte försköna resultatet med extra anrop.
6. För in det granskade förslaget. Redigera en slutsats och en åtgärd i produkten. Ange en fiktiv testansvarig manuellt och markera uppgiften som användartillförd, aldrig som dokumentfakta. Odefinierade risknivåer ska fortfarande vara okända. Kontrollera att användarens tidigare professionella slutsats inte skrivs över av AI.
7. Spara och ladda om. Logga ut och in igen med samma konto. Kontrollera båda dokumenten, granskningsstatus, frågor/svar, källhänvisningar, egna ändringar och AI:s ursprungliga frågemotivering.
8. Öppna det AI-fyllda rapportutkastet under **5. Rapport**, redigera, förhandsgranska och godkänn en bestämd version som utsedd granskare. Rapportens innehåll och källor ska stämma; AI får aldrig godkänna åt dig.
9. Exportera HTML, öppna exporten och skriv ut till PDF. Kontrollera alla sidor, citat, osäkerhet, status, version och godkännandedatum mot appen.
10. Följ upp åtgärden med en tydligt syntetisk motivering och bevisnotering. Kontrollera aktuell åtgärdsstatus och att den redan godkända rapporten fortfarande återger sin ursprungliga version.
11. Prova AI avstängt/återkallat efter att operatören avslutat provet. Nya genereringar ska nekas; sparat arbete ska kunna läsas. Dokumentera utfallet och stäm av faktisk kostnad. Skapa ingen tredje generering för att testa budgeten; verifiera spärren utan extern dispatch.

För varje steg noteras `godkänt / fel / ej provat`, tidpunkt, privat bevisreferens och avvikelse. Ett ej provat steg får aldrig summeras som grönt. Fel eller okänt AI-utfall stoppar ytterligare anrop tills operatören utrett det befintliga jobbet. Den [detaljerade interna pilotguiden i #293](https://github.com/cqrityjob/trust-path-recruitment/blob/d9c83f24c11ebc0abf478f14573c9a48b6618ea6/docs/security-intelligence/customer-pilot-guide.md) finns kvar för fördjupad testning; produktens hjälptexter hålls korta.

## Acceptans

Du granskar svarens fackliga kvalitet och hur mycket användbar rapporttext som faktiskt skapades, vilka frågor som hjälpte och vilka ändringar du behövde göra. Operatören redovisar tekniskt resultat, exakt version, fyra anrops utfall, tokenanvändning, tid och kostnadsavstämning. Tolv fristående QA-svar och fyra appgenereringar är ett första avgränsat prov, inte en generell kvalitetsgaranti. Ingen kunddataaktivering följer automatiskt av godkänt prov.
