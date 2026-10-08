import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useT } from "@/i18n/context";
import { ConfirmAction } from "@/components/employer/ConfirmAction";
import {
  getLifecycleOverview,
  archiveMaterial,
  previewErasure,
  requestErasure,
  setEmployerRetention,
  retryErasure,
  type ErasurePreview,
} from "@/lib/recruitment/lifecycle.functions";
import { formatDate } from "@/lib/job-intelligence/date-format";
import { Button } from "@/components/ui/button";

// Additive to the existing Lovable workspace layout. One shared component for
// the application and recruitment keeps archive/restore/delete semantics equal.
export function MaterialLifecycle({
  employerId,
  jobId,
  applicationId = null,
}: {
  employerId: string;
  jobId: string;
  applicationId?: string | null;
}) {
  const { t, lang } = useT();
  const qc = useQueryClient();
  const read = useServerFn(getLifecycleOverview);
  const archive = useServerFn(archiveMaterial);
  const preview = useServerFn(previewErasure);
  const erase = useServerFn(requestErasure);
  const setPeriod = useServerFn(setEmployerRetention);
  const retry = useServerFn(retryErasure);
  const [confirmation, setConfirmation] = useState<ErasurePreview | null>(null);
  const [period, setPeriodChoice] = useState<6 | 24 | null>(null);
  const [periodConfirm, setPeriodConfirm] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const query = useQuery({
    queryKey: ["employer", employerId, "lifecycle"],
    queryFn: () => read({ data: { employerId } }),
    refetchInterval: 30_000,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: ["employer", employerId] });
  const job = query.data?.jobs.find((j) => j.id === jobId);
  const app = query.data?.applications.find((a) => a.id === applicationId);
  const archived = applicationId ? Boolean(app?.archivedAt) : Boolean(job?.archivedAt);
  const terminal = !applicationId || ["hired", "rejected", "withdrawn"].includes(app?.status ?? "");
  const debt =
    query.data?.erasures.filter(
      (e) => e.jobId === jobId && (!applicationId || e.applicationIds.includes(applicationId)),
    ) ?? [];
  const pending = debt.some((e) => !e.completedAt);
  const erasedIds = debt
    .filter((e) => e.rowsDeletedAt)
    .map((e) => e.id)
    .join(",");
  useEffect(() => {
    if (erasedIds) void qc.invalidateQueries({ queryKey: ["employer", employerId] });
  }, [erasedIds, employerId, qc]);
  const mutation = useMutation({
    mutationFn: async (action: "archive" | "preview" | "erase" | "period" | `retry:${string}`) => {
      setNotice(null);
      if (action.startsWith("retry:")) await retry({ data: { erasureId: action.slice(6) } });
      if (action === "archive") {
        await archive({ data: { jobId, applicationId, archive: !archived } });
        setNotice(t(archived ? "rec.lifecycle.restoredNotice" : "rec.lifecycle.archivedNotice"));
      }
      if (action === "preview") setConfirmation(await preview({ data: { jobId, applicationId } }));
      if (action === "erase" && confirmation) {
        await erase({ data: { jobId, applicationId, fingerprint: confirmation.fingerprint } });
        setConfirmation(null);
        setNotice(t("rec.lifecycle.pending"));
      }
      if (action === "period" && period) {
        await setPeriod({ data: { employerId, months: period } });
        setPeriodConfirm(false);
        setPeriodChoice(null);
      }
    },
    onSuccess: () => {
      void refresh();
    },
  });
  if (query.isError)
    return (
      <p role="alert" className="mt-4 text-sm text-destructive">
        {t("rec.lifecycle.loadingError")}
      </p>
    );
  if (!job) return null;
  const ready = job.state !== "open" && Boolean(job.completedAt) && terminal;
  return (
    <section
      className="my-5 min-w-0 rounded-lg border border-border bg-card p-4"
      aria-label={t("rec.lifecycle.title")}
    >
      <h2 className="font-semibold">{t("rec.lifecycle.title")}</h2>
      {archived && (
        <p
          role="status"
          data-testid="archived-state"
          className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm"
        >
          {t(applicationId ? "rec.lifecycle.archivedState" : "rec.lifecycle.archivedStateJob")}
        </p>
      )}
      <p className="mt-2 text-sm text-muted-foreground">
        {job.purgeAt ? (
          <>
            {t("rec.lifecycle.purgeAt")}:{" "}
            <time dateTime={job.purgeAt}>{formatDate(job.purgeAt, lang)}</time>
          </>
        ) : (
          t(job.missingDate ? "rec.lifecycle.missing" : "rec.lifecycle.active")
        )}
      </p>
      <details className="mt-3 text-sm">
        <summary className="min-h-11 cursor-pointer py-3">{t("rec.lifecycle.clock")}</summary>
        {job.canManage && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              className="min-h-11"
              disabled={mutation.isPending || pending || !terminal || (!applicationId && !ready)}
              onClick={() => mutation.mutate("archive")}
            >
              {t(archived ? "rec.lifecycle.restore" : "rec.lifecycle.archive")}
            </Button>
            <Button
              variant="destructive"
              className="min-h-11 whitespace-normal"
              disabled={mutation.isPending || pending || !ready}
              onClick={() => mutation.mutate("preview")}
            >
              {t("rec.lifecycle.delete")}
            </Button>
          </div>
        )}
        {!applicationId && query.data?.canSetRetention && (
          <div className="mt-4 space-y-2">
            <label className="block">
              {t("rec.lifecycle.period")}
              <select
                className="mt-2 block min-h-11 max-w-full rounded-md border bg-background p-2"
                value={period ?? query.data.months}
                disabled={mutation.isPending}
                onChange={(e) => setPeriodChoice(Number(e.target.value) as 6 | 24)}
              >
                <option value={24}>{t("rec.lifecycle.standard")}</option>
                <option value={6}>{t("rec.lifecycle.six")}</option>
              </select>
            </label>
            <p className="text-muted-foreground">{t("rec.lifecycle.periodEffect")}</p>
            <Button
              variant="outline"
              className="min-h-11"
              disabled={!period || mutation.isPending}
              onClick={() => setPeriodConfirm(true)}
            >
              {t("rec.lifecycle.save")}
            </Button>
          </div>
        )}
      </details>
      {debt.map((e) => (
        <p key={e.id} role="status" className="mt-3 text-sm">
          {t(
            e.completedAt
              ? "rec.lifecycle.done"
              : e.error
                ? "rec.lifecycle.failed"
                : "rec.lifecycle.pending",
          )}
          {!e.completedAt && (
            <>
              {" "}
              {t("rec.lifecycle.files")}: {e.pendingFiles}.{" "}
              {job.canManage && e.error && (
                <Button
                  variant="outline"
                  className="ml-2 min-h-11"
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate(`retry:${e.id}`)}
                >
                  {t("rec.lifecycle.retry")}
                </Button>
              )}
            </>
          )}
        </p>
      ))}
      {notice && (
        <p role="status" className="mt-3 text-sm">
          {notice}
        </p>
      )}
      {mutation.isError && (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {t("rec.lifecycle.error")}
        </p>
      )}
      <ConfirmAction
        open={Boolean(confirmation)}
        onOpenChange={(open) => {
          if (!open) setConfirmation(null);
        }}
        title={t("rec.lifecycle.confirm")}
        confirmLabel={t("rec.lifecycle.delete")}
        cancelLabel={t("rec.lifecycle.cancel")}
        tone="destructive"
        busy={mutation.isPending}
        onConfirm={() => mutation.mutate("erase")}
        consequence={confirmation && <ErasureConsequence preview={confirmation} />}
      />
      <ConfirmAction
        open={periodConfirm}
        onOpenChange={setPeriodConfirm}
        title={t("rec.lifecycle.periodConfirm")}
        confirmLabel={t("rec.lifecycle.save")}
        cancelLabel={t("rec.lifecycle.cancel")}
        busy={mutation.isPending}
        onConfirm={() => mutation.mutate("period")}
        consequence={
          <>
            {period === 6 ? t("rec.lifecycle.six") : t("rec.lifecycle.standard")}.{" "}
            {t("rec.lifecycle.periodEffect")}
          </>
        }
      />
    </section>
  );
}

