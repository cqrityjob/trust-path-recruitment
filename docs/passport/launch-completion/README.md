# Security Passport – slutuppdrag inför lansering (2026-10-13)

Branch `claude/confident-allen-e61rai`, utgår från `main` @ `fd5d171`. **Ingen migration.**
Ändringen är bara applikation och guards, så schema-first-ordningen kräver inget eget
schemasteg. Inget har skrivits till produktion. Den enda produktionskontakten var en
läsfråga mot katalogräkningen (avsnitt 4).

## 1. Sammanfattning

| Område | Verifierat | Rättat i denna PR | Återstår / hinder |
|---|---|---|---|
| **Kandidatflöde** | Registrering via katalogen, datumvalidering, uppladdning med återförsök som inte skapar en ny merit (`savedId`), avbruten uppladdning (`EvidenceUploadRecoveryPanel`), rättelse, arkivering och utgången merit (befintliga suites och guards, avsnitt 3) | Dubblettvarning. ”Gällande nu”/”Current” i stället för ”Aktiva”/”Active”. ”Vad dina registrerade meriter visar” i stället för ”Titel som meriterna ger stöd för”. ”Nästa steg” öppnar meriten direkt vid rätt åtgärd. Stavfelet ”Öppna meriter” rättat | Hela kedjan har inte körts mot en verklig Auth- och Storage-stack (avsnitt 5) |
| **Adminflöde** | Beslutet är bundet till granskad version: en gammal granskningsvy nekas efter ändrat innehåll eller tillagt underlag (SR0–SR6). Endast `document_review` kan registreras, och ett adminbeslut visas som *Dokumenterad*, aldrig som källbekräftelse. Komplettering, egen ansökan och dubbelklick (`busy`) | Kön visar inte längre ”Inget att granska” under laddning eller efter fel. Samma rättelse för bestridda uppgifter. Misslyckad behörighetskontroll visas inte längre som ”ingen behörighet”. Filter på merittyp och fritext. Raden ”Beslutet gäller version N, inskickad …”. Sidmarginal på `/passport-review` | Kandidatens fritextsvar på en komplettering finns inte som eget fält. Svaret är rättelse och/eller nytt underlag, och båda flyttar versionen |
| **Katalog** | Produktion: 154 av 154 internationella definitioner aktiva. Lokal replay: 154/154, och `security_passport_catalogue_completeness_test` sparar och läser tillbaka varje aktiv definition | – | De 7 prioriterade researchposterna: **alla BLOCKERADE**. Utfärdarsidorna kunde inte öppnas från miljön (avsnitt 4). Inget publicerat |
| **Delning** | Urval per delning, förhandsvisning, återkallelse och utgång mot bild och sida (`security_passport_credential_sharing_v2_test`, plus tidigare bevis i `2026-10-05-security-passport-v1-readiness.md` §3) | – | **Ordning och framhävning per delning stöds inte.** Urvalet är en mängd utan ordning, och den publika läsningen har ingen ordinal. Det kräver en schemaändring (egen PR i schema-first-ordning) |
| **Behörigheter** | `security_passport_reviewer_role_test`: icke-granskare nekas kö, detalj och beslut. `security_passport_phase5_test`: lagrings- och dokumentgräns. `security_passport_employer_verification_test`: obehörig kollega, borttagen medlem och annat företag nekas | – | Direkta API-anrop mot den publicerade miljön är inte körda (avsnitt 5) |

## 2. Före och efter

Bilderna är tagna med den befintliga hermetiska harnessen (`e2e/support/public-entry-harness.ts`).
Alla personer är syntetiska och allt backend-svar är stubbat. sv/en finns i 1440 och 390 px.
Kontrollsummor finns i `screenshots.sha256`.

| Vad | Före | Efter |
|---|---|---|
| Översiktens panel: statusräkning, sammanfattning, nästa steg | `before-overview-panel-*.png`: ”Aktiva”, ”Titel som meriterna ger stöd för”, ”Visa meriten” | `after-overview-panel-*.png`: ”Gällande nu”, ”Vad dina registrerade meriter visar” med förklaring, ”Bifoga underlag →” |
| Dubblettvarning (CPP finns redan) | – (fanns inte) | `after-duplicate-warning-*.png` |
| Granskarkö när läsningen misslyckas | `before-review-queue-failed-*.png`: ”Kön kunde inte hämtas” **och** ”Inget att granska just nu”. Ingen sidmarginal | `after-review-queue-failed-*.png`: bara felet och ”Försök igen”. Samma för bestridda |
| Granskarkö med ärenden | `before-review-queue-list-*.png` | `after-review-queue-list-*.png`: typfilter, sök, ”Visar 3 av 3” |

## 3. Tester som körts (reproducerbart)

| Kommando | Resultat |
|---|---|
| `bunx tsc --noEmit`, `bun run scripts:typecheck`, eslint och prettier på ändrade filer | grönt |
| 49 `passport-*:check` + nya `passport-launch-completion:check` (17) | grönt (shield-guarden uppdaterad: ”Active” → ”Current”) |
| `negative-controls:passport-page-composition` | 32 av 32 mutationer upptäckta; 4 nya för det nya nästa-steg-beteendet |
| Negativ kontroll av `passport-launch-completion:check` mot gamla källan | misslyckas som väntat |
| `e2e/passport-overview-acceptance.spec.ts` (Chromium, sv+en, 390+1440) | 8 av 10. De två fallerande (”card finish … homepage”) fallerar identiskt på oförändrad `main` (`[data-home-passport-preview]` saknas). Fel som fanns före ändringen |
| Full migreringsreplay (394 filer) på lokal PostgreSQL 16 | ok |
| SQL-suites mot replayen: `sp_decision_bound_to_reviewed_content` (SR0–SR6), `reviewer_role`, `phase5`, `credential_sharing_v2`, `employer_verification`, `international_wallet`, `closed_catalogue`, `catalogue_completeness` | alla 8 rc=0 |

