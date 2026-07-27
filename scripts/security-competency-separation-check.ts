// Security Competency Platform -- Career Guidance separation regression guard.
//
// Implementation directive section 5 requires automated tests proving the new
// Security Competency Platform does not reuse Career Guidance item IDs, item
// objects, options, mappings, scoring keys, dimensions, forms or reports, and
// that object identity, content equality and database references are all
// checked "where relevant".
//
// This is the object-identity / content-equality / static-reference half.
// The database half (RLS, immutability, legacy retirement) lives in
// supabase/tests/scp_a1_domain_model_test.sql.
//
// Plain TS script, matching this repository's existing scripts/*-check.ts
// convention (no test runner is configured in this project).

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { COMPETENCY_CODES, FAMILY_SLUGS, PROFESSION_SLUGS } from "../src/lib/security-competency/types";

// Career Guidance content, imported here ONLY so the guard can prove the two
// sets are disjoint. This script is the one place both worlds may be named.
import { questions as careerGuidanceQuestions } from "../src/lib/assessment-content";
import { questionMappings as careerGuidanceMappings } from "../src/lib/career-assessment/question-mappings";
import { allDimensionIds } from "../src/lib/career-assessment/dimensions";
import { ALL_ASSETS as careerGuidanceAssets } from "../src/lib/question-library/registry";
import { competencies as careerGuidanceCompetencies } from "../src/lib/competency-library/competencies";

const errors: string[] = [];
function expect(condition: boolean, message: string): void {
  if (!condition) errors.push(message);
}

const root = path.resolve(import.meta.dir, "..");
function read(relPath: string): string {
  return readFileSync(path.join(root, relPath), "utf8");
}

