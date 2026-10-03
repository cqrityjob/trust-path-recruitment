# Beslutslista: användarvillkor och integritetspolicy

**Status: väntar på ägarens beslut.** Båda dokumenten är **utkast** så länge
en enda punkt nedan är öppen. Produkten avgör det själv
(`src/lib/legal/status.ts`). Ett utkast:
- visar en utkastbanner;
- är `noindex` och finns inte i sitemapen;
- registrerar godkännanden som `2026-10-01-utkast`.

När den sista platshållaren är ersatt blir dokumentet slutligt, utan någon
annan ändring. Alla som har godkänt utkastet ombeds då godkänna igen.

Uppgifterna nedan är verifierade den 2026-10-03 mot koden på `main` och med
enbart läsfrågor mot produktion (`wrygicdfxwjnrugduxnt`). Inga personuppgifter
har lästs ut.

## A. Användarvillkor

### A1. §2 Åldersgräns
- **Platshållare:** "[Ange beslutad åldersgräns och eventuella regler för
  minderåriga användare.]"
- **Verifierat:** Registreringen frågar inte efter ålder eller födelsedatum
  (namn, e-post, lösenord och eventuellt organisation). Det finns ingen
  ålderskontroll i produkten.
- **Rekommendation:** *"Du måste vara minst 18 år för att skapa ett konto."*
  Tjänsten gäller arbete och rekrytering inom säkerhetsbranschen. 18 år
  undviker särregler för barns samtycke och avtal.
  - Alternativ: 16 år med regler för vårdnadshavare. Det kräver mer text och
    i praktiken en ålderskontroll.

### A2. §13 Avsluta konto
- **Platshållare:** "Du kan avsluta ditt konto genom [ange faktiskt
  tillgängligt förfarande]."
- **Verifierat:** Det finns ingen självbetjäning.
  - Bara en plattformsadministratör kan radera ett konto: `adminDeleteUser`
    via `admin_delete_user_if_safe`, migration `20260917090000`. Den raderar
    helt när kontot saknar historik och anonymiserar annars.
  - Passportets integritetssida visar "Radera ditt Passport – Sker på
    begäran" och länkar till /contact.
- **Rekommendation (sant i dag):** *"Du kan avsluta ditt konto genom att
  skriva till info@cqrityjob.com från den e-postadress kontot är registrerat
  på. Vi raderar eller anonymiserar kontot enligt integritetspolicyn."*
  - Alternativ: bygg självbetjäning ("Radera konto" under Inställningar)
    före lansering, som en egen PR.

## B. Integritetspolicy

### B1. "Senast uppdaterad: [publiceringsdatum]"
- **Verifierat:** Inget datum är satt.
- **Rekommendation:** Sätt det datum då texten görs slutlig.

### B2. §5 AI-leverantörer
- **Platshållare:** "[Ange aktiva AI-leverantörer, vilka uppgifter de får,
  lagringstider, eventuell modellträning och behandling utanför EU/EES. Länka
  till den fullständiga informationen.]"
- **Verifierat:** Den enda AI-leverantören i koden är **Anthropic**
  (`api.anthropic.com/v1/messages`). Den används i tre delar:
  - intervjustödet: `src/lib/interview-intelligence/ai/providers/anthropic.ts`,
    styrt av `ANTHROPIC_API_KEY`, `INTERVIEW_AI_PROVIDER` och
    `INTERVIEW_AI_MODEL`;
  - säkerhetsarbetets bearbetning:
    `src/lib/security-work/processing/ai.server.ts`;
  - säkerhetsarbetets assistent:
    `src/lib/security-work/programme/assistant.server.ts`.

  Ingen OpenAI-, Gemini- eller Lovable-AI-anrop finns. Utan
  `ANTHROPIC_API_KEY` används ingen AI. Om nyckeln är satt i produktion går
  inte att se härifrån.
- **Ägaren behöver bekräfta:**
  - om AI är påslaget i produktion;
  - avtalsvillkoren med Anthropic: lagringstid, att data inte används för
    träning, och regionen (behandlingen sker i USA om inget annat avtalats).
- **Rekommenderad text:** Om AI är på: *"Vi använder Anthropic (USA) för
  AI-stöd i [intervjustöd, säkerhetsarbete]. Anthropic får de uppgifter som
  behövs för den aktuella funktionen och använder dem inte för att träna sina
  modeller."* Följ texten med lagringstid och överföringsmekanism enligt B4.
  Om AI är av vid lansering: *"Vi använder i dag inga AI-leverantörer."*

