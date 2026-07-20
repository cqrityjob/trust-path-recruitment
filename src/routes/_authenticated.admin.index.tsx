// Phase H3.3 — /admin: the admin overview page. Previously a bare
// redirect straight to /admin/jobs; now a real landing page (the
// AdminShellChrome nav's "Overview" item needs somewhere real to point
// to), showing the pending-employer count and quick links into the two
// moderation areas.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteLayout } from "@/components/site/SiteLayout";
import { useT } from "@/i18n/context";
import { AdminShellChrome } from "@/components/admin/AdminShellChrome";
import { adminCountPendingEmployers } from "@/lib/job-intelligence/admin-employer-moderation.functions";

export const Route = createFileRoute("/_authenticated/admin/")({
  ssr: false,
  component: AdminOverviewPage,
});

function AdminOverviewPage() {
  const { t } = useT();
  const pendingCountFn = useServerFn(adminCountPendingEmployers);
  const pendingCountQuery = useQuery({
    queryKey: ["admin", "pending-employers-count"],
    queryFn: () => pendingCountFn(),
  });

  return (
    <SiteLayout>
      <AdminShellChrome activeSection="overview">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Link
            to="/admin/employers"
            className="rounded-lg border border-border bg-background p-5 transition-colors hover:border-accent/50"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("admin.nav.employers")}
            </p>
            <p className="mt-2 text-2xl font-semibold text-foreground">
              {pendingCountQuery.isLoading ? "—" : (pendingCountQuery.data ?? 0)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("admin.employers.list.pendingCount")}
            </p>
          </Link>
          <Link
            to="/admin/jobs"
            className="rounded-lg border border-border bg-background p-5 transition-colors hover:border-accent/50"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t("admin.nav.jobs")}
            </p>
            <p className="mt-2 text-sm font-medium text-foreground">
              {t("admin.employers.list.open")}
            </p>
          </Link>
        </div>
      </AdminShellChrome>
    </SiteLayout>
  );
}
