import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { adminListJobs } from "@/lib/job-intelligence/admin.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SiteLayout } from "@/components/site/SiteLayout";
import { AdminShellChrome } from "@/components/admin/AdminShellChrome";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { formatDateTime } from "@/lib/job-intelligence/date-format";

export const Route = createFileRoute("/_authenticated/admin/jobs/")({
  ssr: false,
  component: AdminJobsList,
});

const STATUSES = [
  "all",
  "draft",
  "pending_review",
  "published",
  "expired",
  "rejected",
  "archived",
] as const;

const STATUS_LABEL_KEY: Record<(typeof STATUSES)[number], TranslationKey> = {
  all: "admin.jobs.list.filterAll",
  draft: "admin.jobs.status.draft",
  pending_review: "admin.jobs.status.pending_review",
  published: "admin.jobs.status.published",
  expired: "admin.jobs.status.expired",
  rejected: "admin.jobs.status.rejected",
  archived: "admin.jobs.status.archived",
};

function AdminJobsList() {
  const { t, lang } = useT();
  const listFn = useServerFn(adminListJobs);
  const [status, setStatus] = useState<(typeof STATUSES)[number]>("all");
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const q = useQuery({
    queryKey: ["admin", "jobs", status, appliedSearch],
    queryFn: () => listFn({ data: { status, search: appliedSearch || undefined } }),
  });

  return (
    <SiteLayout>
      <AdminShellChrome activeSection="jobs">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-1">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => setStatus(s)}
                className={`rounded-md border px-3 py-1 text-xs ${
                  status === s
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-muted"
                }`}
              >
                {t(STATUS_LABEL_KEY[s])}
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
              placeholder={t("admin.jobs.list.searchPlaceholder")}
              className="w-64"
            />
            <Button type="submit" variant="outline" size="sm">
              {t("admin.jobs.list.searchButton")}
            </Button>
          </form>
          <Link
            to="/admin/jobs/$id"
            params={{ id: "new" }}
            className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
          >
            {t("admin.jobs.list.newJob")}
          </Link>
        </div>

        {q.isLoading && (
          <p className="text-sm text-muted-foreground">{t("admin.jobs.list.loading")}</p>
        )}
        {q.isError && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}

        {q.data && q.data.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("admin.jobs.list.empty")}</p>
        )}

        {q.data && q.data.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="p-3 font-medium">{t("admin.jobs.list.column.title")}</th>
                  <th className="p-3 font-medium">{t("admin.jobs.list.column.employer")}</th>
                  <th className="p-3 font-medium">{t("admin.jobs.list.column.status")}</th>
                  <th className="p-3 font-medium">{t("admin.jobs.list.column.family")}</th>
                  <th className="p-3 font-medium">{t("admin.jobs.list.column.updated")}</th>
                  <th className="p-3" />
                </tr>
              </thead>
              <tbody>
                {q.data.map((j: any) => (
                  <tr key={j.id} className="border-t">
                    <td className="p-3">
                      <div className="font-medium">
                        {j.title_sv || j.title_en || (
                          <em className="text-muted-foreground">{t("admin.jobs.list.untitled")}</em>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">{j.slug}</div>
                    </td>
                    <td className="p-3">{j.employer?.name ?? "—"}</td>
                    <td className="p-3">
                      <Badge variant="outline">
                        {t(
                          STATUS_LABEL_KEY[j.status as (typeof STATUSES)[number]] ??
                            "admin.jobs.status.draft",
                        )}
                      </Badge>
                    </td>
                    <td className="p-3 text-xs">{j.family_id ?? "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground">
                      {formatDateTime(j.updated_at, lang)}
                    </td>
                    <td className="p-3 text-right">
                      <Link
                        to="/admin/jobs/$id"
                        params={{ id: j.id }}
                        className="text-primary hover:underline"
                      >
                        {t("admin.jobs.list.open")}
                      </Link>
                    </td>
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
