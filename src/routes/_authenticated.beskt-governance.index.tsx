// BESKT governance — the method list for editors, reviewers and publishers.

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { BesktMethodListPage } from "@/components/admin/beskt/pages/BesktMethodListPage";
import { getBesktGovernanceAccess } from "@/lib/beskt/governance.functions";

export const Route = createFileRoute("/_authenticated/beskt-governance/")({
  ssr: false,
  component: GovernanceListRoute,
});

function GovernanceListRoute() {
  const accessFn = useServerFn(getBesktGovernanceAccess);
  // The layout has already answered this; the query is served from its cache.
  const access = useQuery({
    queryKey: ["beskt", "governance-access"],
    queryFn: () => accessFn(),
    retry: false,
  });
  // Only an editor may create a method. Offering the form to a reviewer or a
  // publisher would offer an action the database always refuses.
  const canCreate = access.data?.contentRoles.includes("editor") ?? false;
  return <BesktMethodListPage surface="governance" canCreate={canCreate} />;
}
