import type { BinaryLike } from "node:crypto";

/** Test-only native runner exports. Parsed private JSON remains unknown. */
export const SCHEMA_SHA: "8dfec6c47e42074d808c30939cebf0c63defce55";
export const APP_SHA: "55db1e3b83ace033450899a93ca0961edde05217";
export const PROJECT: "cqj-ri-native-op09-20261008";
export const API: "http://127.0.0.1:55820";
export const APP: "http://127.0.0.1:35820";
export const CLI_VERSION: "2.111.0";
export const EXCLUDED: "realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor";
export const ACTORS: ["O1", "A1", "R1", "M1", "C1", "C2", "X2", "V1"];
export const PDF_BYTES: Buffer;
export const STAGES: [
  "official_native_stack",
  "strict_complete_schema",
  "real_auth_receipt_off_setup",
  "actual_sdk_44",
  "pinned_app_start",
  "actual_browser_reload_resume_cleanup",
  "final_side_effect_readback",
];
export const CONFIG: string;
export type NativeEnvironment = Readonly<Record<string, string | undefined>>;
export interface NativeContext {
  root: string;
  appRoot: string;
  stackRoot: string;
  publicRoot: string;
  evidenceSha: string;
}
export interface NativeStatus {
  API_URL: string;
  DB_URL: string;
  ANON_KEY: string;
  SERVICE_ROLE_KEY: string;
}
export type NativeRaceOutcome = "registration_won" | "cleanup_won";
export interface NativeSdkSummary {
  completed: 44;
  kind: "actual_gotrue_storage_sdk";
  checks: string[];
  observedRaceOutcomes: [NativeRaceOutcome, NativeRaceOutcome];
  bothRaceOrdersObserved: boolean;
  sequentialCommittedOrdersVerified: true;
  logoutScope: "local";
  expiredJwtClaim: false;
  replayProtection: "Passport live-session guard; JWT may verify until TTL";
}
export interface NativeBrowserSummary {
  expected: 4;
  unexpected: 0;
  flaky: 0;
  skipped: 0;
  locales: ["sv", "en"];
  viewports: ["desktop1440", "emulated375"];
  physicalPhone: false;
}
export interface NativeRpcDiagnostic {
  operation: string;
  status?: number;
  sqlState?: string;
  domain?: string;
}
export function digest(bytes: BinaryLike): string;
export function validUuid(value: unknown): value is string;
export function validateTarget(
  env: NativeEnvironment,
  evidenceSha: string,
  appSha: string,
): NativeContext;
export function requireSchemaWitness(root: string, evidenceSha: string): void;
export function readContext(env?: NativeEnvironment): NativeContext;
export function readPrivateJson(file: string): unknown;
export function validateStatus<T extends NativeStatus>(status: T): T;
export function history(names: readonly string[]): string[];
export function sdkSummary(result: unknown): NativeSdkSummary;
export function browserSummary(stats: unknown): NativeBrowserSummary;
export function rpcFailure(
  operation: string,
  result: unknown,
): Error & { safeDiagnostic: NativeRpcDiagnostic };
export function appEnvironment(
  context: NativeContext,
  status: NativeStatus,
  source?: NativeEnvironment,
): Record<string, string | undefined>;
