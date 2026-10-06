// Security Passport — the catalogue coverage matrix, GENERATED from a database.
//
//   bun run scripts/passport-catalogue-coverage-matrix.ts            # writes the doc
//   PASSPORT_MATRIX_DB_URL=postgresql://… bun run scripts/…          # another local DB
//
// Reads every row of sp_credential_types with the attributes the approved
// catalogue's predicate reads, runs the SAME diagnosis the administration page
// runs (src/lib/security-passport/catalogue-diagnostics.ts), and writes
// docs/passport/catalogue-coverage-matrix.md. It is a report, never a gate: it
// needs a migrated local database, which CI's guard job does not have. The
// gate is supabase/tests/security_passport_catalogue_completeness_test.sql,
// which pins the same 70 codes and PROVES each one saves and reads back.
//
// It refuses any host that is not local: this script has no business reading
// a hosted catalogue.

import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { diagnoseDefinition } from "../src/lib/security-passport/catalogue-diagnostics";
import { loadCatalogueDefinitions, localCatalogueDatabaseUrl } from "./passport-catalogue-rows";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DB_URL = localCatalogueDatabaseUrl();

const rows = loadCatalogueDefinitions(DB_URL).map((d) => ({ ...d, ...diagnoseDefinition(d) }));

const territory = (r: (typeof rows)[number]) =>
  r.scopeCode === "global_professional"
    ? "International"
    : [r.jurisdictionCode, r.subJurisdictionCode].filter(Boolean).join(" / ");
const awarding = (r: (typeof rows)[number]) =>
  r.governedCertificationIssuer ??
  r.governedAuthority ??
  (r.issuerStatedOnDocument ? "stated on the certificate" : "—");
const STATE: Record<string, string> = {
  selectable: "approved · open to all",
  selectable_pilot_members: "pilot-authorised (not public) · valid members of this market",
  selectable_public_pilot: "public pilot (not approved) · every signed-in holder, no grant",
  awaiting_definition_approval: "NOT approved yet · awaiting approval or publication",
  market_closed: "market CLOSED",
  retired: "RETIRED · cannot be registered again",
  blocked: "BLOCKED",
};
// The legal review, beside availability and never inside it: a public pilot
// opens a market whose review is still pending.
const legalReview = (r: (typeof rows)[number]) =>
  r.marketPackCode
    ? `definition ${r.legalReviewState ?? "—"} · pack ${r.packLegalReviewState ?? "—"}`
    : `definition ${r.legalReviewState ?? "—"} · no pack`;
const selectableNow = (r: (typeof rows)[number]) =>
  r.availability === "selectable"
    ? "yes"
    : r.availability === "selectable_pilot_members"
      ? "pilot members"
      : r.availability === "selectable_public_pilot"
        ? "every signed-in holder"
        : "no";
// Abu Dhabi is a public pilot since 20270220090000: in scope like the UK and Dubai.
const inScope = (_r: (typeof rows)[number]) => true;
// Only a definition somebody can select today saves and reads back. An awaiting
// one is refused, and the matrix says so instead of calling it proven.
const isOffered = (r: (typeof rows)[number]) =>
  r.availability === "selectable" ||
  r.availability === "selectable_pilot_members" ||
  r.availability === "selectable_public_pilot";
const display = (r: (typeof rows)[number]) =>
  r.scopeCode === "global_professional"
    ? "globe · no country"
    : `flag ${r.subJurisdictionCode ?? r.jurisdictionCode}${r.scopeCode === "national_qualification" ? " · national qualification, not a licence" : ""}${r.requiresScope ? " · scope-limited mark, scope text withheld from an anonymous share" : ""}`;

const line = (r: (typeof rows)[number]) =>
  `| \`${r.code}\` | ${r.nameEn} | ${territory(r)} | ${r.claimType} / ${r.category} | ${r.regulator ?? "—"} | ${awarding(r)}${r.trainingProviderStatedOnDocument ? "; training provider stated on the certificate" : ""} | ${STATE[r.availability]} | ${legalReview(r)} | ${selectableNow(r)} | ${!inScope(r) ? "refused (closed market)" : !isOffered(r) ? "not selectable yet — refused (SP_APPROVED_DEFINITION_REQUIRED) until approved" : `proven${r.holderMustState.length ? ` (holder states ${r.holderMustState.join(" + ").replaceAll("_", " ")})` : ""}${r.availability === "selectable_pilot_members" ? " — as a valid pilot member" : ""}${r.availability === "selectable_public_pilot" ? " — as an ordinary holder with no grant" : ""}`} | ${isOffered(r) ? "review request + evidence reach the reviewer; definition, issuer as stated, territory and scope shown" : "n/a"} | ${isOffered(r) ? display(r) : "n/a"} |`;

const count = (a: string) => rows.filter((r) => r.availability === a).length;
const pending = rows.filter((r) => r.availability === "selectable_pilot_members");
const groups: [string, (r: (typeof rows)[number]) => boolean][] = [
  ["International certifications", (r) => r.scopeCode === "global_professional"],
  ["Sweden", (r) => r.marketPackCode === "SE"],
  [
    "India — national qualifications (no market pack; approved for every holder, 20261214090000)",
    (r) => r.scopeCode === "national_qualification" && r.jurisdictionCode === "IN",
  ],
  ["Great Britain", (r) => r.marketPackCode === "GB"],
  ["Northern Ireland", (r) => r.marketPackCode === "GB-NI"],
  ["Dubai", (r) => r.marketPackCode === "AE-DU"],
  ["Abu Dhabi (public pilot since 20270220090000; no definition review yet)", (r) => r.marketPackCode === "AE-AZ"],
];
const HEAD =
  "| code | name | territory | type / category | regulator | awarding organisation / provider | approval · access | legal review | selectable now | saves and reloads | admin review | Passport / share display |\n|---|---|---|---|---|---|---|---|---|---|---|---|";

