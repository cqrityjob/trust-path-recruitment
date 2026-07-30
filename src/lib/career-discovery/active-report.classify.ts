// Which report contract is this stored snapshot?
//
// ── WHY THIS IS ITS OWN PURE MODULE ────────────────────────────────────
//
// The classification decides which renderer a candidate's report reaches. Get
// it wrong and the failure is silent: a v3.1 payload handed to the v3.0
// renderer produces a page where every field is `undefined` and the component's
// own `?? []` fallbacks absorb it, so the candidate sees an almost-empty report
// and no error is raised anywhere.
//
// That is exactly the kind of defect that needs a unit test rather than a
// walkthrough, so the logic lives here — pure, no I/O — and
// scripts/career-discovery-check.ts exercises it directly.
//
// ── THE VERSION IS AUTHORITATIVE, THE SHAPE IS CORROBORATION ───────────
//
// `definition_version` is a stored column, written by a database trigger from
// the session's own definition. It is the discriminator. The payload shape is
// then checked AGAINST that declaration — not used to guess it.
//
// If the two disagree, the report is `malformed`. It is never coerced into
// whichever contract the shape happens to resemble, because a payload that
// contradicts its own version column is a corruption signal, and picking a
// renderer for it would hide the corruption behind a plausible-looking page.
//
// ── NO TRANSFORMATION, EVER ────────────────────────────────────────────
//
// Nothing here rewrites, normalises or migrates a stored payload. A v3.0
// snapshot stays a v3.0 snapshot forever and is rendered by the v3.0 renderer.
// Transforming it at read time would mean a historical report's content
// depended on today's transformation code, which is the whole thing
// immutability exists to prevent.

import type { DiscoveryReport } from "./report";

/** Definition versions this application knows how to render. */
export const REPORT_CONTRACT_BY_DEFINITION_VERSION = {
  "2026-scd-v3.0.0": "v3.0",
  "2026-scd-v3.1.0": "v3.1",
} as const;

export type ReportContract =
  (typeof REPORT_CONTRACT_BY_DEFINITION_VERSION)[keyof typeof REPORT_CONTRACT_BY_DEFINITION_VERSION];

/**
 * The v3.1 stored payload, described structurally.
 *
 * v3.1's own types live in src/lib/career-discovery/v31/, which is not on this
 * branch. Importing them would couple this fix to an unmerged branch, so the
 * shape is declared minimally here — enough to VALIDATE that a payload really
 * is v3.1, and nothing more.
 *
 * PR 4 replaces this with the real `ReportSnapshot` import when it builds the
 * v3.1 renderer. Until then nothing reads past these fields.
 */
export interface V31StoredPayloadShape {
  readonly versions?: { readonly reportSchemaVersion?: unknown };
  readonly outputA?: unknown;
  readonly outputB?: unknown;
}

/** What a caller learns about a validated v3.1 snapshot.
 *
 *  Deliberately NOT the payload. Nothing renders v3.1 content until PR 4
 *  builds the renderer, so returning the payload would be surface with no
 *  consumer — and surface with no consumer is where the next silent misread
 *  comes from. The schema version is included because it is the one field a
 *  caller legitimately needs in order to route. */
export interface V31ReportIdentity {
  readonly reportSchemaVersion: string | null;
}

export type ClassifiedReport =
  | { readonly contract: "v3.0"; readonly report: DiscoveryReport }
  | { readonly contract: "v3.1"; readonly identity: V31ReportIdentity }
  | { readonly contract: "unsupported"; readonly reason: string }
  | { readonly contract: "malformed"; readonly reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** True when the payload carries the structural markers of a v3.1 snapshot. */
function looksLikeV31(payload: Record<string, unknown>): boolean {
  return "outputA" in payload || "outputB" in payload;
}

/** True when the payload carries the structural markers of a v3.0 report. */
function looksLikeV30(payload: Record<string, unknown>): boolean {
  return "topAreas" in payload || "dna" in payload || "framing" in payload;
}

/**
 * Classify a stored report by its declared definition version.
 *
 * `payload` is whatever was found at `dna_scores.report`. A null payload is
 * NOT malformed on its own — v3.0 deliberately tolerates a snapshot that
 * predates a field and renders a generic label rather than recalculating. What
 * is malformed is a payload that contradicts its own version column.
 */
export function classifyStoredReport(
  definitionVersion: string | null | undefined,
  payload: unknown,
): ClassifiedReport {
  if (!definitionVersion) {
    return { contract: "malformed", reason: "snapshot carries no definition version" };
  }

  const contract =
    REPORT_CONTRACT_BY_DEFINITION_VERSION[
      definitionVersion as keyof typeof REPORT_CONTRACT_BY_DEFINITION_VERSION
    ];

  if (!contract) {
    // A version this build does not know. Almost always means the app is older
    // than the report — a deploy rolled back, or a snapshot written by a newer
    // release. Refusing is correct: guessing a renderer would show the
    // candidate a report we cannot vouch for.
    return {
      contract: "unsupported",
      reason: `unknown definition version: ${definitionVersion}`,
    };
  }

  if (contract === "v3.1") {
    if (!isRecord(payload)) {
      return { contract: "malformed", reason: "v3.1 snapshot has no readable payload" };
    }
    if (looksLikeV30(payload) && !looksLikeV31(payload)) {
      return {
        contract: "malformed",
        reason: "snapshot declares v3.1 but carries a v3.0 payload",
      };
    }
    if (!looksLikeV31(payload)) {
      return {
        contract: "malformed",
        reason: "v3.1 snapshot is missing both outputA and outputB",
      };
    }
    const versions = (payload as V31StoredPayloadShape).versions;
    const schema = versions?.reportSchemaVersion;
    return {
      contract: "v3.1",
      identity: { reportSchemaVersion: typeof schema === "string" ? schema : null },
    };
  }

  // v3.0. A payload that is structurally v3.1 must never reach the v3.0
  // renderer — this is the exact defect this module exists to prevent.
  if (isRecord(payload) && looksLikeV31(payload)) {
    return {
      contract: "malformed",
      reason: "snapshot declares v3.0 but carries a v3.1 payload",
    };
  }

  if (payload !== null && payload !== undefined && !isRecord(payload)) {
    return { contract: "malformed", reason: "v3.0 payload is not an object" };
  }

  // null is legitimate here: an older v3.0 snapshot may predate a field, and
  // the v3.0 renderer already shows a safe generic label for that case.
  return { contract: "v3.0", report: (payload ?? null) as unknown as DiscoveryReport };
}
