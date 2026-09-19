/**
 * The library and the employer journey (TRUST/BESKT product structure v2.0),
 * asserted from the catalogue's behaviour and from the source.
 *
 * The routed walk (e2e/library-journey.spec.ts) proves the journey in a
 * browser; this guard runs in the fast job and fails if the product stops
 * keeping its promises:
 *   * METHOD → ROLE → ENVIRONMENT → SETUP, with TRUST and BESKT as the only
 *     two entrances -- never an unsorted list, never a third entrance;
 *   * a strategic setup is never the operational content renamed, and an
 *     environment with no content of its own is never offered;
 *   * the setup follows the case, and only non-personal material is seeded;
 *   * a value the browser filled in counts as filled (the reported bug);
 *   * one question navigation in the interview;
 *   * Bibliotek and Rapporter in the navigation.
 *
 * Run: bun run library-structure:check
 */

import { readFileSync } from "node:fs";
import {
  ENVIRONMENTS,
  ENVIRONMENTS_WITH_CONTENT,
  TRUST_CONTENT,
  resolveSetup,
  type LiveContent,
} from "../src/lib/library/catalogue";

const read = (p: string) => readFileSync(p, "utf8");
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const fails: string[] = [];
let passed = 0;
function check(ok: boolean, label: string): void {
  if (ok) {
    passed += 1;
    console.log(`  ok ${label}`);
  } else {
    fails.push(label);
    console.log(`  FAIL ${label}`);
  }
}

const LIVE: LiveContent = {
  guides: [
    {
      packVersionId: "g1",
      packSlug: "vaktare-se",
      name: "Väktare",
      nameEn: null,
      versionNumber: 1,
      contentStatus: "draft",
      validationLabel: "pilot_hypothesis",
    },
  ],
  assessments: [
    {
      slug: "security-officer-recruitment",
      nameSv: "Väktare – Recruitment Assessment",
      nameEn: "Security officer",
      assignable: true,
      minutesMin: 35,
      minutesMax: 45,
      itemCount: 50,
      moduleCount: 5,
      contentStatus: "draft",
      validationStatus: "design",
      versionNumber: 1,
      competenciesSv: [],
      competenciesEn: [],
      doesNotMeasureSv: [],
      doesNotMeasureEn: [],
    },
  ],
  beskt: [],
};

// ---- the catalogue's behaviour ---------------------------------------------------
const op = resolveSetup("trust", "operational", "vaktare", "general", LIVE);
check(
  op.startable &&
    op.guide?.packSlug === "vaktare-se" &&
    op.assessment?.slug === "security-officer-recruitment",
  "LS-TRUST-OPERATIONAL: TRUST · operational · Väktare · general resolves to the Väktare guide and test",
);
const strat = resolveSetup("trust", "strategic", "security_manager", "general", LIVE);
check(
  TRUST_CONTENT.security_manager === null &&
    !strat.startable &&
    strat.blockers.includes("no_role_content") &&
    strat.guide === null &&
    strat.assessment === null,
  "LS-NO-RENAMED-TEST: a strategic TRUST setup is not the Väktare content under a new title",
);
check(
  ENVIRONMENTS.every(
    (e) =>
      ENVIRONMENTS_WITH_CONTENT.includes(e) ||
      resolveSetup("trust", "operational", "vaktare", e, LIVE).blockers.includes(
        "environment_without_content",
      ),
  ) && ENVIRONMENTS_WITH_CONTENT.join(",") === "general",
  "LS-ENVIRONMENT: an environment without content of its own is never startable",
);
check(
  resolveSetup("beskt", "operational", "vaktare", "general", LIVE).blockers.includes(
    "beskt_unavailable",
  ) &&
    resolveSetup("trust", "operational", "vaktare", "general", {
      ...LIVE,
      guides: null,
    }).blockers.includes("content_unreadable"),
  "LS-TRUTHFUL: no BESKT content in the offer, and an unreadable read, are each said by name",
);

