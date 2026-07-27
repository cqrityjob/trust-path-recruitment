// Layout-only route -- mirrors _authenticated.admin.jobs.tsx / the
// employers-module fix (see that file's comment for the full root-cause
// explanation). List content moved to
// _authenticated.admin.assessments.index.tsx.
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/assessments")({
  ssr: false,
  component: () => <Outlet />,
});
