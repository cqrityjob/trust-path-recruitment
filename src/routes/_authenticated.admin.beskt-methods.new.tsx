// BESKT — create a method identity and its first draft, inside the admin
// console. The page is shared with /beskt-governance/new, where an editor who
// is not a platform admin reaches it. See src/components/admin/beskt/surface.tsx.

import { createFileRoute } from "@tanstack/react-router";

import { NewBesktMethodPage } from "@/components/admin/beskt/pages/NewBesktMethodPage";

export const Route = createFileRoute("/_authenticated/admin/beskt-methods/new")({
  ssr: false,
  component: () => <NewBesktMethodPage surface="admin" />,
});
