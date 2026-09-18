// BESKT governance — the surface for editors, reviewers and publishers.
//
// The governance contract separates duties: an editor authors, five
// reviewers each decide one gate, a publisher who is not the author
// publishes. None of them needs to be a platform admin, and none should have
// to become one to do their job. This layout admits exactly the people the
// governance tables' own SELECT policies admit -- `scp_interview_can_read` --
// and every action behind it is still decided by its governed RPC.
//
// Mandates and employer pilot grants stay in the admin console: they are the
// platform admin's decisions. See src/components/admin/beskt/surface.tsx.

import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { SiteLayout } from "@/components/site/SiteLayout";
import { useT } from "@/i18n/context";
import { getBesktGovernanceAccess } from "@/lib/beskt/governance.functions";

export const Route = createFileRoute("/_authenticated/beskt-governance")({
  ssr: false,
  head: () => ({
    meta: [{ title: "BESKT — CQrityjob" }, { name: "robots", content: "noindex, nofollow" }],
  }),
  component: BesktGovernanceLayout,
});

const besktGovernanceAccessKey = ["beskt", "governance-access"] as const;

function BesktGovernanceLayout() {
  const { t } = useT();
  const accessFn = useServerFn(getBesktGovernanceAccess);
  const q = useQuery({
    queryKey: besktGovernanceAccessKey,
    queryFn: () => accessFn(),
    retry: false,
  });

  if (q.isLoading) {
    return (
      <SiteLayout>
        <div className="mx-auto max-w-2xl px-4 py-16">
          <p className="text-sm text-muted-foreground">{t("beskt.governance.loading")}</p>
        </div>
      </SiteLayout>
    );
  }

  // A failed check and a refused check are different facts. A technical
  // failure must never read as "you have no role" -- that is the one
  // sentence that would send a reviewer to ask for access they already have.
  if (q.isError) {
    return (
      <SiteLayout>
        <div className="mx-auto max-w-md px-4 py-16 text-center" role="alert">
          <h1 className="text-xl font-semibold text-foreground">
            {t("beskt.governance.error.heading")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("beskt.governance.error.body")}</p>
          <button
            type="button"
            className="mt-6 inline-flex min-h-[44px] items-center rounded-md border border-border px-4 text-sm font-medium"
            onClick={() => void q.refetch()}
          >
            {t("beskt.governance.error.retry")}
          </button>
        </div>
      </SiteLayout>
    );
  }

  if (!q.data?.canRead) {
    return (
      <SiteLayout>
        <div className="mx-auto max-w-md px-4 py-16 text-center">
          <h1 className="text-xl font-semibold text-foreground">
            {t("beskt.governance.denied.heading")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">{t("beskt.governance.denied.body")}</p>
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
