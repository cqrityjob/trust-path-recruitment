// Tests & material — the second of the case's four stages.
//
// What the candidate does before the interview, gathered in one place with its
// real status and the next thing to do: the TRUST test through the one
// governed assignment path (the application's), and a BESKT preparation linked
// to this case. Nothing here is a gate. An optional test that is not part of
// the setup is shown as "not assigned", never as failed, and the interview can
// be started whatever the candidate has done. A failed read says so; it is
// never shown as "nothing there".

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { EmployerAppShell } from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { useEmployerWorkspace } from "@/lib/job-intelligence/use-employer-workspace";
import {
  CaseHeader,
  WorkflowNav,
  Panel,
  State,
  interviewErrorMessage,
  PRIMARY_BUTTON,
  BUTTON,
} from "@/components/employer/interview/InterviewUi";
import { Section } from "@/components/employer/interview/InterviewLayout";
import { CaseSetupStrip } from "@/components/library/CaseSetupStrip";
import { ApplicationAssessmentPanel } from "@/components/academy/ApplicationAssessmentPanel";
import {
  getInterviewCase,
  startInterviewSession,
} from "@/lib/interview-intelligence/runtime.functions";
import { listBesktAssignments } from "@/lib/beskt/complete.functions";
import { getCaseSetup } from "@/lib/library/setup.functions";

export const Route = createFileRoute(
  "/_authenticated/employer/$employerSlug/interview-intelligence/$caseId/tests",
)({ ssr: false, component: Page, errorComponent: EmployerErrorState });

const BESKT_STATE: Record<string, TranslationKey> = {
  assigned: "iiu.ts.state.invited",
  notice_acknowledged: "iiu.ts.state.inProgress",
  in_progress: "iiu.ts.state.inProgress",
  submitted: "iiu.ts.state.done",
  cancelled: "iiu.ts.state.cancelled",
};

