# Första kundpiloten i Mitt säkerhetsarbete

Den här guiden hjälper pilotledaren och kundens säkerhetsansvariga att prova en avgränsad analys från underlag till godkänd rapport och uppföljning. Börja med helt påhittade uppgifter. Övergång till kunddata och användning av extern AI kräver separata, dokumenterade beslut. Guiden aktiverar ingen tjänst och är inte ett besked om vad som är publicerat.

## Innan kunden börjar

Pilotledaren fyller i följande tillsammans med systemansvarig. Saknas en uppgift används endast syntetiska data tills den är utredd. Saknas beslut om drift eller extern AI får det inte ersättas med ett syntetiskt anrop: fortsätt då med en manuellt genomförd övning utan extern bearbetning.

| Uppgift                      | Dokumentera före testet                                                                                                                                                                                        |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Miljö och version            | Godkänd webbadress, faktiskt driftsatt revision/commit, datum och resultat från dess CI. En mergad PR bevisar inte att användaren har den versionen.                                                           |
| Avgränsning                  | Kund, en utsedd arbetsyta, ett beslut som ska stödjas och pilotens slutdatum.                                                                                                                                  |
| Personer och behörighet      | Pilotledare, kundens granskare/godkännare, systemansvarig och kontaktväg vid fel. Använd egna konton; dela inte lösenord. Kontrollera rätt arbetsyta och tilldelad behörighet.                                 |
| Kunddata                     | Vilka dokument och uppgiftsklasser som får användas, dokumenterad rätt att behandla dem, lagrings-/bevarandevillkor och beslutad hantering när piloten slutar. Konton, original, utdrag och exporter omfattas. |
| Dokumentbearbetning          | Godkänd processor och dess drift-/databehandling, publicerad version, behörig operatör samt ett lyckat syntetiskt PDF- och DOCX-prov genom just den publicerade appen.                                         |
| Extern AI, om den ska provas | Separat godkänt ändamål, exakt leverantör/modell/version, databehandling och faktisk kontokonfiguration, arbetsyta, giltighetstid, kostnadsgräns och utsedd mänsklig kvalitetsgranskare.                       |
| Felhantering                 | Godkänd privat rapportkanal, vem som kan pausa bearbetning och hur oklara jobb/kostnader utreds utan upprepade anrop.                                                                                          |

Systemansvarig använder [processorhandboken](processor-deployment.md) och [aktiveringskontraktet](processing-activation.md). Följ inte gamla statusrader som bevis för dagens drift. Kontrollera den faktiska miljön; regionnamn eller ett API-nyckelinnehav styrker inte i sig databehandlingsvillkor, geografiska garantier eller kundbehörighet. Nycklar hör hemma i godkänd hemlighetshantering, aldrig i kundens formulär, chatten eller felrapporten.

## Vad olika prov visar

| Prov                        | Vad som faktiskt kontrolleras                                                                                               | Vad resultatet inte visar                                                    |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Mockade AI-svar             | Förutbestämda syntetiska svar provar validering, granskningssteg och sparande.                                              | Att en verklig modell ger korrekta eller användbara svar.                    |
| Isolerad browserresa        | Riktig lokal inloggning, privat lagring, PDF/DOCX-extraktion, mänsklig review, rapport och uppföljning med syntetiska data. | Att produktion är konfigurerad eller att extern AI har provats.              |
| Godkänt prov med verklig AI | Verkliga svar från exakt godkänd modell, uppmätt tid/användning och dokumenterad professionell granskning.                  | Automatisk kunddataaktivering eller allmän garanti mot felaktiga slutsatser. |
| Publicerat pilotprov        | Den namngivna kunden provar den faktiskt driftsatta revisionen i rätt arbetsyta med tillåtet innehåll.                      | Att andra kunder, versioner eller användningsområden är godkända.            |

Den syntetiska AI-utvärderingen beskrivs i [kvalitetsguiden](ai-quality.md). Ett grönt automatiskt test, ett tekniskt giltigt AI-svar eller en godkänd rapport ersätter inte den bedömningen. Den manuella resan kan provas med AI avstängt.

## Förbered ett litet övningsfall

Använd en fiktiv verksamhet: en reception där en tillträdesväg är blockerad under underhåll. Beslutet är om en alternativ väg behöver verifieras före användning. Avgränsa till receptionen och en angiven övningsperiod. Skriv uttryckligen att reservvägens tillgänglighet, ansvarig och återöppningsdatum är okända.

Förbered en textbaserad PDF och en vanlig DOCX med kort, kontrollerbar text om övningsfallet. Ta även med en bildbaserad/skannad PDF för att prova felvägen. Varje fil får vara högst 10 MB. Använd inga makron, skyddade original, riktiga personuppgifter eller privata kundrapporter i detta första prov. DOCX-fixturen i `e2e/support/fixtures/security-work-evidence.docx` är helt syntetisk: ett stycke med svenska tecken och ett `&`, utan personmetadata eller externa länkar.

