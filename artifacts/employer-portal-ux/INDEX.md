# Arbetsgivarportalen – före/efter-bilder (lokal fotografering 2026-10-09)

Workflowen `.github/workflows/employer-portal-ux-evidence.yml` kan producera bildpar
från sviten `e2e/employer-portal-ux-evidence.spec.ts` på den stubbade
backend-gränsen i `e2e/support/public-entry-harness.ts`. Inget når hosted
Supabase; varje serverfunktion besvaras från `e2e/support/employer-portal-fixture.ts`.

| Del                    | Värde                                                                                                                                                                                                                                                                                                                                  |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Syntetisk organisation | Exempelvakt AB (`exempelvakt`), ägare "Rita Rekryterare"                                                                                                                                                                                                                                                                               |
| Rekryteringar          | Väktare, Uppsala (publicerad, 4 öppna + 1 arkiverad ansökan) · Ordningsvakt, Gävle (utkast) · Skyddsvakt, Västerås (stängd, alla besked klara)                                                                                                                                                                                         |
| Kandidater             | Ali Ansökande (Ny, behöver klarläggas, ej granskad) · Birgitta Bevakning (Under granskning, skallkrav uppfyllda, granskad) · Kim Kandidat (Intervju, skallkrav inte uppfyllda, granskning behöver uppdateras) · Dana Dörrvakt (Ny, skallkrav inte fastställda) · Erik Efterhand (avslagen och arkiverad, behöver klarläggas, granskad) |
| Räknare                | Beräknas ur de fem ansökningarna med serverns regler (`selectCandidatePage` i fixturen; invarianter i `scripts/employer-portal-fixture.test.ts`): mottagna 5 = 1 + 1 + 2 + 1 per kravstatus, granskade 2 + återstående 3, nya 2, att granska nu 3 (öppna utan bekräftad granskning)                                                    |
| Intervjuärenden        | fyra: planerad, redo, evidensgranskning, rapporterad                                                                                                                                                                                                                                                                                   |
| Språk × bredd          | sv/en × 1440 (chromium) och 375 (iPhone 13 Mini-emulering: `isMobile`, `hasTouch`, DPR 3)                                                                                                                                                                                                                                              |
| Instrument             | Sviten, fixturen, harnessen och `playwright.config.ts` tas från PR-huvudet för BÅDA fotograferingarna; bara appen skiljer. Före-bilderna i mobilbredd är därför tagna med samma mobilemulering som efter-bilderna                                                                                                                      |
| Sidor                  | översikt, rekryteringar, ansökningar, tester, intervjuer, rapporter, kravprofil (rekryteringsnavet för Väktare, Uppsala, steget Kravprofil: `requirements`)                                                                                                                                                                            |

Filnamn: `before-<sida>-<språk>-<bredd>.png` respektive `after-<sida>-<språk>-<bredd>.png`,
plus `manifest.json` (fil + anteckning per bild) och `SOURCE.txt` (commit som fotograferades).

Artefakter: `employer-portal-ux-before` och `employer-portal-ux-after` på workflow-körningen
för PR:n. Workflowen committar paret till PR-grenen (som `github-actions[bot]`) bara när
båda fotograferingsjobben lyckats och paret klarat `employer-portal-evidence:check`
(28 + 28 bilder, alla filer på plats, `SOURCE.txt` med fotograferad commit). Samma
kontroll körs i `ci.yml` (jobbet "Employer portal before/after pair") och faller där
även när paret är FÖRÅLDRAT: `after/SOURCE.txt` namnger en commit som inte längre
motsvarar PR-huvudet i någon fotograferad sökväg. En bildcommit på ett nyare huvud
är alltså inte i sig ett bevis; `SOURCE.txt` plus den kontrollen är det.

Detta par återanvänds byteidentiskt i den separat avstängda AI-kontraktsgrenen.
Före fotograferades från main `55db1e3b83ace033450899a93ca0961edde05217` och
efter från schema-kandidaten `b7a077b78bf4d64a6ab6aa08d470c6be951aaaf8`.
`SOURCE.txt`, bildmanifest, samtliga 56 PNG och [det ursprungliga lokala
kvittot](../../docs/assessment/recruiter-intelligence/evidence/2026-10-09-schema-portal-local.json)
är oförändrade. Fotograferade UI-sökvägar är byteidentiska med denna AI-gren;
bilderna har inte märkts om som en ny fotografering eller AI-verifiering.

Omfånget är sju sidor × svenska/engelska × desktop 1440 och Chromium-emulerad
375 med mobile/touch/DPR 3: 28 före och 28 efter. Före-körningen gav fyra PASS
och 16 avsedda skips för beteenden som bara provas på efter-huvudet; efter
gav 18 PASS och två projektspecifika skips. Inga assertions togs bort eller
omkördes. Detta är lokal syntetisk UI-evidens med stubbade serverfunktioner,
inte CI-, riktig Auth/API/Storage-, fysisk telefon- eller publicerad runtime-
evidens. Bilderna visar ingen ny AI-native-/UI-effekt; AI-funktionerna är
fortfarande avstängda.

Samma par gäller byteidentiskt för schemagrenen #464 (`codex/recruiter-workspace-schema-v03`);
dess fotograferade UI-sökvägar är oförändrade, så inga bilder, manifest eller `SOURCE.txt` ändras där.
