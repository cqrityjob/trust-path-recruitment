# Beslutsunderlag: användarvillkor, integritetspolicy, lagring och kandidatkommunikation

**Status: underlag för ägarens granskning.** Båda juridiska sidorna är
**utkast**, ett mellanläge och inga färdiga lanseringstexter. Ett utkast
visar en banner, är `noindex`, finns inte i sitemapen och registrerar
godkännanden som `2026-10-01-utkast`.

Ett dokument blir slutligt först när två saker är uppfyllda:
1. **Inga öppna punkter.** Varje platshållare är ersatt.
2. **Uttryckligt ägargodkännande.** `OWNER_APPROVED` i
   `src/lib/legal/status.ts` är satt i en granskad ändring.

Uppgifterna är verifierade den 2026-10-03 mot koden och med enbart läsfrågor
mot produktion (`wrygicdfxwjnrugduxnt`, Supabase Pro). Inga personuppgifter
har lästs ut.

**Det här kräver din uppgift.** Allt annat är verifierat eller förberett.
1. **Leverantörsavtal och regioner.** Region och avtal för Resend, Lovables
   drift och Google (B3). Inget av det syns i inställningarna som är
   tillgängliga här.
2. **Lagringsplanen.** Godkänn planen i C, eller ändra tiderna.
3. **job@.** Vem som bevakar job@, och svarstiden (D).
4. **Publicering.** Godkänn varje text för publicering (`OWNER_APPROVED`)
   när den är klar.

---

## A. Användarvillkor: beslut genomförda

| Punkt | Före | Nu |
|---|---|---|
| §2 Åldersgräns | "[Ange beslutad åldersgräns …]" | "Du måste vara minst 18 år för att skapa ett konto." |
| §13 Avsluta konto | "genom [ange faktiskt tillgängligt förfarande]" | "genom att skriva till info@cqrityjob.com från den e-postadress som kontot är registrerat på." |

- **Inga öppna punkter.** Villkoren har inga platshållare kvar. De är ändå
  utkast tills du godkänner dem.
- **Avsluta konto stämmer med produkten.** Det finns ingen självbetjäning i
  dag. En plattformsadministratör raderar kontot med
  `admin_delete_user_if_safe`: helt om kontot saknar historik, annars
  anonymiseras det.
- **Ålder.** Registreringen frågar inte efter ålder. 18-årsgränsen är ett
  villkor, inte en teknisk kontroll.

**Godkännande för befintliga konton (förberett).** När villkoren är slutliga
måste alla konton godkänna dem en gång, också e-postkonton från tiden före
villkoren. Den som godkänt utkastet ombeds godkänna den slutliga texten.
Spärren `TermsAcceptanceGate` gäller varje sida tills kontot godkänner eller
loggar ut. Så länge villkoren är utkast tillfrågas bara konton som saknar
godkännande och som skapats via Google.

> **När du sätter `OWNER_APPROVED.terms = true`:** lokala testkonton i e2e
> (provider `email` utan `terms_version`) får spärren. Samma ändring behöver
> därför ge testfixturerna `terms_version`.

## B. Integritetspolicy: verifierat och förslag

### B1. Senast uppdaterad
Sätt datumet när texten godkänns.

### B2. §5 AI-leverantörer
**Verifierat i produktion: AI är avstängt.**
- `scp_ai_providers`: Anthropic är registrerad men `is_enabled = false`, med
  noteringen "Activation requires an owner decision". Bara
  `null_provider` (endast mänsklig granskning) är aktiv.
- `scp_interview_ai_config.ai_enabled = false`.
- `scp_interview_ai_runs`, `scp_ai_scoring_runs` och `sw_ai_runs` har 0
  rader. `sw_ai_activations` har 0 rader.
- I koden är Anthropic (`api.anthropic.com`) den enda AI-leverantören.

**Föreslagen text:** *"Vi använder i dag inga AI-leverantörer. Om vi inför
AI-stöd uppdaterar vi policyn innan funktionen tas i bruk."* Det behövs
ingen uppgift från dig nu.

### B3. §6 Leverantörsförteckning och §8 överföring utanför EU/EES

