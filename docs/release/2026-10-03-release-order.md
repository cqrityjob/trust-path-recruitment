# Gemensam releaseordning (2026-10-03)

**Status: förberedd för ägarens godkännande. Ingenting här är genomfört.** Ingen merge, ingen
publicering, ingen produktionsskrivning, ingen Auth-, DNS- eller Lovable-ändring och inga mejl
har gjorts av den som skrev dokumentet. Det ersätter den "provisoriska" migrationslistan i
`2026-10-03-launch-completion-report.md`: ordningen nedan är beroendebaserad, och Claude-sessionen
som äger Passport, juridik, kontaktadresser och Auth har bekräftat sin del (#386, se steg 1).

Det gäller sju migrationer, åtta PR:er och en edge-funktion. Varje steg nedan är ett eget
godkännande: ägaren godkänner det, någon med produktionsåtkomst gör det, och resultatet
verifieras skrivskyddat innan nästa steg.

## 1. Vad som finns, och vad som hänger på vad

| # | PR (utkast om inte annat anges) | Gren | Bas | Innehåll | Migration | Hänger på |
|---|---|---|---|---|---|---|
| A | [#390](https://github.com/cqrityjob/trust-path-recruitment/pull/390) | `claude/db-test-grep-q-pipefail` | main | Testskriptet `db-test.sh` fick falska fel när `grep -q` lämnade en pipe tidigt (observerat två gånger) | – | inget |
| B | [#386](https://github.com/cqrityjob/trust-path-recruitment/pull/386) (Claudes) | `claude/launch-legal-contact` | main | Villkor, integritetspolicy, kontaktadresser, avsändarnamn "<Organisation> via CQrityjob", rättad anropskontroll i `transactional-email` | – | **pausad**: ingen merge eller driftsättning förrän Astra godkänt omkontrollen av autentiseringen |
| C | [#387](https://github.com/cqrityjob/trust-path-recruitment/pull/387) | `claude/busy-clarke-42da1t` | main | Domän och metadata, kontaktflödet, XSS-rättning, landning och navigation, kandidatflödet, jobbtavlan, arbetsgivarkontot; **innehåller #386 och main (#389) inmergade** | `20270130090000`, `20270131090000`, `20270201090000` | **B först** (annars bär C in B:s commits) |
| D | [#391](https://github.com/cqrityjob/trust-path-recruitment/pull/391) | `claude/career-analysis-availability` | C | Karriäranalysens tillgänglighet, en källa för alla ytor, indexering följer tillståndet | – | C |
| E1 | [#392](https://github.com/cqrityjob/trust-path-recruitment/pull/392) | `claude/employer-notice-schema` | C | Utkorg för mejl till arbetsgivaren vid ny ansökan (schema) | `20270205090000` | C, och F1 applicerad (versionsordning, se regel 2) |
| E2 | [#393](https://github.com/cqrityjob/trust-path-recruitment/pull/393) | `claude/employer-notice-app` | E1 | Avsändare, kö-hantering, sweep, kind `employer_new_application` i edge-funktionen | – | E1 applicerad och verifierad; funktionen omdriftsatt |
| F1 | PR_ACCESS_SCHEMA | `claude/employer-report-access-schema` | C | Behörighetsrättning, schema | `20270202090000`, `20270203090000`, `20270204090000` | C |
| F2 | PR_ACCESS_APP | `claude/employer-report-access-app` | F1 | Behörighetsrättning, app | – | F1 applicerad och verifierad |

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
3. **Merge publicerar inte.** Koden synkas till Lovable direkt, men www ändras först när ägaren
   publicerar (L5 i `2026-10-03-www-domain-cutover.md`). Edge-funktioner driftsätts separat.
4. **#387 bär #386.** De är samma commits. Mergar ägaren #386 först krymper #387:s diff till resten;
   mergar ägaren #387 först följer #386:s kod, inklusive den ogranskade autentiseringsändringen,
   med. **Merga inte #387 innan Astra godkänt #386.**

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

1. Astra godkänner den riktade omkontrollen av autentiseringen i `transactional-email`
   (`callerIsServer` frågar projektets Auth vid varje anrop; ingen cache, ingen nyckelgenväg från miljön).
2. Merge #386, **driftsätt `transactional-email`** (ägaren har godkänt driftsättningen enligt Claude-sessionen).
3. Skrivskyddat: kontaktformuläret öppnas (readiness), loggen visar 200 i stället för 401.
4. **Testutskick T1–T5** (`2026-10-03-production-test-request.md`, "Mottagarregeln och ett enda
   utskickstillfälle"): en utförare, varje utskick en gång, bara till den av ägaren namngivna testadressen.
   Claude-sessionen skickar; jag (eller den) kontrollerar loggarna skrivskyddat efteråt.

### Steg 2 — #387 (C): jobbtavlans tre migrationer och appen

Förutsättning: steg 1 klart (så att C inte bär ogranskad kod).

1. Jämför hostade md5 (se `verify`) för `jobs_validate_before_write()` (förväntat `7e7477c391e41071f01e599e90c8e1a5`)
   och att inga andra policys än de listade rör bucketen `job-application-cvs`.
2. Merge #387. Integrationen applicerar `20270130 → 20270131 → 20270201`.
   Appen i C fungerar både före och efter migrationerna (expand/contract) och passerar schema-first-guarden.
3. Verifiera varje migration med dess `verify`-fråga, kontrollera att inga nya funktioner saknar
   `REVOKE` för `anon` (steg 7 i release-sequence), registrera.
4. **Publicera i Lovable (L5)**, gör Auth-delen (S1, S2, Claudes konfiguration) och kör sedan
   produktionstestet från www: avsnitt 2 (direktlänkar, omladdning), avsnitt 3 steg 1–10 och
   avsnitt 4 (migrationsberoende prov).

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
6. Merge F2 (guarden släpper den nu), publicera. Produktionsprov: testkontona A-OWN (läser),
   A-REV med granskaråtkomst (läser), A-MEM vanlig medlem (nekas, ser "ingen åtkomst" och inte en
   tom lista), A-REM borttagen (nekas), och att en avstängd person som ansöker om åtkomst igen
   nekas (`ACCESS_REQUEST_MEMBERSHIP_BLOCKED`).

### Steg 4 — mejl till arbetsgivaren vid ny ansökan (E1 → E2)

Efter steg 3 (versionsordning). Additivt: inget ändras för någon förrän appen publiceras.

1. Merge E1. Integrationen applicerar `20270205090000`.
2. Verifiera de sex pinnade `md5(prosrc)` (release-noten), att inga av de nya funktionerna har
   `EXECUTE` för `anon`/`authenticated`, att utkorgen har RLS påtvingad och ingen policy. Registrera.
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

1. Astras omkontroll av `transactional-email` (#386) är inte godkänd; alla produktmejl är stängda tills dess.
2. Alla produktionssteg ovan är ogjorda och ogodkända. Inget är verifierat i produktion: sandlådan
   når inte `supabase.co` eller www.
3. Auth-konfigurationen från www (Site URL, Redirect URLs) är Claude-sessionens och ogjord.
4. Juridikens öppna platshållare (Claude-sessionens) och vem som bevakar `job@`.
5. Ägarbesluten i avsnitt 4.
6. Kvarstår medvetet utanför dessa PR:er: innehållsrollernas `*_author_read`-policyer (läser alla
   hyresgästers kandidatsvar; antalet innehavare okänt), BESKT:s `bcp_employer_*`-medlemsläsningar,
   den pensionerade v3.0-karriäranalysen som fortfarande kontrollerar testarlistan oavsett läge.
