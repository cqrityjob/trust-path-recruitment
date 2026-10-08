# Arbetsgivarportalen som ett arbetsflöde – UX- och kvalitetspass 2026-10-08

Leverans enligt uppdraget "Claude – gör arbetsgivarportalen sammanhängande, lätt att
förstå och tekniskt verifierad efter Astras leverans". Statusuppgifter nedan anger
faktiskt utförd kontroll; blockerat och inte kört är inte PASS.

## Bas och huvud

| Del | Värde |
| --- | --- |
| Verifierad bas-main | `e4531c3b8abac440c9a98ed0f4182106d5b31106` (efter normal merge av #453, #458, #456, #460, #461; endast docs-PR #449 var öppen) |
| Leveransens mergade PR:er | #447, #448, #450, #451, #452, #453, #454, #455, #456, #457, #458, #459, #460, #461, #462, alla verifierade i GitHub 16:36 UTC |
| Main-CI på basen | `CI` run 37808576247 pågick vid avläsningen; native-workflows (`recruiter-p1-native-ci`, `recruiter-real-ci`) PASS på samma commit |
| Gren | `claude/amazing-clarke-ferjkh`, vanliga framåtriktade commits ovanpå basen; ingen historik omskriven |
| Sista appkodscommit | `2ad7a3d10cd79cdf3477c0d018be49e06c78b5c3` (sista commit som ändrar `src/`, `e2e/` eller `scripts/`) |
| Bildcommit | `06e5a6c9f0f4e74e1ff644d02f47a34e011c4301` av `github-actions[bot]`, fotograferat från `2ad7a3d` (efter) och `e4531c3b` (före) i workflow-körning 37817843842 |
| Slut-SHA | PR-huvudet (anges i PR:n). Ovanpå bildcommiten ligger bara denna fil och en ändring i `employer-portal-ux-evidence.yml` (fotograferingsjobben hoppar över en push som inte ändrar något de fotograferar, så en docs-push inte längre slutar i en bot-commit vars kontroller väntar på godkännande). CI på slut-SHA:n kör samma appkod som `2ad7a3d` |

Merge betyder inte att Lovable har synkat eller publicerat; se sista avsnittet.

## Menyn och arbetsflödet

Huvudmenyn är oförändrad i struktur: Översikt · Rekrytering (Rekryteringar, Ansökningar,
Tester & bedömningar, Intervjuer) · Personal (Medarbetare, Utveckling) · Organisation.
De fyra rekryteringsposterna bär nu en rad som säger vad området är till för:

| Post | Svenska | Engelska |
| --- | --- | --- |
| Rekryteringar | Annons, krav och beslut för en tjänst | Advert, requirements and decisions for one position |
| Ansökningar | Alla mottagna ansökningar: filtrera och granska | All received applications: filter and review |
| Tester & bedömningar | Testbibliotek, utskick och resultat | Test library, dispatch and results |
| Intervjuer | Förbered, genomför och granska samtal | Prepare, conduct and review interviews |

Rapporter tänder Intervjuer i menyn (sidan är en vy över intervjuärendena), och
Inställningar tänder Organisation.

Den röda tråden är en flödesremsa (`RecruitmentFlowStrip`) på översikten och på
varje områdessida: **Annons & krav → Ansökningar & underlag → Kravgranskning → Tester →
Intervjuer → Rapport → Beslut & avslut**. Varje station är en länk till den yta där
arbetet görs; den aktuella stationen markeras visuellt och med `aria-current="step"`.
Översikten är kartan och markerar ingen station.

Remsan beskriver ordningen i arbetet, inte en checklista: raden under den säger att
tester och intervjuer används när rekryteringen behöver dem och att beslut och
avslut görs i respektive rekrytering. Markeringen gäller sidan läsaren står på,
aldrig en viss kandidats steg. Varje station bär en förklarande `title`.
"Beslut & avslut" öppnar de pågående rekryteringarna (`phase=active`), eftersom
besked ges i ansökningarna och avslutet i rekryteringens sista steg även när
rekryteringen fortfarande är öppen. På telefon radbryts stationerna i stället för
att scrollas i sidled, så inget nästa steg hamnar utanför skärmen.

## Översikten: vad siffrorna omfattar

Två populationer av samma ansökningar visas på sidan, och de förklaras nu var för sig:

- **Nya ansökningar** (sammanfattningsraden): status Ny i alla rekryteringar som inte
  är arkiverade; arkiverade ansökningar räknas inte. Varje sammanfattningstal har en
  rad under sig som säger vad det täcker (pågående rekryteringar, nya ansökningar,
  kommande intervjuer).
- **Kravgranskning av mottagna ansökningar** (Astras block): rubrik, en inledning som
  säger att detta är ett annat urval (alla ansökningar organisationen någonsin
  tagit emot, inklusive arkiverade och avgjorda), och en utfällbar förklaring
  "Vad räknas här?" som definierar Mottagna, Mänskligt granskade, Återstående,
  kravstatusens färger och att rekryteringssteg/beslut är en annan axel.
  Räknarnas innebörd är oförändrad; `rec_ri_candidate_view`/`rec_ri_overview_counts`
  läses som förut.
- **Kravstatus** visas med symbol och text utöver färg (grön ✓, gul ✕, grå ?,
  streckad cirkel för "Skallkrav inte fastställda"). Förklaringen skiljer uttryckligen
  "annonsen saknar fastställda skallkrav" (rekryteringens status) från "kandidatens
  underlag behöver klarläggas" (grått). De två tekniska statusarna slås inte samman.

Att göra idag:

| Rad | Före | Efter |
| --- | --- | --- |
| kandidater väntar på nästa steg | räknade Under granskning + Intervju, länkade `status=reviewing` | räknar bara Under granskning, länkar `stage=review` |
| kandidater är i intervjusteget | fanns inte | ny rad, länkar `stage=interview` |
| utkast till annonser | länkade hela rekryteringslistan | länkar `phase=draft` |
| rekryteringar redo att avslutas | länkade `phase=closed` (även stängda med olösta kandidater) | länkar nytt filter `phase=ready` = stängd och alla besked klara |
| Intervju-kortet | tre tal utan länk | Redo för intervju och Evidensgranskning är länkar till sin stage; Förberedelse (två steg) förblir tal |

Två serverläsningar som sidan aldrig renderade (`listApplicationsForEmployer`,
`listAssignmentsForEmployer`) är borttagna från översikten.

## Rättade UX-problem och tekniska fel

Kontext genom flödet:

- "Tillbaka till rekryteringen" och jobblänken på kandidatsidan landar på
  rekryteringens kandidatlista (`step=applications`), inte på beräknat steg.
- Stegnavigeringen i en rekrytering bär med sig kandidatlistans filter, sortering
  och sida (`preserve`), så ett besök på Annons tappar inte listan.
- Intervjuanteckningens resultatlänk och Kandidater-vyns granskningslänk bär
  `?application=`, som resultatlänken redan gjorde.
- Varje intervjuärendes skärm (upplägg, tester, intervju, underlag, bedömning,
  panel, sammanfattning) länkar till ansökan i `CaseHeader`; tidigare bara
  ärendeöversikt och rapport. Fristående ärenden visar ingen länk.
- Sentinel-rapporter på arbetsgivarsidan har samma väg tillbaka (Kandidater och
  ansökan) som övriga rapporter; `ReportGate` ersatte tidigare hela sidinnehållet.

Avslut och stängda ansökningar:

- "Ändra" på en planerad bokning döljs när ansökan är stängd; databasen nekade
  ändå (`APPLICATION_NOT_OPEN`).
- Felkopian för `APPLICATION_NOT_OPEN` gäller nu alla åtgärder, inte bara bokningar.
- Arkiverad ansökan/rekrytering sägs ut på sidan (`archived-state`), och arkivering
  och återställning får skilda notiser. Texterna motsvarar listornas faktiska
  beteende: en arkiverad ansökan lämnar de aktiva listorna och antalet nya
  ansökningar men visas under Arkiverade och Alla mottagna; en arkiverad rekrytering
  visas bara under Arkiverade i rekryteringslistan.
- Inerta beslutsknappar på en avslutad rekrytering får sin orsak bredvid sig.
- Avslutsrutan i intervjun skiljer "kunde inte sparas" från "inte sparad ännu".

Hjälptexter: hänvisningen "Tester & bedömningar → Rekryteringsstöd" pekar nu på en väg
som finns (Testbibliotek → Förbered intervju).

Bevarat: Sentinel-layouten, avslutsrutan, autosparningen, "Till mina tester",
RPC-typöverlagringen i `src/integrations/supabase/database.ts`, metodpaket, frågor,
kompetensområden och poängregler. Inga serverbehörigheter, RPC:er eller migrationer
ändras; inga räknares innebörd ändras.

## Vilken appversion varje kontroll kör

| Kontroll | Appversion | Täcker UX-ändringarna? |
| --- | --- | --- |
| `ci.yml` (lint/typecheck/deterministiska guards inkl. `employer-portal-flow:check` och `playwright-mobile-presets`, `verify`, `public-entry-browser` med `e2e:employer-portal-ux`, P1-jobben, migrationsreplay) | PR-huvudet | Ja |
| `recruitment-evidence.yml` (Supabase CLI-stack, riktig Auth/PostgREST, `e2e/recruitment-workspace.spec.ts`) | PR-huvudet | Ja: tre nya inloggade tester för stegnavigeringens bevarade vy, återlänken till kandidatlistan, översiktens förklaringar, flödesremsan och `phase=ready`, utöver de befintliga 15+ |
| `e4-evidence.yml` (slutrapporten, riktig stack) | PR-huvudet | Regression på rapportsidan (CaseHeader-länk) |
| `employer-portal-ux-evidence.yml` | bas `e4531c3b` (före) och PR-huvudet (efter) | Ja: syntetiska bilder, sv/en, 1440 och emulerad 375 |
| `recruiter-p1-native-ci.yml`, `recruiter-real-ci.yml`, `passport-native-op09-ci.yml` | pinnad app `40e5775d…` | **Nej.** Tidigare versionsbevis för Astras leverans; verifierar inte denna PR:s kod |

Mobila kontroller är emulering (Chromium med iPhone 13 Mini-/iPhone 14-metrik), inte
fysiska telefoner. Fram till denna PR var `mobile-375` i `playwright.config.ts` ett
smalt skrivbordsfönster: `devices["iPhone 13 mini"]` (litet m) är inget
Playwright-preset, så spridningen var tom. Presetet löses nu via
`requireNativeMobilePreset("iPhone 13 Mini")`, `isMobile`, `hasTouch` och
`deviceScaleFactor: 3` är utskrivna, och `scripts/playwright-mobile-presets.test.ts`
pinnar det i CI. Alla `mobile-375`/`mobile-390`-körningar på PR:n är därmed de första
med verklig mobilemulering i den delade konfigurationen.

## Tester och verifiering

Nytt:

- `scripts/employer-portal-flow-check.ts` (`bun run employer-portal-flow:check`), körs i
  `ci.yml` efter Recruitment workspace check. Pinnar flödesremsan på varje områdessida,
  att-göra-radernas exakta länkar, symbol+text på kravstatus, menyns beskrivningar,
  kontextbevarandet och stängd-läget. Lokalt PASS.
- `scripts/negative-controls/employer-portal-flow-controls.ts` med sju planterade
  defekter; alla sju upptäcktes, alla filer återställda byte för byte. Ingår i
  `negative-controls:all`.
- `e2e/employer-portal-ux-evidence.spec.ts` med `e2e/support/employer-portal-fixture.ts`:
  sex sidor × sv/en × 1440/375 på den stubbade gränsen, fotografering plus
  beteendekontroller (flödesremsa, exakta länkar, symboler, menybeskrivningar,
  `phase=ready`, ingen horisontell scroll). Körs i `ci.yml`-jobbet
  `public-entry-browser` och i den nya workflowen `employer-portal-ux-evidence.yml`
  som fotograferar basen (före) och huvudet (efter) med samma svit.

Utfört lokalt (containern saknar delar av `node_modules`, se nedan):

| Kontroll | Utfall |
| --- | --- |
| `employer-portal-flow:check` | PASS |
| `negative-controls:employer-portal-flow` | 7/7 upptäckta, träd rent |
| `bun test scripts/recruiter-intelligence-ui.test.tsx` | 8 pass, 0 fail (RecruiterCounts/badges med nya symboler och förklaring) |
| `bun test scripts/playwright-mobile-presets.test.ts` | 4 pass, 0 fail |
| `library-structure`, `interview-ux-contract`, `employer-report-access`, `candidate-app-navigation`, `job-board-launch`, `employer-lifecycle`, `employer-process-continuity`, `recruitment-assessment-ux`, `emma-uat`, `passport-employer-verification`, `interview-pack-contract` | PASS |
| Partiell `tsc --noEmit` (TypeScript finns lokalt, routerpaket saknas) | inga fel i ändrade filer utöver "cannot find module"-brus; alla nya i18n-nycklar typkontrollerade |
| `recruitment-workspace:check`, `employer-access-lifecycle:check`, `send-test-dialog:check`, `recruiter-intelligence-review.test.tsx`, `interview-background-references.test.tsx` | INTE KÖRBARA lokalt (`@tanstack/*` saknas); körs i CI |
| `employer-library-purpose:check` | FAIL före och efter grenen ("library route no longer renders area=recruitment"); guarden körs inte i CI; förhandsbefintlig skuld |

Begränsningar att redovisa separat:

- **Lokal installation blockerad.** `bun.lock` hämtar 93 paket från Lovables privata
  npm-spegel (`europe-west1-npm.pkg.dev`, `europe-west4-npm.pkg.dev`); sessionens
  nätverkspolicy nekar CONNECT till båda. Därför är fullständig typkontroll,
  produktionsbygge, lint och Playwright inte körda lokalt. Allt detta körs i PR:ns CI.
- **Inloggade browsertester** mot riktig Auth/Storage/Postgres körs av
  `recruitment-evidence.yml` och `e4-evidence.yml` på PR:n (Supabase CLI-stack i CI).
  Syntetiska skärmbilder från den stubbade sviten är inte ett substitut och
  rapporteras separat. Hosted verifiering ingår inte.
- **Före/efter-bilderna** committas av `employer-portal-ux-evidence.yml` till
  `artifacts/employer-portal-ux/before/` och `after/` (24 + 24 PNG: sex sidor × sv/en ×
  1440/375, `SOURCE.txt` anger fotograferad commit). Visuellt granskade i denna session:
  översikten visar remsan, de tre förklaringsraderna, räknarblockets rubrik/inledning/
  "Vad räknas här?", symbol + text på de fyra kravstatusknapparna och de två raderna för
  granskning respektive intervjusteg; ansökningslistan visar remsan med aktuell station
  och kravstatus med symbol i tabell och mobilkort; rekryteringslistan, Tester,
  Intervjuer och Rapporter visar remsan under sin rubrik; i 375-bilderna radbryts remsan
  i tre rader, inget scrollar i sidled, och bildbredden 1125 px bekräftar DPR 3
  (verklig mobilemulering). Två fynd från granskningen är rättade i samma PR:
  menybeskrivningarna trunkerades mitt i ordet (radbryts nu till två rader) och
  rekryteringslistan hette "Jobbannonser" under menyposten "Rekryteringar" (heter nu
  Rekryteringar). Bilderna i `06e5a6c` (fotograferade från `2ad7a3d`) visar dessa två
  rättningar och är det par som gäller. Två tidigare bot-commits (`b887c64`, `ed6bf49`)
  skrev in ofullständiga uppsättningar från körningar som avbrutits av concurrency-regeln;
  workflowen committar sedan `2ad7a3d` bara när båda fotograferingsjobben lyckats, och
  `06e5a6c` skriver över de ofullständiga manifesten med 24 + 24 bilder.

## Kvarstående: lanseringshinder vs. kan vänta

Lanseringshinder (inte ändrade här, utanför UX-uppdraget):

- `not_established` saknar subtyp för "ingen kravprofil" respektive "profil utan
  skallkrav"; texten skiljer fallen men datat gör det inte. Kräver migration och
  behörighetstester.
- Hosted Auth-fixture/B-matris är fortsatt BLOCKED och fysisk telefon NOT RUN enligt
  Astras r11; detta pass ändrar inte det.

Kan vänta (backlog):

- Nästan all ny kopia i Astras P1-komponenter är inline `sv ? … : …`; flytta till
  ordböckerna. Föräldralösa nycklar efter P1: `employer.applications.lede`,
  `employer.applications.filter.all`, `employer.applications.sort.*`,
  `employer.jobs.list.applicationCount`, `employer.jobs.list.newCount`, `iiu.pp.nosources`.
- `RequirementProfilePanel` visar råa krav-UUID ("Befintligt krav-ID").
- Rapporter saknar släppta testrapporter och ansökningslänkar; `summary`-sidan har
  inga inlänkar; `hasMultipleWorkspaces` oanvänd i skalet; dubbel sökstate i
  rekryteringslistan.
- Vilande guards: `scripts/employer-recruitment-flow-check.ts` ankrar den gamla
  ansökningslistan och körs inte i CI; `employer-library-purpose-check` failar och
  körs inte i CI.
- Fotnoten "Test- och intervjuindikatorer kan överlappa" i räknarblocket beskriver
  indikatorer som bara finns i tabellvyn.

## GitHub → Lovable-synk → publicering → kontroll

1. Granska och merga PR:n till `main` med vanlig merge (ingen squash/rebase:
   AGENTS.md, Lovable-synk).
2. Lovable synkar `main` automatiskt. Verifiera i Lovable-editorn att senaste commit
   är merge-commiten (ready, agentFinished).
3. Inga migrationer ingår; `bun run release-parity:gate` ska vara oförändrat grönt.
4. Ägaren trycker **Publish** i Lovable-editorn. Synk är inte publicering.
5. Kontrollera publicerad version:
   `curl -s https://www.cqrityjob.com/release-identity.json` ska ge `commitSha` =
   merge-commiten och samma `sourceTreeSha256` som bygget av den commiten.
   Spara svaret som `docs/release/<datum>-employer-portal-ux-published-identity.json`.
6. Kontroll i publicerad app med syntetiskt konto: översiktens hjälptexter, flödesremsan
   på sex sidor, att-göra-länkarna (`stage=review`, `stage=interview`, `phase=draft`,
   `phase=ready`), symbol+text på kravstatus, "Till ansökan" i intervjuärendets huvud.
7. Återställning: `git revert -m 1 <merge>` och Publish igen. Inget schema att rulla.

Ingen publicering, AI-aktivering, automatisk gallring, worker/cron eller
kandidatutskick ingår i detta pass.
