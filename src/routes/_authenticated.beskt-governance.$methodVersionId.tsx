// BESKT governance — one method version: its content and its lifecycle.
//
// No access tab here: mandates and pilot grants are the platform admin's
// decisions and live in the admin console.

import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { BesktVersionPage } from "@/components/admin/beskt/pages/BesktVersionPage";

const TABS = ["content", "lifecycle"] as const;
const searchSchema = z.object({ tab: z.enum(TABS).catch("content").optional() });

export const Route = createFileRoute("/_authenticated/beskt-governance/$methodVersionId")({
  ssr: false,
  component: GovernanceVersionRoute,
  validateSearch: (search) => searchSchema.parse(search),
});

function GovernanceVersionRoute() {
  const { methodVersionId } = Route.useParams();
  const { tab } = Route.useSearch();
  return <BesktVersionPage surface="governance" methodVersionId={methodVersionId} tab={tab} />;
}
