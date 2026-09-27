# Tabellvis granskning av 45 ovillkorliga läspolicyer

Metadata från rätt produktionsprojekt, 2026-09-27. Samtliga har RLS.
Varje tabell har minst en syntetisk rad i SQL-testet, som kontrollerar läsning och
INSERT/UPDATE/DELETE för utloggad, kandidat och två organisationsägare. Behörighets-
kontrollen omfattar även alla övriga public-relationer. Administrativa grants
är en separat styrkt brist och åtgärdas oavsett tabellens avsedda läsning.

Policy/kolumner/grants finns i [snapshoten](production-metadata.json), och
[testet](../../../supabase/tests/client_table_privilege_hardening_test.sql)
är den exekverbara läs-/skrivmatrisen. Tabellen nedan anger varför bred läsning
är avsedd enligt schemat. Den påstår inte att produktionsradernas fria textfält
har inspekterats eller att katalogutkast är hemliga.

| Tabell                              | Avsedd läsare                        | Innehåll och gräns                                                                                                 |
| ----------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `assessment_versions`               | Alla, även utloggade                 | Versions- och disclaimerregister; notes/retired_reason är versionsnoteringar, inte användarsvar.                   |
| `assessments`                       | Alla, även utloggade                 | Bedömningsnamn, typ och rollkategori; inga försök eller svar.                                                      |
| `cd_professions`                    | Inloggade, över organisationsgränser | Yrkesdefinitioner och granskningsstatus; inga kandidatrankningar.                                                  |
| `graph_versions`                    | Alla, även utloggade                 | Grafversionsregister; inkluderar governance-notes och skapande aktörs UUID (created_by).                           |
| `scp_assessment_families`           | Inloggade, över organisationsgränser | Produkt-/bedömningsfamiljer.                                                                                       |
| `scp_behaviour_competency_map`      | Inloggade, över organisationsgränser | Metodrelation mellan beteende och kompetens; weight är katalogkoppling, inte personresultat eller svarsfacit.      |
| `scp_behaviour_versions`            | Inloggade, över organisationsgränser | Beteendetexter och generella indikatorer.                                                                          |
| `scp_bundle_versions`               | Inloggade, över organisationsgränser | Versionslås och governance; approved_by/published_by är aktörs-UUID:n, inga försök eller svar.                     |
| `scp_bundles`                       | Inloggade, över organisationsgränser | Namngivna bedömningspaket per yrke.                                                                                |
| `scp_competencies`                  | Inloggade, över organisationsgränser | Kompetenskoder och visningsordning.                                                                                |
| `scp_competency_facets`             | Inloggade, över organisationsgränser | Kompetensdefinitioner och fasetter.                                                                                |
| `scp_competency_versions`           | Inloggade, över organisationsgränser | Definitioner och generella tolknings-/utvecklingsindikatorer.                                                      |
| `scp_contract_versions`             | Inloggade, över organisationsgränser | Read-model/API-kontraktsversioner.                                                                                 |
| `scp_evidence_source_types`         | Inloggade, över organisationsgränser | Tillåtna evidenskälltyper, inte evidensrader.                                                                      |
| `scp_followup_prompts`              | Inloggade, över organisationsgränser | Generella uppföljningsfrågor, inte intervjunoteringar.                                                             |
| `scp_form_blocks`                   | Inloggade, över organisationsgränser | Formulärblock och instruktioner, inte items/svar.                                                                  |
| `scp_forms`                         | Inloggade, över organisationsgränser | Formulärnamn/versioner/tidsramar; inga svar eller svarsnycklar.                                                    |
| `scp_interview_ai_config`           | Inloggade, över organisationsgränser | Plattformens två feature flags; updated_by är governance-UUID. Inga API-nycklar eller transkript.                  |
| `scp_interview_guide_prompts`       | Inloggade, över organisationsgränser | Generiska frågor/följdfrågor; listen_for är uttryckligen vägledning, inte facit eller poäng enligt 20260830093000. |
| `scp_jurisdictions`                 | Inloggade, över organisationsgränser | Jurisdiktionsnamn/koder.                                                                                           |
| `scp_maturity_thresholds`           | Inloggade, över organisationsgränser | Generella mognadströsklar; inga personvärden eller bedömningssvar.                                                 |
| `scp_observable_behaviours`         | Inloggade, över organisationsgränser | Beteendekatalogens identiteter.                                                                                    |
| `scp_processing_purposes`           | Inloggade, över organisationsgränser | Behandlingsändamålens namn/koder, inte samtycken.                                                                  |
| `scp_professions`                   | Inloggade, över organisationsgränser | Yrkes- och marknadsdefinitioner.                                                                                   |
| `scp_purpose_versions`              | Inloggade, över organisationsgränser | Integritetsmeddelande-/ändamålsversioner, inte individuella samtycken.                                             |
| `scp_recruitment_content_links`     | Inloggade, över organisationsgränser | Kopplingar från roll/miljö till metoddefinitioner, inte anställningsärenden.                                       |
| `scp_recruitment_role_profiles`     | Inloggade, över organisationsgränser | Yrkesrollernas katalogkopplingar.                                                                                  |
| `scp_report_versions`               | Inloggade, över organisationsgränser | Rapportmallar, målgrupp och begränsningstexter; inga rapportsnapshots.                                             |
| `scp_role_competency_map`           | Inloggade, över organisationsgränser | Generella rollkrav, inte personprofiler.                                                                           |
| `scp_role_versions`                 | Inloggade, över organisationsgränser | Rollbeskrivningar och versioner.                                                                                   |
| `scp_role_weight_profiles`          | Inloggade, över organisationsgränser | Profilmetadata/notes/hash; faktiska bedömningsvikter ligger i separat begränsad tabell.                            |
| `scp_roles`                         | Inloggade, över organisationsgränser | Rollidentiteter och yrkesrelation.                                                                                 |
| `scp_scenario_versions`             | Inloggade, över organisationsgränser | Generiska situationsbeskrivningar för metodinnehåll; inga participantsvar eller svarsnycklar.                      |
| `scp_scenarios`                     | Inloggade, över organisationsgränser | Scenarioidentiteter.                                                                                               |
| `sp_certification_definitions`      | Inloggade, över organisationsgränser | Certifieringsprogram och underhållspolicy; inga innehavares meriter.                                               |
| `sp_certification_issuer_aliases`   | Inloggade, över organisationsgränser | Publika utfärdaralias.                                                                                             |
| `sp_certification_issuers`          | Inloggade, över organisationsgränser | Utfärdarregister och offentliga verifieringslänkar.                                                                |
| `sp_credential_classes`             | Inloggade, över organisationsgränser | Meritklassernas namn/koder.                                                                                        |
| `sp_credential_definition_reviews`  | Inloggade, över organisationsgränser | Källgranskning av meritdefinitioner; inga personverifieringar eller granskaruppgifter.                             |
| `sp_credential_definition_versions` | Inloggade, över organisationsgränser | Kvalifikations-/registerversioner och offentliga källor.                                                           |
| `sp_credential_organisation_roles`  | Inloggade, över organisationsgränser | Myndigheters/utfärdares roller för meritdefinitioner, inte arbetsgivarorganisationers medlemskap.                  |
| `sp_credential_scopes`              | Inloggade, över organisationsgränser | Generella territoriella räckvidder.                                                                                |
| `sp_recognition_policies`           | Inloggade, över organisationsgränser | Erfarenhetsreglernas definition/version, inte individens erfarenhet.                                               |
| `sp_skill_types`                    | Inloggade, över organisationsgränser | Färdighetstyper och tillåtna nivåskalor, inte individuella claims.                                                 |
| `sp_sub_jurisdictions`              | Inloggade, över organisationsgränser | Deljurisdiktioners namn/koder.                                                                                     |

