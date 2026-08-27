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
import { useMutation, useQuery } from "@tanstack/react-query";
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
import {
  adminGetStorageErasureBacklog,
  adminRunStorageErasureSweep,
} from "@/lib/job-intelligence/admin-storage-erasure.functions";
import { Button } from "@/components/ui/button";
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

  // Storage erasure is the one thing on this page that is OWED rather than
  // merely observed: a pending row means a document that should be gone is
  // still sitting in a bucket. It is here, and not on the person's page,
  // because after a permanent deletion that person's page no longer exists.
  const backlogFn = useServerFn(adminGetStorageErasureBacklog);
  const sweepFn = useServerFn(adminRunStorageErasureSweep);
  const backlog = useQuery({
    queryKey: ["admin", "storage-erasure-backlog"],
    queryFn: () => backlogFn({ data: {} }),
  });
  const sweep = useMutation({
    mutationFn: () => sweepFn(),
    onSettled: () => backlog.refetch(),
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
          <h2 className="text-sm font-semibold text-foreground">
            {t("admin.data.section.storageErasure")}
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {t("admin.data.storageErasure.intro")}
          </p>

          {backlog.isError ? (
            <p className="mt-3 text-sm text-destructive">
              {t("admin.data.storageErasure.loadFailed")}
            </p>
          ) : backlog.data ? (
            <>
              <dl className="mt-3 flex flex-wrap gap-x-10 gap-y-3">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("admin.data.storageErasure.pending")}
                  </dt>
                  <dd
                    className={
                      "text-lg font-semibold tabular-nums " +
                      (backlog.data.pending > 0 ? "text-foreground" : "text-muted-foreground")
                    }
                  >
                    {backlog.data.pending}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("admin.data.storageErasure.failed")}
                  </dt>
                  <dd
                    className={
                      "text-lg font-semibold tabular-nums " +
                      (backlog.data.failed > 0 ? "text-destructive" : "text-muted-foreground")
                    }
                  >
                    {backlog.data.failed}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {t("admin.data.storageErasure.completed")}
                  </dt>
                  <dd className="text-lg font-semibold tabular-nums text-muted-foreground">
                    {backlog.data.completed}
                  </dd>
                </div>
              </dl>

              {/* The errors are shown verbatim. An operator deciding whether a
                  failure is transient needs the message, not a category. */}
              {backlog.data.recentErrors.length > 0 ? (
                <ul className="mt-3 space-y-1 text-sm text-destructive">
                  {backlog.data.recentErrors.map((e, i) => (
                    <li key={`${e.bucket}-${i}`}>
                      <code className="text-xs">{e.bucket}</code>{" "}
                      <span className="tabular-nums">({e.attempts})</span> {e.error}
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-4 flex items-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={sweep.isPending || backlog.data.pending === 0}
                  onClick={() => sweep.mutate()}
                >
                  {sweep.isPending
                    ? t("admin.data.storageErasure.retrying")
                    : t("admin.data.storageErasure.retry")}
                </Button>
                {sweep.isSuccess ? (
                  <span className="text-sm text-muted-foreground">
                    {t("admin.data.storageErasure.sweepDone")
                      .replace("{erased}", String(sweep.data?.deleted ?? 0))
                      .replace("{owed}", String(sweep.data?.failed ?? 0))}
                  </span>
                ) : null}
                {sweep.isError ? (
                  <span className="text-sm text-destructive">
                    {t("admin.data.storageErasure.sweepFailed")}
                  </span>
                ) : null}
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              {t("admin.data.storageErasure.loading")}
            </p>
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
