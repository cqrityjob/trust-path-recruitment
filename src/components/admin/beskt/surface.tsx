// Where the BESKT governance screens are mounted.
//
// ── WHY THERE ARE TWO SURFACES ──────────────────────────────────────────
//
// The contract separates duties on purpose: an editor authors, five
// reviewers each decide one gate, a publisher who is not the author
// publishes, and a platform admin grants mandates and pilot access. Only the
// last of those is a platform administrator. Mounting every screen under
// /admin -- which only a platform admin may enter -- meant the other seven
// people could not reach the page their role exists for, and the only way to
// activate a method would have been to make all of them administrators.
//
// So the SAME pages are mounted twice:
//
//   /admin/beskt-methods/...   the platform admin, inside the admin console;
//   /beskt-governance/...      editors, reviewers and publishers, gated by
//                              scp_interview_can_read -- the predicate every
//                              governance table's SELECT policy applies.
//
// Nothing about authority changes. Every action is still a governed RPC that
// decides for itself; the surface only decides where the page is drawn and
// which links point where.

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

import { SiteLayout } from "@/components/site/SiteLayout";
import { AdminShellChrome } from "@/components/admin/AdminShellChrome";

export type BesktSurface = "admin" | "governance";
export type BesktVersionTab = "content" | "lifecycle" | "access";

export function BesktSurfaceShell({
  surface,
  children,
}: {
  readonly surface: BesktSurface;
  readonly children: ReactNode;
}) {
  if (surface === "admin") {
    return (
      <SiteLayout>
        <AdminShellChrome activeSection="besktMethods">{children}</AdminShellChrome>
      </SiteLayout>
    );
  }
  return (
    <SiteLayout>
      <div
        className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-10"
        data-testid="beskt-governance-surface"
      >
        {children}
      </div>
    </SiteLayout>
  );
}

export function BesktMethodsLink({
  surface,
  className,
  children,
}: {
  readonly surface: BesktSurface;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return surface === "admin" ? (
    <Link to="/admin/beskt-methods" className={className}>
      {children}
    </Link>
  ) : (
    <Link to="/beskt-governance" className={className}>
      {children}
    </Link>
  );
}

export function BesktNewMethodLink({
  surface,
  className,
  children,
}: {
  readonly surface: BesktSurface;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return surface === "admin" ? (
    <Link to="/admin/beskt-methods/new" className={className}>
      {children}
    </Link>
  ) : (
    <Link to="/beskt-governance/new" className={className}>
      {children}
    </Link>
  );
}

export function BesktVersionLink({
  surface,
  methodVersionId,
  tab,
  className,
  current,
  children,
}: {
  readonly surface: BesktSurface;
  readonly methodVersionId: string;
  readonly tab?: BesktVersionTab;
  readonly className?: string;
  readonly current?: boolean;
  readonly children: ReactNode;
}) {
  const search = tab ? { tab } : {};
  // The governance surface has no access tab (see the route); a link to it
  // lands on the content tab rather than on a tab that is not drawn there.
  const governanceSearch = tab && tab !== "access" ? { tab } : {};
  const ariaCurrent = current ? ("page" as const) : undefined;
  return surface === "admin" ? (
    <Link
      to="/admin/beskt-methods/$methodVersionId"
      params={{ methodVersionId }}
      search={search}
      className={className}
      aria-current={ariaCurrent}
      activeOptions={{ exact: true, includeSearch: true }}
    >
      {children}
    </Link>
  ) : (
    <Link
      to="/beskt-governance/$methodVersionId"
      params={{ methodVersionId }}
      search={governanceSearch}
      className={className}
      aria-current={ariaCurrent}
      activeOptions={{ exact: true, includeSearch: true }}
    >
      {children}
    </Link>
  );
}
