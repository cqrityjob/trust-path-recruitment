// Credential-free render regression for the real boundary and EmployerAppShell.
// Transport/workspace suppliers are isolated mocks; API denial remains an E4
// browser/direct-API assertion, which this check does not replace.
import { mock } from "bun:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const unexpected = () => {
  throw new Error("Render must not dispatch a read, write, sign-out or acknowledgement");
};
const actualRouter = await import("@tanstack/react-router");
mock.module("@tanstack/react-router", () => ({
  ...actualRouter,
  useNavigate: () => unexpected,
  Link: ({
    to,
    children,
    className,
  }: {
    to: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={to} className={className}>
      {children}
    </a>
  ),
}));
mock.module("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
mock.module("@/lib/interview-intelligence/runtime.functions", () => ({
  getInterviewCase: unexpected,
  acknowledgeObservedInterviewContent: unexpected,
}));
mock.module("@/lib/job-intelligence/membership.functions", () => ({
  listMyEmployerWorkspaces: unexpected,
}));
mock.module("@/lib/job-intelligence/feature-flag", () => ({ employerPortalEnabled: () => true }));
mock.module("@/integrations/supabase/client", () => ({
  supabase: { auth: { getSession: unexpected, signOut: unexpected } },
}));

const { I18nProvider } = await import("../src/i18n/context");
const { dictionaries } = await import("../src/i18n/dictionaries");
const { CaseContentBoundary } =
  await import("../src/components/employer/interview/CaseContentBoundary");

const caseId = "00000000-0000-4000-8000-000000000040";
const workspace = {
  employerId: "00000000-0000-4000-8000-000000000041",
  employerSlug: "synthetic-boundary",
  employerName: "Synthetic own organisation",
  employerStatus: "active",
  role: "member",
};
function render(lang: "sv" | "en", outcome: "denied" | "error" | "missing" | "pending") {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, retryOnMount: false, staleTime: Infinity } },
  });
  client.setQueryData(["employer", "my-workspaces"], [workspace]);
  const query = client.getQueryCache().build(client, { queryKey: ["ii", "case", caseId] });
  if (outcome === "denied" || outcome === "error") {
    query.setState({
      status: "error",
      fetchStatus: "idle",
      error: new Error(outcome === "denied" ? "INTERVIEW_CASE_NOT_FOUND" : "INTERVIEW_READ_FAILED"),
      data: undefined,
    });
  } else if (outcome === "missing") {
    query.setData({ id: caseId, candidateDisplayName: "PRIVATE CASE SENTINEL" });
  }
  const html = renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <I18nProvider initialLang={lang}>
        <CaseContentBoundary employerSlug={workspace.employerSlug} caseId={caseId}>
          <p>PRIVATE CHILD SENTINEL</p>
        </CaseContentBoundary>
      </I18nProvider>
    </QueryClientProvider>,
  );
  client.clear();
  return html;
}

let cases = 0;
for (const lang of ["sv", "en"] as const) {
  for (const outcome of ["denied", "error", "missing", "pending"] as const) {
    const html = render(lang, outcome);
    const main = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1];
    assert.ok(main, `${lang}/${outcome}: actual employer main must remain present`);
    const heading =
      dictionaries[lang][
        outcome === "denied"
          ? "iiu.denied.title"
          : outcome === "pending"
            ? "iiu.loading"
            : "iiu.error.title"
      ];
    assert.ok(main.includes(heading), `${lang}/${outcome}: correct state must be in main`);
    assert.ok(
      html.includes(workspace.employerName),
      "Only the caller's own workspace shell is used",
    );
    assert.doesNotMatch(
      html,
      /PRIVATE CHILD SENTINEL|PRIVATE CASE SENTINEL|INTERVIEW_CASE_NOT_FOUND/,
    );
    assert.ok(!main.includes(dictionaries[lang]["ri.snapshot.review.title"]));
    cases += 1;
  }
}
console.log(
  `PASS: ${cases} SV/EN real boundary + employer shell states; no case content or action exposed`,
);
