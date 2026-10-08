# Recruiter Intelligence v0.3: avstängt P4-kontrakt, draft 1

Observation 2026-10-08. Main-bas: `8c9b3138bcb801ac69aa44b14e9cb592da5ea50a`. Kontraktsversion: `recruiter-ai-v0.3-draft1`.

Detta är en granskbar kontraktsleverans inför ett senare AI-beslut. Fyra autentiserade serveringångar finns, men samtliga avvisar anrop med `RECRUITER_AI_V03_DISABLED` före underlagsläsning eller leverantörsanrop. Det finns ingen miljö-, plan-, request- eller laboratorieflagga som kan öppna dem. Inga manuella arbetsflöden, kravstatusar, rapporter, frågor, meddelanden, modeller, behörigheter eller genererade databastyper ändras.

## Fyra uppgifter och föreslagna ingångar

Ordalydelsen nedan är ett versionsbundet SV/EN-förslag för innehållsgranskning. De fyra intentionerna kommer från v0.3-uppdraget; formuleringarna är inte innehållsgodkända. Den ursprungliga bifogade textfilen hade lästs tidigare men kunde inte återöppnas vid denna leverans, eftersom dess ursprungliga Downloads-sökväg inte längre fanns. Ingen ny fullständig paragrafjämförelse mot bilagan påstås.

| Uppgift                  | Föreslagen svensk ingång                             | Proposed English entry                                                  | Tillåten utdata                                                                          |
| ------------------------ | ---------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `source_summary`         | Vilket underlag finns för de beslutade skallkraven?  | What evidence is available for the agreed mandatory requirements?       | Källciterade uppgifter märkta kandidatens uppgift eller oklar extraktion.                |
| `criterion_linking`      | Vilka uppgifter behöver klarläggas mot kravprofilen? | Which information needs clarification against the requirements profile? | Möjligen relevant, otillräckligt eller motstridigt underlag till ett befintligt krav-ID. |
| `neutral_clarifications` | Vilka neutrala följdfrågor kan förberedas?           | Which neutral follow-up questions can be prepared?                      | Förslag på klarläggande fråga, krav-ID, källa, informationslucka och nästa handling.     |
| `reviewed_report_draft`  | Vilka kontroller återstår efter intervjun?           | Which checks remain after the interview?                                | Utkast sammansatt av redan uttryckligen valda mänskliga textstycken, oförändrade.        |

Utdata kan aldrig intyga mänsklig granskning, avgöra att ett krav är uppfyllt, bli grönt, rangordna kandidater, bedöma personlighet eller trovärdighet, fatta urvalsbeslut, skicka frågor eller fastställa rapporter. Alla förslag har `humanReviewRequired=true`, `reviewState=unreviewed` och `semanticSupport=requires_human_review`.

## Käll- och versionskontrakt

Det strikta kontraktet binder arbetsgivare, ansökan, annons, aktör, planversion, bekräftad och icke tom kravprofil, krav-ID, accepterade källtyper samt modell-, modellversions-, prompt-, prompthash-, kolumn- och schemaversion. Källpassager har egna ID, käll-ID, version, innehållshash, passagehash, scope, ursprung, åtkomst och återkallningsstatus. Mänskliga underlag binder ID, text, väljande aktör, tidpunkt och eventuell intervjufråga.

Context-flaggor som `mayReadApplication` är ett krav på en framtida betrodd serveradapter. Att ett lokalt objekt matchar detta schema bevisar inte faktisk tenantbehörighet eller kandidatens delning. De avstängda serveringångarna tar endast request-scope och läser ingen sådan context från användaren. Vid framtida aktivering måste context, plan, roll och budget hämtas och kontrolleras server-side mot aktuella behörigheter och beslutade versioner.

Varje citering kräver rätt passage, rätt källversion/hash och exakt textintervall i UTF-16 utan delat Unicode-tecken. Den syntetiska sandlådan kontrollerar SHA-256 av passage-UTF-8. Hash av originalfilens byte måste däremot hämtas från en betrodd underlagsadapter; den kan inte härledas från ett textutdrag. Kriteriekoppling till en otillåten källtyp avvisas. Rapportutkast kan bara återge exakt ett mänskligt valt textstycke; ingen fri AI-parafrasering godtas av detta kontrakt.

En korrekt citering bevisar att texten finns, inte att påståendet är sant, att OCR är korrekt eller att texten stödjer slutsatsen. Utvärderingen innehåller därför en fabricerad erfarenhetsparafras och felaktigt OCR-årtal som passerar strukturkontrollen men ska avvisas enligt mänskligt facit. Inga modellrapporterade säkerhets- eller sanningspoäng används som bevis.

## Hårt avstängt runtime, separat syntetisk sandlåda

De fyra [serveringångarna](../../../src/lib/recruitment/ai/recruiter-ai.functions.ts) använder befintlig autentiseringsmiddleware och uppgiftsspecifik request-validering. Deras enda handleråtgärd är den ovillkorliga spärren i [kontraktet](../../../src/lib/recruitment/ai/contract.ts). Ingen leverantör, administrativ klient, RPC, databasläsning, fetch, meddelandefunktion eller rapportskrivning anropas. Inga UI-knappar kopplas in.

