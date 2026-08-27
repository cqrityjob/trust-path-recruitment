// Admin Portal — Users & Roles list. Search across auth users (email) and
// profiles (display name), pilot scale (see admin-users-roles.functions.ts
// header). Read-only here -- granting/revoking a platform role happens on
// the detail page, gated there on the caller being superadmin.

import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { SiteLayout } from "@/components/site/SiteLayout";
import { AdminShellChrome } from "@/components/admin/AdminShellChrome";
import { useT } from "@/i18n/context";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { adminListUsers } from "@/lib/job-intelligence/admin-users-roles.functions";
import { formatDateTime } from "@/lib/job-intelligence/date-format";

export const Route = createFileRoute("/_authenticated/admin/users/")({
  ssr: false,
  component: AdminUsersPage,
  // Carried here by a permanent deletion that committed but still owes some
  // Storage objects. It is a warning about unfinished cleanup, never a claim
  // that the deletion failed.
  validateSearch: (raw: Record<string, unknown>): { storageOwed?: number } => {
    const n = Number(raw.storageOwed);
    return Number.isFinite(n) && n > 0 ? { storageOwed: Math.floor(n) } : {};
  },
});

function AdminUsersPage() {
  const { t, lang } = useT();
  const { storageOwed } = Route.useSearch();
  const listFn = useServerFn(adminListUsers);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");

  const q = useQuery({
    queryKey: ["admin", "users", appliedSearch],
    queryFn: () => listFn({ data: { search: appliedSearch || undefined } }),
  });

  return (
    <SiteLayout>
      <AdminShellChrome activeSection="users">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          {t("admin.users.list.heading")}
        </h1>

        {storageOwed ? (
          <div
            role="status"
            className="mt-4 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground"
          >
            {t("admin.data.storageErasure.deletionWarning").replace("{count}", String(storageOwed))}{" "}
            <Link to="/admin/data" className="font-medium underline underline-offset-2">
              {t("admin.nav.data")}
            </Link>
          </div>
        ) : null}

        <form
          className="mt-6 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setAppliedSearch(search.trim());
          }}
        >
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("admin.users.list.searchPlaceholder")}
            className="w-72"
          />
          <Button type="submit" variant="outline" size="sm">
            {t("admin.users.list.searchButton")}
          </Button>
        </form>

        <div className="mt-6">
          {q.isLoading && <p className="text-sm text-muted-foreground">{t("admin.loading")}</p>}
          {q.isError && <p className="text-sm text-destructive">{(q.error as Error).message}</p>}
          {q.isSuccess && q.data.length === 0 && (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-sm text-muted-foreground">
              {t("admin.users.list.empty")}
            </div>
          )}
          {q.isSuccess && q.data.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[800px] text-left text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">{t("admin.users.list.column.email")}</th>
                    <th className="px-4 py-3">{t("admin.users.list.column.name")}</th>
                    <th className="px-4 py-3">{t("admin.users.list.column.roles")}</th>
                    <th className="px-4 py-3">{t("admin.users.list.column.created")}</th>
                    <th className="px-4 py-3 text-right">&nbsp;</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {q.data.map((u) => (
                    <tr key={u.id} className="align-top">
                      <td className="px-4 py-3 font-medium text-foreground">{u.email ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {u.displayName ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {u.isSuperadmin && <Badge>{t("admin.users.role.superadmin")}</Badge>}
                          {u.isAdmin && (
                            <Badge variant="secondary">{t("admin.users.role.admin")}</Badge>
                          )}
                          {u.isEmployerMember && (
                            <Badge variant="outline">{t("admin.users.role.employerMember")}</Badge>
                          )}
                          {!u.isSuperadmin && !u.isAdmin && !u.isEmployerMember && (
                            <Badge variant="outline">{t("admin.users.role.candidate")}</Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {u.createdAt ? formatDateTime(u.createdAt, lang) : "—"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          to="/admin/users/$userId"
                          params={{ userId: u.id }}
                          className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted/40"
                        >
                          {t("admin.users.list.open")}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </AdminShellChrome>
    </SiteLayout>
  );
}
