// Admin Portal — Applications oversight. Read-only: admin can inspect,
// never change a status here (that stays the candidate's or employer's
// own decision, unchanged).

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { AdminShellChrome } from "@/components/admin/AdminShellChrome";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { adminListApplications } from "@/lib/job-intelligence/admin-applications.functions";
import { formatDate } from "@/lib/job-intelligence/date-format";

export const Route = createFileRoute("/_authenticated/admin/applications/")({
  ssr: false,
  component: AdminApplicationsPage,
});

const STATUSES = [
  "all",
  "submitted",
  "reviewing",
  "interview",
  "rejected",
  "hired",
  "withdrawn",
] as const;

function AdminApplicationsPage() {
  const { t, lang } = useT();
  const listFn = useServerFn(adminListApplications);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const q = useQuery({
    queryKey: ["admin", "applications", status, appliedSearch],
    queryFn: () => listFn({ data: { status, search: appliedSearch || undefined } }),
  });

  return (
    <SiteLayout>
      <AdminShellChrome activeSection="applications">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          {t("admin.applications.list.heading")}
        </h1>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1">
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatus(s)}
                className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                  status === s
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                {t(`admin.applications.status.${s}` as TranslationKey)}
              </button>
            ))}
          </div>
          <form
            className="ml-auto flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              setAppliedSearch(search.trim());
            }}
          >
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("admin.applications.list.searchPlaceholder")}
              className="w-72"
            />
            <Button type="submit" variant="outline" size="sm">
              {t("admin.applications.list.searchButton")}
            </Button>
          </form>
        </div>

        <div className="mt-6">
          {q.isLoading && <p className="text-sm text-muted-foreground">{t("admin.loading")}</p>}
          {q.isError && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
          {q.isSuccess && q.data.length === 0 && (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
              {t("admin.applications.list.empty")}
            </div>
          )}
          {q.isSuccess && q.data.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">{t("admin.applications.list.column.applicant")}</th>
                    <th className="px-4 py-3">{t("admin.applications.list.column.employer")}</th>
                    <th className="px-4 py-3">{t("admin.applications.list.column.job")}</th>
                    <th className="px-4 py-3">{t("admin.applications.list.column.status")}</th>
                    <th className="px-4 py-3">
                      {t("admin.applications.list.column.assignmentStatus")}
                    </th>
                    <th className="px-4 py-3">{t("admin.applications.list.column.created")}</th>
                    <th className="px-4 py-3 text-right">&nbsp;</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {q.data.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="px-4 py-3 font-medium text-foreground">
                        {r.applicantEmail ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to="/admin/employers/$employerId"
                          params={{ employerId: r.employerId }}
                          className="text-accent hover:underline"
                        >
                          {r.employerName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {r.jobTitleSv || r.jobTitleEn || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">
                          {t(`admin.applications.status.${r.status}` as TranslationKey)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {r.assignmentStatus ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatDate(r.createdAt, lang)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to="/admin/applications/$applicationId"
                          params={{ applicationId: r.id }}
                          className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted/40"
                        >
                          {t("admin.employers.list.open")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </AdminShellChrome>
    </SiteLayout>
  );
}
