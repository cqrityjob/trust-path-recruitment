import { createFileRoute, Outlet, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { Section } from "@/components/site/Section";
import { adminWhoAmI } from "@/lib/job-intelligence/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Admin — CQrityjob" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminLayout,
});

function AdminLayout() {
  const whoAmI = useServerFn(adminWhoAmI);
  const navigate = useNavigate();
  const q = useQuery({ queryKey: ["admin", "whoami"], queryFn: () => whoAmI() });

  useEffect(() => {
    if (q.data && !q.data.isAdmin) {
      navigate({ to: "/journey" });
    }
  }, [q.data, navigate]);

  if (q.isLoading) {
    return (
      <SiteLayout>
        <Section>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </Section>
      </SiteLayout>
    );
  }
  if (q.isError) {
    return (
      <SiteLayout>
        <Section>
          <p className="text-sm text-destructive">
            Failed to verify admin access. {(q.error as Error).message}
          </p>
        </Section>
      </SiteLayout>
    );
  }
  if (!q.data?.isAdmin) return null;

  return (
    <SiteLayout>
      <Section>
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Job Intelligence · Admin</h1>
            <p className="text-sm text-muted-foreground">
              Moderation console. All actions are recorded in the audit log.
            </p>
          </div>
          <nav className="flex gap-4 text-sm">
            <Link
              to="/admin/jobs"
              className="text-primary hover:underline"
              activeProps={{ className: "font-semibold underline" }}
            >
              Jobs
            </Link>
            <Link
              to="/admin/employers"
              className="text-primary hover:underline"
              activeProps={{ className: "font-semibold underline" }}
            >
              Employers
            </Link>
          </nav>
        </div>
        <Outlet />
      </Section>
    </SiteLayout>
  );
}