import { describe, expect, test } from "bun:test";
import React from "react";
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import type { TranslationKey } from "../src/i18n/dictionaries";
import { I18nProvider, InterviewCopyProvider, useT } from "../src/i18n/context";
import {
  frozenRows,
  readFrozenCaseContent,
} from "../src/lib/interview-intelligence/content-integrity";
import { parseReportPayload } from "../src/lib/interview-intelligence/final-report";
import { ContentIntegrityNotice } from "../src/components/employer/interview/ContentIntegrityNotice";

const arrays = [
  "questions",
  "competencies",
  "question_competencies",
  "competency_map",
  "probes",
  "dimensions",
  "anchors",
  "verification_rules",
  "prohibited_areas",
  "method_practices",
  "conduct_steps",
  "conduct_guidance",
  "conduct_prohibitions",
  "trust_stages",
  "trust_prohibitions",
  "trust_claims",
  "trust_ai_tasks",
];
function response(provenance: "case_created" | "observed_now" = "case_created") {
  const frozenAt = "2026-10-08T05:00:00+00:00";
  return {
    manifest: {
      manifest_version: 1,
      manifest_hash: "a".repeat(64),
      content_hash_algorithm: "sha256-jsonb-v1",
      observation: "frozen_case_content",
      freeze_provenance: provenance,
      frozen_at: frozenAt,
      pack_hash_matches: false,
      pack_content_status: "draft",
      pack_validation_label: "pilot_hypothesis",
      method_approval_state: "draft",
      pack_version_id: "pack-version",
      method_id: "method-version",
      content: {
        ...Object.fromEntries(arrays.map((key) => [key, []])),
        questions: [{ id: "question", code: "Q1", prompt_sv: "Sparad fråga", prompt_en: null }],
        pack: { name_sv: "Sparad rollguide" },
        pack_version: { id: "pack-version" },
        method: { id: "method-version" },
        client_copy: {
          sv: { "iiu.iv.copilot.noai": "Sparad instruktion" },
          en: { "iiu.iv.copilot.noai": "Saved instruction" },
        },
      },
    },
    frozen_at: frozenAt,
    provenance,
    requires_acknowledgement: provenance === "observed_now",
    may_acknowledge: true,
    acknowledged_at: null,
  };
}

