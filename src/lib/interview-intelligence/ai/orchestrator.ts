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
 * How the engine that produced a run should be described to a human.
 *
 * This is provenance, not configuration. A recruiter reading a preparation
 * brief needs to know whether it came from a rule-based stand-in or a language
 * model, and an auditor reading a run six months later needs the same thing —
 * so it is written to the run row and shown on screen, never inferred from an
 * environment variable nobody kept.
 */
export type ProviderMode = "synthetic" | "development_model" | "production_model";

/**
 * Where this deployment is running, as an explicit statement rather than a
 * guess.
 *
 * The deterministic engine is a TEST INSTRUMENT. It produces plausible,
 * well-formed, entirely rule-based output, which is exactly what makes it
 * dangerous outside a lab: a recruiter cannot tell it apart from a model by
 * looking, and neither can an evaluation. So the environments that may use it
 * are named, and everything else is refused.
 */
export type AiEnvironment =
  | "automated_test"
  | "synthetic_development"
  | "internal_qa"
  | "production";

const DETERMINISTIC_PERMITTED: readonly AiEnvironment[] = [
  "automated_test",
  "synthetic_development",
  "internal_qa",
];

const KNOWN_ENVIRONMENTS: readonly AiEnvironment[] = [...DETERMINISTIC_PERMITTED, "production"];

export interface SelectedProvider {
  readonly provider: AiProvider;
  readonly mode: ProviderMode;
  readonly environment: AiEnvironment;
}

/**
 * Choose the engine, failing closed in every direction.
 *
 * The previous version defaulted to the deterministic engine when
 * INTERVIEW_AI_PROVIDER was unset, and fell back to it with a console warning
 * when the value was unrecognised. The reasoning was that a typo in a deploy
 * variable should not take interviews offline. That reasoning is wrong, and the
 * integrity review was right to call it unsafe.
 *
 * A typo does not take interviews offline either way: the governed pack —
 * questions, probes, anchors, prohibitions — works with no AI at all, and the
 * product is built so a recruiter can run the whole interview without it. What
 * the fallback actually did was let a deployment believe it was running a model
 * while it was running a rule-based stand-in, and produce preparation briefs and
 * evidence proposals that looked real. A silent downgrade to synthetic output
 * in front of a real candidate is not a smaller failure than an outage. It is a
 * larger one, because nobody finds out.
 *
 * So: every value is stated explicitly, and anything unstated, unrecognised or
 * unsupported raises. The four rules, each with the failure it prevents:
 *
 *   1. INTERVIEW_AI_PROVIDER unset      -> refuse. Nobody decided.
 *   2. Unrecognised provider name       -> refuse. A typo must not resolve.
 *   3. Recognised provider, no key      -> refuse. An operator believes a model
 *                                          is running.
 *   4. Deterministic outside a lab      -> refuse. Synthetic output must never
 *                                          reach a real candidate's assessment.
 */
export function selectProvider(env: NodeJS.ProcessEnv = process.env): SelectedProvider {
  const environment = readEnvironment(env);
  const configured = (env.INTERVIEW_AI_PROVIDER ?? "").trim().toLowerCase();

  if (configured === "") {
    throw new AiProviderError(
      'INTERVIEW_AI_PROVIDER is not set. There is no default: the deterministic engine must be chosen deliberately ("deterministic") and a model must be named. Refusing to pick one.',
      "configuration",
    );
  }

  if (configured === "deterministic") {
    if (!DETERMINISTIC_PERMITTED.includes(environment)) {
      throw new AiProviderError(
        `The deterministic engine is a test instrument and is not permitted in environment "${environment}". It produces well-formed synthetic output that a recruiter cannot distinguish from a model's, so it is confined to ${DETERMINISTIC_PERMITTED.join(", ")}.`,
        "configuration",
      );
    }
    return { provider: new MockAiProvider(), mode: "synthetic", environment };
  }

  // The old spelling. Kept recognised so an existing deployment gets a precise
  // instruction instead of the generic "unknown provider" message.
  if (configured === "mock") {
    throw new AiProviderError(
      'INTERVIEW_AI_PROVIDER is "mock". The value is now "deterministic", and it is permitted only in automated_test, synthetic_development or internal_qa. Set INTERVIEW_AI_ENVIRONMENT as well.',
      "configuration",
    );
  }

  if (configured === "anthropic") {
    const apiKey = env.ANTHROPIC_API_KEY ?? "";
    if (!apiKey) {
      throw new AiProviderError(
        'INTERVIEW_AI_PROVIDER is "anthropic" but ANTHROPIC_API_KEY is not set in the server environment. Refusing to fall back to the deterministic engine: an operator who has asked for a model must not be silently served synthetic output.',
        "configuration",
      );
    }
    return {
      provider: new AnthropicProvider({
        apiKey,
        model: env.INTERVIEW_AI_MODEL ?? "claude-sonnet-5",
      }),
      mode: environment === "production" ? "production_model" : "development_model",
      environment,
    };
  }

  throw new AiProviderError(
    `INTERVIEW_AI_PROVIDER is "${configured}", which is not a registered adapter. Refusing to fall back to the deterministic engine: a typo must not quietly produce synthetic output. Registered values: deterministic, anthropic.`,
    "configuration",
  );
}

