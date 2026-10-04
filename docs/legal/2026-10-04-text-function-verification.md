# Verifiering: stämmer texten med funktionen? (2026-10-04)

För den oberoende granskare som ägaren utsett att verifiera villkoren, integritetspolicyn och
biträdesavtalet mot produkten **före publicering**. Författaren har läst koden och, skrivskyddat, produktionens
databas 2026-10-04. Författaren är inte oberoende av texten. Varje rad nedan ska därför avgöras av granskaren, inte
tas för givet.

**Vad som gäller:** ingenting här är skrivet till produktion. Siffror är antal och datum, aldrig innehåll.
Texten är ett utkast (`OWNER_APPROVED` är `false`). Beslutsunderlaget är
`docs/legal/2026-10-04-owner-decisions.md`.

**Så här används matrisen.** Gå rad för rad. Kolumnen "Så kontrolleras det" säger vad som kan läsas eller köras.
Sätt ett eget utfall per rad. Författarens bedömning står i kolumnen "Läge".

| Läge | Betyder |
|---|---|
| ✔ | Texten stämmer med funktionen, enligt det som kontrollerades (datum och metod anges) |
| ◐ | Stämmer delvis eller beror på en uppgift som bara ägaren eller en leverantör kan ge |
| ✘ | Texten och funktionen stämmer inte, eller funktionen saknas. Kräver åtgärd före publicering |
| ? | Inte kontrollerad, kan inte läsas härifrån |

Kör först `bun run launch-legal:check`. Den fastställer textens form (bolagsuppgifter, inga svarstider, gallringstabellen
lika med planen, inget slutgiltigt dokument medan en rutin saknas) men säger ingenting om att produkten gör det texten säger.

## A. Identitet och kontakt

| ID | Text | Funktion eller underlag | Så kontrolleras det | Läge |
|---|---|---|---|---|
| A1 | Villkor (inledning), policy §1: tjänsten tillhandahålls av **Cqrityjobb AB**, organisationsnummer 559261-0249, varumärket CQrityjob | Ägarbeslutet. En källa: `src/lib/legal/company.ts`. Samma uppgifter i webbtexterna `legal.provider` (sv och en) och i biträdesavtalet | `launch-legal:check` 1.0 till 1.3b. Numret mot Bolagsverkets register | ◐ Uppgiften är ägarens, registerkontrollen återstår |
| A2 | Bolagets adress | Saknas. Visas som synlig öppen punkt i villkor, policy och avtal | `open-facts` punkt 1 | ? |
| A3 | info@cqrityjob.com är kontakt, support och integritet | `src/lib/site-contact.ts`, sidfot, `/contact`, registreringens integritetsnotis. Mejlfunktionen har en egen kopia som `transactional-email:check` jämför | CI-kontrollen. Brevlådan bevakas av Mostafa (ägarbeslut), inte kontrollerbart i kod | ✔ kod, ◐ bevakning |
| A4 | Villkor §7 och policy §1: svar på arbetsgivarens mejl går till job@cqrityjob.com, och vi vidarebefordrar det | Mejlfunktionen sätter Reply-To `job@` på ansökningskvitto, rekryteringsmeddelande och testinbjudan (`docs/release/2026-10-03-launch-legal-and-contact.md` §2). Mejlens sidfot säger samma sak (`src/lib/email/send-recruitment-message-email.server.ts`). **Vidarebefordran är en mänsklig rutin, ingen funktion** | Läs rubrikerna i ett T4/T5-mejl. Fråga ägaren hur svar vidarebefordras och av vem | ◐ |
| A5 | Ingen offentlig svarstid | Texterna innehåller inte ordet "arbetsdag". Två arbetsdagar är ett internt mål | `launch-legal:check` 1.11 | ✔ |
| A6 | Policy §10: begäranden besvaras "utan onödigt dröjsmål och senast inom en månad", förlängning högst två månader med besked inom första månaden | Texten följer artikel 12.3 GDPR. Det finns ingen verktygsstödd hantering: begäran kommer till info@ och hanteras manuellt | Fråga ägaren vem som tar emot, hur identitet kontrolleras och hur frister bevakas | ✔ text, ◐ rutin |

## B. AI

