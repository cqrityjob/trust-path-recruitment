// Phase H3 — Layout for /employer/$employerSlug/*. The leaf dashboard
// lives in _authenticated.employer.$employerSlug.index.tsx; the job
// management surfaces (list/new/edit) live in sibling files.
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/employer/$employerSlug")({
  ssr: false,
  component: () => <Outlet />,
});