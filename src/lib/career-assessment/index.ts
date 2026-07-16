export * from "./types";
export * from "./dimensions";
export * from "./question-mappings";
export * from "./profession-profiles";
export * from "./matching-engine";
export * from "./explanations";
export * from "./test-personas";
export * from "./validation";
export * from "./result-session";

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