| ID | Text | Funktion eller underlag | Så kontrolleras det | Läge |
|---|---|---|---|---|
| B1 | Villkor §6 och §10, policy §5: generativa AI-funktioner är avstängda i den här versionen | Produktion 2026-10-04: `scp_ai_providers` har Anthropic `is_enabled = false` och bara "Null provider (human review only)" aktiv. `scp_interview_ai_config.ai_enabled = false`. `scp_interview_ai_runs`, `scp_ai_scoring_runs`, `sw_ai_runs` och `sw_ai_activations` har 0 rader. `cv_documents` har 5 rader, alla med tom `provider_mode` och utan `model_id` | SQL i bilagan | ✔ för vägar med databasspärr |
| B2 | Policy §5: "Vi använder i dag inga AI-leverantörer, och dina uppgifter skickas inte till någon AI-tjänst" | Fem kodvägar kan nå `api.anthropic.com`: intervju (`interview-intelligence/runtime.functions.ts`: miljö och databasflaggan `ai_enabled`), rekrytering (`recruitment/ai.functions.ts`: miljö och spärr), Säkerhetsarbete (`security-work/processing` och `programme/assistant.server.ts`: `SW_ANTHROPIC_API_KEY` och en aktiv rad i `sw_ai_activations`, 0 rader), kompetensgranskning (`scp_ai_providers`, avstängd) och **CV-utkast** (`professional-identity/cv/generation.ts`, anropas av `generateMyCv`). **CV-utkastet styrs bara av miljön**: `INTERVIEW_AI_PROVIDER` och `ANTHROPIC_API_KEY`. Är båda satta i Lovables servermiljö skickas personens karriäruppgifter (med ordningsnycklar i stället för id, utan namn) till Anthropic när hen trycker på "Skapa nytt AI-utkast". Är de inte satta avvisar `selectProvider()` anropet och personen får det faktabaserade CV:t. Servermiljön kan inte läsas härifrån | Fråga ägaren: är variablerna satta? (`open-facts` punkt 6.) Föreslagen rättning: en kodspärr som förbjuder det externa anropet i version 1 oavsett miljö, i en separat PR | ◐ Sant om miljön är rensad. Inga sparade CV bär spår av en modell (`provider_mode` och `model_id` är tomma) |
| B3 | Villkor §6, policy §5 och ägarbeslut 4 säger att AI är avstängt | Tre texter i produkten säger motsatsen: (1) startsidans hero, `home.hero.subtitle` och `home.hero.individual.body`: "AI-stöd för ditt säkerhetsarbete" (Lovables text, live 2026-10-04). (2) CV-knappen "Skapa nytt AI-utkast" (`src/components/professional-identity/cv-copy.ts`). (3) Kandidatens intervjusida (`src/routes/_authenticated.my-career.interviews.$caseId.tsx`): "Ett AI-stöd hjälper arbetsgivaren att strukturera underlaget …", utan villkor | Läs de tre ställena. Förslag på sanna ordval i `owner-decisions` | ✘ Inte ändrat i den här PR:en (se skälen där) |
| B4 | Villkor §10: version 2 erbjuder AI som separata betaltjänster med beställning, prisinformation och aktivering | Inget är byggt, och det finns ingen betalintegration i koden (sökt efter betalleverantörer och betalningsflöden utan träff) | `grep` i `src` och `supabase` | ✔ |

## C. Kakor, lagring och mätning

| ID | Text | Funktion eller underlag | Så kontrolleras det | Läge |
|---|---|---|---|---|
| C1 | Policy §11: bara kakor och lagring som behövs: inloggning, språkval, sidopanelens läge, delningslänk (en kaka på 30 minuter) | Kakor: `sidebar_state` (`document.cookie`, sju dagar, `src/components/ui/sidebar.tsx`) och två `HttpOnly`-kakor för Security Passport-delning, `SameSite=Lax`, `Max-Age=1800`, sökväg `/_serverFn` (`src/lib/security-passport/share-transport.ts`). Webbläsarlagring: inloggningssessionen (Supabase, `localStorage`), språk (`cqrityjob.lang`), jobbutkast (`cqj.job-draft.new`) och navigeringshjälp (`jobs-restore` m.fl.) | Läs filerna. I en webbläsare: lagring och kakor efter ett besök | ✔ kod |
| C2 | Policy §11: anonym mätning, inga kakor, registrerar inte namn, e-post eller konto, med en markering i sessionslagringen | `cd_v31_funnel_events`: 339 rader 2026-08-15 till 2026-10-03, **`user_id` och `session_id` tomma i varje rad**, 19 olika händelsenamn. Markeringen är `cqj:funnel:once:*` i `sessionStorage` (`src/lib/india-entry/analytics.ts`). Schemat tillåter ett valfritt, validerat `session_id`, men ingen rad använder det | SQL i bilagan. Bedöm om en sessionsmarkering för statistik kräver samtycke enligt 6 kap. 18 § LEK. Texten säger öppet vad som sker | ✔ data, ◐ rättslig bedömning |
| C3 | Policy §11: inga kakor för analys eller marknadsföring | Inga analys- eller spårningsskript och inga externa skript- eller typsnittsvärdar finns i koden (sökt utan träff). Sidans CSP begränsar bara inbäddning | `grep` i `src` och `index.html` | ✔ |

## D. Leverantörer och överföringar