`scripts/db-test.sh` i sin helhet stannar i denna miljö vid ett steg som kräver Docker
(recruiter-domain-conflict). Passport-suites ovan kördes därför direkt mot samma replay.
CI kör hela skriptet.

## 4. Katalogen

Produktionen kontrollerades med en läsfråga utan persondata:
`select count(*) filter (where is_active), count(*) from sp_credential_types where scope_code='global_professional'`
→ **154 / 154**.

De sju prioriterade researchposterna gicks igenom den 2026-10-13. Varje försök att öppna
utfärdarens egen sida misslyckades med `getaddrinfo ENOTFOUND`. Det gällde theiia.org,
acams.org, ismi.org.uk, security-institute.org, charteredsecurityprofessional.org,
register.ofqual.gov.uk och credly.com. Det som finns är bara sökutdrag, och sådana godtas
inte som starkare evidens enligt researchregeln. **Ingen post är publicerad.**

| Post | Ledtråd från sökutdrag (ej bevis) | Hinder |
|---|---|---|
| Chartered Security Professional (CSyP) | Royal Charter hos Worshipful Company of Security Professionals; Security Institute administrerar registret; årlig CPD | Utdelande organ, offentligt register (URL) och omprövningsregel måste läsas på öppnad officiell sida |
| CSMP (ISMI) | ”SFJ Awards Level 6 Diploma for Certified Security Management Professionals (CSMP®)”; ISMI är leverantör, SFJ Awards utdelande organ | Ofqual-nummer och titel ska bekräftas i Ofqual-registret; giltighetsregel okänd |
| CIA (IIA) | IIA; CPE-krav; IIA Certification Registry (certified.theiia.org) | Aktuella CPE-regler och registret ska öppnas |
| CRMA (IIA) | IIA; specialistcertifiering | Aktuell status (fortfarande erbjuden?) ej fastställd |
| CGSS (ACAMS) | Omcertifiering vart tredje år, 30 poäng | Verifieringsväg ej fastställd |
| CAFS (ACAMS) | Lanserad omkring 2024, beskriven som modulär | Status och klass (certifiering eller bedömt certifikat) ej fastställda |
| CCAS (ACAMS) | Två namnformer på utfärdarens sidor | Exakt officiellt namn och verifieringsväg ej fastställda |

**För att låsa upp:** öppna sidorna från ett nät som når dem, fyll i fakta i
`scripts/lib/passport-catalogue-research-data.ts` och publicera via en granskad katalogmigration
(befintlig process, release 3-mönstret). De övriga 9 posterna (CILA, ICA ×2, IAP, IFCPP CVRS,
LPC, LPQ, CWBSP, PRMIA ORM) har samma hinder som i `certification-catalogue-integration.md` §5.

## 5. Vad som inte är gjort och varför

- **Sammanhängande test mot en verklig testmiljö med Auth, databas och Storage.** Miljön saknar
  Docker-daemon, så den lokala Supabase-stacken (`scripts/local-stack/up.sh`) kan inte startas.
  Det finns inte heller någon separat hostad testmiljö eller testkonton. Produktionen användes
  medvetet inte: syntetiska meriter får aldrig godkännas där. Fallen 1–5 i uppdraget
  (VU1, reglerad behörighet, ASIS APP/CPP, annan internationell, erfarenhet med
  arbetsgivargranskning) samt avslag, komplettering, dubbelklick och samtidiga beslut täcks
  på databasnivå av suites i avsnitt 3. De är **inte** körda genom appens UI mot riktig Auth och
  Storage i denna leverans. Nästa steg är att köra `e2e/passport-public-pilot-local.spec.ts` och
  `scripts/passport-live-local-journey-check.mjs` på en maskin med Docker, eller i CI-jobbet som
  redan gör det.
- **Ordning och framhävning per delning:** kräver schemaändring, se tabellen i avsnitt 1.
- **Kandidatens fritextsvar på komplettering:** finns inte som eget fält. Svaret är en rättelse
  eller ett nytt dokument, och båda binder om beslutet till ny version. Ett fritextsvar vore en
  schemaändring.
- **200 % zoom och tangentbord:** inte nyfotograferat. Nästa-steg-länken testas med Enter i
  acceptanssviten, och nya kontroller har 44 px-mål och synlig fokus.
- **Merge, publicering och efterkontroll:** samordnas med releaseansvarig. Applikationen kräver
  ingen migration och kan publiceras via Lovable efter merge.

## 6. Produktbeslut som ändrats

Nästa steg länkade tidigare till meritens *rad* på översikten (”Visa meriten”), för att varje
merit skulle ha exakt en länk till meritsidan. Ägaren bad den 2026-10-13 om att nästa steg ska
vara ”direkt klickbart till rätt merit och åtgärd”. Det länkar nu till
`/passport/entry/claim/<id>#sp-entry-evidence` respektive `#sp-entry-verification`. Guarden och
dess negativa kontroller uttrycker den nya regeln lika strikt som den gamla: en enda sådan länk,
rätt sektion per steg, åtgärd och meritnamn i det tillgängliga namnet, och målen finns på
meritsidan.
