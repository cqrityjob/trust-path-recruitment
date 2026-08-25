// Phase H3 — /employer/$employerSlug/jobs/$jobId/edit: edit a draft or
// rejected job. Non-editable statuses (pending_review/published/
// archived/expired) show a read-only view with duplicate/close actions.

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { useT } from "@/i18n/context";
import { EmployerAppShell } from "@/components/employer/EmployerAppShell";
import { ConfirmAction, usePendingConfirm } from "@/components/employer/ConfirmAction";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { listMyEmployerWorkspaces } from "@/lib/job-intelligence/membership.functions";
import {
  getEmployerJob,
  saveEmployerJobDraft,
  submitEmployerJob,
  publishEmployerJob,
  closeEmployerJob,
  duplicateEmployerJob,
} from "@/lib/job-intelligence/employer-jobs.functions";
import {
  EmployerJobForm,
  fromJobRow,
  toServerPayload,
  type EmployerJobFormValues,
} from "@/components/employer/EmployerJobForm";
import { jobStatusLabel } from "@/lib/job-intelligence/enum-labels";
import { PUBLICATION_MODEL } from "@/components/employer/job-form/model";
import { JobPublishedPanel } from "@/components/employer/job-form/JobPublishedPanel";

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/jobs/$jobId/edit")({
  ssr: false,
  component: EmployerJobEditPage,
  errorComponent: EmployerErrorState,
});