| ID | Text | Funktion eller underlag | Så kontrolleras det | Läge |
|---|---|---|---|---|
| D1 | Policy §6: Supabase behandlar uppgifter i Frankfurt (EU) | Projektet `CQrityjob Production` har region `eu-central-1`, skapat 2026-08-28 | Supabase: Project settings | ✔ 2026-10-04 |
| D2 | Policy §6 och §8: plats och överföringsstöd för Lovable, Resend, e-postleverantören och Google | Ej ifyllt. Policyn har 15 öppna punkter: 10 är leverantörsfakta (plats och överföringsstöd, och e-postleverantörens namn), 3 är lagringstider hos leverantörer, 1 är bolagets adress och 1 är publiceringsdatum | `open-facts` punkt 3 till 5 | ? |
| D3 | Policy §6: tabellen är leverantörerna | Tabellen listar direkta leverantörer. Deras egna underbiträden och eventuella andra mottagare (till exempel var Lovables värd körs) är inte kartlagda. GitHub används för kod och CI och får inga personuppgifter från produktionen | Be varje leverantör om dess underbiträdeslista. Bekräfta att inga fler tjänster tar emot personuppgifter | ? |
| D4 | Policy §8: ingen EU-regel, stöd krävs för varje överföring, köp eller godkännande ersätter inte stödet | Ägarbeslut 5. Texten gör inget påstående om fakta | `launch-legal:check` 1.12 | ✔ |

## E. Lagringstider (policy §9, byggd från `src/lib/legal/retention-plan.ts`)

Planen är godkänd som produktbeslut. Ägarens villkor är att rutinerna kontrolleras och genomförs innan tiderna publiceras som
fungerande åtaganden. **Ingen rad är verifierad i dag**, och policyn kan därför inte bli slutgiltig. Bevis per rad står i
fältet `evidence` i `retention-plan.ts`.

| Rad | Tid i texten | Rutin i dag | Läge |
|---|---|---|---|
| `account` | Raderas inom 30 dagar efter begäran. Inaktiv 24 månader: påminnelse, radering 30 dagar senare | Manuell (`admin_delete_user_if_safe`). **Avbryts med `ERASURE_INCOMPLETE` för konton med `sp_credential_details` eller `sp_evidence_extractions` (4 innehavare)**. Rättelsen `20270208090000` granskas. Påminnelse och radering av inaktiva konton är inte byggda | ✘ |
| `recruitment` | 24 månader efter avslutad rekrytering, därefter anonymisering | Ingen schemalagd anonymisering. Den äldre `sweep_application_retention()` **raderar efter 12 månader** (tillbakadragen ansökan eller stängd annons), körs aldrig och måste anpassas innan den används | ✘ |
| `info-mailbox` | 12 månader efter senaste kontakt | Manuell månatlig rensning, inte nedskriven eller tilldelad | ✘ |
| `job-mailbox` | 24 månader efter avslutad rekrytering | Samma | ✘ |
| `feedback` | 12 månader | Ingen rutin (`beta_feedback` 0 rader, `cd_test_feedback` 4 rader) | ✘ |
| `usage-statistics` | 13 månader | Ingen rutin för `cd_v31_funnel_events`. `sweep_analytics_retention()` gäller `job_analytics_events` (tom, 90 dagar och 24 månader) | ✘ |
| `admin-audit` | 24 månader | Ingen rutin (`audit_logs` 27, `job_audit_events` 66, `employer_moderation_events` 5, `sw_audit_events` 5 rader, äldst 2026-07-19) | ✘ |
| `platform-logs`, `mail-logs`, `backups` | Öppna punkter | Leverantörens egen tid, ska läsas i kontona | ? |
| `sessions` | Tills utloggning eller utgång | Supabase Auth. Inställningarna finns inte i repot | ? |
| `notice-outbox` | 90 dagar efter avslutat utskick | **Byggd** (`rec_purge_employer_notices`), men körs av svepningen, som inte är konfigurerad: senaste schemalagda körningen 2026-10-04 02:44 UTC skrev `NOT CONFIGURED`. 1 rad finns | ✘ |
| `accounting` | Sju år efter räkenskapsårets utgång | Utanför produkten. Ett tillägg som inte fanns i den godkända planen | ◐ |

Inget i produktionen är ännu äldre än någon period i planen: äldsta datan är från 2026-07, så ingen uppgift sparas
längre än vad texten lovar i dag. Det ändrar inget i att rutinerna saknas.

Klassningen i planen: `cd_sessions` (48 rader, alla med användar-id) listades i planen som användningshändelser. Det är
användarnas egna testkörningar och hör till kontots lagringstid, inte till de 13 månaderna.

## F. Rättigheter och radering

