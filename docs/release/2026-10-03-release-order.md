# Gemensam releaseordning (2026-10-03)

**Status 2026-10-03 ~20:00 UTC.** Mergade i main: #395, #386, #387, #398, #399, #396 (`2b5015d`), #401, #402 (Lovables hero och dess
kontroller), #397 (`72b4df8`, appen för behörighetsrättningen), #391 (karriäranalysen), #400 (`a3814f9`) och #392 (`d2c02b8`, schemat
för mejl till arbetsgivaren); dessutom #403 (annan författare: startsidans bakgrundsvideo byttes). Migrationerna i steg 2 (#387), steg 3 (#396, `20270202`–`20270204`) och steg 4 (#392, `20270205`) är
applicerade av integrationen och verifierade skrivskyddat av två läsare; ledgern har 367 rader, digest
`77e07c074bb73aac9ac11a569b5ca214`. Publiceringspunkt 1 (Lovable, `65823f2`) gjordes av driftsessionen 15:49–15:51 UTC och kontrollerades på www
(canonical, villkorsruta, readiness 200, CV-rättningen); senare publiceringar sköts av driftsessionen. **Kvar:** #393 (appen för mejl till arbetsgivaren), att kontrollera att `transactional-email` i
produktion har `employer_new_application` före dess publicering, nästa publicering i Lovable, funktionen `transactional-email`s
hemlighet, Auth-/DNS-inställningar och produktionsproven. Den som skrev dokumentet har inte publicerat, driftsatt någon funktion, ändrat
Auth, DNS eller Lovable, och inga mejl har skickats av den. Det ersätter den "provisoriska" migrationslistan i
`2026-10-03-launch-completion-report.md`: ordningen nedan är beroendebaserad. Claude-sessionen som
äger Passport, juridik, kontaktadresser och Auth har bekräftat sin del: #386 är **mergad** (main
`071f69e`) och funktionen `transactional-email` version 3 är driftsatt 2026-10-03 13:47:03 UTC
(enligt dess PR [#394](https://github.com/cqrityjob/trust-path-recruitment/pull/394); jag har inte
verifierat det i produktion).

Det gäller sju migrationer, åtta PR:er och en edge-funktion. Varje steg nedan är ett eget
godkännande: ägaren godkänner det, någon med produktionsåtkomst gör det, och resultatet
verifieras skrivskyddat innan nästa steg.

## 1. Vad som finns, och vad som hänger på vad

| # | PR (utkast om inte annat anges) | Gren | Bas | Innehåll | Migration | Hänger på |
|---|---|---|---|---|---|---|
| A | [#390](https://github.com/cqrityjob/trust-path-recruitment/pull/390) | `claude/db-test-grep-q-pipefail` | main | Testskriptet `db-test.sh` fick falska fel när `grep -q` lämnade en pipe tidigt (observerat två gånger) | – | inget |
| B | [#386](https://github.com/cqrityjob/trust-path-recruitment/pull/386) (Claudes) | `claude/launch-legal-contact` | main | **Mergad** (main `071f69e`). Villkor, integritetspolicy, kontaktadresser, avsändarnamn "<Organisation> via CQrityjob", rättad anropskontroll i `transactional-email` (godkänd av Astra på `43180b8`) | – | klar; ligger i main och i C |
| C | [#387](https://github.com/cqrityjob/trust-path-recruitment/pull/387) | `claude/busy-clarke-42da1t` | main | Domän och metadata, kontaktflödet, XSS-rättning, landning och navigation, kandidatflödet, jobbtavlan, arbetsgivarkontot; main (#386, #388, #389) inmergad | `20270130090000`, `20270131090000`, `20270201090000` | inget annat än ägarens godkännande |
| G | [#395](https://github.com/cqrityjob/trust-path-recruitment/pull/395) | `claude/ci-stacked-prs` | main | CI körs även på PR:er som är staplade på en `claude/**`-gren (annars saknar de CI helt) | – | mergas före eller tillsammans med C; ligger redan i de staplade grenarna |
| D | [#391](https://github.com/cqrityjob/trust-path-recruitment/pull/391) | `claude/career-analysis-availability` | C | Karriäranalysens tillgänglighet, en källa för alla ytor, indexering följer tillståndet | – | C |
| E1 | [#392](https://github.com/cqrityjob/trust-path-recruitment/pull/392) | `claude/employer-notice-schema` | C | Utkorg för mejl till arbetsgivaren vid ny ansökan (schema) | `20270205090000` | C, och F1 applicerad (versionsordning, se regel 2) |
| E2 | [#393](https://github.com/cqrityjob/trust-path-recruitment/pull/393) | `claude/employer-notice-app` | E1 | Avsändare, kö-hantering, sweep, kind `employer_new_application` i edge-funktionen | – | E1 applicerad och verifierad; funktionen omdriftsatt |
| F1 | [#396](https://github.com/cqrityjob/trust-path-recruitment/pull/396) | `claude/employer-report-access-schema` | C | Behörighetsrättning, schema | `20270202090000`, `20270203090000`, `20270204090000` | C |
| F2 | [#397](https://github.com/cqrityjob/trust-path-recruitment/pull/397) | `claude/employer-report-access-app` | F1 | Behörighetsrättning, app | – | F1 applicerad och verifierad |

### Fyra regler som avgör ordningen

1. **Schema först, appen sen** (`docs/release/release-sequence.md`, `schema-first-release:check`).
   Varje app-PR som anropar en ny databasfunktion (E2, F2) kan inte mergas förrän dess migration är
   applicerad, verifierad och registrerad. Guarden stoppar det.
2. **Migrationer appliceras av den officiella Supabase-integrationen när PR:en mergas**, i
   versionsordning. Att merga ett schema-PR *är* att tillämpa det. Håll därför versionerna
   stigande: `20270130 → 20270131 → 20270201 → 20270202 → 20270203 → 20270204 → 20270205`. En
   migration med lägre version än den senast applicerade avvisas av migreringsverktyget eller
   kräver `--include-all`. Det är skälet till att behörighetsschemat (`0202–0204`) går före
   notisschemat (`0205`).
3. **Merge publicerar inte, men den kan driftsätta edge-funktioner.** Koden synkas till Lovable direkt, men www ändras
   först när ägaren publicerar (L5 i `2026-10-03-www-domain-cutover.md`). Lovable driftsätter däremot en ändrad
   edge-funktion automatiskt vid synk: observerat 2026-10-03 att `transactional-email` blev v7 15:32:21 UTC efter
   #395 (koden byte-identisk med main) och `passport-share` blev v7 15:43:01 UTC efter #387 (`verify_jwt=false`).
   Det som ligger i en merge går alltså inte att tidsätta separat: kontrollera funktionens version och beteende
   direkt efter merge i stället för att planera en driftsättning före publiceringen.
4. **Staplade PR:er får CI först med #395.** CI lyssnar bara på PR:er mot `main`; #391–#393 och
   behörighets-PR:erna har #387 som bas. Deras grenar innehåller #395:s fyra rader, så CI körs på dem.

## 2. Ordningen

Varje steg: *godkänn → gör → verifiera skrivskyddat → registrera → nästa.* "Registrera" är en egen
liten PR som sätter `hostedState: applied` i `supabase/release-state.json`, tar bort namnet ur
`expectedPending` i `scripts/release-frontier-check.ts` och uppdaterar `supabase/hosted-ledger.json`
med verifieringsutdraget, på samma sätt som #389 gjorde för `20270126090000`.

Skrivskyddade verifieringsfrågor och hostade md5 att jämföra *före* varje applicering står i
respektive posts `verify`-fält:

```bash
jq -r '.frontier[] | select(.hostedState=="pending") | "\(.file)\n\(.verify)\n"' supabase/release-state.json
```

### Steg 0 — inget i produktion

- **#390 (A)** kan mergas när som helst: den ändrar bara testskriptet.
- Granska C, D, E1, E2, F1, F2. Inget av detta behöver göras i produktion.

### Steg 1 — #386 och funktionen (Claudes del)

Gjort enligt #394: Astra godkände `43180b8` (anroparkontrollen frågar projektets Auth vid varje anrop; ingen
cache, ingen nyckelgenväg från miljön); #386 mergad som `071f69e`; `transactional-email` version 3 driftsatt
13:47:03 UTC. Kvar:

1. **Funktionen svarar 503 `not_configured`** (enligt #394, 14:08–14:09 UTC): hemligheten `RESEND_API_KEY` saknas
   eller är fel satt på funktionen. Tills den är satt är kontakt, kvitto, meddelanden och arbetsgivarmejl stängda.
   Det är en ägar-/konfigurationsåtgärd (R2 i `2026-10-03-www-domain-cutover.md`).
2. **Den publicerade sajten saknar #386** (villkor och integritetspolicy ger 404 där). Lovable har synkat
   men inte publicerat; publicering görs i steg 2.
3. **Testutskick T1–T5** (`2026-10-03-production-test-request.md`): en utförare (Claude-sessionen), varje
   utskick en gång, bara till de adresser ägaren godkänt. T2 är skickad enligt #394; T3 blockerad av punkt 1;
   T4–T5 väntar på T1. Jag kontrollerar loggarna skrivskyddat efteråt.
4. Skrivskyddat efter punkt 1: kontaktformuläret öppnas (readiness), loggen visar 200 i stället för 503/401.

### Steg 2 — #387 (C): jobbtavlans tre migrationer och appen

Förutsättning: ägarens godkännande. (#386 ligger redan i main, så C bär ingen ogranskad kod.)

1. Jämför hostade md5 (se `verify`) för `jobs_validate_before_write()` (förväntat `7e7477c391e41071f01e599e90c8e1a5`)
   och att inga andra policys än de listade rör bucketen `job-application-cvs`.
2. Merge #387. Integrationen applicerar `20270130 → 20270131 → 20270201`.
   Appen i C fungerar både före och efter migrationerna (expand/contract) och passerar schema-first-guarden.
3. Verifiera varje migration med dess `verify`-fråga, kontrollera att inga nya funktioner saknar
   `REVOKE` för `anon` (steg 7 i release-sequence), registrera.
   **Utfall 2026-10-03:** #387 mergad 15:42 UTC (`b18e5e5`). Integrationen applicerade exakt de tre versionerna.
   Skrivskyddat verifierat av två läsare oberoende av varandra (Claude-sessionen 15:43–15:47, denna session
   15:45–15:46): ledgern har 363 rader, sista versionen `20270201090000`, digest `fbfc766e1fd85a3d19fc82b8f4fbc8c7`
   (de första 360 oförändrade, `dcb7e4bcb694e2afece115a18a595383`); `jobs_validate_before_write` har md5
   `bc292d28d31dd973c81f1cffc145b5bf` (efter 0131), är inte SECURITY DEFINER och saknar EXECUTE för `anon` och
   `authenticated`; bucketen `job-application-cvs` har exakt en policy, `job_cvs_employer_select`. Bara
   Claude-sessionen läste loggar och rådgivare: inga ERROR/FATAL/PANIC i Postgres-loggen från 15:40 och inga nya
   fynd för jobb eller CV-bucketen (fyndet `security_definer_view` på `scp_scoring_version_lineage` fanns redan).
   Evidens och registrering: `docs/release/2026-10-03-job-board-hosted-verification.md`.
4. **Publicera i Lovable (L5)**, gör Auth-delen (S1, S2, Claudes konfiguration) och kör sedan
   produktionstestet från www: avsnitt 2 (direktlänkar, omladdning), avsnitt 3 steg 1–10 och
   avsnitt 4 (migrationsberoende prov).

### Steg 2b — edge-funktionen `passport-share` (kom med #387)

#387 ändrar `supabase/functions/passport-share/index.ts` med sex rader: reservoriginen är
`https://www.cqrityjob.com`, och en `PUBLIC_SITE_URL` som pekar på `*.lovable.app`, `lovableproject.com` eller
`lovableproject-dev.com` ignoreras. Inget databasobjekt berörs, så ordningen mot migrationerna spelar ingen roll.

- **Observerat:** Lovable driftsatte funktionen automatiskt, v7 15:43:01 UTC, `verify_jwt=false`. Anonym GET svarar 503,
  alltså är `PASSPORT_SHARE_ENTRY_PUBLISHED` inte satt och 503 är skyddet. `https://www.cqrityjob.com/p` svarar 200.
- **Villkor som gäller i alla fall:** `verify_jwt` förblir `false` (annars 401 för anonyma länkar); flaggan
  (`S7` i `2026-10-03-www-domain-cutover.md`) sätts först när `https://www.cqrityjob.com/p` visar entry-sidan efter
  publiceringen, och `PUBLIC_SITE_URL` (S5) ska vara `https://www.cqrityjob.com` eller osatt.
- En **manuell** driftsättning av funktionen är en produktionsskrivning och kräver ägarens uttryckliga godkännande.

### Steg 3 — behörighetsrättningen (F1 → F2)

**Beteendeändring som träder i kraft i samma stund som `20270203090000` appliceras**, oavsett app:
en medlem som inte är ägare, administratör, granskare för användningsfallet, ansvarig rekryterare för
annonsen eller skapare/panelmedlem av ett intervjuärende läser inga rapporter, rader eller räknare.
Därför:

1. **Ägarbeslut** (se avsnitt 4): att vanligt medlemskap inte räcker.
2. **Förarbete, skrivskyddat:** räkna (bara antal) aktiva medlemmar med rollen `member` i aktiva
   organisationer som har frisläppta rapporter, och meddela de organisationerna att tilldela
   granskaråtkomst (Inställningar → Team) till dem som ska fortsätta läsa. Underlag finns i
   `2026-10-03-employer-report-access-model.md`.
3. Hostade md5 före: `approve_access_request` `91ce1c857970f99b10081a76c763e331`,
   `scp_iv_can_read_case` `e60a8e8a9741d6241cdd98005fbd4094`, `scp_iv_can_write_case`
   `1249ebde36e1743a717050ab48573a61`, `scp_iv_case_row_visible` `b6f6f202675bddc95a6e2e83cba67bf6`,
   `scp_report_snapshot_readable` (3 arg) `3e86e5201f8bb9c822f556148c0b41dd`, `scp_employer_report`
   `ed549724a1cd9328e8cd4ef50a935ae4`, och det skrivskyddade antalet levande granskargrants hos icke-aktiva medlemmar.
4. Merge F1. Integrationen applicerar `20270202 → 20270203 → 20270204` (`0204` vägrar utan `0203`).
5. Verifiera nya md5, att `anon` saknar `EXECUTE` på `employer_reports_readable`,
   `scp_attempt_reports_readable`, den fyrargumentiga `scp_report_snapshot_readable` och
   `employer_report_access`, och att de sju policyerna namnger den nya funktionen. Registrera.
   **Utfall 2026-10-03:** #396 mergad (`2b5015d`). Förarbetet gav: 11 aktiva organisationer, 5 owner, 1 admin, 3 member
   (2 med granskargrant), alltså **1 person i 1 organisation** som förlorar generell rapportåtkomst; ägaren godkände det
   och att ingen får granskarbehörighet automatiskt. Före: alla sex md5 enligt punkt 3. Efter, skrivskyddat av två läsare:
   ledgern har 366 rader, sista versionen `20270204090000`, digest `ae6f49cb25fa072932ae6aaf8d2b4ddc` (de första 363
   oförändrade); alla 25 funktionskroppar lika med en strikt lokal replay av `e7b5a3d`; `anon` saknar `EXECUTE` på alla
   nya gate- och vaktfunktioner; `employer_report_access` är `false/true` för anon/authenticated; båda triggrarna är
   `enabled O`; de sju policyerna namnger den nya funktionen; levande granskargrants hos icke-aktiva medlemmar: 0.
   Evidens: `2026-10-03-report-access-hosted-verification.md`.
6. Merge F2 (guarden släpper den nu), publicera. Produktionsprov: testkontona A-OWN (läser),
   A-REV med granskaråtkomst (läser), A-MEM vanlig medlem (nekas, ser "ingen åtkomst" och inte en
   tom lista), A-REM borttagen (nekas), och att en avstängd person som ansöker om åtkomst igen
   nekas (`ACCESS_REQUEST_MEMBERSHIP_BLOCKED`).

### Steg 4 — mejl till arbetsgivaren vid ny ansökan (E1 → E2)

Efter steg 3 (versionsordning). Additivt: inget ändras för någon förrän appen publiceras.

1. Merge E1. Integrationen applicerar `20270205090000`.
2. Verifiera de sex pinnade `md5(prosrc)` (release-noten), att inga av de nya funktionerna har
   `EXECUTE` för `anon`/`authenticated`, att utkorgen har RLS påtvingad och ingen policy. Registrera.
   **Utfall 2026-10-03:** #392 mergad (`d2c02b8`, huvud `aa8e7a5`). Verifierat skrivskyddat av två läsare: ledgern har 367 rader,
   sista versionen `20270205090000`, digest `77e07c074bb73aac9ac11a569b5ca214` (de första 366 oförändrade); alla sex
   funktionskroppar lika med den lokala replayen; `anon` och `authenticated` saknar `EXECUTE` på alla sex, `service_role` har det
   på fem (inte backoff-hjälparen); utkorgen har RLS påtvingad, 0 policyer, 0 triggrar, ingen rättighet för klienterna
   (`service_role` bara `SELECT`) och 0 rader. Inga skrivprov och inga kandidatdata. Evidens:
   `2026-10-03-employer-notice-hosted-verification.md`.
3. Merge E2. **Driftsätt `transactional-email` en gång till, före publicering**: raden
   `employer_new_application` finns bara i E2, så #386:s driftsättning innehåller den inte. Gör man
   det i omvänd ordning svarar den gamla funktionen 400 på kinden och raderna blir `failed`/400 utan återförsök
   (återställning finns i release-noten).
4. Kontrollera att `RECRUITMENT_SWEEP_URL` och `RECRUITMENT_SWEEP_TOKEN` är satta, publicera.
5. **Test T6**: testföretagets notifierade ägare/administratör är den godkända adressen; en ansökan; exakt
   ett mejl; ett andra försök ger ingen dubblett.

### Steg 5 — karriäranalysens tillgänglighet (D)

Ingen migration; kan göras när som helst efter steg 2. Merge #391, publicera. Efter det gäller
det fortfarande läget `internal_test`: ingen åtkomst har ändrats. Att **öppna** analysen är ett
separat ägarbeslut (avsnitt 4) som görs med `cd_set_access_state('public', …)` enligt
`2026-10-03-career-analysis-availability.md`, med det skrivskyddade kontrollskriptet före och efter.

### Steg 6 — avslut

Ta bort Lovable-ursprungen ur Auths Redirect URLs först när den gamla värden är pensionerad, och
omdirigera den gamla värden (L1) **sist** (se `2026-10-03-www-domain-cutover.md`, avsnitt 4).

## 3. Rollback per steg

| Steg | Återställning |
|---|---|
| 1 | Driftsätt föregående funktionsversion; koden återställs med PR:en |
| 2 | Respektive `supabase/rollback/*_rollback.sql` i omvänd ordning (`0201`, `0131`, `0130`); appen tål båda lägena |
| 3 | `20270204`, sedan `20270203`, sedan `20270202`, var och en återställer sina kroppar efter md5. Åtkomst som redan neats återkommer då för vanliga medlemmar |
| 4 | Rollback-skriptet för `20270205090000`; appen tolererar att funktionen saknas (loggad no-op) |
| 5 | `cd_set_access_state('internal_test' \| 'paused', …)`. Artefakten `20261222090000_cd_access_policy_rollback.sql` vägrar medan läget är `public` och används inte för att stänga |

## 4. Ägarbeslut som ordningen förutsätter

1. **Behörighet (steg 3):** vanligt medlemskap ger inte rapportåtkomst; ägare/administratör,
   granskare per användningsfall, ansvarig rekryterare och ärendets skapare/panel gör det. Beslutet
   ändrar vad befintliga organisationer ser samma dag migrationen appliceras.
2. **Säkerhetsansvarig (steg 3):** en utsedd säkerhetsansvarig som är vanlig medlem utan grund kan inte
   läsa ett prövningsärende (begränsningen blir bara snävare). Vill ägaren annat är det en ändring i `20270204`.
3. **Karriäranalys (steg 5):** öppna för konton som inte är testare, trots att instrumentets sju
   granskningsgrindar alla är `false` och etiketterna är utkast. Att öppna gör också sidan indexerbar
   och listar den i sitemap (det är avsiktligt: ett reglage, inget glömt andra steg).
4. **Arbetsgivarmejl (steg 4):** ingen avanmälan (opt-out) i första versionen; mottagare är ansvarig
   rekryterare, annars ägare och administratörer (högst 10).
5. **Testmottagare:** en av ägaren namngiven adress, och vem som bevakar `job@cqrityjob.com` och med
   vilken svarstid (så länge svar går dit).
6. **Merge-godkännande per steg.** Inget här är godkänt; ingen merge eller produktionsändring har gjorts.

## 5. Vad som återstår som blockerar publik lansering

1. `RESEND_API_KEY` saknas på den driftsatta funktionen (503 `not_configured` enligt #394), så alla produktmejl
   är fortfarande stängda trots att Astra godkänt och funktionen är driftsatt. Sajten som är publicerad saknar #386.
2. Alla produktionssteg ovan är ogjorda och ogodkända. Inget är verifierat i produktion: sandlådan
   når inte `supabase.co` eller www.
3. Auth-konfigurationen från www (Site URL, Redirect URLs) är Claude-sessionens och ogjord.
4. Juridikens öppna platshållare (Claude-sessionens) och vem som bevakar `job@`.
5. Ägarbesluten i avsnitt 4.
6. Kvarstår medvetet utanför dessa PR:er: innehållsrollernas `*_author_read`-policyer (läser alla
   hyresgästers kandidatsvar; antalet innehavare okänt), BESKT:s `bcp_employer_*`-medlemsläsningar,
   den pensionerade v3.0-karriäranalysen som fortfarande kontrollerar testarlistan oavsett läge.
7. Rådgivarens fynd `security_definer_view` på `scp_scoring_version_lineage`: Astras oberoende granskning är registrerad
   som **accepterad enligt dokumenterat designbeslut, inget nytt bekräftat lanseringshinder**; vyn är inte ändrad.
   Uttryckligen: **utkastmetadata är läsbara för alla inloggade**, och **faktisk rapportanvändning är inte verifierad**.
   Se `2026-10-03-scoring-lineage-review.md` (testbevisen ligger i `evidence/2026-10-03-scoring-lineage/`) och
   [#406](https://github.com/cqrityjob/trust-path-recruitment/pull/406). Åtkomstfixarna i #404–#406 är separata releaser
   och påverkas inte.
