// Security Passport — the administration of the certification catalogue.
//
// The research queue and the requests holders send are administered at
// /admin/passport-catalogue. This guard pins what that surface may and may not
// do, by executing the pure parts (the diagnosis, the vocabularies) and reading
// the server functions' source for the properties a test cannot execute without
// a database. The database-side authority is proven in
// supabase/tests/security_passport_catalogue_research_test.sql (RS9, RS10): an
// ordinary holder, an anonymous caller and a revoked session are refused, and
// an administrator cannot approve or publish.
//
// scripts/negative-controls/passport-catalogue-admin-controls.ts proves each
// assertion fails when its rule is broken.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  diagnoseDefinition,
  type DiagnosticDefinition,
} from "../src/lib/security-passport/catalogue-diagnostics";
import {
  APPROVAL_IS_A_MIGRATION,
  evidenceLevelLabel,
  requestStatusAdminLabel,
  researchAreaLabel,
  researchDecisionLabel,
  researchKindLabel,
  researchOutcomeLabel,
  researchScopeLabel,
  RESEARCH_KIND,
} from "../src/lib/security-passport/catalogue-research-labels";
import { CREDENTIAL_CLASSES } from "../src/lib/security-passport/international";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
const failures: string[] = [];
let passed = 0;
function check(condition: boolean, label: string) {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures.push(label);
    console.log(`  FAIL ${label}`);
  }
}

const FNS = "src/lib/job-intelligence/admin-catalogue-research.functions.ts";
const fns = read(FNS);
const sql = read("supabase/migrations/20270206090000_sp_catalogue_research_foundation.sql");

