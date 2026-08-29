// The provider boundary.
//
// Nothing outside `providers/` knows which engine ran. The canonical business
// record is always the typed row the orchestrator writes; the provider's raw
// exchange is kept only as an audit snapshot on scp_interview_ai_runs.
//
// That is what makes the provider replaceable: swapping one out changes this
// directory and nothing else. It is also what stops a provider-specific object
// quietly becoming a business record.

/** What the caller asks for. Source text is passed SEPARATELY from instructions. */
export interface AiRequest {
  /** The governed instruction. Authored by CQrityjob, never by a source. */
  readonly system: string;
  /** The task-specific ask. Also CQrityjob's words. */
  readonly instruction: string;
  /**
   * Untrusted material — CVs, job adverts, interview notes.
   *
   * Kept as a separate field rather than concatenated into `instruction` so a
   * provider adapter can put it in a delimited block that the model is told to
   * treat as data. Concatenation is how "ignore your instructions" in a CV
   * becomes an instruction.
   */
  readonly untrustedBlocks: readonly UntrustedBlock[];
  /** Governed context the model may rely on: pack questions, dimensions, probes. */
  readonly governedContext: Readonly<Record<string, unknown>>;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  /** Task + prompt version, so an adapter can key a fixture or a cache. */
  readonly taskKey: string;
  readonly promptVersion: string;
}

export interface UntrustedBlock {
  /** The canonical passage id. Citations must name one of these. */
  readonly passageId: string;
  readonly sourceKind: string;
  readonly text: string;
}

export interface AiUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** null when the model is not in the price table: "not known", never a
   *  false zero claiming the run was free. */
  readonly costMicros: number | null;
}

export interface AiResponse {
  /** Raw text. The orchestrator parses and validates it; nothing trusts it. */
  readonly text: string;
  readonly model: string;
  readonly usage: AiUsage;
}

export interface AiProvider {
  /** The vendor or engine family: "anthropic", "deterministic". */
  readonly name: string;
  /**
   * The EXACT model identifier this provider is configured to call, never the
   * vendor name. "anthropic" is not a model; "claude-sonnet-5" is. Provenance
   * keeps the two apart because a run that cannot name its model cannot be
   * reproduced or counted in a shadow evaluation.
   *
   * This is the INTENT. The response may report a more precise id (a dated
   * point release), and settlement prefers that over this.
   */
  readonly modelId: string;
  complete(request: AiRequest): Promise<AiResponse>;
}

/** A provider failure the orchestrator can classify without string matching. */
export class AiProviderError extends Error {
  constructor(
    message: string,
    readonly kind:
      | "timeout"
      | "unavailable"
      | "refused"
      | "transport"
      // Misconfiguration -- no credential, wrong credential, or an attempt to
      // construct the adapter somewhere it must never exist. Distinct from
      // "transport" because retrying it is pointless and the fix is a person's.
      | "configuration"
      // The provider answered, but not with something usable. Reported, never
      // retried: retrying a returned-but-unusable answer is resampling.
      | "protocol",
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}
