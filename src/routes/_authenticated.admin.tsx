// Phase H3.3 — protected admin layout. Nested under _authenticated (which
// already redirects an unauthenticated visitor to /auth?intent=admin ->
// /admin/login). This layout adds the second, real authorization check:
// is_platform_admin(auth.uid()), verified server-side via adminWhoAmI()
// (unchanged from Phase B/G1 -- one source of truth for "is this user an
// admin," reused by /admin/login's own post-auth check too).
//
// A signed-in non-admin now sees an explicit, safe "access denied"
// message (matching the exact required copy) instead of the previous
// silent navigate-away -- consistent with every other H3.x access-denied
// surface in this app, and never reveals anything about admin-only data.

import { createFileRoute, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { SiteLayout } from "@/components/site/SiteLayout";
import { useT } from "@/i18n/context";
import { adminWhoAmI } from "@/lib/job-intelligence/admin.functions";
import { AdminErrorState } from "@/components/admin/AdminErrorState";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  head: () => ({
    meta: [{ title: "Admin — CQrityjob" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: AdminLayout,
  errorComponent: AdminErrorState,
});

function AdminLayout() {
  const { t } = useT();
  const whoAmI = useServerFn(adminWhoAmI);
  const q = useQuery({ queryKey: ["admin", "whoami"], queryFn: () => whoAmI() });

  if (q.isLoading) {
    return (
      <SiteLayout>
        <div className="mx-auto max-w-2xl px-4 py-16">
          <p className="text-sm text-muted-foreground">{t("admin.loading")}</p>
        </div>
      </SiteLayout>
    );
  }

  if (q.isError || !q.data?.isAdmin) {
    return (
      <SiteLayout>
        <div className="mx-auto max-w-md px-4 py-16 text-center">
          <h1 className="text-xl font-semibold text-foreground">
            {t("admin.accessDenied.heading")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("admin.accessDenied.body")}</p>
          <div className="mt-6">
            <Link to="/my-career" className="text-sm font-medium text-accent hover:underline">
              {t("admin.accessDenied.backToMyCareer")}
            </Link>
          </div>
        </div>
      </SiteLayout>
    );
  }

  return <Outlet />;
}
