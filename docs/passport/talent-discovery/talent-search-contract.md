# Talangsökning — kontrakt

Vad en arbetsgivare får se när en person valt att vara sökbar, vem som får se det, och vad
som aldrig visas. Gäller migrationerna `20270317090000_sp_talent_discovery` och
`20270318090000_rec_talent_search_and_contact`.

Talangsökningen är ett **eget, uttryckligen auktoriserat användningsfall**. Den ändrar inget i
[application-disclosure-contract.md](../application-disclosure-contract.md): en ansökningsbunden
delning läses fortfarande bara genom `sp_application_disclosure`, och en sådan delning kan
inte slå på sökbarhet.

## 1. Personens val

| Läge                | Betydelse                       | Sökbar?                                |
| ------------------- | ------------------------------- | -------------------------------------- |
| `private` (förvalt) | Passport används privat         | Nej                                    |
| `open`              | Öppen för relevanta möjligheter | Ja                                     |
| `active`            | Aktivt jobbsökande              | Ja (arbetsgivaren kan filtrera på det) |

- **Avstängt från början.** Ingen rad = privat. Migrationen skapar inga rader; postflight
  stoppar den om en rad finns.
- **Samtycke är en egen handling.** `sp_talent_save_settings` kräver en samtyckesversion
  (`consent_text_version`) och minst en vald merit eller erfarenhet för att gå från privat.
  Varje lägesbyte skrivs i `sp_talent_consent_events` (append-only).
- **Bara valda uppgifter.** `sp_talent_items` anger exakt vilka meriter och
  erfarenhetsperioder som är sökbara. Inget annat i Passport läses.
- **Paus i ett klick.** `sp_talent_pause` sätter privat, behåller urvalet och **byter
  referensen** (`search_ref`). En profil i en gammal resultatlista slutar fungera direkt.
- **Stoppa ett företag.** `sp_talent_blocks`: företaget hittar inte personen och kan inte
  kontakta henne. Kan ångras.
- **Förhandsvisning = verklighet.** `sp_talent_preview` och arbetsgivarens läsningar anropar
  samma byggare, `sp_talent_card`. Förhandsvisningen kan inte skilja sig från det som visas.

## 2. Vad arbetsgivaren ser (`sp_talent_card`)

**Visas:** opak referens · läge · jobbpreferenser (yrkesområden, länder, orter,
anställningsformer, arbetsplatstyp, tillgänglig från) · per merit: katalogkod, fullständigt
namn (sv/en), förkortning, klass (utbildning / certifiering / reglerad behörighet),
jurisdiktion, giltighetsjurisdiktion, utfärdandeår, giltig till, giltighetsläge, nivå, och
**att** en begränsning finns · per erfarenhetsperiod: rolltitel, säkerhetsrelevans, start- och
slutmånad, antal månader, nivå · totala säkerhetsrelevanta månader (unionen av perioder,
inga dubbelräknade överlapp).

**Visas aldrig:** namn eller kontaktuppgifter (före accepterad kontakt) · dokument · merit-
eller licensnummer · egna anteckningar · begränsningens fritext (t.ex. skyddsobjekt) ·
arbetsgivarnamn i erfarenheten · granskningsanteckningar · användar-id · återkallade,
återtagna, ersatta eller utkastmeriter.

**Nivåer, i ord:**

| Nivå                 | Betyder                                   | Betyder **inte**                |
| -------------------- | ----------------------------------------- | ------------------------------- |
| `self_declared`      | Personens egen uppgift                    | —                               |
| `document_provided`  | Underlag uppladdat, inte granskat         | Granskat                        |
| `document_reviewed`  | CQrityjob har granskat dokumentet         | Bekräftat av utfärdaren         |
| `employer_confirmed` | Arbetsgivaren har bekräftat anställningen | —                               |
| `source_confirmed`   | Bekräftat mot utfärdarens källa           | _Ingen sådan väg är aktiverad._ |

En ändrad merit (ny version via `sp_correct_claim`) följer med i urvalet men **ärver inte** ett
tidigare godkännande: en materiell ändring börjar som egen uppgift.

## 3. Vem får söka

`rec_talent_user_may_search(user, job)`:

- jobbet är publicerat och öppet (`job_is_active`),
- företaget är godkänt (`status='active'`),
- användaren är aktiv medlem **och** ägare/admin, eller jobbets rekryteringsansvarige.

