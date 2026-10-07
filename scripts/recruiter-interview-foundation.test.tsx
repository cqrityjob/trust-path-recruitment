import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/context";
import { readContentIntegrity } from "../src/lib/interview-intelligence/content-integrity";
import { parseReportPayload } from "../src/lib/interview-intelligence/final-report";
import { isOutstandingFinding } from "../src/lib/interview-intelligence/finding-state";
import { FinalReportDocument } from "../src/components/employer/interview/FinalReportDocument";
import { ContentIntegrityNotice } from "../src/components/employer/interview/ContentIntegrityNotice";

const manifest = {
  manifest_version: 1,
  content_hash_algorithm: "sha256-jsonb-v1",
  manifest_hash: "a".repeat(64),
  pack_hash_matches: false,
  pack_content_status: "draft",
  pack_validation_label: "pilot_hypothesis",
  method_approval_state: "draft",
  stored_pack_hash: "old",
  recomputed_pack_hash: "changed",
};

describe("interview foundation readback", () => {
  test("legacy reports are read without inventing a manifest or manual provenance", () => {
    const p = parseReportPayload({
      unresolved: [{ id: "old", kind: "gap", statement: "Old note", state: "open" }],
    });
    expect(p.contentIntegrity).toBeNull();
    expect(p.unresolved[0].origin).toBeNull();
    expect(p.unresolved[0].nextAction).toBeNull();
  });
  test("unsupported or malformed manifest is not presented as a verified version", () => {
    for (const v of [
      null,
      {},
      { ...manifest, manifest_version: 2 },
      { ...manifest, manifest_hash: "md5" },
      { ...manifest, pack_hash_matches: "true" },
    ]) {
      expect(readContentIntegrity(v)).toBeNull();
    }
  });
  test("only SQL's outstanding states contribute to open work", () => {
    expect(
      ["open", "needs_verification", "unresolved_difference"].every(isOutstandingFinding),
    ).toBe(true);
    expect(
      ["resolved", "not_relevant", "corrected_by_candidate", "unknown"].some(isOutstandingFinding),
    ).toBe(false);
  });
  test("manual follow-up remains tied to the frozen report payload in both languages", () => {
    const payload = parseReportPayload({
      case: { candidate: "Synthetic candidate" },
      content_manifest: manifest,
      unresolved: [
        {
          id: "manual",
          origin: "human",
          kind: "verification",
          statement: "Document missing",
          state: "open",
          neutral_question: "Which document covers this requirement?",
          source_label: "Application / requirement R7",
          responsible_label: "Recruiter",
          next_action: "Request a copy after the interview",
          due_on: "2026-11-01",
          human_note: "Pending external verification",
        },
      ],
    });
    const rawBefore = JSON.stringify(payload);
    for (const lang of ["sv", "en"] as const) {
      const html = renderToStaticMarkup(
        <I18nProvider initialLang={lang}>
          <FinalReportDocument
            payload={payload}
            mode={{
              kind: "preview",
              preview: {
                payload,
                basisHash: "basis",
                contentHash: "content",
                blockers: [],
                blockerCount: 0,
              },
            }}
          />
        </I18nProvider>,
      );
      for (const text of [
        "Which document",
        "Application / requirement R7",
        "Request a copy",
        "2026-11-01",
        "Pending external verification",
        "a".repeat(64),
      ])
        expect(html).toContain(text);
      expect(html).not.toContain("ri.content.");
    }
    expect(JSON.stringify(payload)).toBe(rawBefore);
  });
  test("matching hash never claims approval; mismatch is visible in Swedish and English", () => {
    for (const lang of ["sv", "en"] as const) {
      const integrity = readContentIntegrity(manifest)!;
      const html = renderToStaticMarkup(
        <I18nProvider initialLang={lang}>
          <ContentIntegrityNotice integrity={integrity} />
        </I18nProvider>,
      );
      expect(html).toContain(lang === "sv" ? "stämmer inte" : "does not match");
      expect(html).toContain(lang === "sv" ? "inte innehållsgodkännande" : "does not approve");
    }
  });
});