function EmployerJobEditPage() {
  const { employerSlug, jobId } = Route.useParams();
  const { t, lang } = useT();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const listWorkspaces = useServerFn(listMyEmployerWorkspaces);
  const getFn = useServerFn(getEmployerJob);
  const saveFn = useServerFn(saveEmployerJobDraft);
  const submitFn = useServerFn(submitEmployerJob);
  const publishFn = useServerFn(publishEmployerJob);
  const closeFn = useServerFn(closeEmployerJob);
  const dupFn = useServerFn(duplicateEmployerJob);

  const workspacesQuery = useQuery({
    queryKey: ["employer", "my-workspaces"],
    queryFn: () => listWorkspaces(),
  });
  const workspace = workspacesQuery.data?.find((w) => w.employerSlug === employerSlug);

  const jobQuery = useQuery({
    queryKey: ["employer", workspace?.employerId ?? "_", "job", jobId],
    queryFn: () => getFn({ data: { employerId: workspace!.employerId, jobId } }),
    enabled: !!workspace,
  });

  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = usePendingConfirm<"close" | "duplicate">();
  const [publishedSlug, setPublishedSlug] = useState<string | null>(null);

  const saveMutation = useMutation({
    mutationFn: async (values: EmployerJobFormValues) => {
      if (!workspace) throw new Error("ACCESS_NOT_AVAILABLE");
      return saveFn({
        data: { employerId: workspace.employerId, id: jobId, ...toServerPayload(values) },
      });
    },
    onSuccess: () => {
      if (!workspace) return;
      qc.invalidateQueries({ queryKey: ["employer", workspace.employerId, "job", jobId] });
      qc.invalidateQueries({ queryKey: ["employer", workspace.employerId, "jobs"] });
    },
    onError: (e: any) => setFormError(e?.message ?? "SAVE_DRAFT_FAILED"),
  });

  // Save first, then publish, for the same reason as the create route: the
  // database validates the stored row, not the form state.
  const publishMutation = useMutation({
    mutationFn: async (values: EmployerJobFormValues) => {
      if (!workspace) throw new Error("ACCESS_NOT_AVAILABLE");
      await saveFn({
        data: { employerId: workspace.employerId, id: jobId, ...toServerPayload(values) },
      });
      if (PUBLICATION_MODEL === "moderated") {
        await submitFn({ data: { employerId: workspace.employerId, jobId } });
        return null;
      }
      return publishFn({ data: { employerId: workspace.employerId, jobId } });
    },
    onSuccess: (result) => {
      if (!workspace) return;
      qc.invalidateQueries({ queryKey: ["employer", workspace.employerId, "jobs"] });
      qc.invalidateQueries({ queryKey: ["employer", workspace.employerId, "dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["employer", workspace.employerId, "job", jobId] });
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

  const closeMutation = useMutation({
    mutationFn: () => {
      if (!workspace) throw new Error("ACCESS_NOT_AVAILABLE");
      return closeFn({ data: { employerId: workspace.employerId, jobId } });
    },
    onSuccess: () => {
      if (!workspace) return;
      qc.invalidateQueries({ queryKey: ["employer", workspace.employerId, "jobs"] });
      qc.invalidateQueries({ queryKey: ["employer", workspace.employerId, "dashboard-stats"] });
      qc.invalidateQueries({ queryKey: ["employer", workspace.employerId, "job", jobId] });
    },
    onError: (e: any) => setFormError(e?.message ?? "CLOSE_JOB_FAILED"),
  });

  const dupMutation = useMutation({
    mutationFn: () => {
      if (!workspace) throw new Error("ACCESS_NOT_AVAILABLE");
      return dupFn({ data: { employerId: workspace.employerId, jobId } });
    },
    onSuccess: (result) => {
      if (!workspace) return;
      qc.invalidateQueries({ queryKey: ["employer", workspace.employerId, "jobs"] });
      navigate({
        to: "/employer/$employerSlug/jobs/$jobId/edit",
        params: { employerSlug, jobId: result.id },
      });
    },
    onError: (e: any) => setFormError(e?.message ?? "DUPLICATE_JOB_FAILED"),
  });

  if (workspacesQuery.isLoading || (workspace && jobQuery.isLoading)) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
      </div>
    );
  }

  if (!workspace || jobQuery.isError || !jobQuery.data) {
    return <EmployerAccessDenied workspaces={workspacesQuery.data} />;
  }

  const job = jobQuery.data as Record<string, any>;
  const editable = job.status === "draft" || job.status === "rejected";
  const closeable = job.status === "published";

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
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
                {t("employer.jobs.edit.heading")}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {t("employer.jobs.list.status")}:{" "}
                <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-xs font-medium">
                  {jobStatusLabel(job.status, lang) || job.status}
                </span>
              </p>
            </div>
            {job.status === "published" && (
              <Link
                to="/jobs/$slug"
                params={{ slug: job.slug }}
                className="text-sm font-medium text-accent hover:underline"
                target="_blank"
                rel="noopener"
              >
                {t("employer.jobs.edit.viewPublic")} ↗
              </Link>
            )}
          </div>

          {!editable && (
            <div className="mb-6 rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              {t("employer.jobs.edit.notEditable")}
              <div className="mt-3 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={dupMutation.isPending}
                  onClick={() => {
                    setFormError(null);
                    setPending({ kind: "duplicate", id: jobId });
                  }}
                  className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted/40"
                >
                  {t("employer.jobs.edit.duplicate")}
                </button>
                {closeable && (
                  <button
                    type="button"
                    disabled={closeMutation.isPending}
                    onClick={() => {
                      setFormError(null);
                      setPending({ kind: "close", id: jobId });
                    }}
                    className="rounded-md border border-destructive/60 px-3 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10"
                  >
                    {t("employer.jobs.edit.close")}
                  </button>
                )}
              </div>
              {pending && (
                <ConfirmAction
                  open
                  onOpenChange={(o) => {
                    if (!o) setPending(null);
                  }}
                  busy={closeMutation.isPending || dupMutation.isPending}
                  title={t(
                    pending.kind === "close"
                      ? "employer.jobs.confirm.close.title"
                      : "employer.jobs.confirm.duplicate.title",
                  )}
                  consequence={t(
                    pending.kind === "close"
                      ? "employer.jobs.confirm.close.body"
                      : "employer.jobs.confirm.duplicate.body",
                  )}
                  confirmLabel={t(
                    pending.kind === "close"
                      ? "employer.jobs.list.close"
                      : "employer.jobs.list.duplicate",
                  )}
                  cancelLabel={t("employer.workforce.form.cancel")}
                  onConfirm={() => {
                    const { kind } = pending;
                    setPending(null);
                    if (kind === "close") closeMutation.mutate();
                    else dupMutation.mutate();
                  }}
                />
              )}
            </div>
          )}

          <EmployerJobForm
            initial={fromJobRow(job)}
            readOnly={!editable}
            editableStatus={job.status}
            employerName={workspace.employerName}
            employerStatus={workspace.employerStatus}
            saving={saveMutation.isPending}
            submitting={publishMutation.isPending}
            error={formError}
            onSaveDraft={(v) => {
              setFormError(null);
              saveMutation.mutate(v);
            }}
            onPublish={
              editable
                ? (v) => {
                    setFormError(null);
                    publishMutation.mutate(v);
                  }
                : undefined
            }
          />
        </>
      )}
    </EmployerAppShell>
  );
}
