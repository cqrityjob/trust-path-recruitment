# Slutuppdrag 2026-10-09 – livscykel, kravgranskning i ansökan, intervjuunderlag

Leveransnot för uppdraget *CQrityjob_Claude_Slutuppdrag_Livscykel_Kravgranskning_Intervju_2026-10-09*.
Startpunkt main `c2be0b39` (#463 och #465 mergade). Produktion `wrygicdfxwjnrugduxnt` har inte
skrivits till; ingen publicering, ingen AI, ingen gallring, inga riktiga kandidatutskick.

## Leveranser

Status 2026-10-09 efter ägarens beslut att låta Claude merga de tre PR:arna när de är rätt.

| Del | Var | Exakt SHA | Status |
|---|---|---|---|
| #464 (Astras schema v0.3: `20270310090000`, `20270310100000`) | PR #464 → `main` | merge-commit `dfe08858` (head `8de03944`, 20/20 jobb gröna) | **mergad och installerad**; registrerad som applied i `release-state.json` med read-only hosted-bevis (`docs/release/2026-10-09-lifecycle-v03-hosted-verification.json`). |
| Schema: `20270311100000_recruitment_supplement_and_reopen.sql`, `20270312100000_interview_question_composition.sql`, rollbackar, SQL-svit (51), db-test-registrering, ompinnat exakt schema-vittne (391 filer, `SCHEMA_SHA = 05520f29`) | PR #467 → `main` | merge-commit `44bc3f48` (head `4978f3d8`, 20/20 jobb gröna inkl. de tre ompinnade vittnena) | **mergad och installerad** 10:53Z; hosted ledger 391 rader, tidigare 389 oförändrade; tabeller RLS på och tomma, RPC:er endast `authenticated`; registrerad som applied med samma bevisfil. |
| App på befintligt schema (vyer, understeg, Fler filter, nästa steg, kravsammanfattning i sidhuvudet, Ej aktuell-flöde, C1–C6 en gång) + klient för v0.3 (komplettering som eget ärende, återöppning med orsak, intervjuupplägg), nu mot installerat schema | PR #466, gren `claude/amazing-clarke-ferjkh` | `9d6e9b2b` … `eb341427` (alla evidensjobb gröna), `main` med båda schemana inmergad, registreringscommit = den commit som bär denna not | CI på slutcommit avgör; mergas när grön |

## Matris per krav i uppdraget

| Krav | Byggt | Mergat | Installerat | Publicerat | Verifierat |
|---|---|---|---|---|---|
| 2. Ansökningar som arbetsyta (Aktiva/Avslutade/Arkiv/Alla, understeg som vyer, Ansvarig+Rekrytering, Fler filter, rader med nästa steg, statistik sekundärt) | ja (#466) | nej | n/a | nej | guards + bun-tester lokalt; stubbad evidens och real-stack i CI |
| 3. Kravgranskning i ansökan (N av M bekräftade av person, preliminärt underlag separat, underlag per status, grönt bara vid full bekräftelse, nästa åtgärder) | ja (#466) | nej | n/a | nej | flow-check 13, evidens-svit head-only, bun-tester |
| 4. Ej aktuell-livscykel (lämnar Aktiva+kö direkt, under Avslutade, omladdning/andra flik, besked-tillstånd, arkiv/återställ utan återöppning, inget raderas automatiskt) | ja (#466) | nej | n/a | nej | real-stack-test `recruitment-workspace.spec.ts` i CI; acceptans A–C delvis (C: CAS på server, UI-dubbelklick spärrad av dialogens busy) |
| 4. Återöppning som separat behörig åtgärd med orsak | schema (lokal gren) + klient (#466) | nej | **nej** | nej | SQL-svit R1–R13 lokalt (full uppspelning) |
| 4. Komplettering som eget ärende, "väntar på komplettering" som vy | schema (lokal gren) + klient (#466) | nej | **nej** | nej | SQL-svit S1–S16 lokalt |
| 5. C1–C6 en gång, korta rubriker + länk i sidopanelen | ja (#466) | nej | n/a | nej | flow-check 15, interview-ux-contract 666 OK |
| 6. Frågepaketsval: kärnfrågor alltid, godkända följdfrågor valbara, ordning/tid/täckning, sparat/återupptagbart, versionsbundet per rekrytering, ärenden behåller sin version, BESKT ej valbart | schema (lokal gren) + klient (#466) | nej | **nej** | nej | SQL-svit C1–C21 lokalt; bun-test av ren del; flow-check 16 |
| 6. Inledning / Kandidatens frågor och avslut med färdiga SV/EN-frågor | **nej** – inget styrt innehåll finns; visas som strukturella moment med förklaring | – | – | – | kräver mänskligt innehållsgodkännande |
| 7. BESKT/PEACE-gränser | bevarade (ingen ändring av metodtabeller, snapshots, lås) | – | – | – | befintliga sviter; C20/C21 |
| 8. Legacy `rec_ri_confirm_profile` | **ej avgränsad ännu** – föreslagen i #464-kommentar som ett tillägg efter #464 | – | – | – | – |
| 9. 120 förberedda kompletteringskontroller (NOT_RUN) | **ej körda** – kräver Astras native-stage på nya pinnar | – | – | – | NOT_RUN kvarstår, inte omdöpt |

## Verifierat lokalt (exakt)

- `bun test scripts/application-workflow.test.ts scripts/interview-composition.test.ts scripts/employer-portal-fixture.test.ts`: 35 pass.
- `employer-portal-flow:check` sektion 1–16 OK; `negative-controls:employer-portal-flow`: 14/14 upptäckta, trädet återställt.
- `interview-ux-contract:check` 666, `interview-recruiter-workflow:check` 1465, `employer-lifecycle:check` 184, `release-frontier:check`, `release-parity:check`, `schema-first-release:check` OK.
- Schema: full migrationshistorik uppspelad på PostgreSQL 16 (UTF-8/ICU) med de två nya filerna; `recruitment_lifecycle_v03_test.sql` 51/51; rollback vägrar vid data och tar ned tomt; `scp_interview_role_pack_test` 73/73 efter tillägget. Befintliga historiska sviter körs i sin stand-down-ordning av `db-test.sh` (PostgREST-steget kräver Docker och kunde inte köras lokalt).
- Kunde **inte** köras lokalt: `vite build`, Playwright (registret blockerat); `nullable-rpc-contract` 5.1/5.2 och `recruitment-workspace:check` faller lokalt redan på main av samma orsak. CI på exakt SHA avgör.

## Blockerare och beslut som är ägarens

1. ~~Pusha schemagrenen.~~ Tillstånd givet; #467 öppnad.
2. **Merge-ordning (beslutad, utförd t.o.m. registreringen):** #464 (klar) → #467 (klar) → read-only verifiering av hosted ledger/funktionskroppar/ACL (klar) → registrering i `release-state.json` (klar, i #466) → #466 mergas när dess CI är grön. `release-frontier`, `release-parity` och `schema-first-release` passerar lokalt med noll pending.
3. **Innehåll.** Inledning/avslut-frågor och EN-versioner av kärnfrågor kräver mänskligt godkännande; inget sådant har skapats.
4. **120 kontroller.** Astras förberedda native-stage körs i #467:s CI på de nya pinnarna (app `55db1e3b`, schema `05520f29`); NOT_RUN förblir NOT_RUN tills jobbet faktiskt passerat.
5. **CI-fynd rättade på vägen (#466):** kompletteringsknappen utan schema, sidledsskroll på avslutad ansökan (leveransbadge), beslutsåtgärder utan kravprofil, identisk sv/en-etikett, real-stack-specens veck- och dialogroller (`alertdialog`).

## Releasesteg (oförändrade)

Verifierat schema → kompatibel app-merge → Lovable-synk → ägarens Publish → `release-identity.json` matchar → inloggad kontroll i publicerad app.
