// Pure synthetic contract exercise, with no provider/database/HTTP adapter.
// In-memory accounting is NOT a production queue, clustered budget or cache.
import { createHash } from "node:crypto";
import {
  authoritativeContext,
  recruiterAiRequestSchema,
  validateRecruiterAiProposal,
  type RecruiterAiContext,
  type RecruiterAiOutput,
  type RecruiterAiRequest,
} from "./contract";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b, "en"))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export function syntheticDigest(value: unknown): string {
  return createHash("sha256").update(canonical(value), "utf8").digest("hex");
}
export function syntheticTextHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
function verifiedContext(input: unknown, request: RecruiterAiRequest): RecruiterAiContext | null {
  const c = authoritativeContext(input, request);
  if (
    !c ||
    c.passages.some(
      (p) => p.withdrawn || !p.readable || p.passageHash !== syntheticTextHash(p.text),
    )
  )
    return null;
  return c;
}
export type SyntheticResult =
  | {
      status: "proposal";
      proposal: RecruiterAiOutput;
      semanticSupport: "requires_human_review";
      cacheHit: boolean;
      provenance: {
        requestedOperationId: string;
        originOperationId: string;
        contextFingerprint: string;
        employerId: string;
        applicationId: string;
        profileId: string;
        profileVersion: number;
        profileHash: string;
        pins: RecruiterAiContext["pins"];
        sources: Array<{
          sourceId: string;
          sourceVersion: string;
          sourceContentHash: string;
          passageId: string;
          passageHash: string;
        }>;
      };
    }
  | {
      status: "rejected";
      reason:
        | "scope_or_source_invalid"
        | "operation_reused"
        | "budget_exceeded"
        | "queue_full"
        | "quota_exceeded"
        | "cancelled"
        | "timed_out"
        | "stale_context"
        | "schema_invalid"
        | "input_quarantined"
        | "citation_invalid"
        | "criterion_invalid"
        | "policy_rejected"
        | "unselected_human_item";
    };
export interface SyntheticExercise {
  readonly mode: "synthetic_evaluation";
  readonly request: unknown;
  readonly snapshot: unknown;
  readonly reservedUnits: number;
  readonly signal?: AbortSignal;
  readonly readCurrent: () => Promise<unknown>;
  // Synthetic local fixture computation ONLY. No production adapter is supplied.
  readonly fixture: (signal: AbortSignal) => Promise<{ output: unknown; usedUnits: number }>;
}
interface Budget {
  reserved: number;
  spent: number;
  active: number;
  waiting: number;
  waiters: Array<() => void>;
}
const rejected = (
  reason: Extract<SyntheticResult, { status: "rejected" }>["reason"],
): SyntheticResult => ({ status: "rejected", reason });

function provenance(
  request: RecruiterAiRequest,
  c: RecruiterAiContext,
  fingerprint: string,
  originOperationId: string,
): Extract<SyntheticResult, { status: "proposal" }>["provenance"] {
  return {
    requestedOperationId: request.operationId,
    originOperationId,
    contextFingerprint: fingerprint,
    employerId: c.employerId,
    applicationId: c.applicationId,
    profileId: c.profile.id,
    profileVersion: c.profile.version,
    profileHash: c.profile.contentHash,
    pins: structuredClone(c.pins),
    sources: c.passages.map((p) => ({
      sourceId: p.sourceId,
      sourceVersion: p.sourceVersion,
      sourceContentHash: p.sourceContentHash,
      passageId: p.id,
      passageHash: p.passageHash,
    })),
  };
}

async function abortable<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<{ ok: true; value: T } | { ok: false }> {
  return new Promise((resolve, reject) => {
    const aborted = () => resolve({ ok: false });
    signal.addEventListener("abort", aborted, { once: true });
    if (signal.aborted) aborted();
    void promise.then(
      (value) => {
        signal.removeEventListener("abort", aborted);
        resolve({ ok: true, value });
      },
      (error) => {
        signal.removeEventListener("abort", aborted);
        reject(error);
      },
    );
  });
}

