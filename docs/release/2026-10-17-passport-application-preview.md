# 2026-10-17 — Förhandsvisning av Passport-delningen i ansökan (appsläpp efter `20270322090000`)

**Status:** appkod som beror på schemaslotten `20270322090000_sp_preview_application_disclosure` (#479). Slotten mergades som `6d273d29` och installerades av den officiella integrationen. Den verifierades skrivskyddat och registreras i den här PR:en som `applied`: [hosted verification](2026-10-17-passport-share-preview-hosted-verification.json). Därmed är `schema-first-release:check` grön.

## Varför

Det oberoende acceptanstestet 2026-10-17 påpekade att rutan för Passport-delning i ansökan var förkryssad. #478 gör rutan avmarkerad från början och visar tydligt vad valet innebär. En avmarkerad ruta räcker ändå inte som förhandsvisning: kandidaten ska kunna se exakt vad arbetsgivaren skulle läsa innan hen väljer.

## Vad som ändras

- **Knapp i ansökningsdialogen.** Under Passport-valet finns knappen "Förhandsvisa vad arbetsgivaren ser". Den öppnar arbetsgivarens eget kort (`RecipientPassportCard` via `buildRecipientPresentation`) med innehåll från `sp_preview_application_disclosure`.
- **Samma byggare som arbetsgivarens läsning.** Funktionen bygger den tänkta delningen med samma payload-byggare som arbetsgivaren använder, och rullar sedan tillbaka den. Förhandsvisningen och arbetsgivarens vy kan därför inte skilja sig åt.
- **Förhandsvisningen delar ingenting.** Den skapar ingen disclosure-rad, ingen räknare och ingen länk. Rutan förblir avmarkerad tills kandidaten själv kryssar i den.
- **Ett fel blockerar aldrig ansökan.** Om förhandsvisningen inte kan visas står det i en mening, och valet ovanför gäller ändå.
- **Separationsvakten** (`scripts/passport-separation-check.ts`) godkänner uttryckligen den nya RPC:n och den nya komponenten, var för sig.

## Bevis

- **E2E** (`e2e/talent-discovery-local.spec.ts`, test 8, mot riktig GoTrue, PostgREST och schemat med `20270322090000`):
  - rutan är avmarkerad från början;
  - förhandsvisningen visar den verifierade CPP-meritens titel i arbetsgivarens kort;
  - efter förhandsvisningen är rutan fortfarande avmarkerad, och antalet `sp_disclosures` för kandidaten är oförändrat;
  - efter ikryssning och inskick finns exakt en ansökningsbunden delning.
- **SQL** (#479, PV1–PV5): förhandsvisningen är lika med arbetsgivarens payload efter delning, lämnar inget kvar, kräver levande session och nekar anon.

## Släppordning

1. #477 (`20270321090000`) mergas. Integrationen installerar slotten, den verifieras skrivskyddat och registreras.
2. #479 (`20270322090000`) mergas, installeras, verifieras och registreras på samma sätt.
3. Den här appkoden får en registreringscommit. Då blir `schema-first-release:check` grön, och koden kan mergas.