### B3. §6 Leverantörsförteckning
- **Platshållare:** "[Länk till aktuell leverantörsförteckning.]"
- **Verifierade leverantörer:**

  | Leverantör | Uppgift | Verifierat |
  |---|---|---|
  | Supabase | Databas, inloggning, lagring, loggar, edge-funktioner | Projekt i `eu-central-1` (Frankfurt), Pro-plan |
  | Resend | Utskick av produktens e-post | Används av edge-funktionen `transactional-email` |
  | SMTP- och brevlådeleverantör (ägarens, namnet bekräftas av ägaren) | Inloggningsmejl och brevlådorna info@ och job@ | Egen SMTP är aktiv i Supabase Auth (se D). Leverantören syns inte i loggarna |
  | Google | Inloggning med Google | `signInWithOAuth({ provider: "google" })` |
  | Lovable | Drift av webbapplikationen | Projektet är kopplat till Lovable |
  | Anthropic | AI-stöd, om det är påslaget | Se B2 |

- **Rekommendation:** Lägg tabellen direkt i §6. Det är enklare än en separat
  sida, och då behövs ingen länk.

### B4. §8 Överföring utanför EU/EES
- **Platshållare:** "[Ange faktiska mottagarländer, överföringsmekanismer
  och hur användaren kan få information eller en kopia av relevanta
  skyddsåtgärder.]"
- **Verifierat:**
  - Databasen ligger i EU (Frankfurt).
  - Resend, Google, Anthropic och sannolikt Lovables driftleverantör är
    amerikanska bolag. Var deras behandling faktiskt sker är inte verifierat
    härifrån.
- **Ägaren behöver bekräfta:** sändningsregion i Resend och avtalen
  (personuppgiftsbiträdesavtal och EU:s standardavtalsklausuler, alternativt
  att bolaget omfattas av EU–US Data Privacy Framework).
- **Rekommenderad text:** *"Vissa leverantörer (Resend, Google, Anthropic)
  kan behandla uppgifter i USA. Överföringen sker med stöd av EU–US Data
  Privacy Framework eller EU-kommissionens standardavtalsklausuler. Kontakta
  info@cqrityjob.com för en kopia av skyddsåtgärderna."*

### B5. §9 Lagringstid för konto, profil, tester och Security Passport
- **Platshållare:** "[Ange gallringsregler, även för inaktiva och avslutade
  konton]"
- **Verifierat:** Det finns ingen automatisk gallring. Databasen saknar
  pg_cron, och ingen migration eller funktion raderar konton eller profiler
  efter tid. Uppgifterna finns kvar tills kontot raderas enligt A2.
- **Rekommendation:**
  - Sant i dag: *"Så länge kontot finns. När du avslutar kontot raderas eller
    anonymiseras uppgifterna inom 30 dagar, om inte lag kräver längre
    lagring."*
  - Gallring av inaktiva konton (till exempel efter 24 månader, med
    påminnelse i förväg) kräver ett schemalagt jobb som inte finns. Lova det
    inte förrän det är byggt.

### B6. §9 "Supportärenden: 7 dagar" och "Säkerhets- och åtkomstloggar: 7 dagar"
**Ägarens text. Inventeringen visar att "7 dagar" inte stämmer för något av
dem.**

**Supportärenden:**
- **Inget ärendesystem.** Produkten har inget ärendesystem.
- **Kontaktformuläret** skickar förfrågan som e-post till info@ och sparar
  den inte i plattformen. Mejlet ligger kvar i brevlådan tills någon
  raderar det.
- **`beta_feedback`** har 0 rader och ingen gallring.
- **`cd_test_feedback`** har 4 rader, den äldsta från 2026-08-15, och ingen
  gallring.

**Säkerhets- och åtkomstloggar:**
- **Plattformens loggar** (bland annat edge-loggar med IP-adress,
  auth-loggar och databasloggar) går att läsa ända tillbaka till projektets
  start den 2026-08-29. Det är minst 35 dagar. Supabase bestämmer
  lagringstiden, inte vi.
- **Appens granskningstabeller** gallras aldrig:
  - `audit_logs`: 25 rader, äldsta 2026-07-19;
  - `job_audit_events`: 62 rader, äldsta 2026-07-19;
  - `employer_moderation_events`: 5 rader;
  - `sw_audit_events`: 5 rader.
- **`auth.audit_log_entries`** har 0 rader.
- **Säkerhetskopior:** dagliga, 7 dagar (Pro-plan).

**Ägarens beslut, två vägar:**
1. **Skriv det som är sant.**
   - Supportärenden: *"Så länge ärendet pågår och därefter högst 12 månader."*
     Det kräver en rensningsrutin för brevlådan.
   - Loggar: *"Tekniska loggar hos vår driftleverantör enligt dennes
     lagringstid, i dag cirka [X] dagar. Granskningsloggar för administrativa
     åtgärder så länge kontot eller organisationen finns."*
   - Säkerhetskopior: *"7 dagar."*
2. **Bygg gallringen först** (schemalagd rensning av tabellerna ovan och
   loggutlämning med fast lagringstid). Behåll sedan korta tider.

Sätt inte "7 dagar" förrän något i drift faktiskt raderar efter 7 dagar.

### B7. §11 Kakor och kakinställningar
- **Platshållare:** "[länk till kakpolicy]" och "[Länk till
  kakinställningar.]"
