// Launch (owner, 2026-10-04): version 1 has no generative AI. This proves the
// server gate in src/lib/ai/generative-ai-gate.ts actually closes every way an
// external AI provider could be reached, whatever the environment says.
//
// Run via `bun run generative-ai-gate:check`.
// Planted controls: `bun run negative-controls:generative-ai-gate`.
//
// Two kinds of proof, because either alone can pass for the wrong reason:
//
//   BEHAVIOUR  Every environment variable that could select a provider is set
//              (the interview provider is "anthropic" in a production
//              environment, with a SYNTHETIC key that opens nothing), and
//              `fetch` is replaced by a recorder. Each path that could reach a
//              provider is then called, and the recorder must have seen no
//              request. A positive control re-opens the gate in the lab and
//              shows that the SAME call does reach the recorder, so a recorder
//              that is simply never wired up cannot make this pass.
//
//   SOURCE     No file under src/ or supabase/functions/ may name an AI
//              provider's host or send a provider credential without going
//              through `externalAiFetch`, no AI SDK is a dependency, and the
//              lab seam is referenced from scripts/ only. A new call path
//              written next year fails here even if nobody remembers to test it.
//
// The recorded value is the transport, not the intention: a code path that
// changed its mind about the network after this was written still has to cross
// the recorder to be seen, and there is nothing to cross without the gate.

import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import {
  GENERATIVE_AI_DISABLED_CODE,
  GENERATIVE_AI_ENABLED,
  GenerativeAiDisabledError,
  __setGenerativeAiLabOverride,
  assertExternalAiAllowed,
  externalAiAllowed,
  externalAiFetch,
} from "../src/lib/ai/generative-ai-gate";
import { selectProvider } from "../src/lib/interview-intelligence/ai/orchestrator";
import { AnthropicProvider } from "../src/lib/interview-intelligence/ai/providers/anthropic";
import { AiProviderError, type AiRequest } from "../src/lib/interview-intelligence/ai/provider";
import { generateCvPresentation } from "../src/lib/professional-identity/cv/generation";
import { buildCvSourceBundle } from "../src/lib/professional-identity/cv/source-bundle";
import type { ProfessionalIdentityV1 } from "../src/lib/professional-identity/types";
import {
  dispatchSwAiOnce,
  resolveSwAiConfiguration,
  type SwAiActivation,
} from "../src/lib/security-work/processing/ai.server";
import {
  SW_AI_OUTPUT_VERSION,
  SW_AI_POLICY_VERSION,
  SW_AI_PROMPT_VERSION,
  SW_AI_TASK_VERSION,
  type AnalysisInput,
} from "../src/lib/security-work/processing/contracts";
import {
  loadConfiguration,
  workAiStatus,
} from "../src/lib/security-work/processing/ai-jobs.server";
import { createHash } from "node:crypto";

const root = process.cwd();
const fails: string[] = [];
let checks = 0;