describe("saved interview content contract", () => {
  test("legacy observation remains distinct from creation freeze and does not approve content", () => {
    const legacy = readFrozenCaseContent(response("observed_now"))!;
    expect(legacy.provenance).toBe("observed_now");
    expect(legacy.requiresAcknowledgement).toBe(true);
    expect(legacy.integrity.methodApprovalState).toBe("draft");
    expect(legacy.integrity.packHashMatches).toBe(false);
    expect(readFrozenCaseContent(response())!.provenance).toBe("case_created");
  });
  test("missing, mutable or inconsistent content never becomes an empty successful read", () => {
    const good = response();
    for (const bad of [
      null,
      {},
      { ...good, manifest: { ...good.manifest, observation: "current_case_pinned_content" } },
      {
        ...good,
        provenance: "case_created",
        manifest: { ...good.manifest, freeze_provenance: "observed_now" },
      },
      { ...good, frozen_at: "different" },
      { ...good, requires_acknowledgement: "false" },
      {
        ...good,
        manifest: { ...good.manifest, content: { ...good.manifest.content, questions: null } },
      },
      {
        ...good,
        manifest: {
          ...good.manifest,
          content: { ...good.manifest.content, trust_claims: undefined },
        },
      },
      {
        ...good,
        manifest: {
          ...good.manifest,
          content: { ...good.manifest.content, client_copy: { sv: {}, en: {} } },
        },
      },
    ]) {
      expect(readFrozenCaseContent(bad)).toBeNull();
    }
  });
  test("frozen rows preserve exact wording and missing English text", () => {
    const saved = readFrozenCaseContent(response())!;
    expect(frozenRows(saved, "questions").data[0].prompt_sv).toBe("Sparad fråga");
    expect(frozenRows(saved, "questions").data[0].prompt_en).toBeNull();
    expect(frozenRows(saved, "questions").error).toBeNull();
  });
  test("a report describes its own historical manifest without inventing creation freeze", () => {
    const old = {
      ...response().manifest,
      observation: "current_case_pinned_content",
      freeze_provenance: undefined,
      frozen_at: undefined,
    };
    const report = parseReportPayload({ content_manifest: old });
    expect(report.contentIntegrity?.observation).toBe("current_case_pinned_content");
    expect(report.contentIntegrity?.freezeProvenance).toBeUndefined();
    const frozen = parseReportPayload({ content_manifest: response("observed_now").manifest });
    expect(frozen.contentIntegrity?.freezeProvenance).toBe("observed_now");
  });
  test("saved content notice distinguishes creation freeze from observed-now legacy content", () => {
    for (const provenance of ["case_created", "observed_now"] as const) {
      for (const lang of ["sv", "en"] as const) {
        const integrity = readFrozenCaseContent(response(provenance))!.integrity;
        const html = renderToStaticMarkup(
          <I18nProvider initialLang={lang}>
            <ContentIntegrityNotice integrity={integrity} />
          </I18nProvider>,
        );
        expect(html).not.toContain("ri.snapshot.");
        expect(html).toContain("draft");
        if (provenance === "case_created")
          expect(html).toContain(
            lang === "sv" ? "när ärendet skapades" : "when the case was created",
          );
        else expect(html).toContain(lang === "sv" ? "bevisar inte" : "does not prove");
      }
    }
  });
  test("nested interview instructions use saved SV/EN copy while site controls use current translations", () => {
    function Text() {
      const { t } = useT();
      return (
        <p>
          {t("iiu.iv.copilot.noai")} · {t("ri.content.method")}
        </p>
      );
    }
    for (const lang of ["sv", "en"] as const) {
      const copy = readFrozenCaseContent(response())!.clientCopy;
      const html = renderToStaticMarkup(
        <I18nProvider initialLang={lang}>
          <InterviewCopyProvider copy={copy}>
            <Text />
          </InterviewCopyProvider>
        </I18nProvider>,
      );
      expect(html).toContain(lang === "sv" ? "Sparad instruktion" : "Saved instruction");
      expect(html).not.toContain("ri.content.method");
      expect(html).not.toContain("approved content");
    }
  });
  test("a newly added interview instruction never silently falls back to the live dictionary", () => {
    function MissingInstruction() {
      return <p>{useT().t("iiu.iv.howto.1")}</p>;
    }
    const copy = readFrozenCaseContent(response())!.clientCopy;
    expect(() =>
      renderToStaticMarkup(
        <I18nProvider>
          <InterviewCopyProvider copy={copy}>
            <MissingInstruction />
          </InterviewCopyProvider>
        </I18nProvider>,
      ),
    ).toThrow("INTERVIEW_COPY_MISSING");
  });
  test("the route's save-error text renders from pre-existing frozen SV/EN copy", () => {
    const route = readFileSync(
      new URL(
        "../src/routes/_authenticated.employer.$employerSlug.interview-intelligence.$caseId.interview.tsx",
        import.meta.url,
      ),
      "utf8",
    );
    const errorKey = route.match(/process\?\.error\s*\?\s*"([^"]+)"/)?.[1];
    expect(errorKey).toBe("iiu.iv.process.savefailed");
    // This is the old case's copy, not a copy of today's dictionary. The
    // newly introduced saveFailed key is intentionally absent in both locales.
    const copy = {
      sv: { "iiu.iv.process.savefailed": "Reflektion och avvikelser kunde inte sparas" },
      en: { "iiu.iv.process.savefailed": "Reflection and changes could not be saved" },
    };
    const before = JSON.stringify(copy);
    function ErrorStatus() {
      return <p role="status">{useT().t(errorKey as TranslationKey)}</p>;
    }
    for (const lang of ["sv", "en"] as const) {
      const html = renderToStaticMarkup(
        <I18nProvider initialLang={lang}>
          <InterviewCopyProvider copy={copy}>
            <ErrorStatus />
          </InterviewCopyProvider>
        </I18nProvider>,
      );
      expect(html).toContain(copy[lang]["iiu.iv.process.savefailed"]);
      expect(html).not.toContain("iiu.iv.process.");
    }
    expect(JSON.stringify(copy)).toBe(before);
  });
});