function readEnvironment(env: NodeJS.ProcessEnv): AiEnvironment {
  const raw = (env.INTERVIEW_AI_ENVIRONMENT ?? "").trim().toLowerCase();

  if (raw === "") {
    // Unstated means production. The safe default is the one that refuses the
    // test instrument, not the one that permits it.
    return "production";
  }
  if (!KNOWN_ENVIRONMENTS.includes(raw as AiEnvironment)) {
    throw new AiProviderError(
      `INTERVIEW_AI_ENVIRONMENT is "${raw}", which is not a recognised environment. Expected one of: ${KNOWN_ENVIRONMENTS.join(", ")}.`,
      "configuration",
    );
  }
  const declared = raw as AiEnvironment;

  // A production build claiming to be a lab is the one combination that would
  // let synthetic output reach a real candidate through a deploy-time mistake.
  if (declared !== "production" && env.NODE_ENV === "production") {
    throw new AiProviderError(
      `INTERVIEW_AI_ENVIRONMENT claims "${declared}" while NODE_ENV is "production". A production build does not get to describe itself as a test environment.`,
      "configuration",
    );
  }
  return declared;
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
  /**
   * The EXACT model identifier, never the provider name. On a path that never
   * reached the provider this is the configured intent; where the provider
   * answered it is what the provider reported.
   */
  readonly model: string;
  /**
   * What the PROVIDER itself reported, or null when the run never reached one.
   * Settlement prefers this over the start-time intent and marks the stored id
   * provider-confirmed, so a shadow evaluation can count only runs whose model
   * is known rather than assumed.
   */
  readonly resolvedModel: string | null;
  readonly usage: { inputTokens: number; outputTokens: number; costMicros: number };
  readonly latencyMs: number;
  readonly rawResponse: unknown;
  /**
   * Passages withheld from the provider because they carried text addressed to
   * the system rather than describing the candidate. Never empty and silent:
   * the caller writes these to the run and the screen shows them.
   */
  readonly quarantinedPassages: readonly QuarantinedPassage[];
  /**
   * Which kind of engine produced this. Written to the run row and shown on
   * screen, so "was this a model or a stand-in" is answered by the record
   * rather than by whoever remembers the deploy configuration.
   */
  readonly providerMode: ProviderMode;
}

export interface RunInput {
  readonly taskKey: TaskKey;
  readonly passages: readonly UntrustedBlock[];
  readonly governedContext: Readonly<Record<string, unknown>>;
  readonly allowedProbeIds?: readonly string[];
  /** code -> exact governed wording, for the "was a question rewritten" check. */
  readonly governedQuestions?: ReadonlyMap<string, string>;
  readonly provider?: AiProvider;
  /**
   * Required when `provider` is injected. A caller that supplies its own engine
   * also has to say what kind it is; defaulting would let a test harness or a
   * future adapter record a model run as synthetic, or worse the reverse.
   */
  readonly providerMode?: ProviderMode;
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

  // An injected provider must declare its own mode; otherwise selection decides
  // both together, so the engine and the label describing it can never drift.
  let provider: AiProvider;
  let providerMode: ProviderMode;
  if (input.provider) {
    provider = input.provider;
    providerMode = input.providerMode ?? "synthetic";
  } else {
    const selected = selectProvider();
    provider = selected.provider;
    providerMode = selected.mode;
  }
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
      model: provider.modelId,
      resolvedModel: null,
      usage: empty,
      latencyMs: 0,
      rawResponse: null,
      quarantinedPassages,
      providerMode,
    };
  }

  // Withhold anything the task is not allowed to see. Filtering here rather
  // than trusting the prompt means a CV simply never reaches a task that has no
  // business reading one.
  // Two different filters, and keeping them apart matters. The source-kind
  // filter says what this task is ALLOWED to read; the screen says what was
  // SAFE to send. Only the second is a reason to abstain.
  const eligible = input.passages.filter((p) => task.allowedSourceKinds.includes(p.sourceKind));
  const permitted = screened.clean.filter((p) => task.allowedSourceKinds.includes(p.sourceKind));

  // Abstain only when this task had material and screening took all of it.
  //
  // A task that legitimately reads no passages at all -- evidence extraction
  // works from interview notes in the governed context, not from source
  // documents -- has an empty eligible set by design, and must not be stopped
  // by a withholding that happened somewhere it was never going to look. The
  // first version of this check conflated the two and aborted evidence
  // extraction while blaming the injection for it, which is both a broken step
  // and a false explanation.
  if (eligible.length > 0 && permitted.length === 0) {
    return {
      status: "abstained",
      output: null,
      abstentionReason:
        `Allt underlag för det här steget innehöll text riktad till systemet i stället för information om kandidaten ` +
        `(${quarantinedPassages.length} stycke(n) undanhölls). Läs källan själv och bedöm den manuellt.`,
      failureReason: null,
      violations: [],
      model: provider.modelId,
      resolvedModel: null,
      usage: empty,
      latencyMs: 0,
      rawResponse: null,
      quarantinedPassages,
      providerMode,
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
      model: provider.modelId,
      resolvedModel: null,
      usage: empty,
      latencyMs: Date.now() - started,
      rawResponse: null,
      quarantinedPassages,
      providerMode,
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
      resolvedModel: raw.model,
      usage: raw.usage,
      latencyMs,
      rawResponse: { text: raw.text.slice(0, 4000) },
      quarantinedPassages,
      providerMode,
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
      resolvedModel: raw.model,
      usage: raw.usage,
      latencyMs,
      rawResponse: parsed,
      quarantinedPassages,
      providerMode,
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
      resolvedModel: raw.model,
      usage: raw.usage,
      latencyMs,
      rawResponse: parsed,
      quarantinedPassages,
      providerMode,
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
      resolvedModel: raw.model,
      usage: raw.usage,
      latencyMs,
      rawResponse: parsed,
      quarantinedPassages,
      providerMode,
    };
  }

  return {
    status: "succeeded",
    output: schema.data,
    abstentionReason: null,
    failureReason: null,
    violations: [],
    model: raw.model,
    resolvedModel: raw.model,
    usage: raw.usage,
    latencyMs,
    rawResponse: parsed,
    quarantinedPassages,
    providerMode,
  };
}
