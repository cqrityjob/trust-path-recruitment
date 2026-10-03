# Driftsättning: `transactional-email` version 3 (2026-10-03)

**Projekt:** `wrygicdfxwjnrugduxnt` (Supabase Pro, eu-central-1).

## Vad som driftsattes

|               |                                                                                                                                                                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Källa         | `supabase/functions/transactional-email/index.ts` på main `071f69e` (merge av #386). Filen är identisk med `43180b8`, den commit som granskningen godkände                                       |
| Driftsatt     | 2026-10-03 13:47:03 UTC, version 3, `verify_jwt = false` (funktionen autentiserar själv sin anropare)                                                                                            |
| `ezbr_sha256` | `f45137045e5b719db95ea38e1301104074e5131282a9250b343565f6cb1d34b1`                                                                                                                               |
| Före          | Version 1 (2026-09-30 18:47 UTC) nekade varje anrop från appen med 401. Version 2 driftsattes av något annat än den här sessionen efter merge, troligen Lovables synk, och ersattes av version 3 |
| Återställning | Version 1 finns sparad lokalt, men att gå tillbaka ger samma 401 som tidigare. Att återställa betyder i praktiken att stänga produktens mejl. Det görs genom att driftsätta om version 1         |

**Likvärdig representation.** I den driftsatta källan står tecknet ’ (U+2019) bokstavligt i teckenklassen för avsändarnamn. I repot står escape-sekvensen `\u2019`, så raden lyder `/[^\p{L}\p{N} .&'\u2019-]+/gu` i repot och `/[^\p{L}\p{N} .&'’-]+/gu` i driftsatt källa.

- Skillnaden uppstår när källan överförs vid driftsättningen.
- I ett reguljärt uttryck med flaggan `u` betecknar båda samma kodpunkt, så de matchar exakt samma tecken.
- Detta är den enda skillnaden mot main.
- Ingen ny driftsättning behövs för den, enligt ägarens beslut 2026-10-03.

## Anroparkontrollen i den driftsatta versionen

- Projektets Auth tillfrågas vid varje anrop. Ingen positiv cache finns, och miljöns egen nyckelkopia ger ingen genväg.
- Motstridiga headers, och `Authorization` som inte är `Bearer`, nekas först.
- Fel, timeout och interna fel ger 401.
- Granskningen godkändes på `43180b8` den 2026-10-03.

## Sluttester (T1–T6)

Körplanen finns i `docs/release/2026-10-03-production-test-request.md` (#387). Mottagarna är bara de adresser ägaren har godkänt, och de skrivs inte in i repot.

- **T1** går till en syntetisk kandidatadress som ägaren har godkänt.
- **T2–T6** går till ägarens godkända testadress.

Den här sessionen skickar, Sonnet-sessionen kontrollerar loggarna och ägaren bekräftar mottagningen.

| Test | Mejltyp                                    | Förutsättning                                                           | Status                                                                                                                                                                                                                                                                                                                                         |
| ---- | ------------------------------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1   | Registreringsbekräftelse (Auth/SMTP)       | Syntetisk adress utan konto (kontrollerat 14:40 UTC: 0 konton)          | **Godkänd.** Registrerad 14:40:46 UTC via www/signup med villkorsrutan (`terms_version` `2026-10-01-utkast`). Auth `user_confirmation_requested` 200. Ägaren öppnade mejlet. `/verify` 303 kl. 14:48:42 UTC med retur till `https://www.cqrityjob.com/login?redirect=/my-career`. Inloggning med lösenord 14:51:33 UTC landade på `/my-career` |
| T2   | Lösenordsåterställning (Auth/SMTP)         | Befintligt konto; länken används inte                                   | Skickad 14:10:52 UTC. **Mottagning bekräftad av ägaren** från no-reply@cqrityjob.com. Lösenordet är oförändrat. Länkens måldomän är ej verifierad. Mejlet skickades före Auth-rättningen                                                                                                                                                       |
| T3   | Kontakt: förfrågan till info@ och kvittens | Version 3 driftsatt och `RESEND_API_KEY` satt                           | **Godkänd.** Skickad 14:39:47 UTC via www/contact. `contact_enquiry` 200 och `contact_acknowledgement` 200, och Sonnets loggkontroll visar exakt två utskick. **Mottagning bekräftad av ägaren**: ämnet "Förfrågan: Rekrytering — CQrityjob lanseringstest", från CQrityjob <no-reply@cqrityjob.com>, kl. 14:39 UTC                            |
| T4   | Ansökningskvitto                           | Öppen testannons i testorganisationen                                   | Blockerad: testannonsens sista ansökningsdag var 2026-09-19, och annonsen visas som "Jobbet är inte tillgängligt". Väntar på att ägaren förlänger den                                                                                                                                                                                          |
| T5   | Rekryteringsmeddelande                     | Version 3 och en ansökan från T4                                        | Väntar på T4                                                                                                                                                                                                                                                                                                                                   |
| T6   | `employer_new_application`                 | #392 applicerad och registrerad, #393 mergad, funktionen driftsatt igen | Väntar                                                                                                                                                                                                                                                                                                                                         |

**Kandidatflöden i produktion med testkontot, 2026-10-03 14:51–15:05 UTC:**

- **Godkänt: sidor efter inloggning.** Översikt, Mina ansökningar, CV, profil och Security Passport öppnas utan fel och utan felsvar från Supabase. Ingen villkorsspärr visas, vilket är rätt för utkastvillkor.
- **Godkänt: Security Passport.** Passport skapat. En nationell testmerit (VU1) är sparad med ett märkt test-PDF som privat underlag.
  - Delningslänken skapas, och anonym visning visar meriten men varken dokument eller certifikatnummer.
  - Sidan har `noindex`.
  - Efter återkallelse visar samma länk "Delningslänken är inte längre tillgänglig".
- **Underkänt: delningslänkens domän.** Länken pekar på lovable.app, eftersom `SITE_ORIGIN` i main är lovable.app. #387 rättar det.
- **Ej verifierat: verifiering av meriten.** Granskningen görs av en administratör och väntar hos ägaren.
- **Godkänt: profil.** Yrkestitel och land sparas.
- **Underkänt: CV och export.** Varje sparat CV och dess PDF saknar alla anställningar. Det gäller 5 av 5 CV:n i produktion.
  - Rotorsak: ett faktabaserat CV sparas med tom anställningsordning.
  - Rättning i #398, som också lagar redan sparade CV:n utan dataändring.
- **Iakttagelse.** Katalognamnet för VU1 visas på engelska ("Security Guard Training 1") på det svenska CV:t och i delningen.
- **Iakttagelse.** Knappen "Skapa nytt AI-utkast" är aktiv på CV-sidan, fast AI är avstängt i produktion.

**Kontroller i produktion 2026-10-03, 14:36–14:41 UTC:**

- **Publicerad version.** Den publicerade sajten kör main `071f69e` (asset `index-owmCS86F.js`).
  - `/villkor` och `/integritetspolicy` visar utkastbanner och har `noindex`.
  - Registreringen har villkorsrutan, och kontaktformuläret är öppet.
  - Canonical och `og:url` pekar fortfarande på lovable.app. #387 rättar det.
- **Beredskap.** Readiness-anropet (GET) gav 200 kl. 14:37:19 UTC. Funktionen är version 4 med samma `ezbr_sha256` och samma källa som version 3.
- **Auth-omdirigering.**
  - `redirect_to=https://www.cqrityjob.com/...` godtas.
  - En främmande adress faller tillbaka till `https://www.cqrityjob.com`, som alltså är Site URL. Det visar Googles start-URL, utan att något mejl skickas.
- **AAAA-posten** för domänen utan www är borttagen. Där återstår bara A-posten 185.158.133.1.
  - HTTPS mot domänen utan www ger fortfarande TLS-fel, och HTTP ger 421. Lovable visar domänen som Stalled.

**Tidigare kontroller 2026-10-03:**

- **Obehöriga anrop till funktionen.** Anrop med anon- eller publishable-nyckel, förfalskade token, andra projekts nycklar, skräpvärden eller utan nyckel gav 401, både för GET och POST.
  - Undantag: en enstaka POST gav 504 efter 160 s, utan "booted" i loggen. Det upprepades inte; tre nya försök gav 401.
- **Appens servernyckel godtas.** Svaret blev 503 `not_configured`, inte 401.
- **Domäner.**
  - `https://www.cqrityjob.com` svarar 200, och `http://www` ger 301 till https.
  - `cqrityjob.com` (utan www) har både en A-post (185.158.133.1) och en AAAA-post (2a02:4780:9:2098::3a02:c73a:2). HTTPS ger TLS-fel, och HTTP ger 421.
- **Publicerad sajt.** Asset-filen är `index-xgt2Sdnu.js`. `/villkor` och `/integritetspolicy` ger 404, villkorsrutan saknas och canonical pekar på lovable.app. Lovable har synkat `071f69e` men inte publicerat den.
- **Auth-omdirigering.** Auth-loggen anger `referer` = lovable.app, fast appen bad om omdirigering till www.

Resultaten fylls i per test: tid i UTC, mejltyp, appens svar, funktionens och Auth-loggens status, antal mottagare utanför de godkända adresserna, ägarens bekräftelse på mottagning, och om länkarna fungerar.
