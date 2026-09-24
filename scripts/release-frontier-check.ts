import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "supabase/migrations");
const parkedDir = path.join(root, "supabase/archive/parked-migrations");
const state = JSON.parse(readFileSync(path.join(root, "supabase/release-state.json"), "utf8")) as {
  frontier: { file: string; hostedState: string; evidenceSource?: string }[];
};

// Empty is the steady state. A name here is a migration that is SUPPOSED to be
// waiting, and each one has to earn its place: leaving a name behind after it
// is applied hides a genuinely stuck migration behind an expectation, which is
// what this list exists to prevent.
//
// 20261102090000_cv_documents_controlled_writes and
// 20261103090000_cv_documents_lockdown are APPLIED. The owner project
// received both through the official Supabase GitHub integration after their
// reviewed PRs merged. release-state.json and hosted-ledger.json record the
// production evidence, so main correctly has no expected pending migration.
//
// 20261105090000_scp_participant_report_issuer_preview and
// 20261107090000_scp_iv_report_basis_integrity are APPLIED. Both reached the
// owner project through the official Supabase GitHub integration after #213
// merged to main as 9d36f6a6, are recorded in supabase_migrations under their
// canonical versions, and were verified read-only afterwards.
// release-state.json and hosted-ledger.json carry that production evidence,
// so this branch correctly expects no pending migration: the schema is ahead
// of the code, which is the order the schema-first policy exists to keep.
//
// Their names come OFF this list rather than being left behind, because a
// resolved name here hides the next genuinely stuck migration behind an
// expectation -- the failure this list exists to prevent.
//
// 20261108090000_beskt_governed_method_content,
// 20261109090000_sp_pilot_catalogue_visibility and
// 20261110090000_bcp_candidate_preparation are APPLIED. All three reached the
// owner project through the official Supabase GitHub integration after #221
// merged to main as 8ba7635c, and each is recorded in supabase_migrations under
// its canonical version and slug rather than a generated uuid. They were then
// verified read-only against production: the hosted function bodies are
// byte-identical to the merged migration sources, every declared column, index,
// trigger and constraint exists, the BCP tables carry ENABLE and FORCE RLS with
// no table write for any role, the two oracle helpers are executable by
// service_role only, and all nineteen new tables hold zero rows.
// release-state.json and hosted-ledger.json carry that production evidence.
//
// They came off this list in the same change that recorded the evidence, so the
// list is empty again except for what is genuinely still waiting. Note for
// anyone reading the versions: 20261110 rather than 20261109 for the
// candidate-preparation runtime is deliberate, because Supabase keys
// schema_migrations by the numeric prefix alone and the Passport correction
// already holds 20261109090000 -- two files sharing one version means the
// second is silently treated as already applied.
//
// 20261111090000_sp_global_professional_certifications is APPLIED. It reached
// the owner project through the official Supabase GitHub integration after #224
// merged to main as 218c3c436be70f4c32d49e9d7e2bf12b5f090b5e, and is recorded in
// supabase_migrations under its canonical version and slug rather than a
// generated uuid, directly above 20261110090000. It was then verified read-only
// against production: all five function bodies are byte-identical to the merged
// source by md5(prosrc), the fourteen reviewed definitions and five issuers are
// seeded exactly, Sweden is still the only active market pack, no INTL_ holder
// claim and no lifecycle row exists, and the lifecycle trust boundary holds --
// authenticated has SELECT and no INSERT, UPDATE or DELETE, anon and PUBLIC have
// nothing, the single policy is SELECT-only, and only authenticated may execute
// sp_certification_lifecycle_declare, which is SECURITY DEFINER with a pinned
// search_path. release-state.json and hosted-ledger.json carry that evidence.
//
// It took 20261111 rather than 20261110 because bcp_candidate_preparation
// reached main first and holds that version -- the same one-version-one-file
// rule the paragraph above is about, met as a real collision rather than a
// hypothetical.
//
// Its name comes OFF this list in the same change that records the evidence, for
// the reason stated above: a resolved name here hides the next genuinely stuck
// migration behind an expectation. The list was empty again.
//
// Empty again after BESKT PR 4 and again after PR 5A: the interview-case
// bridge and the interview conduct layer were both applied to production by
// the Supabase GitHub integration when #229 and #233 merged, and
// release-state.json records each with evidence. A name left here after its
// migration is applied would hide the next genuinely stuck migration behind an
// expectation.
//
// 20261114090000_sp_global_certification_governed_issuer was applied by the
// official integration after #230 merged and now has hosted evidence in
// release-state.json. No active migration remains pending.
//
// Pilot blocker 2: the interview-method library employer read boundary
// (20261115090000) was applied to production by the official integration when
// #241 merged, and release-state.json now records it as applied with read-only
// evidence. Its name comes off this list in that same change, as planned, so
// an applied migration cannot sit here masking the next genuinely stuck one.
// 20261116090000_cd_outstanding_reviews_operator_only was applied by the
// official integration when PR #252 merged, and PR #253 recorded its hosted
// evidence.
//
// BESKT PR 6 (20261117090000, merged as #254) and BESKT PR 7 (20261118090000,
// merged as #255) were applied by that same integration on merge, and this
// change records their hosted evidence in release-state.json and
// hosted-ledger.json -- so both come off this list HERE, in the same change
// that records it, exactly as planned. A merge alone would never have been
// enough, and an applied migration left on this list would mask the next
// genuinely stuck one.
//
// PR #258 applied and verified through the connector; canonical history alias verified.
//
// PR #264 (Security Passport pilot finish) carries two EXPAND migrations that
// are pending BY DESIGN until it merges and the official Supabase GitHub
// integration applies them: 20261124090000_sp_pilot_member_catalogue (the
// approved catalogue's market clause honours an internal-pilot entitlement;
// the definition clause is unchanged) and
// 20261125090000_sp_disclosure_definition_scope (sp_credential_payload_v2
// emits the governed definition's scope_code). Both replace a body and
// introduce no object; release-state.json records each as pending with its
// verify SQL and rollback. Both names come OFF this list in the change that
// records their hosted evidence, for the reason stated throughout: a resolved
// name left here hides the next genuinely stuck migration.
//
// 20261126090000_sp_catalogue_scope_and_document_issuer rides the same PR and
// is pending for the same reason: it replaces the catalogue view, the governed
// save RPC, the table guard and the payload body, and seeds the Dubai
// organisation roles. It introduces no object and approves no definition.
//
// 20261124090000 and 20261125090000 were applied by the official integration when
// #264 merged as 2a76c81, verified read-only in the hosted ledger on 2026-09-18
// and recorded with that evidence in release-state.json and hosted-ledger.json.
// Both names come OFF this list here, in the same change, as planned. One name
// remains, pending by design until PR #265 merges.
//
// 2026-09-18, after PR #266 merged as 50bf5de: 20261126090000 (applied when
// #265 merged), 20261127090000 and 20261128090000 were verified read-only in
// the hosted ledger -- the two security fixes by their function bodies as well
// -- and recorded with that evidence in release-state.json and
// hosted-ledger.json. All three come OFF this list here. Nothing is pending.
//
// 20261127090000_bcp_conduct_report_independence_boundary WAS GENUINELY PENDING,
// and this is the list saying so out loud rather than a migration quietly
// waiting. It is a security fix to two functions 20261117090000 already put
// live: bcp_conduct_preview_report never applied the independence rule, and
// bcp_conduct_report_blockers applied no authorisation at all.
//
// Its name comes OFF this list in the same change that records its hosted
// evidence in release-state.json and hosted-ledger.json -- never before, and
// never in the pull request that merely merges it. An applied migration left
// here would mask the next genuinely stuck one, and a pending migration
// missing from here is exactly the silence this check exists to break.
//
// 20261128090000_scp_iv_case_candidate_binding rides the same security PR
// (#266) and is pending for the same reason: scp_iv_create_case never checked
// the candidate account it was given. Its name comes OFF this list in the
// change that records its hosted evidence, never before.
//
// 20261129090000_bcp_internal_test_activation (the owner's internal test
// activation for BESKT, PR #268) was applied by the integration and its hosted
// evidence recorded on 2026-09-19, so it is off this list.
// 20261130090000_bcp_beskt_complete is GENUINELY PENDING: BESKT as a complete
// product (owner decision of 2026-09-19). Its name comes OFF this list in the
// change that records its hosted evidence, never before.
// 20261130090000_bcp_beskt_complete (BESKT as a complete product, PR #270) was
// applied by the integration and its hosted evidence recorded on 2026-09-19, so
// it is off this list.
// 20261201090000_scp_library_direct_access (the library's direct access and
// recruitment setup, PR #272) was applied by the integration and its hosted
// evidence recorded on 2026-09-19, so it is off this list.
// PR #274 merged as 1631d5d3; both 20261202090000 and 20261203090000
// were verified read-only in owner production on 2026-09-19. Function bodies,
// RLS, policy, grants, content link and unique index match the merged source.
// release-state.json and hosted-ledger.json record the evidence and limits.
// 20261204090000 (HAYAT assessments) is a schema-only release: pending until the
// integration applies it on merge and its hosted evidence is recorded, at which
// point it comes off this list in the same change that marks it applied.
// It was applied and recorded on 2026-09-21, so it is off this list.
// 20261205090000 (workforce records require an approved organisation) and
// 20261206090000 (a development assignment carries the employment record) are
// the schema half of the employer lifecycle phases 1-3. PR #280 merged as
// 1c987a3 and the integration applied both; each was verified read-only on
// 2026-09-23 -- the hosted ledger carries the canonical version and slug, both
// function bodies are byte-identical to the merged source by md5, and neither
// apply changed a row. They come off this list in the same change that marks
// them applied, which is this one.
// 20261207090000 (the recruitment workspace, EXPAND) merged alone as PR #282
// (c96acf2) and the integration applied it; verified read-only on 2026-09-23
// -- canonical version and slug in the hosted ledger, all 21 rec_* function
// bodies byte-identical to the merged source by md5, the two CONTRACT
// triggers absent as intended, and no row changed. It came off this list in
// the change that marked it applied.
// 20261208090000 (its CONTRACT half, the job_applications backstops) merged as
// PR #284 (20f49eb) after the application was published; the integration
// applied it and it was verified read-only on 2026-09-23 -- canonical version
// and slug, both trigger bodies byte-identical by md5, no row changed. It
// comes off this list in the same change that marks it applied.
// PR #286 (20261209090000) was verified applied read-only after merge;
// docs/security-intelligence/hosted-baseline.md records ledger and body digests.
// PR #287 (20261210090000) merged as 14e2567. Read-only verification on
// 2026-09-24 matched all 16 tables and 11 functions, their grants, policies,
// constraints and triggers to isolated replay. Data API rejects sw_private.
// Evidence: docs/security-intelligence/hosted-application.md.
// PR #289 is the schema-only Security Work analysis contract. Its migration
// is pending by design; dependent application code remains blocked until
// hosted application is verified. Remove this name in the same change that
// records that evidence in release-state.json, never on merge alone.
const expectedPending: string[] = [
  "20261211090000_security_work_analysis_contract.sql",
];
const hostedIdentities = [
  "20260904134520_scp_trust_evidence_report_r2a_audience_reads.sql",
  "20260904171840_scp_trust_evidence_report_r2a_report_version_continuity.sql",
  "20260904174903_scp_trust_evidence_report_r2a_contract.sql",
  "20260905053344_scp_option_order_per_attempt.sql",
  "20260905053809_scp_release_facet_resolution.sql",
  "20260905054603_scp_trust_evidence_report_r1_provenance.sql",
  "20260906125945_scp_trust_evidence_report_r3a_contract.sql",
  "20260907071826_6c070461-aa51-4d78-8ed0-a82294f12489.sql",
  "20261028090000_admin_cancel_assignment_error_contract.sql",
  "20261030090000_sp_trust_source_containment.sql",
  "20261031090000_sp_passport_first_merit.sql",
  // Applied 2026-09-08 as hosted 20260908043205 / b315714c-…; the canonical
  // file stays in the active path because it is the reviewed record of what
  // production ran.
  "20261101090000_sp_selected_merit_sharing.sql",
];
const retiredCanonicalIdentities = [
  "20261021090000_scp_option_order_per_attempt.sql",
  "20261024090000_scp_trust_evidence_report_r2a_audience_reads.sql",
  "20261025090000_scp_trust_evidence_report_r2a_report_version_continuity.sql",
  "20261026090000_scp_trust_evidence_report_r2a_contract.sql",
  "20261026093000_scp_release_facet_resolution.sql",
  "20261027090000_scp_trust_evidence_report_r1_provenance.sql",
  "20261029090000_scp_trust_evidence_report_r3a_contract.sql",
];
const hostedLedgerMarkers = [
  "20260904190901_scp_trust_evidence_report_r1_provenance.sql",
  "20260907064303_f8efc1c3-def4-4147-9db1-45a68b1f6a69.sql",
  "20260907064513_19c76abb-f1fd-40e5-aa50-b008b7de38bf.sql",
  "20260907064849_0bb96516-c1eb-4178-8e9e-60bde13071dd.sql",
  "20260908043205_b315714c-89df-4610-9dd0-7b55207229a7.sql",
  "20260916155430_sp_international_passport_foundation.sql",
  "20260916155456_sp_international_credential_wallet.sql",
  "20260916155521_sp_credential_selective_sharing_v2.sql",
  "20260916155551_sp_closed_credential_catalogue.sql",
  "20260916155620_cv_owned_application_snapshot.sql",
  "20260916190510_sp_credential_organisation_roles.sql",
];
const parked = [
  "20261022090000_scp_vaktare_v1_content_review.sql",
  "20261023090000_scp_vaktare_v1_self_report_quality.sql",
];

