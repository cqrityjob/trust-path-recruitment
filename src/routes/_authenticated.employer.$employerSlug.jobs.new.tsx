// Phase H3 — /employer/$employerSlug/jobs/new: create a new draft.

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useT } from "@/i18n/context";
import { EmployerAppShell } from "@/components/employer/EmployerAppShell";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { listMyEmployerWorkspaces } from "@/lib/job-intelligence/membership.functions";
import {
  saveEmployerJobDraft,
  submitEmployerJob,
  publishEmployerJob,
} from "@/lib/job-intelligence/employer-jobs.functions";
import { PUBLICATION_MODEL } from "@/components/employer/job-form/model";
import { JobPublishedPanel } from "@/components/employer/job-form/JobPublishedPanel";
import {
  EmployerJobForm,
  emptyValues,
  toServerPayload,
  type EmployerJobFormValues,
} from "@/components/employer/EmployerJobForm";

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/jobs/new")({
  ssr: false,
  component: EmployerJobNewPage,
  errorComponent: EmployerErrorState,
});

function EmployerJobNewPage() {
  const { employerSlug } = Route.useParams();
  const { t } = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const listWorkspaces = useServerFn(listMyEmployerWorkspaces);
  const saveFn = useServerFn(saveEmployerJobDraft);
  const submitFn = useServerFn(submitEmployerJob);
  const publishFn = useServerFn(publishEmployerJob);

  const workspacesQuery = useQuery({
    queryKey: ["employer", "my-workspaces"],
    queryFn: () => listWorkspaces(),
  });
  const workspace = workspacesQuery.data?.find((w) => w.employerSlug === employerSlug);

  const [formError, setFormError] = useState<string | null>(null);
  /** Set once the advertisement is live, so the page can confirm it
   *  instead of navigating away in silence. */
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (values: EmployerJobFormValues) => {
      if (!workspace) throw new Error("ACCESS_NOT_AVAILABLE");
      return saveFn({ data: { employerId: workspace.employerId, ...toServerPayload(values) } });
    },
    onSuccess: (result) => {
      if (!workspace) return;
      qc.invalidateQueries({ queryKey: ["employer", workspace.employerId, "jobs"] });
      qc.invalidateQueries({ queryKey: ["employer", workspace.employerId, "dashboard-stats"] });
      navigate({
        to: "/employer/$employerSlug/jobs/$jobId/edit",
        params: { employerSlug, jobId: result.id },
      });
    },
    onError: (e: any) => setFormError(e?.message ?? "SAVE_DRAFT_FAILED"),
  });

  // Save first, then publish: the employer's last keystrokes must reach the
  // row before the database validates it, or publication would judge a
  // version of the advert nobody is looking at.
  const publishMutation = useMutation({
    mutationFn: async (values: EmployerJobFormValues) => {
      if (!workspace) throw new Error("ACCESS_NOT_AVAILABLE");
      const saved = await saveFn({
        data: { employerId: workspace.employerId, ...toServerPayload(values) },
      });
      if (PUBLICATION_MODEL === "moderated") {
        await submitFn({ data: { employerId: workspace.employerId, jobId: saved.id } });
        return null;
      }
      return publishFn({ data: { employerId: workspace.employerId, jobId: saved.id } });
    },
    onSuccess: (result) => {
      if (!workspace) return;
      qc.invalidateQueries({ queryKey: ["employer", workspace.employerId, "jobs"] });
      qc.invalidateQueries({ queryKey: ["employer", workspace.employerId, "dashboard-stats"] });
      if (result?.slug) {
        setPublishedSlug(result.slug);
        return;
      }
      navigate({ to: "/employer/$employerSlug/jobs", params: { employerSlug } });
    },
    onError: (e: any) =>
      setFormError(
        e?.message ??
          (PUBLICATION_MODEL === "moderated" ? "SUBMIT_FOR_REVIEW_FAILED" : "PUBLISH_JOB_FAILED"),
      ),
  });

  if (workspacesQuery.isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
      </div>
    );
  }

  if (!workspace) {
    return <EmployerAccessDenied workspaces={workspacesQuery.data} />;
  }

  return (
    <EmployerAppShell
      employerSlug={employerSlug}
      employerName={workspace.employerName}
      role={workspace.role}
      status={workspace.employerStatus}
      activeSection="jobs"
      hasMultipleWorkspaces={(workspacesQuery.data?.length ?? 0) > 1}
    >
      {publishedSlug ? (
        <JobPublishedPanel employerSlug={employerSlug} jobSlug={publishedSlug} />
      ) : (
        <>
          <div className="mb-6">
            <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
              {t("employer.jobs.new.heading")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {t("employer.jobs.new.lede")}
            </p>
          </div>

          <EmployerJobForm
            initial={emptyValues}
            employerName={workspace.employerName}
            employerStatus={workspace.employerStatus}
            saving={saveMutation.isPending}
            submitting={publishMutation.isPending}
            error={formError}
            onSaveDraft={(v) => {
              setFormError(null);
              saveMutation.mutate(v);
            }}
            onPublish={(v) => {
              setFormError(null);
              publishMutation.mutate(v);
            }}
          />
        </>
      )}
    </EmployerAppShell>
  );
}