- **Verifierat:**
  - Produkten sätter en enda kaka, `sidebar_state`: sidopanelens läge, en
    funktionell inställning.
  - Webbläsarlagringen (inloggningssession, utkast, språk, senaste
    arbetsyta) är funktionell.
  - Inga analys-, annons- eller spårningsskript finns.
  - Typsnitten ligger på den egna domänen (`/fonts/*.woff2`), inte hos
    Google Fonts.
  - Ingen kakbanner finns, och det behövs ingen så länge ingen
    samtyckeskrävande teknik används.
- **Rekommenderad text:** *"Vi använder bara kakor och lagring i webbläsaren
  som behövs för att tjänsten ska fungera, till exempel för inloggning och
  dina inställningar. Vi använder inga kakor för analys eller marknadsföring,
  och därför behöver du inte lämna något samtycke."* Ta bort raden om
  kakinställningar tills samtyckeskrävande teknik införs.

## C. Godkännande av villkoren

- **E-postregistrering:** kräver den okryssade villkorsrutan och registrerar
  version och tidpunkt.
- **Google från registreringssidan:** kräver samma ruta. Godkännandet följer
  med genom inloggningen och skrivs till kontot vid återkomsten.
- **Google från inloggningssidan och alla andra konton utan giltigt
  godkännande:** spärras av `TermsAcceptanceGate` på varje sida tills de
  godkänner eller loggar ut.
- **Ägarens beslut:** Ska befintliga e-postkonton som skapades före villkoren
  godkänna dem vid nästa inloggning? I dag spärras de inte. Ändras på en rad i
  `src/lib/legal/terms-acceptance.ts`.

## D. E-post: befintlig konfiguration (verifierad, inga ändringar föreslås)

**Inloggningsmejl (Supabase Auth):** egen SMTP är aktiv och fungerar.
- 2026-09-30 kl. 12:47 gick det sista mejlet via Supabases standardavsändare
  (`noreply@mail.app.supabase.io`).
- Kl. 14:13–14:15 nekades tre bekräftelser med SMTP `535 authentication
  failed`. Egen SMTP var då påslagen, men inloggningsuppgifterna var fel.
- Kl. 14:27 lyckades en bekräftelse (200), och kontot bekräftades 16 sekunder
  senare.
- Kl. 14:28 skickades återställningsmejl (200). Ett 429 är Supabases
  hastighetsgräns.
- Inga mejlfel efter det. Inga nya inloggningsmejl har begärts sedan dess.

**Produktens mejl (Resend via edge-funktionen `transactional-email`):**
- Funktionen i produktion är identisk med koden på main (version 1,
  `verify_jwt = false`).
- Den har aldrig fått ett POST-anrop.
- Alla tre beredskapsanrop (2026-10-02 05:30, 2026-10-03 06:27 och 06:33)
  avvisades med 401 av funktionens egen kod, eftersom funktionen startade
  före svaret. Appens tjänstenyckel matchar inte byte för byte den nyckel
  funktionen har i sin miljö.
- Därför säger /contact att formuläret inte är öppet. Kvitton, meddelanden
  och inbjudningar har inte gått ut den vägen.

**Åtgärd i #386:**
- Funktionen godtar också en nyckel som projektet självt bekräftar som
  tjänstenyckel. Den bekräftas med ett anrop till projektets Auth-adminslutpunkt,
  som bara en tjänstenyckel klarar.
- Ett godkänt svar sparas i fem minuter, och allt annat nekas.
- Resend, SMTP och brevlådorna ändras inte. Funktionen måste driftsättas om
  efter merge.

## E. Kandidatsvar till rätt arbetsgivare

- **Verifierat:** Meddelanden går bara från arbetsgivare till kandidat
  (`recruitment_messages`). Det finns ingen svarsfunktion för kandidater, och
  arbetsgivare har ingen lagrad e-postadress.
- **Sedan tidigare:** Reply-To är job@cqrityjob.com.
- **I #386:**
  - Knappen i mejlet säger "Läs i CQrityjob" i stället för "Läs och svara".
  - Sidfoten säger att ett svar på mejlet går till CQrityjob
    (job@cqrityjob.com) och inte direkt till arbetsgivaren.
  - Avsändarnamnet visar arbetsgivaren.
- **Samordnat med lanseringssessionen:**
  - Arbetsgivarnotifieringen (ny ansökan) byggs med en utkorg som kan ta emot
    flera notifieringstyper, så att "kandidaten har svarat" kan läggas till
    utan omdesign.
  - Ingen äger svarsfunktionen i appen ännu. Den kräver schema, RLS och
    gränssnitt och bör bli en egen PR om du beställer den.
- **Ägarens beslut:**
  1. Vem på CQrityjob hanterar job@ och vidarebefordrar kandidatsvar till
     arbetsgivaren, och inom vilken tid?
  2. Ska svarsfunktionen i appen byggas före lansering?
