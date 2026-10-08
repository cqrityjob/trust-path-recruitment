import { describe, expect, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nProvider } from "../src/i18n/context";
import { applicationListSearch } from "../src/lib/recruitment/application-list-search";
import {
  candidateViewSchema,
  compactView,
  firstPage,
  stepStatesOf,
} from "../src/lib/recruitment/definitions";
import {
  RecruiterCounts,
  RequirementStatusBadge,
  ReviewStatusBadge,
  AnalysisStatusBadge,
} from "../src/components/recruitment/RecruiterStatus";

describe("shared organisation / recruitment list navigation", () => {
  test("advert free text cannot complete the P1 requirements step without explicit profile confirmation", () => {
    const input = {
      requirementsCount: 4,
      questionsCount: 4,
      hasRequirementsText: true,
      advertReady: true,
      phase: "draft" as const,
      total: 0,
      unresolved: 0,
    };
    expect(stepStatesOf({ ...input, requirementProfileConfirmed: false }).requirements).toBe(
      "current",
    );
    expect(stepStatesOf({ ...input, requirementProfileConfirmed: true }).requirements).toBe("done");
  });
  test("back/reload retain independent filters, sort and page; changing a filter resets only pagination", () => {
    const raw = {
      job: "10000000-0000-4000-8000-000000000001",
      stage: "received",
      requirement: "yellow",
      review: "remaining",
      analysis: "not_used",
      assessment: "open",
      status: "reviewing",
      sort: "name",
      dir: "asc",
      page: 3,
      q: "Synthetic",
    };
    const parsed = candidateViewSchema.parse(raw);
    expect(compactView(parsed)).toEqual(raw);
    const { page: _page, ...withoutPage } = raw;
    expect(firstPage(parsed)).toEqual(withoutPage);
  });
  test("existing lifecycle links preserve exact hired/rejected filters and explicit date sorting", () => {
    expect(applicationListSearch({ status: "hired", sort: "oldest", page: 2 })).toEqual({
      status: "hired",
      stage: "all",
      sort: "applied",
      dir: "asc",
      page: 2,
    });
    expect(applicationListSearch({ status: "rejected", sort: "newest" })).toEqual({
      status: "rejected",
      stage: "all",
      sort: "applied",
      dir: "desc",
    });
    expect(applicationListSearch({ status: "archived" })).toEqual({ stage: "archived" });
  });
  test("invalid filters do not become a requirement fulfilment assertion", () => {
    expect(
      candidateViewSchema.parse({
        requirement: "best_candidate",
        review: "opened",
        analysis: "AI_passed",
        page: -5,
      }),
    ).toEqual({ requirement: undefined, review: undefined, analysis: undefined, page: undefined });
    expect(compactView({ sort: "requirements", page: 1 })).toEqual({});
    expect(compactView({ sort: "applied" })).toEqual({ sort: "applied" });
  });
});

describe("P1 status axes and server counts", () => {
  for (const lang of ["sv", "en"] as const) {
    test(`${lang}: 100 oracle counts come from full server population, including yellow/gray reviewed and remaining`, () => {
      const html = renderToStaticMarkup(
        <I18nProvider initialLang={lang}>
          <RecruiterCounts
            counts={{
              received: 100,
              reviewed: 27,
              remaining: 73,
              green: 40,
              yellow: 25,
              gray: 35,
              notEstablished: 0,
              filtered: 25,
              filteredReviewed: 7,
              filteredRemaining: 18,
              archived: 0,
              withdrawn: 0,
              decided: 0,
            }}
            onView={() => {
              throw new Error("render navigated");
            }}
          />
        </I18nProvider>,
      );
      for (const count of [100, 27, 73, 40, 25, 35]) expect(html).toContain(`>${count}</strong>`);
      expect(html).toContain(
        lang === "sv"
          ? "25 ansökningar · 7 granskade · 18 återstående"
          : "25 applications · 7 reviewed · 18 remaining",
      );
      expect(html).toContain(lang === "sv" ? "kan överlappa" : "may overlap");
    });
    test(`${lang}: green requirements and pending human review remain separate; no technical or recruitment decision is implied`, () => {
      const html = renderToStaticMarkup(
        <I18nProvider initialLang={lang}>
          <RequirementStatusBadge status="green" />
          <ReviewStatusBadge status="pending" />
          <AnalysisStatusBadge />
        </I18nProvider>,
      );
      expect(html).toContain('data-status="green"');
      expect(html).toContain('data-status="pending"');
      expect(html).toContain(lang === "sv" ? "Inte färdiggranskad" : "Not yet reviewed");
      expect(html).toContain(
        lang === "sv" ? "Teknisk analys: används inte" : "Technical analysis: not used",
      );
      expect(html).not.toMatch(/score|ranking|personlighet|personality|hired|rejected|truth/i);
    });
  }
});
