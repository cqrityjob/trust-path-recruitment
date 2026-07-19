// Phase G2 — Employer context layout.
//
// Pure layout: inherits the existing _authenticated.tsx session gate
// transitively (file-based nesting — no second auth system, no new
// guard logic at this level). Selected/visited employer context is
// never decided here; every actual access decision happens in the
// child routes below, each independently re-validated against
// listMyEmployerWorkspaces()'s RLS-scoped result. Matches the exact
// _authenticated.my-career.tsx layout pattern (Outlet only).

import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/employer")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Employer workspace — CQrityjob" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: EmployerLayout,
});

function EmployerLayout() {
  return <Outlet />;
}
