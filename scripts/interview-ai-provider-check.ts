// Proves the real model adapter behaves the way the governance document says
// it does — against a fake transport, with no credential and no network.
//
// The point is not that the adapter can talk to a provider. It is that the
// three properties which decide whether the product's AI numbers mean anything
// are enforced in code rather than described in a document:
//
//   * transport failures are retried, a bounded number of times;
//   * a returned-but-unusable answer is NEVER retried, because resampling until
//     the model says something acceptable manufactures quality;
//   * the same logical request always carries the same idempotency key, so a
//     retry after a lost response is one run, not two.

import {
  AnthropicProvider,
  idempotencyKey,
  TRANSPORT_RETRY_POLICY,
} from "../src/lib/interview-intelligence/ai/providers/anthropic";
import { AiProviderError, type AiRequest } from "../src/lib/interview-intelligence/ai/provider";
import { selectProvider } from "../src/lib/interview-intelligence/ai/orchestrator";
import { MockAiProvider } from "../src/lib/interview-intelligence/ai/providers/mock";

let checks = 0;
const failures: string[] = [];

function ok(cond: boolean, label: string): void {
  checks += 1;
  if (!cond) failures.push(label);
}

async function mustThrow(fn: () => Promise<unknown>, needle: string, label: string) {
  checks += 1;
  try {
    await fn();
    failures.push(`${label} — expected a throw, got none`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!msg.includes(needle)) failures.push(`${label} — expected "${needle}", got "${msg}"`);
  }
}

const REQUEST: AiRequest = {
  system: "Du är ett granskat stöd.",
  instruction: "Extrahera fakta.",
  untrustedBlocks: [
    { passageId: "p1", sourceKind: "candidate_cv", text: "Väktare 2020-2025." },
    { passageId: "p2", sourceKind: "candidate_cv", text: "VU1 och VU2." },
  ],
  governedContext: { questions: ["Q1"] },
  maxOutputTokens: 1000,
  timeoutMs: 5000,
  taskKey: "candidate_source_extraction",
  promptVersion: "1.0.0",
};

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

const GOOD_BODY = {
  content: [{ type: "text", text: '{"facts":[]}' }],
  model: "claude-sonnet-5",
  usage: { input_tokens: 100, output_tokens: 50 },
};

