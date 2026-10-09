// The application's views, next step and notice state are pure functions over
// what the server returned. Exhausted here so a list row, the application
// page and the overview can never read the same facts differently.
//
// Run: bun test scripts/application-workflow.test.ts

import { describe, expect, test } from "bun:test";
import {
  ACTIVE_SUBSTEPS,
  PRIMARY_VIEWS,
  activeSubstepOf,
  advancedFilterCount,
  candidateNoticeStateOf,
  clarificationRequestBody,
  nextStepOf,
  noticeStateOfMessage,
  primaryViewOf,
  requirementSummaryOf,
  viewForPrimary,
  viewForSubstep,
} from "../src/lib/recruitment/application-workflow";
import { STAGE_FILTERS, compactView } from "../src/lib/recruitment/definitions";

describe("primary views are the server's stage filters under a recruiter's names", () => {
  test("every stage filter belongs to exactly one primary view", () => {
    for (const stage of STAGE_FILTERS) {
      expect(PRIMARY_VIEWS).toContain(primaryViewOf(stage));
    }
    expect(primaryViewOf(undefined)).toBe("open");
    expect(primaryViewOf("new")).toBe("open");
    expect(primaryViewOf("review")).toBe("open");
    expect(primaryViewOf("interview")).toBe("open");
    expect(primaryViewOf("decided")).toBe("decided");
    expect(primaryViewOf("archived")).toBe("archived");
    expect(primaryViewOf("all")).toBe("all");
    expect(primaryViewOf("received")).toBe("all");
  });

  test("switching view keeps whose applications, drops the work-only narrowing and the page", () => {
    const from = {
      job: "11111111-1111-4111-8111-111111111111",
      owner: "none",
      q: "anna",
      stage: "new" as const,
      review: "remaining" as const,
      requirement: "gray" as const,
      sort: "name" as const,
      dir: "asc" as const,
      page: 3,
    };
    expect(viewForPrimary(from, "decided")).toEqual({
      job: from.job,
      owner: "none",
      q: "anna",
      sort: "name",
      dir: "asc",
      stage: "decided",
    });
    expect(viewForPrimary(from, "archived").stage).toBe("archived");
    expect(viewForPrimary(from, "all").stage).toBe("all");
    // Aktiva is the default: the URL carries no stage at all.
    expect(compactView(viewForPrimary(from, "open")).stage).toBeUndefined();
  });

  test("sub-steps are views over status and requirement status, never a new status", () => {
    expect(activeSubstepOf({})).toBe("all");
    expect(activeSubstepOf({ stage: "new" })).toBe("new");
    expect(activeSubstepOf({ stage: "review" })).toBe("review");
    expect(activeSubstepOf({ stage: "interview" })).toBe("interview");
    expect(activeSubstepOf({ stage: "open", requirement: "gray" })).toBe("clarify");
    expect(activeSubstepOf({ requirement: "gray" })).toBe("clarify");
    // gray on a sub-stage is a filter, not the clarify view.
    expect(activeSubstepOf({ stage: "new", requirement: "gray" })).toBe("new");
    for (const step of ACTIVE_SUBSTEPS) {
      const next = viewForSubstep({ owner: "none", page: 4 }, step);
      expect(next.page).toBeUndefined();
      expect(next.owner).toBe("none");
      expect(activeSubstepOf(next)).toBe(step);
    }
    // The clarify view is exactly the server's open+gray list.
    expect(compactView(viewForSubstep({}, "clarify"))).toEqual({ requirement: "gray" });
    // Leaving clarify drops its requirement filter; another requirement filter stays.
    expect(viewForSubstep({ requirement: "gray" }, "new").requirement).toBeUndefined();
    expect(viewForSubstep({ requirement: "yellow" }, "new").requirement).toBe("yellow");
  });

  test("the fold counts only the filters it hides", () => {
    expect(advancedFilterCount({})).toBe(0);
    expect(advancedFilterCount({ job: "x", owner: "none", q: "a", stage: "new" })).toBe(0);
    expect(advancedFilterCount({ requirement: "gray" })).toBe(0); // the clarify sub-step
    expect(advancedFilterCount({ stage: "decided", requirement: "gray" })).toBe(1);
    expect(
      advancedFilterCount({ requirement: "yellow", review: "stale", analysis: "not_used" }),
    ).toBe(3);
    expect(
      advancedFilterCount({
        ans: "11111111-1111-4111-8111-111111111111:y,22222222-2222-4222-8222-222222222222:n",
      }),
    ).toBe(2);
    expect(advancedFilterCount({ status: "rejected", assessment: "open" })).toBe(2);
  });
});

