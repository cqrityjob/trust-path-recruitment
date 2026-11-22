import { createFileRoute } from "@tanstack/react-router";
import { SecuritySupplierRequest } from "@/components/security-work/suppliers/RequestDetail";
export const Route = createFileRoute(
  "/_authenticated/security-work/$workspaceId/supplier-requests/$requestId",
)({
  component: function SupplierRequestRoute() {
    const { requestId } = Route.useParams();
    // Keyed so moving between requests never shows the previous request's form state.
    return <SecuritySupplierRequest key={requestId} requestId={requestId} />;
  },
});
