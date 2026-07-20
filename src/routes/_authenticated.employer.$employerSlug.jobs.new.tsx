// Phase H3 — /employer/$employerSlug/jobs/new: create a new draft.

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { useT } from "@/i18n/context";
import { EmployerWorkspaceChrome } from "@/components/employer/EmployerWorkspaceChrome";
import { EmployerErrorState } from "@/components/employer/EmployerErrorState";
import { EmployerAccessDenied } from "@/components/employer/EmployerAccessDenied";
import { listMyEmployerWorkspaces } from "@/lib/job-intelligence/membership.functions";
import {
  saveEmployerJobDraft,
  submitEmployerJob,
} from "@/lib/job-intelligence/employer-jobs.functions";
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

  const workspacesQuery = useQuery({
    queryKey: ["employer", "my-workspaces"],
    queryFn: () => listWorkspaces(),
  });
  const workspace = workspacesQuery.data?.find((w) => w.employerSlug === employerSlug);

  const [formError, setFormError] = useState<string | null>(null);

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

  const submitMutation = useMutation({
    mutationFn: async (values: EmployerJobFormValues) => {
      if (!workspace) throw new Error("ACCESS_NOT_AVAILABLE");
      const saved = await saveFn({
        data: { employerId: workspace.employerId, ...toServerPayload(values) },
      });
      return submitFn({ data: { employerId: workspace.employerId, jobId: saved.id } });
    },
    onSuccess: () => {
      if (!workspace) return;
      qc.invalidateQueries({ queryKey: ["employer", workspace.employerId, "jobs"] });
      qc.invalidateQueries({ queryKey: ["employer", workspace.employerId, "dashboard-stats"] });
      navigate({ to: "/employer/$employerSlug/jobs", params: { employerSlug } });
    },
    onError: (e: any) => setFormError(e?.message ?? "SUBMIT_FOR_REVIEW_FAILED"),
  });

  if (workspacesQuery.isLoading) {
    return (
      <SiteLayout>
        <Section containerClassName="max-w-3xl">
          <p className="text-sm text-muted-foreground">{t("employer.loading")}</p>
        </Section>
      </SiteLayout>
    );
  }

  if (!workspace) {
    return (
      <SiteLayout>
        <EmployerAccessDenied workspaces={workspacesQuery.data} />
      </SiteLayout>
    );
  }

  return (
    <SiteLayout>
      <EmployerWorkspaceChrome
        employerSlug={employerSlug}
        employerName={workspace.employerName}
        role={workspace.role}
        status={workspace.employerStatus}
        activeSection="jobs"
        hasMultipleWorkspaces={(workspacesQuery.data?.length ?? 0) > 1}
      >
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
          saving={saveMutation.isPending}
          submitting={submitMutation.isPending}
          error={formError}
          onSaveDraft={(v) => {
            setFormError(null);
            saveMutation.mutate(v);
          }}
          onSubmitForReview={(v) => {
            setFormError(null);
            submitMutation.mutate(v);
          }}
        />
      </EmployerWorkspaceChrome>
    </SiteLayout>
  );
}
