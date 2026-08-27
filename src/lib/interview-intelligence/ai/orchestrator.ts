// The orchestrator.
//
// One path, always the same order:
//
//   start the run  ->  call the provider  ->  parse  ->  validate the schema
//   ->  validate policy  ->  validate citations  ->  persist typed rows
//   ->  settle the run
//
// Every failure between those steps QUARANTINES: the run row is kept with a
// status that says exactly what went wrong, and no typed row is written. There
// is deliberately no retry-until-it-passes loop, because a validator you can
// re-roll until it agrees is not a validator.
//
// Nothing here trusts the model. Not its JSON, not its citations, not its
// claim that it followed the rules.

import { AiProviderError, type AiProvider, type AiRequest, type UntrustedBlock } from "./provider";
import { MockAiProvider } from "./providers/mock";
import { TASK_REGISTRY, abstentionSchema, type TaskKey } from "./registry";
import { validatePolicy, type PolicyContext, type PolicyViolation } from "./policy";
import { screenPassages, type QuarantinedPassage } from "./injection";
import { AnthropicProvider } from "./providers/anthropic";

/* ------------------------------------------------------------------ */
/* Provider selection                                                  */
/* ------------------------------------------------------------------ */

/**
 * The mock is the default and the shipped state.
 *
 * A real provider requires BOTH an explicit env selection and a credential in
 * the server environment, and the database flag `ai_enabled` on top of that.
 * Three switches, none of them defaulted on, because activating a production
 * model in a recruitment product is an owner decision rather than a deployment
 * accident.
 */
/**
 * Choose the engine.
 *
 * The deterministic engine is the default and stays the default. A real model
 * is reachable only when the provider is named explicitly AND a credential
 * exists in the SERVER environment AND a platform admin has enabled
 * ai_config.ai_enabled -- the third switch is checked by the server functions
 * before they call in here, because it lives in the database, which is the only
 * place a runtime toggle is auditable.
 *
 * Two behaviours worth stating, because they look like bugs and are not:
 *
 *   An UNRECOGNISED provider name falls back to the deterministic engine with a
 *   warning rather than failing. A typo in a deploy variable must not take
 *   interviews offline; the governed questions, probes and anchors work without
 *   any AI at all, which is the whole point of the pack being governed content.
 *
 *   A RECOGNISED provider with no credential THROWS. That is not a typo, it is
 *   an operator who believes production AI is running. Quietly serving mock
 *   output to someone who thinks they are evaluating a real model would corrupt
 *   every conclusion drawn from it.
 */
export function selectProvider(env: NodeJS.ProcessEnv = process.env): AiProvider {
  const configured = (env.INTERVIEW_AI_PROVIDER ?? "mock").toLowerCase();
  if (configured === "mock") return new MockAiProvider();

  if (configured === "anthropic") {
    const apiKey = env.ANTHROPIC_API_KEY ?? "";
    if (!apiKey) {
      throw new AiProviderError(
        'INTERVIEW_AI_PROVIDER is "anthropic" but ANTHROPIC_API_KEY is not set in the server environment. Refusing to fall back to the deterministic engine: an operator who has asked for production AI must not be silently served mock output.',
        "configuration",
      );
    }
    return new AnthropicProvider({
      apiKey,
      model: env.INTERVIEW_AI_MODEL ?? "claude-sonnet-5",
    });
  }

  console.warn(
    `[interview-ai] provider "${configured}" is not registered in this build; falling back to the deterministic engine.`,
  );
  return new MockAiProvider();
}

/* ------------------------------------------------------------------ */
/* Result                                                              */
/* ------------------------------------------------------------------ */

export type RunStatus =
  | "succeeded"
  | "abstained"
  | "schema_invalid"
  | "policy_rejected"
  | "citation_invalid"
  | "provider_error"
  | "timed_out";

export interface OrchestratorResult {
  readonly status: RunStatus;
  readonly output: unknown | null;
  readonly abstentionReason: string | null;
  readonly failureReason: string | null;
  readonly violations: readonly PolicyViolation[];
  readonly model: string;
  readonly usage: { inputTokens: number; outputTokens: number; costMicros: number };
  readonly latencyMs: number;
  readonly rawResponse: unknown;
  /**
   * Passages withheld from the provider because they carried text addressed to
   * the system rather than describing the candidate. Never empty and silent:
   * the caller writes these to the run and the screen shows them.
   */
  readonly quarantinedPassages: readonly QuarantinedPassage[];
}

export interface RunInput {
  readonly taskKey: TaskKey;
  readonly passages: readonly UntrustedBlock[];
  readonly governedContext: Readonly<Record<string, unknown>>;
  readonly allowedProbeIds?: readonly string[];
  /** code -> exact governed wording, for the "was a question rewritten" check. */
  readonly governedQuestions?: ReadonlyMap<string, string>;
  readonly provider?: AiProvider;
  readonly timeoutMs?: number;
}

/* ------------------------------------------------------------------ */

function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // Tolerate a fenced block, because that is a formatting habit rather than a
  // contract violation. Everything else must be JSON.
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const candidate = fenced ? fenced[1] : trimmed;
  return JSON.parse(candidate);
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AiProviderError(`timed out after ${ms}ms`, "timeout")), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Execute one governed AI task.
 *
 * Pure with respect to the database: it returns what happened, and the caller
 * (a server function) writes the run and the typed rows through the RPCs. That
 * split keeps this testable without a database and keeps every write governed.
 */
