import type { NativeContext } from "./passport-native-op09-contract.mjs";

export interface NativePublicReport {
  result: string;
  stages: Record<string, string>;
}
/** Serializes the guarded report and curated images; no private output is returned. */
export function writePublic<T extends NativePublicReport>(
  context: Pick<NativeContext, "stackRoot" | "publicRoot">,
  report: T,
): void;
