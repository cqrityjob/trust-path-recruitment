// Phase H3.3 — /admin/employers/$employerId: employer review + moderation
// detail page. The employerId param is a lookup key only, exactly like
// every $employerSlug lookup elsewhere in this app -- authorization comes
// from adminGetEmployerForModeration()'s own server-side is_platform_admin()
// check, never from the param itself. A non-admin (or a malformed/
// non-existent id) gets the same neutral "not found / access denied"
// state, never a distinguishable error that would leak whether the id is
// real.

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
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  adminGetEmployerForModeration,
  adminModerateEmployer,
  type AdminEmployerDetail,
} from "@/lib/job-intelligence/admin-employer-moderation.functions";
import { formatDate, formatDateTime } from "@/lib/job-intelligence/date-format";

export const Route = createFileRoute("/_authenticated/admin/employers/$employerId")({
  ssr: false,
  component: AdminEmployerDetailPage,
  errorComponent: AdminErrorState,
});

const STATUS_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  active: "default",
  pending: "secondary",
  draft: "secondary",
  rejected: "destructive",
  suspended: "destructive",
  archived: "outline",
};

const STATUS_LABEL_KEY: Record<string, TranslationKey> = {
  draft: "admin.employers.status.draft",
  pending: "admin.employers.status.pending",
  active: "admin.employers.status.active",
  rejected: "admin.employers.status.rejected",
  suspended: "admin.employers.status.suspended",
  archived: "admin.employers.status.archived",
};

type ModerationAction = "approved" | "rejected" | "suspended" | "reactivated";

const ACTION_REQUIRES_NOTE: Record<ModerationAction, boolean> = {
  approved: false,
  rejected: true,
  suspended: true,
  reactivated: false,
};

const ACTION_LABEL_KEY: Record<ModerationAction, TranslationKey> = {
  approved: "admin.employers.action.approve",
  rejected: "admin.employers.action.reject",
  suspended: "admin.employers.action.suspend",
  reactivated: "admin.employers.action.reactivate",
};

const ACTION_CONFIRM_TITLE_KEY: Record<ModerationAction, TranslationKey> = {
  approved: "admin.employers.action.confirmApprove.title",
  rejected: "admin.employers.action.confirmReject.title",
  suspended: "admin.employers.action.confirmSuspend.title",
  reactivated: "admin.employers.action.confirmReactivate.title",
};

const ACTION_CONFIRM_BODY_KEY: Record<ModerationAction, TranslationKey> = {
  approved: "admin.employers.action.confirmApprove.body",
  rejected: "admin.employers.action.confirmReject.body",
  suspended: "admin.employers.action.confirmSuspend.body",
  reactivated: "admin.employers.action.confirmReactivate.body",
};

// Which actions the current status makes available -- mirrors
// moderate_employer()'s own fixed transition allow-list exactly; this UI
// list is advisory only (a stale page can still only succeed against
// whatever the RPC itself validates server-side).
function availableActions(status: string): ModerationAction[] {
  if (status === "pending") return ["approved", "rejected"];
  if (status === "active") return ["suspended"];
  if (status === "suspended") return ["reactivated"];
  return [];
}

const ERROR_MESSAGE_KEYS: Record<string, TranslationKey> = {
  FORBIDDEN_ADMIN_REQUIRED: "admin.employers.action.error.forbidden",
  ROLE_CHECK_FAILED: "admin.employers.action.error.forbidden",
  INVALID_MODERATION_TRANSITION: "admin.employers.action.error.invalidTransition",
  MODERATION_ACTION_FAILED: "admin.employers.action.error.generic",
};

function translateActionError(code: string | null | undefined, t: (k: TranslationKey) => string) {
  if (code && code in ERROR_MESSAGE_KEYS) return t(ERROR_MESSAGE_KEYS[code]);
  return t("admin.employers.action.error.generic");
}