Ett vanligt medlemskap ger **inte** rätt att söka, läsa profiler, kontakta eller läsa
kontaktlistan. Alla nekanden (okänt jobb, utkast, annat företag, saknad roll, avstängt
företag) ger samma svar: `TALENT_SEARCH_NOT_AVAILABLE`.

## 4. Kravprofilen kopplad till katalogen

`rec_requirement_criteria_sets` binder varje krav i jobbets **bekräftade** kravprofil:

| Klass                     | Bindning                                                    | Utvärderas mot              |
| ------------------------- | ----------------------------------------------------------- | --------------------------- |
| `regulated_authorisation` | 1–5 katalogkoder av typen licens, ev. jurisdiktion          | Bara exakt dessa koder      |
| `certification`           | 1–5 katalogkoder (internationella certifieringar m.m.)      | Bara dessa koder            |
| `education`               | 1–5 katalogkoder (utbildningar, nationella kvalifikationer) | Bara dessa koder            |
| `experience`              | Minsta antal säkerhetsrelevanta månader                     | Valda erfarenhetsperioder   |
| `unbound`                 | Ingen                                                       | Alltid ”klarläggs i dialog” |

Koder av olika klasser kan inte blandas i ett krav (`TALENT_CRITERIA_MIXED_CLASSES`). En
internationell certifiering kan därför aldrig uppfylla ett krav på lokal behörighet.

Kriterierna är versionerade och oföränderliga. Ett kriterieset gäller bara för den
profilversion det bekräftades mot. Ändras kravprofilen måste kriterierna bekräftas igen
innan sökning (`criteria_required`).

## 5. Utvärdering och ordning

Per krav ett av fyra lägen:

| Läge                  | Betyder                                                                                                                                                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `evidenced`           | En vald merit/erfarenhet stödjer kravet                                                                                                                                                                                                                      |
| `needs_clarification` | Något finns men behöver klarläggas: `expired`, `not_yet_valid` och `validity_not_stated` (bara när arbetsgivaren kräver giltig merit; annars är `expired`/`not_yet_valid` en notering), `other_jurisdiction`, `level_below_requested`, `fewer_months_shared` |
| `not_shared`          | Inget bland de uppgifter personen gjort sökbara. **Betyder inte att personen saknar det.**                                                                                                                                                                   |
| `to_clarify`          | Kravet kan inte läsas ur ett Passport                                                                                                                                                                                                                        |

Noteringar som inte ändrar läget: `expiring_soon`, `scope_limited`, `self_declared`,
`experience_declared`, `international_certification_is_not_authorisation`.

**Med i resultatet:** personer med minst ett krav som berörs av en delad uppgift.

**Ordning (dokumenterad och returnerad med resultatet):**

1. antal obligatoriska krav med stöd,
2. av dessa: antal granskade (dokumentgranskade eller arbetsgivarbekräftade),
3. antal meriterande krav med stöd,
4. antal uppfyllda jobbpreferenser (yrkesområde, ort/land/distans, anställningsform),
5. opak referens (stabil, utan koppling till namn, ålder eller annat).

Ingen poäng, procentsats, rangordningssiffra, lämplighetsbedömning, rekommendation eller
automatiskt avslag. Inga personlighetsdata. Max 50 visade; totalen räknar bara sökbara
personer.

**Filter:** alla obligatoriska med stöd · minst ett granskat obligatoriskt · inga utgångna
obligatoriska · aktivt jobbsökande · jobbpreferens uppfylld.

"Obligatoriska krav" i räkningen och i filtren är de krav som kan läsas ur ett Passport.
Ett krav i läget `to_clarify` (t.ex. körkort när det inte finns i katalogen) räknas varken
som uppfyllt eller ouppfyllt; det visas separat som "klarläggs i dialog" och redovisas i
`summary.toClarify`.

## 6. Kontakt

`rec_talent_send_contact(job, ref, message, idempotency_key, locale)`:

- knuten till jobbet; meddelande 20–2000 tecken;
- idempotent per (företag, nyckel); en öppen förfrågan per (jobb, person); en avböjd skickas
  inte igen för samma jobb;
- tak: 20 per avsändare och dygn, 60 per företag och dygn, 3 öppna per person och företag;
- personen notifieras (inkorg + mejl).

Personen ser företag, tjänst, ort, meddelande och om tjänsten är öppen
(`sp_talent_my_contacts`), och kan:

