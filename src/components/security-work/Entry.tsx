import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, ShieldCheck } from "lucide-react";
import {
  createSecurityWork,
  getSecurityWorkEntry,
} from "@/lib/security-work/security-work.functions";
import { securityWorkKeys } from "@/lib/security-work/query-keys";
import { useT } from "@/i18n/context";
import { useSecurityIdentity } from "./context";
import { LoadingState, SafetyNotice, TextField, WorkButton, WorkError, panelClass } from "./ui";

export function SecurityWorkEntry() {
  const { t } = useT();
  const user = useSecurityIdentity();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const load = useServerFn(getSecurityWorkEntry);
  const create = useServerFn(createSecurityWork);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: securityWorkKeys.entry(user.id),
    queryFn: () => load({ data: {} }),
    staleTime: 0,
    retry: false,
  });
  const workspaces = query.data?.ok ? query.data.data.workspaces : [];
  const loadError = query.isError
    ? "SAVE_FAILED"
    : query.data && !query.data.ok
      ? query.data.code
      : null;
  return (
    <main className="mx-auto max-w-4xl space-y-7 px-4 py-8 sm:px-6 sm:py-12">
      <div className="max-w-2xl">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-accent">
          {t("sw.product")}
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {t("sw.entry.title")}
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">{t("sw.entry.body")}</p>
      </div>
      {query.isPending ? (
        <LoadingState />
      ) : loadError ? (
        <WorkError code={loadError} onRetry={() => void query.refetch()} />
      ) : (
        <>
          {workspaces.length > 0 && (
            <section className={panelClass}>
              <h2 className="mb-4 font-display text-lg font-semibold">{t("sw.entry.existing")}</h2>
              <ul className="space-y-3">
                {workspaces.map((workspace) => (
                  <li key={workspace.id}>
                    <Link
                      to="/security-work/$workspaceId"
                      params={{ workspaceId: workspace.id }}
                      className="flex min-h-16 items-center justify-between gap-4 rounded-lg border border-border p-4 hover:border-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                    >
                      <span className="min-w-0">
                        <span className="block break-words font-semibold">{workspace.name}</span>
                        <span className="text-xs text-muted-foreground">{t("sw.entry.open")}</span>
                      </span>
                      <ArrowRight className="size-5 shrink-0" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {!workspaces.some(
            (workspace) => workspace.kind === "personal" && workspace.owner_user_id === user.id,
          ) && (
            <form
              className={`${panelClass} max-w-xl space-y-5`}
              onSubmit={async (event) => {
                event.preventDefault();
                if (busy) return;
                setBusy(true);
                setError(null);
                try {
                  const result = await create({ data: { name: name.trim() || t("sw.name") } });
                  if (!result.ok) {
                    setError(result.code);
                    return;
                  }
                  await queryClient.invalidateQueries({
                    queryKey: securityWorkKeys.entry(user.id),
                  });
                  await navigate({
                    to: "/security-work/$workspaceId/settings",
                    params: { workspaceId: result.data.workspaceId },
                  });
                } catch {
                  setError("SAVE_FAILED");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <TextField
                data-testid="sw-workspace-name"
                disabled={busy}
                label={t("sw.entry.name")}
                placeholder={t("sw.entry.placeholder")}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={120}
                autoComplete="off"
              />
              <WorkError code={error} />
              <WorkButton data-testid="sw-create-workspace" type="submit" disabled={busy}>
                {busy ? t("sw.saving") : t("sw.entry.create")}
                <ArrowRight aria-hidden="true" />
              </WorkButton>
            </form>
          )}
        </>
      )}
      <p className="flex max-w-2xl gap-2 text-sm leading-relaxed text-muted-foreground">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden="true" />
        {t("sw.entry.privacy")}
      </p>
      <SafetyNotice />
    </main>
  );
}
