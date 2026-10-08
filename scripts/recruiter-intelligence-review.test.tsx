import {
  decisionsFromReview,
  openApplicationOriginalCv,
} from "../src/lib/recruitment/requirement-review-draft";
import { describe, expect, mock, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "../src/i18n/context";
import type { RequirementReview } from "../src/lib/recruitment/requirement-intelligence";

const unexpected = async () => {
  throw new Error("Rendering dispatched a write/read/model request");
};
mock.module("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
mock.module("../src/lib/recruitment/requirement-intelligence.functions", () => ({
  getRequirementReview: unexpected,
  saveRequirementReview: unexpected,
  transferRequirementSources: unexpected,
  prepareManualRequirementSource: unexpected,
  getRequirementProfile: unexpected,
  confirmRequirementProfile: unexpected,
}));
const { RequirementReviewEditor } =
  await import("../src/components/recruitment/RequirementReviewPanel");
const { RequirementProfileEditor } =
  await import("../src/components/recruitment/RequirementProfilePanel");

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const source = {
  kind: "application_answer" as const,
  reference: id(2),
  version: "source-v1",
  label: "Original answer",
  answerBool: true,
  answerText: "Candidate's <original> statement",
};
const criterion = {
  requirementId: id(1),
  kind: "mandatory" as const,
  acceptedSources: ["application_answer" as const],
  decisionRule: "boolean_yes" as const,
  questionId: id(2),
  instructionSv: "Kontrollera det kopplade svaret",
  instructionEn: "Check the linked answer",
  labelSv: "Behörighet",
  labelEn: "Licence",
  position: 1,
  state: "met" as const,
  source,
  sourceCurrent: true,
  validUntil: null,
  note: "Original answer checked",
  neutralQuestion: "Which date does this apply from?",
  reviewedBy: id(3),
  reviewedAt: "2026-10-08T10:00:00Z",
};
const review: RequirementReview = {
  applicationId: id(4),
  jobId: id(5),
  employerId: id(6),
  profile: {
    jobId: id(5),
    profileId: id(7),
    version: 1,
    startDate: "2026-11-01",
    confirmedAt: "2026-10-08T09:00:00Z",
    confirmedBy: id(3),
    canManage: true,
    rules: [criterion],
    requirements: [
      { id: id(1), kind: "mandatory", labelSv: "Behörighet", labelEn: "Licence", position: 1 },
    ],
    questions: [
      {
        id: id(2),
        requirementId: id(1),
        promptSv: "Har du behörighet?",
        promptEn: "Do you have a licence?",
        answerKind: "yes_no",
      },
    ],
  },
  revision: 2,
  bindingToken: "a".repeat(32),
  canManage: true,
  requirementStatus: "green",
  reviewState: "pending",
  analysisState: "not_used",
  criteria: [criterion],
  availableSources: [source],
  nextAction: "Check the original document",
  responsibleUserId: id(3),
  assignmentVersion: 2,
  reviewedBy: null,
  reviewedAt: null,
};

describe("manual requirements and review surface", () => {
  test("opening structured originals never invokes Storage signing, including when the snapshot cannot be read", async () => {
    const file = mock(async () => undefined);
    const snapshot = mock(async () => undefined);
    await openApplicationOriginalCv(
      { hasUploadedCv: false, submittedSource: "cqrityjob_cv" },
      { openFile: file, openSnapshot: snapshot },
    );
    expect(file).not.toHaveBeenCalled();
    expect(snapshot).toHaveBeenCalledTimes(1);
    await expect(
      openApplicationOriginalCv(
        { hasUploadedCv: false, submittedSource: "cqrityjob_cv" },
        {
          openFile: file,
          openSnapshot: async () => {
            throw new Error("ORIGINAL_CV_UNAVAILABLE");
          },
        },
      ),
    ).rejects.toThrow("ORIGINAL_CV_UNAVAILABLE");
    expect(file).not.toHaveBeenCalled();
    // Actual uploads deliberately have no submitted-CV query result.
    await openApplicationOriginalCv(
      { hasUploadedCv: true, submittedSource: null },
      { openFile: file, openSnapshot: snapshot },
    );
    expect(file).toHaveBeenCalledTimes(1);
    expect(snapshot).toHaveBeenCalledTimes(1);
    await expect(
      openApplicationOriginalCv(
        { hasUploadedCv: false, submittedSource: null },
        { openFile: file, openSnapshot: snapshot },
      ),
    ).rejects.toThrow("ORIGINAL_CV_UNAVAILABLE");
    expect(file).toHaveBeenCalledTimes(1);
    expect(snapshot).toHaveBeenCalledTimes(1);
  });
  const render = (lang: "sv" | "en", value: RequirementReview) =>
    renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider initialLang={lang}>
          <RequirementReviewEditor
            employerId={value.employerId}
            employerSlug="synthetic"
            applicationId={value.applicationId}
            review={value}
            team={[{ userId: id(3), name: "Synthetic recruiter", role: "owner", isSelf: true }]}
            cases={[]}
            onOpenCv={unexpected}
            onReload={unexpected}
          />
        </I18nProvider>
      </QueryClientProvider>,
    );
  test("save payload keeps exact requirement/source/version and separate neutral question; no review is inferred", () => {
    expect(decisionsFromReview(review)).toEqual([
      {
        requirementId: id(1),
        state: "met",
        sourceKind: "application_answer",
        sourceReference: id(2),
        sourceVersion: "source-v1",
        sourceLabel: "Original answer",
        validUntil: null,
        note: "Original answer checked",
        neutralQuestion: "Which date does this apply from?",
      },
    ]);
    expect(review.reviewState).toBe("pending");
  });
  for (const lang of ["sv", "en"] as const) {
    test(`${lang}: original source is escaped, source/version and follow-up visible; explicit confirmation and source handoff start unchecked`, () => {
      const html = render(lang, review);
      expect(html).toContain("Candidate&#x27;s &lt;original&gt; statement");
      expect(html).toContain(source.reference);
      expect(html).toContain(source.version);
      expect(html).toContain(criterion.neutralQuestion!);
      expect(html).toContain("Check the original document");
      expect(html).toMatch(/data-testid="review-confirm"[^>]*disabled=""/);
      expect(html).not.toMatch(/data-testid="review-confirm-ack"[^>]*checked/);
      expect(html).not.toMatch(/data-testid="handoff-requirement"[^>]*checked/);
      expect(html).toContain(lang === "sv" ? "Ingenti" : "Nothing is sent");
    });
    test(`${lang}: read-only seats see evidence but cannot make findings, confirm review or hand off`, () => {
      const html = render(lang, { ...review, canManage: false });
      expect(html).toMatch(/data-testid="criterion-state"[^>]*disabled=""/);
      expect(html).toMatch(/data-testid="review-save-draft"[^>]*disabled=""/);
      expect(html).toContain("Candidate&#x27;s &lt;original&gt; statement");
      expect(html).not.toContain('data-testid="requirement-handoff"');
    });
    test(`${lang}: missing source needs clarification, empty/unconfirmed profile cannot be confirmed or transferred`, () => {
      const html = render(lang, {
        ...review,
        requirementStatus: "not_established",
        criteria: [{ ...criterion, state: "clarify", source: null, note: null }],
        availableSources: [],
        profile: { ...review.profile, profileId: null, confirmedAt: null, version: 0 },
      });
      expect(html).toContain('data-status="not_established"');
      expect(html).toMatch(/<fieldset[^>]*disabled/);
      expect(html).not.toContain('data-testid="requirement-handoff"');
      const profileHtml = renderToStaticMarkup(
        <QueryClientProvider client={new QueryClient()}>
          <I18nProvider initialLang={lang}>
            <RequirementProfileEditor
              employerId={review.employerId}
              profile={{
                ...review.profile,
                rules: [],
                requirements: [],
                profileId: null,
                confirmedAt: null,
                version: 0,
              }}
              onReload={unexpected}
            />
          </I18nProvider>
        </QueryClientProvider>,
      );
      expect(profileHtml).toMatch(/<button type="submit"[^>]*disabled/);
      expect(profileHtml).toContain(
        lang === "sv" ? "Skallkrav inte fastställda" : "Mandatory requirements not established",
      );
    });
  }
});
