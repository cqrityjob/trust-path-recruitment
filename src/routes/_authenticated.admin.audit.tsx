// Admin Control Center — /admin/audit.
//
// The platform already wrote administrative history to three tables and never
// showed any of it. This page does not rebuild that architecture: it reads the
// two that matter for lifecycle work -- audit_logs (platform actions) and
// employer_moderation_events (employer status decisions) -- and presents them
// as one chronological list.
//
// Projected, never dumped: action, actor, subject, reason, time. The raw
// metadata column is reduced to its reason string server-side, so a future
// writer putting something sensitive in there cannot leak it into this page.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { AdminShellChrome } from "@/components/admin/AdminShellChrome";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import { useT } from "@/i18n/context";
import { Badge } from "@/components/ui/badge";
import { adminListAuditEvents } from "@/lib/job-intelligence/admin-lifecycle.functions";
import { formatDateTime } from "@/lib/job-intelligence/date-format";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  ssr: false,
  component: AdminAuditPage,
  errorComponent: AdminErrorState,
});

// The lifecycle actions worth filtering by. Deliberately a fixed list rather
// than a distinct() over the table: a filter built from live data would grow
// silently and turn into an unreviewed catalogue of everything the platform
// has ever logged.
const FILTERABLE_ACTIONS = [
  "employer_archived",
  "employer_suspended",
  "employer_restored",
  "employer_deleted",
  "user_disabled",
  "user_enabled",
  "user_anonymised",
  "user_deleted",
  "platform_role_granted",
  "platform_role_revoked",
  "assignment_cancelled",
  "job_deleted",
] as const;

function AdminAuditPage() {
  const { t, lang } = useT();
  const [action, setAction] = useState<string>("");
  const listFn = useServerFn(adminListAuditEvents);

  const q = useQuery({
    queryKey: ["admin", "audit-events", action],
    queryFn: () => listFn({ data: { action: action || undefined, limit: 150 } }),
  });

  return (
    <SiteLayout>
      <AdminShellChrome activeSection="audit">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          {t("admin.audit.heading")}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{t("admin.audit.intro")}</p>

        <div className="mt-5">
          <label htmlFor="audit-action" className="sr-only">
            {t("admin.audit.column.action")}
          </label>
          <select
            id="audit-action"
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-sm text-foreground"
          >
            <option value="">{t("admin.audit.filter.all")}</option>
            {FILTERABLE_ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        {q.isLoading ? (
          <p className="mt-6 text-sm text-muted-foreground">{t("admin.loading")}</p>
        ) : (q.data?.length ?? 0) === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">{t("admin.audit.empty")}</p>
        ) : (
          <div className="mt-6 overflow-x-auto rounded-lg border border-border bg-background">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">{t("admin.audit.column.time")}</th>
                  <th className="px-4 py-2">{t("admin.audit.column.action")}</th>
                  <th className="px-4 py-2">{t("admin.audit.column.actor")}</th>
                  <th className="px-4 py-2">{t("admin.audit.column.subject")}</th>
                  <th className="px-4 py-2">{t("admin.audit.column.reason")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {q.data!.map((e) => (
                  <tr key={`${e.source}:${e.id}`}>
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">
                      {formatDateTime(e.at, lang)}
                    </td>
                    <td className="px-4 py-2">
                      <Badge variant={e.action.includes("delet") ? "destructive" : "secondary"}>
                        {e.action}
                      </Badge>
                    </td>
                    <td className="px-4 py-2">
                      {e.actorId ? (
                        <Link
                          to="/admin/users/$userId"
                          params={{ userId: e.actorId }}
                          className="text-accent hover:underline"
                        >
                          {e.actorName ?? e.actorRole ?? t("admin.audit.unknownActor")}
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">
                          {t("admin.audit.unknownActor")}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs">
                      {e.subjectType ? (
                        <SubjectLink subjectType={e.subjectType} subjectId={e.subjectId} />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="max-w-sm px-4 py-2 text-muted-foreground">{e.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </AdminShellChrome>
    </SiteLayout>
  );
}

/** A subject is only linkable when it still exists and the portal has a page
 *  for it. A deleted employer is exactly the case where it does not -- so the
 *  id is rendered as plain text rather than as a link that would 404. */
function SubjectLink({
  subjectType,
  subjectId,
}: {
  subjectType: string;
  subjectId: string | null;
}) {
  if (!subjectId) return <>{subjectType}</>;
  if (subjectType === "user") {
    return (
      <Link
        to="/admin/users/$userId"
        params={{ userId: subjectId }}
        className="text-accent hover:underline"
      >
        {subjectType} · {subjectId.slice(0, 8)}
      </Link>
    );
  }
  return (
    <span>
      {subjectType} · <code>{subjectId.slice(0, 8)}</code>
    </span>
  );
}
