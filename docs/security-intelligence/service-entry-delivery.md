# Direkt till Mitt säkerhetsarbete

Leverans för granskning, 26 september 2026. Utgår från main `f8957f7e3356c75656e14c0f11e5f6e751285411`. Ingen merge, publicering, kostnadsaktivering eller produktionsändring ingår. [CTO:ns aktiveringssteg](pilot-operations-decision.md) gäller fortfarande.

## Före och efter

- Före: varje besök gick via en introduktion och arbetsytelista, även för en enda arbetsyta. Efter: en färsk serverkontrollerad lista öppnar den enda arbetsytan direkt. Vid flera öppnas senast använda bara om den fortfarande finns i listan; annars visas ett kompakt val. Arbetsytebyte använder ett uttryckligt val-läge. Automatisk ingång använder replace; direktlänkar ändras inte.
- Före: arbetsytenamnet kunde förväxlas med tjänsten Omvärldsbevakning. Efter: namnet är märkt Arbetsyta/Workspace och ändras inte. En synlig länk går tillbaka till CQrityjob.
- Före: Ny analys saknade en tydlig beskrivning av nyttan. Efter: två tjänstekort beskriver underlag, hjälp, resultat och mänsklig granskning. Omvärldsbevakning förväljer `monitoring`, Riskanalys förväljer `rsa`. Befintliga rapporter och åtgärder ingår i resorna. En genväg till pågående arbete visas för återkommande användare.
- Nätverksfel visar ett återförsök, aldrig ett tomt arbetsyteläge. Senaste arbetsyta lagras per användare som en lokal navigeringspreferens, aldrig som behörighetsbevis. Blockerad lokal lagring ger normalt arbetsyteval. Skapandet använder befintlig serverlåsning och unik personlig arbetsyta, kompletterat med dubbelklicksspärr.
- Analysens fem befintliga steg har kort vägledning och nästa handling. Skapandeformuläret varnar innan osparade uppgifter kastas och behåller uppgifter efter fel. AI-förslag kräver fortfarande ett uttryckligt införande och separat mänskligt rapportgodkännande.

## Tillgänglighet och faktisk funktion

AI-status kommer från befintlig arbetsyteaktivering och serverkonfiguration. Dokumentstatus är en behörighetskontrollerad läsning av befintliga konfigurationsspärrar, utan hälsoprob eller leverantörsanrop. Tillgänglig betyder konfigurerad för arbetsytan/rollen, inte att en extern leverantör har hälsotestats. Misslyckad statusläsning visas som okänd, inte avstängd.

När dokumentbearbetning är avstängd kan användaren spara ett original privat och registrera relevanta utdrag manuellt. Ingen extraktion begärs i det läget. När AI är avstängt finns manuella frågor, bedömningar, rapporter och åtgärder kvar. Ingen automatisk nyhetsinhämtning, kontinuerlig bevakning, OCR eller realtidslarm utlovas. Den exakta 25-rutorsmatrisen, kalibrering, riskacceptans och godkännanderegler är oförändrade.

## Kommersiell lucka

Inventeringen hittade inget köp-/abonnemangsflöde för Security Work. Befintlig `/contact` är en uttrycklig förhandsvisning: formulärets submit avbryter standardhändelsen men skickar inget. Det används därför inte som en fungerande säljkontakt och inga köp-/aktiveringsknappar, priser eller provperioder läggs till.

Enklaste nästa lösning är att ägaren anger en bemannad försäljningsadress och ansvarig, samt godkänner vilken information som får skickas. Därefter kan en tydligt märkt e-postlänk införas och provas. En serverhanterad kontaktblankett med kvittens kan komma senare. Inget av detta har aktiverats i denna leverans.

## Verifiering

Lokalt: typkontroll; 11 tester av arbetsytepreferens och blockerad lagring; 62 analys-/exportkontroller inklusive alla matrisrutor; befintliga processor- och AI-kontrakt. Webbläsarverifieringen sker i GitHubs isolerade GoTrue/PostgREST/PostgreSQL-miljö; lokal Docker/CLI finns inte tillgänglig i denna arbetsmiljö.

De befintliga 18 SV/EN-resorna på desktop, 375 px och 390 px utökas med noll/en/flera arbetsytor, nätverksfel, idempotenta samtidiga skapandeanrop, explicit byte, återkallad senaste åtkomst, omladdning/bakåtknapp, rätt metod, formulärfel och osparad inmatning. Befintliga direktlänkar, ny inloggning, källgranskning, rapportgodkännande/export och åtgärdsuppföljning behålls. Aktiverad AI-vy provas med en uttrycklig statusstub utan generering; signerade syntetiska förslag testar faktisk tillämpning och RLS. Detta bevisar inte verklig AI-kvalitet.

Riktiga skärmbilder tas från testappen och publiceras först efter hela respektive resans godkända resultat och befintlig läckagekontroll. Slutcommit, körningslänkar och visuellt granskat underlag redovisas i PR:en.

Aktuell main hade redan röd CI: [körning 36271453737](https://github.com/cqrityjob/trust-path-recruitment/actions/runs/36271453737). Den dokumenterade nullable-RPC-typen hade skrivits över i tre fält; denna leverans återställer exakt de tre undantagen som `nullable-rpc-contract:check` kräver, utan körbeteende- eller SQL-ändring. Startsidesjobbet hade dessutom tolv fel efter den parallella startsidesändringen (bland annat gammal H1 och gammal sektions-/livscykelstruktur). Startsidan och dess tester ändras inte här. Det kvarstående felet måste skiljas från Security Works testresultat och redovisas i PR:ens slutstatus.

Live-AI, extern dokumentbearbetning och provet genom den publicerade appen återstår efter CTO-/ägarbeslut. Ingen kundpilot eller kommersiell lansering följer automatiskt av denna kodleverans.