function Page() {
  const { employerSlug, caseId } = Route.useParams();
  const ws = useEmployerWorkspace(employerSlug);
  const { t } = useT();
  const caseFn = useServerFn(getInterviewCase);
  const besktFn = useServerFn(listBesktAssignments);
  const setupFn = useServerFn(getCaseSetup);
  const startFn = useServerFn(startInterviewSession);
  const navigate = useNavigate();
  // With an approved plan the interview is started from here too: a link to
  // an interview page with no session behind it was a dead end.
  const start = useMutation({
    mutationFn: () => startFn({ data: { caseId } }),
    onSuccess: () =>
      void navigate({
        to: "/employer/$employerSlug/interview-intelligence/$caseId/interview",
        params: { employerSlug, caseId },
      }),
  });

  const q = useQuery({
    queryKey: ["ii", "case", caseId],
    queryFn: () => caseFn({ data: { caseId } }),
    retry: false,
  });
  const setup = useQuery({
    queryKey: ["ii", "setup", caseId],
    queryFn: () => setupFn({ data: { caseId } }),
    retry: false,
  });
  const beskt = useQuery({
    queryKey: ["beskt", "assignments", ws.workspace?.employerId],
    queryFn: () => besktFn({ data: { employerId: ws.workspace!.employerId } }),
    enabled: Boolean(ws.workspace?.employerId),
    retry: false,
  });

  if (ws.isLoading)
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <State kind="loading" />
      </div>
    );
  if (ws.isError || !ws.workspace) return <EmployerAccessDenied workspaces={ws.workspaces} />;

  const shell = (children: React.ReactNode) => (
    <EmployerAppShell
      employerSlug={ws.workspace!.employerSlug}
      employerName={ws.workspace!.employerName}
      role={ws.workspace!.role}
      status={ws.workspace!.employerStatus}
      activeSection="interviewIntelligence"
      hasMultipleWorkspaces={ws.hasMultipleWorkspaces}
    >
      {children}
    </EmployerAppShell>
  );

  if (q.isLoading) return shell(<State kind="loading" />);
  if (q.isError || !q.data) {
    const notFound = q.isError && (q.error as Error).message.includes("NOT_FOUND");
    return shell(
      <State
        kind={notFound ? "denied" : "error"}
        message={notFound || !q.isError ? undefined : interviewErrorMessage(q.error, t)}
      />,
    );
  }
  const d = q.data;
  const canAssign = ws.workspace.role !== "member";
  const linked = (beskt.data ?? []).filter((r) => r.caseId === caseId);
  const planApproved = !["draft", "sources_ready", "prep_generated"].includes(d.status);
  const isBeskt = setup.data?.method === "beskt" || linked.length > 0;

  return shell(
    <>
      <nav className="text-sm">
        <Link
          to="/employer/$employerSlug/interview-intelligence/$caseId"
          params={{ employerSlug, caseId }}
          className="inline-flex min-h-11 items-center text-accent underline-offset-2 hover:underline"
        >
          {t("iiu.ov.backtocase")}
        </Link>
      </nav>
      <div className="mt-3">
        <CaseHeader
          candidate={d.candidateDisplayName}
          role={d.packName ?? d.title}
          status={d.status}
        />
      </div>
      <div className="mt-5">
        <WorkflowNav
          status={d.status}
          current="tests"
          employerSlug={employerSlug}
          caseId={caseId}
        />
        <CaseSetupStrip caseId={caseId} />
      </div>

      <div className="mt-8 max-w-3xl space-y-10" data-testid="case-tests">
        <Section id="t-trust" title={t("iiu.ts.trust.title")} description={t("iiu.ts.trust.body")}>
          {d.applicationId ? (
            <ApplicationAssessmentPanel
              employerId={ws.workspace.employerId}
              employerSlug={employerSlug}
              applicationId={d.applicationId}
              canAssign={canAssign}
            />
          ) : (
            <p
              className="rounded-lg border border-dashed border-border px-4 py-4 text-sm text-muted-foreground"
              data-testid="case-tests-standalone"
            >
              {t("iiu.ts.trust.standalone")}
            </p>
          )}
        </Section>

        {isBeskt ? (
          <Section
            id="t-beskt"
            title={t("iiu.ts.beskt.title")}
            description={t("iiu.ts.beskt.body")}
          >
            {beskt.isError ? (
              <Panel tone="governance" role="alert" title={t("iiu.ts.readFailed")}>
                <p>{interviewErrorMessage(beskt.error, t)}</p>
              </Panel>
            ) : linked.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-4 py-4 text-sm text-muted-foreground">
                {t("iiu.ts.beskt.none")}
              </p>
            ) : (
              <ul className="space-y-2" data-testid="case-tests-beskt">
                {linked.map((r) => (
                  <li
                    key={r.assignmentId}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3 text-sm"
                  >
                    <span>
                      <span className="font-medium">BESKT</span> ·{" "}
                      {t(BESKT_STATE[r.lifecycleState] ?? "iiu.ts.state.inProgress")}
                    </span>
                    <Link
                      to="/employer/$employerSlug/assessments/beskt/$assignmentId"
                      params={{ employerSlug, assignmentId: r.assignmentId }}
                      className={BUTTON}
                    >
                      {t("iiu.ts.beskt.open")}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
          {d.status === "prep_approved" ? (
            <button
              type="button"
              className={PRIMARY_BUTTON}
              onClick={() => start.mutate()}
              disabled={start.isPending}
              data-testid="case-tests-next"
            >
              {t("iiu.pp.start")}
            </button>
          ) : planApproved ? (
            <Link
              to="/employer/$employerSlug/interview-intelligence/$caseId/interview"
              params={{ employerSlug, caseId }}
              className={PRIMARY_BUTTON}
              data-testid="case-tests-next"
            >
              {t("iiu.ts.next.interview")}
            </Link>
          ) : (
            <Link
              to="/employer/$employerSlug/interview-intelligence/$caseId/prepare"
              params={{ employerSlug, caseId }}
              className={PRIMARY_BUTTON}
              data-testid="case-tests-next"
            >
              {t("iiu.ts.next.plan")}
            </Link>
          )}
          <p className="text-xs text-muted-foreground">{t("iiu.ts.notGate")}</p>
          {start.isError ? (
            <Panel tone="governance" role="alert" title={t("iiu.pp.start.failed")}>
              <p>{interviewErrorMessage(start.error, t)}</p>
            </Panel>
          ) : null}
        </div>
      </div>
    </>,
  );
}
