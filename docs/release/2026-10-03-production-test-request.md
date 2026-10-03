# Begäran: produktionstester från www.cqrityjob.com

**Status: förberedd för ditt godkännande. Inget i detta dokument har genomförts.** Ingen
produktionsskrivning, inget mejlutskick, inget konto och ingen konfigurationsändring har gjorts
av den som skrev dokumentet. Underlaget bygger på PR
[#387](https://github.com/cqrityjob/trust-path-recruitment/pull/387) (utkast) och
`docs/release/2026-10-03-www-domain-cutover.md`.

Syftet är att Astra ska kunna upprepa de kritiska kundresorna oberoende. Allt nedan görs
**efter** att ändringarna är mergade, publicerade i Lovable och att Auth-inställningarna i
`2026-10-03-www-domain-cutover.md` (S1, S2, S8) är gjorda. Kör inte provet innan dess: Auth och
kontaktformuläret är då kända som ej fungerande från www.

## 0. Vad som behöver godkännas först

| # | Godkännande | Gäller |
|---|---|---|
| A1 | Merge av #387 (och Claude-sessionens #386) | koden |
| A2 | Publicering i Lovable | gör ändringarna synliga på www |
| A3 | Auth: Site URL och Redirect URLs (S1, S2) | bekräftelse, återställning, Google |
| A4 | Diagnos och rättning av `transactional-email` (S8) | kontaktformulär, kvitton, inbjudningar |
| A5 | De tre migrationerna `20270130090000`, `20270131090000`, `20270201090000` (schema först, i den ordningen, med hostat md5 kontrollerat före) | jobbens redigeringslås, publiceringsfönster, CV-bucket |
| A6 | Testkonton och mottagaradresser enligt avsnitt 1 | alla mejl |
| A7 | Städning enligt avsnitt 6 | efter provet |

Migrationerna ska vara applicerade **före** jobbtesterna i avsnitt 4; appens ändringar fungerar
även utan dem (de är skrivna för att tåla gammalt schema), men då är redigeringslåset och
bucket-skärpningen inte verifierade.

## 1. Testkonton och mottagaradresser (att godkänna)

Alla konton är syntetiska och skapas på www i produktion. Inga riktiga kandidatuppgifter används.
Föreslagna adresser är platshållare: ange riktiga brevlådor som ni kontrollerar (plus-adressering
på en egen brevlåda räcker, t.ex. `qa+k1@<er domän>`).

| Roll | Beteckning | Mottagaradress (att fylla i) | Skapas som |
|---|---|---|---|
| Kandidat 1 | K1 | `qa+k1@…` | vanlig kandidat |
| Kandidat 2 | K2 | `qa+k2@…` | vanlig kandidat (andra personen: behörighetsprov, återställning) |
| Företag A, ägare | A-OWN | `qa+aown@…` | registrerar "QA TESTFÖRETAG A" |
| Företag A, kollega med bedömarbehörighet | A-REV | `qa+arev@…` | kandidatkonto som ansluter till A, får bedömarbehörighet |
| Företag A, vanlig kollega | A-MEM | `qa+amem@…` | ansluter till A som vanlig medlem |
| Företag A, kollega som tas bort | A-REM | `qa+arem@…` | ansluter till A, tas sedan bort |
| Företag B, ägare | B-OWN | `qa+bown@…` | registrerar "QA TESTFÖRETAG B" |
| Plattformsadmin | ADMIN | befintligt adminkonto (ägarens) | godkänner A och B, tar bort medlem |

Mottagande brevlådor som ska finnas: `info@cqrityjob.com` (kontaktformulär och admin-avisering),
`job@cqrityjob.com` (Reply-To för kvitton och meddelanden). `no-reply@cqrityjob.com` ska bara
skicka.

### Planerade utskick (cirka 21 mejl till 7 testadresser + `info@`)

| # | Mejl | Från | Till | Kontroll |
|---|---|---|---|---|
| M1 | Kontaktförfrågan (sv) | no-reply | `info@` | ämne, innehåll, Reply-To = avsändaren |
| M2 | Kvittens på kontaktförfrågan (sv) | no-reply | avsändaren | svenska, Reply-To `info@`, inga länkar |
| M3–M4 | Samma på engelska | | | engelska |
| M5 | Bekräftelsemejl kandidat | Auth | K1 | länkens värd är `www.cqrityjob.com`, landar på avsedd sida |
| M6 | Bekräftelsemejl företagsregistrering | Auth | A-OWN | landar på `/employer` med "Företagskonto granskas" |
| M7 | Registrering mottagen (till företaget) | no-reply | A-OWN | Reply-To `info@`, länk till www |
| M8 | Admin-avisering om registrering | no-reply | `info@` | länk till www, ingen Reply-To |
| M9–M10 | Samma för företag B (bekräftelse, mottagen, admin) | | B-OWN, `info@` | |
| M11 | Bekräftelse K2 | Auth | K2 | |
| M12 | Lösenordsåterställning | Auth | K2 | länk till `www…/reset-password`, ogiltig/utgången länk visar rätt text |
| M13–M15 | Bekräftelser A-REV, A-MEM, A-REM | Auth | respektive | |
| M16 | Ansökningskvitto | no-reply | K1 | Reply-To `job@`, länk till `www…/my-career/applications` |
| M17 | Kandidatmeddelande från arbetsgivare | no-reply | K1 | Reply-To `job@`, rätt avsändarnamn/företag |
| M18–M19 | Testinbjudan | no-reply | K1 och K2 | länk till `www…/academy`, rätt språk |
| M20 | Återförsök av en testinbjudan (en mottagare) | no-reply | K2 | exakt ett mejl, inte dubblett |

Leverantörens "accepterad" räknas inte som mottagning: varje mejl kontrolleras i brevlådan
(avsändare, Reply-To, språk, länkens värd, att länken öppnas). Spara rubrikerna (From, Reply-To,
Message-ID) och ett skärmklipp per mejl.

## 2. Direktlänkar och omladdning (utloggad, sv och en, dator och 375 px)

För varje adress: öppna direkt i ett nytt fönster, ladda om (F5), kontrollera 200, att sidan
renderas, rätt språk, att "Tillbaka" fungerar och att `<link rel="canonical">` och `og:url`
börjar med `https://www.cqrityjob.com/` (visa källa).

`/`, `/jobs`, `/jobs/<en publicerad annons>`, `/jobs/family/<id>`, `/jobs/profession/<slug>`,
`/career-center`, `/career-center/<yrke>`, `/career-center/yrke/<slug>`, `/employers`,
`/plattformen`, `/about`, `/contact`, `/security-passport`, `/security-passport/india`,
`/sakerhetsarbete`, `/assessment`, `/security-career-assessment`, `/login`, `/signup`,
`/reset-password`, `/villkor`, `/integritetspolicy` (när #386 är mergad), `/sitemap.xml`
(alla `<loc>` på www, inga noindex- eller omdirigeringssidor), `/robots.txt` (`Sitemap:` på www),
en stängd annons (förväntat 404), en obefintlig adress (översatt 404 med navigering).
Skyddade adresser utloggade (`/my-career`, `/passport`, `/employer`, `/feedback`): ska leda till
`/login?redirect=…` och tillbaka efter inloggning.

## 3. Kundresan (en kedja, i ordning)

| Steg | Gör | Förväntat |
|---|---|---|
| 1 | Kontaktformuläret sv och en, med giltiga och ogiltiga fält, och ett med ogiltig e-post | validering; M1–M4; bekräftelse **bara** när leverantören accepterat; vid fel: korrekt felmeddelande med `info@` |
| 2 | K1 registrerar sig från en annonssida ("Ansök" → skapa konto) | M5; bekräftelselänken (öppnad på telefon) landar inloggad på annonsen med ansökningsdialogen; öppnad på dator räcker "Jag har bekräftat – fortsätt" |
| 3 | Logga ut, logga in, logga ut; Google-inloggning om knappen visas | rätt destination; vid avstängd leverantör sanerat felmeddelande |
| 4 | K2 registrerar sig; begär lösenordsåterställning | M11–M12; länken landar på `/reset-password`; nytt lösenord fungerar, gammalt nekas |
| 5 | A-OWN registrerar företag; ADMIN godkänner; B-OWN likaså | M6–M10; "Företagskonto granskas" med nästa steg; efter godkännande öppnas arbetsytan |
| 6 | A-REV, A-MEM, A-REM begär anslutning; A-OWN godkänner, ger A-REV bedömarbehörighet | roller syns rätt |
| 7 | **Jobb** (A-OWN): skapa, förhandsgranska, publicera, redigera utkast, stäng, återställ och publicera igen. Annons med extern länk och med intern ansökan. B-OWN försöker nå A:s annons (ska nekas) | redigerat innehåll visas; en stängd annons försvinner ur lista och sökning; detalj-URL ger 404; återställd annons med passerat slutdatum nekas med begripligt fel |
| 8 | **Ansökan** (K1): sök med CV; dubbelklicka "Skicka"; ladda om och försök igen | exakt en ansökan, rätt jobb och företag, M16; "Mina ansökningar" visar den; återta och sök igen fungerar |
| 9 | A-OWN öppnar ansökan, läser CV, byter status, skickar meddelande | M17; K1 ser meddelandet i inkorgen |
| 10 | **Test** (A-OWN): skicka ett test till K1 och K2 samtidigt (utan intervjuärende); skicka om till K2 | M18–M20; ingen dubblett; K1 genomför och lämnar in; resultatet syns för A-OWN |
| 11 | **Rapport**: A-OWN frisläpper; A-OWN, A-REV, A-MEM läser (nuvarande modell: alla tre får läsa, se säkerhetsmemot); intervju/bedömning/rapport enligt befintlig modell | |
| 12 | **Negativa åtkomstprov:** K2 öppnar K1:s resultat/ansökan (nekas); B-OWN öppnar A:s resultat och ansökningar (nekas); utloggad öppnar resultat-URL direkt (leder till inloggning); ADMIN tar bort A-REM, A-REM laddar om och försöker öppna A:s resultat (nekas) | alla nekas utan datavisning |
| 13 | **Passport-delning:** K1 skapar ett självdeklarerat meriter, delar, öppnar `https://www.cqrityjob.com/p#<token>` i ett privat fönster/annan webbläsare; kontrollera `curl -sI https://www.cqrityjob.com/p` (nonce-CSP utan `'self'`); återkalla | delningen visar vad mottagaren får se; efter återkallning "inte tillgänglig" |
| 14 | Mobil (375 och 390 px) för steg 2, 8, 10 | inga avskurna knappar, ingen horisontell scroll |

Spara per steg: tid, adress, skärmklipp, ev. mejlrubriker.

## 4. Det som kräver att migrationerna är applicerade (steg 7 och 8)

- Direkt PATCH mot en publicerad annons som vanlig medlem ska nekas (kräver `20270130090000`).
- Återställning + publicering med passerat slutdatum ska nekas av databasen, och en
  `javascript:`-länk som ansökningsadress ska nekas (kräver `20270131090000`).
- En kandidat ska inte kunna skriva eller ta bort filer i CV-bucketen direkt (kräver
  `20270201090000`).
Verifieringsfrågorna (skrivskyddade) finns i respektive migrations post i
`supabase/release-state.json`.

## 5. Skickas ingenting utan godkännande

Inget mejl skickas innan A6 är godkänt. Varje utskick ovan går till en namngiven testadress eller
till `info@`/`job@`. Inga kandidatuppgifter från verkliga personer används, och testföretagen
skapas med tydlig "QA TEST"-märkning.

## 6. Städning efter provet (kräver godkännande A7)

Följ `docs/release/production-readiness/production-data-hygiene.md`, i denna ordning:

1. Återkalla testets Passport-delning (K1, i produkten).
2. Stäng och radera testannonserna (archive → delete via jobbens egna RPC:er).
3. `moderate_employer` → arkivera "QA TESTFÖRETAG A" och "B"; radera om schemat tillåter.
4. Ta bort testkontona via adminvägen (`admin_delete_user_if_safe`, annars `admin_anonymise_user`),
   vilket tar med ansökningar och filer och köar radering av lagrade filer.
5. Kör adminsidans storage-erasure-kö och bekräfta att `storage_erasure_queue` töms.
6. Återkalla/låt gå ut eventuella testgrants.
7. Kör de skrivskyddade inventeringsfrågorna och bifoga resultatet: antal
   `auth.users`/`employers`/`jobs`/`job_applications`/`assessment_assignments` jämfört med före provet.

Städningen rör aldrig befintliga ägar-, admin- eller UAT-konton som ägaren inte uttryckligen
listat.

## 7. Vad som redan är bevisat utan produktion (och vad som inte är det)

Bevisat lokalt: hela migrationskedjan och alla SQL-sviter på PostgreSQL 16, åtkomstmatrisen
(45 påståenden), skyddsskripten, byggd SSR-HTML med www i canonical/og:url/sitemap/robots, och
webbläsarspecar mot stubbad backend. **Inte** bevisat: något som kräver GoTrue, Resend, Lovables
värd eller DNS — alltså alla rader i avsnitt 3 som involverar mejl, bekräftelselänkar, Google,
publicerad version och domänomdirigering.