function ck(label: string, cond: boolean, detail = ""): void {
  checks += 1;
  if (cond) console.log(`  ok   ${label}`);
  else {
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ""}`);
    fails.push(label);
  }
}

async function rejects(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (error) {
    return error;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* The recorder: every request that tries to leave, in order           */
/* ------------------------------------------------------------------ */

const seen: string[] = [];
const recorder = (async (input: Parameters<typeof fetch>[0]) => {
  seen.push(String(input));
  throw new Error("recorder: no request may leave in version 1");
}) as typeof fetch;
const realFetch = globalThis.fetch;
globalThis.fetch = recorder;

// A credential that opens nothing. Every provider is "configured" with it.
const SYNTHETIC_KEY = "sk-ant-synthetic-gate-check-000000000000000000000000";
const ENV = {
  NODE_ENV: "production",
  INTERVIEW_AI_PROVIDER: "anthropic",
  INTERVIEW_AI_ENVIRONMENT: "production",
  INTERVIEW_AI_MODEL: "claude-sonnet-5",
  ANTHROPIC_API_KEY: SYNTHETIC_KEY,
  SW_AI_ENABLED: "true",
  SW_AI_PROVIDER: "anthropic",
  SW_AI_MODEL: "claude-synthetic-pinned-20260101",
  SW_AI_ENVIRONMENT: "production",
  SW_ANTHROPIC_API_KEY: SYNTHETIC_KEY,
} as const;
// The CV path reads the process environment itself.
Object.assign(process.env, ENV);

const REQUEST: AiRequest = {
  system: "synthetic",
  instruction: "synthetic",
  untrustedBlocks: [{ passageId: "p1", sourceKind: "candidate_cv", text: "Väktare 2020-2025." }],
  maxOutputTokens: 200,
  timeoutMs: 1000,
  taskKey: "generative_ai_gate_check",
  promptVersion: "gate-check-v1",
};

console.log("generative-ai-gate-check\n");

/* ------------------------------------------------------------------ */
/* 1 · The gate itself                                                 */
/* ------------------------------------------------------------------ */

console.log("1 · the gate");
{
  ck("version 1 is a constant, and it is closed", GENERATIVE_AI_ENABLED === false);
  ck("externalAiAllowed() is false with nothing overriding it", externalAiAllowed() === false);

  let threw: unknown = null;
  try {
    assertExternalAiAllowed("check.site");
  } catch (error) {
    threw = error;
  }
  ck(
    "assertExternalAiAllowed names the site and the code",
    threw instanceof GenerativeAiDisabledError &&
      threw.code === GENERATIVE_AI_DISABLED_CODE &&
      threw.site === "check.site",
  );

  let called = 0;
  const spy = (async () => {
    called += 1;
    return new Response("{}");
  }) as typeof fetch;
  const error = await rejects(() =>
    externalAiFetch("check.fetch", spy, "https://api.anthropic.com/v1/messages", {
      method: "POST",
    }),
  );
  ck(
    "externalAiFetch refuses BEFORE the transport is called",
    error instanceof GenerativeAiDisabledError && called === 0,
    `called=${called}`,
  );
}

/* ------------------------------------------------------------------ */
/* 2 · Every path, with a provider configured and a synthetic key      */
/* ------------------------------------------------------------------ */

console.log("\n2 · every path, provider configured, no request");
{
  // Interview, recruitment and CV all choose their engine here.
  for (const environment of ["production", "synthetic_development", "internal_qa"]) {
    // A production build may not describe itself as a test environment, so the
    // non-production names are tried as a non-production build.
    const nodeEnv = environment === "production" ? "production" : "development";
    const error = await rejects(async () =>
      selectProvider({ ...ENV, NODE_ENV: nodeEnv, INTERVIEW_AI_ENVIRONMENT: environment }),
    );
    ck(
      `selectProvider("anthropic", ${environment}) is refused before the key is read`,
      error instanceof AiProviderError &&
        error.kind === "configuration" &&
        error.message.includes(GENERATIVE_AI_DISABLED_CODE),
      error instanceof Error ? error.message : String(error),
    );
  }
  ck(
    "refusing without a key gives the same answer (the gate is not the missing-key message)",
    (await rejects(async () => selectProvider({ ...ENV, ANTHROPIC_API_KEY: "" }))) instanceof
      AiProviderError &&
      String(
        ((await rejects(async () => selectProvider({ ...ENV, ANTHROPIC_API_KEY: "" }))) as Error)
          .message,
      ).includes(GENERATIVE_AI_DISABLED_CODE),
  );

  // The adapter, constructed by hand with the synthetic key and the global
  // transport (which is the recorder).
  const provider = new AnthropicProvider({ apiKey: SYNTHETIC_KEY, model: "claude-sonnet-5" });
  const completeError = await rejects(() => provider.complete(REQUEST));
  ck(
    "AnthropicProvider.complete is refused as a configuration error",
    completeError instanceof AiProviderError &&
      completeError.kind === "configuration" &&
      completeError.message.includes(GENERATIVE_AI_DISABLED_CODE),
    completeError instanceof Error ? completeError.message : String(completeError),
  );
  const verified = await provider.verifyModelAvailable();
  ck(
    "AnthropicProvider.verifyModelAvailable reports unavailable and sends nothing",
    verified.available === false && verified.detail.includes(GENERATIVE_AI_DISABLED_CODE),
    verified.detail,
  );

  // CV drafting: the path that used to be governed by two env vars alone.
  const bundle = buildCvSourceBundle({
    identity: identity(),
    locale: "sv",
    includeCareerInsight: false,
    targetJobText: null,
  });
  const cv = await generateCvPresentation(bundle);
  ck(
    "CV drafting returns provider_unavailable, no presentation, no engine reached",
    cv.status === "provider_unavailable" &&
      cv.presentation === null &&
      cv.providerMode === null &&
      (cv.failureReason ?? "").includes(GENERATIVE_AI_DISABLED_CODE),
    `${cv.status} ${cv.failureReason}`,
  );

  // Security work: the processing job and the assistant share one activation gate.
  const input = swInput();
  const swEnv = {
    SW_AI_ENABLED: "true",
    SW_AI_PROVIDER: "anthropic",
    SW_AI_MODEL: activation().model,
    SW_AI_ENVIRONMENT: "internal_qa",
    SW_ANTHROPIC_API_KEY: SYNTHETIC_KEY,
  };
  const configuration = resolveSwAiConfiguration(swEnv, activation());
  const dispatchError = await rejects(() => dispatchSwAiOnce(input, configuration));
  ck(
    "Security-work dispatch is refused before preflight and before any timer",
    (dispatchError as { code?: string } | null)?.code === "generative_ai_disabled",
    dispatchError instanceof Error ? dispatchError.message : String(dispatchError),
  );
  const noDatabase = {
    get supabase(): never {
      throw new Error("the database was touched before the gate refused");
    },
  } as never;
  const loadError = await rejects(() => loadConfiguration(noDatabase, "ws", swEnv));
  ck(
    "Security-work configuration (job and assistant) says AI_NOT_ENABLED before any database read",
    (loadError as { code?: string } | null)?.code === "AI_NOT_ENABLED",
    loadError instanceof Error ? loadError.message : String(loadError),
  );
  void workAiStatus;

  ck(
    "NOT ONE request reached the transport on any path",
    seen.length === 0,
    `${seen.length} request(s): ${seen.join(", ")}`,
  );
}

/* ------------------------------------------------------------------ */
/* 3 · Positive control: the recorder would have seen it               */
/* ------------------------------------------------------------------ */

console.log("\n3 · positive control: with the lab seam open the same calls DO reach the transport");
{
  __setGenerativeAiLabOverride(true);
  try {
    const before = seen.length;
    const provider = new AnthropicProvider({
      apiKey: SYNTHETIC_KEY,
      model: "claude-sonnet-5",
      fetchImpl: recorder,
    });
    await rejects(() => provider.complete(REQUEST));
    ck(
      "the interview adapter reaches the recorder when the gate is opened",
      seen.length > before && seen.some((url) => url.startsWith("https://api.anthropic.com/")),
      `${seen.length - before} request(s)`,
    );

    const swBefore = seen.length;
    const swEnv = {
      SW_AI_ENABLED: "true",
      SW_AI_PROVIDER: "anthropic",
      SW_AI_MODEL: activation().model,
      SW_AI_ENVIRONMENT: "internal_qa",
      SW_ANTHROPIC_API_KEY: SYNTHETIC_KEY,
    };
    await rejects(() =>
      dispatchSwAiOnce(swInput(), resolveSwAiConfiguration(swEnv, activation()), {
        fetchImpl: recorder,
      }),
    );
    ck(
      "Security-work dispatch reaches the recorder when the gate is opened",
      seen.length > swBefore,
      `${seen.length - swBefore} request(s)`,
    );

    const cvBefore = seen.length;
    // The CV path, through the selector: with the gate open and the key set,
    // the provider is chosen and the global transport is the recorder.
    const cvBundle = buildCvSourceBundle({
      identity: identity(),
      locale: "sv",
      includeCareerInsight: false,
      targetJobText: null,
    });
    await generateCvPresentation(cvBundle);
    ck(
      "CV drafting reaches the recorder when the gate is opened (so the closed result above is the gate's)",
      seen.length > cvBefore,
      `${seen.length - cvBefore} request(s)`,
    );
  } finally {
    __setGenerativeAiLabOverride(false);
  }
  ck("the lab seam closes again", externalAiAllowed() === false);
}

/* ------------------------------------------------------------------ */
/* 4 · Source: no way around the gate                                  */
/* ------------------------------------------------------------------ */

console.log("\n4 · source scan");
globalThis.fetch = realFetch;
{
  const files = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(path.join(root, dir))) {
      const rel = path.join(dir, entry);
      const full = path.join(root, rel);
      if (statSync(full).isDirectory()) {
        if (entry === "node_modules" || entry === ".git") continue;
        out.push(...files(rel));
      } else if (/\.(ts|tsx|js|mjs)$/.test(entry)) out.push(rel);
    }
    return out;
  };
  const src = files("src");
  const functions = files("supabase/functions");
  const scripts = files("scripts");
  const read = (rel: string) => readFileSync(path.join(root, rel), "utf8");
  const GATE = "src/lib/ai/generative-ai-gate.ts";

  // Hosts that would be an AI provider. Written as fragments so this file does
  // not match its own scan.
  const HOSTS = [
    ["api", "anthropic", "com"],
    ["api", "openai", "com"],
    ["generativelanguage", "googleapis", "com"],
    ["ai", "gateway", "lovable", "dev"],
    ["api", "mistral", "ai"],
    ["openrouter", "ai"],
    ["api", "cohere", "com"],
    ["api", "groq", "com"],
    ["api", "x", "ai"],
    ["api", "deepseek", "com"],
    ["api", "perplexity", "ai"],
    ["api", "together", "xyz"],
  ].map((parts) => parts.join("."));
  const hostRe = new RegExp(HOSTS.map((h) => h.replace(/\./g, "\\.")).join("|"));
  // The provider's own credential header. Another vendor's bearer token (the
  // mail service, the database) is not an AI credential and is not matched.
  const credentialRe = /x-api-key|anthropic-version/;
  const directFetch = /(?<![\w.$])(?:this\.)?(?:fetch|fetchImpl)\s*\(/;

  const appFiles = [...src, ...functions].filter((f) => f !== GATE);
  const provider = appFiles.filter((f) => hostRe.test(read(f)) || credentialRe.test(read(f)));

  ck(
    "the only files in src/ and supabase/functions that name a provider or send its credential are the known three",
    JSON.stringify([...provider].sort()) ===
      JSON.stringify(
        [
          "src/lib/interview-intelligence/ai/providers/anthropic.ts",
          "src/lib/security-work/processing/ai.server.ts",
          "src/lib/security-work/programme/assistant.server.ts",
        ].sort(),
      ),
    provider.join(", "),
  );
  for (const file of provider) {
    const text = read(file);
    ck(
      `${file}: sends through externalAiFetch and has no direct fetch call`,
      text.includes("externalAiFetch(") && !directFetch.test(text),
      directFetch.test(text) ? "a direct fetch( call is present" : "externalAiFetch( is missing",
    );
    // Every externalAiFetch call names its site, so a refusal says which path it was.
    const bare = [...text.matchAll(/externalAiFetch\(\s*([^,)]*)/g)].filter(
      (m) => !/^["'`][\w.-]+["'`]$/.test(m[1].trim()),
    );
    ck(`${file}: every externalAiFetch call names its site`, bare.length === 0);
  }
  ck(
    "no edge function names an AI provider",
    functions.every((f) => !hostRe.test(read(f)) && !credentialRe.test(read(f))),
  );

  // The gate reads nothing from outside the code.
  const gate = read(GATE);
  ck(
    "the gate is a literal false and reads no environment, no database and no request",
    /export const GENERATIVE_AI_ENABLED = false;/.test(gate) &&
      !/^\s*import\s/m.test(gate) &&
      !/process\.|Deno\.|import\.meta|globalThis|window|localStorage|cookie/.test(
        gate.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, ""),
      ),
  );

  // The lab seam is a script's tool, not an application's.
  const seam = [...src, ...functions].filter(
    (f) => f !== GATE && read(f).includes("__setGenerativeAiLabOverride"),
  );
  ck(
    "the lab seam is not referenced anywhere under src/ or supabase/functions",
    seam.length === 0,
    seam.join(", "),
  );
  const seamScripts = scripts.filter(
    (f) =>
      !f.startsWith("scripts/negative-controls/") &&
      read(f).includes("__setGenerativeAiLabOverride("),
  );
  ck(
    "scripts that open the seam say so in a lab comment",
    seamScripts.every(
      (f) => /Lab only/.test(read(f)) || f === "scripts/generative-ai-gate-check.ts",
    ),
    seamScripts.filter((f) => !/Lab only/.test(read(f))).join(", "),
  );

  // The adapter is built in one place.
  const constructors = appFiles.filter((f) => /new AnthropicProvider\(/.test(read(f)));
  ck(
    "AnthropicProvider is constructed only by the provider selector",
    JSON.stringify(constructors) ===
      JSON.stringify(["src/lib/interview-intelligence/ai/orchestrator.ts"]),
    constructors.join(", "),
  );
  const orchestrator = read("src/lib/interview-intelligence/ai/orchestrator.ts");
  ck(
    "the selector refuses before it reads the key",
    orchestrator.indexOf("externalAiAllowed()") > -1 &&
      orchestrator.indexOf("externalAiAllowed()") < orchestrator.indexOf("env.ANTHROPIC_API_KEY"),
  );
  const ai = read("src/lib/security-work/processing/ai.server.ts");
  ck(
    "Security-work dispatch checks the gate before it creates state or timers",
    ai.indexOf('SwAiError("generative_ai_disabled")') > -1 &&
      ai.indexOf('SwAiError("generative_ai_disabled")') < ai.indexOf("new AbortController()"),
  );
  const jobs = read("src/lib/security-work/processing/ai-jobs.server.ts");
  ck(
    "the Security-work status says not enabled when the gate is closed, before the environment is read",
    jobs.indexOf("if (!externalAiAllowed()) return") > -1 &&
      jobs.indexOf("if (!externalAiAllowed()) return") < jobs.indexOf("env.SW_AI_ENABLED"),
  );

  // No AI SDK in the product: a client library has its own transport and would
  // sit beside the gate instead of behind it.
  const pkg = JSON.parse(read("package.json")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const SDK =
    /^(?:@anthropic-ai\/|@ai-sdk\/|openai$|ai$|@google\/generative-ai|@google\/genai|langchain|@langchain\/|llamaindex|cohere-ai|@mistralai\/|groq-sdk|replicate|@huggingface\/inference|ollama)/;
  const sdks = deps.filter((d) => SDK.test(d));
  ck("no AI client library is a dependency", sdks.length === 0, sdks.join(", "));
  const importers = appFiles.filter((f) =>
    /from\s+["'](?:@anthropic-ai\/|@ai-sdk\/|openai["']|ai["']|@google\/generative-ai|langchain|@langchain\/)/.test(
      read(f),
    ),
  );
  ck("no source file imports an AI client library", importers.length === 0, importers.join(", "));
}

