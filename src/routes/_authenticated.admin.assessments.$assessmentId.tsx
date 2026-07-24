// Admin Portal — Assessment Catalog detail: toggle employer visibility,
// assign role category, publish a new version, retire a version. Every
// action is a narrow, validated server function over assessments/
// assessment_versions -- never a raw form editing scoring or question
// content, and never a destructive edit of a historical version (retire
// only ever sets retired_at; publish only ever inserts a new row).

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { AdminShellChrome } from "@/components/admin/AdminShellChrome";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import { useT } from "@/i18n/context";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  adminGetAssessmentCatalogEntry,
  adminPublishAssessmentVersion,
  adminRetireAssessmentVersion,
  adminSetAssessmentRoleCategory,
  adminSetAssessmentVisibility,
} from "@/lib/job-intelligence/admin-assessment-catalog.functions";
import { formatDateTime } from "@/lib/job-intelligence/date-format";

export const Route = createFileRoute("/_authenticated/admin/assessments/$assessmentId")({
  ssr: false,
  component: AdminAssessmentDetailPage,
  errorComponent: AdminErrorState,
});

function AdminAssessmentDetailPage() {
  const { assessmentId } = Route.useParams();
  const { t, lang } = useT();
  const qc = useQueryClient();
  const getFn = useServerFn(adminGetAssessmentCatalogEntry);
  const setVisibilityFn = useServerFn(adminSetAssessmentVisibility);
  const setRoleCategoryFn = useServerFn(adminSetAssessmentRoleCategory);
  const publishFn = useServerFn(adminPublishAssessmentVersion);
  const retireFn = useServerFn(adminRetireAssessmentVersion);

  const q = useQuery({
    queryKey: ["admin", "assessment-detail", assessmentId],
    queryFn: () => getFn({ data: { assessmentId } }),
  });

  const [publishForm, setPublishForm] = useState({
    modelVersion: "",
    disclaimerVersion: "",
    notes: "",
  });
  const [error, setError] = useState<string | null>(null);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["admin", "assessment-detail", assessmentId] });
    qc.invalidateQueries({ queryKey: ["admin", "assessments"] });
  }

  const toggleVisibility = useMutation({
    mutationFn: (visible: boolean) => setVisibilityFn({ data: { assessmentId, visible } }),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  });

  const setRoleCategory = useMutation({
    mutationFn: (roleCategory: "operational" | "strategic" | null) =>
      setRoleCategoryFn({ data: { assessmentId, roleCategory } }),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  });

  const publish = useMutation({
    mutationFn: () =>
      publishFn({
        data: {
          assessmentId,
          modelVersion: publishForm.modelVersion.trim(),
          disclaimerVersion: publishForm.disclaimerVersion.trim(),
          notes: publishForm.notes || null,
        },
      }),
    onSuccess: () => {
      setPublishForm({ modelVersion: "", disclaimerVersion: "", notes: "" });
      invalidate();
    },
    onError: (e: Error) => setError(e.message),
  });

  const retire = useMutation({
    mutationFn: (versionId: string) => retireFn({ data: { assessmentId, versionId } }),
    onSuccess: invalidate,
    onError: (e: Error) => setError(e.message),
  });

  if (q.isLoading) {
    return (
      <SiteLayout>
        <AdminShellChrome activeSection="assessments">
          <p className="text-sm text-muted-foreground">{t("admin.loading")}</p>
        </AdminShellChrome>
      </SiteLayout>
    );
  }
  if (q.isError || !q.data) {
    return (
      <SiteLayout>
        <AdminShellChrome activeSection="assessments">
          <h1 className="text-xl font-semibold text-foreground">
            {t("admin.assessments.detail.notFound")}
          </h1>
          <div className="mt-4">
            <Link
              to="/admin/assessments"
              className="text-sm font-medium text-accent hover:underline"
            >
              {t("admin.assessments.detail.backToList")}
            </Link>
          </div>
        </AdminShellChrome>
      </SiteLayout>
    );
  }

  const a = q.data;

  return (
    <SiteLayout>
      <AdminShellChrome activeSection="assessments">
        <Link to="/admin/assessments" className="text-xs font-medium text-accent hover:underline">
          ← {t("admin.assessments.detail.backToList")}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-foreground sm:text-3xl">
          {lang === "sv" ? a.nameSv : a.nameEn}
        </h1>
        <p className="text-sm text-muted-foreground">{a.id}</p>

        {error && (
          <p role="alert" className="mt-3 text-sm text-destructive">
            {error}
          </p>
        )}

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-lg border border-border bg-background p-5">
            <h2 className="text-sm font-semibold text-foreground">
              {t("admin.assessments.detail.section.visibility")}
            </h2>
            <div className="mt-3 flex items-center gap-3">
              <Badge variant={a.employerVisible ? "default" : "outline"}>
                {a.employerVisible
                  ? t("admin.assessments.visibility.visible")
                  : t("admin.assessments.visibility.hidden")}
              </Badge>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={toggleVisibility.isPending}
                onClick={() => toggleVisibility.mutate(!a.employerVisible)}
              >
                {a.employerVisible
                  ? t("admin.assessments.detail.action.hide")
                  : t("admin.assessments.detail.action.show")}
              </Button>
            </div>

            <div className="mt-5">
              <Label>{t("admin.assessments.detail.field.roleCategory")}</Label>
              <Select
                value={a.roleCategory ?? "none"}
                onValueChange={(v) =>
                  setRoleCategory.mutate(v === "none" ? null : (v as "operational" | "strategic"))
                }
              >
                <SelectTrigger className="mt-1 w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  <SelectItem value="operational">
                    {t("admin.assessments.roleCategory.operational")}
                  </SelectItem>
                  <SelectItem value="strategic">
                    {t("admin.assessments.roleCategory.strategic")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <p className="mt-5 text-xs text-muted-foreground">
              {t("admin.assessments.detail.field.questions")}: {a.questionCount}
            </p>
          </section>

          <section className="rounded-lg border border-border bg-background p-5">
            <h2 className="text-sm font-semibold text-foreground">
              {t("admin.assessments.detail.section.publish")}
            </h2>
            <form
              className="mt-3 space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                publish.mutate();
              }}
            >
              <div>
                <Label>{t("admin.assessments.detail.field.modelVersion")}</Label>
                <Input
                  value={publishForm.modelVersion}
                  onChange={(e) => setPublishForm((f) => ({ ...f, modelVersion: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label>{t("admin.assessments.detail.field.disclaimerVersion")}</Label>
                <Input
                  value={publishForm.disclaimerVersion}
                  onChange={(e) =>
                    setPublishForm((f) => ({ ...f, disclaimerVersion: e.target.value }))
                  }
                  required
                />
              </div>
              <div>
                <Label>{t("admin.assessments.detail.field.notes")}</Label>
                <Textarea
                  rows={2}
                  value={publishForm.notes}
                  onChange={(e) => setPublishForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <Button
                type="submit"
                size="sm"
                disabled={
                  publish.isPending ||
                  !publishForm.modelVersion.trim() ||
                  !publishForm.disclaimerVersion.trim()
                }
              >
                {t("admin.assessments.detail.action.publishVersion")}
              </Button>
            </form>
          </section>
        </div>

        <section className="mt-6 rounded-lg border border-border bg-background p-5">
          <h2 className="text-sm font-semibold text-foreground">
            {t("admin.assessments.detail.section.versions")}
          </h2>
          {a.versions.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {t("admin.assessments.detail.noVersions")}
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="py-1.5 pr-4">
                      {t("admin.assessments.detail.field.modelVersion")}
                    </th>
                    <th className="py-1.5 pr-4">
                      {t("admin.assessments.detail.field.disclaimerVersion")}
                    </th>
                    <th className="py-1.5 pr-4">{t("admin.employers.detail.field.created")}</th>
                    <th className="py-1.5 pr-4">{t("admin.employers.list.column.status")}</th>
                    <th className="py-1.5 pr-4" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {a.versions.map((v) => (
                    <tr key={v.id}>
                      <td className="py-1.5 pr-4">{v.modelVersion}</td>
                      <td className="py-1.5 pr-4">{v.disclaimerVersion}</td>
                      <td className="py-1.5 pr-4 text-xs text-muted-foreground">
                        {formatDateTime(v.publishedAt, lang)}
                      </td>
                      <td className="py-1.5 pr-4">
                        {v.retiredAt ? (
                          <Badge variant="outline">{t("admin.assessments.version.retired")}</Badge>
                        ) : (
                          <Badge>{t("admin.assessments.version.active")}</Badge>
                        )}
                      </td>
                      <td className="py-1.5 pr-4 text-right">
                        {!v.retiredAt && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={retire.isPending}
                            onClick={() => retire.mutate(v.id)}
                          >
                            {t("admin.assessments.detail.action.retireVersion")}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </AdminShellChrome>
    </SiteLayout>
  );
}