export class SyntheticRecruiterAiSandbox {
  private readonly budgets = new Map<string, Budget>();
  private readonly operations = new Map<
    string,
    { fingerprint: string; promise: Promise<SyntheticResult> }
  >();
  private readonly cache = new Map<
    string,
    { proposal: RecruiterAiOutput; originOperationId: string }
  >();
  readonly instrumentation = {
    fixtureCalls: 0,
    modelRequests: 0,
    persistentWrites: 0,
    statusChanges: 0,
    messages: 0,
    finalisedReports: 0,
  };

  async exercise(input: SyntheticExercise): Promise<SyntheticResult> {
    if (input.mode !== "synthetic_evaluation" || input.signal?.aborted)
      return rejected("cancelled");
    const parsed = recruiterAiRequestSchema.safeParse(input.request);
    if (!parsed.success) return rejected("schema_invalid");
    const request = parsed.data;
    const initial = verifiedContext(input.snapshot, request);
    if (!initial || !Number.isSafeInteger(input.reservedUnits) || input.reservedUnits < 1)
      return rejected("scope_or_source_invalid");
    const firstSignal = AbortSignal.any([
      AbortSignal.timeout(initial.plan.maxDurationMs),
      ...(input.signal ? [input.signal] : []),
    ]);
    let current: RecruiterAiContext | null;
    try {
      const firstRead = await abortable(input.readCurrent(), firstSignal);
      if (!firstRead.ok) return rejected(input.signal?.aborted ? "cancelled" : "timed_out");
      current = verifiedContext(firstRead.value, request);
    } catch {
      return rejected("scope_or_source_invalid");
    }
    if (!current || syntheticDigest(current) !== syntheticDigest(initial))
      return rejected("stale_context");
    const { operationId, ...intent } = request;
    const fingerprint = syntheticDigest({ intent, context: initial });
    const operation = `${initial.employerId}:${initial.actorId}:${operationId}`;
    const prior = this.operations.get(operation);
    if (prior)
      return prior.fingerprint === fingerprint
        ? structuredClone(await prior.promise)
        : rejected("operation_reused");
    const cached = this.cache.get(fingerprint);
    if (this.operations.size >= 1024) return rejected("quota_exceeded");
    if (cached) {
      const result: SyntheticResult = {
        status: "proposal",
        proposal: structuredClone(cached.proposal),
        semanticSupport: "requires_human_review",
        cacheHit: true,
        provenance: provenance(request, initial, fingerprint, cached.originOperationId),
      };
      this.operations.set(operation, { fingerprint, promise: Promise.resolve(result) });
      return structuredClone(result);
    }
    const budgetKey = `${initial.employerId}:${initial.plan.id}:${initial.plan.version}`;
    const budget = this.budgets.get(budgetKey) ?? {
      reserved: 0,
      spent: 0,
      active: 0,
      waiting: 0,
      waiters: [],
    };
    this.budgets.set(budgetKey, budget);
    if (budget.spent + budget.reserved + input.reservedUnits > initial.plan.budgetUnits)
      return rejected("budget_exceeded");
    if (budget.active >= initial.plan.maxConcurrent && budget.waiting >= initial.plan.maxQueued)
      return rejected("queue_full");
    // Reserve before queueing; waiting operations cannot collectively overspend.
    budget.reserved += input.reservedUnits;
    const promise = this.execute(input, request, initial, fingerprint, budget);
    this.operations.set(operation, { fingerprint, promise });
    return structuredClone(await promise);
  }

