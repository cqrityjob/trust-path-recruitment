// The evidence fixture's numbers obey the server's own rules.
//
// The review coverage block on the overview once showed 5 received while its
// four status groups summed to 4, and a "selected list" of 5 for a list of 4
// rows -- numbers typed in by hand, drifting apart. The fixture now computes
// every count from its applications the way rec_ri_candidate_view does, and
// this test holds the invariants a reader of the images would check by hand.
import { describe, expect, test } from "bun:test";
import {
  UPPSALA_APPLICATIONS,
  candidatePage,
  recruitmentOverview,
  selectCandidatePage,
  viewOf,
  type FixtureView,
} from "../e2e/support/employer-portal-fixture";

const VIEWS: FixtureView[] = [
  {},
  { stage: "received" },
  { stage: "archived" },
  { stage: "open", review: "remaining" },
  { stage: "received", review: "remaining" },
  { stage: "received", review: "reviewed" },
  { stage: "received", requirement: "gray" },
  { stage: "new" },
  { status: "submitted" },
];

describe("employer-portal fixture counts", () => {
  test.each(VIEWS)(
    "view %j: status groups partition the population; reviewed + remaining = received",
    (view: FixtureView) => {
      const page = selectCandidatePage(view);
      const c = page.intelligenceCounts;
      expect(c.green + c.yellow + c.gray + c.notEstablished).toBe(c.received);
      expect(c.reviewed + c.remaining).toBe(c.received);
      expect(c.filtered).toBe(page.rows.length);
      expect(c.filteredReviewed + c.filteredRemaining).toBe(c.filtered);
      expect(c.filtered).toBeLessThanOrEqual(c.received);
      expect(page.total).toBe(page.rows.length);
    },
  );

  test("the two overview populations differ and are both derived from the same applications", () => {
    const received = selectCandidatePage({ stage: "received" });
    expect(received.intelligenceCounts.received).toBe(UPPSALA_APPLICATIONS.length);
    expect(received.intelligenceCounts.received).toBe(5);
    expect(received.intelligenceCounts.archived).toBe(1);
    expect(received.intelligenceCounts.decided).toBe(1);
    // New applications: status submitted, not archived.
    expect(candidatePage.counts.new).toBe(2);
    expect(recruitmentOverview.recruitments[0]!.newCount).toBe(2);
    // The actionable review queue is smaller than the historical remainder:
    // the archived, rejected application is reviewed, so both read 3 here --
    // and the queue never includes an archived or decided application.
    const queue = selectCandidatePage({ stage: "open", review: "remaining" });
    expect(queue.rows.every((r) => r.archivedAt === null)).toBe(true);
    expect(
      queue.rows.every((r) => ["submitted", "reviewing", "interview"].includes(r.status)),
    ).toBe(true);
    expect(queue.rows).toHaveLength(3);
    expect(received.intelligenceCounts.remaining).toBe(3);
    expect(received.intelligenceCounts.reviewed).toBe(2);
  });

  test("the default list is the open applications, and the archived one is only under received/archived", () => {
    expect(candidatePage.rows.map((r) => r.name)).toEqual([
      "Ali Ansökande",
      "Birgitta Bevakning",
      "Kim Kandidat",
      "Dana Dörrvakt",
    ]);
    expect(selectCandidatePage({ stage: "archived" }).rows.map((r) => r.name)).toEqual([
      "Erik Efterhand",
    ]);
    expect(selectCandidatePage({ stage: "received" }).rows).toHaveLength(5);
  });

  test("viewOf reads the view out of a server-function call's arguments", () => {
    expect(viewOf({ employerId: "x", jobId: null, view: { stage: "received" } })).toEqual({
      stage: "received",
    });
    expect(viewOf({})).toEqual({});
  });
});
