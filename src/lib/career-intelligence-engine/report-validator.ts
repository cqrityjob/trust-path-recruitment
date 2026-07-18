// Phase 2 final closure — SavedCareerReportV1 consistency validator.
//
// Runs on the server after the engine has produced a report and before it is
// persisted. Its job is narrow: catch factual-consistency defects that only
// manifest across the assembled snapshot (numeric bounds, envelope-vs-match
// counts, engine/report version pinning, unit sanity). It never rewrites the
// report — a failure is surfaced to the caller so the save is either fixed
// upstream or aborted, not silently mutated.

import { ENGINE_VERSION } from "./types";
import { REPORT_VERSION, type SavedCareerReportV1 } from "./report-types";

export interface ReportValidationIssue {
  code: string;
  message: string;
  path?: string;
}

export interface ReportValidationResult {
  ok: boolean;
  issues: ReportValidationIssue[];
}

function pct(n: unknown): boolean {
  return typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100;
}

export function validateSavedReportV1(report: SavedCareerReportV1): ReportValidationResult {
  const issues: ReportValidationIssue[] = [];

  // -- Envelope --
  if (report.reportVersion !== REPORT_VERSION) {
    issues.push({ code: "report_version_mismatch", message: `Expected ${REPORT_VERSION}`, path: "reportVersion" });
  }
  if (report.engineResult.engineVersion !== ENGINE_VERSION) {
    issues.push({
      code: "engine_version_mismatch",
      message: `engineResult.engineVersion (${report.engineResult.engineVersion}) does not match engine ${ENGINE_VERSION}`,
      path: "engineResult.engineVersion",
    });
  }
  if (report.engineVersion !== report.engineResult.engineVersion) {
    issues.push({
      code: "envelope_engine_version_drift",
      message: "envelope.engineVersion disagrees with engineResult.engineVersion",
      path: "engineVersion",
    });
  }
  if (report.inputsHash !== report.engineResult.inputsHash) {
    issues.push({
      code: "envelope_inputs_hash_drift",
      message: "envelope.inputsHash disagrees with engineResult.inputsHash",
      path: "inputsHash",
    });
  }

  // -- Overall bounds --
  if (!pct(report.engineResult.overallEvidenceScore)) {
    issues.push({ code: "overall_evidence_out_of_bounds", message: "overallEvidenceScore must be 0..100", path: "engineResult.overallEvidenceScore" });
  }

  // -- Matches --
  const matches = report.engineResult.matches ?? [];
  if (matches.length === 0 && report.engineResult.dataStatus === "ok") {
    issues.push({ code: "no_matches_but_status_ok", message: "dataStatus=ok requires at least one match", path: "engineResult.matches" });
  }
  const seenKeys = new Set<string>();
  matches.forEach((m, i) => {
    const p = `engineResult.matches[${i}]`;
    if (!pct(m.currentFit)) issues.push({ code: "match_currentFit_bounds", message: "currentFit must be 0..100", path: `${p}.currentFit` });
    if (!pct(m.potential)) issues.push({ code: "match_potential_bounds", message: "potential must be 0..100", path: `${p}.potential` });
    if (!pct(m.evidenceScore)) issues.push({ code: "match_evidence_bounds", message: "evidenceScore must be 0..100", path: `${p}.evidenceScore` });
    if (m.potential + 1e-6 < m.currentFit) {
      // Semantic invariant: potential is an upper envelope on current fit.
      issues.push({ code: "potential_below_current_fit", message: "potential must be >= currentFit", path: `${p}` });
    }
    if (!m.professionKey) issues.push({ code: "match_missing_key", message: "professionKey is required", path: `${p}.professionKey` });
    if (m.professionKey) {
      if (seenKeys.has(m.professionKey)) {
        issues.push({ code: "duplicate_profession_key", message: `duplicate professionKey ${m.professionKey}`, path: `${p}.professionKey` });
      }
      seenKeys.add(m.professionKey);
    }

    // Education duration unit sanity: reject the pre-fix English-only string.
    (m.enrichment?.educationPathways ?? []).forEach((edu, j) => {
      const ep = `${p}.enrichment.educationPathways[${j}]`;
      if (edu.durationMonths != null) {
        if (!Number.isInteger(edu.durationMonths) || edu.durationMonths < 0) {
          issues.push({ code: "edu_duration_invalid", message: "durationMonths must be a non-negative integer", path: `${ep}.durationMonths` });
        }
      }
      // A newly-computed report must not carry the legacy English-only "N months" string.
      if (edu.level && /^\d+\s+months$/i.test(edu.level) && edu.durationMonths == null) {
        issues.push({
          code: "edu_english_only_duration",
          message: "Legacy English-only `\"N months\"` string; use durationMonths",
          path: `${ep}.level`,
        });
      }
    });
  });

  // -- Family ranking sanity --
  (report.engineResult.familyRanking ?? []).forEach((f, i) => {
    const p = `engineResult.familyRanking[${i}]`;
    if (!pct(f.currentFit)) issues.push({ code: "family_currentFit_bounds", message: "currentFit must be 0..100", path: `${p}.currentFit` });
    if (!pct(f.potential)) issues.push({ code: "family_potential_bounds", message: "potential must be 0..100", path: `${p}.potential` });
  });

  return { ok: issues.length === 0, issues };
}