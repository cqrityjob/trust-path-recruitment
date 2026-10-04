// The server gate for generative AI in version 1 (owner decision, 2026-10-04).
//
// Version 1 of CQrityjob offers no generative AI. It is not "off by default":
// no external AI request may leave the DEPLOYED application, whatever the
// environment says. (Operator-run scripts are the one exception, see "The lab
// seam" below: they open the seam themselves, never a request or a setting.)
// Before this gate, four of the five ways to reach an AI provider were
// closed by database switches, but the CV draft was governed only by two
// environment variables (INTERVIEW_AI_PROVIDER and ANTHROPIC_API_KEY). A
// configured server could have sent a person's career facts to a provider
// while the privacy policy said it never would.
//
// So the gate is a CONSTANT in this file, not a setting. It reads no
// environment variable, no database row and no request. Every place that can
// open a network connection to an AI provider goes through `externalAiFetch`
// below, which refuses BEFORE `fetch` is called. `generative-ai-gate:check` proves
// two things: with a provider configured and a synthetic key, no request is
// attempted on any path, and no call to a provider exists outside this gate.
//
// What stays: the fact-based CV (a CV built from the person's own Passport,
// profile and test results, no model involved), the deterministic engine in a
// lab, and every database switch. They are unchanged, and they are now a
// second lock behind this one, not the only one.
//
// Version 2 offers generative AI as separate paid services with an explicit
// order, price information and activation. Opening this gate is then a
// reviewed change of the constant below TOGETHER with that ordering flow and
// an updated privacy policy; it is never an environment change.

/** Version 1: no generative AI. Changing this is a reviewed code change, not a deployment setting. */
export const GENERATIVE_AI_ENABLED = false;

export const GENERATIVE_AI_DISABLED_CODE = "GENERATIVE_AI_DISABLED_IN_V1";

export class GenerativeAiDisabledError extends Error {
  readonly code = GENERATIVE_AI_DISABLED_CODE;
  constructor(readonly site: string) {
    super(
      `${GENERATIVE_AI_DISABLED_CODE}: generative AI is not part of version 1, so no request was made (${site}).`,
    );
    this.name = "GenerativeAiDisabledError";
  }
}

// The lab seam. Only scripts under scripts/ may call it (the guard fails on any
// other use), to exercise the provider adapters against a stub transport. It
// is not reachable from a request, an environment variable or a database row,
// so the deployed application cannot open it.
//
// An operator who runs one of those scripts by hand CAN open it.
// scripts/security-work-ai-quality-run.ts opens it when the file loads, so the
// gate offers no protection inside that process; what protects it is the
// script's own approval flow: its live mode needs `--live --approval <approved
// plan>`, SW_AI_QUALITY_LIVE and an operator-injected SW_AI_QUALITY_API_KEY
// (docs/security-intelligence/ai-quality.md), and it sends only the synthetic
// fixture cases, from the operator's machine. It is not part of the deployed
// application or of any CI job. It is still the one path where a request can
// leave, which is why running it live is an operator decision and why the guard
// pins who may call the seam.
let labOverride = false;
export function __setGenerativeAiLabOverride(allow: boolean): void {
  labOverride = allow;
}

export function externalAiAllowed(): boolean {
  return GENERATIVE_AI_ENABLED || labOverride;
}

/** Throws before anything is built or sent. */
export function assertExternalAiAllowed(site: string): void {
  if (!externalAiAllowed()) throw new GenerativeAiDisabledError(site);
}

/**
 * The only way application code reaches an AI provider over the network. The
 * gate is checked first; `fetchImpl` is not called when it is closed.
 */
export async function externalAiFetch(
  site: string,
  fetchImpl: typeof fetch,
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
): Promise<Response> {
  assertExternalAiAllowed(site);
  return fetchImpl(input, init);
}