console.log("");
if (fails.length) {
  console.error(`generative-ai-gate: ${fails.length} failure(s) of ${checks} checks`);
  for (const f of fails) console.error(`  FAIL ${f}`);
  process.exit(1);
}
console.log(`generative-ai-gate: all ${checks} checks passed`);

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

function identity(): ProfessionalIdentityV1 {
  return {
    identityVersion: "professional-identity-v1",
    displayName: "Syntetisk Person",
    accountCountry: "SE",
    locale: "sv",
    currentStatus: "working_in_industry",
    currentProfessionSlug: "sakerhetschef",
    currentProfessionOther: null,
    currentProfessionTitleSv: "Säkerhetschef",
    currentProfessionTitleEn: "Head of Security",
    yearsOfExperience: "10+",
    hasPassport: true,
    headline: "Säkerhetschef",
    workCountry: "SE",
    workSubJurisdiction: null,
    employment: [
      {
        id: "e1",
        employerName: "Nordic Security AB",
        roleTitle: "Väktare",
        startedOn: "2019-06-01",
        endedOn: null,
        employmentType: "employed",
        jurisdictionCode: "SE",
        assertionLevel: "self_declared",
        verifierName: null,
        verificationMethod: null,
        verifiedOn: null,
      },
    ],
    claims: [
      {
        id: "c1",
        claimType: "certification",
        title: "Väktarutbildning VU1",
        issuerName: "Polismyndigheten",
        issuedOn: "2019-04-01",
        validUntil: null,
        skillLevel: null,
        assertionLevel: "self_declared",
        lifecycleState: "active",
        verifierName: null,
        verificationMethod: null,
        verifiedOn: null,
      },
    ],
    discovery: {
      hasCompletedReport: false,
      snapshotId: null,
      generatedAt: null,
      namesCareers: false,
    },
    workload: {
      applicationCount: 0,
      assessmentAssignmentCount: 0,
      releasedReportCount: 0,
      releasedReportAttemptId: null,
      assessmentAssignmentAttemptId: null,
      employerWorkspaceCount: 0,
    },
    unavailable: [],
  };
}

