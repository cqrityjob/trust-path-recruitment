/**
 * Negative controls for the funnel measurement guard
 * (scripts/funnel-measurement-check.ts).
 *
 * Each mutation switches usage measurement back on in one place: the constant,
 * the server write, the India helper's sessionStorage marker, a caller that no
 * longer asks the switch, a new storage key, and an analytics host.
 *
 * Run: bun run negative-controls:funnel-measurement
 */
import { runControls, type Mutation } from "./runner";

const GUARD = "funnel-measurement:check";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "FUNNEL-NC-ON",
    defect: "the measurement switch is turned on",
    file: "src/lib/analytics/funnel-measurement.ts",
    find: "export const FUNNEL_MEASUREMENT_ENABLED = false;",
    replace: "export const FUNNEL_MEASUREMENT_ENABLED = true;",
    guard: GUARD,
    expect: "measurement is a constant, and it is off",
  },
  {
    id: "FUNNEL-NC-SERVER",
    defect: "the server write no longer checks the switch before the database",
    file: "src/lib/career-discovery/v31-feedback.functions.ts",
    find: "  if (!FUNNEL_MEASUREMENT_ENABLED) return { recorded: false };\n",
    replace: "",
    guard: GUARD,
    expect: "and the database is not called",
  },
  {
    id: "FUNNEL-NC-MARKER",
    defect: "the India helper writes its once-per-session marker again",
    file: "src/lib/india-entry/analytics.ts",
    find: '  if (!FUNNEL_MEASUREMENT_ENABLED) return;\n  if (typeof window === "undefined") return;',
    replace: '  if (typeof window === "undefined") return;',
    guard: GUARD,
    expect: "all 6 India events: sessionStorage is not touched",
  },
  {
    id: "FUNNEL-NC-ASSESSMENT",
    defect: "the assessment flow sends its events without asking the switch",
    file: "src/components/career-discovery/v31/PublicAssessmentFlow.tsx",
    find: "      if (!FUNNEL_MEASUREMENT_ENABLED) return;\n      void trackEventFn(",
    replace: "      void trackEventFn(",
    guard: GUARD,
    expect: "PublicAssessmentFlow.tsx: checks the switch before it sends",
  },
  {
    id: "FUNNEL-NC-CAREER-CENTER",
    defect: "the Career Center tracker sends without asking the switch",
    file: "src/lib/career-center/analytics.ts",
    find: "      if (!FUNNEL_MEASUREMENT_ENABLED) return;\n",
    replace: "",
    guard: GUARD,
    expect: "src/lib/career-center/analytics.ts: checks the switch before it sends",
  },
  {
    id: "FUNNEL-NC-NEXT-ACTION",
    defect: "the next-step tracker no longer asks the switch",
    file: "src/lib/professional-identity/next-action-analytics.ts",
    find: "if (!FUNNEL_MEASUREMENT_ENABLED || !eventsEnabled()) return;",
    replace: "if (!eventsEnabled()) return;",
    guard: GUARD,
    expect: "next-action-analytics.ts: checks the switch before it sends",
  },
  {
    id: "FUNNEL-NC-NEW-KEY",
    defect: "a new browser-storage key appears that nobody reviewed",
    file: "src/lib/legal/terms-acceptance.ts",
    find: 'const KEY = "cq.termsAccepted";',
    replace: 'const KEY = "cq.visitCounter";',
    guard: GUARD,
    expect: "every browser-storage key the product names is a reviewed one",
  },
  {
    id: "FUNNEL-NC-HOST",
    defect: "an analytics host is named in the application",
    file: "src/lib/analytics/funnel-measurement.ts",
    find: "/** Version 1: no usage measurement. */",
    replace: "/** Version 1: no usage measurement. https://plausible.io/js/script.js */",
    guard: GUARD,
    expect: "no analytics or tracking host is named in the application",
  },
];

runControls("funnel-measurement", MUTATIONS);
