// One BESKT method version, inside the admin console.
//
// The page itself is shared with /beskt-governance/$methodVersionId, where
// editors, reviewers and publishers who are not platform admins reach it.
// See src/components/admin/beskt/surface.tsx.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { BesktVersionPage } from "@/components/admin/beskt/pages/BesktVersionPage";

const TABS = ["content", "lifecycle", "access"] as const;
const searchSchema = z.object({ tab: z.enum(TABS).catch("content").optional() });

export const Route = createFileRoute("/_authenticated/admin/beskt-methods/$methodVersionId")({
  ssr: false,
  component: AdminBesktVersionRoute,
  validateSearch: (search) => searchSchema.parse(search),
});

function AdminBesktVersionRoute() {
  const { methodVersionId } = Route.useParams();
  const { tab } = Route.useSearch();
  return <BesktVersionPage surface="admin" methodVersionId={methodVersionId} tab={tab} />;
}