export async function runAiTask(input: RunInput): Promise<OrchestratorResult> {
  const task = TASK_REGISTRY[input.taskKey];
  const provider = input.provider ?? selectProvider();
  const timeoutMs = input.timeoutMs ?? 30_000;
  const started = Date.now();

  const empty = { inputTokens: 0, outputTokens: 0, costMicros: 0 };

  // Screen the untrusted material BEFORE anything else, so the quarantine list
  // is available on every exit path — including the ones that never reach a
  // provider. A recruiter who sees "the engine could not run" and a recruiter
  // who sees "the engine could not run, and by the way three paragraphs of this
  // CV were addressed to it" are looking at different situations.
  const screened = screenPassages(input.passages);
  const quarantinedPassages = screened.quarantined;

  // A task whose registry entry does not demand human review must not run. The
  // database says the same thing; agreeing in two places is the point.
  if (!task.requiresHumanReview) {
    return {
      status: "policy_rejected",
      output: null,
      abstentionReason: null,
      failureReason: `Task ${task.key} does not require human review; refusing to execute it.`,
      violations: [],
      model: provider.name,
      usage: empty,
      latencyMs: 0,
      rawResponse: null,
      quarantinedPassages,
    };
  }

  // Withhold anything the task is not allowed to see. Filtering here rather
  // than trusting the prompt means a CV simply never reaches a task that has no
  // business reading one.
  const permitted = screened.clean.filter((p) => task.allowedSourceKinds.includes(p.sourceKind));

  // If screening removed everything the task had to work with, the honest
  // result is abstention. Answering from an empty corpus would produce
  // confident text about a candidate from nothing at all, which is the worst
  // output this product could emit.
  if (permitted.length === 0 && quarantinedPassages.length > 0) {
    return {
      status: "abstained",
      output: null,
      abstentionReason:
        `Allt underlag för det här steget innehöll text riktad till systemet i stället för information om kandidaten ` +
        `(${quarantinedPassages.length} stycke(n) undanhölls). Läs källan själv och bedöm den manuellt.`,
      failureReason: null,
      violations: [],
      model: provider.name,
      usage: empty,
      latencyMs: 0,
      rawResponse: null,
      quarantinedPassages,
    };
  }

  const request: AiRequest = {
    system: task.system,
    instruction: task.instruction,
    untrustedBlocks: permitted,
    governedContext: input.governedContext,
    maxOutputTokens: 4000,
    timeoutMs,
    taskKey: task.key,
    promptVersion: task.promptVersion,
  };

  let raw: Awaited<ReturnType<AiProvider["complete"]>>;
  try {
    raw = await withTimeout(provider.complete(request), timeoutMs);
  } catch (error) {
    const kind = error instanceof AiProviderError ? error.kind : "transport";
    return {
      status: kind === "timeout" ? "timed_out" : "provider_error",
      output: null,
      abstentionReason: null,
      failureReason: error instanceof Error ? error.message : String(error),
      violations: [],
      model: provider.name,
      usage: empty,
      latencyMs: Date.now() - started,
      rawResponse: null,
      quarantinedPassages,
    };
  }

  const latencyMs = Date.now() - started;

  let parsed: unknown;
  try {
    parsed = extractJson(raw.text);
  } catch (error) {
    return {
      status: "schema_invalid",
      output: null,
      abstentionReason: null,
      failureReason: `The response was not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      violations: [],
      model: raw.model,
      usage: raw.usage,
      latencyMs,
      rawResponse: { text: raw.text.slice(0, 4000) },
      quarantinedPassages,
    };
  }

  // Abstention is checked BEFORE the task schema, because declining is a valid
  // outcome of every task and must not be reported as a schema failure.
  const abstention = abstentionSchema.safeParse(parsed);
  if (abstention.success) {
    return {
      status: "abstained",
      output: null,
      abstentionReason: abstention.data.reason,
      failureReason: null,
      violations: [],
      model: raw.model,
      usage: raw.usage,
      latencyMs,
      rawResponse: parsed,
      quarantinedPassages,
    };
  }

  const schema = task.outputSchema.safeParse(parsed);
  if (!schema.success) {
    return {
      status: "schema_invalid",
      output: null,
      abstentionReason: null,
      failureReason: schema.error.issues
        .slice(0, 6)
        .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
        .join("; "),
      violations: [],
      model: raw.model,
      usage: raw.usage,
      latencyMs,
      rawResponse: parsed,
      quarantinedPassages,
    };
  }

  const ctx: PolicyContext = {
    task,
    // A quarantined passage was never shown to the provider, so a citation
    // naming one is fabricated by definition.
    allowedPassageIds: new Set(permitted.map((p) => p.passageId)),
    allowedProbeIds: new Set(input.allowedProbeIds ?? []),
    governedQuestions: input.governedQuestions ?? new Map(),
  };

  const violations = validatePolicy(schema.data, ctx);

  if (violations.length > 0) {
    // Citation problems are reported as their own status, because they mean
    // something different from a policy breach: one is a grounding failure, the
    // other is the engine trying to do something forbidden.
    const citationOnly = violations.every(
      (v) => v.kind === "fabricated_citation" || v.kind === "missing_citation",
    );
    return {
      status: citationOnly ? "citation_invalid" : "policy_rejected",
      output: null,
      abstentionReason: null,
      failureReason: violations.map((v) => `${v.kind}: ${v.detail}`).join(" | "),
      violations,
      model: raw.model,
      usage: raw.usage,
      latencyMs,
      rawResponse: parsed,
      quarantinedPassages,
    };
  }

  return {
    status: "succeeded",
    output: schema.data,
    abstentionReason: null,
    failureReason: null,
    violations: [],
    model: raw.model,
    usage: raw.usage,
    latencyMs,
    rawResponse: parsed,
    quarantinedPassages,
  };
}
