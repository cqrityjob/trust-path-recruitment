import { createFileRoute } from "@tanstack/react-router";
import { SecuritySuppliers } from "@/components/security-work/suppliers/Suppliers";
export const Route = createFileRoute("/_authenticated/security-work/$workspaceId/suppliers/")({
  component: SecuritySuppliers,
});