console.log(
  "\n1 · the server functions are administrator-only and use the administrator's own session",
);
{
  const handlers = fns.split("createServerFn(").slice(1);
  check(handlers.length === 4, "1.1 four server functions: two reads, two decisions");
  check(
    handlers.every((h) => /\.middleware\(\[requireSupabaseAuth\]\)/.test(h)),
    "1.2 every one requires a signed-in session",
  );
  check(
    handlers.every((h) => {
      const body = h.slice(h.indexOf(".handler("));
      const firstCall = body.search(/ctx\.supabase\s*\.(from|rpc)\(/);
      const guard = body.indexOf("await assertAdmin(ctx)");
      return guard !== -1 && firstCall !== -1 && guard < firstCall;
    }),
    "1.3 every one checks is_platform_admin BEFORE it reads or writes anything",
  );
  check(
    !/supabaseAdmin|client\.server|service_role|SERVICE_ROLE/.test(fns),
    "1.4 none of them uses the service role: RLS and the functions' own checks are the authority",
  );
  check(
    /rpc\("is_platform_admin"/.test(fns) && /FORBIDDEN_ADMIN_REQUIRED/.test(fns),
    "1.5 the role check is the database's is_platform_admin",
  );
  check(
    /rpc\("sp_admin_review_research_record"/.test(fns) &&
      /rpc\("sp_admin_resolve_catalogue_request"/.test(fns) &&
      !/\.(insert|update|upsert|delete)\(/.test(fns),
    "1.6 a decision is only ever an RPC: no table is written directly",
  );
  check(
    !/sp_claims|sp_credential_types|sp_certification_definitions|assertion_level|is_active/.test(
      fns.replace(/\/\/.*$/gm, ""),
    ),
    "1.7 these functions can reach no claim, no definition and no availability flag",
  );
}

console.log("\n2 · a research decision can never be an approval or a publication");
{
  const decisions = /decision: z\.enum\(\[([^\]]*)\]\)/.exec(fns)?.[1] ?? "";
  check(
    /pending/.test(decisions) &&
      /needs_information/.test(decisions) &&
      /excluded/.test(decisions) &&
      !/approved/.test(decisions),
    "2.1 the decision a page may send is pending, needs_information or excluded — never approved",
  );
  check(
    /_decision NOT IN \('pending', 'needs_information', 'excluded'\)/.test(sql) &&
      /SP_RESEARCH_RECORD_IS_PUBLISHED/.test(sql),
    "2.2 and the database refuses approval and refuses to touch a published record, for everyone",
  );
  check(
    /note: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(2000\)/.test(fns) &&
      /_n IS NULL OR length\(_n\) > 2000/.test(sql),
    "2.3 a decision needs a reason, in the form and in the database",
  );
  check(
    /note: z\.string\(\)\.trim\(\)\.max\(300\)/.test(fns) && /length\(_clean\) > 300/.test(sql),
    "2.4 the note a holder reads is at most 300 characters, in the form and in the database",
  );
  check(
    /'catalogue_research_decided'/.test(sql) &&
      /'catalogue_request_resolved'/.test(sql) &&
      /"catalogue_research_decided"/.test(read("src/routes/_authenticated.admin.audit.tsx")) &&
      /"catalogue_request_resolved"/.test(read("src/routes/_authenticated.admin.audit.tsx")),
    "2.5 both decisions are audited by the database and can be found on the audit page",
  );
  check(
    APPROVAL_IS_A_MIGRATION.en.includes("reviewed migrations") &&
      APPROVAL_IS_A_MIGRATION.sv.includes("granskad migration") &&
      /APPROVAL_IS_A_MIGRATION/.test(
        read("src/components/admin/passport-catalogue/ResearchPanel.tsx"),
      ),
    "2.6 the research tab says, in both languages, that approval and publication are not made there",
  );
  const panel = read("src/components/admin/passport-catalogue/ResearchPanel.tsx");
  check(
    !/value="approved"|"approved"\]/.test(panel.replace(/record\.decision === "approved"/, "")),
    "2.7 the decision form offers no approve option",
  );
}

console.log("\n3 · the research tab keeps the separations the brief names");
{
  const panel = read("src/components/admin/passport-catalogue/ResearchPanel.tsx");
  check(
    /data-research-metadata/.test(panel) &&
      /Forskningsmetadata/.test(panel) &&
      /Research metadata/.test(panel),
    "3.1 research scope and jurisdiction context are labelled research metadata, not availability",
  );
  check(
    /data-research-locked/.test(panel) && /credentialCode \? \(/.test(panel),
    "3.2 a record that already is a definition offers no decision form",
  );
  check(
    /data-research-holder-reason/.test(panel) && /unavailableReasonLabel/.test(panel),
    "3.3 the reason a holder is shown is visible beside the record",
  );
  check(
    Object.keys(RESEARCH_KIND).length === 5 &&
      (["en", "sv"] as const).every(
        (lang) =>
          new Set(Object.keys(RESEARCH_KIND).map((k) => researchKindLabel(k, lang))).size === 5,
      ),
    "3.4 the five kinds are five different labels: a course certificate is never a professional certification",
  );
  check(
    researchOutcomeLabel("an_outcome_from_the_future", "en") === "Unknown outcome" &&
      researchKindLabel(null, "sv") === "Annan sorts intyg" &&
      researchAreaLabel("x", "en") === "Other area" &&
      evidenceLevelLabel("x", "en") === "Unknown evidence level" &&
      researchDecisionLabel("x", "sv") === "Okänt beslut" &&
      researchScopeLabel("x", "en") === "unknown" &&
      requestStatusAdminLabel("x", "en") === "Unknown status",
    "3.5 a value this build does not know has a neutral label in every vocabulary",
  );
  check(
    evidenceLevelLabel("official_search_excerpt", "en").includes("not opened"),
    "3.6 an excerpt-only record is labelled as a page that was not opened",
  );
}

console.log("\n4 · the definitions tab tells research-awaiting, selectable and retired apart");
{
  const base: DiagnosticDefinition = {
    code: "X",
    nameSv: "X",
    nameEn: "X",
    claimType: "certification",
    category: "qualification",
    scopeCode: "global_professional",
    marketPackCode: null,
    jurisdictionCode: null,
    subJurisdictionCode: null,
    isActive: false,
    pilotState: null,
    legalReviewState: "pending",
    requiresScope: false,
    deprecated: false,
    governedAuthority: null,
    governedCertificationIssuer: "Issuer",
    regulator: null,
    issuerStatedOnDocument: false,
    trainingProviderStatedOnDocument: false,
    jurisdictionActive: true,
    packIsActive: null,
    packPilotState: null,
    review: { sourceUrl: "https://example.invalid", checkedOn: "2026-10-03" },
  };
  check(
    diagnoseDefinition(base).availability === "awaiting_definition_approval",
    "4.1 an imported, inactive definition awaits its publication migration",
  );
  check(
    diagnoseDefinition({ ...base, isActive: true }).availability === "selectable",
    "4.2 an active one is selectable",
  );
  const retired = diagnoseDefinition({ ...base, isActive: true, retired: true });
  check(
    retired.availability === "retired" && retired.reasons.includes("retired"),
    "4.3 a definition past its end date is retired, not blocked and not selectable",
  );
  check(
    diagnoseDefinition({ ...base, isActive: true, deprecated: true }).availability === "retired",
    "4.4 a deprecated definition is retired too",
  );
  check(
    diagnoseDefinition({ ...base, isActive: true, retired: false }).availability === "selectable",
    "4.5 an unretired definition is not affected",
  );
  const route = read("src/routes/_authenticated.admin.passport-catalogue.tsx");
  check(
    /data-catalogue-tab=\{t\.value\}/.test(route) &&
      /<ResearchPanel/.test(route) &&
      /<RequestsPanel/.test(route) &&
      /const { tab = "definitions" } = Route\.useSearch\(\)/.test(route),
    "4.6 definitions, research and requests are three views of one page",
  );
  check(
    /retired: \{/.test(route) && /Object\.keys\(AVAILABILITY\)/.test(route),
    "4.7 the page counts and filters the retired state",
  );
  check(
    /effective_to/.test(read("src/lib/job-intelligence/admin-passport-catalogue.functions.ts")) &&
      /retired_on/.test(read("src/lib/job-intelligence/admin-passport-catalogue.functions.ts")),
    "4.8 retirement is read from the definition's own end dates",
  );
}

console.log("\n5 · a request is answered, never promoted");
{
  const panel = read("src/components/admin/passport-catalogue/RequestsPanel.tsx");
  check(
    /data-requests-boundary/.test(panel) && /reviewed migration/.test(panel),
    "5.1 the requests tab says a request is not a definition or a credential and verifies nobody",
  );
  check(
    /answered_existing.*in_research.*declined/s.test(panel) &&
      !/publish|approve/i.test(
        panel.replace(/Att lägga till[^"]*|Adding a definition[^"]*|verifies nobody/g, ""),
      ),
    "5.2 the answers offered are: it exists, it is being researched, it is declined",
  );
  check(
    /SP_REQUEST_REASON_REQUIRED/.test(sql) && /Skäl som innehavaren läser \(krävs\)/.test(panel),
    "5.3 declining needs a reason the holder can read",
  );
  check(
    Object.keys(CREDENTIAL_CLASSES).includes("course_certificate") &&
      /holder_user_id/.test(fns) &&
      !/email/i.test(fns),
    "5.4 an administrator sees which holder asked, by id, and no more personal data than that",
  );
}

if (failures.length) {
  console.error(`\npassport-catalogue-admin-check FAILED (${failures.length})`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`\npassport-catalogue-admin-check: ${passed} assertions passed.`);