## Aktörs-ID, fria noteringar och opublicerat innehåll

Följande är verifierad **åtkomst till kolumner och alla tillåtna rader**, inte
bevis för att produktionskolumnerna innehåller en viss persons uppgifter.
Produktionsrader lästes inte. Ingen kolumnmaskering eller publiceringskontroll
läggs till av denna behörighetsmigration.

| Tabell                              | Synliga fält                                         | Läsare och bedömning                                                                                                                                                                  |
| ----------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `graph_versions`                    | `created_by`, `notes`                                | Även utloggade. Skaparens UUID kan vara en personidentifierare; notes är fri governance-text. Att fälten hör till en katalog gör dem inte automatiskt lämpliga för offentlig åtkomst. |
| `scp_bundle_versions`               | `approved_by`, `published_by`, `retired_reason`      | Alla inloggade över organisationsgränser. Aktörs-ID och fri avvecklingsmotivering.                                                                                                    |
| `scp_interview_ai_config`           | `updated_by`                                         | Alla inloggade över organisationsgränser. Ändrarens UUID jämte plattformsflaggor.                                                                                                     |
| `assessment_versions`               | `notes`, `retired_reason`                            | Även utloggade. Fria versionsnoteringar och avvecklingsmotivering.                                                                                                                    |
| `scp_role_weight_profiles`          | `notes`                                              | Alla inloggade. Fria metodnoteringar.                                                                                                                                                 |
| `scp_contract_versions`             | `scope_note`                                         | Alla inloggade. Fri kontraktsbeskrivning.                                                                                                                                             |
| `cd_professions`                    | `limitation_note_sv/en`, `inclusion_rationale_sv/en` | Alla inloggade. Redaktionella begränsningar och urvalsmotiveringar.                                                                                                                   |
| `scp_professions`                   | `regulator_note_sv`                                  | Alla inloggade. Redaktionell regulatornotering.                                                                                                                                       |
| `sp_credential_definition_versions` | `note_en`                                            | Alla inloggade. Redaktionell certifieringsnotering.                                                                                                                                   |