function activation(): SwAiActivation {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  return {
    id: id(3),
    workspaceId: id(4),
    provider: "anthropic",
    model: "claude-synthetic-pinned-20260101",
    environment: "internal_qa",
    purpose: "draft_analysis",
    taskVersion: SW_AI_TASK_VERSION,
    promptVersion: SW_AI_PROMPT_VERSION,
    policyVersion: SW_AI_POLICY_VERSION,
    outputSchemaVersion: SW_AI_OUTPUT_VERSION,
    dataProcessingApprovalId: "synthetic-local-approval",
    approvedAt: "2020-01-01T00:00:00Z",
    expiresAt: "2099-01-01T00:00:00Z",
    revokedAt: null,
    maxOutputTokens: 4096,
    timeoutMs: 1000,
  };
}

function swInput(): AnalysisInput {
  const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const text = "Synthetic source text for the gate check.";
  return {
    language: "sv",
    purpose: "draft_assessment",
    manifest: [
      {
        segmentId: id(1),
        sourceItemId: id(2),
        text,
        sha256: createHash("sha256").update(text).digest("hex"),
        locator: "page 1",
      },
    ],
    userInputs: [{ id: id(5), text: "Needs human review.", kind: "user_input" }],
    reportKind: null,
    calibration: null,
  };
}
