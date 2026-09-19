/**
 * Planted defects for library-structure:check.
 *
 * Run: bun run negative-controls:library-structure
 */

import { runControls, type Mutation } from "./runner";

const GUARD = "library-structure:check";
const CAT = "src/lib/library/catalogue.ts";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "LS-NC-RENAMED-TEST",
    defect: "the strategic role is offered the Väktare guide and test under a new title",
    file: CAT,
    find: "  security_manager: null,\n};",
    replace:
      '  security_manager: { guidePackSlug: "vaktare-se", assessmentSlug: "security-officer-recruitment" },\n};',
    guard: GUARD,
    expect: "LS-NO-RENAMED-TEST",
  },
  {
    id: "LS-NC-DECORATIVE-ENVIRONMENT",
    defect: "a hospital setup is offered although no hospital scenarios exist",
    file: CAT,
    find: 'export const ENVIRONMENTS_WITH_CONTENT: readonly EnvironmentKey[] = ["general"];',
    replace:
      'export const ENVIRONMENTS_WITH_CONTENT: readonly EnvironmentKey[] = ["general", "hospital"];',
    guard: GUARD,
    expect: "LS-ENVIRONMENT",
  },
  {
    id: "LS-NC-UNSORTED-LIBRARY",
    defect: "the flat content list returns to the library route beside the ordered library",
    file: "src/routes/_authenticated.employer.$employerSlug.assessments.library.tsx",
    find: 'import { EmployerErrorState } from "@/components/employer/EmployerErrorState";',
    replace:
      'import { EmployerErrorState } from "@/components/employer/EmployerErrorState";\nimport { ContentLibrary } from "@/components/academy/ContentLibrary";\nvoid ContentLibrary;',
    guard: GUARD,
    expect: "LS-ORDER",
  },
  {
    id: "LS-NC-SEEDS-PERSONAL-DATA",
    defect: "case creation seeds the candidate's CV without anybody deciding a lawful basis for it",
    file: "src/lib/interview-intelligence/runtime.functions.ts",
    find: '      _source_kind: "employer_requirements",',
    replace: '      _source_kind: "candidate_cv",',
    guard: GUARD,
    expect: "LS-SEED",
  },
  {
    id: "LS-NC-AUTOFILL-IGNORED",
    defect:
      "the new-case form validates React state only, so an autofilled name is reported missing",
    file: "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.new.tsx",
    find: "    create.mutate(v);",
    replace: "    create.mutate({ title, candidate, packVersionId });",
    guard: GUARD,
    expect: "LS-AUTOFILL",
  },
  {
    id: "LS-NC-TWO-QUESTION-LISTS",
    defect: "the interview grows a second question navigation beside the question list",
    file: "src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.interview.tsx",
    find: '                <p className="text-xs text-muted-foreground" data-testid="iv-remaining">',
    replace:
      '                <ul>{toCover.map((qq) => (<li key={qq.id}>{qq.code}</li>))}</ul>\n                <p className="text-xs text-muted-foreground" data-testid="iv-remaining">',
    guard: GUARD,
    expect: "LS-FOCUS",
  },
];

await runControls("library-structure", MUTATIONS);