// PR #257: all five Passport/CV migrations have verified hosted application.
// Their generated identities are pinned above as non-executable markers.
// Numeric history parity remains enforced independently by deploy-plan:check.

const active = new Set(readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")));
const pending = state.frontier
  .filter((entry) => entry.hostedState === "pending")
  .map((entry) => entry.file)
  .sort();

const failures: string[] = [];
if (JSON.stringify(pending) !== JSON.stringify([...expectedPending].sort())) {
  failures.push(`pending set is ${pending.join(", ") || "empty"}`);
}
for (const file of hostedIdentities) {
  if (!active.has(file)) failures.push(`hosted identity missing from active path: ${file}`);
}
for (const file of retiredCanonicalIdentities) {
  if (active.has(file)) failures.push(`already-applied canonical identity is active: ${file}`);
}
for (const file of hostedLedgerMarkers) {
  const markerPath = path.join(migrationsDir, file);
  if (!active.has(file)) {
    failures.push(`hosted ledger marker missing from active path: ${file}`);
    continue;
  }
  const executableBody = readFileSync(markerPath, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, "");
  if (executableBody.length > 0) {
    failures.push(`hosted ledger marker contains executable SQL: ${file}`);
  }
}
for (const file of parked) {
  if (active.has(file) && !hostedLedgerMarkers.includes(file)) {
    failures.push(`unsafe migration is active: ${file}`);
  }
  if (!existsSync(path.join(parkedDir, file))) failures.push(`parked history missing: ${file}`);
}
for (const entry of state.frontier.filter((item) => item.hostedState === "applied")) {
  if (!entry.evidenceSource?.trim()) failures.push(`applied entry lacks evidence: ${entry.file}`);
}

if (failures.length) {
  console.error(`release-frontier-check FAILED (${failures.length})`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log(
  expectedPending.length === 0
    ? "release-frontier-check: production frontier reconciled; no active migration is pending"
    : `release-frontier-check: production frontier reconciled; ${expectedPending.length} migration(s) pending by design:`,
);
for (const file of expectedPending) console.log(`  - ${file}`);