export function ErasureConsequence({ preview }: { preview: ErasurePreview }) {
  const { t } = useT();
  const groups = { applications: 0, messages: 0, interviews: 0, assessments: 0, other: 0 };
  for (const [table, count] of Object.entries(preview.counts)) {
    const group =
      table === "job_applications"
        ? "applications"
        : /message|notice/.test(table)
          ? "messages"
          : /interview|bcp_|recruitment.*booking/.test(table)
            ? "interviews"
            : /assessment|scp_|sentinel/.test(table)
              ? "assessments"
              : "other";
    groups[group] += count;
  }
  return (
    <span className="block space-y-3">
      <span className="block font-medium">
        {t("rec.lifecycle.scope")}: {preview.applications}
      </span>
      <span className="block">{t("rec.lifecycle.material")}</span>
      <span className="block">
        {Object.entries(groups).map(([group, count]) => (
          <span key={group} className="block">
            {t(`rec.lifecycle.records.${group}` as Parameters<typeof t>[0])}: {count}
          </span>
        ))}
      </span>
      <span className="block">
        {t("rec.lifecycle.files")}: {preview.files - preview.sharedFiles}.{" "}
        {t("rec.lifecycle.shared")}: {preview.sharedFiles}.
      </span>
      <span className="block">{t("rec.lifecycle.kept")}</span>
    </span>
  );
}
