import "@tanstack/react-start/server-only";
/**
 * The one adapter that exists: the Security Work connection that is already
 * reviewed (processing/ai.server.ts, dispatchProviderOnce), behind the
 * provider-neutral task seam. It adds no network path, no credential handling
 * and no retry; the global generative-AI gate and the workspace activation
 * still decide whether anything is sent. A second provider is a separate,
 * verified delivery once a customer's model and hosting are chosen.
 */
import { dispatchProviderOnce, type SwAiConfiguration } from "../processing/ai.server";
import type { AiAdapter } from "./tasks";

export function existingConnectionAdapter(configuration: SwAiConfiguration): AiAdapter {
  return {
    provider: configuration.activation.provider,
    async complete(prepared, signal) {
      const result = await dispatchProviderOnce(
        configuration,
        () => ({
          body: {
            model: configuration.activation.model,
            max_tokens: configuration.activation.maxOutputTokens,
            system: prepared.system,
            messages: [{ role: "user", content: prepared.user }],
          },
          parse: (value: unknown) => value,
        }),
        { signal },
      ).catch(() => null);
      if (!result) return { ok: false as const, reason: "provider_failed" };
      return result.status === "succeeded"
        ? { ok: true as const, json: result.output, model: result.model }
        : { ok: false as const, reason: result.errorCode };
    },
  };
}
