// Admin Control Center — /admin/data ("Datahantering").
//
// The honest version of a test-data surface. There is no is_test flag on
// employers or accounts anywhere in this schema, and adding one would create a
// mislabelling surface: an operational customer flagged as test data becomes
// deletable, and no amount of confirmation UI makes that safe.
//
// So "test data" is defined by the database as EMPTINESS -- a record with no
// applications, no employment, no assessment evidence, no Passport
// relationship and no audit history. That is indistinguishable from a manually
// created test record, and it is the only thing listed here.
//
// This page deletes nothing. Every row links to the record's own detail page,
// where the same danger zone, the same impact preview and the same
// superadmin-only safe-delete function apply. There is deliberately no bulk
// action of any kind.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SiteLayout } from "@/components/site/SiteLayout";
import { AdminShellChrome } from "@/components/admin/AdminShellChrome";
import { AdminErrorState } from "@/components/admin/AdminErrorState";
import { useT } from "@/i18n/context";
import { Badge } from "@/components/ui/badge";
import {
  adminGetDisposableRecords,
  adminGetIdentityDiagnostics,
} from "@/lib/job-intelligence/admin-lifecycle.functions";
import { identityFindingKey } from "@/lib/job-intelligence/admin-lifecycle-labels";
import { formatDate } from "@/lib/job-intelligence/date-format";

export const Route = createFileRoute("/_authenticated/admin/data")({
  ssr: false,
  component: AdminDataPage,
  errorComponent: AdminErrorState,
});

function AdminDataPage() {
  const { t, lang } = useT();
  const disposableFn = useServerFn(adminGetDisposableRecords);
  const diagnosticsFn = useServerFn(adminGetIdentityDiagnostics);

  const disposable = useQuery({
    queryKey: ["admin", "disposable-records"],
    queryFn: () => disposableFn(),
  });
  const diagnostics = useQuery({
    queryKey: ["admin", "identity-diagnostics"],
    queryFn: () => diagnosticsFn(),
  });

  return (
    <SiteLayout>
      <AdminShellChrome activeSection="data">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          {t("admin.data.heading")}
        </h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{t("admin.data.intro")}</p>
        <p className="mt-2 max-w-3xl rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          {t("admin.data.noBulk")}
        </p>

        <section className="mt-6 rounded-lg border border-border bg-background p-5">
          <h2 className="text-sm font-semibold text-foreground">
            {t("admin.data.section.employers")}
          </h2>
          {disposable.isLoading ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("admin.loading")}</p>
          ) : (disposable.data?.employers.length ?? 0) === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("admin.data.empty")}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {disposable.data!.employers.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{e.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.status} · {formatDate(e.createdAt, lang)}
                    </p>
                  </div>
                  <Link
                    to="/admin/employers/$employerId"
                    params={{ employerId: e.id }}
                    className="text-sm font-medium text-accent hover:underline"
                  >
                    {t("admin.data.open")}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-6 rounded-lg border border-border bg-background p-5">
          <h2 className="text-sm font-semibold text-foreground">{t("admin.data.section.users")}</h2>
          {disposable.isLoading ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("admin.loading")}</p>
          ) : (disposable.data?.users.length ?? 0) === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("admin.data.empty")}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {disposable.data!.users.map((u) => (
                <li
                  key={u.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{u.email ?? u.id}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(u.createdAt, lang)}</p>
                  </div>
                  <Link
                    to="/admin/users/$userId"
                    params={{ userId: u.id }}
                    className="text-sm font-medium text-accent hover:underline"
                  >
                    {t("admin.data.open")}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-6 rounded-lg border border-border bg-background p-5">
          <h2 className="text-sm font-semibold text-foreground">
            {t("admin.data.section.identity")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{t("admin.data.identityIntro")}</p>
          {diagnostics.isLoading ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("admin.loading")}</p>
          ) : (diagnostics.data?.length ?? 0) === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("admin.data.empty")}</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {diagnostics.data!.map((f, i) => (
                <li
                  key={`${f.code}:${f.subjectId ?? f.employeeId ?? f.userId ?? i}`}
                  className="rounded-md border border-border p-3 text-sm"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{t(identityFindingKey(f.code))}</Badge>
                    {typeof f.count === "number" && (
                      <span className="text-xs tabular-nums text-muted-foreground">
                        ({f.count})
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {f.email && <span>{f.email} · </span>}
                    {f.employerId && (
                      <Link
                        to="/admin/employers/$employerId"
                        params={{ employerId: f.employerId }}
                        className="text-accent hover:underline"
                      >
                        {f.employerId.slice(0, 8)}
                      </Link>
                    )}
                    {f.subjectId && <span> · subject {f.subjectId.slice(0, 8)}</span>}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </AdminShellChrome>
    </SiteLayout>
  );
}
