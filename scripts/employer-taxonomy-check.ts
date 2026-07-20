// Phase H3.2.1 final review — focused application-level regression check
// for the employer job form's taxonomy/enum mapping (Defect 2 & 3 of the
// H3.2.1 defect-fix pass). Run via `bun run employer-taxonomy:check`.
//
// This is deliberately a plain, importable-module check (matching the
// established scripts/cie-check.ts / scripts/kg-check.ts pattern already
// used in this repo), not a JS/TS unit-test-runner suite -- no such
// runner is configured in this project (see package.json), and this
// review's scope is a final hardening pass, not introducing new test
// infrastructure. It guards against exactly the class of regression that
// caused Defect 2 & 3: a canonical ID list drifting out of sync with the
// live DB whitelist, or a translated display label accidentally being
// reused as a stored value.
//
// The RLS/DB-authorization side of H3.2.1 (service-role removal, pending-
// employer access, cross-tenant denial, CV signed-URL boundaries) is
// exercised by tests/database/phase-h3-2-1/ against a real Postgres
// instance running the actual live trigger/constraint logic -- that is
// the correct, established layer for those checks in this codebase (every
// prior phase -- G1, H3.1, H3.2 -- validated identical concerns the same
// way), not something a plain import-and-assert script can meaningfully
// substitute for.

import { careerAreaLabels } from "../src/lib/job-intelligence/career-area-labels";
import {
  EMPLOYMENT_TYPE_VALUES,
  WORKPLACE_TYPE_VALUES,
  EXPERIENCE_LEVEL_VALUES,
  employmentTypeLabel,
  workplaceTypeLabel,
  experienceLevelLabel,
} from "../src/lib/job-intelligence/enum-labels";

const errors: string[] = [];

// 1. Exactly the 14-value canonical Career Family whitelist currently
// enforced by assert_cig_family_id() (supabase/migrations/
// 20260717172039_2633ba0f-...sql, "Narrow the family whitelist to the 14
// canonical IDs"). If this ever drifts, EmployerJobForm.tsx's <select>
// would offer a value the DB trigger rejects -- reproducing Defect 2.
const LIVE_DB_FAMILY_WHITELIST = [
  "protective_operations",
  "public_safety_justice",
  "corrections_secure_transport",
  "defence_national_security",
  "corporate_security",
  "critical_infrastructure_security",
  "risk_management",
  "crisis_management",
  "business_continuity_resilience",
  "cyber_information_security",
  "financial_crime_compliance",
  "security_technology",
  "security_leadership_governance",
  "investigations_intelligence",
] as const;

const formIds = careerAreaLabels.map((f) => f.id).sort();
const dbIds = [...LIVE_DB_FAMILY_WHITELIST].sort();
if (JSON.stringify(formIds) !== JSON.stringify(dbIds)) {
  errors.push(
    `career-area-labels.ts ids no longer match the live assert_cig_family_id() whitelist.\n  form: ${formIds.join(",")}\n  db:   ${dbIds.join(",")}`,
  );
}

// 2. No family display label (sv or en) is ever equal to a canonical id --
// guards against the exact Defect 2 failure mode (a label typed/selected
// as if it were the id).
for (const f of careerAreaLabels) {
  if (f.name.sv === f.id || f.name.en === f.id) {
    errors.push(`career-area-labels.ts family "${f.id}" has a display label equal to its own id`);
  }
  if ((LIVE_DB_FAMILY_WHITELIST as readonly string[]).includes(f.name.sv)) {
    errors.push(
      `career-area-labels.ts family "${f.id}"'s Swedish label collides with a canonical id`,
    );
  }
  if ((LIVE_DB_FAMILY_WHITELIST as readonly string[]).includes(f.name.en)) {
    errors.push(
      `career-area-labels.ts family "${f.id}"'s English label collides with a canonical id`,
    );
  }
}

// 3. workplace_type: exactly the live jobs_workplace_type_check CHECK
// constraint's three values -- specifically guards against Defect 3's
// "on_site" (invalid) regressing back in.
const LIVE_DB_WORKPLACE_TYPES = ["onsite", "hybrid", "remote"];
if (
  JSON.stringify([...WORKPLACE_TYPE_VALUES].sort()) !==
  JSON.stringify([...LIVE_DB_WORKPLACE_TYPES].sort())
) {
  errors.push(
    `enum-labels.ts WORKPLACE_TYPE_VALUES no longer matches the live jobs_workplace_type_check constraint.\n  values: ${WORKPLACE_TYPE_VALUES.join(",")}`,
  );
}
if (WORKPLACE_TYPE_VALUES.includes("on_site")) {
  errors.push('enum-labels.ts WORKPLACE_TYPE_VALUES contains the old invalid value "on_site"');
}

// 4. employment_type / experience_level: no label (sv or en) ever equals
// its own stored value or any other stored value in the same set --
// guards the same class of bug for the two remaining taxonomy-backed
// enums the employer form renders.
function assertLabelsNeverEqualValues(
  fieldName: string,
  values: readonly string[],
  label: (v: string, lang: "sv" | "en") => string,
) {
  for (const v of values) {
    for (const lang of ["sv", "en"] as const) {
      const text = label(v, lang);
      if (values.includes(text)) {
        errors.push(
          `enum-labels.ts ${fieldName} value "${v}"'s ${lang} label ("${text}") equals a stored value`,
        );
      }
    }
  }
}
assertLabelsNeverEqualValues("EMPLOYMENT_TYPE_VALUES", EMPLOYMENT_TYPE_VALUES, employmentTypeLabel);
assertLabelsNeverEqualValues("WORKPLACE_TYPE_VALUES", WORKPLACE_TYPE_VALUES, workplaceTypeLabel);
assertLabelsNeverEqualValues(
  "EXPERIENCE_LEVEL_VALUES",
  EXPERIENCE_LEVEL_VALUES,
  experienceLevelLabel,
);

if (errors.length > 0) {
  for (const e of errors) console.error("[employer-taxonomy:check][error]", e);
  console.error(`\nemployer-taxonomy:check FAILED with ${errors.length} error(s).`);
  process.exit(1);
}
console.log("employer-taxonomy:check OK");
