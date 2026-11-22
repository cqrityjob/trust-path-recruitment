import { createFileRoute } from "@tanstack/react-router";
import { SecuritySupplier } from "@/components/security-work/suppliers/SupplierDetail";
export const Route = createFileRoute(
  "/_authenticated/security-work/$workspaceId/suppliers/$assetId",
)({
  component: function SupplierRoute() {
    const { assetId } = Route.useParams();
    return <SecuritySupplier key={assetId} assetId={assetId} />;
  },
});
