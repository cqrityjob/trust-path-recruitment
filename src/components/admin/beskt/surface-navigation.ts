// Programmatic navigation to one BESKT method version on either surface.
// Kept apart from ./surface.tsx so that file exports components only.

import { useNavigate } from "@tanstack/react-router";

import type { BesktSurface, BesktVersionTab } from "./surface";

/** Navigate to one version on whichever surface the page is mounted on. */
export function useBesktVersionNavigate(surface: BesktSurface) {
  const navigate = useNavigate();
  return (methodVersionId: string, tab: BesktVersionTab = "content") =>
    surface === "admin"
      ? navigate({
          to: "/admin/beskt-methods/$methodVersionId",
          params: { methodVersionId },
          search: { tab },
        })
      : navigate({
          to: "/beskt-governance/$methodVersionId",
          params: { methodVersionId },
          search: { tab: tab === "access" ? "content" : tab },
        });
}