Detta är samtliga aktörs-ID-fält med suffix `_by` och noterings-/motiveringsfält
i snapshotens 45 kataloger. Även övriga beskrivningar, instruktioner, indikatorer
och frågetexter är redaktionell fritext och måste hållas fria från privata uppgifter.

**Publiceringsstatus filtrerar inte SELECT** i följande kataloger:

- Även utloggade: `assessment_versions` (`published_at`, `retired_at`) och
  `graph_versions` (`published_at`, `is_active`).
- Alla inloggade: `scp_behaviour_versions`, `scp_bundle_versions`,
  `scp_competency_versions`, `scp_followup_prompts`, `scp_interview_guide_prompts`,
  `scp_report_versions`, `scp_role_versions`, `scp_role_weight_profiles`,
  `scp_scenario_versions` (samtliga `content_status`).
- Alla inloggade: `scp_purpose_versions` (`published_at`, `retired_at`),
  `scp_contract_versions` (`status`), `sp_credential_definition_versions`
  (`catalogue_status`) och `cd_professions` (`review_state`, `approved_for_ranking`).

RLS tillåter alltså läsning av utkast/retirerade/ogranskade rader om sådana finns
eller senare skapas. Även `assessments.employer_visible` och `is_active` på
`scp_jurisdictions`, `scp_maturity_thresholds`, `scp_processing_purposes`,
`sp_certification_issuers`, `sp_credential_scopes`, `sp_recognition_policies`,
`sp_skill_types`, `sp_sub_jurisdictions` är UI-/domänflaggor, inte sekretessfilter.
Barnkataloger som `scp_forms` och `scp_form_blocks` har också ovillkorlig läsning;
en frontendfiltrering av förälderns status ger inget databasskydd.

**Förhållande till avsedd åtkomst:** befintliga migrationer ger uttryckligen bred
katalogläsning och produkten använder även slutna tester/pilotversioner. Detta
styrker att bred SELECT inte i sig betyder fri tillgång till kandidatärenden eller
fri skrivning. Det bevisar däremot inte ett godkänt publiceringsbeslut för varje
aktörs-ID, notering eller utkast. Dessa fält klassas därför som **kvarstående
innehålls-/åtkomstbeslut**, inte som ovillkorligt styrkta falsklarm. Granskaren
behöver bekräfta att de får läsas av ovanstående grupper. Om avsikten är sekretess
krävs en separat, fältspecifik projektion/behörighetsändring med flödestester;
att bara filtrera på status i klienten räcker inte.
