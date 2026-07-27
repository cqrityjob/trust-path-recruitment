// Admin Portal — Workforce / Employees oversight (all organisations).

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
import { adminListEmployees } from "@/lib/job-intelligence/admin-workforce.functions";

export const Route = createFileRoute("/_authenticated/admin/workforce/")({
  ssr: false,
  component: AdminWorkforcePage,
});

function AdminWorkforcePage() {
  const { t } = useT();
  const listFn = useServerFn(adminListEmployees);
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const q = useQuery({
    queryKey: ["admin", "workforce", status, appliedSearch],
    queryFn: () => listFn({ data: { status, search: appliedSearch || undefined } }),
  });

  return (
    <SiteLayout>
      <AdminShellChrome activeSection="workforce">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          {t("admin.workforce.list.heading")}
        </h1>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1">
            {(["all", "active", "inactive"] as const).map((s) => (
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
                {t(`admin.workforce.status.${s}` as TranslationKey)}
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
              placeholder={t("admin.workforce.list.searchPlaceholder")}
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
              {t("admin.workforce.list.empty")}
            </div>
          )}
          {q.isSuccess && q.data.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">{t("admin.users.list.column.name")}</th>
                    <th className="px-4 py-3">{t("admin.applications.list.column.employer")}</th>
                    <th className="px-4 py-3">{t("admin.workforce.list.column.roleTitle")}</th>
                    <th className="px-4 py-3">{t("admin.applications.list.column.status")}</th>
                    <th className="px-4 py-3 text-right">&nbsp;</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {q.data.map((e) => (
                    <tr key={e.id} className="align-top">
                      <td className="px-4 py-3 font-medium text-foreground">
                        {e.firstName} {e.lastName}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          to="/admin/employers/$employerId"
                          params={{ employerId: e.employerId }}
                          className="text-accent hover:underline"
                        >
                          {e.employerName}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {e.roleTitle ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={e.employmentStatus === "active" ? "default" : "outline"}>
                          {t(`admin.workforce.status.${e.employmentStatus}` as TranslationKey)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to="/admin/workforce/$employeeId"
                          params={{ employeeId: e.id }}
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
