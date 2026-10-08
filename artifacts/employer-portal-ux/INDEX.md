# Arbetsgivarportalen – före/efter-bilder (UX-pass 2026-10-08)

Bilderna produceras av workflowen `.github/workflows/employer-portal-ux-evidence.yml`
från sviten `e2e/employer-portal-ux-evidence.spec.ts` på den stubbade
backend-gränsen i `e2e/support/public-entry-harness.ts`. Inget når hosted
Supabase; varje serverfunktion besvaras från `e2e/support/employer-portal-fixture.ts`.

| Del | Värde |
| --- | --- |
| Syntetisk organisation | Exempelvakt AB (`exempelvakt`), ägare "Rita Rekryterare" |
| Rekryteringar | Väktare, Uppsala (publicerad, 4 öppna + 1 arkiverad ansökan) · Ordningsvakt, Gävle (utkast) · Skyddsvakt, Västerås (stängd, alla besked klara) |
| Kandidater | Ali Ansökande (Ny, behöver klarläggas, ej granskad) · Birgitta Bevakning (Under granskning, skallkrav uppfyllda, granskad) · Kim Kandidat (Intervju, skallkrav inte uppfyllda, granskning behöver uppdateras) · Dana Dörrvakt (Ny, skallkrav inte fastställda) · Erik Efterhand (avslagen och arkiverad, behöver klarläggas, granskad) |
| Räknare | Beräknas ur de fem ansökningarna med serverns regler (`selectCandidatePage` i fixturen; invarianter i `scripts/employer-portal-fixture.test.ts`): mottagna 5 = 1 + 1 + 2 + 1 per kravstatus, granskade 2 + återstående 3, nya 2, att granska nu 3 (öppna utan bekräftad granskning) |
| Intervjuärenden | fyra: planerad, redo, evidensgranskning, rapporterad |
| Språk × bredd | sv/en × 1440 (chromium) och 375 (iPhone 13 Mini-emulering: `isMobile`, `hasTouch`, DPR 3) |
| Instrument | Sviten, fixturen, harnessen och `playwright.config.ts` tas från PR-huvudet för BÅDA fotograferingarna; bara appen skiljer. Före-bilderna i mobilbredd är därför tagna med samma mobilemulering som efter-bilderna |
| Sidor | översikt, rekryteringar, ansökningar, tester, intervjuer, rapporter |

Filnamn: `before-<sida>-<språk>-<bredd>.png` respektive `after-<sida>-<språk>-<bredd>.png`,
plus `manifest.json` (fil + anteckning per bild) och `SOURCE.txt` (commit som fotograferades).

Artefakter: `employer-portal-ux-before` och `employer-portal-ux-after` på workflow-körningen
för PR:n. Workflowen committar paret till PR-grenen (som `github-actions[bot]`) bara när
båda fotograferingsjobben lyckats och paret klarat `employer-portal-evidence:check`
(24 + 24 bilder, alla filer på plats, `SOURCE.txt` med fotograferad commit). Samma
kontroll körs i `ci.yml` (jobbet "Employer portal before/after pair") och faller där
även när paret är FÖRÅLDRAT: `after/SOURCE.txt` namnger en commit som inte längre
motsvarar PR-huvudet i någon fotograferad sökväg. En bildcommit på ett nyare huvud
är alltså inte i sig ett bevis; `SOURCE.txt` plus den kontrollen är det.

Syntetiska bilder visar layout, kopia och länkar. De är inte ett bevis för
inloggade arbetsflöden mot riktig Auth/Storage/Postgres; det beviset är
`recruitment-evidence.yml` och `e4-evidence.yml` på PR:n (Supabase CLI-stack,
fixture `scripts/fixtures/recruitment-workspace-fixture.sql`).
