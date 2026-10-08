import { describe, expect, mock, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "../src/i18n/context";
import { ManualControlPointIntent } from "../src/lib/interview-intelligence/manual-control-point-intent";

// Rendering must never dispatch a server write, read candidate records or call
// a model. Browser/direct-API tests separately exercise the real adapters.
const unexpected = async () => {
  throw new Error("render dispatched an unexpected server call");
};
mock.module("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
mock.module("../src/lib/interview-intelligence/runtime.functions", () => ({
  createManualFinding: unexpected,
  reviewManualFinding: unexpected,
  getInterviewCase: unexpected,
}));
const { ManualControlPoints } =
  await import("../src/components/employer/interview/ManualControlPoints");
type Detail = Parameters<typeof ManualControlPoints>[0]["detail"];
const detail: Detail = {
  id: "synthetic-case",
  sources: [
    {
      id: "source-one",
      kind: "application_answers",
      label: "Application / requirement R7",
      purposeCode: "interview_preparation",
      origin: "human",
      passageCount: 1,
      passages: [
        { id: "passage-one", index: 1, content: "Original candidate statement <do not execute>" },
      ],
    },
  ],
  questions: [],
  manualFindingCapabilities: { mayCreate: true, mayReview: true },
  findings: ["open", "corrected_by_candidate", "not_relevant"].map((state, index) => ({
    id: `human-${index}`,
    findingKind: "verification",
    statement: `Factual checkpoint ${index}`,
    resolutionState: state,
    questionId: null,
    origin: "human",
    neutralQuestion: "Which date does the document cover?",
    sourcePassageId: "passage-one",
    sourceLabel: "Application / requirement R7",
    responsibleLabel: "Recruiter",
    nextAction: "Request a copy",
    dueOn: "2026-11-01",
    revision: 1,
    humanNote: "Document the follow-up",
    updatedAt: "2026-10-07T12:00:00Z",
  })),
};

describe("manual checkpoint submit intentions", () => {
  test("an unchanged retry and duplicate click retain the same operation; a completed intention gets a new ID", () => {
    let sequence = 0;
    const intent = new ManualControlPointIntent(() => `operation-${++sequence}`);
    const input = {
      caseId: "synthetic-case",
      statement: "Document needs clarification",
      nextAction: "Ask a neutral question",
    };
    const first = intent.operationIdFor(input);
    expect(intent.operationIdFor({ ...input })).toBe(first);
    const different = intent.operationIdFor({
      ...input,
      nextAction: "Check the original document",
    });
    expect(different).not.toBe(first);
    expect(intent.operationIdFor(input)).toBe(first);
    intent.completed();
    expect(intent.operationIdFor(input)).not.toBe(first);
  });
});

describe("manual checkpoint surface", () => {
  for (const lang of ["sv", "en"] as const) {
    const render = (value: Detail) =>
      renderToStaticMarkup(
        <QueryClientProvider client={new QueryClient()}>
          <I18nProvider initialLang={lang}>
            <ManualControlPoints detail={value} onChanged={() => undefined} />
          </I18nProvider>
        </QueryClientProvider>,
      );
    test(`${lang}: keeps neutral question, original passage and follow-up together; counts only outstanding states`, () => {
      const html = render(detail);
      expect(html).toContain("Which date does the document cover?");
      expect(html).toContain("Application / requirement R7");
      expect(html).toContain("Original candidate statement &lt;do not execute&gt;");
      expect(html).toContain("Request a copy");
      expect(html).toContain("2026-11-01");
      expect(html).toContain("Passage 1");
      expect(html).toContain(lang === "sv" ? "1 öppna · 3 manuella" : "1 open · 3 manual");
      for (const id of [
        "control-kind",
        "control-statement",
        "control-neutral-question",
        "control-source",
        "control-responsible",
        "control-next-action",
        "control-due",
      ]) {
        expect(html).toContain(`id="${id}"`);
      }
      expect(html).toContain(lang === "sv" ? "skickar inget meddelande" : "sends no message");
    });
    test(`${lang}: server capabilities hide all writes for read-only callers and distinguish create from review`, () => {
      const readOnly = render({
        ...detail,
        manualFindingCapabilities: { mayCreate: false, mayReview: false },
      });
      expect(readOnly).not.toContain("<form");
      expect(readOnly).toContain("Factual checkpoint 0");
      const createOnly = render({
        ...detail,
        manualFindingCapabilities: { mayCreate: true, mayReview: false },
      });
      expect(createOnly).toContain('data-testid="manual-control-form"');
      expect(createOnly).not.toContain('data-testid="manual-control-review"');
      const reviewOnly = render({
        ...detail,
        manualFindingCapabilities: { mayCreate: false, mayReview: true },
      });
      expect(reviewOnly).not.toContain('data-testid="manual-control-form"');
      expect(reviewOnly).toContain('data-testid="manual-control-review"');
    });
    test(`${lang}: legacy/AI findings do not get a manual review form`, () => {
      const ai = detail.findings[0];
      const html = render({
        ...detail,
        findings: [{ ...ai, origin: "ai", statement: "Legacy AI finding" }],
      });
      expect(html).not.toContain("Legacy AI finding");
      expect(html).not.toContain('data-testid="manual-control-review"');
      expect(html).toContain(lang === "sv" ? "0 öppna · 0 manuella" : "0 open · 0 manual");
    });
  }
});
