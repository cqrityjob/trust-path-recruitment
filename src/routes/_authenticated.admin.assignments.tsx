// Admin Portal — Assessment Assignments oversight (all organisations).

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
import { adminListAssignments } from "@/lib/job-intelligence/admin-assessment-assignments.functions";
import { formatDateTime } from "@/lib/job-intelligence/date-format";

export const Route = createFileRoute("/_authenticated/admin/assignments")({
  ssr: false,
  component: AdminAssignmentsPage,
});

const STATUSES = [
  "all",
  "invited",
  "opened",
  "started",
  "completed",
  "expired",
  "cancelled",
] as const;

function AdminAssignmentsPage() {
  const { t, lang } = useT();
  const listFn = useServerFn(adminListAssignments);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const q = useQuery({
    queryKey: ["admin", "assignments", status, appliedSearch],
    queryFn: () => listFn({ data: { status, search: appliedSearch || undefined } }),
  });

  return (
    <SiteLayout>
      <AdminShellChrome activeSection="assignments">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          {t("admin.assignments.list.heading")}
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
                {t(`admin.assignments.status.${s}` as TranslationKey)}
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
              placeholder={t("admin.assignments.list.searchPlaceholder")}
              className="w-72"
            />
            <Button type="submit" variant="outline" size="sm">
              {t("admin.assignments.list.searchButton")}
            </Button>
          </form>
        </div>

        <div className="mt-6">
          {q.isLoading && <p className="text-sm text-muted-foreground">{t("admin.loading")}</p>}
          {q.isError && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
          {q.isSuccess && q.data.length === 0 && (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
              {t("admin.assignments.list.empty")}
            </div>
          )}
          {q.isSuccess && q.data.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">{t("admin.assignments.list.column.recipient")}</th>
                    <th className="px-4 py-3">{t("admin.applications.list.column.employer")}</th>
                    <th className="px-4 py-3">{t("admin.assignments.list.column.assessment")}</th>
                    <th className="px-4 py-3">{t("admin.applications.list.column.status")}</th>
                    <th className="px-4 py-3">{t("admin.assignments.list.column.invited")}</th>
                    <th className="px-4 py-3">{t("admin.assignments.list.column.expires")}</th>
                    <th className="px-4 py-3 text-right">&nbsp;</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {q.data.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="px-4 py-3 font-medium text-foreground">{r.recipientEmail}</td>
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
                        {lang === "sv" ? r.assessmentNameSv : r.assessmentNameEn}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">
                          {t(`admin.assignments.status.${r.status}` as TranslationKey)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatDateTime(r.invitedAt, lang)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatDateTime(r.expiresAt, lang)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to="/admin/assignments/$assignmentId"
                          params={{ assignmentId: r.id }}
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
