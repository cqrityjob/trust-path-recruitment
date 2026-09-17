// Layout-only route — the same pattern as the role-pack builder beside it.
// The list lives in _authenticated.admin.beskt-methods.index.tsx.
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/beskt-methods")({
  ssr: false,
  component: () => <Outlet />,
});
