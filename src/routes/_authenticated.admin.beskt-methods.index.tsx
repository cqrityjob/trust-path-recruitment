// BESKT — the method list, inside the admin console.
//
// The page itself is shared with /beskt-governance, where editors, reviewers
// and publishers who are not platform admins reach it.
// See src/components/admin/beskt/surface.tsx.

import { createFileRoute } from "@tanstack/react-router";

import { BesktMethodListPage } from "@/components/admin/beskt/pages/BesktMethodListPage";

export const Route = createFileRoute("/_authenticated/admin/beskt-methods/")({
  ssr: false,
  component: () => <BesktMethodListPage surface="admin" />,
});