## Genomför kundens test

Gör först hela resan på svenska. Prova därefter samma centrala steg på engelska och på den mobil eller dator som kunden ska använda. Anteckna resultat vid varje steg; tolka inte frånvaro av ett felmeddelande som bevis på att något sparats.

1. **Öppna rätt arbetsyta.** Logga in med ditt eget konto. Välj **Mitt säkerhetsarbete** efter Security Passport och öppna den avtalade arbetsytan. Vid första start kan du skapa din personliga arbetsyta. Kontrollera namn och behörighet; en arbetsgivar- eller kandidatkoppling är inte i sig åtkomst till kundens säkerhetsarbete. Förväntat: rätt arbetsyta visas och inga andra kunders uppgifter syns. Om menyvalet saknas kontrollerar pilotledaren publicerad version och direktlänken `/security-work`.

2. **Beskriv uppdraget.** Skapa en analys under **Analyser**, välj avsedd metod och ange namn, syfte/beslut, omfattning och tidshorisont. Bekräfta verksamhetskontexten och markera saknade uppgifter som okända. Förväntat: analysen kan sparas som utkast utan påhittade riskvärden. För RSA krävs definierade skalor och riskacceptans innan värdering; saknade värden betyder inte låg risk. Bevakningsanalys och den äldre säkerhetsmetoden ska inte visa en påhittad RSA-färg.

3. **Ladda upp och kontrollera PDF.** Gå till **2. Underlag**, välj text-PDF och **Ladda upp och extrahera**. Öppna **Läs källtext** och jämför utdraget med originalet. Kontrollera dokumentnamn, sidreferens och svenska tecken. Förväntat: verklig text och hänvisning visas. Uppladdning eller extraktion ska inte automatiskt markera utdraget som accepterat. Skriv en granskningsanteckning och välj **Granskat — använd i analysen** endast för kontrollerat relevant innehåll; välj **Använd inte** för felaktigt eller irrelevant innehåll.

4. **Gör samma sak med DOCX.** Ladda upp DOCX i samma analys. Jämför hela utdraget med originalet, inklusive svenska tecken och `&`. DOCX visar en avsnittsreferens, exempelvis `section 1`, inte ett påstått Word-sidnummer. Acceptera utdraget först efter din granskning. Förväntat: text, källnamn, referens och granskningsstatus finns kvar efter omladdning. Om bearbetning inte är konfigurerad ska appen ange det tydligt; det är inget lyckat extraktionsprov.

5. **Prova en skannad PDF.** Ladda upp bild-PDF:en. Förväntat: appen meddelar att texten inte kunde extraheras; originalet är sparat privat och ingen OCR påstås ha utförts. Välj **Fortsätt med manuellt underlag**, skapa/välj källa, ange titel/utgivare och skriv av ett relevant kontrollerbart utdrag med sidnummer i titeln. Förhandsgranska, spara och granska det. Det ska framgå att detta är **Manuellt underlag**. Om bilden inte ger läsbar information skriver du det som en kunskapslucka; hitta inte på innehåll.

6. **Komplettera det som påverkar beslutet.** I **3. Komplettera** skriver du exempelvis: ”Har reservvägen kontrollerats efter underhållet? Uppgiften behövs innan vi beslutar att den kan användas.” Svara ”Okänt – ingen kontroll har tillhandahållits” om belägg saknas och spara. Förväntat: frågan och svaret finns kvar när du byter steg och laddar om. En AI-genererad frågas ursprungliga motivering/citat är historiska; de ska inte låtsas ha uppdaterats när du redigerar frågan.

7. **Gör och granska bedömningen.** I **4. Bedömning** skiljer du källbelagda fakta från din bedömning, antaganden och osäkerhet. Formulera en professionell slutsats och en konkret åtgärd som stödjer beslutet. Ange verkligt överenskommen ansvarig, tidsfrist och vad som ska visa att åtgärden är klar; lämna okända uppgifter öppna. Lägg en källhänvisning med det exakta utdrag som stöder påståendet. Förväntat: ett citat styrker bara det som faktiskt står där, och luckor/motsägelser förblir synliga. Om AI är avstängt fortsätter du manuellt. Ett separat godkänt AI-prov följer avsnittet nedan.

8. **Kontrollera sparande och ny inloggning.** Spara, invänta bekräftelse, ladda om och kontrollera slutsats, fråga/svar, accepterade PDF/DOCX-utdrag, risk och åtgärd. Logga ut och in igen med samma konto och öppna samma analys. Förväntat: sparade uppgifter och källkopplingar finns kvar. Prova en liten osparad ändring och navigera bort; varningen ska låta dig stanna kvar. Vid versionskonflikt ska den andra användarens arbete inte skrivas över. Läs om den senaste versionen först efter att du säkrat ditt utkast i en godkänd privat kanal.

