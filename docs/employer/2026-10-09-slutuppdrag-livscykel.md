# Slutuppdrag 2026-10-09 – livscykel, kravgranskning i ansökan, intervjuunderlag

Leveransnot för uppdraget *CQrityjob_Claude_Slutuppdrag_Livscykel_Kravgranskning_Intervju_2026-10-09*.
Startpunkt main `c2be0b39` (#463 och #465 mergade). Produktion `wrygicdfxwjnrugduxnt` har inte
skrivits till; ingen publicering, ingen AI, ingen gallring, inga riktiga kandidatutskick.

## Leveranser

| Del | Var | Exakt SHA | Status |
|---|---|---|---|
| App på befintligt schema (vyer, understeg, Fler filter, nästa steg, kravsammanfattning i sidhuvudet, Ej aktuell-flöde, C1–C6 en gång) | PR #466, gren `claude/amazing-clarke-ferjkh` | `9d6e9b2b` | byggd, pushad, CI pågår |
| Klient för v0.3 (komplettering som eget ärende, återöppning med orsak, intervjuupplägg), tolerant mot oinstallerat schema | PR #466 | `c98abc0e` | byggd, pushad, CI pågår |
| Schema: `20270311100000_recruitment_supplement_and_reopen.sql`, `20270312100000_interview_question_composition.sql`, rollbackar, SQL-svit (51 påståenden), release-state pending, db-test-registrering | lokal gren `claude/amazing-clarke-ferjkh-schema` (2 commits ovanpå main) | `e3c00c1c` | byggd och lokalt verifierad; **ej pushad** – kräver ägarens tillstånd att öppna en andra gren/PR |
| #464 (Astras schema v0.3) | PR #464 | `e2edfae1` | konfliktlösning för `INDEX.md` lämnad som kommentar; inte mergad (produktionsskrivningsförbud) |

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

1. **Pusha schemagrenen.** Sessionens regler tillåter inte push till annan gren än `claude/amazing-clarke-ferjkh` utan uttryckligt tillstånd. Schemat ligger därför lokalt (`e3c00c1c`). Med tillstånd öppnas en separat draft-PR som stackas efter #464.
2. **Merge-ordning.** #464 → schema-PR (111, 121) → verifiering av hosted ledger/ACL → registrering → #466 (eller #466 före schemat: klienten är tolerant och visar "inte installerad"-meningar tills slots finns).
3. **Innehåll.** Inledning/avslut-frågor och EN-versioner av kärnfrågor kräver mänskligt godkännande; inget sådant har skapats.
4. **120 kontroller.** Astras förberedda native-stage behöver köras på nya pinnar (app-SHA + schema-SHA) innan de får kallas PASS.

## Releasesteg (oförändrade)

Verifierat schema → kompatibel app-merge → Lovable-synk → ägarens Publish → `release-identity.json` matchar → inloggad kontroll i publicerad app.
