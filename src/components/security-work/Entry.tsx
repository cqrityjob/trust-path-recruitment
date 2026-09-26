import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, ShieldCheck } from "lucide-react";
import {
  createSecurityWork,
  getSecurityWorkEntry,
} from "@/lib/security-work/security-work.functions";
import { securityWorkKeys } from "@/lib/security-work/query-keys";
import { entryWorkspace, rememberedWorkspace } from "@/lib/security-work/workspace-preference";
import { useT } from "@/i18n/context";
import { useSecurityIdentity } from "./context";
import { LoadingState, SafetyNotice, TextField, WorkButton, WorkError, panelClass } from "./ui";

export function SecurityWorkEntry() {
  const { t, lang } = useT();
  const l = (sv: string, en: string) => (lang === "sv" ? sv : en);
  const user = useSecurityIdentity();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const load = useServerFn(getSecurityWorkEntry);
  const create = useServerFn(createSecurityWork);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const search = useSearch({ from: "/_authenticated/security-work/" });
  const [preference, setPreference] = useState<{ id: string | null } | null>(null);
  const [navigationError, setNavigationError] = useState(false);
  useEffect(() => setPreference({ id: rememberedWorkspace(user.id) }), [user.id]);
  const [error, setError] = useState<string | null>(null);
  const query = useQuery({
    queryKey: securityWorkKeys.entry(user.id),
    queryFn: () => load({ data: {} }),
    staleTime: 0,
    refetchOnMount: "always",
    retry: false,
  });
  const workspaces = query.data?.ok ? query.data.data.workspaces : [];
  const loadError = query.isError
    ? "SAVE_FAILED"
    : query.data && !query.data.ok
      ? query.data.code
      : null;
  const fresh = query.isFetchedAfterMount && !query.isFetching && !loadError;
  const target =
    fresh && preference && !search.choose ? entryWorkspace(workspaces, preference.id) : null;
  useEffect(() => {
    if (target && !busyRef.current && !navigationError)
      void navigate({
        to: "/security-work/$workspaceId",
        params: { workspaceId: target },
        replace: true,
      }).catch(() => setNavigationError(true));
  }, [target, navigate, navigationError]);
  if (!loadError && !navigationError && (!fresh || !preference || target))
    return (
      <main className="mx-auto max-w-4xl px-4 py-8">
        <LoadingState />
      </main>
    );
  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-6" data-testid="sw-entry">
      <div className="max-w-2xl">
        <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-accent">
          {t("sw.product")}
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
          {workspaces.length ? l("Välj arbetsyta", "Choose a workspace") : t("sw.name")}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          {workspaces.length
            ? l(
                "Öppna det säkerhetsarbete du vill fortsätta med.",
                "Open the security work you want to continue.",
              )
            : l(
                "Från underlag till tydliga bedömningar, rapporter och nästa steg. Skapa en arbetsyta för att börja.",
                "From evidence to clear assessments, reports and next steps. Create a workspace to get started.",
              )}
        </p>
      </div>
      {query.isPending ? (
        <LoadingState />
      ) : loadError || navigationError ? (
        <WorkError
          code={loadError ?? "SAVE_FAILED"}
          onRetry={() => {
            setNavigationError(false);
            void query.refetch();
          }}
        />
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
                      replace
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
                if (busyRef.current) return;
                busyRef.current = true;
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
                    to: "/security-work/$workspaceId",
                    params: { workspaceId: result.data.workspaceId },
                    replace: true,
                  });
                } catch {
                  setError("SAVE_FAILED");
                } finally {
                  setBusy(false);
                  busyRef.current = false;
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
