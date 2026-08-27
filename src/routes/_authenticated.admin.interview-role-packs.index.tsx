// Interview Intelligence — Role Interview Builder, the pack list.
//
// The entry point of the only Phase 1 surface. It shows what governed role
// interview packages exist, what state each is in, and what may be claimed
// about it scientifically — the two are separate columns because they are
// separate facts.
//
// This is a PLATFORM surface. Reaching it already required
// _authenticated.admin.tsx to confirm platform admin; the database independently
// refuses to return a single row to anyone without a content role, which is why
// an empty list and a denied read look the same here and neither leaks.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteLayout } from "@/components/site/SiteLayout";
import { AdminShellChrome } from "@/components/admin/AdminShellChrome";
import { useT } from "@/i18n/context";
import {
  AsyncState,
  NoticePanel,
  PackStatusBadge,
  ValidationLabelBadge,
} from "@/components/admin/interview/PackGovernanceUi";
import { listRolePacks } from "@/lib/interview-intelligence/role-packs.functions";

export const Route = createFileRoute("/_authenticated/admin/interview-role-packs/")({
  ssr: false,
  component: RolePackListPage,
});

function RolePackListPage() {
  const { t } = useT();
  const listFn = useServerFn(listRolePacks);

  const q = useQuery({
    queryKey: ["admin", "interview-role-packs"],
    queryFn: () => listFn(),
  });

  return (
    <SiteLayout>
      <AdminShellChrome activeSection="interviewRolePacks">
        <header>
          <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
            {t("ii.list.heading")}
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {t("ii.list.intro")}
          </p>
        </header>

        <div className="mt-6">
          <NoticePanel tone="work" title={t("ii.list.scopeTitle")}>
            <p>{t("ii.list.scopeBody")}</p>
          </NoticePanel>
        </div>

        <div className="mt-6">
          <Link
            to="/admin/interview-role-packs/new"
            className="inline-flex items-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {t("ii.list.newPack")}
          </Link>
        </div>

        <section className="mt-6" aria-labelledby="ii-pack-list-heading">
          <h2 id="ii-pack-list-heading" className="sr-only">
            {t("ii.list.tableCaption")}
          </h2>

          {q.isLoading && <AsyncState state="loading" />}
          {q.isError && <AsyncState state="error" message={(q.error as Error).message} />}

          {q.isSuccess && q.data.packs.length === 0 && (
            <AsyncState state="empty">{t("ii.list.empty")}</AsyncState>
          )}

          {q.isSuccess && q.data.packs.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[760px] text-left text-sm">
                <caption className="sr-only">{t("ii.list.tableCaption")}</caption>
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3">
                      {t("ii.list.column.pack")}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t("ii.list.column.version")}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t("ii.list.column.status")}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t("ii.list.column.evidenceStatus")}
                    </th>
                    <th scope="col" className="px-4 py-3">
                      {t("ii.list.column.published")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {q.data.packs.map((p) => (
                    <tr key={p.id} className="align-top">
                      <th scope="row" className="px-4 py-3 font-medium text-foreground">
                        {p.latestVersion ? (
                          <Link
                            to="/admin/interview-role-packs/$packId/versions/$versionId"
                            params={{ packId: p.id, versionId: p.latestVersion.id }}
                            className="text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          >
                            {p.nameSv}
                          </Link>
                        ) : (
                          p.nameSv
                        )}
                        <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                          {p.slug}
                        </span>
                      </th>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {p.latestVersion ? `v${p.latestVersion.versionNumber}` : "—"}
                        {p.latestVersion && (
                          <span className="ml-2 text-xs uppercase">{p.latestVersion.locale}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {p.latestVersion ? (
                          <PackStatusBadge status={p.latestVersion.status} />
                        ) : (
                          <span className="text-muted-foreground">{t("ii.list.noVersion")}</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {p.latestVersion && (
                          <ValidationLabelBadge label={p.latestVersion.validationLabel} />
                        )}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {p.publishedVersionNumber !== null
                          ? `v${p.publishedVersionNumber}`
                          : t("ii.list.notPublished")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </AdminShellChrome>
    </SiteLayout>
  );
}