| Leverantör | Uppgift | Region och avtal |
|---|---|---|
| Supabase | Databas, inloggning, fillagring, loggar, edge-funktioner | **Verifierat:** `eu-central-1` (Frankfurt) |
| Resend | Produktens utskick | **Din uppgift:** sändningsregion och personuppgiftsbiträdesavtal (DPA) |
| Egen SMTP-leverantör | Inloggningsmejl, brevlådorna info@ och job@ | **Din uppgift:** leverantörens namn och region. Den syns inte i loggarna |
| Google | Inloggning med Google | **Verifierat:** aktiv (Google-inloggningar i auth-loggen). **Din uppgift:** att Googles villkor och DPA är accepterade |
| Lovable | Drift av webbapplikationen | **Din uppgift:** var appen körs och Lovables DPA. Det visas inte i projektinställningarna |

**Förslag:** Lägg tabellen direkt i §6, så behövs ingen separat länk. Fyll
§8 med "Resend, Google och Lovable kan behandla uppgifter i USA, med stöd av
EU–US Data Privacy Framework eller standardavtalsklausuler". Behåll bara de
leverantörer du bekräftar.

### B4. §9 Lagringstider
Ersätts av planen i C. Varken "7 dagar" eller obegränsad lagring.

### B5. §11 Kakor
**Verifierat:**
- Produkten sätter en enda kaka, `sidebar_state` (sidopanelens läge).
- Webbläsarlagringen är funktionell: inloggning, utkast, språk.
- Inga analys- eller spårningsskript finns.
- Typsnitten ligger på den egna domänen.

**Föreslagen text:** *"Vi använder bara kakor och lagring i webbläsaren som
behövs för att tjänsten ska fungera. Vi använder inga kakor för analys eller
marknadsföring, och därför behövs inget samtycke."* Ta bort raden om
kakinställningar.

---

## C. Lagrings- och rensningsplan per datatyp

**Utgångsläge, verifierat:**
- **Ingen automatisk gallring.** pg_cron saknas och ingen funktion raderar
  efter tid.
- **"7 dagar" stämmer inte.** Plattformsloggar finns kvar sedan
  projektstarten den 2026-08-29, och appens granskningsloggar har poster
  från 2026-07-19.

Planen nedan är ett förslag. Varje tid behöver en mekanism innan den skrivs
in som löfte.

| Datatyp | Var | Föreslagen lagringstid | Rensning |
|---|---|---|---|
| Konto, profil, CV-filer, egna tester, Security Passport med underlag | `auth.users`, `profiles`, `sp_*`, Storage | Så länge kontot finns. Raderas eller anonymiseras **inom 30 dagar** efter begäran om avslut. Inaktiva konton: påminnelse efter **24 månader** utan inloggning, radering 30 dagar efter påminnelsen | I dag manuellt (`admin_delete_user_if_safe`). Schemalagd påminnelse och radering byggs som egen PR |
| Ansökningar, rekryteringsmeddelanden, tester och intervjuer för en arbetsgivare | `job_applications`, `recruitment_messages`, `scp_*` | Enligt arbetsgivarens regler och biträdesavtalet. Standard: **24 månader** efter avslutad rekrytering, sedan anonymisering. 24 månader täcker preskriptionstiden enligt diskrimineringslagen | Schemalagd anonymisering, egen PR. Arbetsgivaren kan begära kortare tid |
| Kontaktförfrågningar (info@) | Brevlådan, sparas inte i plattformen | **12 månader** efter senaste kontakt | Månatlig manuell rensning av brevlådan |
| Kandidatsvar till job@ | Brevlådan | **24 månader**, samma som ansökan | Månatlig manuell rensning |
| Beta- och testfeedback | `beta_feedback` (0 rader), `cd_test_feedback` (4 rader) | **12 månader** | Schemalagd radering |
| Användningshändelser (pseudonyma) | `cd_v31_funnel_events`, `job_analytics_events`, `cd_sessions` | **13 månader** | Schemalagd radering |
| Granskningsloggar för administrativa åtgärder | `audit_logs`, `job_audit_events`, `employer_moderation_events`, `sw_audit_events` | **24 månader** | Schemalagd radering |
| Tekniska loggar hos Supabase (IP-adress, inloggning, förfrågningar) | Supabase-plattformen | **Upp till 90 dagar.** Supabase bestämmer lagringstiden; minst 35 dagar är verifierat. Om den överstiger 90 dagar behövs loggexport med egen gallring | Kontrollera tiden i Supabase och ange den faktiska siffran |
| E-postloggar hos Resend | Resend | Enligt Resends lagringstid | **Din uppgift:** tiden i Resend-kontot |
| Inloggningssessioner | `auth.sessions`, `refresh_tokens` | Tills utloggning eller utgång | Supabase gör det redan |
| Säkerhetskopior | Supabase | **7 dagar** (Pro, dagliga kopior) | Supabase gör det redan |
| Notifieringsutkorg (Sonnets arbetsgivarnotifiering) | Ny tabell | **90 dagar** efter avslutat utskick | Byggs in i samma PR som utkorgen |