| ID | Text | Funktion eller underlag | Så kontrolleras det | Läge |
|---|---|---|---|---|
| F1 | Villkor §13: du kan avsluta ditt konto genom att skriva till info@ | En administratör raderar eller anonymiserar kontot manuellt. Se `account` ovan: raderingen avbryts för konton med Security Passport-detaljer | Granska `20270208090000` när den är klar. Kör raderingen på ett syntetiskt testkonto med sådana detaljer, i en transaktion som rullas tillbaka | ✘ tills rättelsen är tillämpad och verifierad |
| F2 | Policy §10: tillgång, rättelse, radering, begränsning, portabilitet | Allt via info@, manuellt. Det finns ingen självbetjäning för export eller radering | Fråga ägaren om rutinen | ◐ texten säger "kontakta oss" och stämmer |
| F3 | Policy §9: radering av ditt konto raderar inte det en arbetsgivare redan fått | Ansökningar hör till arbetsgivarens behandling | Designen | ✔ |

## G. Arbetsgivare och åtkomst

| ID | Text | Funktion eller underlag | Så kontrolleras det | Läge |
|---|---|---|---|---|
| G1 | Villkor §8: åtkomst inom samma företag ger inte rätt att läsa alla kandidatärenden | Rapportbehörigheten följer en enda modell (ägare och administratör, tilldelad bedömare, ansvarig rekryterare, ärendets skapare och panel). Databasnivån provad för alla 9 aktiva medlemmar 2026-10-04 (`docs/release/2026-10-04-access-probes-steps-11-15.md`) | Texten i gränssnittet ("ingen åtkomst") är inte sedd i webbläsare | ✔ databas, ? gränssnitt |
| G2 | Villkor §6, policy §5: arbetsgivaren ska göra en mänsklig bedömning | Produktens intervjuflöde kräver att en namngiven person bekräftar varje uppgift innan den används. Inget automatiskt beslut fattas | Koden (`src/lib/interview-intelligence/`) och `scripts/interview-context-governance-check.tsx` | ✔ design, inte provat från början till slut |

## H. Villkorsflödet

| ID | Text | Funktion eller underlag | Så kontrolleras det | Läge |
|---|---|---|---|---|
| H1 | Villkoren gäller från 2026-10-01 | `TERMS.date` är orörd. Ett utkast registreras som `2026-10-01-utkast`. Vid godkännande sätts datumet och alla konton godkänner igen | `launch-legal:check` 1.5 och 5.x | ✔ |
| H2 | Dokumenten är utkast tills två saker är sanna | `OWNER_APPROVED` är `false`. Policyn blir dessutom inte slutgiltig förrän varje gallringsrad har en verifierad rutin (`RETENTION_READY`) | `launch-legal:check` 5.1 och 6.4 | ✔ |

## Bilaga: skrivskyddade frågor (kör mot produktion)

```sql
-- B1: AI-flaggor och körningar (antal)
select 'scp_ai_providers', count(*)::text, string_agg(to_jsonb(p)->>'name' || '=' || (to_jsonb(p)->>'is_enabled'), ', ') from public.scp_ai_providers p
union all select 'scp_interview_ai_config', count(*)::text, string_agg('ai_enabled=' || ai_enabled::text, ', ') from public.scp_interview_ai_config
union all select 'scp_interview_ai_runs', count(*)::text, null from public.scp_interview_ai_runs
union all select 'scp_ai_scoring_runs', count(*)::text, null from public.scp_ai_scoring_runs
union all select 'sw_ai_runs', count(*)::text, null from public.sw_ai_runs
union all select 'sw_ai_activations', count(*)::text, null from public.sw_ai_activations;

-- B1: har någon sparad CV skapats med en modell?
select coalesce(provider_mode, '(null)'), (model_id is not null), count(*) from public.cv_documents group by 1, 2;

-- C2: anonyma händelser
select count(*), count(*) filter (where session_id is not null), count(*) filter (where user_id is not null),
       count(distinct event_name), min(occurred_at)::date, max(occurred_at)::date
from public.cd_v31_funnel_events;

-- E: tabeller i lagringsplanen (antal och äldsta dag)
select 'audit_logs', count(*), min(at)::date from public.audit_logs
union all select 'job_audit_events', count(*), min(created_at)::date from public.job_audit_events
union all select 'employer_moderation_events', count(*), min(created_at)::date from public.employer_moderation_events
union all select 'sw_audit_events', count(*), min(created_at)::date from public.sw_audit_events
union all select 'cd_test_feedback', count(*), min(submitted_at)::date from public.cd_test_feedback
union all select 'beta_feedback', count(*), min(created_at)::date from public.beta_feedback
union all select 'job_applications', count(*), min(created_at)::date from public.job_applications
union all select 'cd_sessions', count(*), min(created_at)::date from public.cd_sessions;
```

Supabase-projektets region läses i projektinställningarna (D1). Svepningens läge läses i GitHub Actions, körningen
"Recruitment receipts sweep" (E, `notice-outbox`).
