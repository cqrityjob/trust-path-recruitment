Production metadata for `wrygicdfxwjnrugduxnt` confirms 146 public tables retain client TRUNCATE privileges, which bypass RLS. This change removes administrative table privileges from PUBLIC/anon/authenticated and postgres-owned future tables, including MAINTAIN on PostgreSQL 17. All SELECT/INSERT/UPDATE/DELETE grants, column grants and RLS policies remain intact.

The audit reviews all 45 unconditional client-read policies and preserves legitimate catalogue access. It records 573 policies, 349 public relations, 41 column ACLs and fingerprints of 510 definer functions; the production policies and executable function bodies match the isolated migration replay. No production user data was read or copied, and no production configuration was changed. Base `353f634` retains #301–303 and subsequent Lovable design work.

Validation: full 320-migration replay and database regression suite passed on PostgreSQL 17.11; the new nonempty 45-catalogue suite also passed PostgreSQL 16.14. Production ACL overlay reproduces pre-fix TRUNCATE as anon/authenticated, proves rejection after the migration, preserves all DML grants, and detects an intentionally reintroduced PUBLIC grant. Private-data and cross-organisation suites pass with the production ACL overlay. Real local PostgREST passed 209 HTTP assertions. Migration safety, SQL security, backend target, schema-first, duplicate checks and lint of new scripts pass.

Release remains blocked on owner approval. Lovable's ignored finding and failed scan details are inaccessible and remain explicitly unresolved; the known safe scoring-lineage definer view is not assumed to be the ignored finding. Confirm Data API exposed schemas and rerun metadata/advisors and Lovable scan before release. Leaked-password protection is disabled; the exact `password_hibp_enabled=true` payload is prepared, but the current Free organisation requires an approved Pro upgrade (from USD 25/month) and separate Auth verification. No merge, deployment, plan upgrade or production migration is authorized by this PR.

See `docs/security/2026-09-27/README.md`, the per-table review, captured metadata, test results and reproduction instructions.

Catalogue access requires a precise review: anon can read `graph_versions.created_by/notes` and `assessment_versions.notes/retired_reason`. All authenticated users can read bundle approver/publisher IDs, the AI-config updater ID and the other free notes listed in `catalogue-review.md`. The status-bearing catalogues do not enforce publication status on SELECT. Existing broad catalogue reads are preserved, but these identity/note/draft fields are NOT blanket false positives: their intended audience still needs an explicit content/access decision.

Separately open before release:

- **OPEN-API:** obtain the actual Data API exposed-schema list and audit any additional schemas. Empty `pgrst.db_schemas` metadata does not establish that list.
- **OPEN-IGNORED:** obtain the ignored Lovable finding's ID, text, affected objects and reason; investigate independently of the known lineage view.
- **OPEN-SCAN:** obtain the Lovable scan error/time and complete a new scan.

Pre-push integration review is in `integration-review.md`: the live Supabase production branch maps to `main`, Lovable's latest commit equals main, and PR workflows test isolated stacks. No integration or safeguard was changed. The migration is recorded **pending** in release-state.json; two existing pending content migrations remain untouched. No production apply is authorized.
