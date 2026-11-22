import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getSecurityBrief, getSecurityImpact } from "@/lib/security-work/impact/functions";
import type { BriefDetail, ImpactOverview } from "@/lib/security-work/impact/services";
import { briefStatusLabel } from "@/lib/security-work/impact/export";
import type { CoverageState } from "@/lib/security-work/knowledge/coverage";
import { securityWorkKeys } from "@/lib/security-work/query-keys";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/context";
import { useSecurityWorkspace } from "../context";
import { useWorkText } from "../analysis-ui";

export const impactKey = (userId: string, workspaceId: string) =>
  [...securityWorkKeys.workspace(userId, workspaceId), "impact"] as const;

export function useImpact() {
  const { user, workspace, deny } = useSecurityWorkspace();
  const read = useServerFn(getSecurityImpact);
  const query = useQuery({
    queryKey: impactKey(user.id, workspace.id),
    retry: false,
    queryFn: async () => {
      const result = await read({ data: { workspaceId: workspace.id } });
      if (!result.ok) throw new Error(result.code);
      return result.data as ImpactOverview;
    },
  });
  useEffect(() => {
    if (query.error?.message === "ACCESS_DENIED") deny();
  }, [query.error, deny]);
  return query;
}

/** A brief the person may not see answers exactly like one that does not exist. */
export function useBrief(briefId: string) {
  const { user, workspace } = useSecurityWorkspace();
  const read = useServerFn(getSecurityBrief);
  return useQuery({
    queryKey: [...impactKey(user.id, workspace.id), "brief", briefId],
    retry: false,
    queryFn: async () => {
      const result = await read({ data: { workspaceId: workspace.id, briefId } });
      if (!result.ok) throw new Error(result.code);
      return result.data as BriefDetail;
    },
  });
}

type Outcome<T> = { ok: true; data: T } | { ok: false; code: string };

/** Every impact write refreshes the impact view and the workspace (risks, missions). */
export function useImpactMutation<Input, Output>(
  action: (input: Input) => Promise<Outcome<Output>>,
) {
  const queryClient = useQueryClient();
  const { user, workspace, deny, refresh } = useSecurityWorkspace();
  return useMutation<Output, Error, Input>({
    mutationFn: async (input) => {
      const result = await action(input).catch(() => ({ ok: false as const, code: "SAVE_FAILED" }));
      if (!result.ok) throw new Error(result.code);
      return result.data;
    },
    onError: (error) => {
      if (error.message === "ACCESS_DENIED") deny();
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: securityWorkKeys.workspace(user.id, workspace.id),
      });
      await refresh();
    },
  });
}

