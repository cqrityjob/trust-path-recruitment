// Shared client-side workspace resolution for Employer OS module pages.
//
// Every /employer/$employerSlug/* page re-derives the caller's own active
// workspace via listMyEmployerWorkspaces() independently (the established
// G2 pattern — slug is a lookup key, never a credential). This hook only
// factors out that boilerplate for the read-only "which workspace, is it
// still loading, did it error" concern; it performs no authorization
// decision of its own and every server function called from a page using
// this hook still independently re-verifies active membership server-side.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyEmployerWorkspaces } from "@/lib/job-intelligence/membership.functions";
import { employerPortalEnabled } from "@/lib/job-intelligence/feature-flag";

export function useEmployerWorkspace(employerSlug: string) {
  const portalEnabled = employerPortalEnabled();
  const listWorkspaces = useServerFn(listMyEmployerWorkspaces);
  const query = useQuery({
    queryKey: ["employer", "my-workspaces"],
    queryFn: () => listWorkspaces(),
    enabled: portalEnabled,
  });

  const workspaces = query.data ?? [];
  const workspace = workspaces.find((w) => w.employerSlug === employerSlug);

  return {
    portalEnabled,
    isLoading: query.isLoading,
    isError: query.isError,
    workspaces,
    workspace,
    hasMultipleWorkspaces: workspaces.length > 1,
  };
}