**Mekanism för "schemalagd":** en schema-first-PR som aktiverar pg_cron och
lägger till en rensningsfunktion per tabell. Varje funktion får test,
rollback och negativ kontroll, och körs dagligen. Den kan byggas när planen
är godkänd. Tills den är i drift beskriver policyn bara det som faktiskt
sker: rensning på begäran och manuella rutiner.

**Föreslagen §9-text i dag:** tabellen ovan, där kolumnen "Rensning" anger
att varje schemalagd rensning införs senast ett angivet datum. Alternativet
är att policyn publiceras först när rensningen är byggd.

---

## D. Kandidatkommunikation (samordnad med Sonnet-sessionen)

**Vad kandidaten kan göra i dag:**
- Läsa arbetsgivarens meddelanden under Mina ansökningar och i mejlet.
- Svara på mejlet. Svaret går till **job@cqrityjob.com**, inte till
  arbetsgivaren.
- Svara i plattformen går inte. Det finns ingen svarsfunktion, och
  arbetsgivare har ingen lagrad e-postadress.

**Vart svar går och vem som bevakar:**
- Svar går till job@. Någon på CQrityjob måste bevaka brevlådan och
  vidarebefordra svaret till arbetsgivarens ansvariga person, som
  administratören hittar via organisationens medlemmar.
- **Din uppgift:** vem som bevakar job@, och svarstiden. Förslag: en
  arbetsdag.

**Vad mejlet säger (i #386):**
- Avsändaren visas som "Arbetsgivare via CQrityjob".
- Knappen säger "Läs i CQrityjob".
- Sidfoten: "Om du svarar på det här mejlet går svaret till CQrityjob
  (job@cqrityjob.com) och inte direkt till arbetsgivaren."

**Minsta fungerande svarsfunktion (beskriven, inte byggd).** Den kräver
ditt beslut.
1. **Data.** En ny rad i ansökans tråd: kandidatsvar med `application_id`,
   avsändare = kandidaten och text. Inga bilagor.
2. **Åtkomst.**
   - Kandidaten får skriva bara på sin egen ansökan, och bara medan
     ansökan är öppen.
   - Arbetsgivarens behöriga medlemmar får läsa enligt samma regel som för
     ansökan.
   - Ingen får uppdatera eller radera.
3. **Gränssnitt.** Ett svarsfält under meddelandet i Mina ansökningar. På
   arbetsgivarens ansökningssida visas svaret i samma tråd.
4. **Notifiering.** Sonnets utkorg för arbetsgivarnotifieringar byggs så att
   den kan ta emot flera notifieringstyper. Typen `candidate_replied`
   läggs till, med samma mottagarval (ansvarig rekryterare, annars ägare och
   admin) och ingen kandidattext i mejlet, bara en länk.
5. **Mejlet.** Knappen blir "Läs och svara i CQrityjob", och Reply-To kan
   ligga kvar på job@ som reserv.
6. **Omfattning.** En schema-first-migration med test, rollback och negativ
   kontroll, plus app-PR:en. Ungefär samma storlek som Sonnets
   notifieringsutkorg. Lagring: följer ansökan (C).

**Sonnet-sessionen har bekräftat:**
- Den bygger bara notifieringen om ny ansökan, och utkorgen kan ta emot
  flera notifieringstyper.
- Ingen äger svarsfunktionen.
- Inga invändningar mot mejltexten ovan.
