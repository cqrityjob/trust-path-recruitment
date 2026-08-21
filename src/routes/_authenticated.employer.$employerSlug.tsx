// Phase H3 — Layout for /employer/$employerSlug/*. The leaf dashboard
// lives in _authenticated.employer.$employerSlug.index.tsx; the job
// management surfaces (list/new/edit) live in sibling files.
//
// ── WHY THIS LAYOUT NOW CHECKS SOMETHING ──────────────────────────────
//
// An employer organisation is created as `pending` and stays that way until a
// platform administrator approves it. Roughly thirty RLS policies already
// require employer_is_active_status(), so an unapproved organisation cannot
// publish a job, see a real application, or assign an assessment. The database
// has always held that line.
//
// What was missing was any acknowledgement of it in the interface. Typing
// /employer/some-slug loaded the whole workspace, which then refused
// everything -- a permissions failure wearing the costume of a product. One
// check here covers every child route, because they all render through this
// Outlet.
//
// This is emphatically NOT the security boundary. It is a redirect, it runs in
// the browser, and anyone can skip it. The boundary is RLS plus the membership
// checks inside every server function, both unchanged. This exists so that a
// person who is genuinely waiting is told they are waiting, rather than being
// walked into a room where nothing works.

import { createFileRoute, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { useT } from "@/i18n/context";
import { listMyEmployerWorkspaces } from "@/lib/job-intelligence/membership.functions";
import { employerPortalEnabled } from "@/lib/job-intelligence/feature-flag";

export const Route = createFileRoute("/_authenticated/employer/$employerSlug")({
  ssr: false,
  component: EmployerWorkspaceGate,
});

function EmployerWorkspaceGate() {
  const { employerSlug } = useParams({ from: "/_authenticated/employer/$employerSlug" });
  const { t } = useT();
  const navigate = useNavigate();
  const listWorkspaces = useServerFn(listMyEmployerWorkspaces);

  // Shares the cache key every child page already uses, so this costs one
  // fetch for the whole subtree rather than one more.
  const query = useQuery({
    queryKey: ["employer", "my-workspaces"],
    queryFn: () => listWorkspaces(),
    enabled: employerPortalEnabled(),
  });

  const workspace = (query.data ?? []).find((w) => w.employerSlug === employerSlug);
  const underReview =
    workspace !== undefined &&
    workspace.employerStatus !== "active" &&
    workspace.employerStatus !== "archived";

  useEffect(() => {
    if (underReview) navigate({ to: "/employer/pending", replace: true });
  }, [underReview, navigate]);

  // A slug this person has no membership for falls through to the child page,
  // which renders the existing access-denied surface. Redirecting here would
  // tell a stranger which slugs exist.
  if (underReview) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16">
        <p className="text-sm text-muted-foreground">{t("employer.pending.checking")}</p>
      </div>
    );
  }

  return <Outlet />;
}
