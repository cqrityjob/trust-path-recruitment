# Nuläge och beroendekarta — Passport → sökbarhet → kontakt → ansökan

Mätt 2026-10-15 mot `main` @ `415cb7b` (senaste merge #471). Inga öppna PR:er i repot vid
start. Full migreringsreplay (394 filer) går rent på lokal PostgreSQL 16.

Äldre rapporter är kontrollerade mot koden; där de skiljer sig gäller koden (se §4).

## 1. Vad som finns och återanvänds

| Kedjans steg             | Befintlig arkitektur (källa)                                                                                                                                                                                                                                          | Status                                                                                         |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **Registrera**           | `sp_claims`, `sp_experience_periods`, katalogen `sp_credential_types` (154 internationella + 66 nationella definitioner), `InternationalCredentialForm` (3 steg), `sp_save_international_credential`                                                                  | Fungerar                                                                                       |
| **Styrk (underlag)**     | `sp_evidence` i privat bucket `passport-evidence`, `sp_begin/reconcile_evidence_upload`, HAYAT läser i webbläsaren (`docs/passport/hayat.md`)                                                                                                                         | Fungerar. Uppladdning höjer högst till `document_provided`                                     |
| **Styrk (granskning)**   | `sp_verification_requests` (pending → approved / rejected / clarification_requested / withdrawn), append-only `sp_verification_decisions`, `sp_verifier_decide_reviewed` binder beslutet till `submitted_at` (versionsskydd, `SP_REVIEW_STALE`), `sp_verifier_revoke` | Fungerar, med luckor i §2                                                                      |
| **Granskarroll**         | `sp_is_verifier` = `passport_verifier`-roll eller plattformsadmin; självgranskning nekas                                                                                                                                                                              | Fungerar                                                                                       |
| **Välj synlighet**       | Delning per länk (`sp_disclosures`, `selected_merits`) och ansökningsbunden delning (`sp_application_disclosure`) — se `application-disclosure-contract.md`                                                                                                           | Finns för delning. **Talangsökning finns inte**                                                |
| **Bli hittad**           | —                                                                                                                                                                                                                                                                     | **Saknas helt**                                                                                |
| **Kravprofil**           | `recruitment_requirements` (obligatoriskt/meriterande, fritext), `rec_requirement_profiles` (bekräftad, versionerad, oföränderlig) med källmodellen `acceptedSources ⊆ {application_answer, application_cv, interview_source, external_reference}`                    | Fungerar för ansökningar. **Ingen koppling till katalogen**                                    |
| **Rekryterarbehörighet** | Roller `owner/admin/member`. `rec_can_manage(job)` = owner/admin eller rekryteringsansvarig för jobbet. Ett vanligt medlemskap ger läsning, inte beslut                                                                                                               | Beslutad modell (`docs/release/2026-10-03-employer-report-access-design.md` §0: ingen ny roll) |
| **Kontakt**              | — (meddelanden är ansökningsbundna: `recruitment_messages`)                                                                                                                                                                                                           | **Saknas**                                                                                     |
| **Ansökan**              | `rec_submit_application(..., _include_passport, _answers)`, ansökningsbunden delning skapas bara av innehavaren                                                                                                                                                       | Fungerar                                                                                       |
| **Notiser/mejl**         | Ingen generell inkorg. Mönster: `recruitment_employer_notices` (outbox, claim/settle, lease, backoff) + edge-funktionen `transactional-email` (fast `KINDS`-lista, `Idempotency-Key`)                                                                                 | Passport-händelser mejlas **inte**                                                             |
| **Mätning**              | `cd_v31_funnel_events`, avstängd (`FUNNEL_MEASUREMENT_ENABLED=false`), bara karriär-/Indien-händelser                                                                                                                                                                 | Inga Passport-händelser                                                                        |
| **Workforce**            | `set_application_status(...,'hired')` skapar en `employees`-rad men ingen åtkomst                                                                                                                                                                                     | Talangdelning får inte bli stående åtkomst                                                     |

## 2. Luckor i Passport-flödet som rättas

| #   | Lucka (verifierad i kod/DB)                                                                                                              | Rättning                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | Komplettering kan bara besvaras genom att ändra meriten eller ladda upp nytt underlag (`sp_entry_review_on_holder_edit`). Inget textsvar | Ärendebundet textsvar `sp_verification_replies` via `sp_reply_to_clarification`, som flyttar `submitted_at` (samma versionsskydd). Granskaren läser svaret |
| L2  | Granskarens meddelande till kandidaten finns bara på förfrågans rad och skrivs över vid nästa beslut                                     | `holder_message` sparas per beslut i `sp_verification_decisions` → historik                                                                                |
| L3  | Efter återkallelse förblir meriten `lifecycle_state='revoked'` även efter nytt godkännande; ursprungsförfrågan står kvar som `approved`  | Godkännande av en återkallad merit återställer `active`; en entydig aktuell granskningsstatus härleds från senaste beslutet (`sp_entry_review_state`)      |
| L4  | Passport-händelser ger ingen återkoppling utanför sidan                                                                                  | Inkorg + mejl-outbox `user_notices` med behörighetskontroll och idempotens                                                                                 |
| L5  | Meritguiden saknar navigationsskydd                                                                                                      | Befintlig `useUnsavedChanges` kopplas in                                                                                                                   |
| L6  | Efter uppladdning rekommenderas ”Dela”                                                                                                   | Nästa steg erbjuder ”Begär granskning” när merittypen kan granskas                                                                                         |

## 3. Beroenden och PR-ordning (schema först)

```
PR 1  schema (endast migrationer, rollback, SQL-sviter, dokumentation)
      ├─ 20270316090000_sp_review_reply_history_and_notices
      ├─ 20270317090000_sp_talent_discovery
      └─ 20270318090000_rec_talent_search_and_contact
            │  merge → Supabase GitHub-integrationen applicerar → hostad verifiering
            ▼  → release-state.json `applied` med evidens
PR 2  applikation (server functions, UI, i18n, e2e, mejlmallar, edge-funktionens KINDS)
```

`schema-first-release:check` stoppar applikationskod som beror på en migration som inte är
applicerad. Därför kan PR 2 inte mergas före PR 1 är applicerad och verifierad.

## 4. Äldre rapporter kontrollerade

- `launch-completion/README.md` §5: ”Kandidatens fritextsvar på komplettering finns inte” — stämmer fortfarande; åtgärdas (L1).
- `application-disclosure-contract.md`: ”Applying is not consent” — stämmer. Talangsökningen ändrar inget i det kontraktet; den är ett eget samtycke.
- `employer-product-source-of-truth-v1.md` l.367: ”Nothing converts a candidate into an employee” — stämmer **inte** längre (`scp_employment_from_application`). Det påverkar inte talangsökningen: den skapar ingen bestående åtkomst.
- Lokal stack: Docker-registren svarar 429/”Data limit exceeded”, så `supabase start` kan inte köras. Repots egen stack (`scripts/local-stack/`) används: riktig PostgreSQL 16 och PostgREST 12.2.3 med riktig RLS. GoTrue och Storage är ersatta, se `scripts/local-stack/README.md`.
