# Verifiering: stämmer texten med funktionen? (2026-10-04)

För den oberoende granskare som ägaren utsett att verifiera villkoren, integritetspolicyn och
biträdesavtalet mot produkten **före publicering**. Författaren har läst koden och, skrivskyddat, produktionens
databas 2026-10-04. Författaren är inte oberoende av texten. Varje rad nedan ska därför avgöras av granskaren, inte
tas för givet.

**Uppdaterad 2026-10-04, slutleverans.** Allt arbete för version 1 ligger nu i en enda lanserings-PR, #417: AI-spärren,
de rättade texterna, den avstängda mätningen, gallringsrutinerna, juridiken och testerna (inklusive JWT-testerna för
kontoradering som kom från #423 och raderingsbeviset). Läget "efter denna PR" betyder att raden stämmer när #417 är
sammanslagen. Separata PR finns bara där en databasmigration eller releaseordning kräver det (katalogstackens publicering, #412, nu
sammanslagen i `main`). Verifierat klart, förberett för publicering, kvarstående fakta och faktiska hinder
redovisas i slutrapporten.

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
| A4 | Villkor §7 och policy §1: svar på arbetsgivarens mejl går till job@cqrityjob.com, som hanteras av CQrityjob. Svaret förs inte automatiskt vidare till arbetsgivaren | Mejlfunktionen sätter Reply-To `job@` på ansökningskvitto, rekryteringsmeddelande och testinbjudan (`docs/release/2026-10-03-launch-legal-and-contact.md` §2). Ingen funktion vidarebefordrar något: hanteringen är en mänsklig rutin (`docs/legal/mailbox-and-gdpr-routine.md`: Mostafa ansvarig, bevakning varje arbetsdag). Texten lovar inte längre vidarebefordran | `launch-legal:check` 1.14. Läs rubrikerna i ett T4/T5-mejl | ✔ text, ◐ bevakning (ägarens rutin) |
| A5 | Ingen offentlig svarstid | Texterna innehåller inte ordet "arbetsdag". Två arbetsdagar är ett internt mål | `launch-legal:check` 1.11 | ✔ |
| A6 | Policy §10: begäranden besvaras "utan onödigt dröjsmål och senast inom en månad", förlängning högst två månader med besked inom första månaden | Texten följer artikel 12.3 GDPR. Ingen verktygsstödd hantering: begäran kommer till info@ och hanteras manuellt. **Frister följs upp separat** i begärandelogg med veckokontroll (`docs/legal/mailbox-and-gdpr-routine.md`, R9) | Granska rutinen. Första begäran loggas | ✔ text, ◐ rutin (inte körd, inga begäranden än) |

## B. AI

| ID | Text | Funktion eller underlag | Så kontrolleras det | Läge |
|---|---|---|---|---|
| B1 | Villkor §6 och §10, policy §5: generativa AI-funktioner är avstängda i den här versionen | Produktion 2026-10-04: `scp_ai_providers` har Anthropic `is_enabled = false` och bara "Null provider (human review only)" aktiv. `scp_interview_ai_config.ai_enabled = false`. `scp_interview_ai_runs`, `scp_ai_scoring_runs`, `sw_ai_runs` och `sw_ai_activations` har 0 rader. `cv_documents` har 5 rader, alla med tom `provider_mode` och utan `model_id` | SQL i bilagan | ✔ för vägar med databasspärr |
| B2 | Policy §5: "Vi använder i dag inga AI-leverantörer, och dina uppgifter skickas inte till någon AI-tjänst" | Fem kodvägar kunde nå `api.anthropic.com`. **CV-utkastet styrdes bara av miljön** (`INTERVIEW_AI_PROVIDER`, `ANTHROPIC_API_KEY`). Denna PR flyttar alla fem genom `externalAiFetch` (`src/lib/ai/generative-ai-gate.ts`), som nekar **före** `fetch`. Spärren är en konstant, inte en miljöinställning. Servermiljön behöver därför inte läsas för att texten ska vara sann | `bun run generative-ai-gate:check`: leverantör konfigurerad (`INTERVIEW_AI_PROVIDER=anthropic`, produktionsmiljö, syntetisk nyckel), `fetch` ersatt av en inspelare: **noll anrop** på selektorn, adaptern, `generateCvPresentation`, Säkerhetsarbetets körning och assistent. Positiv kontroll: med laboratoriespärren öppen når samma anrop inspelaren. Källskanning: ingen leverantörsvärd, inget leverantörshuvud, inget AI-bibliotek utanför spärren. 11 planterade kontroller | ✔ efter denna PR |
| B3 | Villkor §6, policy §5 och ägarbeslut 4 säger att AI är avstängt | De tre texterna är rättade i denna PR: startsidans hero ("Karriär, säkerhetsjobb och verifierbara meriter på ett ställe."), CV-knappen ("Skapa nytt CV-utkast", nu en länk till skaparen, eftersom knappen i version 1 inte gav något utkast) och kandidatens intervjusida ("Arbetsgivaren använder ett strukturerat metodstöd …"). Samma löfte fanns också i Om-sidans förtroendetext och i kandidatmeddelandets element `aiProposes`; båda rättade. Engelska är skrivna av författaren och ska läsas | `bun run generative-ai-texts:check` och `public-homepage:check`. Läs de tre ställena på svenska och engelska | ✔ efter denna PR |
| B4 | Villkor §10: version 2 erbjuder AI som separata betaltjänster med beställning, prisinformation och aktivering | Inget är byggt, och det finns ingen betalintegration i koden (sökt efter betalleverantörer och betalningsflöden utan träff) | `grep` i `src` och `supabase` | ✔ |

## C. Kakor, lagring och mätning

| ID | Text | Funktion eller underlag | Så kontrolleras det | Läge |
|---|---|---|---|---|
| C1 | Policy §11: bara kakor och lagring som behövs: inloggning, språkval, sidopanelens läge, delningslänk (två kakor på 30 minuter vardera: delningsnyckeln och delningssessionen) | Kakor: `sidebar_state` (`document.cookie`, sju dagar, `src/components/ui/sidebar.tsx`) och två `HttpOnly`-kakor för Security Passport-delning, `SameSite=Lax`, `Max-Age=1800`, sökväg `/_serverFn` (`src/lib/security-passport/share-transport.ts`). Webbläsarlagring: inloggningssessionen, språk (`cqrityjob.lang`), jobbutkast, navigeringshjälp och oavslutad bedömning. **Den fullständiga listan över lagringsnycklar är fastlåst av `funnel-measurement:check` (denna PR)**: en ny nyckel stoppar bygget tills någon har bedömt den | Läs filerna. I en webbläsare: lagring och kakor efter ett besök | ✔ kod |
| C2 | Policy §11: "Vi gör ingen egen mätning av hur du använder tjänsten, och vi lagrar ingen statistikmarkering i webbläsaren" | Den valfria mätningen (`cd_v31_funnel_events`) och dess markering `cqj:funnel:once:*` är avstängda (denna PR, konstanten `FUNNEL_MEASUREMENT_ENABLED`): inget webbläsaranrop, ingen sessionslagring, och servern skriver inte ens om en gammal sida skickar. Texten säger "egen" mätning med avsikt: **hostingen lägger in ett eget sidvisningsskript (`/~flock.js`) på alla publicerade sidor**, utanför applikationen, och det går inte att stänga av därifrån. Om det behandlar personuppgifter eller sätter kakor är leverantörens fakta och en öppen punkt i policyn (ägarlistan punkt 4). **De 339 raderna 2026-08-15 till 2026-10-03 finns kvar** (tomma `user_id` och `session_id`, men det gör dem inte anonyma: de har tid, namn och detalj). Radering kräver ägarens godkännande; satsen är förberedd. **Kvarstår också:** databasfunktionen `cd_record_funnel_event` är fortfarande körbar för `anon` och `authenticated`, så en klient med den publika nyckeln kan skriva en rad direkt; applikationen gör det inte. Att återkalla det kräver en migration (backlogg för version 2) | `funnel-measurement:check`, `launch-legal:check` 1.14 (policyn säger "ingen egen mätning" bara medan konstanten är `false`), `e2e/india-landing.spec.ts` (inga serveranrop, ingen `cqj:funnel`-nyckel; körd i webbläsare lokalt, 6/6, och faller med strömbrytaren på). SQL i bilagan | ✔ egen mätning avstängd, ◐ hostingens skript (ägarens fakta), ◐ de 339 raderna (ägarens beslut) |
| C3 | Policy §11: vi sätter inga kakor för analys eller marknadsföring | Applikationen innehåller inga analys- eller spårningsskript och inga externa skript- eller typsnittsvärdar i koden. Policyn påstår inte längre att "ingen teknik som kräver samtycke" används, eftersom hostingens sidvisningsskript (C2) inte går att granska härifrån. **Fastlåst** av `funnel-measurement:check`: inga analysvärdar, inga beacons, inga analysbibliotek | `bun run funnel-measurement:check` | ✔ efter denna PR |

## D. Leverantörer och överföringar

| ID | Text | Funktion eller underlag | Så kontrolleras det | Läge |
|---|---|---|---|---|
| D1 | Policy §6: Supabase behandlar uppgifter i Frankfurt (EU) | Projektet `CQrityjob Production` har region `eu-central-1`, skapat 2026-08-28 | Supabase: Project settings | ✔ 2026-10-04 |
| D2 | Policy §6 och §8: plats och överföringsstöd för Lovable, Resend, e-postleverantören och Google | Ej ifyllt. Policyn har 18 öppna punkter: 10 är leverantörsfakta (plats och överföringsstöd, och e-postleverantörens namn), 2 är lagringstider som ägaren ska besluta (rekryteringsmaterial, granskningsloggar), 3 är lagringstider hos leverantörer (loggar, e-postloggar, säkerhetskopior), 1 är hostingleverantörens sidvisningsskript, 1 är bolagets adress och 1 är publiceringsdatum. Villkoren har 1 (adressen) | `open-facts` punkt 3 till 5 | ? |
| D3 | Policy §6: tabellen är leverantörerna | Tabellen listar direkta leverantörer. Deras egna underbiträden och eventuella andra mottagare (till exempel var Lovables värd körs) är inte kartlagda. GitHub används för kod och CI och får inga personuppgifter från produktionen | Be varje leverantör om dess underbiträdeslista. Bekräfta att inga fler tjänster tar emot personuppgifter | ? |
| D4 | Policy §8: ingen EU-regel, stöd krävs för varje överföring, köp eller godkännande ersätter inte stödet | Ägarbeslut 5. Texten gör inget påstående om fakta | `launch-legal:check` 1.12 | ✔ |

## E. Lagringstider (policy §9, byggd från `src/lib/legal/retention-plan.ts`)

Planen är godkänd som produktbeslut, med tre undantag som ägaren uttryckligen har sagt inte ska behandlas som
beslut: **13 månaders användningsstatistik, 24 månaders granskningsloggar och en allmän anonymisering efter 24
månader.** De är nu förslag (`approval: "proposed"`): inget tal i den publika texten, en öppen punkt i stället, och
talet står bara internt i `proposal`. Ägarens villkor är att rutinerna kontrolleras och **genomförs** innan tiderna
publiceras som fungerande åtaganden. Den minsta fungerande lösningen, med namngiven ansvarig (Mostafa), kontrollintervall
och logg, finns i `docs/legal/retention-runbook-v1.md`. **Raden `account` är `live`** (stängning på begäran är provad i produktion 2026-10-04, loggad), övriga rader är
`pending`, och policyn kan därför inte bli slutgiltig. Inget har raderats i produktion av denna PR.

### Avvikelser mellan `retention-plan.ts` och ägarens beslut, uttryckligen

| # | Avvikelse | Åtgärd |
|---|---|---|
| 1 | `usage-statistics` (13 månader) stod som godkänd | Förslag. Raden är borta ur policyn (mätningen är av i version 1). De 339 gamla raderna väntar på ägarens beslut |
| 2 | `admin-audit` (24 månader) stod som godkänd | Förslag. Policyn visar en öppen punkt |
| 3 | `recruitment`: "24 månader efter avslutad rekrytering och anonymiseras därefter" stod som godkänd | Förslag. Policyn säger bara "enligt arbetsgivarens dokumenterade regler och biträdesavtalet, kortare tid på begäran" och visar en öppen punkt för standardtiden. Biträdesavtalet likadant |
| 4 | `accounting` var ett tillägg av författaren, inte en del av planen | Markerad förslag. Visas som lagstadgad tid; ägaren bekräftar |
| 5 | `cd_sessions` (egna testresultat, 48 rader) låg under anonym användningsstatistik | Klassade som kontouppgifter: hör till `account`, raderas med kontot (`ON DELETE CASCADE`) |
| 6 | `sweep_application_retention()` raderar efter 12 månader och körs aldrig | Avviker från varje version av planen. Får inte köras eller schemaläggas. Ingen ändring i produktion |
| 7 | **Nytt fynd:** raden i granskningsloggen för en raderad person behåller personens e-postadress (`audit_logs`, `user_deleted`) | Policyn lovar inte mer. Ägaren avgör granskningsloggens tid eller om en senare migration slutar skriva adressen. Se `docs/release/2026-10-04-account-erasure-full-path-evidence.md` |
| 8 | **Nytt fynd:** ett raderat konto blir en gravsten i `auth.users` (adress ersatt, ingen identitet). Lösenordshashen rensas inte | Kan inte logga in. Ändras inte här |
| 9 | Feedback (`beta_feedback`, `cd_test_feedback`) överlever kontoradering, länkad bara till gravstenen | Följer sin egen rad på 12 månader. Texten säger det |

### Rader

| Rad | Godkänd? | Tid i texten | Rutin (runbook) | Läge |
|---|---|---|---|---|
| `account` | ja | Raderas inom 30 dagar efter begäran. Inaktiv 24 månader: påminnelse, radering 30 dagar senare | R1 (på begäran) och R2 (kvartalsvis, ingen förfaller före 2028-07; listan utesluter redan raderade konton och flaggar avstängda, RT3). #416 sammanslagen och tillämpad. Hela vägen bevisad lokalt och **provad i produktion 2026-10-04 08:00 UTC** med ett syntetiskt kandidatkonto med Passport-underlag: allt databasen äger borta, en gravsten kvar, adressen avidentifierad (`docs/release/2026-10-04-test-round-cleanup.md` avsnitt 5, loggad). **Inte prövat i produktion:** borttagning av en Storage-fil som finns kvar (filen var redan raderad av innehavaren) | ✔ `live` för R1; R2 manuell, inget förfaller före 2028-07 |
| `recruitment` | **förslag** | Enligt arbetsgivarens regler. Öppen punkt för standardtid | R7, per begäran. Ingen standardrutin | ✘ ägarens beslut |
| `info-mailbox` | ja | 12 månader efter senaste kontakt | R5, månadsvis, manuell | ◐ dokumenterad, ej körd |
| `job-mailbox` | ja | 24 månader efter avslutad rekrytering | R6, månadsvis, manuell. Inget förfaller före 2028-10 | ◐ dokumenterad, ej körd |
| `feedback` | ja | 12 månader | R3, månadsvis. SQL i `supabase/retention/`, **provad på syntetiska data** i `supabase/tests/retention_manual_routines_test.sql`. Utgångsläge 2026-10-04: 0 förfallna. Första förfallodag 2027-08-15 | ◐ provad, ej körd |
| `usage-statistics` | **förslag** | Inte i policyn | Ägaren: radera de 339 raderna eller besluta en tid | ✘ ägarens beslut |
| `admin-audit` | **förslag** | Öppen punkt | Ingen före beslut | ✘ ägarens beslut |
| `platform-logs`, `mail-logs`, `backups` | ja (struktur) | Öppna punkter | R8, ägaren läser leverantörens inställning. Supabase-organisationen har plan Pro (läst 2026-10-04): dagliga kopior i 7 dagar om inte återställning till tidpunkt är på (Supabase-dokumentationen) | ? ägarens uppgift |
| `sessions` | ja | Tills utloggning eller utgång | R8. Supabase Auth: en session varar som standard tills utloggning, tidsgräns kan ställas in på plan Pro | ? ägarens uppgift |
| `notice-outbox` | ja | 90 dagar efter avslutat utskick | R4, månadsvis (`select public.rec_purge_employer_notices();`) tills svepningen är konfigurerad. Funktionen provad i `employer_new_application_notices_test.sql` (EN8). Utgångsläge: 0 förfallna | ◐ provad, ej körd |
| `accounting` | **förslag** | Sju år efter räkenskapsårets utgång | Utanför produkten | ◐ ägaren bekräftar |

Inget i produktionen är äldre än någon period i planen (äldsta konto 2026-07-17, 22 konton): ingen uppgift sparas längre än
texten lovar. Det ändrar inget i att rutinerna ännu inte är körda.

## F. Rättigheter och radering

| ID | Text | Funktion eller underlag | Så kontrolleras det | Läge |
|---|---|---|---|---|
| F1 | Villkor §13: du kan avsluta ditt konto genom att skriva till info@ | En administratör raderar kontot manuellt i adminkonsolen (R1). **#416 är sammanslagen och tillämpad.** Hela anropsvägen är körd lokalt i en riktig webbläsare med ett syntetiskt konto med Passport-underlag (kontouppgifter, ett uppladdat dokument och en avläsning av det): allt databasen äger försvinner, kontot blir en gravsten, filen köas. Med migrationen återrullad faller samma prov. **Provad i produktion 2026-10-04 08:00 UTC** med ett syntetiskt kandidatkonto med Passport-underlag, efterkontrollerad skrivskyddat; filen i Storage var redan raderad av innehavaren, så borttagning av en kvarvarande fil är det enda som inte setts i produktion | Denna PR, `docs/release/2026-10-04-account-erasure-full-path-evidence.md` och `docs/release/2026-10-04-test-round-cleanup.md` avsnitt 5 | ✔ databasvägen i produktion, ◐ kvarvarande Storage-fil |
| F2 | Policy §10: tillgång, rättelse, radering, begränsning, portabilitet | Allt via info@, manuellt, med frister i en separat begärandelogg (R9). Det finns ingen självbetjäning för export eller radering | Granska rutinen | ◐ texten säger "kontakta oss" och stämmer |
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

## I. Påståenden i ägarens text som inte motsvaras av en funktion i dag

| ID | Text | Funktion eller underlag | Så kontrolleras det | Läge |
|---|---|---|---|---|
| I1 | Policy §4: "Frivilliga nyhetsbrev och samtyckeskrävande spårning" med samtycke som grund | Raden beskrev en behandling som inte finns. **Borttagen** (ägaren: ta bort text om behandling som inte används). Likaså meningen om direktmarknadsföring i §10, och "teknik som kräver samtycke får användas först efter ditt aktiva val" i §11 | `launch-legal:check` 1.14 | ✔ |
| I2 | Villkor §10: pris och villkor ska framgå före köp av en betaltjänst | Inga betaltjänster finns i version 1 (B4). Påståendet gäller framtiden | – | ✔ |

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
