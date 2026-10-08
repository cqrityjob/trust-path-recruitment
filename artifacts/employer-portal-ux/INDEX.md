# Arbetsgivarportalen – före/efter-bilder (UX-pass 2026-10-08)

Bilderna produceras av workflowen `.github/workflows/employer-portal-ux-evidence.yml`
från sviten `e2e/employer-portal-ux-evidence.spec.ts` på den stubbade
backend-gränsen i `e2e/support/public-entry-harness.ts`. Inget når hosted
Supabase; varje serverfunktion besvaras från `e2e/support/employer-portal-fixture.ts`.

| Del | Värde |
| --- | --- |
| Syntetisk organisation | Exempelvakt AB (`exempelvakt`), ägare "Rita Rekryterare" |
| Rekryteringar | Väktare, Uppsala (publicerad, 4 aktiva + 1 arkiverad ansökan) · Ordningsvakt, Gävle (utkast) · Skyddsvakt, Västerås (stängd, alla besked klara) |
| Kandidater | Ali Ansökande (Ny, grå, ej granskad) · Birgitta Bevakning (Under granskning, grön, granskad) · Kim Kandidat (Intervju, gul, granskning behöver uppdateras) · Dana Dörrvakt (Ny, skallkrav inte fastställda) |
| Intervjuärenden | fyra: planerad, redo, evidensgranskning, rapporterad |
| Språk × bredd | sv/en × 1440 (chromium) och 375 (iPhone 13 mini-emulering) |
| Sidor | översikt, rekryteringar, ansökningar, tester, intervjuer, rapporter |

Filnamn: `before-<sida>-<språk>-<bredd>.png` respektive `after-<sida>-<språk>-<bredd>.png`,
plus `manifest.json` (fil + anteckning per bild) och `SOURCE.txt` (commit som fotograferades).

Artefakter: `employer-portal-ux-before` och `employer-portal-ux-after` på workflow-körningen
för PR:n. Bilderna är ännu inte committade i repot: sessionen som skrev passet
kunde inte köra Playwright lokalt (se docs/employer/2026-10-08-portal-journey-ux.md,
avsnitt Begränsningar). När de hämtas läggs de i denna katalog med namnen ovan.

Syntetiska bilder visar layout, kopia och länkar. De är inte ett bevis för
inloggade arbetsflöden mot riktig Auth/Storage/Postgres; det beviset är
`recruitment-evidence.yml` och `e4-evidence.yml` på PR:n (Supabase CLI-stack,
fixture `scripts/fixtures/recruitment-workspace-fixture.sql`).