// ---- the library route ----------------------------------------------------------
const route = code(
  read("src/routes/_authenticated.employer.$employerSlug.assessments.library.tsx"),
);
const lib = code(read("src/components/library/RecruitmentLibrary.tsx"));
check(
  /<RecruitmentLibrary/.test(route) && !/ContentLibrary|MethodSupportSection/.test(route),
  "LS-ORDER: the library route is the ordered library, not an unsorted content list",
);
check(
  /\(\["trust", "beskt"\] as const\)\.map/.test(lib) &&
    /data-testid=\{`lib-method-\$\{m\}`\}/.test(lib) &&
    !/listContentLibrary\([^)]*\)[\s\S]{0,200}lib-method/.test(lib),
  "LS-TWO-ENTRANCES: TRUST and BESKT are the two entrances, rendered from one list of equal weight",
);
check(
  /validateSearch[\s\S]*isMethod\(search\.method\)[\s\S]*isRoleGroup\(search\.group\)[\s\S]*isRoleProfile\(search\.role\)[\s\S]*isEnvironment\(search\.env\)/.test(
    route,
  ),
  "LS-BACK: the choices live in the URL, so Back does not discard the setup",
);
check(
  /recordBesktSetup/.test(lib) && /method: "trust",\s*group,\s*role,\s*env/.test(lib),
  "LS-CARRIED: a started BESKT assignment records its setup, and a TRUST start carries it to the case",
);

// ---- the case --------------------------------------------------------------------
const runtime = code(read("src/lib/interview-intelligence/runtime.functions.ts"));
const seed = /async function seedCaseSources[\s\S]*?\n\}/.exec(runtime)?.[0] ?? "";
check(
  /await recordSetup\(db, data\.employerId, data\.setup/.test(runtime) &&
    /readSetup\(db, "beskt_assignment_id", data\.besktAssignmentId\)/.test(runtime),
  "LS-CASE-SETUP: case creation records the setup, or carries a BESKT assignment's",
);
check(
  seed.length > 0 &&
    /"employer_requirements"/.test(seed) &&
    /"job_description"/.test(seed) &&
    !/"candidate_cv"|"application_answers"/.test(seed),
  "LS-SEED: only non-personal material is seeded -- never the candidate's CV or answers",
);
const prepare = code(
  read(
    "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.prepare.tsx",
  ),
);
const newCase = code(
  read("src/routes/_authenticated.employer.$employerSlug.interview-intelligence.new.tsx"),
);
check(
  (prepare.match(/new FormData\(e\.currentTarget\)/g) ?? []).length >= 2 &&
    /new FormData\(e\.currentTarget\)/.test(newCase) &&
    /create\.mutate\(v\)/.test(newCase),
  "LS-AUTOFILL: the forms validate what they hold, so a value the browser filled in counts",
);
check(
  /useState\(\(\) => t\("iiu\.pp\.manual\.default\.timeplan"\)\)/.test(prepare) &&
    /useState\(\(\) => t\("iiu\.pp\.manual\.default\.opening"\)\)/.test(prepare),
  "LS-PLAN-PROPOSAL: the plan starts from a proposal instead of a blank that has to be written",
);
const interview = code(
  read(
    "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.interview.tsx",
  ),
);
check(
  !/toCover\.map\(/.test(interview) &&
    /FOLLOWUPS_SHOWN/.test(interview) &&
    /<CaseHeader\s+compact/.test(interview),
  "LS-FOCUS: one question navigation, folded follow-ups and a compact case bar in the interview",
);

// ---- navigation ---------------------------------------------------------------------
const shell = code(read("src/components/employer/EmployerAppShell.tsx"));
check(
  /labelKey: "employer\.nav\.library",\s*icon: ClipboardCheck,\s*to: "\/employer\/\$employerSlug\/assessments\/library"/.test(
    shell,
  ) &&
    /labelKey: "employer\.nav\.reports",\s*icon: FileCheck2,\s*to: "\/employer\/\$employerSlug\/reports"/.test(
      shell,
    ),
  "LS-NAV: Bibliotek and Rapporter are in the recruitment navigation",
);

console.log("");
if (fails.length > 0) {
  console.error(`library-structure:check FAILED (${fails.length} of ${passed + fails.length}).`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`library-structure:check: ${passed} assertions passed.`);
