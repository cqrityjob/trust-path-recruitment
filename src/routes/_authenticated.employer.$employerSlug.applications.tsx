// Layout-only route -- mirrors _authenticated.admin.applications.tsx. The
// list moved to _authenticated.employer.$employerSlug.applications.index.tsx
// so that /applications/$applicationId (the candidate view) can nest under
// the same segment without the list rendering above it.
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/employer/$employerSlug/applications")({
  ssr: false,
  component: () => <Outlet />,
});
