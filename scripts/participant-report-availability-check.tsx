/** Application launch gate only; deliberately not a database/RLS test. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mock } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { dictionaries } from "../src/i18n/dictionaries";

type Row = Record<string, unknown>;
type Call = { data: { attemptId: string; audience: "participant" | "employer" }; context: unknown };
type Handler = (call: Call) => Promise<unknown>;
const chain = () => ({
  middleware() {
    return this;
  },
  inputValidator() {
    return this;
  },
  handler(fn: Handler) {
    return fn;
  },
});
await mock.module("@tanstack/react-start", () => ({
  createServerFn: chain,
  useServerFn: (fn: unknown) => fn,
}));
await mock.module("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
const api = await import("../src/lib/security-competency/academy-employer.functions");
let checks = 0;
function check(condition: unknown, label: string) {
  assert.ok(condition, label);
  checks++;
}
const attemptId = "11111111-1111-4111-8111-111111111111";
const row = (context: unknown): Row => ({
  id: "snapshot",
  attempt_id: attemptId,
  subject_id: "subject",
  context,
  released_at: "2026-10-04T12:00:00Z",
  payload: [],
  audience: "participant",
});
for (const audience of ["participant", "employer"] as const) {
  for (const context of [
    { person_context: "candidate" },
    { person_context: "employee" },
    { person_context: "workforce" },
    {},
    null,
    { person_context: "unexpected" },
  ]) {
    const allowed = audience === "employer" || context?.person_context === "candidate";
    const calls: string[] = [];
    const rpc = async (name: string) => {
      calls.push(name);
      return {
        data: name.endsWith("_report")
          ? [row(context)]
          : name === "scp_my_assessment_history"
            ? [{ attempt_id: attemptId, participant_snapshot_id: "snapshot" }]
            : [
                {
                  attempt_id: attemptId,
                  module_version_id: "module",
                  competency_code: "competency",
                },
              ],
        error: null,
      };
    };
    const args: Call = {
      data: { attemptId, audience },
      context: { supabase: { rpc }, userId: "user" },
    };
    const report = await (api.getAcademyReport as unknown as Handler)(args);
    check(
      Boolean(report) === allowed,
      `${audience}/${JSON.stringify(context)} report availability`,
    );
    for (const fn of [api.getDevelopmentRecommendations, api.getSubjectProgress]) {
      calls.length = 0;
      const result = (await (fn as unknown as Handler)(args)) as unknown[];
      check(
        result.length > 0 === allowed,
        `${audience}/${JSON.stringify(context)} supporting read availability`,
      );
      check(
        calls[0] ===
          (audience === "participant" ? "scp_participant_report" : "scp_employer_report"),
        "audience uses its own authorised RPC",
      );
      check(
        allowed || calls.length === 1,
        "blocked context never invokes recommendations/progress RPC",
      );
    }
  }
}
// Subject-wide RPCs must not carry workforce/unknown snapshots into a candidate report.
for (const mixedContext of [{ person_context: "employee" }, null, {}]) {
  for (const audience of ["participant", "employer"] as const) {
    const calls: string[] = [];
    const rpc = async (name: string, args?: { _attempt_id?: string }) => {
      calls.push(name);
      if (name.endsWith("_report"))
        return {
          data: [
            {
              ...row(
                args?._attempt_id === "mixed" ? mixedContext : { person_context: "candidate" },
              ),
              attempt_id: args?._attempt_id,
            },
          ],
          error: null,
        };
      if (name === "scp_my_assessment_history")
        return {
          data: [attemptId, "mixed"].map((id) => ({
            attempt_id: id,
            participant_snapshot_id: "snapshot",
          })),
          error: null,
        };
      if (name === "scp_subject_progress")
        return { data: [attemptId, "mixed"].map((id) => ({ attempt_id: id })), error: null };
      return { data: [{ module_version_id: "module" }], error: null };
    };
    const args: Call = {
      data: { attemptId, audience },
      context: { supabase: { rpc }, userId: "user" },
    };
    const recommendations = (await (api.getDevelopmentRecommendations as unknown as Handler)(
      args,
    )) as unknown[];
    check(
      recommendations.length === (audience === "participant" ? 0 : 1),
      "mixed snapshot history withholds participant aggregate only",
    );
    check(
      audience === "employer" || !calls.includes("scp_development_recommendations"),
      "mixed participant never requests aggregate",
    );
    const progress = (await (api.getSubjectProgress as unknown as Handler)(args)) as {
      attemptId: string;
    }[];
    check(
      progress.length === (audience === "participant" ? 1 : 2),
      "mixed progress filters participant workforce/unknown only",
    );
    check(progress[0].attemptId === attemptId, "candidate progress retained");
  }
}
// Missing reports remain unavailable, and actual read failures remain errors.
const absent: Call = {
  data: { attemptId, audience: "participant" },
  context: { supabase: { rpc: async () => ({ data: [], error: null }) }, userId: "user" },
};
check(
  (await (api.getAcademyReport as unknown as Handler)(absent)) === null,
  "unreleased/unauthorised report remains null",
);
const failed = {
  ...absent,
  context: {
    supabase: { rpc: async () => ({ data: null, error: { message: "fixture_read_failure" } }) },
    userId: "user",
  },
};
await assert.rejects(() => (api.getAcademyReport as unknown as Handler)(failed));
checks++;

// Render actual participant history with a released row in each use case/language.
let lang: "sv" | "en" = "sv";
let historyRows: Row[] = [];
await mock.module("@/i18n/context", () => ({
  useT: () => ({ lang, t: (key: keyof typeof dictionaries.sv) => dictionaries[lang][key] }),
}));
await mock.module("@tanstack/react-query", () => ({
  useQuery: () => ({ data: historyRows, isLoading: false }),
}));
await mock.module("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
  }: {
    children: React.ReactNode;
    to: string;
    params: { attemptId: string };
  }) => <a href={to.replace("$attemptId", params.attemptId)}>{children}</a>,
}));
const { ParticipantAssessmentHistory } =
  await import("../src/components/academy/ParticipantAssessmentHistory");
for (lang of ["sv", "en"] as const) {
  for (const useCase of ["recruitment", "workforce", "unknown"]) {
    for (const lifecycleState of [
      "result_available",
      "ready_to_release",
      "processing",
      "under_review",
    ]) {
      historyRows = [
        {
          attemptId,
          useCase,
          lifecycleState,
          participantSnapshotId: "snapshot",
          assessmentNameSv: "Syntetiskt test",
          assessmentNameEn: "Synthetic assessment",
          issuerName: "Synthetic employer",
        },
      ];
      const html = renderToStaticMarkup(<ParticipantAssessmentHistory lang={lang} />);
      check(
        html.includes(`/academy/report/${attemptId}`) ===
          (useCase === "recruitment" && lifecycleState === "result_available"),
        `${lang}/${useCase}/${lifecycleState} report link`,
      );
      if (useCase !== "recruitment") {
        check(
          html.includes(dictionaries[lang]["academy.history.submitted"]),
          "workforce/unknown gets submitted label",
        );
        check(
          !html.includes(dictionaries[lang]["lifecycle.participant.result_available"]),
          "workforce does not advertise an available report",
        );
      }
    }
  }
}
const index = readFileSync("src/routes/_authenticated.academy.index.tsx", "utf8");
const route = readFileSync("src/routes/_authenticated.academy.report.$attemptId.tsx", "utf8");
check(
  index.includes('row.useCase === "recruitment" && row.releasedAt'),
  "worklist only links recruitment reports",
);
check(
  route.includes('const hasReport = report.data?.context?.personContext === "candidate"'),
  "direct route rejects cached workforce/unknown context",
);
check(
  route.includes("if (!report.data || !hasReport)"),
  "direct route renders unavailable state before document",
);
check(
  (route.match(/enabled: hasReport/g) ?? []).length === 2,
  "both supporting browser reads use same gate",
);
console.log(
  `Participant report availability: ${checks}/${checks} checks passed (app/server fixtures; not RLS proof).`,
);
