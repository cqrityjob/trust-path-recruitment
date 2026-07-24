// Admin Portal — assignment detail. Full lifecycle + cancel (required
// reason) via admin_cancel_assessment_assignment(). Never renders a raw
// invitation token -- the server function never even selects it.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { AdminShellChrome } from "@/components/admin/AdminShellChrome";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  adminCancelAssignment,
  adminGetAssignmentDetail,
} from "@/lib/job-intelligence/admin-assessment-assignments.functions";
import { formatDateTime } from "@/lib/job-intelligence/date-format";

export const Route = createFileRoute("/_authenticated/admin/assignments/$assignmentId")({
  ssr: false,
  component: AdminAssignmentDetailPage,
  errorComponent: AdminErrorState,
});

const CANCELLABLE = new Set(["invited", "opened", "started"]);

function AdminAssignmentDetailPage() {
  const { assignmentId } = Route.useParams();
  const { t, lang } = useT();
  const qc = useQueryClient();
  const getFn = useServerFn(adminGetAssignmentDetail);
  const cancelFn = useServerFn(adminCancelAssignment);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["admin", "assignment-detail", assignmentId],
    queryFn: () => getFn({ data: { assignmentId } }),
  });

  const cancel = useMutation({
    mutationFn: () => cancelFn({ data: { assignmentId, reason: reason.trim() } }),
    onSuccess: () => {
      setDialogOpen(false);
      setReason("");
      setError(null);
      qc.invalidateQueries({ queryKey: ["admin", "assignment-detail", assignmentId] });
      qc.invalidateQueries({ queryKey: ["admin", "assignments"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  if (q.isLoading) {
    return (
      <SiteLayout>
        <AdminShellChrome activeSection="assignments">
          <p className="text-sm text-muted-foreground">{t("admin.loading")}</p>
        </AdminShellChrome>
      </SiteLayout>
    );
  }
  if (q.isError || !q.data) {
    return (
      <SiteLayout>
        <AdminShellChrome activeSection="assignments">
          <h1 className="text-xl font-semibold text-foreground">
            {t("admin.assignments.detail.notFound")}
          </h1>
          <div className="mt-4">
            <Link
              to="/admin/assignments"
              className="text-sm font-medium text-accent hover:underline"
            >
              {t("admin.assignments.detail.backToList")}
            </Link>
          </div>
        </AdminShellChrome>
      </SiteLayout>
    );
  }

  const a = q.data;
  const canCancel = CANCELLABLE.has(a.status);

  return (
    <SiteLayout>
      <AdminShellChrome activeSection="assignments">
        <Link to="/admin/assignments" className="text-xs font-medium text-accent hover:underline">
          ← {t("admin.assignments.detail.backToList")}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">{a.recipientEmail}</h1>
          <Badge variant="outline">
            {t(`admin.assignments.status.${a.status}` as TranslationKey)}
          </Badge>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {canCancel && (
            <Button type="button" variant="destructive" onClick={() => setDialogOpen(true)}>
              {t("admin.assignments.detail.action.cancel")}
            </Button>
          )}
          {a.status === "completed" && (
            <Link
              to="/admin/results/$assignmentId"
              params={{ assignmentId: a.id }}
              className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
            >
              {t("admin.assignments.detail.action.viewResult")}
            </Link>
          )}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-border bg-background p-5">
            <h2 className="text-sm font-semibold text-foreground">
              {t("admin.assignments.detail.section.context")}
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Field
                label={t("admin.applications.list.column.employer")}
                value={
                  <Link
                    to="/admin/employers/$employerId"
                    params={{ employerId: a.employerId }}
                    className="text-accent hover:underline"
                  >
                    {a.employerName}
                  </Link>
                }
              />
              <Field
                label={t("admin.assignments.list.column.assessment")}
                value={lang === "sv" ? a.assessmentNameSv : a.assessmentNameEn}
              />
              <Field label={t("admin.assignments.detail.field.useCase")} value={a.useCase} />
              <Field label={t("admin.assignments.detail.field.language")} value={a.language} />
              {a.jobTitleSv || a.jobTitleEn ? (
                <Field
                  label={t("admin.applications.list.column.job")}
                  value={a.jobTitleSv || a.jobTitleEn}
                />
              ) : null}
              {a.employeeName && <Field label={t("admin.nav.workforce")} value={a.employeeName} />}
              <Field
                label={t("admin.assignments.detail.field.delivery")}
                value={t("admin.assignments.detail.deliveryCopyLink")}
              />
            </dl>
          </section>

          <section className="rounded-lg border border-border bg-background p-5">
            <h2 className="text-sm font-semibold text-foreground">
              {t("admin.assignments.detail.section.timeline")}
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Field
                label={t("admin.assignments.list.column.invited")}
                value={formatDateTime(a.invitedAt, lang)}
              />
              {a.openedAt && (
                <Field
                  label={t("admin.assignments.detail.field.opened")}
                  value={formatDateTime(a.openedAt, lang)}
                />
              )}
              {a.startedAt && (
                <Field
                  label={t("admin.assignments.detail.field.started")}
                  value={formatDateTime(a.startedAt, lang)}
                />
              )}
              {a.completedAt && (
                <Field
                  label={t("admin.assignments.detail.field.completed")}
                  value={formatDateTime(a.completedAt, lang)}
                />
              )}
              <Field
                label={t("admin.assignments.list.column.expires")}
                value={formatDateTime(a.expiresAt, lang)}
              />
              {a.cancelledAt && (
                <>
                  <Field
                    label={t("admin.assignments.detail.field.cancelled")}
                    value={formatDateTime(a.cancelledAt, lang)}
                  />
                  <Field
                    label={t("admin.assignments.detail.field.cancellationReason")}
                    value={a.cancellationReason}
                  />
                </>
              )}
            </dl>
          </section>
        </div>
      </AdminShellChrome>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("admin.assignments.detail.cancelDialog.title")}</DialogTitle>
          </DialogHeader>
          <Textarea
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("admin.assignments.detail.cancelDialog.reasonPlaceholder")}
          />
          {error && (
            <p role="alert" className="mt-1 text-xs text-destructive">
              {error}
            </p>
          )}
          <DialogFooter className="mt-4">
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {t("admin.employers.action.cancel")}
              </Button>
            </DialogClose>
            <Button
              type="button"
              onClick={() => cancel.mutate()}
              disabled={cancel.isPending || !reason.trim()}
            >
              {cancel.isPending
                ? t("admin.employers.action.submitting")
                : t("admin.employers.action.confirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SiteLayout>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value || "—"}</dd>
    </div>
  );
}
