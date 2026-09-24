/** Opt-in synthetic-only adapter evaluation. No product keys, DB access or activation writes. */
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { resolve, relative, dirname } from "node:path";
import { homedir, tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import {
  activationSchema,
  analysisInputHash,
  buildAnalysisRequest,
  dispatchSwAiOnce,
  type DispatchResult,
} from "../src/lib/security-work/processing/ai.server";
import {
  SW_AI_TASK_VERSION,
  SW_AI_PROMPT_VERSION,
  SW_AI_POLICY_VERSION,
  SW_AI_OUTPUT_VERSION,
} from "../src/lib/security-work/processing/contracts";
import {
  QUALITY_DATASET_VERSION,
  QUALITY_MODEL,
  qualityCases,
  qualityDatasetHash,
  qualityInput,
} from "./fixtures/security-work-ai-quality-fixtures";
import {
  humanQualityDecision,
  humanQualityReviewSchema,
  inspectQuality,
  reviewTemplate,
} from "./security-work-ai-quality-harness";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");
function plannedCases(model: string, maxOutputTokens: number) {
  return qualityCases.flatMap((c) =>
    (["sv", "en"] as const).map((language) => {
      const input = qualityInput(c, language);
      const requestBytes = Buffer.byteLength(
        JSON.stringify(buildAnalysisRequest(input, model, maxOutputTokens)),
      );
      // Deliberately pessimistic byte-per-token bound plus framing allowance.
      // Fixed standard prices are USD 2/input and USD 10/output per million.
      return {
        c,
        language,
        input,
        reservedMicros: (requestBytes + 2048) * 2 + maxOutputTokens * 10,
      };
    }),
  );
}
const approvalSchema = z
  .object({
    status: z.literal("approved"),
    authorizeNetwork: z.literal(true),
    syntheticOnly: z.literal(true),
    approvalId: z.string().uuid(),
    approvedBy: z.string().trim().min(3).max(200),
    ledgerDirectory: z.string().startsWith("/").max(1000),
    approvalReference: z.string().trim().min(3).max(2000),
    datasetHash: z.string().regex(/^[a-f0-9]{64}$/),
    providerDataMode: z.literal("commercial-api-standard-retention-global-inference-us-storage"),
    budgetMicros: z.number().int().positive().max(5_000_000),
    conservativeReservationMicros: z.number().int().positive(),
    inputPricePerMillion: z.literal(2),
    outputPricePerMillion: z.literal(10),
    activation: activationSchema.extend({
      model: z.literal(QUALITY_MODEL),
      environment: z.literal("internal_qa"),
    }),
  })
  .strict();

export function qualityRunPlan() {
  return {
    status: "approval_required",
    authorizeNetwork: false,
    syntheticOnly: true,
    approvalId: "OWNER_SET_UUID",
    approvedBy: "OWNER_SET_REVIEWER",
    approvalReference: "OWNER_SET_DECISION_REFERENCE",
    ledgerDirectory: resolve(
      homedir(),
      ".local/state/cqrityjob/security-work-quality/OWNER_APPROVAL_ID",
    ),
    datasetHash: qualityDatasetHash(),
    providerDataMode: "commercial-api-standard-retention-global-inference-us-storage",
    budgetMicros: 3_000_000,
    conservativeReservationMicros: plannedCases(QUALITY_MODEL, 8192).reduce(
      (sum, entry) => sum + entry.reservedMicros,
      0,
    ),
    inputPricePerMillion: 2,
    outputPricePerMillion: 10,
    activation: {
      id: "OWNER_SET_UUID",
      workspaceId: "OWNER_SET_QA_SCOPE_UUID",
      provider: "anthropic",
      model: QUALITY_MODEL,
      environment: "internal_qa",
      purpose: "draft_analysis",
      taskVersion: SW_AI_TASK_VERSION,
      promptVersion: SW_AI_PROMPT_VERSION,
      policyVersion: SW_AI_POLICY_VERSION,
      outputSchemaVersion: SW_AI_OUTPUT_VERSION,
      dataProcessingApprovalId: "OWNER_SET_DECISION_REFERENCE",
      approvedAt: "OWNER_SET_ISO_TIMESTAMP",
      expiresAt: "OWNER_SET_ISO_TIMESTAMP",
      revokedAt: null,
      maxOutputTokens: 8192,
      timeoutMs: 60_000,
    },
  };
}

export function validateQualityApproval(
  value: unknown,
  env: Readonly<Record<string, string | undefined>>,
) {
  if (env.SW_AI_QUALITY_LIVE !== "APPROVED_SYNTHETIC_ONLY")
    throw new Error("Explicit synthetic live opt-in is required");
  const approval = approvalSchema.parse(value);
  if (approval.datasetHash !== qualityDatasetHash())
    throw new Error("Approval is for a different dataset");
  if (
    approval.conservativeReservationMicros !==
    plannedCases(approval.activation.model, approval.activation.maxOutputTokens).reduce(
      (sum, entry) => sum + entry.reservedMicros,
      0,
    )
  )
    throw new Error("Approval reservation does not match the exact request configuration");
  if (
    Date.parse(approval.activation.approvedAt) > Date.now() ||
    Date.parse(approval.activation.expiresAt) <= Date.now() ||
    Date.parse(approval.activation.expiresAt) - Date.parse(approval.activation.approvedAt) >
      7 * 86400_000
  )
    throw new Error("A current, at most seven-day approval is required");
  if (!env.SW_AI_QUALITY_API_KEY?.trim())
    throw new Error("Separate Security Work quality key is required");
  return approval;
}

/** Records human attestations; it neither creates nor authenticates professional judgement. */
export function reviewSavedQuality(savedValue: unknown, reviewsValue: unknown) {
  const saved = z
    .object({
      datasetHash: z.literal(qualityDatasetHash()),
      model: z.literal(QUALITY_MODEL),
      execution: z.enum(["live_provider", "mock_transport"]),
      completedAt: z.string().datetime({ offset: true }),
      results: z
        .array(
          z.object({
            caseId: z.string(),
            language: z.enum(["sv", "en"]),
            execution: z.enum(["live_provider", "mock_transport"]),
            outputHash: z.string().regex(/^[a-f0-9]{64}$/),
            result: z.object({ status: z.literal("succeeded"), output: z.unknown() }),
          }),
        )
        .length(12),
    })
    .parse(savedValue);
  const reviews = z
    .array(
      z
        .object({
          caseId: z.string(),
          language: z.enum(["sv", "en"]),
          review: humanQualityReviewSchema,
        })
        .strict(),
    )
    .length(12)
    .parse(reviewsValue);
  const expected = new Set(
    qualityCases.flatMap((c) => ["sv", "en"].map((language) => `${c.id}:${language}`)),
  );
  for (const rows of [saved.results, reviews]) {
    const keys = rows.map((row) => `${row.caseId}:${row.language}`);
    if (new Set(keys).size !== 12 || keys.some((key) => !expected.has(key)))
      throw new Error("All twelve distinct case/language results and reviews are required");
  }
  const decisions = saved.results.map((record) => {
    if (record.execution !== saved.execution)
      throw new Error("Saved execution type does not match its case records");
    const c = qualityCases.find((c) => c.id === record.caseId)!;
    const review = reviews.find(
      (r) => r.caseId === record.caseId && r.language === record.language,
    )!.review;
    if (
      Date.parse(review.reviewedAt) < Date.parse(saved.completedAt) ||
      Date.parse(review.reviewedAt) > Date.now() + 60_000
    )
      throw new Error("Review time must follow generation and must not be in the future");
    if (record.outputHash !== hash(JSON.stringify(record.result.output)))
      throw new Error("Saved output hash does not match its content");
    const automatic = inspectQuality(c, qualityInput(c, record.language), record.result.output);
    const human = humanQualityDecision(review, record.result.output);
    return {
      caseId: c.id,
      language: record.language,
      passed: automatic.automatedChecksPass && human.passed,
      automatic,
      humanReview: human.review,
    };
  });
  return {
    evidence: "recorded_human_attestations",
    execution: saved.execution,
    modelQuality:
      saved.execution === "live_provider" && decisions.every((d) => d.passed)
        ? "human_assessed_pass"
        : "unverified_model_quality",
    notice:
      "This tool did not produce or authenticate the human professional reviews. The owner must accept them separately; no application report is approved.",
    decisions,
  };
}

function assertDurableLedgerPath(directory: string) {
  const path = resolve(directory);
  const temporaryRoots = [
    tmpdir(),
    "/tmp",
    "/private/tmp",
    "/var/tmp",
    "/private/var/tmp",
    "/var/folders",
    "/private/var/folders",
    "/run",
    "/var/run",
    "/dev/shm",
  ];
  if (temporaryRoots.some((root) => path === resolve(root) || path.startsWith(`${resolve(root)}/`)))
    throw new Error(
      "Live quality ledger must use durable private storage outside temporary directories",
    );
}

/** Reserves all planned spend before the first call; claims survive crashes and reloads. */
export async function runLiveQuality(
  value: unknown,
  directory: string,
  env: Readonly<Record<string, string | undefined>>,
  fetchImpl?: typeof fetch,
) {
  const approval = validateQualityApproval(value, env);
  const execution = fetchImpl ? "mock_transport" : "live_provider";
  const repository = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  if (!fetchImpl) assertDurableLedgerPath(directory);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (lstatSync(directory).isSymbolicLink())
    throw new Error("Quality ledger must be a private directory, not a symbolic link");
  const outputDirectory = realpathSync(directory);
  if (!fetchImpl) assertDurableLedgerPath(outputDirectory);
  const permissions = statSync(outputDirectory);
  if (
    (permissions.mode & 0o777) !== 0o700 ||
    (process.getuid && permissions.uid !== process.getuid())
  )
    throw new Error("Quality ledger must be owned by the current user with mode 0700");
  if (outputDirectory !== resolve(approval.ledgerDirectory))
    throw new Error("Output directory must match the explicitly approved durable ledger");
  const fromRepo = relative(repository, outputDirectory);
  if (!fromRepo.startsWith("../") && fromRepo !== "..")
    throw new Error("Quality artifacts must stay outside the repository");
  const cases = plannedCases(approval.activation.model, approval.activation.maxOutputTokens);
  const totalReservation = cases.reduce((sum, c) => sum + c.reservedMicros, 0);
  if (totalReservation > approval.budgetMicros)
    throw new Error("Approved budget cannot cover the full conservative reservation");
  const ledgerPath = resolve(outputDirectory, "approval.json");
  const serializedApproval = JSON.stringify({ approval, execution });
  if (existsSync(ledgerPath)) {
    if (readFileSync(ledgerPath, "utf8") !== serializedApproval)
      throw new Error("This ledger belongs to another approval");
  } else writeFileSync(ledgerPath, serializedApproval, { flag: "wx", mode: 0o600 });
  const results: unknown[] = [];
  for (const { c, language, input, reservedMicros } of cases) {
    const inputHash = analysisInputHash(input);
    const claimPath = resolve(
      outputDirectory,
      `${c.id}-${language}-${hash(`${approval.approvalId}:${approval.activation.model}:${inputHash}`)}.json`,
    );
    // Every existing state is final for dispatch, including crash/timeout/failed.
    // A changed output directory requires a new explicit approval. Operators
    // must retain this ledger for reconciliation, including unknown outcomes.
    if (existsSync(claimPath)) {
      results.push(JSON.parse(readFileSync(claimPath, "utf8")));
      continue;
    }
    const reserved = {
      caseId: c.id,
      language,
      inputHash,
      reservedMicros,
      execution,
      status: "outcome_unknown",
      dispatchReservedAt: new Date().toISOString(),
      note: "One-shot reservation. Do not replay after process loss; reconcile with provider usage.",
      humanReviewRequired: true,
    };
    const descriptor = openSync(claimPath, "wx", 0o600);
    try {
      writeFileSync(descriptor, JSON.stringify(reserved));
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    const directoryDescriptor = openSync(outputDirectory, "r");
    try {
      fsyncSync(directoryDescriptor);
    } finally {
      closeSync(directoryDescriptor);
    }
    const started = Date.now();
    let result: DispatchResult;
    try {
      result = await dispatchSwAiOnce(
        input,
        { activation: approval.activation, apiKey: env.SW_AI_QUALITY_API_KEY! },
        {
          fetchImpl,
          beforeDispatch: async () => {
            validateQualityApproval(value, env);
          },
        },
      );
    } catch {
      // Never print a transport exception, request headers or key-bearing config.
      result = {
        status: "outcome_unknown",
        errorCode: "runner_unconfirmed",
        inputHash,
        usage: { inputTokens: null, outputTokens: null, costMicros: null },
        withheldSegmentIds: [],
      };
    }
    const entry = {
      ...reserved,
      status: result.status,
      elapsedMs: Date.now() - started,
      result,
      automated: result.status === "succeeded" ? inspectQuality(c, input, result.output) : null,
      outputHash: result.status === "succeeded" ? hash(JSON.stringify(result.output)) : null,
      input,
      review: reviewTemplate(c),
    };
    writeFileSync(claimPath, JSON.stringify(entry, null, 2), { mode: 0o600 });
    results.push(entry);
  }
  const report = {
    datasetVersion: QUALITY_DATASET_VERSION,
    datasetHash: qualityDatasetHash(),
    model: approval.activation.model,
    execution,
    liveCallAuthorization: approval.approvalReference,
    modelQuality: "human_review_required",
    actualBilledCost: null,
    conservativeReservationMicros: totalReservation,
    completedAt: new Date().toISOString(),
    results,
  };
  writeFileSync(resolve(outputDirectory, "results.json"), JSON.stringify(report, null, 2), {
    mode: 0o600,
  });
  return report;
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || (args.length === 1 && args[0] === "--plan")) {
    console.log(JSON.stringify(qualityRunPlan(), null, 2));
    return;
  }
  if (
    args.length === 5 &&
    args[0] === "--review" &&
    args[1] === "--results" &&
    args[3] === "--reviews"
  ) {
    console.log(
      JSON.stringify(
        reviewSavedQuality(
          JSON.parse(readFileSync(args[2], "utf8")),
          JSON.parse(readFileSync(args[4], "utf8")),
        ),
        null,
        2,
      ),
    );
    return;
  }
  if (args.length !== 5 || args[0] !== "--live" || args[1] !== "--approval" || args[3] !== "--out")
    throw new Error(
      "Use --plan, or --live --approval APPROVED_JSON --out PRIVATE_DURABLE_DIRECTORY",
    );
  const report = await runLiveQuality(JSON.parse(readFileSync(args[2], "utf8")), args[4], {
    SW_AI_QUALITY_LIVE: process.env.SW_AI_QUALITY_LIVE,
    SW_AI_QUALITY_API_KEY: process.env.SW_AI_QUALITY_API_KEY,
  });
  console.log(
    `Saved ${report.results.length} synthetic case records. Human semantic review is required; no model-quality pass is asserted.`,
  );
}
if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    console.error(
      error instanceof z.ZodError
        ? "Invalid or unapproved quality configuration"
        : error instanceof Error
          ? error.message
          : "Quality run failed",
    );
    process.exitCode = 1;
  }
}
