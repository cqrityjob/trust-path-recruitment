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
// 20261105090000_scp_participant_report_issuer_preview EARNS its place here:
// it is the read by which an owner or admin of the commissioning organisation
// sees the participant document before sharing an assessment result
// irreversibly, and E2 carries the code that calls it.
//
// It is pending because the repository's schema-first policy applies a
// migration BEFORE the code that depends on it. The name comes OFF this list
// -- rather than being left behind -- once the owner project has the migration
// and release-state.json records the production evidence.
const expectedPending: string[] = [
  "20261105090000_scp_participant_report_issuer_preview.sql",
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
];
const parked = [
  "20261022090000_scp_vaktare_v1_content_review.sql",
  "20261023090000_scp_vaktare_v1_self_report_quality.sql",
];

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
