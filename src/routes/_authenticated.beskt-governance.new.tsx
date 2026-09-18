// BESKT governance — an editor creates a method identity and its first draft.

import { createFileRoute } from "@tanstack/react-router";

import { NewBesktMethodPage } from "@/components/admin/beskt/pages/NewBesktMethodPage";

export const Route = createFileRoute("/_authenticated/beskt-governance/new")({
  ssr: false,
  component: () => <NewBesktMethodPage surface="governance" />,
});