describe("the next working step follows stage, requirement status and human review", () => {
  const open = (
    status: string,
    requirementStatus: "green" | "yellow" | "gray" | "not_established",
    reviewState: "reviewed" | "pending" | "stale",
  ) => nextStepOf({ status, requirementStatus, reviewState });

  test("a recruitment without a confirmed profile is a profile problem", () => {
    expect(open("submitted", "not_established", "pending")).toBe("profile");
    expect(open("reviewing", "not_established", "reviewed")).toBe("profile");
  });
  test("unreviewed is review; unclear is clarify; stale is reconfirm", () => {
    expect(open("submitted", "green", "pending")).toBe("review");
    expect(open("reviewing", "yellow", "pending")).toBe("review");
    expect(open("submitted", "gray", "pending")).toBe("clarify");
    expect(open("reviewing", "gray", "reviewed")).toBe("clarify");
    expect(open("reviewing", "green", "stale")).toBe("reconfirm");
    expect(open("reviewing", "gray", "stale")).toBe("reconfirm");
  });
  test("a confirmed review leads to a person's decision or the interview", () => {
    expect(open("reviewing", "yellow", "reviewed")).toBe("decideNotMet");
    expect(open("reviewing", "green", "reviewed")).toBe("prepareInterview");
    expect(open("submitted", "green", "reviewed")).toBe("prepareInterview");
  });
  test("the interview stage is the interview, whatever the review says", () => {
    expect(open("interview", "green", "reviewed")).toBe("interview");
    expect(open("interview", "gray", "pending")).toBe("interview");
  });
  test("a decided application is told, then archived; archived is nothing", () => {
    expect(
      nextStepOf({ status: "rejected", requirementStatus: "green", reviewState: "reviewed" }),
    ).toBe("archive");
    expect(
      nextStepOf({
        status: "rejected",
        requirementStatus: "green",
        reviewState: "reviewed",
        noticeDelivered: false,
      }),
    ).toBe("tellCandidate");
    expect(
      nextStepOf({
        status: "hired",
        requirementStatus: "green",
        reviewState: "reviewed",
        noticeDelivered: true,
      }),
    ).toBe("archive");
    expect(nextStepOf({ status: "withdrawn", requirementStatus: null, reviewState: null })).toBe(
      "archive",
    );
    expect(
      nextStepOf({
        status: "rejected",
        requirementStatus: null,
        reviewState: null,
        archived: true,
      }),
    ).toBe("none");
  });
  test("missing server fields read as the neutral state", () => {
    expect(nextStepOf({ status: "submitted", requirementStatus: null, reviewState: null })).toBe(
      "profile",
    );
    expect(nextStepOf({ status: "submitted", requirementStatus: "green", reviewState: null })).toBe(
      "review",
    );
  });
});

