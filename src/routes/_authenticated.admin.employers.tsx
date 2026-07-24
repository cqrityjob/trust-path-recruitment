// Layout-only route -- mirrors _authenticated.admin.jobs.tsx exactly.
//
// Root cause of the "Granska" (open employer detail) bug: this file used
// to render the employer list directly (no <Outlet/>), while
// _authenticated.admin.employers.$employerId.tsx's flat-file dot-prefix
// nests it as this route's CHILD (confirmed in routeTree.gen.ts:
// getParentRoute pointed here). With no <Outlet/> in the parent, the
// child route could never render -- navigating to
// /admin/employers/$employerId matched correctly but the parent's own
// list content is all that was ever mounted, so clicking "Granska"
// appeared to do nothing. The list content has moved to
// _authenticated.admin.employers.index.tsx (a sibling of $employerId
// under this layout, exactly like admin.jobs.tsx / admin.jobs.index.tsx
// / admin.jobs.$id.tsx already do) -- this file is now Outlet-only.
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/admin/employers")({
  ssr: false,
  component: () => <Outlet />,
});