[Den syntetiska sandlådan](../../../src/lib/recruitment/ai/synthetic-sandbox.server.ts) är endast en offlineövning med injicerade lokala facitfunktioner. Den visar kontrakt för idempotens, versionsbunden cache, reservation och konservativ kostnadsdebitering, högst två samtidiga övningar och åtta köade per arbetsgivar-/planversion. Kontext läses före, före beräkning och efter beräkning. Stale, återkallade, oläsbara eller ändrade källor avvisas; sena svar efter avbrott eller timeout publiceras och cachas inte. En beräkning som ignorerar avbrott håller sin plats och reservation tills den avslutas.

Idempotens och cache omfattar scope, aktör, profil, accepterade källtyper, mänskliga val samt alla modell-/prompt-/kolumn- och källversioner. Ändrad payload under samma operations-ID avvisas. Resultat kopieras, så senare mutationer inte kan ändra lagrat facit. Högst 1 024 operationsposter och 256 cachade resultat lagras i minnet.

Detta är inte en installerad kö, en beständig kostnadsjournal, en produktionscache eller en budgetgaranti över flera processer. Inga leverantörspriser, tokenräkningar eller faktiska modellanrop provas. Dessa måste implementeras och verifieras före ett separat aktiveringsbeslut; sandlådan får inte kopplas direkt till ett produktionsanrop.

## Utförd verifiering

| Kontroll                      | Utfört resultat                                                                                                                                     | Gräns                                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Kontrakts- och sandlådetester | 68 tester, 151 assertions, PASS                                                                                                                     | Lokala syntetiska objekt; ingen Auth/API/RLS eller modell.                                          |
| Offline facit                 | 9 fall, 0 avvikelser                                                                                                                                | 4 tillåtna uppgifter samt fabricerad citering, injection, ledande fråga, felaktig parafras och OCR. |
| Typkontroll                   | App- och scripts-typkontroll PASS; 9 negativa typkontrakt kontrollerade                                                                             | Handwritten kontrakt; genererade typer orörda.                                                      |
| Repo-ESLint/Prettier          | Nya kodfiler kontrollerade utan avstängda regler                                                                                                    | Inget påstående om att all befintlig repo-skuld är löst.                                            |
| Befintlig AI-spärrkontroll    | 35 kontroller PASS                                                                                                                                  | Befintlig testad labbstub, inga externa leverantörsanrop.                                           |
| Noll sidoeffekter             | Ingen transport i testets fetch-fångst; ingen persistent adapter; offline-evidens visar 0 modell-/skriv-/status-/meddelande-/fastställandehändelser | Syntetisk provning och källgranskning; ingen hosted observation.                                    |

Enhetstesterna täcker bland annat scopefel, otillåten roll, obekräftad/tom profil, fel krav- och käll-ID, accepterad källtyp, Unicode-offset, exakt citat, återkallning, injection, otillåtna slutsatser, avsiktlig idempotens, cachelinjering, reservbudget, överdrag, separat tenantkö, avbrott, timeout och sena svar. Namn-/formatvariationer visar att detta kontrakts bindning är oförändrad i fem syntetiska format; de är ingen modellbaserad rättvise- eller biasutvärdering.

[Original offline-evidens, källhashar och återkörningskommandon](evidence/2026-10-08-p4-synthetic-contract/README.md) hålls åtskilda från framtida modell- och driftprov. Inga kandidater, credentials eller privata originalfiler ingår.

## Kvar före eventuell aktivering

1. Lås uppgifter, SV/EN-ordalydelse, human-reviewflöde och vad som får användas som accepterat underlag. Håll PEACE-arbetssätt och mänsklig rollbedömning separata.
2. Implementera betrodd serveradapter för tenant-/ansökningsbehörighet, aktuell delning, kravprofilversion och mänskligt valda intervjuevidens. Prova kandidatens återkallning och direkt API-åtkomst med verklig Auth/RLS.
3. Implementera beständig idempotens, transaktionell budgetreservation, kvot, begränsad flerprocesskö, cancellation och återkallnings-/stalefence utan status-, meddelande- eller rapportbiverkningar.
4. Lås leverantör, modell-/prompt-/kolumnversioner, token-/kostnadsgräns och databehandling separat. Leverantörsfel, nätförlust och sena svar måste omfattas.
5. Utvärdera verkliga modellförslag mot syntetiskt originalfacit, inklusive fel OCR, förfalskade citeringar, injection, neutrala frågor, varierade namn/format och manuell avvisning av semantiskt ostödda förslag. Nuvarande lexikala policykontroll är en begränsad mitigation.
6. Ta ett uttryckligt aktiverings- och pilotbeslut efter dessa kontroller. Ingen av punkterna ovan blir uppfylld av att de fyra avstängda funktionerna typkontrollerar.

Återställning för denna leverans är en normal kompatibel app-revert av dessa nya filer och scriptregistreringar. Inga schema- eller dataskrivningar, inga aktiverade funktioner och inga nya rapporter behöver återställas. Ingen merge, publicering eller hosted installation har utförts av denna arbetsgren.