9. **Förhandsgranska och godkänn.** Gå till **5. Rapport**, skapa rapportutkast och fyll den valda metodens avsnitt. Spara, lägg relevanta källhänvisningar och välj **Granska version inför godkännande**. Läs hela versionen: omfattning, datum, metod, slutsats, risker, åtgärder, källor och osäkerhet. Bekräfta och välj **Godkänn rapportversion** endast som utsedd godkännare. Förväntat: rapporten märks som godkänd och oföränderlig. AI eller lyckad extraktion får inte godkänna den åt dig.

10. **Exportera och läs utskriften.** Exportera den godkända rapporten. Filen är HTML; öppna den och använd webbläsarens **Skriv ut → Spara som PDF** om PDF behövs. Kontrollera samtliga sidor: läsbara tabeller/sidbrytningar, metod, status, godkännandedatum, version, källor och hash. Jämför med den godkända appversionen. Förväntat: citat ligger nära påståenden när kopplingen är uttrycklig och fullständig; övriga finns i källförteckningen. Exporter innehåller analysdata och ska sparas/delas endast enligt pilotens beslutade hantering.

11. **Följ upp och verifiera historiken.** Under **Risker och åtgärder**, välj **Följ upp** och avsluta övningsåtgärden med beslutsmotivering och konkret underlag för slutförande. Öppna sedan den gamla godkända rapporten. Förväntat: åtgärdens aktuella status har ändrats, medan rapporten visar statusen vid sitt godkännande. Om analysen behöver ändras skapar du en ny revision; den tidigare godkända versionen ska finnas kvar.

## Om piloten även ska prova verklig AI

Gör först den särskilt godkända syntetiska utvärderingen med namngiven professionell granskare. Följ [kvalitetsguidens](ai-quality.md) sex fall på SV/EN och dokumentera resultat, svarshashar, kostnad/tid och mänskliga bedömningar. Mockade svar får inte räknas som modellresultat. Ett godkänt syntetiskt resultat ger inte automatiskt rätt att skicka kunddata.

För ett separat godkänt prov i kundens arbetsyta granskar du accepterade utdrag och kontext innan du begär AI-utkast. Läs förslagets fakta, hänvisningar, frågor med motivering, osäkerhet och föreslagna åtgärder. Inför endast granskade delar i analysutkastet och fortsätt med mänsklig rapportgranskning. Saknade ägare, datum eller verifierade skyddsåtgärder får inte ersättas med antaganden. Vid timeout eller okänt utfall: stoppa och låt operatören utreda befintligt jobb; starta inte en ny förfrågan bara för att få ett svar.

## Stoppa och rapportera

Stoppa om fel kunds uppgifter syns, behörighet saknas men data ändå visas, sparad information försvinner, källa/citat inte matchar originalet, ett AI-påstående saknar stöd, dokument påstås vara extraherade utan läsbar text, rapporten ändras efter godkännande eller oklara jobb utlöser upprepade kostnader. Pausa kunddata och eventuell extern bearbetning genom den utsedda operatören. Försök inte reparera detta genom att dela konton, upprepa uppladdningar/anrop eller ändra behörighet utanför den beslutade processen.

Rapportera privat: tid och tidszon, miljö/revision, språk/enhet/webbläsare, berört steg, förväntat och faktiskt resultat, synlig felkod samt interna analys-/jobb-ID:n om de behövs. Använd först en syntetisk reproduktion. Bifoga endast nödvändiga maskerade bilder enligt den godkända kanalen; inga lösenord, nycklar, sessionstoken, råa nätverksspår eller kunddokument i GitHub/öppen chatt.

Pilotledaren sammanställer **godkänt / avvikelse / ej provat** per steg, separat för manuell resa, dokumentbearbetning, verklig AI och publicerad miljö. Kundens granskare och systemansvarig tar därefter ett dokumenterat beslut om nästa avgränsade steg. En olöst kritisk avvikelse stoppar utökningen; ett lyckat enskilt fall innebär inte generell produktionsberedskap.

## Automatisk regression som stöd

`e2e/security-work-analysis.spec.ts` provar samma manuella analysresa i SV/EN på desktop, 375 och 390 px. Den laddar upp en riktig text-PDF och den syntetiska DOCX-filen via filväljaren, använder riktig isolerad lagring/processor, granskar utdragen och kontrollerar beständighet. Den provar även skannad-PDF-felvägen, manuell avskrift, oföränderlig rapport, faktisk utskrift av den exporterade HTML-filen och senare åtgärdsuppföljning. Inga lyckade DOCX-extraktioner eller review-rader planteras direkt i databasen.

Den resan kräver en uttryckligen ägd disponibel lokal stack och loopbackadresser; den är ingen instruktion att köra skrivande tester mot kundmiljön. Aktuellt CI-resultat för exakt leveransrevision måste noteras av pilotledaren. Separata syntetiska AI-browserprov och kvalitetsprov bevisar de gränser som anges ovan, aldrig tyst aktivering i produktion.