async function main(): Promise<void> {
  const noSleep = async () => {};

  /* ---- 1. Transport retry is bounded and actually happens --------------- */
  {
    let calls = 0;
    const provider = new AnthropicProvider({
      apiKey: "test-key-not-a-real-credential",
      model: "claude-sonnet-5",
      sleep: noSleep,
      fetchImpl: (async () => {
        calls += 1;
        if (calls < 3) throw new Error("ECONNRESET");
        return jsonResponse(GOOD_BODY);
      }) as unknown as typeof fetch,
    });

    const result = await provider.complete(REQUEST);
    ok(calls === 3, `1.1 a dropped connection is retried until it succeeds (calls=${calls})`);
    ok(result.text === '{"facts":[]}', "1.2 the recovered response is returned unchanged");
    ok(result.usage.costMicros > 0, "1.3 cost is recorded from the provider's own token counts");
  }

  {
    let calls = 0;
    const provider = new AnthropicProvider({
      apiKey: "test-key-not-a-real-credential",
      model: "claude-sonnet-5",
      sleep: noSleep,
      fetchImpl: (async () => {
        calls += 1;
        throw new Error("ECONNRESET");
      }) as unknown as typeof fetch,
    });

    await mustThrow(
      () => provider.complete(REQUEST),
      "unreachable after",
      "1.4 retries are BOUNDED — a permanently dead provider fails rather than looping",
    );
    ok(
      calls === TRANSPORT_RETRY_POLICY.maxAttempts,
      `1.5 exactly ${TRANSPORT_RETRY_POLICY.maxAttempts} attempts were made (calls=${calls})`,
    );
  }

  /* ---- 2. A 429 is transport; a 400 is not ------------------------------ */
  {
    let calls = 0;
    const provider = new AnthropicProvider({
      apiKey: "test-key-not-a-real-credential",
      model: "claude-sonnet-5",
      sleep: noSleep,
      fetchImpl: (async () => {
        calls += 1;
        return calls === 1
          ? jsonResponse({ error: "rate limited" }, 429, { "retry-after": "0" })
          : jsonResponse(GOOD_BODY);
      }) as unknown as typeof fetch,
    });
    await provider.complete(REQUEST);
    ok(calls === 2, "2.1 a 429 is retried, honouring Retry-After");
  }

  {
    let calls = 0;
    const provider = new AnthropicProvider({
      apiKey: "test-key-not-a-real-credential",
      model: "claude-sonnet-5",
      sleep: noSleep,
      fetchImpl: (async () => {
        calls += 1;
        return jsonResponse({ error: "bad request" }, 400);
      }) as unknown as typeof fetch,
    });
    await mustThrow(() => provider.complete(REQUEST), "400", "2.2 a 400 is not retried");
    ok(calls === 1, `2.3 a client error is attempted exactly once (calls=${calls})`);
  }

  /* ---- 3. NO SEMANTIC REROLL -------------------------------------------- */
  //
  // The single most important property in this file. A model that answers, and
  // whose answer is then rejected, must not be asked again. Otherwise every
  // safety metric measures "how many samples until it passed" rather than "does
  // it pass", and the evaluation stops meaning anything.
  {
    let calls = 0;
    const provider = new AnthropicProvider({
      apiKey: "test-key-not-a-real-credential",
      model: "claude-sonnet-5",
      sleep: noSleep,
      fetchImpl: (async () => {
        calls += 1;
        return jsonResponse({ content: [], model: "claude-sonnet-5", usage: {} });
      }) as unknown as typeof fetch,
    });
    await mustThrow(
      () => provider.complete(REQUEST),
      "no text content",
      "3.1 an empty answer is reported, not resampled",
    );
    ok(calls === 1, `3.2 a returned-but-unusable answer is NOT retried (calls=${calls})`);
  }

  ok(
    TRANSPORT_RETRY_POLICY.retriesSemanticRejection === false,
    "3.3 the declared policy says semantic rejections are never retried",
  );

  // And the orchestrator agrees: it has no retry loop at all. A schema or
  // policy rejection returns a status; nothing calls the provider twice.
  {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/lib/interview-intelligence/ai/orchestrator.ts", "utf8"),
    );
    const providerCalls = source.match(/provider\.complete\(/g) ?? [];
    ok(
      providerCalls.length === 1,
      `3.4 the orchestrator calls the provider exactly once per run (found ${providerCalls.length})`,
    );
    ok(
      !/for\s*\(.*attempt|while\s*\(.*retry|retryCount/i.test(source),
      "3.5 the orchestrator contains no retry loop of its own",
    );
  }

  /* ---- 4. Idempotency ---------------------------------------------------- */
  {
    const a = idempotencyKey(REQUEST);
    const b = idempotencyKey({ ...REQUEST, timeoutMs: 99_999, maxOutputTokens: 42 });
    ok(a === b, "4.1 the key is stable across a retry of the same logical request");

    const c = idempotencyKey({
      ...REQUEST,
      untrustedBlocks: [{ passageId: "p1", sourceKind: "candidate_cv", text: "Något helt annat." }],
    });
    ok(a !== c, "4.2 different source material is a different request");

    const d = idempotencyKey({ ...REQUEST, promptVersion: "2.0.0" });
    ok(a !== d, "4.3 a new prompt version is a different request");

    let seen: string | null = null;
    const provider = new AnthropicProvider({
      apiKey: "test-key-not-a-real-credential",
      model: "claude-sonnet-5",
      sleep: noSleep,
      fetchImpl: (async (_url: string, init: RequestInit) => {
        seen = (init.headers as Record<string, string>)["idempotency-key"];
        return jsonResponse(GOOD_BODY);
      }) as unknown as typeof fetch,
    });
    await provider.complete(REQUEST);
    ok(seen === a, "4.4 the key is actually sent on the wire");
  }

  /* ---- 5. The credential cannot reach a browser ------------------------- */
  {
    await mustThrow(
      async () => new AnthropicProvider({ apiKey: "", model: "claude-sonnet-5" }),
      "No provider credential is configured",
      "5.1 the adapter refuses to exist without a credential",
    );

    const globalRef = globalThis as { window?: unknown };
    const had = "window" in globalRef;
    globalRef.window = {};
    try {
      await mustThrow(
        async () => new AnthropicProvider({ apiKey: "test-key", model: "claude-sonnet-5" }),
        "server-side only",
        "5.2 the adapter refuses to be constructed in a browser context",
      );
    } finally {
      if (!had) delete globalRef.window;
    }

    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/lib/interview-intelligence/ai/providers/anthropic.ts", "utf8"),
    );
    ok(
      !/VITE_[A-Z_]*(?:API_KEY|ANTHROPIC|OPENAI)/.test(source),
      "5.3 no VITE_-prefixed credential name appears — those get inlined into the bundle",
    );
    ok(
      !/import\.meta\.env/.test(source),
      "5.4 the adapter does not read import.meta.env, which is client-visible",
    );
  }

  /* ---- 6. Selection fails closed in every direction ---------------------- */
  //
  // The old behaviour: unset defaulted to the deterministic engine, and an
  // unrecognised name fell back to it with a console warning. The reasoning was
  // that a typo should not take interviews offline. It does not — the governed
  // pack works with no AI at all — and what the fallback actually bought was a
  // deployment that believed it was running a model while running a rule-based
  // stand-in, in front of real candidates. These tests exist so that cannot
  // come back.

  const LAB = { INTERVIEW_AI_ENVIRONMENT: "synthetic_development" };

  function selecting(env: Record<string, string>) {
    return () => Promise.resolve(selectProvider(env as NodeJS.ProcessEnv));
  }

  await mustThrow(
    selecting({ ...LAB }),
    "INTERVIEW_AI_PROVIDER is not set",
    "6.1 an unset provider is refused — there is no default engine",
  );

  await mustThrow(
    selecting({ ...LAB, INTERVIEW_AI_PROVIDER: "detrministic" }),
    "not a registered adapter",
    "6.2 A TYPO CANNOT PRODUCE SYNTHETIC OUTPUT — it is refused, not fallen back from",
  );

  await mustThrow(
    selecting({ ...LAB, INTERVIEW_AI_PROVIDER: "anthropc" }),
    "not a registered adapter",
    "6.3 a near-miss on a real adapter name is refused too",
  );

  await mustThrow(
    selecting({ ...LAB, INTERVIEW_AI_PROVIDER: "mock" }),
    'The value is now "deterministic"',
    "6.4 the old spelling gets a precise instruction, not a silent success",
  );

  await mustThrow(
    selecting({ INTERVIEW_AI_PROVIDER: "deterministic" }),
    "not permitted in environment",
    "6.5 the deterministic engine is refused when the environment is unstated — unstated means production",
  );

  await mustThrow(
    selecting({ INTERVIEW_AI_PROVIDER: "deterministic", INTERVIEW_AI_ENVIRONMENT: "production" }),
    "not permitted in environment",
    "6.6 and refused outright in production",
  );

  await mustThrow(
    selecting({
      INTERVIEW_AI_PROVIDER: "deterministic",
      INTERVIEW_AI_ENVIRONMENT: "synthetic_development",
      NODE_ENV: "production",
    }),
    "does not get to describe itself",
    "6.7 a production build cannot claim to be a lab",
  );

  await mustThrow(
    selecting({ ...LAB, INTERVIEW_AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "" }),
    "Refusing to fall back",
    "6.8 a recognised provider with no credential is refused, not downgraded",
  );

  await mustThrow(
    selecting({ INTERVIEW_AI_PROVIDER: "deterministic", INTERVIEW_AI_ENVIRONMENT: "lab" }),
    "not a recognised environment",
    "6.9 an unrecognised environment name is refused rather than assumed",
  );

  // The three environments where a test instrument is legitimate.
  for (const environment of ["automated_test", "synthetic_development", "internal_qa"]) {
    const selected = selectProvider({
      INTERVIEW_AI_PROVIDER: "deterministic",
      INTERVIEW_AI_ENVIRONMENT: environment,
    } as NodeJS.ProcessEnv);
    ok(
      selected.provider instanceof MockAiProvider && selected.mode === "synthetic",
      `6.10 the deterministic engine IS available in ${environment}, labelled synthetic`,
    );
  }

  // A model outside production is a development model; inside, a production one.
  {
    const dev = selectProvider({
      INTERVIEW_AI_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "test-key-not-a-real-credential",
      INTERVIEW_AI_ENVIRONMENT: "internal_qa",
    } as NodeJS.ProcessEnv);
    ok(dev.mode === "development_model", "6.11 a model outside production is a development_model");

    const prod = selectProvider({
      INTERVIEW_AI_PROVIDER: "anthropic",
      ANTHROPIC_API_KEY: "test-key-not-a-real-credential",
      INTERVIEW_AI_ENVIRONMENT: "production",
    } as NodeJS.ProcessEnv);
    ok(prod.mode === "production_model", "6.12 and inside production it is a production_model");
  }

  ok(
    !process.env.ANTHROPIC_API_KEY && !process.env.OPENAI_API_KEY,
    "6.13 no provider credential exists in this environment — production AI is NOT active",
  );

  /* ---- 7. The mode reaches the record, not just the log ------------------ */
  {
    const runtime = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/lib/interview-intelligence/runtime.functions.ts", "utf8"),
    );
    ok(
      !/_provider:\s*"mock"/.test(runtime),
      "7.1 the run row no longer names its provider from a hardcoded literal",
    );
    ok(
      /_provider_mode:\s*result\.providerMode/.test(runtime),
      "7.2 the settled run records the mode the orchestrator actually used",
    );
    // Per call site, on code with comments stripped. Comparing raw indexOf over
    // the whole file matched the sentence in a doc comment that explains this
    // very rule -- the third time a guard in this repo has flagged its own
    // explanation, which is a good argument for never grepping prose.
    const runtimeCode = runtime.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/[^\n]*/gm, " ");
    const starts = [...runtimeCode.matchAll(/scp_iv_ai_run_start/g)].map((m) => m.index ?? -1);
    const chooses = [...runtimeCode.matchAll(/chooseEngine\(\)/g)].map((m) => m.index ?? -1);
    ok(
      starts.length > 0 && chooses.length > 0,
      "7.3a both the engine choice and the run start exist",
    );
    ok(
      starts.every((startAt) => chooses.some((chooseAt) => chooseAt < startAt)),
      "7.3 every run row is preceded by an engine choice, so a misconfiguration leaves no orphan",
    );

    const ui = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/components/employer/interview/InterviewUi.tsx", "utf8"),
    );
    for (const mode of ["synthetic", "development_model", "production_model"]) {
      ok(ui.includes(`"${mode}"`), `7.4 the UI distinguishes ${mode}`);
    }
    ok(
      ui.includes("testmotor"),
      "7.5 synthetic output is named as a test engine in the recruiter's own language",
    );
  }

  /* ---------------------------------------------------------------- */
  console.log("");
  console.log("Real model adapter — governance properties");
  console.log(`  checks run:                 ${checks}`);
  console.log(`  transport attempts:         ${TRANSPORT_RETRY_POLICY.maxAttempts} (bounded)`);
  console.log(`  semantic reroll:            never`);
  console.log(`  credential present:         no — adapter is registered but not activated`);
  console.log("");

  if (failures.length > 0) {
    console.error(`interview-ai-provider-check FAILED (${failures.length}):`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log("interview-ai-provider-check passed");
}

void main();
