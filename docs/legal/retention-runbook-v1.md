# Gallringsrutiner för version 1

Status 2026-10-04: **dokumenterad och provad där det går, ännu inte genomförd.** Ingen rad i
lagringsplanen är `live` förrän dess rutin har körts och loggats (`src/lib/legal/retention-plan.ts`,
`RETENTION_READY`). Ingen destruktiv körning i produktion ingår i den här ändringen.

Detta är den minsta lösning som gör att policyns lagringstider går att stå för vid lansering: fungerande
kontoradering, manuell gallring där det är rimligt, en namngiven ansvarig, ett kontrollintervall och en enkel
logg. Automatisering väntar där en manuell rutin räcker. Inget i policyn lovar mer än rutinerna klarar.

| | |
|---|---|
| **Ansvarig** | **Mostafa Alshawi**. Han kör rutinerna, eller ger någon annan uttryckligt uppdraget och skriver det i loggen. |
| **Kontrollintervall** | Första arbetsdagen varje månad: R3, R4, R5, R6 och R9. Första arbetsdagen varje kvartal (jan, apr, jul, okt): R2 och R8. R1 och R7 när en begäran kommer. |
| **Logg** | `docs/legal/retention-execution-log.md`. En rad per körning, även när inget var förfallet ("0 förfallna" är ett giltigt resultat och bevisar att kontrollen gjordes). |
| **Regel** | Radera aldrig utan att först ha kört torrkörningen (steg 1) och skrivit ner siffran. Radera aldrig något som inte nämns här. Claude-sessionerna kör inga raderingar i produktion. |

## Vad som är förfallet först (så att ingen tror att något är försenat)

| Rutin | Första möjliga förfallodag | Skäl |
|---|---|---|
| R1 kontoradering | när någon begär det | |
| R2 inaktiva konton | 2028-07 | äldsta uppgifterna är från 2026-07, 24 månader |
| R3 feedback | 2027-08-15 | äldsta raden i `cd_test_feedback` är 2026-08-15 |
| R4 notisutkorg | 2027-01-01 | enda raden skapades 2026-10-03, 90 dagar efter avslut |
| R5 `info@` | ägaren läser äldsta tråden | brevlådan ligger utanför plattformen |
| R6 `job@` | 2028-10 | adressen infördes för lanseringen |

## R1. Avsluta ett konto på begäran (inom 30 dagar)

Förutsättning: **#416 (`20270208090000`) är sammanslagen och tillämpad.** Den är det (`abbc036e`, hostat
verifierad i #418). Databasdelen är bevisad lokalt med ett syntetiskt konto som har Passport-underlag
(`docs/release/2026-10-04-account-erasure-full-path-evidence.md`). Raden i planen blir `live` först när
ägaren har provat hela vägen i produktion med testkontot (steg nedan, "Första provet").

1. Begäran kommer till `info@cqrityjob.com` från den e-postadress som kontot är registrerat på. Skriv in
   den i begärandelogg (R9) med datum. Fristen är **30 dagar** enligt policyn och högst en månad enligt
   GDPR art. 12.3.
2. Admin → Användare → kontot. Läs "påverkan": vad raderas och om något hindrar. En arbetsgivaranvändare
   som äger en organisation eller har ansökningar stoppas med en blockerarkod. Lös den först (flytta
   ägarskap eller radera organisationen i ordning), radera inte runt den.
3. "Radera konto" (kräver superadmin). Skriv skälet (begärans datum) och bekräfta med kontots e-postadress.
4. Resultatet visar hur många lagringsobjekt som köades, raderades och är kvar. Är några kvar:
   Admin → Data → Lagringsradering → "Försök igen" tills antalet är 0.
5. Svara personen från `info@` att kontot är avslutat. Skriv i loggen: datum, begäran, "raderat", antal
   lagringsobjekt. Säkerhetskopior: raderingen når dem när de roteras ut (se R8, öppet faktum).