export function useImpactText() {
  const l = useWorkText();
  return {
    coverage: (state: CoverageState) =>
      ({
        no_connected_source: l(
          "Ingen officiell källa är ansluten. Vi kan därför inte säga att inget har hänt.",
          "No official source is connected, so we cannot say that nothing has happened.",
        ),
        never_checked: l(
          "En källa är ansluten men har aldrig kontrollerats. Inget kan sägas om läget ännu.",
          "A source is connected but has never been checked. Nothing can be said yet.",
        ),
        failing: l(
          "Den senaste kontrollen av en källa misslyckades. Det som visas kan vara ofullständigt.",
          "The latest check of a source failed. What is shown may be incomplete.",
        ),
        stale: l(
          "En källa har inte kontrollerats inom sitt intervall. Det som visas kan vara inaktuellt.",
          "A source has not been checked within its interval. What is shown may be out of date.",
        ),
        current: l(
          "Alla anslutna källor är kontrollerade inom sina intervall. Det gäller bara de källorna.",
          "All connected sources were checked within their intervals. That holds only for those sources.",
        ),
      })[state],
    matchKind: (kind: string) =>
      ({
        critical_service: l("kritisk verksamhet", "critical service"),
        asset: l("skyddsvärd tillgång", "protected asset"),
        supplier: l("leverantör", "supplier"),
        location: l("plats", "place"),
        requirement: l("bevakningsbehov", "monitoring need"),
        topic: l("ämne", "topic"),
        country: l("land", "country"),
      })[kind] ?? kind,
    /** A failed check in words, with what to do next. Never a raw code. */
    failure: (code: string | null | undefined) => {
      const value = code ?? "";
      if (value === "egress_timeout" || value === "egress_dns_timeout")
        return l(
          "Källan svarade inte i tid. Försök igen senare. Om det upprepas, kontrollera flödesadressen.",
          "The source did not answer in time. Try again later; if it keeps happening, check the feed address.",
        );
      if (value === "egress_unresolved")
        return l(
          "Källans adress kunde inte hittas. Kontrollera flödesadressen.",
          "The source's address could not be found. Check the feed address.",
        );
      if (value === "tls_failed")
        return l(
          "Källans identitet kunde inte verifieras (certifikatet stämmer inte). Inget hämtades. Be en administratör granska källan.",
          "The source's identity could not be verified (its certificate does not match). Nothing was fetched. Ask an administrator to review the source.",
        );
      if (value === "egress_transport_unavailable")
        return l(
          "Hämtning är inte tillgänglig i den här miljön. Inget har hämtats.",
          "Fetching is not available in this environment. Nothing was fetched.",
        );
      if (value === "egress_connection_closed" || value === "network_error")
        return l(
          "Det gick inte att ansluta till källan. Vissa utgivares webbplatser kan inte nås från tjänsten, till exempel när de ligger bakom Cloudflare. Försök igen senare eller be en administratör granska källan.",
          "Could not connect to the source. Some publishers' sites cannot be reached from this service, for example when they are behind Cloudflare. Try again later or ask an administrator to review the source.",
        );
      if (value.startsWith("egress_") || value === "redirect_refused")
        return l(
          "Källan pekar på en adress som inte är tillåten, till exempel en omdirigering bort från den godkända utgivaren. Inget hämtades. Be en administratör granska källan.",
          "The source points to an address that is not allowed, for example a redirect away from the approved publisher. Nothing was fetched. Ask an administrator to review the source.",
        );
      if (value === "feed_too_large")
        return l(
          "Flödet är större än tillåtet (2 MB). Kontrollera att adressen pekar på själva flödet.",
          "The feed is larger than allowed (2 MB). Check that the address points to the feed itself.",
        );
      if (value.startsWith("feed_"))
        return l(
          "Svaret kunde inte läsas som ett RSS- eller Atom-flöde, så vi vet inte vad källan innehåller. Kontrollera att adressen pekar på själva flödet.",
          "The response could not be read as an RSS or Atom feed, so we do not know what the source contains. Check that the address points to the feed itself.",
        );
      const http = /^http_(\d{3})$/.exec(value)?.[1];
      if (http && http.startsWith("5"))
        return l(
          `Källan har ett tillfälligt fel (HTTP ${http}). Försök igen senare.`,
          `The source has a temporary problem (HTTP ${http}). Try again later.`,
        );
      if (http)
        return l(
          `Källan svarade med ett fel (HTTP ${http}). Kontrollera flödesadressen.`,
          `The source answered with an error (HTTP ${http}). Check the feed address.`,
        );
      return l(
        "Kontrollen misslyckades. Försök igen senare.",
        "The check failed. Try again later.",
      );
    },
    error: (code: string | undefined) =>
      code === "FEED_HOST_NOT_APPROVED"
        ? l(
            "Adressen hör inte till en godkänd officiell källa. Be en administratör godkänna utgivaren först.",
            "The address does not belong to an approved official source. Ask an administrator to approve the publisher first.",
          )
        : code === "FETCH_NOT_CONFIGURED"
          ? l(
              "Hämtning är inte aktiverad i den här miljön. Inget har hämtats.",
              "Fetching is not enabled in this environment. Nothing was fetched.",
            )
          : undefined,
  };
}

export function BriefStatusBadge({ status }: { status: string }) {
  const { lang } = useT();
  return (
    <span
      data-testid="sw-brief-status"
      data-status={status}
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-xs font-medium",
        status === "approved" && "border-emerald-600/40 bg-emerald-600/10",
        status === "in_review" && "border-amber-600/40 bg-amber-600/10",
        (status === "rejected" || status === "superseded") && "text-muted-foreground",
      )}
    >
      {briefStatusLabel(status, lang)}
    </span>
  );
}
