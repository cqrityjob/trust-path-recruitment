// Admin Portal — Assessment Catalog management list.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { AdminShellChrome } from "@/components/admin/AdminShellChrome";
import { useT } from "@/i18n/context";
import type { TranslationKey } from "@/i18n/dictionaries";
import { Badge } from "@/components/ui/badge";
import { adminListAssessmentCatalog } from "@/lib/job-intelligence/admin-assessment-catalog.functions";

export const Route = createFileRoute("/_authenticated/admin/assessments")({
  ssr: false,
  component: AdminAssessmentsPage,
});

function AdminAssessmentsPage() {
  const { t, lang } = useT();
  const listFn = useServerFn(adminListAssessmentCatalog);
  const [visibility, setVisibility] = useState<"all" | "visible" | "hidden">("all");

  const q = useQuery({
    queryKey: ["admin", "assessments", visibility],
    queryFn: () => listFn({ data: { status: "all", visibility, roleCategory: "all" } }),
  });

  return (
    <SiteLayout>
      <AdminShellChrome activeSection="assessments">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          {t("admin.assessments.list.heading")}
        </h1>

        <div className="mt-6 flex flex-wrap gap-1">
          {(["all", "visible", "hidden"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVisibility(v)}
              className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                visibility === v
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-muted"
              }`}
            >
              {t(`admin.assessments.list.filter.${v}` as TranslationKey)}
            </button>
          ))}
        </div>

        <div className="mt-6">
          {q.isLoading && <p className="text-sm text-muted-foreground">{t("admin.loading")}</p>}
          {q.isError && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
          {q.isSuccess && q.data.length === 0 && (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
              {t("admin.assessments.list.empty")}
            </div>
          )}
          {q.isSuccess && q.data.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">{t("admin.assessments.list.column.name")}</th>
                    <th className="px-4 py-3">{t("admin.assessments.list.column.kind")}</th>
                    <th className="px-4 py-3">{t("admin.assessments.list.column.visibility")}</th>
                    <th className="px-4 py-3">{t("admin.assessments.list.column.roleCategory")}</th>
                    <th className="px-4 py-3">{t("admin.assessments.list.column.questions")}</th>
                    <th className="px-4 py-3">{t("admin.assessments.list.column.status")}</th>
                    <th className="px-4 py-3 text-right">&nbsp;</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {q.data.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="px-4 py-3 font-medium text-foreground">
                        {lang === "sv" ? r.nameSv : r.nameEn}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{r.kind}</td>
                      <td className="px-4 py-3">
                        <Badge variant={r.employerVisible ? "default" : "outline"}>
                          {r.employerVisible
                            ? t("admin.assessments.visibility.visible")
                            : t("admin.assessments.visibility.hidden")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {r.roleCategory ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{r.questionCount}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline">
                          {t(
                            `admin.assessments.publicationStatus.${r.publicationStatus}` as TranslationKey,
                          )}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to="/admin/assessments/$assessmentId"
                          params={{ assessmentId: r.id }}
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
