// BESKT — the method list, and the entry point of the governance surface.
//
// ── WHY AN EMPTY LIST IS THE HONEST PRODUCTION STATE ────────────────────
//
// There are no BESKT methods in production and there should not be until
// somebody authors one and five named reviewers approve it. So an empty list
// is not a failure and is not papered over with a sample: the screen says
// there is nothing yet and offers the one action that changes that.
//
// ── WHY EMPTY AND DENIED LOOK THE SAME, DELIBERATELY ────────────────────
//
// Reaching this page already required either `_authenticated.admin.tsx` to
// confirm a platform admin, or `_authenticated.beskt-governance.tsx` to
// confirm `scp_interview_can_read`, and the database independently refuses
// to return a single row to anyone without a content role or admin. A reader without
// authority therefore sees the empty state — which tells them nothing about
// whether governed methods exist, and that is the correct amount to tell
// them.

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { useT } from "@/i18n/context";
import {
  BesktContentRolesPanel,
  BesktInstallV01Card,
} from "@/components/admin/beskt/BesktInternalTestAdmin";
import {
  BesktNewMethodLink,
  BesktSurfaceShell,
  BesktVersionLink,
  type BesktSurface,
} from "@/components/admin/beskt/surface";
import { AsyncState, NoticePanel } from "@/components/admin/interview/PackGovernanceUi";
import { BesktStatusBadge } from "@/components/admin/beskt/BesktLifecyclePanel";
import { listBesktMethods } from "@/lib/beskt/governance.functions";
import { besktErrorKey } from "@/lib/beskt/errors";

export function BesktMethodListPage({
  surface,
  canCreate = true,
}: {
  readonly surface: BesktSurface;
  /** Only an editor may create a method; the database refuses anyone else. */
  readonly canCreate?: boolean;
}) {
  const { t, lang } = useT();
  const listFn = useServerFn(listBesktMethods);

  const q = useQuery({
    queryKey: ["admin", "beskt-methods"],
    queryFn: () => listFn(),
    retry: false,
  });

  return (
    <BesktSurfaceShell surface={surface}>
      <header>
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          {t("beskt.admin.list.heading")}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
          {t("beskt.admin.list.intro")}
        </p>
      </header>

      <div className="mt-6 space-y-3">
        <NoticePanel tone="work" title={t("beskt.admin.list.scopeTitle")}>
          <p>{t("beskt.admin.list.scopeBody")}</p>
        </NoticePanel>
        <NoticePanel tone="attention" title={t("beskt.admin.list.notATestTitle")}>
          <p>{t("beskt.admin.list.notATestBody")}</p>
        </NoticePanel>
      </div>

      <BesktInstallV01Card surface={surface} method="rekrytering" />
      <BesktInstallV01Card surface={surface} method="sakerhet" />
      {surface === "admin" ? <BesktContentRolesPanel /> : null}

      {canCreate && (
        <div className="mt-6">
          <BesktNewMethodLink
            surface={surface}
            className="inline-flex min-h-[44px] items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {t("beskt.admin.list.newMethod")}
          </BesktNewMethodLink>
        </div>
      )}

      <section className="mt-6" aria-labelledby="beskt-method-list-h">
        <h2 id="beskt-method-list-h" className="sr-only">
          {t("beskt.admin.list.heading")}
        </h2>

        {q.isLoading && <AsyncState state="loading" />}
        {q.isError && <AsyncState state="error" message={t(besktErrorKey(q.error))} />}

        {q.isSuccess && q.data.length === 0 && (
          <AsyncState state="empty">{t("beskt.admin.list.empty")}</AsyncState>
        )}

        {q.isSuccess && q.data.length > 0 && (
          <ul className="space-y-3" data-testid="beskt-method-list">
            {q.data.map((m) => (
              <li
                key={m.packId}
                data-testid={`beskt-method-${m.slug}`}
                className="rounded-lg border border-border p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-foreground">
                      {lang === "en" ? (m.nameEn ?? m.nameSv) : m.nameSv}
                    </h3>
                    <code className="break-all font-mono text-xs text-muted-foreground">
                      {m.slug}
                    </code>
                  </div>
                </div>
                <p className="mt-2 max-w-[80ch] text-sm leading-relaxed text-muted-foreground">
                  {m.purposeSv}
                </p>

                {m.versions.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">
                    {t("beskt.admin.list.noVersions")}
                  </p>
                ) : (
                  <ul className="mt-3 space-y-2">
                    {m.versions.map((v) => (
                      <li
                        key={v.methodVersionId}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-foreground">
                            {t("beskt.admin.list.version")} {v.versionNumber}
                          </span>
                          <BesktStatusBadge status={v.contentStatus} />
                          <span className="text-xs text-muted-foreground">
                            {t("beskt.admin.list.revision")} {v.revision}
                          </span>
                        </div>
                        <BesktVersionLink
                          surface={surface}
                          methodVersionId={v.methodVersionId}
                          className="inline-flex min-h-[44px] items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          {t("beskt.admin.list.open")}
                        </BesktVersionLink>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </BesktSurfaceShell>
  );
}