- **acceptera** — företaget får se personens visningsnamn och kan bjuda in till ansökan.
  Ingen ansökan skapas och inget mer delas;
- **avböja** — företagets ögonblicksbild rensas;
- **avböja och stoppa kontakt från företaget** — som ovan, och alla öppna förfrågningar från
  företaget avböjs.

Söker personen sedan tjänsten (med eget val om Passport-delning i det befintliga
ansökningsflödet) länkas ansökan till kontakten, och rekryteringen fortsätter i den befintliga
ansökningsvyn med dess meddelanden.

## 7. Aktualitet och historik

Allt läses live genom `sp_talent_card`: ändrad giltighet, utgång, återkallad granskning,
borttagen merit, ändrat urval och paus syns vid nästa läsning. Det finns inget sökindex
utöver tabellerna; avgränsningen görs i databasfunktionerna, inte i klienten.

Företagets **historiska rekryteringsunderlag** är kontaktförfrågans ögonblicksbild
(`snapshot`, `snapshot_at`): det företaget såg när det skrev, visat med tidpunkt och skilt från
aktuell sökbarhet (`currentlyDiscoverable`). Den rensas när personen avböjer eller
förfrågan dras tillbaka.

Anställning ändrar ingenting här: ingen talangdelning blir stående åtkomst i Workforce. Efter
paus kan arbetsgivaren inte läsa den levande profilen, inte heller efter anställning.

## 8. Mätning

`product_metric_events` har bara händelsenamn och tidpunkt: första sparade merit, begärd
granskning, aktiverad sökbarhet, kontaktförfrågan, accepterad kontakt. Ingen person, inget
innehåll. Läses aggregerat av plattformsadministratör (`product_metric_counts`).

## Rättningar efter oberoende granskning 2026-10-15

Regressionssviten är `supabase/tests/talent_review_findings_test.sql`. Utfall före och efter rättningen
finns i [review-2026-10-15/](review-2026-10-15/).

| Fynd | Regel som nu gäller                                                                                                                                                                                                                                                                                                                                   |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RF1  | Varje `SECURITY DEFINER`-funktion som en inloggad klient kan anropa kör `sp_assert_passport_session()` först. Det är samma regel som den restriktiva RLS-policyn på privata Passport-tabeller. En återkallad session får `SP_SESSION_REVOKED` från innehavarens, granskarens och rekryterarens sida. Talangtabellerna har samma restriktiva lässkydd. |
| RF2  | En Passport-granskare läser bara poster som har ett CQrityjob-granskningsärende, och bara det ärendet. Arbetsgivarintyg, deras beslut och interna anteckningar syns aldrig för granskaren. Innehavaren läser aldrig en intern anteckning.                                                                                                             |
| RF3  | En notis som delas ut på nytt efter låsets utgång kontrolleras mot mottagarens behörighet, precis som `pending` och `failed`. Inkorgen visar bara notiser som mottagaren fortfarande har rätt att se, och tabellen går inte att läsa direkt.                                                                                                          |
| RF4  | En korrigering ersätter den sökbara versionen, både för meriter och anställningsperioder. Urvalet innehåller aldrig en ersatt version.                                                                                                                                                                                                                |
| RF5  | Att blockera en organisation är en enda handling, även när det sker som ett upprepat svar. Alla öppna förfrågningar från organisationen avböjs och deras snapshots rensas. Organisationen ser inte längre personen som sökbar.                                                                                                                        |
| RF6  | Giltigheten tar hänsyn till `valid_from` (`not_yet_valid`). Utgången eller ännu inte giltig merit ändrar läget bara när arbetsgivaren kräver en giltig merit.                                                                                                                                                                                         |
| RF7  | `rec_talent_confirm_criteria(job, expectedVersion, profileId, criteria)`: kriterier binds till den kravprofilversion som användaren har sett. En profil som ändrats under tiden nekas med `TALENT_CRITERIA_STALE`.                                                                                                                                    |
| RF8  | En beslutsnotis bär sin `verificationMethod`. Mejl och inkorg skiljer arbetsgivarbekräftelse från CQrityjobs dokumentgranskning.                                                                                                                                                                                                                      |
| RF9  | Appen: produktmejl skickas bara när miljön uttryckligen säger något annat. Utan mottagarlista nekas utskick, utom med `PRODUCT_EMAIL_MODE=production`. Se app-PR:en.                                                                                                                                                                                  |
