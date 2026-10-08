/**
 * Negative controls for employer-portal-flow:check.
 *
 * Each mutation re-introduces one defect the guard exists to catch; the guard
 * must fail with the expected diagnostic, or the control fails. See
 * ./runner.ts for the harness and its restoration proof.
 */
import { runControls, type Mutation } from "./runner";

const G = "employer-portal-flow:check";
const R = "src/routes/_authenticated.employer.$employerSlug.";
const OVERVIEW = `${R}index.tsx`;
const DEFS = "src/lib/recruitment/definitions.ts";
const STATUS = "src/components/recruitment/RecruiterStatus.tsx";
const STEP_NAV = "src/components/recruitment/ProcessStepNav.tsx";
const PANELS = "src/components/recruitment/ApplicationPanels.tsx";
const REPORTS = `${R}reports.tsx`;

const MUTATIONS: Mutation[] = [
  {
    id: "EPF-REVIEW-ROW-OPENS-THE-OLD-STATUS-FILTER",
    defect: "the next-step row goes back to opening a status filter that is not the stage it counted",
    file: OVERVIEW,
    find: '        search: { stage: "review" as const },',
    replace: '        search: { status: "reviewing" as const },',
    guard: G,
    expect: 'the "awaiting-next-step" row must open the applications under review',
  },
  {
    id: "EPF-NEXT-STEP-COUNTS-INTERVIEWS-TWICE",
    defect:
      "the next-step count includes the interview stage again while the interview row still counts it",
    file: OVERVIEW,
    find: "    (n, r) => n + (r.unresolved - r.newCount - r.interviewStage),",
    replace: "    (n, r) => n + (r.unresolved - r.newCount),",
    guard: G,
    expect: "the next-step count must exclude the interview stage",
  },
  {
    id: "EPF-READY-MEANS-CLOSED",
    defect: "the ready-to-complete filter shows every closed recruitment, including those with candidates waiting",
    file: DEFS,
    find: '    case "ready":\n      return isReadyToComplete(phase, unresolved);',
    replace: '    case "ready":\n      return phase === "closed";',
    guard: G,
    expect: 'the "ready" phase filter must be isReadyToComplete',
  },
  {
    id: "EPF-STATUS-IS-COLOUR-ONLY",
    defect: "the requirement status badge drops its symbol and relies on colour and text alone",
    file: STATUS,
    find: '      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />\n      {requirementLabels[lang][status]}\n    </span>\n  );\n}\nexport function ReviewStatusBadge',
    replace: '      {requirementLabels[lang][status]}\n    </span>\n  );\n}\nexport function ReviewStatusBadge',
    guard: G,
    expect: "the badge must render the icon beside the text label",
  },
  {
    id: "EPF-STEP-NAV-DROPS-THE-VIEW",
    defect: "switching step inside a recruitment drops the candidate list's filters, sort and page",
    file: STEP_NAV,
    find: "                  search={{ ...preserve, step }}",
    replace: "                  search={{ step }}",
    guard: G,
    expect: "step links must carry the candidate list's view",
  },
  {
    id: "EPF-BOOKING-EDIT-ON-CLOSED-APPLICATION",
    defect: "a closed application offers a booking edit the database will refuse",
    file: PANELS,
    find: '              {b.status === "planned" && open && (',
    replace: '              {b.status === "planned" && (',
    guard: G,
    expect: "editing a booking must be hidden once the application is closed",
  },
  {
    id: "EPF-REPORTS-LIGHTS-NOTHING",
    defect: "Rapporter goes back to a section no menu item carries, so the menu lights nothing there",
    file: REPORTS,
    find: '      activeSection="interviewIntelligence"',
    replace: '      activeSection="reports"',
    guard: G,
    expect: "Rapporter is a view over the interview cases and keeps Intervjuer lit",
  },
];

runControls("employer-portal-flow", MUTATIONS);
