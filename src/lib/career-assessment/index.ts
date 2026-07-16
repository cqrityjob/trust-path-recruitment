export * from "./types";
export * from "./dimensions";
export * from "./question-mappings";
export * from "./profession-profiles";
export * from "./matching-engine";
export * from "./explanations";
export * from "./test-personas";
export * from "./validation";
export * from "./result-session";

// Version tags for future storage / migration. Bump when the scoring model,
// question-to-dimension mappings, target profiles, or the user-facing
// disclaimer wording change in a way that invalidates comparability of
// previously computed results.
export const MODEL_VERSION = "2026.07-06A.1" as const;
export const DISCLAIMER_VERSION = "2026.07-06B.1" as const;

// Dev-mode console report.
import { reportOnce } from "./validation";
if (import.meta.env?.DEV) {
  try {
    reportOnce();
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[career-assessment] dev report failed", err);
  }
}