const md = `# Security Passport — catalogue coverage matrix

_Generated by \`scripts/passport-catalogue-coverage-matrix.ts\` from a migrated local database
(all migrations through 20270220090000). Do not edit by hand; regenerate._

Every researched definition is reconciled here by its **stable credential code** against the
actual taxonomy, its approval state, its catalogue visibility and the governed save path. The
same diagnosis is shown to a platform administrator at \`/admin/passport-catalogue\`.

| | count |
|---|---|
| definitions in the taxonomy | ${rows.length} |
| in the agreed scope (international, Sweden, India, Great Britain, Northern Ireland, Dubai) | ${rows.filter(inScope).length} |
| selectable by every holder today | ${count("selectable")} |
| selectable by VALID PILOT MEMBERS of the definition's own market (Route A) | ${count("selectable_pilot_members")} |
| selectable by EVERY SIGNED-IN HOLDER as a public pilot, no grant (Route B) | ${count("selectable_public_pilot")} |
| held back individually or awaiting approval | ${count("awaiting_definition_approval")} |
| market closed (Abu Dhabi) | ${count("market_closed")} |
| blocked by missing governed data | ${count("blocked")} |

**Nothing is approved to produce this proof.** "Saves and reloads — proven" appears ONLY on a definition somebody can select today; a
definition that is not approved yet reads "not selectable yet" and is refused by the database, which the same suite proves. "Proven" means the definition is pinned by code in
\`supabase/tests/security_passport_catalogue_completeness_test.sql\` (CI, every push) and in
\`scripts/passport-live-local-journey-check.mjs\` (real GoTrue + PostgREST, authenticated test
users): visible to its entitled holder, saved through \`sp_save_international_credential\` with the
contract its definition demands, and read back with the right territory, issuer and scope. A pilot
definition is reached through a pilot membership alone, exactly as a real tester reaches it;
\`is_active\` is never set, temporarily or otherwise.

Three questions are kept apart throughout: **definition approval** (\`is_active\`, per definition),
**market entitlement** (active pack, internal pilot + a named member, or a public pilot for any
signed-in holder) and **holder verification** (never a catalogue matter). The **legal review** has
a column of its own: availability never reads it, and a public pilot leaves it pending.

${groups
  .map(([title, pick]) => {
    const g = rows.filter(pick);
    return `## ${title} — ${g.length}\n\n${HEAD}\n${g.map(line).join("\n")}`;
  })
  .join("\n\n")}

## The ${pending.length} pilot definitions — Route A (owner decision, 2026-09-18)

The owner approved Route A: the per-definition internal-pilot authorisation already on record
(\`pilot_state = 'internal_pilot'\`, 20260915090000) is honoured **for explicitly granted pilot
members**. A pilot definition is offered only when the definition is \`internal_pilot\`, ITS OWN
market pack is \`internal_pilot\` and not active, and the authenticated holder has a valid
membership of THAT pack — and every other catalogue, source, issuer, jurisdiction and scope
requirement passes. \`is_active\` stays false on all of them, so public activation of a market
publishes none of them; the legal-review gate is untouched. This authorises implementation and
testing, not public market activation. Details and release steps:
[pilot-approval-decisions.md](pilot-approval-decisions.md).

| code | name | market | legal review | source recorded for the definition | checked |
|---|---|---|---|---|---|
${pending
  .map(
    (r) =>
      `| \`${r.code}\` | ${r.nameEn} | ${r.marketPackCode} | ${r.legalReviewState} | ${r.review?.sourceUrl ?? "—"} | ${r.review?.checkedOn ?? "—"} |`,
  )
  .join("\n")}

### Known limits to weigh with those decisions

- **Dubai:** \`portal.sira.gov.ae\` never answered the source checker (a standing limitation
  recorded in \`docs/passport/regulatory-source-register.md\`); \`name_ar\` is NULL on every row and
  Arabic vocabulary must be supplied and reviewed before activation.
- **Dubai issuer mapping was checked against the source's CONTENT, not its reachability**
  (2026-09-18). \`sira.gov.ae/en/services/security-cadre-card\` presents the Security Cadre Card
  as a SIRA service and requires "completion of the … course from Approved Training Centers"
  and a knowledge test "at one of the Security Training Centers approved by the Agency". So a
  **card** is issued and regulated by SIRA, the authority recorded for checking it; a **course or check** is regulated by SIRA
  but its certificate comes from the approved centre, which the holder names. SIRA is recorded as
  the issuer of no course, although the taxonomy's \`authority_id\` names it on every Dubai row.
  What the source does NOT state is who issues the fitness, fire-safety and life-support
  documents specifically; they are modelled the same way (stated on the document) and that is
  the one Dubai mapping a reviewer should confirm.
- **Great Britain:** the four ICO sources must be re-read on the implementation date (Data (Use
  and Access) Act).
- **India** has no market pack: its four national qualifications authorise nothing, so they are
  offered without one (scope \`national_qualification\`), with \`legal_review_state\` still
  \`pending\`. No personal PSARA licence exists and none is modelled; state-specific PSARA
  training certificates are not modelled either. See \`docs/passport/india-market-entry.md\`.
- **Sweden** is \`grandfathered\`, not \`approved\`: it carries the same review debt, and whether the
  narrow personnel-approval result may be recorded at all is named for legal review in
  \`docs/passport/sweden-market-pack.md\`.
`;
writeFileSync(path.join(root, "docs/passport/catalogue-coverage-matrix.md"), md);
console.log(
  `coverage matrix written: ${rows.length} definitions, ${pending.length} for pilot members, ${count("selectable")} selectable`,
);
