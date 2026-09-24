import { useEffect } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listSecuritySourceItems } from "@/lib/security-work/security-work.functions";
import { securityWorkKeys } from "@/lib/security-work/query-keys";
import { WorkFailure, useSecurityWorkspace } from "./context";

export function useSecuritySourceItems(sourceId?: string) {
  const { user, workspace, deny } = useSecurityWorkspace();
  const load = useServerFn(listSecuritySourceItems);
  const query = useInfiniteQuery({
    queryKey: securityWorkKeys.items(user.id, workspace.id, sourceId),
    queryFn: async ({ pageParam }) => {
      const result = await load({
        data: { workspaceId: workspace.id, sourceId, offset: pageParam },
      });
      if (!result.ok) throw new WorkFailure(result.code);
      return result.data;
    },
    initialPageParam: 0,
    getNextPageParam: (page) => page.nextOffset ?? undefined,
    staleTime: 0,
    retry: false,
  });
  const code =
    query.error instanceof WorkFailure ? query.error.code : query.isError ? "SAVE_FAILED" : null;
  useEffect(() => {
    if (code === "ACCESS_DENIED") deny();
  }, [code, deny]);
  return {
    ...query,
    code,
    sourceItems:
      code === "ACCESS_DENIED" ? [] : (query.data?.pages.flatMap((page) => page.sourceItems) ?? []),
    intelligenceItems:
      code === "ACCESS_DENIED"
        ? []
        : (query.data?.pages.flatMap((page) => page.intelligenceItems) ?? []),
  };
}
