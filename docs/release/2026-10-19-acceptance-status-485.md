# Acceptansunderlag #485, läge 2026-10-19

Uppdaterar [#485](https://github.com/cqrityjob/trust-path-recruitment/issues/485)
(skrivet 2026-10-17). Varje punkt har en status:

- **Klart:** levererat och mergat till `main`.
- **Verifierat (CI):** kontrollerat i isolerade stackar i GitHub Actions.
- **Verifierat (produktion):** skrivskyddat lästa mot `wrygicdfxwjnrugduxnt`, eller
  hämtat från `www.cqrityjob.com`.
- **Återstår:** konkret vad som saknas och vem som kan ge det.

Underlaget innehåller inga adresser, lösenord eller länktoken.

## 1. Commits

| Del                                                                                       | Commit                                                    | Läge      |
| ----------------------------------------------------------------------------------------- | --------------------------------------------------------- | --------- |
| `main`, huvud                                                                             | `b8bd810e` (merge av #484, 2026-10-18 06:37Z)             | –         |
| [#483](https://github.com/cqrityjob/trust-path-recruitment/pull/483) P1-native-diagnostik | PR-huvud `5c99c729`, merge `609e8425` (2026-10-17 16:22Z) | **Klart** |
| [#484](https://github.com/cqrityjob/trust-path-recruitment/pull/484) dokumentnamn         | PR-huvud vid merge `f8787dd5`, merge `b8bd810e`           | **Klart** |

Det tidigare underlaget angav `575fe44e` som slutcommit för #484. Efter den
mergades `main` in i grenen (`f8787dd5`). `git diff f8787dd5 b8bd810e` är tom,
så `main` innehåller exakt det som testades.

## 2. CI på `main` (`b8bd810e`)

**Verifierat (CI):** alla push-körningar är gröna, 12 av 12 jobb:

| Arbetsflöde             | Körning     | Jobb     |
| ----------------------- | ----------- | -------- |
| CI                      | 39104727723 | 10 av 10 |
| Recruiter real Supabase | 39104727704 | 1 av 1   |
| P1 native               | 39104727705 | 1 av 1   |

Talent discovery real körs bara på PR. Den kördes grön på #484:s slutcommit
`f8787dd5` (körning 39101741467).

## 3. Publicerad version

**Verifierat (produktion), 2026-10-19 05:24Z:** `www.cqrityjob.com` serverar en
build som innehåller #484:

- CV-listans tillgång (`_authenticated.my-career.cv.index-*.js`) innehåller
  `data-cv-list-title` och `overflow-wrap:anywhere`.
- Granskarens vy (`_authenticated.passport-review-*.js`) innehåller
  `overflow-wrap:anywhere` och inte längre `break-all` på dokumentnamnet.

Exakt vilken commit Lovable publicerade går inte att läsa härifrån. Belägget är
innehållet i de publicerade tillgångarna, inte en commit-SHA.

Migrationsledgern är oförändrad: 401 rader, sist `20270322090000`.

## 4. Dokumentnamnens läsbarhet

| Yta                                                  | Ändrad i #484 | Webbläsartest sv/en, 375 och 1440 px                             |
| ---------------------------------------------------- | ------------- | ---------------------------------------------------------------- |
| Innehavarens lista över underlagsdokument (Passport) | ja            | **Verifierat (CI)**, `e2e/talent-discovery-local.spec.ts` test 1 |
| CV-rubrik och CV-lista                               | ja            | **Verifierat (CI)**, `e2e/cv-flow.spec.ts`                       |
| Granskarens lista                                    | ja            | inget eget test; ändringen finns i produktionsbygget (avsnitt 3) |
| Återställningsvyn och filvalet i meritformuläret     | ja            | inget eget test                                                  |
| Arbetsgivarens mottagarvy                            | –             | visar inga filnamn                                               |

Certifikatnumret i arbetsgivarvyn
(`src/components/security-passport/live/RecipientCredentialList.tsx:144`) har
fortfarande `break-all`. Det är en identifierare, inte ett dokumentnamn, och
lämnas som det är.

**Inte dokumentnamn:** meritens egen titel (`sp_claims.title`) kortas fortfarande
med ellips på några översiktsytor, till exempel `PassportOverview.tsx:274` och
`OverviewPassportContents.tsx:153`. Det är innehavarens egen text. Den ändras
inte utan att fyndet pekar dit.

**Återstår:** att bekräfta att #484 rättar samma yta som Astra såg. Det kräver
hennes skärmbild eller en beskrivning av sidan.

## 5. Missvisande svensk meritbenämning

**Ursprungsfyndet är inte återfunnet.** Sökt:

- i repot efter "Astra", "meritbenämning", "benämning", "missvisande" i `docs/`,
  `artifacts/`, `e2e/`, `roadmap.md` och `src/`;
- i git-loggen på alla grenar;
- i ärenden och PR:er.

Enda träffen är #482:s notering om att rapporten saknas.

Kontrollerat utan fynd att rätta:

- **Katalogen, produktion, svenska poster:** OV `Ordningsvaktsförordnande`,
  SV `Skyddsvaktsförordnande`, `SE_PERSONNEL_APPROVAL`
  `Personalgodkännande (bevakningsföretag)`, VU1/VU2 `Väktarutbildning 1/2`,
  OV_TRAINING, OV_REFRESHER, OV_TRANSPORT. Alla stämmer med vad meriten är. De
  internationella posterna bär sina engelska egennamn även på svenska. Det är
  avsiktligt, eftersom de är certifikatens namn.
- **Statusorden** i `src/lib/security-passport/i18n.ts`. `Godkänd` skiljdes från
  vad verifieringen stöder 2026-10-15. `Källbekräftad` och `Dokumenterad` är
  möjliga kandidater, men inget visar att det var dessa Astra syftade på.
- **Innehavarens egen titel** (`sp_claims.title`) visas oförändrad för
  arbetsgivaren. Den är användarskapad och ändras inte av en språkfix.

**Ingen rättning är gjord. Fyndet är inte löst.**

**Återstår:** Astras exakta svenska text och var den visades, i form av sida,
skärmbild eller ett citat med sidans adress.

## 6. Passport-flödet

| Moment                                                                    | CI                                                                                                                                                                                                                                | Produktion                                                           |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Valet är avmarkerat från början                                           | **Verifierat:** talent discovery test 8 och `not.toBeChecked`                                                                                                                                                                     | build innehåller avmarkerat läge (2026-10-17)                        |
| Förhandsvisningen skapar ingen delning                                    | **Verifierat:** oförändrat antal `sp_disclosures` i test 8; SQL PV2                                                                                                                                                               | 0 kvarlämnade förhandsrader (2026-10-17)                             |
| Förhandsvisningen visar samma tillåtna innehåll som arbetsgivaren får     | **Verifierat:** samma kort från databasen (PV1.3, NC2); meritens titel i test 8                                                                                                                                                   | **Återstår:** testkandidaten har ingen verifierad merit i produktion |
| Exakt en ansökan och en delning vid aktivt samtycke **trots dubbelklick** | **Läggs till i den här PR:en:** test 8 dubbelklickar nu på "Skicka ansökan" med Passport valt och kräver 1 `job_applications`, 1 bunden `sp_disclosures`, bekräftelsen och inget felmeddelande. Tidigare klickade testet en gång. | **Återstår:** T4                                                     |
| Utloggade och obehöriga nekas                                             | **Verifierat:** SQL PV3, PV5, AD1–AD6; talent test 12                                                                                                                                                                             | sessionsskydden finns i installerade funktionskroppar (2026-10-17)   |

Skydden mot dubbelinskick som testet nu prövar:

- knappen är spärrad medan inskicket pågår (`submitting`);
- försöket bär ett fast `applicationId`;
- de unika indexen `job_applications_active_unique_idx` och
  `sp_disclosures_one_live_per_application`.

## 7. Mejlprov

**Acceptans** betyder att leverantören har tagit emot mejlet. **Mottagning** är
bara det mottagaren själv bekräftar i inkorgen. Läst skrivskyddat 2026-10-19
05:22Z.

| Prov                         | Leverantörens acceptans                          | Mottagning                                                                                                                                                   | Läge                                                                                        |
| ---------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| T0, registrering             | **Verifierat (produktion)** 2026-10-17 15:09:29Z | **Återstår:** ägarens bekräftelse. Indirekt belägg finns: kontot bekräftades 2026-10-18 16:41:47Z och loggade in 16:46:10Z, alltså användes länken i mejlet. | genomfört                                                                                   |
| T4, ansökan och kvitto       | –                                                | –                                                                                                                                                            | **inte genomfört:** ingen annons skapad efter 2026-10-17; 0 ansökningar de senaste 3 dygnen |
| T5, rekryteringsmeddelande   | –                                                | –                                                                                                                                                            | **inte genomfört:** 0 `recruitment_messages` de senaste 3 dygnen                            |
| T6, notis till arbetsgivaren | –                                                | –                                                                                                                                                            | **inte genomfört:** 0 `recruitment_employer_notices` de senaste 3 dygnen                    |

T4–T6 kräver handlingar i produktion av ägaren, enligt avsnitt 4 i #485.
Ingenting har skickats eller skapats i produktion inom det här arbetet.

## 8. P1 native: rotorsak

- **Efter #483:** inga röda körningar. Körningarna 39049145291, 39101741430 och
  39104727705 är gröna. Det finns därför ingen `P1_NATIVE_FAIL`-rad att läsa.
- **De två tidigare felen:** körningarna 39007547852 och 39007026239 före #483
  har felkoden bara i artefakterna. Länken för att hämta dem går till
  `*.blob.core.windows.net`, som den här miljön inte når.
- **Rotorsaken är inte fastställd**, och ingen orsak har rättats.
- Gröna omkörningar och bättre loggning bevisar ingen orsak. De gör att nästa
  röda körning visar felkoden i den vanliga loggen.

**Återstår:** antingen att någon med åtkomst laddar ner artefakterna 12091113256
och 12092271685 och läser `P1_NATIVE_FAIL`-koden, eller nästa röda körning.

## 9. Utanför det här ärendet

Annonsredigering och förlängning är fortfarande en separat, accepterad
produktskuld. Inget har byggts för den.