function AdminEmployerDetailPage() {
  const { employerId } = Route.useParams();
  const { t, lang } = useT();
  const qc = useQueryClient();
  const getFn = useServerFn(adminGetEmployerForModeration);
  const moderateFn = useServerFn(adminModerateEmployer);

  const q = useQuery({
    queryKey: ["admin", "employer-detail", employerId],
    queryFn: () => getFn({ data: { employerId } }),
  });

  const [openAction, setOpenAction] = useState<ModerationAction | null>(null);
  const [note, setNote] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState(false);

  const moderate = useMutation({
    mutationFn: (action: ModerationAction) =>
      moderateFn({ data: { employerId, action, note: note.trim() || null } }),
    onSuccess: () => {
      setActionError(null);
      setActionSuccess(true);
      setOpenAction(null);
      setNote("");
      qc.invalidateQueries({ queryKey: ["admin", "employer-detail", employerId] });
      qc.invalidateQueries({ queryKey: ["admin", "employers-moderation"] });
      qc.invalidateQueries({ queryKey: ["admin", "pending-employers-count"] });
    },
    onError: (e: any) => {
      setActionSuccess(false);
      setActionError(e?.message ?? "MODERATION_ACTION_FAILED");
    },
  });

  if (q.isLoading) {
    return (
      <SiteLayout>
        <AdminShellChrome activeSection="employers">
          <p className="text-sm text-muted-foreground">{t("admin.loading")}</p>
        </AdminShellChrome>
      </SiteLayout>
    );
  }

  if (q.isError || !q.data) {
    return (
      <SiteLayout>
        <AdminShellChrome activeSection="employers">
          <h1 className="text-xl font-semibold text-foreground">
            {t("admin.employers.detail.notFound")}
          </h1>
          <div className="mt-4">
            <Link to="/admin/employers" className="text-sm font-medium text-accent hover:underline">
              {t("admin.employers.detail.backToList")}
            </Link>
          </div>
        </AdminShellChrome>
      </SiteLayout>
    );
  }

  const employer: AdminEmployerDetail = q.data;
  const actions = availableActions(employer.status);

  function openDialog(action: ModerationAction) {
    setActionError(null);
    setActionSuccess(false);
    setNote("");
    setOpenAction(action);
  }

  function confirmAction() {
    if (!openAction) return;
    if (ACTION_REQUIRES_NOTE[openAction] && !note.trim()) {
      setActionError("MISSING_NOTE_LOCAL");
      return;
    }
    setActionError(null);
    moderate.mutate(openAction);
  }

  return (
    <SiteLayout>
      <AdminShellChrome activeSection="employers">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link to="/admin/employers" className="text-xs font-medium text-accent hover:underline">
              ← {t("admin.employers.detail.backToList")}
            </Link>
            <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">
              {employer.name}
            </h1>
            <div className="mt-1 flex items-center gap-2">
              <Badge variant={STATUS_BADGE_VARIANT[employer.status] ?? "outline"}>
                {t(STATUS_LABEL_KEY[employer.status] ?? "admin.employers.status.draft")}
              </Badge>
              <span className="text-xs text-muted-foreground">/{employer.slug}</span>
            </div>
          </div>
          {actions.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {actions.map((a) => (
                <Button
                  key={a}
                  type="button"
                  variant={a === "rejected" || a === "suspended" ? "destructive" : "default"}
                  onClick={() => openDialog(a)}
                >
                  {t(ACTION_LABEL_KEY[a])}
                </Button>
              ))}
            </div>
          )}
        </div>

        {actionSuccess && (
          <div
            role="status"
            className="mb-6 rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground"
          >
            {t("admin.employers.action.success")}
          </div>
        )}
        {actionError && !openAction && (
          <div
            role="alert"
            className="mb-6 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {translateActionError(actionError, t)}
          </div>
        )}

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-border bg-background p-5">
            <h2 className="text-sm font-semibold text-foreground">
              {t("admin.employers.detail.section.companyInfo")}
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Field label={t("admin.employers.detail.field.country")} value={employer.country} />
              <Field
                label={t("admin.employers.detail.field.registrationNumber")}
                value={employer.registrationNumber}
              />
              <Field label={t("admin.employers.detail.field.website")} value={employer.website} />
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("admin.employers.detail.field.description")}
                </dt>
                <dd className="mt-1 text-foreground">
                  {employer.descriptionSv || employer.descriptionEn ? (
                    <>
                      {employer.descriptionSv && <p>{employer.descriptionSv}</p>}
                      {employer.descriptionEn && (
                        <p className="mt-1 text-muted-foreground">{employer.descriptionEn}</p>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">
                      {t("admin.employers.detail.noDescription")}
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-border bg-background p-5">
            <h2 className="text-sm font-semibold text-foreground">
              {t("admin.employers.detail.section.internal")}
            </h2>
            <dl className="mt-3 space-y-2 text-sm">
              <Field
                label={t("admin.employers.detail.field.status")}
                value={t(STATUS_LABEL_KEY[employer.status] ?? "admin.employers.status.draft")}
              />
              <Field
                label={t("admin.employers.detail.field.created")}
                value={formatDate(employer.createdAt, lang)}
              />
            </dl>

            <h3 className="mt-5 text-sm font-semibold text-foreground">
              {t("admin.employers.detail.section.owner")}
            </h3>
            {employer.ownerDisplayName || employer.ownerEmail ? (
              <dl className="mt-3 space-y-2 text-sm">
                <Field
                  label={t("admin.employers.list.column.owner")}
                  value={employer.ownerDisplayName}
                />
                <Field
                  label={t("admin.employers.detail.field.email")}
                  value={employer.ownerEmail}
                />
              </dl>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                {t("admin.employers.detail.noOwner")}
              </p>
            )}
          </section>
        </div>

        <section className="mt-6 rounded-lg border border-border bg-background p-5">
          <h2 className="text-sm font-semibold text-foreground">
            {t("admin.employers.detail.section.membership")}
          </h2>
          {employer.memberships.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("admin.employers.detail.noMembers")}
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-1.5 pr-4">{t("admin.employers.list.column.owner")}</th>
                    <th className="py-1.5 pr-4">{t("admin.employers.detail.field.role")}</th>
                    <th className="py-1.5 pr-4">{t("admin.employers.list.column.status")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {employer.memberships.map((m) => (
                    <tr key={m.id}>
                      <td className="py-1.5 pr-4">{m.displayName ?? "—"}</td>
                      <td className="py-1.5 pr-4">{m.role}</td>
                      <td className="py-1.5 pr-4">{m.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-lg border border-border bg-background p-5">
          <h2 className="text-sm font-semibold text-foreground">
            {t("admin.employers.detail.section.jobs")}
          </h2>
          {employer.jobs.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("admin.employers.detail.noJobs")}
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-1.5 pr-4">{t("employer.jobs.list.title")}</th>
                    <th className="py-1.5 pr-4">{t("employer.jobs.list.status")}</th>
                    <th className="py-1.5 pr-4">{t("employer.jobs.list.updated")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {employer.jobs.map((j) => (
                    <tr key={j.id}>
                      <td className="py-1.5 pr-4">{j.titleSv || j.titleEn || "—"}</td>
                      <td className="py-1.5 pr-4">{j.status}</td>
                      <td className="py-1.5 pr-4 text-xs text-muted-foreground">
                        {formatDate(j.updatedAt, lang)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="mt-6 rounded-lg border border-border bg-background p-5">
          <h2 className="text-sm font-semibold text-foreground">
            {t("admin.employers.detail.section.history")}
          </h2>
          {employer.moderationHistory.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("admin.employers.detail.noHistory")}
            </p>
          ) : (
            <ul className="mt-3 space-y-3">
              {employer.moderationHistory.map((ev) => (
                <li key={ev.id} className="rounded-md border border-border p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-foreground">
                      {t(
                        ACTION_LABEL_KEY[ev.action as ModerationAction] ??
                          "admin.employers.status.draft",
                      )}{" "}
                      ({ev.previousStatus} → {ev.newStatus})
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(ev.createdAt, lang)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {ev.adminDisplayName ?? t("admin.employers.list.ownerUnknown")}
                  </p>
                  {ev.note && <p className="mt-2 text-foreground">{ev.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </AdminShellChrome>

      <Dialog open={openAction !== null} onOpenChange={(o) => !o && setOpenAction(null)}>
        <DialogContent>
          {openAction && (
            <>
              <DialogHeader>
                <DialogTitle>{t(ACTION_CONFIRM_TITLE_KEY[openAction])}</DialogTitle>
                <DialogDescription>{t(ACTION_CONFIRM_BODY_KEY[openAction])}</DialogDescription>
              </DialogHeader>

              <div className="mt-2">
                <label className="block text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {ACTION_REQUIRES_NOTE[openAction]
                    ? t("admin.employers.action.noteRequired")
                    : t("admin.employers.action.noteOptional")}
                </label>
                <Textarea
                  className="mt-1"
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t("admin.employers.action.notePlaceholder")}
                />
                {actionError === "MISSING_NOTE_LOCAL" && (
                  <p role="alert" className="mt-1 text-xs text-destructive">
                    {t("admin.employers.action.error.noteRequired")}
                  </p>
                )}
                {actionError && actionError !== "MISSING_NOTE_LOCAL" && (
                  <p role="alert" className="mt-1 text-xs text-destructive">
                    {translateActionError(actionError, t)}
                  </p>
                )}
              </div>

              <DialogFooter className="mt-4">
                <DialogClose asChild>
                  <Button type="button" variant="outline">
                    {t("admin.employers.action.cancel")}
                  </Button>
                </DialogClose>
                <Button type="button" onClick={confirmAction} disabled={moderate.isPending}>
                  {moderate.isPending
                    ? t("admin.employers.action.submitting")
                    : t("admin.employers.action.confirm")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </SiteLayout>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-foreground">{value || "—"}</dd>
    </div>
  );
}
