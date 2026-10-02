import { createFileRoute } from "@tanstack/react-router";
import { SecurityRisksActions } from "@/components/security-work/RisksActions";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const id = (value: unknown) => (typeof value === "string" && uuid.test(value) ? value : undefined);
export const Route = createFileRoute("/_authenticated/security-work/$workspaceId/risks")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { new?: boolean; assetId?: string; gapId?: string; riskId?: string } => ({
    new: search.new === true || search.new === "true" ? true : undefined,
    assetId: id(search.assetId),
    gapId: id(search.gapId),
    riskId: id(search.riskId),
  }),
  component: SecurityRisksActions,
});
