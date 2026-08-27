// Layout-only route -- same pattern as _authenticated.admin.assessments.tsx.
// The list lives in _authenticated.admin.interview-role-packs.index.tsx.
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/interview-role-packs")({
  ssr: false,
  component: () => <Outlet />,
});