  private async execute(
    input: SyntheticExercise,
    request: RecruiterAiRequest,
    initial: RecruiterAiContext,
    fingerprint: string,
    budget: Budget,
  ): Promise<SyntheticResult> {
    const controller = new AbortController();
    const cancel = () => controller.abort();
    input.signal?.addEventListener("abort", cancel, { once: true });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, initial.plan.maxDurationMs);
    let charged = 0;
    let active = false;
    let pendingUsage: Promise<{ output: unknown; usedUnits: number }> | null = null;
    const settle = () => {
      budget.spent += charged;
      budget.reserved -= input.reservedUnits;
      if (active) {
        budget.active--;
        budget.waiters.shift()?.();
      }
    };
    try {
      if (budget.active >= initial.plan.maxConcurrent) {
        budget.waiting++;
        let wake: () => void = () => {};
        const queued = new Promise<void>((resolve) => {
          wake = resolve;
          budget.waiters.push(wake);
        });
        const available = await abortable(queued, controller.signal);
        budget.waiting--;
        if (!available.ok) {
          const index = budget.waiters.indexOf(wake);
          if (index >= 0) budget.waiters.splice(index, 1);
          return rejected(timedOut ? "timed_out" : "cancelled");
        }
      }
      budget.active++;
      active = true;
      if (budget.spent + budget.reserved > initial.plan.budgetUnits)
        return rejected("budget_exceeded");
      if (input.signal?.aborted) return rejected("cancelled");
      const beforeRead = await abortable(input.readCurrent(), controller.signal);
      if (!beforeRead.ok) return rejected(timedOut ? "timed_out" : "cancelled");
      const before = verifiedContext(beforeRead.value, request);
      if (!before || syntheticDigest(before) !== syntheticDigest(initial))
        return rejected("stale_context");
      if (controller.signal.aborted) return rejected(timedOut ? "timed_out" : "cancelled");
      this.instrumentation.fixtureCalls++;
      const computation = input.fixture(controller.signal);
      const computed = await abortable(computation, controller.signal);
      if (!computed.ok) {
        // The caller is bounded; the slot/reservation remains held while an
        // uncooperative late fixture finishes. Its result is never cached.
        pendingUsage = computation;
        return rejected(timedOut ? "timed_out" : "cancelled");
      }
      const result = computed.value;
      // Conservative synthetic accounting: failures/cancellation do not hide
      // fixture usage. Active slot stays occupied until late computation ends.
      if (!Number.isSafeInteger(result.usedUnits) || result.usedUnits < 0) {
        charged = input.reservedUnits;
        return rejected("budget_exceeded");
      }
      charged = result.usedUnits;
      if (charged > input.reservedUnits) return rejected("budget_exceeded");
      if (controller.signal.aborted) return rejected(timedOut ? "timed_out" : "cancelled");
      const afterRead = await abortable(input.readCurrent(), controller.signal);
      if (!afterRead.ok) return rejected(timedOut ? "timed_out" : "cancelled");
      const after = verifiedContext(afterRead.value, request);
      if (!after || syntheticDigest(after) !== syntheticDigest(initial))
        return rejected("stale_context");
      if (controller.signal.aborted) return rejected(timedOut ? "timed_out" : "cancelled");
      const checked = validateRecruiterAiProposal(result.output, request, initial);
      if (!checked.ok)
        return rejected(
          checked.reason === "scope_invalid" || checked.reason === "unavailable_source"
            ? "scope_or_source_invalid"
            : checked.reason,
        );
      if (this.cache.size >= 256) this.cache.delete(this.cache.keys().next().value ?? "");
      this.cache.set(fingerprint, {
        proposal: structuredClone(checked.proposal),
        originOperationId: request.operationId,
      });
      return {
        status: "proposal",
        proposal: checked.proposal,
        semanticSupport: checked.semanticSupport,
        cacheHit: false,
        provenance: provenance(request, initial, fingerprint, request.operationId),
      };
    } catch {
      charged = input.reservedUnits;
      return rejected(
        controller.signal.aborted ? (timedOut ? "timed_out" : "cancelled") : "schema_invalid",
      );
    } finally {
      clearTimeout(timer);
      input.signal?.removeEventListener("abort", cancel);
      if (pendingUsage) {
        void pendingUsage
          .then(
            (result) => {
              charged =
                Number.isSafeInteger(result.usedUnits) && result.usedUnits >= 0
                  ? result.usedUnits
                  : input.reservedUnits;
            },
            () => {
              charged = input.reservedUnits;
            },
          )
          .finally(settle);
      } else {
        settle();
      }
    }
  }

  budgetObservation(
    employerId: string,
    planId: string,
    planVersion: string,
  ): Readonly<Omit<Budget, "waiters">> {
    const b = this.budgets.get(`${employerId}:${planId}:${planVersion}`);
    return {
      reserved: b?.reserved ?? 0,
      spent: b?.spent ?? 0,
      active: b?.active ?? 0,
      waiting: b?.waiting ?? 0,
    };
  }
}
