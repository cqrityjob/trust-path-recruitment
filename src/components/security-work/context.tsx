import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { securityWorkKeys } from "@/lib/security-work/query-keys";
import { getSecurityWorkspace } from "@/lib/security-work/security-work.functions";
import type { Result, SWErrorCode, WorkspaceSnapshot } from "@/lib/security-work/types";
import { useT } from "@/i18n/context";
import { LoadingState, WorkButton, WorkError } from "./ui";

type Identity = { id: string; name: string; email: string };
const IdentityContext = createContext<Identity | null>(null);

export function SecurityIdentityProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<Identity | null>(null);
  const queryClient = useQueryClient();
  useEffect(() => {
    let live = true;
    let receivedEvent = false;
    const read = (
      user: { id: string; email?: string; user_metadata?: Record<string, unknown> } | undefined,
    ) => {
      if (!live) return;
      setIdentity(
        user
          ? {
              id: user.id,
              email: user.email ?? "",
              name:
                typeof user.user_metadata?.display_name === "string"
                  ? user.user_metadata.display_name
                  : "",
            }
          : null,
      );
    };
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      receivedEvent = true;
      read(session?.user);
    });
    void supabase.auth.getSession().then(({ data }) => {
      if (!receivedEvent) read(data.session?.user);
    });
    return () => {
      live = false;
      listener.subscription.unsubscribe();
      void queryClient.cancelQueries({ queryKey: securityWorkKeys.all });
      queryClient.removeQueries({ queryKey: securityWorkKeys.all });
    };
  }, [queryClient]);
  if (!identity)
    return (
      <div className="mx-auto max-w-5xl px-5">
        <LoadingState />
      </div>
    );
  return (
    <IdentityContext.Provider key={identity.id} value={identity}>
      {children}
    </IdentityContext.Provider>
  );
}

export function useSecurityIdentity() {
  const identity = useContext(IdentityContext);
  if (!identity) throw new Error("Security Work identity context is missing");
  return identity;
}

type WorkContext = WorkspaceSnapshot & {
  user: Identity;
  canEdit: boolean;
  refresh: () => Promise<void>;
  deny: () => void;
};
const WorkspaceContext = createContext<WorkContext | null>(null);

export function SecurityWorkspaceProvider({
  workspaceId,
  children,
}: {
  workspaceId: string;
  children: ReactNode;
}) {
  const user = useSecurityIdentity();
  const { t } = useT();
  const queryClient = useQueryClient();
  const load = useServerFn(getSecurityWorkspace);
  const [denied, setDenied] = useState(false);
  const scope = securityWorkKeys.workspace(user.id, workspaceId);
  const query = useQuery({
    queryKey: securityWorkKeys.snapshot(user.id, workspaceId),
    queryFn: async () => {
      const result = await load({ data: { workspaceId } });
      if (!result.ok) throw new WorkFailure(result.code);
      return result.data;
    },
    enabled: !denied,
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
  });
  useEffect(() => {
    setDenied(false);
    return () => {
      void queryClient.cancelQueries({
        queryKey: securityWorkKeys.workspace(user.id, workspaceId),
      });
      queryClient.removeQueries({ queryKey: securityWorkKeys.workspace(user.id, workspaceId) });
    };
  }, [queryClient, user.id, workspaceId]);
  const deny = () => {
    setDenied(true);
    void queryClient.cancelQueries({ queryKey: scope });
    queryClient.removeQueries({ queryKey: scope });
  };
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: scope });
  };
  const code =
    query.error instanceof WorkFailure ? query.error.code : query.isError ? "SAVE_FAILED" : null;
  useEffect(() => {
    if (code === "ACCESS_DENIED") {
      setDenied(true);
      void queryClient.cancelQueries({
        queryKey: securityWorkKeys.workspace(user.id, workspaceId),
      });
      queryClient.removeQueries({ queryKey: securityWorkKeys.workspace(user.id, workspaceId) });
    }
  }, [code, queryClient, user.id, workspaceId]);
  if (denied || code === "ACCESS_DENIED" || (code && !query.data))
    return (
      <div
        data-testid={denied || code === "ACCESS_DENIED" ? "sw-access-denied" : undefined}
        className="mx-auto max-w-3xl space-y-5 px-5 py-10"
      >
        <h1 className="font-display text-2xl font-semibold">
          {denied || code === "ACCESS_DENIED" ? t("sw.error.access") : t("sw.error.title")}
        </h1>
        <WorkError
          code={denied ? "ACCESS_DENIED" : code}
          onRetry={denied ? undefined : () => void query.refetch()}
        />
        <WorkButton asChild variant="outline">
          <Link to="/security-work">{t("sw.switch")}</Link>
        </WorkButton>
      </div>
    );
  if (query.isPending || !query.data)
    return (
      <div className="mx-auto max-w-5xl px-5">
        <LoadingState />
      </div>
    );
  const snapshot = query.data;
  return (
    <WorkspaceContext.Provider
      key={`${user.id}:${workspaceId}`}
      value={{
        ...snapshot,
        user,
        canEdit: snapshot.membership.role === "owner" || snapshot.membership.role === "editor",
        refresh,
        deny,
      }}
    >
      {code && (
        <div className="mx-auto max-w-5xl px-5 pt-5">
          <WorkError code={code} onRetry={() => void query.refetch()} />
        </div>
      )}
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useSecurityWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) throw new Error("Security Work workspace context is missing");
  return context;
}

export class WorkFailure extends Error {
  constructor(readonly code: SWErrorCode) {
    super(code);
  }
}

export function useWorkMutation<Input, Output>(
  action: (input: Input) => Promise<Result<Output>>,
  validate?: (input: Input) => boolean,
) {
  const context = useSecurityWorkspace();
  return useMutation<Output, WorkFailure, Input>({
    mutationFn: async (input) => {
      try {
        if (validate && !validate(input)) throw new WorkFailure("INVALID_INPUT");
        const result = await action(input);
        if (!result.ok) throw new WorkFailure(result.code);
        return result.data;
      } catch (error) {
        throw error instanceof WorkFailure ? error : new WorkFailure("SAVE_FAILED");
      }
    },
    onError: (error) => {
      if (error.code === "ACCESS_DENIED") context.deny();
    },
    onSuccess: async () => {
      await context.refresh();
    },
  });
}