describe("the candidate's notice is a separate fact, and a failure is never 'sent'", () => {
  const msg = (
    kind: string,
    status: "draft" | "sent" | "discarded",
    emailStatus: "not_attempted" | "sending" | "sent" | "failed" | "not_configured" | "unknown",
  ) => ({ kind, status, emailStatus });

  test("a decision alone is internal", () => {
    expect(candidateNoticeStateOf("rejected", [])).toBe("internal");
    expect(candidateNoticeStateOf("rejected", [msg("general", "sent", "sent")])).toBe("internal");
    expect(candidateNoticeStateOf("rejected", [msg("offer", "sent", "sent")])).toBe("internal");
    expect(candidateNoticeStateOf("reviewing", [msg("rejection", "sent", "sent")])).toBe(
      "internal",
    );
  });
  test("each message state", () => {
    expect(noticeStateOfMessage(msg("rejection", "draft", "not_attempted"))).toBe("prepared");
    expect(noticeStateOfMessage(msg("rejection", "sent", "not_attempted"))).toBe("queued");
    expect(noticeStateOfMessage(msg("rejection", "sent", "sending"))).toBe("queued");
    expect(noticeStateOfMessage(msg("rejection", "sent", "sent"))).toBe("delivered");
    expect(noticeStateOfMessage(msg("rejection", "sent", "not_configured"))).toBe("delivered");
    expect(noticeStateOfMessage(msg("rejection", "sent", "failed"))).toBe("failed");
    expect(noticeStateOfMessage(msg("rejection", "sent", "unknown"))).toBe("failed");
    expect(noticeStateOfMessage(msg("rejection", "discarded", "not_attempted"))).toBe("internal");
  });
  test("the best state wins, and a failure outranks a draft", () => {
    expect(
      candidateNoticeStateOf("rejected", [
        msg("rejection", "draft", "not_attempted"),
        msg("rejection", "sent", "failed"),
      ]),
    ).toBe("failed");
    expect(
      candidateNoticeStateOf("rejected", [
        msg("rejection", "sent", "sent"),
        msg("rejection", "draft", "not_attempted"),
      ]),
    ).toBe("delivered");
    expect(candidateNoticeStateOf("hired", [msg("offer", "sent", "sending")])).toBe("queued");
    expect(candidateNoticeStateOf("rejected", [msg("rejection", "discarded", "sent")])).toBe(
      "internal",
    );
  });
});

describe("the header count is over human-confirmed mandatory requirements only", () => {
  const c = (
    kind: "mandatory" | "desirable",
    state: "met" | "not_met" | "clarify",
    human: boolean,
    sourceCurrent = true,
  ) => ({
    requirementId: `${kind}-${state}-${human}-${sourceCurrent}-${Math.random()}`,
    kind,
    state,
    reviewedAt: human ? "2026-10-09T08:00:00Z" : null,
    reviewedBy: human ? "user" : null,
    source: state === "clarify" ? null : { kind: "application_answer" },
    sourceCurrent,
  });

  test("preliminary basis never counts as confirmed", () => {
    const s = requirementSummaryOf([
      c("mandatory", "met", true),
      c("mandatory", "met", false),
      c("mandatory", "clarify", false),
      c("desirable", "met", true),
    ]);
    expect(s.mandatoryTotal).toBe(3);
    expect(s.confirmedMet).toBe(1);
    expect(s.preliminaryMet).toBe(1);
    expect(s.unclear).toHaveLength(1);
    expect(s.desirableTotal).toBe(1);
    expect(s.allConfirmed).toBe(false);
  });
  test("merits never complete the picture", () => {
    expect(
      requirementSummaryOf([c("desirable", "met", true), c("desirable", "met", true)]).allConfirmed,
    ).toBe(false);
    expect(requirementSummaryOf([]).allConfirmed).toBe(false);
  });
  test("all confirmed only when every mandatory requirement is met by a person on a current source", () => {
    expect(
      requirementSummaryOf([c("mandatory", "met", true), c("mandatory", "met", true)]).allConfirmed,
    ).toBe(true);
    const changed = requirementSummaryOf([
      c("mandatory", "met", true),
      c("mandatory", "met", true, false),
    ]);
    expect(changed.allConfirmed).toBe(false);
    expect(changed.changedSource).toHaveLength(1);
    expect(
      requirementSummaryOf([c("mandatory", "met", true), c("mandatory", "not_met", true)]).notMet,
    ).toHaveLength(1);
  });
});

describe("a supplement request carries only the reviewer's own neutral questions", () => {
  test("unclear mandatory requirements with a question, in order; nothing generated", () => {
    expect(
      clarificationRequestBody([
        {
          kind: "mandatory",
          state: "clarify",
          neutralQuestion: " Vilket år fick du ditt förordnande? ",
        },
        { kind: "mandatory", state: "clarify", neutralQuestion: null },
        { kind: "mandatory", state: "met", neutralQuestion: "ignored" },
        { kind: "desirable", state: "clarify", neutralQuestion: "ignored too" },
        { kind: "mandatory", state: "clarify", neutralQuestion: "Har du B-körkort?" },
      ]),
    ).toBe("Vilket år fick du ditt förordnande?\n\nHar du B-körkort?");
    expect(
      clarificationRequestBody([{ kind: "mandatory", state: "clarify", neutralQuestion: "  " }]),
    ).toBe("");
  });
});
