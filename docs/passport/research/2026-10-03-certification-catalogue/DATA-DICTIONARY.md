# Data dictionary — schema 1.0.0

SQLite entities: `issuers` -> `credentials`; `sources` -> `evidence` <- `credentials`. Credentials also carry a primary source reference for convenient flat export. JSON carries the same entities. CSV is the flat credential projection. SQLite booleans use 0/1; JSON uses false/true.

| Field | Meaning |
|---|---|
| credential_id | Research snapshot ID; preserve crosswalk when names change |
| issuer_id / issuer | Awarding organisation identity and display name |
| acronym | Issuer acronym when available; nullable, not unique |
| official_name | Programme/award title used by source; trademark typography may be simplified |
| research_area | physical, cyber, risk, insurance, resilience |
| domain | More specific subject label; research taxonomy, not a product permission |
| credential_kind | person_certification, professional_qualification, designation, assessed_certificate, course_certificate |
| research_scope | international, regional, national; provisional research context |
| jurisdiction_context | Raw research jurisdiction context; nullable, not a legal-recognition claim |
| recommended_priority | P1 initial shortlist; P2 breadth; P3 defer/recheck |
| source_id / source_url / source_title | Primary programme source; sources may support multiple records |
| evidence_level | official_page, issuer_badge_page, official_search_excerpt |
| evidence_note | What the source supports and relevant distinctions |
| renewal_note | Narrative only; unknown does not mean non-expiring |
| limitations | Caveats, version ambiguity, membership and territorial distinctions |
| research_status | catalogue_review_required or source_recheck_required |
| catalogue_decision | pending initially; later approved/excluded/needs_information after review |
| reviewer / reviewed_at / decision_note | Empty review decision provenance fields |
| publish_enabled | false throughout this research package |
| holder_verification_policy | separate_holder_evidence_required throughout |
| legal_recognition_status | not_assessed throughout |
| passport_scope_code | Null until mapped to the actual product model |
| existing_definition_id | Null until reconciled against production catalogue IDs |
| researched_at | Research snapshot date, 2026-10-03 |

Evidence rows list `supported_fields`: official_name, issuer and programme_existence. They do not certify a holder or establish equivalence with a national licence. Source `checked_at` is the research date, not the publisher's modification date.

The Excel decision cells are for human review. Editing them does not synchronise JSON/SQLite or publish anything. Reconcile decisions using credential_id in a subsequent explicit import, retaining reviewer/date/reason. Do not treat Excel approval alone as an instruction to activate production.
