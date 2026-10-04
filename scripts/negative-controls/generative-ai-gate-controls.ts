/**
 * Negative controls for the generative-AI gate guard
 * (scripts/generative-ai-gate-check.ts).
 *
 * Each mutation plants one way version 1 could start sending a person's data
 * to an AI provider again: the constant flipped, the gate made to read the
 * environment, the selector no longer refusing, a call site that fetches
 * directly instead of through the gate, a new provider host, an AI client
 * library, and the lab seam used by the application.
 *
 * Run: bun run negative-controls:generative-ai-gate
 */
import { runControls, type Mutation } from "./runner";

const GUARD = "generative-ai-gate:check";
const GATE = "src/lib/ai/generative-ai-gate.ts";
const ORCHESTRATOR = "src/lib/interview-intelligence/ai/orchestrator.ts";
const ANTHROPIC = "src/lib/interview-intelligence/ai/providers/anthropic.ts";
const SW_AI = "src/lib/security-work/processing/ai.server.ts";
const SW_JOBS = "src/lib/security-work/processing/ai-jobs.server.ts";
const ASSISTANT = "src/lib/security-work/programme/assistant.server.ts";
const CV_GENERATION = "src/lib/professional-identity/cv/generation.ts";

const MUTATIONS: readonly Mutation[] = [
  {
    id: "AIGATE-NC-OPEN",
    defect: "the version-1 constant is flipped to true",
    file: GATE,
    find: "export const GENERATIVE_AI_ENABLED = false;",
    replace: "export const GENERATIVE_AI_ENABLED = true;",
    guard: GUARD,
    expect: "version 1 is a constant, and it is closed",
  },
  {
    id: "AIGATE-NC-ENV-READ",
    defect: "the gate starts reading an environment variable",
    file: GATE,
    find: "return GENERATIVE_AI_ENABLED || labOverride;",
    replace: 'return GENERATIVE_AI_ENABLED || labOverride || process.env.AI_ENABLED === "true";',
    guard: GUARD,
    expect: "the gate is a literal false and reads no environment, no database and no request",
  },
  {
    id: "AIGATE-NC-SELECTOR",
    defect: "the provider selector no longer refuses a configured provider",
    file: ORCHESTRATOR,
    find: "if (!externalAiAllowed()) {",
    replace: "if (false as boolean) {",
    guard: GUARD,
    expect: 'selectProvider("anthropic", production) is refused before the key is read',
  },
  {
    id: "AIGATE-NC-ADAPTER-DIRECT",
    defect: "the interview adapter sends its request with a direct fetch, not through the gate",
    file: ANTHROPIC,
    find: 'response = await externalAiFetch("anthropic.complete", this.fetchImpl, API_URL, {',
    replace: "response = await this.fetchImpl(API_URL, {",
    guard: GUARD,
    expect: "anthropic.ts: sends through externalAiFetch and has no direct fetch call",
  },
  {
    id: "AIGATE-NC-SW-DISPATCH",
    defect: "Security-work dispatch no longer refuses before it builds state and timers",
    file: SW_AI,
    find: '  if (!externalAiAllowed()) throw new SwAiError("generative_ai_disabled");\n',
    replace: "",
    guard: GUARD,
    expect: "Security-work dispatch is refused before preflight and before any timer",
  },
  {
    id: "AIGATE-NC-SW-STATUS",
    defect: "Security-work reports AI as available from the environment alone",
    file: SW_JOBS,
    find: '  if (!externalAiAllowed()) return "AI_NOT_ENABLED";\n',
    replace: "",
    guard: GUARD,
    expect:
      "Security-work configuration (job and assistant) says AI_NOT_ENABLED before any database read",
  },
  {
    id: "AIGATE-NC-ASSISTANT-DIRECT",
    defect: "the Security AI assistant calls the provider with a direct fetch",
    file: ASSISTANT,
    find: 'await externalAiFetch(\n    "security-work.assistant",\n    fetchImpl,\n    ',
    replace: "await fetchImpl(\n    ",
    guard: GUARD,
    expect: "assistant.server.ts: sends through externalAiFetch and has no direct fetch call",
  },
  {
    id: "AIGATE-NC-NEW-HOST",
    defect: "a new AI provider host appears in application code",
    file: CV_GENERATION,
    find: 'export const CV_TASK_KEY = "cv_presentation_drafting" as const;',
    replace:
      'export const CV_TASK_KEY = "cv_presentation_drafting" as const;\nconst NEW_PROVIDER = "https://api.openai.com/v1/chat/completions";',
    guard: GUARD,
    expect:
      "the only files in src/ and supabase/functions that name a provider or send its credential are the known three",
  },
  {
    id: "AIGATE-NC-EDGE-FUNCTION",
    defect: "an edge function is pointed at an AI provider",
    file: "supabase/functions/transactional-email/index.ts",
    find: '"https://api.resend.com/emails"',
    replace: '"https://api.anthropic.com/v1/messages"',
    guard: GUARD,
    expect: "no edge function names an AI provider",
  },
  {
    id: "AIGATE-NC-SDK",
    defect: "an AI client library is added as a dependency",
    file: "package.json",
    find: '  "dependencies": {\n',
    replace: '  "dependencies": {\n    "openai": "^4.0.0",\n',
    guard: GUARD,
    expect: "no AI client library is a dependency",
  },
  {
    id: "AIGATE-NC-LAB-SEAM",
    defect: "application code references the lab seam that reopens the gate",
    file: CV_GENERATION,
    find: 'export const CV_TASK_KEY = "cv_presentation_drafting" as const;',
    replace:
      'export const CV_TASK_KEY = "cv_presentation_drafting" as const;\nexport const LAB = "__setGenerativeAiLabOverride";',
    guard: GUARD,
    expect: "the lab seam is not referenced anywhere under src/ or supabase/functions",
  },
];

runControls("generative-ai-gate", MUTATIONS);