function walk(dir: string): string[] {
  const out: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

const SCP_DIR = path.join(root, "src/lib/security-competency");
const SCP_MIGRATION = "supabase/migrations/20260727120000_scp_a1_security_competency_platform_domain.sql";

// ---------------------------------------------------------------------------
// 1. Import isolation. No Security Competency module may reach into any
//    Career Guidance module -- the strongest available static guarantee that
//    no question object, mapping or scoring key can be shared by reference.
// ---------------------------------------------------------------------------
const FORBIDDEN_IMPORTS = [
  "@/lib/assessment-content",
  "@/lib/career-assessment",
  "@/lib/question-library",
  "@/lib/career-intelligence-engine",
  "@/lib/competency-library",
  "assessment-content",
  "career-assessment/",
  "question-library/",
  "career-intelligence-engine/",
  "competency-library/",
];

for (const file of walk(SCP_DIR)) {
  const source = readFileSync(file, "utf8");
  const rel = path.relative(root, file);
  // Only look at real import/export statements, not prose in comments.
  const importLines = source
    .split("\n")
    .filter((l) => /^\s*(import|export)\s.*\sfrom\s+["']/.test(l));
  for (const forbidden of FORBIDDEN_IMPORTS) {
    expect(
      !importLines.some((l) => l.includes(forbidden)),
      `${rel} imports Career Guidance module "${forbidden}" -- Security Competency must share no content or scoring with Career Guidance`,
    );
  }
}

// ---------------------------------------------------------------------------
// 2. Item ID disjointness. Every Career Guidance identifier -- the legacy
//    q1..q16 content ids and every Question Library asset id -- must be
//    absent from the Security Competency schema and seeds.
// ---------------------------------------------------------------------------
const scpMigration = read(SCP_MIGRATION);

const careerGuidanceIds = new Set<string>([
  ...careerGuidanceQuestions.map((q) => q.id),
  ...careerGuidanceAssets.map((a) => a.id),
  ...careerGuidanceMappings.map((m) => m.questionId),
]);

expect(
  careerGuidanceIds.size > 0,
  "sanity: the Career Guidance id set must be non-empty, otherwise this guard proves nothing",
);

for (const id of careerGuidanceIds) {
  // Match the id only as a whole quoted SQL literal, so a substring like "q1"
  // inside an unrelated word never produces a false positive.
  const asLiteral = new RegExp(`'${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}'`);
  expect(
    !asLiteral.test(scpMigration),
    `Security Competency migration references Career Guidance item id "${id}" -- item IDs may never be reused (directive section 5)`,
  );
}

// ---------------------------------------------------------------------------
// 3. Construct disjointness. The twelve SCC codes must collide with neither
//    the 14 Career Guidance DimensionIds nor the 19 Career Guidance
//    competency slugs. Directive section 5: "do not reuse Career Guidance
//    dimensions as Security Competency constructs".
// ---------------------------------------------------------------------------
const cgDimensionIds = new Set<string>(allDimensionIds);
const cgCompetencySlugs = new Set<string>(careerGuidanceCompetencies.map((c) => c.slug));

for (const code of COMPETENCY_CODES) {
  expect(
    !cgDimensionIds.has(code),
    `SCC construct "${code}" collides with a Career Guidance DimensionId`,
  );
  expect(
    !cgCompetencySlugs.has(code),
    `SCC construct "${code}" collides with a Career Guidance competency slug`,
  );
}

// The reverse direction matters just as much: no Career Guidance dimension
// name may appear as a competency code in the Security Competency seed.
for (const dim of cgDimensionIds) {
  const seededAsCompetency = new RegExp(`INSERT INTO public\\.scp_competencies[\\s\\S]*?'${dim}'`);
  expect(
    !seededAsCompetency.test(scpMigration),
    `Career Guidance dimension "${dim}" is seeded as a Security Competency construct`,
  );
}

expect(
  COMPETENCY_CODES.length === 12,
  "the Security Competency Core must define exactly twelve constructs (spec chapter 5)",
);

// ---------------------------------------------------------------------------
// 4. Schema-level separation. No scp_ table may hold a foreign key into a
//    Career Guidance content table, and the Career Guidance scoring tables
//    must not be referenced at all.
// ---------------------------------------------------------------------------
const CAREER_GUIDANCE_TABLES = [
  "cig_competencies",
  "cig_assessment_dimensions",
  "assessment_responses",
  "assessment_run_reports",
  "assessment_run_answers",
];

// Isolate just the scp_ table definitions so the legacy-retirement section at
// the end of the migration (which legitimately names assessment_assignments
// and assessment_versions) is not mistaken for a content dependency.
const scpTableBlocks = scpMigration
  .split(/CREATE TABLE public\./)
  .slice(1)
  .filter((block) => block.startsWith("scp_"));

expect(
  scpTableBlocks.length >= 20,
  `expected the Security Competency schema to define at least 20 tables, found ${scpTableBlocks.length}`,
);

for (const block of scpTableBlocks) {
  const tableName = block.split(/[\s(]/)[0];
  for (const cgTable of CAREER_GUIDANCE_TABLES) {
    expect(
      !new RegExp(`REFERENCES\\s+public\\.${cgTable}\\b`).test(block),
      `scp table "${tableName}" has a foreign key into Career Guidance table "${cgTable}"`,
    );
  }
  // The legacy catalogue is equally off-limits as a content dependency.
  expect(
    !/REFERENCES\s+public\.assessments\b/.test(block),
    `scp table "${tableName}" references the legacy public.assessments catalogue -- the new platform must have its own lineage`,
  );
}

// ---------------------------------------------------------------------------
// 5. Legacy handling must be RETIREMENT, never mutation or deletion
//    (directive section 6, acceptance criteria 5 and 6).
// ---------------------------------------------------------------------------
expect(
  /retired_at\s*=\s*COALESCE\(retired_at,\s*now\(\)\)/.test(scpMigration),
  "the legacy definition must be retired by stamping retired_at",
);
expect(
  !/DELETE\s+FROM\s+public\.(assessments|assessment_versions|assessment_assignments|assessment_runs)/i.test(
    scpMigration,
  ),
  "the migration must never DELETE from any legacy assessment table -- history is preserved",
);
expect(
  !/DROP\s+TABLE/i.test(scpMigration),
  "the migration must never DROP a table",
);
expect(
  !/UPDATE\s+public\.assessment_assignments/i.test(scpMigration),
  "the migration must never UPDATE historical assignment rows",
);
expect(
  !/UPDATE\s+public\.assessment_runs/i.test(scpMigration),
  "the migration must never UPDATE historical assessment runs",
);
expect(
  /BEFORE INSERT ON public\.assessment_assignments/.test(scpMigration),
  "the retirement guard must be BEFORE INSERT only, so existing rows are never re-evaluated",
);
expect(
  /ASSESSMENT_RETIRED/.test(scpMigration),
  "blocking a new legacy assignment must raise the stable ASSESSMENT_RETIRED code (spec T-002)",
);

// ---------------------------------------------------------------------------
// 6. Career Guidance itself must remain untouched by this work. The frozen
//    16-question content and its mappings are still exactly 16 items, and the
//    Question Library still assembles them -- if a future change to this
//    platform disturbs Career Guidance, this fails.
// ---------------------------------------------------------------------------
expect(
  careerGuidanceQuestions.length === 16,
  `Career Guidance must still have exactly 16 frozen questions, found ${careerGuidanceQuestions.length}`,
);
expect(
  careerGuidanceMappings.length === 16,
  `Career Guidance must still have exactly 16 frozen mappings, found ${careerGuidanceMappings.length}`,
);
expect(
  allDimensionIds.length === 14,
  `Career Guidance must still have exactly 14 frozen dimensions, found ${allDimensionIds.length}`,
);

// ---------------------------------------------------------------------------
// 7. Stable public slugs (directive section 7).
// ---------------------------------------------------------------------------
expect(
  FAMILY_SLUGS.core === "security-competency-core",
  "the Core family slug must be security-competency-core",
);
expect(
  PROFESSION_SLUGS.securityOfficer === "security-officer-se" &&
    PROFESSION_SLUGS.publicOrderOfficer === "public-order-officer-se" &&
    PROFESSION_SLUGS.protectiveSecurityOfficer === "protective-security-officer-se",
  "the three Swedish profession slugs must match the directive exactly",
);
expect(
  !Object.values(PROFESSION_SLUGS).some((s) => s.includes("security-guard-foundation")),
  "no new product may reuse the slug security-guard-foundation",
);
expect(
  !/'security-guard-foundation'/.test(
    scpMigration.split("SECTION 16")[0] ?? scpMigration,
  ),
  "security-guard-foundation may appear only in the legacy-retirement section, never as new product content",
);

// Swedish regulated roles must carry an explicit Swedish market association.
for (const slug of Object.values(PROFESSION_SLUGS)) {
  expect(
    new RegExp(`'${slug}'[\\s\\S]{0,220}'SE'`).test(scpMigration),
    `profession "${slug}" must be seeded with an explicit market of SE (directive section 7)`,
  );
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
if (errors.length > 0) {
  console.error(`security-competency-separation:check FAILED (${errors.length} issue(s)):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `security-competency-separation:check OK ` +
    `(${careerGuidanceIds.size} Career Guidance identifiers confirmed absent from the ` +
    `Security Competency schema; ${COMPETENCY_CODES.length} SCC constructs confirmed disjoint ` +
    `from ${cgDimensionIds.size} Career Guidance dimensions and ${cgCompetencySlugs.size} Career Guidance competencies)`,
);