**Första provet i produktion (ägaren, en gång):** logga in som testkontot `8a0fdbc5-…`, lägg till ett
dokument i Security Passport (så att det finns underlag), logga ut, och radera kontot enligt steg 2–4.
Kontrollera efteråt att Admin → Data → Lagringsradering visar 0 kvar. Skriv resultatet i loggen. Först då
kan raden `account` flyttas till `live`.

## R2. Inaktiva konton (24 månader, påminnelse, radering 30 dagar senare)

Varje kvartal: kör `supabase/retention/inactive-accounts-24-months.list.sql` i Supabase SQL Editor. Listan
ändrar inget. För varje konto: skicka påminnelsen från `info@` ("ditt konto raderas om 30 dagar om du inte
loggar in"), skriv datumet i loggen, och 30 dagar senare kontrollera om personen har loggat in. Har hen inte
det: R1 från steg 2. Provad på syntetiska konton i `supabase/tests/retention_manual_routines_test.sql`
(RT3). Inget konto är gammalt nog före 2028-07.

## R3. Feedback (12 månader)

Varje månad: kör `supabase/retention/feedback-12-months.dry-run.sql`. Skriv de två siffrorna i loggen. Är
någon siffra över noll och förväntad: kör `supabase/retention/feedback-12-months.delete.sql` och skriv de två
borttagna antalen i loggen (de ska vara lika med torrkörningens). Provad i RT1, RT2 och RT4.

Kontoradering tar inte bort feedback: kopplingen till kontot tas bort (`ON DELETE SET NULL`) och raden
följer sin egen tid på 12 månader.

## R4. Notisutkorgen (90 dagar)

Varje månad tills svepningen är konfigurerad: kör `select public.rec_purge_employer_notices();` i SQL
Editor. Svaret är antalet borttagna rader. Skriv det i loggen. Funktionen tar bara avslutade rader äldre
än 90 dagar och aldrig en rad som väntar eller kan försökas igen. Provad i
`supabase/tests/employer_new_application_notices_test.sql` (EN8). När svepningen är konfigurerad
(`RECRUITMENT_SWEEP_URL` och `RECRUITMENT_SWEEP_TOKEN` finns i driftmiljön) kör den detta av sig själv, och
den här rutinen ersätts av en kontroll att svepningen körs.

## R5. Brevlådan `info@` (12 månader efter senaste kontakt)

Varje månad: sök i brevlådan efter trådar vars senaste meddelande är äldre än 12 månader. Radera dem. Skriv
antalet i loggen. Det är manuellt eftersom brevlådan ligger i e-postleverantörens tjänst, inte i plattformen.

## R6. Brevlådan `job@` (24 månader efter avslutad rekrytering)

`job@` hanteras av CQrityjob. Inget vidarebefordras automatiskt. Varje månad: sök efter trådar vars
senaste meddelande är äldre än 24 månader och radera dem. Regeln är försiktig: rekryteringen kan inte ha
avslutats senare än sitt sista meddelande. Skriv antalet i loggen. Inget kan vara förfallet före 2028-10.

## R7. En arbetsgivare ber om radering eller kortare tid

Det finns inget beslutat standardvärde för rekryteringsmaterial (se `retention-plan.ts`, raden
`recruitment`: ägaren har inte beslutat 24 månader och anonymisering). Därför finns ingen automatisk
rutin. Kommer en begäran från en arbetsgivare: hantera den som en ordinarie begäran enligt
personuppgiftsbiträdesavtalet, i den ordning avtalet anger, och skriv den i R9-registret och i loggen. Den
äldre funktionen `sweep_application_retention()` får inte köras eller schemaläggas.

## R8. Leverantörernas inställningar (kvartalsvis)

Ägaren läser och skriver i loggen: loggarnas lagringstid i Supabase (Logs), e-postloggarnas i Resend,
sessionernas längd i Supabase Auth, och säkerhetskopiornas rotation i Supabase (Database → Backups, och om
Point-in-time recovery är på). De fyra siffrorna är det som ersätter de öppna punkterna i policyns avsnitt 9
och 6. Se `docs/legal/open-facts-2026-10-04.md`.

## R9. Brevlådor och GDPR-frister

Se `docs/legal/mailbox-and-gdpr-routine.md`.

## Rader som saknar beslutad tid

| Rad | Läge |
|---|---|
| Rekryteringsmaterial utan arbetsgivarens regel | ägaren har inte beslutat 24 månader och anonymisering; policyn visar en öppen punkt |
| Granskningsloggar | ägaren har inte beslutat 24 månader; policyn visar en öppen punkt |
| Användningsstatistik | mätningen är avstängd i version 1 (`FUNNEL_MEASUREMENT_ENABLED = false`); 339 äldre rader väntar på ägarens beslut (`docs/release/2026-10-04-funnel-measurement-off.md`) |
| Bokföringsunderlag | bolagets bokföring; ägaren bekräftar |

## SQL-filerna

Texten här är samma som i filerna. `launch-legal:check` kräver att varje fil finns och ligger i den här
filen ordagrant, och `retention_manual_routines_test.sql` kör just dessa filer på syntetiska data.

### `supabase/retention/feedback-12-months.dry-run.sql`

```sql
-- R3, step 1: beta and test feedback older than 12 months. Counts only; changes nothing.
-- Run in the Supabase dashboard, SQL Editor. Write the two numbers in the execution log.
select 'beta_feedback' as source, count(*) as due, min(created_at) as oldest
  from public.beta_feedback
 where created_at < now() - interval '12 months'
union all
select 'cd_test_feedback', count(*), min(submitted_at)
  from public.cd_test_feedback
 where submitted_at < now() - interval '12 months';
```

### `supabase/retention/feedback-12-months.delete.sql`

```sql
-- R3, step 2: delete beta and test feedback older than 12 months.
-- Only after the dry run, and only when its numbers are what you expect.
-- Run in the Supabase dashboard, SQL Editor. Write the two numbers in the execution log.
with b as (
  delete from public.beta_feedback
   where created_at < now() - interval '12 months'
  returning 1
), t as (
  delete from public.cd_test_feedback
   where submitted_at < now() - interval '12 months'
  returning 1
)
select (select count(*) from b) as beta_feedback_deleted,
       (select count(*) from t) as cd_test_feedback_deleted;
```

### `supabase/retention/inactive-accounts-24-months.list.sql`

```sql
-- R2: accounts that have not signed in for 24 months (or never signed in and were
-- created 24 months ago). A list only; changes nothing. Run quarterly in the
-- Supabase dashboard, SQL Editor. For each row: send the reminder from info@, write
-- the date in the execution log, and 30 days later close the account through the
-- admin console if the person has not signed in (runbook R1).
select u.id,
       u.email,
       u.created_at,
       u.last_sign_in_at,
       coalesce(u.last_sign_in_at, u.created_at) as inactive_since
  from auth.users u
 where coalesce(u.last_sign_in_at, u.created_at) < now() - interval '24 months'
 order by inactive_since;
```

## Vad som har provats och vad som inte har det

| Rutin | Provad | Hur |
|---|---|---|
| R1 databasdelen | ja, lokalt | syntetiskt konto med Passport-underlag, hela RPC-vägen (se bevisdokumentet) |
| R1 i produktion | **nej** | ägarens första prov, ovan |
| R2 listan | ja | RT3, syntetiska konton |
| R3 | ja | RT1, RT2, RT4 |
| R4 | ja | EN8 i den befintliga notistesten |
| R5, R6 | nej | manuella i brevlådan; första kontrollen loggas |
| R7 | nej | ingen rutin finns att prova |
| R8 | nej | ägarens uppgifter |
