// H3.4B — admin-facing read view for beta_feedback (the counterpart of
// /feedback). Admin-only per listBetaFeedback()'s own is_platform_admin()
// check; this route additionally sits under _authenticated/admin, which
// already gates on adminWhoAmI() (unchanged, established H3.3 pattern).

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteLayout } from "@/components/site/SiteLayout";
import { AdminShellChrome } from "@/components/admin/AdminShellChrome";
import { useT } from "@/i18n/context";
import { formatDateTime } from "@/lib/job-intelligence/date-format";
import { listBetaFeedback } from "@/lib/job-intelligence/beta-feedback.functions";

export const Route = createFileRoute("/_authenticated/admin/feedback")({
  ssr: false,
  component: AdminFeedbackPage,
});

function AdminFeedbackPage() {
  const { t, lang } = useT();
  const listFn = useServerFn(listBetaFeedback);
  const q = useQuery({
    queryKey: ["admin", "beta-feedback"],
    queryFn: () => listFn(),
  });

  return (
    <SiteLayout>
      <AdminShellChrome activeSection="feedback">
        <h1 className="text-xl font-semibold text-foreground">{t("feedback.heading")}</h1>

        <div className="mt-6">
          {q.isLoading && <p className="text-sm text-muted-foreground">{t("admin.loading")}</p>}
          {q.isError && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
          {q.data && q.data.length === 0 && <p className="text-sm text-muted-foreground">—</p>}
          {q.data && q.data.length > 0 && (
            <ul className="space-y-3">
              {q.data.map((f) => (
                <li
                  key={f.id}
                  className="rounded-lg border border-border bg-background p-4 text-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="inline-flex rounded-full border border-border px-2 py-0.5 text-xs font-medium uppercase">
                      {t(
                        f.category === "bug"
                          ? "feedback.category.bug"
                          : f.category === "idea"
                            ? "feedback.category.idea"
                            : "feedback.category.other",
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDateTime(f.createdAt, lang)}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-foreground">{f.message}</p>
                  {f.pagePath && (
                    <p className="mt-2 truncate text-xs text-muted-foreground">{f.pagePath}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </AdminShellChrome>
    </SiteLayout>
  );
}
