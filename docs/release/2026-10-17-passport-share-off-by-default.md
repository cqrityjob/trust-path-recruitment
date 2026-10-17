# 2026-10-17 — Passport-delning i ansökan är avmarkerad från början

Endast en appändring. Schemat ändras inte. Databasens standardval var redan att inte dela,
och SQL-testet AC1 i `supabase/tests/sp_application_passport_test.sql` håller fast vid det.

## Varför

Den oberoende acceptansen 2026-10-17 visade att rutan "Ta med mitt verifierade Security
Passport" i ansökningsdialogen var ikryssad från början. En kandidat delade alltså sitt
Passport om hen inte själv upptäckte rutan och kryssade ur den.

## Ändring

- Rutan är avmarkerad tills kandidaten själv kryssar i den
  (`src/components/jobs/ApplyInternalDialog.tsx`).
- Etiketten beskriver handlingen: "Dela mitt verifierade Security Passport med arbetsgivaren".
  Ingressen inleds med "Frivilligt".
- En statusrad med `aria-live` visar om Passportet delas eller inte.
- Det som skulle delas, och det som aldrig delas, syns före valet.

## Bevis

- `scripts/application-dialog-scroll-check.ts` stoppar bygget om standardvalet blir `true`.
- E2E-testet `talent-discovery-local.spec.ts` (scenario 8) kontrollerar att rutan är
  avmarkerad och att statusraden säger "delas inte". Sedan kryssar kandidaten i rutan själv.

## Uppföljning

En förhandsvisning av exakt vad arbetsgivaren får kräver
`sp_preview_application_disclosure` (`20270322090000`, #479). Den kommer i en separat
app-ändring när funktionen är installerad.
